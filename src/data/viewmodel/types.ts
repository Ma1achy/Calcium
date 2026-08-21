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

/**
 * A row of a **vector** field — `Series`' shape, with two numbers per position
 * (C04 I61, C12 I50).
 *
 * **The one shape on `Plot` that could not be reused.** A contour takes the
 * matrix family's `series` unchanged; a quiver needs `u` and `v` per cell and
 * nothing here carried two numbers at a position. Beside `ohlc`, `hierarchy`
 * and `segments`, which are the other form-specific shapes.
 *
 * `null` is a gap and never `NaN`, on I46a's argument unchanged: `JSON.stringify`
 * writes `NaN` as `null` regardless, so the declared form should be the persisted
 * one. **A gap is distinct from a still cell** — a still cell has a reading and
 * it is zero, and C12 I50 draws neither, so the two are told apart by whether
 * the field beneath them paints.
 *
 * `v` is **north-positive**, the data convention rather than the screen's; the
 * renderer flips it, so no caller has to know which way the rows run.
 *
 * No `tone` and no `marker`: a quiver's colour is its magnitude (C12 I50), so a
 * per-row tone would be a second claim on the one channel the form has.
 */
export type VectorSeries = Readonly<{
  values: readonly (readonly [number, number] | null)[];
  label?: string;
}>;

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
  | "flame" | "icicle" | "funnel" | "gantt" | "waterfall" | "streamgraph" | "stackedarea" | "treemap"
  | "slope" | "bubble" | "autocorrelation" | "timeline" | "bullet" | "utilisation"
  | "calendar" | "correlation" | "confusion" | "spectrogram" | "latency" | "density2d"
  | "contour" | "quiver"
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
 * **A band is one statement with two edges, and the area between them.** The
 * fill was refused — *a fill would compete for the cells the curve occupies, and
 * at one bit it would be indistinguishable from the curve* — and the refusal was
 * half right, which is why it survived being read. The competition has an owner:
 * `mergedRow` takes the first layer that inked a cell and an annotation is last,
 * so a curve draws over its own band by construction. The alphabet half stands,
 * and it is exactly what the obvious fill would be — braille, which is the
 * curve's own. So the fill is `░`, a block element, on a **narrow** unicode
 * terminal and nowhere else: `░` doubles at `ambiguousWidth: "wide"`, and the
 * only narrow substitutes the tree holds are braille and the ASCII ramp, both of
 * which the curve is already drawn in. Where it cannot draw, the two dashed
 * edges carry the band (C12 §3e).
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
  | Readonly<{
      kind: "confidence";
      upper: readonly number[];
      lower: readonly number[];
      tone?: Tone;
      /**
       * Whether the area between the edges is shaded (C12 §3e, I52).
       *
       * **Defaults on**, because a band drawn as two unconnected dashed lines is
       * the reading a caller has to be told to want and `fill_between` is the
       * one they arrive expecting. `false` keeps the two-edge frame byte for
       * byte, which is what makes moving the default safe.
       *
       * Inert where the capabilities have no alphabet left — see the type's own
       * note above. That is C12 I25's substitution ladder reaching its bottom
       * rung, not a member with no arm (F207).
       */
      fill?: boolean;
    }>
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
   * Pin the horizontal domain the samples span, independently and optionally
   * (I58, C12 I41, §3d.1).
   *
   * **`Series.values` is a bare array, so there is no x coordinate anywhere in
   * this type** — the abscissa a sample has is its *index*. Absent, that is the
   * domain: `[0, n − 1]`, which is what `ax.plot(y)` labels and what the data
   * has when nothing else was said. Present, the samples are read as spanning
   * `xMin … xMax` evenly, so a series sampled once a second for a minute says
   * `xMin: 0, xMax: 60` and its axis reads in seconds.
   *
   * **Not a second way to spell `xLabels`.** That field is three captions —
   * the caller's own words at left, centre and right — and this is a scale.
   * Where both are present the captions win: overriding what a caller wrote
   * with what we inferred is the wrong direction.
   */
  xMin?: number;
  xMax?: number;
  /**
   * The unit the abscissa arrives in — **`yFormat`'s vocabulary, deliberately**.
   *
   * One formatter, two axes, for `BarSpec.format`'s reason exactly: a second
   * enum is a second place for the `fraction`/`percent` confusion to happen.
   */
  xFormat?: Plot["yFormat"];
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
  /**
   * The bars a `plotStyle: "candlestick"` draws (C04 I57, C12 I36).
   *
   * **Overlay `series` are optional and `series: []` is the ordinary case.** A
   * non-empty `series` draws over the candles on the shared axis — a moving
   * average is what that is for — so the range unions both and the legend
   * names the candles as well as each series.
   */
  ohlc?: readonly OHLC[];
  offsets?: readonly number[];
  totals?: readonly boolean[];
  /**
   * The cell a `calendar` is built from, which picks the grid (C12 I53, §3ae).
   *
   * **Rows are the sub-unit and columns the super-unit** — one statement over
   * four layouts rather than four layouts that happen to agree: `hour` is 24
   * rows and a column is a day, `day` is 7 rows (`Mon … Sun`) and a column is a
   * week, `week` is 5 rows and a column is a month, `month` is 12 rows and a
   * column is a year.
   *
   * **The span needs no member, and that is what the unit buys.** `startDate` +
   * this + `series[0].values.length` states it exactly, and a `span` field
   * beside those three would be a fourth statement of a fact they already fix.
   *
   * One flat series in time order, and more than one is refused: a calendar's
   * rows *are* a period, so a second series is a second period claiming the same
   * rows. Without this member a `calendar` stays the raw matrix it has always
   * been, so no shipped frame moves.
   */
  calendarUnit?: "hour" | "day" | "week" | "month";
  /**
   * When the first reading was taken, for a `calendar` (C12 I53, §3ae).
   *
   * `YYYY-MM-DD`, optionally `THH`, `:MM`, `:SS` and a trailing `Z` —
   * everything below the hour is *inside* the cell rather than discarded, which
   * is what makes ignoring it honest. A zone offset is refused rather than
   * ignored, and a date that does not exist is refused on the leap rule.
   * Required with `calendarUnit`: index 0 → row 0 is an assumption the caller
   * never stated.
   */
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
  /**
   * What one column draws (C12 I36, §3r).
   *
   * **`candlestick` is a style and not a thirty-third form**, because everything
   * a line plot has is unchanged — axis, grid, annotations, legend, crosshair
   * — and only the column's mark differs. So `form` stays `line` or `step`,
   * and the data it draws is `ohlc` rather than `series`.
   */
  /**
   * The iso-lines a `contour` draws, or derived when absent (C04 I61, C12 I49).
   *
   * Derived through `niceAxis` — the y gutter's own function — so a contour's
   * levels and the axis ticks are the same numbers rather than two nice-number
   * runs that agree at most ranges and not all. The interior ticks only: a level
   * at the field's minimum crosses nothing, so drawing it says *no contour*
   * where the caller asked for one.
   *
   * A declared level outside the field's range is kept in the legend and drawn
   * nowhere. Dropping it makes an empty plot area indistinguishable from a
   * constant field, which is the one thing a contour has to be able to say.
   */
  levels?: readonly number[];
  /**
   * What is drawn over a field, in **draw order — last on top** (C04 I61, C12 I51).
   *
   * The painter's reading, which is what a caller expects; `mergedRow` resolves
   * a contested cell **first-wins**, so the array is reversed at that seam and
   * nowhere else. The two answer different questions: this says *what is drawn*,
   * `Layer.kind` says *how two inked cells resolve*.
   *
   * **`field`'s membership is load-bearing and its position is not.** A
   * background has no glyph and cannot occlude one, so `["field", "contour"]`
   * and `["contour", "field"]` render byte-identical — membership says whether
   * the field paints at all, which is how `["contour"]` asks for lines on an
   * unpainted area. Stated because a reader given an ordered array will assume
   * every position in it means something.
   */
  layers?: readonly ("field" | "contour" | "quiver")[];
  /**
   * Whether the field dims to make room for a glyph over it (C12 I51, §3y).
   *
   * **A glyph over a colormap competes on legibility, not on cells**, which is
   * the thing *the background has no competition* gets backwards. Measured
   * against the 4.5 : 1 floor, a white glyph clears it on 45% of viridis and 16%
   * of coolwarm; every theme slot clears viridis on 3–19%.
   *
   * `"floor"` dims until every sample clears, **computed per map rather than
   * tabulated** — the shipped factors come out at 50% for viridis and coolwarm
   * and 40% for inferno, and a constant that clears three maps fails the fourth.
   * Its price is stated because it is real: viridis keeps 0.165 of its 0.742
   * luminance spread, 22%, and luminance is the ordering channel a perceptual
   * map exists for. So the remedy costs the thing the map was chosen for, which
   * is why it is not the default.
   *
   * Inert below `colourDepth: 8`, where there is no background to dim.
   */
  fieldDim?: "none" | "floor";
  /**
   * Where a glyph over a field takes its colour from (C12 I51, §3y).
   *
   * **Two fields rather than one union**, on `plotFrame`'s test above: a single
   * enum would make `fieldDim: "floor"` with `glyphInk: "contrast"`
   * inexpressible, and neither makes the other meaningless — one changes the
   * background, the other the foreground.
   *
   * `"contrast"` picks black or white per cell from that cell's own background,
   * which is seaborn's annotated heatmap. It does not break *a block names a
   * palette slot*: the block still names a `colormap`, and `continuousColour`
   * already resolves data-dependent colour inside the renderer. Its price is
   * that the glyph's colour stops meaning magnitude — so on a `quiver` it spends
   * the second channel to save the first.
   */
  glyphInk?: "own" | "contrast";
  plotStyle?: "auto" | "braille" | "line" | "candlestick" | "solid";
  /**
   * Whether a shape's interior is drawn (C04 I59, C12 I43, §3w).
   *
   * **Refused where the vocabulary cannot fill.** A box-drawing outline has no
   * interior alphabet: `█` inside `╭──╮` is an outline in one alphabet around a
   * body in another, a third figure rather than the same one filled. So
   * `"solid"` with `plotStyle: "line"` is a construction error and not an
   * ignored member, which reads as one not yet implemented.
   */
  plotFill?: "none" | "solid";
  /**
   * The shape of a radar's value rings and outer bound (C12 I45, §3w).
   *
   * **A default rather than an inference.** The two arms had already chosen
   * differently — braille drew circles through `arcDots`, the quadrant arm drew
   * *n*-gons through the data's own vertices — and neither said so. `"polygon"`
   * is the default because the grid is a ruler for the shape measured against
   * it: at three categories a circular ring behind a triangular polygon is two
   * figures in one frame. At ten the two are within a dot.
   *
   * **Not chosen from the category count**, which is the tempting rule — a
   * figure that changes shape at a threshold is two figures with one name.
   */
  plotGrid?: "polygon" | "circle";
  /**
   * A compact box plot's interquartile run (C12 I46, §3i).
   *
   * At one row a box has no top and bottom edge, so its interior carries the
   * range: a blank one leaves `┤    ├` and says nothing about where the box
   * begins. **Filled is not the only run a whisker is not** — `"line"` draws it
   * a stroke heavier than the whisker instead, which keeps the summary a line
   * drawing where `"solid"` gives it mass against a density behind it.
   */
  plotBox?: "solid" | "line";
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
  /**
   * The kernel bandwidth, as a **multiplier** on the rule of thumb (C12 §3m).
   *
   * seaborn's `bw_adjust`, and a multiplier rather than an absolute width for
   * the reason seaborn chose one: a bandwidth in the data's own units means
   * nothing until you know the data, so every caller would be computing
   * Silverman themselves to scale it.
   *
   * **The default oversmooths multimodal data and that is a property of the
   * rule, not a defect.** Silverman assumes something roughly normal; two
   * separated peaks are exactly the case it flattens, and no automatic choice
   * fixes it — which is why the escape is a field rather than a better default.
   * Below 1 sharpens, above 1 smooths.
   */
  bandwidth?: number;
  /** The tree `flame`, `icicle` and `treemap` are drawn from (C04 I54, C12 §3n). */
  hierarchy?: HierarchyNode;
  /**
   * The vector field a `quiver` draws (C04 I61, C12 I50).
   *
   * Required on that form and refused on every other. Where `series` is empty
   * the field beneath the arrows is the vectors' own **magnitude**, which is the
   * only scalar a vector field has unless the caller names another.
   */
  vectors?: readonly VectorSeries[];
  /**
   * Where a matrix puts a row shorter than its width (C12 §3o).
   *
   * `"stretch"` spreads the readings across the area, `"window"` keeps the
   * newest at the right and blanks the left, `"left"` grows from the left and
   * scrolls once full. The default is per form: a live feed anchors so a
   * column does not move every tick, and a grid of categories has no time axis
   * to anchor to.
   *
   * **`"uniform"` is `"left"` with the cells widened to fill** (C12 §3ae.5),
   * added because a `calendar`'s columns are the family's first with an
   * *intrinsic width* — a week is a week. `"stretch"` gives widths differing by
   * one cell, which is imperceptible at a pitch of six and a **doubling** at a
   * pitch of one, and a two-cell week beside a one-cell week reads as two weeks
   * holding one value (C12 §6b B15). Every column takes `⌊w ÷ n⌋` cells, the oldest
   * drop first as `"left"`'s do, and the remainder is a fringe the caller
   * removes with `width` rather than by stretching a period. The two arms are
   * identical wherever the pitch is one.
   */
  matrixAnchor?: "stretch" | "window" | "left" | "uniform";
  /**
   * Where the legend goes, or `false` for none (C12 §3g, C12 I27).
   *
   * **The two axes behave differently, and it is a constraint rather than
   * taste.** `"left"` and `"right"` cost **width**, which is already
   * data-dependent — the gutter sizes itself from the y-range — so they may size
   * themselves to the longest label and turn themselves on where a form needs
   * one. `"above"` and `"below"` cost a **declared row**, and C12 I1 requires the
   * row count to be known before the data is, so they are a fixed one row and
   * never auto-enable.
   *
   * That asymmetry is why `"right"` is the default: it is the only placement
   * that can turn itself on.
   */
  legend?: "above" | "below" | "left" | "right" | false;
  /**
   * The shape of the furniture, where `axes` says whether there is any
   * (C12 §3f, C12 I26).
   *
   * **Two fields because they answer two questions.** A single enum spelling
   * `"none"` would make `axes: false, plotFrame: "box"` expressible and
   * meaningless.
   *
   * The references disagree with each other — UnicodePlots ships `:solid` and
   * `:corners`, plotext draws a closed box, kitty.r draws gridlines — so this is
   * a style field rather than a choice the framework makes for the caller.
   */
  plotFrame?: "box" | "corners" | "grid" | "rule";
  /**
   * Which side of the plot area the y labels sit on (C12 I47, §3x).
   *
   * At eighty columns a reader cannot track a row back to a label seventy cells
   * away, which is why every financial and monitoring TUI mirrors its axis.
   * `"both"` draws the **same** ticks on both sides — a second *scale* on the
   * right is a different feature and is refused, because two ranges on one
   * figure assert a correlation the data does not have.
   *
   * It costs **width and never a row**, so C12 I1 is untouched: this is the
   * vertical legend's data-dependent kind (C12 I27) and not its declared kind.
   * `false` removes the labels and keeps the frame and the x axis, which is
   * what `axes: false` cannot say on its own.
   */
  yAxis?: "left" | "right" | "both" | false;
  /**
   * A reading at the right edge, on the row each series ends at (C12 I48, §3x).
   *
   * **Named for the case it serves.** On a static chart the last value is at the
   * end of the line and the callout is clutter; on a live one it is the number
   * that matters most and the hardest to read off a line still moving. So it is
   * opt-in, and it needs a right gutter to write in — `yCallout` with
   * `yAxis: "left"` is refused rather than quietly widening the axis.
   */
  yCallout?: "none" | "last";
  /**
   * The cells the figure is drawn in, narrower than the frame it sits in
   * (C04 I62, C12 §3ab).
   *
   * **Clamped at render and not refused at construction**, because C04 has no
   * terminal width: a validator refusing a width it cannot measure asserts a
   * fact it does not hold. What the gates check is what a document can be wrong
   * about on its own — finite, positive, integral.
   *
   * A width too narrow for the gutter and the area together reaches
   * `layoutFor`'s existing `null` and draws *Too narrow.*, which is a rung that
   * already existed reached by a new road.
   */
  width?: number;
  /**
   * Drawn width to drawn height, **visually** (C04 I62, C12 §3ab).
   *
   * **The member that knows a cell is not square**, which is the whole of why it
   * is not arithmetic in the caller: `aspect.ts`'s argument is that exactly one
   * file knows the ratio, and a caller deriving a width from a height has to.
   * With a cell 1 × 2, `a = w / (h · CELL_ASPECT)`, so `a: 1` is a visually
   * square figure and `a: 2` is twice as wide as it is tall.
   *
   * **The height is declared and the width derived**, never the other way:
   * C12 I1 forbids a plot's height coming from anything but the caller. Mutually
   * exclusive with `width` — two ways to say one number, and picking one quietly
   * would be reading the caller's other statement.
   */
  aspect?: number;
  /**
   * Where a narrowed figure sits in its frame (C04 I62, C12 §3ab).
   *
   * **Refused without `width` or `aspect`**, and the refusal is what gives the
   * member its necessity: aligning a figure that already fills its frame does
   * nothing, and a member that does nothing reads as one not yet implemented
   * (F207).
   *
   * **Not `matrixAnchor`.** That places a row shorter than the area inside a
   * fixed area; this places an area narrower than the frame inside the frame.
   * Two containers, two contents, and a caller setting both gets both.
   */
  align?: "left" | "centre" | "right";
  /**
   * Which corner of the plot area the data grows from (C04 I62, C12 §3ac).
   *
   * **Refused where `ORIGIN_DEFAULT` says `null`** — 27 of the 44 forms — and
   * the set was measured rather than reasoned. The question this type first
   * asked was *does the form have two reversible directions*, and it is the
   * wrong question: what decides it is **which machinery places the data**.
   * Seven positional forms carry their direction in two functions and ten matrix
   * forms in two places; eleven categorical forms carry each bar's direction in
   * its own row builder, and fourteen forms are their own renderer.
   *
   * **The default is not one corner**, which is why `ORIGIN_DEFAULT` is a record
   * rather than a constant: a curve's first sample is at the left with its value
   * growing upward, and a matrix's `series[0]`, `values[0]` is at the *top*
   * left, because a row index grows downward and a value does not.
   */
  origin?: Origin;
  /**
   * Where the axes are drawn: at the plot area's edges, or crossing at zero
   * (C04 I62, C12 §3ad). `"edge"` when absent, which is what every frame drew
   * before this existed.
   *
   * **A separate field from `origin`, on `plotFrame`'s test.** One enum spelling
   * `"centre"` beside the four corners would make `origin: "top-right"` with a
   * crossing axis inexpressible, and the two answer different questions — which
   * corner the data grows from, and where the axes meet.
   *
   * **This is gnuplot's `set zeroaxis` and not matplotlib's moved spine**: the
   * gutter keeps the scale and the captions keep their row, and the crossing
   * axes are two rules inside the plot area. `plotFrame: "corners"` composes to
   * give the other picture.
   *
   * **Honoured on seven forms and dropped rather than refused where the data
   * cannot place it.** The acceptance set is `HONOURS_AXIS_CROSS`; the two
   * conditions on each half — a range that strictly straddles zero, and a
   * position strictly inside the area — are the renderer's, because no gate can
   * see a realised range from L0 (A02 §1).
   */
  axisCross?: AxisCross;
}> & Gap;

/** Which corner of a plot area the data grows from (C04 I62, C12 §3ac). */
export type Origin = "bottom-left" | "bottom-right" | "top-left" | "top-right";

/** Where a plot's axes are drawn (C04 I62, C12 §3ad). */
export type AxisCross = "edge" | "zero";

/**
 * Which forms honour `origin`, and what each one defaults to (C04 I62, C12 §3ac).
 *
 * **`null` is the refusal, so one total record carries the acceptance set and
 * the default together** — `FURNITURE_ROWS`' argument, which is that two records
 * obliged to agree should be one record whose agreement is the thing that ships.
 * It lives here rather than beside the renderer for `STYLE_ARMS`' reason: the
 * validator needs it and L0 cannot import L1 to ask (A02 §1).
 *
 * **Measured, not reasoned** (C12 §3ac). The rows are the placement machinery:
 * `"bottom-left"` for the seven positional forms, `"top-left"` for the ten
 * matrix forms whose row index grows downward, and `null` for the eleven
 * categorical forms, the fourteen own renderers and the two facet containers.
 *
 * **`bar` is the refusal worth naming**, because it is the most ordinary chart
 * in the catalogue and was not among the three this record was guessed to
 * contain. Its rows come from `categoricalForm` in one place and each bar's
 * direction from its own row builder in eleven. **The condition is a symbol so a
 * grep finds it**: `origin` reaches the categorical family the day
 * `categoricalForm` takes a shared span builder for the row body instead of a
 * `rowBuilder` per form.
 *
 * **A facet container refuses because its `origin` would name a different
 * thing** — which corner the first *facet* sits in, not which corner the data
 * grows from. `facets` is `readonly Plot[]`, so each facet declares its own.
 */
export const ORIGIN_DEFAULT: Readonly<Record<PlotForm, Origin | null>> = Object.freeze({
  // Positional — the direction is `rowOf` and `columnsOf`.
  line: "bottom-left", scatter: "bottom-left", step: "bottom-left",
  ecdf: "bottom-left", slope: "bottom-left", bubble: "bottom-left",
  density: "bottom-left",

  // Matrix — the direction is `columnMap` and `matrixRows`' loop, and a row
  // index grows downward, so the first datum is already in the top-left corner.
  heatmap: "top-left", calendar: "top-left", correlation: "top-left",
  confusion: "top-left", spectrogram: "top-left", latency: "top-left",
  density2d: "top-left", utilisation: "top-left",

  // **The two field forms refuse, and the code is what said so** (C12 §3ac).
  // A `contour`'s isolines and a `quiver`'s arrows are rasterised into *area*
  // coordinates by `fieldLayers`, a second placement inside the matrix — so a
  // flip reaching the wash and not the field draws isolines over the wrong
  // cells, and mirroring the rasterised row instead is the braille dot
  // permutation probe 3 ruled out. **The condition is a symbol**: they join the
  // day a `FieldLayer` is sampled in `columnMap`'s space rather than the area's.
  contour: null, quiver: null,

  // Categorical (11) — `categoricalForm` orders the rows in one place and each
  // form's own `rowBuilder` draws the bar's direction.
  autocorrelation: null, bar: null, bullet: null, dotplot: null, dumbbell: null,
  forest: null, funnel: null, gantt: null, lollipop: null, timeline: null,
  waterfall: null,

  // Their own renderer (14).
  boxplot: null, flame: null, histogram: null, horizon: null, icicle: null,
  pie: null, radar: null, ridgeline: null, sparkline: null, stackedarea: null,
  streamgraph: null, treemap: null, violin: null, waffle: null,

  // Facet containers — each facet is a `Plot` and declares its own.
  smallmultiples: null, pairplot: null,
});

/**
 * Which forms honour `axisCross` (C04 I62, C12 §3ad).
 *
 * **A strict subset of `ORIGIN_DEFAULT`'s fifteen, and the difference is the
 * matrix family.** A matrix has a corner and no zero: `origin` asks which way
 * the axes run, and this asks where they meet, so it needs a numeric ordinate
 * *and* a numeric abscissa. Seven of forty-four.
 *
 * **A plain boolean where `origin` carries a default, because there is nothing
 * to default to.** `"edge"` means *draw no rule inside the area*, which is
 * exactly what a refusing form does — so a per-form default would be the same
 * value in all forty-four rows and would say nothing.
 *
 * **Not `HAS_POSITION_AXIS`, for the third time** (C12 I43's finding; C12 §3ac
 * records the second). That record holds `stackedarea` and `streamgraph`, which
 * have their own composers, and `contour` and `quiver`, which the matrix
 * renderer draws — eleven forms answering *does the abscissa carry positions*,
 * where this one asks *who composes the area*.
 *
 * Measured by instrumenting `overlaidRows` and rendering the whole corpus, not
 * reasoned from the shape of the forms (C12 §3ad.2).
 */
export const HONOURS_AXIS_CROSS: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // The positional family — `overlaidRows` composes the area, and a crossing
  // axis is a reference row merged behind the data there.
  line: true, scatter: true, step: true, ecdf: true, slope: true,
  bubble: true, density: true,

  // Matrix — a corner, and no zero to cross at.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false, utilisation: false,
  contour: false, quiver: false,

  // Categorical — one row or column per category; the abscissa is a set of
  // names and has no origin.
  bar: false, forest: false, dumbbell: false, lollipop: false, dotplot: false,
  funnel: false, gantt: false, waterfall: false, timeline: false, bullet: false,
  autocorrelation: false,

  // Own renderer — a disc, a mosaic, a tree, a band, a single row.
  boxplot: false, flame: false, histogram: false, horizon: false, icicle: false,
  pie: false, radar: false, ridgeline: false, sparkline: false, stackedarea: false,
  streamgraph: false, treemap: false, violin: false, waffle: false,

  // Facet containers — each facet is a `Plot` and declares its own.
  smallmultiples: false, pairplot: false,
});

/**
 * Which `plotStyle` arms a form actually has (C12 I43, §3w).
 *
 * **The refusal was a clause naming `candlestick` and the form it needs** —
 * right, and a special case: every style is one some forms draw and others do
 * not, so a second style would have wanted a second clause. This is that shape
 * as data, and the refusal is one rule over it.
 *
 * `"auto"` is every form's, and is left out of the lists rather than repeated
 * into all thirty-five: it means *the renderer decides*, which every renderer
 * can always do.
 *
 * Total over `PlotForm`, so the thirty-fifth form declares its arms or does not
 * compile.
 *
 * **Here and not in `presentation/plot/`, because the validator needs it.**
 * `SHARES_CELLS` and its siblings are rendering facts and live beside the
 * renderer; which styles a form *has* is a fact about the contract, and L0
 * cannot import L1 to ask (A02 §1). C12 reads it downward, which is the
 * direction that is allowed.
 */
/**
 * Which forms draw a y gutter at all — the set `yAxis` can move (C12 I47, C12 §3x).
 *
 * **Measured, not reasoned.** Every catalogue fixture was rendered at
 * `axes: true` and asked whether any row carries an edge glyph at a column
 * past the first: thirty-two do and ten do not. The measurement corrected one
 * guess in each direction — `smallmultiples` and `pairplot` *look* gutter-ed
 * because a facet's own gutter shows in the frame, and the outer block draws
 * none. A facet is a `Plot` and declares its own `yAxis`, which is the same
 * answer `HAS_POSITION_AXIS` gives for the same reason.
 *
 * A non-`"left"` `yAxis` on a form with no gutter is **refused** rather than
 * ignored. F207 is what ignoring costs: a field accepted on a form that has no
 * arm for it tells the caller nothing and the reader nothing.
 *
 * **Here and not in `presentation/plot/`, for `STYLE_ARMS`' reason**: the
 * validator needs it and L0 cannot import L1 to ask (A02 §1). `SHARES_CELLS`
 * and its siblings stay beside the renderer because they are facts about
 * drawing; which sides a form *has* is a fact about the contract.
 */
export const HAS_Y_GUTTER: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // A scale in the gutter, one label per labelled row.
  line: true, scatter: true, step: true, ecdf: true, density: true,
  slope: true, bubble: true, stackedarea: true, streamgraph: true,
  // A name in the gutter, one per row or band.
  bar: true, histogram: true, boxplot: true, violin: true, ridgeline: true,
  forest: true, dumbbell: true, lollipop: true, dotplot: true, funnel: true,
  gantt: true, waterfall: true, timeline: true, bullet: true, autocorrelation: true,
  // A matrix's row labels *are* its ordinate (C12 I18), which is why
  // `yAxis: false` is refused here and only here.
  heatmap: true, calendar: true, correlation: true, confusion: true,
  spectrogram: true, latency: true, density2d: true, utilisation: true,
  // **A contour is a matrix by the same argument** (I49): its rows are the
  // field's rows, and a field with no names beside it is a picture of numbers.
  contour: true, quiver: true,
  // One row, or a figure that bounds itself: no gutter to put a label beside.
  sparkline: false, horizon: false, waffle: false,
  pie: false, radar: false, flame: false, icicle: false, treemap: false,
  // Composition: the facets carry the gutters and each declares its own.
  smallmultiples: false, pairplot: false,
});

/**
 * Which forms rasterise a **per-series curve** into the plot area — the set a
 * callout can name (C12 I48, C12 §3x).
 *
 * A callout needs ink belonging to *one* series, which is what `positionalForm`
 * produces and what a band, a mosaic and a matrix do not: a stacked area's rows
 * are one figure cut into parts, so *where does this series end* has no answer
 * a row can carry.
 *
 * **Not `HAS_POSITION_AXIS`, which was the obvious reuse.** That record says
 * whether the *abscissa* is a position — a question about the other axis — and
 * it answers `true` for `stackedarea` and `streamgraph`, which have no per-series
 * ink at all. A total record over forms reads as a complete answer to a question
 * it cannot ask, which is C12 I43's finding one field along.
 */
export const HAS_CALLOUT: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  // Everything `positionalForm` renders, including the two that derive a block
  // first — an ECDF's last value is its own last reading, and a density's is the
  // estimate at the right edge, which is what the figure draws in both cases.
  line: true, scatter: true, step: true, ecdf: true, density: true,
  slope: true, bubble: true,
  // Bands, not curves: one figure cut into parts.
  stackedarea: false, streamgraph: false, ridgeline: false,
  // A row or a column per category; the gutter already names each one.
  bar: false, histogram: false, boxplot: false, violin: false,
  forest: false, dumbbell: false, lollipop: false, dotplot: false, funnel: false,
  gantt: false, waterfall: false, timeline: false, bullet: false, autocorrelation: false,
  // A matrix has no per-series row, and no scale in its gutter to write beside.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false, utilisation: false,
  contour: false, quiver: false,
  // No cartesian area, or one row, or a composition.
  sparkline: false, horizon: false, waffle: false,
  pie: false, radar: false, flame: false, icicle: false, treemap: false,
  smallmultiples: false, pairplot: false,
});


/**
 * The forms that draw a field — a grid where a cell is a position rather than a
 * category (C04 I61, C12 §3y).
 *
 * **A new record and not a reuse of `MATRIX_LAYOUT`**, which answers whether a
 * form's columns are a time window or a fixed category set. That is a question
 * about the abscissa, and every matrix form has an answer to it while only two
 * of them can take a glyph layer. C12 I43's finding is a total record over forms
 * read as a complete answer to a question it cannot ask, and reusing that one
 * here would be the same mistake with the same shape.
 *
 * Here rather than in `presentation/plot/`, for `HAS_Y_GUTTER`'s reason: the
 * validator needs it and L0 cannot import L1 to ask (A02 §1).
 */
/**
 * The matrix family (C04 I50b), **here rather than in `construct.ts`** because
 * the validator needs it and had been asking a narrower question instead.
 *
 * `checkHeatmap` was widened to this record when `utilisation` fell through
 * `form === "heatmap"`; `plotAxisErrors` was written afterwards and asked
 * `form === "heatmap"` again, so `yAxis: false` was refused on one form of eight.
 * `contour` is the ninth and it fell through in the same way — **the same narrow
 * check, found by the same kind of member, two files apart.** A record both
 * gates read is what closes the class rather than the instance.
 */
export const IS_MATRIX: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  heatmap: true, calendar: true, correlation: true, confusion: true,
  spectrogram: true, latency: true, density2d: true, utilisation: true,
  quiver: true,
  // **A contour is a matrix and I50b binds**: its rows are the field's rows, so
  // `axes: false` would take the row labels *and* the level legend, and the
  // legend is the only thing that says which line is which level (C12 I49).
  contour: true,
  line: false, sparkline: false, scatter: false, step: false, ecdf: false,
  density: false, bar: false, histogram: false, boxplot: false, violin: false,
  ridgeline: false, forest: false, dumbbell: false, lollipop: false,
  dotplot: false, waffle: false, flame: false, icicle: false, treemap: false,
  funnel: false, gantt: false, waterfall: false, streamgraph: false,
  stackedarea: false, smallmultiples: false, pairplot: false, pie: false,
  radar: false, horizon: false, slope: false, bubble: false,
  autocorrelation: false, timeline: false, bullet: false,
});

export const IS_FIELD_FORM: Readonly<Record<PlotForm, boolean>> = Object.freeze({
  contour: true, quiver: true,
  // Every other matrix form paints its cells and draws nothing over them. They
  // are *fields* in the survey's sense and not in this one: `layers` on a
  // `spectrogram` has no second thing to order.
  heatmap: false, calendar: false, correlation: false, confusion: false,
  spectrogram: false, latency: false, density2d: false, utilisation: false,
  line: false, sparkline: false, scatter: false, step: false, ecdf: false,
  density: false, bar: false, histogram: false, boxplot: false, violin: false,
  ridgeline: false, forest: false, dumbbell: false, lollipop: false,
  dotplot: false, waffle: false, flame: false, icicle: false, treemap: false,
  funnel: false, gantt: false, waterfall: false, streamgraph: false,
  stackedarea: false, smallmultiples: false, pairplot: false, pie: false,
  radar: false, horizon: false, slope: false, bubble: false,
  autocorrelation: false, timeline: false, bullet: false,
});

export type PlotStyleArm = NonNullable<Plot["plotStyle"]>;

export const STYLE_ARMS: Readonly<Record<PlotForm, readonly PlotStyleArm[]>> = Object.freeze({
  // The positional family: braille dots or box-drawing strokes, and the two
  // curve forms that can carry candles.
  line: ["braille", "line", "candlestick"], step: ["braille", "line", "candlestick"],
  scatter: ["braille", "line"], ecdf: ["braille", "line"], density: ["braille", "line"],
  slope: ["braille", "line"], bubble: ["braille", "line"],
  stackedarea: ["braille", "line"], streamgraph: ["braille", "line"],
  // **The three forks C12 §3w adds.** A violin's outline can be strokes in the dot
  // grid; a pie's wedges can be block glyphs; a radar's polygons can be
  // box-drawing.
  violin: ["braille", "line"],
  pie: ["braille", "solid"],
  // **`radar` has a line arm again, in the alphabet that connects** (C12 I43,
  // §3w). Box drawing was tried three times and refused: its two diagonals do
  // not reach their cell corners, so a run of them renders as dashes. The
  // quadrant blocks are *filled* sub-cells, so consecutive cells touch — and
  // `plotStyle` names what to draw, never the vocabulary that draws it (§3c).
  radar: ["braille", "line"],
  // Runs, bands and mosaics: the vocabulary is the form's and there is nothing
  // to choose. Stated rather than omitted — an empty list is an answer.
  bar: [], histogram: [], boxplot: [], ridgeline: [], forest: [], dumbbell: [],
  lollipop: [], dotplot: [], funnel: [], gantt: [], waterfall: [], timeline: [],
  bullet: [], autocorrelation: [], waffle: [], utilisation: [],
  heatmap: [], calendar: [], correlation: [], confusion: [],
  spectrogram: [], latency: [], density2d: [],
  // **The one matrix form with a style fork, and the saddle is why** (I49,
  // §3y). Both saddle resolutions give mask 15, so `"line"` renders `┼` either
  // way and the centre-value ruling has nothing to be wrong about there. At 2×4
  // the two segments part, so `"auto"` picks braille — the arm on which the
  // ruling has a subject.
  contour: ["braille", "line"],
  // **An arrow is a whole-cell glyph and there is nothing to choose.** Stated
  // rather than omitted — an empty list is an answer, and the vocabulary here
  // is the form's own.
  quiver: [],
  flame: [], icicle: [], treemap: [],
  sparkline: [], horizon: [],
  smallmultiples: [], pairplot: [],
});

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
  /**
   * The study's weight in a meta-analysis, as a fraction of the total (C12 §3k).
   *
   * **A forest plot's point estimate is sized by it**, and that is not
   * decoration: the whole reading of the chart is that a wide interval drawn
   * small contributed little and a narrow one drawn large carried the result.
   * Absent, every estimate is one cell and the plot is a list of intervals.
   */
  weight?: number;
  /**
   * The pooled estimate — the summary row, drawn as a diamond (C12 §3k).
   *
   * Its own field rather than a convention about the last entry, because *the
   * last row is the summary* is a rule the data cannot state and a renderer
   * cannot check. A meta-analysis with no pooled estimate is ordinary, and one
   * with the summary first is a formatting choice.
   */
  pooled?: boolean;
}>;

/**
 * One bar of a candlestick chart (C04 I57, C12 §3r).
 *
 * **A shape rather than four series in an agreed order**, on the precedent
 * `QuartileSummary` and `HierarchyNode` set: an order is a convention nothing
 * checks, so the first caller to pass `high` where `low` belongs gets a chart
 * that renders and is wrong.
 *
 * **The wick contains the body**, and construction refuses a bar where it does
 * not — `low` above `min(open, close)`, or `high` below `max(open, close)`,
 * is not a candle drawn oddly, it is not a candle.
 */
export type OHLC = Readonly<{ open: number; high: number; low: number; close: number }>;

export type Segment = Readonly<{ label: string; value: number }>;

/**
 * A node in a `Plot`'s `hierarchy` (C04 I54, C12 §3n).
 *
 * **One field for three forms rather than three shapes.** `flame`, `icicle` and
 * `treemap` cannot be built from `series` plus `categories` — a call stack is
 * depth and offset, a treemap is area and nesting — and what they disagree about
 * is layout while what they share is the tree.
 *
 * `value` is the node's **own** magnitude where it has no children and its
 * subtree's where it does; a renderer takes the larger of the two, so a parent
 * whose stated value is less than its children's sum does not draw its children
 * outside itself.
 */
export type HierarchyNode = Readonly<{
  label: string;
  value: number;
  children?: readonly HierarchyNode[];
}>;

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
