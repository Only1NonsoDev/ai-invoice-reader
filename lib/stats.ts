import { addDays } from "./dates";
import { dueInfo } from "./checks";
import type { ChecksById } from "./state";
import type { InvoiceRecord } from "./types";

/** An invoice that still counts as money we may owe (not rejected, not a suspected duplicate). */
export function isLiveDebt(rec: InvoiceRecord, checks: ChecksById): boolean {
  if (rec.load !== "ready" || rec.status === "rejected") return false;
  return checks[rec.id]?.find((c) => c.id === "duplicate")?.status !== "fail";
}

export type CurrencyTotal = { currency: string; total: number; count: number; approved: number };

function addTo(map: Map<string, CurrencyTotal>, rec: InvoiceRecord) {
  const cur = rec.data.currency || "—";
  const row = map.get(cur) ?? { currency: cur, total: 0, count: 0, approved: 0 };
  const amount = rec.data.total ?? 0;
  row.total += amount;
  row.count += 1;
  if (rec.status === "approved" || rec.status === "exported") row.approved += amount;
  map.set(cur, row);
}

const rounded = (rows: CurrencyTotal[]) =>
  rows.map((r) => ({ ...r, total: Math.round(r.total * 100) / 100, approved: Math.round(r.approved * 100) / 100 })).sort((a, b) => a.currency.localeCompare(b.currency));

/**
 * Money to pay in the next 7 days, including anything already overdue. Grouped by currency:
 * amounts in different currencies are never added together (no FX).
 * Exported invoices are included because export means "posted", not "paid".
 */
export function dueThisWeek(invoices: InvoiceRecord[], checks: ChecksById, today: string): CurrencyTotal[] {
  const end = addDays(today, 7);
  const map = new Map<string, CurrencyTotal>();
  for (const rec of invoices) {
    if (!isLiveDebt(rec, checks) || !rec.data.dueDate || rec.data.dueDate > end) continue;
    addTo(map, rec);
  }
  return rounded([...map.values()]);
}

export const suspectedDuplicates = (invoices: InvoiceRecord[], checks: ChecksById) =>
  invoices.filter((r) => r.load === "ready" && r.status !== "rejected" && checks[r.id]?.find((c) => c.id === "duplicate")?.status === "fail").length;

export function overdueCount(invoices: InvoiceRecord[], checks: ChecksById, today: string): number {
  return invoices.filter((r) => isLiveDebt(r, checks) && r.status !== "exported" && dueInfo(r.data.dueDate, today).kind === "overdue").length;
}

export const pendingReviewCount = (invoices: InvoiceRecord[]) => invoices.filter((r) => r.load === "ready" && (r.status === "new" || r.status === "needs_review")).length;

export const awaitingManagerCount = (invoices: InvoiceRecord[]) => invoices.filter((r) => r.status === "needs_manager").length;

export type Bar = { label: string; value: number };

export function currenciesIn(invoices: InvoiceRecord[], checks: ChecksById): string[] {
  const counts = new Map<string, number>();
  for (const r of invoices) if (isLiveDebt(r, checks) && r.data.currency) counts.set(r.data.currency, (counts.get(r.data.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** Totals per vendor or category in a single currency, biggest first. */
export function amountBy(invoices: InvoiceRecord[], checks: ChecksById, by: "vendor" | "category", currency: string): Bar[] {
  const map = new Map<string, number>();
  for (const r of invoices) {
    if (!isLiveDebt(r, checks) || r.data.currency !== currency) continue;
    const label = (by === "vendor" ? r.data.vendor : r.category) || (by === "vendor" ? "(no vendor)" : "Uncategorised");
    map.set(label, (map.get(label) ?? 0) + (r.data.total ?? 0));
  }
  return [...map.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Invoices a person has decided on count as "handled" for the time-saved estimate. */
export const handledCount = (invoices: InvoiceRecord[]) => invoices.filter((r) => ["approved", "exported", "rejected", "flagged", "needs_manager"].includes(r.status)).length;

/** Minutes saved = handled invoices x (manual minutes - review seconds / 60), never below zero. */
export function timeSavedMinutes(handled: number, manualMinutes: number, reviewSeconds: number): number {
  return Math.max(0, handled * (manualMinutes - reviewSeconds / 60));
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${Math.round(minutes - h * 60)} min`;
}
