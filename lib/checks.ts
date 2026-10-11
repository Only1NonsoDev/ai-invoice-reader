import { daysBetween } from "./dates";
import { cents, formatMoney, roundMoney } from "./money";
import type { Confidence, FieldName, Invoice } from "./types";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckId =
  | "line-math"
  | "lines-sum"
  | "total-sum"
  | "due-date"
  | "duplicate"
  | "vendor"
  | "due-timing"
  | "tax-rate"
  | "po-number"
  | "confidence"
  | "coding";

export type Check = {
  id: CheckId;
  label: string;
  status: CheckStatus;
  /** Plain-English reason. */
  message: string;
  /** Indexes of line items that fail the line-math check. */
  rows?: number[];
};

/** A previously received invoice that a new one might duplicate. */
export type Candidate = { id: string; vendor: string; invoiceNumber: string; total: number | null; currency: string };

export type CheckContext = {
  /** Today as YYYY-MM-DD. Passed in so the checks stay pure. */
  today: string;
  knownVendors: string[];
  /** Earlier, non-rejected invoices to compare against. */
  others: Candidate[];
  confidence?: Confidence;
  category?: string;
  costCentre?: string;
};

export const LOW_CONFIDENCE = 0.8;
export const DUE_SOON_DAYS = 7;
/** Allowed rounding difference, in cents. */
const TOLERANCE_CENTS = 1;

const close = (a: number, b: number) => Math.abs(cents(a) - cents(b)) <= TOLERANCE_CENTS;

const LEGAL_SUFFIXES = new Set(["ltd", "limited", "inc", "incorporated", "llc", "llp", "plc", "co", "corp", "corporation", "company", "the"]);

/** "Northwind Cloud Analytics, Inc." and "northwind cloud analytics inc" compare equal. */
export function normalizeVendor(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !LEGAL_SUFFIXES.has(w))
    .join(" ");
}

export function normalizeInvoiceNumber(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ---------- Maths ----------

export function checkLineMath(inv: Invoice): Check {
  const bad: number[] = [];
  const incomplete: number[] = [];
  inv.lineItems.forEach((li, i) => {
    if (li.quantity === null || li.unitPrice === null || li.amount === null) incomplete.push(i);
    else if (!close(li.quantity * li.unitPrice, li.amount)) bad.push(i);
  });
  const rows = [...bad, ...incomplete].sort((a, b) => a - b);
  const list = (r: number[]) => r.map((x) => x + 1).join(", ");
  const base = { id: "line-math" as const, label: "Line items multiply correctly", rows };
  if (inv.lineItems.length === 0) return { ...base, status: "warn", message: "No line items were found, so the maths can't be checked." };
  if (bad.length) {
    const li = inv.lineItems[bad[0]];
    const expected = formatMoney(roundMoney((li.quantity ?? 0) * (li.unitPrice ?? 0)), inv.currency);
    return {
      ...base,
      status: "fail",
      message: `Quantity × unit price doesn't match the amount on line ${list(bad)} (line ${bad[0] + 1} should be ${expected}, not ${formatMoney(li.amount, inv.currency)}).`,
    };
  }
  if (incomplete.length) return { ...base, status: "warn", message: `Line ${list(incomplete)} is missing a quantity, price or amount.` };
  return { ...base, status: "pass", message: "Every line: quantity × unit price equals the amount." };
}

export function checkLinesSum(inv: Invoice): Check {
  const base = { id: "lines-sum" as const, label: "Line items add up to subtotal" };
  const money = (n: number | null) => formatMoney(n, inv.currency);
  const allAmounts = inv.lineItems.length > 0 && inv.lineItems.every((l) => l.amount !== null);
  if (inv.subtotal === null) return { ...base, status: "warn", message: "The subtotal is missing, so it can't be checked against the lines." };
  if (!allAmounts) return { ...base, status: "warn", message: "Some line amounts are missing, so the sum can't be checked." };
  const sum = roundMoney(inv.lineItems.reduce((s, l) => s + (l.amount ?? 0), 0));
  if (close(sum, inv.subtotal)) return { ...base, status: "pass", message: `Line items total ${money(sum)}, matching the subtotal.` };
  return { ...base, status: "fail", message: `Line items total ${money(sum)} but the subtotal says ${money(inv.subtotal)}.` };
}

export function checkTotalSum(inv: Invoice): Check {
  const base = { id: "total-sum" as const, label: "Subtotal + tax equals total" };
  const money = (n: number | null) => formatMoney(n, inv.currency);
  if (inv.subtotal === null || inv.tax === null || inv.total === null) {
    return { ...base, status: "warn", message: "Subtotal, tax or total is missing." };
  }
  const expected = roundMoney(inv.subtotal + inv.tax);
  if (close(expected, inv.total)) return { ...base, status: "pass", message: `${money(inv.subtotal)} + ${money(inv.tax)} = ${money(inv.total)}.` };
  return { ...base, status: "fail", message: `Subtotal + tax is ${money(expected)} but the total says ${money(inv.total)}.` };
}

// ---------- Dates ----------

export function checkDueDate(inv: Invoice): Check {
  const has = inv.dueDate.trim() !== "";
  return {
    id: "due-date",
    label: "Due date is present",
    status: has ? "pass" : "warn",
    message: has ? `Payment is due ${inv.dueDate}.` : "No due date found. Confirm the payment terms with the vendor.",
  };
}

export type DueInfo = { kind: "overdue" | "soon" | "ok" | "none"; days: number };

/** days is negative when overdue. */
export function dueInfo(dueDate: string, today: string): DueInfo {
  if (!dueDate) return { kind: "none", days: 0 };
  const days = daysBetween(today, dueDate);
  if (Number.isNaN(days)) return { kind: "none", days: 0 };
  if (days < 0) return { kind: "overdue", days };
  if (days <= DUE_SOON_DAYS) return { kind: "soon", days };
  return { kind: "ok", days };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function checkDueTiming(inv: Invoice, today: string): Check {
  const base = { id: "due-timing" as const, label: "Payment timing" };
  const info = dueInfo(inv.dueDate, today);
  switch (info.kind) {
    case "none":
      return { ...base, status: "warn", message: "No due date, so we can't tell whether payment is late." };
    case "overdue":
      return { ...base, status: "fail", message: `Overdue by ${plural(-info.days, "day")} (was due ${inv.dueDate}). Pay or contact the vendor.` };
    case "soon":
      return {
        ...base,
        status: "warn",
        message: info.days === 0 ? `Due today (${inv.dueDate}).` : `Due in ${plural(info.days, "day")} (${inv.dueDate}). Approve soon to pay on time.`,
      };
    default:
      return { ...base, status: "pass", message: `Due in ${plural(info.days, "day")} (${inv.dueDate}).` };
  }
}

// ---------- Duplicates and vendors ----------

export function checkDuplicate(inv: Invoice, others: Candidate[]): Check {
  const base = { id: "duplicate" as const, label: "Not a duplicate" };
  const vendor = normalizeVendor(inv.vendor);
  const number = normalizeInvoiceNumber(inv.invoiceNumber);
  if (!vendor) return { ...base, status: "warn", message: "No vendor yet, so duplicates can't be checked." };
  const sameVendor = others.filter((o) => normalizeVendor(o.vendor) === vendor);
  const sameNumber = number ? sameVendor.find((o) => normalizeInvoiceNumber(o.invoiceNumber) === number) : undefined;
  if (sameNumber) {
    return { ...base, status: "fail", message: `Possible duplicate: ${sameNumber.vendor} already sent invoice ${sameNumber.invoiceNumber}. Don't pay it twice.` };
  }
  const sameTotal =
    inv.total === null
      ? undefined
      : sameVendor.find((o) => o.total !== null && o.currency === inv.currency && cents(o.total) === cents(inv.total!));
  if (sameTotal) {
    return {
      ...base,
      status: "warn",
      message: `Same vendor and same total (${formatMoney(inv.total, inv.currency)}) as invoice ${sameTotal.invoiceNumber || "(no number)"}. Check it isn't a re-sent bill.`,
    };
  }
  return { ...base, status: "pass", message: "No earlier invoice has the same vendor and number, or the same vendor and total." };
}

export function checkVendor(inv: Invoice, knownVendors: string[]): Check {
  const base = { id: "vendor" as const, label: "Known vendor" };
  const v = normalizeVendor(inv.vendor);
  if (!v) return { ...base, status: "fail", message: "No vendor name was found." };
  if (knownVendors.some((k) => normalizeVendor(k) === v)) return { ...base, status: "pass", message: `${inv.vendor} is on your approved vendor list.` };
  return {
    ...base,
    status: "warn",
    message: `${inv.vendor} isn't on your vendor list yet. Confirm they're genuine (and check their bank details) before paying.`,
  };
}

// ---------- Tax ----------

export type Country = "UK" | "US" | "CA";

export function countryForCurrency(currency: string): Country | null {
  return ({ GBP: "UK", USD: "US", CAD: "CA" } as Record<string, Country>)[currency.toUpperCase()] ?? null;
}

/** Combined sales-tax ceiling for US invoices. */
export const US_MAX_RATE = 0.11;
/** UK VAT: standard, reduced, zero. */
export const UK_RATES = [0.2, 0.05, 0];
/** Canada: none, GST 5%, GST+PST (SK 11%, BC/MB 12%, QC 14.975%), HST 13% (ON) / 15% (Atlantic). */
export const CA_RATES = [0, 0.05, 0.11, 0.12, 0.13, 0.14975, 0.15];

const pct = (r: number) => `${Math.round(r * 100000) / 1000}%`;
const list = (rates: number[]) => rates.map(pct).join(", ");

export function checkTaxRate(inv: Invoice): Check {
  const base = { id: "tax-rate" as const, label: "Tax rate looks right" };
  const country = countryForCurrency(inv.currency);
  if (inv.subtotal === null || inv.tax === null) return { ...base, status: "warn", message: "Subtotal or tax is missing, so the tax rate can't be checked." };
  if (!country) return { ...base, status: "warn", message: `No tax rules are built in for ${inv.currency || "an unknown currency"}, so the rate wasn't checked.` };
  if (inv.subtotal <= 0 || inv.tax < 0) {
    return inv.tax === 0 && inv.subtotal === 0
      ? { ...base, status: "pass", message: "No tax charged on a zero subtotal." }
      : { ...base, status: "warn", message: "The subtotal or tax is zero or negative (a credit note?), so the rate wasn't checked." };
  }
  const rate = inv.tax / inv.subtotal;
  const slack = Math.max(0.02, inv.subtotal * 0.002); // currency units; covers per-line rounding
  const matches = (r: number) => Math.abs(inv.tax! - inv.subtotal! * r) <= slack;
  const shown = pct(Math.round(rate * 100000) / 100000);

  if (country === "US") {
    if (inv.tax! <= inv.subtotal * US_MAX_RATE + slack) return { ...base, status: "pass", message: `US sales tax of ${shown} is within the usual 0–11% range.` };
    return { ...base, status: "fail", message: `Tax is ${shown} of the subtotal. US sales tax is normally between 0% and 11%.` };
  }
  const allowed = country === "UK" ? UK_RATES : CA_RATES;
  const hit = allowed.find(matches);
  if (hit !== undefined) {
    const name = country === "UK" ? "VAT" : hit === 0.05 ? "GST" : hit === 0.13 || hit === 0.15 ? "HST" : hit === 0 ? "tax" : "GST + PST";
    return { ...base, status: "pass", message: hit === 0 ? "No tax charged, which is allowed for zero-rated or exempt items." : `${pct(hit)} ${name} is a valid rate.` };
  }
  return country === "UK"
    ? { ...base, status: "fail", message: `The VAT charged is ${shown} of the subtotal. UK VAT is 20%, 5% or 0%.` }
    : { ...base, status: "fail", message: `The tax charged is ${shown} of the subtotal. Canadian rates are GST 5%, HST 13% or 15%, or GST + PST (${list([0.11, 0.12, 0.14975])}).` };
}

// ---------- Other ----------

export function checkPoNumber(inv: Invoice): Check {
  const has = inv.poNumber.trim() !== "";
  return {
    id: "po-number",
    label: "PO number present",
    status: has ? "pass" : "warn",
    message: has ? `Matches purchase order ${inv.poNumber}.` : "No purchase-order number on the invoice. Ask the requester which PO this belongs to.",
  };
}

const FIELD_LABEL: Record<FieldName, string> = {
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

export function lowConfidenceFields(conf: Confidence | undefined): FieldName[] {
  if (!conf) return [];
  return (Object.keys(conf) as FieldName[]).filter((k) => typeof conf[k] === "number" && conf[k]! < LOW_CONFIDENCE);
}

export function checkConfidence(conf: Confidence | undefined): Check {
  const low = lowConfidenceFields(conf);
  return {
    id: "confidence",
    label: "AI was confident",
    status: low.length ? "warn" : "pass",
    message: low.length
      ? `The AI wasn't sure about the ${low.map((f) => FIELD_LABEL[f]).join(", ")}. Compare with the document and correct if needed.`
      : "Every field was read with high confidence.",
  };
}

export function checkCoding(category?: string, costCentre?: string): Check {
  const missing = [!category && "category", !costCentre && "cost centre"].filter(Boolean).join(" and ");
  return {
    id: "coding",
    label: "Coded for posting",
    status: missing ? "warn" : "pass",
    message: missing ? `Choose a ${missing} so the bill can be posted to the right account.` : `Coded to ${category} / ${costCentre}.`,
  };
}

export function runChecks(inv: Invoice, ctx: CheckContext): Check[] {
  return [
    checkLineMath(inv),
    checkLinesSum(inv),
    checkTotalSum(inv),
    checkTaxRate(inv),
    checkDueDate(inv),
    checkDueTiming(inv, ctx.today),
    checkDuplicate(inv, ctx.others),
    checkVendor(inv, ctx.knownVendors),
    checkPoNumber(inv),
    checkConfidence(ctx.confidence),
    checkCoding(ctx.category, ctx.costCentre),
  ];
}

export function countIssues(checks: Check[]): number {
  return checks.filter((c) => c.status !== "pass").length;
}

export function worst(checks: Check[]): CheckStatus {
  return checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
}
