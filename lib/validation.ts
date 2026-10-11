import { cents, formatMoney, roundMoney } from "./money";
import type { Check, Invoice } from "./types";

/** Allowed rounding difference, in cents. */
const TOLERANCE_CENTS = 1;

function close(a: number, b: number): boolean {
  return Math.abs(cents(a) - cents(b)) <= TOLERANCE_CENTS;
}

export function validateInvoice(inv: Invoice): Check[] {
  const money = (n: number | null) => formatMoney(n, inv.currency);
  const checks: Check[] = [];

  // 1. quantity x unit price = amount, per line
  const badRows: number[] = [];
  const incompleteRows: number[] = [];
  inv.lineItems.forEach((li, i) => {
    if (li.quantity === null || li.unitPrice === null || li.amount === null) {
      incompleteRows.push(i);
    } else if (!close(li.quantity * li.unitPrice, li.amount)) {
      badRows.push(i);
    }
  });
  const flagged = [...badRows, ...incompleteRows].sort((a, b) => a - b);
  const rowList = (rows: number[]) => rows.map((r) => r + 1).join(", ");
  let lineMessage = "Every line: quantity × unit price equals the amount.";
  if (inv.lineItems.length === 0) {
    lineMessage = "No line items were found.";
  } else if (badRows.length) {
    lineMessage = `Quantity × unit price does not match the amount on line ${rowList(badRows)}.`;
  } else if (incompleteRows.length) {
    lineMessage = `Line ${rowList(incompleteRows)} is missing a quantity, price or amount.`;
  }
  checks.push({
    id: "line-math",
    label: "Line items multiply correctly",
    status: inv.lineItems.length > 0 && flagged.length === 0 ? "pass" : "warn",
    message: lineMessage,
    rows: flagged,
  });

  // 2. line items sum to subtotal
  const allAmounts = inv.lineItems.length > 0 && inv.lineItems.every((l) => l.amount !== null);
  const sum = roundMoney(inv.lineItems.reduce((s, l) => s + (l.amount ?? 0), 0));
  if (!allAmounts || inv.subtotal === null) {
    checks.push({
      id: "lines-sum",
      label: "Line items add up to subtotal",
      status: "warn",
      message: inv.subtotal === null ? "The subtotal is missing." : "Some line amounts are missing, so the sum can't be checked.",
    });
  } else if (close(sum, inv.subtotal)) {
    checks.push({
      id: "lines-sum",
      label: "Line items add up to subtotal",
      status: "pass",
      message: `Line items total ${money(sum)}, matching the subtotal.`,
    });
  } else {
    checks.push({
      id: "lines-sum",
      label: "Line items add up to subtotal",
      status: "warn",
      message: `Line items total ${money(sum)} but the subtotal says ${money(inv.subtotal)}.`,
    });
  }

  // 3. subtotal + tax = total
  if (inv.subtotal === null || inv.tax === null || inv.total === null) {
    checks.push({
      id: "total-sum",
      label: "Subtotal + tax equals total",
      status: "warn",
      message: "Subtotal, tax or total is missing.",
    });
  } else {
    const expected = roundMoney(inv.subtotal + inv.tax);
    const ok = close(expected, inv.total);
    checks.push({
      id: "total-sum",
      label: "Subtotal + tax equals total",
      status: ok ? "pass" : "warn",
      message: ok
        ? `${money(inv.subtotal)} + ${money(inv.tax)} = ${money(inv.total)}.`
        : `Subtotal + tax is ${money(expected)} but the total says ${money(inv.total)}.`,
    });
  }

  // 4. due date present
  const hasDue = inv.dueDate.trim() !== "";
  checks.push({
    id: "due-date",
    label: "Due date is present",
    status: hasDue ? "pass" : "warn",
    message: hasDue ? `Payment is due ${inv.dueDate}.` : "No due date found. Confirm the payment terms with the vendor.",
  });

  return checks;
}

export function countWarnings(checks: Check[]): number {
  return checks.filter((c) => c.status === "warn").length;
}
