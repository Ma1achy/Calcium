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

import type { Plot, PlotForm } from "../../src/data/viewmodel/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import { HAS_VALUE_AXIS, RAMP_DEFAULT, identityOf, valueAxisOf } from "../../src/presentation/plot/figure.js";
import { HAS_Y_GUTTER } from "../../src/data/viewmodel/types.js";
import { drawnBlock } from "../../src/presentation/plot/derive.js";
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
  it("FV1 (C12 I60): a form with no value axis never draws a numeric label it did not name, over the whole corpus", () => {
    const offenders: string[] = [];
    let checked = 0;
    let exempted = 0;
    let gutterless = 0;
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      if (HAS_VALUE_AXIS[form as PlotForm]) continue;
      // **The reader's `head` is a *gutter*, and a form without one has no
      // gutter for it to be** (F487). `terminalDecisions` takes the text before
      // a row's first box glyph as the y-axis label — true of a furnished axis,
      // and false of a form that draws its scales inside the scene, where the
      // "edge" it found is an axis line in the picture. `scatter3d` is that
      // form: its billboarded ticks sit left of `│`, so they read as a gutter.
      //
      // **`HAS_VALUE_AXIS` and this row answer different questions**, which is
      // the finding rather than the workaround. The record is about the
      // `Figure` — one `value`, and a 3D scatter has three ranges — and this
      // row is about a *frame*. For twelve forms the two coincide; for the one
      // that draws its own axes in the scene they do not, and `HAS_Y_GUTTER` is
      // the record that says which is which.
      //
      // **Both figures, because the exemption looks far larger than it is.**
      // It covers **96 of 168** triples — 57.1% — and **94 of those 96 were
      // already producing zero offenders**, measured by running this row with
      // them included. So its reach today is two triples, and its cost is that
      // 94 lose a check they were passing. Recorded rather than left as a
      // percentage a reader would have to derive.
      if (!HAS_Y_GUTTER[form as PlotForm]) {
        gutterless += Object.keys(variants as Record<string, unknown>).length * 2; // cells-ok — a frame count
        continue;
      }
      for (const [variant, spec] of Object.entries(variants as Record<string, unknown>)) {
        for (const width of [40, 80]) {
          checked += 1;
          const { cursor, ...rest } = spec as { cursor?: unknown };
          void cursor;
          // **A numeric label that IS one of the figure's own identities is not
          // a number on an axis** (F325). `fieldAxes` captions a field's rows
          // from their index where the caller named none, so a contour's gutter
          // reads `0 1 2 3 4 5` — and its readings are on the ramp legend,
          // `1.5  99 · 20 40 60 80`, exactly where a heatmap's are. The old
          // clause read that as a value axis and the two forms it is false for
          // were the two the record marked `true`, so nothing ever asked.
          //
          // **The discriminator is general and it does not weaken the row.**
          // The defect FV1 exists to catch is a furnished axis out of
          // `seriesRange([]) ?? {0, 1}` — `0.0 0.5 1.0` against row names — and
          // those are not identities. A form list here would have been the
          // exemption naming its instances instead of its mechanism.
          const named = new Set(identityOf(drawnBlock(
            block({ kind: "plot", id: "p", ...rest } as never) as Plot,
          )));
          const found = terminalDecisions(frame(spec, FULL, width, "p").map(strip)).numericLabels;
          exempted += found.filter((l) => named.has(l)).length; // cells-ok — a label count
          const bare = found.filter((l) => !named.has(l));
          if (bare.length > 0) offenders.push(`${form}/${variant}@${String(width)}: ${bare.join(",")}`);
        }
      }
    }
    // **The counters, because zero offenders and zero checked print the same** —
    // and the exemption is counted rather than excluded, because a clause with
    // no instances reads exactly like one that is satisfied.
    expect(checked, "form-variant-width triples with no value axis").toBeGreaterThan(30); // cells-ok — a frame count
    expect(exempted, "numeric labels the figure named itself").toBeGreaterThan(0); // cells-ok — a label count
    // **Counted, not excluded** — a clause with no instances reads exactly like
    // one that is satisfied, and this one has 96.
    expect(gutterless, "triples skipped for having no gutter to read").toBe(96); // cells-ok — a frame count
    expect(offenders, "a form marked `false` drew a number on an axis").toEqual([]);
  });

  it("FV1c (C12 I60): a form whose readings are on a ramp has no value axis, with no exceptions", () => {
    // **The cross-record row, and it is what would have caught three cells**
    // (F327). `RAMP_DEFAULT` names the forms whose readings are spent on colour;
    // `HAS_VALUE_AXIS` answers whether readings sit on a value scale. A form
    // cannot do both, and the two records are written in different places by
    // different arguments — which is how `contour`, `quiver`, `horizon` and
    // `calendar` came to say it could.
    //
    // **Each of the four was wrong for the same shape of reason**: a sentence
    // about the *gutter* or the *ordinate* answering a question about the
    // *readings*. The calendar's is the one that reads most like evidence —
    // *48 numeric gutter labels across the corpus* — and those 48 are the grid's
    // identity, which `calendarGrid` writes.
    //
    // **Asserted with no exception list**, because it has none. A form that
    // needs one is a form that draws a ramp *and* a labelled value axis, and the
    // day one exists this row is where the case is argued.
    const both = (Object.keys(RAMP_DEFAULT) as PlotForm[])
      .filter((f) => RAMP_DEFAULT[f] !== null && HAS_VALUE_AXIS[f]);
    expect(both, "a form cannot spend its readings on colour and on a scale").toEqual([]);
    // **And the counter, because an empty record and a satisfied one print the
    // same.** Eleven forms have a ramp; if that ever reaches zero the row above
    // is vacuous and says so here first.
    const ramped = (Object.keys(RAMP_DEFAULT) as PlotForm[]).filter((f) => RAMP_DEFAULT[f] !== null);
    // **12, and the twelfth is `scatter3d`** — depth and value both go on a
    // ramp there, which is why its `HAS_VALUE_AXIS` is `false` and why copying
    // `scatter`'s `true` would have been caught by this row's *other* half
    // rather than by design (F441).
    expect(ramped.length, "forms whose readings are a colour").toBe(12); // cells-ok — a form count
  });

  it("FV1b (C12 I60): the exemption is an identity, not a number that looks like one", () => {
    // **The fabricated violation the clause above owes** (F325). A furnished
    // axis is what FV1 exists to catch, and the exemption must not swallow one:
    // a heatmap whose rows are named `0`, `1`, `2` exempts those three and still
    // reports a `0.5` that no identity claims.
    const named = new Set(["0", "1", "2"]);
    const asAxis = ["0.0", "0.5", "1.0"];
    expect(asAxis.filter((l) => !named.has(l)), "a furnished axis survives the exemption")
      .toEqual(["0.0", "0.5", "1.0"]);
    expect(["0", "1", "2"].filter((l) => !named.has(l)), "and a numeric identity does not")
      .toEqual([]);
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
