"use client";

import { useId, useRef, useState } from "react";

import { SAMPLES, type Sample } from "@/lib/samples";
import { ANTHROPIC_MODEL, OPENAI_MODEL, type Provider } from "@/lib/vision";
import { assetUrl, formatBytes } from "./files";
import { Icon } from "./ui";

type Props = {
  staged: File | null;
  fileError: string | null;
  provider: Provider;
  apiKey: string;
  onSample: (s: Sample) => void;
  onFile: (f: File | null) => void;
  onProvider: (p: Provider) => void;
  onKey: (k: string) => void;
  onExtract: () => void;
};

export default function Upload(p: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyId = useId();
  const hintId = useId();
  const ready = !!p.staged && p.apiKey.trim().length > 0;
  const providerName = p.provider === "openai" ? "OpenAI" : "Anthropic";

  return (
    <div className="stack-lg fade-in">
      <section className="hero">
        <h1>Turn invoices into clean, checked data.</h1>
        <p className="lede">
          Drop in a PDF or photo and a vision model reads the vendor, dates and line items. Then the app re-does the maths so
          you can spot mistakes before they reach your books.
        </p>
      </section>

      <section aria-labelledby="samples-title" className="stack">
        <div className="section-head">
          <h2 id="samples-title">Try a sample</h2>
          <span className="badge badge-demo" data-testid="demo-note">
            Demo mode · no API key
          </span>
        </div>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="sample-card glass lift" data-testid={`sample-${s.id}`} onClick={() => p.onSample(s)}>
              <span className="sample-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(s.file)} alt="" loading="lazy" />
              </span>
              <span className="sample-text">
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="own-title" className="panel panel-regular own stack">
        <div className="section-head">
          <h2 id="own-title">Or read your own invoice</h2>
          <span className="badge badge-live">Uses your API key</span>
        </div>

        <div className="own-grid">
          <div className="stack-sm">
            {p.staged ? (
              <div className="staged" data-testid="staged-file">
                <span className="staged-icon">
                  <Icon name="file" size={22} />
                </span>
                <span className="staged-text">
                  <strong>{p.staged.name}</strong>
                  <span>{formatBytes(p.staged.size)}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => p.onFile(null)} aria-label="Remove file">
                  <Icon name="x" />
                </button>
              </div>
            ) : (
              <label
                className={`dropzone${dragging ? " is-drag" : ""}`}
                data-testid="dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  p.onFile(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only-input"
                  accept="application/pdf,image/*"
                  data-testid="file-input"
                  onChange={(e) => {
                    p.onFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <span className="drop-icon">
                  <Icon name="upload" size={26} />
                </span>
                <strong>Drop an invoice here</strong>
                <span className="muted">or tap to choose a PDF or image</span>
              </label>
            )}
            {p.fileError && (
              <p className="inline-error" role="alert" data-testid="file-error">
                <Icon name="alert" size={16} /> {p.fileError}
              </p>
            )}
          </div>

          <div className="stack-sm">
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
              Model: {p.provider === "openai" ? OPENAI_MODEL : ANTHROPIC_MODEL}.{" "}
              {p.provider === "openai" ? "PDFs are turned into an image of page 1 first." : "PDFs are read natively."}
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
                Kept in memory only. Sent straight to {providerName}, never stored. Gone on refresh.
              </p>
            </div>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={p.onExtract} data-testid="extract-button">
            <Icon name="sparkle" /> Extract invoice
          </button>
          {!ready && (
            <span className="muted small" data-testid="extract-hint">
              {!p.staged && !p.apiKey.trim()
                ? "Choose a file and paste a key to begin."
                : !p.staged
                  ? "Choose a file to begin."
                  : "Paste your API key to begin."}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
