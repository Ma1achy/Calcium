// C17 tier 6 — fail-on-revert. Each names the change that makes it fail, not
// only the assertion (CLAUDE.md).
//
// **These are the mutation pass written down.** Every module was mutated on
// landing — the priority of the two insert boundaries swapped, the undo bound
// reversed, coalescing moved to a clock, the wrap changed to `ceil`, the
// whitespace skip removed — and what each mutation broke is what each of these
// pins. A mutation that failed nothing was a finding about the tests, and two
// of them were: the trace replay asserted text and cursor and not stack depth,
// and T3.16 asserted only that nothing threw.
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/interaction/editor/index.js";

const G = { first: 2, cont: 2 } as const;

describe("C17 tier 6 — fail on revert", () => {
  it("T6.1 (I2): indexing by code unit → emoji split", () => {
    // The change: `text.slice(0, cursor)` in place of the grapheme split.
    // Then `deleteBackward` on a family emoji leaves half of it, and the
    // buffer holds a lone surrogate.
    const e = createEditor({ text: "a👨‍👩‍👧" });
    e.deleteBackward();

    expect(e.text).toBe("a");
    expect(e.text.length, "no orphaned code unit").toBe(1); // graphemes-ok
  });

  it("T6.3 (I4): returning the grapheme index as a column → cursor misplaced after CJK", () => {
    // The change: `cursorCell` returning `{row: 0, col: cursor}`.
    const e = createEditor({ text: "日本" });

    expect(e.cursor).toBe(2);
    expect(e.cursorCell(80, { first: 0, cont: 0 }).col, "a column, not an index").toBe(4);
  });

  it("T6.4 (I5): splitting a paste into per-character units → many undos", () => {
    // The change: dropping `atomic`, or coalescing per character.
    const e = createEditor();
    e.insert("one two three", { atomic: true });

    expect(e.undo()).toBe(true);
    expect(e.text, "one undo empties it").toBe("");
  });

  it("T6.5 (I6): a timeout-based coalescer → grouping varies under load", () => {
    // The change: a clock in `undo.ts`. Caught structurally rather than by
    // timing — the module reads no clock, so identical call sequences give
    // identical groupings and SS1 has nothing to fire on.
    const runs = [0, 1, 2].map(() => {
      const e = createEditor();
      for (const ch of "git commit -m") e.insert(ch);
      let n = 0;
      while (e.undo()) n += 1;
      return n;
    });

    expect(runs).toEqual([3, 3, 3]);
  });

  it("T6.6 (I7): keeping redo after an edit → a future that cannot be reached", () => {
    const e = createEditor();
    e.insert("one ");
    e.insert("two");
    e.undo();
    e.insert("three");

    expect(e.redo()).toBe(false);
  });

  it("T6.7 (I8): appending kills across an intervening insert", () => {
    const e = createEditor({ text: "alpha beta", cursor: 10 });
    e.killTo("wordLeft");
    e.insert("x");
    e.killTo("wordLeft");

    expect(e.killBuffer, "the run ended at the insert").toBe("x");
  });

  it("T6.9 (I9): passing control characters through → escapes reach the frame", () => {
    const e = createEditor();
    e.insert("a[2Jb");

    expect(e.text).toBe("a[2Jb");
    expect(e.text.includes(""), "no escape in the buffer").toBe(false);
  });

  it("T6.10 (§3): collapsing word classes → editing a flag value destroys the flag", () => {
    // The change: two classes rather than three, so `--since` is one run.
    const e = createEditor({ text: "--since=1h", cursor: 0 });
    e.move("wordRight");

    expect(e.cursor, "the flag's dashes are their own stop").toBe(2);
  });

  it("T6.11 (I11): dropping the newest at the bound → the recent edit is unrecoverable", () => {
    const e = createEditor();
    for (let i = 0; i < 400; i += 1) e.insert(`${String(i % 7)} `);
    const before = e.text;

    expect(e.undo(), "the most recent edit is always undoable").toBe(true);
    expect(e.text).not.toBe(before);
  });

  it("T6.13 (I15): a class change as a boundary → six units for three words", () => {
    // The change this pins is the spec's own first reading, which is why it is
    // here: `git commit -m` was six units, and undo meant "a character class".
    const e = createEditor();
    for (const ch of "git commit -m") e.insert(ch);

    let units = 0;
    while (e.undo()) units += 1;
    expect(units).toBe(3);
  });

  it("T6.14 (I15): coalescing per character → a yanked phrase undoes a word at a time", () => {
    const e = createEditor();
    e.insert("alpha beta gamma");

    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });

  it("T6.15 (I16): one unit per kill → half the kill buffer comes back", () => {
    const e = createEditor({ text: "git push origin", cursor: 15 });
    e.killTo("wordLeft");
    e.killTo("wordLeft");
    e.undo();

    expect(e.text, "the whole run, matching the one kill-buffer entry").toBe("git push origin");
  });

  it("T6.16 (I17): removing the whitespace skip → kill-word deletes one space", () => {
    const e = createEditor({ text: "git push", cursor: 8 });
    e.killTo("wordLeft");
    e.killTo("wordLeft");

    expect(e.killBuffer, "the second kill takes a word, not the gap").toBe("git push");
  });

  it("T6.17 (I18): displayRows computing its own count → the prompt drifts from the frame", () => {
    const e = createEditor({ text: "a".repeat(300) });

    for (const width of [20, 40, 80]) {
      expect(e.displayRows(width, G), `width ${width}`).toBe(e.layout(width, G).length);
    }
  });

  it("T6.18 (I19): `ceil` in place of the position count → the cursor has no row", () => {
    const e = createEditor({ text: "abcdefgh\nx" });

    expect(e.displayRows(10, G), "three rows; ceil gives two").toBe(3);
    expect(e.cursorCell(10, G).row, "and the end position sits on a row that exists").toBe(2);
  });

  it("T6.19 (I20): dropping a cluster wider than the row → the editor deletes text", () => {
    // C09's wrap does exactly this, correctly, for a block. An editor may not.
    const e = createEditor({ text: "日本語" });

    expect(e.layout(1, { first: 0, cont: 0 }).join("")).toBe("日本語");
  });
});
