import { formatMoney } from "./money";
import type { Check } from "./checks";
import type { Approval, Decision, FieldName, Invoice, InvoiceRecord, LogEntry, LogKind, Settings, Status } from "./types";

export const ACTOR = "You";

export class WorkflowError extends Error {}

export const DEFAULT_SETTINGS: Settings = {
  threshold: 5000,
  manualMinutes: 4,
  reviewSeconds: 30,
  knownVendors: [],
};

export function entry(kind: LogKind, message: string, now: Date, actor: string = ACTOR): LogEntry {
  return { at: now.toISOString(), actor, kind, message };
}

function withLog(rec: InvoiceRecord, e: LogEntry, patch: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return { ...rec, ...patch, log: [...rec.log, e] };
}

/** Clean invoices are "New"; anything with a warning or failure needs a human look. */
export function deriveStatus(checks: Check[]): "new" | "needs_review" {
  return checks.some((c) => c.status !== "pass") ? "needs_review" : "new";
}

/** Totals above the threshold (in the invoice's own currency; no FX) need a manager. */
export function needsManager(total: number | null, threshold: number): boolean {
  return total !== null && total > threshold;
}

const EDITABLE: Status[] = ["new", "needs_review", "needs_manager", "flagged"];
export const canEdit = (rec: InvoiceRecord) => rec.load === "ready" && EDITABLE.includes(rec.status);
export const canApprove = (rec: InvoiceRecord) => rec.load === "ready" && ["new", "needs_review", "flagged"].includes(rec.status);
export const canApproveAsManager = (rec: InvoiceRecord) => rec.load === "ready" && rec.status === "needs_manager";
export const canFlag = (rec: InvoiceRecord) => rec.load === "ready" && ["new", "needs_review", "needs_manager"].includes(rec.status);
export const canReject = (rec: InvoiceRecord) => rec.load === "ready" && ["new", "needs_review", "needs_manager", "flagged"].includes(rec.status);
export const canReopen = (rec: InvoiceRecord) => ["approved", "rejected", "flagged"].includes(rec.status);

function decision(rec: InvoiceRecord, d: Decision, note: string, now: Date): Approval {
  return { by: ACTOR, decision: d, note: note.trim(), at: now.toISOString() };
}

const withNote = (note: string) => (note.trim() ? ` Note: "${note.trim()}"` : "");

/** Approve. Above the threshold this routes to the manager instead of approving. */
export function approve(rec: InvoiceRecord, settings: Settings, now: Date, issues = 0): InvoiceRecord {
  if (!canApprove(rec)) throw new WorkflowError(`An invoice that is "${rec.status}" can't be approved from here.`);
  const caveat = issues > 0 ? ` with ${issues} open ${issues === 1 ? "issue" : "issues"}` : "";
  const approval = decision(rec, "approved", rec.notes, now);
  if (needsManager(rec.data.total, settings.threshold)) {
    const total = formatMoney(rec.data.total, rec.data.currency);
    const limit = formatMoney(settings.threshold, rec.data.currency);
    return withLog(
      rec,
      entry("decision", `Approved by ${ACTOR}${caveat}. ${total} is above the ${limit} threshold, so it now needs manager approval.${withNote(rec.notes)}`, now),
      { status: "needs_manager", approval },
    );
  }
  return withLog(rec, entry("decision", `Approved by ${ACTOR}${caveat}.${withNote(rec.notes)}`, now), { status: "approved", approval });
}

export function approveAsManager(rec: InvoiceRecord, now: Date, issues = 0): InvoiceRecord {
  if (!canApproveAsManager(rec)) throw new WorkflowError("Only invoices waiting for manager approval can be approved as manager.");
  const caveat = issues > 0 ? ` with ${issues} open ${issues === 1 ? "issue" : "issues"}` : "";
  return withLog(rec, entry("decision", `Approved as manager by ${ACTOR}${caveat}.${withNote(rec.notes)}`, now), {
    status: "approved",
    approval: decision(rec, "manager_approved", rec.notes, now),
  });
}

function requireReason(reason: string, verb: string): string {
  const r = reason.trim();
  if (!r) throw new WorkflowError(`Please give a reason before you ${verb} this invoice.`);
  return r;
}

export function flag(rec: InvoiceRecord, reason: string, now: Date): InvoiceRecord {
  const r = requireReason(reason, "flag");
  if (!canFlag(rec)) throw new WorkflowError(`An invoice that is "${rec.status}" can't be flagged.`);
  return withLog(rec, entry("decision", `Flagged by ${ACTOR}: "${r}"`, now), { status: "flagged", approval: decision(rec, "flagged", r, now) });
}

export function reject(rec: InvoiceRecord, reason: string, now: Date): InvoiceRecord {
  const r = requireReason(reason, "reject");
  if (!canReject(rec)) throw new WorkflowError(`An invoice that is "${rec.status}" can't be rejected.`);
  return withLog(rec, entry("decision", `Rejected by ${ACTOR}: "${r}"`, now), { status: "rejected", approval: decision(rec, "rejected", r, now) });
}

/** Undo a decision. The status is re-derived from the checks by the caller (reconcile). */
export function reopen(rec: InvoiceRecord, now: Date): InvoiceRecord {
  if (!canReopen(rec)) throw new WorkflowError(`An invoice that is "${rec.status}" can't be reopened.`);
  return withLog(rec, entry("decision", `Reopened by ${ACTOR} (was ${rec.status.replace("_", " ")}).`, now), { status: "needs_review", approval: null });
}

// ---------- Editing ----------

const LABEL: Record<FieldName, string> = {
  vendor: "vendor",
  invoiceNumber: "invoice number",
  issueDate: "issue date",
  dueDate: "due date",
  currency: "currency",
  poNumber: "PO number",
  subtotal: "subtotal",
  tax: "tax",
  total: "total",
};

const show = (v: string | number | null) => (v === null || v === "" ? "(empty)" : String(v));

/** Log an edit, merging into the previous entry when the same thing is still being typed. */
function logEdit(rec: InvoiceRecord, key: string, label: string, from: string, to: string, now: Date, patch: Partial<InvoiceRecord>): InvoiceRecord {
  const tag = `edit:${key}`;
  const last = rec.log[rec.log.length - 1];
  if (last?.tag === tag) {
    const originalFrom = last.from ?? from;
    const log = rec.log.slice(0, -1);
    if (originalFrom === to) return { ...rec, ...patch, log };
    return { ...rec, ...patch, log: [...log, { ...entry("edit", `Edited ${label} from ${show(originalFrom)} to ${show(to)}`, now), tag, from: originalFrom }] };
  }
  return { ...rec, ...patch, log: [...rec.log, { ...entry("edit", `Edited ${label} from ${show(from)} to ${show(to)}`, now), tag, from }] };
}

/** Fields a person has edited. The AI's doubt about those no longer applies. */
export function editedFields(log: LogEntry[]): FieldName[] {
  return log.flatMap((e) => (e.tag?.startsWith("edit:") ? [e.tag.slice(5) as FieldName] : []));
}

const NUMERIC: FieldName[] = ["subtotal", "tax", "total"];

export function editField(rec: InvoiceRecord, field: FieldName, value: string | number | null, now: Date): InvoiceRecord {
  if (!canEdit(rec)) throw new WorkflowError("This invoice is locked. Reopen it to make changes.");
  const before = rec.data[field] as string | number | null;
  const next = NUMERIC.includes(field) ? (value === "" ? null : (value as number | null)) : String(value ?? "");
  if (before === next) return rec;
  const data: Invoice = { ...rec.data, [field]: next };
  const patch: Partial<InvoiceRecord> = { data };
  if (field === "issueDate" || field === "dueDate") {
    if (rec.dateOffsets) {
      const { [field]: _dropped, ...rest } = rec.dateOffsets;
      patch.dateOffsets = rest;
    }
  }
  return logEdit(rec, field, LABEL[field], show(before), show(next), now, patch);
}

export type LineKey = "description" | "quantity" | "unitPrice" | "amount";

export function editLine(rec: InvoiceRecord, index: number, key: LineKey, value: string | number | null, now: Date): InvoiceRecord {
  if (!canEdit(rec)) throw new WorkflowError("This invoice is locked. Reopen it to make changes.");
  const line = rec.data.lineItems[index];
  if (!line) return rec;
  const before = line[key];
  const next = key === "description" ? String(value ?? "") : (value as number | null);
  if (before === next) return rec;
  const lineItems = rec.data.lineItems.map((l, i) => (i === index ? { ...l, [key]: next } : l));
  const names: Record<LineKey, string> = { description: "description", quantity: "quantity", unitPrice: "unit price", amount: "amount" };
  return logEdit(rec, `line${index}.${key}`, `line ${index + 1} ${names[key]}`, show(before), show(next), now, { data: { ...rec.data, lineItems } });
}

export function setCoding(rec: InvoiceRecord, key: "category" | "costCentre", value: string, now: Date): InvoiceRecord {
  if (!canEdit(rec)) throw new WorkflowError("This invoice is locked. Reopen it to make changes.");
  if (rec[key] === value) return rec;
  const label = key === "category" ? "category" : "cost centre";
  return logEdit(rec, key, label, show(rec[key]), show(value), now, { [key]: value });
}

/** Notes can be written at any time, including after approval. */
export function setNotes(rec: InvoiceRecord, notes: string): InvoiceRecord {
  return rec.notes === notes ? rec : { ...rec, notes };
}

export function addNoteLog(rec: InvoiceRecord, now: Date): InvoiceRecord {
  return withLog(rec, entry("edit", `Note saved: "${rec.notes.trim()}"`, now));
}

// ---------- Export ----------

export const exportable = (invoices: InvoiceRecord[]) => invoices.filter((r) => r.status === "approved" && r.load === "ready");

export type ExportFormat = "QuickBooks Online CSV" | "Xero CSV" | "JSON";

/** Only approved invoices are marked Exported; anything else is left untouched. */
export function markExported(invoices: InvoiceRecord[], format: ExportFormat, now: Date): InvoiceRecord[] {
  return invoices.map((r) =>
    r.status === "approved" && r.load === "ready"
      ? withLog(r, entry("export", `Exported as ${format} by ${ACTOR}.`, now), { status: "exported" })
      : r,
  );
}
