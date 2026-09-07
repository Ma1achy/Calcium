// Roadmap 51 — the categorical palette, and the `% 4` it replaces.
//
// **The defect was shipped and had a consumer.** C12 cycled series through
// `["accent", "info", "ok", "warn"]`, so a plot of four unrelated quantities
// told the reader that series three was good and series four wanted attention —
// and a fifth repeated the first. Both are asserted here from the outside, on
// the resolved styles rather than on the table, because a palette asserted
// against its own definition agrees with itself whatever it says.
import { describe, expect, it } from "vitest";

import { DARK_FOUR_BIT, HIGH_CONTRAST_FOUR_BIT, LIGHT_FOUR_BIT } from "../../src/presentation/theme/index.js";
import { slot } from "../../src/presentation/blocks/paint.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { ColourRef } from "../../src/presentation/theme/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const REFS: readonly ColourRef[] = [
  "categorical.c1",
  "categorical.c2",
  "categorical.c3",
  "categorical.c4",
  "categorical.c5",
  "categorical.c6",
  "categorical.c7",
  "categorical.c8",
];

const seriesOf = (n: number): readonly { values: readonly number[] }[] =>
  Array.from({ length: n }, (_unused, i) => ({ values: [i, i + 1, i + 2] }));

describe("roadmap 51 — the categorical palette", () => {
  it("T2.60: eight slots, and no two resolve to the same colour", () => {
    // **The property the cap rests on — and it had a keeper already.** C10
    // refuses two slots of one palette rendering as one another at theme load
    // (*"c5" and "c1" are both #e69f00*), which is stronger than this row and
    // was found by trying to mutate it. Kept as a second expression, because
    // the load-time check guards the shipped themes and this guards the claim.
    const resolved = REFS.map((ref) => JSON.stringify(slot(ref, DARK_THEME, FULL_CAPS).colour));

    expect(new Set(resolved).size, "eight distinct colours at 24-bit").toBe(8);
  });

  it("T2.61: the 4-bit rung keeps them distinct too, in all three maps", () => {
    // Sixteen colours is where the promise is hardest to keep, and a curated
    // map is the only way to keep it — nearest-of-16 by distance collapses hues
    // the eye separates easily, which is `FourBitMap`'s own argument.
    for (const [name, map] of [
      ["dark", DARK_FOUR_BIT],
      ["light", LIGHT_FOUR_BIT],
      ["high-contrast", HIGH_CONTRAST_FOUR_BIT],
    ] as const) {
      const indices = REFS.map((ref) => map[ref]);
      expect(indices.every((i) => i !== undefined), `${name}: every slot mapped`).toBe(true);
      expect(new Set(indices).size, `${name}: pairwise distinct`).toBe(8);
    }
  });

  it("T2.62: the palette carries no judgement — 1-bit resolves to nothing", () => {
    // **Vacuous by construction rather than unavailable**: C12 forces stacked
    // strips at `colourDepth === 1` for a multi-series plot, so nothing ever
    // asks for a colour to distinguish series there — the distinction is
    // spatial and the palette has no subject.
    //
    // **What this row asserts is that nothing is emitted, and no more.** A
    // mutation flipping `carries` to `"meaning"` survived it, correctly: a
    // meaning palette with no `classes` resolves through `MONO["normal"]`,
    // which is also `NO_STYLE`. The two declarations are indistinguishable at
    // every depth from here, so the row cannot be strengthened to tell them
    // apart and pretending otherwise would be the vacuity it exists to avoid.
    const mono = { ...FULL_CAPS, colourDepth: 1 as const };

    for (const ref of REFS) {
      expect(slot(ref, DARK_THEME, mono), `${ref} at 1-bit`).toEqual({});
    }
  });

  it("T2.64: C12 draws four series in four colours, and none of them is a judgement", () => {
    // **The consumer, asserted — and the harness is what said it was missing.**
    // Every row above resolves refs and checks gates; none of them touched C12,
    // so a control that made every series take the first slot could not be
    // caught and the pass refused to run. The rows were about a palette; the
    // change is about a plot.
    //
    // Read from the frame's own escapes rather than from `refOf`, because the
    // defect was visible exactly there: four series in `accent, info, ok, warn`
    // drew a green third curve and an amber fourth.
    const registry = createBlockRegistry({ defaults: true });
    registry.register(plotDefinition as unknown as BlockDefinition);

    const block = b.plot({ series: seriesOf(4), height: 8, axes: false });
    const frame = renderSequenceToLines(registry, [block as Block], 60, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
    }).join("\n");

    const used = new Set([...frame.matchAll(/\u001b\[38;2;([0-9;]+)m/gu)].map((m) => m[1]));
    const categorical = REFS.slice(0, 4).map((ref) => {
      const c = slot(ref, DARK_THEME, FULL_CAPS).colour;
      return c?.kind === "rgb" ? c.hex : "";
    });

    // Every one of the four is on screen, and they are four different colours.
    for (const hex of categorical) {
      const rgb = [1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(";");
      expect(used.has(rgb), `${hex} is drawn`).toBe(true);
    }
    expect(new Set(categorical).size, "four distinct").toBe(4);

    // And the judgement tones are absent, which is the defect stated as a
    // property rather than as a colour: `ok` and `warn` used to be series three
    // and four.
    for (const judgement of ["ok", "warn"] as const) {
      const c = slot(`tone.${judgement}`, DARK_THEME, FULL_CAPS).colour;
      const hex = c?.kind === "rgb" ? c.hex : "";
      const rgb = [1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(";");
      expect(used.has(rgb), `no series is toned \`${judgement}\``).toBe(false);
    }
  });

  it("T2.63 (C04 I50a): a ninth series is refused, at both gates", () => {
    // **Refused rather than cycled**, which is the ruling. C04 I47's disposal:
    // a reader cannot see that a colour has been reused, so a rendering that
    // lies is worse than a document that will not build.
    expect(() => b.plot({ series: seriesOf(9), height: 8 }), "the builder").toThrow(/distinguishes 8/u);

    const outcome = validateBlock({
      kind: "plot",
      id: "p",
      form: "line",
      height: 8,
      series: seriesOf(9).map((s) => ({ values: [...s.values] })),
    });
    expect(outcome.ok, "the validator").toBe(false);
    expect(outcome.ok ? "" : outcome.error.join(" ")).toMatch(/distinguishes 8/u);

    // And the eighth is accepted, or the row passes for a gate that refuses
    // everything.
    expect(() => b.plot({ series: seriesOf(8), height: 8 }), "eight is legal").not.toThrow();
  });

  it("T2.71 (C04 I56): the row floor is refused at both gates, and only the row floor", () => {
    // **A violin's floor is two rows per band** — a violin with no density is a
    // box plot, and the field said `violin`. Below it the estimate flattens and
    // the figure states a property of the *height*, which nothing on screen
    // distinguishes from a uniform distribution.
    const violin = (height: number, bands: number): unknown => ({
      kind: "plot", id: "v", form: "violin", height,
      series: Array.from({ length: bands }, () => ({ values: [1, 2, 3, 4, 5] })),
    });
    expect(validateBlock(violin(3, 3)).ok, "one row per band").toBe(false);
    const refused = validateBlock(violin(3, 3));
    expect(refused.ok ? "" : refused.error.join(" ")).toMatch(/needs 2 \(C04 I56\)/u);
    expect(validateBlock(violin(6, 3)).ok, "two rows per band is the floor, not below it").toBe(true);

    expect(
      () => b.plot({ form: "violin", height: 3, series: seriesOf(3).map((x) => ({ values: [...x.values] })) }),
      "the builder",
    ).toThrow(/needs 2 \(C04 I56\)/u);

    // **The column floor is absent here and that is the ruling, not a gap.**
    // `validateBlock` takes a block and no width, and a width is handed down
    // from `terminal/lifecycle.ts` — so a vertical violin cannot be refused for
    // being too narrow however few columns it will get, and C12 draws the box
    // instead (C12 I34, I18). A row asserting the refusal fires would be
    // asserting something this layer cannot know.
    const vertical = {
      kind: "plot", id: "v2", form: "violin", height: 3, orientation: "vertical",
      series: Array.from({ length: 3 }, () => ({ values: [1, 2, 3, 4, 5] })),
    };
    expect(validateBlock(vertical).ok, "vertical is not judged on rows").toBe(true);
  });
});
