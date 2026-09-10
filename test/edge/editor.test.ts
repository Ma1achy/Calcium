// C17 tier 3 — edge cases. The inputs that arrive from a paste rather than
// from a keyboard, and the sizes nobody types.
import { describe, expect, it, vi } from "vitest";
import { CORPUS_BUDGET_MS } from "../support/budget.js";


import { createEditor } from "../../src/interaction/editor/index.js";
import type { LineEditor } from "../../src/interaction/editor/index.js";

// This file builds a large corpus; `budget.ts` carries the measurement and
// why the 5 s default is not a margin. Re-measure before raising it.
vi.setConfig({ testTimeout: CORPUS_BUDGET_MS });

const G = { first: 2, cont: 2 } as const;

describe("C17 §6 — large input", () => {
  it("T3.15: a 1 MB paste completes within budget and displayRows stays linear", () => {
    // Linear rather than fast: the assertion is on the *shape* of the cost,
    // because a quadratic walk passes a wall-clock budget on a small machine
    // and fails on a large document nobody tested. Two sizes, one ratio.
    const e = createEditor();
    const chunk = "the quick brown fox jumps over the lazy dog ";
    const text = chunk.repeat(Math.ceil(1_000_000 / chunk.length));

    const pasted = Date.now();
    e.insert(text, { atomic: true });
    const insertMs = Date.now() - pasted;

    expect(e.text.length, "a megabyte, near enough").toBeGreaterThan(1_000_000); // graphemes-ok
    expect(insertMs, "one paste, one edit").toBeLessThan(2000);

    const halfText = text.slice(0, Math.floor(text.length / 2)); // graphemes-ok

    // **The ratio is the assertion, so the measurement has to be quieter than
    // the gap it has to see.** Linear is 2 and quadratic is 4; the bound sits at
    // 3, in the middle, which is right. What was wrong was the instrument: one
    // timing of each size, so a single descheduled slice anywhere in the larger
    // one is the whole reading. The row failed at **3.03 and 3.17** and passed
    // two runs in three — inside the noise, not outside the budget.
    //
    // **The minimum of five is the repair, and the clock is not.** The first
    // reading of this blamed `Date.now()`'s millisecond quantisation, and the
    // figures say otherwise: these measurements are 320–390 ms and 645–880 ms,
    // where one millisecond is 0.3 % and cannot move a ratio to 3.17. The
    // minimum of N is the least-contended estimate of a deterministic
    // computation, which is what removes the tail. `performance.now()` stays
    // because it costs nothing, not because it fixed anything.
    //
    // Five runs after: 2.18, 2.49, 1.99, 1.73, 2.11. The bound is unchanged,
    // because the bound was never the thing that was wrong.
    //
    // **And then the memo landed and the minimum stopped measuring the walk**
    // (F1014). `displayRows` returns `this.layout(width, gutter).length`, and
    // `layout` caches on text, width and gutter — so readings two through five
    // are cache hits and `Math.min` takes one of them. The figures above are
    // the tell: 320–390 ms became **0.00 → 0.00, ratio 6.75** against a bound
    // of 3, two numbers below the timer's resolution divided by each other.
    // The row went green or red on noise, and it had been green by luck.
    //
    // The comment three paragraphs up names the premise that broke: the
    // minimum of N is the least-contended estimate **of a deterministic
    // computation**, which a memoised one stops being. So each reading gets
    // its own editor, built outside the timed region, and every timed call is
    // a miss.
    //
    // **Three rather than five, and the cost is why.** Every reading is now a
    // real walk, so the row pays 3 × 430 ms + 3 × 260 ms where it used to pay
    // one of each: **4.78 s against `CORPUS_BUDGET_MS`'s 10 s**, measured. Five
    // would be 6.2 s and no quieter — the tail this removes is a descheduled
    // slice, and a minimum over three has already dropped it.
    const best = (make: () => LineEditor): { rows: number; ms: number } => {
      const editors = Array.from({ length: 3 }, make);
      let rows = 0;
      let ms = Number.POSITIVE_INFINITY;
      for (const ed of editors) {
        const start = performance.now();
        rows = ed.displayRows(80, G);
        ms = Math.min(ms, performance.now() - start);
      }
      return { rows, ms };
    };

    const small = best(() => createEditor({ text: halfText }));
    const big = best(() => createEditor({ text }));

    // **The instrument has to be shown to be measuring anything at all.** Two
    // readings under the clock's resolution divide to any ratio at all, which
    // is how this row passed for as long as it did.
    expect(small.ms, "the smaller walk is above the clock's resolution").toBeGreaterThan(1);

    console.log(
      `T3.15 · ${small.ms.toFixed(2)} ms → ${big.ms.toFixed(2)} ms, ratio ${(big.ms / small.ms).toFixed(2)} against a bound of 3`,
    );

    expect(big.rows / small.rows, "twice the text, twice the rows").toBeCloseTo(2, 0);
    expect(big.ms / small.ms, "and not four times the work").toBeLessThan(3);
  });

  it("T3.16: a lone surrogate never reaches the segmenter intact", () => {
    // An unpaired surrogate is what a truncated UTF-8 read produces, and
    // `Intl.Segmenter` must not be handed one — the buffer keeps it as the
    // replacement character rather than crashing or dropping the rest.
    const e = createEditor();
    e.insert(`a\uD800b`, { atomic: true });

    // Replaced, not merely survived. The first version of this test asserted
    // only that nothing threw, which passes just as well when the surrogate
    // sits in the buffer making the command unsendable — a fixture that does
    // not respond to the thing it names (test/support/README.md).
    expect(e.text).toBe("a\uFFFDb");
    expect(e.cursor, "and it is one position").toBe(3);
    expect(() => e.layout(80, G)).not.toThrow();
  });

  it("a 200-line paste is one undo unit and the rows are the lines", () => {
    // T5.2's property, at the tier that can assert it without a frame.
    const e = createEditor();
    e.insert(Array.from({ length: 200 }, (_, i) => `line ${String(i)}`).join("\n"), {
      atomic: true,
    });

    expect(e.displayRows(80, G)).toBe(200);
    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });
});

describe("C17 §2 — degenerate geometry", () => {
  it("width 0 and a gutter wider than the terminal do not divide by zero", () => {
    const e = createEditor({ text: "日本語です" });

    for (const [width, gutter] of [
      [0, G],
      [1, G],
      [2, { first: 2, cont: 2 }],
      [3, { first: 8, cont: 8 }],
    ] as const) {
      const rows = e.layout(width, gutter);
      expect(rows.length, `${width} / ${gutter.first}`).toBeGreaterThan(0);
      expect(e.displayRows(width, gutter)).toBe(rows.length);
      expect(rows.join(""), "and nothing is lost").toBe("日本語です");
    }
  });

  it("a non-finite width is treated as the narrowest, not as a crash", () => {
    const e = createEditor({ text: "ls -la" });

    expect(() => e.layout(Number.NaN, G)).not.toThrow();
    expect(e.layout(Number.NaN, G).join("")).toBe("ls -la");
  });

  it("the cursor beyond the end clamps to the last position", () => {
    const e = createEditor({ text: "ls", cursor: 99 });

    expect(e.cursor).toBe(2);
    expect(e.cursorCell(80, G)).toEqual({ row: 0, col: 4 });
  });
});
