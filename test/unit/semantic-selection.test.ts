// C14 §6a / C16 §5d tier 1 — semantic copy mode's model.
//
// **The footer's mode label is parked** (C14 §6a), so the transition is where
// C16 I51's asymmetry is observable at all. That is the reason this file exists as
// well as the reason the model is a pure function: a rule whose only observation
// point is unbuilt cannot be written against, which is A03 §2's class arriving
// by scheduling rather than by wording.
import { describe, expect, it } from "vitest";

import { measurable, FULL_CAPS } from "../support/render.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import {
  copyTextOf,
  count,
  enter,
  escape,
  keyOf,
  selectAll,
  selectCaret,
  type BlockSpan,
  type SemanticMode,
} from "../../src/shell/semantic-selection.js";

/**
 * The spans a fixture of one-block entries has (C14 I36).
 *
 * Three entries, one block each, one row each — the shape these rows were
 * written against before the unit became the block, kept so the rules they
 * assert are read at the granularity they were written at. §6c's own rows use a
 * taller fixture, because that is where the touching rule bites.
 */
const SPANS: readonly BlockSpan[] = ["e1", "e2", "e3"].map((id) =>
  Object.freeze({ key: keyOf(id, `${id}-0`), from: 0, to: 1 }),
);
const at = (entryId: string) => ({ entryId, row: 0 });
const ids = (m: SemanticMode): readonly string[] =>
  [...(m?.blocks ?? [])].map((k) => k.slice(0, k.indexOf("\u0000"))).sort();

describe("C16 §5d — esc clears then leaves; ⌃c only leaves", () => {
  it("T1.41b (C16 I51, §5d D1, D2): with a selection the first esc clears and stays; with none it leaves", () => {
    // **The control, and it is the one this row would pass without.** A model
    // that never selects anything makes the clear step unreachable, so the
    // two-press rule reads as satisfied by a mode that only ever leaves.
    const empty = enter(null, at("e2"));
    expect(count(empty), "nothing is selected on entry").toBe(0);

    const one = selectCaret(empty, SPANS);
    expect(count(one), "`a` takes the entry under the caret").toBe(1);

    // D1: the first press clears and the mode is **still up**. Both halves,
    // because clearing and leaving are indistinguishable from the count alone.
    const cleared = escape(one);
    expect(cleared, "the mode is still up").not.toBeNull();
    expect(count(cleared)).toBe(0);
    expect(cleared?.caret?.entryId, "the caret is where the reader left it").toBe("e2");

    // D2: the second press leaves.
    expect(escape(cleared)).toBeNull();

    // And with no selection the first press leaves — which is the handoff's
    // single-press behaviour arriving as the second half of this one.
    expect(escape(enter(null, at("e2")))).toBeNull();
  });

  it("T1.41c (C16 I51, §5d D5): ⌃c leaves without clearing first — asserted with a selection open", () => {
    // The ladder's rung sets the mode to `null` directly rather than calling
    // `escape`. Stated as the property rather than as a call: with a selection
    // open, the two exits differ, and that is the only state in which they do.
    const one = selectCaret(enter(null, at("e2")), SPANS);
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
    const m = enter(null, at("e2"));

    // A block is atomic, so `a` twice on one caret is one entry and not two —
    // the property a range representation would make the caller's to maintain.
    expect(ids(selectCaret(selectCaret(m, SPANS), SPANS))).toEqual(["e2"]);

    // `A` is the loaded window, not the record.
    expect(ids(selectAll(m, SPANS))).toEqual(["e1", "e2", "e3"]);

    // The control: `A` outside the mode is still outside it. A verb that
    // entered the mode as a side effect would pass every row above.
    expect(selectAll(null, SPANS)).toBeNull();
    expect(selectCaret(null, SPANS)).toBeNull();
  });

  it("T1.41e (C16 §5d D3): a second enter is a no-op and keeps the selection", () => {
    const one = selectCaret(enter(null, at("e2")), SPANS);
    expect(enter(one, at("e9")), "the same state, by identity").toBe(one);
  });
});

describe("C09 §7a — a kind declares its copy text (M10c)", () => {
  it("T1.41h (C09 I86, §7a, R-SEL-004): the five kinds that copied blank answer their source, and a scroll reaches them", () => {
    const registry = measurable({
      capabilities: FULL_CAPS,
      definitions: [tableDefinition, plotDefinition, patchDefinition],
    }).registry;

    // **The control, and it is the finding.** Before the seam, `copyTextOf`
    // answered six kinds and `""` for the rest — so each of these copied blank
    // through a container that called itself *the source and never the
    // rendering*. Asserted as non-empty first, because the rows below are all
    // satisfied by a stub that returns something.
    const table = {
      kind: "table" as const,
      id: "t",
      columns: [
        { key: "a", label: "Name", align: "left" as const, priority: 1, minWidth: 4, sortable: false },
        { key: "b", label: "State", align: "left" as const, priority: 2, minWidth: 4, sortable: false },
      ],
      rows: [{ id: "r1", cells: { a: { text: "web" }, b: { text: "up" } } }],
    };
    expect(registry.copyOf(table)).toBe("Name\tState\nweb\tup");

    const patch = {
      kind: "patch" as const,
      id: "p",
      path: "src/a.ts",
      language: "ts",
      hunks: [
        {
          header: "@@ -1 +1 @@",
          lines: [
            { kind: "remove" as const, text: "old" },
            { kind: "add" as const, text: "new" },
          ],
        },
      ],
    };
    // Unified diff, never the two-column view — the rule's own hazard, and a
    // copy taken from a split rendering pastes as something nobody can apply.
    expect(registry.copyOf(patch)).toBe("--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new");

    const plot = {
      kind: "plot" as const,
      id: "g",
      form: "line" as const,
      series: [
        { values: [1, null, 3], label: "cpu" },
        { values: [9], label: "hidden", hidden: true },
      ],
    };
    // A gap is a fact and `0` is a different one, so `null` is the empty cell.
    // The hidden series is dropped: hiding is the one rendering decision that
    // is also a statement about the data.
    expect(registry.copyOf(plot)).toBe("cpu\t1\t\t3");

    expect(registry.copyOf({ kind: "image" as const, id: "i", data: "", height: 2, alt: "a chart", digest: "d" }))
      .toBe("a chart");
    expect(registry.copyOf({ kind: "keyValue", id: "k", rows: [{ label: "host", value: "a" }] }))
      .toBe("host\ta");

    // **The case that shows the shape**: a container recursing into a child
    // that answered nothing produced a copy that *succeeded* and was blank.
    expect(registry.copyOf({ kind: "scroll", id: "s", height: 4, children: [table] }))
      .toBe("Name\tState\nweb\tup");

    // A kind that declines is `null`, never `""` — the difference is one blank
    // line, and a blank line is R-SEL-004's entry separator.
    expect(registry.copyOf({ kind: "rule" as const, id: "r", label: "" })).toBeNull();
  });

  it("T1.41i (C14 §6a, R-SEL-004): the join is document order, one blank line between entries and none inside one", () => {
    const registry = measurable({ capabilities: FULL_CAPS }).registry;
    const entry = (id: string, ...texts: string[]) => ({
      id,
      blocks: texts.map((t, i) => ({ kind: "raw" as const, id: `${id}-${String(i)}`, text: t })),
    });
    // A `rule` between two blocks: it declines, so it contributes no line at
    // all. Joined as `""` it would be a blank line, and a blank line inside an
    // entry forges an entry boundary — which is the whole of the omission rule.
    const loaded = [
      { id: "e1", blocks: [...entry("e1", "one").blocks, { kind: "rule" as const, id: "e1-r", label: "" }, ...entry("e1b", "two").blocks] },
      entry("e2", "three"),
      entry("e3", "four"),
    ];

    // **Given back-to-front on purpose.** `blocks` is a set and a set is
    // insertion-ordered, so a join that walked the selection would paste `four`
    // first; taking the order from `loaded` is what makes a copy paste as the
    // session read it. `e2` is left out of the spans, which is what makes the
    // blank line between `e1` and `e3` an entry boundary and not a gap.
    const spans = ["e3", "e1"].flatMap((id) =>
      loaded
        .filter((e) => e.id === id)
        .flatMap((e) => e.blocks.map((b) => ({ key: keyOf(e.id, b.id), from: 0, to: 1 }))),
    );
    const mode = selectAll(enter(null, at("e1")), spans);
    const text = copyTextOf(mode, loaded, registry.copySequence);

    // **Document order, not selection order.**
    expect(text).toBe("one\ntwo\n\nfour");

    // Two entries, one blank line. Stated as a count because the string above
    // is satisfied by a join that happens to agree on three blocks.
    expect(text.split("\n\n")).toHaveLength(2);

    // The control: outside the mode there is nothing to copy.
    expect(copyTextOf(null, loaded, registry.copySequence)).toBe("");
  });
});
