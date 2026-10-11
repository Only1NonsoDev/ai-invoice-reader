"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { exportFilename, toCSV, toJSON } from "@/lib/export";
import { formatMoney, roundMoney, toNumber } from "@/lib/money";
import type { Check, Invoice, LineItem } from "@/lib/types";
import { countWarnings, validateInvoice } from "@/lib/validation";
import { downloadText } from "./files";
import { Icon } from "./ui";

export type Source = { kind: "sample" } | { kind: "live"; label: string };

type Head = Omit<Invoice, "lineItems">;
type Row = LineItem & { key: number; origin: number | null };

const fmtNum = (v: number | null) => (v === null ? "" : String(v));

export function PreviewCard({ url, name, loading }: { url: string | null; name: string; loading?: boolean }) {
  return (
    <aside className="preview panel panel-regular" aria-label="Invoice preview" data-testid="preview">
      <div className="section-head">
        <h2>Original</h2>
        <span className="muted small ellipsis" title={name}>
          {name}
        </span>
      </div>
      <div className="paper">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Preview of ${name}`} />
        ) : loading ? (
          <div className="skeleton paper-skel" aria-hidden="true" />
        ) : (
          <div className="paper-empty">
            <Icon name="file" size={32} />
            <p>No preview available for this file.</p>
          </div>
        )}
      </div>
      {url && (
        <a className="btn btn-ghost" href={url} target="_blank" rel="noopener">
          Open full size
        </a>
      )}
    </aside>
  );
}

function Edited({ id, label, was, onUndo }: { id: string; label: string; was: string; onUndo: () => void }) {
  return (
    <p className="edited" data-testid={`edited-${id}`}>
      <span>
        Edited, was <b>{was || "empty"}</b>
      </span>
      <button type="button" className="link-btn" onClick={onUndo} aria-label={`Undo edit to ${label}`}>
        Undo
      </button>
    </p>
  );
}

function NumInput({
  value,
  onChange,
  label,
  testId,
  invalid,
  className = "",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  testId: string;
  invalid?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(fmtNum(value));
  useEffect(() => {
    // Re-sync when the value changes from outside (undo / reset), but not while the user is mid-typing.
    setText((t) => (toNumber(t) === value ? t : fmtNum(value)));
  }, [value]);
  return (
    <input
      className={`input num ${className}`}
      inputMode="decimal"
      value={text}
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-testid={testId}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toNumber(e.target.value));
      }}
    />
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  const warns = checks.filter((c) => c.status === "warn");
  const passes = checks.filter((c) => c.status === "pass");
  return (
    <>
      {warns.length > 0 && (
        <ul className="checks-warn">
          {warns.map((c) => (
            <li key={c.id} className="check-warn" data-testid={`check-${c.id}`} data-status="warn">
              <span className="badge badge-warn" data-testid={`badge-${c.id}`} data-status="warn">
                <Icon name="alert" size={14} /> Warning
              </span>
              <div>
                <strong>{c.label}</strong>
                <p>{c.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {passes.length > 0 && (
        <ul className="checks-pass">
          {passes.map((c) => (
            <li key={c.id} data-testid={`check-${c.id}`} data-status="pass">
              <span className="badge badge-pass" data-testid={`badge-${c.id}`} data-status="pass">
                <Icon name="check" size={14} /> Pass
              </span>
              <span>
                {c.label}
                <span className="muted"> · {c.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Review({
  original,
  source,
  name,
  previewUrl,
  onNew,
  onExported,
}: {
  original: Invoice;
  source: Source;
  name: string;
  previewUrl: string | null;
  onNew: () => void;
  onExported: () => void;
}) {
  const initialHead = (): Head => {
    const { lineItems: _ignored, ...h } = original;
    return h;
  };
  const initialRows = (): Row[] => original.lineItems.map((li, i) => ({ ...li, key: i, origin: i }));
  const [head, setHead] = useState<Head>(initialHead);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const nextKey = useRef(original.lineItems.length);
  const uid = useId();

  const invoice: Invoice = useMemo(
    () => ({ ...head, lineItems: rows.map(({ key: _k, origin: _o, ...li }) => li) }),
    [head, rows],
  );
  const checks = useMemo(() => validateInvoice(invoice), [invoice]);
  const warnings = countWarnings(checks);
  const flagged = new Set(checks.find((c) => c.id === "line-math")?.rows ?? []);
  const money = (n: number | null) => formatMoney(n, original.currency);

  const setField = <K extends keyof Head>(k: K, v: Head[K]) => setHead((h) => ({ ...h, [k]: v }));
  const setCell = <K extends keyof LineItem>(key: number, k: K, v: LineItem[K]) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  // Count every difference from what was extracted (cells, header fields, added and removed rows).
  const headEdits = (Object.keys(head) as (keyof Head)[]).filter((k) => head[k] !== original[k]).length;
  const rowEdits = rows.reduce((n, r) => {
    if (r.origin === null) return n + 1;
    const o = original.lineItems[r.origin];
    return n + (["description", "quantity", "unitPrice", "amount"] as const).filter((k) => r[k] !== o[k]).length;
  }, 0);
  const removed = original.lineItems.length - rows.filter((r) => r.origin !== null).length;
  const edits = headEdits + rowEdits + removed;

  const resetAll = () => {
    setHead(initialHead());
    setRows(initialRows());
  };

  const textField = (k: "vendor" | "invoiceNumber", label: string, extra = "") => (
    <div className={`field ${extra}`}>
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <input
        id={`${uid}-${k}`}
        className="input"
        value={head[k]}
        onChange={(e) => setField(k, e.target.value)}
        data-testid={`field-${k}`}
      />
      {head[k] !== original[k] && <Edited id={k} label={label} was={original[k]} onUndo={() => setField(k, original[k])} />}
    </div>
  );

  const dateField = (k: "issueDate" | "dueDate", label: string) => (
    <div className="field">
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <input
        id={`${uid}-${k}`}
        className="input"
        type="date"
        value={head[k]}
        aria-invalid={k === "dueDate" && !head.dueDate.trim() ? true : undefined}
        onChange={(e) => setField(k, e.target.value)}
        data-testid={`field-${k}`}
      />
      {head[k] !== original[k] && <Edited id={k} label={label} was={original[k]} onUndo={() => setField(k, original[k])} />}
    </div>
  );

  const totalField = (k: "subtotal" | "tax" | "total", label: string) => (
    <div className={`total-row${k === "total" ? " grand" : ""}`}>
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <div className="total-input">
        <NumInput
          value={head[k]}
          onChange={(v) => setField(k, v)}
          label={label}
          testId={`field-${k}`}
          invalid={checks.some((c) => c.status === "warn" && ((k === "subtotal" && c.id === "lines-sum") || (k !== "subtotal" && c.id === "total-sum")))}
        />
        {head[k] !== original[k] && <Edited id={k} label={label} was={money(original[k])} onUndo={() => setField(k, original[k])} />}
      </div>
    </div>
  );

  const doExport = (ext: "csv" | "json") => {
    if (ext === "csv") downloadText(exportFilename(invoice, "csv"), toCSV(invoice), "text/csv;charset=utf-8");
    else downloadText(exportFilename(invoice, "json"), toJSON(invoice), "application/json");
    onExported();
  };

  return (
    <div className="review-grid fade-in" data-testid="review">
      <PreviewCard url={previewUrl} name={name} />

      <div className="stack">
        <section className="panel panel-regular stack-sm slide-in" aria-labelledby={`${uid}-checks`}>
          <div className="section-head">
            <h2 id={`${uid}-checks`}>Checks</h2>
            <span
              className={`badge ${warnings ? "badge-warn" : "badge-pass"}`}
              data-testid="badge-summary"
              data-status={warnings ? "warn" : "pass"}
              role="status"
            >
              <Icon name={warnings ? "alert" : "check"} size={14} />
              {warnings ? `${warnings} to review` : "All checks passed"}
            </span>
          </div>
          <CheckList checks={checks} />
        </section>

        <section className="panel panel-regular stack slide-in" style={{ animationDelay: "0.06s" }} aria-labelledby={`${uid}-details`}>
          <div className="section-head">
            <h2 id={`${uid}-details`}>Extracted details</h2>
            {source.kind === "sample" ? (
              <span className="badge badge-demo" data-testid="mode-badge">
                Demo mode
              </span>
            ) : (
              <span className="badge badge-live" data-testid="mode-badge">
                Live · {source.label}
              </span>
            )}
          </div>
          <p className="muted small">
            {source.kind === "sample"
              ? "Demo mode: these values were precomputed for the sample. No AI call was made and no key was used."
              : "Read by the model from your file. Always double-check the numbers against the original."}
          </p>
          <div className="fields">
            {textField("vendor", "Vendor", "span-2")}
            {textField("invoiceNumber", "Invoice number")}
            <div className="field">
              <label htmlFor={`${uid}-currency`}>Currency</label>
              <input
                id={`${uid}-currency`}
                className="input"
                maxLength={3}
                autoCapitalize="characters"
                value={head.currency}
                onChange={(e) => setField("currency", e.target.value.toUpperCase())}
                data-testid="field-currency"
              />
              {head.currency !== original.currency && (
                <Edited id="currency" label="Currency" was={original.currency} onUndo={() => setField("currency", original.currency)} />
              )}
            </div>
            {dateField("issueDate", "Issue date")}
            {dateField("dueDate", "Due date")}
          </div>
        </section>

        <section className="panel panel-regular stack slide-in" style={{ animationDelay: "0.12s" }} aria-labelledby={`${uid}-items`}>
          <div className="section-head">
            <h2 id={`${uid}-items`}>Line items</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, origin: null, description: "", quantity: null, unitPrice: null, amount: null }])}
              data-testid="add-row"
            >
              <Icon name="plus" size={16} /> Add line
            </button>
          </div>

          <table className="items" data-testid="line-items-table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">Amount</th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>No line items. Add one, or reset to the extracted values.</td>
                </tr>
              )}
              {rows.map((r, i) => {
                const o = r.origin === null ? null : original.lineItems[r.origin];
                const bad = flagged.has(i);
                const expected = r.quantity !== null && r.unitPrice !== null ? roundMoney(r.quantity * r.unitPrice) : null;
                const n = i + 1;
                return (
                  <tr key={r.key} className={bad ? "row-warn" : ""} data-testid={`row-${i}`} data-flagged={bad || undefined}>
                    <td data-label="Description" className="c-desc">
                      <input
                        className="input"
                        value={r.description}
                        aria-label={`Line ${n} description`}
                        onChange={(e) => setCell(r.key, "description", e.target.value)}
                        data-testid={`cell-${i}-description`}
                      />
                      {r.origin === null ? (
                        <p className="edited">
                          <span>Added by you</span>
                        </p>
                      ) : (
                        o && r.description !== o.description && (
                          <Edited id={`${i}-description`} label={`line ${n} description`} was={o.description} onUndo={() => setCell(r.key, "description", o.description)} />
                        )
                      )}
                    </td>
                    {(
                      [
                        ["quantity", "Qty", "Quantity", (v: number | null) => (v === null ? "" : String(v))],
                        ["unitPrice", "Unit price", "Unit price", money],
                        ["amount", "Amount", "Amount", money],
                      ] as const
                    ).map(([k, short, long, show]) => (
                      <td key={k} data-label={short} className="c-num">
                        <NumInput
                          value={r[k]}
                          onChange={(v) => setCell(r.key, k, v)}
                          label={`Line ${n} ${long.toLowerCase()}`}
                          testId={`cell-${i}-${k}`}
                          invalid={bad}
                        />
                        {o && r[k] !== o[k] && (
                          <Edited id={`${i}-${k}`} label={`line ${n} ${long.toLowerCase()}`} was={show(o[k]) || "empty"} onUndo={() => setCell(r.key, k, o[k])} />
                        )}
                        {k === "amount" && bad && expected !== null && r.amount !== null && (
                          <p className="hint-warn">Qty × price = {money(expected)}</p>
                        )}
                      </td>
                    ))}
                    <td className="c-act">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Remove line ${n}`}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        data-testid={`remove-${i}`}
                      >
                        <Icon name="x" size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="totals" data-testid="totals">
            {totalField("subtotal", "Subtotal")}
            {totalField("tax", "Tax")}
            {totalField("total", "Total")}
          </div>
        </section>
      </div>

      <div className="toolbar glass glass-float" role="toolbar" aria-label="Export" data-testid="toolbar">
        <div className="toolbar-status">
          <span className="toolbar-title">
            {warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "All checks passed"}
            {edits > 0 && <> · {edits} edit{edits === 1 ? "" : "s"}</>}
          </span>
          {edits > 0 && (
            <button type="button" className="link-btn" onClick={resetAll} data-testid="reset-all">
              Reset to extracted
            </button>
          )}
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={onNew} data-testid="new-invoice">
            <Icon name="refresh" size={16} /> New
          </button>
          <button type="button" className="btn btn-primary" onClick={() => doExport("csv")} data-testid="export-csv">
            <Icon name="download" size={16} /> CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={() => doExport("json")} data-testid="export-json">
            <Icon name="download" size={16} /> JSON
          </button>
        </div>
      </div>
    </div>
  );
}
