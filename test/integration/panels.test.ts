// C22 §6s — the transient panels, drawn (§097, §101; F1501, F1502, F1503).
//
// **One row over three owners, because the defect was that there were three.**
// The completion menu, find and the chip preview are one shape — *a transient
// panel floats, between two rules* — and each owner had built its own half of
// it: the menu drew its edge, the search drew none, the preview drew a titled
// box, and none took a ground. A row per owner would have passed each against
// its own picture. So each panel is opened in the same session, over the same
// transcript, and read against the same frame.
//
// **Read in cells, not in bytes.** The ground is a background on every cell of
// the rows between the rules, which is a claim about what the terminal paints;
// a byte search for the sequence is satisfied by one cell of it.
import { describe, expect, it } from "vitest";

import { groundSequence } from "../../src/presentation/blocks/paint.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { opening, settle } from "../support/frame-golden.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { styledScreenFrom, type StyledCell } from "../support/styled-screen.js";

const SIZE = { columns: 80, rows: 24 };
/** The layer region is one column narrower than the frame: the margin is the transcript's bar (C14 I62). */
const REGION_WIDTH = 79;
const ESC = String.fromCharCode(27);

/** A ground as the same parser reads it, so the expectation and the frame share one reading. */
const bgOf = (ref: "surface.bgElev" | "surface.pick"): string =>
  styledScreenFrom([`${groundSequence(ref, DARK_THEME, FULL_CAPS)}x`], { columns: 1, rows: 1 })[0]![0]!.style.bg;
const ELEV = bgOf("surface.bgElev");
const PICK = bgOf("surface.pick");

type Frame = Readonly<{ text: readonly string[]; cells: readonly (readonly StyledCell[])[] }>;

async function session() {
  const stdin = fakeStdin();
  const s = await buildSession(
    { stdin: stdin as never, theme: opening("dark"), capabilities: FULL_CAPS },
    { ...SIZE },
  );
  await settle();
  const send = async (bytes: string): Promise<void> => {
    for (const ch of bytes) {
      stdin.emit(ch);
      await settle();
    }
  };
  await send("/help");
  stdin.emit("\r");
  await settle();
  const frame = (): Frame => ({ text: s.screen().rows, cells: styledScreenFrom(s.stdout.chunks, SIZE) });
  return { stdin, send, frame };
}

/** The prompt's upper rule, and the panel's own edge above it. */
function edges(f: Frame): Readonly<{ edge: number; lower: number }> {
  const lower = f.text.findIndex((r, i) => /^─+(?: .+ ─)?$/u.test(r) && r.length === SIZE.columns && (f.text[i + 1] ?? "").startsWith("❯"));
  let edge = lower - 1;
  while (edge >= 0 && f.text[edge]?.slice(0, REGION_WIDTH) !== "─".repeat(REGION_WIDTH)) edge -= 1;
  return { edge, lower };
}

const grounds = (row: readonly StyledCell[] | undefined): readonly string[] =>
  (row ?? []).slice(0, REGION_WIDTH).map((c) => c.style.bg);

describe("C22 §6s — three panels between two rules, on bgElev (I151)", () => {
  it("T4.121 (C22 I151, I29, I113, C19 I23, C20 I30): the menu, find and the preview each sit between two rules on bgElev, and nothing above them moves", async () => {
    // **The fixture must be able to show a ground at all** — a theme whose
    // `bgElev` inherits paints nothing, and every assertion below would then
    // pass on the old tree (`test/support/README.md`).
    expect(ELEV, "the theme resolves a panel ground").not.toBe("");
    expect(PICK, "and a pick ground distinct from it").not.toBe(ELEV);

    const panels: readonly Readonly<{ name: string; open: (s: Awaited<ReturnType<typeof session>>) => Promise<void>; current: boolean }>[] = [
      { name: "the completion menu", open: (s) => s.send("/c"), current: true },
      {
        name: "find",
        open: async (s) => {
          s.stdin.emit(String.fromCharCode(18));
          await settle();
          await s.send("h");
        },
        current: false,
      },
      {
        name: "the chip preview",
        open: async (s) => {
          s.stdin.emit(`${ESC}[200~one\ntwo\nthree\nfour\nfive\nsix${ESC}[201~`);
          await settle();
        },
        current: false,
      },
    ];

    for (const panel of panels) {
      const s = await session();
      const before = s.frame();
      await panel.open(s);
      const after = s.frame();
      const { edge, lower } = edges(after);

      expect(lower, `${panel.name}: the prompt's rule is found`).toBeGreaterThan(0);
      expect(edge, `${panel.name}: its own rule above it`).toBeGreaterThan(0);
      expect(lower - edge, `${panel.name}: rows between the rules`).toBeGreaterThan(1);

      // **Neither rule takes a ground** (§6s.2 row 1).
      expect(new Set(grounds(after.cells[edge])), `${panel.name}: its edge is on the page`).not.toContain(ELEV);
      // **The label's cells are the one exception** (C22 I111, amended): the app's name
      // is a thing and takes a ground (§069), and it is inline-end on this rule. Every
      // other cell of the rule is on the page.
      const label = /( \S+ )─$/u.exec(after.text[lower] ?? "");
      expect(label, `${panel.name}: the rule carries the app's name`).not.toBeNull();
      const labelAt = (after.text[lower] ?? "").length - 1 - (label?.[1] ?? "").length;
      grounds(after.cells[lower]).forEach((g, col) => {
        const inLabel = col >= labelAt && col < labelAt + (label?.[1] ?? "").length;
        if (!inLabel) expect(g, `${panel.name}: the prompt's rule, column ${String(col)}`).not.toBe(ELEV);
      });

      // **Every cell between them does, to the region's last column** — the
      // padding is the panel's (C22 I29) — except the menu's current row, which is
      // `pick` across (§6s.2 row 2).
      for (let row = edge + 1; row < lower; row += 1) {
        const want = panel.current && row === edge + 1 ? PICK : ELEV;
        expect(grounds(after.cells[row]), `${panel.name}: row ${String(row + 1)}`).toEqual(Array(REGION_WIDTH).fill(want));
      }

      // **NOTHING ABOVE MOVES** (§097, C22 I29): the rows over the panel's edge are
      // the frame before it opened, cell by cell and style by style.
      expect(after.cells.slice(0, edge), `${panel.name}: the transcript above it`).toEqual(before.cells.slice(0, edge));
      expect(after.text.slice(0, edge)).toEqual(before.text.slice(0, edge));
    }
  });
});
