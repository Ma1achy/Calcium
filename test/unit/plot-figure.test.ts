/**
 * FV1–FV3 — **the shared layer, and the record that is checked rather than
 * merely total** (C12 §3ak, C12 I59, C12 I60).
 *
 * `HAS_VALUE_AXIS` is a `satisfies Record<PlotForm, boolean>`, and that totality
 * does real work: a form added to the union fails to compile until someone
 * decides. **It cannot check one of those decisions.** F266 is the measured
 * case — `autocorrelation` sat misfiled as a `"curve"` inside exactly such a
 * record, and a refusal was one commit from landing on that diagnosis. So the
 * record gets the thing totality cannot give it.
 *
 * **FV1 asserts the direction that is true, and only that one.** A form marked
 * `false` never draws a numeric gutter. The converse does **not** hold and
 * asserting it would fail: a horizontal bar chart has a value axis and still
 * gutters its categories, because where the axis runs is `orientation` and not
 * the form. Measured before the record was written — `bar` draws 8 numeric
 * gutter labels against 50 named ones, and `line` draws 256 against 14, the 14
 * being the labelled strips it stacks into below the colour floor.
 */
import { describe, expect, it } from "vitest";

import type { PlotForm } from "../../src/data/viewmodel/index.js";
import { HAS_VALUE_AXIS, valueAxisOf } from "../../src/presentation/plot/figure.js";
import { terminalDecisions } from "../support/arm-decisions.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id: string) => readonly string[];
const strip = stripSgr as (s: string) => string;
const FULL = caps.find((c) => c.name === "24bit")!.caps;

describe("FV — the shared axis, and a record with something to be wrong about", () => {
  it("FV1 (C12 I60): a form with no value axis never draws a numeric label, over the whole corpus", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      if (HAS_VALUE_AXIS[form as PlotForm]) continue;
      for (const [variant, spec] of Object.entries(variants as Record<string, unknown>)) {
        for (const width of [40, 80]) {
          checked += 1;
          const found = terminalDecisions(frame(spec, FULL, width, "p").map(strip)).numericLabels;
          if (found.length > 0) offenders.push(`${form}/${variant}@${String(width)}: ${found.join(",")}`);
        }
      }
    }
    // **The counter, because zero offenders and zero checked print the same.**
    expect(checked, "form-variant-width triples with no value axis").toBeGreaterThan(30); // cells-ok — a frame count
    expect(offenders, "a form marked `false` drew a number on an axis").toEqual([]);
  });

  it("FV2 (C12 I60): the record is not the gutter's content, and the corpus is why", () => {
    // **The converse of FV1 is false and this row is what stops someone
    // asserting it.** A horizontal bar chart has a value axis and gutters its
    // categories; `line` gutters series names below the colour floor. So a form
    // marked `true` may draw no numeric label at all, and a record written from
    // the gutter would have been exhaustively wrong in both directions.
    const bar = Object.values(CATALOGUE_FORMS.bar as Record<string, unknown>)[0]!;
    expect(HAS_VALUE_AXIS.bar, "a bar chart's lengths are on a scale").toBe(true);
    const horizontal = terminalDecisions(frame(bar, FULL, 80, "p").map(strip));
    expect(horizontal.identityLabels.length, "and its gutter names categories").toBeGreaterThan(0); // cells-ok — a label count
  });

  it("FV3 (C12 I59): the axis carries its own strings, at the step's precision", () => {
    // **The disagreement this closes**, measured: the SVG printed `String(tick)`
    // and got `1` where the terminal's uniform precision gives `1.0`. One
    // derivation now, read by both — so a label is a member rather than a thing
    // each arm computes from a number it happens to hold.
    const axis = valueAxisOf({ min: -0.5, max: 1 }, 4, {});
    expect(axis.labels.length, "one label per tick").toBe(axis.ticks.length);
    expect(axis.labels, "the step's decimals, on every tick").toEqual(["-0.5", "0.0", "0.5", "1.0"]);
    expect(axis.ticks.map(String), "which is not what String() gives").not.toEqual(axis.labels);

    // An integer axis keeps no decimal, which is `stepDecimals`' own ruling —
    // asking a magnitude formatter instead put `40.0 · 35.0 · 30.0` on a frame.
    expect(valueAxisOf({ min: 0, max: 30 }, 4, {}).labels).toEqual(["0", "10", "20", "30"]);
  });
});
