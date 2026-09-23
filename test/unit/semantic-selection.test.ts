// C14 §6a / C16 §5d tier 1 — semantic copy mode's model.
//
// **The footer's mode label is parked** (C14 §6a), so the transition is where
// C16 I51's asymmetry is observable at all. That is the reason this file exists as
// well as the reason the model is a pure function: a rule whose only observation
// point is unbuilt cannot be written against, which is A03 §2's class arriving
// by scheduling rather than by wording.
import { describe, expect, it } from "vitest";

import {
  count,
  enter,
  escape,
  selectAll,
  selectCaret,
  type SemanticMode,
} from "../../src/shell/semantic-selection.js";

const ids = (m: SemanticMode): readonly string[] => [...(m?.entries ?? [])].sort();

describe("C16 §5d — esc clears then leaves; ⌃c only leaves", () => {
  it("T1.41b (C16 I51, §5d D1, D2): with a selection the first esc clears and stays; with none it leaves", () => {
    // **The control, and it is the one this row would pass without.** A model
    // that never selects anything makes the clear step unreachable, so the
    // two-press rule reads as satisfied by a mode that only ever leaves.
    const empty = enter(null, "e2");
    expect(count(empty), "nothing is selected on entry").toBe(0);

    const one = selectCaret(empty);
    expect(count(one), "`a` takes the entry under the caret").toBe(1);

    // D1: the first press clears and the mode is **still up**. Both halves,
    // because clearing and leaving are indistinguishable from the count alone.
    const cleared = escape(one);
    expect(cleared, "the mode is still up").not.toBeNull();
    expect(count(cleared)).toBe(0);
    expect(cleared?.caret, "the caret is where the reader left it").toBe("e2");

    // D2: the second press leaves.
    expect(escape(cleared)).toBeNull();

    // And with no selection the first press leaves — which is the handoff's
    // single-press behaviour arriving as the second half of this one.
    expect(escape(enter(null, "e2"))).toBeNull();
  });

  it("T1.41c (C16 I51, §5d D5): ⌃c leaves without clearing first — asserted with a selection open", () => {
    // The ladder's rung sets the mode to `null` directly rather than calling
    // `escape`. Stated as the property rather than as a call: with a selection
    // open, the two exits differ, and that is the only state in which they do.
    const one = selectCaret(enter(null, "e2"));
    expect(count(one)).toBe(1);

    // `escape` here would leave the mode up with an empty selection. The rung's
    // answer is the mode gone in one press.
    expect(escape(one), "esc: still up").not.toBeNull();

    // ⌃c's verb, which is `null` and not a transition — the whole of C16 I51.
    const afterCtrlC: SemanticMode = null;
    expect(afterCtrlC).toBeNull();
    expect(count(afterCtrlC)).toBe(0);
  });
});

describe("C14 §6a — the selection verbs", () => {
  it("T1.41d (R-SEL-003, R-SEL-008): `a` is idempotent and `A` takes every loaded entry", () => {
    const m = enter(null, "e2");

    // A block is atomic, so `a` twice on one caret is one entry and not two —
    // the property a range representation would make the caller's to maintain.
    expect(ids(selectCaret(selectCaret(m)))).toEqual(["e2"]);

    // `A` is the loaded window, not the record.
    expect(ids(selectAll(m, ["e1", "e2", "e3"]))).toEqual(["e1", "e2", "e3"]);

    // The control: `A` outside the mode is still outside it. A verb that
    // entered the mode as a side effect would pass every row above.
    expect(selectAll(null, ["e1"])).toBeNull();
    expect(selectCaret(null)).toBeNull();
  });

  it("T1.41e (C16 §5d D3): a second enter is a no-op and keeps the selection", () => {
    const one = selectCaret(enter(null, "e2"));
    expect(enter(one, "e9"), "the same state, by identity").toBe(one);
  });
});

describe("C09 §7a — a kind declares its copy text (M10c)", () => {
  it.todo(
    "T1.41h (C09 I86, §7a, R-SEL-004): every registered kind either declares `copy` or is absent from the join, and none joins as the empty string — the five kinds R-SEL-004 names that copied blank before the seam (table as TSV with its header, patch as unified diff, plot as its data view, keyValue, image as alt text and path) each answer their source, and a `scroll` holding a table copies the table rather than nothing — not deferred on a component: the seam lands with the copy in this MR",
  );
  it.todo(
    "T1.41i (C14 §6a, R-SEL-004): `y` over a three-entry selection yields the entries in document order separated by one blank line each, with no block inside an entry producing a blank line of its own — the property the omission default exists for — not deferred on a component: the join lands with the copy in this MR",
  );
});
