export type LineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
};

export type Invoice = {
  vendor: string;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD or ""
  dueDate: string; // YYYY-MM-DD or ""
  currency: string; // ISO 4217 code or ""
  lineItems: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
};

export type CheckId = "line-math" | "lines-sum" | "total-sum" | "due-date";

export type Check = {
  id: CheckId;
  label: string;
  status: "pass" | "warn";
  message: string;
  /** Indexes of line items that fail the line-math check. */
  rows?: number[];
};
