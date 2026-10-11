import { addDays } from "./dates";
import { runChecks, type Check, type CheckContext } from "./checks";
import { deriveStatus, editedFields } from "./workflow";
import type { InvoiceRecord, Settings } from "./types";

export type ChecksById = Record<string, Check[]>;

/** Earlier, non-rejected invoices a record could duplicate. */
function candidatesFor(rec: InvoiceRecord, index: number, all: InvoiceRecord[]) {
  return all
    .filter((o, i) => o.id !== rec.id && o.load === "ready" && o.status !== "rejected" && (o.receivedAt < rec.receivedAt || (o.receivedAt === rec.receivedAt && i < index)))
    .map((o) => ({ id: o.id, vendor: o.data.vendor, invoiceNumber: o.data.invoiceNumber, total: o.data.total, currency: o.data.currency }));
}

export function contextFor(rec: InvoiceRecord, index: number, all: InvoiceRecord[], settings: Settings, today: string): CheckContext {
  // Fields a person has already corrected are no longer "low confidence".
  const edited = new Set(editedFields(rec.log));
  const confidence = Object.fromEntries(Object.entries(rec.confidence).filter(([k]) => !edited.has(k as never)));
  return {
    today,
    knownVendors: settings.knownVendors,
    others: candidatesFor(rec, index, all),
    confidence,
    category: rec.category,
    costCentre: rec.costCentre,
  };
}

export function computeChecks(invoices: InvoiceRecord[], settings: Settings, today: string): ChecksById {
  const out: ChecksById = {};
  invoices.forEach((rec, i) => {
    if (rec.load === "ready") out[rec.id] = runChecks(rec.data, contextFor(rec, i, invoices, settings, today));
  });
  return out;
}

/** Re-apply day offsets so seeded due dates always look right relative to today. */
export function rebaseSeedDates(invoices: InvoiceRecord[], today: string): InvoiceRecord[] {
  return invoices.map((r) => {
    if (!r.dateOffsets) return r;
    const data = { ...r.data };
    if (r.dateOffsets.issueDate !== undefined) data.issueDate = addDays(today, r.dateOffsets.issueDate);
    if (r.dateOffsets.dueDate !== undefined) data.dueDate = addDays(today, r.dateOffsets.dueDate);
    return { ...r, data };
  });
}

/**
 * Keep "New" / "Needs review" in step with the checks. Decided statuses
 * (approved, flagged, rejected, exported, needs manager approval) are never changed here.
 */
export function reconcile(invoices: InvoiceRecord[], settings: Settings, today: string): InvoiceRecord[] {
  const checks = computeChecks(invoices, settings, today);
  let changed = false;
  const next = invoices.map((r) => {
    if (r.load !== "ready" || (r.status !== "new" && r.status !== "needs_review")) return r;
    const status = deriveStatus(checks[r.id] ?? []);
    if (status === r.status) return r;
    changed = true;
    return { ...r, status };
  });
  return changed ? next : invoices;
}
