import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLES } from "./samples";
import { countWarnings, validateInvoice } from "./validation";

const byId = (checks: ReturnType<typeof validateInvoice>, id: string) => checks.find((c) => c.id === id)!;

test("UK and US samples pass every check", () => {
  for (const s of SAMPLES.filter((x) => x.id !== "ca")) {
    assert.equal(countWarnings(validateInvoice(s.invoice)), 0, s.id);
  }
});

test("Canadian sample warns only about the missing due date", () => {
  const checks = validateInvoice(SAMPLES.find((s) => s.id === "ca")!.invoice);
  assert.deepEqual(checks.filter((c) => c.status === "warn").map((c) => c.id), ["due-date"]);
});

test("editing a line amount flags line math and the subtotal", () => {
  const inv = structuredClone(SAMPLES[0].invoice);
  inv.lineItems[1].amount = 120;
  const checks = validateInvoice(inv);
  assert.equal(byId(checks, "line-math").status, "warn");
  assert.deepEqual(byId(checks, "line-math").rows, [1]);
  assert.equal(byId(checks, "lines-sum").status, "warn");
  assert.equal(byId(checks, "total-sum").status, "pass");
});

test("wrong total is flagged with the expected figure", () => {
  const inv = structuredClone(SAMPLES[1].invoice);
  inv.total = 650;
  const c = byId(validateInvoice(inv), "total-sum");
  assert.equal(c.status, "warn");
  assert.match(c.message, /643\.55/);
});

test("one-cent rounding differences are tolerated", () => {
  const inv = structuredClone(SAMPLES[0].invoice);
  inv.lineItems[0].amount = 282.01;
  assert.equal(byId(validateInvoice(inv), "line-math").status, "pass");
});

test("missing numbers warn instead of throwing", () => {
  const inv = structuredClone(SAMPLES[0].invoice);
  inv.subtotal = null;
  inv.lineItems[2].quantity = null;
  const checks = validateInvoice(inv);
  assert.equal(byId(checks, "lines-sum").status, "warn");
  assert.equal(byId(checks, "total-sum").status, "warn");
  assert.equal(byId(checks, "line-math").status, "warn");
});

test("no line items is a warning", () => {
  const inv = { ...structuredClone(SAMPLES[0].invoice), lineItems: [] };
  assert.equal(byId(validateInvoice(inv), "line-math").status, "warn");
});

test("sample data is internally consistent with its stated tax rate", () => {
  const rates = { uk: 0.2, us: 0.0825, ca: 0.13 };
  for (const s of SAMPLES) {
    const tax = Math.round(s.invoice.subtotal! * rates[s.id] * 100) / 100;
    assert.equal(s.invoice.tax, tax, s.id);
  }
});
