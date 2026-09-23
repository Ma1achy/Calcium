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
});
