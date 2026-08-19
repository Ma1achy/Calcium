/**
 * `b` — the ergonomic layer over C04's constructors (C24 §4).
 *
 * The API's quality is mostly this, because an adapter is the thing a consumer
 * writes a hundred times and a block is what an adapter returns.
 *
 * **`b` never freezes or validates directly.** Every builder ends in C04's
 * `block()` or `cell()`. Freezing here as well would give C04 I1 two enforcement
 * points, and the one that drifts is always the one with fewer tests — a block
 * frozen twice is indistinguishable from a block frozen once, right up until one
 * of the two paths stops doing it.
 *
 * **Only `b` is exported, and that is a design constraint rather than a
 * preference.** MG25 fires on an exported function no other module in `src/`
 * names, so nineteen `export function`s here would be nineteen violations or
 * nineteen allow-list entries. Written as module-private functions assembled
 * into one object, the rule has nothing to fire on — and the shape is honest,
 * because the builders genuinely have exactly one consumer, which is `b`.
 *
 * **Every array parameter is `readonly`, and a consumer is what settled it.**
 *
 * They were mutable, and `b.seq` returns `readonly Block[]` — so the sequence
 * assembler could not feed `b.panel`, `b.group` or a row's `detail`, which are
 * the three builders that take children and the exact place vertical rhythm
 * matters most (C09 applies `gapBefore` inside a panel). The first real adapter
 * wrote `b.panel("details", b.seq([…]))` and did not compile; the workaround is
 * `[...b.seq([…])]`, a spread whose only purpose is to strip `readonly`, which
 * is the shape of an omission rather than a design.
 *
 * It is not only `b.seq`. Every field on every C04 block type is `readonly`, and
 * the framework hands consumers readonly data throughout — `RawResult.argv` is
 * `readonly string[]`. A builder surface that accepts only mutable arrays is one
 * a consumer has to copy into on the way in, everywhere, forever.
 *
 * **`blockId` is imported, never reimplemented** (`../documents.js`). A second
 * block-id counter is drift MG20 exists to catch, and two counters would hand
 * out the same id from different modules.
 */

import { cell, markdownBlocks, rebuild } from "../../data/viewmodel/index.js";
import type {
  Action,
  Block,
  Cell,
  Code,
  ColumnDef,
  Comparison,
  Events,
  Glyph,
  Group,
  Share,
  Valign,
  Hunk,
  KeyValue,
  Logs,
  Notice,
  Panel,
  Scroll,
  Patch,
  Pills,
  Plot,
  Progress,
  Raw,
  Rule,
  Series,
  Steps,
  Table,
  TableRow,
  Tip,
  Tone,
} from "../../data/viewmodel/index.js";
import { blockId } from "../documents.js";
import { defaulted, seq } from "./seq.js";
import type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  KeyValueRow,
  LiveSpec,
  LogLine,
  StepInput,
} from "./types.js";
import { rememberLive } from "./live.js";
import { FigureBuilder } from "./figure.js";

// --- the two shared decisions ---------------------------------------------

/**
 * Apply `id` and resolve `gapBefore`, then hand the whole thing to C04.
 *
 * The `gapBefore` resolution is the part with a rule in it (I15, §4a):
 *
 *   - an **explicit** value of either polarity passes through verbatim and the
 *     block is *not* marked, so `b.seq` will not touch it;
 *   - an **absent** option takes the builder's default and the block *is*
 *     marked, because the default is a preference until `b.seq` resolves it.
 *
 * Marking happens even when the default is `false`. The mark records where the
 * value came from, not what it is, and a block that was never asked about is a
 * preference whichever way it went.
 */
function finish<B extends Block>(spec: B, opts: BlockOpts | undefined, gapDefault: boolean): B {
  const explicit = opts?.gapBefore;
  const gap = explicit ?? gapDefault;

  // **Written only when it is true.** C04's `Gap` is `gapBefore?: boolean` and
  // `measure` counts `=== true`, so `false` and absent are the same block said
  // two ways — and a builder that emitted `gapBefore: false` where `block()`
  // omits it would produce something that renders identically and compares
  // unequal. T4.6's pairing assertion found exactly that.
  const withGap = gap ? { ...spec, gapBefore: true } : spec;

  const built = rebuild(withGap as B);
  if (explicit === undefined) defaulted(built);
  return built;
}

/** A supplied id, or a generated one. Ids are never rendered (I4). */
function idOf(opts: BlockOpts | undefined, prefix: string): string {
  return opts?.id ?? blockId(prefix);
}

/**
 * The glyph a tone requires, when the caller did not give one (T3.9).
 *
 * C04 I6 makes a glyph mandatory on `error` and `warn` because colour alone
 * does not survive 1-bit or a colour-blind reader (D29). The builder supplying
 * it is the ergonomic half of that: C04 still enforces, and `b` simply stops a
 * consumer from having to restate the obvious.
 *
 * **This is not inference from a field name** (I5). The mapping is tone → glyph,
 * over C04's own `GLYPH_REQUIRED_TONES`, and it is total and fixed. What I5
 * forbids is guessing meaning from a key called `status`.
 */
function glyphFor(tone: Tone, given: Glyph | undefined): Glyph | undefined {
  if (given !== undefined) return given;
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  return undefined;
}

/** A bare string is a cell with default tone (§4). */
function toCell(input: CellInput): Cell {
  return typeof input === "string" ? cell({ text: input }) : cell(input);
}

function toCells(input: Record<string, CellInput>): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [key, value] of Object.entries(input)) out[key] = toCell(value);
  return out;
}

// --- the nineteen ---------------------------------------------------------

function rule(label: string, meta?: string, opts?: BlockOpts): Rule {
  return finish<Rule>(
    { kind: "rule", id: idOf(opts, "rule"), label, ...(meta === undefined ? {} : { meta }) } as Rule,
    opts,
    true,
  );
}

function noticeOf(tone: Tone, text: string, glyph?: Glyph, opts?: BlockOpts): Notice {
  const g = glyphFor(tone, glyph);
  return finish<Notice>(
    {
      kind: "notice",
      id: idOf(opts, "notice"),
      tone,
      text,
      ...(g === undefined ? {} : { glyph: g }),
    } as Notice,
    opts,
    false,
  );
}

const notice = Object.assign(noticeOf, {
  ok: (text: string, opts?: BlockOpts): Notice => noticeOf("ok", text, undefined, opts),
  warn: (text: string, opts?: BlockOpts): Notice => noticeOf("warn", text, undefined, opts),
  error: (text: string, opts?: BlockOpts): Notice => noticeOf("error", text, undefined, opts),
  info: (text: string, opts?: BlockOpts): Notice => noticeOf("info", text, undefined, opts),
});

/**
 * **Two arms with one body** (I18, §4).
 *
 * The record is the arm to reach for and stays first in the union: labels are
 * unique on almost every surface, and `{ status: b.warn("degraded") }` is the
 * shape this builder exists for. The array arm is for a surface whose labels
 * come from the far side, which has not promised they are distinct — docker's
 * `port`, whose every published port is listed once per address family.
 *
 * Both normalise to the same `{ label, value }` pair before the value is
 * unwrapped, so the two arms cannot disagree about what a tone does. Writing the
 * unwrap twice is how they would.
 */
function kv(
  rows: Readonly<Record<string, string | KeyValueInput>> | readonly KeyValueRow[],
  opts?: BlockOpts,
): KeyValue {
  const pairs: readonly KeyValueRow[] = Array.isArray(rows)
    ? rows
    : Object.entries(rows as Readonly<Record<string, string | KeyValueInput>>).map(
        ([label, value]) => ({ label, value }),
      );

  return finish<KeyValue>(
    {
      kind: "keyValue",
      id: idOf(opts, "kv"),
      rows: pairs.map(({ label, value }) =>
        typeof value === "string"
          ? { label, value }
          : {
              label,
              value: value.text,
              ...(value.tone === undefined ? {} : { tone: value.tone }),
              ...(value.bar === undefined ? {} : { bar: value.bar }),
              ...(value.barWidth === undefined ? {} : { barWidth: value.barWidth }),
            },
      ),
    } as KeyValue,
    opts,
    true,
  );
}

function table(
  spec: BlockOpts & {
    columns: readonly ColumnDef[];
    rows: readonly TableRow[];
    showHeader?: boolean;
    emptyMessage?: string;
    /**
     * Which column the rows are already ordered by, and which way (F114).
     *
     * **Found by MG27 and by nothing else.** `ColumnDef.sortable` was reachable
     * from `b.col` throughout, so a surface could mark a column sortable and
     * never say which one the data arrived sorted on — the indicator C11 draws
     * had no way to be told. The pair reads as covered because half of it is,
     * which is why a hand audit walked past it twice.
     *
     * It is a statement about the data, not an instruction: C11 renders the
     * marker and reorders nothing.
     */
    sort?: Readonly<{ key: string; direction: "asc" | "desc" }>;
  },
): Table {
  const { id: _id, gapBefore: _gap, columns, rows, showHeader, emptyMessage, sort } = spec;
  return finish<Table>(
    {
      kind: "table",
      id: idOf(spec, "table"),
      columns,
      rows,
      ...(showHeader === undefined ? {} : { showHeader }),
      ...(emptyMessage === undefined ? {} : { emptyMessage }),
      ...(sort === undefined ? {} : { sort }),
    } as Table,
    spec,
    true,
  );
}

/**
 * A column, with the five required fields defaulted.
 *
 * `label` defaults to the key, which is what every surface writes when the two
 * would be the same. `priority` and `minWidth` have no principled default — 50
 * and 8 are the middle of the range C11 plans over — so a surface that cares
 * sets them, and one that does not gets a column that survives planning.
 */
function col(key: string, spec?: Partial<Omit<ColumnDef, "key">>): ColumnDef {
  return Object.freeze({
    key,
    label: key,
    align: "left" as const,
    priority: 50,
    minWidth: 8,
    sortable: false,
    ...spec,
  });
}

function row(
  id: string,
  cells: Readonly<Record<string, CellInput>>,
  opts?: { detail?: readonly Block[]; actions?: readonly Action[] },
): TableRow {
  return Object.freeze({
    id,
    cells: Object.freeze(toCells(cells)),
    ...(opts?.detail === undefined ? {} : { detail: Object.freeze([...opts.detail]) }),
    ...(opts?.actions === undefined ? {} : { actions: Object.freeze([...opts.actions]) }),
  });
}

function steps(input: readonly StepInput[], opts?: BlockOpts): Steps {
  return finish<Steps>(
    {
      kind: "steps",
      id: idOf(opts, "steps"),
      steps: input.map((s) => ({
        label: s.label,
        ...(s.detail === undefined ? {} : { detail: s.detail }),
        state: s.state ?? "pending",
      })),
    } as Steps,
    opts,
    true,
  );
}

function logs(lines: readonly LogLine[], opts?: BlockOpts): Logs {
  return finish<Logs>({ kind: "logs", id: idOf(opts, "logs"), lines } as Logs, opts, false);
}

function events(input: readonly EventLine[], opts?: BlockOpts): Events {
  return finish<Events>(
    { kind: "events", id: idOf(opts, "events"), events: input } as Events,
    opts,
    false,
  );
}

/**
 * **`emptyMessage` is the one still withheld** — C24 §4 carries the reasoning,
 * and this comment carries the one that made the pin urgent.
 *
 * **`xLabels` was on that list until a surface wanted it** (F180). Its exemption
 * read *no surface has wanted one; a caption sentence does not fit it*, and the
 * history heatmap wants exactly the fixed three-tuple — `-N ticks`, nothing,
 * `now`. The second clause stands and is why `axisCaption` sits beside the plot
 * rather than in it. **A reason with two clauses expires one at a time**, and
 * `BUILDER_OMISSIONS`'s equality arm cannot see that: it catches an entry that
 * became unnecessary, never one whose argument did.
 *
 * **`yFormat` was withheld and the reason was about the naming** (C04 I41, F31).
 * C24 §4 said exposing it *"wants either a second format or a sentence at the
 * call site, and neither is a builder change"* — accurate about the trap, and it
 * treated the trap as grounds for withholding rather than as the thing to fix.
 * `percent` multiplied by 100, so the obvious call against a far side emitting
 * `100.2` rendered `10020%`. With the arms named for the unit that arrives —
 * `fraction` takes `0.84`, `percent` takes `100.2` — there is no sentence left
 * to put at a call site, and the field comes here.
 *
 * Absent a pin the range is the data's, so a series that is genuinely flat is
 * drawn against its own noise. A CPU plot watching a container pinned at 100%
 * rendered a 0.2% wobble as a full-height mountain range — a reader sees violent
 * load where the load is flat. C04 I29 clamps out-of-range values to the edge
 * rather than dropping them, so a floor costs nothing at the top.
 *
 * Both, never one: C04 I29 makes them independently optional, and a builder that
 * floors an axis without capping it leaves a consumer working out which half
 * exists.
 */
function plot(
  spec: BlockOpts & {
    series: readonly Series[];
    height: number;
    axes?: boolean;
    yMin?: number;
    yMax?: number;
    yFormat?: Plot["yFormat"];
    annotations?: Plot["annotations"];
    colormap?: Plot["colormap"];
    /**
     * The form, defaulting to `line` (C04 §3, FINDINGS F180).
     *
     * **It was hardcoded, and that is why the heatmap had no consumer.**
     * `PlotForm` has three members; `b.plot` wrote `form: "line"` and `b.spark`
     * writes `"sparkline"`, so `"heatmap"` was buildable by **nothing** in the
     * public surface — after a walk, a type, a validator arm, a renderer, three
     * golden frames and a mutation pass. Every fixture that draws one reaches
     * past `b` to `block()`.
     *
     * MG27 passed it throughout: the rule asks whether a builder's constructed
     * literal *mentions* the field, and `form: "line"` mentions it. A closed
     * union with one hardcoded arm satisfies a check about names.
     */
    form?: Plot["form"];
    /**
     * The three x-labels (C24 §4, F180).
     *
     * **`BUILDER_OMISSIONS` excused this as *no surface has wanted one*, and the
     * history heatmap wants exactly it** — `-N ticks`, nothing, `now`. The
     * omission's other half, *a caption sentence does not fit it*, is still true
     * and is why `axisCaption` exists beside the plot rather than inside it. A
     * reason with two clauses expires one at a time.
     */
    xLabels?: Plot["xLabels"];
    plotStyle?: Plot["plotStyle"];
    plotDetail?: Plot["plotDetail"];
    plotCorners?: Plot["plotCorners"];
    orientation?: Plot["orientation"];
    bandwidth?: Plot["bandwidth"];
    hierarchy?: Plot["hierarchy"];
    matrixAnchor?: Plot["matrixAnchor"];
    legend?: Plot["legend"];
    plotFrame?: Plot["plotFrame"];
  },
): Plot {
  const { series, height, axes, yMin, yMax, yFormat, annotations, colormap, form, xLabels, plotStyle, plotDetail, plotCorners, orientation, bandwidth, hierarchy, matrixAnchor, legend, plotFrame } =
    spec;
  // **The same refusal the validator makes** (C04 I50a). Two expressions of one
  // rule, which is this file's shape throughout: the constructor is where an
  // author finds out and the validator is where an untrusted document does.
  if (series.length > 8) {
    throw new TypeError(
      `b.plot: ${String(series.length)} series and the categorical palette distinguishes 8 ` +
        `(C04 I50a) — a ninth would repeat a colour, which reads as two series being one`,
    );
  }
  return finish<Plot>(
    {
      kind: "plot",
      id: idOf(spec, "plot"),
      form: form ?? "line",
      series,
      height,
      ...(axes === undefined ? {} : { axes }),
      ...(yMin === undefined ? {} : { yMin }),
      ...(yMax === undefined ? {} : { yMax }),
      ...(yFormat === undefined ? {} : { yFormat }),
      ...(annotations === undefined ? {} : { annotations }),
      ...(colormap === undefined ? {} : { colormap }),
      ...(xLabels === undefined ? {} : { xLabels }),
      ...(plotStyle === undefined ? {} : { plotStyle }),
      ...(plotDetail === undefined ? {} : { plotDetail }),
      ...(plotCorners === undefined ? {} : { plotCorners }),
      ...(orientation === undefined ? {} : { orientation }),
      ...(bandwidth === undefined ? {} : { bandwidth }),
      ...(hierarchy === undefined ? {} : { hierarchy }),
      ...(matrixAnchor === undefined ? {} : { matrixAnchor }),
      ...(legend === undefined ? {} : { legend }),
      ...(plotFrame === undefined ? {} : { plotFrame }),
    } as Plot,
    spec,
    true,
  );
}

/**
 * The sparkline path.
 *
 * **No `height`.** C04 §3 requires one for `form: "line"` and says a sparkline
 * "is always 1 and must not carry one" — the height is the form's, not the
 * block's, so writing `height: 1` here would be a second place that number
 * lives.
 */
function spark(values: readonly number[], opts?: BlockOpts): Plot {
  return finish<Plot>(
    { kind: "plot", id: idOf(opts, "spark"), form: "sparkline", series: [{ values }] } as Plot,
    opts,
    false,
  );
}

/**
 * `style` names a pair of glyphs and C09 resolves it against the terminal
 * (roadmap 51). Omitted is the default, and an unknown name is too — a bar is
 * decoration over a number that is already correct.
 */
function progress(
  spec: BlockOpts & { label: string; current: number; total: number; style?: string },
): Progress {
  const { label, current, total, style } = spec;
  return finish<Progress>(
    {
      kind: "progress",
      id: idOf(spec, "progress"),
      label,
      current,
      total,
      ...(style === undefined ? {} : { style }),
    } as Progress,
    spec,
    false,
  );
}

/** `wrap` defaults to false (T3.8); S10 sets it true. */
function code(language: string, text: string, opts?: BlockOpts & { wrap?: boolean }): Code {
  return finish<Code>(
    { kind: "code", id: idOf(opts, "code"), language, text, wrap: opts?.wrap ?? false } as Code,
    opts,
    true,
  );
}

function comparison(
  rows: readonly ComparisonRow[],
  opts?: BlockOpts & Readonly<{ labels?: readonly [string, string] }>,
): Comparison {
  return finish<Comparison>(
    {
      kind: "comparison",
      id: idOf(opts, "comparison"),
      rows,
      // Absent stays absent rather than defaulting to `["a", "b"]` — the header
      // is C09's and a builder writing the default in would make every block
      // claim a labelling it was never given (F33).
      ...(opts?.labels === undefined ? {} : { labels: opts.labels }),
    } as Comparison,
    opts,
    true,
  );
}

function patch(
  spec: BlockOpts & {
    path: string;
    language: string;
    hunks: readonly Hunk[];
    layout?: "unified" | "split";
    /**
     * What was elided **below the last hunk** (F41).
     *
     * `Hunk.collapsedBefore` was already reachable, so a patch could say what it
     * skipped above each hunk and never what it skipped below the last one — a
     * 44-line file with one hunk near the top ended in thirty lines that simply
     * stopped. The block documented the field at length; the builder passed four
     * of its six.
     */
    collapsedAfter?: number;
    /**
     * Row actions, found by MG27 rather than by a consumer (F114).
     *
     * `Patch` has carried them since C25 and no builder passed them, so no app
     * could put `↗ open in editor` on a diff. Nothing reached for it, which is
     * the point of the rule: an omission nobody has tripped over yet is exactly
     * the one a hand audit walks past.
     */
    actions?: readonly Action[];
  },
): Patch {
  const { path, language, hunks, layout, collapsedAfter, actions } = spec;
  return finish<Patch>(
    {
      kind: "patch",
      id: idOf(spec, "patch"),
      path,
      language,
      hunks,
      ...(layout === undefined ? {} : { layout }),
      ...(collapsedAfter === undefined ? {} : { collapsedAfter }),
      ...(actions === undefined ? {} : { actions }),
    } as Patch,
    spec,
    true,
  );
}

function pills(chips: readonly ChipInput[], opts?: BlockOpts): Pills {
  return finish<Pills>({ kind: "pills", id: idOf(opts, "pills"), chips } as Pills, opts, false);
}

function tip(text: string, actions?: readonly Action[], opts?: BlockOpts): Tip {
  return finish<Tip>(
    {
      kind: "tip",
      id: idOf(opts, "tip"),
      text,
      ...(actions === undefined ? {} : { actions }),
    } as Tip,
    opts,
    true,
  );
}

function panel(
  title: string,
  children: readonly Block[],
  opts?: BlockOpts & { footer?: string },
): Panel {
  return finish<Panel>(
    {
      kind: "panel",
      id: idOf(opts, "panel"),
      title,
      ...(opts?.footer === undefined ? {} : { footer: opts.footer }),
      children,
    } as Panel,
    opts,
    true,
  );
}

/**
 * A layout wrapper, and it does **not** gap (§4).
 *
 * Gapping the group *and* the first child that carries its own default produces
 * two blank rows where the surfaces draw one.
 */
/**
 * A container. `row` divides its width by `flex`, one weight per child (C04 I42).
 *
 * **Weights and not a boolean, and not C11's `flex` despite the name.** A table
 * column has a minimum derived from its content and `flex` says whether it
 * absorbs what is left; a group knows `measure(block, width) → height` and no
 * preferred width, so there is nothing to absorb from and a declared proportion
 * is the only allocation this level can express.
 *
 * **Throws rather than returning an invalid block**, as `plot` does for a line
 * form with no height: `0`, a negative, a non-finite value and a length that
 * does not match the children are all authoring mistakes with no reading, and
 * the constructor is where an author finds out.
 */
/**
 * A bounded region (C04 §3c, C04 I47).
 *
 * **Throws rather than returning an invalid block**, as `group` does for a bad
 * share: an empty container is a scroll nobody can aim and a non-positive
 * height is a box that shows nothing, and neither has a reading to fall back
 * on. The validator refuses both as well — the constructor is where an author
 * finds out, and the validator is where an untrusted document does.
 */
function scroll(
  height: number,
  children: readonly Block[],
  opts?: BlockOpts,
): Scroll {
  if (!Number.isInteger(height) || height < 1) {
    throw new TypeError(
      `b.scroll: height is a positive integer — got ${JSON.stringify(height)}`,
    );
  }
  if (children.length === 0) {
    throw new TypeError(
      "b.scroll: a bounded region needs at least one child — its elements are one per child, " +
        "so an empty one is a container nobody can aim (C04 I47)",
    );
  }
  return finish<Scroll>(
    { kind: "scroll", id: idOf(opts, "scroll"), height, children } as Scroll,
    opts,
    false,
  );
}

function group(
  direction: "row" | "column",
  children: readonly Block[],
  opts?: BlockOpts & { flex?: readonly Share[]; align?: readonly Valign[] },
): Group {
  const flex = opts?.flex;
  if (flex !== undefined) {
    if (flex.length !== children.length) {
      throw new TypeError(
        `b.group: ${String(flex.length)} weights for ${String(children.length)} children`,
      );
    }
    for (const share of flex) {
      const bad =
        typeof share === "object"
          ? !Number.isInteger(share.cells) || share.cells <= 0
          : !Number.isFinite(share) || share <= 0;
      if (bad) {
        throw new TypeError(
          `b.group: a share is a weight above zero or {cells: n} whole columns — got ` +
            `${JSON.stringify(share)}; omit the child to leave it unplaced, and 1 is one share`,
        );
      }
    }
  }

  const align = opts?.align;
  if (align !== undefined && align.length !== children.length) {
    throw new TypeError(
      `b.group: ${String(align.length)} alignments for ${String(children.length)} children`,
    );
  }

  return finish<Group>(
    {
      kind: "group",
      id: idOf(opts, "group"),
      direction,
      children,
      ...(flex === undefined ? {} : { flex: [...flex] }),
      ...(align === undefined ? {} : { align: [...align] }),
    } as Group,
    opts,
    false,
  );
}

function raw(text: string, opts?: BlockOpts): Raw {
  return finish<Raw>({ kind: "raw", id: idOf(opts, "raw"), text } as Raw, opts, false);
}

/**
 * One transient line reporting on what precedes it — so it does **not** gap,
 * though `b.steps` does and both return `Steps`.
 *
 * This is the row that shows the default belongs to the *builder* and not to the
 * block kind (I15). A default keyed on `block.kind` could not express it.
 *
 * The animation is C09's: `blocks/kinds/structured.ts` drives the spinner frame
 * from `ctx.tick`, so there is nothing to animate here and `measure` never sees
 * it (I7).
 */
function spinner(label: string, opts?: BlockOpts): Steps {
  return finish<Steps>(
    { kind: "steps", id: idOf(opts, "spinner"), steps: [{ label, state: "active" }] } as Steps,
    opts,
    false,
  );
}

// --- cells and actions ----------------------------------------------------

const toned =
  (tone: Tone) =>
  (text: string): Cell => {
    const glyph = glyphFor(tone, undefined);
    return cell({ text, tone, ...(glyph === undefined ? {} : { glyph }) });
  };

// --- the object -----------------------------------------------------------

/**
 * The builders' argument types, re-exported so C24's entry point has one place
 * to take them from — `b` and the types it accepts are one surface, and a
 * consumer importing them from two paths would be the first to notice.
 */
export type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  KeyValueRow,
  LiveSpec,
  LogLine,
  StepInput,
} from "./types.js";


/**
 * C24 §5 — failure isolation as a primitive, and the twentieth builder.
 *
 * **It returns a `panel`, and both halves of that were forced.**
 *
 * *One block*, because `ViewPatch` has one replacing arm: `{op, blockId, block}`
 * is one id and one block, so a part rendering three needs three patches, three
 * `rev`s for one logical refresh, and a frame composable half-way through
 * (C23 I34). A part wanting several returns a `group`.
 *
 * *A `panel`*, because `Panel` is the only kind with a `title` — and the title is
 * where a live part says what state it is in: `· 14s ago` stale, `· unavailable`
 * failing, both drawn that way by S13 §3 and §4 already. A part rendering a bare
 * `table` has nowhere to put either, so the guarantees would hold for some
 * consumers and not others, which is not a guarantee.
 *
 * **What this returns is the loading state**, and that is why C23 has no
 * `renderLoading`: the first block exists before the driver runs. C23 renders the
 * two states only C23 knows about — a fetch's result, and its failure with the
 * `retryInMs` only the backoff can supply.
 */
function live(spec: LiveSpec): Panel {
  // **Thrown, not warned** (C24 T3.6). The row said *warns* and a builder has no
  // sink: SS33 bans `console.*`, C02's warnings are C22's channel, and putting a
  // notice where the loading render goes lets a cosmetic mistake change the first
  // frame. A part stale on every tick it ever runs is a broken declaration, which
  // is what the two throws above are for.
  if (spec.every !== undefined && spec.staleAfter !== undefined && spec.staleAfter < spec.every) {
    throw new Error(
      `b.live "${spec.id}": staleAfter (${String(spec.staleAfter)}ms) is below ` +
        `every (${String(spec.every)}ms), so the part would be stale on every tick`,
    );
  }
  // Through `noticeOf`, like every other notice this file makes. The tone is a
  // fact from S02's pattern rather than a builder's inference — but SS45 cannot
  // see the difference between a constant and a lookup table, which its own
  // comment says, and the positional form is the shape the rule was written
  // around rather than a way past it.
  const loading =
    spec.renderLoading?.() ??
    // **The `pending` glyph rather than an ellipsis in the text** (C09 I22,
    // F122). A builder runs above the renderer, so a character written here
    // cannot be substituted — and the mark this wanted is one C09 already
    // carries, with `.` for a terminal that cannot draw `◌`.
    noticeOf("muted", "loading", "pending", { id: `${spec.id}-loading` });
  const panel = finish<Panel>(
    { kind: "panel", id: spec.id, title: spec.title, children: [loading] } as Panel,
    spec,
    true,
  );
  // The behaviour cannot ride on the block — `live.ts` says why the association
  // is held beside the document rather than inside it.
  rememberLive(panel, spec);
  return panel;
}

/**
 * A markdown document's block half (roadmap 11).
 *
 * **Returns a sequence and not a block**, which is why it is exempt from the
 * builder table's per-block rows for `b.seq`'s reason: one markdown source is a
 * run of blocks, and wrapping it in a `group` would decide a layout the source
 * did not ask for.
 */
function markdown(source: string, opts?: { readonly idPrefix?: string }): readonly Block[] {
  return markdownBlocks(source, opts?.idPrefix);
}

export const b = {
  live,
  markdown,
  rule,
  notice,
  kv,
  table,
  col,
  seq,
  row,
  steps,
  logs,
  events,
  plot,
  spark,
  progress,
  figure: (opts?: { title?: string; height?: number; axes?: boolean; yFormat?: Plot["yFormat"]; yMin?: number; yMax?: number }) =>
    new FigureBuilder(opts),
  code,
  comparison,
  patch,
  pills,
  tip,
  panel,
  group,
  scroll,
  raw,
  spinner,

  // cell shorthands
  id: toned("identifier"),
  ok: toned("ok"),
  warn: toned("warn"),
  error: toned("error"),
  dim: toned("dim"),
  meta: toned("meta"),

  // actions
  fill: (label: string, command: string): Action =>
    Object.freeze({ kind: "fill" as const, label, command }),
  exec: (label: string, command: string): Action =>
    Object.freeze({ kind: "exec" as const, label, command }),
  open: (label: string, url: string): Action =>
    Object.freeze({ kind: "open" as const, label, url }),
} as const;
