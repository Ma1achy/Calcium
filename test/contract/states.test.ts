// The state axis's equality arm — the same shape `EXPECTED_KINDS` has.
//
// **A subset check would let the inventory and the frames drift apart in the
// direction that matters.** `ONE_PER_KIND` is kept honest by its type: a
// `Record<BlockKind, Block>` cannot omit a kind. Nothing types a *state*, so the
// list is the only thing that says which exist, and a list nobody compares by
// equality is a list that grows in one direction.
//
// **What this cannot do is stated in `states.ts` and repeated here, because an
// unrecorded limit reads as strength**: no rule can invent an entry for a state
// nobody wrote down. This arm catches a fixture added without being declared and
// a name declared without a fixture. Whether a *new* state belongs on the list is
// a judgement made when a feature lands — the same judgement `EXPECTED_KINDS`
// needs — and the entries exist to make it cheap, not automatic.
import { describe, expect, it } from "vitest";

import { ALL_STATES, STATES } from "../support/states.js";
import { ALL_KINDS } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";

/**
 * Declared by hand, on purpose. Adding a state means adding a line here, which
 * is the moment the judgement gets made.
 */
const EXPECTED_STATES = [
  "notice-continuation",
  "plot-gapped-line",
  "plot-gapped-sparkline",
  "plot-zero-minimum",
  "prompt-paste-chip",
] as const;

describe("the corpus's second axis", () => {
  it("T2.100: the inventory and the fixtures match by equality, not by containment", () => {
    expect([...ALL_STATES].sort()).toEqual([...EXPECTED_STATES].sort());
    expect(new Set(ALL_STATES).size, "no name is used twice").toBe(ALL_STATES.length);
  });

  it("T2.101: every state renders rows under every capability arm, and says which it is a state of", () => {
    // **The control for the golden file.** A state whose `rows` returns nothing
    // snapshots as a header and a blank, which reads exactly like a state that
    // renders — and the `notice-continuation` entry is one `doc.blocks[0]`
    // lookup away from being that, by construction rather than by accident.
    for (const state of STATES) {
      for (const caps of [FULL_CAPS, ASCII_CAPS, { ...FULL_CAPS, ambiguousWidth: "wide" as const }]) {
        const rows = state.rows(40, caps, DARK_THEME);
        expect(rows.length, `${state.name} draws nothing`).toBeGreaterThan(0);
        expect(rows.join(""), `${state.name} draws only blanks`).not.toMatch(/^\s*$/u);
      }
    }
  });

  it("T2.102: a state names a real subject, and `prompt` is the one that is not a kind", () => {
    // The subject is what makes the axis readable beside the first one: every
    // entry is a state *of* something, and the something is a block kind except
    // where the surface is not a block at all.
    for (const state of STATES) {
      if (state.of === "prompt") continue;
      expect(ALL_KINDS, `${state.name} is a state of "${state.of}"`).toContain(state.of);
    }

    expect(
      STATES.some((s) => s.of === "prompt"),
      "the axis is not block-only — the chip is an editor state and shipped without a frame too",
    ).toBe(true);
  });

  it("T2.103: every state carries a reason a reader can check", () => {
    // **An entry whose reason is *for coverage* is an entry nobody maintains.**
    // Each `why` names the defect that reached the tree, or the one that would,
    // so a reader deciding whether to delete a row has the argument in hand.
    for (const state of STATES) {
      expect(state.why.length, `${state.name} needs a reason`).toBeGreaterThan(40);
      expect(state.why, `${state.name}'s reason is a category, not an argument`).not.toMatch(
        /^(for coverage|coverage|completeness)/iu,
      );
    }
  });
});
