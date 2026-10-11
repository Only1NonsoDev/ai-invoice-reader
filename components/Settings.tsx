"use client";

import { useEffect, useId, useState } from "react";

import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/types";
import { ANTHROPIC_MODEL, OPENAI_MODEL, type Provider } from "@/lib/vision";
import HowItWorks from "./HowItWorks";
import { Icon } from "./ui";

type Props = {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  provider: Provider;
  apiKey: string;
  onProvider: (p: Provider) => void;
  onKey: (k: string) => void;
  onReset: () => void;
};

export default function SettingsView(p: Props) {
  const keyId = useId();
  const hintId = useId();
  const thId = useId();
  const vId = useId();
  const [threshold, setThreshold] = useState(String(p.settings.threshold));
  const [vendor, setVendor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const providerName = p.provider === "openai" ? "OpenAI" : "Anthropic";

  useEffect(() => setThreshold(String(p.settings.threshold)), [p.settings.threshold]);

  const addVendor = () => {
    const name = vendor.trim();
    if (!name || p.settings.knownVendors.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    p.onSettings({ knownVendors: [...p.settings.knownVendors, name] });
    setVendor("");
  };

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <h1>Settings and how it works</h1>
      </header>

      <section className="panel panel-regular stack" aria-labelledby="th-title">
        <h2 id="th-title">Manager approval threshold</h2>
        <div className="field narrow">
          <label htmlFor={thId}>Approvals above this total need a manager</label>
          <input
            id={thId}
            className="input num"
            type="number"
            min={1}
            step={100}
            inputMode="decimal"
            value={threshold}
            data-testid="setting-threshold"
            onChange={(e) => {
              setThreshold(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() !== "" && Number.isFinite(n) && n > 0) p.onSettings({ threshold: n });
            }}
            onBlur={() => setThreshold(String(p.settings.threshold))}
          />
        </div>
        <p className="muted small">
          Compared with each invoice&apos;s total in its own currency (no exchange rates), so {formatMoney(p.settings.threshold, "GBP")} or {formatMoney(p.settings.threshold, "USD")} or {formatMoney(p.settings.threshold, "CAD")} alike. Invoices already waiting stay where they are.
        </p>
      </section>

      <section className="panel panel-regular stack" aria-labelledby="vendors-title">
        <h2 id="vendors-title">Known vendors</h2>
        <p className="muted small">An invoice from anyone not on this list gets an “unknown vendor” warning.</p>
        <ul className="chips" data-testid="known-vendors">
          {p.settings.knownVendors.length === 0 && <li className="muted">No vendors yet. Every invoice will be flagged as new.</li>}
          {p.settings.knownVendors.map((v) => (
            <li key={v} className="chip">
              {v}
              <button type="button" className="chip-x" aria-label={`Remove ${v}`} onClick={() => p.onSettings({ knownVendors: p.settings.knownVendors.filter((x) => x !== v) })}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="row-form">
          <div className="field grow">
            <label htmlFor={vId}>Add a vendor</label>
            <input id={vId} className="input" value={vendor} placeholder="Vendor name" data-testid="vendor-input" onChange={(e) => setVendor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVendor()} />
          </div>
          <button type="button" className="btn btn-secondary" onClick={addVendor} disabled={!vendor.trim()} data-testid="vendor-add">
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
      </section>

      <section className="panel panel-regular stack" aria-labelledby="ai-title">
        <div className="section-head">
          <h2 id="ai-title">Read your own invoices (optional)</h2>
          <span className={`badge ${p.apiKey.trim() ? "badge-live" : "badge-demo"}`}>{p.apiKey.trim() ? "Key set for this tab" : "No key · demo mode"}</span>
        </div>
        <fieldset className="segmented" data-testid="provider-toggle">
          <legend>AI provider</legend>
          {(["openai", "anthropic"] as const).map((v) => (
            <label key={v} className={p.provider === v ? "is-on" : ""}>
              <input type="radio" name="provider" value={v} checked={p.provider === v} onChange={() => p.onProvider(v)} />
              {v === "openai" ? "OpenAI" : "Anthropic"}
            </label>
          ))}
        </fieldset>
        <p className="muted small">
          Model: {p.provider === "openai" ? OPENAI_MODEL : ANTHROPIC_MODEL}. {p.provider === "openai" ? "PDFs are turned into an image of page 1 first." : "PDFs are read natively."}
        </p>
        <div className="field">
          <label htmlFor={keyId}>{providerName} API key</label>
          <input
            id={keyId}
            className="input"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder={p.provider === "openai" ? "sk-…" : "sk-ant-…"}
            value={p.apiKey}
            onChange={(e) => p.onKey(e.target.value)}
            aria-describedby={hintId}
            data-testid="api-key-input"
          />
          <p id={hintId} className="muted small">
            Kept in memory only. Sent straight to {providerName}, never stored (not in local storage, cookies or the URL). Gone when you refresh.
          </p>
        </div>
      </section>

      <section className="panel panel-regular stack-sm" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset the demo</h2>
        <p className="muted small">Your edits, decisions, uploads and settings are saved in this browser only. Reset puts the ten sample invoices back exactly as they started.</p>
        {confirming ? (
          <div className="confirm" role="alertdialog" aria-labelledby="reset-q" data-testid="reset-dialog">
            <p id="reset-q">
              <strong>Reset everything?</strong> This deletes your uploads, edits and decisions in this browser. It can&apos;t be undone.
            </p>
            <div className="actions">
              <button type="button" className="btn btn-danger" data-testid="reset-confirm" onClick={() => { setConfirming(false); p.onReset(); }}>
                Yes, reset the demo
              </button>
              <button type="button" className="btn btn-secondary" data-testid="reset-cancel" onClick={() => setConfirming(false)}>
                Keep my data
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn btn-secondary" data-testid="reset-demo" onClick={() => setConfirming(true)}>
              <Icon name="refresh" size={16} /> Reset demo
            </button>
          </div>
        )}
      </section>

      <HowItWorks />
    </div>
  );
}
