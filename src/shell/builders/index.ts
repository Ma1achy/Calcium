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

import { HAS_CALLOUT, HAS_DETAIL_RUNGS, HAS_Y_GUTTER, HIERARCHY_ROLE, HONOURS_AXIS_CROSS, IS_FIELD_FORM, IS_MATRIX, ORIGIN_DEFAULT, STYLE_ARMS, block, cell, hierarchyFault, markdownBlocks, rebuild } from "../../data/viewmodel/index.js";
import { samplesChildren, samplesLayout, type Sample, type SamplesOptions, samplesScale } from "./samples.js";
import { readFileSync } from "node:fs";
import { digestOf, overlayFault, parseAreas } from "../../data/viewmodel/index.js";
import { COLORMAPS } from "../../data/colormaps/index.js";
import { parseStartDate } from "../../data/dates.js";
import type {
  ImageOverlay,
  Action,
  Block,
  Cell,
  Code,
  ColumnDef,
  Comparison,
  ErrorLike,
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
  Image,
  Mosaic,
  Scroll,
  Patch,
  Pills,
  Plot,
  Progress,
  Raw,
  Rule,
  Series,
  Status,
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
  TextOpts,
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

function rule(label: string, meta?: string, opts?: TextOpts): Rule {
  return finish<Rule>(
    {
      kind: "rule",
      id: idOf(opts, "rule"),
      label,
      ...(opts?.spans === undefined ? {} : { spans: opts.spans }),
      ...(opts?.colormap === undefined ? {} : { colormap: opts.colormap }),
      ...(meta === undefined ? {} : { meta }),
    } as Rule,
    opts,
    true,
  );
}

function noticeOf(tone: Tone, text: string, glyph?: Glyph, opts?: TextOpts): Notice {
  const g = glyphFor(tone, glyph);
  return finish<Notice>(
    {
      kind: "notice",
      id: idOf(opts, "notice"),
      tone,
      text,
      ...(g === undefined ? {} : { glyph: g }),
      ...(opts?.spans === undefined ? {} : { spans: opts.spans }),
      ...(opts?.colormap === undefined ? {} : { colormap: opts.colormap }),
    } as Notice,
    opts,
    false,
  );
}

const notice = Object.assign(noticeOf, {
  ok: (text: string, opts?: TextOpts): Notice => noticeOf("ok", text, undefined, opts),
  warn: (text: string, opts?: TextOpts): Notice => noticeOf("warn", text, undefined, opts),
  error: (text: string, opts?: TextOpts): Notice => noticeOf("error", text, undefined, opts),
  info: (text: string, opts?: TextOpts): Notice => noticeOf("info", text, undefined, opts),
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
    /** The domain the samples span; the sample index where absent (C04 I58). */
    xMin?: number;
    xMax?: number;
    xFormat?: Plot["yFormat"];
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
    xTitle?: Plot["xTitle"];
    plotStyle?: Plot["plotStyle"];
    /** The interior of a shape, where the vocabulary can fill (C04 I59). */
    plotFill?: Plot["plotFill"];
    /** The radar's ring shape (C12 I45, §3w). */
    plotGrid?: Plot["plotGrid"];
    yAxis?: Plot["yAxis"];
    yCallout?: Plot["yCallout"];
    vectors?: Plot["vectors"];
    /** A 3D scatter's cloud, and the channel colour spends (C04 I76, C12 I87). */
    points3?: Plot["points3"];
    lines3?: Plot["lines3"];
    surfaces3?: Plot["surfaces3"];
    light3?: Plot["light3"];
    colourBy?: Plot["colourBy"];
    /** The 3D reference frame — four members and two decisions (C04 I77). */
    axes3?: Plot["axes3"];
    origin3?: Plot["origin3"];
    box3?: Plot["box3"];
    axisStyle3?: Plot["axisStyle3"];
    /**
     * Where the view starts (C04 I75).
     *
     * **Held back until a form could use it**, and the reason was sharper than
     * *not yet built*: a plot declaring a camera becomes focusable (C12 I85), so
     * exposing it earlier handed callers a way to add a focus stop to a 2D plot
     * and no way to draw anything. `plot3d` is what released it.
     */
    camera?: Plot["camera"];
    levels?: Plot["levels"];
    layers?: Plot["layers"];
    fieldDim?: Plot["fieldDim"];
    glyphInk?: Plot["glyphInk"];
    /** A compact box plot's interquartile run (C12 I46, §3i). */
    plotBox?: Plot["plotBox"];
    /**
     * The candles (C04 I57, C12 I36).
     *
     * **Optional beside `series` rather than instead of it.** Plain candles are
     * `ohlc` with `series: []`; a non-empty `series` is the overlay a moving
     * average goes in, drawn over them on the shared axis.
     */
    ohlc?: Plot["ohlc"];
    /**
     * The distribution family's datum, and **four fields that were on `Plot`
     * and not here** (F263).
     *
     * This is the `form` field's own finding one field along, and it survived
     * the same way. *`"heatmap"` was buildable by nothing in the public
     * surface — after a walk, a type, a validator arm, a renderer, three golden
     * frames and a mutation pass*, because **every fixture that draws one
     * reaches past `b` to `block()`**. So does every fixture that draws a box
     * plot, a forest plot, a pie and a horizon chart.
     *
     * `quartiles` is the datum of **five forms** — boxplot, violin, ridgeline,
     * forest, bullet — and `categories` names the axis every categorical form
     * puts them on. Without the pair, none of the five is expressible by a
     * consumer at all; with `quartiles` alone the categories fall back to
     * `series 1`, `series 2`, which is a figure with no labels.
     *
     * **MG27 passed throughout, for the reason it passed on `form`**: the rule
     * asks whether a builder's constructed literal *mentions* the field, and a
     * field nobody can pass is not mentioned rather than mentioned wrongly.
     * A name-based seam check cannot see an omission.
     */
    quartiles?: Plot["quartiles"];
    categories?: Plot["categories"];
    segments?: Plot["segments"];
    bands?: Plot["bands"];
    plotDetail?: Plot["plotDetail"];
    plotCorners?: Plot["plotCorners"];
    orientation?: Plot["orientation"];
    bandwidth?: Plot["bandwidth"];
    hierarchy?: Plot["hierarchy"];
    treeLayout?: Plot["treeLayout"];
    graph?: Plot["graph"];
    graphLayout?: Plot["graphLayout"];
    matrixAnchor?: Plot["matrixAnchor"];
    legend?: Plot["legend"];
    plotFrame?: Plot["plotFrame"];
    width?: Plot["width"];
    aspect?: Plot["aspect"];
    align?: Plot["align"];
    origin?: Plot["origin"];
    axisCross?: Plot["axisCross"];
    calendarUnit?: Plot["calendarUnit"];
    startDate?: Plot["startDate"];
    /**
     * **The eight F335 measured, and the argument is per member** (C24 I30, §4b).
     *
     * Four are a form's **only** datum, so four forms could not be built at all
     * and three were reduced to one variant: `offsets` is a start per row and
     * without it a `gantt` is a bar chart; `totals` says which bars are totals
     * and a `waterfall`'s running balance is not otherwise drawable; `facets`
     * is what `pairplot` and `smallmultiples` delegate to, and a delegating
     * form with no children has nothing to delegate; `layout` is `bar`'s and
     * `histogram`'s only multi-series reading, so both built `overlap` and
     * nothing else.
     *
     * Two are defaulted **choices** a consumer must still be able to make —
     * `binning`, which the corpus distinguishes `scott` from `sturges` on, and
     * `emptyMessage`, whose absence means every app hand-composes an empty
     * state, which is §8d's defect one kind along.
     *
     * And two became readable in **both** arms this arc, so omitting them now
     * would be omitting something that works: `xScale` and `yScale`.
     */
    layout?: Plot["layout"];
    binning?: Plot["binning"];
    offsets?: Plot["offsets"];
    totals?: Plot["totals"];
    facets?: Plot["facets"];
    emptyMessage?: Plot["emptyMessage"];
    xScale?: Plot["xScale"];
    yScale?: Plot["yScale"];
  },
): Plot {
  const { quartiles, categories, segments, bands, graph, graphLayout, series, height, axes, yMin, yMax, yFormat, yAxis, yCallout, vectors, points3, lines3, surfaces3, light3, colourBy, camera, axes3, origin3, box3, axisStyle3, levels, layers, fieldDim, glyphInk, xMin, xMax, xFormat, annotations, colormap, form, xLabels, xTitle, plotStyle, plotFill, plotGrid, plotBox, ohlc, plotDetail, plotCorners, orientation, bandwidth, hierarchy, treeLayout, matrixAnchor, legend, plotFrame, width, aspect, align, origin, axisCross, calendarUnit, startDate, layout, binning, offsets, totals, facets, emptyMessage, xScale, yScale } =
    spec;
  // **The same refusal the validator makes** (C04 I50a). Two expressions of one
  // rule, which is this file's shape throughout: the constructor is where an
  // author finds out and the validator is where an untrusted document does.
  //
  // **And for a long time they were not the same rule** (F398). The validator
  // carries an exemption this copy never got — *C04 I50a is a rule about colour, so
  // it binds where colour is drawn; a heatmap carries magnitude in the ramp and
  // never reads the categorical palette* — so an eleven-row heatmap validated
  // and rendered correctly while `b.plot` refused to construct it. Two copies of
  // one rule under a comment asserting they are one.
  //
  // **`IS_MATRIX`, not `form !== "heatmap"`**, which is the exemption's own
  // rationale applied where it reaches: `correlation`, `confusion`,
  // `spectrogram`, `latency`, `density2d`, `calendar`, `utilisation`, `contour`
  // and `quiver` all spend their rows on a ramp too, and the validator was
  // refusing every one of them past eight for a palette they never read.
  if (!IS_MATRIX[form ?? "line"] && series.length > 8) {
    throw new TypeError(
      `b.plot: ${String(series.length)} series and the categorical palette distinguishes 8 ` +
        `(C04 I50a) — a ninth would repeat a colour, which reads as two series being one`,
    );
  }
  // **The same refusal again** (C04 I56), and the same reason: an author finds
  // out here, an untrusted document finds out in the validator. Rows only — a
  // width is not a thing a constructor can see either.
  if ((form === "boxplot" || form === "violin") && orientation !== "vertical") {
    // `b.plot` exposes no `categories`, so a band is a series here — which is
    // what a violin's bands are anyway.
    const bands = series.length; // cells-ok — a band count
    const rows = Math.max(1, Math.floor(height ?? 1)); // cells-ok — a row count
    const need = form === "violin" ? 2 : 1; // cells-ok — a row count
    if (bands > 0 && Math.floor(rows / bands) < need) {
      throw new TypeError(
        `b.plot: ${String(bands)} bands in ${String(rows)} rows is ` +
          `${String(Math.floor(rows / bands))} per band and a "${form}" needs ${String(need)} ` +
          `(C04 I56) — below that the density flattens to a bar and the figure states a ` +
          `property of the height rather than of the data`,
      );
    }
  }
  // **The same three refusals a second time** (C04 I57), and the geometry one is
  // not under the style: a wick that does not contain its body is wrong wherever
  // the bars are, because it is not a candle (C12 §6b B9–B11).
  for (const [i, bar] of (ohlc ?? []).entries()) {
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      throw new TypeError(
        `b.plot: ohlc[${String(i)}] has low ${String(bar.low)} and high ${String(bar.high)} ` +
          `around open ${String(bar.open)} and close ${String(bar.close)} (C04 I57) — a ` +
          `candle's wick contains its body, so this is not a candle that renders oddly, it ` +
          `is not a candle`,
      );
    }
  }
  if (plotStyle === "candlestick") {
    if (ohlc === undefined) {
      throw new TypeError(
        `b.plot: "plotStyle" is "candlestick" and there is no "ohlc" (C04 I57) — the style ` +
          `has nothing to draw, and "series" is the overlay rather than the candles`,
      );
    }
  }
  // **One rule over the record, at this gate too** (C04 I59, C12 I43). This
  // carried its own copy of *candlestick needs line or step* — a second
  // sentence about one style, in the second place a style is refused, which is
  // exactly the duplication `STYLE_ARMS` exists to remove. Every style a form
  // has no arm for is refused here now, and by the same list the validator
  // reads.
  //
  // The **resolved** form, because `b.plot` defaults it to `line` below and a
  // check on the parameter would refuse the ordinary call that omits it.
  if (plotStyle !== undefined && plotStyle !== "auto") {
    const drawn = form ?? "line";
    const arms = STYLE_ARMS[drawn] as readonly string[];
    if (!arms.includes(plotStyle)) {
      throw new TypeError(
        `b.plot: "plotStyle" is "${plotStyle}" on form "${drawn}" (C04 I59) — that form has ` +
          `${arms.length === 0 ? "no style arms" : `arms for ${arms.join(", ")}`}, and an ` +
          `ignored member reads as one not yet implemented`,
      );
    }
  }
  // **The member had no scope on either gate until now** (F220). `plotDetail`
  // has one reader in `src/` and reached two forms of forty-four; on the other
  // forty-two it was accepted here, carried through the document, and ignored —
  // which is the sentence `plotStyle`'s refusal just above already spells out:
  // *an ignored member reads as one not yet implemented*.
  if (plotDetail !== undefined) {
    const drawn = form ?? "line";
    if (!HAS_DETAIL_RUNGS[drawn]) {
      throw new TypeError(
        `b.plot: "plotDetail" is "${plotDetail}" on form "${drawn}" (C12 I34) — that form ` +
          `has one figure and no ladder of rungs to pick from`,
      );
    }
  }
  // **The shape, through the validator's own walk** (C04 I64, F221). The
  // `plotDetail` refusal above is a copy on purpose — a one-line predicate
  // written twice can be compared by eye — and a recursive walk is not: two
  // copies of it are two walks, and the second one drifts.
  {
    const drawn = form ?? "line";
    // **`graph` and `graphLayout` are refused off their own form** — C04 I69 and
    // C04 I70 — which is `treeLayout`'s guard one form along. The `graph` arm is
    // the one that matters: a node set accepted on a `line` is data the
    // renderer never opens, and accepted-and-ignored is the worst of three
    // answers (F207).
    if (graph !== undefined && drawn !== "graph") {
      throw new Error(
        `b.plot: "graph" is set on form "${drawn}" (C04 I69) — only a graph reads it`,
      );
    }
    if (graphLayout !== undefined && drawn !== "graph") {
      throw new Error(
        `b.plot: "graphLayout" is "${graphLayout}" on form "${drawn}" (C04 I70) — only a graph ` +
          `takes a graph layout`,
      );
    }
    if (treeLayout !== undefined && drawn !== "tree") {
      throw new TypeError(
        `b.plot: "treeLayout" is "${treeLayout}" on form "${drawn}" (C04 I65) — only a tree ` +
          `has more than one layout to choose between, and an ignored member reads as one ` +
          `not yet implemented`,
      );
    }
    // **A structure form has nothing else to draw** (C04 I65, C12 §3ah.9),
    // where the three magnitude forms fall back to a series or an empty message.
    if (hierarchy === undefined && HIERARCHY_ROLE[drawn] === "structure") {
      throw new TypeError(
        `b.plot: form "${drawn}" with no "hierarchy" (C04 I65) — that form draws a tree and ` +
          `nothing else, so there is no figure to fall back to`,
      );
    }
  }
  if (hierarchy !== undefined) {
    const drawn = form ?? "line";
    const role = HIERARCHY_ROLE[drawn];
    if (role === null) {
      throw new TypeError(
        `b.plot: "hierarchy" on form "${drawn}" (C04 I64) — that form draws a series, a ` +
          `matrix or a field, and an ignored member reads as one not yet implemented`,
      );
    }
    const fault = hierarchyFault(hierarchy, role === "magnitude", "hierarchy");
    if (fault !== null) throw new TypeError(`b.plot: ${fault} (C04 I64)`);
  }
  // **The same rule over the same two records the validator reads** (C04 I60,
  // C12 I47, C12 I48), on the **resolved** form for `plotStyle`'s reason: the
  // parameter is optional and defaults to `line` below.
  {
    const drawn = form ?? "line";
    if (yAxis !== undefined && yAxis !== "left" && !HAS_Y_GUTTER[drawn]) {
      throw new TypeError(
        `b.plot: "yAxis" is "${String(yAxis)}" on form "${drawn}" (C04 I60) — that form draws ` +
          `no y gutter, so there is no column for the labels to move to; a facet declares ` +
          `its own`,
      );
    }
    // The family, not the one form — see `plotAxisErrors`' own note: this is the
    // third writing of a check that had already been widened once.
    if (yAxis === false && IS_MATRIX[drawn]) {
      throw new TypeError(
        `b.plot: "yAxis" is false on form "${drawn}" (C04 I60) — a row label is the ordinate here, ` +
          `so a matrix without them is a picture of numbers with no way to tell which row ` +
          `is which`,
      );
    }
    if (yCallout === "last" && !HAS_CALLOUT[drawn]) {
      throw new TypeError(
        `b.plot: "yCallout" is "last" on form "${drawn}" (C04 I60) — a callout names where ` +
          `one series ends, and that form draws no per-series curve to end`,
      );
    }
    if (yCallout === "last" && (yAxis === undefined || yAxis === "left" || yAxis === false)) {
      throw new TypeError(
        `b.plot: "yCallout" is "last" with "yAxis" of ` +
          `"${yAxis === undefined ? "left" : String(yAxis)}" (C04 I60) — a callout is written ` +
          `in the right gutter and there is none; widen "yAxis" to "right" or "both"`,
      );
    }
    // **The field family's four, refused off the family** (C04 I61, C12 §3y).
    for (const [name, value] of [
      ["layers", layers], ["fieldDim", fieldDim], ["glyphInk", glyphInk],
    ] as const) {
      if (value !== undefined && !IS_FIELD_FORM[drawn]) {
        throw new TypeError(
          `b.plot: "${name}" on form "${drawn}" (C04 I61) — that form paints its cells and ` +
            `draws nothing over them, so there is no second thing to order`,
        );
      }
    }
    // **The three geometry members** (C04 I62, C12 §3ab). A width wider than the
    // terminal is not checked here either — the builder has no terminal.
    if (width !== undefined && aspect !== undefined) {
      throw new TypeError(
        `b.plot: "width" and "aspect" together (C04 I62) — two ways to say one number, and a ` +
          `plot that picked one would be reading the caller's other statement`,
      );
    }
    if (align !== undefined && width === undefined && aspect === undefined) {
      throw new TypeError(
        `b.plot: "align" with neither "width" nor "aspect" (C04 I62) — a figure that fills ` +
          `its frame has nothing to align inside it`,
      );
    }
    // **`origin` is refused by the same record that defaults it** (C04 I62,
    // C12 §3ac) — `null` is the refusal, so there is no second table to keep in
    // step with this one.
    const facingForm = form ?? "line";
    if (origin !== undefined && ORIGIN_DEFAULT[facingForm] === null) {
      throw new TypeError(
        `b.plot: "origin" on form "${facingForm}" (C04 I62, C12 §3ac) — this form places its data ` +
          `itself and has no direction to reverse`,
      );
    }
    // **The same shape one member along, and one clause the record cannot
    // carry** (C04 I62, C12 §3ad). `HONOURS_AXIS_CROSS` refuses by form; a
    // *declared* range that excludes zero is refused here too, because the
    // caller stated it. The realised range is the renderer's to judge — it comes
    // from `seriesRange`, which is L1 — and its half is dropped, not refused.
    if (axisCross === "zero" && !HONOURS_AXIS_CROSS[facingForm]) {
      throw new TypeError(
        `b.plot: "axisCross" on form "${facingForm}" (C04 I62, C12 §3ad) — a crossing axis needs ` +
          `a numeric ordinate and a numeric abscissa, and this form has no zero for them to meet at`,
      );
    }
    // **The calendar's four refusals, in the order a caller trips them** (C04
    // I62, C12 I53, §3ae). `> 1` and never `!== 1`: zero is not more than one,
    // and an empty calendar is commitment 3's empty plot rather than an error.
    if (calendarUnit !== undefined && drawn !== "calendar") {
      throw new TypeError(
        `b.plot: "calendarUnit" on form "${drawn}" (C04 I62, C12 §3ae) — only a calendar has a ` +
          `grid for a unit to pick, and a member accepted where nothing honours it reads as one ` +
          `not yet implemented`,
      );
    }
    if (calendarUnit !== undefined && series.length > 1) { // cells-ok — a series count
      throw new TypeError(
        `b.plot: "calendarUnit" with ${String(series.length)} series (C04 I62, C12 I53) — a ` +
          `calendar's rows are a period, so a second series is a second period claiming the same ` +
          `rows; the grid is derived from one flat series in time order`,
      );
    }
    if (calendarUnit !== undefined && startDate === undefined) {
      throw new TypeError(
        `b.plot: "calendarUnit" without "startDate" (C04 I62, C12 I53) — a calendar's row is a ` +
          `claim about when, and placing the first reading in the first row is an assumption the ` +
          `caller never stated`,
      );
    }
    if (startDate !== undefined && parseStartDate(startDate) === null) {
      throw new TypeError(
        `b.plot: "startDate" of "${startDate}" is not a date this can place (C04 I62, C12 I53) — ` +
          `"YYYY-MM-DD", optionally "THH", ":MM", ":SS" and a trailing "Z"; a zone offset is ` +
          `refused rather than ignored, and a day the month does not have is refused on the leap rule`,
      );
    }
    if (axisCross === "zero" && yMin !== undefined && yMax !== undefined && (yMin > 0 || yMax < 0)) {
      throw new TypeError(
        `b.plot: "axisCross": "zero" with a declared range of ${yMin}..${yMax} (C04 I62, C04 I29) — ` +
          `the range excludes zero, and an axis drawn at the nearest edge would say the origin is ` +
          `somewhere it is not`,
      );
    }
    if (vectors !== undefined && drawn !== "quiver") {
      throw new TypeError(
        `b.plot: "vectors" on form "${drawn}" (C04 I61) — only a quiver draws a vector ` +
          `field, and two numbers per cell mean nothing to any other form`,
      );
    }
    if (drawn === "quiver" && vectors === undefined) {
      throw new TypeError(
        `b.plot: form "quiver" has no "vectors" (C04 I61) — a vector field is what it ` +
          `draws, and "series" carries one number per cell`,
      );
    }
    // **`vectors`' four refusals, one dimension along** (C04 I76). The
    // *member* rules are here and in the validator; the walk over every point
    // for a finite `value` is the validator's alone, exactly as `vectors`'
    // rectangularity is — a statement about members belongs at both gates and a
    // walk over the data belongs at the one that reports rather than throws.
    if (points3 !== undefined && drawn !== "plot3d") {
      throw new TypeError(
        `b.plot: "points3" on form "${drawn}" (C04 I76) — only a plot3d draws a point ` +
          `cloud, and three coordinates per sample mean nothing to any other form`,
      );
    }
    if (lines3 !== undefined && drawn !== "plot3d") {
      throw new Error(
        `b.plot: "lines3" on form "${drawn}" (C04 I78) — only a plot3d draws a path ` +
          `through three-dimensional space, and there is no projection to draw it with`,
      );
    }
    if (surfaces3 !== undefined && drawn !== "plot3d") {
      throw new Error(
        `b.plot: "surfaces3" on form "${drawn}" (C04 I79) — only a plot3d shades a ` +
          `surface, and there is no projection, no depth buffer and no light to shade it with`,
      );
    }
    if (light3 !== undefined && drawn !== "plot3d") {
      throw new Error(
        `b.plot: "light3" on form "${drawn}" (C04 I79) — it says where the light is, and ` +
          `only a shaded surface reads one`,
      );
    }
    // **`closed` is the mesh arm's** (C04 I80). The same refusal `validate`
    // makes, at the other gate: it enables backface culling, culling needs an
    // inside, and a grid has none — and the renderer cannot stand in for the
    // check, because an open surface's signed volume is not zero (F463).
    // `wireframe` is deliberately not beside it; it is about the edges the
    // input already has and a grid has the most structured ones.
    for (const [i, sf] of (surfaces3 ?? []).entries()) { // cells-ok — a surface index
      if (sf.heights !== undefined && sf.closed !== undefined) {
        throw new TypeError(
          `b.plot: surfaces3[${String(i)}] has "closed" on a height field (C04 I80) — it ` +
            `enables backface culling, which needs a surface with an inside; a grid has none`,
        );
      }
    }
    // **No carrier at all, and the set is what it reads** (C04 I79). A wireframe
    // is edges with no cloud, a parametric curve is a path with no samples, and a
    // loss landscape has neither — so any one alone is a complete document. The
    // validator reads `CARRIERS_3D`; this gate is the same rule at the other
    // side, and the two messages name the same list.
    if (
      drawn === "plot3d" && points3 === undefined && lines3 === undefined
      && surfaces3 === undefined
    ) {
      throw new TypeError(
        `b.plot: form "plot3d" has none of "points3", "lines3", "surfaces3" (C04 I79) — ` +
          `a cloud, a path or a surface is what it draws, and "series" carries one reading ` +
          `per position`,
      );
    }
    if (colourBy !== undefined && drawn !== "plot3d") {
      throw new TypeError(
        `b.plot: "colourBy" on form "${drawn}" (C04 I76) — it names which of three readings ` +
          `colour carries, and no other form has three competing for it`,
      );
    }
    if (drawn === "plot3d" && axes === true) {
      throw new TypeError(
        `b.plot: "axes" on form "plot3d" (C04 I76) — three axes turn with the camera and ` +
          `are drawn inside the area, so there is no gutter and no bottom rule to switch on`,
      );
    }
    // **`origin3` is read by `axes3: "origin"` and by nothing else** (C04 I77),
    // so it is refused where it decides nothing — `yCallout` needing
    // `yAxis: "right"` is the same shape one dimension down.
    if (origin3 !== undefined && (axes3 ?? "corner") !== "origin") {
      throw new TypeError(
        `b.plot: "origin3" with "axes3" of "${String(axes3 ?? "corner")}" (C04 I77) — it says ` +
          `where the axis lines cross, and only "origin" draws a crossing`,
      );
    }
    if (levels !== undefined && drawn !== "contour") {
      throw new TypeError(
        `b.plot: "levels" on form "${drawn}" (C04 I61) — only a contour draws iso-lines, ` +
          `and a level on anything else names nothing`,
      );
    }
    if (layers !== undefined && new Set(layers).size !== layers.length) { // cells-ok — a layer count
      throw new TypeError(
        `b.plot: "layers" names a layer twice (C04 I61) — a layer is drawn once, and the ` +
          `order of an entry that cannot occlude means nothing`,
      );
    }
  }
  if (plotFill === "solid" && plotStyle === "line") {
    throw new TypeError(
      `b.plot: "plotFill" is "solid" with "plotStyle" of "line" (C04 I59) — a box-drawing ` +
        `outline has no interior vocabulary, so this would be an outline in one alphabet ` +
        `around a body in another rather than the same figure filled`,
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
      ...(plotFill === undefined ? {} : { plotFill }),
      ...(plotGrid === undefined ? {} : { plotGrid }),
      ...(plotBox === undefined ? {} : { plotBox }),
      ...(yAxis === undefined ? {} : { yAxis }),
      ...(yCallout === undefined ? {} : { yCallout }),
      ...(vectors === undefined ? {} : { vectors }),
      ...(points3 === undefined ? {} : { points3 }),
      ...(lines3 === undefined ? {} : { lines3 }),
      ...(surfaces3 === undefined ? {} : { surfaces3 }),
      ...(light3 === undefined ? {} : { light3 }),
      ...(colourBy === undefined ? {} : { colourBy }),
      ...(axes3 === undefined ? {} : { axes3 }),
      ...(origin3 === undefined ? {} : { origin3 }),
      ...(box3 === undefined ? {} : { box3 }),
      ...(axisStyle3 === undefined ? {} : { axisStyle3 }),
      ...(camera === undefined ? {} : { camera }),
      ...(levels === undefined ? {} : { levels }),
      ...(layers === undefined ? {} : { layers }),
      ...(fieldDim === undefined ? {} : { fieldDim }),
      ...(glyphInk === undefined ? {} : { glyphInk }),
      ...(xMin === undefined ? {} : { xMin }),
      ...(xMax === undefined ? {} : { xMax }),
      ...(xFormat === undefined ? {} : { xFormat }),
      ...(yMin === undefined ? {} : { yMin }),
      ...(yMax === undefined ? {} : { yMax }),
      ...(yFormat === undefined ? {} : { yFormat }),
      ...(annotations === undefined ? {} : { annotations }),
      ...(colormap === undefined ? {} : { colormap }),
      ...(xLabels === undefined ? {} : { xLabels }),
      ...(xTitle === undefined ? {} : { xTitle }),
      ...(plotStyle === undefined ? {} : { plotStyle }),
      ...(ohlc === undefined ? {} : { ohlc }),
      ...(quartiles === undefined ? {} : { quartiles }),
      ...(categories === undefined ? {} : { categories }),
      ...(segments === undefined ? {} : { segments }),
      ...(bands === undefined ? {} : { bands }),
      ...(plotDetail === undefined ? {} : { plotDetail }),
      ...(plotCorners === undefined ? {} : { plotCorners }),
      ...(orientation === undefined ? {} : { orientation }),
      ...(bandwidth === undefined ? {} : { bandwidth }),
      ...(hierarchy === undefined ? {} : { hierarchy }),
      ...(treeLayout === undefined ? {} : { treeLayout }),
      ...(graph === undefined ? {} : { graph }),
      ...(graphLayout === undefined ? {} : { graphLayout }),
      ...(matrixAnchor === undefined ? {} : { matrixAnchor }),
      ...(legend === undefined ? {} : { legend }),
      ...(plotFrame === undefined ? {} : { plotFrame }),
      ...(width === undefined ? {} : { width }),
      ...(aspect === undefined ? {} : { aspect }),
      ...(align === undefined ? {} : { align }),
      ...(origin === undefined ? {} : { origin }),
      ...(axisCross === undefined ? {} : { axisCross }),
      ...(calendarUnit === undefined ? {} : { calendarUnit }),
      ...(startDate === undefined ? {} : { startDate }),
      ...(layout === undefined ? {} : { layout }),
      ...(binning === undefined ? {} : { binning }),
      ...(offsets === undefined ? {} : { offsets }),
      ...(totals === undefined ? {} : { totals }),
      ...(facets === undefined ? {} : { facets }),
      ...(emptyMessage === undefined ? {} : { emptyMessage }),
      ...(xScale === undefined ? {} : { xScale }),
      ...(yScale === undefined ? {} : { yScale }),
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
 * An image: PNG bytes or a path, a declared height, and required alt text
 * (C04 I73, §3g).
 *
 * **`path` is read here and nowhere below.** `node:fs` appears in `shell/` and
 * `data/process/` and never in `presentation/` — a renderer that opened a file
 * would be doing I/O at frame cadence in the layer forbidden it, and `measure`
 * and `render` would disagree the moment the file changed between them.
 *
 * **The digest is derived here too**, once, so the identity travels with the
 * block rather than being recomputed by every consumer that needs it.
 */
function image(
  opts: BlockOpts &
    Readonly<{ data?: string; path?: string; height: number; alt: string; overlay?: ImageOverlay }>,
): Image {
  const { data, path, height, alt, overlay } = opts;
  if ((data === undefined) === (path === undefined)) {
    throw new TypeError(
      `b.image: exactly one of "data" or "path" — got ${data === undefined ? "neither" : "both"} (C04 I73)`,
    );
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new TypeError(`b.image: height is a positive integer — got ${JSON.stringify(height)} (C04 I73)`);
  }
  if (typeof alt !== "string" || alt.trim() === "") {
    throw new TypeError(
      "b.image: alt is required and cannot be empty (C04 I73) — at imageProtocol \"none\" with no " +
        "dither it is the whole of what the reader receives",
    );
  }
  const bytes = data ?? readFileSync(path ?? "").toString("base64");
  if (!bytes.startsWith("iVBORw0KGgo")) {
    throw new TypeError(
      "b.image: the bytes are not a PNG (C04 I73) — phase 1 reads PNG only, and a signature that " +
        "does not match is a format this cannot draw rather than an image that is broken",
    );
  }
  // **One refusal, thrown here and pushed by the validator** (C04 I74).
  if (overlay !== undefined) {
    const fault = overlayFault(overlay, new Set(Object.keys(COLORMAPS)));
    if (fault !== null) throw new TypeError(`b.image: ${fault}`);
  }
  return finish<Image>(
    {
      kind: "image",
      id: idOf(opts, "image"),
      data: bytes,
      height,
      alt,
      // **The digest stays the data's** and is not widened to cover the overlay
      // (C04 §3g.2): it keys the decode, and two blocks of one image with
      // different overlays should decode once. The *picture's* identity is
      // `imageKey`, derived where it is needed and by one function.
      digest: digestOf(bytes),
      ...(overlay === undefined ? {} : { overlay }),
    } as Image,
    opts,
    false,
  );
}

/**
 * A sample grid: N pictures with a label under each (§3f, §3g · `samples.ts`).
 *
 * **A composition rather than a kind**, and the premise was re-taken with kitty
 * placing rather than inherited from the dither. What it adds over writing the
 * mosaic by hand is the arithmetic nobody should do twice: the spec string, the
 * row shares, and the **reading order** — `AB/ab` maps as `A B a b`, so a band
 * contributes its pictures and then its labels, and getting that wrong puts
 * every caption under the wrong picture with every count agreeing.
 */
function samples(opts: BlockOpts & SamplesOptions): Mosaic {
  const cellRows = opts.cellRows ?? 4;
  const layout = samplesLayout(opts.items.length, opts.columns, cellRows);
  if (typeof layout === "string") throw new TypeError(`b.samples: ${layout}`);
  // **One scale across the set, computed once** (C04 I74, F253) — the shared
  // normalisation the residual measurement made a ruling rather than a finding.
  const items = samplesScale(opts.items);
  const at = (i: number): Sample => items[i] as Sample;
  // **`opts` is not spread, and the reason is a name collision that type-checks
  // in the other direction.** `SamplesOptions.columns` is a *count* and
  // `Mosaic.columns` is a `Share[]`; spreading carries the count into the field
  // and the compiler caught it, which is the enumeration working on a field
  // rather than on a kind.
  return mosaic({
    ...(opts.id === undefined ? {} : { id: opts.id }),
    ...(opts.gapBefore === undefined ? {} : { gapBefore: opts.gapBefore }),
    height: layout.height,
    areas: layout.areas,
    rows: layout.rows,
    children: samplesChildren(
      opts.items.length,
      opts.columns,
      (i) => {
        const item = at(i);
        return image({
          id: `${idOf(opts, "samples")}-i${String(i)}`,
          height: cellRows,
          alt: item.alt,
          ...(item.data === undefined ? {} : { data: item.data }),
          ...(item.path === undefined ? {} : { path: item.path }),
          ...(item.overlay === undefined ? {} : { overlay: item.overlay }),
        });
      },
      (i) => raw(at(i).label, { id: `${idOf(opts, "samples")}-l${String(i)}` }),
    ),
  });
}

/**
 * A mosaic: a declared grid holding a figure nested rows and columns cannot draw
 * (C04 I71, C04 I72, C04 §3f).
 *
 * **Refused at construction on exactly the terms `validateDocument` refuses it**,
 * from the same parse — `graph`'s lesson read forward rather than repeated: the
 * gate that landed with the builder and not with the validator produced an
 * invariant that was true on one side and vacuous on the other.
 */
function mosaic(
  opts: BlockOpts &
    Readonly<{
      height: number;
      areas: string;
      children: readonly Block[];
      columns?: readonly Share[];
      rows?: readonly Share[];
    }>,
): Mosaic {
  const { height, areas, children, columns, rows } = opts;
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(
      `b.mosaic: height is a positive integer — got ${JSON.stringify(height)}; a mosaic with ` +
        `no declared height draws one blank row (C04 I71)`,
    );
  }
  const parsed = parseAreas(areas);
  if (!parsed.ok) throw new Error(`b.mosaic: ${parsed.fault}`);
  const { grid } = parsed;
  if (children.length !== grid.regions.length) {
    throw new Error(
      // **The same fault, said the same way at both gates** — `hierarchy`'s HG4
      // precedent. Naming the regions is what makes the message actionable: the
      // author has to know *which* region has no child.
      `b.mosaic: "areas" names ${String(grid.regions.length)} regions ` +
        `(${grid.regions.map((r) => JSON.stringify(r.name)).join(", ")}) for ` +
        `${String(children.length)} children (C04 I71) — the mapping is positional`,
    );
  }
  for (const [member, lines, shares] of [
    ["columns", grid.columns, columns],
    ["rows", grid.rows, rows],
  ] as const) {
    if (shares !== undefined && shares.length !== lines) {
      throw new Error(
        `b.mosaic: ${JSON.stringify(member)} has ${String(shares.length)} entries for a grid ` +
          `${String(lines)} deep (C04 I72) — one per grid line, not per child`,
      );
    }
  }
  // **Through `finish`, like every other builder** (I3, I15). Returning the
  // literal skips the freeze and drops `gapBefore` — both caught by the
  // enumeration's own rows rather than by anything written for this kind, which
  // is what the table exists for.
  return finish<Mosaic>(
    {
      kind: "mosaic",
      id: idOf(opts, "mosaic"),
      height,
      areas,
      children,
      ...(columns === undefined ? {} : { columns }),
      ...(rows === undefined ? {} : { rows }),
    } as Mosaic,
    opts,
    false,
  );
}

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

function raw(text: string, opts?: TextOpts): Raw {
  return finish<Raw>(
    {
      kind: "raw",
      id: idOf(opts, "raw"),
      text,
      ...(opts?.spans === undefined ? {} : { spans: opts.spans }),
      ...(opts?.colormap === undefined ? {} : { colormap: opts.colormap }),
    } as Raw,
    opts,
    false,
  );
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

/**
 * `status` — the kind both framework defaults return, and the one no builder made
 * (C24 I30, §4b, §8d).
 *
 * **The parameters are `renderError`'s own, in its own order**, so the null
 * override is `renderError: b.status` and the useful one wraps it:
 * `b.group("column", [history, b.status(err, retryInMs, attempt)])`, which keeps
 * the data the default replaces outright.
 *
 * **What is relayed and what is derived, which is the whole of the ruling.** A
 * consumer is *handed* the error, the countdown and the attempt by the driver, so
 * passing them back is relaying rather than claiming — the thing MG27 refuses is a
 * `state` asserted against a fetch that never failed, and `state` is derived here
 * from whether a countdown is present. `height` is derived too, and it is the one
 * the scoping does not reach: 1 and 2 are C23's frame read about sitting inside
 * `b.live`'s panel (F234, F235), so a consumer choosing 3 puts a second border
 * inside the first and a consumer choosing 2 draws `loading` over `⠋ loading`.
 * `elapsedMs` and `spinner` are never parameters at all.
 *
 * **One implementation, and that is the other half.** This kind was constructed in
 * three places — here, `execution.ts`'s default `renderError`, and the registry's
 * containment boundary — and the two that are a *declaration's* default now call
 * this. Three copies of a shape drift, and the one that drifts is the one with
 * fewer tests.
 */
function statusBlock(
  err: ErrorLike,
  retryInMs: number | null,
  attempt: number,
  opts?: BlockOpts,
): Status {
  return framedStatus(err, retryInMs, attempt, false, opts);
}

/**
 * The same box, told whether something already frames it (C09 §3a, F406).
 *
 * **Not a parameter on `b.status`**, and MG27 holds the reason: whoever puts the
 * box inside a bordered container knows, and a consumer holding one does not — a
 * `renderError` override composing its own `group` is *not* a container that
 * draws a border, so a consumer answering this would be guessing about furniture
 * it cannot see. The one caller that knows is `b.live`'s own defaults, which put
 * the box inside the part's panel.
 */
export function framedStatus(
  err: ErrorLike,
  retryInMs: number | null,
  attempt: number,
  framed: boolean,
  opts?: BlockOpts,
): Status {
  // **The decision is named before the block, and SS45 is the reason it reads
  // better as well as passing.** Written inline, `state: "error",` is a tone
  // literal *as an object-literal value* — which is SS45's subject exactly, and
  // the scan is right to look at it: `"error"` is a `Tone` as well as a
  // `Status.state`, and the two vocabularies overlap. What makes this not
  // inference is where the value comes from: **an argument the driver supplied**,
  // not a field name, which is the distinction C24 I5 draws. Hoisting it says so
  // structurally rather than in a comment, and the literal stops being an
  // object-literal value because it is not one.
  //
  // It also tells MG28 the truth. A bare literal per arm would have that rule
  // count which arms a builder writes; a derived value makes the field
  // **parameterised**, which is what it is — all three states are reachable from
  // the published surface, two through here and `loading` through the door below.
  const state = retryInMs === null ? "error" : "retrying";
  // **Framed heights are one row taller, and the row buys the tag** (F406, C09
  // I31). Free-standing the numbers are 1 and 2 — the rungs below the ladder's
  // first border — and inside `b.live`'s panel they read as a red line of text,
  // which is what a reader with two screenshots reported. Framed, two rows are
  // *tag and message* and three buy `retrying` its activity line.
  const height = framed ? (retryInMs === null ? 2 : 3) : retryInMs === null ? 1 : 2;
  return finish<Status>(
    block({
      kind: "status",
      id: idOf(opts, "status"),
      message: err.message,
      state,
      height,
      ...(framed ? { framed } : {}),
      ...(retryInMs === null ? {} : { retryInMs, attempt }),
    }) as Status,
    opts,
    false,
  );
}

/**
 * The third state, which has no error to be handed and so no arity to share.
 *
 * `message` is what a taller box would say — the registry can size this one from
 * a committed measure, and a consumer can read it — while at one row C09 I31
 * gives `loading` the line that *moves* rather than the label the panel above
 * already carries.
 */
function statusLoading(opts?: BlockOpts, framed = false): Status {
  return finish<Status>(
    block({
      kind: "status",
      id: idOf(opts, "status"),
      state: "loading",
      message: "loading",
      height: 1,
      // **`loading` is unchanged under either ladder** and carries the flag
      // anyway: it has no tag to gain, and a box that says it is framed while
      // its neighbours in the same panel do not would be two answers to one
      // question about one container.
      ...(framed ? { framed } : {}),
    }) as Status,
    opts,
    false,
  );
}

const status = Object.assign(statusBlock, { loading: statusLoading });

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
    // **A `status` at `loading`, and the kind exists for this fact** (C23 I51,
    // C09 §3a). A first fetch in flight is the builder's to know — the part is
    // constructed before the driver has run — and it is one of the three states
    // a consumer cannot observe, which is the whole argument for the kind.
    //
    // **Through `b.status.loading` now** (C24 I30). The literal that stood here
    // was one of three constructions of this kind, and the argument against three
    // is the argument against two: the builder and the default cannot drift if
    // they are the same code.
    //
    // **This was a `notice` and drew no spinner.** The `pending` glyph was the
    // right answer while the box was static: a builder runs above the renderer,
    // so a character written here cannot be substituted, and `◌` is one C09
    // already carries with `.` below unicode. A `status` carries its own mark
    // the same way and animates as well, which the notice could not — and
    // `elapsedMs` gives the box something to say while it waits (C23 I52).
    //
    // **Height 1, and it took two frame reads to get there** (F234, F235). The
    // panel below already draws the border and holds the title, so 3 spends a
    // row on a second border inside the first — and 2 drew `loading` over
    // `⠋ loading`, the same word twice, because at two rows the message gets one
    // and the activity line gets the other. A waiting box's whole content is the
    // line that moves; C09 I31's one-row rung now gives `loading` that line.
    //
    // `message` is still what a taller one would say — the registry can size
    // this box from a committed measure, and a consumer can read it.
    statusLoading({ id: `${spec.id}-loading` }, true);
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
  mosaic,
  image,
  samples,
  raw,
  spinner,
  status,

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
