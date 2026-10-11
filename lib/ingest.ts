import { suggestCategory } from "./coding";
import type { Invoice, InvoiceRecord } from "./types";
import { entry } from "./workflow";

export const EMPTY_INVOICE: Invoice = {
  vendor: "",
  invoiceNumber: "",
  poNumber: "",
  issueDate: "",
  dueDate: "",
  currency: "",
  lineItems: [],
  subtotal: null,
  tax: null,
  total: null,
};

/** A queue item for a file that was just chosen. It shows a loading state until extraction finishes. */
export function newUpload(id: string, fileName: string, now: Date): InvoiceRecord {
  return {
    id,
    fileName,
    source: "upload",
    previewUrl: null,
    load: "extracting",
    status: "new",
    data: EMPTY_INVOICE,
    confidence: {},
    category: "",
    costCentre: "",
    notes: "",
    approval: null,
    log: [entry("system", `Uploaded ${fileName}.`, now)],
    receivedAt: now.toISOString(),
  };
}

export function applyExtraction(rec: InvoiceRecord, invoice: Invoice, modelLabel: string, now: Date): InvoiceRecord {
  const { confidence, ...data } = invoice;
  const category = suggestCategory(data.lineItems.map((l) => l.description));
  const log = [...rec.log, entry("extracted", `Extracted by AI (${modelLabel}).`, now, "AI")];
  if (category) log.push(entry("system", `Suggested category "${category}".`, now, "AI"));
  return { ...rec, load: "ready", error: undefined, data, confidence: confidence ?? {}, category, log };
}

export function applyExtractionError(rec: InvoiceRecord, message: string, now: Date): InvoiceRecord {
  return { ...rec, load: "error", error: message, log: [...rec.log, entry("system", `Extraction failed: ${message}`, now)] };
}

export function restartExtraction(rec: InvoiceRecord, now: Date): InvoiceRecord {
  return { ...rec, load: "extracting", error: undefined, log: [...rec.log, entry("system", "Retrying extraction.", now)] };
}
