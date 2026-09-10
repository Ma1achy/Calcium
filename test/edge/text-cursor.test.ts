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
// quadratic gave. T3.79 is the other half of the walk: the cursor steps by
// cluster, as the measurer counts, so the four shapes the code-point step
// counted wrong come out right (I63, F939). T3.84 and T3.85 are F955's rows:
// the cluster step is linear too, and a row holding one glyph is not
// segmented whole for it.
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
    //
    // **It lost once, and the figures are here because a rare red is a
    // reproduction spent.** 2026-09-10, inside a `make all` on a host that was
    // killing background processes for memory: `400 cells took 0.0154 ms
    // against 0.0364 at 50` — the *small* row measured 2.4× the large one.
    // Not a near miss around a small gap, and not the clock's resolution
    // either: `perCall` runs each subject for 20 ms and takes a minimum over
    // three reps, so both operands are steady-state. What the sentence above
    // does not survive is the two measurements being taken minutes apart on a
    // machine whose state moved in between — the load lands on whichever
    // operand it lands on, and this control reads that as a claim about cost.
    //
    // Re-measured five times alone immediately after: green five of five. So it
    // is recorded rather than repaired — the countable thing F1084 and F1091
    // reach for is `Segments.prototype.containing`, and this arm's rows are
    // ASCII and never touch the segmenter, which is the whole point of the row
    // below it. If it reds again outside a memory-pressured chain, that is the
    // second sample and the repair is a different instrument, not a wider bound.
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

describe("C09 §5a — the cursor steps by cluster, as the measurer counts (C09 I63, F939)", () => {
  // **This row pinned the defect until the cluster cursor landed, and now pins
  // the claim.** `cells()` asks the segmenter, so a cluster is measured whole;
  // the cursor asked each code point, so a cluster whose width is not the sum
  // of its parts was counted wrong — a ZWJ family at 2 + 0 + 2 + 0 + 2 + 0 + 2,
  // an emoji-presentation `⚠️` at 1 + 0, a flag at 2 + 2, a skin tone at 2 + 2.
  // The `walked` sums below are kept as the record of what the code-point step
  // added up; the walk no longer adds anything up, and every consequence that
  // followed is asserted the other way round.
  const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`;
  const WARNING = "⚠️";
  const FLAG = "\u{1F1EC}\u{1F1E7}";
  const TONED = "\u{1F44D}\u{1F3FD}";

  /** What the code-point cursor added up for a cluster: one `cells()` answer per code point (F939). */
  const walked = (cluster: string): number => Array.from(cluster).reduce((n, cp) => n + cells(cp), 0);

  it("T3.79 (C09 I63, §5a, F939): four cluster shapes the code-point walk counted wrong, and each row comes out at its width", () => {
    // The disagreement the row was written about, still true of the sums and
    // no longer of the walk: the measurer is right about all four (T1.13), and
    // the per-code-point sum over-counts three and under-counts one.
    expect([displayCells(FAMILY), walked(FAMILY)], "ZWJ family: measured, summed per code point").toEqual([2, 8]);
    expect([displayCells(WARNING), walked(WARNING)], "emoji presentation: measured, summed").toEqual([2, 1]);
    expect([displayCells(FLAG), walked(FLAG)], "regional-indicator pair: measured, summed").toEqual([2, 4]);
    expect([displayCells(TONED), walked(TONED)], "skin-tone modifier: measured, summed").toEqual([2, 4]);

    // **A row that fits is kept, and a row that needs padding gets it.**
    // Fourteen cells by the measurer, and fourteen by the walk.
    const row = `abc ${FAMILY} defghij`;
    expect(displayCells(row)).toBe(14);
    expect(fitStyled(row, 15, SGR_RESET), "fitted to 15, a row of 14 keeps its cell to spare").toBe(`${row} `);
    expect(displayCells(fitStyled(row, 15, SGR_RESET))).toBe(15);
    expect(fitStyled(row, 20, SGR_RESET), "fitted to 20, it is padded to 20").toBe(`${row}${" ".repeat(6)}`);
    expect(displayCells(fitStyled(row, 20, SGR_RESET)), "so nothing of the previous frame shows through").toBe(20);

    // **A cut inside the family drops it whole and blanks its cells** (C09 I9):
    // at 5 the family would need cells 5 and 6, so the row is `abc ` and a
    // blank, never a joiner between two halves of a picture.
    expect(fitStyled(row, 5, SGR_RESET)).toBe("abc  ");
    expect(fitStyled(row, 6, SGR_RESET), "and at 6 it fits exactly").toBe(`abc ${FAMILY}`);

    // **No under-count: a row never comes back wider than `width`**, which is
    // the wrap that scrolls the alternate screen — the hazard C01 and C02 both
    // name. `⚠️x` fitted to 2 is the warning alone, two cells.
    expect(fitStyled(`${WARNING}x`, 2, SGR_RESET)).toBe(WARNING);
    expect(displayCells(fitStyled(`${WARNING}x`, 2, SGR_RESET))).toBe(2);
    expect(fitStyled(`${WARNING}x`, 1, SGR_RESET), "and at 1 the warning is dropped whole and its cell blanked").toBe(" ");

    // **A flag is whole or nothing** (C09 I9): never its first regional indicator
    // as a letter-in-a-box glyph of its own.
    expect(fitStyled(`${FLAG}x`, 2, SGR_RESET)).toBe(FLAG);
    expect(fitStyled(`${FLAG}x`, 1, SGR_RESET)).toBe(" ");
    expect(fitStyled(`${TONED}x`, 2, SGR_RESET), "and a skin-toned hand keeps its tone").toBe(TONED);
    expect(fitStyled(`${TONED}x`, 3, SGR_RESET)).toBe(`${TONED}x`);

    // And the window: a family straddling the left edge is blanked whole, and
    // no joiner survives on its own between two blanks.
    expect(sliceCells(`x${FAMILY}y`, 2, 4)).toBe(" y");
    expect(sliceCells(`x${FAMILY}y`, 1, 3), "a window holding exactly the family").toBe(FAMILY);
    expect(sliceCells(`x${FAMILY}y`, 0, 2), "straddling the right edge").toBe("x ");
    expect(sliceCells(`x${FAMILY}y`, 2, 4).includes(ZWJ)).toBe(false);

    // The composition law (C09 I20) over every split of a row holding every shape,
    // now with pieces that are each right rather than each wrong by the same
    // amount — which is the case T1.16c could not tell apart.
    const mixed = `${FLAG}a${WARNING}${TONED}b${FAMILY}`;
    const whole = displayCells(mixed);
    expect(whole).toBe(10);
    for (let a = 0; a <= whole; a += 1) {
      const left = sliceCells(mixed, 0, a);
      const right = sliceCells(mixed, a, whole);
      expect(displayCells(left) + displayCells(right), `split at ${String(a)}`).toBe(whole);
      expect(displayCells(fitStyled(mixed, a, SGR_RESET)), `fitted to ${String(a)}`).toBe(a);
      expect(fitStyled(mixed, a, SGR_RESET).includes(ZWJ) && !fitStyled(mixed, a, SGR_RESET).includes(FAMILY), "a joiner only inside a whole family").toBe(false);
    }
  });
});

describe("C09 §5a — the cluster step is linear, and one glyph does not segment the row (C09 I60, I63, F955)", () => {
  /** A row of `n` cells of CJK: every cluster reaches the segmenter. */
  const cjkRow = (n: number): string => "日".repeat(n / 2);
  /** A row of `n` cells holding one box-drawing glyph among ASCII — the patch gutter's shape (F955). */
  const gutterRow = (n: number): string => `${SGR}│${SGR_RESET} ${"x".repeat(n - 2)}`;

  it("T3.84 (C09 I60, I63): the cluster walk's cost from 50 to 400 cells is nearer 8× than 64×, on a row where every cluster reaches the segmenter", () => {
    // T3.77's form over the arm T3.77 cannot reach: its styled rows are ASCII
    // and never ask the segmenter. `containing` answers for one cluster from
    // one position; a reader that segmented the remainder of the row to reach
    // it would be F937's quadratic by another mechanism, and this is the row
    // that would see it. Measured on the fix: 7.2× for the pad path and 6.6×
    // for the tail window.
    const small = cjkRow(50);
    const large = cjkRow(400);
    const smallMs = perCall(() => fitStyled(small, 51, SGR_RESET));
    const largeMs = perCall(() => fitStyled(large, 401, SGR_RESET));
    const ratio = largeMs / smallMs;
    expect(largeMs, `400 cells took ${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)} at 50`).toBeGreaterThan(smallMs);
    expect(
      ratio,
      `fitStyled over CJK at 400 cells cost ${ratio.toFixed(1)}× its cost at 50 (${largeMs.toFixed(4)} ms against ${smallMs.toFixed(4)}); linear is 8× and the bound is 24×`,
    ).toBeLessThan(LINEAR_AT_8X_WITH_MARGIN);

    const smallTail = perCall(() => sliceCells(small, 10, 50));
    const largeTail = perCall(() => sliceCells(large, 10, 400));
    const tailRatio = largeTail / smallTail;
    expect(largeTail).toBeGreaterThan(smallTail);
    expect(
      tailRatio,
      `sliceCells over CJK at 400 cells cost ${tailRatio.toFixed(1)}× its cost at 50 (${largeTail.toFixed(4)} ms against ${smallTail.toFixed(4)}); the bound is 24×`,
    ).toBeLessThan(LINEAR_AT_8X_WITH_MARGIN);
  });

  it("T3.85 (C09 I63, F955, F1084): a 200-cell row holding one glyph asks the segmenter for one cluster, a CJK row for a hundred", () => {
    // **The transcript's 60 µs a row, counted rather than timed.** Every patch
    // row carries one `│` in its gutter, and that one glyph sent the whole row
    // through the segmenter — a segment object per ASCII character, forty of
    // the sixty microseconds (F955). The CJK row beside it is the row that
    // *must* segment every cluster, so what separates them is the number of
    // clusters reaching the segmenter: one against a hundred.
    //
    // **This gated on the ratio of two durations and the ratio is fragile in
    // one direction** (F1084). The comment here read *a ratio a loaded machine
    // can still reproduce*, which is true only when both operands scale with
    // the load. Measured at 200, 800 and 3 200 cells the gutter row is
    // sub-linear — 0.0065, 0.0117, 0.0211 ms, sixteen times the cells for 3.2×
    // the time — because `plainRun` skips the ASCII run and what is left is a
    // fixed floor, while the CJK row is linear. Most of the 200-cell
    // denominator is that floor, so additive noise compresses the quotient
    // toward one, and the bound was a floor: it fell to 5.7 against 6 inside a
    // full `make all` with the fix fully in place, the pre-fix figure being 2.8.
    //
    // `clusterAt` is the only caller of `Segments.prototype.containing`, so
    // patching that prototype counts exactly what I63 is about. **Two per
    // cluster and not one**, kept rather than divided away: `fitStyled` asks
    // once to find the cluster and `pieceCells` asks again to measure it.
    const proto = Object.getPrototypeOf(new Intl.Segmenter().segment("")) as {
      containing: (i: number) => unknown;
    };
    const real = proto.containing;
    const asked = (fn: () => unknown): number => {
      let calls = 0;
      proto.containing = function (this: unknown, i: number): unknown {
        calls += 1;
        return real.call(this, i);
      };
      // Restored whatever happens: this is a global, and a leaked patch would
      // make every later row in the process measure this one's counter.
      try {
        fn();
      } finally {
        proto.containing = real;
      }
      return calls;
    };

    const gutter = gutterRow(200);
    const cjk = cjkRow(200);
    const gutterAsks = asked(() => fitStyled(gutter, 201, SGR_RESET));
    const cjkAsks = asked(() => fitStyled(cjk, 201, SGR_RESET));
    expect(proto.containing, "the patch is restored").toBe(real);
    expect(gutterAsks, "one glyph, found once and measured once").toBe(2);
    expect(cjkAsks, "a hundred clusters, each found once and measured once").toBe(200);

    // **The timing is kept as evidence and no longer as the gate.** The control
    // it always had still holds — a row that must segment every cluster costs
    // more than one that segments a single glyph — and that comparison has no
    // denominator to compress.
    const gutterMs = perCall(() => fitStyled(gutter, 201, SGR_RESET));
    const cjkMs = perCall(() => fitStyled(cjk, 201, SGR_RESET));
    expect(
      cjkMs,
      `CJK took ${cjkMs.toFixed(4)} ms against ${gutterMs.toFixed(4)} for the gutter row ` +
        `(${(cjkMs / gutterMs).toFixed(1)}×, reported not gated — F1084)`,
    ).toBeGreaterThan(gutterMs);
  });
});
