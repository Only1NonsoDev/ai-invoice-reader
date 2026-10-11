"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { SAMPLES, type Sample } from "@/lib/samples";
import type { Invoice } from "@/lib/types";
import { extractInvoice, ExtractionError, providerLabel, type Provider } from "@/lib/vision";
import Extracting from "./Extracting";
import { assetUrl, checkFile, prepareFile } from "./files";
import Review, { type Source } from "./Review";
import Upload from "./Upload";
import { Icon, Stepper, type StepState } from "./ui";

const SAMPLE_DELAY_MS = 1100;

type View =
  | { phase: "upload" }
  | { phase: "extracting"; name: string; previewUrl: string | null }
  | { phase: "review"; id: number; name: string; previewUrl: string | null; invoice: Invoice; source: Source }
  | { phase: "error"; name: string; previewUrl: string | null; message: string };

export default function InvoiceReader({ children }: { children?: ReactNode }) {
  const [view, setView] = useState<View>({ phase: "upload" });
  const [staged, setStaged] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  // The API key lives only in React state: never written to storage, cookies or the URL.
  const [apiKey, setApiKey] = useState("");
  const [exported, setExported] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const runId = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  const releasePreview = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);

  const cancelWork = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelWork();
      releasePreview();
    },
    [cancelWork, releasePreview],
  );

  // Move focus/scroll to the top of the flow when the step changes.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [view.phase]);

  const reset = () => {
    cancelWork();
    releasePreview();
    setExported(false);
    setView({ phase: "upload" });
  };

  const startSample = (s: Sample) => {
    cancelWork();
    releasePreview();
    setExported(false);
    const previewUrl = assetUrl(s.file);
    setView({ phase: "extracting", name: `${s.title} (sample)`, previewUrl });
    timer.current = setTimeout(() => {
      setView({
        phase: "review",
        id: ++runId.current,
        name: `${s.title} (sample)`,
        previewUrl,
        invoice: s.invoice,
        source: { kind: "sample" },
      });
    }, SAMPLE_DELAY_MS);
  };

  const runLive = async (file: File) => {
    cancelWork();
    releasePreview();
    setExported(false);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setView({ phase: "extracting", name: file.name, previewUrl: null });
    let previewUrl: string | null = null;
    try {
      const prepared = await prepareFile(file, provider);
      previewUrl = prepared.previewUrl;
      objectUrl.current = previewUrl;
      if (ctrl.signal.aborted) return;
      setView({ phase: "extracting", name: file.name, previewUrl });
      const invoice = await extractInvoice({ provider, apiKey, file: prepared.payload, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setView({
        phase: "review",
        id: ++runId.current,
        name: file.name,
        previewUrl,
        invoice,
        source: { kind: "live", label: providerLabel(provider) },
      });
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      const message =
        e instanceof ExtractionError ? e.message : "Something went wrong while reading that file. Please try again.";
      setView({ phase: "error", name: file.name, previewUrl, message });
    }
  };

  const chooseFile = (f: File | null) => {
    if (!f) return setStaged(null), setFileError(null);
    const problem = checkFile(f);
    setFileError(problem);
    setStaged(problem ? null : f);
  };

  const steps: StepState[] =
    view.phase === "upload"
      ? ["current", "todo", "todo", "todo"]
      : view.phase === "extracting"
        ? ["done", "current", "todo", "todo"]
        : view.phase === "error"
          ? ["done", "error", "todo", "todo"]
          : exported
            ? ["done", "done", "done", "current"]
            : ["done", "done", "current", "todo"];

  return (
    <div className="app">
      <div className="backdrop" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      <header className="header glass glass-float">
        <button type="button" className="brand" onClick={reset} aria-label="AI Invoice Reader, start over">
          <span className="logo" aria-hidden="true">
            <Icon name="file" size={20} />
          </span>
          <span className="brand-name">Invoice Reader</span>
        </button>
        <Stepper states={steps} />
      </header>

      <main className="container" id="main">
        <div ref={topRef} className="scroll-anchor" />
        {view.phase === "upload" && (
          <Upload
            staged={staged}
            fileError={fileError}
            provider={provider}
            apiKey={apiKey}
            onSample={startSample}
            onFile={chooseFile}
            onProvider={setProvider}
            onKey={setApiKey}
            onExtract={() => staged && runLive(staged)}
          />
        )}
        {view.phase === "extracting" && <Extracting name={view.name} previewUrl={view.previewUrl} onCancel={reset} />}
        {view.phase === "error" && (
          <div className="panel panel-regular error-panel fade-in" role="alert" data-testid="error-panel">
            <span className="error-icon">
              <Icon name="alert" size={28} />
            </span>
            <h2>We couldn&apos;t read that invoice</h2>
            <p data-testid="error-message">{view.message}</p>
            <div className="actions center">
              {staged && (
                <button type="button" className="btn btn-primary" onClick={() => runLive(staged)} data-testid="retry-button">
                  <Icon name="refresh" size={16} /> Try again
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Choose another invoice
              </button>
            </div>
          </div>
        )}
        {view.phase === "review" && (
          <Review
            key={view.id}
            original={view.invoice}
            source={view.source}
            name={view.name}
            previewUrl={view.previewUrl}
            onNew={reset}
            onExported={() => setExported(true)}
          />
        )}
        {children}
      </main>

      <footer className="footer">
        <p>
          Portfolio demo. All invoices, companies and addresses in the samples are fictional. {SAMPLES.length} samples included.
        </p>
      </footer>
    </div>
  );
}
