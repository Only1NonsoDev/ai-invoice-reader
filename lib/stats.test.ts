import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "./seed";
import { computeChecks } from "./state";
import { amountBy, awaitingManagerCount, currenciesIn, dueThisWeek, formatDuration, handledCount, overdueCount, pendingReviewCount, suspectedDuplicates, timeSavedMinutes } from "./stats";

const TODAY = "2026-10-11";
const { invoices, settings } = buildSeed(new Date(`${TODAY}T10:00:00`));
const checks = computeChecks(invoices, settings, TODAY);

test("due this week groups by currency, never mixes them, and skips the duplicate", () => {
  const rows = dueThisWeek(invoices, checks, TODAY);
  // inv-002 (USD, due +4), inv-007 (GBP, overdue); inv-004 is due +10, inv-005 is a duplicate
  assert.deepEqual(rows.map((r) => r.currency), ["GBP", "USD"]);
  assert.equal(rows.find((r) => r.currency === "GBP")!.total, 982.2);
  assert.equal(rows.find((r) => r.currency === "USD")!.total, 643.55);
});

test("counts", () => {
  assert.equal(overdueCount(invoices, checks, TODAY), 1);
  assert.equal(pendingReviewCount(invoices), 7);
  assert.equal(awaitingManagerCount(invoices), 1);
  assert.equal(suspectedDuplicates(invoices, checks), 1);
});

test("amount by vendor / category is per currency and sorted", () => {
  assert.equal(currenciesIn(invoices, checks)[0], "GBP");
  const v = amountBy(invoices, checks, "vendor", "GBP");
  assert.ok(v.every((b, i) => i === 0 || v[i - 1].value >= b.value));
  assert.equal(v.filter((b) => b.label.startsWith("Hartley")).length, 1); // duplicate excluded
  assert.equal(v.find((b) => b.label.startsWith("Hartley"))!.value, 1807.2);
  const c = amountBy(invoices, checks, "category", "CAD");
  assert.deepEqual(c.map((b) => b.label).sort(), ["Meals & Entertainment", "Repairs & Maintenance"]);
});

test("time saved uses the editable assumptions", () => {
  assert.equal(handledCount(invoices), 3); // approved + needs_manager + flagged
  assert.equal(timeSavedMinutes(10, 4, 30), 35);
  assert.equal(timeSavedMinutes(10, 0.2, 30), 0);
  assert.equal(formatDuration(35), "35 min");
  assert.equal(formatDuration(75), "1 h 15 min");
});
