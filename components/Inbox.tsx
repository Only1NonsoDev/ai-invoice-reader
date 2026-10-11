"use client";

import { useId, useMemo, useState } from "react";

import { dueInfo, countIssues } from "@/lib/checks";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { ChecksById } from "@/lib/state";
import { STATUSES, STATUS_LABEL, type InvoiceRecord, type Status } from "@/lib/types";
import type { UploadNote } from "./App";
import { EmptyState, Icon, StatusBadge } from "./ui";

type Tab = "all" | Status;
type Sort = "due" | "newest" | "amount";

type Props = {
  invoices: InvoiceRecord[];
  checks: ChecksById;
  today: string;
  hasKey: boolean;
  note: UploadNote;
  onFiles: (files: File[]) => void;
  onOpen: (id: string) => void;
  onGoSettings: () => void;
};

export function matchesQuery(r: InvoiceRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [r.data.vendor, r.data.invoiceNumber, r.data.poNumber, r.fileName, r.category, r.costCentre, r.data.currency, r.data.total?.toFixed(2) ?? "", STATUS_LABEL[r.status]]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

function sortRecords(list: InvoiceRecord[], sort: Sort): InvoiceRecord[] {
  const out = [...list];
  // Items still being read (or failed) stay on top so nothing gets lost.
  const busy = (r: InvoiceRecord) => (r.load === "ready" ? 1 : 0);
  out.sort((a, b) => {
    if (busy(a) !== busy(b)) return busy(a) - busy(b);
    if (sort === "newest") return b.receivedAt.localeCompare(a.receivedAt);
    if (sort === "amount") return (b.data.total ?? -1) - (a.data.total ?? -1);
    const da = a.data.dueDate || "9999-12-31";
    const db = b.data.dueDate || "9999-12-31";
    return da.localeCompare(db) || b.receivedAt.localeCompare(a.receivedAt);
  });
  return out;
}

export default function Inbox(p: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("due");
  const [dragging, setDragging] = useState(false);
  const searchId = useId();
  const sortId = useId();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: p.invoices.length };
    for (const s of STATUSES) c[s] = p.invoices.filter((r) => r.load === "ready" && r.status === s).length;
    return c;
  }, [p.invoices]);

  const visible = useMemo(() => {
    const byTab = p.invoices.filter((r) => (tab === "all" ? true : r.load === "ready" && r.status === tab));
    return sortRecords(byTab.filter((r) => matchesQuery(r, query)), sort);
  }, [p.invoices, tab, query, sort]);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <h1>Invoice inbox</h1>
        <p className="lede">Capture, check, approve, then export. Everything below is waiting for a decision or already done.</p>
      </header>

      <section className="panel panel-regular upload-panel stack-sm" aria-labelledby="upload-title">
        <div className="section-head">
          <h2 id="upload-title">Add invoices</h2>
          <span className={`badge ${p.hasKey ? "badge-live" : "badge-demo"}`} data-testid="mode-badge">
            {p.hasKey ? "Live mode · your API key" : "Demo mode · no API key"}
          </span>
        </div>
        <label
          className={`dropzone dropzone-slim${dragging ? " is-drag" : ""}`}
          data-testid="dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            p.onFiles(Array.from(e.dataTransfer.files ?? []));
          }}
        >
          <input
            type="file"
            multiple
            className="sr-only-input"
            accept="application/pdf,image/*"
            data-testid="batch-upload-input"
            aria-label="Upload invoices (PDF or image, several at once)"
            onChange={(e) => {
              p.onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <span className="drop-icon">
            <Icon name="upload" size={24} />
          </span>
          <strong>Drop invoices here, or tap to choose several</strong>
          <span className="muted small">PDF or image, up to 15 MB each. Each file becomes its own queue item.</span>
        </label>
        {p.note && (
          <p className={p.note.kind === "error" ? "inline-error" : "muted small"} role={p.note.kind === "error" ? "alert" : "status"} data-testid="upload-note">
            {p.note.kind === "error" && <Icon name="alert" size={16} />} {p.note.text}
            {p.note.kind === "error" && !p.hasKey && (
              <>
                {" "}
                <button type="button" className="link-btn" onClick={p.onGoSettings}>
                  Open Settings
                </button>
              </>
            )}
          </p>
        )}
        {!p.note && !p.hasKey && (
          <p className="muted small">
            Demo mode: the sample invoices below are pre-read, so no AI call is made. To read your own files, add a key in{" "}
            <button type="button" className="link-btn" onClick={p.onGoSettings}>
              Settings
            </button>
            .
          </p>
        )}
      </section>

      <section className="stack" aria-labelledby="queue-title">
        <div className="section-head">
          <h2 id="queue-title">Queue</h2>
          <div className="queue-tools">
            <div className="search">
              <label htmlFor={searchId} className="sr-only">
                Search invoices
              </label>
              <Icon name="search" size={16} />
              <input
                id={searchId}
                className="input"
                type="search"
                placeholder="Search vendor, number, PO, amount…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="inbox-search"
              />
            </div>
            <div className="sort">
              <label htmlFor={sortId} className="sr-only">
                Sort by
              </label>
              <select id={sortId} className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} data-testid="inbox-sort">
                <option value="due">Sort: due date</option>
                <option value="newest">Sort: newest first</option>
                <option value="amount">Sort: amount</option>
              </select>
            </div>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Filter by status" data-testid="inbox-tabs">
          {(["all", ...STATUSES] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="tab"
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
            >
              {t === "all" ? "All" : STATUS_LABEL[t]} <span className="tab-count">{counts[t]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="inbox" title={p.invoices.length === 0 ? "Your inbox is empty" : "No invoices match"} testId="inbox-empty">
            {p.invoices.length === 0
              ? "Drop an invoice above, or reset the demo in Settings to get the sample invoices back."
              : query
                ? `Nothing matches “${query}” in ${tab === "all" ? "any status" : STATUS_LABEL[tab]}. Try a different search.`
                : `Nothing is ${STATUS_LABEL[tab as Status].toLowerCase()} right now.`}
          </EmptyState>
        ) : (
          <>
            <div className="inbox-head" aria-hidden="true">
              <span>Vendor</span>
              <span>Amount</span>
              <span>Due</span>
              <span>Status</span>
            </div>
            <ul className="inbox-list" data-testid="inbox-list">
              {visible.map((r) => (
                <li key={r.id}>
                  <Row rec={r} issues={countIssues(p.checks[r.id] ?? [])} today={p.today} onOpen={() => p.onOpen(r.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Row({ rec, issues, today, onOpen }: { rec: InvoiceRecord; issues: number; today: string; onOpen: () => void }) {
  const d = rec.data;
  const ready = rec.load === "ready";
  const settled = rec.status === "rejected" || rec.status === "exported";
  const due = ready && !settled ? dueInfo(d.dueDate, today) : { kind: "none" as const, days: 0 };
  return (
    <button type="button" className="inbox-row glass lift" data-testid={`inbox-row-${rec.id}`} data-due={due.kind} onClick={onOpen}>
      <span className="cell-vendor">
        <strong className="ellipsis">{ready ? d.vendor || "(no vendor)" : rec.fileName}</strong>
        <span className="muted small ellipsis">
          {ready ? `${d.invoiceNumber || "no number"}${d.poNumber ? ` · ${d.poNumber}` : ""}` : rec.load === "extracting" ? "Reading with AI…" : rec.error}
        </span>
      </span>
      <span className="cell-amount">
        {ready ? (
          <>
            <strong>{formatMoney(d.total, d.currency)}</strong> <span className="muted small">{d.currency}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </span>
      <span className="cell-due">
        {ready && d.dueDate ? <span>{formatDate(d.dueDate)}</span> : <span className="muted">{ready ? "No due date" : "—"}</span>}
        {due.kind === "overdue" && (
          <span className="due-pill due-overdue" data-testid={`due-${rec.id}`}>
            Overdue {-due.days}d
          </span>
        )}
        {due.kind === "soon" && (
          <span className="due-pill due-soon" data-testid={`due-${rec.id}`}>
            {due.days === 0 ? "Due today" : `Due in ${due.days}d`}
          </span>
        )}
      </span>
      <span className="cell-status">
        <StatusBadge status={rec.status} id={rec.id} loading={rec.load === "ready" ? undefined : rec.load} />
        {ready && issues > 0 && rec.status !== "approved" && rec.status !== "exported" && (
          <span className="muted small">
            {issues} to check
          </span>
        )}
      </span>
    </button>
  );
}
