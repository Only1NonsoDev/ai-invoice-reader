// Draws the three fake sample invoices as SVG files. Run: npm run samples
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatMoney } from "../lib/money";
import { SAMPLES } from "../lib/samples";

type Style = {
  accent: string;
  font: string;
  address: string[];
  billTo: string[];
  taxLabel: string;
  taxId: string;
  terms?: string;
  footer: string;
  dateFmt: (iso: string) => string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
const mdy = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

const STYLES: Record<string, Style> = {
  uk: {
    accent: "#1f4e8c",
    font: "Georgia, 'Times New Roman', serif",
    address: ["Unit 4, Hartley Trading Estate", "Leeds LS12 6QP, United Kingdom", "VAT Reg. GB 284 7719 03"],
    billTo: ["Harcourt & Daughters Solicitors", "12 Albion Street", "Manchester M1 4BT"],
    taxLabel: "VAT (20%)",
    taxId: "VAT",
    terms: "Payment terms: 30 days net. Bank transfer to Sort 40-22-17, Acc 5530 1294.",
    footer: "Brightwell Stationery Supplies Ltd · Registered in England No. 07749215",
    dateFmt: dmy,
  },
  us: {
    accent: "#5b3fd6",
    font: "Helvetica, Arial, sans-serif",
    address: ["500 Harbor View Dr, Suite 210", "Seattle, WA 98101, USA", "EIN 91-4402815"],
    billTo: ["Lumen Coffee Roasters LLC", "88 Pine Hollow Rd", "Portland, OR 97205"],
    taxLabel: "Sales tax (8.25%)",
    taxId: "Tax",
    terms: "Net 30. Pay online at billing.northwind-analytics.example",
    footer: "Thank you for your business · Questions? billing@northwind-analytics.example",
    dateFmt: mdy,
  },
  ca: {
    accent: "#a3361f",
    font: "Verdana, Geneva, sans-serif",
    address: ["27 Birchmount Lane", "Guelph, ON N1H 6J2, Canada", "HST/GST No. 81234 5678 RT0001"],
    billTo: ["Dr. Priya Raman", "340 Elm Crescent", "Kitchener, ON N2G 1X8"],
    taxLabel: "HST (13%)",
    taxId: "HST",
    footer: "Maple & Pine Renovations Inc. · 5-year workmanship warranty on all labour",
    dateFmt: mdy,
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(id: string): string {
  const sample = SAMPLES.find((s) => s.id === id)!;
  const inv = sample.invoice;
  const st = STYLES[id];
  const m = (n: number | null) => formatMoney(n, inv.currency);
  const W = 800;
  const H = 880;
  const out: string[] = [];
  const t = (x: number, y: number, text: string, o: { size?: number; weight?: string; fill?: string; anchor?: string; spacing?: number } = {}) =>
    out.push(
      `<text x="${x}" y="${y}" font-size="${o.size ?? 14}" font-weight="${o.weight ?? "400"}" fill="${o.fill ?? "#1d2433"}" text-anchor="${o.anchor ?? "start"}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ""}>${esc(text)}</text>`,
    );

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${st.font}" role="img" aria-label="Sample invoice ${esc(inv.invoiceNumber)} from ${esc(inv.vendor)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<rect width="${W}" height="10" fill="${st.accent}"/>`);

  // Letterhead
  out.push(`<rect x="48" y="48" width="44" height="44" rx="10" fill="${st.accent}"/>`);
  t(70, 78, inv.vendor[0], { size: 26, weight: "700", fill: "#fff", anchor: "middle" });
  t(104, 66, inv.vendor, { size: 19, weight: "700" });
  st.address.forEach((l, i) => t(104, 86 + i * 16, l, { size: 12, fill: "#566074" }));
  t(W - 48, 74, "INVOICE", { size: 32, weight: "700", fill: st.accent, anchor: "end", spacing: 3 });

  // Meta block
  const meta: [string, string][] = [
    ["Invoice no.", inv.invoiceNumber],
    ["Issue date", st.dateFmt(inv.issueDate)],
  ];
  if (inv.dueDate) meta.push(["Due date", st.dateFmt(inv.dueDate)]);
  meta.push(["Currency", inv.currency]);
  out.push(`<line x1="48" y1="150" x2="${W - 48}" y2="150" stroke="#dfe3ea"/>`);
  t(48, 180, "BILL TO", { size: 11, weight: "700", fill: st.accent, spacing: 1.5 });
  st.billTo.forEach((l, i) => t(48, 202 + i * 18, l, { size: 14, weight: i === 0 ? "700" : "400" }));
  meta.forEach(([k, v], i) => {
    t(520, 180 + i * 24, k, { size: 13, fill: "#566074" });
    t(W - 48, 180 + i * 24, v, { size: 13, weight: "700", anchor: "end" });
  });

  // Table
  const top = 300;
  out.push(`<rect x="48" y="${top}" width="${W - 96}" height="34" fill="${st.accent}"/>`);
  const cols = { desc: 60, qty: 480, unit: 600, amt: W - 60 };
  t(cols.desc, top + 22, "DESCRIPTION", { size: 11, weight: "700", fill: "#fff", spacing: 1 });
  t(cols.qty, top + 22, "QTY", { size: 11, weight: "700", fill: "#fff", anchor: "end", spacing: 1 });
  t(cols.unit, top + 22, "UNIT PRICE", { size: 11, weight: "700", fill: "#fff", anchor: "end", spacing: 1 });
  t(cols.amt, top + 22, "AMOUNT", { size: 11, weight: "700", fill: "#fff", anchor: "end", spacing: 1 });
  inv.lineItems.forEach((li, i) => {
    const y = top + 34 + i * 44;
    if (i % 2 === 1) out.push(`<rect x="48" y="${y}" width="${W - 96}" height="44" fill="#f5f7fa"/>`);
    t(cols.desc, y + 27, li.description, { size: 14 });
    t(cols.qty, y + 27, String(li.quantity), { size: 14, anchor: "end" });
    t(cols.unit, y + 27, m(li.unitPrice), { size: 14, anchor: "end" });
    t(cols.amt, y + 27, m(li.amount), { size: 14, anchor: "end", weight: "700" });
  });
  const endY = top + 34 + inv.lineItems.length * 44;
  out.push(`<line x1="48" y1="${endY}" x2="${W - 48}" y2="${endY}" stroke="#dfe3ea"/>`);

  // Totals
  const tx = 520;
  const rows: [string, string, boolean][] = [
    ["Subtotal", m(inv.subtotal), false],
    [st.taxLabel, m(inv.tax), false],
  ];
  rows.forEach(([k, v], i) => {
    t(tx, endY + 34 + i * 26, k, { size: 14, fill: "#566074" });
    t(W - 60, endY + 34 + i * 26, v, { size: 14, anchor: "end" });
  });
  const totY = endY + 34 + rows.length * 26 + 6;
  out.push(`<rect x="${tx - 14}" y="${totY - 24}" width="${W - 48 - tx + 14}" height="42" fill="${st.accent}" opacity="0.1"/>`);
  t(tx, totY + 4, "Total", { size: 16, weight: "700" });
  t(W - 60, totY + 4, m(inv.total), { size: 18, weight: "700", anchor: "end", fill: st.accent });

  // Notes
  let ny = totY + 70;
  if (st.terms) {
    t(48, ny, st.terms, { size: 12, fill: "#566074" });
    ny += 22;
  }
  t(48, ny, "Please quote the invoice number with your payment.", { size: 12, fill: "#566074" });

  // Footer
  out.push(`<line x1="48" y1="${H - 70}" x2="${W - 48}" y2="${H - 70}" stroke="#dfe3ea"/>`);
  t(W / 2, H - 42, st.footer, { size: 11, fill: "#7a8394", anchor: "middle" });
  out.push("</svg>");
  return out.join("\n");
}

const dir = path.join(__dirname, "..", "public", "samples");
mkdirSync(dir, { recursive: true });
for (const s of SAMPLES) {
  const file = path.join(dir, path.basename(s.file));
  writeFileSync(file, render(s.id));
  console.log("wrote", file);
}
