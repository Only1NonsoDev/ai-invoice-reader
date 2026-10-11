// Draws the fake sample invoices (from lib/seed.ts) as SVG files. Run: npm run samples
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatMoney } from "../lib/money";
import { formatDate, todayISO, daysBetween } from "../lib/dates";
import { SEEDS, seedInvoice } from "../lib/seed";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(def: (typeof SEEDS)[number], today: string): string {
  const inv = seedInvoice(def, today);
  const st = def.style;
  const m = (n: number | null) => formatMoney(n, inv.currency);
  const W = 800;
  const H = 880;
  const out: string[] = [];
  const t = (x: number, y: number, text: string, o: { size?: number; weight?: string; fill?: string; anchor?: string; spacing?: number; slot?: [string, string] } = {}) =>
    out.push(
      `<text x="${x}" y="${y}"${o.slot ? ` data-slot="${o.slot[0]}" data-fmt="${o.slot[1]}"` : ""} font-size="${o.size ?? 14}" font-weight="${o.weight ?? "400"}" fill="${o.fill ?? "#1d2433"}" text-anchor="${o.anchor ?? "start"}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ""}>${esc(text)}</text>`,
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
  // Dates carry data-slot markers so the app can rewrite them to match "today" (see lib/previewSvg.ts).
  const meta: [string, string, string?][] = [
    ["Invoice no.", inv.invoiceNumber],
    ["Issue date", formatDate(inv.issueDate, st.dateStyle), "issueDate"],
  ];
  if (inv.dueDate) meta.push(["Due date", formatDate(inv.dueDate, st.dateStyle), "dueDate"]);
  if (inv.poNumber) meta.push(["PO number", inv.poNumber]);
  meta.push(["Currency", inv.currency]);
  out.push(`<line x1="48" y1="150" x2="${W - 48}" y2="150" stroke="#dfe3ea"/>`);
  t(48, 180, "BILL TO", { size: 11, weight: "700", fill: st.accent, spacing: 1.5 });
  st.billTo.forEach((l, i) => t(48, 202 + i * 18, l, { size: 14, weight: i === 0 ? "700" : "400" }));
  meta.forEach(([k, v, slot], i) => {
    t(520, 180 + i * 24, k, { size: 13, fill: "#566074" });
    t(W - 48, 180 + i * 24, v, { size: 13, weight: "700", anchor: "end", slot: slot ? [slot, st.dateStyle] : undefined });
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
    [def.taxLabel, m(inv.tax), false],
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
  if (inv.issueDate && inv.dueDate) {
    t(48, ny, `Payment terms: ${daysBetween(inv.issueDate, inv.dueDate)} days net. ${st.paymentNote}`, { size: 12, fill: "#566074" });
    ny += 22;
  }
  t(48, ny, `Please quote the invoice number with your payment.`, { size: 12, fill: "#566074" });

  // Footer
  out.push(`<line x1="48" y1="${H - 70}" x2="${W - 48}" y2="${H - 70}" stroke="#dfe3ea"/>`);
  t(W / 2, H - 42, st.footer, { size: 11, fill: "#7a8394", anchor: "middle" });
  out.push("</svg>");
  return out.join("\n");
}

const today = todayISO();
const dir = path.join(__dirname, "..", "public", "samples");
mkdirSync(dir, { recursive: true });
for (const def of SEEDS) {
  const file = path.join(dir, path.basename(def.sampleFile));
  writeFileSync(file, render(def, today));
  console.log("wrote", file);
}
