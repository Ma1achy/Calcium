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
