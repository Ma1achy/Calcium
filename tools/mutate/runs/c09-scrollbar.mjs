// C09 I92 and I93 — the scrollbar's column (§021, §7f).
//
// **The whole of this subject is arithmetic, and arithmetic is where a defect
// is self-consistent.** A rounding that disagrees with §021's figure draws a
// different picture while every number in it agrees with every other, so the
// mutations here are mostly one operator apiece: `floor` for `round`, `<=` for
// `<`, the half-row doubling removed, the two half-row forms swapped. Each is a
// bar a reader would accept at a glance.
//
// The three that are not arithmetic are the seams: the set degrading whole
// (I93), the column the box reserves for it, and the tone that tells a focused
// box from an idle one.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const BAR = "src/presentation/blocks/scrollbar.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const FILES =
  "test/unit/blocks.test.ts test/contract/scroll.test.ts test/contract/scroll-follow.test.ts " +
  "test/unit/blocks-measure-once.test.ts test/integration/emulator.test.ts test/contract/blocks.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every frame-reading row can see** (F1254): the box never
    // reserves the column, so no bar is drawn anywhere. If this survives, the
    // rows below are not reading the frames they think they are.
    file: CONTAINERS,
    from: "  return { contentWidth: narrow, content: contentHeight(block, narrow, measureChild), bar: true };",
    to: "  return { contentWidth: narrow, content: contentHeight(block, narrow, measureChild), bar: false };",
    why:
      "no box ever draws a bar, so every composed row in scroll.test.ts and the emulator's "
      + "column assertions read a frame with nothing in the last cell",
  },
  mutations: [
    {
      // **THE DEFECT: a bar that cannot move is drawn.** The equal case is the
      // one that matters — content exactly filling its viewport is content that
      // fits, and `<` draws a full bar there saying *there is more*. It also
      // divides by a `maxOffset` of zero, which is how a self-consistent
      // arithmetic produces `NaN` rather than a wrong number.
      name: "THE DEFECT: content exactly filling its viewport still draws a bar",
      file: BAR,
      from: "  if (total <= viewport) return null;",
      to: "  if (total < viewport) return null;",
      expect: "T1.60",
    },
    {
      // **The half-row precision, which is the whole of §021's resolution
      // claim.** Whole rows only, and the picture is still a plausible bar —
      // twelve positions where the figure has twenty-four.
      name: "the Unicode rung draws at whole-row resolution",
      file: BAR,
      from: "  const positions = set.half ? height * 2 : height;",
      to: "  const positions = height;",
      expect: "T1.59",
    },
    {
      // **The rounding, and the reason §021 works four offsets rather than
      // one.** `round` agrees with the figure at offset 0 and disagrees in the
      // middle; nothing about the resulting column looks wrong.
      name: "the thumb's start rounds rather than floors",
      file: BAR,
      from: "    Math.floor((at / maxOffset) * (positions - thumb)),",
      to: "    Math.round((at / maxOffset) * (positions - thumb)),",
      expect: "T1.59",
    },
    {
      // **The floor on the thumb's length.** A very long document over a short
      // gutter rounds the proportion to nothing and the bar loses its mark
      // entirely — a track with no thumb in it, which reads as an empty gutter.
      name: "a thumb of zero half-rows is allowed",
      file: BAR,
      from: "  const thumb = Math.max(1, Math.floor((positions * viewport) / total));",
      to: "  const thumb = Math.floor((positions * viewport) / total);",
      expect: "T1.60",
    },
    {
      // **The two half-row forms swapped.** `╽` is the lower half and `╿` the
      // upper; exchanged, the thumb's two ends are drawn inside out and every
      // row of §021's figure that is not a whole `┃` is wrong.
      name: "the half-row forms are swapped, so the thumb's ends point the wrong way",
      file: BAR,
      from: "    out.push(top && bottom ? set.thumb : bottom ? set.thumbStart : top ? set.thumbEnd : set.track);",
      to: "    out.push(top && bottom ? set.thumb : bottom ? set.thumbEnd : top ? set.thumbStart : set.track);",
      expect: "T1.59",
    },
    {
      // **I93 — the set degrades whole.** Under `ambiguousWidth: "wide"` every
      // member is two cells in this tree, and a set that keeps its Unicode rung
      // there draws a two-cell glyph in a one-cell column: the row wraps, and
      // wrapping the alternate screen is the failure the application can no
      // longer see.
      name: "the set keeps its Unicode rung at ambiguousWidth: wide",
      file: GLYPHS,
      from: '  return caps.ambiguousWidth === "wide" ? SCROLLBAR_ASCII_SET : SCROLLBAR_UNICODE_SET;',
      to: "  return SCROLLBAR_UNICODE_SET;",
      expect: "T1.61",
    },
    {
      // **The collapsed box has no interior for a bar to sit in** (C04 I98).
      // Without the arm the column is asked for over a gutter of zero rows,
      // and a collapsed box that measured 1 draws a second row.
      name: "a collapsed box reserves a column it has no interior for",
      file: CONTAINERS,
      from: "  if (interior === 0) return { contentWidth: width, content: full, bar: false };",
      to: "",
      expect: "T2.42",
    },
    {
      // **A bar needs a column and something to sit beside it.** The first
      // version wrote `Math.max(1, width - 1)`, which at a width of one leaves
      // the content its whole cell and the bar another — a two-cell row in a
      // one-cell box (C09 I1, F1211).
      name: "a width of one is split into a cell of content and a cell of bar",
      file: CONTAINERS,
      from: "  if (width <= 1) return { contentWidth: width, content: full, bar: false };\n  const narrow = width - 1; // cells-ok — a width less its bar",
      to: "  const narrow = Math.max(1, width - 1); // cells-ok — a width less its bar",
      expect: "T2.1b",
    },
    {
      // **The tone that tells a focused box from an idle one** (§021, C26 §7).
      // One colour everywhere is a bar that draws correctly and says nothing
      // about where the keys are going.
      name: "the bar is the same tone whether or not focus is inside the box",
      file: CONTAINERS,
      from: '          const ink = tone(held ? "accent" : "muted", ctx.theme, ctx.capabilities);',
      to: '          const ink = tone("muted", ctx.theme, ctx.capabilities);',
      expect: "T2.157",
    },
    {
      // **The column is non-circular because the re-measure is conditional.**
      // Measuring at `width - 1` unconditionally is the version that looks
      // tidier and costs a second measure on every box that does not overflow
      // — C09 I61's *one block at two widths is two questions* counted where
      // there is only one.
      //
      // **Aimed at T2.148 rather than at T1.33, and the difference is a
      // finding.** T1.33 asserts that no `(id, width)` pair repeats, and an
      // unconditional narrowing measures every child exactly once at
      // `width - 1` — so the measure-once row is satisfied by the defect it
      // reads as covering. What catches it is the row about the width itself:
      // a box whose content fits is measured at the full width, and one cell
      // narrower wraps it and buys a residue row the frame does not have.
      name: "the content is re-measured one cell narrower whether or not it overflowed",
      file: CONTAINERS,
      from: "  const full = contentHeight(block, width, measureChild);\n  if (full <= interior) return { contentWidth: width, content: full, bar: false };",
      to: "  const full = contentHeight(block, width - 1, measureChild);\n  if (full <= interior) return { contentWidth: width, content: full, bar: false };",
      expect: "T2.148",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
