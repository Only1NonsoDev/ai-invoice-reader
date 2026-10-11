import assert from "node:assert/strict";
import { test } from "node:test";
import { toNumber } from "./money";
import { extractJson, normalizeCurrency, normalizeDate, parseInvoice, ParseError } from "./parse";

const GOOD = {
  vendor: "Acme",
  invoice_number: "A-1",
  issue_date: "2025-01-05",
  due_date: "",
  currency: "usd",
  line_items: [{ description: "Widget", quantity: "2", unit_price: "$1,000.50", amount: 2001 }],
  subtotal: 2001,
  tax: null,
  total: "2,001.00",
};

test("parses snake_case model output into an Invoice", () => {
  const inv = parseInvoice(JSON.stringify(GOOD));
  assert.equal(inv.currency, "USD");
  assert.deepEqual(inv.lineItems[0], { description: "Widget", quantity: 2, unitPrice: 1000.5, amount: 2001 });
  assert.equal(inv.tax, null);
  assert.equal(inv.total, 2001);
  assert.equal(inv.dueDate, "");
});

test("extracts JSON from fenced or chatty replies", () => {
  const fenced = "Here you go:\n```json\n" + JSON.stringify(GOOD) + "\n```\nHope that helps!";
  assert.equal(parseInvoice(fenced).vendor, "Acme");
  const chatty = 'Sure! {"vendor":"B {co}","total":5} Done.';
  assert.deepEqual(extractJson(chatty), { vendor: "B {co}", total: 5 });
});

test("rejects non-JSON and non-invoices with friendly errors", () => {
  assert.throws(() => parseInvoice("sorry, I can't"), ParseError);
  assert.throws(() => parseInvoice("[1,2]"), ParseError);
  assert.throws(() => parseInvoice("{}"), /No invoice details/);
});

test("toNumber handles common formats", () => {
  assert.equal(toNumber("£1,234.50"), 1234.5);
  assert.equal(toNumber("1.234,50"), 1234.5);
  assert.equal(toNumber("12,50"), 12.5);
  assert.equal(toNumber("1,250"), 1250);
  assert.equal(toNumber("(12.00)"), -12);
  assert.equal(toNumber("n/a"), null);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber(NaN), null);
});

test("normalizeDate and normalizeCurrency", () => {
  assert.equal(normalizeDate("2025-3-7"), "2025-03-07");
  assert.equal(normalizeDate("March 7, 2025"), "2025-03-07");
  assert.equal(normalizeDate("soon"), "");
  assert.equal(normalizeCurrency("£"), "GBP");
  assert.equal(normalizeCurrency("cad"), "CAD");
  assert.equal(normalizeCurrency("dollars"), "");
});
