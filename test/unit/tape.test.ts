// C04 §3ao — the tape's window (§095).
//
// **The rows are the walk's, and they were written before the kind existed.**
// §095's figure fixes the marks and the minimum move; the walk's own
// measurement fixes the rest — the cost of a window is not monotone in its
// bounds, because a residue mark disappears when the run reaches an end, so
// *grow while it fits* draws fewer members than fit. That is asserted against
// an exhaustive scan rather than against a fixture, because a fixture agrees
// with a greedy implementation at every width where the two happen to meet.
import { describe, expect, it } from "vitest";

import { tapeWindow, type TapeMarks } from "../../src/presentation/blocks/tape-window.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";
import { doc } from "../support/blocks.js";
import type { Block, Tape } from "../../src/data/viewmodel/index.js";

const registry = createBlockRegistry({ defaults: true });
const MARKS: TapeMarks = { left: "«", right: "»", gap: 2 };
const measure = (t: string): number => t.length; // cells-ok — an ASCII fixture

/** The window the arithmetic answers, as `[from, to)` with its two counts. */
const win = (widths: readonly number[], room: number, current: number, from = 0) =>
  tapeWindow(widths, room, current, from, MARKS, measure);

/**
 * The same question asked exhaustively, and it is the row's instrument.
 *
 * A greedy implementation and this one agree at most widths, so a fixture
 * cannot separate them — what can is asking every candidate and taking the
 * extremum, which is the definition the invariant states.
 */
const exhaustive = (widths: readonly number[], room: number, current: number, from: number) => {
  const n = widths.length;
  const cost = (lo: number, hi: number): number => {
    if (hi <= lo) return 0;
    let body = 0;
    for (let i = lo; i < hi; i += 1) body += widths[i] ?? 0;
    body += MARKS.gap * (hi - lo - 1);
    const left = lo === 0 ? 0 : measure(`${MARKS.left}${String(lo)}`) + MARKS.gap;
    const right = hi === n ? 0 : measure(`${String(n - hi)}${MARKS.right}`) + MARKS.gap;
    return body + left + right;
  };
  const endFrom = (lo: number): number => {
    let best = lo + 1;
    for (let h = lo + 1; h <= n; h += 1) if (cost(lo, h) <= room) best = Math.max(best, h);
    return best;
  };
  let lo = from;
  let hi = endFrom(from);
  if (current < lo) {
    lo = current;
    hi = endFrom(lo);
  } else if (current >= hi) {
    let moved = current;
    for (let l = lo; l <= current; l += 1) {
      if (cost(l, current + 1) <= room) {
        moved = l;
        break;
      }
    }
    lo = moved;
    hi = Math.max(current + 1, endFrom(lo));
  }
  return { from: lo, to: hi };
};

const tape = (members: Tape["members"], current?: string): Tape =>
  ({ kind: "tape", id: "t", members, ...(current === undefined ? {} : { current }) }) as Tape;

const member = (id: string, detail?: string, state?: string) =>
  ({ id, label: id, ...(detail === undefined ? {} : { detail }), ...(state === undefined ? {} : { state }) }) as Tape["members"][number];

const frame = (block: Block, width: number, caps = FULL_CAPS): string =>
  (
    renderSequenceToLines(registry, [block], width, {
      theme: DARK_THEME,
      capabilities: caps,
      focus: null,
      scrollOffsets: {},
    })[0] ?? ""
  )
    .replace(/\[[0-9;]*m/gu, "")
    .trimEnd();

describe("C04 §3ao — the tape", () => {
  it("T1.48 (C04 I124, §3ao, §095): a tape round-trips, a current naming no member draws no mark, and every member keeps its id through every window", () => {
    const five = ["seams", "arm", "count", "probe", "trace"].map((id) => member(id, "1:00", "succeeded"));
    expect(validateDocument(doc({ blocks: [tape(five, "count")] }) as never).ok, "the kind validates").toBe(true);
    // **A current naming no member is valid** (C5). It is the state a producer
    // is in between rebuilding the row and choosing within it, and refusing it
    // would make a document invalid for a moment that is legitimate.
    expect(validateDocument(doc({ blocks: [tape(five, "gone")] }) as never).ok).toBe(true);
    expect(frame(tape(five, "gone"), 80), "and nothing is current in the frame").not.toContain("›");
    expect(frame(tape(five, "count"), 80), "where a real current carries the mark").toContain("›");

    // **A state this build does not know draws no mark, and does not throw.**
    // `state` is not checked by `validateDocument` — a tape arriving from the
    // far side can name anything — and indexing the glyph map with it gave
    // `undefined`, which `glyphFor` threw on. Falling back to a *glyph* instead
    // would be worse than throwing: the row would claim an outcome nobody sent.
    const odd = tape([member("solo", undefined, "elsewhere")], "solo");
    const drawn = frame(odd, 40);
    expect(drawn, "the label is still drawn").toContain("solo");
    for (const mark of ["✓", "✗", "○", "⊘"]) {
      expect(drawn, `no state mark is invented for an unknown state (${mark})`).not.toContain(mark);
    }

    // **Nothing is lost, only offscreen, is a claim about ids** (C04 I124). Every
    // member declares an element at every width, including the ones the window
    // does not reach — an element that vanished with the window would orphan
    // the focus §095's whole argument is about.
    for (const width of [80, 40, 24, 12, 6]) {
      const ids = registry.elementsOf(tape(five, "trace"), width).map((e) => e.id);
      expect(ids, `every member declares an element at ${String(width)}`).toEqual([
        "seams",
        "arm",
        "count",
        "probe",
        "trace",
      ]);
    }
  });

  it("T1.49 (C04 I125, §3ao, §095): §095's moves drawn back, and the window is the maximum run that fits from the minimum start that reaches the current, against an exhaustive scan", () => {
    // **The star rule, reproduced**: moving off the head raises a `«1`, and the
    // mark spends cells the window was spending on members, so a move of one
    // costs two. Five members of 7 at a width of 30 hold three from the head
    // and two once a mark is paid for.
    const ws = [7, 7, 7, 7, 7];
    expect(win(ws, 30, 0), "from the head, no left mark to pay for").toEqual(
      expect.objectContaining({ from: 0, to: 3 }),
    );
    const moved = win(ws, 30, 3, 0);
    expect(moved.from, "the minimum start that reaches member 3, mark priced in").toBe(2);
    expect(moved.before, "which is what `«2` counts").toBe(2);
    // **And the right mark is gone, which was not the guess.** The first draft
    // of this row expected `1»`: the window slid two and should have shown
    // three of five. It shows all three remaining, because reaching the last
    // member **removes** the `n»` — four cells back for a member costing
    // five — so the run that fits is longer than the one that fits without it.
    // That is D1 arriving in the row written against it, and it is read off the
    // arithmetic rather than assumed (S2, S3).
    expect(moved.to, "the run reaches the end").toBe(5);
    expect(moved.after, "so there is no right mark to draw").toBe(0);

    // **D1, and it is the row's reason for existing.** `[5,7,3,8,1]` at a width
    // of 20 from index 2: a greedy *grow while it fits* draws one member,
    // because adding the fourth overflows — and adding the fifth removes the
    // `1»` and fits. Asserted as the number, so a greedy implementation fails
    // here and every self-consistent one passes.
    //
    // **And the bound it is about is the END, not the start** — which this row
    // got wrong first. The start is the minimum *move*, scanned up from where
    // the window already is, because a smaller start exists in most tapes and
    // taking it would drag the window backwards to reach something ahead of it.
    // The two read as one rule and are not.
    expect(win([5, 7, 3, 8, 1], 20, 4, 2), "the last member arrives and its mark leaves").toEqual(
      expect.objectContaining({ from: 2, to: 5 }),
    );
    // Held at 2, the window would hold two members with a `1»`; reaching the
    // fifth removes the mark, and three fit where a greedy loop drew one.
    expect(win([1, 3, 9, 5], 21, 2, 0), "and from the head, three of four").toEqual(
      expect.objectContaining({ from: 0, to: 3 }),
    );

    // **The property, over a sweep.** A fixture agrees with a greedy
    // implementation wherever the two happen to meet; the definition does not.
    let checked = 0; // cells-ok — a case count
    for (const widths of [
      [7, 7, 7, 7, 7],
      [5, 7, 3, 8, 1],
      [1, 3, 9, 5],
      [2, 2, 2, 2, 2, 2, 2],
      [9, 1, 9, 1, 9],
    ]) {
      for (let room = 3; room <= 44; room += 1) {
        for (let current = 0; current < widths.length; current += 1) {
          // **`from` is its own axis, and leaving it out made this vacuous.**
          // The first draft passed `from = current`, so the current was already
          // inside the window in every case and the move was never taken — a
          // sweep of 700 cases exercising one branch of three.
          for (let from = 0; from < widths.length; from += 1) {
            const got = win(widths, room, current, from);
            const want = exhaustive(widths, room, current, from);
            const at = `${JSON.stringify(widths)} @${String(room)} cur=${String(current)} from=${String(from)}`;
            expect({ from: got.from, to: got.to }, at).toEqual(want);
            expect(got.from, `the current is inside the window at ${at}`).toBeLessThanOrEqual(current);
            expect(got.to, `at both bounds at ${at}`).toBeGreaterThan(current);
            checked += 1;
          }
        }
      }
    }
    expect(checked, "the sweep ran, and over all three branches").toBeGreaterThan(3000);

    // **The window moves ONLY when the current leaves it** (S5) — the clause
    // that separates a tape from a cursor dragging the row along.
    const inside = win(ws, 30, 1, 0);
    expect(inside.from, "a current already inside moves nothing").toBe(0);
  });

  it("T1.50 (C04 I126, §3ao, §095): every detail or none, the details stay gone once the window has slid, and a member wider than the width truncates rather than vanishing", () => {
    const five = ["seams", "arm", "count", "probe", "trace"].map((id) => member(id, "2:53", "succeeded"));
    const block = tape(five, "count");

    // **Wide: every clock shown.** The count is the assertion, not a search —
    // one detail visible is satisfied by a row that drew a single clock.
    const wide = frame(block, 120);
    expect(wide.split("2:53").length - 1, "every member's clock, or none").toBe(5);

    // **Narrower: none of them.** An all-or-nothing group goes before one
    // member does, so the middle state — three clocks and two blanks, saying
    // the blanks are still running — is the one that must not exist.
    const mid = frame(block, 44);
    expect(mid, "not one clock survives").not.toContain("2:53");
    expect(mid, "and every member is still on the row").toContain("trace");

    // **C3: the details stay gone once the window has slid.** At this width the
    // two or three visible members would fit with their clocks — and bringing
    // them back trades a member for a clock, which is what rule 1 forbids.
    const slid = frame(tape(five, "trace"), 24);
    expect(slid, "the window has slid").toContain("«");
    expect(slid, "and the clocks did not come back").not.toContain("2:53");

    // **C4: a member wider than the whole width truncates.** A tape with
    // nothing in it says less than a tape with one truncated name.
    const long = tape([member("a-very-long-agent-name-indeed")], "a-very-long-agent-name-indeed");
    const tight = frame(long, 10);
    expect(tight.length, "clamped to the width").toBeLessThanOrEqual(10); // cells-ok — an ASCII fixture
    expect(tight.trim().length, "and something is still drawn").toBeGreaterThan(0);

    // **A member offscreen is always counted, at every width.** This is what
    // *nothing is lost, only offscreen* means from the frame's side: if the row
    // shows fewer than all five and carries no mark, it is claiming a complete
    // tape while four members are hidden — which is worse than a narrow row,
    // it is a false one.
    //
    // **Measured rather than guessed, and it took two wrong assertions.** The
    // first derived the visible members from the row and asserted the row
    // contained them, which is a tautology. The second watched for a clamp
    // mark — and at eighteen columns there is none: the window keeps one
    // member too many, and the `4»` is pushed off the end rather than clipped.
    // Only comparing what is shown against what exists reaches it.
    for (let width = 12; width <= 72; width += 1) {
      const row = frame(tape(five, "seams"), width);
      expect(row.length, `clamped at ${String(width)}`).toBeLessThanOrEqual(width); // cells-ok — an ASCII fixture
      const seen = five.filter((m) => row.includes(m.label)).length; // cells-ok — a member count
      const cut = row.includes("\u2026");
      if (seen < five.length) {
        // Either the mark is drawn, or the row was cut — and the cut arm is
        // only available where the window holds the current alone (C4), which
        // is the clause that stops the disjunction being an escape hatch. A
        // window keeping two members and clipping the mark takes neither.
        expect(
          /«\d+|\d+»/u.test(row) || cut,
          `${String(five.length - seen)} hidden at ${String(width)} and nothing says so: ${row}`,
        ).toBe(true);
      }
      if (cut) {
        expect(seen, `cut at ${String(width)}, so the window held the current alone: ${row}`)
          .toBeLessThanOrEqual(1);
      }
    }

    // **C6: zero hidden is no mark, never `«0`.** One member, at every width.
    const one = tape([member("solo")], "solo");
    for (const width of [80, 12, 6]) {
      const row = frame(one, width);
      expect(row, `no left mark at ${String(width)}`).not.toContain("«");
      expect(row, `and no right mark at ${String(width)}`).not.toContain("»");
    }

    // The ASCII rung takes the registry's own pair, `[` and `]`, rather than a
    // two-cell chevron that would break the 1:1 pairing T2.5 asserts.
    const ascii = frame(tape(five, "trace"), 24, ASCII_CAPS);
    expect(ascii, "the ascii rung's left mark").toContain("[");
    expect(ascii, "and it is not the unicode one").not.toContain("«");
  });
});
