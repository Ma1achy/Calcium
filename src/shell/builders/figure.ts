/**
 * `FigureBuilder` — a chain that produces an immutable `Plot`.
 *
 * Series and annotations are peers, not two fields — `.line()` and
 * `.threshold()` are called at the same level.
 *
 * The chain is construction; the block is data. Mixing them is how matplotlib
 * got `pyplot`, which is the one thing not to copy.
 */
import type {
  Plot,
  PlotForm,
  Series,
  Annotation,
  ColormapName,
  Segment,
  QuartileSummary,
  ScaleType,
} from "../../data/viewmodel/index.js";

function makeSeries(values: readonly (number | null)[], opts?: SeriesOpts): Series {
  return {
    values,
    ...(opts?.label !== undefined ? { label: opts.label } : {}),
    ...(opts?.tone !== undefined ? { tone: opts.tone } : {}),
    ...(opts?.hidden !== undefined ? { hidden: opts.hidden } : {}),
  };
}

/** An annotation's shared options, spread-if-present (C04 I46's `undefined` clause). */
type AnnotationTone = Exclude<Annotation["tone"], undefined>;
type AnnotationOpts = { tone?: AnnotationTone; hidden?: boolean };
function annotationOpts(opts?: AnnotationOpts): { tone?: AnnotationTone; hidden?: boolean } {
  return {
    ...(opts?.tone !== undefined ? { tone: opts.tone } : {}),
    ...(opts?.hidden !== undefined ? { hidden: opts.hidden } : {}),
  };
}

export type FigureOpts = {
  title?: string;
  height?: number;
  axes?: boolean;
  yFormat?: Plot["yFormat"];
  yMin?: number;
  yMax?: number;
  colormap?: ColormapName;
  xScale?: ScaleType;
  yScale?: ScaleType;
  // **Indexed rather than restated.** These were three hand-copies of `Plot`'s
  // unions, and `plotStyle` gaining `"candlestick"` is what a copy cannot
  // survive — it would have gone on reading as a complete vocabulary.
  plotStyle?: Plot["plotStyle"];
  plotDetail?: Plot["plotDetail"];
  plotCorners?: Plot["plotCorners"];
};

/**
 * **What `b.figure` forwards, and the two it does not** (F1028, F181).
 *
 * `b.figure` accepted six of these twelve and `build()` spread all twelve, so
 * six were declared, forwarded to the block, and passable by nobody:
 * `colormap`, `xScale`, `yScale`, `plotStyle`, `plotDetail`, `plotCorners`.
 * F181 recorded that as *three*; it is six, and the two that arrived since are
 * the two withheld here.
 *
 * **Four of the six open now and two do not, and the split is measured rather
 * than chosen.** `b.plot` carries 40 refusals; grouped by the field their
 * message names, `colormap`, `xScale`, `yScale` and `plotCorners` have **none**
 * between them, so forwarding them adds a second door to a room with no lock on
 * the first. `plotStyle` has **three** — `"candlestick"` with no `ohlc`
 * (C04 I57), a style not on the drawn form's arms (C04 I59), and `plotFill:
 * "solid"` against `plotStyle: "line"` — and `plotDetail` has **one**, a detail
 * not on the drawn form (C12 I34).
 *
 * **Those refusals are the only gate.** `validateDocument` refuses the same
 * documents, and its only caller in `src/` is `transcript-persist.ts`, on
 * untrusted input read back from disk — a locally built block is never
 * validated, which is what `b.plot`'s own comment means by *refused at
 * construction on exactly the terms `validateDocument` refuses it*. So a chain
 * that forwarded `plotStyle` would build a document the framework refuses, and
 * nothing between the chain and the screen would say so.
 *
 * **The blocker as a symbol, since a deferral that names a condition and nothing
 * watches it stops being a deferral.** The two open when the chain can refuse
 * what `b.plot` refuses: grep `plotStyle` in `builders/index.ts` for the three,
 * `plotDetail` for the fourth. `setOhlc` is behind the same door and no longer
 * behind *this* one — `b.figure` forwards ten of twelve now, and the reason the
 * eleventh is missing is a refusal it would skip rather than a field it cannot
 * carry.
 */
export type FigureChainOpts = Omit<FigureOpts, "plotStyle" | "plotDetail">;

// **No `marker`.** `Series` has no such member (C04 I76): no 2-D renderer has a
// glyph channel for one, so the option this carried was accepted by every gate
// and drawn by none (F207). Narrowed with the type it forwarded to, F85's
// argument — a builder option with no reader is the public door to a field
// nothing reads.
type SeriesOpts = {
  label?: string;
  tone?: Series["tone"];
  /** Not drawn, still held — appearance, and refused where a series is not a layer (C04 I99). */
  hidden?: boolean;
};

export class FigureBuilder {
  private readonly opts: FigureOpts;
  private readonly seriesList: Series[] = [];
  private readonly annotationList: Annotation[] = [];
  private form: PlotForm = "line";
  private xLabels_?: Plot["xLabels"];
  private categories_?: readonly string[];
  private segments_?: readonly Segment[];
  private quartiles_?: readonly QuartileSummary[];
  private layout_?: Plot["layout"];
  private binning_?: Plot["binning"];
  private offsets_?: readonly number[];
  private totals_?: readonly boolean[];
  private startDate_?: string;
  private bands_?: number;
  private facets_?: readonly Plot[];
  private built = false;

  constructor(opts: FigureOpts = {}) {
    this.opts = opts;
  }

  line(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "line";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  scatter(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "scatter";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  step(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "step";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  ecdf(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "ecdf";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  bar(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "bar";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  density(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "density";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  horizon(values: readonly (number | null)[], opts?: SeriesOpts): this {
    this.form = "horizon";
    this.seriesList.push(makeSeries(values, opts));
    return this;
  }

  threshold(value: number, opts?: AnnotationOpts & { label?: string }): this {
    const a: Annotation = { kind: "line", value, ...annotationOpts(opts) };
    this.annotationList.push(a);
    return this;
  }

  band(from: number, to: number, opts?: AnnotationOpts): this {
    const a: Annotation = { kind: "band", from, to, ...annotationOpts(opts) };
    this.annotationList.push(a);
    return this;
  }

  confidence(upper: readonly number[], lower: readonly number[], opts?: AnnotationOpts): this {
    const a: Annotation = { kind: "confidence", upper, lower, ...annotationOpts(opts) };
    this.annotationList.push(a);
    return this;
  }

  whiskers(points: readonly Readonly<{ x: number; y: number; err: number }>[], opts?: AnnotationOpts): this {
    const a: Annotation = { kind: "whiskers", points, ...annotationOpts(opts) };
    this.annotationList.push(a);
    return this;
  }

  xlabel(labels: Plot["xLabels"]): this {
    this.xLabels_ = labels;
    return this;
  }

  setCategories(cats: readonly string[]): this {
    this.categories_ = cats;
    return this;
  }

  setSegments(segs: readonly Segment[]): this {
    this.segments_ = segs;
    return this;
  }

  setQuartiles(qs: readonly QuartileSummary[]): this {
    this.quartiles_ = qs;
    return this;
  }

  setLayout(layout: Plot["layout"]): this {
    this.layout_ = layout;
    return this;
  }

  setBinning(binning: Plot["binning"]): this {
    this.binning_ = binning;
    return this;
  }

  setOffsets(offsets: readonly number[]): this {
    this.offsets_ = offsets;
    return this;
  }

  setTotals(totals: readonly boolean[]): this {
    this.totals_ = totals;
    return this;
  }

  setStartDate(date: string): this {
    this.startDate_ = date;
    return this;
  }

  setBands(n: number): this {
    this.bands_ = n;
    return this;
  }

  /**
   * **The fluent form of `b.plot`'s `facets`, and for a while the only form**
   * (C24 I30, §4b).
   *
   * One builder holding a member the published function lacked was not a design;
   * it was two surfaces widened on different days. `pairplot` and
   * `smallmultiples` are delegating forms, so a `facets` nobody could set made
   * both unconstructible from `b.plot` while this chain could build them — a
   * capability reachable only by knowing which of two builders to reach for.
   * They set the same field now, and this is a convenience over it rather than
   * the route to it.
   */
  setFacets(facets: readonly Plot[]): this {
    this.facets_ = facets;
    return this;
  }

  setForm(form: PlotForm): this {
    this.form = form;
    return this;
  }

  build(): Plot {
    if (this.built) throw new Error("FigureBuilder: .build() may only be called once");
    this.built = true;

    const plot: Plot = {
      kind: "plot",
      id: this.opts.title ?? "figure",
      form: this.form,
      series: Object.freeze([...this.seriesList]),
      ...(this.opts.height !== undefined ? { height: this.opts.height } : {}),
      ...(this.opts.axes !== undefined ? { axes: this.opts.axes } : {}),
      ...(this.opts.yFormat !== undefined ? { yFormat: this.opts.yFormat } : {}),
      ...(this.opts.yMin !== undefined ? { yMin: this.opts.yMin } : {}),
      ...(this.opts.yMax !== undefined ? { yMax: this.opts.yMax } : {}),
      ...(this.opts.colormap !== undefined ? { colormap: this.opts.colormap } : {}),
      ...(this.opts.xScale !== undefined ? { xScale: this.opts.xScale } : {}),
      ...(this.opts.yScale !== undefined ? { yScale: this.opts.yScale } : {}),
      ...(this.opts.plotStyle !== undefined ? { plotStyle: this.opts.plotStyle } : {}),
      ...(this.opts.plotDetail !== undefined ? { plotDetail: this.opts.plotDetail } : {}),
      ...(this.opts.plotCorners !== undefined ? { plotCorners: this.opts.plotCorners } : {}),
      ...(this.xLabels_ !== undefined ? { xLabels: this.xLabels_ } : {}),
      ...(this.annotationList.length > 0 ? { annotations: Object.freeze([...this.annotationList]) } : {}),
      ...(this.categories_ !== undefined ? { categories: this.categories_ } : {}),
      ...(this.segments_ !== undefined ? { segments: this.segments_ } : {}),
      ...(this.quartiles_ !== undefined ? { quartiles: this.quartiles_ } : {}),
      ...(this.layout_ !== undefined ? { layout: this.layout_ } : {}),
      ...(this.binning_ !== undefined ? { binning: this.binning_ } : {}),
      ...(this.offsets_ !== undefined ? { offsets: this.offsets_ } : {}),
      ...(this.totals_ !== undefined ? { totals: this.totals_ } : {}),
      ...(this.startDate_ !== undefined ? { startDate: this.startDate_ } : {}),
      ...(this.bands_ !== undefined ? { bands: this.bands_ } : {}),
      ...(this.facets_ !== undefined ? { facets: this.facets_ } : {}),
    } as Plot;

    return Object.freeze(plot);
  }
}
