// C09 tier 3 — the cursor `fitStyled` and `sliceCells` move over a styled row.
//
// Every row of every frame goes through `fitStyled` (`exact()` in
// `shell/paint.ts`), and F937 measured it at 53 % of all frame work because the
// cursor's read of one code point — `[...text.slice(i)][0]` — allocated the rest
// of the row to yield it, on every character. The durable check is SS60, a
// source scan: a cost has no failing case, and a timing row is what TRIAGE
// group 12 is made of. The two timing rows here are the measurement beside the
// rule, with the two guards that group demands — each operand does at least
// 20 ms of calls so the clock's floor cannot produce the ratio (F8), and the
// bound sits midway between what a linear walk gives and what the shipped
// quadratic gave. T3.79 is the other half of the walk: what the cursor's step
// being a code point *and not a cluster* does to the frame (F939).
import { describe, expect, it } from "vitest";
import { cells, displayCells, fitStyled, sliceCells } from "../../src/presentation/text.js";
import { SGR_RESET } from "../../src/terminal/escapes.js";

/** Built rather than written, as T1.14 builds its ESC: a literal here is a byte no reader sees. */
const ESC = String.fromCharCode(27);
const SGR = `${ESC}[38;5;241m`;
const ZWJ = "\u200D";

/** A row of `n` cells with a colour change every twenty — the profiling fixture's shape. */
function styledRow(n: number): string {
  let s = "";
  for (let i = 0; i < n; i += 1) s += (i % 20 === 0 ? SGR : "") + "x";
  return s;
}

/**
 * Milliseconds per call, best of three batches, each batch running until at
 * least `floorMs` has elapsed.
 *
 * **The floor is the guard against F8.** A single call at 50 cells is a few
 * microseconds, and a clock reading `0.00` for it makes any ratio — or `NaN` —
 * so each operand is a batch long enough for the clock to see, and the count
 * of calls in the batch is what divides it. Best of three rather than a mean,
 * because contention only ever adds: the smallest batch is the one the machine
 * interfered with least, and a ratio of two minima is the figure a loaded box
 * can still reproduce (F929).
 */
function perCall(fn: () => unknown, floorMs = 20): number {
  let best = Infinity;
  for (let rep = 0; rep < 3; rep += 1) {
    let calls = 0;
    const start = performance.now();
    let elapsed = 0;
    do {
      fn();
      calls += 1;
      elapsed = performance.now() - start;
    } while (elapsed < floorMs);
    best = Math.min(best, elapsed / calls);
  }
  return best;
}

/**
 * The bound, and why it is where it is. From 50 cells to 400 a linear walk
 * costs 8×; the shipped quadratic measured **48.3×** for `fitStyled`'s walk and
 * **48.5×** for `sliceCells`'s tail window in these two rows, run against the
 * unfixed code (42× and 21× on the bench beside them — F938's table). 24 is
 * three times linear and half the row's own figure, so a contended run has
 * room and a restored spread has none.
 */
const LINEAR_AT_8X_WITH_MARGIN = 24;

describe("C09 §5a — the walk is linear in the row (C09 I60)", () => {
  it("T3.77 (C09 I60): fitStyled's cost from 50 to 400 cells is nearer 8× than 64×", () => {
    // The pad path — a row one cell short of `width` — because F937 measured it
    // as the ordinary case: rows arrive from Ink short of the terminal width, so
    // a row that needs nothing but spaces pays the whole walk to discover it.
    const small = styledRow(50);
    const large = styledRow(400);
    const smallMs = perCall(() => fitStyled(small, 51, SGR_RESET));
    const largeMs = perCall(() => fitStyled(large, 401, SGR_RESET));
    const ratio = largeMs / smallMs;

    // The control that says the operands measured something: a longer row costs
    // more, whatever the clock's resolution.
    expect(largeMs, `400 cells took ${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)} at 50`).toBeGreaterThan(smallMs);
    expect(
      ratio,
      `fitStyled at 400 cells cost ${ratio.toFixed(1)}× its cost at 50 (${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)}); ` +
        "linear is 8×, the shipped spread measured 48.3× here, and the bound is 24×",
    ).toBeLessThan(LINEAR_AT_8X_WITH_MARGIN);
  });

  it("T3.78 (C09 I60): sliceCells's cost over a tail window from 50 to 400 cells is nearer 8× than 64×", () => {
    // The tail window `composite` takes — cells `[left + width, columns)` — so
    // the cursor walks the whole row to reach it, which is where the second
    // instance F937 did not name sat (F938).
    const small = styledRow(50);
    const large = styledRow(400);
    const smallMs = perCall(() => sliceCells(small, 10, 50));
    const largeMs = perCall(() => sliceCells(large, 10, 400));
    const ratio = largeMs / smallMs;

    expect(largeMs, `400 cells took ${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)} at 50`).toBeGreaterThan(smallMs);
    expect(
      ratio,
      `sliceCells at 400 cells cost ${ratio.toFixed(1)}× its cost at 50 (${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)}); ` +
        "linear is 8×, the shipped spread measured 48.5× here, and the bound is 24×",
    ).toBeLessThan(LINEAR_AT_8X_WITH_MARGIN);
  });
});

describe("C09 §5a — a code point is not a cluster (F939)", () => {
  // **The record, in T3.76's form: this row pins the walk as it stands, and it
  // is the walk's defect that it pins.** `cells()` asks the segmenter, so a
  // cluster is measured whole; the cursor asks each code point, so a cluster
  // whose width is not the sum of its parts is counted wrong — a ZWJ family at
  // 2 + 0 + 2 + 0 + 2 + 0 + 2, an emoji-presentation `⚠️` at 1 + 0, a flag at
  // 2 + 2, a skin tone at 2 + 2. The consequences below are what a frame gets.
  //
  // The fix the brief that found this ruled out — F938 replaces the read and
  // keeps the step — is a cursor that steps by cluster, and it changes the
  // pieces I20 composes (T1.16c's family row among them). When it lands, every
  // assertion here fails and is rewritten to the cluster answer; until then a
  // change to the read that moved any of these would be a change to the walk.
  const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`;
  const WARNING = "⚠️";
  const FLAG = "\u{1F1EC}\u{1F1E7}";
  const TONED = "\u{1F44D}\u{1F3FD}";

  /** What the cursor adds up for a cluster: one `cells()` answer per code point. */
  const walked = (cluster: string): number => Array.from(cluster).reduce((n, cp) => n + cells(cp), 0);

  it("T3.79 (C09 §5a, F939): four cluster shapes the walk counts wrong, and what each does to a row", () => {
    // The disagreement itself, per shape. The measurer is right about all four
    // (T1.13); the walk over-counts three and under-counts one.
    expect([displayCells(FAMILY), walked(FAMILY)], "ZWJ family: measured, walked").toEqual([2, 8]);
    expect([displayCells(WARNING), walked(WARNING)], "emoji presentation: measured, walked").toEqual([2, 1]);
    expect([displayCells(FLAG), walked(FLAG)], "regional-indicator pair: measured, walked").toEqual([2, 4]);
    expect([displayCells(TONED), walked(TONED)], "skin-tone modifier: measured, walked").toEqual([2, 4]);

    // **Over-count: a row that fits is cut, and a row that needs padding gets
    // none.** Fourteen cells by the measurer; the walk believes twenty.
    const row = `abc ${FAMILY} defghij`;
    expect(displayCells(row)).toBe(14);
    expect(fitStyled(row, 15, SGR_RESET), "fitted to 15, a row of 14 loses five characters").toBe(`abc ${FAMILY} de`);
    expect(displayCells(fitStyled(row, 15, SGR_RESET)), "and comes back nine cells wide, not fifteen").toBe(9);
    expect(fitStyled(row, 20, SGR_RESET), "fitted to 20, it is padded by nothing").toBe(row);
    expect(displayCells(fitStyled(row, 20, SGR_RESET)), "so six cells of the previous frame show through").toBe(14);

    // **Under-count: a row comes back wider than `width`**, which is the wrap
    // that scrolls the alternate screen — the hazard C01 and C02 both name.
    expect(fitStyled(`${WARNING}x`, 2, SGR_RESET)).toBe(`${WARNING}x`);
    expect(displayCells(fitStyled(`${WARNING}x`, 2, SGR_RESET)), "three cells in a two-cell slot").toBe(3);

    // **A flag is halved**: C09 I9's rule, broken by the walk that was written to
    // keep it — the first regional indicator is kept as a glyph of its own.
    expect(fitStyled(`${FLAG}x`, 2, SGR_RESET)).toBe("\u{1F1EC}");

    // And the window: a joiner survives on its own between two blanks.
    expect(sliceCells(`x${FAMILY}y`, 2, 4)).toBe(` ${ZWJ} `);
  });
});
