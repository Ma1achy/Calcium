/**
 * Field forms — a grid of numbers read as iso-lines (C12 §3y, I49).
 *
 * **Marching squares is local, and that is the whole of why this exists.** The
 * survey refused `contour` as *edge routing, the Mermaid problem*, grouped with
 * `sankey`, `arc` and `chord`, all three of which genuinely are. A contour cell
 * needs its own four corners and nothing else — no routing, no layout engine,
 * nothing that has to see the whole figure. The correction is recorded in
 * `docs/notes/CALCIUM_PLOT_PRIOR_ART.md`.
 *
 * **There is no table here, and that is deliberate.** An edge is crossed exactly
 * when its two corners disagree, so the sixteen cases are a derivation onto the
 * mask `glyphForMask` has answered since `lineDrawRows` was written. All sixteen
 * were enumerated against it: every one lands on an entry that already exists,
 * zero new glyphs, eight distinct masks. A second copy is how the pie came to be
 * drawn in a vocabulary the line forms had left behind, and the `rounded`/`sharp`
 * fork and the ASCII arm come along for free because they are properties of the
 * table rather than of a curve.
 *
 * **Adjacent cells agree by construction.** A shared edge has the same two grid
 * corners on both sides, so the two masks cannot disagree and the strokes join
 * with nothing joining them — which is the reason to derive rather than tabulate,
 * and it is asserted rather than assumed (CN6).
 */
import type { Plot, Series, VectorSeries } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { Span } from "../blocks/paint.js";
import type { ColourRef, ColourValue, Style } from "../theme/types.js";
import type { Colormap } from "../theme/colormap.js";
import { ansi256Hex, nearestAnsi256 } from "../theme/colormap.js";
import { DEFAULT_FLOOR, luminance, ratio } from "../theme/contrast.js";
import { glyphForMask, LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "./linedraw.js";
import { BRAILLE_DOTS, createGrid, drawLine, foldBraille } from "./raster.js";
import type { Range } from "./scale.js";
import { niceAxis } from "./axes.js";

/**
 * The field, resampled onto the cells actually drawn.
 *
 * **Read through the column map rather than beside it**, which is `heatmap.ts`'s
 * own finding one form along: the glyph path and the colour path used to derive
 * the window separately, and a mutation that left-anchored one of them failed
 * nothing because every fixture had as many readings as cells. What this takes
 * is the *visible span* the map already decided — so the anchor is honoured and
 * is not re-derived.
 *
 * Sampling inside that span is **bilinear**, where the heatmap's is nearest.
 * That is not an inconsistency: a heatmap cell shows *a reading* and a contour
 * runs *between* readings, so a nearest-neighbour contour is a staircase of the
 * resampling rather than a line through the data.
 */
export type FieldSample = (fx: number, fy: number) => number | null;

/**
 * A bilinear reader over `series` — row `r`, column `c`, both continuous.
 *
 * A `null` anywhere in the four neighbours makes the sample `null` rather than
 * interpolating across it: a gap is a position that produced no reading (C04
 * I46a), and averaging its neighbours invents one.
 */
export function fieldSampler(series: readonly Series[]): FieldSample {
  const rows = series.length; // cells-ok — a row count
  const at = (r: number, c: number): number | null => {
    const row = series[r];
    if (row === undefined) return null;
    const v = row.values[c];
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  };
  return (fx, fy) => {
    if (rows === 0) return null;
    const cols = series[0]?.values.length ?? 0; // cells-ok — a column count
    if (cols === 0) return null;
    const cx = Math.min(cols - 1, Math.max(0, fx));
    const cy = Math.min(rows - 1, Math.max(0, fy));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = cx - x0;
    const ty = cy - y0;
    const a = at(y0, x0);
    const b = at(y0, x1);
    const c = at(y1, x0);
    const d = at(y1, x1);
    if (a === null || b === null || c === null || d === null) return null;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
}

/**
 * The four corners of one cell, above or below the level, as an **edge** mask.
 *
 * An edge is crossed exactly when its two corners disagree, which is the whole
 * derivation. `glyphForMask` takes it from here.
 *
 * A corner that is `null` — a gap — makes the cell uncrossable rather than
 * counting as below: a field with a hole in it has no contour across the hole,
 * and treating absence as *below the level* draws one along the hole's rim.
 */
export function marchingMask(
  tl: number | null,
  tr: number | null,
  br: number | null,
  bl: number | null,
  level: number,
): number {
  if (tl === null || tr === null || br === null || bl === null) return 0;
  const a = tl >= level;
  const b = tr >= level;
  const c = br >= level;
  const d = bl >= level;
  return (
    (a !== b ? LINE_UP : 0) |
    (b !== c ? LINE_RIGHT : 0) |
    (c !== d ? LINE_DOWN : 0) |
    (d !== a ? LINE_LEFT : 0)
  );
}

/** The mask a saddle produces — all four edges. Both resolutions give it. */
const SADDLE = LINE_UP | LINE_RIGHT | LINE_DOWN | LINE_LEFT;

/**
 * Which way a saddle connects, by the cell's centre value — matplotlib's rule.
 *
 * `true` joins **top→left and bottom→right**; `false` joins top→right and
 * bottom→left. The centre is the bilinear average of the four corners, so the
 * pairing follows the surface rather than a convention.
 *
 * **This has no observable consequence on the `"line"` arm** — both pairings are
 * mask 15 and render `┼` — which is why `"auto"` picks braille (§3y). Stated
 * here as well as in the spec, because a reader meeting this function on the
 * cell path will otherwise take the ruling to be doing something.
 */
export function saddleJoinsTopLeft(
  tl: number,
  tr: number,
  br: number,
  bl: number,
  level: number,
): boolean {
  const centre = (tl + tr + br + bl) / 4;
  return (centre >= level) === (tl >= level);
}

/** Where along an edge the level falls, as a fraction from the first corner. */
function crossing(a: number, b: number, level: number): number {
  const d = b - a;
  if (d === 0) return 0.5;
  const t = (level - a) / d;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The levels a contour draws, declared or derived. */
export function contourLevels(block: Plot, range: Range): readonly number[] {
  if (block.levels !== undefined) {
    return block.levels.filter((v) => Number.isFinite(v));
  }
  // **The gutter's own function**, so a contour's levels and the y ticks are the
  // same numbers rather than two nice-number runs that agree at most widths.
  // The interior ticks only: a level at the field's minimum crosses nothing and
  // a level at its maximum crosses nothing, so drawing them says *no contour*
  // where the caller asked for one.
  const axis = niceAxis(range, 6, block);
  return axis.ticks.filter((v) => v > range.min && v < range.max);
}

/**
 * The cell arm — one glyph per cell, from `glyphForMask` (I49).
 *
 * Levels **union their masks** in a cell, which is the only way `┤ ├ ┴ ┬` can be
 * emitted: a single level crosses either two edges or four. So `┼` reads as
 * *saddle* within one level and as *two levels crossing* across levels, and both
 * are true readings of the same mark.
 */
export function contourCellRows(
  sample: FieldSample,
  span: Readonly<{ from: number; to: number; rows: number }>,
  areaWidth: number,
  areaRows: number,
  levels: readonly number[],
  corners: "rounded" | "sharp",
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  if (w === 0 || h === 0) return Array.from({ length: h }, () => "");

  const corner = cornerReader(sample, span, w, h);
  const masks: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));

  for (const level of levels) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        masks[y]![x]! |= marchingMask(
          corner(x, y), corner(x + 1, y), corner(x + 1, y + 1), corner(x, y + 1), level,
        );
      }
    }
  }

  return masks.map((row) => row.map((m) => glyphForMask(m, corners, caps)).join(""));
}

/**
 * The braille arm — segments in the cell's own 2×4 dot block (I49).
 *
 * **This is the arm the saddle ruling has a subject on.** A saddle's two
 * segments are drawn separately here, so which corners they join is visible; on
 * the cell arm both pairings collapse to one glyph.
 *
 * The crossing point on each edge is interpolated, which is what makes a
 * terminal contour a line rather than a staircase — the same refinement
 * matplotlib applies, at the resolution braille affords.
 */
export function contourDotRows(
  sample: FieldSample,
  span: Readonly<{ from: number; to: number; rows: number }>,
  areaWidth: number,
  areaRows: number,
  levels: readonly number[],
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  if (w === 0 || h === 0) return Array.from({ length: h }, () => "");

  const grid = createGrid(w * BRAILLE_DOTS.x, h * BRAILLE_DOTS.y);
  const corner = cornerReader(sample, span, w, h);

  // Cell (x, y) owns dots [x·2, x·2+2) × [y·4, y·4+4). A crossing at fraction
  // `t` along an edge sits at that fraction across the cell's dots.
  const dx = BRAILLE_DOTS.x;
  const dy = BRAILLE_DOTS.y;

  for (const level of levels) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const tl = corner(x, y);
        const tr = corner(x + 1, y);
        const br = corner(x + 1, y + 1);
        const bl = corner(x, y + 1);
        const mask = marchingMask(tl, tr, br, bl, level);
        if (mask === 0) continue;
        if (tl === null || tr === null || br === null || bl === null) continue;

        const ox = x * dx;
        const oy = y * dy;
        const top: [number, number] = [ox + crossing(tl, tr, level) * (dx - 1), oy];
        const right: [number, number] = [ox + dx - 1, oy + crossing(tr, br, level) * (dy - 1)];
        const bottom: [number, number] = [ox + crossing(bl, br, level) * (dx - 1), oy + dy - 1];
        const left: [number, number] = [ox, oy + crossing(tl, bl, level) * (dy - 1)];

        if (mask === SADDLE) {
          // **The one place the centre value is read**, and the one arm where
          // the reading is visible.
          if (saddleJoinsTopLeft(tl, tr, br, bl, level)) {
            drawLine(grid, top[0], top[1], left[0], left[1]);
            drawLine(grid, bottom[0], bottom[1], right[0], right[1]);
          } else {
            drawLine(grid, top[0], top[1], right[0], right[1]);
            drawLine(grid, bottom[0], bottom[1], left[0], left[1]);
          }
          continue;
        }

        const ends: [number, number][] = [];
        if ((mask & LINE_UP) !== 0) ends.push(top);
        if ((mask & LINE_RIGHT) !== 0) ends.push(right);
        if ((mask & LINE_DOWN) !== 0) ends.push(bottom);
        if ((mask & LINE_LEFT) !== 0) ends.push(left);
        if (ends.length >= 2) drawLine(grid, ends[0]![0], ends[0]![1], ends[1]![0], ends[1]![1]); // cells-ok — a crossing count
      }
    }
  }

  return foldBraille(grid);
}

/**
 * A corner reader in **cell-corner** space: `(w + 1) × (h + 1)` positions across
 * the visible span the column map chose.
 *
 * The last corner sits at the far edge of the last cell, which is why the
 * divisor is `w` and not `w - 1`: a cell's right corner is its neighbour's left
 * one, so there is one more corner than there are cells.
 */
function cornerReader(
  sample: FieldSample,
  span: Readonly<{ from: number; to: number; rows: number }>,
  w: number,
  h: number,
): (i: number, j: number) => number | null {
  const cols = Math.max(0, span.to - span.from);
  const rows = Math.max(0, span.rows - 1);
  return (i, j) => sample(span.from + (i / w) * cols, (j / h) * rows);
}

// --- composition (§6d.2) ----------------------------------------------------

/**
 * One glyph layer and the colour it carries. §3u's `Layer`, for this family.
 *
 * **`cellColour` is the quiver's, and the layer model had no room for it.** A
 * contour's colour is the layer's — every stroke of one level is one thing — so
 * a single `ref` was the obvious shape and it is wrong for the other form:
 * I50 makes magnitude *the* second channel and a quiver drawn in one slot has
 * only direction. Found by reading the frame, where every arrow wore the same
 * orange whatever it was doing.
 */
export type FieldLayer = Readonly<{
  glyphRows: readonly string[];
  ref: ColourRef;
  cellColour?: (row: number, x: number) => ColourValue | undefined;
  /**
   * Whether this layer is drawn in the **density ramp's own alphabet** (I51).
   *
   * Below `colourDepth: 8` the field has no background and falls back to the
   * ramp — braille at unicode, `.:-=+*#@` at ASCII. A contour is braille at
   * unicode and punctuation at ASCII, so at every capability below the floor the
   * two are the *same alphabet* and a reader cannot tell field from contour
   * anywhere. An arrow is a distinct mark at both and does not collide.
   *
   * §6d.1 row 10's ruling was *the ramp yields and the contour draws*, which
   * resolves the **cell** contention the table found and does nothing about the
   * vocabulary. The frame is what said so: the 1-bit contour came out as mush
   * and the same fixture with `layers: ["contour"]` came out perfectly legible.
   * **The artefact was right about the interaction and wrong about the remedy**,
   * because it assumed the two glyphs were distinguishable.
   */
  ramplike?: boolean;
}>;

/** Braille is `U+2800 + bits`, which is what makes the union below an OR. */
const BRAILLE_BASE = 0x2800;
const BRAILLE_TOP = 0x28ff;

function brailleBits(ch: string): number | null {
  const c = ch.codePointAt(0);
  if (c === undefined || c < BRAILLE_BASE || c > BRAILLE_TOP) return null;
  return c - BRAILLE_BASE;
}

function isBlank(ch: string): boolean {
  // `\u2800` rather than the character itself: SS47 forbids a mark in a `src/`
  // string literal, and `definition.ts` already spells the braille blank this way.
  return ch === "" || ch === " " || ch === "\u2800";
}

/**
 * Pass 5 — the layers of one row to a glyph and its owner (§6d.2, I51, I44).
 *
 * **`layers` is a draw order and this is a priority order**, so the caller
 * reverses before arriving. That reversal is the seam I51 names, and it is here
 * rather than at the public field so there is exactly one of it: handing this an
 * unreversed array draws the contour over the arrows and fails LY1.
 *
 * Both a contour and a quiver are `kind: "curve"`, so §3u applies unchanged —
 * union where every candidate is braille, first-wins where any is not. A braille
 * contour and an arrow cannot share a cell, and one of them has to lose.
 */
export function mergeFieldLayers(
  layers: readonly FieldLayer[],
  row: number,
  width: number,
): { glyphs: string; owners: readonly (number | null)[] } {
  let glyphs = "";
  const owners: (number | null)[] = [];

  for (let x = 0; x < width; x += 1) {
    let cell = " ";
    let owner: number | null = null;
    let bits = 0;
    let allBraille = true;

    for (let i = 0; i < layers.length; i += 1) { // cells-ok — a layer count
      const candidate = [...(layers[i]!.glyphRows[row] ?? "")][x] ?? " ";
      if (isBlank(candidate)) continue;
      const dots = brailleBits(candidate);
      if (owner === null) {
        cell = candidate;
        owner = i;
      }
      if (dots === null) allBraille = false;
      else bits |= dots;
    }

    glyphs += owner !== null && allBraille && bits !== 0
      ? String.fromCodePoint(BRAILLE_BASE + bits)
      : cell;
    owners.push(owner);
  }

  return { glyphs, owners };
}

/**
 * The factor `fieldDim: "floor"` dims a map by — **computed, never tabulated**.
 *
 * The spec's figures (viridis and coolwarm at 50%, inferno at 40%) are what this
 * *produces*, not what it reads: a constant that happens to clear three shipped
 * maps is a constant that fails the fourth, and a table of factors per map is a
 * table that rots the day a map is added. So the search is over the map's own
 * samples against **white**, which is the brightest foreground there is and
 * therefore the necessary condition — a darker ink may still fail, and
 * `glyphInk: "contrast"` is the answer for that rather than this.
 *
 * Memoised per map, because the samples do not change and the search is 256
 * ratios per step.
 */
const DIM_FACTORS = new Map<string, number>();
const WHITE = "#ffffff";

export function dimFactorFor(map: Colormap, indexed = false): number {
  const key = indexed ? `${map.name}@256` : map.name;
  const known = DIM_FACTORS.get(key);
  if (known !== undefined) return known;
  let factor = 1;
  for (let k = 20; k >= 1; k -= 1) { // cells-ok — a search step count
    const f = k / 20;
    const ok = map.data.every((c) => {
      const hex = `#${[c[0], c[1], c[2]].map((v) => Math.round(v * f).toString(16).padStart(2, "0")).join("")}`;
      // **What the terminal shows is what has to clear** (C12 §3y). At 8-bit
      // the dimmed colour is quantised to the nearest cube index afterwards,
      // and the cube's levels are far enough apart that quantising can carry a
      // sample back *over* the floor: scaling viridis by the 24-bit factor
      // leaves one of twenty-one at 3.71 against a floor of 4.5. Searching
      // against the continuous colour answers a question about a colour the
      // reader never sees.
      const shown = indexed ? ansi256Hex(nearestAnsi256(hex)) ?? hex : hex;
      return ratio(WHITE, shown) >= DEFAULT_FLOOR;
    });
    if (ok) { factor = f; break; }
  }
  DIM_FACTORS.set(key, factor);
  return factor;
}

/** A colour dimmed by a factor, in whatever encoding it arrived in. */
export function dimColour(colour: ColourValue, factor: number): ColourValue {
  if (factor >= 1) return colour;
  const scale = (hex: string): string => {
    const n = (i: number): number => Math.round(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * factor);
    return `#${[0, 1, 2].map((i) => n(i).toString(16).padStart(2, "0")).join("")}`;
  };
  if (colour.kind === "rgb") return { kind: "rgb", hex: scale(colour.hex) };
  // **The 8-bit arm, which returned its argument** (C12 §3y). `continuousColour`
  // gives `ansi256` below 24-bit, so `fieldDim: "floor"` was applied, ignored
  // and silent on every terminal between the colour floor and true colour —
  // while the member's own doc said it was inert only *below* the floor.
  if (colour.kind === "ansi256") {
    const hex = ansi256Hex(colour.index);
    // 0\u201315 are the terminal's own palette and have no value we can read, so
    // there is nothing to scale: returning the argument is the honest answer
    // here and was the wrong one above.
    return hex === null ? colour : { kind: "ansi256", index: nearestAnsi256(scale(hex)) };
  }
  return colour;
}

/** Black or white, whichever clears the floor against this background (I51). */
export function contrastInk(background: ColourValue | undefined): ColourValue {
  if (background === undefined || background.kind !== "rgb") return { kind: "rgb", hex: WHITE };
  return luminance(background.hex) > 0.1833
    ? { kind: "rgb", hex: "#000000" }
    : { kind: "rgb", hex: WHITE };
}

/**
 * Pass 6 — glyphs onto the field's spans (§6d.2, I51).
 *
 * **The only pass that reads two passes and writes over one**, which is why it
 * runs here and not inside the rasterisers. Computed inside them, a cell whose
 * glyph *lost* the merge would have been recoloured for a background that a
 * different glyph now sits on — the shape every defect in §3u had.
 *
 * A glyph over a colormap value is C10 I21's widening used from the other side:
 * `wash` builds its blanks so a colormap colour cannot reach a glyph by
 * accident, and this is the one place it is meant to. The pairing is built here,
 * together, for the same reason `wash` returns a span rather than a style.
 */
export function overlayGlyphs(
  field: readonly Span[],
  glyphs: string,
  owners: readonly (number | null)[],
  inkFor: (owner: number, row: number, x: number) => Style,
  glyphInk: "own" | "contrast",
  row = 0,
): readonly Span[] {
  const chars = [...glyphs];
  const out: Span[] = [];
  let x = 0; // cells-ok — a column index

  for (const span of field) {
    const background = span.style?.background;
    let run = "";
    let runStyle: Style | undefined = span.style;
    const flush = (): void => {
      if (run === "") return;
      out.push(runStyle === undefined ? { text: run } : { text: run, style: runStyle });
      run = "";
    };
    for (const ch of span.text) {
      const glyph = chars[x] ?? " "; // cells-ok — a column index
      const owner = owners[x] ?? null; // cells-ok — a column index
      const next: Style | undefined = isBlank(glyph) || owner === null
        ? span.style
        : glyphInk === "contrast"
          ? { ...(background === undefined ? {} : { background }), colour: contrastInk(background) }
          : { ...inkFor(owner, row, x), ...(background === undefined ? {} : { background }) };
      if (next !== runStyle) {
        flush();
        runStyle = next;
      }
      run += isBlank(glyph) || owner === null ? ch : glyph;
      x += 1; // cells-ok — a column index
    }
    flush();
  }
  return out;
}

/**
 * What a field form draws, in draw order (I51).
 *
 * The default is the form's own — a contour over a painted field, which is the
 * classic presentation and the one the request asked for. `["contour"]` asks for
 * lines on an unpainted area, and that is what membership is for.
 */
export function layersOf(block: Pick<Plot, "form" | "layers">): readonly ("field" | "contour" | "quiver")[] {
  if (block.layers !== undefined) return block.layers;
  if (block.form === "contour") return ["field", "contour"];
  return block.form === "quiver" ? ["field", "quiver"] : ["field"];
}

/** Whether the field itself is painted — membership, never position. */
export function paintsField(block: Pick<Plot, "form" | "layers">): boolean {
  return layersOf(block).includes("field");
}

/** The depth at or above which the field is a background rather than a ramp. */
const FIELD_COLOUR_FLOOR = 8;

/**
 * Whether the field paints, **given what is drawn over it** (I51).
 *
 * Below the floor the field is a ramp *glyph*, and a layer drawn in the ramp's
 * own alphabet makes the two indistinguishable — so the field yields rather than
 * the ramp. It is the redundant one: a contour encodes the same scalar and names
 * its levels in the legend, where the ramp below the floor names nothing a
 * reader can map back to a number.
 */
export function fieldPaintsUnder(
  block: Pick<Plot, "form" | "layers">,
  layers: readonly FieldLayer[],
  caps: Pick<TerminalCapabilities, "colourDepth">,
): boolean {
  if (!paintsField(block)) return false;
  if (caps.colourDepth >= FIELD_COLOUR_FLOOR) return true;
  return !layers.some((l) => l.ramplike === true);
}

/**
 * The glyph layers, **reversed into priority order** for `mergeFieldLayers`.
 *
 * `field` is dropped rather than ordered: it has no glyph, so it cannot occlude
 * one and its index decides nothing. This is where I51's *membership is
 * load-bearing, position is not* becomes true rather than merely stated.
 */
export function glyphLayerOrder(block: Pick<Plot, "form" | "layers">): readonly ("contour" | "quiver")[] {
  const drawn = layersOf(block).filter((l): l is "contour" | "quiver" => l !== "field");
  return [...drawn].reverse();
}

// --- the quiver (I50) -------------------------------------------------------

/**
 * Eight directions, **E first and anticlockwise**, so the index is
 * `round(atan2(v, u) ÷ 45°)` with no table between the angle and the glyph.
 *
 * East, north-east, north, north-west, west, south-west, south, south-east —
 * as escapes because SS47 forbids a mark in a `src/` string literal, and
 * `ramp.ts` spells its ladders the same way. **The comment said this before the
 * code did**, which is the class the scan exists to catch: a literal that reads
 * as compliant because the sentence beside it is.
 */
const ARROWS_UNICODE = "\u2192\u2197\u2191\u2196\u2190\u2199\u2193\u2198";

/**
 * The ASCII arm — `> / ^ \ < / v \`, **and the diagonals reuse**.
 *
 * A terminal has no glyph that reads as *north-east* in ASCII; `/` reads as a
 * slope and carries both diagonals on its own line. That is a real loss of
 * resolution and it is the honest one: inventing `7` or `'` for north-east
 * would keep eight distinct marks and none of them would be read as a direction.
 */
const ARROWS_ASCII = ">/^\\</v\\";

/**
 * Which arm, and **the second conjunct is the one that is easy to drop** (I50).
 *
 * Every arrow in U+2190–21FF is `East_Asian_Width=Ambiguous`, so a terminal
 * declaring `ambiguousWidth: "wide"` draws the field at double width — and a
 * quiver whose cells double is not a quiver. That is the sentence `art.ts`
 * makes about a wordmark and `mermaid.ts` makes about box drawing; **this is
 * the switch's third consumer**, and unlike a frame it leaves no visible seam:
 * the arrows are simply twice as wide as the grid they describe.
 */
export function arrowsFor(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): readonly string[] {
  return [...(caps.unicode === "ascii" || caps.ambiguousWidth === "wide" ? ARROWS_ASCII : ARROWS_UNICODE)];
}

/**
 * The arrow for a vector, or `null` where there is no flow.
 *
 * **A zero-magnitude cell draws nothing** (I50). Not an arrow of arbitrary
 * direction: a cell with no flow has no direction, and `atan2(0, 0)` is `0`, so
 * the natural implementation draws a field of still cells as a field of eastward
 * flow — with every magnitude assertion still passing.
 *
 * `v` is **north-positive**, the data convention, and the row axis runs the
 * other way; the flip is here so no caller has to know it.
 */
export function arrowFor(
  u: number,
  v: number,
  arrows: readonly string[],
): string | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  if (u === 0 && v === 0) return null;
  const eighth = Math.round(Math.atan2(v, u) / (Math.PI / 4));
  return arrows[((eighth % 8) + 8) % 8] ?? null; // cells-ok — a direction count
}

/** The magnitude of each vector, as a `Series` per row. */
export function magnitudeSeries(vectors: readonly VectorSeries[]): readonly Series[] {
  return vectors.map((row) => ({
    values: row.values.map((p) => (p === null ? null : Math.hypot(p[0], p[1]))),
    ...(row.label === undefined ? {} : { label: row.label }),
  }));
}

/**
 * The arrows, one glyph per cell, resampled onto the area (I50).
 *
 * **Nearest rather than bilinear**, which is the opposite of the contour's
 * choice and for the reason that settles it: a contour runs *between* readings
 * and an arrow *is* one. Interpolating two vectors that point opposite ways
 * gives a short vector pointing nowhere — a still cell where the field is at its
 * most active.
 */
export function quiverRows(
  vectors: readonly VectorSeries[],
  areaWidth: number,
  areaRows: number,
  arrows: readonly string[],
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const cols = vectors[0]?.values.length ?? 0; // cells-ok — a column count
  const out: string[] = [];
  for (let y = 0; y < h; y += 1) {
    let row = "";
    const src = vectors[Math.min(vectors.length - 1, Math.floor((y / Math.max(1, h)) * vectors.length))]; // cells-ok
    for (let x = 0; x < w; x += 1) {
      const p = src?.values[Math.min(cols - 1, Math.floor((x / Math.max(1, w)) * cols))]; // cells-ok
      row += p === null || p === undefined ? " " : (arrowFor(p[0], p[1], arrows) ?? " ");
    }
    out.push(row);
  }
  return out;
}

/**
 * The magnitude at a rendered cell, resampled exactly as `quiverRows` does.
 *
 * **One resampling read twice, not two derivations** — `heatmap.ts`'s own
 * finding, where the glyph path and the colour path derived the window
 * separately and a mutation that left-anchored one failed nothing. An arrow's
 * colour and an arrow's direction must come from the same vector or the frame
 * says a cell is fast while pointing where its neighbour points.
 */
export function magnitudeAt(
  vectors: readonly VectorSeries[],
  areaWidth: number,
  areaRows: number,
): (row: number, x: number) => number | null {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));
  const cols = vectors[0]?.values.length ?? 0; // cells-ok — a column count
  return (row, x) => {
    const src = vectors[Math.min(vectors.length - 1, Math.floor((row / h) * vectors.length))]; // cells-ok
    const p = src?.values[Math.min(cols - 1, Math.floor((x / w) * cols))]; // cells-ok — a column index
    if (p === null || p === undefined) return null;
    const m = Math.hypot(p[0], p[1]);
    return m === 0 ? null : m;
  };
}
