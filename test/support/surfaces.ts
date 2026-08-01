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
import type { Block, Cell, ColumnDef, Glyph, TableRow } from "../../src/data/viewmodel/index.js";

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

/**
 * The rows a figure's *frame* has, with the diagram's boundary marks removed.
 *
 * **Two conventions, both unstated until C22 hit one.** S01 §2 separates its
 * regions with bare horizontal rules; S12 and S13 draw a full box with the
 * title in the top rail. Neither is rendered — `tui-kit` draws no frame around
 * anything, and S01 §3's arithmetic is header, viewport, prompt, footer with
 * nothing between them.
 *
 * Counting the marks costs two rows the terminal does not have, and for the
 * boxed figures two cells on every row. That is a wrap, and a wrap scrolls the
 * alternate screen.
 *
 * Mechanical rather than remembered, because remembering is what failed: S01's
 * deferral sat unwritable for two commits while §2 and §3 disagreed and nothing
 * said which was the artefact.
 */
export function frameRows(file: string, fence: number): number {
  return frameLines(file, fence).length;
}

/** A bare separator: box-drawing and whitespace, nothing else. */
const BARE_RULE = /^\s*[─━]{3,}\s*$/;
/** The top or bottom of a box, wherever its title sits. */
const BOX_EDGE = /^\s*[┌└╭╰]/;
/** A side rail, and the two cells it costs. */
const RAIL = /^(\s*)│(.*)│\s*$/;

export function frameLines(file: string, fence: number): readonly string[] {
  const found = fences(file)[fence];
  if (found === undefined) throw new Error(`${file} has no fenced block ${fence}`);

  return found
    .replace(/\n$/, "")
    .split("\n")
    .filter((l) => !BARE_RULE.test(l) && !BOX_EDGE.test(l))
    .map((l) => RAIL.exec(l)?.[2] ?? l);
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
  align: "left" | "right";
  truncateFrom: "start" | "end";
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
    .map((t) => {
      // **By header name, never by position.** The columns of these tables differ
      // between surfaces — S03 has `Sortable` and `Source`, S06 has neither — and
      // declaring `Align` shifted `Flex` one right in five files at once. A
      // positional reader survives that silently: it read `left` as the flex flag
      // and every flex column became false, which changes no drop order and so
      // fails no test. Same class as the illustrations this file exists to check.
      const at = (name: string): number => t.header.findIndex((h) => h === name);
      const col = {
        priority: at("Priority"),
        min: at("Min"),
        align: at("Align"),
        trunc: at("Trunc"),
        flex: at("Flex"),
        sortable: at("Sortable"),
      };

      return t.rows.flatMap((row): SurfaceColumn[] => {
        const cell = (i: number): string => (i < 0 ? "" : (row[i] ?? ""));
        const names = (row[0] ?? "").split("·").map((n) => n.trim().replace(/`/g, ""));
        const mins = cell(col.min).split("·").map((m) => Number(m.trim()));
        const priority = Number(cell(col.priority));
        // `**right**` — the spec emphasises the exceptions, so the marker is part
        // of the value as written.
        const align = cell(col.align).replace(/\*/g, "") === "right" ? "right" : "left";
        const truncateFrom = cell(col.trunc).replace(/\*/g, "") === "start" ? "start" : "end";
        const flex = cell(col.flex) === "yes";
        const sortable = cell(col.sortable) === "yes";
        return names.map((key, i) => ({
          key,
          priority,
          minWidth: mins[i] ?? mins[0] ?? 1,
          align: align as "left" | "right",
          truncateFrom: truncateFrom as "start" | "end",
          flex,
          sortable,
        }));
      });
    });
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

/**
 * S04 §3's training region — a rule, a plot, a progress bar and the metrics line.
 *
 * **The metrics line is a headerless `table`, not a `keyValue`.** The illustration
 * draws three label/value pairs on one row, and `keyValue` is one row per pair — so
 * as drawn it composes to three rows where the picture has one. That is the S08 §4
 * finding again (a `keyValue` drawn as columns), and it takes the remedy S08 §4
 * names: `table` with `showHeader: false`, which is the shape C04 §3 added the flag
 * for. Recorded here because the fixture is where the choice becomes visible.
 */
const S04_LOSS_PLOT: Block = block({
  kind: "plot",
  id: "s04-loss",
  gapBefore: true,
  form: "line",
  height: 5,
  axes: true,
  yFormat: "number",
  xLabels: ["epoch 0", "epoch 20", "now"],
  // Eighteen epochs, 0.82 down to the 0.0372 the metrics row states. Geometric so
  // the last value is exactly the stated one rather than approximately it.
  series: [
    {
      label: "loss",
      values: Array.from({ length: 18 }, (_, i) => 0.82 * (0.0372 / 0.82) ** (i / 17)),
    },
  ],
});

const S04_METRICS: Block = block({
  kind: "table",
  id: "s04-metrics",
  gapBefore: true,
  showHeader: false,
  columns: [
    { key: "loss", label: "loss", align: "left", priority: 90, minWidth: 18, flex: true, sortable: false },
    { key: "acc", label: "val_acc", align: "left", priority: 80, minWidth: 18, flex: true, sortable: false },
    { key: "eta", label: "eta", align: "left", priority: 70, minWidth: 10, flex: true, sortable: false },
  ],
  rows: [
    {
      id: "m",
      cells: {
        loss: { text: "loss 0.0372 ↓" },
        acc: { text: "val_acc 0.968 ↑" },
        eta: { text: "eta 18m" },
      },
    },
  ],
});

/**
 * S09 §2's success frame — and it was never waiting on C12.
 *
 * The deferral said "S04, S09, S13 … waits on C12" and S09 has no plot: its
 * composition is `rule, rule, steps, notice, rule, table, notice` (S09 T1.1). It
 * became writable when C11 landed and stayed exempt for a whole component, because
 * TD3 checks that a mapped path exists and nothing checks that a blocker names the
 * right component (`HEIGHT_AUDIT.md`).
 */
const S09_SMOKE_STEPS: Block = block({
  kind: "steps",
  id: "s09-smoke",
  gapBefore: true,
  steps: [
    { label: "1 batch through forward", state: "done", detail: "output shape (4, 10)" },
    { label: "loss.compute on output + targets", state: "done", detail: "value 2.31" },
    { label: "metrics.val_accuracy.update", state: "done", detail: "accepted" },
    { label: "metrics.val_loss.update", state: "done", detail: "accepted" },
    { label: "@prism.validate", state: "done", detail: "batch accepted" },
  ],
});

const S09_USER_TESTS: Block = block({
  kind: "table",
  id: "s09-user-tests",
  gapBefore: true,
  showHeader: false,
  columns: [
    { key: "glyph", label: "", align: "left", priority: 100, minWidth: 1, sortable: false },
    { key: "name", label: "name", align: "left", priority: 95, minWidth: 30, flex: true, sortable: true, truncateFrom: "start" },
    { key: "duration", label: "duration", align: "right", priority: 60, minWidth: 6, sortable: true },
  ],
  rows: [
    { id: "t1", cells: { glyph: { text: "", glyph: "ok" }, name: { text: "DigitClassifier::smoke_forward_shape" }, duration: { text: "0.04s" } } },
    { id: "t2", cells: { glyph: { text: "", glyph: "ok" }, name: { text: "DigitClassifier::no_nan_in_weights" }, duration: { text: "0.02s" } } },
    { id: "t3", cells: { glyph: { text: "", glyph: "ok" }, name: { text: "DigitClassifier::forward_is_deterministic" }, duration: { text: "0.06s" } } },
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

/**
 * A surface's declared columns, as `ColumnDef`s — **read from its own column
 * table**, never restated here.
 *
 * The same discipline as the row count. A fixture carrying its own priorities and
 * minimums would compose to the illustrated height forever while §3 drifted, and
 * §3 is the half that C11's planner is checked against (A03 CP6). Reading it means
 * a change to a surface's columns flows into its illustrated height on the next
 * run.
 */
function cols(file: string, table = 0): readonly ColumnDef[] {
  const declared = surfaceColumns(file)[table] ?? [];
  if (declared.length === 0) throw new Error(`${file} table ${String(table)} declares no columns`);

  return declared.map((c) => ({
    key: c.key,
    // `expand` and `glyph` are one cell wide and headed by nothing — a label there
    // would truncate to an ellipsis, which is what the illustrations show as blank.
    label: c.key === "expand" || c.key === "glyph" ? "" : c.key,
    align: c.align,
    truncateFrom: c.truncateFrom,
    priority: c.priority,
    minWidth: c.minWidth,
    sortable: c.sortable,
    ...(c.flex ? { flex: true } : {}),
    ...(c.key === "expand" ? { role: "expand" as const } : {}),
  }));
}

function cellsOfRow(
  id: string,
  values: Readonly<Record<string, string>>,
  glyph?: Glyph,
): TableRow {
  const out: Record<string, Cell> = {};
  for (const [key, text] of Object.entries(values)) out[key] = { text };
  // The glyph column carries a slot and no text — one cell wide, and C11 draws the
  // character (C09 §4). The illustrations show it, so the fixtures that regenerate
  // them have to carry it.
  if (glyph !== undefined) out["glyph"] = { text: "", glyph };
  return { id, cells: out };
}

const S03_TABLE: Block = block({
  kind: "table",
  id: "s03-runs",
  gapBefore: true,
  columns: cols("docs/surfaces/S03_ps_list.md"),
  rows: [
    cellsOfRow("a3f9b21", { uuid: "a3f9b21", kind: "candidate", family: "digit-classifier", status: "running", detail: "ep 17/40", metric: "0.0372", age: "23m", owner: "malachy", mr: "!1248" }, "running"),
    cellsOfRow("7c2d4e1", { uuid: "7c2d4e1", kind: "experiment", family: "decoder-zoom", status: "succeeded", metric: "0.0089", age: "41m", owner: "malachy", mr: "!1201" }, "ok"),
    cellsOfRow("2e8a04c", { uuid: "2e8a04c", kind: "experiment", family: "graphsage", status: "failed", detail: "OOM at ep 3", metric: "—", age: "1h 12m", owner: "priya", mr: "!1188" }, "error"),
    cellsOfRow("f410d99", { uuid: "f410d99", kind: "candidate", family: "flow-predictor", status: "queued", metric: "—", age: "3m", owner: "malachy", mr: "—" }, "queued"),
  ],
});

const S05_TABLE: Block = block({
  kind: "table",
  id: "s05-services",
  gapBefore: true,
  columns: cols("docs/surfaces/S05_serving.md"),
  rows: ["digit-classifier", "flow-predictor", "volatility-estimator", "orderbook-pressure"].map(
    (name, i) => cellsOfRow(name, { name, replicas: "3/3", status: "healthy", errors: "0.02%", version: "de29117", p99: "45ms", "req/s": "432", p50: "18ms", age: `${String(i + 2)}d` }),
  ),
});

const S06_FAMILIES: Block = block({
  kind: "table",
  id: "s06-families",
  gapBefore: true,
  columns: cols("docs/surfaces/S06_models.md"),
  rows: ["digit-classifier", "flow-predictor", "orderbook-pressure", "latency-anomaly-gnn", "fill-rate"].map(
    (family) => cellsOfRow(family, { family, serving: "de29117", latest: "de29117", versions: "4", updated: "2h ago" }),
  ),
});

const S06_VERSIONS: Block = block({
  kind: "table",
  id: "s06-versions",
  gapBefore: true,
  columns: cols("docs/surfaces/S06_models.md", 1),
  rows: ["de29117", "b4f0c12", "9e2a55d", "1f0c8b3"].map((version) =>
    cellsOfRow(version, { version, state: "serving", metric: "AUC 0.912", run: "c4e1f23", mr: "!1244", created: "2h ago" }),
  ),
});

const S14_KEYS: Block = block({
  kind: "table",
  id: "s14-keys",
  gapBefore: true,
  columns: cols("docs/surfaces/S14_config.md"),
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
  columns: cols("docs/surfaces/S14_config.md", 1),
  rows: [
    cellsOfRow("fmx-prod", { name: "fmx-prod", url: "https://prism.fmx.io/v1", token: "token valid · 30d" }),
    cellsOfRow("fmx-staging", { name: "fmx-staging", url: "https://staging.prism.fmx.io", token: "token expired" }),
  ],
});

const S15_SECRETS: Block = block({
  kind: "table",
  id: "s15-secrets",
  gapBefore: true,
  columns: cols("docs/surfaces/S15_identity.md"),
  rows: [
    cellsOfRow("gitlab-readonly-token", { name: "gitlab-readonly-token", owner: "research-infra", age: "34d" }, "running"),
    cellsOfRow("minio-research-creds", { name: "minio-research-creds", owner: "research-infra", age: "34d" }, "running"),
    cellsOfRow("wandb-api-key", { name: "wandb-api-key", owner: "malachy", age: "12d" }, "running"),
    cellsOfRow("huggingface-token", { name: "huggingface-token", owner: "malachy", age: "8d", note: "not accessible" }, "error"),
  ],
});

/**
 * S11 §2 — `/run`, host-native. The block list is S11 §2's own, written down
 * when this fixture was built: the figure implied a sequence and an implication
 * is not a declaration, so composing it meant choosing where the spec was
 * silent (S11 §2).
 */
const S11_RUN: readonly Block[] = [
  block({ kind: "rule", id: "s11-rule", label: "run · fmx_models.jobs.training:job · host-native" }),
  block({
    kind: "steps",
    id: "s11-steps",
    gapBefore: true,
    steps: [
      { label: "importing target", state: "done", detail: "job resolved" },
      { label: "resources resolved", state: "done", detail: "1×GPU · 8Gi  (satisfied)" },
      { label: "secrets resolved", state: "done", detail: "3 · timescaledb-dsn · minio · mlflow" },
      { label: "device", state: "done", detail: "cuda:0" },
    ],
  }),
  block({
    kind: "keyValue",
    id: "s11-run",
    gapBefore: true,
    rows: [{ label: "run", value: "7f3a2c1  ·  ./prism-runs/7f3a2c1…/" }],
  }),
  block({ kind: "progress", id: "s11-progress", gapBefore: true, label: "epoch", current: 7, total: 10 }),
  block({
    kind: "plot",
    id: "s11-loss",
    gapBefore: true,
    form: "line",
    height: 3,
    axes: true,
    yFormat: "number",
    xLabels: ["epoch 1", "epoch 5", "now"],
    // Seven epochs, 0.82 down to the `train_loss 0.312` the metrics row states.
    // `values`, not `points` — the first draft used the wrong field name and the
    // plot rendered one row while measuring five, which read as a C09 I1
    // violation in shipped code until the fixture was checked against S04's.
    series: [{ label: "loss", values: [0.82, 0.71, 0.6, 0.5, 0.42, 0.36, 0.312] }],
  }),
  block({
    kind: "keyValue",
    id: "s11-metrics",
    gapBefore: true,
    rows: [{ label: "", value: "train_loss 0.312 ↓    val_loss 0.298 ↓    val_accuracy 0.871 ↑" }],
  }),
  block({
    kind: "tip",
    id: "s11-tip",
    gapBefore: true,
    text: "last checkpoint  epoch_7.pt                              ⌃c to stop",
  }),
];

/**
 * S12 §2 — the logs view, as the `panel` it is.
 *
 * **§2 used to open by saying its box was not rendered**, which was S01's
 * convention copied to a figure it does not describe: two of the three regions
 * §2 names — the title bar and the keymap — *are* the rails. `frameRows` strips
 * exactly those two rows, which is why nothing composed. HEIGHT_AUDIT had it
 * right from §1 onwards, calling this "S12's panel" and counting eight inner
 * rows.
 */
const S12_LOGS: Block = block({
  kind: "panel",
  id: "s12",
  title: "logs · a3f9b21 · gpu-04.fmx.internal ─────────────────────── ● following",
  footer: "esc back · / filter · l level · ⌃s pause · g top · G bottom · ⏎ follow",
  children: [
    block({
      kind: "raw",
      id: "s12-lines",
      text: [
        "14:23:01.882  INFO   [trainer] epoch 17 started",
        "14:23:02.104  INFO   [dataloader] batch 41/256 loaded (148 samples)",
        "14:23:02.339  DEBUG  [memory] gpu_mem=52GiB/80GiB host_mem=91GiB",
        "14:23:02.551  WARN   [dataloader] slow batch (87ms · 95p)",
        "14:23:02.774  INFO   [trainer] step 2417 · loss=0.0372 · lr=3e-4",
      ].join("\n"),
    }),
    block({ kind: "rule", id: "s12-rule", gapBefore: true, label: "" }),
    block({
      kind: "keyValue",
      id: "s12-status",
      rows: [{ label: "", value: "filter —    level ≥ DEBUG    1,284 lines    2 warnings" }],
    }),
  ],
});

export const SURFACE_FRAMES: readonly SurfaceFrame[] = Object.freeze([
  {
    file: "docs/surfaces/S12_logs_view.md",
    fence: 0,
    label: "S12 §2 — the logs view",
    width: 77,
    blocks: [S12_LOGS],
  },
  {
    file: "docs/surfaces/S11_local_execution.md",
    fence: 0,
    label: "S11 §2 — /run, host-native",
    width: 76,
    blocks: S11_RUN,
  },
  {
    file: "docs/surfaces/S04_run_detail.md",
    fence: 1,
    label: "S04 §3 — the training region",
    width: 76,
    blocks: [
      block({ kind: "rule", id: "s04-rule", label: "loss · epoch 17 / 40 · 43%" }),
      S04_LOSS_PLOT,
      block({
        kind: "progress",
        id: "s04-progress",
        gapBefore: true,
        label: "",
        current: 17,
        total: 40,
      }),
      S04_METRICS,
    ],
  },
  {
    file: "docs/surfaces/S09_test.md",
    fence: 0,
    label: "S09 §2 — test passed",
    width: 78,
    blocks: [
      block({
        kind: "rule",
        id: "s09-rule",
        label: "test · fmx_models.jobs.training:job · pytest",
      }),
      block({
        kind: "rule",
        id: "s09-smoke-rule",
        gapBefore: true,
        label: "implicit smoke test · structural · read-only · 1 batch",
      }),
      S09_SMOKE_STEPS,
      block({
        kind: "notice",
        id: "s09-smoke-total",
        gapBefore: true,
        tone: "ok",
        glyph: "ok",
        text: "smoke passed · 1.1s · sinks not invoked · callbacks did not fire",
      }),
      block({
        kind: "rule",
        id: "s09-user-rule",
        gapBefore: true,
        label: "user tests · @prism.test · 3",
      }),
      S09_USER_TESTS,
      block({
        kind: "notice",
        id: "s09-total",
        gapBefore: true,
        tone: "ok",
        glyph: "ok",
        text: "4 / 4 passed · 1 smoke + 3 user · 2.6s                            2.6s",
      }),
    ],
  },
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
