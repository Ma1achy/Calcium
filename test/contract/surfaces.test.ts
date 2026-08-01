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
import { frameLines, frameRows, illustratedRows, SURFACE_FRAMES } from "../support/surfaces.js";
import { compose, heightsSum } from "../../src/shell/frame.js";
import { paint } from "../../src/shell/paint.js";
import { displayCells } from "../../src/presentation/text.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

const S01_SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});
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
  it("S01 §2's regions are the ones §3 computes", () => {
    // **The figure is a diagram; its three horizontal rules are not rendered**
    // (S01 §2). `frameRows` strips them, and what is left is the frame §3
    // describes: header, viewport, prompt, footer.
    //
    // **The assertion is the decomposition, not the row count.** A first draft
    // composed at the figure's own dimensions and asserted the paint returned
    // that many rows — which is `rows === rows`, since `paint` always returns
    // exactly `size.rows`. It passed and said nothing: the inert-subject class,
    // in the test written to close it.
    //
    // What can disagree is where the boundaries fall. The figure marks its own:
    // row 0 is the header, the `❯` row is the prompt, the last row is the
    // footer, and everything between the header and the prompt is the viewport.
    // If §3 said the header were two rows, the arithmetic would compute ten
    // viewport rows against a figure that draws eleven.
    const file = "docs/surfaces/S01_the_frame.md";
    const lines = frameLines(file, 0);
    const rows = frameRows(file, 0);
    const width = Math.max(...lines.map(displayCells));

    const promptRow = lines.findIndex((l) => l.startsWith("❯"));
    expect(promptRow, "the figure marks its prompt").toBeGreaterThan(0);

    const drawnViewport = promptRow - 1;
    const drawnFooter = lines.length - promptRow - 1;

    const frame = compose({
      chrome: { header: () => [], footer: () => [] },
      session: () => S01_SESSION,
      now: () => 1_700_000_000_000,
      size: () => ({ columns: width, rows }),
      promptRows: () => 1,
    });

    expect(
      frame.region.height,
      `§3 computes ${String(frame.region.height)} viewport rows; §2 draws ${String(drawnViewport)}`,
    ).toBe(drawnViewport);
    expect(frame.promptRows, "one prompt row in the figure").toBe(1);
    expect(drawnFooter, "one footer row, and nothing between it and the prompt").toBe(1);
    expect(heightsSum(frame), "and the four sum to the frame").toBe(true);

    // The paint then fills that shape at the figure's width — the axis that
    // wraps, and the one §3 says nothing about.
    const painted = paint(frame, {
      registry: createBlockRegistry({ defaults: true }),
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      transcriptRows: () => [],
      promptRows: () => [""],
      overlays: () => [],
      promptCursor: () => ({ row: 0, col: 2 }),
      promptFocused: () => true,
    });
    for (const [i, line] of painted.entries()) {
      expect(displayCells(line), `row ${String(i)}`).toBe(width);
    }
  });

  // **The five-surface row is split, and none of the five was C23's.**
  //
  // It read "S02 §2, S10 §2, S11 §2, S12 §2, S13 §2 compose to their illustrated
  // rows — waits on C23 — every one of the five is a document some verb
  // produced". HEIGHT_AUDIT's own table said C22 for all five, so the two
  // records had already diverged; and reading each row against what it needs
  // gives five different answers, of which C23 is none.
  //
  // **A row over N surfaces with N different blockers cannot be triaged, only
  // split.** This file's comment above predicted it for the six-surface row that
  // was split during C22's triage, and this is what was left of it. The second
  // instance, so it is the rule rather than the observation: a bundled row comes
  // due mostly unwritable, and mostly-unwritable is indistinguishable from
  // correctly-expired at the moment it goes red.
  //
  // **S10 — deleted.** §2 is a *shape* listing — six lines of `label
  // description` prose — not a rendered figure. There is nothing to compose
  // against, so the row would have failed whenever it was written and accused
  // whichever component it named. Third instance of S07's class, and S07's was
  // deleted for exactly this reason.
  //
  // **S13 — deleted.** HEIGHT_AUDIT records it moving to C22 and the comment
  // fifteen lines above says so too. A stale label rather than a deferral, and
  // its coverage belongs with the C22 frame row that already carries S01's.
  //
  // **S11 — written, above**, after S11 §2 gained the block list it never had.
  // The figure implied the sequence and an implication is not a declaration:
  // composing it meant choosing where the spec was silent, which is guessing
  // with a passing test attached.
  //
  // **S02 — written, above.** Two declarations short: `v1.0.0` was drawn and
  // listed by nothing, and the two headerless tables declared no columns at
  // all. And its figure drew `↗ open` at the right of each row, which C11
  // renders nowhere — focus changes the tone and nothing else — while §7
  // already declared those as row actions. Two records of one fact, and the
  // figure was the wrong one.
  //
  // **All five are now answered and none of them was C23's**, which is the
  // whole finding: two deletions, two spec edits, one ruling.
  //
  // **S12 — written, above**, once §2's self-contradiction was ruled. The
  // section opened by saying its box was not rendered and closed four
  // paragraphs later by naming a title bar and a keymap line as two of its
  // three regions — both of which *are* the rails. S01's convention, copied to
  // a figure it does not describe, and `frameRows` strips exactly the two rows
  // that carry content. It is a `panel`: title in the top border, keymap in the
  // new `footer` (C04 §3), and HEIGHT_AUDIT was right from §1 onwards.


});
