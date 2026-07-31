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
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/testing/index.js";
import { illustratedRows, SURFACE_FRAMES } from "../support/surfaces.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

describe("the S-series' illustrated heights", () => {
  for (const frame of SURFACE_FRAMES) {
    it(`${frame.label} composes to the rows it draws`, () => {
      // `table` and `plot` are registered rather than shipped as defaults
      // (C09 §3), so a registry without them measures the table- and plot-bearing
      // surfaces as `raw` — which would assert nothing while looking like coverage.
      const registry = createBlockRegistry({});
      registry.register(tableDefinition as unknown as BlockDefinition);
      registry.register(plotDefinition as unknown as BlockDefinition);
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

      expect(rendered, `${frame.label}: measured and rendered must agree (C09 I1)`).toHaveLength(
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
  // S03, S05, S06, S14 and S15 are above, composed and asserted — C11 registered
  // `table` and their deferral expired with it. **S04 §3 and S09 §2 joined them
  // when C12 registered `plot`**, and S09 turned out never to have been waiting on
  // C12 at all: it has no plot, and had been exempt since C11 landed because
  // nothing checks that a blocker names the right component (HEIGHT_AUDIT).
  //
  // S13 moved to C22 rather than being composed here. Its illustration is a whole
  // screen — an outer panel with a title and a footer around a `group` of five —
  // which is the shape S01 and S12 already wait on C22 for. Its table and its
  // sparkline compose today; the frame around them does not.
  // **S07's deferral is deleted rather than expired, and it was never C25's.**
  // It read "S07 §3's patch region composes to its illustrated rows — waits on
  // C25". S07 §2 draws two `diff` blocks and is asserted above; §3 is "Direction
  // of improvement", a table of four verdicts with no illustration in it; and the
  // only mention of `patch` in the whole file is the sentence explaining why
  // `diff` and `patch` are separate kinds. The surface that draws a patch is
  // S10 §4a, which has no illustration fence of its own and is inside the C22
  // line below.
  //
  // Second wrong blocker in consecutive components, after S09's — and A03 TD4
  // now fires on both halves of this one: §3 has no illustration, and S07's
  // stated composition names no `patch`. The check would have failed on the
  // commit that wrote it.
  //
  // **The line names sections, which it did not.** TD4 requires it: an
  // illustration belongs to a section, so a deferral naming only a surface cannot
  // be checked against one — which is how S07's survived pointing at a section
  // that had none. All six are their surface's `§2`, the whole-screen figure that
  // wants an outer `panel` with a title and a footer.
  //
  // **Split, because one row over six surfaces names the wrong component
  // whichever one it names.** S01 §2 is the frame itself — chrome, prompt,
  // gutter — and C22 composes it with nothing having run. The other five are
  // execution output: a welcome banner, gitops output, a local run, a log view,
  // a dashboard. A single row waiting on C22 would have come due five-sixths
  // unwritable, which is the failure this triage exists to prevent and is
  // indistinguishable from a row that expired correctly.
  it.todo(
    "S01 §2 composes to its illustrated rows — waits on C22 — needs the paint path, not the graph: `compose` returns the frame's parts and nothing yet turns them into rows",
  );
  it.todo(
    "S02 §2, S10 §2, S11 §2, S12 §2, S13 §2 compose to their illustrated rows — waits on C23 — every one of the five is a document some verb produced",
  );
});
