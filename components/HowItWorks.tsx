const STEPS = [
  {
    title: "Capture",
    body: "Invoices land in the inbox. The ten samples are pre-read so everything works with no setup; with your own AI key you can drop in several PDFs or photos at once and each becomes a queue item.",
  },
  {
    title: "Extract",
    body: "A vision model reads the vendor, number, PO, dates, line items and totals, and says how sure it is of each field. Fields under 80% are highlighted for a human look.",
  },
  {
    title: "Check",
    body: "The app doesn't trust the model. It re-does the maths, checks tax rates for the UK, US and Canada, and looks for duplicates, unknown vendors, overdue bills and missing PO numbers. Each result explains itself in plain English.",
  },
  {
    title: "Approve",
    body: "Approve, flag or reject, with a reason when you flag or reject. Totals above the threshold need a manager. Every edit and decision is logged with who and when.",
  },
  {
    title: "Export",
    body: "Only approved invoices export, as a QuickBooks Online or Xero bill-import CSV (or JSON). Afterwards they're marked Exported so nothing is posted twice.",
  },
];

export default function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title" data-testid="how-it-works">
      <h2 id="how-title">How it works</h2>
      <ol className="how-grid">
        {STEPS.map((s, i) => (
          <li key={s.title} className="panel how-card">
            <span className="how-num" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="panel panel-regular privacy">
        <h3>About your data and API key</h3>
        <p>
          This site is fully static: there is no server and no database. Demo state (invoices, statuses, edits, logs and settings) is saved in this browser&apos;s local storage so it survives a reload; Reset demo wipes it. Your API key lives only in this tab&apos;s memory, goes straight from your browser to the provider you chose, and is never saved. Uploaded files are not stored: only a small preview image is kept, and only when it&apos;s small enough.
        </p>
      </div>
      <div className="panel panel-regular privacy">
        <h3>Limits to know about</h3>
        <p>
          No exchange rates: amounts in different currencies are shown side by side, never converted or added. The “manager” is also you, since this is a one-person demo. Nothing is sent to QuickBooks, Xero or any bank. AI extraction can be wrong, which is why every field is editable and checked.
        </p>
      </div>
    </section>
  );
}
