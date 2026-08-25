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
import { terminalDecisions, svgArm, type ArmDecisions } from "../support/arm-decisions.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const FULL = caps.find((c) => c.name === "24bit")!.caps;

/** The widths the sweep crosses — the baseline fixture's own pair. */
const WIDTHS = [40, 80] as const;

/**
 * The decisions compared, and every one is from §2's *must be identical* column.
 *
 * Named as a tuple so the record below cannot quietly grow a sixth key that
 * nothing asserts.
 */
const DECISIONS = ["numericLabels", "identityLabels", "border", "interiorRules", "legend"] as const;
type Decision = (typeof DECISIONS)[number];

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
  "line": { silent: "16/86", "numericLabels": "70/70", "identityLabels": "18/70", "border": "64/70", "interiorRules": "70/70", "legend": "26/70" },
  "sparkline": { silent: "2/8", "numericLabels": "6/6", "identityLabels": "agree", "border": "agree", "interiorRules": "6/6", "legend": "agree" },
  "scatter": { silent: "2/12", "numericLabels": "10/10", "identityLabels": "agree", "border": "8/10", "interiorRules": "10/10", "legend": "2/10" },
  "step": { silent: "2/6", "numericLabels": "4/4", "identityLabels": "agree", "border": "2/4", "interiorRules": "4/4", "legend": "agree" },
  "ecdf": { silent: "2/4", "numericLabels": "2/2", "identityLabels": "agree", "border": "2/2", "interiorRules": "2/2", "legend": "agree" },
  "heatmap": { silent: "4/12", "numericLabels": "agree", "identityLabels": "8/8", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "contour": "refused",
  "quiver": "refused",
  "bar": { silent: "2/14", "numericLabels": "12/12", "identityLabels": "12/12", "border": "12/12", "interiorRules": "12/12", "legend": "6/12" },
  "histogram": { silent: "0/12", "numericLabels": "12/12", "identityLabels": "10/12", "border": "12/12", "interiorRules": "12/12", "legend": "4/12" },
  "boxplot": { silent: "0/10", "numericLabels": "10/10", "identityLabels": "10/10", "border": "10/10", "interiorRules": "10/10", "legend": "agree" },
  "forest": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "4/4", "border": "4/4", "interiorRules": "4/4", "legend": "agree" },
  "dumbbell": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "2/2", "interiorRules": "2/2", "legend": "agree" },
  "lollipop": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "2/2", "border": "2/2", "interiorRules": "2/2", "legend": "agree" },
  "dotplot": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "2/2", "border": "2/2", "interiorRules": "2/2", "legend": "agree" },
  "waffle": "refused",
  "flame": { silent: "2/4", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "icicle": { silent: "2/4", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "funnel": "refused",
  "gantt": "refused",
  "waterfall": "refused",
  "slope": "refused",
  "bubble": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "2/2", "interiorRules": "2/2", "legend": "2/2" },
  "autocorrelation": { silent: "0/2", "numericLabels": "2/2", "identityLabels": "agree", "border": "2/2", "interiorRules": "2/2", "legend": "agree" },
  "timeline": "refused",
  "bullet": "refused",
  "utilisation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "graph": { silent: "0/4", "numericLabels": "agree", "identityLabels": "4/4", "border": "agree", "interiorRules": "2/4", "legend": "4/4" },
  "tree": { silent: "4/12", "numericLabels": "agree", "identityLabels": "6/8", "border": "agree", "interiorRules": "2/8", "legend": "6/8" },
  "treemap": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "stackedarea": "refused",
  "streamgraph": "refused",
  "calendar": "refused",
  "correlation": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "confusion": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "spectrogram": { silent: "0/4", "numericLabels": "agree", "identityLabels": "4/4", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "latency": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "2/2", "legend": "agree" },
  "density2d": { silent: "0/2", "numericLabels": "agree", "identityLabels": "2/2", "border": "agree", "interiorRules": "agree", "legend": "agree" },
  "density": { silent: "0/4", "numericLabels": "4/4", "identityLabels": "agree", "border": "4/4", "interiorRules": "4/4", "legend": "agree" },
  "violin": "refused",
  "ridgeline": "refused",
  "smallmultiples": "refused",
  "pairplot": "refused",
  "pie": "refused",
  "radar": "refused",
  "horizon": "refused",
} as const satisfies Readonly<globalThis.Record<PlotForm, Record_>>;

/** One arm-pair for a spec, at a width. */
function pairAt(spec: Record<string, unknown>, width: number): Readonly<{ t: ArmDecisions; s: ArmDecisions }> {
  const { cursor, ...rest } = spec as { cursor?: unknown };
  void cursor;
  return {
    t: terminalDecisions(frame(spec, FULL, width, "p").map(strip)),
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

  it("AD3 (step 1): no cell claims `legitimate`, because none of these decisions is", () => {
    // §2's legitimate list is the rasteriser, the resolution, the stroke width,
    // the font metrics and the ladder — every one about how ink lands. The five
    // decisions here are from the column that must be identical, so a
    // `legitimate` cell would be a claim needing an argument, and there is none
    // to make yet.
    // **The cast is load-bearing and the compiler explains why.** `as const`
    // narrows the record to exactly the values measured today, so TS reports
    // `v[d] === "legitimate"` as a comparison with no overlap — it is *proving
    // the assertion statically against the current data*. That proof evaporates
    // the moment someone writes a `legitimate` cell, because the inferred union
    // would then contain it. So the row stays, widened to `Cell`, and it is the
    // runtime check rather than the type that has to hold.
    const claiming = Object.entries(MEASURED).flatMap(([form, v]) =>
      v === "refused" ? [] : DECISIONS.filter((d) => (v[d] as Cell) === "legitimate").map((d) => `${form}|${d}`));
    expect(claiming, "a legitimate cell needs a stated reason from §2's closed list").toEqual([]);
  });

  it("AD4 (step 1): the headline figures, so the specification reports its own size", () => {
    // **A count, because a green sweep says nothing about how much it swept.**
    // These are the numbers the pass is measured against, and they move as it
    // lands — every one of them downward except the closed count.
    const claimed = Object.values(MEASURED).filter((v) => v !== "refused") as Claimed[];
    let open = 0;
    let closed = 0;
    for (const v of claimed) for (const d of DECISIONS) (v[d] === "agree" ? closed += 1 : open += 1);
    expect(claimed.length, "forms the SVG arm claims").toBe(27); // cells-ok — a form count
    expect(Object.values(MEASURED).length - claimed.length, "forms it refuses").toBe(19); // cells-ok — a form count
    expect(open + closed, "cells over claimed forms").toBe(135); // cells-ok — a cell count
    expect(open, "cells where the arms disagree — the work the pass has to do").toBe(73); // cells-ok — a cell count
    expect(closed, "cells where they already agree — the work it must not undo").toBe(62); // cells-ok — a cell count
  });

  it("AD5 (step 1): the instrument responds to a decision moving", () => {
    // **A sweep certified only by its own record agrees with itself whatever it
    // does** (`test/support/README.md`). So: take a form the record says agrees
    // on `numericLabels` and make the two arms disagree, by handing the terminal
    // side a frame it did not draw.
    const heat = Object.values(CATALOGUE_FORMS.heatmap as globalThis.Record<string, Record<string, unknown>>)[0]!;
    const { t, s } = pairAt(heat, 80);
    expect(same(t.numericLabels, s.numericLabels), "the record says heatmap agrees here").toBe(true);
    const moved = terminalDecisions([...frame(heat, FULL, 80, "p").map(strip), "  0.5 \u2524 x"]);
    expect(same(moved.numericLabels, s.numericLabels), "and the comparison sees it move").toBe(false);
  });
});
