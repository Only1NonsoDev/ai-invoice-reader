import { formatDate, isISODate } from "./dates";

/**
 * Sample invoice SVGs mark their dates like <text data-slot="dueDate" data-fmt="dmy">…</text>.
 * Seed dates move with "today", so we rewrite those slots to match the invoice before showing it.
 * Opened directly, the file still shows dates as of the day it was generated.
 */
export function rebaseSvgDates(svg: string, dates: { issueDate?: string; dueDate?: string }): string {
  return svg.replace(
    /(<text\b[^>]*\bdata-slot="(issueDate|dueDate)"[^>]*\bdata-fmt="(dmy|mdy)"[^>]*>)([^<]*)(<\/text>)/g,
    (whole, open: string, slot: "issueDate" | "dueDate", fmt: "dmy" | "mdy", _old: string, close: string) => {
      const iso = dates[slot];
      return iso && isISODate(iso) ? `${open}${formatDate(iso, fmt)}${close}` : whole;
    },
  );
}
