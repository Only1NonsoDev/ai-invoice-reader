import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "./seed";
import {
  approve, approveAsManager, canEdit, deriveStatus, editField, editLine, editedFields, flag, markExported, needsManager, reject, reopen,
  setCoding, WorkflowError, exportable,
} from "./workflow";
import type { InvoiceRecord } from "./types";

const NOW = new Date("2026-10-11T10:00:00Z");
const seed = () => buildSeed(NOW);
const get = (id: string, invoices = seed().invoices): InvoiceRecord => invoices.find((r) => r.id === id)!;

test("needsManager is strictly above the threshold", () => {
  assert.equal(needsManager(5000, 5000), false);
  assert.equal(needsManager(5000.01, 5000), true);
  assert.equal(needsManager(null, 5000), false);
});

test("approve under the threshold approves and records who/decision/note/time", () => {
  const { settings } = seed();
  const rec = { ...get("inv-001"), notes: "Checked against delivery note" };
  const out = approve(rec, settings, NOW);
  assert.equal(out.status, "approved");
  assert.deepEqual(out.approval, { by: "You", decision: "approved", note: "Checked against delivery note", at: NOW.toISOString() });
  assert.match(out.log.at(-1)!.message, /Approved by You/);
  assert.equal(out.log.at(-1)!.at, NOW.toISOString());
});

test("approve above the threshold goes to manager approval, then manager approval completes it", () => {
  const { settings } = seed();
  const big = { ...get("inv-001"), status: "needs_review" as const, data: { ...get("inv-001").data, total: 7000 } };
  const waiting = approve(big, settings, NOW);
  assert.equal(waiting.status, "needs_manager");
  assert.match(waiting.log.at(-1)!.message, /needs manager approval/);
  assert.throws(() => approve(waiting, settings, NOW), WorkflowError); // can't self-approve twice
  const done = approveAsManager(waiting, new Date("2026-10-11T11:00:00Z"));
  assert.equal(done.status, "approved");
  assert.equal(done.approval?.decision, "manager_approved");
  assert.match(done.log.at(-1)!.message, /Approved as manager by You/);
});

test("the threshold is configurable", () => {
  const { settings } = seed();
  const rec = get("inv-001"); // £573.60
  assert.equal(approve(rec, { ...settings, threshold: 500 }, NOW).status, "needs_manager");
  assert.equal(approve(rec, { ...settings, threshold: 600 }, NOW).status, "approved");
});

test("manager approval is only available when waiting for it", () => {
  assert.throws(() => approveAsManager(get("inv-001"), NOW), WorkflowError);
});

test("flag and reject require a reason", () => {
  const rec = get("inv-002");
  assert.throws(() => flag(rec, "   ", NOW), /reason/);
  assert.throws(() => reject(rec, "", NOW), /reason/);
  const f = flag(rec, "Wrong PO", NOW);
  assert.equal(f.status, "flagged");
  assert.equal(f.approval?.note, "Wrong PO");
  const r = reject(rec, "Not ours", NOW);
  assert.equal(r.status, "rejected");
  assert.match(r.log.at(-1)!.message, /Rejected by You: "Not ours"/);
});

test("reopen clears the decision and logs it", () => {
  const r = reopen(reject(get("inv-002"), "Oops", NOW), NOW);
  assert.equal(r.status, "needs_review");
  assert.equal(r.approval, null);
  assert.throws(() => reopen(get("inv-001"), NOW), WorkflowError);
});

test("editing logs 'Edited field X from A to B' and merges keystrokes", () => {
  let rec = get("inv-001");
  rec = editField(rec, "poNumber", "PO-4", NOW);
  rec = editField(rec, "poNumber", "PO-44", NOW);
  rec = editField(rec, "poNumber", "PO-4472", NOW);
  const edits = rec.log.filter((e) => e.kind === "edit");
  assert.equal(edits.length, 1);
  assert.equal(edits[0].message, "Edited PO number from PO-4471 to PO-4472");
  assert.deepEqual(editedFields(rec.log), ["poNumber"]);
  // typing back to the original removes the noise
  rec = editField(rec, "poNumber", "PO-4471", NOW);
  assert.equal(rec.log.filter((e) => e.kind === "edit").length, 0);
});

test("editing numbers, lines and coding is logged; editing a date stops seed re-basing for that date", () => {
  let rec = get("inv-001");
  rec = editField(rec, "total", 600, NOW);
  assert.match(rec.log.at(-1)!.message, /Edited total from 573\.6 to 600/);
  rec = editLine(rec, 0, "amount", 300, NOW);
  assert.match(rec.log.at(-1)!.message, /Edited line 1 amount from 282 to 300/);
  rec = setCoding(rec, "category", "Utilities", NOW);
  assert.match(rec.log.at(-1)!.message, /Edited category from Office Supplies to Utilities/);
  assert.ok(rec.dateOffsets?.dueDate !== undefined);
  rec = editField(rec, "dueDate", "2027-01-01", NOW);
  assert.equal(rec.dateOffsets?.dueDate, undefined);
  assert.ok(rec.dateOffsets?.issueDate !== undefined);
});

test("approved and exported invoices are locked", () => {
  const approved = get("inv-004");
  assert.equal(canEdit(approved), false);
  assert.throws(() => editField(approved, "total", 1, NOW), WorkflowError);
});

test("deriveStatus: clean is New, anything else Needs review", () => {
  assert.equal(deriveStatus([{ id: "po-number", label: "", status: "pass", message: "" }]), "new");
  assert.equal(deriveStatus([{ id: "po-number", label: "", status: "warn", message: "" }]), "needs_review");
});

test("only Approved invoices are exportable, and exporting marks them Exported with a log entry", () => {
  const { invoices } = seed();
  const ready = exportable(invoices);
  assert.deepEqual(ready.map((r) => r.id), ["inv-004"]);
  const after = markExported(invoices, "Xero CSV", NOW);
  assert.equal(get("inv-004", after).status, "exported");
  assert.match(get("inv-004", after).log.at(-1)!.message, /Exported as Xero CSV/);
  // nothing else changes
  for (const r of invoices) if (r.id !== "inv-004") assert.equal(get(r.id, after), r);
  assert.deepEqual(exportable(after), []);
});
