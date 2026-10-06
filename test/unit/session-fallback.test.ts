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
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

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

    drawFallback({ columns: 44, rows: 12 }, FULL_CAPS, () => undefined);

    expect(render, "no renderer").not.toHaveBeenCalled();
    expect(measure, "and no measurer — height is not laid out either").not.toHaveBeenCalled();
  });

  it("T3.8b (C22 I153, I9): it emits no colour, and at ASCII nothing outside ASCII", () => {
    // C10 resolves tones against a theme, which the fallback does not hold. A
    // structural assertion, because a colour would render fine on the author's
    // terminal. And the ASCII rung is the one a terminal that cannot draw
    // anything else is on: `▲`, `×` and the box must not reach it.
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const out = fallbackLines({ columns: 44, rows: 12 }, caps).join("\n");
      expect(out, "no escape byte").not.toContain(String.fromCharCode(27));
    }
    const ascii = fallbackLines({ columns: 44, rows: 12 }, ASCII_CAPS).join("\n");
    expect(ascii, "ASCII only").toMatch(/^[\u0020-\u007e\n]+$/u);
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

  it("T3.8c2: widths, across the range a fallback actually meets", () => {
    // `.length` and `cells()` diverge on exactly the characters a narrow
    // terminal makes visible, and a line one cell over wraps — which scrolls
    // whatever screen this landed on.
    for (const columns of [10, 20, 44, 59]) {
      for (const line of fallbackLines({ columns, rows: 12 }, FULL_CAPS)) {
        expect(cells(line), `${String(columns)} columns: ${line}`).toBeLessThanOrEqual(columns);
      }
    }
  });

  it("T3.8d: it never emits more rows than the terminal has", () => {
    // Three lines in a two-row terminal scrolls, and scrolling is the thing
    // being avoided. The clamp is the whole point at the small end.
    expect(fallbackLines({ columns: 40, rows: 3 }, FULL_CAPS)).toHaveLength(2);
    expect(fallbackLines({ columns: 40, rows: 2 }, FULL_CAPS)).toHaveLength(2);
    expect(fallbackLines({ columns: 40, rows: 1 }, FULL_CAPS)).toHaveLength(1);
    expect(fallbackLines({ columns: 40, rows: 0 }, FULL_CAPS)).toHaveLength(0);
  });

  it("T3.15b (§8b): it writes through the sink it is given, not one it finds", () => {
    // Two sinks, and the renderer must know neither: at launch nothing has been
    // acquired so this goes to the primary screen, and mid-session it must go
    // through the scheduler or the next frame paints over it.
    const written: string[] = [];
    drawFallback({ columns: 44, rows: 12 }, FULL_CAPS, (s) => written.push(s));

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("44×12");
    expect(written[0], "and it says what is needed").toContain(`${String(MIN_COLUMNS)}×${String(MIN_ROWS)}`);
  });

  it("T3.15c: the exact bytes, at the sizes where the terminators separate", () => {
    // **Three survivors made this exact.** The assertion was
    // `toContain("\r\n")` against a three-line render, where the join, the
    // trailing terminator and a stray extra all satisfy it — so dropping the
    // terminator, joining with a bare `\n`, and emitting a spare newline each
    // failed nothing. The fourth or fifth instance of one class: a subject too
    // uniform to tell the code from the defect.
    //
    // One row is what separates them. There is no join at one row, so the only
    // `\r\n` in the output is the terminator, and every one of the three
    // mutations changes the string.
    const at = (columns: number, rows: number): string[] => {
      const out: string[] = [];
      drawFallback({ columns, rows }, FULL_CAPS, (s) => out.push(s));
      return out;
    };

    expect(at(40, 1)).toEqual(["▲ 40×1\r\n"]);
    expect(at(40, 2)).toEqual(["▲ 40×2\r\nneeds 60×16\r\n"]);

    // And zero rows writes nothing rather than a lone newline: a terminal with
    // no rows is the one that cannot afford to scroll.
    expect(at(40, 0), "not called at all, not called with an empty string").toEqual([]);
  });

});
