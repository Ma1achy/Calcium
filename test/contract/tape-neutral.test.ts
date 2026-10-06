// C09 I127 — the tape helpers the shell calls read the neutral block (F1408).
//
// **The shell calls `tapeStart` and `tapeMemberCols` with the document's own
// block**, not the one the registry resolved, so they take it through
// `neutralBlock` themselves. They stripped where the frame neutralises, which
// left a member whose label holds `ESC` one cell narrower in the pointer's
// columns than on screen.
import { describe, expect, it } from "vitest";

import { createBlockRegistry, tapeMemberCols, tapeStart } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { sliceCells } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Tape } from "../../src/data/viewmodel/index.js";

const registry = createBlockRegistry();
const SGR = /\u001b\[[0-9;]*m/gu;
const NAMES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

const tapeOf = (first: string): Tape =>
  ({
    kind: "tape",
    id: "t",
    members: NAMES.map((id, i) => ({ id, label: i === 0 ? first : id, state: "succeeded" })),
    current: "charlie",
  }) as unknown as Tape;

const drawn = (tape: Tape, width: number, held: number, focused: string | null): string =>
  (
    renderSequenceToLines(registry, [tape], width, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: focused === null ? null : { blockId: tape.id, rowId: focused, selected: [] },
      scrollOffsets: { [tape.id]: held },
    } as never)[0] ?? ""
  ).replace(SGR, "");

describe("C09 I127 — tapeMemberCols and tapeStart over a control in a label", () => {
  it("C09 T2.232 (I127, F1408, C26 I31): the columns and the start are the ones the frame draws, with ESC in the first label", () => {
    const POISON = "al\u001b[2Jpha";
    for (const [name, first] of [["clean", "alpha"], ["poisoned", POISON]] as const) {
      const tape = tapeOf(first);
      let checked = 0;
      // Every width from narrow to wide: a start moves only where the one cell
      // of disagreement tips a member over the window's edge.
      for (const width of Array.from({ length: 31 }, (_, k) => 20 + k)) {
        for (const focused of [null, ...NAMES]) {
          const start = tapeStart(tape, width, FULL_CAPS, 0, focused);
          const cols = tapeMemberCols(tape, width, FULL_CAPS, start, focused);
          const line = drawn(tape, width, start, focused);
          const at = `${name} w=${String(width)} focused=${String(focused)}: ${line}`;
          cols.forEach((c, i) => {
            if (c.to <= c.from || i === 0) return;
            // **A member after the poisoned one** is found at its stated
            // `from`: one cell of disagreement and it starts a cell early.
            // Exactly, because a window a cell early still contains the name.
            expect(sliceCells(line, c.from, c.to), `${at}: ${NAMES[i] ?? ""} at its cells`).toMatch(new RegExp(`^(› )?${NAMES[i] ?? ""}( ✓?)?…?$`, "u"));
            checked += 1;
          });
          // **The oracle**: a tape whose label is the escaped form written out
          // is the tape the frame draws, so the poisoned one answers as it does.
          const literal = tapeOf(first.replace(/\u001b/gu, "^["));
          expect(tapeStart(tape, width, FULL_CAPS, 0, focused), `${at}: the start of the escaped form`).toBe(
            tapeStart(literal, width, FULL_CAPS, 0, focused),
          );
          // And the persisted start is the one the render drew: a fixed point.
          expect(tapeStart(tape, width, FULL_CAPS, start, focused), `${at}: a fixed point`).toBe(start);
        }
      }
      // **Non-vacuity**: the walk placed members, and the poisoned frame
      // draws the label's escaped form, so the poison was in the row.
      expect(checked, `${name}: members were checked`).toBeGreaterThan(10);
      if (name === "poisoned") expect(drawn(tape, 44, 0, "alpha"), "the escape is drawn as ^[").toContain("^[");
    }
  });
});
