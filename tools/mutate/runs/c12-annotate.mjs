// Annotations, mutated — C12 I23, and every row here renders a plausible plot.
//
// **The failure mode is one shape: an annotation that reads as data.** A solid
// line is a flat series; a ramp-folded one is heavier than the curve beside it;
// one drawn in front hides the sample it exists to be compared against; a
// clamped edge is a line at the ceiling naming a limit that is somewhere else.
// Every one of the four is the right height, the right width and the wrong
// picture, which is why the rows below lean on `states.test.ts`'s frame.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot.test.ts test/unit/plot-mutations.test.ts test/golden/states.test.ts";
const ANN = "src/presentation/plot/annotate.ts";
const DEF = "src/presentation/plot/definition.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT after 180000ms — the render did not return` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: ANN,
    from: "  const edges = edgesOf(annotation).filter((v) => drawn(v, range));",
    to: "  const edges = [];",
    why: "no annotation is drawn at all — if this survives, nothing in the suite reads one and no row below is earned",
  },
  mutations: [
    {
      // **THE FAILURE MODE**, at its most direct: a solid line. Every count
      // agrees, the row is the right width, and a reader sees a series drawn
      // flat across the plot — which is the one thing an annotation must not
      // look like. F34's other carrier removed, leaving the tone alone.
      name: "THE FAILURE: the line is solid, so it reads as a flat series",
      file: ANN,
      from: "    for (let x = 0; x < grid.dotWidth; x += DASH_CELLS * BRAILLE_DOTS.x) setDot(grid, x, y);",
      to: "    for (let x = 0; x < grid.dotWidth; x += 1) setDot(grid, x, y);",
      expect: "T1.30",
    },
    {
      // The dash at one dot's period rather than two cells' — solid to a reader
      // at braille's 2×4, because every cell then carries ink. Read from a
      // frame; the arithmetic is different and the picture is the same.
      name: "the dash period is a dot, so every cell carries ink",
      file: ANN,
      from: "const DASH_CELLS = 2;",
      to: "const DASH_CELLS = 1;",
      expect: "T1.30",
    },
    {
      // **The ASCII arm back through the raster fold**, which is F175's class:
      // `foldRamp` encodes height, an annotation has none, and a one-dot line
      // folded by ink weight came out as `# # # #` — heavier than the curve.
      name: "at ascii the line goes through the height fold again",
      file: ANN,
      from: '  if (caps.unicode === "ascii") {',
      to: "  if (false) {",
      expect: "T1.30",
    },
    {
      // **Clamped rather than dropped**, which is the one place an annotation
      // differs from a sample. A threshold outside the range then draws at the
      // ceiling, saying *the limit is here* about somewhere it is not — and the
      // frame is a perfectly ordinary annotated plot.
      name: "an edge off the scale is clamped, so it names a limit somewhere else",
      file: ANN,
      from: "  return range.max === range.min || (value >= range.min && value <= range.max);",
      to: "  return true;",
      expect: "T1.30",
    },
    {
      // **Drawn in front of the data.** Layers resolve first-non-blank, so
      // moving the annotations ahead of the series hides every sample they
      // cross — including the one a reader is comparing against the line.
      name: "annotations are layered in front, hiding the samples they cross",
      file: DEF,
      from: "  const layers: readonly Layer[] = [\n    ...block.series.map((s, index) => ({",
      to: "  const layers: readonly Layer[] = [\n    ...(block.annotations ?? []).map((a) => ({\n      glyphRows: annotationRows(a, range, layout.areaWidth, layout.areaRows, ctx.capabilities),\n      ref: `tone.${a.tone ?? \"muted\"}`,\n    })),\n    ...block.series.map((s, index) => ({",
      expect: "T1.30",
    },
    {
      // A band drawn as one line rather than two, which is the shape the
      // *statement* would still read as: one dashed row at the lower edge, and
      // a reader with no way to see where busy ends.
      name: "a band draws one edge, so the range has no top",
      file: ANN,
      // `edgesOf` grew arms for `confidence` and `whiskers`; the band arm it
      // was written against is now the first of four, and the mutation is the
      // same one — a band reporting a single edge.
      from: '  if (annotation.kind === "band") return [annotation.from, annotation.to];',
      to: '  return annotation.kind === "band" ? [annotation.from] : [annotation.value];',
      expect: "T1.30",
    },
    {
      // **The early return, restored.** Written as a guard at the top of the
      // `plot` check it reads as a cheap exit and is a deletion: every plot
      // carrying no annotation — almost all of them — skips the series
      // validation below it.
      name: "THE GUARD THAT DELETES: the annotation check returns early inside `plot`",
      file: VAL,
      from: "  plot: (b, e, at) => {\n    checkAnnotations(b[\"annotations\"], e, at);",
      to: "  plot: (b, e, at) => {\n    checkAnnotations(b[\"annotations\"], e, at);\n    if (b[\"annotations\"] === undefined) return;",
      expect: "T1.30",
    },
    {
      // A band whose edges are the wrong way round renders identically, so
      // nothing downstream can notice — which is exactly why the validator is
      // the thing that has to.
      name: "a reversed band is accepted, and it renders the same either way",
      file: VAL,
      // Re-anchored when `checkAnnotations` became a record keyed on the kind;
      // the clause is the same one, inside the `band` arm.
      from: "    if (isFiniteNumber(from) && isFiniteNumber(to) && from > to) {",
      to: "    if (false) {",
      expect: "T1.30",
    },
    {
      // **The fill in the curve's own alphabet**, which is the request's own
      // suggestion and the surviving half of C04 I52's refusal. Braille under
      // braille is one alphabet in one cell — the frame still renders a band.
      name: "the fill is drawn in braille, the curve's own alphabet",
      file: ANN,
      from: '  return "\\u2591";',
      to: '  return "\\u2591" && "\\u2812";',
      expect: "UB3",
    },
    {
      // The two arms with no vocabulary draw anyway: at `wide` a shaded row
      // occupies twice its declared cells, which is what `pairFor` already
      // records finding in a reviewed golden.
      name: "the shade is drawn on every arm, ambiguous width included",
      file: ANN,
      from: '  if (caps.ambiguousWidth === "wide") return null;',
      to: "  if (false) return null;",
      expect: "UB4",
    },
    {
      // **The edges back to filtering samples**, which is the defect the frame
      // read found: ink proportional to the sample count rather than the area,
      // two cells at eight samples across fifty columns.
      name: "the edge dashes where a sample lands rather than stepping the area",
      file: ANN,
      from: "  for (let dotCol = 0; dotCol < grid.dotWidth; dotCol += DASH_CELLS * BRAILLE_DOTS.x) { // cells-ok",
      to: "  for (let dotCol = 0; dotCol < grid.dotWidth; dotCol += BRAILLE_DOTS.x) { // cells-ok\n    if (dotCol % (DASH_CELLS * BRAILLE_DOTS.x * 3) !== 0) continue;",
      expect: "UB6",
    },
    {
      // The fill wins its own layer's cell, so a shade lands on the edge dash
      // it is supposed to sit behind — and the band loses the two statements
      // that are the whole of what it says.
      name: "the fill overwrites the edge inside the annotation's own layer",
      file: ANN,
      from: "      out += isBlank(e) && f !== \" \" ? f : e;",
      to: "      out += f !== \" \" ? f : e;",
      expect: "UB5b",
    },
    {
      // **The ternary, restored**: `confidence` and `whiskers` carry no
      // `value`, so both are refused at the boundary this check exists to be.
      name: "THE REFUSAL: confidence is checked for a `value` it does not have",
      file: VAL,
      from: '  confidence: (a, e, at) => {\n    // Both edges are **required**',
      to: '  confidence: (a, e, at) => {\n    requireEdge(a, "value", e, at);\n    // Both edges are **required**',
      expect: "UB8",
    },
    {
      // An unknown kind takes the `line` arm again, is checked for a `value`,
      // and then draws nothing — `edgesOf` reads `annotation.value` and `drawn`
      // filters it. Accepted, rendered blank, silent.
      name: "an unknown kind falls back to the `line` check and draws nothing",
      file: VAL,
      from: "    const check = ANNOTATION_CHECKS[a[\"kind\"] as Annotation[\"kind\"]] as AnnotationCheck | undefined;",
      to: "    const check = (ANNOTATION_CHECKS[a[\"kind\"] as Annotation[\"kind\"]] ?? ANNOTATION_CHECKS.line) as AnnotationCheck | undefined;",
      expect: "UB10",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
