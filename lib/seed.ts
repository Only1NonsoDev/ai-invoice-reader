import { DEFAULT_KNOWN_VENDORS } from "./coding";
import { addDays, todayISO } from "./dates";
import { formatMoney, roundMoney } from "./money";
import { rebaseSeedDates, reconcile } from "./state";
import type { AppState, Confidence, Invoice, InvoiceRecord, LineItem } from "./types";
import { ACTOR, DEFAULT_SETTINGS, entry } from "./workflow";

type Line = [description: string, quantity: number, unitPrice: number];

export type SeedStyle = {
  accent: string;
  font: string;
  address: string[];
  billTo: string[];
  dateStyle: "dmy" | "mdy";
  footer: string;
  paymentNote: string;
};

type SeedDef = {
  id: string;
  fileName: string;
  sampleFile: string;
  /** Why this invoice is in the demo. Shown in the README, not the UI. */
  scenario: string;
  vendor: string;
  invoiceNumber: string;
  poNumber: string;
  currency: "GBP" | "USD" | "CAD";
  issueOffset: number;
  dueOffset: number;
  lines: Line[];
  taxRate: number;
  taxLabel: string;
  category: string;
  costCentre: string;
  /** Hours before "now" that it arrived. */
  receivedHoursAgo: number;
  confidence?: Confidence;
  /** Overrides applied after the numbers are worked out, to create deliberate maths errors. */
  printed?: { lineAmounts?: (number | null)[]; total?: number };
  decided?: { status: "approved" | "needs_manager" | "flagged"; hoursAgo: number; note?: string };
  style: SeedStyle;
};

const UK: SeedStyle = {
  accent: "#1f4e8c",
  font: "Georgia, 'Times New Roman', serif",
  address: [],
  billTo: ["Harcourt & Daughters Solicitors", "12 Albion Street", "Manchester M1 4BT"],
  dateStyle: "dmy",
  footer: "",
  paymentNote: "Bank transfer to Sort 40-22-17, Acc 5530 1294.",
};
const US: SeedStyle = {
  accent: "#5b3fd6",
  font: "Helvetica, Arial, sans-serif",
  address: [],
  billTo: ["Lumen Coffee Roasters LLC", "88 Pine Hollow Rd", "Portland, OR 97205"],
  dateStyle: "mdy",
  footer: "",
  paymentNote: "Pay online or by ACH. Questions? billing@example.test",
};
const CA: SeedStyle = {
  accent: "#a3361f",
  font: "Verdana, Geneva, sans-serif",
  address: [],
  billTo: ["Dr. Priya Raman", "340 Elm Crescent", "Kitchener, ON N2G 1X8"],
  dateStyle: "mdy",
  footer: "",
  paymentNote: "Cheque or e-transfer accepted.",
};

const s = (base: SeedStyle, o: Partial<SeedStyle>): SeedStyle => ({ ...base, ...o });

export const SEEDS: SeedDef[] = [
  {
    id: "inv-001",
    fileName: "brightwell-BW-26-0731.pdf",
    sampleFile: "samples/inv-001-brightwell.svg",
    scenario: "Clean UK invoice: every check passes, so it arrives as New.",
    vendor: "Brightwell Stationery Supplies Ltd",
    invoiceNumber: "BW-26-0731",
    poNumber: "PO-4471",
    currency: "GBP",
    issueOffset: -9,
    dueOffset: 21,
    lines: [["A4 copier paper, 5-ream case", 12, 23.5], ["Black ink cartridge XL", 6, 18.75], ["Lever arch binders", 40, 1.85], ["Next-day delivery", 1, 9.5]],
    taxRate: 0.2,
    taxLabel: "VAT (20%)",
    category: "Office Supplies",
    costCentre: "Admin",
    receivedHoursAgo: 20,
    style: s(UK, { accent: "#1f4e8c", address: ["Unit 4, Hartley Trading Estate", "Leeds LS12 6QP, United Kingdom", "VAT Reg. GB 284 7719 03"], footer: "Brightwell Stationery Supplies Ltd · Registered in England No. 07749215" }),
  },
  {
    id: "inv-002",
    fileName: "northwind-INV-30871.pdf",
    sampleFile: "samples/inv-002-northwind.svg",
    scenario: "US SaaS bill due in 4 days (due-soon highlight).",
    vendor: "Northwind Cloud Analytics, Inc.",
    invoiceNumber: "INV-30871",
    poNumber: "PO-4502",
    currency: "USD",
    issueOffset: -26,
    dueOffset: 4,
    lines: [["Team plan, per seat", 25, 12], ["API usage overage", 1, 84.5], ["Premium support", 1, 150], ["Extended data retention add-on", 3, 20]],
    taxRate: 0.0825,
    taxLabel: "Sales tax (8.25%)",
    category: "Software & Subscriptions",
    costCentre: "Engineering",
    receivedHoursAgo: 90,
    style: s(US, { address: ["500 Harbor View Dr, Suite 210", "Seattle, WA 98101, USA", "EIN 91-4402815"], footer: "Thank you for your business · billing@northwind-analytics.example" }),
  },
  {
    id: "inv-003",
    fileName: "maple-pine-MP-1192.pdf",
    sampleFile: "samples/inv-003-maple-pine.svg",
    scenario: "CAD invoice over the 5,000 threshold: Approve routes it to manager approval.",
    vendor: "Maple & Pine Renovations Inc.",
    invoiceNumber: "MP-1192",
    poNumber: "PO-4390",
    currency: "CAD",
    issueOffset: -6,
    dueOffset: 24,
    lines: [["Site preparation, labour (hrs)", 18, 65], ["Drywall installation (hrs)", 32, 70], ["Materials and fasteners", 1, 3185.4], ["Municipal permit fee", 1, 120]],
    taxRate: 0.13,
    taxLabel: "HST (13%)",
    category: "Repairs & Maintenance",
    costCentre: "Facilities",
    receivedHoursAgo: 40,
    decided: { status: "needs_manager", hoursAgo: 28 },
    style: s(CA, { address: ["27 Birchmount Lane", "Guelph, ON N1H 6J2, Canada", "HST/GST No. 81234 5678 RT0001"], footer: "Maple & Pine Renovations Inc. · 5-year workmanship warranty on all labour" }),
  },
  {
    id: "inv-004",
    fileName: "hartley-HF-7731.pdf",
    sampleFile: "samples/inv-004-hartley.svg",
    scenario: "The original of the duplicate pair. Already approved, so the Export page has something to export.",
    vendor: "Hartley Office Furniture Ltd",
    invoiceNumber: "HF-7731",
    poNumber: "PO-4410",
    currency: "GBP",
    issueOffset: -20,
    dueOffset: 10,
    lines: [["Ergonomic task chair", 4, 189], ["Height-adjustable desk", 2, 345], ["Delivery and assembly", 1, 60]],
    taxRate: 0.2,
    taxLabel: "VAT (20%)",
    category: "Equipment & Furniture",
    costCentre: "Operations",
    receivedHoursAgo: 150,
    decided: { status: "approved", hoursAgo: 70 },
    style: s(UK, { accent: "#2b6b4f", address: ["18 Canal Wharf", "Birmingham B1 2JT, United Kingdom", "VAT Reg. GB 311 5502 88"], footer: "Hartley Office Furniture Ltd · Registered in England No. 05512093" }),
  },
  {
    id: "inv-005",
    fileName: "hartley-HF-7731-reminder.pdf",
    sampleFile: "samples/inv-005-hartley-duplicate.svg",
    scenario: "Duplicate: same vendor and invoice number as inv-004 (re-sent as a reminder).",
    vendor: "Hartley Office Furniture Ltd",
    invoiceNumber: "HF-7731",
    poNumber: "PO-4410",
    currency: "GBP",
    issueOffset: -20,
    dueOffset: 10,
    lines: [["Ergonomic task chair", 4, 189], ["Height-adjustable desk", 2, 345], ["Delivery and assembly", 1, 60]],
    taxRate: 0.2,
    taxLabel: "VAT (20%)",
    category: "Equipment & Furniture",
    costCentre: "Operations",
    receivedHoursAgo: 8,
    style: s(UK, { accent: "#2b6b4f", address: ["18 Canal Wharf", "Birmingham B1 2JT, United Kingdom", "VAT Reg. GB 311 5502 88"], footer: "REMINDER · Hartley Office Furniture Ltd · Registered in England No. 05512093" }),
  },
  {
    id: "inv-006",
    fileName: "kestrel-KPS-2209.png",
    sampleFile: "samples/inv-006-kestrel.svg",
    scenario: "New vendor not on the known list, plus a low-confidence total and due date (a blurry scan).",
    vendor: "Kestrel Print & Signage",
    invoiceNumber: "KPS-2209",
    poNumber: "PO-4518",
    currency: "GBP",
    issueOffset: -5,
    dueOffset: 25,
    lines: [["Event banners, 2m", 6, 42.5], ["Roll-up stands", 2, 89], ["Artwork set-up", 1, 60]],
    taxRate: 0.2,
    taxLabel: "VAT (20%)",
    category: "Marketing & Advertising",
    costCentre: "Marketing",
    receivedHoursAgo: 14,
    confidence: { vendor: 0.78, total: 0.64, dueDate: 0.72 },
    style: s(UK, { accent: "#b4501f", font: "Trebuchet MS, Verdana, sans-serif", address: ["Unit 9, Kingfisher Court", "Bristol BS3 4QD, United Kingdom", "VAT Reg. GB 402 1187 55"], footer: "Kestrel Print & Signage · Large-format printing since 2011" }),
  },
  {
    id: "inv-007",
    fileName: "greenfield-GFS-10442.pdf",
    sampleFile: "samples/inv-007-greenfield.svg",
    scenario: "Overdue by 12 days (overdue highlight).",
    vendor: "Greenfield Facilities Services Ltd",
    invoiceNumber: "GFS-10442",
    poNumber: "PO-4311",
    currency: "GBP",
    issueOffset: -47,
    dueOffset: -12,
    lines: [["Monthly office cleaning", 1, 640], ["Window cleaning", 1, 120], ["Consumables restock", 1, 58.5]],
    taxRate: 0.2,
    taxLabel: "VAT (20%)",
    category: "Facilities & Cleaning",
    costCentre: "Facilities",
    receivedHoursAgo: 260,
    style: s(UK, { accent: "#3d7a2a", address: ["3 Meadow Lane", "Reading RG1 8PL, United Kingdom", "VAT Reg. GB 530 9041 27"], footer: "Greenfield Facilities Services Ltd · Late payments incur interest under the Late Payment Act" }),
  },
  {
    id: "inv-008",
    fileName: "tessellate-TD-0914.pdf",
    sampleFile: "samples/inv-008-tessellate.svg",
    scenario: "Wrong UK VAT rate: 15% charged, which is not a UK rate.",
    vendor: "Tessellate Digital Ltd",
    invoiceNumber: "TD-0914",
    poNumber: "PO-4466",
    currency: "GBP",
    issueOffset: -12,
    dueOffset: 18,
    lines: [["Website maintenance retainer", 1, 950], ["Hosting and CDN", 1, 180]],
    taxRate: 0.15,
    taxLabel: "VAT (15%)",
    category: "Software & Subscriptions",
    costCentre: "Marketing",
    receivedHoursAgo: 100,
    style: s(UK, { accent: "#0f7a8a", font: "Helvetica, Arial, sans-serif", address: ["Studio 2, The Foundry", "Manchester M4 5HX, United Kingdom", "VAT Reg. GB 288 3310 64"], footer: "Tessellate Digital Ltd · hello@tessellate.example" }),
  },
  {
    id: "inv-009",
    fileName: "redwood-RW-55281.pdf",
    sampleFile: "samples/inv-009-redwood.svg",
    scenario: "Missing PO number (everything else is fine).",
    vendor: "Redwood Office Supply Co.",
    invoiceNumber: "RW-55281",
    poNumber: "",
    currency: "USD",
    issueOffset: -4,
    dueOffset: 26,
    lines: [["Anti-fatigue standing mats", 10, 34.9], ["Whiteboards, 4x3 ft", 3, 78], ["Dry-erase markers, box", 12, 4.25]],
    taxRate: 0.07,
    taxLabel: "Sales tax (7%)",
    category: "Office Supplies",
    costCentre: "Admin",
    receivedHoursAgo: 5,
    style: s(US, { accent: "#a33a2a", address: ["1200 Alder Street", "Denver, CO 80202, USA", "EIN 84-2210934"], footer: "Redwood Office Supply Co. · Free shipping over $250" }),
  },
  {
    id: "inv-010",
    fileName: "lakeside-LC-8830.jpg",
    sampleFile: "samples/inv-010-lakeside.svg",
    scenario: "Maths mismatch: line 1 is 24 x 18.50 but prints 464.00, and the total doesn't add up. Flagged for the vendor to correct.",
    vendor: "Lakeside Catering Co.",
    invoiceNumber: "LC-8830",
    poNumber: "PO-4521",
    currency: "CAD",
    issueOffset: -15,
    dueOffset: 15,
    lines: [["Team lunch, per head", 24, 18.5], ["Coffee and tea service", 2, 65], ["Set-up fee", 1, 40]],
    taxRate: 0.05,
    taxLabel: "GST (5%)",
    category: "Meals & Entertainment",
    costCentre: "Sales",
    receivedHoursAgo: 120,
    printed: { lineAmounts: [464, null, null], total: 685.7 },
    decided: { status: "flagged", hoursAgo: 96, note: "Catering total doesn't add up. Asked the vendor for a corrected invoice." },
    style: s(CA, { accent: "#256d85", address: ["5 Harbourfront Rd", "Toronto, ON M5J 1B6, Canada", "GST No. 77001 2233 RT0001"], footer: "Lakeside Catering Co. · Thank you for choosing us" }),
  },
];

/** The invoice as printed on the document, including any deliberate errors. */
export function seedInvoice(def: SeedDef, today: string): Invoice {
  const lineItems: LineItem[] = def.lines.map(([description, quantity, unitPrice], i) => ({
    description,
    quantity,
    unitPrice,
    amount: def.printed?.lineAmounts?.[i] ?? roundMoney(quantity * unitPrice),
  }));
  const subtotal = roundMoney(lineItems.reduce((sum, l) => sum + (l.amount ?? 0), 0));
  const tax = roundMoney(subtotal * def.taxRate);
  return {
    vendor: def.vendor,
    invoiceNumber: def.invoiceNumber,
    poNumber: def.poNumber,
    issueDate: addDays(today, def.issueOffset),
    dueDate: addDays(today, def.dueOffset),
    currency: def.currency,
    lineItems,
    subtotal,
    tax,
    total: def.printed?.total ?? roundMoney(subtotal + tax),
  };
}

function defaultConfidence(def: SeedDef): Confidence {
  const c: Confidence = { vendor: 0.98, invoiceNumber: 0.97, poNumber: def.poNumber ? 0.95 : 0.9, issueDate: 0.96, dueDate: 0.95, currency: 0.99, subtotal: 0.97, tax: 0.96, total: 0.98 };
  return { ...c, ...def.confidence };
}

export function buildSeed(now: Date = new Date()): AppState {
  const today = todayISO(now);
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);
  const invoices: InvoiceRecord[] = SEEDS.map((def) => {
    const received = at(def.receivedHoursAgo);
    const log = [entry("extracted", "Extracted by AI (demo data: no API call was made).", received, "AI")];
    log.push(entry("system", `Suggested category "${def.category}" and cost centre "${def.costCentre}".`, received, "AI"));
    const rec: InvoiceRecord = {
      id: def.id,
      fileName: def.fileName,
      source: "sample",
      sampleFile: def.sampleFile,
      previewUrl: null,
      load: "ready",
      status: "new",
      data: seedInvoice(def, today),
      confidence: defaultConfidence(def),
      category: def.category,
      costCentre: def.costCentre,
      notes: "",
      approval: null,
      log,
      receivedAt: received.toISOString(),
      dateOffsets: { issueDate: def.issueOffset, dueDate: def.dueOffset },
    };
    const d = def.decided;
    if (!d) return rec;
    const when = at(d.hoursAgo);
    if (d.status === "flagged") {
      return {
        ...rec,
        status: "flagged",
        approval: { by: ACTOR, decision: "flagged", note: d.note ?? "", at: when.toISOString() },
        log: [...log, entry("decision", `Flagged by ${ACTOR}: "${d.note}"`, when)],
      };
    }
    if (d.status === "needs_manager") {
      return {
        ...rec,
        status: "needs_manager",
        approval: { by: ACTOR, decision: "approved", note: "", at: when.toISOString() },
        log: [...log, entry("decision", `Approved by ${ACTOR}. It is above the ${formatMoney(DEFAULT_SETTINGS.threshold, def.currency)} threshold, so it now needs manager approval.`, when)],
      };
    }
    return {
      ...rec,
      status: "approved",
      approval: { by: ACTOR, decision: "approved", note: "", at: when.toISOString() },
      log: [...log, entry("decision", `Approved by ${ACTOR}.`, when)],
    };
  });
  const settings = { ...DEFAULT_SETTINGS, knownVendors: [...DEFAULT_KNOWN_VENDORS] };
  return { invoices: reconcile(rebaseSeedDates(invoices, today), settings, today), settings };
}
