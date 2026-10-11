import type { ReactNode } from "react";

export type StepState = "todo" | "current" | "done" | "error";

const STEPS = ["Upload", "Extracting", "Review", "Export"];

export function Stepper({ states }: { states: StepState[] }) {
  return (
    <ol className="stepper" aria-label="Progress" data-testid="stepper">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className="step"
          data-state={states[i]}
          data-testid={`step-${i + 1}`}
          aria-current={states[i] === "current" ? "step" : undefined}
        >
          <span className="step-dot" aria-hidden="true">
            {states[i] === "done" ? <Icon name="check" size={14} /> : states[i] === "error" ? "!" : i + 1}
          </span>
          <span className="step-label">{label}</span>
          <span className="sr-only">
            {states[i] === "done" ? " (complete)" : states[i] === "error" ? " (problem)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

type IconName = "check" | "alert" | "upload" | "file" | "download" | "x" | "undo" | "plus" | "sparkle" | "refresh";

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M4 12.5l5 5L20 6.5" />,
  alert: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sparkle: <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
