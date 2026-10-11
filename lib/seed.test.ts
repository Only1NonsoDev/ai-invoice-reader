import assert from "node:assert/strict";
import { test } from "node:test";
import { computeChecks, rebaseSeedDates } from "./state";
import { addDays } from "./dates";
import { buildSeed } from "./seed";
import { STATUS_LABEL } from "./types";

const NOW = new Date("2026-10-11T10:00:00");
const state = buildSeed(NOW);
const checks = computeChecks(state.invoices, state.settings, "2026-10-11");
const status = (id: string, check: string) => checks[id].find((c) => c.id === check)!.status;

test("seed has ten fake invoices across GBP, USD and CAD", () => {
  assert.equal(state.invoices.length, 10);
  assert.deepEqual([...new Set(state.invoices.map((r) => r.data.currency))].sort(), ["CAD", "GBP", "USD"]);
});

test("each deliberate problem is detected by the checks", () => {
  assert.equal(status("inv-005", "duplicate"), "fail");
  assert.equal(status("inv-004", "duplicate"), "pass"); // the original is not accused
  assert.equal(status("inv-006", "vendor"), "warn");
  assert.equal(status("inv-007", "due-timing"), "fail");
  assert.equal(status("inv-002", "due-timing"), "warn");
  assert.equal(status("inv-008", "tax-rate"), "fail");
  assert.equal(status("inv-009", "po-number"), "warn");
  assert.equal(status("inv-010", "line-math"), "fail");
  assert.equal(status("inv-010", "total-sum"), "fail");
  assert.equal(status("inv-006", "confidence"), "warn");
  assert.ok(state.invoices.find((r) => r.id === "inv-003")!.data.total! > state.settings.threshold);
});

test("the clean invoice passes everything and arrives as New", () => {
  assert.ok(checks["inv-001"].every((c) => c.status === "pass"));
  assert.equal(state.invoices.find((r) => r.id === "inv-001")!.status, "new");
});

test("statuses cover new, needs review, manager, approved and flagged", () => {
  const by = new Map(state.invoices.map((r) => [r.id, r.status]));
  assert.equal(by.get("inv-002"), "needs_review");
  assert.equal(by.get("inv-003"), "needs_manager");
  assert.equal(by.get("inv-004"), "approved");
  assert.equal(by.get("inv-010"), "flagged");
  assert.ok(Object.keys(STATUS_LABEL).length === 7);
});

test("dates are computed from offsets, so they follow 'today'", () => {
  const later = rebaseSeedDates(state.invoices, "2027-03-01");
  const inv7 = later.find((r) => r.id === "inv-007")!;
  assert.equal(inv7.data.dueDate, addDays("2027-03-01", -12));
  const edited = { ...state.invoices[0], dateOffsets: { issueDate: -9 } };
  assert.equal(rebaseSeedDates([edited], "2027-03-01")[0].data.dueDate, state.invoices[0].data.dueDate);
});

test("every seed invoice has full per-field confidence", () => {
  for (const r of state.invoices) assert.equal(Object.keys(r.confidence).length, 9);
});
