// C14 I34 — tier 6.
//
// Each row names the change that makes it fail and shows the defect it would
// ship; the mutation pass checks the named row mechanically.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";
import { waitingEntries } from "../../src/shell/semantic-selection.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";

describe("C14 §6b — the waiting count, tier 6", () => {
  it("T6.30 (C14 I34): the waiting count taken as a length difference → T1.78 fails", () => {
    // **The defect, as numbers**: a store of three blocks at a cap of three
    // takes a fourth, evicts two and gains the marker. The length is where it
    // was, so the notice a length draws says nothing arrived — while the
    // reader's view is missing the new entry and the drop notice both.
    const one = (id: string) => doc({ command: id, blocks: [block({ kind: "notice", id: "b", tone: "info", text: id })] });
    const t = createTranscriptStore({ cap: 3 });
    for (const id of ["e1", "e2", "e3"]) t.append(one(id));
    const held = t.entries;
    t.append(one("e4"));
    expect(t.entries.length - held.length, "the length reverted to").toBe(0);
    expect(waitingEntries(t.entries, held), "what arrived").toBe(2);
  });
});
