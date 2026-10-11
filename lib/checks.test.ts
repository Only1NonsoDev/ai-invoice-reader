import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkConfidence, checkDuplicate, checkDueTiming, checkLineMath, checkLinesSum, checkPoNumber, checkTaxRate, checkTotalSum,
  checkVendor, dueInfo, normalizeVendor, runChecks, worst,
} from "./checks";
import type { Invoice } from "./types";

const TODAY = "2026-10-11";

const base: Invoice = {
  vendor: "Acme Ltd",
  invoiceNumber: "A-1",
  poNumber: "PO-1",
  issueDate: "2026-10-01",
  dueDate: "2026-11-15",
  currency: "GBP",
  lineItems: [
    { description: "Widget", quantity: 2, unitPrice: 50, amount: 100 },
    { description: "Gadget", quantity: 1, unitPrice: 20, amount: 20 },
  ],
  subtotal: 120,
  tax: 24,
  total: 144,
};
const with_ = (o: Partial<Invoice>): Invoice => ({ ...base, ...o });

test("line maths: pass, fail with the wrong line named, warn when incomplete", () => {
  assert.equal(checkLineMath(base).status, "pass");
  const bad = checkLineMath(with_({ lineItems: [{ description: "x", quantity: 3, unitPrice: 10, amount: 40 }] }));
  assert.equal(bad.status, "fail");
  assert.deepEqual(bad.rows, [0]);
  assert.match(bad.message, /line 1/);
  assert.equal(checkLineMath(with_({ lineItems: [{ description: "x", quantity: null, unitPrice: 10, amount: 10 }] })).status, "warn");
  assert.equal(checkLineMath(with_({ lineItems: [] })).status, "warn");
});

test("one cent of rounding is tolerated", () => {
  const li = [{ description: "x", quantity: 3, unitPrice: 3.33, amount: 10 }]; // 9.99 vs 10.00
  assert.equal(checkLineMath(with_({ lineItems: li })).status, "pass");
});

test("lines must sum to the subtotal", () => {
  assert.equal(checkLinesSum(base).status, "pass");
  const c = checkLinesSum(with_({ subtotal: 125 }));
  assert.equal(c.status, "fail");
  assert.match(c.message, /£120\.00.*£125\.00/);
  assert.equal(checkLinesSum(with_({ subtotal: null })).status, "warn");
});

test("subtotal + tax must equal total", () => {
  assert.equal(checkTotalSum(base).status, "pass");
  const c = checkTotalSum(with_({ total: 150 }));
  assert.equal(c.status, "fail");
  assert.match(c.message, /£144\.00/);
  assert.equal(checkTotalSum(with_({ tax: null })).status, "warn");
});

test("due date: timing buckets relative to today", () => {
  assert.deepEqual(dueInfo("2026-10-10", TODAY), { kind: "overdue", days: -1 });
  assert.deepEqual(dueInfo(TODAY, TODAY), { kind: "soon", days: 0 });
  assert.deepEqual(dueInfo("2026-10-18", TODAY), { kind: "soon", days: 7 });
  assert.deepEqual(dueInfo("2026-10-19", TODAY), { kind: "ok", days: 8 });
  assert.equal(dueInfo("", TODAY).kind, "none");
  assert.equal(checkDueTiming(with_({ dueDate: "2026-09-29" }), TODAY).status, "fail");
  assert.match(checkDueTiming(with_({ dueDate: "2026-09-29" }), TODAY).message, /Overdue by 12 days/);
  assert.equal(checkDueTiming(with_({ dueDate: "2026-10-15" }), TODAY).status, "warn");
  assert.equal(checkDueTiming(base, TODAY).status, "pass");
  assert.equal(checkDueTiming(with_({ dueDate: "" }), TODAY).status, "warn");
});

test("due timing is computed across month and year boundaries", () => {
  assert.equal(dueInfo("2027-01-03", "2026-12-30").days, 4);
  assert.equal(dueInfo("2026-03-01", "2026-02-27").days, 2);
});

test("duplicates: same vendor + invoice number fails, ignoring case, punctuation and company suffix", () => {
  const others = [{ id: "x", vendor: "ACME limited", invoiceNumber: "a 1", total: 999, currency: "GBP" }];
  const c = checkDuplicate(base, others);
  assert.equal(c.status, "fail");
  assert.match(c.message, /duplicate/i);
});

test("duplicates: same vendor + same total (different number) warns; other vendor passes", () => {
  const sameTotal = [{ id: "x", vendor: "Acme Ltd", invoiceNumber: "B-9", total: 144, currency: "GBP" }];
  assert.equal(checkDuplicate(base, sameTotal).status, "warn");
  const otherVendor = [{ id: "x", vendor: "Other Co", invoiceNumber: "A-1", total: 144, currency: "GBP" }];
  assert.equal(checkDuplicate(base, otherVendor).status, "pass");
  const otherCurrency = [{ id: "x", vendor: "Acme Ltd", invoiceNumber: "B-9", total: 144, currency: "USD" }];
  assert.equal(checkDuplicate(base, otherCurrency).status, "pass");
});

test("unknown vendor warns; known vendor (normalised) passes; blank fails", () => {
  assert.equal(checkVendor(base, ["Someone Else"]).status, "warn");
  assert.equal(checkVendor(base, ["acme, ltd."]).status, "pass");
  assert.equal(checkVendor(with_({ vendor: "" }), []).status, "fail");
  assert.equal(normalizeVendor("Maple & Pine Renovations Inc."), "maple and pine renovations");
});

test("UK VAT: 20%, 5%, 0 pass; other rates fail", () => {
  assert.equal(checkTaxRate(base).status, "pass"); // 24 / 120 = 20%
  assert.equal(checkTaxRate(with_({ tax: 6 })).status, "pass"); // 5%
  assert.equal(checkTaxRate(with_({ tax: 0 })).status, "pass");
  const bad = checkTaxRate(with_({ tax: 18 })); // 15%
  assert.equal(bad.status, "fail");
  assert.match(bad.message, /15%.*20%, 5% or 0%/);
});

test("Canada: GST 5%, HST 13/15%, GST+PST pass; 9% fails", () => {
  const ca = (tax: number) => with_({ currency: "CAD", subtotal: 1000, tax });
  for (const t of [0, 50, 130, 150, 120, 110, 149.75]) assert.equal(checkTaxRate(ca(t)).status, "pass", String(t));
  assert.equal(checkTaxRate(ca(90)).status, "fail");
});

test("US sales tax: 0–11% passes, above fails", () => {
  const us = (tax: number) => with_({ currency: "USD", subtotal: 1000, tax });
  assert.equal(checkTaxRate(us(0)).status, "pass");
  assert.equal(checkTaxRate(us(82.5)).status, "pass");
  assert.equal(checkTaxRate(us(110)).status, "pass");
  assert.equal(checkTaxRate(us(150)).status, "fail");
});

test("tax rate: unknown currency or missing numbers warn instead of guessing", () => {
  assert.equal(checkTaxRate(with_({ currency: "EUR" })).status, "warn");
  assert.equal(checkTaxRate(with_({ tax: null })).status, "warn");
});

test("PO number", () => {
  assert.equal(checkPoNumber(base).status, "pass");
  assert.equal(checkPoNumber(with_({ poNumber: "  " })).status, "warn");
});

test("confidence: below 0.8 warns and names the field", () => {
  assert.equal(checkConfidence({ total: 0.95, vendor: 0.8 }).status, "pass");
  const c = checkConfidence({ total: 0.79, dueDate: 0.5 });
  assert.equal(c.status, "warn");
  assert.match(c.message, /total/);
  assert.match(c.message, /due date/);
  assert.equal(checkConfidence(undefined).status, "pass");
});

test("runChecks: a clean invoice passes everything; each result has a plain-English message", () => {
  const checks = runChecks(base, { today: TODAY, knownVendors: ["Acme Ltd"], others: [], confidence: {}, category: "Office Supplies", costCentre: "Admin" });
  assert.equal(worst(checks), "pass");
  assert.ok(checks.every((c) => c.message.length > 10));
  const ids = new Set(checks.map((c) => c.id));
  assert.equal(ids.size, checks.length);
});
