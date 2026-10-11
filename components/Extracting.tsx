"use client";

import { useEffect, useState } from "react";

import { PreviewCard } from "./Review";

const MESSAGES = ["Looking at the layout…", "Reading the line items…", "Checking the maths…"];

export default function Extracting({ previewUrl, name, onCancel }: { previewUrl: string | null; name: string; onCancel: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, MESSAGES.length - 1)), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="review-grid fade-in" data-testid="extracting">
      <PreviewCard url={previewUrl} name={name} loading={!previewUrl} />
      <div className="stack">
        <div className="panel panel-regular stack" aria-busy="true">
          <div className="section-head">
            <h2>Reading your invoice</h2>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <p role="status" className="muted status-line">
            <span className="spinner" aria-hidden="true" /> {MESSAGES[i]}
          </p>
          <div className="skel-fields" aria-hidden="true">
            <div className="skeleton sk-wide" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
        <div className="panel panel-regular stack-sm" aria-hidden="true">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="skel-row" style={{ animationDelay: `${r * 0.25}s` }}>
              <div className="skeleton sk-desc" />
              <div className="skeleton sk-num" />
              <div className="skeleton sk-num" />
              <div className="skeleton sk-num" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
