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
import type { Block, Cell, ColumnDef, TableRow } from "../../src/data/viewmodel/index.js";

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

// --- the S-series' column and drop tables (A03 CP6) ------------------------
//
// Read from the markdown for the same reason the row counts are. A fixture
// restating S03's drop order would agree with itself while the spec drifted, and
// the drop tables are the one part of a surface that was verified against an
// independent implementation of the planner during specification — so a
// disagreement locates a defect on one side or the other, which is only true if
// the comparison reads what a human reads.

/** A markdown table, as header cells and body rows of cells. */
function tables(file: string): readonly Readonly<{ header: readonly string[]; rows: readonly (readonly string[])[] }>[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const out: { header: readonly string[]; rows: (readonly string[])[] }[] = [];

  const cellsOf = (line: string): readonly string[] =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  for (let i = 0; i < lines.length; i += 1) { // cells-ok
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    // A header is a `| … |` row followed by the `|---|` separator. Anything else
    // beginning with a pipe is a body row of a table already open.
    if (!line.trim().startsWith("|") || !/^\|[\s|:-]+\|$/.test(next.trim())) continue;

    const header = cellsOf(line);
    const rows: (readonly string[])[] = [];
    let j = i + 2;
    while (j < lines.length && (lines[j] ?? "").trim().startsWith("|")) {
      rows.push(cellsOf(lines[j] ?? ""));
      j += 1;
    }
    out.push({ header, rows });
    i = j - 1;
  }

  return out;
}

/** The keys named in backticks in a cell. `none` and `all eleven` name none. */
function keysIn(cell: string): readonly string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
}

/** The widths a drop row applies to — `160 · 120 · 100` is three. */
function widthsIn(cell: string): readonly number[] {
  return [...cell.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

export type SurfaceColumn = Readonly<{
  key: string;
  priority: number;
  minWidth: number;
  flex: boolean;
  sortable: boolean;
}>;

/**
 * A surface's declared columns, in declared order.
 *
 * S06 merges two into one row — `| expand · glyph | 100 | 1 · 1 | — |` — so a
 * name containing `·` is split, its minimums with it. The merged form is the
 * spec's, and reading it is cheaper than asking five surfaces to change shape for
 * a test.
 */
export function surfaceColumns(file: string): readonly (readonly SurfaceColumn[])[] {
  return tables(file)
    .filter((t) => t.header[0] === "Column" && t.header[1] === "Priority")
    .map((t) =>
      t.rows.flatMap((row): SurfaceColumn[] => {
        const names = (row[0] ?? "").split("·").map((n) => n.trim().replace(/`/g, ""));
        const mins = (row[2] ?? "").split("·").map((m) => Number(m.trim()));
        const priority = Number(row[1]);
        const flex = (row[3] ?? "") === "yes";
        const sortable = (row[4] ?? "") === "yes";
        return names.map((key, i) => ({
          key,
          priority,
          minWidth: mins[i] ?? mins[0] ?? 1,
          flex,
          sortable,
        }));
      }),
    );
}

export type SurfaceDrops = Readonly<{ width: number; dropped: readonly string[] }>;

/**
 * A surface's stated drop order, one entry per width.
 *
 * `column` selects which table's drops when a surface states two — S06 draws
 * families and versions side by side in one table with two cells per row.
 */
export function surfaceDrops(file: string, column = 1): readonly SurfaceDrops[] {
  const table = tables(file).find(
    (t) => t.header[0] === "Width" && (t.header[column] ?? "") !== "",
  );
  if (table === undefined) return [];

  return table.rows.flatMap((row) =>
    widthsIn(row[0] ?? "").map((width) => ({ width, dropped: keysIn(row[column] ?? "") })),
  );
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

// --- the table-bearing surfaces (HEIGHT_AUDIT's C11 deferrals) -------------
//
// Each region is drawn from a `table`, so measuring one before C11 registered
// measured the `raw` fallback — which is why HEIGHT_AUDIT deferred all five by
// name rather than leaving them untested and unremarked.
//
// The columns are the surfaces' own, priorities included, because the height of a
// table region depends on which columns survive: a dropped column becomes an
// expand row, and an expand row is a row.

/** A column set from a surface's §3, in declared order. */
function cols(
  rows: readonly (readonly [key: string, priority: number, min: number, flex?: boolean])[],
): readonly ColumnDef[] {
  return rows.map(([key, priority, minWidth, flex]) => ({
    key,
    // `expand` and `glyph` are one cell wide and headed by nothing — a label there
    // would truncate to an ellipsis, which is what the illustrations show as blank.
    label: key === "expand" || key === "glyph" ? "" : key,
    align: "left" as const,
    priority,
    minWidth,
    sortable: true,
    ...(flex === true ? { flex: true } : {}),
    ...(key === "expand" ? { role: "expand" as const } : {}),
  }));
}

function cellsOfRow(id: string, values: Readonly<Record<string, string>>): TableRow {
  const out: Record<string, Cell> = {};
  for (const [key, text] of Object.entries(values)) out[key] = { text };
  return { id, cells: out };
}

const S03_TABLE: Block = block({
  kind: "table",
  id: "s03-runs",
  gapBefore: true,
  columns: cols([
    ["expand", 100, 1],
    ["glyph", 100, 1],
    ["uuid", 90, 7],
    ["family", 85, 12, true],
    ["status", 80, 11],
    ["detail", 65, 12, true],
    ["metric", 60, 8],
    ["age", 50, 6],
    ["kind", 30, 10],
    ["owner", 20, 8],
    ["mr", 10, 6],
  ]),
  rows: [
    cellsOfRow("a3f9b21", { uuid: "a3f9b21", kind: "candidate", family: "digit-classifier", status: "running", detail: "ep 17/40", metric: "0.0372", age: "23m", owner: "malachy", mr: "!1248" }),
    cellsOfRow("7c2d4e1", { uuid: "7c2d4e1", kind: "experiment", family: "decoder-zoom", status: "succeeded", metric: "0.0089", age: "41m", owner: "malachy", mr: "!1201" }),
    cellsOfRow("2e8a04c", { uuid: "2e8a04c", kind: "experiment", family: "graphsage", status: "failed", detail: "OOM at ep 3", metric: "—", age: "1h 12m", owner: "priya", mr: "!1188" }),
    cellsOfRow("f410d99", { uuid: "f410d99", kind: "candidate", family: "flow-predictor", status: "queued", metric: "—", age: "3m", owner: "malachy", mr: "—" }),
  ],
});

const S05_TABLE: Block = block({
  kind: "table",
  id: "s05-services",
  gapBefore: true,
  columns: cols([
    ["expand", 100, 1],
    ["glyph", 100, 1],
    ["name", 95, 16, true],
    ["replicas", 85, 7],
    ["status", 80, 10],
    ["errors", 70, 7],
    ["version", 65, 7],
    ["p99", 60, 6],
    ["req/s", 50, 7],
    ["p50", 40, 6],
    ["age", 30, 5],
  ]),
  rows: ["digit-classifier", "flow-predictor", "volatility-estimator", "orderbook-pressure"].map(
    (name, i) => cellsOfRow(name, { name, replicas: "3/3", status: "healthy", errors: "0.02%", version: "de29117", p99: "45ms", "req/s": "432", p50: "18ms", age: `${String(i + 2)}d` }),
  ),
});

const S06_FAMILIES: Block = block({
  kind: "table",
  id: "s06-families",
  gapBefore: true,
  columns: cols([
    ["expand", 100, 1],
    ["glyph", 100, 1],
    ["family", 95, 18, true],
    ["serving", 85, 7],
    ["latest", 80, 7],
    ["versions", 60, 8],
    ["updated", 40, 7],
  ]),
  rows: ["digit-classifier", "flow-predictor", "orderbook-pressure", "latency-anomaly-gnn", "fill-rate"].map(
    (family) => cellsOfRow(family, { family, serving: "de29117", latest: "de29117", versions: "4", updated: "2h ago" }),
  ),
});

const S06_VERSIONS: Block = block({
  kind: "table",
  id: "s06-versions",
  gapBefore: true,
  columns: cols([
    ["expand", 100, 1],
    ["glyph", 100, 1],
    ["version", 95, 7],
    ["state", 85, 9],
    ["metric", 70, 12, true],
    ["run", 60, 7],
    ["mr", 50, 6],
    ["created", 40, 7],
  ]),
  rows: ["de29117", "b4f0c12", "9e2a55d", "1f0c8b3"].map((version) =>
    cellsOfRow(version, { version, state: "serving", metric: "AUC 0.912", run: "c4e1f23", mr: "!1244", created: "2h ago" }),
  ),
});

const S14_KEYS: Block = block({
  kind: "table",
  id: "s14-keys",
  gapBefore: true,
  columns: cols([
    ["expand", 100, 1],
    ["key", 95, 22, true],
    ["value", 90, 24, true],
    ["source", 70, 8],
  ]),
  rows: [
    ["current_context", "fmx-prod", "config"],
    ["ui.theme", "dark", "config"],
    ["ui.show_banner", "true", "default"],
    ["terminal.colour_depth", "24", "env"],
    ["terminal.mouse", "true", "default"],
    ["history.cap", "10000", "default"],
  ].map(([key, value, source]) =>
    cellsOfRow(key ?? "", { key: key ?? "", value: value ?? "", source: source ?? "" }),
  ),
});

/** The contexts region: two rows, no header — the headerless list C04 §3 names. */
const S14_CONTEXTS: Block = block({
  kind: "table",
  id: "s14-contexts",
  gapBefore: true,
  showHeader: false,
  columns: cols([
    ["glyph", 100, 1],
    ["name", 95, 13],
    ["url", 80, 29, true],
    ["token", 60, 18],
  ]),
  rows: [
    cellsOfRow("fmx-prod", { name: "fmx-prod", url: "https://prism.fmx.io/v1", token: "token valid · 30d" }),
    cellsOfRow("fmx-staging", { name: "fmx-staging", url: "https://staging.prism.fmx.io", token: "token expired" }),
  ],
});

const S15_SECRETS: Block = block({
  kind: "table",
  id: "s15-secrets",
  gapBefore: true,
  columns: cols([
    ["glyph", 100, 1],
    ["name", 95, 22, true],
    ["owner", 80, 15],
    ["age", 60, 6],
    ["note", 40, 15],
  ]),
  rows: [
    cellsOfRow("gitlab-readonly-token", { name: "gitlab-readonly-token", owner: "research-infra", age: "34d" }),
    cellsOfRow("minio-research-creds", { name: "minio-research-creds", owner: "research-infra", age: "34d" }),
    cellsOfRow("wandb-api-key", { name: "wandb-api-key", owner: "malachy", age: "12d" }),
    cellsOfRow("huggingface-token", { name: "huggingface-token", owner: "malachy", age: "8d", note: "not accessible" }),
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
        glyph: "warn",
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
  {
    file: "docs/surfaces/S03_ps_list.md",
    fence: 0,
    label: "S03 §2 — the ps list at 100",
    width: 98,
    blocks: [
      block({ kind: "rule", id: "s03-rule", label: "ps · 4 of 11 · --mine · last 24h" }),
      block({
        kind: "pills",
        id: "s03-kinds",
        gapBefore: true,
        chips: [{ label: "all ×11" }, { label: "training ×9" }, { label: "evaluation ×2" }],
      }),
      block({
        kind: "pills",
        id: "s03-statuses",
        chips: [
          { label: "● running ×1" },
          { label: "✓ succeeded ×6" },
          { label: "✗ failed ×2" },
          { label: "○ queued ×1" },
        ],
      }),
      S03_TABLE,
      block({
        kind: "pills",
        id: "s03-actions",
        gapBefore: true,
        chips: [{ label: "⏎ detail" }, { label: "␣ expand" }, { label: "≡ logs" }, { label: "⚡ events" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S05_serving.md",
    fence: 0,
    label: "S05 §2 — the serving list",
    width: 78,
    blocks: [
      block({ kind: "rule", id: "s05-rule", label: "serving · 7 healthy · 1 degraded" }),
      S05_TABLE,
      block({
        kind: "pills",
        id: "s05-actions",
        gapBefore: true,
        chips: [{ label: "⏎ detail" }, { label: "␣ expand" }, { label: "↻ restart" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S06_models.md",
    fence: 0,
    label: "S06 §2 — the family list",
    width: 78,
    blocks: [
      block({ kind: "rule", id: "s06-rule", label: "models · 6 families · 14 versions" }),
      S06_FAMILIES,
      block({
        kind: "pills",
        id: "s06-actions",
        gapBefore: true,
        chips: [{ label: "⏎ versions" }, { label: "␣ expand" }, { label: "↑ promote" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S06_models.md",
    fence: 1,
    label: "S06 §3 — the version list",
    width: 78,
    blocks: [
      block({ kind: "rule", id: "s06v-rule", label: "models · digit-classifier · 4 versions" }),
      S06_VERSIONS,
      block({
        kind: "pills",
        id: "s06v-actions",
        gapBefore: true,
        chips: [{ label: "⏎ detail" }, { label: "␣ expand" }, { label: "↑ promote" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S14_config.md",
    fence: 0,
    label: "S14 §2 — config, two table regions",
    width: 78,
    blocks: [
      block({ kind: "rule", id: "s14-rule", label: "config · ~/.prism/config.toml" }),
      S14_KEYS,
      block({ kind: "rule", id: "s14-contexts-rule", label: "contexts · 2", gapBefore: true }),
      S14_CONTEXTS,
      block({
        kind: "pills",
        id: "s14-actions",
        gapBefore: true,
        chips: [{ label: "⏎ edit" }, { label: "␣ expand" }, { label: "↕ switch context" }, { label: "⊘ reset" }],
      }),
    ],
  },
  {
    file: "docs/surfaces/S15_identity.md",
    fence: 4,
    label: "S15 §5 — the secrets list",
    width: 78,
    blocks: [
      block({ kind: "rule", id: "s15-rule", label: "secrets · 4 · names only" }),
      S15_SECRETS,
      block({
        kind: "notice",
        id: "s15-notice",
        gapBefore: true,
        tone: "muted",
        text: "Values are never shown by the CLI.",
      }),
      block({
        kind: "pills",
        id: "s15-actions",
        gapBefore: true,
        chips: [{ label: "≡ /secrets <target>" }],
      }),
    ],
  },
]);
