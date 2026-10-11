# AI Invoice Reader

A portfolio demo that reads an invoice (PDF or image) with a vision AI model, pulls out the vendor, dates, line items and totals, and then **double-checks the maths** so you can spot mistakes before exporting to CSV or JSON.

It is a fully static site (Next.js 15 + React 19 + TypeScript, `output: "export"`). There is no server, no API route and no database.

## Try it without any setup

Click one of the three built-in sample invoices (UK supplier in GBP with VAT, US SaaS bill in USD with sales tax, Canadian contractor in CAD with HST). Their results are precomputed and clearly labelled **Demo mode**: no AI call is made and no key is needed. The Canadian sample deliberately has no due date, so you can see a warning.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other commands:

```bash
npm test           # unit tests for validation, CSV/JSON export, and parsing model output
npm run typecheck  # TypeScript check
npm run build      # static site is written to ./out
npm run start      # serve ./out locally
npm run samples    # regenerate the sample invoice SVGs in public/samples
```

## Using your own invoices

1. Drop a PDF or image on the upload area.
2. Choose **OpenAI** (`gpt-4o-mini`) or **Anthropic** (a Claude model) and paste your own API key.
3. Press **Extract invoice**, review the result, fix anything that is flagged, and export.

PDFs: with Anthropic the PDF is sent as-is. With OpenAI, page 1 is first drawn to an image in your browser using `pdfjs-dist`. Only page 1 is read.

## How your API key is handled

- The key is held in React state in the open tab, nothing else.
- It is **never** written to `localStorage`, cookies, the URL or any file, and there is no server to send it to.
- The browser calls OpenAI or Anthropic directly. (Anthropic requires the `anthropic-dangerous-direct-browser-access` header for this; the name is a reminder that keys in browser code can be seen by whoever is using that browser, which here is you.)
- Refreshing or closing the tab erases it. Use a key with a spending limit, and never paste someone else's key into a page you don't trust.

Your invoice is sent to the provider you picked, under their terms. Don't upload sensitive documents you aren't allowed to share.

## What gets checked

| Check | Passes when |
| --- | --- |
| Line items multiply correctly | quantity × unit price = amount on every line |
| Line items add up to subtotal | the amounts sum to the subtotal |
| Subtotal + tax equals total | the three figures agree |
| Due date is present | a due date was found |

One cent of rounding difference is allowed. Edit any value in the table and the checks re-run instantly; edited fields show "edited, was …" with an undo.

## Project layout

```
app/          page, layout and global styles (design tokens, glass materials)
components/   UI: upload, extracting skeleton, review table, stepper
lib/          pure logic with tests: validation, money, parse, export, vision API calls, samples
scripts/      generates the sample SVGs from lib/samples.ts
public/samples/  the three fake invoices
```

## Deploy

The build output is plain files in `out/`, so any static host works.

**Vercel:** import the repository, keep the defaults (Next.js is detected). Because `output: "export"` is set, Vercel serves the static export.

**Any static host (Netlify, Cloudflare Pages, S3, GitHub Pages):** run `npm run build` and upload the `out/` folder.

If the site lives under a sub-path (for example `https://you.github.io/invoice-reader/`), set the base path when building:

```bash
NEXT_PUBLIC_BASE_PATH=/invoice-reader npm run build
```

## Notes and limits

- Models can misread documents. That is why the checks exist; always compare against the original.
- Model names are constants in `lib/vision.ts` if you want to change them.
- Samples are fictional; all names and addresses are made up.
