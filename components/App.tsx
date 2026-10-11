"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { todayISO } from "@/lib/dates";
import { applyExtraction, applyExtractionError, newUpload, restartExtraction } from "@/lib/ingest";
import { deserialize, serialize, STORAGE_KEY } from "@/lib/persist";
import { buildSeed } from "@/lib/seed";
import { computeChecks, rebaseSeedDates, reconcile } from "@/lib/state";
import { awaitingManagerCount, pendingReviewCount } from "@/lib/stats";
import type { AppState, InvoiceRecord, Settings } from "@/lib/types";
import { extractInvoice, ExtractionError, providerLabel, type Provider } from "@/lib/vision";
import Dashboard from "./Dashboard";
import ExportView from "./ExportView";
import { checkFile, makeThumbnail, prepareFile } from "./files";
import Inbox from "./Inbox";
import Review from "./Review";
import SettingsView from "./Settings";
import { Icon, Spinner, type IconName } from "./ui";

export type View = { name: "inbox" } | { name: "review"; id: string } | { name: "dashboard" } | { name: "export" } | { name: "settings" };
type NavName = "inbox" | "dashboard" | "export" | "settings";

const NAV: { name: NavName; label: string; icon: IconName }[] = [
  { name: "inbox", label: "Inbox", icon: "inbox" },
  { name: "dashboard", label: "Dashboard", icon: "chart" },
  { name: "export", label: "Export", icon: "export" },
  { name: "settings", label: "Settings", icon: "settings" },
];

export const DEMO_NOTICE = "Portfolio demo — all invoices, vendors and data are fictional.";
const CONCURRENCY = 2;

export type UploadNote = { kind: "error" | "info"; text: string } | null;

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [today, setToday] = useState("");
  const [view, setView] = useState<View>({ name: "inbox" });
  const [saveError, setSaveError] = useState(false);
  const [uploadNote, setUploadNote] = useState<UploadNote>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  // The API key lives only in React state: never written to storage, cookies or the URL.
  const [apiKey, setApiKey] = useState("");
  // Uploaded files stay in memory only, so a failed read can be retried during this visit.
  const files = useRef(new Map<string, File>());
  const keyRef = useRef({ provider, apiKey });
  keyRef.current = { provider, apiKey };
  const topRef = useRef<HTMLDivElement>(null);

  // Load saved demo state once, in the browser (localStorage doesn't exist while the static page is built).
  useEffect(() => {
    const t = todayISO();
    let loaded: AppState | null = null;
    try {
      loaded = deserialize(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      loaded = null; // storage blocked
    }
    const base = loaded ?? buildSeed();
    setToday(t);
    setState({ settings: base.settings, invoices: reconcile(rebaseSeedDates(base.invoices, t), base.settings, t) });
  }, []);

  // Keep "today" fresh if the tab stays open past midnight.
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Persist after every change.
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialize(state));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [state]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [view]);

  const update = useCallback(
    (fn: (s: AppState) => AppState) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        return { ...next, invoices: reconcile(next.invoices, next.settings, todayISO()) };
      });
    },
    [],
  );

  const updateRecord = useCallback(
    (id: string, fn: (r: InvoiceRecord) => InvoiceRecord) => update((s) => ({ ...s, invoices: s.invoices.map((r) => (r.id === id ? fn(r) : r)) })),
    [update],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })), [update]);

  // ---------- Uploads ----------

  const runExtraction = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      const { provider: p, apiKey: key } = keyRef.current;
      if (!file) {
        updateRecord(id, (r) => applyExtractionError(r, "The file is no longer in memory. Upload it again.", new Date()));
        return;
      }
      try {
        const prepared = await prepareFile(file, p);
        if (prepared.previewUrl) {
          const url = prepared.previewUrl;
          updateRecord(id, (r) => ({ ...r, previewUrl: url }));
          // Swap the temporary blob URL for a small saved thumbnail when it fits.
          void makeThumbnail(url).then((thumb) => {
            if (thumb) updateRecord(id, (r) => ({ ...r, previewUrl: thumb }));
          });
        }
        const invoice = await extractInvoice({ provider: p, apiKey: key, file: prepared.payload });
        updateRecord(id, (r) => applyExtraction(r, invoice, providerLabel(p), new Date()));
      } catch (e) {
        const message = e instanceof ExtractionError ? e.message : "Something went wrong while reading that file. Please try again.";
        updateRecord(id, (r) => applyExtractionError(r, message, new Date()));
      }
    },
    [updateRecord],
  );

  const runQueue = useCallback(
    async (ids: string[]) => {
      const queue = [...ids];
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) await runExtraction(id);
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    },
    [runExtraction],
  );

  const addFiles = useCallback(
    (list: File[]) => {
      if (list.length === 0) return;
      if (!keyRef.current.apiKey.trim()) {
        setUploadNote({
          kind: "error",
          text: "Real uploads need an API key. Add your own OpenAI or Anthropic key in Settings (it stays in this tab's memory only). Without one, you can still explore the sample invoices in the queue.",
        });
        return;
      }
      const problems: string[] = [];
      const ok: File[] = [];
      for (const f of list) {
        const problem = checkFile(f);
        if (problem) problems.push(`${f.name}: ${problem}`);
        else ok.push(f);
      }
      setUploadNote(
        problems.length
          ? { kind: "error", text: problems.join(" ") }
          : { kind: "info", text: `Reading ${ok.length} ${ok.length === 1 ? "invoice" : "invoices"}…` },
      );
      if (ok.length === 0) return;
      const now = new Date();
      const records = ok.map((f, i) => {
        const id = `up-${now.getTime().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        files.current.set(id, f);
        return newUpload(id, f.name, new Date(now.getTime() + i));
      });
      update((s) => ({ ...s, invoices: [...records, ...s.invoices] }));
      void runQueue(records.map((r) => r.id));
    },
    [runQueue, update],
  );

  const retry = useCallback(
    (id: string) => {
      updateRecord(id, (r) => restartExtraction(r, new Date()));
      void runExtraction(id);
    },
    [runExtraction, updateRecord],
  );

  const removeRecord = useCallback(
    (id: string) => {
      files.current.delete(id);
      update((s) => ({ ...s, invoices: s.invoices.filter((r) => r.id !== id) }));
      setView({ name: "inbox" });
    },
    [update],
  );

  const resetDemo = useCallback(() => {
    files.current.clear();
    const fresh = buildSeed();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage blocked: nothing to clear
    }
    const t = todayISO();
    setState({ settings: fresh.settings, invoices: reconcile(fresh.invoices, fresh.settings, t) });
    setUploadNote(null);
    setView({ name: "inbox" });
  }, []);

  // ---------- Derived ----------

  const checks = useMemo(() => (state && today ? computeChecks(state.invoices, state.settings, today) : {}), [state, today]);
  const attention = state ? pendingReviewCount(state.invoices) + awaitingManagerCount(state.invoices) : 0;
  const activeNav: NavName = view.name === "review" ? "inbox" : view.name;

  return (
    <div className="app">
      <div className="backdrop" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      <div className="shell">
        <nav className="nav glass glass-float" aria-label="Main">
          <div className="nav-brand">
            <span className="logo" aria-hidden="true">
              <Icon name="file" size={20} />
            </span>
            <span className="brand-name">Invoice Desk</span>
          </div>
          <ul className="nav-list">
            {NAV.map((n) => (
              <li key={n.name}>
                <button
                  type="button"
                  className="nav-item"
                  data-testid={`nav-${n.name}`}
                  aria-current={activeNav === n.name ? "page" : undefined}
                  onClick={() => setView({ name: n.name } as View)}
                >
                  <Icon name={n.icon} size={22} />
                  <span className="nav-label">{n.label}</span>
                  {n.name === "inbox" && attention > 0 && (
                    <span className="nav-count" aria-label={`${attention} waiting`}>
                      {attention}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="main" id="main">
          <div ref={topRef} className="scroll-anchor" />
          <p className="demo-banner glass" data-testid="demo-banner" role="note">
            <Icon name="info" size={16} /> {DEMO_NOTICE}
          </p>
          {saveError && (
            <p className="inline-error" role="alert" data-testid="save-error">
              <Icon name="alert" size={16} /> Couldn&apos;t save to this browser (storage is full or blocked). Your changes will be lost when you close the tab.
            </p>
          )}

          {!state ? (
            <div className="panel panel-regular stack" data-testid="loading">
              <Spinner label="Loading your invoice queue…" />
              <div className="skeleton" style={{ height: 56 }} />
              <div className="skeleton" style={{ height: 56 }} />
              <div className="skeleton" style={{ height: 56 }} />
            </div>
          ) : (
            <>
              {view.name === "inbox" && (
                <Inbox
                  invoices={state.invoices}
                  checks={checks}
                  today={today}
                  hasKey={apiKey.trim().length > 0}
                  note={uploadNote}
                  onFiles={addFiles}
                  onOpen={(id) => setView({ name: "review", id })}
                  onGoSettings={() => setView({ name: "settings" })}
                />
              )}
              {view.name === "review" && (
                <Review
                  key={view.id}
                  record={state.invoices.find((r) => r.id === view.id) ?? null}
                  checks={checks[view.id] ?? []}
                  settings={state.settings}
                  onBack={() => setView({ name: "inbox" })}
                  onUpdate={(fn) => updateRecord(view.id, fn)}
                  onAddVendor={(name) => updateSettings({ knownVendors: [...state.settings.knownVendors, name] })}
                  onRetry={() => retry(view.id)}
                  onRemove={() => removeRecord(view.id)}
                  canRetry={files.current.has(view.id)}
                />
              )}
              {view.name === "dashboard" && (
                <Dashboard invoices={state.invoices} checks={checks} today={today} settings={state.settings} onSettings={updateSettings} />
              )}
              {view.name === "export" && (
                <ExportView
                  invoices={state.invoices}
                  onExported={(next) => update((s) => ({ ...s, invoices: next(s.invoices) }))}
                  onGoInbox={() => setView({ name: "inbox" })}
                />
              )}
              {view.name === "settings" && (
                <SettingsView
                  settings={state.settings}
                  onSettings={updateSettings}
                  provider={provider}
                  apiKey={apiKey}
                  onProvider={setProvider}
                  onKey={setApiKey}
                  onReset={resetDemo}
                />
              )}
            </>
          )}

          <footer className="footer">
            <p>Built as a portfolio project. No real invoices, companies or personal data. Your API key is never stored.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
