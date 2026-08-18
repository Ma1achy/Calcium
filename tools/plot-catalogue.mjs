/**
 * Plot catalogue — renders every form and writes to docs/catalogue/.
 *
 * For each form: default, minimal, dense, empty, annotated.
 * At four capability sets: 24-bit narrow, 8-bit narrow, ASCII wide, 1-bit narrow.
 *
 * Run: node tools/plot-catalogue.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBlockRegistry } from "../src/presentation/blocks/index.js";
import { plotDefinition } from "../src/presentation/plot/index.js";
import { renderToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";
import { block } from "../src/data/viewmodel/index.js";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;

const FULL = { colourDepth: 24, unicode: "full", ambiguousWidth: "narrow", synchronisedUpdate: true, bracketedPaste: true, mouse: true, imageProtocol: "none", altScreen: true };
const EIGHT = { ...FULL, colourDepth: 8 };
const ASCII_WIDE = { ...FULL, unicode: "ascii", ambiguousWidth: "wide", colourDepth: 1 };
const MONO = { ...FULL, colourDepth: 1 };

export const CAPS = [
  { name: "24bit", caps: FULL },
  { name: "8bit", caps: EIGHT },
  { name: "ascii-wide", caps: ASCII_WIDE },
  { name: "1bit", caps: MONO },
];

const registry = createBlockRegistry({});
registry.register(plotDefinition);

const s = (vs) => ({ values: vs });
const sin50 = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.1) * 50 + 50);
const sin500 = Array.from({ length: 500 }, (_, i) => Math.sin(i * 0.1) * 50 + 50);

export const FORMS = {
  line: {
    default: { form: "line", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "line", height: 3, axes: false, series: [s([1, 3, 2, 5, 4])] },
    dense: { form: "line", height: 8, axes: true, series: [s(sin500)] },
    empty: { form: "line", height: 5, axes: true, series: [{ values: [] }] },
    annotated: { form: "line", height: 8, axes: true, series: [s(sin50)], annotations: [{ kind: "line", value: 50 }, { kind: "band", from: 30, to: 70 }] },
  },
  sparkline: {
    default: { form: "sparkline", series: [s(sin50)] },
    minimal: { form: "sparkline", series: [s([1, 3, 2])] },
    dense: { form: "sparkline", series: [s(sin500)] },
    empty: { form: "sparkline", series: [{ values: [] }] },
  },
  scatter: {
    default: { form: "scatter", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "scatter", height: 3, axes: false, series: [s([1, 5, 2])] },
    dense: { form: "scatter", height: 8, axes: true, series: [s(sin500)] },
    empty: { form: "scatter", height: 5, axes: true, series: [{ values: [] }] },
  },
  step: {
    default: { form: "step", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "step", height: 3, axes: false, series: [s([1, 5, 2])] },
    empty: { form: "step", height: 5, axes: true, series: [{ values: [] }] },
  },
  ecdf: {
    default: { form: "ecdf", height: 8, axes: true, series: [s([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5])] },
    empty: { form: "ecdf", height: 5, axes: true, series: [{ values: [] }] },
  },
  heatmap: {
    default: { form: "heatmap", height: 5, axes: true, series: Array.from({ length: 5 }, (_, r) => ({ values: Array.from({ length: 90 }, (_, c) => Math.sin((r + c) * 0.3) * 50 + 50), label: `row${r}` })) },
    palette: { form: "heatmap", height: 5, axes: true, colormap: "viridis", series: Array.from({ length: 5 }, (_, r) => ({ values: Array.from({ length: 90 }, (_, c) => Math.sin((r + c) * 0.3) * 50 + 50), label: `row${r}` })) },
    empty: { form: "heatmap", height: 3, axes: true, series: [{ values: [], label: "empty" }] },
  },
  bar: {
    default: { form: "bar", height: 5, axes: true, categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])] },
    stacked: { form: "bar", height: 5, axes: true, categories: ["Q1", "Q2", "Q3", "Q4"], layout: "stacked", series: [s([10, 20, 15, 25]), s([5, 10, 8, 12])] },
    normalised: { form: "bar", height: 5, axes: true, categories: ["Q1", "Q2", "Q3", "Q4"], layout: "normalised", series: [s([10, 20, 15, 25]), s([5, 10, 8, 12])] },
    grouped: { form: "bar", height: 5, axes: true, categories: ["A", "B"], layout: "grouped", series: [s([10, 20]), s([15, 25])] },
    empty: { form: "bar", height: 3, axes: true, categories: ["x"], series: [{ values: [] }] },
  },
  histogram: {
    sturges: { form: "histogram", height: 8, axes: true, series: [s(Array.from({ length: 200 }, () => Math.random() * 100))] },
    "freedman-diaconis": { form: "histogram", height: 8, axes: true, binning: "freedman-diaconis", series: [s(Array.from({ length: 200 }, () => Math.random() * 100))] },
    scott: { form: "histogram", height: 8, axes: true, binning: "scott", series: [s(Array.from({ length: 200 }, () => Math.random() * 100))] },
  },
  boxplot: {
    default: { form: "boxplot", height: 4, axes: true, categories: ["A", "B", "C", "D"], quartiles: [{ min: 1, q1: 3, median: 5, q3: 7, max: 9 }, { min: 2, q1: 4, median: 6, q3: 8, max: 10, outliers: [12] }, { min: 0, q1: 2, median: 4, q3: 6, max: 8 }, { min: 3, q1: 5, median: 7, q3: 9, max: 11 }], series: [] },
  },
  forest: {
    default: { form: "forest", height: 3, axes: true, categories: ["Study A", "Study B", "Study C"], quartiles: [{ min: 1, q1: 3, median: 5, q3: 7, max: 9, centre: 5, lower: 3, upper: 7 }, { min: 2, q1: 4, median: 6, q3: 8, max: 10, centre: 6, lower: 4, upper: 8 }, { min: 0, q1: 2, median: 4, q3: 6, max: 8, centre: 4, lower: 2, upper: 6 }], series: [] },
  },
  dumbbell: {
    default: { form: "dumbbell", height: 4, axes: true, categories: ["2020", "2021", "2022", "2023"], series: [s([10, 20, 30, 25]), s([30, 25, 40, 35])] },
  },
  lollipop: {
    default: { form: "lollipop", height: 5, axes: true, categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])] },
  },
  dotplot: {
    default: { form: "dotplot", height: 5, axes: true, categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])] },
  },
  waffle: {
    default: { form: "waffle", series: [], segments: [{ label: "Yes", value: 65 }, { label: "No", value: 25 }, { label: "Maybe", value: 10 }] },
  },
  funnel: {
    default: { form: "funnel", height: 4, axes: true, categories: ["Visit", "Sign up", "Trial", "Pay"], series: [s([1000, 400, 200, 80])] },
  },
  gantt: {
    default: { form: "gantt", height: 4, axes: true, categories: ["Build", "Test", "Deploy", "Monitor"], series: [s([5, 3, 2, 1])], offsets: [0, 5, 8, 10] },
  },
  waterfall: {
    default: { form: "waterfall", height: 5, axes: true, categories: ["Revenue", "COGS", "Opex", "Tax", "Net"], series: [s([100, -40, -25, -10, 25])], totals: [false, false, false, false, true] },
  },
  density: {
    default: { form: "density", height: 8, axes: true, series: [s([1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 5, 5, 6, 7, 8, 8, 8, 9, 10])] },
  },
  violin: {
    default: { form: "violin", height: 12, axes: true, categories: ["A", "B", "C"], series: [s([1, 1, 2, 3, 3, 3, 4, 5]), s([2, 3, 3, 4, 4, 4, 5, 6]), s([1, 2, 2, 2, 3, 4, 5, 5])] },
  },
  ridgeline: {
    default: { form: "ridgeline", height: 12, axes: true, series: [{ values: [1, 1, 2, 3, 3, 3, 4, 5], label: "set1" }, { values: [2, 3, 3, 4, 4, 4, 5, 6], label: "set2" }, { values: [1, 2, 2, 2, 3, 4, 5, 5], label: "set3" }] },
  },
  pie: {
    "default-40": { form: "pie", height: 10, series: [], segments: [{ label: "Chrome", value: 65 }, { label: "Firefox", value: 15 }, { label: "Safari", value: 12 }, { label: "Other", value: 8 }] },
    "narrow-20": { form: "pie", height: 5, series: [], segments: [{ label: "Chrome", value: 65 }, { label: "Firefox", value: 15 }, { label: "Safari", value: 12 }, { label: "Other", value: 8 }] },
    "many-segments": { form: "pie", height: 10, series: [], segments: [{ label: "A", value: 50 }, { label: "B", value: 20 }, { label: "C", value: 10 }, { label: "D", value: 5 }, { label: "E", value: 5 }, { label: "F", value: 3 }, { label: "G", value: 3 }, { label: "H", value: 2 }, { label: "I", value: 1 }, { label: "J", value: 1 }] },
  },
  radar: {
    default: { form: "radar", height: 10, categories: ["Speed", "Power", "Range", "Defence", "HP"], series: [s([80, 60, 90, 40, 70]), s([50, 85, 45, 75, 55])] },
  },
  horizon: {
    "bands-2": { form: "horizon", height: 2, series: [s(sin50)], bands: 2 },
    "bands-3": { form: "horizon", height: 3, series: [s(sin50)], bands: 3 },
    "bands-5": { form: "horizon", height: 5, series: [s(sin50)], bands: 5 },
  },
  correlation: {
    default: { form: "correlation", height: 4, axes: true, series: [{ values: [1, 0.8, -0.3, 0.5], label: "A" }, { values: [0.8, 1, 0.2, 0.6], label: "B" }, { values: [-0.3, 0.2, 1, -0.1], label: "C" }, { values: [0.5, 0.6, -0.1, 1], label: "D" }] },
  },
  confusion: {
    default: { form: "confusion", height: 3, axes: true, series: [{ values: [90, 5, 5], label: "cat" }, { values: [10, 80, 10], label: "dog" }, { values: [5, 15, 80], label: "bird" }] },
  },
  streamgraph: {
    default: { form: "streamgraph", height: 8, axes: true, series: [s(sin50), s(sin50.map((v) => 100 - v))] },
  },
};

export function stripSgr(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * One rendered frame, as lines — the part with no filesystem in it.
 *
 * Separated so a fixture can ask whether a form renders without writing four
 * hundred files to do it, and so `n/m rows` counts something observed.
 */
export function frameFor(spec, caps, width) {
  return renderToLines(registry, block({ kind: "plot", id: "cat", ...spec }), width, {
    theme, capabilities: caps,
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
const outDir = join(import.meta.dirname, "..", "docs", "catalogue");
mkdirSync(outDir, { recursive: true });

let totalFiles = 0;

for (const [formName, variants] of Object.entries(FORMS)) {
  for (const [variantName, spec] of Object.entries(variants)) {
    for (const { name: capsName, caps } of CAPS) {
      const id = `cat-${formName}-${variantName}`;
      const width = capsName === "ascii-wide" ? 60 : 80;
      const b = block({ kind: "plot", id, ...spec });

      const lines = renderToLines(registry, b, width, { theme, capabilities: caps });
      const header = `── ${formName} · ${variantName} · ${capsName} · ${width}w`;
      const frame = [header, ...lines].join("\n");

      const basename = `${formName}-${variantName}-${capsName}`;
      writeFileSync(join(outDir, `${basename}.txt`), frame + "\n");
      writeFileSync(join(outDir, `${basename}.plain`), stripSgr(frame) + "\n");
      totalFiles += 2;
    }
  }
}

console.log(`catalogue: ${totalFiles} files written to docs/catalogue/`);
}
