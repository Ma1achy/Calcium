// C17 I28 — the line taken and given back exactly (§101, C23 I28, C23 I73).
//
// **The region is the discriminator and the other two fields are not.** A
// snapshot carrying text and caret is restored correctly by a build that never
// knew there was a third field, which is what makes *restored exactly* a claim
// worth a type rather than a pair of `setText` calls.
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/interaction/editor/index.js";

const LOOK = { separator: "·", painted: true } as const;

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
