import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, exportFilename, toCSV, toJSON } from "./export";
import { SAMPLES } from "./samples";

test("csvCell quotes commas, quotes and newlines", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(12.5), "12.5");
});

test("csvCell defuses spreadsheet formulas but not numbers", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(-5), "-5");
});

test("toCSV writes a header and one row per line item", () => {
  const lines = toCSV(SAMPLES[0].invoice).trim().split("\r\n");
  assert.equal(lines.length, 1 + SAMPLES[0].invoice.lineItems.length);
  assert.match(lines[0], /^vendor,invoice_number,/);
  assert.match(lines[1], /^Brightwell Stationery Supplies Ltd,BW-2025-0418,2025-03-03,2025-04-02,GBP,/);
  assert.ok(lines[1].endsWith(",478,95.6,573.6"));
});

test("toCSV still emits a row when there are no line items", () => {
  const inv = { ...SAMPLES[0].invoice, lineItems: [] };
  assert.equal(toCSV(inv).trim().split("\r\n").length, 2);
});

test("toJSON round-trips", () => {
  assert.deepEqual(JSON.parse(toJSON(SAMPLES[2].invoice)), SAMPLES[2].invoice);
});

test("exportFilename is filesystem-safe", () => {
  assert.equal(exportFilename(SAMPLES[0].invoice, "csv"), "BW-2025-0418.csv");
  assert.equal(exportFilename({ ...SAMPLES[0].invoice, invoiceNumber: "", vendor: "" }, "json"), "invoice.json");
  assert.equal(exportFilename({ ...SAMPLES[0].invoice, invoiceNumber: "A/B ../x" }, "csv"), "A-B-x.csv");
});
