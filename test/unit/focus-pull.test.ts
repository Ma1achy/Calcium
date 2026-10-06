// C26 §7a — focus pulls the viewport, by the minimum (§021, §095).
//
// **One sentence and two axes.** §021 states it of a scroll box's rows and
// §095's rule 2 states it of a tape's members in the same words, so the rows
// here are about a distance rather than about a container: what differs between
// the two callers is the unit, and the unit belongs to the container.
//
// **T1.49 is the row that makes *one mechanism* a measurement.** The two
// windows are two implementations — the box's size is a number it is told and
// the tape's is solved from its own contents — so the sentence being one is a
// claim about the prose until something compares them where they can be
// compared.
import { describe, expect, it } from "vitest";

import { pullIntoView } from "../../src/shell/pull.js";
import { tapeStart } from "../../src/presentation/blocks/index.js";
import { tapeWindow, type TapeMarks } from "../../src/presentation/blocks/tape-window.js";
import { block as makeBlock } from "../../src/data/viewmodel/index.js";
import type { Tape } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });

describe("C26 §7a — the pull", () => {
  it("T1.48 (C26 I24, §7a, §021): the pull is the minimum distance, and a tall target shows its head", () => {
    // Already inside — nothing moves, which is the arm the other three are
    // measured against.
    expect(pullIntoView(4, 5, 7, 4), "inside, so the window is where it was").toBe(4);
    expect(pullIntoView(4, 4, 8, 4), "exactly filling it moves nothing").toBe(4);

    // Before the window: the window starts where the target begins.
    expect(pullIntoView(10, 3, 5, 4), "up to the target's start").toBe(3);
    expect(pullIntoView(10, 9, 11, 4), "one row up is one row moved").toBe(9);

    // After it: the window ends where the target ends.
    expect(pullIntoView(0, 6, 8, 4), "down to the target's end").toBe(4);
    expect(pullIntoView(0, 4, 5, 4), "one row down is one row moved").toBe(1);

    // **The ruling.** A target taller than the window shows its head, which is
    // the end rule applied and then the start rule. Both orderings are
    // self-consistent and the other one shows the tail.
    expect(pullIntoView(0, 2, 12, 4), "a tall target shows its head").toBe(2);
    expect(pullIntoView(20, 2, 12, 4), "from the other side too").toBe(2);

    // A window of nothing is not moved: no position reveals a target in zero
    // rows, so a move would be a number chosen rather than a distance measured.
    expect(pullIntoView(7, 0, 3, 0), "a collapsed box is left where it is").toBe(7);
    // Never negative, whatever it is handed.
    expect(pullIntoView(-5, -3, -1, 4), "floored at the top").toBe(0);

    // **The minimum is a minimum**, checked by exhausting the alternatives: no
    // reachable start that also contains the target is closer to the held one.
    for (let held = 0; held <= 12; held += 1) {
      for (let from = 0; from <= 10; from += 1) {
        for (const span of [1, 2, 3]) {
          const to = from + span;
          const room = 4;
          const got = pullIntoView(held, from, to, room);
          if (to - from > room) continue; // the head rule, asserted above
          expect(got, `contains [${String(from)},${String(to)}) from ${String(held)}`).toBeLessThanOrEqual(from);
          expect(got + room, `contains the end too`).toBeGreaterThanOrEqual(to);
          for (let cand = 0; cand <= 20; cand += 1) {
            if (cand > from || cand + room < to) continue;
            expect(
              Math.abs(got - held),
              `${String(cand)} is closer to ${String(held)} than ${String(got)}`,
            ).toBeLessThanOrEqual(Math.abs(cand - held));
          }
        }
      }
    }
  });

  it("T1.49 (C26 I24, §7a, C04 I125): the two windows are one rule where they can be compared", () => {
    // **Uniform members and costless marks**, which is exactly the case where
    // the tape's window stops being a function of its contents and becomes a
    // number — and is therefore the only place the two can be asked the same
    // question. Anywhere else the tape's answer is right and different, because
    // the mark is priced into the move (C04 I125).
    const MARKS: TapeMarks = { left: "", right: "", gap: 0 };
    const free = (): number => 0;
    for (const n of [1, 3, 7, 12]) {
      const widths = Array.from({ length: n }, () => 1); // cells-ok — a member count
      for (let room = 1; room <= n + 2; room += 1) {
        for (let from = 0; from < n; from += 1) {
          for (let at = 0; at < n; at += 1) {
            const tape = tapeWindow(widths, room, at, from, MARKS, free);
            // **The box's ceiling is applied outside `pullIntoView`** — by
            // `offsetOf` at read and by `ScrollOffsets.resolved` before the
            // move — where the tape's is inside `tapeWindow`, because the
            // tape's window size is not a number anyone can hand the store.
            // Applying it here is what makes the two comparable rather than
            // what makes them agree: it is the same clamp, `content − interior`
            // against `n − room`, in the two units.
            const clamped = Math.min(from, Math.max(0, n - room));
            const box = pullIntoView(clamped, at, at + 1, Math.min(room, n));
            expect(
              tape.from,
              `n=${String(n)} room=${String(room)} from=${String(from)} at=${String(at)}`,
            ).toBe(box);
          }
        }
      }
    }
  });

  it("T1.50 (C26 I25, §7a, C04 I124): the held start is a fixed point, is not the head's, and is not the tick's", () => {
    const members = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"].map((id) => ({
      id,
      label: id,
      state: "running" as const,
    }));
    const tape = (current: string): Tape =>
      makeBlock({ kind: "tape", id: "strip", members, current }) as Tape;
    const width = 28;

    // **A fixed point.** The shell writes back what it is told and the renderer
    // reads it on the next frame, so an answer that moved when fed to itself
    // would slide the window one member per frame with no key pressed.
    for (let held = 0; held < members.length; held += 1) {
      for (const m of members) {
        const once = tapeStart(tape(m.id), width, FULL_CAPS, held);
        expect(tapeStart(tape(m.id), width, FULL_CAPS, once), `${m.id} from ${String(held)}`).toBe(once);
      }
    }

    // **It differs from the from-the-head answer**, which is the whole of C26 I25:
    // walking to the far end and back leaves the window where the walk put it,
    // and a start recomputed from zero snaps back.
    let walked = 0;
    for (const m of members) walked = tapeStart(tape(m.id), width, FULL_CAPS, walked);
    const back = tapeStart(tape("charlie"), width, FULL_CAPS, walked);
    const head = tapeStart(tape("charlie"), width, FULL_CAPS, 0);
    expect(walked, "the walk to the end moved the window").toBeGreaterThan(0);
    expect(back, "and coming back to the middle keeps it there").toBeGreaterThan(head);

    // **And it does not depend on the tick**, which is what lets the shell ask
    // for it outside a frame. A spinner set with a wide frame in it would make
    // the persisted start disagree with the drawn one on the frames nobody
    // looks at, and nothing else in the tree would notice.
    // **Swept over the widths too**, because a wide frame does not move the
    // window at every width — at most of them the row has slack and the start
    // is the same number for the wrong reason. The sweep is what gives the
    // guard somewhere to fail.
    for (let w = 12; w <= 40; w += 1) {
      for (const m of members) {
        const want = tapeStart(tape(m.id), w, FULL_CAPS, 2);
        for (let tick = 0; tick < 83; tick += 1) {
          expect(
            startAtTick(tape(m.id), w, tick, 2),
            `${m.id} at ${String(w)}, tick ${String(tick)}`,
          ).toBe(want);
        }
      }
    }
  });
});

/**
 * The start the renderer would use at a given tick — the same `layout`, reached
 * the only way a test can reach it, by drawing the row and reading its mark.
 *
 * `«n` names the count hidden to the left, which **is** the window's start.
 */
function startAtTick(block: Tape, width: number, tick: number, held: number): number {
  const row =
    renderSequenceToLines(registry, [block], width, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
      scrollOffsets: { [block.id]: held },
      tick,
    })[0] ?? "";
  const mark = /«(\d+)/u.exec(row.replace(/\u001b\[[0-9;]*m/gu, ""));
  return mark === null ? 0 : Number(mark[1]);
}
