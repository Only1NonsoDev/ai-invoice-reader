"use client";

import { useEffect, useId, useState } from "react";

import { CATEGORIES, COST_CENTRES } from "@/lib/coding";
import { LOW_CONFIDENCE, type Check } from "@/lib/checks";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/money";
import { rebaseSvgDates } from "@/lib/previewSvg";
import { STATUS_LABEL, type FieldName, type InvoiceRecord, type Settings } from "@/lib/types";
import {
  approve, approveAsManager, canApprove, canApproveAsManager, canEdit, canFlag, canReject, canReopen, editField, editLine, editedFields,
  flag, needsManager, reject, reopen, setCoding, setNotes, WorkflowError, type LineKey,
} from "@/lib/workflow";
import { assetUrl } from "./files";
import { EmptyState, Icon, Spinner, StatusBadge } from "./ui";

type Props = {
  record: InvoiceRecord | null;
  checks: Check[];
  settings: Settings;
  onBack: () => void;
  onUpdate: (fn: (r: InvoiceRecord) => InvoiceRecord) => void;
  onAddVendor: (name: string) => void;
  onRetry: () => void;
  onRemove: () => void;
  canRetry: boolean;
};

const ORDER = { fail: 0, warn: 1, pass: 2 } as const;
const CHECK_WORD = { pass: "Pass", warn: "Warning", fail: "Fail" } as const;

export default function Review(p: Props) {
  const rec = p.record;
  const [mode, setMode] = useState<null | "flag" | "reject">(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const reasonId = useId();

  if (!rec) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-ghost back" onClick={p.onBack}>
          <Icon name="back" /> Back to inbox
        </button>
        <EmptyState icon="alert" title="That invoice isn't here any more" testId="review-missing">
          It may have been removed. Go back to the inbox to pick another.
        </EmptyState>
      </div>
    );
  }

  if (rec.load !== "ready") {
    return (
      <div className="stack-lg fade-in" data-testid="review" data-load={rec.load}>
        <button type="button" className="btn btn-ghost back" onClick={p.onBack} data-testid="btn-back">
          <Icon name="back" /> Back to inbox
        </button>
        {rec.load === "extracting" ? (
          <div className="panel panel-regular stack" role="status" data-testid="review-loading">
            <Spinner label={`Reading ${rec.fileName} with AI…`} />
            <div className="skel-fields">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" />
              ))}
            </div>
          </div>
        ) : (
          <div className="panel panel-regular error-panel fade-in" role="alert" data-testid="review-error">
            <span className="error-icon">
              <Icon name="alert" size={28} />
            </span>
            <h2>We couldn&apos;t read {rec.fileName}</h2>
            <p>{rec.error}</p>
            <div className="actions center">
              {p.canRetry && (
                <button type="button" className="btn btn-primary" onClick={p.onRetry} data-testid="btn-retry">
                  <Icon name="refresh" size={16} /> Try again
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={p.onRemove} data-testid="btn-remove">
                <Icon name="trash" size={16} /> Remove from queue
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const d = rec.data;
  const locked = !canEdit(rec);
  const edited = new Set(editedFields(rec.log));
  const issues = p.checks.filter((c) => c.status !== "pass").length;
  const now = () => new Date();

  const run = (fn: (r: InvoiceRecord) => InvoiceRecord, message?: string) => {
    try {
      fn(rec); // validate first so errors show here, not inside a state updater
      p.onUpdate(fn);
      setError(null);
      setDone(message ?? null);
    } catch (e) {
      setError(e instanceof WorkflowError ? e.message : "Something went wrong. Please try again.");
    }
  };

  const overThreshold = needsManager(d.total, p.settings.threshold);
  const limit = formatMoney(p.settings.threshold, d.currency);

  const confirmReason = () => {
    if (!mode) return;
    const text = reason;
    run((r) => (mode === "flag" ? flag(r, text, now()) : reject(r, text, now())), mode === "flag" ? "Flagged. It stays in the inbox under Flagged." : "Rejected. It won't be paid or exported.");
    setMode(null);
    setReason("");
  };

  const fieldProps = (name: FieldName) => ({
    name,
    confidence: rec.confidence[name],
    edited: edited.has(name),
    locked,
  });

  const sorted = [...p.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="stack-lg fade-in" data-testid="review" data-id={rec.id}>
      <div className="review-top">
        <button type="button" className="btn btn-ghost back" onClick={p.onBack} data-testid="btn-back">
          <Icon name="back" /> Back to inbox
        </button>
        <div className="review-title">
          <h1 className="h1-sm">{d.vendor || "(no vendor)"}</h1>
          <p className="muted">
            {d.invoiceNumber || "No invoice number"} · {formatMoney(d.total, d.currency)} {d.currency}
          </p>
        </div>
        <StatusBadge status={rec.status} id={rec.id} />
      </div>

      <Workflow status={rec.status} />

      {done && (
        <p className="notice notice-pass" role="status" data-testid="review-notice">
          <Icon name="check" size={16} /> {done}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert" data-testid="review-error-msg">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      {rec.approval && (rec.status === "flagged" || rec.status === "rejected") && (
        <p className="notice notice-warn" data-testid="decision-note">
          <Icon name="flag" size={16} /> {rec.approval.decision === "flagged" ? "Flagged" : "Rejected"} by {rec.approval.by} on {formatDateTime(rec.approval.at)}: “{rec.approval.note}”
        </p>
      )}
      {rec.status === "needs_manager" && (
        <p className="notice notice-warn" data-testid="manager-notice">
          <Icon name="info" size={16} /> {formatMoney(d.total, d.currency)} is above the {limit} approval threshold, so a manager must give final approval.
        </p>
      )}

      <div className="review-grid">
        <Preview rec={rec} />

        <div className="stack">
          <section className="panel panel-regular stack-sm" aria-labelledby="checks-title">
            <div className="section-head">
              <h2 id="checks-title">Checks</h2>
              <span className={`badge ${issues ? "badge-warn" : "badge-pass"}`} data-testid="checks-summary">
                {issues ? `${issues} to look at` : "All clear"}
              </span>
            </div>
            <ul className="check-list">
              {sorted.map((c) => (
                <li key={c.id} className={`check check-${c.status}`} data-testid={`check-${c.id}`} data-status={c.status}>
                  <span className={`badge badge-${c.status === "pass" ? "pass" : c.status === "warn" ? "warn" : "fail"}`}>{CHECK_WORD[c.status]}</span>
                  <span className="check-text">
                    <strong>{c.label}</strong>
                    <span>{c.message}</span>
                    {c.id === "vendor" && c.status === "warn" && !locked && (
                      <button type="button" className="link-btn" data-testid="btn-add-vendor" onClick={() => p.onAddVendor(d.vendor.trim())}>
                        Add {d.vendor} to known vendors
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel panel-regular stack" aria-labelledby="fields-title">
            <div className="section-head">
              <h2 id="fields-title">Invoice details</h2>
              {locked && <span className="badge badge-demo">Locked · reopen to edit</span>}
            </div>
            <div className="fields">
              <div className="span-2">
                <TextField label="Vendor" {...fieldProps("vendor")} value={d.vendor} onChange={(v) => run((r) => editField(r, "vendor", v, now()))} />
              </div>
              <TextField label="Invoice number" {...fieldProps("invoiceNumber")} value={d.invoiceNumber} onChange={(v) => run((r) => editField(r, "invoiceNumber", v, now()))} />
              <TextField label="PO number" {...fieldProps("poNumber")} value={d.poNumber} placeholder="e.g. PO-1234" onChange={(v) => run((r) => editField(r, "poNumber", v, now()))} />
              <TextField label="Issue date" type="date" {...fieldProps("issueDate")} value={d.issueDate} onChange={(v) => run((r) => editField(r, "issueDate", v, now()))} />
              <TextField label="Due date" type="date" {...fieldProps("dueDate")} value={d.dueDate} onChange={(v) => run((r) => editField(r, "dueDate", v, now()))} />
              <TextField label="Currency" {...fieldProps("currency")} value={d.currency} maxLength={3} onChange={(v) => run((r) => editField(r, "currency", v.toUpperCase(), now()))} />
              <div />
              <NumField label="Subtotal" {...fieldProps("subtotal")} value={d.subtotal} onChange={(v) => run((r) => editField(r, "subtotal", v, now()))} />
              <NumField label="Tax" {...fieldProps("tax")} value={d.tax} onChange={(v) => run((r) => editField(r, "tax", v, now()))} />
              <NumField label="Total" {...fieldProps("total")} value={d.total} onChange={(v) => run((r) => editField(r, "total", v, now()))} />
            </div>
          </section>

          <section className="panel panel-regular stack" aria-labelledby="lines-title">
            <h2 id="lines-title">Line items</h2>
            {d.lineItems.length === 0 ? (
              <p className="muted">No line items were found on this invoice.</p>
            ) : (
              <table className="items">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lineItems.map((li, i) => {
                    const bad = p.checks.find((c) => c.id === "line-math")?.rows?.includes(i);
                    return (
                      <tr key={i} className={bad ? "row-warn" : undefined} data-testid={`line-${i}`}>
                        <td className="c-desc" data-label="Description">
                          <input className="input" aria-label={`Line ${i + 1} description`} value={li.description} readOnly={locked} aria-invalid={bad || undefined} onChange={(e) => run((r) => editLine(r, i, "description", e.target.value, now()))} />
                        </td>
                        {(["quantity", "unitPrice", "amount"] as const).map((k) => (
                          <td key={k} className="c-num" data-label={k === "quantity" ? "Qty" : k === "unitPrice" ? "Unit price" : "Amount"}>
                            <LineNum label={`Line ${i + 1} ${k}`} value={li[k]} locked={locked} invalid={bad} onChange={(v) => run((r) => editLine(r, i, k as LineKey, v, now()))} testId={`line-${i}-${k}`} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel panel-regular stack" aria-labelledby="coding-title">
            <h2 id="coding-title">Coding and notes</h2>
            <div className="fields">
              <div className="field">
                <label htmlFor="sel-cat">Category (GL account)</label>
                <select id="sel-cat" className="input" value={rec.category} disabled={locked} data-testid="select-category" onChange={(e) => run((r) => setCoding(r, "category", e.target.value, now()))}>
                  <option value="">Choose a category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {rec.category && !CATEGORIES.some((c) => c.name === rec.category) && <option value={rec.category}>{rec.category}</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sel-cc">Cost centre</label>
                <select id="sel-cc" className="input" value={rec.costCentre} disabled={locked} data-testid="select-costcentre" onChange={(e) => run((r) => setCoding(r, "costCentre", e.target.value, now()))}>
                  <option value="">Choose a cost centre…</option>
                  {COST_CENTRES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {rec.costCentre && !(COST_CENTRES as readonly string[]).includes(rec.costCentre) && <option value={rec.costCentre}>{rec.costCentre}</option>}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="notes">Notes (saved with the approval)</label>
                <textarea id="notes" className="input" rows={3} value={rec.notes} placeholder="Anything the next person should know" data-testid="field-notes" onChange={(e) => p.onUpdate((r) => setNotes(r, e.target.value))} />
              </div>
            </div>
          </section>

          <section className="panel panel-regular stack-sm" aria-labelledby="log-title">
            <h2 id="log-title">Activity log</h2>
            <ol className="log" data-testid="activity-log">
              {[...rec.log].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} data-kind={e.kind}>
                  <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                  <span>{e.message}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <div className="toolbar glass glass-float" role="group" aria-label="Decision">
        {mode ? (
          <div className="reason stack-sm">
            <label htmlFor={reasonId}>
              <strong>{mode === "flag" ? "Why are you flagging this invoice?" : "Why are you rejecting this invoice?"}</strong>
            </label>
            <input
              id={reasonId}
              className="input"
              value={reason}
              autoFocus
              placeholder={mode === "flag" ? "e.g. Waiting for a corrected invoice" : "e.g. We never ordered this"}
              data-testid="reason-input"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reason.trim() && confirmReason()}
            />
            <div className="actions">
              <button type="button" className={`btn ${mode === "reject" ? "btn-danger" : "btn-primary"}`} disabled={!reason.trim()} data-testid="reason-confirm" onClick={confirmReason}>
                {mode === "flag" ? "Confirm flag" : "Confirm reject"}
              </button>
              <button type="button" className="btn btn-secondary" data-testid="reason-cancel" onClick={() => { setMode(null); setReason(""); }}>
                Cancel
              </button>
              {!reason.trim() && <span className="muted small">A reason is required.</span>}
            </div>
          </div>
        ) : (
          <>
            <div className="toolbar-status">
              <span className="toolbar-title">{STATUS_LABEL[rec.status]}</span>
              <span className="muted small">
                {rec.status === "approved" || rec.status === "exported"
                  ? rec.approval
                    ? `${rec.approval.decision === "manager_approved" ? "Manager approval" : "Approved"} by ${rec.approval.by}, ${formatDateTime(rec.approval.at)}`
                    : "Decision recorded"
                  : canApprove(rec) && overThreshold
                    ? `Over ${limit}: Approve will send it to a manager`
                    : issues
                      ? `${issues} open ${issues === 1 ? "issue" : "issues"}`
                      : "Ready to approve"}
              </span>
            </div>
            <div className="toolbar-actions">
              {canReopen(rec) && (
                <button type="button" className="btn btn-secondary" data-testid="btn-reopen" onClick={() => run((r) => reopen(r, now()), "Reopened. You can edit and decide again.")}>
                  <Icon name="undo" size={16} /> Reopen
                </button>
              )}
              {canReject(rec) && (
                <button type="button" className="btn btn-secondary" data-testid="btn-reject" onClick={() => { setMode("reject"); setDone(null); }}>
                  Reject
                </button>
              )}
              {canFlag(rec) && (
                <button type="button" className="btn btn-secondary" data-testid="btn-flag" onClick={() => { setMode("flag"); setDone(null); }}>
                  <Icon name="flag" size={16} /> Flag
                </button>
              )}
              {canApprove(rec) && (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="btn-approve"
                  onClick={() =>
                    run(
                      (r) => approve(r, p.settings, now(), issues),
                      overThreshold ? `Approved by You. It is above ${limit}, so it now needs manager approval.` : "Approved. It is ready to export.",
                    )
                  }
                >
                  <Icon name="check" size={16} /> Approve
                </button>
              )}
              {canApproveAsManager(rec) && (
                <button type="button" className="btn btn-primary" data-testid="btn-approve-manager" onClick={() => run((r) => approveAsManager(r, now(), issues), "Approved as manager. It is ready to export.")}>
                  <Icon name="check" size={16} /> Approve as manager
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Pieces ----------

const STAGES = ["Capture", "Extract", "Check", "Approve", "Export"];

function Workflow({ status }: { status: InvoiceRecord["status"] }) {
  // Capture and Extract are always done by the time we are here.
  const at = status === "exported" ? 5 : status === "approved" ? 4 : status === "new" || status === "needs_review" || status === "flagged" || status === "needs_manager" ? 2 : 3;
  const current = status === "needs_manager" ? 3 : at;
  return (
    <ol className="workflow" aria-label="Workflow progress">
      {STAGES.map((s, i) => (
        <li key={s} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          <span className="step-dot" aria-hidden="true">{i < current ? <Icon name="check" size={13} /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function Preview({ rec }: { rec: InvoiceRecord }) {
  const [src, setSrc] = useState<string | null>(rec.sampleFile ? null : rec.previewUrl);
  const [failed, setFailed] = useState(false);
  const { issueDate, dueDate } = rec.data;

  useEffect(() => {
    if (!rec.sampleFile) {
      setSrc(rec.previewUrl);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    // Sample dates move with "today", so rewrite them in the SVG to match the extracted values.
    fetch(assetUrl(rec.sampleFile))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error("missing"))))
      .then((text) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([rebaseSvgDates(text, { issueDate, dueDate })], { type: "image/svg+xml" }));
        setSrc(url);
      })
      .catch(() => !cancelled && setSrc(assetUrl(rec.sampleFile!)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [rec.sampleFile, rec.previewUrl, issueDate, dueDate]);

  return (
    <section className="preview" aria-label="Invoice document" data-testid="preview">
      <div className="paper">
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Scan of invoice ${rec.data.invoiceNumber || rec.fileName} from ${rec.data.vendor || "unknown vendor"}`} onError={() => setFailed(true)} />
        ) : rec.sampleFile && !failed ? (
          <div className="skeleton paper-skel" role="status" aria-label="Loading preview" />
        ) : (
          <div className="paper-empty" data-testid="preview-missing">
            <Icon name="file" size={32} />
            <strong>No preview available</strong>
            <span className="small">
              {rec.previewLost
                ? "This preview was too large to save in your browser, so it didn't survive the reload. The extracted data is still here."
                : "A preview wasn't available for this file."}
            </span>
          </div>
        )}
      </div>
      <p className="muted small">
        {rec.fileName}
        {rec.source === "upload" && rec.previewUrl?.startsWith("blob:") ? " · This preview is kept for this visit only (too large to save)." : ""}
      </p>
    </section>
  );
}

function Confidence({ name, value, edited }: { name: FieldName; value: number | undefined; edited: boolean }) {
  const low = !edited && value !== undefined && value < LOW_CONFIDENCE;
  const pct = value === undefined ? null : Math.round(value * 100);
  return (
    <span className="conf" data-testid={`confidence-${name}`} data-low={low} data-value={value ?? ""} title={`AI confidence: ${pct === null ? "unknown" : pct + "%"}. Below ${LOW_CONFIDENCE * 100}% is highlighted.`}>
      {edited ? (
        <>Edited by you</>
      ) : pct === null ? (
        <>Confidence n/a</>
      ) : (
        <>
          <span className="conf-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
          {pct}% {low && <b>· low, please check</b>}
        </>
      )}
    </span>
  );
}

type FieldCommon = { name: FieldName; label: string; confidence: number | undefined; edited: boolean; locked: boolean };

function TextField(p: FieldCommon & { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; maxLength?: number }) {
  const id = useId();
  const low = !p.edited && p.confidence !== undefined && p.confidence < LOW_CONFIDENCE;
  return (
    <div className="field" data-low={low}>
      <label htmlFor={id}>{p.label}</label>
      <input id={id} className="input" type={p.type ?? "text"} value={p.value} readOnly={p.locked} maxLength={p.maxLength} placeholder={p.placeholder} aria-invalid={low || undefined} data-testid={`field-${p.name}`} onChange={(e) => p.onChange(e.target.value)} />
      <Confidence name={p.name} value={p.confidence} edited={p.edited} />
    </div>
  );
}

function NumField(p: FieldCommon & { value: number | null; onChange: (v: number | null) => void }) {
  const id = useId();
  const low = !p.edited && p.confidence !== undefined && p.confidence < LOW_CONFIDENCE;
  return (
    <div className="field" data-low={low}>
      <label htmlFor={id}>{p.label}</label>
      <Num id={id} value={p.value} locked={p.locked} invalid={low} testId={`field-${p.name}`} onChange={p.onChange} />
      <Confidence name={p.name} value={p.confidence} edited={p.edited} />
    </div>
  );
}

/** A number box that lets you type "12." or "1,2" without the value jumping around. */
function Num(p: { id?: string; value: number | null; locked: boolean; invalid?: boolean; testId: string; label?: string; onChange: (v: number | null) => void }) {
  const show = (n: number | null) => (n === null ? "" : String(n));
  const [draft, setDraft] = useState(show(p.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(show(p.value));
  }, [p.value, focused]);
  return (
    <input
      id={p.id}
      className="input num"
      inputMode="decimal"
      value={draft}
      readOnly={p.locked}
      aria-label={p.label}
      aria-invalid={p.invalid || undefined}
      data-testid={p.testId}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(show(p.value));
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.value.trim() === "" ? null : toNumber(e.target.value);
        if (e.target.value.trim() === "" || n !== null) p.onChange(n);
      }}
    />
  );
}

function LineNum(p: { label: string; value: number | null; locked: boolean; invalid?: boolean; testId: string; onChange: (v: number | null) => void }) {
  return <Num {...p} />;
}
