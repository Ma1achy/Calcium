// C22 §4 and §8b — the too-small render (I9).
//
// **The failure is invisible in the passing case**, which is what makes the spy
// necessary rather than fussy. In any test where a block registry happens to be
// constructed — which is every test of a working session — a fallback that
// calls one renders perfectly. It breaks only in the terminals it exists for,
// and only for the user, who has no way to report a frame they cannot see.
import { describe, expect, it, vi } from "vitest";

import { drawFallback, fallbackLines, fitCells, tooSmall } from "../../src/shell/fallback.js";
import { MIN_COLUMNS, MIN_ROWS } from "../../src/shell/config.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { cells } from "../../src/presentation/text.js";

describe("C22 §4 — the size gate", () => {
  it("T3.7a (I8): the gate is either bound, not both", () => {
    // Two bounds and a conjunction is the plausible mistake, and it fails only
    // in a terminal that is wide and short — a split pane, which is common.
    expect(tooSmall({ columns: MIN_COLUMNS, rows: MIN_ROWS })).toBe(false);
    expect(tooSmall({ columns: MIN_COLUMNS - 1, rows: MIN_ROWS })).toBe(true);
    expect(tooSmall({ columns: MIN_COLUMNS, rows: MIN_ROWS - 1 })).toBe(true);
    expect(tooSmall({ columns: 200, rows: 4 }), "wide and short is too small").toBe(true);
  });

  it("T3.8 (I9): the fallback touches no block registry — asserted by a spy", () => {
    // **The mutation this exists for.** A fallback that renders through C09
    // passes every test in a suite that has a registry, and fails in exactly
    // the terminals the fallback was written for.
    const registry = createBlockRegistry({ defaults: true });
    const render = vi.spyOn(registry, "render");
    const measure = vi.spyOn(registry, "measureSequence");

    drawFallback({ columns: 44, rows: 12 }, () => undefined);

    expect(render, "no renderer").not.toHaveBeenCalled();
    expect(measure, "and no measurer — height is not laid out either").not.toHaveBeenCalled();
  });

  it("T3.8b (I9): it emits no colour and no box drawing", () => {
    // C10 resolves tones against a capability record, and this runs where the
    // record may say nothing is supported. A structural assertion, because a
    // colour would render fine on the author's terminal.
    const out = fallbackLines({ columns: 44, rows: 12 }).join("\n");

    // eslint-disable-next-line no-control-regex
    expect(out, "no SGR").not.toMatch(/\[/);
    expect(out, "no box drawing").not.toMatch(/[─-╿]/);
  });

  it("T3.8c: truncation counts cells, not code units", () => {
    // **The mutation pass rewrote this.** It first asserted the rendered lines,
    // and every one of them is ASCII by design — so `.length` and `cells()`
    // agree on all of them and swapping one for the other survived. The fixture
    // has to contain a character the two disagree about before it can assert
    // anything about which is used.
    //
    // `世` is two cells and one code unit. At width 4: two of them fit by
    // cells, four by `.length`.
    expect(fitCells("世世世", 4)).toBe("世世");
    expect(fitCells("世世世", 5), "no half-character").toBe("世世");
    expect(fitCells("abc", 10), "and it leaves short text alone").toBe("abc");
  });

  it("T3.8c2: no rendered line exceeds the width it was given", () => {
    // `.length` and `cells()` diverge on exactly the characters a narrow
    // terminal makes visible, and a line one cell over wraps — which scrolls
    // whatever screen this landed on.
    for (const columns of [10, 20, 44, 59]) {
      for (const line of fallbackLines({ columns, rows: 12 })) {
        expect(cells(line), `${String(columns)} columns: ${line}`).toBeLessThanOrEqual(columns);
      }
    }
  });

  it("T3.8d: it never emits more rows than the terminal has", () => {
    // Three lines in a two-row terminal scrolls, and scrolling is the thing
    // being avoided. The clamp is the whole point at the small end.
    expect(fallbackLines({ columns: 40, rows: 2 })).toHaveLength(2);
    expect(fallbackLines({ columns: 40, rows: 1 })).toHaveLength(1);
    expect(fallbackLines({ columns: 40, rows: 0 })).toHaveLength(0);
  });

  it("T3.15b (§8b): it writes through the sink it is given, not one it finds", () => {
    // Two sinks, and the renderer must know neither: at launch nothing has been
    // acquired so this goes to the primary screen, and mid-session it must go
    // through the scheduler or the next frame paints over it.
    const written: string[] = [];
    drawFallback({ columns: 44, rows: 12 }, (s) => written.push(s));

    expect(written).toHaveLength(1);
    expect(written[0], "CRLF, correct in raw mode and out of it").toContain("\r\n");
    expect(written[0]).toContain("44x12");
    expect(written[0], "and it says what is needed").toContain(`${String(MIN_COLUMNS)}x${String(MIN_ROWS)}`);
  });
});
