// C14 I57 and I58 — tier 6.
//
// Each row names the change that makes it fail and shows the defect it would
// ship, as numbers and cells; the mutation pass checks the named row mechanically.
import { describe, expect, it } from "vitest";

import { RAIL_COLUMNS, regionWidth, transcriptWidth } from "../../src/shell/config.js";
import { railCell, washRow } from "../../src/shell/paint.js";
import { MONO_UNICODE_CAPS, themeFor } from "../support/render.js";
import { styledScreenFrom } from "../support/styled-screen.js";

describe("C14 §6d — the rail, tier 6", () => {
  it("T6.28 (C14 I57): the transcript laid out at the content width → T4.39 fails", () => {
    // **The revert, as a number**: a body of exactly the transcript's width
    // less the indent fits one row at 78 and would still fit at 79 — so the
    // row one cell wider is the one that tells them apart, and T4.39 carries it.
    for (const columns of [60, 80, 120]) {
      expect(transcriptWidth(columns), `at ${String(columns)}`).toBe(regionWidth(columns) - RAIL_COLUMNS);
    }
    expect(RAIL_COLUMNS, "one column, the rail's").toBe(1);
    expect(transcriptWidth(1), "floored, as the region is").toBe(1);
  });

  it("T6.29 (C14 I58): the rail drawn inside the wash → T3.25 fails at both 1-bit rungs", () => {
    // **The defect, drawn**: the wash re-opens `inverse` after every sequence
    // (C14 I52), so a rail laid under it is an inverted `▌` at 1-bit — a
    // right-half block. Beside the wash it is upright.
    const theme = themeFor("dark");
    const inside = styledScreenFrom([washRow(`${railCell(theme, MONO_UNICODE_CAPS)} body`, theme, MONO_UNICODE_CAPS, 20)], { columns: 20, rows: 1 })[0]!;
    const beside = styledScreenFrom([railCell(theme, MONO_UNICODE_CAPS) + washRow(" body", theme, MONO_UNICODE_CAPS, 19)], { columns: 20, rows: 1 })[0]!;
    expect(inside[0]!.style.attrs, "inside the wash, the rail inverts").toContain(7);
    expect(beside[0]!.style.attrs, "beside it, it does not").not.toContain(7);
  });
});
