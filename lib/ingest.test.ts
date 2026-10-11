import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestCategory } from "./coding";
import { applyExtraction, applyExtractionError, newUpload } from "./ingest";
import { parseInvoice } from "./parse";

const NOW = new Date("2026-10-11T10:00:00Z");

test("an upload starts in a loading state, then becomes a ready record with an AI log entry", () => {
  const up = newUpload("u1", "bill.pdf", NOW);
  assert.equal(up.load, "extracting");
  const inv = parseInvoice({
    vendor: "Acme", invoice_number: "1", po_number: "PO-9", total: 10, subtotal: 10, tax: 0,
    line_items: [{ description: "Monthly software licence", quantity: 1, unit_price: 10, amount: 10 }],
    confidence: { vendor: 0.9, total: 0.5, po_number: 0.7, bogus: 1, issue_date: 3 },
  });
  const done = applyExtraction(up, inv, "OpenAI gpt-4o-mini", NOW);
  assert.equal(done.load, "ready");
  assert.equal(done.data.poNumber, "PO-9");
  assert.deepEqual(done.confidence, { vendor: 0.9, total: 0.5, poNumber: 0.7 });
  assert.equal(done.category, "Software & Subscriptions");
  assert.match(done.log.map((l) => l.message).join("|"), /Extracted by AI \(OpenAI gpt-4o-mini\)/);
});

test("a failed extraction keeps the reason", () => {
  const failed = applyExtractionError(newUpload("u2", "x.png", NOW), "Couldn't reach the API.", NOW);
  assert.equal(failed.load, "error");
  assert.equal(failed.error, "Couldn't reach the API.");
});

test("category suggestions are keyword based and may be empty", () => {
  assert.equal(suggestCategory(["Window cleaning"]), "Facilities & Cleaning");
  assert.equal(suggestCategory(["Mystery"]), "");
});
