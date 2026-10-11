import { accountCode } from "./coding";
import { countryForCurrency } from "./checks";
import { daysBetween } from "./dates";
import type { InvoiceRecord, LineItem } from "./types";

export const QBO_COLUMNS = ["BillNo", "Supplier", "BillDate", "DueDate", "Terms", "Location", "Memo", "Account", "LineDescription", "LineAmount", "LineTaxCode", "Currency"];

export const XERO_COLUMNS = [
  "*ContactName",
  "EmailAddress",
  "*InvoiceNumber",
  "Reference",
  "*InvoiceDate",
  "*DueDate",
  "Total",
  "Description",
  "*Quantity",
  "*UnitAmount",
  "*AccountCode",
  "*TaxType",
  "TrackingName1",
  "TrackingOption1",
  "Currency",
];

/** Quote a cell, and defuse spreadsheet formulas ("=1+1", "@SUM(...)") in text. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(columns: string[], rows: (string | number | null)[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** One export row per line item. An invoice with no lines becomes a single row for its net amount. */
function linesOf(rec: InvoiceRecord): LineItem[] {
  const d = rec.data;
  if (d.lineItems.length) return d.lineItems;
  return [{ description: "Invoice total (no line detail)", quantity: 1, unitPrice: d.subtotal ?? d.total, amount: d.subtotal ?? d.total }];
}

/** Effective tax rate as a fraction, or null when it can't be worked out. */
function taxRate(rec: InvoiceRecord): number | null {
  const { subtotal, tax } = rec.data;
  return subtotal && tax !== null ? tax / subtotal : null;
}

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.006;

/**
 * Tax code names differ per accounting file, so these are sensible defaults to map in the import
 * screen, not a promise they match your chart of accounts.
 */
export function qboTaxCode(rec: InvoiceRecord): string {
  const country = countryForCurrency(rec.data.currency);
  const r = taxRate(rec);
  if (r === null) return "";
  if (country === "UK") return near(r, 0.2) ? "20.0% S" : near(r, 0.05) ? "5.0% R" : r === 0 ? "0.0% Z" : "Check VAT code";
  if (country === "CA") return r === 0 ? "Zero-rated" : near(r, 0.05) ? "GST" : near(r, 0.13) || near(r, 0.15) ? "HST" : "GST/PST";
  return r === 0 ? "Non" : "Tax";
}

export function xeroTaxType(rec: InvoiceRecord): string {
  const country = countryForCurrency(rec.data.currency);
  const r = taxRate(rec);
  if (r === null) return "";
  if (country === "UK") return near(r, 0.2) ? "20% (VAT on Expenses)" : near(r, 0.05) ? "5% (VAT on Expenses)" : r === 0 ? "No VAT" : "Check VAT type";
  if (country === "CA") return r === 0 ? "Zero Rated" : near(r, 0.05) ? "GST on Expenses" : "HST on Expenses";
  return r === 0 ? "Tax Exempt" : "Tax on Purchases";
}

/** "Net 30" from the gap between bill date and due date. */
export function termsFor(issueDate: string, dueDate: string): string {
  if (!issueDate || !dueDate) return "";
  const days = daysBetween(issueDate, dueDate);
  return Number.isFinite(days) && days >= 0 ? `Net ${days}` : "";
}

export function toQuickBooksCSV(invoices: InvoiceRecord[]): string {
  const rows = invoices.flatMap((rec) => {
    const d = rec.data;
    const memo = [d.poNumber && `PO ${d.poNumber}`, rec.notes].filter(Boolean).join(" | ");
    return linesOf(rec).map((li) => [
      d.invoiceNumber,
      d.vendor,
      d.issueDate,
      d.dueDate,
      termsFor(d.issueDate, d.dueDate),
      rec.costCentre,
      memo,
      rec.category,
      li.description,
      li.amount,
      qboTaxCode(rec),
      d.currency,
    ]);
  });
  return csv(QBO_COLUMNS, rows);
}

export function toXeroCSV(invoices: InvoiceRecord[]): string {
  const rows = invoices.flatMap((rec) => {
    const d = rec.data;
    return linesOf(rec).map((li) => [
      d.vendor,
      "",
      d.invoiceNumber,
      d.poNumber,
      d.issueDate,
      d.dueDate,
      d.total,
      li.description,
      li.quantity ?? 1,
      li.unitPrice ?? li.amount,
      accountCode(rec.category),
      xeroTaxType(rec),
      "Cost centre",
      rec.costCentre,
      d.currency,
    ]);
  });
  return csv(XERO_COLUMNS, rows);
}

export function toJSON(invoices: InvoiceRecord[], now: Date): string {
  const out = {
    exportedAt: now.toISOString(),
    count: invoices.length,
    invoices: invoices.map((r) => ({
      id: r.id,
      vendor: r.data.vendor,
      invoiceNumber: r.data.invoiceNumber,
      poNumber: r.data.poNumber,
      issueDate: r.data.issueDate,
      dueDate: r.data.dueDate,
      currency: r.data.currency,
      lineItems: r.data.lineItems,
      subtotal: r.data.subtotal,
      tax: r.data.tax,
      total: r.data.total,
      category: r.category,
      costCentre: r.costCentre,
      notes: r.notes,
      approval: r.approval,
    })),
  };
  return JSON.stringify(out, null, 2) + "\n";
}

export type ExportKind = "qbo" | "xero" | "json";

export type ExportFile = { filename: string; mime: string; content: string };

/** CSV gets a UTF-8 BOM so Excel reads "Café" correctly; JSON must not have one. */
export const BOM = "﻿";

export function buildExport(kind: ExportKind, invoices: InvoiceRecord[], now: Date): ExportFile {
  const day = now.toISOString().slice(0, 10);
  if (kind === "json") return { filename: `invoices-${day}.json`, mime: "application/json", content: toJSON(invoices, now) };
  if (kind === "qbo") return { filename: `quickbooks-bills-${day}.csv`, mime: "text/csv;charset=utf-8", content: BOM + toQuickBooksCSV(invoices) };
  return { filename: `xero-bills-${day}.csv`, mime: "text/csv;charset=utf-8", content: BOM + toXeroCSV(invoices) };
}

