// C25 T5.2 / commitment 5 — golden frames at 80 / 100 / 120 / 160 (D39).
//
// **These exist to be read**, and reading them is what the other five tiers cannot
// do. Every assertion in them passes over a diff whose gutter drifts by a column
// between hunks, whose collapse marker crowds its neighbours, or whose syntax is
// illegible on the background behind it. A diff has more of that surface than a plot
// does — four columns, two layouts and a separator — and reading this set at C25's
// first render found four defects: the path header's rule stopping at the label
// rather than running to the width, the whole-row background asserting a change on
// the blank side of a split pair, a two-cell indent under the header costing two
// columns of every line, and a fixture whose hunk header disagreed with its own
// lines.
//
// **The widths straddle the layout breakpoint**, which is the axis that matters
// here: 80 is unified and 100, 120 and 160 are split, so one snapshot set covers
// both pictures and the step in height between them is visible in the header line of
// every case.
//
// Both unicode modes are axes because the collapse marker is C25 §3's deliberate
// exception to C09's 1:1 substitution rule — `⋯` is one cell and `...` is three — so
// the ASCII form is a genuinely different row rather than a glyph swap.
import { describe, expect, it } from "vitest";
import { hunkOf, patchOf, THE_ILLUSTRATION } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, MONO_CAPS, measurable } from "../support/render.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const WIDTHS = [80, 100, 120, 160] as const;

const THEMES = [
  { name: "dark", theme: DARK_THEME },
  { name: "light", theme: LIGHT_THEME },
] as const;

const MODES = [
  { name: "utf8", capabilities: FULL_CAPS },
  { name: "ascii", capabilities: ASCII_CAPS },
] as const;

/**
 * The cases §8's T5.2 names, plus the three only a picture settles: a lopsided run,
 * three hunks with number columns sized by the widest of them, and the 1-bit form
 * where the background is gone and the marker is all that is left.
 */
const CASES: readonly Readonly<{ label: string; block: Block; mono?: boolean }>[] = [
  { label: "the illustration", block: patchOf({ hunks: [THE_ILLUSTRATION] }) },
  {
    label: "three hunks, wide numbers",
    block: patchOf({
      id: "three",
      hunks: [
        hunkOf([" spec:", "-  replicas: 2", "+  replicas: 3"], { collapsedBefore: 9 }),
        hunkOf([" template:", "+  nodeSelector: gpu"], { oldStart: 90, newStart: 91, collapsedBefore: 40 }),
        hunkOf([" # tail", "-  retain: 7"], { oldStart: 998, newStart: 999 }),
      ],
    }),
  },
  {
    label: "lopsided run",
    block: patchOf({
      id: "lopsided",
      hunks: [hunkOf([" a: 1", "-b: 2", "-c: 3", "-d: 4", "+b: 9", " e: 5"])],
    }),
  },
  { label: "context only", block: patchOf({ id: "ctx", hunks: [hunkOf([" a: 1", " b: 2", " c: 3"])] }) },
  { label: "new file, all additions", block: patchOf({ id: "new", hunks: [hunkOf(["+a: 1", "+b: 2", "+c: 3"])] }) },
  { label: "no hunks", block: patchOf({ id: "empty", hunks: [] }) },
  {
    label: "long line, truncated",
    block: patchOf({ id: "long", hunks: [hunkOf([" a: 1", `+note: ${"very ".repeat(60)}end`])] }),
  },
  {
    label: "unknown language, plain text",
    block: patchOf({ id: "plain", language: "brainfuck", hunks: [hunkOf([" a: 1", "+b: 2"])] }),
  },
  {
    label: "forced unified at a split width",
    block: patchOf({ id: "forced", layout: "unified", hunks: [THE_ILLUSTRATION] }),
  },
  {
    label: "1-bit — no background, marker alone",
    mono: true,
    block: patchOf({ id: "mono", hunks: [THE_ILLUSTRATION] }),
  },
];

describe("C25 T5.2 — golden frames", () => {
  for (const mode of MODES) {
    for (const variant of THEMES) {
      for (const width of WIDTHS) {
        it(`${mode.name} ${variant.name} at ${String(width)}`, () => {
          const frame = CASES.map(({ label, block: b, mono }) => {
            const kit = measurable({
              definitions: [patchDefinition as unknown as BlockDefinition<never>],
              theme: variant.theme,
              // The 1-bit case pins its own depth: what it is for is the frame with
              // the background gone, and rendering it at 24-bit would snapshot the
              // background twice and the degradation never.
              capabilities:
                mono === true ? { ...MONO_CAPS, unicode: mode.capabilities.unicode } : mode.capabilities,
            });
            const lines = kit.renderToLines(b, width);
            return [
              `── ${label} · measured ${String(kit.measure(b, width))} · rendered ${String(lines.length)}`, // cells-ok
              ...lines,
            ].join("\n");
          }).join("\n");

          expect(frame).toMatchSnapshot();
        });
      }
    }
  }
});
