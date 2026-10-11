"use client";

import { useState } from "react";

import { buildExport, QBO_COLUMNS, XERO_COLUMNS, type ExportKind } from "@/lib/export";
import { formatMoney } from "@/lib/money";
import type { InvoiceRecord } from "@/lib/types";
import { exportable, markExported, type ExportFormat } from "@/lib/workflow";
import { downloadFile } from "./files";
import { EmptyState, Icon } from "./ui";

type Props = {
  invoices: InvoiceRecord[];
  onExported: (next: (all: InvoiceRecord[]) => InvoiceRecord[]) => void;
  onGoInbox: () => void;
};

const LABEL: Record<ExportKind, ExportFormat> = { qbo: "QuickBooks Online CSV", xero: "Xero CSV", json: "JSON" };

export default function ExportView({ invoices, onExported, onGoInbox }: Props) {
  const ready = exportable(invoices);
  const exportedBefore = invoices.filter((r) => r.status === "exported").length;
  const [result, setResult] = useState<{ kind: ExportKind; count: number; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (kind: ExportKind) => {
    if (ready.length === 0) return;
    const now = new Date();
    try {
      const file = buildExport(kind, ready, now);
      downloadFile(file);
      onExported((all) => markExported(all, LABEL[kind], now));
      setResult({ kind, count: ready.length, filename: file.filename });
      setError(null);
    } catch {
      setError("The file couldn't be created. Nothing was marked as exported. Please try again.");
    }
  };

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <h1>Export</h1>
        <p className="lede">Only approved invoices can be exported. After a download they move to Exported, so nothing is posted twice.</p>
      </header>

      {result && (
        <p className="notice notice-pass" role="status" data-testid="export-result">
          <Icon name="check" size={16} /> Downloaded {result.filename} with {result.count} {result.count === 1 ? "invoice" : "invoices"}. They are now marked Exported.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <section className="panel panel-regular stack" aria-labelledby="ready-title">
        <div className="section-head">
          <h2 id="ready-title">Ready to export</h2>
          <span className="badge badge-pass" data-testid="export-count">
            {ready.length} approved
          </span>
        </div>
        {ready.length === 0 ? (
          <EmptyState icon="export" title="No approved invoices yet" testId="export-empty">
            Approve an invoice in the inbox and it will show up here. {exportedBefore > 0 ? `${exportedBefore} already exported.` : ""}{" "}
            <button type="button" className="link-btn" onClick={onGoInbox}>
              Go to the inbox
            </button>
          </EmptyState>
        ) : (
          <ul className="export-list" data-testid="export-list">
            {ready.map((r) => (
              <li key={r.id}>
                <span className="ellipsis">
                  <strong>{r.data.vendor}</strong> <span className="muted small">{r.data.invoiceNumber}</span>
                </span>
                <span className="muted small ellipsis">{[r.category, r.costCentre].filter(Boolean).join(" · ") || "Not coded"}</span>
                <strong>{formatMoney(r.data.total, r.data.currency)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="export-grid">
        <ExportCard
          title="QuickBooks Online"
          blurb="Bill import CSV, one row per line item."
          columns={QBO_COLUMNS}
          testId="export-qbo"
          disabled={ready.length === 0}
          onClick={() => run("qbo")}
          label="Download QuickBooks CSV"
        />
        <ExportCard
          title="Xero"
          blurb="Bills import CSV, one row per line item, cost centre as tracking."
          columns={XERO_COLUMNS}
          testId="export-xero"
          disabled={ready.length === 0}
          onClick={() => run("xero")}
          label="Download Xero CSV"
        />
        <ExportCard
          title="JSON"
          blurb="Everything, including the approval record, for your own tools."
          columns={["id", "vendor", "invoiceNumber", "lineItems", "category", "approval", "…"]}
          testId="export-json"
          disabled={ready.length === 0}
          onClick={() => run("json")}
          label="Download JSON"
        />
      </section>

      <p className="muted small">
        Dates are written as YYYY-MM-DD. Tax code and account names are sensible defaults; map them to your own chart of accounts in the import screen. This is a demo: nothing is sent to QuickBooks or Xero.
      </p>
    </div>
  );
}

function ExportCard(p: { title: string; blurb: string; columns: string[]; testId: string; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="panel panel-regular stack-sm export-card">
      <h3>{p.title}</h3>
      <p className="muted small">{p.blurb}</p>
      <details className="cols">
        <summary>Columns</summary>
        <code>{p.columns.join(", ")}</code>
      </details>
      <button type="button" className="btn btn-primary" disabled={p.disabled} data-testid={p.testId} onClick={p.onClick}>
        <Icon name="download" size={16} /> {p.label}
      </button>
    </div>
  );
}
