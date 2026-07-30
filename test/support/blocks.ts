// The block corpus. One fixture per kind, plus the adversarial set.
//
// C04 §8 tier 2 runs against every registered kind, and C09 T4.2 requires that
// a consumer's custom kind joins the suite by discovery rather than by hand. The
// corpus is therefore a value, not a literal inlined in a test file — C09 adds
// to it, C08's fixture world grows out of it, and `measurement-conformance.ts`
// takes it as a parameter.
//
// C08 does not exist yet. This is its seed.
import {
  block,
  document,
  type Block,
  type BlockKind,
  type ColumnDef,
  type Plot,
  type Table,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";

/** One representative, well-formed block per kind. */
export const ONE_PER_KIND: Readonly<Record<BlockKind, Block>> = Object.freeze({
  rule: block({ kind: "rule", id: "rule-1", label: "Deployments", meta: "3 active" }),

  notice: block({ kind: "notice", id: "notice-1", tone: "info", text: "Nothing to do." }),

  keyValue: block({
    kind: "keyValue",
    id: "kv-1",
    rows: [
      { label: "Region", value: "eu-west-1" },
      { label: "Replicas", value: "3" },
    ],
  }),

  table: block({
    kind: "table",
    id: "table-1",
    columns: [
      { key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: true },
      { key: "state", label: "State", align: "left", priority: 5, minWidth: 6, sortable: false },
    ],
    rows: [
      { id: "r1", cells: { name: { text: "api" }, state: { text: "running", tone: "ok" } } },
      { id: "r2", cells: { name: { text: "worker" }, state: { text: "idle", tone: "muted" } } },
    ],
  }),

  steps: block({
    kind: "steps",
    id: "steps-1",
    steps: [
      { label: "Resolve", state: "done" },
      { label: "Build", state: "active", detail: "layer 3 of 7" },
      { label: "Push", state: "pending" },
    ],
  }),

  logs: block({
    kind: "logs",
    id: "logs-1",
    lines: [
      { ts: "12:00:01", level: "info", message: "listening on :8080" },
      { ts: "12:00:02", level: "warn", message: "slow query: 1.2s" },
    ],
  }),

  events: block({
    kind: "events",
    id: "events-1",
    events: [{ ts: "12:00:00", type: "deploy", message: "started" }],
  }),

  // `height` is required for form "line" — there is no default (C04 §3).
  plot: block({
    kind: "plot",
    id: "plot-1",
    form: "line",
    height: 8,
    series: [{ values: [1, 4, 2, 8, 5], label: "rps" }],
    axes: true,
  }),

  progress: block({ kind: "progress", id: "prog-1", label: "Uploading", current: 3, total: 10 }),

  code: block({
    kind: "code",
    id: "code-1",
    language: "yaml",
    text: "name: api\nreplicas: 3\n",
  }),

  diff: block({
    kind: "diff",
    id: "diff-1",
    rows: [{ field: "p99", a: "120ms", b: "98ms", comparison: "better" }],
  }),

  patch: block({
    kind: "patch",
    id: "patch-1",
    path: "src/server.ts",
    language: "typescript",
    hunks: [
      {
        header: "@@ -18,7 +18,9 @@",
        lines: [
          { kind: "context", text: "const app = express();", oldNo: 18, newNo: 18 },
          { kind: "add", text: "app.use(helmet());", newNo: 19 },
          { kind: "remove", text: "app.use(cors());", oldNo: 19 },
        ],
        collapsedBefore: 12,
      },
    ],
  }),

  pills: block({
    kind: "pills",
    id: "pills-1",
    chips: [
      { label: "all", active: true },
      { label: "failed", tone: "muted" },
    ],
  }),

  tip: block({
    kind: "tip",
    id: "tip-1",
    text: "Press ? for keys.",
    actions: [{ kind: "fill", label: "Show keys", command: "help keys" }],
  }),

  panel: block({
    kind: "panel",
    id: "panel-1",
    title: "Summary",
    children: [{ kind: "raw", id: "panel-1-raw", text: "two lines\nof text" }],
  }),

  group: block({
    kind: "group",
    id: "group-1",
    direction: "row",
    children: [
      { kind: "raw", id: "group-1-a", text: "left" },
      { kind: "raw", id: "group-1-b", text: "right" },
    ],
  }),

  raw: block({ kind: "raw", id: "raw-1", text: "pre-formatted\noutput" }),
});

export const ALL_KINDS = Object.keys(ONE_PER_KIND) as readonly BlockKind[];

/**
 * The adversarial set (T2.3). Every one is a *legal* block that a measurer must
 * survive: empty collections, zero-length strings, absurd lengths, and the three
 * width traps — double-width CJK, a ZWJ grapheme cluster, a combining mark.
 *
 * These are the inputs where `.length` and `cells()` disagree, which is the
 * single most common way measured and rendered height come apart.
 */
export const ADVERSARIAL: readonly Block[] = Object.freeze([
  block({ kind: "notice", id: "adv-empty-notice", tone: "default", text: "" }),
  block({ kind: "tip", id: "adv-empty-tip", text: "" }),
  block({ kind: "raw", id: "adv-empty-raw", text: "" }),
  block({ kind: "code", id: "adv-blank-code", language: "text", text: "\n" }),
  block({ kind: "keyValue", id: "adv-empty-kv", rows: [] }),
  block({ kind: "logs", id: "adv-empty-logs", lines: [] }),
  block({ kind: "steps", id: "adv-empty-steps", steps: [] }),
  block({ kind: "group", id: "adv-empty-group", direction: "column", children: [] }),
  block({ kind: "panel", id: "adv-empty-panel", title: "", children: [] }),
  block({
    kind: "table",
    id: "adv-empty-table",
    columns: [],
    rows: [],
    emptyMessage: "No results.",
  }),
  block({ kind: "raw", id: "adv-long", text: "x".repeat(10_000) }),
  // Double-width: each glyph occupies two columns (T3.8).
  block({ kind: "notice", id: "adv-cjk", tone: "default", text: "日本語のテキストです" }),
  // A ZWJ sequence with a variation selector — one cell, many code units (T3.9).
  block({ kind: "notice", id: "adv-zwj", tone: "default", text: "\u{1F468}‍\u{1F469}‍\u{1F467}" }),
  // A combining mark takes the base character's width, not two (T3.10).
  block({ kind: "notice", id: "adv-combining", tone: "default", text: "égalité" }),
  block({
    kind: "plot",
    id: "adv-empty-series",
    form: "line",
    height: 4,
    series: [],
    emptyMessage: "No data.",
  }),
  block({ kind: "progress", id: "adv-zero-total", label: "Nothing", current: 0, total: 0 }),
]);

/** Every fixture the contract suite runs over. */
export const CORPUS: readonly Block[] = Object.freeze([
  ...Object.values(ONE_PER_KIND),
  ...ADVERSARIAL,
]);

/** A minimal valid document. `meta.origin` is required and never defaulted (I13). */
export function doc(overrides: Partial<ViewDocument> = {}): ViewDocument {
  return document({
    schema: "tui.view/1",
    command: "status",
    status: "ok",
    blocks: [],
    meta: {
      verb: "status",
      adapter: "passthrough",
      exitCode: 0,
      durationMs: 12,
      truncated: false,
      argv: ["prism", "status"],
      stderr: "",
      transport: "subprocess",
      origin: "user",
    },
    ...overrides,
  } as ViewDocument);
}

// --- C11's layout fixtures --------------------------------------------------
//
// `tableOf` stays a merge fixture: one column, no priorities worth dropping. What
// C11 needs is a table under width pressure, and the honest source for one is a
// surface that already declares its priorities — S03's eleven, which is also the
// set the drop tables were verified against.

/**
 * S03's eleven columns, as `ColumnDef`s.
 *
 * `expand` carries `role: "expand"` — the marker column C11 fills (C11 I16) — and
 * `status` declares `minWidth` equal to its longest value plus a glyph, which is
 * how I10 is expressed: the surface says "whole or dropped" by choosing that
 * minimum, and C11 enforces it generically.
 */
export function psColumns(): readonly ColumnDef[] {
  return Object.freeze([
    { key: "expand", label: "", align: "left", priority: 100, minWidth: 1, sortable: false, role: "expand" },
    { key: "glyph", label: "", align: "left", priority: 100, minWidth: 1, sortable: false },
    { key: "uuid", label: "uuid", align: "left", priority: 90, minWidth: 7, sortable: true },
    { key: "family", label: "family", align: "left", priority: 85, minWidth: 12, flex: true, sortable: true },
    { key: "status", label: "status", align: "left", priority: 80, minWidth: 11, sortable: true },
    { key: "detail", label: "detail", align: "left", priority: 65, minWidth: 12, flex: true, sortable: false },
    { key: "metric", label: "metric", align: "right", priority: 60, minWidth: 8, sortable: true },
    // The twelfth column (S03 §3). Low priority and no label: a cell holds one
    // value, so the number and its series are separate columns, and decoration is
    // what drops first when the width runs out.
    { key: "spark", label: "", align: "left", priority: 15, minWidth: 8, sortable: false },
    { key: "age", label: "age", align: "right", priority: 50, minWidth: 6, sortable: true },
    { key: "kind", label: "kind", align: "left", priority: 30, minWidth: 10, sortable: true },
    { key: "owner", label: "owner", align: "left", priority: 20, minWidth: 8, sortable: true },
    { key: "mr", label: "mr", align: "left", priority: 10, minWidth: 6, sortable: false },
  ] as const);
}

/**
 * A five-row `ps` table — the fixture C11 T2.3 measures at every width.
 *
 * `expanded` and `detail` are parameters because the suite runs every expansion
 * combination over it, and `rows` because T3.9 and T3.16 want 500 and 10,000 of
 * them. Each has a default that differs from what the tests ask for, so a builder
 * ignoring its argument fails rather than passing quietly (`test/support/README.md`).
 */
export function psTable(
  options: Readonly<{
    id?: string;
    rows?: number;
    expanded?: readonly number[];
    detail?: boolean;
    sort?: Table["sort"];
  }> = {},
): Table {
  const count = options.rows ?? 4;
  const expanded = new Set(options.expanded ?? []);
  const withDetail = options.detail ?? false;

  const uuids = ["a3f9b21", "7c2d4e1", "2e8a04c", "f410d99", "b1c7e34"];
  const ages = ["23m", "1h 12m", "45s", "3d", "2h"];
  const metrics = ["0.0372", "0.0089", "", "0.1240", "0.0500"];
  const states = ["running", "succeeded", "failed", "queued", "promoted"];

  return block({
    kind: "table",
    id: options.id ?? "ps",
    columns: psColumns(),
    rows: Array.from({ length: count }, (_, i) => {
      const row: {
        id: string;
        cells: Record<
          string,
          {
            text: string;
            tone?: "ok" | "error" | "muted";
            glyph?: "running" | "ok" | "error" | "queued";
            spark?: readonly number[];
          }
        >;
        expanded?: boolean;
        detail?: readonly Block[];
      } = {
        id: `r${i + 1}`,
        cells: {
          expand: { text: "" },
          glyph: { text: "", glyph: "running" },
          uuid: { text: uuids[i % uuids.length] ?? "0000000" }, // cells-ok
          family: { text: `family-${String(i + 1)}` },
          status: { text: states[i % states.length] ?? "running" }, // cells-ok
          detail: { text: `ep ${String(i + 1)}/40` },
          metric: { text: metrics[i % metrics.length] ?? "" }, // cells-ok
          // A `spark` cell carries the series and no text — C12's `sparkline`
          // renders it, and the eight samples are the eight cells the column
          // declares as its minimum.
          // `i % 5` and not `i`: the window is eight points, so a longer series
          // buys nothing — and `lossCurve(12 + i)` over 10,000 rows allocated
          // fifty million numbers and timed out T3.16, a test about the *planner's*
          // cost. A fixture that dominates the measurement it appears in makes the
          // budget it was written to check unmeasurable.
          spark: { text: "", spark: lossCurve(12 + (i % 5)) },
          age: { text: ages[i % ages.length] ?? "1m" }, // cells-ok
          kind: { text: "candidate" },
          owner: { text: "malachy@fmx.io" },
          mr: { text: `!12${String(i)}` },
        },
      };
      if (expanded.has(i + 1)) row.expanded = true;
      if (withDetail) {
        row.detail = [
          block({
            kind: "progress",
            id: `${options.id ?? "ps"}-p${String(i + 1)}`,
            label: "epoch",
            current: 17,
            total: 40,
          }),
        ];
      }
      return row;
    }),
    ...(options.sort === undefined ? {} : { sort: options.sort }),
  });
}

/**
 * The corpus C11's conformance runs over: the `ps` table flat, expanded, with and
 * without declared detail, plus the two `table` fixtures the shared corpus already
 * holds — the single-column one and the empty one, which is where zero columns and
 * an empty message are covered.
 */
export const TABLE_CORPUS: readonly Block[] = Object.freeze([
  psTable(),
  psTable({ id: "ps-expanded", rows: 5, expanded: [1, 3] }),
  psTable({ id: "ps-detail", rows: 5, expanded: [2], detail: true }),
  psTable({ id: "ps-sorted", rows: 5, sort: { key: "age", direction: "desc" } }),
  ONE_PER_KIND.table,
  ...ADVERSARIAL.filter((b) => b.kind === "table"),
]);

/** A table with `n` rows, ids `r1..rn` — the merge and view-state fixture. */
export function tableOf(n: number, id = "t"): Table {
  return block({
    kind: "table",
    id,
    columns: [
      { key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: true },
    ],
    rows: Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`,
      cells: { name: { text: `row ${i + 1}` } },
    })),
  });
}

/**
 * A decaying loss curve of `n` epochs — the series every plot surface draws.
 *
 * Deterministic, and `Math.exp` rather than a random walk because A03 SS2 bans
 * `Math.random()` across `src/` for exactly the reason it would bite here: a
 * jittered curve makes every golden frame flake.
 */
export function lossCurve(n: number, floor = 0.04, start = 0.82): readonly number[] {
  const span = Math.max(1, n / 3);
  return Array.from({ length: n }, (_, i) => (start - floor) * Math.exp(-i / span) + floor);
}

/**
 * A `plot`, with every parameter's default differing from any value a test asks
 * for (`test/support/README.md`).
 *
 * **The parameter that could have been inert is `points`.** A plot's height is
 * declared, so a test that passes ten thousand of them and counts rows passes
 * identically if the argument is discarded — the row count is right either way.
 * So `support-harness.test.ts` asserts `points` against rendered *content* (a
 * downsampled curve inks columns a sparse one leaves blank) and `height` against
 * the row count, which is the only pairing where each can fail alone.
 */
export function plotOf(
  options: Readonly<{
    id?: string;
    points?: number;
    height?: number;
    axes?: boolean;
    form?: Plot["form"];
    series?: number;
    yMin?: number;
    yMax?: number;
  }> = {},
): Plot {
  const count = options.points ?? 20;
  const seriesCount = options.series ?? 1;

  return block({
    kind: "plot",
    id: options.id ?? "plot",
    form: options.form ?? "line",
    height: options.height ?? 5,
    axes: options.axes ?? true,
    xLabels: ["epoch 0", "epoch 20", "now"],
    series: Array.from({ length: seriesCount }, (_, s) => ({
      values: lossCurve(count).map((v) => v * (1 + s * 0.2)),
      label: `series ${s + 1}`,
    })),
    ...(options.yMin === undefined ? {} : { yMin: options.yMin }),
    ...(options.yMax === undefined ? {} : { yMax: options.yMax }),
  });
}

/**
 * The corpus C12's conformance runs over: every degenerate series §4 names, both
 * forms, the axed and bare cases, the multi-series cases including more series
 * than rows, and the two `plot` fixtures the shared corpus already holds.
 */
export const PLOT_CORPUS: readonly Block[] = Object.freeze([
  plotOf(),
  plotOf({ id: "plot-bare", axes: false }),
  plotOf({ id: "plot-h1", height: 1 }),
  plotOf({ id: "plot-h2", height: 2 }),
  plotOf({ id: "plot-dense", points: 10_000 }),
  plotOf({ id: "plot-sparse", points: 3 }),
  plotOf({ id: "plot-two", height: 8, series: 2 }),
  plotOf({ id: "plot-many", height: 4, series: 10 }),
  plotOf({ id: "plot-pinned", yMin: 0, yMax: 1 }),
  plotOf({ id: "plot-spark", form: "sparkline", points: 8 }),
  block({ kind: "plot", id: "plot-one-point", form: "line", height: 5, axes: true, series: [{ values: [7] }] }),
  block({ kind: "plot", id: "plot-flat", form: "line", height: 5, axes: true, series: [{ values: [3, 3, 3, 3] }] }),
  block({
    kind: "plot",
    id: "plot-holes",
    form: "line",
    height: 5,
    axes: true,
    series: [{ values: [1, 2, Number.NaN, 4, 5, Number.POSITIVE_INFINITY, 7, 8] }],
  }),
  block({
    kind: "plot",
    id: "plot-all-nan",
    form: "line",
    height: 5,
    axes: true,
    series: [{ values: [Number.NaN, Number.NaN] }],
    emptyMessage: "No epochs yet.",
  }),
  ONE_PER_KIND.plot,
  ...ADVERSARIAL.filter((b) => b.kind === "plot"),
]);
