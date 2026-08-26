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
import { plotToSvg, svgFamilyOf } from "../../src/presentation/plot/svg.js";
import {
  barFigure, curveFigure, distributionFigure, matrixFigure, scatterFigure, tilesFigure,
  type Figure,
} from "../../src/presentation/plot/figure.js";
import { cells, truncate } from "../../src/presentation/text.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const capsNamed = (n: string): Record<string, unknown> => caps.find((c) => c.name === n)!.caps;
const WIDTH = 60;

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
    // **Still unread, and these are the remaining two of F286's three.**
    // `identity` is D10, the identity axis; `legend` is D13. 19 and 7 open cells.
    identity: { terminal: "moves", svg: "still" },
    legend: { terminal: "moves", svg: "still" },
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
    for (const [member, p] of Object.entries(PERTURBATION)) {
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
    expect(measured).toEqual(CONSUMERS);
  });

  it("U1a2 (C12 I59, §3ak.16): the three unread members, counted over the corpus", () => {
    // **Measured rather than argued**, and each count is the row's own size. A
    // green sweep says nothing about how much it swept.
    let drawn = 0;
    let gutterFamilies = 0;
    let legendDrawn = 0;
    let identityDrawn = 0;
    for (const { spec, family } of corpus()) {
      if (family === null || family === "nodes") continue;
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
    expect(drawn, "drawn SVG documents").toBe(86); // cells-ok — a document count
    expect(legendDrawn, "documents drawing a legend label — D13 open").toBe(0); // cells-ok — a document count
    expect(gutterFamilies, "documents in the five families the terminal gutters").toBe(83); // cells-ok — a document count
    expect(identityDrawn, "documents drawing an identity string — D10 open").toBe(0); // cells-ok — a document count
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
  const ELEMENT_FOR = {
    polyline: /<(?:polyline|path)\b/gu,
    point: /<(?:circle|polygon|rect)\b/gu,
    rect: /<rect\b/gu,
    text: /<text\b/gu,
  } as const;

  function shortfall(spec: Spec, family: WalkedFamily): readonly string[] {
    const b = blockOf(spec);
    const svg = plotToSvg(b, DARK_THEME);
    if (svg === null) return [];
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
      if (family === null || family === "nodes") continue;
      if (seen.has(spec["form"] as string)) continue;
      seen.add(spec["form"] as string);
      for (const s of shortfall(spec, family as WalkedFamily)) short.push(`${bucket}/${variant} ${s}`);
    }
    expect(short).toEqual([]);
    expect(seen.size, "distinct forms walking a figure").toBe(25); // cells-ok — a form count
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
      if (family === null || family === "nodes") continue;
      checked += 1;
      for (const s of shortfall(spec, family as WalkedFamily)) short.push(`${bucket}/${variant} ${s}`);
    }
    expect(short).toEqual([]);
    expect(checked, "variants walking a figure").toBe(103); // cells-ok — a variant count
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
      if (family === null || family === "nodes") continue;
      checked += 1;
      const json = JSON.stringify(EMITTER[family as WalkedFamily](blockOf(spec)));
      expect(json, `${bucket}/${variant} carries a resolved colour`).not.toMatch(/#[0-9a-f]{6}/iu);
    }
    expect(checked, "figures checked for a resolved colour").toBe(103); // cells-ok — a variant count
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
    expect(forms, "forms traced").toBe(46); // cells-ok — a form count

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
    expect(tally).toEqual([
      { same: 1, colour: 45, glyph: 0, layout: 0 },
      { same: 1, colour: 21, glyph: 3, layout: 21 },
      { same: 0, colour: 0, glyph: 37, layout: 9 },
      { same: 1, colour: 0, glyph: 36, layout: 9 },
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
});
