"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { formatMoney } from "@/lib/money";
import type { ChecksById } from "@/lib/state";
import {
  amountBy, awaitingManagerCount, currenciesIn, dueThisWeek, formatDuration, handledCount, overdueCount, pendingReviewCount, suspectedDuplicates,
  timeSavedMinutes, type Bar,
} from "@/lib/stats";
import type { InvoiceRecord, Settings } from "@/lib/types";
import { EmptyState, Icon } from "./ui";

type Props = {
  invoices: InvoiceRecord[];
  checks: ChecksById;
  today: string;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
};

export default function Dashboard({ invoices, checks, today, settings, onSettings }: Props) {
  const week = useMemo(() => dueThisWeek(invoices, checks, today), [invoices, checks, today]);
  const currencies = useMemo(() => currenciesIn(invoices, checks), [invoices, checks]);
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked && currencies.includes(picked) ? picked : currencies[0];
  const dupes = suspectedDuplicates(invoices, checks);

  if (invoices.length === 0) {
    return (
      <div className="stack-lg fade-in">
        <h1>Dashboard</h1>
        <EmptyState icon="chart" title="Nothing to show yet" testId="dashboard-empty">
          Add an invoice from the inbox, or reset the demo in Settings, and the numbers will appear here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="lede">Where the money is going and what needs attention. Amounts in different currencies are never added together.</p>
      </header>

      <div className="stat-grid">
        <section className="panel panel-regular stat stat-wide" aria-labelledby="week-title">
          <h2 id="week-title" className="stat-label">
            To pay this week
          </h2>
          <div data-testid="dashboard-total-week" className="stat-money">
            {week.length === 0 ? (
              <strong className="stat-value" data-testid="dashboard-total-week-empty">
                Nothing due
              </strong>
            ) : (
              week.map((w) => (
                <div key={w.currency} className="stat-money-row" data-currency={w.currency}>
                  <strong className="stat-value">{formatMoney(w.total, w.currency)}</strong>
                  <span className="muted small">
                    {w.currency} · {w.count} {w.count === 1 ? "invoice" : "invoices"}
                    {w.approved > 0 ? ` · ${formatMoney(w.approved, w.currency)} approved` : ""}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="muted small">
            Due in the next 7 days, plus anything already overdue; excludes rejected invoices
            {dupes > 0 ? ` and ${dupes} suspected ${dupes === 1 ? "duplicate" : "duplicates"}` : ""}.
          </p>
        </section>
        <Stat label="Overdue" value={overdueCount(invoices, checks, today)} testId="dashboard-overdue" hint="Past the due date" />
        <Stat label="Pending review" value={pendingReviewCount(invoices)} testId="dashboard-pending" hint="New or needs review" />
        <Stat label="Awaiting manager" value={awaitingManagerCount(invoices)} testId="dashboard-manager" hint="Over the approval threshold" />
      </div>

      <section className="panel panel-regular stack" aria-labelledby="charts-title">
        <div className="section-head">
          <h2 id="charts-title">Spend breakdown</h2>
          {currencies.length > 1 && (
            <div className="segmented seg-inline" role="group" aria-label="Currency" data-testid="chart-currency">
              {currencies.map((c) => (
                <button key={c} type="button" className={`seg-btn${c === currency ? " is-on" : ""}`} aria-pressed={c === currency} onClick={() => setPicked(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        {!currency ? (
          <EmptyState icon="chart" title="No amounts yet" testId="charts-empty">
            Invoices that are still being read, or have been rejected, aren&apos;t included.
          </EmptyState>
        ) : (
          <div className="chart-grid">
            <BarChart title="By vendor" currency={currency} bars={amountBy(invoices, checks, "vendor", currency)} testId="chart-vendor" />
            <BarChart title="By category" currency={currency} bars={amountBy(invoices, checks, "category", currency)} testId="chart-category" />
          </div>
        )}
        <p className="muted small">Every invoice except rejected ones and suspected duplicates, in {currency ?? "one currency"} only.</p>
      </section>

      <TimeSaved handled={handledCount(invoices)} settings={settings} onSettings={onSettings} />
    </div>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: number; hint: string; testId: string }) {
  return (
    <section className="panel panel-regular stat" aria-label={label}>
      <h2 className="stat-label">{label}</h2>
      <strong className="stat-value" data-testid={testId}>
        {value}
      </strong>
      <p className="muted small">{hint}</p>
    </section>
  );
}

function BarChart({ title, bars, currency, testId }: { title: string; bars: Bar[]; currency: string; testId: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const total = bars.reduce((s, b) => s + b.value, 0);
  return (
    <figure className="chart" data-testid={testId}>
      <figcaption>
        <h3>{title}</h3>
        <span className="muted small">{currency} · {formatMoney(total, currency)} in total</span>
      </figcaption>
      {bars.length === 0 ? (
        <p className="muted">Nothing in {currency}.</p>
      ) : (
        <ul className="bars">
          {bars.map((b) => (
            <li key={b.label}>
              <span className="bar-label ellipsis" title={b.label}>
                {b.label}
              </span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
              </span>
              <span className="bar-value">{formatMoney(b.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function TimeSaved({ handled, settings, onSettings }: { handled: number; settings: Settings; onSettings: (p: Partial<Settings>) => void }) {
  const saved = timeSavedMinutes(handled, settings.manualMinutes, settings.reviewSeconds);
  return (
    <section className="panel panel-regular stack" aria-labelledby="saved-title" data-testid="time-saved">
      <div className="section-head">
        <h2 id="saved-title">Time saved</h2>
        <span className="badge badge-demo">Estimate, not measured</span>
      </div>
      <p>
        <strong className="stat-value" data-testid="time-saved-value">
          {formatDuration(saved)}
        </strong>{" "}
        <span className="muted">
          across {handled} {handled === 1 ? "invoice" : "invoices"} you&apos;ve handled, based on the assumptions below.
        </span>
      </p>
      <div className="fields">
        <Assumption label="Minutes to enter one invoice by hand" value={settings.manualMinutes} step={0.5} testId="assume-manual" onCommit={(v) => onSettings({ manualMinutes: v })} />
        <Assumption label="Seconds to review one invoice here" value={settings.reviewSeconds} step={5} testId="assume-review" onCommit={(v) => onSettings({ reviewSeconds: v })} />
      </div>
      <p className="muted small">
        Formula: invoices handled × (manual minutes − review seconds ÷ 60). Defaults (4 min vs 30 s) are a rough guess, not a benchmark. Change them to match your team.
      </p>
    </section>
  );
}

function Assumption({ label, value, step, testId, onCommit }: { label: string; value: number; step: number; testId: string; onCommit: (v: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input num"
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        value={draft}
        data-testid={testId}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onCommit(n);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </div>
  );
}
