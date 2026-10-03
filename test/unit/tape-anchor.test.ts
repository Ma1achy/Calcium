// C26 I31 — one anchor for the tape's window: the focused member while focus is
// in the tape, `current` otherwise (review batch 4, M14.1, M14.2; ruling 80).
//
// **Three readers, one answer.** `render` draws the window, `tapeStart` is what
// the shell persists and `tapeMemberCols` is where the pointer looks; each
// takes `layout`, and the row is that the three agree at every anchor. A build
// that anchored one of them on `current` alone draws a window the other two do
// not describe.
import { describe, expect, it } from "vitest";

import { createBlockRegistry, tapeMemberCols, tapeStart } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { sliceCells } from "../../src/presentation/text.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Tape } from "../../src/data/viewmodel/index.js";

const NAMES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
const TAPE = {
  kind: "tape",
  id: "t",
  members: NAMES.map((id) => ({ id, label: id, state: "succeeded" })),
  current: "delta",
} as unknown as Tape;

const registry = createBlockRegistry();
const SGR = /\u001b\[[0-9;]*m/gu;

const drawn = (width: number, caps: typeof FULL_CAPS, held: number, focused: string | null): string =>
  (
    renderSequenceToLines(registry, [TAPE], width, {
      theme: DARK_THEME,
      capabilities: caps,
      focus: focused === null ? null : { blockId: TAPE.id, rowId: focused, selected: [] },
      scrollOffsets: { [TAPE.id]: held },
    } as never)[0] ?? ""
  ).replace(SGR, "");

describe("C26 I31 — the tape's anchor", () => {
  it("C26 T1.166 (I31, C04 I124, C04 I125): tapeStart, tapeMemberCols and the render agree at every anchor", () => {
    let followed = 0;
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      for (const width of [20, 28]) {
        for (const focused of [null, ...NAMES]) {
          // The held start the shell would have persisted, from the head.
          const start = tapeStart(TAPE, width, caps, 0, focused);
          const cols = tapeMemberCols(TAPE, width, caps, start, focused);
          const line = drawn(width, caps, start, focused);
          const at = `${caps.unicode} w=${String(width)} focused=${String(focused)} ${line}`;
          // **The anchor is on screen**: the focused member, or the current.
          const anchor = NAMES.indexOf(focused ?? "delta");
          const range = cols[anchor];
          expect(range !== undefined && range.to > range.from, `${at}: the anchor is drawn`).toBe(true);
          // **And the three agree**: every member the helper places is in the
          // frame at those cells, and every member it does not is absent.
          cols.forEach((c, i) => {
            const name = NAMES[i] ?? "";
            if (c.to > c.from) expect(sliceCells(line, c.from, c.to), `${at}: ${name} at its cells`).toContain(name.slice(0, 2));
            else expect(line.includes(name), `${at}: ${name} is off the window`).toBe(false);
          });
          // The persisted start is a fixed point of the render: re-asking
          // `tapeStart` from it answers it, so the next frame does not slide.
          expect(tapeStart(TAPE, width, caps, start, focused), `${at}: a fixed point`).toBe(start);
          const current = cols[NAMES.indexOf("delta")];
          if (focused !== null && current !== undefined && current.from === current.to) followed += 1;
        }
      }
    }
    // **Non-vacuity**: some anchor put the current off the window — the case
    // ruling 80 exists for, where the focused member wins.
    expect(followed, "the focused anchor took the window off the current").toBeGreaterThan(0);
  });
});
