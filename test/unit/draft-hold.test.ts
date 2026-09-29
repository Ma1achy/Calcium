// C17 I28 — the line taken and given back exactly (§101, C23 I28, C23 I73).
//
// **The region is the discriminator and the other two fields are not.** A
// snapshot carrying text and caret is restored correctly by a build that never
// knew there was a third field, which is what makes *restored exactly* a claim
// worth a type rather than a pair of `setText` calls.
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/interaction/editor/index.js";
import type { ChipParts } from "../../src/interaction/editor/layout.js";

const LOOK = { separator: "·", painted: true, unicode: "full" } as const;

describe("C17 §101 — the held draft", () => {
  it("T1.49 (C17 I28, §101): text, caret and region all come back, and the region is the row", () => {
    const e = createEditor({ chips: LOOK });
    e.insert("git commit -m wip");
    e.move("wordLeft");
    e.extend("wordRight");

    const held = e.snapshot();
    expect(held.text, "the line as it was").toBe("git commit -m wip");
    expect(held.selection, "with a live region").not.toBeNull();
    const caret = held.cursor;

    // **An intervening edit that moves all three**, so the restore is reading
    // the snapshot rather than finding the editor where it left it — the
    // borrow this exists for puts another owner's text here in between.
    e.setText("a reply composed by somebody else", 3);
    expect(e.selection, "and the borrow left no region").toBeNull();

    e.restore(held);
    expect(e.text, "the text").toBe("git commit -m wip");
    expect(e.cursor, "the caret").toBe(caret);
    // **The field a build that never knew about it would fail**, and the two
    // above are the ones it would pass.
    expect(e.selection, "and the region, which is what `restored exactly` means").toEqual(
      held.selection,
    );
    expect(e.selected, "read back off the buffer, not off the record").toBe("wip");

    // **The control, in the other direction.** A restore of a snapshot with no
    // region leaves none — rather than leaving whatever the editor happened to
    // have, which is what a restore that only ever *sets* an anchor does.
    const bare = createEditor({ chips: LOOK });
    bare.insert("plain");
    const noRegion = bare.snapshot();
    expect(noRegion.selection, "nothing selected when it was taken").toBeNull();
    bare.selectAll();
    expect(bare.selection, "and something selected now").not.toBeNull();
    bare.restore(noRegion);
    expect(bare.selection, "the restore clears it rather than leaving it").toBeNull();
  });

  it("T1.50 (C17 I28): a restore is not an edit, so undo does not reach the other owner's text", () => {
    const e = createEditor({ chips: LOOK });
    e.insert("mine");
    const held = e.snapshot();

    e.setText("theirs", 6);
    e.restore(held);
    expect(e.text, "the line is back").toBe("mine");

    // **`⌃z` must not walk into `theirs`.** A restore written through `insert`
    // or `setText` passes every assertion about the three fields and leaves the
    // reader one keystroke from the text the question composed — which is
    // precisely what the borrow was supposed to have taken away.
    const walked: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      if (!e.undo()) break;
      walked.push(e.text);
    }
    expect(walked, `undo walked into ${walked.join(" → ")}`).not.toContain("theirs");
  });

  it("T1.51 (C17 I29, §052): the borrow starts with an empty undo stack, so ⌃z inside it never produces the held line", () => {
    const e = createEditor({ chips: LOOK });
    e.insert("mine");
    e.move("wordLeft");
    e.insert("all ");
    expect(e.undoDepth, "the owner has history to lose").toBeGreaterThan(0);

    const held = e.hold();
    expect(e.text, "the borrow starts empty").toBe("");
    expect(e.selection, "with no region").toBeNull();
    // **The discriminator is the entry.** A `hold` written as `snapshot` then
    // `setText("")` passes the two assertions above and records the owner's
    // line as the borrower's first unit — one `⌃z` from the held draft.
    expect(e.undoDepth, "and no undo depth, not even the entry").toBe(0);
    expect(e.redoDepth, "nor any redo").toBe(0);

    e.insert("a reply");
    const walked: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      if (!e.undo()) break;
      walked.push(e.text);
    }
    expect(walked.filter((t) => t.includes("mine")), `undo inside the borrow walked ${walked.join(" → ")}`).toEqual([]);

    e.resume(held);
    expect(e.text, "given back").toBe("all mine");
  });

  it("T1.52 (C17 I29, §052): a borrower that types in several units leaves none of them in the owner's undo walk", () => {
    const e = createEditor({ chips: LOOK });
    e.insert("mine");
    const ownerDepth = e.undoDepth;
    const held = e.hold();

    // **Several units, which is what T1.50's fixture could not construct.** A
    // motion ends the coalescing run, so each word is its own unit with the
    // previous word as its pre-state — the borrower's text, not the owner's.
    e.insert("the");
    e.move("charLeft");
    e.move("charRight");
    e.insert("irs");
    e.move("charLeft");
    e.move("charRight");
    e.insert(" reply");
    expect(e.undoDepth, "the borrower made more than one unit").toBeGreaterThan(1);
    const theirs = ["the", "theirs", "theirs reply"];

    e.resume(held);
    expect(e.text, "the owner's line").toBe("mine");
    expect(e.undoDepth, "and the owner's stack, exactly").toBe(ownerDepth);

    const walked: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      if (!e.undo()) break;
      walked.push(e.text);
    }
    expect(walked.filter((t) => theirs.includes(t)), `undo walked ${walked.join(" → ")}`).toEqual([]);
    // **Redo is the owner's too.** A stack that kept the borrower's redo would
    // put the reply back after the owner's own undo.
    const redone: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      if (!e.redo()) break;
      redone.push(e.text);
    }
    expect(redone.filter((t) => theirs.includes(t)), `redo walked ${redone.join(" → ")}`).toEqual([]);
    expect(e.text, "and redo ends on the owner's line").toBe("mine");
  });
});

describe("C17 §5f — chips across a borrow", () => {
  const paste = (name: string): ChipParts => ({ kind: "paste", name, lines: 5, content: name.repeat(3) });
  /** The ordinals a line draws, read off the rows the walk returns. */
  const drawn = (e: ReturnType<typeof createEditor>): string[] =>
    [...e.layout(200, { first: 0, cont: 0 }).join("").matchAll(/#(\d+) (\w+)/gu)].map((m) => `#${m[1] ?? ""} ${m[2] ?? ""}`);

  it("T1.57 (C17 I33, §5f, §052): a borrow numbers its own chips from #1, and the owner's numbering comes back with its line", () => {
    const e = createEditor({ chips: LOOK });
    e.insertChip(paste("A"));
    expect(drawn(e), "the owner's first chip").toEqual(["#1 A"]);

    const held = e.hold();
    e.insertChip(paste("B"));
    // **The borrow's half**: a counter left on the editor draws `#2` here,
    // which is what `c8c7a77e` drew.
    expect(drawn(e), "the borrow's first chip is its #1").toEqual(["#1 B"]);
    // **A second chip in the borrow, so the two counts differ.** With one
    // chip on each side, a `resume` that never put the owner's counter back
    // left it at the borrow's 1 — the owner's own figure — and the mutation
    // pass found this row agreeing with it.
    e.insertChip(paste("E"));
    expect(drawn(e), "and its second is #2").toEqual(["#1 B", "#2 E"]);

    e.resume(held);
    e.insertChip(paste("C"));
    // **The owner's half**: a counter reset at the borrow and never put back
    // draws `#3 C` here (the borrow's count carried on), and the shared
    // counter draws `#4`.
    expect(drawn(e), "the owner's next chip continues the owner's count").toEqual(["#1 A", "#2 C"]);
    expect(e.resolved, "and each resolves to its own content").toBe("AAACCC");
  });

  it("T1.58 (C17 I33, I34, §5f, §5a): a chip yanked across owners resolves and takes the line's next number; an own chip keeps its own", () => {
    const e = createEditor({ chips: LOOK });
    e.insertChip(paste("A"));
    const held = e.hold();
    e.insertChip(paste("B"));
    e.killTo("bufferStart");
    expect(e.text, "the borrow's line is empty, and the kill buffer holds its chip").toBe("");
    e.resume(held);
    e.insertChip(paste("C"));

    e.yank();
    // **Adopted**: the reply's `#1` inserted as it is would draw `#1 B` beside
    // `#1 A`. Its content is what it always was.
    expect(drawn(e), "a foreign chip takes the owner's next number").toEqual(["#1 A", "#2 C", "#3 B"]);
    expect(e.resolved, "and resolves").toBe("AAACCCBBB");
    // **Each yank of a foreign chip is a paste**, so a second one is `#4`.
    e.yank();
    expect(drawn(e).at(-1), "yanked again, numbered again").toBe("#4 B");
    // **The table never forgets**: undo and redo move the sentinel out of the
    // text and back, and it still resolves.
    e.undo();
    e.redo();
    expect(e.resolved, "undo and redo keep it resolving").toBe("AAACCCBBBBBB");

    // **The control: an own chip is not adopted.** Killed and yanked on the
    // line that minted it, it is the same chip — same number, same sentinel.
    const own = createEditor({ chips: LOOK });
    own.insertChip(paste("A"));
    const sentinel = own.text;
    own.killTo("bufferStart");
    own.yank();
    own.yank();
    expect(own.text, "the same sentinel twice").toBe(sentinel + sentinel);
    expect(drawn(own), "and the same number twice").toEqual(["#1 A", "#1 A"]);

    // **And the other direction**: the owner kills a chip, a borrower yanks it
    // — the borrower's `#1`, not the owner's.
    const back = createEditor({ chips: LOOK });
    back.insertChip(paste("A"));
    back.insertChip(paste("D"));
    back.killTo("charLeft");
    const borrowed = back.hold();
    back.yank();
    expect(drawn(back), "the borrower's first chip, adopted").toEqual(["#1 D"]);
    back.resume(borrowed);
    expect(drawn(back), "and the owner's line as it was").toEqual(["#1 A"]);
  });

  it("T1.59 (C17 I34, I24, §5f): every sentinel minted across a borrow is distinct, and the held chip draws and resolves as before", () => {
    const e = createEditor({ chips: LOOK });
    e.insertChip(paste("A"));
    // **Through the memo** (I24): laid out before the borrow, so a rebinding
    // that left the text the same would be served the stale answer — or the
    // fresh wrong one — and both are asserted against.
    const before = e.layout(80, { first: 2, cont: 2 });
    const mine = e.text;

    const held = e.hold();
    e.insertChip(paste("B"));
    e.insertChip(paste("E"));
    const theirs = e.text;
    e.resume(held);

    const minted = [...mine, ...theirs];
    expect(new Set(minted).size, `sentinels ${JSON.stringify(minted)} are all distinct`).toBe(minted.length);
    expect(e.text, "the owner's line is the same string").toBe(mine);
    expect(e.layout(80, { first: 2, cont: 2 }), "and draws as it did").toEqual(before);
    // **A fresh walk, not only the memo's**: a rebinding restart draws `B`
    // through a new width even where the memo would have hidden it.
    expect(drawn(e), "the held chip is the owner's A").toEqual(["#1 A"]);
    expect(e.resolved, "and submits A's content").toBe("AAA");
  });
});
