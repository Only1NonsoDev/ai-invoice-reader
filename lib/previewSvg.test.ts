import assert from "node:assert/strict";
import { test } from "node:test";
import { rebaseSvgDates } from "./previewSvg";

const svg = `<svg><text x="1" data-slot="issueDate" data-fmt="dmy">01 Jan 2020</text><text data-slot="dueDate" data-fmt="mdy" y="2">Jan 31, 2020</text><text>Other</text></svg>`;

test("rewrites dated slots in each format and leaves the rest alone", () => {
  const out = rebaseSvgDates(svg, { issueDate: "2026-10-02", dueDate: "2026-11-05" });
  assert.match(out, />02 Oct 2026</);
  assert.match(out, />Nov 5, 2026</);
  assert.match(out, />Other</);
});

test("a missing date keeps the original text", () => {
  assert.match(rebaseSvgDates(svg, {}), />01 Jan 2020</);
});
