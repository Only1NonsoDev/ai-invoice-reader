import { toNumber } from "./money";
import type { Invoice, LineItem } from "./types";

export class ParseError extends Error {}

/** Pull the first JSON object out of model text (plain, fenced, or surrounded by chatter). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const balanced = firstBalancedObject(trimmed);
  if (balanced) candidates.push(balanced);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  throw new ParseError("The model's reply wasn't valid JSON. Try again, or try a clearer scan.");
}

function firstBalancedObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

const SYMBOLS: Record<string, string> = { "£": "GBP", "$": "USD", "€": "EUR", "C$": "CAD", "CA$": "CAD" };

export function normalizeCurrency(v: unknown): string {
  const s = str(v);
  if (/^[a-z]{3}$/i.test(s)) return s.toUpperCase();
  return SYMBOLS[s] ?? "";
}

/** Accept YYYY-MM-DD, or anything Date can read unambiguously; else "". */
export function normalizeDate(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const pad = (n: string) => n.padStart(2, "0");
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const t = Date.parse(`${s} UTC`);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

function parseLine(raw: unknown): LineItem | null {
  if (!isObj(raw)) return null;
  return {
    description: str(pick(raw, "description", "name", "item")),
    quantity: toNumber(pick(raw, "quantity", "qty")),
    unitPrice: toNumber(pick(raw, "unitPrice", "unit_price", "price", "rate")),
    amount: toNumber(pick(raw, "amount", "total", "line_total", "lineTotal")),
  };
}

/** Turn model output (string or already-parsed value) into a clean Invoice. */
export function parseInvoice(output: unknown): Invoice {
  const data = typeof output === "string" ? extractJson(output) : output;
  if (!isObj(data)) throw new ParseError("The model's reply didn't look like an invoice.");
  const rawItems = pick(data, "lineItems", "line_items", "items");
  const lineItems = Array.isArray(rawItems)
    ? rawItems.map(parseLine).filter((l): l is LineItem => l !== null)
    : [];
  const invoice: Invoice = {
    vendor: str(pick(data, "vendor", "vendor_name", "supplier", "seller")),
    invoiceNumber: str(pick(data, "invoiceNumber", "invoice_number", "number", "invoice_no")),
    issueDate: normalizeDate(pick(data, "issueDate", "issue_date", "date", "invoice_date")),
    dueDate: normalizeDate(pick(data, "dueDate", "due_date")),
    currency: normalizeCurrency(pick(data, "currency")),
    lineItems,
    subtotal: toNumber(pick(data, "subtotal", "sub_total")),
    tax: toNumber(pick(data, "tax", "tax_total", "vat")),
    total: toNumber(pick(data, "total", "grand_total", "amount_due")),
  };
  const empty = !invoice.vendor && !invoice.invoiceNumber && lineItems.length === 0 && invoice.total === null;
  if (empty) throw new ParseError("No invoice details were found in that file. Is it an invoice?");
  return invoice;
}
