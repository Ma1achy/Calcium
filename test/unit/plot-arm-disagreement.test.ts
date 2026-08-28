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
import { plotToSvg, svgFamilyOf } from "../../src/presentation/plot/svg.js";
import { RAMP_DEFAULT } from "../../src/presentation/plot/figure.js";
import { terminalDecisions, svgArm, svgDecisions, terminalRamp, svgRamp, saysWithheld, type ArmDecisions } from "../support/arm-decisions.js";
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
const DECISIONS =
  ["numericLabels", "identityLabels", "border", "interiorRules", "legend", "ramp", "keyReadings", "notice"] as const;
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
  // **78 pairs where there were 70** (§3ak.31): the four candlestick variants
  // drew on both sides, so eight cells that had been `silent` are compared —
  // and `silent` fell 16 to 8 without a renderer moving on the terminal side.
  // The four that opened are the candles' own furniture, which no cell of this
  // matrix had ever seen.
  "line": { silent: "8/86", "numericLabels": "66/78", "identityLabels": "13/78", "border": "4/78", "interiorRules": "12/78", "legend": "14/78", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "sparkline": { silent: "2/8", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "scatter": { silent: "2/12", "numericLabels": "8/10", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "step": { silent: "2/6", "numericLabels": "2/4", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "ecdf": { silent: "2/4", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "heatmap": { silent: "4/12", "numericLabels": "agree", "identityLabels": "6/8", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "4/8" },
  // **The residue's two, drawn** (§3ak.29). `identityLabels` closed with F326 —
  // both readers ask the shape now — and `ramp` is F316's open column on the
  // family that has always had one. `numericLabels` is the terminal reader's
  // stated limit and not the arm's: its x-row scan is gated on a bottom rule, a
  // field draws none, so its numeric set is the gutter's six where this arm's is
  // the axis's three. Both arms draw both axes. Widening the boundary to *the
  // last edge-bearing line* was measured and rejected: it moves cells in both
  // directions across five other forms, which is a different reader rather than
  // a repair.
  "contour": { silent: "0/18", "numericLabels": "18/18", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "quiver": { silent: "0/12", "numericLabels": "12/12", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "bar": { silent: "2/14", "numericLabels": "10/12", "identityLabels": "2/12", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "histogram": { silent: "0/12", "numericLabels": "12/12", "identityLabels": "10/12", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "6/12" },
  "boxplot": { silent: "0/10", "numericLabels": "8/10", "identityLabels": "1/10", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "forest": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "agree", "border": "agree", "interiorRules": "2/4", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  //  closed with F326: its two categories are `1` and `2`,
  // numerals that the clip-path rule filed as names on one side only.
  "dumbbell": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "lollipop": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "dotplot": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "waffle": { silent: "0/6", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "flame": { silent: "2/4", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "icicle": { silent: "2/4", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "funnel": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "gantt": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **Family 8's aggregating three, and one fold serves them** (§3ak.33).
  // `waterfall` agrees about everything but the gutter's numbers, which is
  // the terminal reader's stated limit — the frame's numeric row sits below a
  // bottom rule the reader finds, so the two sets are the axis's against the
  // axis's plus the identity's.
  "waterfall": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **`slope` is the curve family, and its refusal reason described a chart this
  // component does not draw** (§3ak.35, F332). `numericLabels 4/4` is the
  // position axis: the terminal reads `0.0 … 1.0` and this arm reads nothing,
  // because a slope's two columns are named by the caller and neither fixture
  // names them.
  "slope": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "bubble": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "autocorrelation": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "2/2", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **The last two of family 8's residue** (§3ak.35). `timeline` is the one form
  // whose rows are series, pinned to its own range so the marks and the labels
  // come from one axis; `bullet` has no axis at all, because its three rows are
  // three quantities in three units (C12 I73).
  "timeline": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "bullet": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "utilisation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "graph": { silent: "0/4", "numericLabels": "agree", "identityLabels": "4/4", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "2/4" },
  "tree": { silent: "0/12", "numericLabels": "agree", "identityLabels": "8/12", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "6/12" },
  "treemap": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "stackedarea": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "streamgraph": { silent: "0/6", "numericLabels": "6/6", "identityLabels": "2/6", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **The matrix family's eighth, and the only one that needed a derivation to
  // get here** (§3ak.32). `ramp` is F316's column; `notice` is F318's legitimate
  // difference arriving on a third form — a calendar drops leading columns
  // because a cell is a quantum and 365 days do not fit in 62 of them, and this
  // arm scales its 640 px across whatever it is given. `identityLabels` 3/12 is
  // the same drop read through another column: the terminal's notice names the
  // dates it withheld.
  //
  // **`numericLabels` 2/12 → agree, and the fix was in the reader** (F338). The
  // key's bounds were excluded by **body**, so a `0` and a `12` anywhere else in
  // the figure went with them and this arm reported two labels short of the
  // terminal. Excluding by *position* — the texts on the key bar's own foot —
  // takes the two that are the key's and leaves the two that are the calendar's.
  // The same defect would have opened `horizon.numericLabels` at 2/10 the day
  // the signed key named its fold `0`, which is how it was found.
  "calendar": { silent: "0/12", "numericLabels": "agree", "identityLabels": "3/12", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "3/12" },
  "correlation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "confusion": { silent: "0/2", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "spectrogram": { silent: "0/4", "numericLabels": "agree", "identityLabels": "1/4", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "1/4" },
  "latency": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "2/2" },
  "density2d": { silent: "0/2", "numericLabels": "agree", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "1/2" },
  "density": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "violin": "refused",
  "ridgeline": "refused",
  // **The compositions, which are whatever their children are** (§3ak.36). Both
  // recurse into `plotToSvg`, so a facet holding a refused form leaves its column
  // empty and its siblings draw — the terminal's own answer, read out of
  // `smallMultiplesRows` rather than chosen.
  "smallmultiples": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  "pairplot": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "1/2", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
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
  "pie": { silent: "0/10", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "2/10", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **Every cell agrees, including the value axis** — `radarCeiling` became
  // `valueAxisOf` and both arms normalise against the same ceiling (F304).
  "radar": { silent: "0/8", "numericLabels": "agree", "identityLabels": "agree", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
  // **The residue's third, drawn** (§3ak.29). Both open cells have **one** cause
  // and it is F316's: the second arm draws no ramp key. `ramp` is that directly —
  // 8 of 10, because `terminalRamp` wants three adjacent swatches and a two-band
  // key has two, which is the reader's threshold answering correctly — and
  // `identityLabels` is the same absence read through another column: the
  // terminal's key is `0.0038  100  3 bands` and `bands` is a word.
  "horizon": { silent: "0/10", "numericLabels": "agree", "identityLabels": "10/10", "border": "agree", "interiorRules": "agree", "legend": "agree", "ramp": "agree", "keyReadings": "agree", "notice": "agree" },
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

/**
 * **Every variant's two frames at 80 columns** — the collision sweep's corpus
 * (C12 I75, F349, F357).
 *
 * **Not the committed baselines and not the catalogue.** The catalogue's frames
 * open with a header naming the form and the variant, and a first measurement of
 * this taken over them read *182 of 182 distinct* — a perfect score manufactured
 * by the corpus's own labelling, which C12 I75 records as the instrument's near-miss.
 * These are built in memory with a constant `id`, so nothing in a frame names
 * which variant produced it.
 *
 * **A refusal is a frame** — `svg-baseline.mjs`' rule, for the same reason: a
 * form that starts or stops drawing has to show up as a change rather than as a
 * missing entry. It is also, correctly, a collision with every other refusal,
 * which is why the counts below are reported inside and outside the largest
 * group.
 */
function corpusFrames(): ReadonlyMap<string, Readonly<{ t: string; s: string }>> {
  const out = new Map<string, Readonly<{ t: string; s: string }>>();
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    const vs = variants as globalThis.Record<string, Record<string, unknown>>;
    for (const [variant, spec] of Object.entries(vs)) {
      const { cursor, ...rest } = spec as { cursor?: unknown };
      void cursor;
      const svg = plotToSvg(block({ kind: "plot", id: "p", ...rest } as never), DARK_THEME);
      out.set(`${form}/${variant}`, {
        t: frame(spec, FULL, 80, "p").join("\n"),
        s: svg ?? "REFUSED",
      });
    }
  }
  return out;
}

/**
 * The variants that share a frame, grouped — **and the largest group dropped,
 * because the empty document and the refusal both land in it and both are
 * correct** (C12 I75).
 *
 * **The groups and not a count**, which is the difference between an instrument
 * that says *something is dropped* and one that says *which*. A count moves when
 * a field starts crossing and moves the same amount when a variant is deleted.
 */
function collisionsIn(
  keyed: ReadonlyMap<string, string>,
): Readonly<{ distinct: number; groups: readonly (readonly string[])[] }> {
  const groups = new Map<string, string[]>();
  for (const [name, f] of keyed) (groups.get(f) ?? groups.set(f, []).get(f)!).push(name);
  const shared = [...groups.values()].filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
  return { distinct: groups.size, groups: shared.slice(1) };
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

    // **The column closed, so the assertion is inverted rather than deleted**
    // (§3ak.37). It used to read *every pair the terminal draws a key on, and
    // the second arm draws none at all* — 0 of 181 — and now every one of the
    // eleven agrees. A cell that agrees because **neither** arm draws is
    // indistinguishable from one that agrees because **both** do, and only the
    // second is what closing it meant, so this asks the arms rather than the
    // record: both must draw a key, on every pair, for every form whose readings
    // are a colour.
    //
    // **`horizon`'s exception went with it.** `terminalRamp` wants three adjacent
    // swatches and `bands-2`'s key has two, so it reads `false` on that side —
    // and this arm draws **one swatch per band**, because a horizon's reading
    // really is quantised, so it reads `false` too. The reader's floor is still
    // the reader's floor; what changed is that both arms are now under it
    // together, for the form's own reason.
    expect(differing("ramp"), "the column closed — no form's key differs now").toEqual([]);
    const withRamp = (Object.keys(RAMP_DEFAULT) as readonly PlotForm[])
      .filter((f) => RAMP_DEFAULT[f] !== null && svgFamilyOf(f) !== null);
    expect(withRamp.sort(), "every family whose readings are a colour, and nothing else")
      .toEqual(["calendar", "confusion", "contour", "correlation", "density2d", "heatmap", "horizon",
        "latency", "quiver", "spectrogram", "utilisation"]);
    let bothDrew = 0; // cells-ok — a pair count
    let neither = 0; // cells-ok — a pair count
    let refusedVariants = 0; // cells-ok — a pair count
    for (const f of withRamp) {
      for (const spec of Object.values((CATALOGUE_FORMS as globalThis.Record<string, globalThis.Record<string, Record<string, unknown>>>)[f] ?? {})) {
        const { t, s: sv } = pairAt(spec as never, 80);
        // **A variant this arm refuses is not a key disagreement**, and the
        // record does not treat it as one: `heatmap/origin` asks for
        // `bottom-right` and `plotToSvg` refuses a non-default origin outright,
        // so the pair has no second figure to compare a key against. Counted
        // rather than skipped — an arm that stopped drawing would land here.
        if (!sv.drawn) { refusedVariants += 1; continue; } // cells-ok — a pair count
        if (t.ramp && sv.ramp) bothDrew += 1; // cells-ok — a pair count
        else if (!t.ramp && !sv.ramp) neither += 1; // cells-ok — a pair count
        else expect.fail(`${f}: one arm drew a key and the other did not`);
      }
    }
    // **Both counters, because the second is the exception and it must not
    // grow.** `horizon/bands-2` is the only pair where neither arm draws, and it
    // is the reader's floor rather than a missing key.
    expect(bothDrew, "pairs where both arms draw a key").toBe(36); // cells-ok — a pair count
    expect(neither, "and the one where the reader's floor hides both").toBe(1); // cells-ok — a pair count
    expect(refusedVariants, "and the variants this arm refuses outright").toBe(2); // cells-ok — a pair count

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
    //
    // **55 → 53 without a renderer moving** (F321). Drawing `treeLayout:
    // "outline"` compared four pairs that had been `silent`, and comparing them
    // showed the *reader* inventing a legend on every row of a tree and a graph:
    // `EDGE` matches `├`, so an indented outline read as a figure whose right
    // edge is column 0 with text past it. Ten cells were the instrument's and
    // two are the arm's.
    //
    // **210 → 224 with the residue's two forms** (§3ak.29), and the split is
    // what the drawing found. `contour` and `quiver` bring 14 cells: 4 open —
    // each form's `ramp`, which is F316's column on a family that has always had
    // a key, and each form's `numericLabels`, which is the terminal reader's
    // stated limit rather than the arm's — 8 closed and 2 legitimate.
    //
    // **And one cell closed on a form that was already drawing** (F326). The
    // second arm's reader classified a label by `clip-path` — *a clipped label
    // names a thing* — a fitting mechanism read as a semantic partition. It held
    // until a form's row captions were numbers, which is what `fieldAxes` makes;
    // removing it closed 27 cells and opened none, one of them `dumbbell`'s,
    // whose two categories are `1` and `2`.
    //
    // **224 → 231 with `horizon`**, whose 7 cells are 2 open, 4 closed and 1
    // legitimate — and both open ones are F316's column, once directly and once
    // as the key's own word landing in `identityLabels`.
    //
    // **50 → 49 with the interior-rule reader corrected, and six forms moved to
    // get there** (F358). The net is one cell and it is the least interesting
    // thing about it: `boxplot`, `density` and `smallmultiples` closed because
    // their disagreement was a *figure* glyph the reader counted as a rule, and
    // `autocorrelation` and `forest` opened because the terminal draws a real one
    // — significance bands, a reference line — that this arm does not. `line`
    // stayed open and went 8 to 12 for the same reason twice over. **A total
    // that barely moves is not evidence that nothing did**: 28 of the corpus's
    // 328 pairs changed disposition, and the old and new disagreeing sets are
    // disjoint.
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
    expect(claimed.length, "forms the SVG arm claims").toBe(44); // cells-ok — a form count
    expect(Object.values(MEASURED).length - claimed.length, "forms it refuses").toBe(2); // cells-ok — a form count
    expect(open + closed + legitimate, "cells over claimed forms").toBe(352); // cells-ok — a cell count
    expect(legitimate, "cells whose difference is a resolution fact, not work owed").toBe(44); // cells-ok — a cell count
    expect(open, "cells where the arms disagree — the work the pass has to do").toBe(49); // cells-ok — a cell count
    expect(closed, "cells where they already agree — the work it must not undo").toBe(259); // cells-ok — a cell count
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
    // **A gradient needs no bracket — but it does need something painted with
    // it** (F338). This asked for `<defs>` or `<linearGradient>` anywhere in the
    // document, which is a *declaration*: a ramp nothing references paints no
    // cell, and the reader would have called it a key. The rect that carries the
    // reference is the ramp; the `<defs>` above it is a name.
    const grad = '<defs><linearGradient id="g"/></defs>';
    expect(svgRamp(`<svg>${grad}<rect x="1" y="2" width="9" height="4" fill="url(#g)"/></svg>`),
      "a painted gradient needs no bracket").toBe(true);
    expect(svgRamp(`<svg>${grad}</svg>`), "and a declared one paints nothing").toBe(false);
    // **The second draft's false negative, kept as a row.** A heatmap draws 450
    // touching rects of differing fill and read `false` because sorting every
    // row into one list by `x` broke the run at its second element — the right
    // answer for a reason that would not survive a single-row matrix.
    const grid = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) =>
      `<rect x="${String(100 + c * 20)}" y="${String(200 + r * 14)}" width="20" height="14" fill="#${String(c)}0${String(r)}0${String(c)}0"/>`)).join("");
    expect(svgRamp(`<svg>${grid}</svg>`), "a grid of cells is not a key").toBe(false);
    expect(svgRamp(`<svg>${grid}${ends}</svg>`), "and it is one when its row is bracketed").toBe(true);
  });

  it("AD11 (F316, F297): a key is bracketed by readings and a legend by names, and the reader is not blind to either", () => {
    // **The cell to distrust while the ramp column closes.** `heatmap.legend`
    // has read `agree` throughout, and the reader's own note says why: *the SVG
    // having none, the terminal because its ramp is coloured spaces and the
    // reader took stripped text.* That is a description of a cell agreeing for
    // two different reasons, which is the shape F297 keeps arriving in — so the
    // question the ramp landing raises is whether `legend: false` is **wrong**
    // on the terminal side, and the answer has to be measured rather than
    // reasoned.
    //
    // **Measured over the whole corpus: 74 frames draw a key and report
    // `legend: false`, and *zero* frames carry a coloured-space swatch beside a
    // name.** So there is no legend the stripped-text scan is missing. A key is
    // `0.19 ▮▮▮▮▮▮▮▮ 100` — swatches bracketed by **readings**; a legend is
    // `█ alpha` — a swatch and a **name**. They are different marks answering
    // different questions, and after F316 they have a column each.
    // **Adjacent, with one reset at the end** — the terminal's own emission, and
    // the thing the reader keys on. A reset between each swatch breaks the run,
    // which is how this fabrication was wrong on its first attempt.
    const viridis = ["68;1;84", "59;82;139", "33;145;140", "253;231;37"];
    const run = (rgbs: readonly string[]): string =>
      `${rgbs.map((c) => `\u001b[48;2;${c}m `).join("")}\u001b[49m`;

    // A key: swatches between two readings. `ramp` sees it, `legend` does not.
    const key = `\u001b[38;2;98;98;98m0.19 \u001b[39m${run(viridis)} 100`;
    expect(terminalRamp(key), "a run of swatches between two readings is a key").toBe(true);
    expect(terminalDecisions([key]).legend, "and it is not a legend").toBe(false);

    // A legend: a swatch and a name. `legend` sees it, `ramp` does not.
    const named = "\u2588 alpha  \u2588 beta  \u2588 gamma";
    expect(terminalDecisions([named]).legend, "a swatch and a name is a legend").toBe(true);
    expect(terminalRamp(named), "and it is not a key").toBe(false);

    // **The direction that would be the defect**, fabricated because the corpus
    // has no instance: a legend whose swatch is a *coloured space* rather than a
    // block glyph would vanish from a stripped scan. It does — and no frame in
    // the corpus draws one, which is why this is a stated limit rather than an
    // open cell.
    const invisible = `${run(["230;159;0"])} alpha  ${run(["86;180;233"])} beta`;
    expect(terminalDecisions([invisible]).legend,
      "a coloured-space swatch beside a name is the reader's stated blind spot").toBe(false);
    expect(stripSgr(invisible).trim(), "because stripping leaves the names and no swatch")
      .toBe("alpha    beta");
  });

  it("AD12 (C12 I49, §3ak.38): the key's readings are read on both arms, and a count is not one", () => {
    // **The eighth column owes a fabricated violation in both directions**, and
    // it is the standing rule for a new reader rather than a courtesy: this one
    // agrees on all 44 forms today, so nothing in the matrix could tell a column
    // that works from one that answers `[]` twice (F338, A03 §2's vacuity class).
    const viridis = ["68;1;84", "59;82;139", "33;145;140", "253;231;37"];
    const run = `${viridis.map((c) => `\u001b[48;2;${c}m `).join("")}\u001b[49m`;
    const key = (trail: string): string => `\u001b[38;2;98;98;98m1.5 \u001b[39m${run} 99${trail}`;

    expect(terminalDecisions([key("")]).keyReadings, "the two readings a key runs between")
      .toEqual(["1.5", "99"]);
    // The levels are readings and they are the point of the column.
    expect(terminalDecisions([key(" \u00b7 20 40 60 80")]).keyReadings, "and every level it names")
      .toEqual(["1.5", "99", "20", "40", "60", "80"]);
    // **A count shares the row and is not a reading.** Both of these have a
    // reading's *shape*, so nothing about the token could separate them — the
    // clause is cut by name, which is why there are two named clauses and not a
    // rule about numbers followed by words.
    expect(terminalDecisions([key(" \u00b7 56 older not shown")]).keyReadings, "a drop count is `notice`'s")
      .toEqual(["1.5", "99"]);
    expect(terminalDecisions([key("  3 bands")]).keyReadings, "and a band count is the swatches'")
      .toEqual(["1.5", "99"]);
    // A frame with no key names no readings, which is the negative direction.
    expect(terminalDecisions(["\u2588 alpha  \u2588 beta"]).keyReadings, "a legend is not a key").toEqual([]);

    // **This arm's are the texts on the bar's own foot** — position, not body.
    // Excluding by body took a `0` from the figure along with the `0` naming a
    // signed horizon's fold, which is how the geometric filter was arrived at.
    const bar = '<rect x="100" y="200" width="60" height="10" fill="url(#g)"/>';
    const at = (x: number, y: number, t: string): string => `<text x="${String(x)}" y="${String(y)}">${t}</text>`;
    const svg = `<svg><defs><linearGradient id="g"/></defs>${bar}`
      + `${at(96, 210, "1.5")}${at(164, 210, "99 \u00b7 20 40")}${at(96, 40, "0")}</svg>`;
    expect(svgDecisions(svg).keyReadings,
      "the bar's foot, tokenised — a caption is one element here and one span there")
      .toEqual(["1.5", "99", "20", "40"]);
    expect(svgDecisions(svg).numericLabels,
      "and a label elsewhere is still the figure's").toEqual(["0"]);
    expect(svgDecisions(`<svg>${at(96, 210, "1.5")}${at(164, 210, "99")}</svg>`).keyReadings,
      "and with no bar there is no key to belong to").toEqual([]);
  });

  it("AD9 (F321): an edge glyph inside a figure is not a frame", () => {
    // **Two predicates keyed on `EDGE`, and a tree's outline breaks both.** The
    // reader splits a row at its first edge — gutter before, area after — and
    // calls anything past its last edge a legend. Both hold for a bordered
    // figure and neither holds for a figure whose *content* is box-drawing.
    //
    // **Found because a refusal stopped hiding it.** The outline was refused by
    // the second arm, so its pairs were never compared, and a `silent` cell
    // records nothing about the reader.
    const outline = [
      "root",
      "├── render",
      "│   ├── curve",
      "│   ╰── raster",
      "╰── parse",
    ];
    const d = terminalDecisions(outline);
    expect(d.legend, "a tree draws no legend").toBe(false);
    expect(d.identityLabels, "and every node is a name, connector or not")
      .toEqual(["root", "render", "curve", "raster", "parse"]);

    // **The gutter still exists where a row has one**, which is what keys this
    // on the row rather than on the frame: `line/frame-rule` draws a bottom rule
    // and no top one, so a `border` gate would have lost its readings.
    const gutter = terminalDecisions(["100 ┤ ╭──╮", " 50 ┤╭╯  ╰╮", "  0 ┤╯    ╰"]);
    expect(gutter.numericLabels, "text before the first edge is a reading").toEqual(["100", "50", "0"]);

    // **And a legend past the edge is still a legend** — a swatch and a name,
    // one space after the frame, which is what the terminal writes.
    expect(terminalDecisions(["100 ┤ ╭──╮ │ \u2588 value"]).legend, "a right legend survives").toBe(true);
    expect(terminalDecisions(["    \u256d\u2500render\u252c\u2500curve\u2500\u2500raster"]).legend,
      "and a node's own connectors do not become one").toBe(false);
  });

  it("AD10 (F334, F358): a rule is dotted, and everything else in that alphabet is a figure", () => {
    // **The reader owes a fabricated violation in both directions**, and F334's
    // was written in hand-built strings using `├───┤` and `│  │  │` — a
    // vocabulary the renderer does not draw. Both rows passed while the reader
    // saw **no** real rule anywhere in the corpus: measured over 364 frames, it
    // answered `> 0` on 15 and the frame held a `┄` or `┊` on 16, and the two
    // sets did not intersect (F358).
    //
    // **So the positives are rendered rather than composed.** A control the
    // renderer cannot produce certifies a reader against a picture nobody draws,
    // and that is the only reason this one is not two more strings.
    const curve = Array.from({ length: 20 }, (_v, i) => 50 + 40 * Math.sin(i / 3));
    const drawn = (extra: Record<string, unknown>): readonly string[] =>
      frame({ form: "line", height: 8, axes: true, legend: false, series: [{ values: curve }], ...extra },
        FULL, 60, "p");

    // **The direction that must survive, and it is the corpus's own variant**:
    // `plotFrame: "grid"` draws `┄` across at every value tick and `┊` down at
    // every position tick, so every interior row carries one.
    expect(terminalDecisions(drawn({ plotFrame: "grid" })).interiorRules,
      "a gridded figure draws rules the reader can see").toBeGreaterThan(0);

    // **The direction that was wrong** (F358): the same figure without the grid
    // draws none, and a steep one draws its own `│` down the area. `1000 ** (i/9)`
    // is `x-log`'s series, which is where this was found.
    expect(terminalDecisions(drawn({})).interiorRules,
      "and the same figure without one draws none").toBe(0);
    expect(terminalDecisions(drawn({
      xMin: 1, xMax: 1000, series: [{ values: Array.from({ length: 10 }, (_v, i) => 1000 ** (i / 9)) }],
    })).interiorRules, "a curve's own vertical is not a rule").toBe(0);

    // **F334's case, which is still a case**: a blank row inside a frame is two
    // border glyphs and nothing else, and it must not read as a line.
    const framed = (body: readonly string[]): readonly string[] =>
      ["  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510", ...body,
       "  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"];
    expect(terminalDecisions(framed(["a \u2524\u2588\u2588\u2588\u2588        \u2502", "  \u2502            \u2502"])).interiorRules,
      "a blank row is not a rule").toBe(0);

    // **A border row is still not an interior rule**, which the `TOP`/`BOTTOM`
    // clauses answer and the new alphabet must not have quietly taken over.
    expect(terminalDecisions(framed(["a \u2524\u2588\u2588\u2588\u2588        \u2502"])).interiorRules,
      "the frame's own edges are not interior").toBe(0);
  });

  it("AD13 (C12 I75, F349, F357): the collision sweep is computed rather than quoted", () => {
    // **C12 I75's subject is the corpus and its only citation was a row about
    // `layout`** (F357). The invariant reported 182 variants, 175 distinct
    // terminal frames and 125 documents, and nothing computed any of them — the
    // probe that produced them was deleted before staging, per the rule, so the
    // measurement was a count in prose with no route back to it. All 76 C12
    // invariants are cited by some test file and no rule pairs an invariant to a
    // check, so the convention held by hand and a citation satisfied it whatever
    // the row asserted.
    //
    // **A collision is the strongest agreement the record cannot report.** Two
    // blocks that are not equal drawing one document means a field reached one
    // arm: same labels, same legend, same border, same count of everything, and
    // no column of `ArmDecisions` can see it. A lower bound on the drop and an
    // exact count of the pictures.
    //
    // **The number in C12 I75 was measured before the commit that carries it.** The
    // rule says 125 documents and 25 shares past the largest group; computed
    // now, 126 and 24. Nothing drifted — `layout` crossed (F342), which split
    // `bar/stacked` from `bar/normalised`, and that pair is the first entry in
    // C12 I75's own list of what this arm drops. **A figure quoted from a probe is a
    // snapshot of a corpus the fix then changed**, and the probe was deleted
    // before staging so there was no way to notice.
    const corpus = corpusFrames();
    const t = collisionsIn(new Map([...corpus].map(([k, f]) => [k, f.t])));
    const s = collisionsIn(new Map([...corpus].map(([k, f]) => [k, f.s])));

    expect(corpus.size, "variants in the corpus").toBe(182); // cells-ok — a variant count
    expect(t.distinct, "distinct terminal frames").toBe(175); // cells-ok — a frame count
    expect(s.distinct, "distinct documents").toBe(126); // cells-ok — a frame count

    // **The terminal's four are F350's**, and asserting them keeps that finding
    // alive: three are variants whose names state a claim their block does not
    // make, and `slope`'s pair is legitimate — C12 I74's own proof, a form whose
    // sixth reading changes nothing about the picture.
    expect(t.groups, "terminal collisions past the empty document").toEqual([
      ["heatmap/default", "heatmap/palette"],
      ["histogram/default", "histogram/scott"],
      ["line/legend-right", "line/multi-series"],
      ["slope/default", "slope/six-readings"],
    ]);

    // **This arm's are the specification of what it drops.** Every group is a
    // set of blocks that are not equal drawing one document, so each names a
    // member — `align` and `width` on `line/size-*`, `plotCorners` on
    // `corners-sharp`, `yCallout` on the callouts, `plotStyle` on the candles,
    // `treeLayout`'s overflow pairs, `calendarUnit` on `day-stretch`. The four
    // the terminal also has are fixture defects and stay in both lists.
    expect(s.groups, "documents drawn from more than one block").toEqual([
      ["line/default", "line/size-left", "line/size-centre", "line/size-right", "line/corners-sharp"],
      ["contour/default", "contour/style-line", "contour/dim-floor", "contour/ink-contrast"],
      ["line/callout-last", "line/callout-name", "line/callout-both"],
      ["pie/solid", "pie/default-40", "pie/narrow-20"],
      ["quiver/default", "quiver/ink-contrast", "quiver/dim-floor"],
      ["calendar/day", "calendar/day-stretch"],
      ["heatmap/default", "heatmap/palette"],
      ["histogram/default", "histogram/scott"],
      ["horizon/bands-3", "horizon/folded-1x3"],
      ["line/candlestick-overlay", "line/cursor-candles"],
      ["line/confidence", "line/confidence-unfilled"],
      ["line/legend-right", "line/multi-series"],
      ["slope/default", "slope/six-readings"],
      ["tree/default", "tree/overflow-top-down"],
      ["tree/left-right", "tree/overflow-left-right"],
      ["tree/outline", "tree/overflow-outline"],
    ]);
  });

  it("AD14 (C12 I75, F349, F350): the sweep responds to a field crossing, and to one that does not", () => {
    // **A sweep certified only by its own corpus agrees with itself whatever it
    // does** — AD5's rule, and the reason this is not a second count. The
    // fabricated violation runs in **both** directions on one block, because a
    // control that only shows a collision cannot tell a working sweep from one
    // that returns `true`.
    const base = { form: "line", height: 8, axes: true, legend: false,
      xMin: 1, xMax: 1000,
      series: [{ name: "s", values: Array.from({ length: 10 }, (_v, i) => 1000 ** (i / 9)) }] };
    const draw = (extra: Record<string, unknown>): string =>
      plotToSvg(block({ kind: "plot", id: "p", ...base, ...extra } as never), DARK_THEME) ?? "REFUSED";

    // **A member this arm reads moves the document**, so the corpus can tell a
    // dropped field from a sweep that reports everything as distinct.
    expect(draw({}) === draw({ plotFrame: "grid" }), "`plotFrame` crosses, so it moves the document")
      .toBe(false);

    // **And `xScale` does not** (F356). The two blocks draw different terminal
    // frames — `1 100 200 … 1000` against `1 5 10 20 … 1000` — and one document.
    // This is the row that fails the day the position axis crosses, which is
    // what makes it a fixture for the fix rather than a record of the defect.
    expect(draw({}) === draw({ xScale: "log" }), "`xScale` does not, so two blocks draw one document")
      .toBe(true);
    expect(frame({ ...base, xScale: "log" }, FULL, 80, "p").join("\n")
      === frame(base, FULL, 80, "p").join("\n"), "while the terminal draws two frames")
      .toBe(false);
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
