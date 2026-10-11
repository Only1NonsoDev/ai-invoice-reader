/** Convert to whole cents so we never compare floats directly. */
export function cents(n: number): number {
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function roundMoney(n: number): number {
  return cents(n) / 100;
}

export function formatMoney(n: number | null, currency: string): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (/^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
    } catch {
      // unknown currency code: fall through
    }
  }
  return n.toFixed(2);
}

/** Lenient number reader for model output: "$1,234.50", "1.234,50", "(12.00)", 12. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/^[^\d(-]+/, ""));
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    s = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    // "12,50" is a decimal comma, "1,250" or "1,250,000" are thousands
    s = /,\d{1,2}$/.test(s) && s.indexOf(",") === lastComma ? s.replace(",", ".") : s.split(",").join("");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
