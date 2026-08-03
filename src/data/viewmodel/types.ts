/**
 * The vocabulary the whole system speaks.
 *
 * C04 — see spec. Types only: no runtime value is exported from this file, so
 * nothing here can be the place an invariant is enforced. Enforcement lives in
 * `construct.ts` (shape invariants) and `validate.ts` (document invariants),
 * and having exactly one of each is the point (C04 §4b).
 *
 * C04 imports nothing from `terminal/`, `presentation/` or above (I11). That is
 * why `ColumnDef` is declared here rather than in C11: it is a field of `Table`,
 * so `Table` could not be declared without it, and a type-only import from L1
 * would erase at build and pass the module graph while being exactly the
 * dependency I11 exists to prevent.
 */

// --- the document ---------------------------------------------------------

export type ViewDocument = Readonly<{
  schema: "tui.view/1";
  command: string;
  status: DocumentStatus;
  blocks: readonly Block[];
  error?: ErrorLike;
  meta: DocumentMeta;
}>;

/**
 * `proposed` is reserved and unused in v1 (I12). It ships now because adding a
 * `status` value later is a `tui.view/2` bump, and the bump is the expensive
 * part rather than the field.
 */
export type DocumentStatus = "ok" | "error" | "partial" | "proposed";

export type DocumentMeta = Readonly<{
  verb: string | null;
  adapter: string;
  exitCode: number;
  durationMs: number;
  truncated: boolean;
  resultId?: string;
  /** The invocation record — what actually ran (commitment 17). */
  argv: readonly string[];
  stderr: string;
  transport: "emulated" | "fixture" | "subprocess" | "local";
  /** Required, never optional (I13). Provenance that can be absent is untrusted. */
  origin: "user" | "action" | "agent" | "refresh";
}>;

export type ErrorLike = Readonly<{
  message: string;
  code?: string;
  stage?: string;
  details?: Readonly<Record<string, unknown>>;
  remediation?: string;
}>;

export const SCHEMA = "tui.view/1" as const;

// --- tone, actions --------------------------------------------------------

export type Tone =
  | "default"
  | "dim"
  | "muted"
  | "ok"
  | "warn"
  | "error"
  | "info"
  | "accent"
  | "meta"
  | "identifier";

/**
 * A glyph slot, never a character (I6, C09 §4).
 *
 * The identical argument to `Tone`, and the one commitment 10 could not keep
 * while this was a string: C09 substitutes 1:1 by column count for the glyphs
 * it owns, and emitted a block-supplied one verbatim. The guarantee held for
 * the box drawing and failed for whatever an adapter wrote — under `LANG=C`,
 * for the users least able to say what they were seeing.
 *
 * C09 §4 owns both renderings. Anything outside this vocabulary goes in the
 * block's *text* — action labels like `↗ open` already do — and a vocabulary
 * with an "or any string" arm is not a vocabulary.
 */
export type Glyph =
  | "ok"
  | "warn"
  | "error"
  | "info"
  | "pending"
  /** Starting, connecting, installing. Distinct from `running`: S11, S15. */
  | "working"
  | "running"
  | "queued"
  | "cancelled"
  | "expand"
  | "collapse"
  | "live"
  | "bullet";

/** The tones that oblige a glyph (I6, D29). */
export const GLYPH_REQUIRED_TONES: ReadonlySet<Tone> = new Set<Tone>(["error", "warn"]);

export type Action =
  | Readonly<{ kind: "fill"; label: string; command: string }>
  | Readonly<{ kind: "exec"; label: string; command: string }>
  | Readonly<{ kind: "open"; label: string; url: string }>
  | Readonly<{ kind: "expand"; label: string; target: string }>;

// --- table ----------------------------------------------------------------

export type Cell = Readonly<{
  text: string;
  tone?: Tone;
  glyph?: Glyph;
  spark?: readonly number[];
}>;

/**
 * Declared here, not in C11 — see the file header. C11 owns `PlannedColumns`
 * and `planColumns`, which are the plan derived from this plus a width.
 */
export type ColumnDef = Readonly<{
  key: string;
  label: string;
  align: "left" | "right";
  priority: number;
  minWidth: number;
  maxWidth?: number;
  flex?: boolean;
  sortable: boolean;
  /**
   * The column whose content a renderer supplies rather than the data (I32).
   *
   * Surfaces declare an `expand` column of `minWidth` 1 whose cell is the
   * expand/collapse marker, and its cell is inside their drop arithmetic — so it
   * must stay an ordinary column for planning while being extraordinary for
   * content. This is how C11 recognises it (C11 I15). Presentation intent, not
   * view state: it never changes with what the user does, so `merge` carries it
   * like the rest of `columns` and I9 is untouched.
   */
  role?: "expand";
  /**
   * Which end characters are removed from when a cell does not fit (I30).
   *
   * `"end"` is the default and keeps the start, which is what prose wants.
   * `"start"` keeps the tail — a path's filename, a hierarchical key's leaf, a
   * pod name's hash suffix. Named for the operation rather than for what
   * survives: `keep:` and `"head" | "tail"` both leave the reader guessing which
   * side is being described, on a field set once per column and never revisited.
   */
  truncateFrom?: "start" | "end";
}>;

export type TableRow = Readonly<{
  id: string;
  cells: Readonly<Record<string, Cell>>;
  detail?: readonly Block[];
  actions?: readonly Action[];
  /** View state. Never merged (I9), never carried across a `replace` (§4). */
  expanded?: boolean;
}>;

/**
 * A row as it may arrive in a `merge`. I9 holds because the field does not
 * exist to be set, not because a rule is remembered (I16).
 */
export type MergeRow = Omit<TableRow, "expanded">;

// --- blocks ---------------------------------------------------------------

/**
 * Every block may declare one blank row before it (C04 §3a).
 *
 * It is **content, not view state**: a `merge` carries it, unlike `expanded`
 * (I9). The space before a block is a property of the document's shape rather
 * than of what the user has done to it, so a `--watch` tick that rebuilds a
 * table's rows must not close up the gap above it.
 *
 * The height rule lives at the *sequence*, never at the block — see
 * `sequenceHeight` in `measure.ts`. Nothing else in the vocabulary produces
 * vertical space, and every surface in the S-series draws it.
 */
export type Gap = Readonly<{ gapBefore?: boolean }>;

export type Rule = Readonly<{ kind: "rule"; id: string; label: string; meta?: string }> & Gap;

export type Notice = Readonly<{
  kind: "notice";
  id: string;
  tone: Tone;
  glyph?: Glyph;
  text: string;
}> & Gap;

export type KeyValue = Readonly<{
  kind: "keyValue";
  id: string;
  rows: readonly Readonly<{ label: string; value: string; tone?: Tone }>[];
}> & Gap;

export type Table = Readonly<{
  kind: "table";
  id: string;
  columns: readonly ColumnDef[];
  rows: readonly TableRow[];
  sort?: Readonly<{ key: string; direction: "asc" | "desc" }>;
  showHeader?: boolean;
  emptyMessage?: string;
}> & Gap;

export type Steps = Readonly<{
  kind: "steps";
  id: string;
  steps: readonly Readonly<{
    label: string;
    detail?: string;
    state: "pending" | "active" | "done" | "failed";
  }>[];
}> & Gap;

export type Logs = Readonly<{
  kind: "logs";
  id: string;
  lines: readonly Readonly<{ ts: string; level: string; message: string }>[];
}> & Gap;

export type Events = Readonly<{
  kind: "events";
  id: string;
  events: readonly Readonly<{ ts: string; type: string; message: string }>[];
}> & Gap;

export type Series = Readonly<{
  values: readonly number[];
  label?: string;
  tone?: Tone;
}>;

/**
 * `height` is optional on the type only because `sparkline` does not take one.
 * `form: "line"` without it is a construction error, not a default (§3) — a
 * defaulted height is how C12's central property fails silently.
 */
export type Plot = Readonly<{
  kind: "plot";
  id: string;
  form: "line" | "sparkline";
  series: readonly Series[];
  height?: number;
  axes?: boolean;
  xLabels?: readonly [string, string, string];
  yFormat?: "number" | "percent" | "bytes" | "duration";
  /**
   * Pin the vertical range, independently and optionally (I29).
   *
   * Absent, the range is the data's. Present, out-of-range values clamp to the
   * edge — never dropped, and never widening the range they were pinned against,
   * because a pinned axis exists so two plots can be compared and a range that
   * silently grew would defeat that.
   *
   * `yMin: 0` alone is the common case: a loss curve that autoscales its floor
   * exaggerates every wobble near zero.
   */
  yMin?: number;
  yMax?: number;
  emptyMessage?: string;
}> & Gap;

export type Progress = Readonly<{
  kind: "progress";
  id: string;
  label: string;
  current: number;
  total: number;
}> & Gap;

export type Code = Readonly<{
  kind: "code";
  id: string;
  language: string;
  text: string;
  wrap?: boolean;
}> & Gap;

export type Comparison = Readonly<{
  kind: "comparison";
  id: string;
  rows: readonly Readonly<{
    field: string;
    a: string;
    b: string;
    comparison?: "same" | "better" | "worse" | "changed";
  }>[];
}> & Gap;

export type Hunk = Readonly<{
  header: string;
  lines: readonly Readonly<{
    kind: "add" | "remove" | "context";
    text: string;
    oldNo?: number;
    newNo?: number;
  }>[];
  collapsedBefore?: number;
}>;

export type Patch = Readonly<{
  kind: "patch";
  id: string;
  path: string;
  language: string;
  hunks: readonly Hunk[];
  /**
   * Unchanged lines elided **below the last hunk** (§3).
   *
   * On `Patch` rather than on `Hunk`, and the split is the decision. A patch elides
   * context in three places — before the first hunk, between hunks, after the last —
   * and `Hunk.collapsedBefore` covers the first two, every interior region belonging
   * to exactly one hunk. A matching field on `Hunk` would double-count: the gap
   * between hunk 1 and hunk 2 is 1's *after* and 2's *before*, so a producer would
   * have to know which of two fields describes one region.
   *
   * Not a rare case: one hunk at line 18 of a 200-line file elides 14 lines above
   * and 170 below.
   */
  collapsedAfter?: number;
  layout?: "unified" | "split";
}> & Gap;

export type Pills = Readonly<{
  kind: "pills";
  id: string;
  chips: readonly Readonly<{
    label: string;
    tone?: Tone;
    action?: Action;
    active?: boolean;
  }>[];
}> & Gap;

export type Tip = Readonly<{
  kind: "tip";
  id: string;
  text: string;
  actions?: readonly Action[];
}> & Gap;

export type Panel = Readonly<{
  kind: "panel";
  id: string;
  title: string;
  /**
   * Text in the **bottom** border, as `title` is text in the top (C04 §3).
   *
   * It changes no measurement: a panel is children + 2 either way, so this is
   * a use for a row that is drawn anyway rather than a new one. S12 §2 and
   * S13 §2 both draw a keymap there, and neither can use the frame's footer —
   * a pushed view leaves header and footer untouched (C15 T4.4) and C22's
   * footer is one app-supplied row. The keys belong to the view.
   */
  footer?: string;
  children: readonly Block[];
}> & Gap;

export type Group = Readonly<{
  kind: "group";
  id: string;
  direction: "row" | "column";
  children: readonly Block[];
}> & Gap;

/** The escape hatch, and load-bearing: the vocabulary never has to be complete. */
export type Raw = Readonly<{ kind: "raw"; id: string; text: string }> & Gap;

export type Block =
  | Rule
  | Notice
  | KeyValue
  | Table
  | Steps
  | Logs
  | Events
  | Plot
  | Progress
  | Code
  | Comparison
  | Patch
  | Pills
  | Tip
  | Panel
  | Group
  | Raw;

export type BlockKind = Block["kind"];

// --- patches --------------------------------------------------------------

export type ViewPatch =
  | Readonly<{ op: "append"; block: Block }>
  | Readonly<{ op: "replace"; blockId: string; block: Block }>
  | Readonly<{ op: "merge"; blockId: string; rows: readonly MergeRow[] }>
  | Readonly<{ op: "status"; status: DocumentStatus }>
  /**
   * View state, and the only arm that is (C04 §4).
   *
   * **The other four say something arrived or changed on the far side; this one
   * says the reader opened a row.** C13 gates the first four on the entry still
   * streaming — a settled stream can receive nothing more — and that gate is
   * exactly inverted for this: an app verb's result is settled the moment it
   * lands, so the entries a reader would expand are the ones a data patch is
   * refused on, while a live `--watch` accepts it. The rule permitted the useless
   * case and forbade the useful one.
   *
   * A named op rather than a `viewState: true` flag on `replace`, and the reason
   * is unforgeability rather than tidiness: `replace` is the arm C25's patch
   * expansion uses, so the flag would be set by C25's renderer *and* by adapters
   * — "trust me" in two components, with the far side's adapter on one boundary.
   * A named op cannot be forged. The same argument as glyphs becoming tokens.
   */
  | Readonly<{ op: "expand"; blockId: string; rowId: string; expanded: boolean }>;

/**
 * Fallible in the type (I15). `applyPatch` runs on every stream tick in the
 * render path, and a pure data function that throws there is worse than one
 * that returns: C23 §5 must handle the failure either way, and only this form
 * can be handled without a `try` around the hot loop.
 */
export type PatchResult =
  | Readonly<{ ok: true; doc: ViewDocument }>
  | Readonly<{ ok: false; error: ErrorLike }>;

export type Result<T, E> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

// --- the measurement contract (§5) ----------------------------------------

/**
 * The registry's dispatcher, as seen by a container kind that does not know
 * what it is measuring (A02 Seam 1).
 */
export type MeasureFn = (block: Block, width: number) => number;

/**
 * C04 declares this and implements none of it. The measurers live in C09, C11,
 * C12 and C25 — `render` needs theme and capabilities, so the registry cannot
 * live at L0, and a measurer without its renderer beside it is the pair that
 * drifts (§1).
 */
export type Measure<B extends Block = Block> = (
  block: B,
  width: number,
  measureChild: MeasureFn,
) => number;
