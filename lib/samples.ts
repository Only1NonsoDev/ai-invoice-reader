import type { Invoice } from "./types";

export type Sample = {
  id: "uk" | "us" | "ca";
  title: string;
  blurb: string;
  file: string; // path under /public
  invoice: Invoice;
};

/**
 * Precomputed extraction results for the built-in sample invoices.
 * scripts/generate-samples.ts draws the SVGs from this same data, so the
 * picture and the "extracted" values always agree.
 */
export const SAMPLES: Sample[] = [
  {
    id: "uk",
    title: "UK supplier",
    blurb: "GBP · VAT 20%",
    file: "samples/uk-supplier.svg",
    invoice: {
      vendor: "Brightwell Stationery Supplies Ltd",
      invoiceNumber: "BW-2025-0418",
      issueDate: "2025-03-03",
      dueDate: "2025-04-02",
      currency: "GBP",
      lineItems: [
        { description: "A4 copier paper, 5-ream case", quantity: 12, unitPrice: 23.5, amount: 282 },
        { description: "Black ink cartridge XL", quantity: 6, unitPrice: 18.75, amount: 112.5 },
        { description: "Lever arch binders", quantity: 40, unitPrice: 1.85, amount: 74 },
        { description: "Next-day delivery", quantity: 1, unitPrice: 9.5, amount: 9.5 },
      ],
      subtotal: 478,
      tax: 95.6,
      total: 573.6,
    },
  },
  {
    id: "us",
    title: "US SaaS bill",
    blurb: "USD · sales tax 8.25%",
    file: "samples/us-saas.svg",
    invoice: {
      vendor: "Northwind Cloud Analytics, Inc.",
      invoiceNumber: "INV-30871",
      issueDate: "2025-06-01",
      dueDate: "2025-06-30",
      currency: "USD",
      lineItems: [
        { description: "Team plan, per seat (June)", quantity: 25, unitPrice: 12, amount: 300 },
        { description: "API usage overage", quantity: 1, unitPrice: 84.5, amount: 84.5 },
        { description: "Premium support", quantity: 1, unitPrice: 150, amount: 150 },
        { description: "Extended data retention add-on", quantity: 3, unitPrice: 20, amount: 60 },
      ],
      subtotal: 594.5,
      tax: 49.05,
      total: 643.55,
    },
  },
  {
    id: "ca",
    title: "Canadian contractor",
    blurb: "CAD · HST 13% · no due date",
    file: "samples/ca-contractor.svg",
    invoice: {
      vendor: "Maple & Pine Renovations Inc.",
      invoiceNumber: "MP-1192",
      issueDate: "2025-05-14",
      dueDate: "",
      currency: "CAD",
      lineItems: [
        { description: "Site preparation, labour (hrs)", quantity: 18, unitPrice: 65, amount: 1170 },
        { description: "Drywall installation (hrs)", quantity: 32, unitPrice: 70, amount: 2240 },
        { description: "Materials and fasteners", quantity: 1, unitPrice: 845.3, amount: 845.3 },
        { description: "Municipal permit fee", quantity: 1, unitPrice: 120, amount: 120 },
      ],
      subtotal: 4375.3,
      tax: 568.79,
      total: 4944.09,
    },
  },
];
