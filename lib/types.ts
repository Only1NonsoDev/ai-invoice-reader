export type LineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
};

/** Fields that carry a per-field extraction confidence. */
export const FIELD_NAMES = [
  "vendor",
  "invoiceNumber",
  "issueDate",
  "dueDate",
  "currency",
  "poNumber",
  "subtotal",
  "tax",
  "total",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
/** 0..1 per field. A missing key means "unknown". */
export type Confidence = Partial<Record<FieldName, number>>;

/** What the extraction step produces (and what the user edits). */
export type Invoice = {
  vendor: string;
  invoiceNumber: string;
  poNumber: string; // "" when the invoice shows no purchase-order number
  issueDate: string; // YYYY-MM-DD or ""
  dueDate: string; // YYYY-MM-DD or ""
  currency: string; // ISO 4217 code or ""
  lineItems: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** Present only when the model reported it. */
  confidence?: Confidence;
};

export type Status =
  | "new"
  | "needs_review"
  | "needs_manager"
  | "approved"
  | "flagged"
  | "rejected"
  | "exported";

export const STATUSES: Status[] = ["new", "needs_review", "needs_manager", "approved", "flagged", "rejected", "exported"];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  needs_review: "Needs review",
  needs_manager: "Needs manager approval",
  approved: "Approved",
  flagged: "Flagged",
  rejected: "Rejected",
  exported: "Exported",
};

export type LogKind = "extracted" | "edit" | "decision" | "export" | "system";

export type LogEntry = {
  at: string;
  actor: string;
  kind: LogKind;
  message: string;
  /** Edit entries only: what was edited ("edit:total") and its value before the first edit, so typing merges into one entry. */
  tag?: string;
  from?: string;
};

export type Decision = "approved" | "manager_approved" | "flagged" | "rejected";

/** Who decided what, when, and why. */
export type Approval = { by: string; decision: Decision; note: string; at: string };

export type InvoiceRecord = {
  id: string;
  fileName: string;
  source: "sample" | "upload";
  /** Sample file path under /public (samples only). */
  sampleFile?: string;
  /** Small data: URL (persisted) or a runtime blob: URL (not persisted). */
  previewUrl: string | null;
  /** True when a saved preview was too big to keep, so it is gone after a reload. */
  previewLost?: boolean;
  load: "ready" | "extracting" | "error";
  error?: string;
  status: Status;
  data: Invoice;
  confidence: Confidence;
  category: string;
  costCentre: string;
  notes: string;
  approval: Approval | null;
  log: LogEntry[];
  receivedAt: string; // ISO timestamp
  /** Seed invoices only: dates as day offsets from "today", re-applied on load. Dropped per field once edited. */
  dateOffsets?: { issueDate?: number; dueDate?: number };
};

export type Settings = {
  /** Approvals above this total (in the invoice's own currency) need a manager. */
  threshold: number;
  manualMinutes: number;
  reviewSeconds: number;
  knownVendors: string[];
};

export type AppState = { invoices: InvoiceRecord[]; settings: Settings };
