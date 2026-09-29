// C14 I37, I59, I60 — tier 6.
//
// Each row names the change that makes it fail and shows the defect it would
// ship; the mutation pass (`c14-copy-keys`) checks the named row mechanically.
import { describe, expect, it } from "vitest";

import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import type { Key } from "../../src/interaction/router/types.js";
import {
  enter,
  escape,
  extendRectTo,
  extendTo,
  hasSelection,
  keyOf,
  moveCaret,
  rectBetween,
  sizeOf,
  type BlockSpan,
  type SemanticMode,
} from "../../src/shell/semantic-selection.js";

describe("C14 §6a, §6e — the copy mode's keys, tier 6", () => {
  it("T6.31 (C14 I59): ⏎ bound back to copySelectedEntries → T4.40 fails", () => {
    // **The defect, as a table**: with ⏎ on `y`'s action the two keys are one
    // key, and the mode has no copy that ends it — R-BLK-838's *leaves by esc,
    // or a copy* loses its second half.
    const map = createKeymap(defaultKeymap);
    const key = (name: string, sequence: string): Key => ({ name, ctrl: false, meta: false, shift: false, sequence });
    const enterAction = map.resolve("semanticSelection", key("enter", "\r"))?.action;
    const yAction = map.resolve("semanticSelection", key("y", "y"))?.action;
    expect(enterAction, "⏎ is its own action").not.toBe(yAction);
  });

  it("T6.32 (C14 I59): the esc label read from size === null → T3.15 fails", () => {
    // **The defect, as the two predicates**: a selection of a `rule` alone
    // copies nothing, so `size` is null — and it is a selection, so `escape()`
    // clears it and stays. A label read from `size` says `out` over that press.
    const mode: SemanticMode = Object.freeze({
      caret: { entryId: "e1", row: 0 },
      anchor: null,
      blocks: new Set([keyOf("e1", "r")]),
      rect: null,
    });
    const loaded = [{ id: "e1", blocks: [{ kind: "rule", id: "r", label: "" }] as never }];
    expect(sizeOf(mode, loaded, () => ""), "the size a label would read").toBeNull();
    expect(escape(mode), "what esc does").not.toBeNull();
    expect(hasSelection(mode), "the predicate the label reads").toBe(true);
  });

  it("T6.33 (C14 I60): rectBetween ignoring a span's columns → T1.79 fails", () => {
    // **The defect, as a copy**: a head forty columns out over a block twelve
    // wide, five in. Ignoring the span's columns takes cells past the block's
    // edge — and, with the anchor at 0, the card's gutter too.
    const spans: readonly BlockSpan[] = [{ key: keyOf("e1", "b"), from: 0, to: 2, cols: { from: 5, to: 17 } }];
    const rect = rectBetween({ entryId: "e1", row: 0, column: 0 }, { entryId: "e1", row: 1, column: 40 }, spans, ["e1"]);
    expect([rect?.fromColumn, rect?.toColumn], "clamped into the block").toEqual([5, 16]);
    const ignoring = rectBetween(
      { entryId: "e1", row: 0, column: 0 },
      { entryId: "e1", row: 1, column: 40 },
      spans.map(({ key, from, to }) => ({ key, from, to })),
      ["e1"],
    );
    expect([ignoring?.fromColumn, ignoring?.toColumn], "what the revert copies").toEqual([0, 40]);
  });

  it("T6.34 (C14 I37): the edge scroll removed from the keyboard move → T3.14 fails", () => {
    // **The defect, as a caret with nowhere to be drawn**: the model moves the
    // caret by entry rows and knows no viewport, so nothing in it can keep the
    // caret on screen. A 40-row entry, the caret stepped thirty rows down: the
    // row is past any screen this suite builds, and only the session's scroll
    // brings it on.
    const spans: readonly BlockSpan[] = [{ key: keyOf("e1", "b"), from: 0, to: 40 }];
    let mode = enter(null, { entryId: "e1", row: 0 });
    for (let i = 0; i < 30; i += 1) mode = moveCaret(mode, 1, spans, ["e1"]);
    expect(mode?.caret?.row).toBe(30);
  });

  it("T6.35 (C14 I60): the autoscroll tick extending the block selection in the rectangle → T4.42 fails", () => {
    // **The defect, as the two extends**: in the rectangle the block `extendTo`
    // moves the caret and the block set and leaves the rectangle's head at the
    // press, so a held drag scrolls and the copy is one cell.
    const spans: readonly BlockSpan[] = [{ key: keyOf("e1", "b"), from: 0, to: 40 }];
    const at = { entryId: "e1", row: 5, column: 3 };
    const mode: SemanticMode = Object.freeze({
      caret: { entryId: "e1", row: 5 },
      anchor: null,
      blocks: new Set<string>(),
      rect: Object.freeze({ anchor: at, head: at }),
    });
    const edge = { entryId: "e1", row: 30 };
    expect(extendTo(mode, edge, spans, ["e1"])?.rect?.head, "the revert: the head stays at the press").toEqual(at);
    expect(extendRectTo(mode, { ...edge, column: 6 })?.rect?.head, "the tick's extend moves it").toEqual({ ...edge, column: 6 });
  });
});
