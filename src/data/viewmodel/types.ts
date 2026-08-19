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
  /**
   * Required, never optional (I13). Provenance that can be absent is untrusted.
   *
   * `defect` is the one arm the framework sets about **itself** — a document
   * that exists because a stage failed and C23 contained it (C23 §5a, F15). Not
   * `refresh`, which is a system notice about the session, and not `action`,
   * which names a mechanism that did not produce it.
   */
  origin: "user" | "action" | "agent" | "refresh" | "defect";
}>;

/**
 * The three `meta` keys an adapter's answer is honoured for.
 *
 * **`authoritativeMeta` keeps three of ten and overwrites seven** — `verb`,
 * `exitCode`, `durationMs`, `argv`, `stderr`, `transport` and `origin` come from
 * the raw result and the context, always. The adapter's return type demanded all
 * ten anyway, so every adapter ever written computes seven values that are
 * discarded, **with no signal that they are**: an adapter returning
 * `exitCode: 999` produces a document reading `0`.
 *
 * **Narrower, not wider.** Making the seven optional would leave them discarded;
 * removing them means supplying one fails to compile rather than fails to
 * matter. The same move as `RenderContextInput` one layer up — two components
 * with the same defect is what said the shape generalises. FINDINGS F58b, F85.
 *
 * **The seven are typed `never` rather than merely absent, and that is the half
 * that does the work.** TypeScript's excess-property check only fires on a
 * *fresh object literal*: a helper returning a full `DocumentMeta` is assignable
 * to a `Pick` of it, so the app's own `metaOf()` — nine fields, duplicated in two
 * files — compiled unchanged against the narrow type and kept computing the
 * discarded seven. `never` makes the wrong state unbuildable through a helper
 * too, which is the `Exclude<ParseResult, { kind: "empty" }>` trade one more
 * time.
 */
type ProducerOwned = "adapter" | "truncated" | "resultId";

/**
 * The three `meta` keys a *producer* owns, on either route.
 *
 * **Named for the producer rather than the adapter because both routes reached
 * the same three independently** (F58b, F13). The adapter route discards the
 * other seven — `authoritativeMeta` overwrites them — and the local route
 * *invents* them, four eleven-line helpers writing `durationMs: 0`, a
 * `transport` that is a constant and an `origin` the shell already knows. One
 * defect, two directions, one honoured set.
 */
export type ProducedMeta = Readonly<Partial<Pick<DocumentMeta, ProducerOwned>>> &
  Partial<Record<Exclude<keyof DocumentMeta, ProducerOwned>, never>>;

/** @deprecated the adapter-route name for {@link ProducedMeta}. */
export type AdapterMeta = ProducedMeta;

/**
 * What an adapter returns: a document whose `meta` carries only what it owns.
 *
 * `command` stays the adapter's here, unlike the local route where C23 takes it
 * (I15) — C07 I16 rules that an adapter states the command it ran, which may
 * differ from the line submitted.
 */
export type AdapterDocument = Omit<ViewDocument, "meta"> & Readonly<{ meta?: ProducedMeta }>;

/**
 * What a local handler returns.
 *
 * **The mirror of `AdapterDocument`, and the fix runs the other way.** On the
 * adapter route the seven are computed and thrown away; here nothing overwrites
 * them, so a handler has to make them up — `verb` re-derived from `argv[0]`,
 * `durationMs: 0` on a route the shell could time, `stderr: ""` on a route with
 * no far side. C23 already takes `command` from the handler for exactly this
 * reason (I15, C22 I33), *"the same one I13 makes for `meta`"* — an argument
 * written for this case and never applied to it. FINDINGS F13.
 */
export type LocalDocument = Omit<ViewDocument, "meta"> & Readonly<{ meta?: ProducedMeta }>;

/**
 * A failure, as the party that knows describes it (F165).
 *
 * **The rule that sorts these members is *could anyone but the framework know
 * this value*, and it is not the axis F58b's precedent suggested.** F58b
 * narrowed because its fields were computed and discarded; *written by hand*
 * turns out to decide nothing.
 *
 * `code` and `details` come off the far side's own error envelope
 * (`data/adapters/mapping.ts`), so nobody else could supply them and removing
 * them deletes its only channel for structured failure. `stage` is the
 * framework's: `parse`, `spawn`, `handoff`, `local`, `transport` — eight sites
 * in `shell/execution.ts`, each a genuine runtime discrimination about which
 * stage of the pipeline failed, authored by the only party that can know.
 *
 * **What was wrong is who was writing it, not the field.** Twelve app sites in
 * `examples/docker` write `stage` by hand, each a per-file constant restating
 * the kind of function it sits in — `"local"` in a local handler, `"adapter"`
 * in an adapter — which is F13's class: a fact the framework holds and the app
 * is asked to author. The disposition is *the app should not be writing it*,
 * and removing the field was the wrong remedy for the right finding.
 *
 * All three are rendered by `errorDoc` rather than dropped (C23 §5). Until this
 * they were parsed, typed, frozen and thrown away.
 */
export type ErrorLike = Readonly<{
  message: string;
  /** The far side's own error code, when it emits one. */
  code?: string;
  /** Which stage of the pipeline failed. **The framework's**, never an app's. */
  stage?: string;
  /** The far side's structured payload — what a `message` cannot carry. */
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
  | "bullet"
  /**
   * A line subordinate to the one above it (C09 §4).
   *
   * **The only token whose eligibility is a property of the entry rather than
   * of the block.** Every other arm names a state the block is in; this one
   * names a relationship to a line that has to exist. C22's `commandRows`
   * returns `[]` for `command: ""`, so a document with no command line has
   * nothing for it to hang from and the mark would subordinate the block to a
   * different submission's entry. C09 §4 names the two blocks in the position
   * and the two that look as though they are.
   */
  | "continuation";

/** The tones that oblige a glyph (I6, D29). */
export const GLYPH_REQUIRED_TONES: ReadonlySet<Tone> = new Set<Tone>(["error", "warn"]);

/**
 * Every tone, as a value — the union is a type and a theme has to be checked
 * against something at run time (C10 I30, F172).
 *
 * **`satisfies Record<Tone, true>` rather than an array**, which is the lesson
 * `GLYPH_MEMBERS` in `validate.ts` records: a `Set<Tone>` type-checks with a
 * member missing, because an element type constrains what may go in and says
 * nothing about what must. A tone added without an entry here stops compiling.
 */
const TONE_MEMBERS = {
  default: true, dim: true, muted: true, ok: true, warn: true,
  error: true, info: true, accent: true, meta: true, identifier: true,
} satisfies Record<Tone, true>;

export const TONES: readonly Tone[] = Object.freeze(Object.keys(TONE_MEMBERS) as Tone[]);

export type Action =
  | Readonly<{ kind: "fill"; label: string; command: string }>
  | Readonly<{ kind: "exec"; label: string; command: string }>
  | Readonly<{ kind: "open"; label: string; url: string }>
  | Readonly<{ kind: "expand"; label: string; target: string }>
  /**
   * Fill the screen with one block — C25 §3b's fullscreen patch is the first
   * producer (I34).
   *
   * `target` names a block id **within the document the action fired from**, and
   * denotes nothing else. Unlike `expand`, which toggles a row on an entry the
   * dispatcher already holds, this is the first kind whose target the dispatcher
   * has to *find* — and it is a free string an adapter supplies. Resolved
   * against the whole transcript it would let one entry's action draw another
   * entry's data; C23 I31 owns the refusal when it does not resolve.
   */
  | Readonly<{ kind: "view"; label: string; target: string }>;

/** The five, for a validator that cannot silently take a sixth (T2.11). */
export const ACTION_KINDS: ReadonlySet<Action["kind"]> = new Set<Action["kind"]>([
  "fill",
  "exec",
  "open",
  "expand",
  "view",
]);

// --- table ----------------------------------------------------------------

export type Cell = Readonly<{
  text: string;
  tone?: Tone;
  glyph?: Glyph;
  /** Inline sparkline. `null` is a gap — a position with no reading (I46a). */
  spark?: readonly (number | null)[];
  /**
   * A quantity against a scale, drawn as a run (I50c, C12 I20).
   *
   * **Not `progress`, and the difference is what the number means.** A `total`
   * is reached; a scale's top may be exceeded and may not be knowable — a
   * per-core CPU percentage, a quota that can be over-committed. `examples/docker`
   * hand-wrote nine lines of this rather than bend `b.progress`, which is the
   * gap stated by a workaround (FINDINGS gap 3).
   *
   * The cell's own `tone` and `glyph` carry the colour, which is why `BarSpec`
   * has neither: a framework that shipped thresholds would ship arbitrary
   * numbers for everyone.
   */
  bar?: BarSpec;
}>;

/** A quantity against a scale (I50c, C12 §3b). */
export type BarSpec = Readonly<{
  /** `null` is absent, and it draws a mark — never an empty run, which reads as zero. */
  value: number | null;
  /** The scale's top. The fill clamps here and the number does not (C09 I28). */
  max: number;
  /** The scale's floor. Zero unless a surface says otherwise. */
  min?: number;
  /**
   * The unit the value arrived in — **`yFormat`'s vocabulary, deliberately**.
   * A bar's number and a plot's y-label ask the same question, and a second
   * enum would be a second place for I41's `fraction`/`percent` confusion.
   */
  format?: Plot["yFormat"];
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
 *
 * **If a general `padding` is ever added, this becomes its top edge** (C04 §3
 * R19, roadmap 38). Roadmap 38 asks for padding *as a general property rather
 * than `gapBefore` being the only spacing that exists*, and a document with both
 * would have two ways to say *a blank row above this block* — which every
 * measurer, every container's child-width computation and every sequence would
 * then have to agree about. So the change is a replacement, not an addition.
 *
 * **The note is here rather than in the roadmap entry**, because a condition
 * written beside the deferral is the one nobody reads: three deferrals this
 * project has recorded were satisfied elsewhere while their text stood
 * unchanged. Whoever writes the second spacing field is reading this line.
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
  rows: readonly Readonly<{
    label: string;
    value: string;
    tone?: Tone;
    /**
     * A quantity beside the value, not instead of it (I51, C12 §3b).
     *
     * **Not `Cell.bar`'s seam**, which replaces the cell's text and takes the
     * planned width (I50c). Both surfaces that draw one here put a text next to
     * the run — docker's `MEM` reads `████░░░░ 45.2%  1.2GiB / 4GiB` and S13's
     * cluster panel `71%  ██████░░░` — so `value` stays and the bar joins it.
     *
     * **`width` is on the row because a `keyValue` value is a remainder and a
     * table column is a width.** Given the whole remainder, `valueBar` draws a
     * 68-cell run at a terminal width of 80: correct in every count and a
     * picture no surface asked for. Both consumers chose a width by hand, and
     * S13 §7 shortens its bars at 80–99 columns.
     *
     * It is not a member of `BarSpec`, which `Cell` shares and where the column
     * already supplies the number — two sources for one width is the audit's D6
     * before there is any code to reconcile them.
     *
     * **A sibling rather than an intersection, and the type could not carry the
     * pairing.** `bar?: BarSpec & { width }` compiles here and breaks
     * `b.kv({ state: b.warn("degraded") })` at every call site: the tone
     * shorthands return a `Cell`, whose `bar` is a plain `BarSpec`, so a
     * narrower member makes the whole shorthand unassignable to `KeyValueInput`.
     * Measured — two errors, both that path, and it is documented behaviour
     * (C24 §4). So `bar` without a `barWidth` is expressible and refused by
     * `validateBlock`, which is exactly how I50c handles a cell carrying both a
     * `spark` and a `bar`: same block family, same gate, one precedent.
     */
    bar?: BarSpec;
    /** The cells the bar occupies. Required when `bar` is present (I51). */
    barWidth?: number;
  }>[];
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
  /**
   * `tone` is optional here and absent from `Logs` on purpose (I35, F51).
   *
   * A fixed vocabulary the renderer knows needs no field — `logs` has levels,
   * and `levelTone` maps them. A container's actions are open-ended, so no
   * renderer can know whether `die` outranks `start`, and the producer that
   * does is the only one able to say. The two kinds differ because their
   * vocabularies differ, which is the consistent rule rather than a breach of
   * one: `/events` painted every type `accent`, so a `die · exit 137` read as
   * a `start`.
   *
   * The `type` column carries the word regardless, so the tone emphasises and
   * never carries alone (D29).
   */
  events: readonly Readonly<{ ts: string; type: string; message: string; tone?: Tone }>[];
}> & Gap;

export type Series = Readonly<{
  /**
   * The readings, oldest first. **`null` is a gap** — a position that produced
   * no reading — and it is the only non-number this array may hold (I46a).
   *
   * **Not `NaN`, and the difference is the serialiser.** A gap is representable
   * in memory as any non-finite value and C12 I4 renders one correctly, so this
   * looked for a while like a type that already carried absence. It does not
   * carry it in a *document*: I46 refuses a non-finite element, and
   * `JSON.stringify` writes `NaN` as `null` regardless — so the persisted form
   * was already this shape while the declared form forbade it. `null` is the
   * spelling that survives the round trip, which is the whole of the argument.
   *
   * Every consumer took it unchanged: `Number.isFinite(null)` is `false`, so
   * `finiteSamples`, `seriesRange` and `sparkline`'s filter treat a gap exactly
   * as they treated a `NaN`.
   */
  values: readonly (number | null)[];
  label?: string;
  tone?: Tone;
  marker?: string;
}>;

/**
 * `height` is optional on the type only because `sparkline` does not take one.
 * `form: "line"` without it is a construction error, not a default (§3) — a
 * defaulted height is how C12's central property fails silently.
 */
/**
 * The colormaps the framework ships, as a closed vocabulary (C10 I31).
 *
 * **The names live here and the tables live in L1**, which is the layer rule
 * doing exactly what it is for. A colormap's *table* is rendering data — 24-bit
 * triples, quantised per depth — and belongs where the renderer is. Its *name*
 * is schema: a document carries it, `validateBlock` checks it, and C04 owns what
 * a document may say. The first draft imported the table into the validator and
 * MG1 refused it, correctly: a document type cannot depend on how the thing is
 * drawn.
 *
 * **Closed, because an unknown name paints nothing** — and nothing is also what
 * a correct block paints at one bit, which is F172's collision arriving on a
 * third surface. A union makes the wrong name a compile error and
 * `COLORMAP_NAMES` makes it a document error.
 */
import type { ColormapName as ColormapName_ } from "../colormaps/index.js";
export type ColormapName = ColormapName_;
export { COLORMAP_MEMBERS, COLORMAP_NAMES } from "../colormaps/index.js";

/**
 * Every plot form, named so every dispatcher can be exhaustive over them.
 *
 * **A union written inline is a union nothing can be checked against.** Every
 * consumer of `form` was `=== "sparkline" ? … : …`, so a third member fell into
 * the line arm at three sites and compiled — which is a heatmap rendering as a
 * curve, silently and at the right height (C12 §6a).
 */
export type PlotForm =
  | "line" | "sparkline" | "heatmap"
  | "scatter" | "step" | "ecdf"
  | "bar" | "histogram" | "boxplot" | "forest" | "dumbbell" | "lollipop" | "dotplot" | "waffle"
  | "flame" | "icicle" | "funnel" | "gantt" | "waterfall" | "streamgraph"
  | "calendar" | "correlation" | "confusion" | "spectrogram" | "latency" | "density2d"
  | "density" | "violin" | "ridgeline"
  | "smallmultiples" | "pairplot"
  | "pie" | "radar"
  | "horizon";

/**
 * A claim about the ordinate, drawn beside the data (C12 §3e, I52).
 *
 * **One feature, and six named chart types collapse into it.** A Q-Q plot is a
 * scatter plus a reference line; an ROC curve is a line plus a diagonal; a
 * calibration plot, a residual plot and a Bland–Altman are the same shape again.
 * None is a renderer, so none is a `PlotForm`.
 *
 * **A band is one statement drawn as two lines**, not a fill: a fill would
 * compete for the cells the curve occupies, and at one bit it would be
 * indistinguishable from the curve. The survey's own ruling.
 *
 * **`tone` is decoration here and never the carrier** (F34). The line is dashed
 * where a curve is continuous, so the distinction survives one bit and a
 * colour-blind reader with the tone doing nothing load-bearing.
 *
 * **There is no `label`, and it is owed rather than forgotten.** The survey names
 * one — *a reference line, with a label* — and it has nowhere to go: the gutter
 * is sized from the y-labels and is a **scale**, so widening it for a string
 * that is not one changes the plot area for text that is not measured with it;
 * inside the area a label overwrites the curve it exists to be compared against.
 * It wants a legend row, which the overlaid form does not have. A member nothing
 * draws is indistinguishable from one not yet implemented, so the field arrives
 * with the row that can hold it.
 */
export type Annotation =
  | Readonly<{ kind: "line"; value: number; tone?: Tone }>
  | Readonly<{ kind: "band"; from: number; to: number; tone?: Tone }>
  | Readonly<{ kind: "confidence"; upper: readonly number[]; lower: readonly number[]; tone?: Tone }>
  | Readonly<{ kind: "whiskers"; points: readonly Readonly<{ x: number; y: number; err: number }>[]; tone?: Tone }>;

export type Plot = Readonly<{
  kind: "plot";
  id: string;
  form: PlotForm;
  series: readonly Series[];
  height?: number;
  axes?: boolean;
  xLabels?: readonly [string, string, string];
  /**
   * **The unit the value arrives in, not the unit it renders as** (I41, F31).
   *
   * `fraction` takes `0.84` and `percent` takes `100.2`; both draw a per-cent
   * sign, which is why the rendered form could never tell them apart and why
   * naming them by it gave one member two plausible meanings — the obvious call
   * rendered `10020%` against a far side emitting `CPUPerc: "100.2%"`.
   *
   * `fraction` is the arm that multiplies by 100. It was called `percent` and
   * kept the behaviour when it lost the name, because the surprising arm is the
   * one that should carry the surprising name.
   *
   * **This is geometry.** C12 §3 measures the gutter with `labelWidth` over the
   * rendered labels, so an arm that changes a label's width changes the plot
   * area — a format that reads like styling and is not.
   */
  yFormat?: "number" | "fraction" | "percent" | "bytes" | "duration";
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
  /**
   * Claims about the ordinate, drawn behind the data (I52, C12 I23).
   *
   * **Behind, and the order is the ruling**: an annotation that overwrote a
   * sample would hide the thing it exists to be compared against. Layers resolve
   * first-non-blank, so these are appended last.
   *
   * **An out-of-range edge is dropped rather than clamped**, which is the one
   * place this differs from a sample. I29 clamps a sample because pressing data
   * against the ceiling is honest; an annotation is a claim about *where* a
   * value sits, and one clamped onto a scale it is outside says the limit is
   * somewhere it is not.
   */
  annotations?: readonly Annotation[];
  /**
   * A continuous colormap by name, for a form that encodes magnitude (C10 I31).
   *
   * **The second channel, and density stays the carrier.** A heatmap's glyph is
   * chosen the same way at every depth and colour joins it above 8-bit, so the
   * 1-bit behaviour is unchanged *by construction* rather than by a fallback —
   * F34 satisfied throughout instead of at the bottom rung.
   *
   * **A name, not a family of slots.** A colormap is a function from a
   * normalised value to a colour and viridis is viridis on every theme, so it is
   * framework data rather than theme tokens: a theme chooses which, never what
   * it contains. An unknown name is refused at construction, because a name that
   * resolves to nothing renders uncoloured and green — F172's shape, and the one
   * this type will not reproduce.
   */
  colormap?: ColormapName;
  emptyMessage?: string;
  categories?: readonly string[];
  layout?: "overlap" | "grouped" | "stacked" | "normalised";
  binning?: "sturges" | "freedman-diaconis" | "scott";
  quartiles?: readonly QuartileSummary[];
  offsets?: readonly number[];
  totals?: readonly boolean[];
  startDate?: string;
  bands?: number;
  facets?: readonly Plot[];
  segments?: readonly Segment[];
  xScale?: ScaleType;
  yScale?: ScaleType;
  /**
   * How much of a band a distribution form spends on itself (C12 §3i, I28).
   *
   * Selects a renderer *inside* the declared height and never contributes to
   * it — rows-per-band times category count would be a height derived from the
   * data, which I1 forbids. So "auto" is the richest renderer the declared
   * height affords, and an explicit "full" that does not fit degrades.
   */
  plotDetail?: "auto" | "compact" | "full";
  plotStyle?: "auto" | "braille" | "line";
  plotCorners?: "rounded" | "sharp";
  /**
   * Which axis a categorical or distribution form runs along (C12 §3j, C12 I30).
   *
   * **`"horizontal"` is the default and it is a terminal's answer, not a
   * chart's.** A cell is about twice as tall as it is wide and a category's name
   * is text, so a horizontal bar gets its name written beside it in full while a
   * vertical one gets a column two or three cells wide to write it under. That
   * is why every terminal plotting library defaults this way and matplotlib does
   * not.
   *
   * Vertical is what a caller wants when the categories are **ordered** — a
   * histogram's bins, a month of readings — because a horizontal bar chart runs
   * its category axis top-to-bottom and time does not go that way.
   *
   * A form with no second axis refuses it at construction rather than ignoring
   * it: a plot that quietly drops a field is one the caller believes is showing
   * something else.
   */
  orientation?: "horizontal" | "vertical";
  palette?: string;
}> & Gap;

export type ScaleType = "linear" | "log" | "log2" | "ln" | "symlog" | "time" | { log: number };

export type QuartileSummary = Readonly<{
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: readonly number[];
  /**
   * The arithmetic mean (I53), drawn with its own mark and never the median's.
   *
   * The five-number summary has no place for it, and *where is the centre* has
   * two answers the moment a distribution is skewed — showing only the median
   * hides exactly the case a reader is looking for. Optional, because a summary
   * computed from quantiles alone genuinely does not have one.
   */
  mean?: number;
  centre?: number;
  lower?: number;
  upper?: number;
}>;

export type Segment = Readonly<{ label: string; value: number }>;

export type Progress = Readonly<{
  kind: "progress";
  id: string;
  label: string;
  current: number;
  total: number;
  /**
   * Which pair of glyphs the bar is drawn with (roadmap 51).
   *
   * **The gap the entry was refused for, rather than the reason to refuse it.**
   * *No consumer* was true of a field nobody could use because it did not exist
   * — `spinnerFrames(caps, name)` is the precedent and `barStyle(caps, name)` is
   * the same lookup, so the app names a style and C09 resolves it against the
   * terminal.
   *
   * Optional and unknown-tolerant: an absent or misspelled name is the default,
   * because a bar is decoration over a number that is already correct.
   */
  style?: string;
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
  /**
   * What the two columns are, headed `a` and `b` when absent (I40, F18's
   * sibling F33).
   *
   * **`a`/`b` is right about the type and was never right about the header.**
   * The renderer's own comment defends them as *positional rather than
   * directional*, which is the correct answer to *should the type call them
   * `before` and `after`* — S07 compares two runs and neither is "before". It
   * is not an answer to *may a consumer say which side is which*, and both
   * shipped consumers said it in a `keyValue` block above the comparison,
   * one block away from the columns it explains.
   *
   * Positional stays the default: a consumer that has nothing to say says
   * nothing, and gets the header it had.
   */
  labels?: readonly [string, string];
  rows: readonly Readonly<{
    field: string;
    a: string;
    b: string;
    /**
     * The change axis — neutral, and carried by a marker (I35, I36).
     *
     * Split from the old single `comparison` union because the renderer had
     * already split it: `comparisonTone` coloured `better`/`worse` and left
     * `same`/`changed` at `muted`/`default`. One union naming two axes that
     * render differently is why `added` and `removed` had nowhere to go (F30).
     */
    change?: "unchanged" | "changed" | "added" | "removed";
    /** The judgement axis, and the only half that takes a colour. */
    verdict?: "better" | "worse";
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
  /**
   * The affordances this patch offers — `view` for fullscreen (C25 §3b).
   *
   * On the block rather than as an unconditional key binding: the offer is data
   * the producer supplies, so a patch that should not offer fullscreen simply
   * does not carry the action. A binding that applied to every patch would give
   * the block no way to decline (C04 §3).
   */
  actions?: readonly Action[];
  layout?: "unified" | "split";
  /**
   * The gutter width, in cells, **pinned when this block is a window of a
   * larger one** (C25 I21a).
   *
   * `numberWidth` walks every line of every hunk, so a window whose widest line
   * number is narrower than the block's draws a narrower gutter and every row of
   * text shifts sideways as the reader scrolls. Measured on the shipped
   * fullscreen view: 4 cells whole, 1 in the window at offset 0.
   *
   * **The same argument `Hunk.header` already carried** (C25 I21) — a window
   * describes the block it came from, not the slice it shows — one field along.
   * A producer building a patch by hand leaves it absent and nothing changes;
   * it exists so a *window* can say what its parent measured.
   */
  numberWidth?: number;
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
  /**
   * Whether this region refreshes (I39, F18).
   *
   * **A fact, not a character.** `Glyph` has carried a `live` slot with both
   * renderings — `▌` and `|` — since C04 was written, S1 and S13 both draw it,
   * and nothing in the tree consumed it: a slot reserved and unreachable, which
   * is A03 §2's class in the glyph table.
   *
   * The remedy is not a glyph field on `Panel`. A panel is live or it is not, so
   * the block names the fact and C09 derives the mark (I38) — which is what makes
   * it degrade to `|` under ASCII, where a `▌` written into the `title` would
   * not, and would be F6's mistake made deliberately.
   *
   * It changes no measurement: the mark rides in the top border, which is drawn
   * either way.
   */
  live?: boolean;
  children: readonly Block[];
}> & Gap;

export type Group = Readonly<{
  kind: "group";
  id: string;
  direction: "row" | "column";
  children: readonly Block[];
  /**
   * How a `row` group's width is divided — one share per child (I42, I44, §3).
   *
   * **Absent is an equal split**, which is what every group did before this
   * field and what `[1, 1, …]` still means: the arithmetic is identical, and a
   * row asserting that is what keeps the two from drifting.
   *
   * **Not C11's `flex`, which shares the name and not the mechanism.**
   * `Column.flex` is a boolean over a minimum derived from the column's
   * content — absorb the residual, or do not. A group knows
   * `measure(block, width) → height` and **no preferred width**, so there is
   * nothing here for a child to absorb *from*, and a declared proportion is the
   * only allocation this level can express.
   *
   * Ignored on a `column` group, where every child takes the full width, on
   * `gapBefore`'s precedent: the same block travelling into either direction
   * should not fail. Knowingly vacuous, and said out loud because an ignored
   * field is how a value comes to be silently unread.
   */
  flex?: readonly Share[];
  /**
   * Where each child sits inside what `flex` gave it (I45, §3).
   *
   * A second array beside `flex` rather than a field on it: one says how much
   * space, the other says where in it, and merging them would make a size field
   * carry a position. Two is the limit — a third parallel array is a record per
   * child, and this one is not it.
   *
   * Ignored on a `column` group, on `flex`'s precedent and for its reason.
   */
  align?: readonly Valign[];
}> & Gap;

/**
 * One child's share of a `row` group's width (I44).
 *
 * A **number** is a weight — a proportion of what is left. `{ cells: n }` is an
 * intrinsic width, in cells, and it is the answer to the question R1 left open:
 * a group cannot ask a child how wide it wants to be, so a child that knows
 * says. The banner is the measured case — a 40-cell whale beside a wordmark —
 * and it cannot be written as `40 : 61`, which gives 41 and 62 at 105 columns
 * and 47 and 71 at 120.
 *
 * **Fixed shares are taken off the budget first**, and the weights divide what
 * remains; any other order makes a cell count a suggestion. **Placement is
 * unchanged**: a fixed child that does not fit is dropped exactly as any other
 * is, because privileging it would make the rendered set depend on a
 * declaration rather than on the order the author wrote.
 */
export type Share = number | Readonly<{ cells: number }>;

/**
 * Where a `row` group's child sits in the row's height (I45).
 *
 * **One axis, and the other one is not expressible — which is R1 a third time.**
 * The walk ruled two: horizontal within the child's own allocation, vertical
 * within the row's height. Building it showed only the second can exist. Every
 * renderer fits its output to the width it is handed, so a child allocated ten
 * cells emits ten-cell rows and there is nothing left to place: aligning a
 * ten-cell box inside a ten-cell box is a no-op, measured. Placing it would mean
 * knowing how wide the content actually is, and `measure(block, width) → height`
 * does not answer that — the same missing preferred width that made weights the
 * only allocation and `{cells: n}` the child's own business.
 *
 * **Heights are measurable and widths are not**, and that asymmetry is the whole
 * reason this field has one axis. The banner is its consumer, and **it is one
 * now rather than in principle**: `examples/docker/src/banner.ts` hand-wrote the
 * blank first row that puts the wordmark's seven lines on the whale's hull, and
 * `bannerRow` passes `["top", "bottom"]` instead.
 *
 * **It sat unclaimed for a while, and how is worth recording here.** This
 * sentence named the consumer and the hand-padding it replaced; the consumer's
 * own comment said a row group *has no opinion* about vertical alignment. Both
 * were correct about their own half, neither author was reading the other, and
 * the suite already held the proof — K6 drew a bottom-aligned seven-row wordmark
 * against the eight-row one and they matched. **A condition is written where the
 * deferral is and what meets it is written somewhere else**, which is why the
 * habit is to grep from the satisfier rather than to watch from the deferral.
 *
 * Absent is `top`, which is what a row did before this existed.
 */
export type Valign = "top" | "middle" | "bottom";

/** The escape hatch, and load-bearing: the vocabulary never has to be complete. */
export type Raw = Readonly<{ kind: "raw"; id: string; text: string }> & Gap;

/**
 * A bounded region: a box of declared height holding children (C04 §3c, I47).
 *
 * **C26 §4b's cell 3 — the one kind declaring both `elements` and `window`.**
 * `↓` steps a child and the window follows; `PgUp`/`PgDn` move the window and
 * leave focus alone. The offset is **view state** and is not here: it is a row
 * count held by L4, droppable, restored by no resume (I48).
 *
 * **Reach for one where bounding is the point** — a view, the live entry, a
 * dashboard, an activity region. In the scrolling transcript a long block is
 * already fine, because the transcript is what scrolls; wrapping a 400-line
 * result in one there hides 380 rows, and after I48 it hides them permanently
 * until block-to-block focus lands (roadmap 46, C26 §11).
 */
export type Scroll = Readonly<{
  kind: "scroll";
  id: string;
  /**
   * The **content** height, in rows. A positive integer.
   *
   * The residue marker is chrome the container adds on top of it (I49), so the
   * box is `height` rows of content and one more when the children do not fit.
   */
  height: number;
  /**
   * At least one, and an empty one is a construction error (I47).
   *
   * **The elements are one per child**, which is what makes *no elements* and
   * *no children* the same fact — and that is the whole reason the refusal can
   * live here rather than in the renderer (§3c cell 5).
   */
  children: readonly Block[];
}> & Gap;

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
  | Scroll
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
