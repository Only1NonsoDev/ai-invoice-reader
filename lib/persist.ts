import { DEFAULT_KNOWN_VENDORS } from "./coding";
import { STATUSES, type AppState, type Approval, type Confidence, type Invoice, type InvoiceRecord, type LineItem, type LogEntry, type Settings } from "./types";
import { DEFAULT_SETTINGS } from "./workflow";

/** Bump the number when the saved shape changes; old data is then ignored, not misread. */
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = `ai-invoice-reader:ap-demo:v${SCHEMA_VERSION}`;
/** Largest preview (as a data: URL string) that is worth keeping in localStorage. */
export const MAX_PREVIEW_CHARS = 200_000;

type Saved = { version: number; savedAt: string; settings: Settings; invoices: InvoiceRecord[] };

/**
 * Turn the app state into a string for localStorage. Fields are copied one by one on purpose:
 * only known demo data is written, so an API key or file bytes can never slip in.
 */
export function serialize(state: AppState, now: Date = new Date()): string {
  const invoices = state.invoices.map((r): InvoiceRecord => {
    const keep = r.previewUrl !== null && r.previewUrl.startsWith("data:") && r.previewUrl.length <= MAX_PREVIEW_CHARS;
    const lost = r.source === "upload" && r.previewUrl !== null && !keep ? true : r.previewLost;
    return {
      id: r.id,
      fileName: r.fileName,
      source: r.source,
      sampleFile: r.sampleFile,
      previewUrl: keep ? r.previewUrl : null,
      previewLost: lost || undefined,
      load: r.load,
      error: r.error,
      status: r.status,
      data: r.data,
      confidence: r.confidence,
      category: r.category,
      costCentre: r.costCentre,
      notes: r.notes,
      approval: r.approval,
      log: r.log,
      receivedAt: r.receivedAt,
      dateOffsets: r.dateOffsets,
    };
  });
  const s = state.settings;
  const saved: Saved = {
    version: SCHEMA_VERSION,
    savedAt: now.toISOString(),
    settings: { threshold: s.threshold, manualMinutes: s.manualMinutes, reviewSeconds: s.reviewSeconds, knownVendors: s.knownVendors },
    invoices,
  };
  return JSON.stringify(saved);
}

// ---------- Reading it back, defensively ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const posNum = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);

function readLine(v: unknown): LineItem | null {
  if (!isObj(v)) return null;
  return { description: str(v.description), quantity: numOrNull(v.quantity), unitPrice: numOrNull(v.unitPrice), amount: numOrNull(v.amount) };
}

function readConfidence(v: unknown): Confidence {
  if (!isObj(v)) return {};
  const out: Obj = {};
  for (const [k, n] of Object.entries(v)) if (typeof n === "number" && n >= 0 && n <= 1) out[k] = n;
  return out as Confidence;
}

function readInvoice(v: unknown): Invoice | null {
  if (!isObj(v) || !Array.isArray(v.lineItems)) return null;
  return {
    vendor: str(v.vendor),
    invoiceNumber: str(v.invoiceNumber),
    poNumber: str(v.poNumber),
    issueDate: str(v.issueDate),
    dueDate: str(v.dueDate),
    currency: str(v.currency),
    lineItems: v.lineItems.map(readLine).filter((l): l is LineItem => l !== null),
    subtotal: numOrNull(v.subtotal),
    tax: numOrNull(v.tax),
    total: numOrNull(v.total),
  };
}

function readLog(v: unknown): LogEntry[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e): LogEntry[] =>
    isObj(e) && typeof e.at === "string" && typeof e.message === "string"
      ? [{ at: e.at, actor: str(e.actor, "You"), kind: (["extracted", "edit", "decision", "export", "system"].includes(str(e.kind)) ? e.kind : "system") as LogEntry["kind"], message: e.message, tag: typeof e.tag === "string" ? e.tag : undefined, from: typeof e.from === "string" ? e.from : undefined }]
      : [],
  );
}

function readApproval(v: unknown): Approval | null {
  if (!isObj(v) || !["approved", "manager_approved", "flagged", "rejected"].includes(str(v.decision))) return null;
  return { by: str(v.by, "You"), decision: v.decision as Approval["decision"], note: str(v.note), at: str(v.at) };
}

function readOffsets(v: unknown): InvoiceRecord["dateOffsets"] {
  if (!isObj(v)) return undefined;
  const out: NonNullable<InvoiceRecord["dateOffsets"]> = {};
  if (typeof v.issueDate === "number") out.issueDate = v.issueDate;
  if (typeof v.dueDate === "number") out.dueDate = v.dueDate;
  return out;
}

function readRecord(v: unknown): InvoiceRecord | null {
  if (!isObj(v) || typeof v.id !== "string" || !STATUSES.includes(v.status as never)) return null;
  const data = readInvoice(v.data);
  if (!data) return null;
  // An upload that was still being read when the page closed can't continue.
  const interrupted = v.load === "extracting";
  const load = interrupted ? "error" : v.load === "error" ? "error" : "ready";
  return {
    id: v.id,
    fileName: str(v.fileName, "invoice"),
    source: v.source === "sample" ? "sample" : "upload",
    sampleFile: typeof v.sampleFile === "string" ? v.sampleFile : undefined,
    previewUrl: typeof v.previewUrl === "string" && v.previewUrl.startsWith("data:") ? v.previewUrl : null,
    previewLost: v.previewLost === true ? true : undefined,
    load,
    error: interrupted ? "This upload was interrupted when the page closed. Upload the file again." : typeof v.error === "string" ? v.error : undefined,
    status: v.status as InvoiceRecord["status"],
    data,
    confidence: readConfidence(v.confidence),
    category: str(v.category),
    costCentre: str(v.costCentre),
    notes: str(v.notes),
    approval: readApproval(v.approval),
    log: readLog(v.log),
    receivedAt: str(v.receivedAt, new Date(0).toISOString()),
    dateOffsets: readOffsets(v.dateOffsets),
  };
}

function readSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  const vendors = Array.isArray(o.knownVendors) ? o.knownVendors.filter((x): x is string => typeof x === "string") : DEFAULT_KNOWN_VENDORS;
  return {
    threshold: typeof o.threshold === "number" && o.threshold > 0 ? o.threshold : DEFAULT_SETTINGS.threshold,
    manualMinutes: posNum(o.manualMinutes, DEFAULT_SETTINGS.manualMinutes),
    reviewSeconds: posNum(o.reviewSeconds, DEFAULT_SETTINGS.reviewSeconds),
    knownVendors: vendors,
  };
}

/** Returns null for missing, corrupt or wrong-version data, so the caller can fall back to the seed. */
export function deserialize(raw: string | null): AppState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(parsed) || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.invoices)) return null;
  const invoices = parsed.invoices.map(readRecord).filter((r): r is InvoiceRecord => r !== null);
  return { invoices, settings: readSettings(parsed.settings) };
}
