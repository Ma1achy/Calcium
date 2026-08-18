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
    ...(opts?.marker !== undefined ? { marker: opts.marker } : {}),
  };
}

type FigureOpts = {
  title?: string;
  height?: number;
  axes?: boolean;
  yFormat?: Plot["yFormat"];
  yMin?: number;
  yMax?: number;
  colormap?: ColormapName;
  xScale?: ScaleType;
  yScale?: ScaleType;
  plotStyle?: "auto" | "braille" | "line";
  plotCorners?: "rounded" | "sharp";
};

type SeriesOpts = {
  label?: string;
  tone?: Series["tone"];
  marker?: string;
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

  threshold(value: number, opts?: { label?: string; tone?: Annotation["tone"] }): this {
    const a: Annotation = opts?.tone !== undefined
      ? { kind: "line", value, tone: opts.tone }
      : { kind: "line", value };
    this.annotationList.push(a);
    return this;
  }

  band(from: number, to: number, opts?: { tone?: Annotation["tone"] }): this {
    const a: Annotation = opts?.tone !== undefined
      ? { kind: "band", from, to, tone: opts.tone }
      : { kind: "band", from, to };
    this.annotationList.push(a);
    return this;
  }

  confidence(upper: readonly number[], lower: readonly number[], opts?: { tone?: Annotation["tone"] }): this {
    const a: Annotation = opts?.tone !== undefined
      ? { kind: "confidence", upper, lower, tone: opts.tone }
      : { kind: "confidence", upper, lower };
    this.annotationList.push(a);
    return this;
  }

  whiskers(points: readonly Readonly<{ x: number; y: number; err: number }>[], opts?: { tone?: Annotation["tone"] }): this {
    const a: Annotation = opts?.tone !== undefined
      ? { kind: "whiskers", points, tone: opts.tone }
      : { kind: "whiskers", points };
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
