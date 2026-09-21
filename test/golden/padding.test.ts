// Padding, in a frame — the four cases the gate could not see (C04 §3a, C09 I80).
//
// **Written for containment.test.ts's reason, one model later.** That file exists
// because nothing in `test/golden/` rendered a definition that throws, so the
// error box's appearance was recorded nowhere and the suite's silence was the
// absence of a subject. Phase 2a is the same shape. Measured over the shared
// block corpus: **51 blocks, 0 with padding, 1 row group and no padded child of
// one** — and the terminal baseline is one plot per frame, so its 2,440 frames
// are blind to the property by construction. Of 458 golden entries the change
// moved 16, all in `patch.test.ts`, all from one builder default.
//
// So three of the model's four claims were shipped with no frame behind them and
// the fourth was watched by accident. The horizontal edges are the worst of it:
// `#padded` insets each row by `l` and cuts to `w - l - r`, and **no block
// anywhere in the tree declares `l` or `r`** — code with a rule, a test, and no
// picture. *A snapshot records, it does not check*, and one with no subject does
// not even record.
//
// **The window seam is not here**, deliberately: a padded block is refused by
// `windowChild` on the floor's ground (C09 I33, I80) and that is T2.124's sweep,
// where the predicate is restated rather than shared. A second statement of it in
// a golden file would be the weaker of two records and the one that drifts.
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import { measurable, ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const WIDTHS = [30, 40, 80] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
  { name: "light-unicode", theme: LIGHT_THEME, capabilities: FULL_CAPS },
] as const;

const LINE = "the quick brown fox jumps over the lazy dog and keeps going";

const padded = (id: string, pad: Readonly<{ l?: number; r?: number; t?: number; b?: number }>): Block =>
  block({ kind: "raw", id, text: LINE, padding: pad } as unknown as Block);

/**
 * The four cases, each the picture of one claim.
 *
 * 1. **Alone.** A block drawn outside any sequence draws its own edges — where
 *    `gapBefore` was inert, because the row belonged to a composer that was not
 *    running. This is the claim the 16 moved patch frames turned out to hold.
 * 2. **Horizontal.** `l` and `r` inset the row and narrow the width the kind is
 *    asked for. Two effects, and a frame is the only thing that shows either — a
 *    height assertion is satisfied by an inset that never happened. It takes two
 *    cases because `raw` truncates: 2 shows the inset on a kind that does not
 *    wrap, and 2b shows the narrowing on one that does. One case showing only
 *    the inset would read as covering both.
 * 3. **A row group's child.** The walk's A4: a row used to ignore the field
 *    outright and now honours it, because a row's child is a box like any other.
 *    The two columns start on different rows, which is the whole of the move.
 * 4. **Inside a sequence.** The control, and it is the case that must *not* move:
 *    the row changed owner and not position (walk S1). A frame where this differs
 *    from the old model is the migration going wrong rather than landing.
 */
const CASES: readonly { label: string; blocks: readonly Block[] }[] = [
  { label: "1 · alone, top and bottom", blocks: [padded("alone", { t: 1, b: 2 })] },
  { label: "2 · horizontal, three in and one out", blocks: [padded("inset", { l: 3, r: 1 })] },
  {
    // **The narrowing, which case 2 cannot show.** `raw` truncates, so the inset
    // is visible there and the width the kind was asked for is not. A wrapping
    // kind puts both in one picture: the rows start three columns in *and* break
    // four columns earlier than the block's width would say.
    label: "2b · horizontal, on a kind that wraps",
    blocks: [
      block({ kind: "tip", id: "wrapped", text: `${LINE} ${LINE}`, padding: { l: 3, r: 1 } } as unknown as Block),
    ],
  },
  { label: "3 · all four edges", blocks: [padded("box", { l: 2, r: 2, t: 1, b: 1 })] },
  {
    label: "4 · a row group, one child padded",
    blocks: [b.group("row", [padded("left", { t: 1 }), block({ kind: "raw", id: "right", text: "a\nb\nc" } as unknown as Block)])],
  },
  {
    label: "5 · in a sequence — the row must not move",
    blocks: [
      block({ kind: "raw", id: "first", text: "first" } as unknown as Block),
      padded("second", { t: 1 }),
      block({ kind: "raw", id: "third", text: "third" } as unknown as Block),
    ],
  },
];

describe("C09 I80 — a block's own padding, in a frame", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${String(width)}`, () => {
        const kit = measurable({ theme: variant.theme, capabilities: variant.capabilities });
        const frame = CASES.map(({ label, blocks }) => {
          const lines = kit.renderSequence(blocks, width);
          const measured = blocks.reduce((n, x) => n + kit.measure(x, width), 0);
          // The ruler makes the inset readable: a row that starts three columns
          // in is indistinguishable from one that wrapped short without it.
          const ruler = Array.from({ length: width }, (_, i) => (i % 10 === 0 ? "|" : ".")).join("");
          return [
            `── ${label} · measured ${String(measured)} · rendered ${String(lines.length)}`, // cells-ok — row counts
            ruler,
            ...lines.map((l) => `[${l}]`),
          ].join("\n");
        }).join("\n");
        expect(frame).toMatchSnapshot();
      });
    }
  }

  it("T5.9 (C09 I80, I1): every case measures what it renders, at every width", () => {
    // **The arithmetic beside the picture**, because a frame read is a person
    // and this is the part a person is worst at. C09 I1 over the same cases.
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });
    for (const width of WIDTHS) {
      for (const { label, blocks } of CASES) {
        const measured = blocks.reduce((n, x) => n + kit.measure(x, width), 0);
        expect(kit.renderSequence(blocks, width), `${label} at ${String(width)}`).toHaveLength(measured); // cells-ok — a row count
      }
    }
  });
});
