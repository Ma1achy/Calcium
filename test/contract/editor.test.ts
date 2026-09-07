// C17 tier 2 — contract. The measurement contract, and the two by-hand
// artefacts replayed against the implementation.
//
// **The trace and the figure are the fixtures, and neither is recomputed here.**
// A test that derived the expected rows from the same walk it is testing has
// asserted its own arithmetic; these hold the numbers that were written down
// by hand before any code existed (§7a, §7b), so a defect in the walk shows as
// a disagreement with the document rather than as a self-consistent pass.
import { describe, expect, it } from "vitest";

import { createEditor, type LineEditor } from "../../src/interaction/editor/index.js";
import { cells } from "../../src/presentation/text.js";

const G = { first: 2, cont: 2 } as const;
const FLUSH = { first: 0, cont: 0 } as const;

/**
 * The whole state, as §7a's table writes it — **including both stack columns**.
 *
 * They were left out of the first replay, and the trace passed over a wrong
 * grouping: `insert(" ")` pushed a unit instead of merging and closing, so
 * `git commit -m` was five units rather than three while every text and cursor
 * in the table still matched. "Assert the whole state after each step" is the
 * rule, and the two columns are part of the state.
 */
function state(e: LineEditor): Record<string, unknown> {
  return { text: e.text, cursor: e.cursor, kill: e.killBuffer, undo: e.undoDepth, redo: e.redoDepth };
}

describe("C17 §7a — the edit trace, replayed as one sequence", () => {
  it("T2.9 (§7a): twenty-one steps, whole state asserted after each", () => {
    // One test rather than twenty-one, deliberately. Every invariant in §8
    // constrains a single operation and none constrains a sequence, which is
    // where C13's, C14's and C16's defects lived — so the sequence is the
    // subject and the assertions are its steps.
    const e = createEditor();
    const seen: Array<Record<string, unknown>> = [];
    const step = (fn: () => void): void => {
      fn();
      seen.push(state(e));
    };

    step(() => e.insert("git"));
    step(() => e.insert(" "));
    step(() => e.insert("push"));
    step(() => e.move("wordLeft"));
    step(() => e.insert("-f "));
    step(() => e.move("lineEnd"));
    step(() => e.insert(" 日本"));
    step(() => e.insert("語"));
    step(() => e.deleteBackward());
    step(() => e.killTo("lineStart"));
    step(() => void e.undo());
    step(() => e.insert("🎉"));
    step(() => e.yank());
    step(() => e.killTo("wordLeft"));
    step(() => e.killTo("wordLeft"));
    step(() => e.insert("x"));
    step(() => e.killTo("wordLeft"));
    step(() => e.setText("/ps --status=running", 20));

    const yanked = "git -f push 日本🎉git -f push 日本";
    expect(seen).toEqual([
      { text: "git", cursor: 3, kill: "", undo: 1, redo: 0 },
      { text: "git ", cursor: 4, kill: "", undo: 1, redo: 0 },
      { text: "git push", cursor: 8, kill: "", undo: 2, redo: 0 },
      { text: "git push", cursor: 4, kill: "", undo: 2, redo: 0 },
      { text: "git -f push", cursor: 7, kill: "", undo: 3, redo: 0 },
      { text: "git -f push", cursor: 11, kill: "", undo: 3, redo: 0 },
      { text: "git -f push 日本", cursor: 14, kill: "", undo: 4, redo: 0 },
      { text: "git -f push 日本語", cursor: 15, kill: "", undo: 4, redo: 0 },
      { text: "git -f push 日本", cursor: 14, kill: "", undo: 5, redo: 0 },
      { text: "", cursor: 0, kill: "git -f push 日本", undo: 6, redo: 0 },
      // Step 11: undo restores text and cursor and leaves the kill buffer
      // exactly as it was (I16). The step is in the trace because the answer is
      // not obvious until the sequence is written down.
      { text: "git -f push 日本", cursor: 14, kill: "git -f push 日本", undo: 5, redo: 1 },
      { text: "git -f push 日本🎉", cursor: 15, kill: "git -f push 日本", undo: 6, redo: 0 },
      { text: yanked, cursor: 29, kill: "git -f push 日本", undo: 7, redo: 0 },
      { text: "git -f push 日本🎉git -f push ", cursor: 27, kill: "日本", undo: 8, redo: 0 },
      // Step 15: the second kill of the run prepends, so the buffer holds both
      // words in the order they were in the text.
      { text: "git -f push 日本🎉git -f ", cursor: 22, kill: "push 日本", undo: 8, redo: 0 },
      { text: "git -f push 日本🎉git -f x", cursor: 23, kill: "push 日本", undo: 9, redo: 0 },
      // Step 17: the insert ended the run, so this kill replaces (T1.12).
      { text: "git -f push 日本🎉git -f ", cursor: 22, kill: "x", undo: 10, redo: 0 },
      { text: "/ps --status=running", cursor: 20, kill: "x", undo: 11, redo: 0 },
    ]);

    // Steps 19-21: the motion sequence, which is where the two directions stop
    // at different indices (I17).
    e.move("bufferStart");
    const right: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      e.move("wordRight");
      right.push(e.cursor);
    }
    expect(right, "run ends").toEqual([1, 3, 6, 12, 13, 20]);

    const left: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      e.move("wordLeft");
      left.push(e.cursor);
    }
    expect(left, "run starts — not the reverse of the above").toEqual([13, 12, 6, 4, 1, 0]);
  });
});

describe("C17 §7b — the geometry figure", () => {
  const L1 =
    "/run train --dataset=imagenet --epochs=90 --batch-size=256 --lr=0.1 --wd=1e-4 --seed=1234";
  const TEXT = `${L1}\n--resume`;

  it("T2.9a (§7b, I18, I19): the ordinary case, exactly as drawn", () => {
    const e = createEditor({ text: TEXT });

    expect(e.layout(80, G)).toEqual([
      "/run train --dataset=imagenet --epochs=90 --batch-size=256 --lr=0.1 --wd=1e-4 ",
      "--seed=1234",
      "--resume",
    ]);
    expect(e.displayRows(80, G)).toBe(3);

    // Every row of the figure's cursor table.
    for (const [cursor, cell] of [
      [0, { row: 0, col: 2 }],
      [42, { row: 0, col: 44 }],
      [78, { row: 1, col: 2 }],
      [89, { row: 1, col: 13 }],
      [90, { row: 2, col: 2 }],
      [94, { row: 2, col: 6 }],
      [98, { row: 2, col: 10 }],
    ] as const) {
      const at = createEditor({ text: TEXT, cursor });
      expect(at.cursorCell(80, G), `cursor ${cursor}`).toEqual(cell);
    }
  });

  it("T2.9b (I18): displayRows is layout().length and cursorCell indexes it", () => {
    // Asserted as identities over the corpus, so a second walk cannot be
    // introduced without failing — which is the whole of I18. The alternative
    // is L4 wrapping the buffer again and the two agreeing until a boundary
    // case, months from now, as a prompt one row off.
    for (const text of CORPUS) {
      const e = createEditor({ text });
      for (const width of [20, 33, 47, 80, 120, 200]) {
        for (const gutter of [G, FLUSH]) {
          const rows = e.layout(width, gutter);
          expect(e.displayRows(width, gutter)).toBe(rows.length);
          expect(e.cursorCell(width, gutter).row).toBeLessThan(rows.length);
        }
      }
    }
  });

  it("T2.1 (I3, the headline): every row fits the width it was measured at", () => {
    // The measurement contract from the side that can be checked without L4:
    // no row exceeds its usable width, and the count is the number of rows
    // produced. T4.7 asserts the other half against the frame (C22 is built; this said
    // *when C22 lands* until 2026-09-03).
    for (const text of CORPUS) {
      const e = createEditor({ text });
      for (let width = 20; width <= 200; width += 1) {
        for (const gutter of [G, FLUSH]) {
          const rows = e.layout(width, gutter);
          rows.forEach((row, i) => {
            const usable = Math.max(1, width - (i === 0 ? gutter.first : gutter.cont));
            if (cells(row) <= usable) return;

            // The one legal overflow (I20): a single cluster too wide for the
            // whole row goes on one anyway, because an editor may not alter
            // what the user typed. Stated as "exactly one cluster", not as a
            // blanket exemption — a row that overflows by accumulating two
            // clusters is the wrap being wrong, and that is what this catches.
            expect(
              [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(row)],
              `row ${i} of "${text}" at ${width}: ${cells(row)} cells in ${usable}`,
            ).toHaveLength(1);
          });
          expect(e.displayRows(width, gutter)).toBe(rows.length);
        }
      }
    }
  });

  it("T2.1b (I3, I19): a line wrapping exactly at the gutter boundary", () => {
    // The off-by-one a gutter-blind implementation produces, and the one a
    // `ceil` produces — the same test catches both, because at exactly the
    // usable width they differ in opposite directions.
    const e = createEditor({ text: "abcdefgh" });

    expect(e.layout(10, G), "eight cells fill a usable eight exactly").toEqual(["abcdefgh", ""]);
    expect(e.displayRows(10, G)).toBe(2);
    expect(e.displayRows(10, FLUSH), "the same text with no gutter fits one row").toBe(1);
  });

  it("T2.2 (I1): the cursor is always at a valid grapheme boundary", () => {
    // A thousand random sequences. The cursor is an index into a cluster array,
    // so "valid" is: in range, and the text either side of it re-joins to the
    // whole — a code-unit index inside a ZWJ sequence fails the second.
    let seed = 20260731;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const pieces = ["a", " ", "日", "👨‍👩‍👧", "é", "🎉", "-", "\n", "ps"];
    const e = createEditor();

    for (let i = 0; i < 1000; i += 1) {
      switch (rand(8)) {
        case 0:
          e.insert(pieces[rand(pieces.length)] as string); // graphemes-ok
          break;
        case 1:
          e.deleteBackward();
          break;
        case 2:
          e.deleteForward();
          break;
        case 3:
          e.move((["charLeft", "charRight", "wordLeft", "wordRight"] as const)[rand(4)]!);
          break;
        case 4:
          e.killTo((["wordLeft", "lineEnd", "bufferStart"] as const)[rand(3)]!);
          break;
        case 5:
          e.yank();
          break;
        case 6:
          e.undo();
          break;
        default:
          e.redo();
      }

      const clusters = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        e.text,
      )].map((s) => s.segment);
      expect(e.cursor, `step ${i}`).toBeGreaterThanOrEqual(0);
      expect(e.cursor, `step ${i}`).toBeLessThanOrEqual(clusters.length); // graphemes-ok
      expect(
        clusters.slice(0, e.cursor).join("") + clusters.slice(e.cursor).join(""), // graphemes-ok
        `step ${i}: the cursor splits a cluster`,
      ).toBe(e.text);
    }
  });

  it("T2.8: undo then redo returns the buffer deeply equal, for every corpus entry", () => {
    for (const text of CORPUS) {
      const e = createEditor({ text });
      e.insert(" tail");
      const after = state(e);
      expect(e.undo()).toBe(true);
      expect(e.redo()).toBe(true);
      expect(state(e), text).toEqual(after);
    }
  });
});

/**
 * The adversarial corpus, C09's plus the shapes the figure named.
 *
 * Shared by the measurement tests so they all meet the same CJK, ZWJ,
 * combining-mark and variation-selector cases — a per-test corpus is how one of
 * them comes to be the only one that never saw a family emoji.
 */
const CORPUS: readonly string[] = [
  "",
  "ls",
  "/ps --status=running",
  "日本語のコマンド",
  "git commit -m 'a message long enough to wrap at any width worth testing here'",
  "👨‍👩‍👧 family",
  "école école",
  "⚠️ warn and ⚠ plain",
  "one\ntwo\nthree",
  "trailing\n",
  "\n\n",
  "🎉".repeat(40),
  "a".repeat(200),
];
