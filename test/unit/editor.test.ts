// C17 tier 1 — unit. Grapheme arithmetic, motion, kill and undo.
//
// The component where Unicode correctness is least optional: a cursor that
// moves by code unit splits an emoji the first time someone pastes one, and
// the failure is visible and immediate. Every assertion here is against a
// grapheme index, which is a position a cursor can occupy — never a code unit
// and never a display column, and the three are different numbers for the same
// text (§2, I1, I4).
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/interaction/editor/index.js";
import { UNDO_LIMIT } from "../../src/interaction/editor/undo.js";

const G = { first: 2, cont: 2 } as const;
const FAMILY = "👨‍👩‍👧";

describe("C17 §2 — cursor and buffer", () => {
  it("T1.1 (I1): inserting places the cursor after the inserted graphemes", () => {
    const e = createEditor();
    e.insert("日本");

    expect(e.cursor, "two graphemes, not four code units").toBe(2);
    expect(e.text).toBe("日本");
  });

  it("T1.2 (I2): charRight across a ZWJ sequence moves one position", () => {
    const e = createEditor({ text: `${FAMILY}x`, cursor: 0 });
    e.move("charRight");

    expect(e.cursor, `"${FAMILY}".length is 8; it is one position`).toBe(1);
  });

  it("T1.3 (I2): charRight across a combining mark moves past base plus mark", () => {
    // `e` + U+0301, which is two code points and one cluster. Written
    // decomposed on purpose: the precomposed form would pass by accident.
    const e = createEditor({ text: "éf", cursor: 0 });
    e.move("charRight");

    expect(e.cursor).toBe(1);
    expect(e.text.slice(0, 2), "the cluster is two code units").toBe("é");
  });

  it("T1.4 (I2): deleteBackward on an emoji removes the whole cluster", () => {
    const e = createEditor({ text: `a${FAMILY}` });
    e.deleteBackward();

    expect(e.text, "no half-family left behind").toBe("a");
    expect(e.cursor).toBe(1);
  });

  it("T1.1b (I2): inserting *into* a buffer of wide clusters splits at a cluster", () => {
    // The mutation pass found this gap: replacing the grapheme split with
    // `text.slice(0, cursor)` killed only the fuzz test, because every other
    // insert here happened at position 0 or at the end, where a code-unit
    // index and a grapheme index coincide. The middle is where they part.
    const e = createEditor({ text: "日本語", cursor: 2 });
    e.insert("X");

    expect(e.text, "between the second and third glyph").toBe("日本X語");
    expect(e.cursor).toBe(3);

    const emoji = createEditor({ text: `${FAMILY}${FAMILY}`, cursor: 1 });
    emoji.insert("|");
    expect(emoji.text, "between two family emoji, not inside one").toBe(`${FAMILY}|${FAMILY}`);
  });

  it("T1.5 (I4): cursorCell after two CJK characters is column 4 at index 2", () => {
    // The separation this component exists for. Conflating them puts the
    // terminal cursor two columns left of where the user sees it.
    const e = createEditor({ text: "日本" });

    expect(e.cursor, "a grapheme index").toBe(2);
    expect(e.cursorCell(80, { first: 0, cont: 0 }), "a column").toEqual({ row: 0, col: 4 });
    expect(e.cursorCell(80, G).col, "and the gutter is part of the column").toBe(6);
  });

  it("T1.18 (I9): control characters are stripped on insert; `\\n` survives", () => {
    const e = createEditor();
    e.insert("a[31mb\nc\td");

    expect(e.text, "escape stripped, newline kept, tab stripped").toBe("a[31mb\ncd");
  });
});

describe("C17 §3 — motion", () => {
  const LINES = "one\ntwo\nthree";

  it("T1.6: every motion from a canonical buffer", () => {
    const at = (cursor: number) => createEditor({ text: "ab cd", cursor });

    const charLeft = at(3);
    charLeft.move("charLeft");
    expect(charLeft.cursor).toBe(2);

    const charRight = at(3);
    charRight.move("charRight");
    expect(charRight.cursor).toBe(4);

    const wordLeft = at(5);
    wordLeft.move("wordLeft");
    expect(wordLeft.cursor).toBe(3);

    const wordRight = at(0);
    wordRight.move("wordRight");
    expect(wordRight.cursor).toBe(2);

    const lineStart = at(3);
    lineStart.move("lineStart");
    expect(lineStart.cursor).toBe(0);

    const lineEnd = at(0);
    lineEnd.move("lineEnd");
    expect(lineEnd.cursor).toBe(5);

    const bufferStart = at(3);
    bufferStart.move("bufferStart");
    expect(bufferStart.cursor).toBe(0);

    const bufferEnd = at(0);
    bufferEnd.move("bufferEnd");
    expect(bufferEnd.cursor).toBe(5);
  });

  it("T1.9: lineStart and lineEnd act on the current line, not the buffer", () => {
    // The reason they are distinct from bufferStart and bufferEnd at all.
    const e = createEditor({ text: LINES, cursor: 6 }); // inside "two"

    e.move("lineStart");
    expect(e.cursor, "start of line two").toBe(4);
    e.move("lineEnd");
    expect(e.cursor, "end of line two, before the newline").toBe(7);
  });

  it("T1.7 (I17): wordRight through `/ps --status=running` — six stops", () => {
    const e = createEditor({ text: "/ps --status=running", cursor: 0 });
    const stops: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      e.move("wordRight");
      stops.push(e.cursor);
    }

    expect(stops).toEqual([1, 3, 6, 12, 13, 20]);
  });

  it("T1.8 (I17): wordLeft stops at run starts, which is not T1.7 reversed", () => {
    const e = createEditor({ text: "/ps --status=running", cursor: 20 });
    const stops: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      e.move("wordLeft");
      stops.push(e.cursor);
    }

    expect(stops).toEqual([13, 12, 6, 4, 1, 0]);
    expect(stops.includes(3), "3 is a run end and belongs to the other direction").toBe(false);
  });

  it("I13: `--since=1h` is four stops, not one", () => {
    const e = createEditor({ text: "--since=1h", cursor: 0 });
    const stops: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      e.move("wordRight");
      stops.push(e.cursor);
    }

    expect(stops, "a flag value is editable without disturbing the flag").toEqual([2, 7, 8, 10]);
  });
});

describe("C17 §5 — kill and yank", () => {
  it("T1.10: killTo(lineEnd) then yank elsewhere round-trips the text", () => {
    const e = createEditor({ text: "alpha beta", cursor: 6 });
    e.killTo("lineEnd");
    expect(e.text).toBe("alpha ");

    e.move("bufferStart");
    e.yank();
    expect(e.text).toBe("betaalpha ");
  });

  it("T1.11 (I8): two consecutive killTo(wordLeft) → both words, original order", () => {
    const e = createEditor({ text: "git push origin", cursor: 15 });
    e.killTo("wordLeft");
    e.killTo("wordLeft");

    expect(e.killBuffer, "backwards kills prepend").toBe("push origin");
    expect(e.text).toBe("git ");
  });

  it("T1.12 (I8): kill, insert, kill → the second replaces rather than appends", () => {
    const e = createEditor({ text: "git push origin", cursor: 15 });
    e.killTo("wordLeft");
    e.insert("x");
    e.killTo("wordLeft");

    expect(e.killBuffer, "the insert ended the run").toBe("x");
  });

  it("T1.21 (I16): two kills then one undo returns both words", () => {
    // The run is one undo unit because it is one kill-buffer entry. Half the
    // text coming back is the buffer and the stack describing different
    // amounts of it, which is the shape that cost C14 a blank screen.
    const e = createEditor({ text: "git push origin", cursor: 15 });
    e.killTo("wordLeft");
    e.killTo("wordLeft");
    expect(e.undo()).toBe(true);

    expect(e.text).toBe("git push origin");
    expect(e.cursor).toBe(15);
  });

  it("T1.22 (I16): undo leaves the kill buffer alone", () => {
    const e = createEditor({ text: "alpha beta", cursor: 10 });
    e.killTo("wordLeft");
    expect(e.undo()).toBe(true);
    e.move("bufferEnd");
    e.yank();

    expect(e.killBuffer, "a clipboard does not rewind").toBe("beta");
    expect(e.text).toBe("alpha betabeta");
  });

  it("T3.9: yank with an empty kill buffer is a no-op", () => {
    const e = createEditor({ text: "ls" });
    e.yank();

    expect(e.text).toBe("ls");
    expect(e.undo(), "and records nothing").toBe(false);
  });

  it("T3.17: killTo(bufferStart) from the middle then yank at the end", () => {
    const e = createEditor({ text: "alpha beta", cursor: 6 });
    e.killTo("bufferStart");
    e.move("bufferEnd");
    e.yank();

    expect(e.text, "order preserved").toBe("betaalpha ");
  });
});

describe("C17 §6, §7 — undo", () => {
  it("T1.14: typing `abc` is one unit; undo clears all three", () => {
    const e = createEditor();
    for (const ch of "abc") e.insert(ch);

    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });

  it("T1.19 (I15): `git commit -m` typed one grapheme at a time is three units", () => {
    // Six is what a class-change boundary produces, and it is what the spec's
    // literal first reading required. Undo would then mean "a character class".
    const e = createEditor();
    for (const ch of "git commit -m") e.insert(ch);

    const after: string[] = [];
    while (e.undo()) after.push(e.text);

    expect(after).toEqual(["git commit ", "git ", ""]);
  });

  it("T1.20 (I15): one insert call carrying spaces is one unit", () => {
    // The per-character reading splits this into three, and `yank` is the
    // caller that suffers: a yanked phrase would undo a word at a time.
    const e = createEditor();
    e.insert("a b c");

    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });

  it("T1.13 (I5): a 10,000-character paste is one undo unit", () => {
    const e = createEditor();
    e.insert("x ".repeat(5000), { atomic: true });

    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });

  it("T3.14 (I5): a paste containing `\\n` is structure, and still one unit", () => {
    const e = createEditor();
    e.insert("one\ntwo\nthree", { atomic: true });

    expect(e.lines).toEqual(["one", "two", "three"]);
    expect(e.undo()).toBe(true);
    expect(e.text).toBe("");
  });

  it("T1.15, T1.16: undo twice then redo twice returns the original", () => {
    const e = createEditor();
    e.insert("one ");
    e.insert("two ");
    e.insert("three");
    const original = e.text;

    expect(e.undo()).toBe(true);
    expect(e.undo()).toBe(true);
    expect(e.redo()).toBe(true);
    expect(e.redo()).toBe(true);
    expect(e.text).toBe(original);
  });

  it("T1.17 (I7): an edit after undo clears redo", () => {
    const e = createEditor();
    e.insert("one ");
    e.insert("two");
    expect(e.undo()).toBe(true);
    e.insert("three");

    expect(e.redo()).toBe(false);
  });

  it("T3.10, T3.11: undo on a clean editor and redo with nothing to redo", () => {
    const e = createEditor();

    expect(e.undo()).toBe(false);
    expect(e.redo()).toBe(false);
  });

  it("T3.12 (I11): 1,000 edits → 200 units, oldest discarded, newest undoable", () => {
    const e = createEditor();
    for (let i = 0; i < 1000; i += 1) e.insert(`${String(i % 10)} `);

    let undone = 0;
    while (e.undo()) undone += 1;

    expect(undone, "the bound holds").toBe(UNDO_LIMIT);
    // Oldest-first: the buffer does not return to empty, because the earliest
    // 800 units were discarded. Discarding the newest instead would leave the
    // most recent edit unrecoverable, which is the one people actually undo.
    expect(e.text, "the oldest edits are gone, not the newest").not.toBe("");
  });

  it("T3.13: setText is one unit and undo restores the prior buffer and cursor", () => {
    const e = createEditor({ text: "typed draft", cursor: 5 });
    e.setText("/ps --status=running", 4);

    expect(e.undo()).toBe(true);
    expect(e.text).toBe("typed draft");
    expect(e.cursor, "cursor included").toBe(5);
  });

  it("I6: coalescing reads no clock — the same calls give the same units", () => {
    // Structural rather than timed, asserted by construction: two editors driven
    // by identical call sequences agree on how many units they hold, whatever
    // wall-clock time passed between the calls.
    const units = (drive: (e: ReturnType<typeof createEditor>) => void): number => {
      const e = createEditor();
      drive(e);
      let n = 0;
      while (e.undo()) n += 1;
      return n;
    };
    const drive = (e: ReturnType<typeof createEditor>): void => {
      for (const ch of "git commit") e.insert(ch);
    };

    expect(units(drive)).toBe(units(drive));
    expect(units(drive)).toBe(2);
  });
});

describe("C17 §2 — geometry at the edges", () => {
  it("T3.6 (I19, I20): width 1 — one row per grapheme, plus the trailing row", () => {
    const e = createEditor({ text: "日本語" });

    // Four, not three: the count is positions, and the last cluster fills its
    // row exactly. The same off-by-one as T3.8b in different clothing.
    expect(e.layout(1, { first: 0, cont: 0 })).toEqual(["日", "本", "語", ""]);
    expect(e.displayRows(1, { first: 0, cont: 0 })).toBe(4);
  });

  it("T3.7 (I20): a double-width glyph straddling the boundary wraps whole", () => {
    const e = createEditor({ text: "ab日本語" });

    expect(e.layout(9, G), "one cell wasted at the end of row 0").toEqual(["ab日本", "語"]);
  });

  it("T3.8 (I19): a buffer ending in `\\n` counts the trailing empty line", () => {
    const e = createEditor({ text: "ls\n" });

    expect(e.layout(80, G)).toEqual(["ls", ""]);
    expect(e.displayRows(80, G)).toBe(2);
  });

  it("T3.8b (I19): a line that exactly fills its row emits the trailing row", () => {
    const e = createEditor({ text: "abcdefgh\nx" });

    expect(e.layout(10, G), "three rows — `ceil` gives two").toEqual(["abcdefgh", "", "x"]);
  });

  it("T3.3: motions on an empty buffer are no-ops", () => {
    const e = createEditor();
    for (const m of ["charLeft", "charRight", "wordLeft", "wordRight", "lineStart", "lineEnd", "bufferStart", "bufferEnd"] as const) {
      e.move(m);
      expect(e.cursor, m).toBe(0);
    }
  });

  it("T3.1, T3.2, T3.4: deletes and word motions at the ends are no-ops", () => {
    const start = createEditor({ text: "ls", cursor: 0 });
    start.deleteBackward();
    start.move("wordLeft");
    expect(start.text).toBe("ls");
    expect(start.cursor).toBe(0);

    const end = createEditor({ text: "ls", cursor: 2 });
    end.deleteForward();
    end.move("wordRight");
    expect(end.text).toBe("ls");
    expect(end.cursor).toBe(2);
  });

  it("T3.5: a buffer of only whitespace is traversed without looping", () => {
    const e = createEditor({ text: "    ", cursor: 0 });
    e.move("wordRight");
    expect(e.cursor, "the skip always advances when there is whitespace").toBe(4);
    e.move("wordLeft");
    expect(e.cursor).toBe(0);
  });
});

describe("C17 §5b — selection", () => {
  it("T1.23 (I21): two extensions leave the anchor where it was", () => {
    // **Two, because one passes whichever end moved.** From index 0, one `⇧→`
    // gives `[0, 1)` under both the correct implementation and one that moves
    // the anchor — `{anchor: 0, head: 1}` and `{anchor: 1, head: 0}` describe
    // the same characters. The second motion is where they part.
    const e = createEditor({ text: "abcdef", cursor: 0 });

    e.extend("charRight");
    e.extend("charRight");

    expect(e.selection).toEqual({ anchor: 0, head: 2 });
    expect(e.selected).toBe("ab");
    expect(e.cursor, "the head is the cursor, not a second position").toBe(2);
  });

  it("T1.24 (I21): the head walks back and the anchor still has not moved", () => {
    // The same defect through a reversal rather than a repeat: an anchor that
    // follows the motion ends up ahead of the head here, and `selected` reads
    // the same either way because it sorts the pair.
    const e = createEditor({ text: "abcdef", cursor: 0 });

    e.extend("charRight");
    e.extend("charRight");
    e.extend("charLeft");

    expect(e.selection).toEqual({ anchor: 0, head: 1 });
    expect(e.selected).toBe("a");
  });

  it("T1.25 (I21): anchor === head is no region, not an empty one", () => {
    // **Reached by moving**, not by never having selected — the two spellings
    // of "no region" are exactly what this forbids, and a stored empty region
    // can only be constructed this way.
    const e = createEditor({ text: "abcdef", cursor: 0 });

    e.extend("charRight");
    expect(e.selection).not.toBeNull();

    e.extend("charLeft");
    expect(e.selection, "back where it started is no selection").toBeNull();
    expect(e.selected).toBe("");
  });

  it("T1.26 (I21): an unshifted motion collapses", () => {
    const e = createEditor({ text: "abcdef", cursor: 0 });

    e.selectAll();
    expect(e.selection).toEqual({ anchor: 0, head: 6 });

    e.move("charLeft");

    expect(e.selection).toBeNull();
    expect(e.cursor, "and the motion still moved the cursor").toBe(5);
  });

  it("T1.27 (I21): selectAll crosses newlines — it is not lineStart to lineEnd", () => {
    const e = createEditor({ text: "one\ntwo\nthree", cursor: 5 });

    e.selectAll();

    expect(e.selection).toEqual({ anchor: 0, head: 13 });
    expect(e.selected).toBe("one\ntwo\nthree");
  });

  it("T1.28 (I22): typing over a region replaces it in one undo unit", () => {
    const e = createEditor({ text: "abcdef", cursor: 0 });
    const before = e.undoDepth;

    e.extend("charRight");
    e.extend("charRight");
    e.extend("charRight");
    e.insert("X");

    expect(e.text).toBe("Xdef");
    expect(e.undoDepth - before, "one unit, not two").toBe(1);

    // **One `undo`, and the whole original comes back.** Two units restore
    // `"def"` first — an undo that did half the job, and correct after a
    // second press, which is how it would read as a near-miss rather than a
    // defect.
    e.undo();
    expect(e.text).toBe("abcdef");
  });

  it("T1.29 (I22): deleteBackward removes the region and not a character as well", () => {
    // **Three graphemes, deliberately.** With a one-grapheme region the correct
    // implementation and the one that also deletes backwards produce the same
    // buffer, so the row would pass for both.
    const e = createEditor({ text: "abcdef", cursor: 1 });

    e.extend("charRight");
    e.extend("charRight");
    e.extend("charRight");
    expect(e.selected).toBe("bcd");

    e.deleteBackward();

    expect(e.text, "the `a` is untouched").toBe("aef");
    expect(e.cursor).toBe(1);
    expect(e.selection).toBeNull();
  });

  it("T1.30 (I22): killTo collapses rather than cutting the region", () => {
    // The kill buffer's contents are what say which of the two answers was
    // taken — the text is the same length either way at the wrong widths.
    const e = createEditor({ text: "alpha beta", cursor: 10 });

    e.extend("charLeft");
    e.extend("charLeft");
    expect(e.selected).toBe("ta");

    e.killTo("wordLeft");

    // **Extending moved the cursor**, because the head *is* the cursor — so
    // the motion runs from 8 and takes `be`. Cutting the region would take
    // `ta`, and the kill buffer is the only thing that distinguishes them:
    // both leave a buffer of the same length.
    expect(e.killBuffer, "the motion's text, not the region's").toBe("be");
    expect(e.text).toBe("alpha ta");
    expect(e.selection).toBeNull();
  });

  it("T1.31 (I22, I16): a region does not survive an undo — and the kill buffer does", () => {
    // **Both in one row, in opposite directions.** A rule that collapses
    // everything satisfies the first half and fails the second; one that
    // collapses nothing does the reverse. Only the pair pins it.
    const e = createEditor({ text: "alpha beta", cursor: 10 });

    e.killTo("wordLeft");
    expect(e.killBuffer).toBe("beta");

    e.extend("charLeft");
    e.extend("charLeft");
    expect(e.selection).not.toBeNull();

    e.undo();

    expect(e.selection, "the caret has moved; the region pointed at other text").toBeNull();
    expect(e.killBuffer, "the clipboard is not undo state (I16)").toBe("beta");
  });
});
