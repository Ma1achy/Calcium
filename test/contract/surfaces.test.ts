// The surface audit, as a regression test.
//
// `docs/surfaces/HEIGHT_AUDIT.md` recorded what composing the illustrations
// found, once. This asserts it on every run: for each frame, the blocks the
// surface is drawn from must compose to the number of rows the surface draws.
//
// It is what would have caught S07's missing `diff` header without anyone
// reading it — five rows illustrated, six rendered, through four revisions of a
// spec that says twice that a diff carries a header unconditionally.
//
// The expected count is read from the markdown, never restated in the fixture.
// A fixture holding its own number agrees with itself forever.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/testing/index.js";
import { illustratedRows, SURFACE_FRAMES } from "../support/surfaces.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

describe("the S-series' illustrated heights", () => {
  for (const frame of SURFACE_FRAMES) {
    it(`${frame.label} composes to the rows it draws`, () => {
      const registry = createBlockRegistry({});
      const drawn = illustratedRows(frame.file, frame.fence);
      const measured = registry.measureSequence(frame.blocks, frame.width);
      const rendered = renderSequenceToLines(registry, frame.blocks, frame.width, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      });

      expect(
        measured,
        `${frame.label}: the illustration draws ${drawn} rows and the blocks measure ${measured}. ` +
          `Either the surface draws something the vocabulary cannot compose, or a block's ` +
          `height rule changed — the audit says which kind of finding that is`,
      ).toBe(drawn);

      expect(rendered, `${frame.label}: measured and rendered must agree (I1)`).toHaveLength(
        measured,
      );
    });
  }

  it("the fixtures point at illustrations that exist", () => {
    // A fixture naming a fence that is not there would skip silently — the
    // third way a rule comes to have nothing to be wrong about (A03 §2).
    for (const frame of SURFACE_FRAMES) {
      expect(() => illustratedRows(frame.file, frame.fence), frame.label).not.toThrow();
      expect(illustratedRows(frame.file, frame.fence), frame.label).toBeGreaterThan(1);
    }
  });

  // The rest of the S-series, by the component that makes it composable. Each
  // is a table, a plot or a patch region: measuring one today measures the `raw`
  // fallback, which would assert nothing while looking like coverage.
  it.todo("S03, S05, S06, S14, S15 compose to their illustrated rows — waits on C11");
  it.todo("S04, S09, S13 compose to their illustrated rows — waits on C11 and C12");
  it.todo("S07 §3's patch region composes to its illustrated rows — waits on C25");
  it.todo("S01, S02, S10, S11, S12 compose to their illustrated rows — waits on C22");
});
