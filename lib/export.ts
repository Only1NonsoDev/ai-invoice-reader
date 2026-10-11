import type { Invoice } from "./types";

const CSV_HEADER = [
  "vendor",
  "invoice_number",
  "issue_date",
  "due_date",
  "currency",
  "description",
  "quantity",
  "unit_price",
  "amount",
  "subtotal",
  "tax",
  "total",
];

/** Quote a cell, and defuse spreadsheet formulas ("=1+1", "@SUM(...)") in text. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per line item; invoice-level fields repeat on every row. */
export function toCSV(inv: Invoice): string {
  const base = [inv.vendor, inv.invoiceNumber, inv.issueDate, inv.dueDate, inv.currency];
  const tail = [inv.subtotal, inv.tax, inv.total];
  const items = inv.lineItems.length
    ? inv.lineItems
    : [{ description: "", quantity: null, unitPrice: null, amount: null }];
  const rows = items.map((li) =>
    [...base, li.description, li.quantity, li.unitPrice, li.amount, ...tail].map(csvCell).join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

export function toJSON(inv: Invoice): string {
  return JSON.stringify(inv, null, 2) + "\n";
}

export function exportFilename(inv: Invoice, ext: "csv" | "json"): string {
  const stem = (inv.invoiceNumber || inv.vendor || "invoice").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${stem || "invoice"}.${ext}`;
}
