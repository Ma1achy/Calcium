/**
 * U1–U6 — **the seam asserted from both sides, and walk artefact B** (C12
 * §3ak.15–§3ak.17, C12 I59–I66; step 5 of the arm unification pass).
 *
 * Artefact A is the disagreement matrix and it is a **table**: every cell is
 * `(form, decision)`, two rules holding at rest with no event between them.
 * This file is the **trace**, and the events are capability transitions. Both
 * were owed; taking the table alone because the type is the obvious thing is the
 * mistake C19 §8a records.
 *
 * ## Three of these rows had nothing to be wrong about, and it was not one class
 *
 * U1 was re-founded in step 2 for A03 §2's vacuity class — *the same block
 * yields an identical `Drawn[]` for both arms* is `f(x) === f(x)` once one
 * emitter serves both. Asking the same question of the rest found two more, and
 * they fail for a **different reason**: not a tautology but a **missing
 * parameter**. `plotToSvg` takes no capabilities, and neither do the emitters, so
 * *identical at every capability set* has nothing to vary.
 *
 * The two kinds read identically from a green suite and want opposite repairs —
 * a different claim, or a different instrument. So `U5` and `U6a` are
 * **structural** guards, asserted on the signature and labelled as such, and
 * nobody reads their green as a measurement (F288).
 *
 * ## What could not be used to measure a ladder
 *
 * `terminalDecisions` reads decisions out of a frame and states its blind spots,
 * and every one of them is about what a *label* means. The ladder breaks it
 * elsewhere: its character classes are **24-bit** classes. `+` is the ASCII
 * corner and the ASCII tick junction; a braille curve falling to `-` reads as
 * interior rules. Measured, it reports `interiorRules` moving across the rungs
 * for 45 of 111 variants, and the movement is its own alphabet (F285). So `U6`
 * classifies **raw frames** and parses none.
 */
import { describe, expect, it } from "vitest";

import { block, type Plot, type PlotForm } from "../../src/data/viewmodel/index.js";
import { plotToSvg, SVG_FAMILY, svgFamilyOf, SVG_DEFAULT_LAYOUT } from "../../src/presentation/plot/svg.js";
import { drawnBlock } from "../../src/presentation/plot/derive.js";
import {
  barFigure, curveFigure, densityFigure, distributionFigure, fieldFigure, horizonFigure, matrixFigure,
  proportionFigure, scatterFigure, stackedFigure, tilesFigure, spanFigure, funnelFigure,
  trackFigure, bulletFigure,
  type Figure,
  type Mark,
} from "../../src/presentation/plot/figure.js";
import { estimateRole } from "../../src/presentation/plot/figure.js";
import { RAMP_DEFAULT, rampOf } from "../../src/presentation/plot/figure.js";
import { COLORMAPS, continuousColour } from "../../src/presentation/theme/colormap.js";
import type { ColormapName } from "../../src/data/viewmodel/index.js";
import { roleGlyphs } from "../../src/presentation/plot/roles.js";
import { ROW_IS_AN_IDENTITY } from "../../src/presentation/plot/marks.js";
import { facetWidths } from "../../src/presentation/plot/facet.js";
import { forestRow } from "../../src/presentation/plot/glyph-row.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { cells, truncate, type AmbiguousWidth } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const capsNamed = (n: string): Record<string, unknown> => caps.find((c) => c.name === n)!.caps;
const WIDTH = 60;

type TCaps = TerminalCapabilities;

type Spec = Record<string, unknown>;

/** A catalogue spec, with `cursor` stripped — it is context, not a block field (§3s). */
function specOf(raw: Spec): Spec {
  const { cursor, ...rest } = raw as { cursor?: unknown };
  void cursor;
  return rest;
}

const blockOf = (spec: Spec): Plot => block({ kind: "plot", id: "u", ...spec } as never) as Plot;
const svgOf = (spec: Spec): string => plotToSvg(blockOf(spec), DARK_THEME) ?? "";
const termOf = (spec: Spec, set: Record<string, unknown>): string =>
  frame(spec, set, WIDTH, "u").join("\n");

/**
 * The emitters, by family — and the key is **`spec.form`**, never the catalogue
 * bucket it is filed under.
 *
 * One variant's bucket lies: `line/whiskers` carries `form: "scatter"`. Harmless
 * to the catalogue, which renders what the spec says; not harmless to a sweep
 * choosing which emitter to call. Keyed off the bucket, this file's first draft
 * compared `curveFigure`'s single polyline against a document of twelve circles
 * and reported a dropped mark — one in eighty-six, clean, specific and entirely
 * fabricated. Real bytes reassembled by a wrong model, which is the third shape
 * of manufactured evidence and the one that survives a careful read of both
 * sides, because everything in it is genuine except the join (F290).
 */
const EMITTER = {
  curve: curveFigure, scatter: scatterFigure, bar: barFigure,
  matrix: matrixFigure, distribution: distributionFigure, tiles: tilesFigure,
  proportion: proportionFigure, field: fieldFigure, horizon: horizonFigure,
  stacked: (b: Plot) => stackedFigure(b, b.form === "streamgraph"), span: spanFigure, funnel: funnelFigure,
  track: trackFigure, bullet: bulletFigure,
  // **`density` is the fourteenth, and its absence was a `TypeError` rather
  // than a skip** (F383). `EMITTER` is how these rows reach a figure without a
  // renderer, and four of them index it by the family `svgFamilyOf` returns —
  // so the day a new family was claimed, they called `undefined`. A table keyed
  // by hand beside one derived from the source: the pair only agrees while
  // somebody keeps it agreeing, which is what U-2 below now asserts.
  density: (b: Plot) => densityFigure(b, b.form === "ridgeline"),
} as const;
type WalkedFamily = keyof typeof EMITTER;

/** Every catalogue variant, resolved to the family its own `form` field names. */
function* corpus(): Generator<Readonly<{ bucket: string; variant: string; spec: Spec; family: string | null }>> {
  for (const [bucket, variants] of Object.entries(CATALOGUE_FORMS)) {
    for (const [variant, raw] of Object.entries(variants as Record<string, Spec>)) {
      const spec = specOf(raw);
      yield { bucket, variant, spec, family: svgFamilyOf(spec["form"] as PlotForm) };
    }
  }
}

/**
 * **A frame that draws colour at all**, without naming an escape byte.
 *
 * `stripSgr` is the catalogue's own reader, so this asks the question through
 * the same implementation the rest of the file compares with — a second regex
 * here would be a second thing to keep in step, and it is what the matrix's own
 * `EDGE` class already warns about one instrument along.
 */
const coloured = (lines: readonly string[]): boolean => lines.some((l) => strip(l) !== l);

describe("U — the seam, asserted from both arms", () => {
  /**
   * **U1a — a decision changed inside `figureOf` moves BOTH arms, per member.**
   *
   * The fixture per member is chosen to **construct that member's state**, which
   * is not a formality: a hand-rolled three-category bar chart draws no gutter at
   * width 60, so `identity` and `frame` both read as *nothing moved* against a
   * figure that had neither. The convenient input shape is the degenerate one,
   * and three of seven cells were wrong before the fixtures came from the
   * catalogue.
   *
   * **The row's blind spot, because an unrecorded limit reads as strength.** A
   * block perturbation moving an arm does not prove the arm read the *figure
   * member* — it may read the block field. `definition.ts` applies
   * `block.plotFrame` to its layout directly, so the terminal's `frame: "moves"`
   * is exactly that. **The negative direction is sound**: an arm that did not
   * move read neither. So the `still` cells are this row's findings and the
   * `moves` cells are `c12-arm-seam.mjs`'s subject (F287).
   */
  const PERTURBATION = {
    value: { form: "bar", patch: { yMax: 400 } },
    extent: { form: "line", variant: "legend-right", patch: { yMin: -50 }, at: "1bit" },
    identity: { form: "bar", patch: "categories" },
    orientation: { form: "bar", patch: { orientation: "horizontal" } },
    facing: { form: "line", patch: { origin: "top-left" } },
    // **`grid` moves a curve and not a bar**, measured: the categorical family
    // draws no interior rules at any frame style. That is the scope of D6's
    // repair as well — gridlines are the positional family's.
    frame: { form: "line", patch: { plotFrame: "grid" } },
    gutter: { form: "bar", patch: { axes: false } },
    // **No block field isolates this member and the record says so.** It is a
    // conjunction — `xLabels !== undefined || (axes && HAS_POSITION_AXIS[form])`
    // — so `xLabels` on a curve moves the axis's *content* while the boolean
    // stays true, and on a bar it moves nothing at all. `axes: false` flips it,
    // and flips `frame` and `gutter` with it. The cell is therefore about a
    // perturbation that moves three members, which is weaker than its
    // neighbours and is worth stating rather than dressing up.
    positionAxis: { form: "line", patch: { axes: false } },
    valueLabels: { form: "bar", patch: { yAxis: false } },
    legend: { form: "line", variant: "legend-right", patch: "labels" },
    marks: { form: "bar", patch: "values" },
    // **A matrix form, because it is the only family whose marks carry a
    // `value` to spend on a ramp** (C12 I72, §3ak.30). A curve has no ramp at all —
    // `RAMP_DEFAULT` is `null` for it — so a perturbation there moves a member
    // that was `null` to a member that is `null`, which is a cell that agrees
    // with everything.
    ramp: { form: "heatmap", patch: { colormap: "inferno" } },
    // **`null` because no block field can move this one, and that is a third
    // kind of cell rather than an omission** (§3ak.26 finding 1).
    //
    // `isotropic` is a **form constant**: `true` for the three proportion forms
    // and `false` for every other, with nothing in `Plot` behind it. So there is
    // no perturbation to measure it through, and the perturbation that *would*
    // move it — changing the form — moves every member at once and isolates
    // none. Counted below rather than excluded: an exemption dropped from a
    // corpus is a corpus that shrank without saying so.
    isotropic: null,
    // **A probe for `position` and it is `null`** (F356, C12 §3ak.44). The
    // member carries `xMin`, `xMax`, `xScale` and `xFormat`, and no catalogue
    // variant patches one — `x-linear` and `x-log` are a *pair*, which is what
    // the collision sweep needs and not what this table does. Counted rather
    // than excluded, per the row above.
    position: null,
    // **`yCallout` is a probe** and its three corpus variants are already a
    // collision group in AD13 — three blocks, one document (F349, F367).
    callout: { form: "line", variant: "callout-last", patch: { yCallout: "name" } },
    // **The last two of F355's eleven**, each with a corpus pair added for it
    // (F370): `x-title` against `x-captions`, `axis-cross` against
    // `straddle-zero`.
    title: { form: "line", variant: "x-captions", patch: { xTitle: "training step" } },
    cross: { form: "line", variant: "straddle-zero", patch: { axisCross: "zero" } },
  } as const satisfies Readonly<Record<keyof Figure, unknown>>;

  /**
   * **The record, measured — five of eight move both arms.**
   *
   * The three that do not are exactly D10, D9 and D13 from the first
   * measurement: the identity axis, the frame and the legend, which is the
   * whole of what the second arm has not been given. So the type is ahead of the
   * arm by precisely the amount the disagreement list says is outstanding — they
   * are **owed** rather than dead, and that is a sentence someone has to write,
   * because MG24 cannot: it counts a member consumed when its *name* is read
   * anywhere in `src/`, and `furniture.ts` reads `layout.frame` four times by
   * itself (F286).
   */
  const CONSUMERS = {
    value: { terminal: "moves", svg: "moves" },
    extent: { terminal: "moves", svg: "moves" },
    orientation: { terminal: "moves", svg: "moves" },
    facing: { terminal: "moves", svg: "moves" },
    marks: { terminal: "moves", svg: "moves" },
    frame: { terminal: "moves", svg: "moves" },
    valueLabels: { terminal: "moves", svg: "moves" },
    // **These two say `moves` and the second arm reads neither.** Their only
    // perturbation is `axes: false`, which sets `frame: "none"` in the same
    // breath — so the SVG moves because it read `frame`, and this cell cannot
    // tell that from reading `gutter`. `figure.gutter` and `figure.positionAxis`
    // have no reader in `svg.ts`; `positionAxis` gates the `xLabels` row and
    // `gutter` gates nothing yet.
    //
    // **Recorded rather than dressed up.** The negative direction is the sound
    // one — an arm that did not move read neither the member nor the block field
    // — and a positive under a perturbation that moves three members is the
    // weakest cell in this record. It says so here so nobody reads it as
    // coverage.
    gutter: { terminal: "moves", svg: "moves" },
    positionAxis: { terminal: "moves", svg: "moves" },
    // **F286's three are all read now**, and the last two were D10 and D13 —
    // the identity axis and the legend. What crossed is the strings and the
    // *side*; the gutter's width did not, and §3ak.20 is the ruling: the
    // terminal sizes it to `cells(widest)` and this arm to a tenth of the width,
    // which is C12 I63's *the threshold is shared and the outcome is each arm's*.
    identity: { terminal: "moves", svg: "moves" },
    legend: { terminal: "moves", svg: "moves" },
    // **Not measurable through a perturbation, and its reader is named
    // instead.** `projected` insets a centred square when this is true, which
    // is the whole of what the member buys; the terminal reaches the same answer
    // through `radiusFor`'s `min`, in dots, and has nothing to read. So this
    // cell records *who reads it*, not *what moved* — and it is the only cell
    // in the record that cannot be measured the way its neighbours are.
    isotropic: { terminal: "radiusFor", svg: "boxFor" },
    // **Both arms, and the day it was added neither had read it.** The terminal
    // took the table from `heatmap.ts` and this arm took the literal
    // `"viridis"`, so a correlation matrix was diverging in one and sequential
    // in the other while every gate compared clean (F324).
    ramp: { terminal: "moves", svg: "moves" },
    // **Both arms, and the second one only since §3ak.44** (F356). `xScale`,
    // `xFormat` and the two bounds reached the terminal's `xTickRow` and nothing
    // here, so this row would have read `svg: "does not move"` — which is what
    // it means for a member to have no reader.
    position: { terminal: "moves", svg: "moves" },
    // **Both arms since §3ak.47** (F368). The terminal wrote `█ beta` on the row
    // a series ends at and this arm drew a legend — the same legend for all
    // three callout variants, which is what a member with no reader looks like.
    callout: { terminal: "moves", svg: "moves" },
    // **Both arms since §3ak.48** (F369, F370), and they are the last two: the
    // reader map said `svg=0` for eleven members and it was measuring which
    // names the file writes, not which values reach it.
    title: { terminal: "moves", svg: "moves" },
    cross: { terminal: "moves", svg: "moves" },
  } as const satisfies Readonly<Record<keyof Figure, { terminal: string; svg: string }>>;

  function patched(base: Spec, how: unknown): Spec {
    if (how === "categories") {
      return { ...base, categories: (base["categories"] as string[]).map((c) => `${c}Z`) };
    }
    const series = base["series"] as { label?: string; values: number[] }[];
    if (how === "labels") return { ...base, series: series.map((s, i) => ({ ...s, label: `R${String(i)}` })) };
    if (how === "values") return { ...base, series: series.map((s) => ({ ...s, values: s.values.map((v) => v * 2) })) };
    return { ...base, ...(how as Spec) };
  }

  function fixtureFor(p: { form: string; variant?: string }): Spec {
    const bucket = CATALOGUE_FORMS[p.form as keyof typeof CATALOGUE_FORMS] as Record<string, Spec>;
    const raw = p.variant === undefined ? Object.values(bucket)[0]! : bucket[p.variant]!;
    return specOf(raw);
  }

  it("U1a (C12 I59, §3ak.16): every Figure member's consumers, measured through output", () => {
    const measured: Record<string, { terminal: string; svg: string }> = {};
    let unperturbable = 0;
    for (const [member, p] of Object.entries(PERTURBATION)) {
      // **A member with no isolating block field is counted, not skipped.**
      // Its `CONSUMERS` cell names the reader in each arm instead, which is a
      // weaker claim than the rest of the record and says so.
      if (p === null) {
        unperturbable += 1; // cells-ok — a member count
        measured[member] = CONSUMERS[member as keyof typeof CONSUMERS];
        continue;
      }
      const spec = fixtureFor(p as { form: string; variant?: string });
      const set = capsNamed("at" in p ? (p.at as string) : "24bit");
      const other = patched(spec, p.patch);

      // **A fixture must be shown to respond to the thing under test.** If the
      // patch does not move the figure, every cell below is a claim about a
      // member the perturbation never touched — which is how `orientation` first
      // read `still` on a fixture already declaring `orientation: "vertical"`.
      const fam = svgFamilyOf(spec["form"] as PlotForm) as WalkedFamily;
      const before = EMITTER[fam](blockOf(spec));
      const after = EMITTER[fam](blockOf(other));
      expect(JSON.stringify(before), `${member}: the perturbation must move the figure`)
        .not.toBe(JSON.stringify(after));

      measured[member] = {
        terminal: termOf(spec, set) === termOf(other, set) ? "still" : "moves",
        svg: svgOf(spec) === svgOf(other) ? "still" : "moves",
      };
    }
    expect(unperturbable, "members no block field can isolate — see `isotropic` and `position`").toBe(2); // cells-ok — a member count
    expect(measured).toEqual(CONSUMERS);
  });

  it("U1a2 (C12 I59, §3ak.16): the three members that were unread, now counted as drawn", () => {
    // **This row asserted zero and now asserts the corpus.** It was written to
    // count what the second arm did *not* draw — no legend label in 92 drawn
    // documents, no identity string in 83 — and both are D10 and D13, which have
    // closed. **Kept and inverted rather than deleted**: a row that stops being
    // able to fail is worth less than one that fails when a member goes quiet
    // again, and the counts are what would say so.
    //
    // **Measured rather than argued**, and each count is the row's own size. A
    // green sweep says nothing about how much it swept.
    let drawn = 0;
    let gutterFamilies = 0;
    let legendDrawn = 0;
    let identityDrawn = 0;
    for (const { spec, family } of corpus()) {
      // **And `facets`, which has no emitter because it has no figure**
      // (§3ak.36). A composition recurses into `plotToSvg`, so what these rows
      // are about — the members a figure carries and whether an arm reads them —
      // is asked of its **children**, which the corpus already covers as `line`
      // and `scatter`. Skipped for the same reason `nodes` is, and the counters
      // below are what say how much was swept.
      if (family === null || family === "nodes" || family === "facets") continue;
      const b = blockOf(spec);
      const svg = plotToSvg(b, DARK_THEME);
      if (svg === null) continue;
      drawn += 1;
      const texts = new Set([...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/gu)].map((m) => m[1]));
      const fig = EMITTER[family as WalkedFamily](b);
      if (fig.legend?.slots.some((l) => texts.has(l.label)) === true) legendDrawn += 1;
      // `tiles` draws its labels from **marks**, not from `identity` — so the
      // gutter families are the ones where an identity string could only have
      // come from the member.
      if (family === "tiles") continue;
      gutterFamilies += 1;
      if (fig.identity.some((i) => i !== "" && texts.has(i))) identityDrawn += 1;
    }
    expect(drawn, "drawn SVG documents").toBe(178); // cells-ok — a document count
    // **152 → 178, and both halves are attributable** (F383). The corpus has
    // **19 violin and 1 ridgeline** variants — the 20 the density family
    // brought — and F383 recovered a further **6** variants of four other
    // forms whose data this arm was refusing rather than reading. 152 + 20 +
    // 6 = 178, which is also what U3 and U4 now count: **every variant that
    // walks a figure draws a document.** The two numbers were 152 and 158 and
    // the gap between them *was* those six.
    // **D13 closed**: the legend is drawn where the author asked and where it is
    // load-bearing — `SHARES_CELLS` and more than one series — which is the form
    // half of the terminal's auto-enable. The rung half stays there, because one
    // of its clauses reads `caps.colourDepth`.
    // **63 to 45, and the drop is a reclassification** (F333). The curve family
    // was drawing its `identity` — its **series names** — along the position
    // axis, and this counter matches a legend slot's label by **string**, so a
    // caption printing `obs` under a figure with no legend counted as a legend.
    // 67 single-series documents carry one legend slot that the arm rightly
    // never draws: a legend of one names nothing the figure has not said. The
    // matcher cannot tell which element drew a string, and removing the captions
    // is what made that visible — *assert the artefact, not a proxy*, on a
    // counter rather than on an assertion.
    // **46, and 33 of them are ambiguous** (F353). Measured while `utilisation`
    // gained its row labels and pushed this from 45: in 33 of the 46, *every*
    // matching slot label is also a member of `fig.identity` — a row name or a
    // series name the gutter draws — so the counter cannot tell a legend from a
    // gutter that happens to say the same words. The comment above says the
    // matcher cannot tell which element drew a string; this is how much of the
    // count that reaches. **The artefact is a swatch beside the text**, which
    // `arm-decisions.ts` already asks for by shape after F307, and asking it here
    // would re-derive the figure D13 closed against. Recorded, not narrowed.
    expect(legendDrawn, "documents drawing a legend label — D13").toBe(46); // cells-ok — a document count
    // 44 → 46: two of the twenty density variants carry more than one series
    // into shared cells, which is what `SHARES_CELLS` auto-enables a legend for.
    // The other eighteen are single-series and gain none (F383).
    expect(gutterFamilies, "documents in the families the terminal gutters").toBe(173); // cells-ok — a document count
    // **149 → 173, which is +24 and not +20** (F383). The 20 density variants,
    // plus **four** of the six variants F383 recovered: those four are `origin`
    // values on `line`, a guttered family, while the other two are `flame` and
    // `icicle` with categories — `tiles`, which the terminal does not gutter. The
    // drawn-document counter above moved by 26 for the same reason and counts all
    // six, so the two numbers differ by exactly the two tiles variants.
    // **D10 closed**, gated on `ROW_IS_AN_IDENTITY` — one row, column or band per
    // name the caller supplied. Drawing it for every family made the cell worse
    // rather than better: a curve's identity is its series, which belongs in the
    // legend, and `line.identityLabels` went 12/70 to 70/70 before the gate.
    // **And the gate was the wrong record, which took a frame to see** (F333).
    // `ROW_IS_AN_IDENTITY` answers *does each row get its own palette slot*, and
    // it is `true` for the curve family — so the gate excluded nothing there and
    // the series names went along the **position axis**, which is neither the
    // gutter the sentence above rules out nor the legend it names.
    // `HAS_POSITION_AXIS` is the record for this question: an identity is
    // captioned along an axis exactly where the identity **is** that axis.
    // **+4 and not +9, and the four are the radar's** (§3ak.26). This counter is an
    // exact-string test, and a pie and a waffle draw `Chrome 65%` rather than
    // `Chrome` — the name and its reading in one `<text>`, which is what the
    // terminal draws too. So the eight proportion documents that name their
    // segments are invisible here, and the limit is stated rather than left as a
    // number that looks like a gap.
    expect(identityDrawn, "documents drawing an identity string — D10").toBe(81); // cells-ok — a document count
    // **60 → 81, and 20 of the 21 are the density family** — 19 violin and 1
    // ridgeline, counted per form rather than inferred from the total (F383).
    // Both forms are `ROW_IS_AN_IDENTITY` without a position axis, so each band
    // is captioned by name, which is what the terminal draws down the left.
    // The remaining one is F383's other half: `flame` and `icicle` with
    // categories and no hierarchy now route to the bar family and caption them.
  });

  it("U1a3 (C12 I59, §3ak.16): the tick count is the block's height, and 5 is right at one height", () => {
    // **D2 was *the SVG hardcodes five ticks*, and this is why it survived being
    // looked at.** The terminal passes `ticksFor(plotAreaRows(block))`; the
    // second arm passed a constant. At height 12 — the catalogue's commonest —
    // the two agree exactly, so a reader comparing one frame sees no
    // disagreement and a fixture at that height cannot catch the constant
    // coming back.
    //
    // **The mutation pass is what found the row missing.** Restoring the
    // constant inside `figureOf` is caught by twenty golden frames and both
    // baselines and by no assertion whose *subject* is the tick count — so the
    // decision was covered only by whole-frame gates, which report that a
    // picture moved rather than which decision moved it.
    const at = (height: number): readonly number[] =>
      curveFigure(blockOf({ form: "line", height, series: [{ label: "s", values: [0, 3, 1, 9, 4, 7, 2, 8] }] })).value!.ticks;
    expect([4, 8, 12, 20, 30].map((h) => at(h).length)).toEqual([2, 3, 5, 6, 10]);
    // The constant's one true case, pinned so the coincidence stays visible.
    expect(at(12).length, "the height at which the second arm's constant was right").toBe(5); // cells-ok — a tick count
  });

  /**
   * **U1b — each arm's output is a faithful projection of the figure.**
   *
   * The terminal half is the family rows' — `FC1` asserts a mark's `y` and
   * `rowOf`'s row are one coordinate — because a glyph at a mapped cell needs
   * the rasteriser's own arithmetic. This row is the SVG half: every mark
   * accounts for at least one element of the kind it names.
   *
   * **`GlyphRole`'s terminal half has no mechanism to assert against** (F289).
   * §3ak.3 places the glyph-per-role table in "the terminal walker's `Record`";
   * `GlyphRole` is read in one file, the one that declares it, and the terminal
   * reaches the same characters through rasterisers that have never heard of the
   * type. They agree because the roles were extracted **from** that composition,
   * and nothing holds them there.
   */
  /**
   * **Keyed exhaustively over `Mark["kind"]`, and it was not** (F308).
   *
   * A kind with no entry looked up `undefined`, and `String.prototype.match`
   * called with `undefined` matches the **empty string** — so the lookup
   * returned `[""]` and the row reported *one element*. A new mark kind
   * therefore passed this row for any figure emitting exactly one of it, and
   * failed it in a way that reads like a shortfall for any figure emitting more:
   * `arc: 4 marks, 1 elements`, which names the wrong defect.
   *
   * **The SVG's own `default:` branch is the same shape** (F289): a lookup
   * without a total record answers plausibly for a case nobody decided. Here the
   * `satisfies` makes the next kind a compile error in the row that is supposed
   * to catch it.
   */
  const ELEMENT_FOR = {
    polyline: /<(?:polyline|path)\b/gu,
    // A sector is a `path`; a full turn has no arc between coincident ends, so
    // it is a `circle` — the walk's own split.
    arc: /<(?:path|circle)\b/gu,
    point: /<(?:circle|polygon|rect)\b/gu,
    rect: /<rect\b/gu,
    text: /<text\b/gu,
  } as const satisfies Readonly<Record<Mark["kind"], RegExp>>;

  function shortfall(spec: Spec, family: WalkedFamily): readonly string[] {
    const authored = blockOf(spec);
    const svg = plotToSvg(authored, DARK_THEME);
    if (svg === null) return [];
    // **The figure is of the block the arm draws** (C12 I70, §3ak.27). This
    // passed `authored` while `plotToSvg` derives, so the projection was
    // measured against a figure the arm never held: `histogram/two-series`
    // reported *240 marks, 21 elements* — the 240 raw samples the seam replaces
    // with 8 counted bins per series (F317). A row that builds its own subject
    // agrees with the arm only for as long as the arm does nothing.
    const b = drawnBlock(authored);
    const want = new Map<string, number>();
    for (const d of EMITTER[family](b).marks) want.set(d.mark.kind, (want.get(d.mark.kind) ?? 0) + 1);
    const out: string[] = [];
    for (const [kind, n] of want) {
      const got = (svg.match(ELEMENT_FOR[kind as keyof typeof ELEMENT_FOR]) ?? []).length;
      if (got < n) out.push(`${kind}: ${String(n)} marks, ${String(got)} elements`);
    }
    return out;
  }

  it("U1b (C12 I62, §3ak): every mark reaches an element, on the family that uses all seven roles", () => {
    // The distribution family is the one `GlyphRole` exists for: a median, a
    // mean, an outlier, a cap, a pooled target and an absent datum are six
    // different things and the SVG draws six different shapes.
    for (const bucket of ["boxplot", "forest"] as const) {
      for (const [variant, raw] of Object.entries(CATALOGUE_FORMS[bucket] as Record<string, Spec>)) {
        expect(shortfall(specOf(raw), "distribution"), `${bucket}/${variant}`).toEqual([]);
      }
    }
  });

  it("U2 (C12 I59, §3ak.17): U1b crossed over every form the SVG arm claims", () => {
    const seen = new Set<string>();
    const short: string[] = [];
    for (const { bucket, variant, spec, family } of corpus()) {
      if (family === null || family === "nodes" || family === "facets") continue;
      if (seen.has(spec["form"] as string)) continue;
      seen.add(spec["form"] as string);
      for (const s of shortfall(spec, family as WalkedFamily)) short.push(`${bucket}/${variant} ${s}`);
    }
    expect(short).toEqual([]);
    expect(seen.size, "distinct forms walking a figure").toBe(42); // cells-ok — a form count
    // 40 → 42: `violin` and `ridgeline`, the density family (F383).
  });

  it("U3 (C12 I59, §3ak.17): and over every variant, including both data shapes", () => {
    // **`U2`'s subject at the corpus's own size.** A form is represented once in
    // `U2`; a variant is where a form's second data shape lives, and a mark kind
    // that only appears in one of them is invisible to the row above.
    const short: string[] = [];
    let checked = 0;
    let lying = 0;
    for (const { bucket, variant, spec, family } of corpus()) {
      if (spec["form"] !== bucket) lying += 1;
      if (family === null || family === "nodes" || family === "facets") continue;
      checked += 1;
      for (const s of shortfall(spec, family as WalkedFamily)) short.push(`${bucket}/${variant} ${s}`);
    }
    expect(short).toEqual([]);
    expect(checked, "variants walking a figure").toBe(178); // cells-ok — a variant count
    // 158 → 178: the 20 density variants — 19 violin, 1 ridgeline (F383).
    // The bucket that lies, pinned. If a second one appears, the emitter key is
    // the first thing to check — this is the count F290 rests on.
    expect(lying, "variants whose spec.form differs from their catalogue bucket").toBe(1); // cells-ok — a variant count
  });

  it("U4 (C12 I62, §3ak): the figure carries no resolved colour, so a theme cannot move it", () => {
    // The figure carries `ColourRef`s and each arm calls `resolve()` at its own
    // depth. This is the row that fails the day an emitter reaches for a colour —
    // a resolved one is a hex triple, a ref is a dotted slot name.
    let checked = 0;
    for (const { bucket, variant, spec, family } of corpus()) {
      if (family === null || family === "nodes" || family === "facets") continue;
      checked += 1;
      const json = JSON.stringify(EMITTER[family as WalkedFamily](blockOf(spec)));
      expect(json, `${bucket}/${variant} carries a resolved colour`).not.toMatch(/#[0-9a-f]{6}/iu);
    }
    expect(checked, "figures checked for a resolved colour").toBe(178); // cells-ok — a variant count
    // 158 → 178: the same 20, and the density figure names `surface.bgDeep`
    // and `tone.default` as **refs** rather than resolving them, which is what
    // this row is for — a second arm that wrote a hex here would fail it (F389).
  });

  it("U5 (C12 I59, §3ak.17): the SVG arm cannot see a capability — structural, not measured", () => {
    // **This row has no parameter to vary and says so** (F288). `plotToSvg`
    // takes a block, a theme and an optional layout; there is no capability set
    // to hand it, so *identical at every capability set* could never have
    // failed. The guarantee is real and it is a signature, so the signature is
    // what is asserted — and the label matters, because a behavioural row
    // reading green here would have someone believe the ladder was measured out
    // of this arm when it was never let in.
    //
    // `Function.length` counts parameters before the first default, so a two
    // here is `(block, theme)` with `layout` defaulted. A third required
    // parameter — the shape a capability set would arrive in — moves it.
    expect(plotToSvg.length, "plotToSvg takes (block, theme) and an optional layout").toBe(2);
  });

  /**
   * **U6 — walk artefact B: the rung ladder as a trace.**
   *
   * Its first half — *the terminal's figure is identical at every capability
   * set* — is U5's shape: the emitters take `block` alone, so it is a signature
   * guarantee and `U6a` asserts the signature. The content is here.
   *
   * **The edges are not the array's neighbours** (F284). `CAPS` is ordered for a
   * catalogue reader, and `ASCII` is `{ ...FULL, unicode: "ascii",
   * colourDepth: 1 }` — two capabilities from full — so the adjacent pair
   * `8bit → ascii` moves the repertoire and the depth together. That is the
   * exact confound the five sets were built to remove: `CAPS`' own comment
   * records splitting `wide` off because "two capabilities that always move
   * together cannot be told apart by any number of frames". The fix designed
   * isolation into the **set** and not the sequence, and nothing walks the
   * sequence until a trace does.
   */
  const EDGES = [
    ["24bit", "8bit", "colour depth, 24 to 8"],
    ["8bit", "1bit", "colour depth, 8 to 1 — the colour floor"],
    ["1bit", "ascii", "the unicode repertoire, both 1-bit"],
    ["24bit", "wide", "ambiguousWidth, narrow to wide"],
  ] as const;

  /** Which cells are inked, ignoring which character inked them. */
  const inked = (lines: readonly string[]): string =>
    lines.map((l) => [...strip(l)].map((c) => (c === " " ? " " : "#")).join("")).join("\n");

  function edgeKind(a: readonly string[], b: readonly string[]): string {
    if (a.join("\n") === b.join("\n")) return "same";
    if (a.map(strip).join("\n") === b.map(strip).join("\n")) return "colour";
    return inked(a) === inked(b) ? "glyph" : "layout";
  }

  it("U6a (C12 I59, §3ak.17): no capability reaches a figure emitter — structural, not measured", () => {
    // Same class as U5, same honesty. `curveFigure(block)` and its five siblings
    // take one argument; `plotAreaRows(block)` is a block fact. There is no set
    // to vary, so the figure cannot differ by rung, and asserting it behaviourally
    // would be asserting that a function ignores an argument it does not have.
    for (const [name, fn] of Object.entries(EMITTER)) {
      expect(fn.length, `${name}Figure takes a block and nothing else`).toBe(1);
    }
  });

  it("U6b (C12 I59, §3ak.15): the rung ladder, over 46 forms and the four isolating edges", () => {
    const tally = EDGES.map(() => ({ same: 0, colour: 0, glyph: 0, layout: 0 }));
    let forms = 0;
    for (const [bucket, variants] of Object.entries(CATALOGUE_FORMS)) {
      const spec = specOf(Object.values(variants as Record<string, Spec>)[0]!);
      forms += 1;
      const at = new Map(caps.map((c) => [c.name, frame(spec, c.caps, WIDTH, `u-${bucket}`)]));
      EDGES.forEach(([a, b], i) => {
        const kind = edgeKind(at.get(a)!, at.get(b)!) as keyof (typeof tally)[number];
        tally[i]![kind] += 1;
      });
    }
    expect(forms, "forms traced").toBe(47); // cells-ok — a form count

    // **The record, and it is the specification.** A cell moving is a finding:
    // a rung that stops changing a form, or starts changing one it did not.
    //
    // **The colour floor is the only edge that moves geometry.** Its 21 `layout`
    // cells are the stacked strips — below the floor `positionalForm` stops
    // overlaying and stacks into labelled strips, so the value gutter becomes
    // series names and the legend disappears into it. The 3 `glyph` cells beside
    // them are `CATEGORY_MARKS`, identity carried by shape where the layout can
    // hold. Both rungs are in §3ak.3's table and the split between them is per
    // form, not per family.
    //
    // **`layout` at the unicode edges is the rasteriser, not the geometry**: a
    // braille curve falling to `-` inks a different set of cells for the same
    // figure, which is §2's legitimate column. The classifier cannot tell that
    // from a moved coordinate and the record says so rather than pretending.
    //
    // **The `wide` edge moved four cells and the net was two, which is why the
    // record is per edge and read rather than summed** (F293, §3ak.24). Each of
    // the four says something different about the fix:
    //
    // | form | was | now | what the cell is saying |
    // |---|---|---|---|
    // | `graph` | `same` | `glyph` | **the rung was doing nothing at all** — the connectors were unicode at both ends of the edge, which is the defect stated as a classification |
    // | `ridgeline` | `layout` | `glyph` | the ink moved because the figure was being **truncated**; now only the vocabulary changes |
    // | `tree` | `layout` | `glyph` | the same, and the pair of them is what *width-correct, not figure-correct* meant |
    // | `pie` | `glyph` | `layout` | the **substitution** rung — a share of a whole redrawn as a labelled table, which is §3ak.18's third kind and one the classifier cannot separate from a moved coordinate |
    //
    // A `same` cell on a capability edge is the one to distrust: it reads as
    // *this rung does not reach this form* and it can mean *this form does not
    // answer this rung*.
    //
    // **`scatter3d` contributed one cell to each edge and all four are
    // different**, which is the record earning its keep on the first form added
    // after it was written:
    //
    // | edge | cell | why |
    // |---|---|---|
    // | 24 → 8 | `colour` | the raster arm both sides; the depth ramp quantises |
    // | 8 → 1 | `layout` | **the arm switches** — `halfBlockEligible` needs 8, so below the floor the picture becomes marker glyphs at different coordinates |
    // | 1 → ascii | `glyph` | the marker arm both sides, unicode marks to ASCII marks at the same positions |
    // | 24 → wide | `layout` | **the arm switches again, on `ambiguousWidth` rather than on colour** — the one rung where a *width* capability moves geometry, and the reason `halfBlockEligible` reads three fields rather than one |
    expect(tally).toEqual([
      { same: 1, colour: 46, glyph: 0, layout: 0 },
      { same: 1, colour: 21, glyph: 3, layout: 22 },
      { same: 0, colour: 0, glyph: 38, layout: 9 },
      { same: 0, colour: 0, glyph: 38, layout: 9 },
    ]);
  });

  it("U6c (C12 I59, §3ak.15): the control — one form the colour ladder does not reach", () => {
    // **A trace whose every cell moves is a trace that cannot be wrong.** `tree`
    // is `same` at both colour edges because it emits no SGR at all at 24-bit:
    // its reading is structure, and there is no series colour to lose. That is
    // what makes the other 45 cells evidence rather than a tautology about
    // frames differing when capabilities do.
    const full = capsNamed("24bit");
    const bare: string[] = [];
    for (const [variant, raw] of Object.entries(CATALOGUE_FORMS.tree as Record<string, Spec>)) {
      if (!coloured(frame(specOf(raw), full, WIDTH, "u-tree"))) bare.push(variant);
    }
    expect(bare, "tree variants drawing no colour at 24-bit").toEqual(
      ["default", "left-right", "outline"],
    );
    // And the three that do colour something colour the **overflow notice**, not
    // a node — so the form has no series colour to lose at any rung.
    for (const [variant, raw] of Object.entries(CATALOGUE_FORMS.tree as Record<string, Spec>)) {
      const lines = frame(specOf(raw), full, WIDTH, "u-tree");
      const inColour = lines.filter((l) => strip(l) !== l).map(strip);
      expect(inColour.every((l) => l.includes("more")), `tree/${variant} colours only its notice`).toBe(true);
    }
  });

  it("U6e (C12 I63, §3ak.15): no rendered row is wider than the terminal, and the exemption is named", () => {
    // **The degradation audit's one finding, and it is the failure CLAUDE.md
    // singles out**: a row wider than the terminal wraps, and a wrapped line
    // scrolls the alternate screen — the one corruption the application cannot
    // see afterwards. Measured with `cells()` at each set's own ambiguity, which
    // is the measurement no byte-comparison gate performs: the frames are stable
    // bytes, and stable bytes 61 cells wide still wrap.
    //
    // **`truncate` budgets one cell for a marker that takes two** (F292,
    // `src/presentation/text.ts`). Every measurement in that function honours
    // `caps.ambiguousWidth` — `cells(clean, …)`, `clusterCells(segment, …)` —
    // except the width of the character the function itself appends: `…` is
    // East-Asian Ambiguous, so `limit - 1` is right at narrow and one short at
    // wide. Every overflow is therefore **exactly one cell**, and every
    // overflowing row ends in the marker. `unicode: "ascii"` uses `~` and is
    // correct, which is why four of the five sets are clean.
    //
    // **Recorded by equality rather than excluded** — a subset check lets a row
    // that starts overflowing hide behind one that already does, and the day the
    // budget is fixed this map must go empty rather than merely shrink.
    // **Empty, and it is compared by equality so it has to stay empty.** It held
    // `contour/style-line: 2, graph/crowded: 1, tree/default: 1,
    // violin/vertical: 13, radar/line: 12` — 29 rows — until the marker's width
    // was measured rather than assumed (F292).
    const OVERFLOWING: Record<string, number> = {};
    const measured: Record<string, number> = {};
    const byRung: Record<string, number> = {};
    for (const { name, caps: set } of caps) {
      const amb = (set["ambiguousWidth"] ?? "narrow") as "narrow" | "wide";
      let over = 0;
      for (const [bucket, variants] of Object.entries(CATALOGUE_FORMS)) {
        for (const [variant, raw] of Object.entries(variants as Record<string, Spec>)) {
          for (const line of frame(specOf(raw), set, WIDTH, `o-${bucket}`)) {
            if (cells(strip(line), amb) <= WIDTH) continue;
            over += 1;
            if (name === "wide") measured[`${bucket}/${variant}`] = (measured[`${bucket}/${variant}`] ?? 0) + 1;
          }
        }
      }
      byRung[name] = over;
    }
    // Four of five rungs are clean, and that is the control: a measurement that
    // reported overflow everywhere would be measuring itself.
    expect(byRung, "rows wider than the terminal, per capability set")
      .toEqual({ "24bit": 0, "8bit": 0, ascii: 0, wide: 0, "1bit": 0 }); // cells-ok — row counts
    expect(measured, "the wide rung's overflow, by variant").toEqual(OVERFLOWING);
  });

  it("U6f (C12 I54, §3ak.24): nothing rendered takes two cells at the rung that draws wide", () => {
    // **`U6e`'s sibling, one level down.** That row asks whether a *row* fits;
    // this asks whether a *cell* does. A figure can be within its width and still
    // be built from glyphs the grid measured as one and the terminal draws as
    // two — which is the state F292 left behind and F293 names: width-correct,
    // figure-correct not yet.
    //
    // **Every gate in this repo compares bytes**, so a stable wrong answer passes
    // all of them. This one runs `cells()` over rendered output, which is the
    // only thing that can see it.
    const seen = new Map<string, number>();
    let frames = 0; // cells-ok — a frame count
    for (const { bucket, variant, spec } of corpus()) {
      let lines: readonly string[];
      try { lines = frame(spec, capsNamed("wide"), WIDTH, "u-w").map(strip); } catch { continue; }
      frames += 1; // cells-ok — a frame count
      for (const line of lines) {
        for (const ch of line) {
          if (ch === " " || cells(ch, "wide") !== 2) continue; // cells-ok — the subject
          seen.set(ch, (seen.get(ch) ?? 0) + 1); // cells-ok — a character count
          expect(ch, `${bucket}/${variant} draws a two-cell glyph at wide`).toBe("…");
        }
      }
    }
    // **The corpus, so a green run says how much it swept** — and the marker is
    // the one exemption, named rather than filtered out of the loop: `…` is
    // drawable at this rung and `truncate` reserves both its cells since F292,
    // so its width is a cost and not a defect. `~` is the *repertoire* fallback,
    // which is a different question (§3ak.24).
    expect(frames, "catalogue variants rendered at the wide rung").toBe(213); // cells-ok — a frame count
    expect([...seen.keys()].sort(), "two-cell characters still emitted").toEqual(["…"]);
  });

  it("U6e2 (C12 I63, §3ak.15): the marker's own width is the mechanism, proved without a frame", () => {
    // **The frame is where it was found and this is what it is** — a direct call,
    // so the finding does not rest on inferring a cause from rendered output.
    // Asked for six cells, `truncate` returns seven whenever its marker is the
    // ellipsis and the ambiguity is wide.
    const at = (unicode: "full" | "bmp" | "ascii", ambiguousWidth: "narrow" | "wide"): number =>
      cells(truncate("abcdefghij", 6, { unicode, ambiguousWidth }), ambiguousWidth);
    expect(at("full", "narrow"), "narrow: the budget of one is right").toBe(6); // cells-ok — a cell count
    expect(at("ascii", "wide"), "`~` is not ambiguous, so the ascii rung is right").toBe(6); // cells-ok — a cell count
    // **F292, closed**: the budget takes the marker's own measured width, so the
    // ambiguous rung reserves two cells and the result is the width asked for.
    // The row that read `7` here is what made the fix's subject explicit.
    expect(at("full", "wide"), "F292: the ellipsis is measured, not assumed").toBe(6); // cells-ok — a cell count
    expect(at("bmp", "wide"), "F292: `bmp` keeps the ellipsis, and now keeps the width").toBe(6); // cells-ok — a cell count
  });

  it("U6d (§3ak.15): the trace responds to a rung moving, and to the edges being wrong", () => {
    // **A record certified only by itself agrees with itself whatever it does**
    // (`test/support/README.md`). Two fabricated violations, because the record
    // has two ways to be wrong.
    const spec = specOf(Object.values(CATALOGUE_FORMS.boxplot as Record<string, Spec>)[0]!);
    const at = (n: string): readonly string[] => frame(spec, capsNamed(n), WIDTH, "u-box");

    // One: the classifier must see a rung change a frame at all, and must not
    // report a change where there is none.
    expect(edgeKind(at("1bit"), at("ascii")), "the unicode rung moves a boxplot's glyphs").toBe("glyph");
    expect(edgeKind(at("24bit"), at("24bit")), "and identity reads as identity").toBe("same");

    // Two — the one F284 is about: **walking the array's neighbours instead of
    // the isolating edges hides one capability behind another.** `8bit → ascii`
    // is a colour change and a unicode change at once, so it reports a glyph or
    // layout move and the colour half is attributed to the repertoire.
    expect(edgeKind(at("8bit"), at("1bit")), "the colour floor alone is a colour move here").toBe("colour");
    expect(edgeKind(at("8bit"), at("ascii")), "and the array's neighbour hides it under unicode")
      .not.toBe("colour");
  });

  /**
   * ## U7 — `GlyphRole`, held rather than inherited (C12 I68, §3ak.21)
   *
   * **The type was read in one file, the one declaring it** (F289). The arms
   * agreed because the roles were extracted *from* the terminal's composition,
   * and the rung table's *terminal walker's `Record`* named an effect with no
   * mechanism — a table of names, satisfied by names.
   *
   * The compile-time half is two exhaustive records and cannot be asserted here:
   * an eighth role is a type error in `roleGlyphs` and in `walk`'s draw table,
   * which is F288's *unfalsifiable by signature* and is labelled so rather than
   * dressed as a row. **These rows are the behavioural half**, and the claim they
   * take is not §3ak.13's. *Seven roles, seven shapes* is false — six characters
   * serve seven roles — and it is false in the direction that cannot fail, since
   * only the arms improving could violate it (F300).
   */
  it("U7a (C12 I68, §3ak.21): every role that marks a cell marks exactly one, at both alphabets", () => {
    // **C09 I5's rule reaching the role table.** A fallback two cells wide where
    // the original was one makes every measured height wrong, and the marks a
    // distribution draws sit inside a slot whose width the renderer has already
    // committed to. `cells()` and not `.length`, or the measurement drifts from
    // the measurer's.
    for (const c of caps) {
      // **`paired` moved into the record** (C12 §3ak.42, F344), so the loop below
      // covers a dumbbell's far end now and there is one fewer thing beside it.
      const { of, meanOnMedian } = roleGlyphs(c.caps as unknown as TCaps);
      for (const [role, glyph] of Object.entries(of)) {
        expect(cells(glyph, c.caps["ambiguousWidth"] as AmbiguousWidth), `${c.name}: ${role} is one cell`).toBe(1); // cells-ok — the subject
      }
      expect(cells(meanOnMedian, c.caps["ambiguousWidth"] as AmbiguousWidth), `${c.name}: the coincident mean`).toBe(1); // cells-ok — the subject
      expect(Object.keys(of), `${c.name}: and the record is the figure's roles, not a subset`)
        .toContain("paired");
    }
  });

  it("U7b (C12 I68, §3ak.21): the terminal's characters are distinct — except one pair, which cannot co-occur", () => {
    // **Six characters for seven roles, and the collapse is `mean` with
    // `target`.** Legitimate rather than tolerated: U7c measures that the two
    // never share a figure. Asserted as an equality and not skipped, so the day
    // the terminal gives a pooled estimate its own mark this row says the
    // licence is no longer needed.
    for (const c of caps) {
      const { of } = roleGlyphs(c.caps as unknown as TCaps);
      const drawn = Object.entries(of).filter(([r]) => r !== "target");
      const distinct = new Set(drawn.map(([, g]) => g));
      expect(distinct.size, `${c.name}: ${drawn.map(([r]) => r).join(" · ")}`).toBe(drawn.length); // cells-ok — a role count
      expect(of.target, `${c.name}: the recorded collapse (F300)`).toBe(of.mean);
    }
  });

  it("U7c (C12 I68, §3ak.21): no figure in the corpus emits both `mean` and `target`", () => {
    // **This is what licenses U7b's equality, and it is the falsifiable half.**
    // `distributionFigure` returns from the forest branch before a mean can be
    // added, so the collapse is unreachable — but that is a property of the
    // emitter's control flow rather than of the type, and nothing else states
    // it. A forest plot that grew a mean would make the shared `◆` a defect,
    // here, rather than in a frame nobody reads at that rung.
    let withPoints = 0; // cells-ok — a variant count
    for (const { bucket, variant, spec, family } of corpus()) {
      if (family === null || !(family in EMITTER)) continue;
      const fig = EMITTER[family as WalkedFamily](blockOf(spec));
      const roles = new Set(
        fig.marks.flatMap((d) => (d.mark.kind === "point" ? [d.mark.role] : [])),
      );
      if (roles.size === 0) continue;
      withPoints += 1; // cells-ok — a variant count
      expect(roles.has("mean") && roles.has("target"), `${bucket}/${variant}`).toBe(false);
    }
    // **The corpus this was measured over**, so a green run says how much it
    // swept — and so the day a variant stops emitting a point mark, the row that
    // licenses a shared character notices.
    expect(withPoints, "catalogue variants emitting a point mark").toBe(38); // cells-ok — a variant count
    // **19 → 38, and the added 19 are exactly the violins** (F384). A violin
    // emits a `median` point and a `mean` point over its body; the single
    // `ridgeline` variant emits neither, because overlapping curves put each
    // box on its neighbour and the terminal takes no summary there either. So
    // the move is 19 and not 20, and that asymmetry is the design.
  });

  it("U7d (C12 I68, §3ak.22): `absent` draws nothing in both arms, and by decision in both", () => {
    // **The terminal reached this answer through `row[NaN]`** — a property set
    // on an array rather than a cell, which `join("")` ignores (F299). The two
    // arms agreed and one agreed by accident, so any tidying of
    // `normalisedSummary`'s fallback would have ended the agreement silently.
    //
    // **No catalogue variant constructs the state**, which is why 1780 baseline
    // frames and 178 SVG documents never showed it: an invariant is vacuous
    // until its subject exists, and this one had its subject only in prose.
    const none = { min: 2, q1: 3, median: NaN, q3: 7, max: 8, lower: 2, upper: 8 };
    const some = { ...none, median: 5 };
    expect(estimateRole(none), "no estimate reported").toBe("absent");
    expect(estimateRole(some), "an ordinary estimate").toBe("point");
    expect(estimateRole({ ...some, pooled: true }), "the pooled one").toBe("target");

    const mark = roleGlyphs(capsNamed("24bit") as unknown as TCaps).of.point;
    const rowFor = (q: typeof none): string =>
      forestRow(q, 0, 10, 24, capsNamed("24bit") as unknown as TCaps).trim();
    expect(rowFor(some), "an estimate draws a mark").toContain(mark);
    // **This next line cannot fail on this arm and it is kept for the pairing,
    // not as a measurement** (F288's second class, stated rather than dressed
    // up). `at(undefined)` is `NaN`, `atX(NaN)` is `NaN`, and `row[NaN] = mark`
    // sets a property on an array rather than a cell — so the terminal draws
    // nothing for an absent estimate whether or not it asks the role. Making the
    // guard always true survives every gate in the repo, which is a measurement
    // about the terminal's insensitivity and not a licence to drop the guard:
    // one branch against a mark at a position the data never had, the first time
    // anything clamps that fallback (F299).
    expect(rowFor(none), "and no estimate draws none — structural, see above").not.toContain(mark);
    // The interval is still drawn — **the row is not empty, it is unmarked**,
    // which is the distinction the role exists to keep.
    expect(rowFor(none).length > 0, "the interval survives").toBe(true); // cells-ok — a run length
    // **The arm where the role does bite.** `at(x, NaN)` gives `cx="NaN"`, so
    // the refusal is load-bearing here and this assertion is falsifiable where
    // its terminal sibling is not — the same claim, measurable on one side.

    const armOf = (q: typeof none): string =>
      svgOf({ form: "forest", height: 3, quartiles: [q], categories: ["a"], series: [] });
    expect(armOf(some), "the second arm draws the estimate").toContain("<circle");
    expect(armOf(none), "and refuses the fallback position").not.toContain("<circle");
  });

  it("U7e (C12 I68, §3ak.21): the second arm draws a distinct thing per co-occurring role", () => {
    // **The record replaced a `switch` ending in `default:`**, which drew a
    // circle — so an eighth role would have arrived as a plausible point mark
    // with no error and no frame that looks wrong (F289). Exhaustiveness is the
    // compile-time half; this is the half that can fail today.
    const box = svgOf({ form: "boxplot", height: 9, series: [], quartiles: [{ min: 1, q1: 3, median: 5, q3: 7, max: 9, mean: 6, outliers: [11] }], categories: ["a"], axes: true });
    // `median` and `cap` are both spans and both `<rect>`s, so *distinct* here
    // is the drawn length. **The first version of this assertion counted every
    // `<rect>` in the document and asked for two distinct widths** — satisfied by
    // the box, the identity gutter and the page ground, none of which is a span,
    // so widening a cap to the full slot changed nothing it could see. It
    // survived its own fabricated violation, which is the only reason it is not
    // still here: containment is satisfied by every wrong answer inside the
    // bounds.
    //
    // A span is a plain filled rect one or two units thick — `across`'s own
    // `thick`, which is the *only* thing it puts in that dimension — and the
    // reading is the other dimension, so this does not care which way the figure
    // runs. Taken off the document rather than recomputed, which is what `G6` had
    // to be repaired to do.
    const spans = [...box.matchAll(/<rect x="[-\d.]+" y="[-\d.]+" width="([\d.]+)" height="([\d.]+)" fill="[^"]*"\/>/gu)]
      .map((m) => ({ thick: Math.min(Number(m[1]), Number(m[2])), long: Math.max(Number(m[1]), Number(m[2])) }))
      .filter((r) => r.thick <= 2);
    const medians = spans.filter((r) => r.thick === 2);
    const capRects = spans.filter((r) => r.thick === 1);
    expect(medians.length, "one median span").toBe(1); // cells-ok — a mark count
    expect(capRects.length, "a cap at each end").toBe(2); // cells-ok — a mark count
    // **Half the slot, because a cap as wide as the box it caps reads as a
    // second box edge rather than as the whisker's end** — the arm's own reason,
    // asserted rather than commented.
    for (const c of capRects) {
      expect(c.long * 2, `cap ${c.long} against median ${medians[0]!.long}`).toBeCloseTo(medians[0]!.long, 5);
    }
    expect(box, "the mean is a diamond and not a circle").toContain("<polygon");
    expect(box, "the outlier is a circle").toContain("<circle");

    // A forest plot is the other co-occurrence: `target` against `point`, which
    // the terminal collapses and this arm does not.
    const forest = svgOf({
      form: "forest",
      height: 6,
      series: [],
      quartiles: [
        { min: 1, q1: 2, median: 3, q3: 4, max: 5, lower: 1, upper: 5 },
        { min: 1, q1: 2, median: 3, q3: 4, max: 5, lower: 1, upper: 5, pooled: true },
      ],
      categories: ["a", "b"],
    });
    expect(forest, "a pooled estimate is a diamond here").toContain("<polygon");
    expect(forest, "and a plain one is a circle").toContain("<circle");
  });

  /**
   * **The three derivations a sweep bounded by a file did not see** (C12 I70,
   * §3ak.29, F322).
   *
   * Each was written inside `heatmapFormRows` for a right reason — *so the
   * range, the gutter labels, the legend and the overflow row all see one series
   * list* — and each is `Plot → Plot` with no width and no capability, which is
   * the shape `drawnBlock` is for. Two of them are why two `SVG_FAMILY` entries
   * were `null`.
   *
   * **The row asserts the transform and not the file**, which is the finding's
   * own lesson: what makes these three the same thing is their signature, and
   * a sweep indexed by where the last one turned up cannot see that.
   */
  it("U8 (C12 I70, §3ak.29): the field forms' three derivations are the seam's, not a renderer's", () => {
    // `contour` — a field's rows are positions, so the gutter and the x axis are
    // captioned from the grid's own domain and the caller does not have to.
    const contour = drawnBlock(blockOf({
      form: "contour", height: 4, axes: true,
      series: [{ values: [1, 2, 3] }, { values: [4, 5, 6] }],
    }));
    expect(contour.series.map((sr) => sr.label), "rows captioned by index").toEqual(["0", "1"]);
    expect(contour.xLabels, "and a three-point domain along the bottom").toEqual(["0", "1", "2"]);

    // `quiver` — the field under a vector field is the vectors' own magnitude,
    // and without the substitution the block has no scalar series at all. That
    // is the second missing derivation the refusal reason was silent about.
    const authored = blockOf({
      form: "quiver", height: 4, axes: true, series: [],
      vectors: [{ values: [[3, 4], [0, 0]] }],
    });
    expect(authored.series, "the caller named no scalar").toEqual([]);
    const quiver = drawnBlock(authored);
    expect(quiver.series[0]?.values, "and the magnitudes are the field").toEqual([5, 0]);

    // `calendar` — a date grid *is* the derivation, and after it a calendar is a
    // matrix at a different column count.
    const calendar = drawnBlock(blockOf({
      form: "calendar", height: 8, calendarUnit: "day", startDate: "2026-01-01",
      series: [{ values: Array.from({ length: 40 }, (_v, i) => i) }],
    }));
    expect(calendar.series.length, "seven weekday rows from one series").toBe(7);
    expect(calendar.series.length, "which is not the one it was given").not.toBe(1);
  });

  /**
   * **The ramp a form is on, in both arms** (C12 I72, §3ak.30, F324).
   *
   * **The subject is derived from the table and not listed.** The defect was a
   * literal `"viridis"` in the second arm, so a row naming the forms by hand
   * agrees with exactly the literal it exists to replace — and a form added to
   * `RAMP_DEFAULT` with a third ramp would go past it.
   *
   * **A refusal is counted rather than skipped.** `horizon`'s default is
   * `coolwarm` and its arm is `null` today, so it cannot be drawn here — and a
   * `continue` that says nothing is how a row goes quietly vacuous. The set of
   * skipped forms is asserted against the refusal itself, which makes the row
   * pick `horizon` up on the day that arm opens.
   */
  it("U9 (C12 I72, §3ak.30): a form whose ramp is not the guess is drawn on its own, in both arms", () => {
    const odd = (Object.entries(RAMP_DEFAULT) as readonly (readonly [PlotForm, ColormapName | null])[])
      .filter(([, name]) => name !== null && name !== "viridis");
    expect(odd.map(([form]) => form).sort(), "the forms a guess would get wrong")
      .toEqual(["correlation", "horizon", "utilisation"]);

    const rungs = 201;
    const reachable = (name: ColormapName): ReadonlySet<string> => {
      const map = COLORMAPS[name];
      const out = new Set<string>();
      for (let i = 0; i < rungs; i += 1) {
        const c = map === undefined
          ? undefined
          : continuousColour(map, i / (rungs - 1), FULL_CAPS);
        if (c !== undefined && c.kind === "rgb") out.add(c.hex);
      }
      return out;
    };
    const guess = reachable("viridis");
    const skipped: string[] = [];

    for (const [form, name] of odd) {
      if (name === null) continue;
      const variants = (CATALOGUE_FORMS as Record<string, Record<string, Spec>>)[form] ?? {};
      const first = Object.values(variants)[0];
      if (first === undefined) continue;
      const b = blockOf(specOf(first));
      expect(rampOf(b), `${form}: the figure names its own ramp`).toBe(name);
      const svg = plotToSvg(b, DARK_THEME);
      if (svg === null) { skipped.push(form); continue; }
      const own = reachable(name);
      const fills = [...svg.matchAll(/<rect[^>]*fill="(#[0-9a-f]{6})"/gu)]
        .map((m) => m[1] ?? "")
        .filter((f) => own.has(f) || guess.has(f));
      expect(fills.length, `${form}: the ramp put something on the page`).toBeGreaterThan(0);
      expect(fills.filter((f) => !own.has(f)), `${form}: drawn on the guess, not on its own ramp`)
        .toEqual([]);
    }

    // **Which forms could not be asked, and why** — against the refusal rather
    // than a literal, so the row starts asking `horizon` the day its arm opens.
    expect(skipped, "the ones this row cannot reach are exactly the refused ones")
      .toEqual(odd.filter(([f]) => svgFamilyOf(f) === null).map(([f]) => f));
  });

  it("U10 (C12 I38, §3ak.34): a categorical row's colour names the same slot in both arms", () => {
    // **The row F331 did not have, and the frame is what found it** (§3ak.34).
    // `categoricalForm` gives a row its own palette slot when
    // `ROW_IS_AN_IDENTITY[form]` — `own = i`, where `i` is the **row**, and for
    // every form but the timeline a row is a category. Every figure emitter
    // passed the **series** index instead, so `bar/default` drew five colours in
    // the terminal and one here, and so did `waterfall`, which had shipped.
    //
    // **Nothing could see it.** The SVG baseline compares this arm against
    // itself, the disagreement matrix has no column for which slot a mark takes,
    // and `ramp` is about colormaps rather than palette slots. It took reading
    // the pair.
    //
    // **Stated limit: this compares counts, not the assignment.** Two arms that
    // permuted the same five slots would agree here. What it does catch is the
    // shape the defect actually had — N against 1 — and the assignment is what
    // the pair sheet is read for.
    const INK = /\u001b\[38;2;(\d+;\d+;\d+)m/gu;
    const rows: string[] = [];
    let asked = 0; // cells-ok — a form count

    for (const [form, variants] of Object.entries(CATALOGUE_FORMS) as readonly (readonly [PlotForm, Record<string, Spec>])[]) {
      // Row-per-category forms only: where a row is a **series** the two arms
      // have always agreed, because `seriesIndex` was the right index there.
      if (!ROW_IS_AN_IDENTITY[form] || svgFamilyOf(form) === null) continue;
      const spec = Object.values(variants)[0];
      if (spec === undefined) continue;
      const b = blockOf(specOf(spec));
      if ((b.categories ?? []).length < 2 || b.series.length !== 1) continue; // cells-ok — a category count
      const svg = plotToSvg(b, DARK_THEME);
      if (svg === null) continue;

      // The terminal's, off the painted frame: every foreground colour inside
      // the figure, which for these forms is the bars and their labels.
      const painted = frame(spec, FULL_CAPS, 80, "u10").join("\n");
      const term = new Set([...painted.matchAll(INK)].map((m) => m[1] ?? ""));
      // This arm's, off the document: every series fill.
      // **Every element that can carry a series fill, not only `rect`** — a
      // dotplot draws `circle` and a curve draws `path`, and a matcher that sees
      // one encoding reports absence when the value changes form.
      const svgFills = new Set([...svg.matchAll(/<(?:rect|circle|path|polygon)[^>]*fill="(#[0-9a-f]{6})"/gu)]
        .map((m) => m[1] ?? "")
        .filter((f) => f !== "#141414"));
      asked += 1; // cells-ok — a form count
      rows.push(`${form}: terminal ${String(term.size)} · svg ${String(svgFills.size)}`); // cells-ok — a colour count
      expect(svgFills.size, `${form}: the same number of slots on both sides`)
        .toBeGreaterThanOrEqual(Math.min(term.size, (b.categories ?? []).length)); // cells-ok — a colour count
    }

    // **The counter, because a loop with every `continue` taken is green**
    // (`test/support/README.md`). Eight frames moved when the emitters started
    // reading the record, and these are the forms that own them.
    expect(asked, "row-per-category forms this arm claims, with more than one category").toBe(7); // cells-ok — a form count
    expect(rows.join(" | "), "and each drew a slot per category").toContain("bar:");
  });

  it("U11 (C12 I8, §3ak.36): a facet holding a refused form keeps its column and its siblings draw", () => {
    // **The state no fixture has.** Both facet fixtures hold four drawable
    // children, so the decision this arm had to make — *does a composition refuse
    // when a child does* — is invisible in every frame the corpus produces.
    //
    // **The terminal's answer is what settles it, and it is written twice.**
    // `smallMultiplesRows` renders through `formRows[f.form]` and falls back to
    // `[]`; its row loop states the principle for the case that is live — *a
    // facet with no row at this index contributes blanks rather than nothing: a
    // short facet must not pull the ones after it leftwards.* A column belongs
    // to a facet by **position**.
    const kid = (form: PlotForm, id: string): Plot => block({
      kind: "plot", id, form, height: 6, axes: true,
      series: [{ label: id, values: [3, 9, 4, 12, 7] }],
      ...(form === "violin" ? { categories: ["a"] } : {}),
    } as Plot);

    // **The row woke up.** Its original subject was `violin` — *this path
    // computes no density* — and F383 gave both density forms an emitter, which
    // left the interaction *does a composition refuse when a child does* with no
    // constructible witness. The equality below was written to wake the row up
    // the day one returned, and `scatter3d` is that day: `SVG_FAMILY` is `null`
    // for it because no emitter here carries a projection (C12 §3am).
    //
    // **Asserted as the exact set rather than as non-empty**, so a second
    // refusal arriving is a decision somebody makes here rather than a fixture
    // silently changing meaning.
    const refused = (Object.keys(SVG_FAMILY) as PlotForm[]).filter((f) => SVG_FAMILY[f] === null);
    expect(refused, "exactly one form is refused, and it is this row's child").toEqual(["scatter3d"]);
    expect(plotToSvg(kid("violin", "v"), DARK_THEME), "the old subject draws now").not.toBeNull();

    // **The refused child, built** — a `scatter3d` takes `points3` and refuses
    // `axes`, so it cannot come from `kid`.
    const refusedKid = block({
      kind: "plot", id: "r", form: "scatter3d", height: 6, series: [],
      points3: [{ label: "r", points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }] }],
    } as Plot);
    expect(plotToSvg(refusedKid, DARK_THEME), "and it is genuinely refused alone").toBeNull();

    const mixed = block({
      kind: "plot", id: "mix", form: "smallmultiples", height: 10, axes: true, series: [],
      facets: [kid("line", "a"), refusedKid, kid("scatter", "c")],
    } as Plot);
    const svg = plotToSvg(mixed, DARK_THEME);
    expect(svg, "the composition draws even though a child does not").not.toBeNull();

    // **A nested document per child that drew — two of three**, and the third
    // child still sits at the *third* offset. That is the whole of the rule:
    // a column belongs to a facet by position, not by content, so a refused
    // middle child must not pull its right-hand sibling leftwards.
    const kids = [...(svg ?? "").matchAll(/<svg x="([-\d.]+)"/gu)].map((m) => Number(m[1]));
    expect(kids.length, "one nested document per child that drew").toBe(2); // cells-ok — a facet count
    // **A column belongs to a facet by position**, which is what this row is
    // really for and the half that survived the refusal going away. Asserted
    // against `facetWidths` rather than against `width / 3`, because the divider
    // **distributes the remainder**: 640 over three is `214, 213, 213` and not
    // three of `213.33`, and that is the terminal's own arithmetic being called
    // rather than approximated.
    //
    // **The index moved with the count** (F383): the third child used to be the
    // *second* drawn document, because the middle one was refused. It is now the
    // third, and leaving the assertion on `kids[1]` is how that would have gone
    // unnoticed — the row would have compared the middle child's position to the
    // right-hand column's and failed for a reason that reads like a layout
    // defect. It did: `expected 214 to be close to 427`.
    const widths = facetWidths(SVG_DEFAULT_LAYOUT.width, 3);
    expect(kids[0], "the first child is at the left edge").toBeCloseTo(0, 6);
    // **The second document drawn is the *third* child**, which is the assertion
    // the refusal makes possible and the one no all-drawing corpus can make: a
    // renderer that packed the survivors would put it at `widths[0]`, and the
    // frame would look perfectly reasonable.
    expect(kids[1], "the surviving right-hand child keeps the third column")
      .toBeCloseTo((widths[0] ?? 0) + (widths[1] ?? 0), 6);

    // **Two children sharing an id share a clip path**, and the corpus cannot
    // show it: every facet fixture names its children `f1 … f4`, and a curve
    // facet emits no clip path at all — `smallmultiples/default` has **zero**
    // where `bar/default` has five. So the guard that rewrites each child's id
    // had no instance to fire on, and a mutation removing it survived a whole
    // pass reporting nothing. Constructed here, on a child that does clip.
    const clipped = (id: string): Plot => block({
      kind: "plot", id, form: "bar", height: 6, axes: true,
      categories: ["alpha", "beta"], series: [{ label: id, values: [3, 9] }],
    } as Plot);
    const collide = block({
      kind: "plot", id: "dup", form: "smallmultiples", height: 10, axes: true, series: [],
      facets: [clipped("same"), clipped("same")],
    } as Plot);
    const doc = plotToSvg(collide, DARK_THEME) ?? "";
    const ids = [...doc.matchAll(/<clipPath id="([^"]+)"/gu)].map((m) => m[1]);
    expect(ids.length, "the children clip, so there is something to collide").toBeGreaterThan(0); // cells-ok — a clip count
    expect(new Set(ids).size, "and no two clip paths share a name").toBe(ids.length); // cells-ok — a clip count

    // **The parent refuses only when no child draws** — C12 I64, and it is the
    // second claim here with no witness left: its fixture was two refused
    // children, and both draw. **A facet list that is empty is the one state
    // that still produces nothing**, so that is what stands in, and it tests the
    // same rule at the same seam: a document with nothing on it is refused
    // wherever it came from.
    const nothing = block({
      kind: "plot", id: "none", form: "pairplot", height: 10, axes: true, series: [],
      facets: [],
    } as Plot);
    expect(plotToSvg(nothing, DARK_THEME), "nothing on the page is refused").toBeNull();
    // And two drawable children are not — the other side, so the row above is
    // not passing because compositions always refuse.
    const two = block({
      kind: "plot", id: "two", form: "pairplot", height: 10, axes: true, series: [],
      facets: [kid("violin", "x"), kid("ridgeline", "y")],
    } as Plot);
    expect(plotToSvg(two, DARK_THEME), "and a pair that both draw is not").not.toBeNull();
  });

  it("U8b (C12 I70, §3ak.29): each of the three is idempotent, because two callers now apply it", () => {
    // **`plotToSvg` derives at its entry and `heatmapFormRows` derives at its
    // own**, and nothing composes them today — but the property is what makes
    // that safe to stop checking, and it is cheap. `fieldAxes` is the one that
    // could have failed: applied twice it sees labels it wrote itself, and the
    // guard is that `named` is then true.
    for (const spec of [
      { form: "contour", height: 4, axes: true, series: [{ values: [1, 2] }, { values: [3, 4] }] },
      { form: "quiver", height: 4, axes: true, series: [], vectors: [{ values: [[3, 4] as const] }] },
      {
        form: "calendar", height: 8, calendarUnit: "day", startDate: "2026-01-01",
        series: [{ values: [1, 2, 3, 4, 5, 6, 7, 8] }],
      },
    ] as const) {
      const once = drawnBlock(blockOf(spec as unknown as Spec));
      expect(drawnBlock(once), `${spec.form} applied twice`).toEqual(once);
    }
  });
});
