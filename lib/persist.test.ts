import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PREVIEW_CHARS, STORAGE_KEY, deserialize, serialize } from "./persist";
import { buildSeed } from "./seed";
import { approve } from "./workflow";

const NOW = new Date("2026-10-11T10:00:00Z");

test("the storage key is versioned", () => {
  assert.match(STORAGE_KEY, /:v\d+$/);
});

test("serialize -> deserialize round-trips invoices, statuses, edits, logs and settings", () => {
  const state = buildSeed(NOW);
  state.settings.threshold = 1234;
  state.settings.manualMinutes = 6;
  state.invoices[0] = approve({ ...state.invoices[0], notes: "ok" }, state.settings, NOW);
  const back = deserialize(serialize(state, NOW));
  assert.ok(back);
  assert.deepEqual(back.settings, state.settings);
  // undefined fields vanish in JSON, so compare the JSON forms
  assert.deepEqual(JSON.parse(JSON.stringify(back.invoices)), JSON.parse(JSON.stringify(state.invoices)));
  assert.equal(back.invoices[0].notes, "ok");
  assert.ok(back.invoices[0].log.length > 2);
});

test("bad input returns null instead of throwing", () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(""), null);
  assert.equal(deserialize("{not json"), null);
  assert.equal(deserialize(JSON.stringify({ version: 999, invoices: [] })), null);
  assert.equal(deserialize(JSON.stringify({ version: 1 })), null);
  assert.equal(deserialize("[]"), null);
});

test("invalid records are dropped and bad settings fall back to defaults", () => {
  const good = buildSeed(NOW).invoices[0];
  const raw = JSON.stringify({ version: 1, settings: { threshold: -5, manualMinutes: "x" }, invoices: [good, { id: "bad" }, 7, { ...good, id: "x", status: "nonsense" }] });
  const back = deserialize(raw)!;
  assert.equal(back.invoices.length, 1);
  assert.equal(back.settings.threshold, 5000);
  assert.equal(back.settings.manualMinutes, 4);
});

test("API keys and unknown fields are never written", () => {
  const state = buildSeed(NOW) as unknown as { invoices: Record<string, unknown>[]; settings: Record<string, unknown> };
  state.settings.apiKey = "sk-secret-123";
  state.invoices[0].fileBase64 = "AAAA".repeat(100);
  const raw = serialize(state as never, NOW);
  assert.ok(!raw.includes("sk-secret-123"));
  assert.ok(!raw.includes("AAAAAAAA"));
});

test("previews: small data URLs are kept, blob URLs and oversized ones are dropped and noted", () => {
  const state = buildSeed(NOW);
  const mk = (id: string, previewUrl: string) => ({ ...state.invoices[0], id, source: "upload" as const, sampleFile: undefined, previewUrl });
  state.invoices = [
    mk("small", "data:image/jpeg;base64,AAAA"),
    mk("blob", "blob:http://localhost/abc"),
    mk("big", "data:image/jpeg;base64," + "A".repeat(MAX_PREVIEW_CHARS + 1)),
  ];
  const back = deserialize(serialize(state, NOW))!;
  const by = Object.fromEntries(back.invoices.map((r) => [r.id, r]));
  assert.equal(by.small.previewUrl, "data:image/jpeg;base64,AAAA");
  assert.equal(by.blob.previewUrl, null);
  assert.equal(by.blob.previewLost, true);
  assert.equal(by.big.previewUrl, null);
  assert.equal(by.big.previewLost, true);
});

test("an upload that was mid-extraction comes back as a clear error", () => {
  const state = buildSeed(NOW);
  state.invoices = [{ ...state.invoices[0], id: "u1", source: "upload", load: "extracting" }];
  const rec = deserialize(serialize(state, NOW))!.invoices[0];
  assert.equal(rec.load, "error");
  assert.match(rec.error!, /interrupted/);
});
