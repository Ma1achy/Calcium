// C10 I58 — the regional tone budget, counted.
//
// `R-COL-002` is a count and nothing counted it. §090 gives both numbers in one
// line — *an ordinary entry: three semantic tones. Five is a smell* — and the
// reason the count is per entry rather than per frame: *a full frame counting
// twelve tones is not breaking the rule.*
import { describe, expect, it } from "vitest";

import { TONE_BUDGET, TONE_SMELL, entryTones } from "../../src/presentation/theme/budget.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const ENTRY = Object.values(ONE_PER_KIND) as readonly Block[];

describe("C10 I58 — the regional tone budget", () => {
  it("T1.46 (C10 I58, R-COL-002, §090): the two numbers are the design's own and they are not the same number", () => {
    // A gate at three would fail entries the design does not object to; a budget
    // of five would lose the figure §090 states. Both are asserted because a
    // single constant would have quietly chosen one reading.
    expect(TONE_BUDGET).toBe(3);
    expect(TONE_SMELL).toBe(5);
    expect(TONE_BUDGET).toBeLessThan(TONE_SMELL);
  });

  it("T1.47 (C10 I58): every entry this repository ships is inside the budget, and the gate can fire", () => {
    const spent = entryTones(ENTRY);
    expect([...spent].sort(), "the whole corpus as one entry").toEqual(["info", "muted", "ok"]);
    expect(spent.size).toBeLessThanOrEqual(TONE_SMELL);

    // **The fabricated violation.** The row above is green because the tree is
    // inside the budget; without this one it would also be green against a
    // counter that returns an empty set, which is A03 §2's vacuity class
    // exactly. Six distinct tones on six notices, and the gate refuses it.
    const over: readonly Block[] = (
      ["default", "dim", "muted", "ok", "warn", "error"] as const
    ).map((tone, i) => ({ kind: "notice", id: `n${String(i)}`, text: "x", tone }) as Block);
    expect(entryTones(over).size, "six tones is over the smell").toBe(6);
    expect(entryTones(over).size).toBeGreaterThan(TONE_SMELL);
  });

  it("T1.48 (C10 I58): a region is excluded whole, not at its root", () => {
    // A code block's syntax palette lives inside it, so counting its children
    // would charge the entry for the palette the rule says it carries
    // separately. Asserted on a region holding a toned child, because a check
    // on the root alone passes against an implementation that descends.
    const withRegion: readonly Block[] = [
      { kind: "notice", id: "n", text: "x", tone: "info" } as Block,
      {
        kind: "code",
        id: "c",
        text: "x",
        children: [{ kind: "notice", id: "inner", text: "y", tone: "error" }],
      } as unknown as Block,
    ];
    expect([...entryTones(withRegion)], "the region's child is not charged").toEqual(["info"]);

    // The control: the same child outside a region, which IS charged. Without
    // it the row passes against a counter that never descends at all.
    const outside: readonly Block[] = [
      { kind: "notice", id: "n", text: "x", tone: "info" } as Block,
      {
        kind: "group",
        id: "g",
        children: [{ kind: "notice", id: "inner", text: "y", tone: "error" }],
      } as unknown as Block,
    ];
    expect([...entryTones(outside)].sort()).toEqual(["error", "info"]);
  });

  it("T1.49 (C10 I58): the count reaches a cell's and a row's tone, not only a block's", () => {
    // A table row's cell carries a `tone` without being a `Block`, so a walk
    // over block kinds alone counts none of them and the gate reads green over
    // an entry spending ten. This is the row that says the walk goes inside.
    const table = ONE_PER_KIND["table"] as Block | undefined;
    expect(table, "the corpus has a table").not.toBeUndefined();
    expect([...entryTones([table as Block])].sort()).toEqual(["muted", "ok"]);
  });
});
