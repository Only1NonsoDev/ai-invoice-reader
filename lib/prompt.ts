export const EXTRACTION_PROMPT = `You are an invoice data extractor. Read the attached invoice and reply with ONE JSON object and nothing else, in exactly this shape:

{
  "vendor": string,            // company that issued the invoice
  "invoice_number": string,
  "issue_date": string,        // YYYY-MM-DD, or "" if absent
  "due_date": string,          // YYYY-MM-DD, or "" if the invoice does not state one
  "currency": string,          // ISO 4217 code such as GBP, USD, CAD
  "line_items": [ { "description": string, "quantity": number, "unit_price": number, "amount": number } ],
  "subtotal": number,
  "tax": number,               // total tax amount
  "total": number              // grand total
}

Rules: copy numbers exactly as printed (plain numbers, no currency symbols or thousands separators). Never invent or correct values, even if the arithmetic looks wrong. Use null for a number you cannot read and "" for text you cannot find.`;
