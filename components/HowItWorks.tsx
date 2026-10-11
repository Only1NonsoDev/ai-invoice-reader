const STEPS = [
  {
    title: "You give it an invoice",
    body: "Drop in a PDF or a photo, or tap one of the three samples. Samples are pre-read, so they work without any setup.",
  },
  {
    title: "A vision model reads it",
    body: "For your own files, the page is sent to OpenAI or Anthropic using your key. The model returns the vendor, dates, line items and totals as structured data.",
  },
  {
    title: "The maths gets checked",
    body: "The app doesn't trust the model. It re-adds the lines, re-multiplies quantities and prices, and checks that subtotal plus tax equals the total.",
  },
  {
    title: "You fix and export",
    body: "Anything flagged is shown with the reason. Edit any value and the checks update instantly, then download CSV or JSON.",
  },
];

export default function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
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
        <h3>About your API key</h3>
        <p>
          This site is fully static: there is no server and no database. Your key lives only in this tab&apos;s memory, goes
          straight from your browser to the provider you chose, and disappears when you refresh or close the tab. It is never
          saved to local storage or cookies.
        </p>
      </div>
    </section>
  );
}
