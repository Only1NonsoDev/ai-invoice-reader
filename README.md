# Invoice Desk: an AI accounts payable demo

A portfolio demo of a small-business **accounts payable (AP)** workflow. Invoices arrive in an inbox, an AI model reads them, the app checks them and explains any problems, a person approves or rejects them, and only approved invoices can be exported to QuickBooks Online or Xero.

> **Portfolio demo: all invoices, vendors and data are fictional.** Nothing is sent to QuickBooks, Xero or any bank.

It is a fully static site (Next.js 15, React 19, TypeScript, `output: "export"`). There is no server, API route or database.

## The workflow

**Capture → Extract → Check → Approve → Export**

1. **Capture.** Ten fictional sample invoices (UK in GBP, US in USD, Canada in CAD) are already in the inbox. With your own AI key you can also drop in several PDFs or photos at once; each file becomes its own queue item with its own loading and error state.
2. **Extract.** A vision model reads vendor, invoice and PO number, dates, line items and totals, plus how confident it is in each field. The samples use precomputed results, so no key is needed.
3. **Check.** Pure functions re-do the work and explain each result in plain English (pass, warning or fail):
   - line maths (quantity × price = amount), lines add up to the subtotal, subtotal + tax = total
   - due date present; overdue or due within 7 days
   - duplicates (same vendor + invoice number, or same vendor + same total)
   - unknown vendor (not on the known-vendor list in Settings)
   - tax rate sanity: UK VAT 20% / 5% / 0; Canada GST 5%, HST 13% / 15%, or GST + PST; US sales tax 0–11%
   - PO number missing; any field under 80% confidence; category and cost centre chosen
4. **Approve.** Approve, Flag or Reject. Flag and Reject need a reason. If the total is above the threshold (default 5,000, in the invoice's own currency) Approve moves it to **Needs manager approval**, and **Approve as manager** finishes it. Every decision records who, what, the note and the time, and each invoice has an activity log (for example "Extracted by AI", "Edited total from 573.6 to 600", "Approved by You").
5. **Export.** Only **Approved** invoices export. After a download they become **Exported** (and the log says so).

Statuses: New, Needs review, Needs manager approval, Approved, Flagged, Rejected, Exported.

The sample set deliberately includes a duplicate, an unknown vendor, an overdue bill, one due in 4 days, a wrong UK VAT rate, a missing PO, a maths mismatch, one over the threshold and a low-confidence field. Seed due dates are stored as day offsets and recomputed against today's date, so "overdue" and "due soon" always look right.

## Screens

- **Inbox:** status filter tabs, search, sort, due-soon / overdue highlighting, batch upload.
- **Review:** the document next to editable fields (stacked on a phone), a confidence indicator per field, category and cost-centre dropdowns, notes, checks, and the activity log.
- **Dashboard:** total to pay this week grouped by currency (never converted or added together), overdue and pending counts, amount by vendor and by category, and a **time-saved estimate** with editable assumptions (default 4 minutes by hand vs 30 seconds to review). It is an estimate, not a measurement.
- **Export:** QuickBooks CSV, Xero CSV, JSON, with an empty state when nothing is approved.
- **Settings / How it works:** approval threshold, known vendors, AI provider and key, **Reset demo**.

## Export formats

| File | Columns (one row per line item) |
| --- | --- |
| QuickBooks Online bill CSV | `BillNo, Supplier, BillDate, DueDate, Terms, Location, Memo, Account, LineDescription, LineAmount, LineTaxCode, Currency` |
| Xero bills CSV | `*ContactName, EmailAddress, *InvoiceNumber, Reference, *InvoiceDate, *DueDate, Total, Description, *Quantity, *UnitAmount, *AccountCode, *TaxType, TrackingName1, TrackingOption1, Currency` |
| JSON | `{ exportedAt, count, invoices: [...] }` including category, cost centre and the approval record |

CSV files start with a UTF-8 byte-order mark so Excel reads names like "Café" correctly; JSON does not. In QuickBooks, `Location` is the cost centre and `Terms` is worked out as "Net N". In Xero the cost centre goes into tracking category 1 and `Reference` holds the PO number.

Honest limits: dates are written as `YYYY-MM-DD` (your import screen may expect your regional format), and tax codes, tax types and account codes are sensible defaults you will probably need to map to your own chart of accounts.

## Using your own invoices

1. Open **Settings**, choose **OpenAI** (`gpt-4o-mini`) or **Anthropic** (`claude-sonnet-5-5`) and paste your key.
2. In the **Inbox**, drop one or more PDFs or images. Without a key you get a clear message instead.
3. Open each item, fix anything flagged, then approve.

With Anthropic, PDFs are sent as-is. With OpenAI, page 1 is drawn to an image in your browser first. Only page 1 is read.

## How your API key and data are handled

- The key lives in React state only. It is **never** written to local storage, cookies, the URL or any file, and is gone when you refresh.
- The browser calls OpenAI or Anthropic directly. Use a key with a spending limit. Your invoice goes to the provider you picked, under their terms.
- Demo state (invoices, statuses, edits, logs, settings) is saved in your browser's local storage under a versioned key (`ai-invoice-reader:ap-demo:v1`). Uploaded file bytes are **not** saved. A small preview image is kept only if it is under about 200 KB; otherwise the preview is shown for the current visit only and the app says so after a reload. **Reset demo** (with a confirmation) wipes it all.

## Limitations

- Single user: "You" is also the manager. There are no real accounts or permissions.
- No currency conversion. The approval threshold compares the number in the invoice's own currency.
- Extraction can be wrong; that is why everything is editable and checked. Per-field confidence from live extraction is self-reported by the model.
- Uploads that were still being read when the page closed come back as errors and must be uploaded again.
- Tax checks are sanity checks, not tax advice (mixed-rate invoices can trigger a false alarm).

## Run it locally

Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # checks, workflow/threshold, exports, persistence, seed, stats
npm run typecheck
npm run build      # static site in ./out
npm run start      # serve ./out
npm run samples    # regenerate the sample invoice SVGs in public/samples
```

## Project layout

```
app/            layout and global styles (glass design tokens, light/dark, reduced motion/transparency/contrast)
components/     App shell, Inbox, Review, Dashboard, ExportView, Settings, HowItWorks
lib/            pure logic with tests: checks, workflow, state, stats, export, persist, seed, ingest, parse, vision
scripts/        generates the sample SVGs from lib/seed.ts
public/samples/ ten fake invoices (dates in them are rewritten at runtime to match "today")
```

## Deploy

The output is plain files in `out/`, so any static host works (Vercel, Netlify, Cloudflare Pages, S3, GitHub Pages). Under a sub-path:

```bash
NEXT_PUBLIC_BASE_PATH=/invoice-reader npm run build
```
