// The S-series' illustrated frames, as documents.
//
// An illustration is a picture until something composes it. These fixtures pair
// each frame with the blocks it is drawn from, so `test/contract/surfaces.test.ts`
// can assert that composing the blocks yields the rows the surface draws — which
// is what turns `docs/surfaces/HEIGHT_AUDIT.md` from a one-off reading into a
// regression test.
//
// The row count is **read from the markdown**, never restated here. A fixture
// that carried its own expected number would agree with itself forever while the
// illustration drifted, which is the failure this exists to prevent: it is what
// let S07 draw a `diff` with no header through four revisions of the spec.
import { readFileSync } from "node:fs";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

export type SurfaceFrame = Readonly<{
  /** The spec file, and which fenced illustration inside it. */
  file: string;
  fence: number;
  /** What the frame is, for a failure message. */
  label: string;
  /** The content width, excluding S01's two-cell frame gutter. */
  width: number;
  blocks: readonly Block[];
}>;

/** Every fenced block in a markdown file, in order. */
export function fences(file: string): readonly string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
}

/**
 * The rows an illustration draws.
 *
 * One line is one row: the frame gutter (`▌`) and the panel borders are chrome
 * on a row, not rows of their own — except a panel's top and bottom, which are
 * rows the block itself renders and are counted like any other line.
 */
export function illustratedRows(file: string, fence: number): number {
  const found = fences(file)[fence];
  if (found === undefined) throw new Error(`${file} has no fenced block ${fence}`);
  return found.replace(/\n$/, "").split("\n").length;
}

// --- S07 diff --------------------------------------------------------------

const S07_IDENTITY: Block = block({
  kind: "diff",
  id: "s07-identity",
  gapBefore: true,
  rows: [
    { field: "family", a: "digit-classifier", b: "digit-classifier", comparison: "same" },
    { field: "kind", a: "candidate", b: "experiment", comparison: "changed" },
    { field: "status", a: "succeeded", b: "succeeded", comparison: "same" },
    { field: "job", a: "TrainingJob", b: "TrainingJob", comparison: "same" },
    { field: "owner", a: "malachy", b: "malachy", comparison: "same" },
    { field: "resources", a: "2×GPU · 16Gi", b: "1×GPU · 8Gi", comparison: "changed" },
    { field: "duration", a: "14m 20s", b: "22m 04s", comparison: "changed" },
  ],
});

const S07_METRICS: Block = block({
  kind: "diff",
  id: "s07-metrics",
  gapBefore: true,
  rows: [
    { field: "loss", a: "0.0312", b: "0.0372", comparison: "better" },
    { field: "val_accuracy", a: "0.968", b: "0.958", comparison: "better" },
    { field: "auprc", a: "0.912", b: "0.930", comparison: "worse" },
    { field: "calibration", a: "0.061", b: "0.058", comparison: "changed" },
    { field: "train_time_s", a: "862", b: "1324", comparison: "changed" },
  ],
});

// --- S08 validate ----------------------------------------------------------

const S08_STEPS_OK: Block = block({
  kind: "steps",
  id: "s08-steps",
  gapBefore: true,
  steps: [
    { label: "importing target", state: "done", detail: "job resolved" },
    { label: "tier-1 rules", state: "done", detail: "22 rules · 0 errors · 587ms" },
    { label: "resource estimate", state: "done", detail: "1×GPU · 8Gi · ~14 minutes" },
  ],
});

const S08_RESOLVED: Block = block({
  kind: "keyValue",
  id: "s08-resolved",
  gapBefore: true,
  rows: [
    { label: "model", value: "fmx_models.models:DigitClassifier" },
    { label: "train_data", value: "fmx_models.data.pipeline:train_pipeline" },
    { label: "resources", value: "1×GPU · 8Gi        (model floor 1×GPU 8Gi — satisfied)" },
    { label: "callbacks", value: "3                  MLflowLogger · Checkpoint · EarlyStopping" },
    { label: "estimated", value: "~14 minutes        based on similar runs · confidence high" },
  ],
});

export const SURFACE_FRAMES: readonly SurfaceFrame[] = Object.freeze([
  {
    file: "docs/surfaces/S07_diff.md",
    fence: 0,
    label: "S07 §2 — the two-up comparison",
    width: 98,
    blocks: [
      block({ kind: "rule", id: "s07-rule", label: "diff · a3f9b21 ↔ 7c2d4e1" }),
      S07_IDENTITY,
      block({ kind: "rule", id: "s07-metrics-rule", label: "metrics", gapBefore: true }),
      S07_METRICS,
      block({
        kind: "pills",
        id: "s07-actions",
        gapBefore: true,
        chips: [{ label: "≡ a3f9b21" }, { label: "≡ 7c2d4e1" }, { label: "{ } json" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S08_validate.md",
    fence: 0,
    label: "S08 §2 — validation passed",
    width: 78,
    blocks: [
      block({
        kind: "rule",
        id: "s08-rule",
        label: "validate · fmx_models.jobs.training:job · T1 · in-process",
      }),
      S08_STEPS_OK,
      S08_RESOLVED,
      block({
        kind: "notice",
        id: "s08-warning",
        gapBefore: true,
        tone: "warn",
        glyph: "▲",
        text:
          "W004  ESCAPE_HATCH_USED\n" +
          "MultiMetricEarlyStopping replaces=prism.EarlyStopping\n" +
          "Forfeited: built-in EarlyStopping behaviour",
      }),
      block({
        kind: "tip",
        id: "s08-tip",
        gapBefore: true,
        text: "next: /test …   /experiment submit …                                  587ms",
      }),
    ],
  },
  {
    file: "docs/surfaces/S08_validate.md",
    fence: 1,
    label: "S08 §3 — validation failed",
    width: 78,
    blocks: [
      block({
        kind: "rule",
        id: "s08f-rule",
        label: "validate · fmx_models.jobs.training:job · T1 · in-process",
      }),
      block({
        kind: "steps",
        id: "s08f-steps",
        gapBefore: true,
        steps: [
          { label: "importing target", state: "done", detail: "job resolved" },
          { label: "tier-1 rules", state: "failed", detail: "22 rules · 2 errors" },
          { label: "resource estimate", state: "pending", detail: "not run" },
        ],
      }),
      block({
        kind: "keyValue",
        id: "s08f-first",
        gapBefore: true,
        rows: [
          { label: "T1-008", value: "TrainingConfig requires at least one of: max_epochs, total_steps" },
          { label: "file", value: "fmx_models/jobs/training.py:18" },
          { label: "field", value: "config=TrainingConfig(batch_size=128, mixed_precision=True)" },
          { label: "fix", value: "add max_epochs=N or total_steps=N" },
        ],
      }),
      block({
        kind: "keyValue",
        id: "s08f-second",
        gapBefore: true,
        rows: [
          { label: "Rule 5", value: "Callback supports mismatch" },
          { label: "file", value: "fmx_models/jobs/training.py:24" },
          { label: "callback", value: "fmx_models.callbacks:MultiMetricEarlyStopping" },
          { label: "issue", value: 'supports={"inference"}, but job is a TrainingJob' },
          { label: "fix", value: 'add "training" to the callback\'s supports set' },
        ],
      }),
      block({
        kind: "tip",
        id: "s08f-tip",
        gapBefore: true,
        text: "? T1-008 for the full rule                                    exit 1",
      }),
    ],
  },
]);
