// C14 I57 and I58 — the selection rail in column 0 (ruling 68).
//
// **A classification table, not a trace**: which rows lead with the rail, and
// what the rail's cell carries at each rung, are both facts at rest. The trace
// half — the rail following the selection through a resize and two `esc`s — is
// T4.39's, in a session.
import { describe, expect, it } from "vitest";

import { railCell, RAIL_BLANK, railRowsOf, selectedElementRowsOf, washedRowsOf, washRow } from "../../src/shell/paint.js";
import { FULL_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, themeFor } from "../support/render.js";
import { styledScreenFrom } from "../support/styled-screen.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const placed = (blockId: string, id: string, from: number) =>
  ({ blockId, element: { id, rows: { from } } }) as const;

describe("C14 §6d — the rail", () => {
  it("T1.77 (C14 I57, I58, I39): the rail's rows are the washed rows and the selected elements' first rows, as a set, and every other row's column 0 is blank", () => {
    // **The washed rows**: one per selected block, at its first row, less the
    // window's start — a block of three rows gives one, a block above the
    // window gives none.
    const spans = [
      { key: "e1\u0000a", from: 0, to: 3 },
      { key: "e1\u0000b", from: 3, to: 6 },
      { key: "e1\u0000c", from: 6, to: 7 },
      { key: "e2\u0000a", from: 0, to: 2 },
    ];
    const washed = washedRowsOf(spans, new Set(["e1\u0000a", "e1\u0000b", "e2\u0000a"]), "e1", 2, 5);
    expect([...washed], "b's first row in the window; a's is above it; e2 is another entry").toEqual([1]);

    // **The selected elements' first rows**, in the entry's block space less
    // the window's start: a table row inside a card body is where its placed
    // element says, and nothing else is.
    const elements = [
      placed("t", "r1", 4),
      placed("t", "r2", 5),
      placed("t", "r3", 7),
      placed("u", "r1", 9),
    ];
    const selected = [{ blockId: "t", rowId: "r2" }, { blockId: "t", rowId: "r3" }, { blockId: "u", rowId: "gone" }];
    expect([...selectedElementRowsOf(elements, selected, 2, 5)].sort(), "r2 and r3; r1 is not selected; `gone` is placed nowhere")
      .toEqual([3]);
    expect([...selectedElementRowsOf(elements, selected, 2, 6)].sort((x, y) => x - y), "a longer window reaches r3")
      .toEqual([3, 5]);
    expect(selectedElementRowsOf(elements, [], 0, 10).size, "nothing selected is no rows").toBe(0);

    // **The union, as a set**: a block selection and an element selection in
    // one window both lead with the rail, a row in both is one row, and
    // either alone is itself.
    const sorted = (s: ReadonlySet<number>) => [...s].sort((x, y) => x - y);
    expect(sorted(railRowsOf(new Set([1]), new Set([3, 5]))), "both kinds").toEqual([1, 3, 5]);
    expect(sorted(railRowsOf(new Set([3]), new Set([3, 5]))), "a row in both is one row").toEqual([3, 5]);
    expect(sorted(railRowsOf(new Set([1]), new Set())), "blocks alone").toEqual([1]);
    expect(sorted(railRowsOf(new Set(), new Set([4]))), "elements alone").toEqual([4]);
    expect(railRowsOf(new Set(), new Set()).size, "the control: nothing selected, no rail row").toBe(0);

    // **The control**: blank is one cell and it is a space, so every other
    // row's column 0 costs the one column the frame reserved and draws nothing.
    expect(RAIL_BLANK).toBe(" ");
  });

  it("T3.25 (C14 I58, C14 I53, C10 I45, C10 I66): the rail at every rung and on a banded theme — accent ink, the band's ink on the band, never inverse", () => {
    const rungs: Readonly<Record<string, TerminalCapabilities>> = {
      "24-bit": FULL_CAPS,
      "8-bit": { ...FULL_CAPS, colourDepth: 8 },
      "4-bit": { ...FULL_CAPS, colourDepth: 4 },
      "1-bit": MONO_UNICODE_CAPS,
      "1-bit ascii": MONO_CAPS,
    };
    for (const variant of ["dark", "hcDark"] as const) {
      const theme = themeFor(variant as never);
      // The fixture responds: `hcDark` bands its selection and `dark` does not,
      // so the band clause below is asserted over a theme that has one.
      expect(theme.tokens.bandInk?.["selection"] !== undefined, `${variant} bands its selection`).toBe(variant === "hcDark");
      for (const [rung, caps] of Object.entries(rungs)) {
        const where = `${variant} at ${rung}`;
        const row = railCell(theme, caps) + washRow("  body text", theme, caps, 20);
        const cells = styledScreenFrom([row], { columns: 21, rows: 1 })[0]!;
        const rail = cells[0]!;
        const washed = cells[3]!;
        expect(rail.ch, `${where}: the glyph`).toBe(caps.unicode === "ascii" ? "|" : "▌");
        // **Never inverse**: an inverted `▌` is a right-half block.
        expect(rail.style.attrs, `${where}: the rail is never inverse`).not.toContain(7);
        if (caps.colourDepth === 1) {
          // The row inverts from column 1 and the rail stays upright beside it.
          expect(washed.style.attrs, `${where}: the row is inverse`).toContain(7);
          expect(rail.style.bg, `${where}: no ground at 1-bit`).toBe("");
          continue;
        }
        // The selection ground where it is a background — the washed row's own.
        if (washed.style.bg !== "") expect(rail.style.bg, `${where}: the selection ground`).toBe(washed.style.bg);
        else expect(washed.style.attrs, `${where}: no ground means the wash is inverse`).toContain(7);
        expect(rail.style.fg, `${where}: the rail has an ink`).not.toBe("");
        if (variant === "hcDark" && washed.style.bg !== "") {
          // **A band's ink is total** (C10 I45, C14 I53): the rail takes it too.
          expect(rail.style.fg, `${where}: the band's ink`).toBe(washed.style.fg);
        }
      }
    }
  });
});
