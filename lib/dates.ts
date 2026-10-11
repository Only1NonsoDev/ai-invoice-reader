const pad = (n: number) => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD in the user's local time zone. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string, style: "dmy" | "mdy" = "dmy"): string {
  if (!isISODate(iso)) return iso || "—";
  const [y, m, d] = iso.split("-").map(Number);
  return style === "dmy" ? `${pad(d)} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  return `${formatDate(todayISO(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
