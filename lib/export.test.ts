import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "./seed";
import {
  BOM, QBO_COLUMNS, XERO_COLUMNS, buildExport, csvCell, qboTaxCode, termsFor, toJSON, toQuickBooksCSV, toXeroCSV, xeroTaxType,
} from "./export";

const NOW = new Date("2026-10-11T10:00:00Z");
const invoices = buildSeed(NOW).invoices;
const hartley = invoices.find((r) => r.id === "inv-004")!;
const brightwell = invoices.find((r) => r.id === "inv-001")!;

test("csvCell quotes commas, quotes and newlines and defuses formulas", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
});

test("QuickBooks CSV: exact header, one row per line item", () => {
  const lines = toQuickBooksCSV([hartley]).trim().split("\r\n");
  assert.equal(lines[0], "BillNo,Supplier,BillDate,DueDate,Terms,Location,Memo,Account,LineDescription,LineAmount,LineTaxCode,Currency");
  assert.deepEqual(QBO_COLUMNS.length, 12);
  assert.equal(lines.length, 1 + hartley.data.lineItems.length);
  const first = lines[1].split(",");
  assert.equal(first[0], "HF-7731");
  assert.equal(first[1], "Hartley Office Furniture Ltd");
  assert.equal(first[4], "Net 30");
  assert.equal(first[5], "Operations"); // Location = cost centre
  assert.equal(first[7], "Equipment & Furniture");
  assert.equal(first[9], "756");
  assert.equal(first[10], "20.0% S");
  assert.equal(first[11], "GBP");
});

test("Xero CSV: exact header, one row per line item with tracking and account code", () => {
  const lines = toXeroCSV([hartley]).trim().split("\r\n");
  assert.equal(
    lines[0],
    "*ContactName,EmailAddress,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,Total,Description,*Quantity,*UnitAmount,*AccountCode,*TaxType,TrackingName1,TrackingOption1,Currency",
  );
  assert.equal(XERO_COLUMNS.length, 15);
  assert.equal(lines.length, 4);
  const f = lines[1].split(",");
  assert.equal(f[0], "Hartley Office Furniture Ltd");
  assert.equal(f[2], "HF-7731");
  assert.equal(f[3], "PO-4410");
  assert.equal(f[6], "1807.2");
  assert.equal(f[8], "4");
  assert.equal(f[9], "189");
  assert.equal(f[10], "710");
  assert.equal(f[11], "20% (VAT on Expenses)");
  assert.equal(f[12], "Cost centre");
  assert.equal(f[13], "Operations");
  assert.equal(f[14], "GBP");
});

test("an invoice with no line items still exports one row", () => {
  const bare = { ...brightwell, data: { ...brightwell.data, lineItems: [] } };
  assert.equal(toQuickBooksCSV([bare]).trim().split("\r\n").length, 2);
  assert.equal(toXeroCSV([bare]).trim().split("\r\n").length, 2);
});

test("text cells with commas are quoted and amounts stay numbers", () => {
  const odd = { ...hartley, notes: 'Say "hi", ok', data: { ...hartley.data, vendor: "Café, Bar & Co" } };
  const row = toQuickBooksCSV([odd]).split("\r\n")[1];
  assert.match(row, /^HF-7731,"Café, Bar & Co",/);
  assert.match(row, /"PO PO-4410 \| Say ""hi"", ok"/);
});

test("CSV downloads start with a UTF-8 BOM; JSON does not", () => {
  const qbo = buildExport("qbo", [hartley], NOW);
  const xero = buildExport("xero", [hartley], NOW);
  const json = buildExport("json", [hartley], NOW);
  assert.ok(qbo.content.startsWith(BOM));
  assert.ok(xero.content.startsWith(BOM));
  assert.ok(!json.content.startsWith(BOM));
  assert.doesNotThrow(() => JSON.parse(json.content));
  assert.equal(qbo.filename, "quickbooks-bills-2026-10-11.csv");
  assert.equal(xero.filename, "xero-bills-2026-10-11.csv");
  assert.equal(json.filename, "invoices-2026-10-11.json");
  assert.match(qbo.mime, /text\/csv/);
  assert.equal(json.mime, "application/json");
});

test("JSON contains the approval record and coding, and no preview data", () => {
  const out = JSON.parse(toJSON([hartley], NOW));
  assert.equal(out.count, 1);
  assert.equal(out.invoices[0].invoiceNumber, "HF-7731");
  assert.equal(out.invoices[0].category, "Equipment & Furniture");
  assert.equal(out.invoices[0].approval.by, "You");
  assert.ok(!("previewUrl" in out.invoices[0]));
});

test("terms and tax codes", () => {
  assert.equal(termsFor("2026-10-01", "2026-10-31"), "Net 30");
  assert.equal(termsFor("", "2026-10-31"), "");
  assert.equal(termsFor("2026-10-31", "2026-10-01"), "");
  const ca = invoices.find((r) => r.id === "inv-003")!;
  assert.equal(qboTaxCode(ca), "HST");
  assert.equal(xeroTaxType(ca), "HST on Expenses");
  const us = invoices.find((r) => r.id === "inv-002")!;
  assert.equal(qboTaxCode(us), "Tax");
});
