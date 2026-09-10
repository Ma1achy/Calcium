// C17 tier 3 — edge cases. The inputs that arrive from a paste rather than
// from a keyboard, and the sizes nobody types.
import { describe, expect, it, vi } from "vitest";
import { CORPUS_BUDGET_MS } from "../support/budget.js";


import { createEditor } from "../../src/interaction/editor/index.js";
// **Deeper than the barrel, deliberately.** The linearity claim needs the
// walk's `drawAs` seam, which `editor.displayRows` fills in from its own chip
// table; `layout.ts` takes it as a parameter. Adding an export to the barrel
// for a test would be an export nothing else consumes (MG24).
import { displayRows } from "../../src/interaction/editor/layout.js";
import { graphemes } from "../../src/interaction/editor/graphemes.js";

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

    // **The linearity claim is a count now, not a duration** (F1091). The ratio
    // it replaces had to separate linear from quadratic — 2 from 4 — with the
    // bound at 3, one unit of headroom either side, and five runs of this row
    // alone read 2.38, 2.35, 1.38, 1.84 and 2.13. A spread of a whole unit on
    // an instrument that has to resolve one. Inside a full `make all` the
    // record is 2.14 green and 3.06 red, and the two paragraphs this replaces
    // carried 3.03 and 3.17 red before that.
    //
    // **Both earlier repairs — a minimum of five, then a minimum of three over
    // fresh editors after F1014's memo — missed the mechanism, and it is not
    // the machine being busy.** In the red run the small walk read 328 ms
    // inside its solo range of 252–360 while the big walk read 1004 against a
    // solo 496–611. A busy machine slows both and the ratio survives; twice the
    // text is twice the allocation, so the big walk pays a collection the small
    // one does not, and no minimum over N removes a cost every one of the N
    // readings pays. F1084 is the same rule from the other side — a ratio is an
    // instrument only when its noise is common to both operands.
    //
    // **So: measure the thing the ratio was a proxy for**, which is F1084's
    // repair as well. The walk calls `drawAs` exactly once per cluster, at one
    // site, so a counting `drawAs` that returns its input unchanged reports the
    // inner loop's trip count — one visit per cluster, where a re-walk is 2n.
    // Exact, load-free, and a stronger claim than any duration: the fabricated
    // violation, a second `drawAs?.(cluster)` ahead of the real one, gives
    // 2 000 064 against 1 000 032 while the walk's duration reads 667 ms
    // against 668 clean. No timing could have seen it.
    //
    // **Its blind spot, stated**: this counts iterations, so a change making
    // each step O(rows) — copying the rows array per cluster, say — is
    // quadratic and invisible here, and the timing that would have moved is
    // evidence below rather than an assertion. Nothing in the suite reaches
    // that class. The alternative is keeping a bound that has been red three
    // times and green by luck, which detects nothing and reports constantly.
    const visits = (t: string): number => {
      let n = 0;
      displayRows(t, 80, G, (cluster) => {
        n += 1;
        return cluster;
      });
      return n;
    };

    const bigVisits = visits(text);
    const smallVisits = visits(halfText);

    // The instrument is shown to respond before it is asserted against
    // (`test/support/README.md`): a counter that never fires and one that fires
    // once per cluster both satisfy an equality against zero.
    expect(smallVisits, "the counter fires at all").toBeGreaterThan(0);
    expect(bigVisits, "and it separates the two sizes").toBeGreaterThan(smallVisits);

    expect(bigVisits, "one visit per cluster, and one walk").toBe(graphemes(text).length); // graphemes-ok
    expect(smallVisits, "and the same over half of it").toBe(graphemes(halfText).length); // graphemes-ok

    // **The durations are reported and asserted on only for resolution.** One
    // reading each: the minimum over three existed to quieten a ratio that is
    // no longer an assertion, and paying three walks of each size to print a
    // number is a cost with no claim behind it. **Measured, the row falls from
    // 4.78 s to 3.04 s alone**, which is a third of the pressure F1088 put on
    // `CORPUS_BUDGET_MS` given back — the count costs two walks and two
    // segmentations, and it replaced six.
    const timed = (t: string): { rows: number; ms: number } => {
      const ed = createEditor({ text: t });
      const start = performance.now();
      const rows = ed.displayRows(80, G);
      return { rows, ms: performance.now() - start };
    };

    const small = timed(halfText);
    const big = timed(text);

    expect(small.ms, "the smaller walk is above the clock's resolution").toBeGreaterThan(1);

    console.log(
      `T3.15 · ${smallVisits} → ${bigVisits} visits, exact · ${small.ms.toFixed(2)} ms → ${big.ms.toFixed(2)} ms, ratio ${(big.ms / small.ms).toFixed(2)} — reported, not asserted (F1091)`,
    );

    expect(big.rows / small.rows, "twice the text, twice the rows").toBeCloseTo(2, 0);
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
