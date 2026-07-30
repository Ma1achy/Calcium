// C25 tier 2 — contract. The measurement headline, purity, and the registration.
//
// **T2.1 is the one everything above L1 rests on.** C14 virtualises on measured
// height without rendering, so measure and the rendered row count coming apart is a
// viewport that drifts rather than a block that looks wrong — and it is violated
// silently, which is why it is swept across the corpus and seven widths rather than
// spot-checked.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { tokenisationCount } from "../../src/presentation/blocks/index.js";
import { PATCH_CORPUS, patchOf, THE_ILLUSTRATION } from "../support/blocks.js";
import { FULL_CAPS, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Patch } from "../../src/data/viewmodel/index.js";

const WIDTHS = [40, 60, 80, 100, 120, 160, 200] as const;
const UNIFIED = [40, 60, 80] as const;
const SPLIT = [100, 120, 160, 200] as const;

const kit = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: FULL_CAPS });

describe("C25 contract", () => {
  it("T2.1 (I1, the headline): measure equals the rendered row count, corpus × seven widths", () => {
    const k = kit();
    const failures: string[] = [];

    for (const block of PATCH_CORPUS) {
      for (const width of WIDTHS) {
        const measured = k.measure(block, width);
        const rendered = k.renderToLines(block, width).length; // cells-ok — a row count
        if (measured !== rendered) failures.push(`${block.id} at ${width}: measured ${measured}, drew ${rendered}`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T2.2 (I2a): two heights across the seven widths, and the step is at the breakpoint", () => {
    // Not one value — that was the original I2 and it could not hold beside split
    // pairing. Not seven either: a patch that wrapped would give more, which is what
    // makes this the assertion T6.1 breaks.
    const k = kit();

    for (const block of PATCH_CORPUS) {
      const unified = new Set(UNIFIED.map((w) => k.measure(block, w)));
      const split = new Set(SPLIT.map((w) => k.measure(block, w)));

      expect(unified.size, `${block.id}: unified must be one height`).toBe(1);
      expect(split.size, `${block.id}: split must be one height`).toBe(1);
    }
  });

  it("T2.2a (I2a): the step is the pairing saving, and at least one fixture steps", () => {
    // A corpus where every fixture happened to be one-sided would satisfy T2.2
    // while saying nothing about pairing, so the step is asserted to exist
    // somewhere — the harness rule, applied to a property rather than a parameter.
    const k = kit();
    const stepped = PATCH_CORPUS.filter((b) => k.measure(b, 80) !== k.measure(b, 120));

    expect(stepped.length, "no fixture distinguishes the two arithmetics").toBeGreaterThan(0);
    for (const block of stepped) {
      expect(k.measure(block, 120), `${block.id}: split is never taller`).toBeLessThan(k.measure(block, 80));
    }
  });

  it("T2.3 (I6): `patch` arrives through `register`; removing the call removes the kind", () => {
    const bare = createBlockRegistry({});
    expect(bare.kinds).not.toContain("patch");

    const registered = createBlockRegistry({});
    registered.register(patchDefinition as unknown as BlockDefinition);
    expect(registered.kinds).toContain("patch");
    expect(registered.get("patch")).toBe(patchDefinition);

    // And nothing supplies it quietly: an unregistered `patch` falls to `raw`
    // (C09 I10) rather than to a privileged built-in.
    expect(bare.get("patch")).toBeUndefined();
  });

  it("T2.4 (I7): measure is pure, and `patch/` holds no module state", () => {
    const k = kit();
    const first = k.measure(patchOf(), 100);
    for (let i = 0; i < 100; i += 1) expect(k.measure(patchOf(), 100)).toBe(first);
  });

  it("T2.5 (I3): measure never tokenises", () => {
    // A spy on the count rather than on the function, because the memo is C09's and
    // the claim is about work not happening at all.
    const before = tokenisationCount();
    const k = kit();
    for (const block of PATCH_CORPUS) for (const width of WIDTHS) k.measure(block, width);

    expect(tokenisationCount(), "measuring must not warm C09's memo").toBe(before);
  });

  it("T2.6 (I8): C25 declares no block type", async () => {
    const surface = await import("../../src/presentation/patch/index.js");
    expect(Object.keys(surface)).toEqual(["patchDefinition"]);
  });

  it("T2.7 (I1, I10): no rendered row exceeds its width, at any width", () => {
    // Every row leaves through one `line()`, so this is mechanical rather than
    // remembered — and C12 is why it is asserted anyway: a row that skipped the
    // clamp there rendered nineteen rows against a declared five, because the
    // terminal wrapped each one.
    const k = kit();
    for (const block of PATCH_CORPUS) {
      for (const width of [1, 2, 3, 8, 13, 40, 100]) {
        for (const row of k.renderToLines(block, width)) {
          expect(cells(visible(row)), `${block.id} at ${width}: ${JSON.stringify(visible(row))}`).toBeLessThanOrEqual(
            width,
          );
        }
      }
    }
  });

  it("T2.8 (I4): the marker survives every width, because D29 rests on it", () => {
    // The numbers go when the width cannot carry them; the marker never does. At
    // 1-bit it is the only thing left saying which side of the change a line is on,
    // so a layout that dropped it would make a narrow diff unreadable in the one way
    // colour cannot rescue.
    const k = kit();
    const patch = patchOf({ hunks: [THE_ILLUSTRATION] });

    for (const width of [3, 8, 20, 80]) {
      const drawn = k.renderToLines(patch, width).map(visible).join("\n");
      expect(drawn, `width ${width} must keep -`).toContain("-");
      expect(drawn, `width ${width} must keep +`).toContain("+");
    }
  });
});
