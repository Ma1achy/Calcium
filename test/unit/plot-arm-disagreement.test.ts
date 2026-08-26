/**
 * AD1–AD5 — **the disagreement list, measured over the full corpus** (step 1 of
 * the arm unification pass; `CALCIUM_ARM_UNIFICATION.md` §6.0).
 *
 * *Three disagreements were found by building; the rest are found by looking*,
 * and the list is the specification. Looking at `ONE_PER_FORM` at one width and
 * one capability set found **sixteen**. Looking at `CATALOGUE_FORMS` — every
 * form, every variant, both widths — finds **73 of 135 cells over the 27 forms
 * the SVG arm claims, 59 of them disagreeing everywhere.**
 *
 * ## This is walk artefact A, and it is a classification table
 *
 * CLAUDE.md's rule: a trace finds *event-mediated* interactions, a table finds
 * *structural* ones — two rules that both hold at rest, with no event between
 * them. Every cell here is `(form, decision)`: *this form is a bar chart* meets
 * *this decision is which way the value axis runs*, and the two arms answer
 * separately. No sequence produces them; they are true standing still. The trace
 * is owed separately and is U6, where the capability rungs supply the events.
 *
 * ## Both sides are read out of output
 *
 * `test/support/arm-decisions.ts` carries the reason and the blind spots. The
 * short version: asking each arm's own decision function is asking one question
 * twice, and those functions are what step 3 moves — a sweep written against
 * them would keep passing across the move whatever the frames did.
 *
 * ## The comparison is at 24-bit, and that is §2's rule rather than convenience
 *
 * The SVG arm has no capability ladder. *So the arms are not comparable below
 * 24-bit*, and every cross-arm assertion compares there or compares the drawing.
 * The other four rungs are not skipped — they are **U6's** subject, which
 * measures which forms actually degrade, and that is a different question from
 * this one.
 *
 * ## A disposition is a relation, not a label
 *
 * The record below is the specification, so it is the thing that goes stale. A
 * test runs; prose beside it does not. So each cell states **what the row
 * asserts**, and there are three:
 *
 * | disposition | the row asserts | it fails when |
 * |---|---|---|
 * | `agree` — closed | the arms agree on this decision | the SVG drifts back |
 * | `n/m` — open | they differ **exactly as recorded** | it closes silently, or becomes a *different* disagreement |
 * | `legitimate` | they differ, and always will | they ever start agreeing |
 *
 * The middle one is what makes the pass legible. An open disagreement that
 * closes without a commit saying so is indistinguishable from one that was never
 * there, and one that mutates into a neighbouring disagreement reads as
 * unchanged. Recording `64/70` rather than *differs* is what separates them.
 *
 * **`legitimate` has no instance, and that is a fact about the instrument rather
 * than about the arms.** §2's closed list of legitimate differences is the
 * rasteriser, the resolution, the stroke width, the font metrics and the ladder
 * — all of them about *how ink lands*. Every decision measured here is from the
 * other column, the one §2 says must be identical. So the disposition exists,
 * is asserted empty, and the day a cell claims it the claim has to be argued.
 */
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";
import { svgFamilyOf } from "../../src/presentation/plot/svg.js";
import { terminalDecisions, svgArm, terminalRamp, svgRamp, saysWithheld, type ArmDecisions } from "../support/arm-decisions.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id: string) => readonly string[];
const FULL = caps.find((c) => c.name === "24bit")!.caps;

/** The widths the sweep crosses — the baseline fixture's own pair. */
const WIDTHS = [40, 80] as const;

/**
 * The decisions compared, and every one is from §2's *must be identical* column.
 *
 * Named as a tuple so the record below cannot quietly grow a sixth key that
 * nothing asserts.
 */
// **Seven, and it was five** (F316). `ramp` and `notice` are decisions the arms
// make differently that no cell asked about: the matrix family draws a colour
// key under every terminal frame and none under any SVG, and the terminal says
// what it withheld where the second arm has nothing to withhold. A rule table is
// exhaustive over the rules you stated and blind to one you did not.
const DECISIONS = ["numericLabels", "identityLabels", "border", "interiorRules", "legend", "ramp", "notice"] as const;
type Decision = (typeof DECISIONS)[number];

/**
 * The decisions whose differences are **legitimate** — §2's closed list, keyed.
 *
 * **`legitimate` is a disposition and not a cell value here**, and the
 * measurement is why: the terminal withholds only where a frame is too small, so
 * `heatmap.notice` is `4/8` — four pairs differ and four agree. A blanket cell
 * would be false about the four, and a fraction alone says nothing about whether
 * the difference is work owed. So the cells stay measured and the disposition is
 * named once, here.
 *
 * The claim it carries is *they differ and always will*: the terminal drops
 * columns because a cell is a quantum, and the second arm scales its box across
 * whatever it is given and has **nothing to drop** (F318). `AD8` asserts it in
 * the direction that can fail — the day this reads `agree` everywhere, the SVG
 * has grown a drop rule and the seam is leaking the other way.
 */
const LEGITIMATE: ReadonlySet<Decision> = new Set<Decision>(["notice"]);

type Cell = "agree" | "legitimate" | `${number}/${number}`;
type Claimed = Readonly<{ silent: string } & Record<Decision, Cell>>;
type Record_ = "refused" | Claimed;

/**
 * The measurement, as it stands.
 *
 * **A `Record<PlotForm, …>`**, so a form added to the union fails to compile
 * until someone measures it — the same mechanism `CATALOGUE_FORMS` and
 * `ONE_PER_FORM` use, and the reason the corpus did not drift to 26 of 34 again.
 *
 * `silent` is the pairs where the SVG **claims the form and draws nothing** —
 * F259's *refuse a false figure, record an incomplete one*, counted rather than
 * described. `line` at 16 of 86 is the `ohlc` and non-default-`origin` variants.
 */
const MEASURED = {
  // **`line.interiorRules` went 68/70 to 70/70 when the SVG's axis became the
  // figure's — a disagreement WIDENING, and the record says so rather than
  // rounding it toward the story.** The tick count is `ticksFor(areaRows)` now
  // instead of a hardcoded five, so two variants that had drawn no interior rule
  // draw one. The cell is honest and the direction is not the pass's direction;
  // this row exists to make that visible instead of arguable.
  //
  // **And it is one cell against seventy-two moved frames** (F275). The same
  // commit changed the axis on every ticked form — `1 2 3 4 5` to `0 2 4 6`, the
  // terminal's own — and this matrix, which compares five *decisions*, could
  // report only this. It is a decision gate; `test/golden/svg-baseline/` is the
  // picture gate, and the two answer different questions on purpose.
  "line": { silent: "16/86", "numericLabels": "62/70", "identityLabels": "51/70", "border": "2/70", "interiorRules": "4/70", "legend": "16/70", "ramp": "agree", "notice": "agree" },
  "sparkline": { silent: "2/8", "numericLabels": "6/6", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "scatter": { silent: "2/12", "numericLabels": "10/10", "identityLabels": "6/10", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "step": { silent: "2/6", "numericLabels": "4/4", "identityLabels": "2/4", "border": "agree", "interiorRules": "2/4", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "ecdf": { silent: "2/4", "numericLabels": "2/2", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "heatmap": { silent: "4/12", "numericLabels": "agree", "identityLabels": "6/8", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "8/8", "notice": "4/8" },
  "contour": "refused",
  "quiver": "refused",
  "bar": { silent: "2/14", "numericLabels": "10/12", "identityLabels": "2/12", "border": "agree", "interiorRules": "6/12", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "histogram": { silent: "0/12", "numericLabels": "12/12", "identityLabels": "10/12", "border": "agree", "interiorRules": "2/12", "legend": "agree", "ramp": "agree", "notice": "6/12" },
  "boxplot": { silent: "0/10", "numericLabels": "8/10", "identityLabels": "1/10", "border": "agree", "interiorRules": "6/10", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "forest": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "dumbbell": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "lollipop": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "dotplot": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "waffle": { silent: "0/6", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "flame": { silent: "2/4", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "icicle": { silent: "2/4", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "funnel": "refused",
  "gantt": "refused",
  "waterfall": "refused",
  "slope": "refused",
  "bubble": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "autocorrelation": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "timeline": "refused",
  "bullet": "refused",
  "utilisation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "2/2", "notice": "agree" },
  "graph": { silent: "0/4", "numericLabels": "agree", "identityLabels": "4/4", "border": "agree", "interiorRules": "2/4", "legend": "4/4", "ramp": "agree", "notice": "2/4" },
  "tree": { silent: "4/12", "numericLabels": "agree", "identityLabels": "6/8", "border": "agree", "interiorRules": "2/8", "legend": "6/8", "ramp": "agree", "notice": "4/8" },
  "treemap": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "stackedarea": "refused",
  "streamgraph": "refused",
  "calendar": "refused",
  "correlation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "2/2", "notice": "agree" },
  "confusion": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "2/2", "notice": "agree" },
  "spectrogram": { silent: "0/4", "numericLabels": "agree", "identityLabels": "1/4", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "4/4", "notice": "1/4" },
  "latency": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "2/2", "legend": "agree", "ramp": "2/2", "notice": "2/2" },
  "density2d": { silent: "0/2", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "2/2", "notice": "1/2" },
  "density": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "4/4", "border": "agree", "interiorRules": "3/4", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "violin": "refused",
  "ridgeline": "refused",
  "smallmultiples": "refused",
  "pairplot": "refused",
  // **The proportion family, and eighteen of its twenty cells agree on the day
  // it lands** (§3ak.26). The three renderers were the terminal's own
  // computations moved, so agreement here is the extraction's property
  // rather than a result — and the two cells that do not agree are the
  // interesting half.
  //
  // **`legend: 2/8` is a room test in two unit systems.** At width 40 a disc
  // of eighteen rows is 36 columns wide, so `withLegend` is false and the
  // terminal drops the key; this arm reserves a fifth of 640 px and always
  // has room. C12 I63's shape — the threshold is shared and the outcome is
  // each arm's — on a decision that is *whether to draw at all*.
  //
  // **And getting here took fixing the reader twice** (F307). Measured before
  // that: `legend` was `false` on all twenty and the key's names were filed
  // as `identityLabels`, because the terminal reader could see a legend only
  // as a whole row or past a frame edge — and these three draw no border and
  // put the key beside the figure. Five cells on four *other* forms closed
  // with it, every one of them narrowing.
  "pie": { silent: "0/10", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "2/10", "ramp": "agree", "notice": "agree" },
  // **Every cell agrees, including the value axis** — `radarCeiling` became
  // `valueAxisOf` and both arms normalise against the same ceiling (F304).
  "radar": { silent: "0/8", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "notice": "agree" },
  "horizon": "refused",
} as const satisfies Readonly<globalThis.Record<PlotForm, Record_>>;

/** One arm-pair for a spec, at a width. */
function pairAt(spec: Record<string, unknown>, width: number): Readonly<{ t: ArmDecisions; s: ArmDecisions }> {
  const { cursor, ...rest } = spec as { cursor?: unknown };
  void cursor;
  return {
    // **The frame with its colours in it** (F316): the ramp *is* coloured
    // spaces, so a reader on stripped text sees a blank figure and no key.
    t: terminalDecisions(frame(spec, FULL, width, "p")),
    s: svgArm(block({ kind: "plot", id: "p", ...rest } as never), DARK_THEME),
  };
}

const same = (a: readonly string[] | number | boolean, b: readonly string[] | number | boolean): boolean =>
  (Array.isArray(a) ? a.join(",") : String(a)) === (Array.isArray(b) ? b.join(",") : String(b));

/** The corpus measured now, in the shape the record is written in. */
function measureNow(): globalThis.Record<string, Record_> {
  const out: globalThis.Record<string, Record_> = {};
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    if (svgFamilyOf(form as PlotForm) === null) { out[form] = "refused"; continue; }
    const tally = new Map<Decision, { agree: number; differ: number }>(
      DECISIONS.map((d) => [d, { agree: 0, differ: 0 }]),
    );
    let silent = 0;
    let pairs = 0;
    for (const spec of Object.values(variants as globalThis.Record<string, Record<string, unknown>>)) {
      for (const width of WIDTHS) {
        pairs += 1;
        const { t, s } = pairAt(spec, width);
        if (!s.drawn) { silent += 1; continue; }
        for (const d of DECISIONS) {
          const r = tally.get(d)!;
          if (same(t[d], s[d])) r.agree += 1; else r.differ += 1;
        }
      }
    }
    const cells = {} as globalThis.Record<Decision, Cell>;
    for (const d of DECISIONS) {
      const r = tally.get(d)!;
      cells[d] = r.differ === 0 ? "agree" : (`${String(r.differ)}/${String(r.agree + r.differ)}` as Cell);
    }
    out[form] = { silent: `${String(silent)}/${String(pairs)}`, ...cells };
  }
  return out;
}

describe("AD — the two arms decide separately, and here is where", () => {
  const now = measureNow();

  it("AD1 (step 1): every cell is exactly what the record says, in both directions", () => {
    // **One comparison carries both relations.** A `agree` cell that starts
    // differing fails here, and an `n/m` cell that closes — or that becomes a
    // *different* `n/m` — fails here too. That is what makes the disposition a
    // relation rather than a comment beside one.
    expect(now).toEqual(MEASURED);
  });

  it("AD2 (step 1): the refusal set is exactly the forms the SVG arm does not claim", () => {
    const recorded = Object.entries(MEASURED).filter(([, v]) => v === "refused").map(([k]) => k).sort();
    const actual = Object.keys(CATALOGUE_FORMS)
      .filter((f) => svgFamilyOf(f as PlotForm) === null).sort();
    // Equality, not containment: a form quietly dropped from the SVG's union
    // would otherwise read as a form that was always refused.
    expect(recorded).toEqual(actual);
  });

  it("AD3 (step 1): a cell claims `legitimate` only where the record names the decision", () => {
    // §2's legitimate list is the rasteriser, the resolution, the stroke width,
    // the font metrics and the ladder — every one about how ink lands. Six of
    // the seven decisions here are from the column that must be identical, so a
    // `legitimate` cell on one of them would be a claim needing an argument.
    // **`notice` is the seventh and it has one** (F318), carried by `LEGITIMATE`
    // rather than by a cell value, for the reason written there.
    const claiming = Object.entries(MEASURED).flatMap(([form, v]) =>
      v === "refused" ? [] : DECISIONS.filter((d) => (v[d] as Cell) === "legitimate").map((d) => `${form}|${d}`));
    expect(claiming.filter((k) => !LEGITIMATE.has(k.split("|")[1] as Decision)),
      "a legitimate cell needs a stated reason from §2's closed list").toEqual([]);
  });

  it("AD8 (F316, F318): the two new columns say what they were added to say", () => {
    // **A column that agrees everywhere is a column that measures nothing**, and
    // both of these were added because the record could not see a difference the
    // sheet showed in a second. Asserted in the direction that can fail.
    const claimed = (Object.entries(MEASURED) as readonly (readonly [string, Record_])[])
      .flatMap(([f, v]) => (v === "refused" ? [] : [[f, v as Claimed] as const]));
    const differing = (d: Decision): string[] => claimed.filter(([, v]) => v[d] !== "agree").map(([f]) => f);

    // **Every pair, on every one of them** — the terminal draws a key under each
    // matrix-family frame and the second arm draws none at all (0 of 181).
    const ramp = differing("ramp");
    expect(ramp.sort(), "the matrix family, and nothing else")
      .toEqual(["confusion", "correlation", "density2d", "heatmap", "latency", "spectrogram", "utilisation"]);
    for (const f of ramp) {
      const cell = ((MEASURED as globalThis.Record<string, Record_>)[f] as Claimed).ramp;
      const [differ, total] = String(cell).split("/");
      expect(differ, `${f}: every pair, not some`).toBe(total);
    }

    // **The legitimate one, asserted so it can fail.** It differs today; it will
    // read `agree` everywhere the day the SVG grows a drop rule, and that is a
    // change to the seam rather than a repair.
    expect(differing("notice").length, "the terminal says what it withheld and the SVG does not")
      .toBeGreaterThan(0); // cells-ok — a form count
  });

  it("AD4 (step 1): the headline figures, so the specification reports its own size", () => {
    // **A count, because a green sweep says nothing about how much it swept.**
    // These are the numbers the pass is measured against, and they move as it
    // lands — every move read rather than adjusted.
    //
    // **A refused form has no cells at all**, so refusing one is not a way to
    // close cells and claiming one is not a regression.
    //
    // **150 → 210 with F316's two columns**, and the split is what the columns
    // were added for: `ramp` puts **30** new cells on the board of which 7 are
    // open — every matrix-family pair, the terminal drawing a key and the second
    // arm drawing none — and `notice`'s 30 are legitimate rather than owed
    // (F318), so they are counted apart instead of inflating the work.
    const claimed = (Object.values(MEASURED) as readonly Record_[]).filter((v): v is Claimed => v !== "refused");
    let open = 0;
    let closed = 0;
    let legitimate = 0;
    for (const v of claimed) {
      for (const d of DECISIONS) {
        if (LEGITIMATE.has(d)) { legitimate += 1; continue; }
        if (v[d] === "agree") closed += 1; else open += 1;
      }
    }
    expect(claimed.length, "forms the SVG arm claims").toBe(30); // cells-ok — a form count
    expect(Object.values(MEASURED).length - claimed.length, "forms it refuses").toBe(16); // cells-ok — a form count
    expect(open + closed + legitimate, "cells over claimed forms").toBe(210); // cells-ok — a cell count
    expect(legitimate, "cells whose difference is a resolution fact, not work owed").toBe(30); // cells-ok — a cell count
    expect(open, "cells where the arms disagree — the work the pass has to do").toBe(55); // cells-ok — a cell count
    expect(closed, "cells where they already agree — the work it must not undo").toBe(125); // cells-ok — a cell count
  });

  it("AD5 (step 1): the instrument responds to a decision moving", () => {
    // **A sweep certified only by its own record agrees with itself whatever it
    // does** (`test/support/README.md`). So: take a form the record says agrees
    // on `numericLabels` and make the two arms disagree, by handing the terminal
    // side a frame it did not draw.
    const heat = Object.values(CATALOGUE_FORMS.heatmap as globalThis.Record<string, Record<string, unknown>>)[0]!;
    const { t, s } = pairAt(heat, 80);
    expect(same(t.numericLabels, s.numericLabels), "the record says heatmap agrees here").toBe(true);
    const moved = terminalDecisions([...frame(heat, FULL, 80, "p"), "  0.5 \u2524 x"]);
    expect(same(moved.numericLabels, s.numericLabels), "and the comparison sees it move").toBe(false);
  });

  it("AD6 (F316): the ramp reader answers both ways, on both arms", () => {
    // **A new reader owes a fabricated violation in each direction**, and this
    // one owes it twice over: it went through three drafts, two of which gave a
    // defensible number for a reason that was not the rule.
    //
    // A key is bracketed by its bounds and a figure is not — which is the whole
    // of the predicate, on both arms.
    const sw = (rgb: string): string => `\u001b[48;2;${rgb}m `;
    const bar = ["68;1;84", "54;92;141", "31;161;135", "253;231;37"].map(sw).join("");
    expect(terminalRamp(`0.19 ${bar}\u001b[49m 100`), "bracketed by its bounds").toBe(true);
    expect(terminalRamp(`0.19 ${bar}\u001b[49m`), "and one bound is a figure with a label").toBe(false);
    expect(terminalRamp(`0.19 ${sw("68;1;84")}\u001b[49m 100`), "one swatch is a swatch").toBe(false);
    // **The heatmap's own cells are a run of swatches too**, so the reader is
    // asked the case that would collapse it: same alphabet, no bounds.
    const cells = ["68;1;84", "54;92;141", "31;161;135"].map(sw).join("");
    expect(terminalRamp(`row4 \u2524${cells}\u001b[49m`), "the figure is not the key").toBe(false);

    const rects = [0, 1, 2].map((i) =>
      `<rect x="${String(100 + i * 20)}" y="200" width="20" height="14" fill="#${String(i)}0${String(i)}0${String(i)}0"/>`).join("");
    const ends = '<text x="80" y="211">0.19</text><text x="170" y="211">100</text>';
    expect(svgRamp(`<svg>${rects}${ends}</svg>`), "three touching swatches between two readings").toBe(true);
    expect(svgRamp(`<svg>${rects}</svg>`), "unbracketed is a figure").toBe(false);
    expect(svgRamp('<svg><defs><linearGradient id="g"/></defs></svg>'), "a gradient needs no bracket").toBe(true);
    // **The second draft's false negative, kept as a row.** A heatmap draws 450
    // touching rects of differing fill and read `false` because sorting every
    // row into one list by `x` broke the run at its second element — the right
    // answer for a reason that would not survive a single-row matrix.
    const grid = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) =>
      `<rect x="${String(100 + c * 20)}" y="${String(200 + r * 14)}" width="20" height="14" fill="#${String(c)}0${String(r)}0${String(c)}0"/>`)).join("");
    expect(svgRamp(`<svg>${grid}</svg>`), "a grid of cells is not a key").toBe(false);
    expect(svgRamp(`<svg>${grid}${ends}</svg>`), "and it is one when its row is bracketed").toBe(true);
  });

  it("AD7 (F316, F318): the notice reader sees both vocabularies", () => {
    // **One predicate for both halves of the same statement**: C12 I8's `+N more`
    // and the matrix's drop notice are the same claim in two words, and a column
    // that saw one would report the axis as covered.
    expect(saysWithheld("             \u2502+2 more \u00b7 [67.7, 76.4)"), "C12 I8's").toBe(true);
    expect(saysWithheld("0.19  100 \u00b7 16 older not shown"), "the matrix's").toBe(true);
    expect(saysWithheld("\u001b[38;2;98;98;98m+4 more\u001b[39m"), "through its colours").toBe(true);
    expect(saysWithheld("0.19  100"), "and a frame that withheld nothing says nothing").toBe(false);
    expect(saysWithheld("more"), "the count is what makes it a notice").toBe(false);
  });
});
