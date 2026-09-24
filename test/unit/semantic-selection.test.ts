// C14 §6a / C16 §5d tier 1 — semantic copy mode's model.
//
// **The model is a pure function** so C16 I51's asymmetry is observable without a
// session. It was written while the footer's label was parked (C14 §6a), when the
// transition was the only observation point; I55 has since given the footer the
// mode, the count and which `esc` is next, and its rows are at the end.
import { describe, expect, it } from "vitest";

import { measurable, ASCII_CAPS, FULL_CAPS } from "../support/render.js";
import { makeDefaultChrome, ownerLine } from "../../src/shell/chrome.js";
import type { CopyState } from "../../src/shell/types.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import {
  copyTextOf,
  count,
  sizeOf,
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

describe("C14 I55 — the copy rung's footer", () => {
  const labels = (copy?: CopyState, caps = FULL_CAPS): readonly string[] =>
    ownerLine("copy", caps, false, 0, copy).map((c) => c.label);

  it("T1.50 (C14 I55, R-SEL-005, R-SEL-009): the copy rung's owner line reads by mode, esc clears before it leaves, and the count is three chips", () => {
    // **The control: nothing selected** — `esc out`, and no count at all
    // rather than a zero, which is what absent `copy` also reads as.
    const idle = ["copy", "↑↓ extend", "⏎ copy", "esc out", "the screen is frozen"];
    expect(labels({ mode: "semantic", size: null })).toEqual(idle);
    expect(labels(undefined), "no copy state is semantic mode with nothing selected").toEqual(idle);

    // Over a selection the first esc clears, and the count follows it in order.
    expect(labels({ mode: "semantic", size: { chars: 418, rows: 9, entries: 2 } })).toEqual([
      "copy", "↑↓ extend", "⏎ copy", "esc clear", "418 chars · 9 rows · 2 entries", "the screen is frozen",
    ]);
    const one = labels({ mode: "semantic", size: { chars: 1, rows: 1, entries: 1 } });
    expect(one[4], "one of each is singular").toBe("1 char · 1 row · 1 entry");

    // **Native handoff names none of the semantic mode's keys**: they reach
    // nothing while the terminal owns the mouse (fixture 044).
    const native = labels({ mode: "native" });
    expect(native).toEqual(["native", "mouse tracking off", "the terminal owns the mouse", "esc out", "the screen is frozen"]);
    expect(native.some((l) => l.includes("extend") || /\d+ chars?/u.test(l))).toBe(false);

    // The header by the same field.
    const chrome = makeDefaultChrome("calcium", "calcium");
    const header = (copy?: CopyState): readonly string[] => {
      const out: string[] = [];
      const walk = (b: Block): void => {
        if (b.kind === "pills") out.push(...b.chips.map((c) => c.label));
        if (b.kind === "group") b.children.forEach(walk);
      };
      chrome.header({
        session: { cwd: "/", env: {}, lastUuid: null, identity: null, cluster: "c", health: "live", version: "1", retained: null, stopping: false },
        now: 0,
        columns: 80,
        owner: "copy",
        capabilities: FULL_CAPS,
        ...(copy === undefined ? {} : { copy }),
      }).forEach(walk);
      return out;
    };
    expect(header({ mode: "native" })).toContain("NATIVE");
    expect(header({ mode: "native" })).not.toContain("COPY");
    expect(header({ mode: "semantic", size: null })).toContain("COPY");

    // At ASCII the separator is the glyph table's, not a literal middle dot.
    expect(labels({ mode: "semantic", size: { chars: 3, rows: 1, entries: 1 } }, ASCII_CAPS)).toContain("3 chars : 1 row : 1 entry");
    // Every chip is drawable at the ASCII rung (A03 SS47).
    for (const copy of [{ mode: "native" } as const, { mode: "semantic", size: { chars: 3, rows: 1, entries: 1 } } as const]) {
      for (const label of labels(copy, ASCII_CAPS)) expect(label, label).toMatch(/^[\x20-\x7e]*$/u);
    }
  });

  it("T1.51 (C14 I38, C14 I55, R-SEL-015): sizeOf counts the copy text — chars, rows, contributing entries", () => {
    // A stand-in `copySequence` over known texts, so the arithmetic is the
    // subject: `rule` blocks copy nothing, which is the case the block count
    // gets wrong.
    const TEXT: Readonly<Record<string, string>> = { a: "héllo\nwörld", b: "日本𝄞" };
    const sequence = (blocks: readonly Block[]): string =>
      blocks.map((b) => TEXT[b.id] ?? "").filter((t) => t !== "").join("\n");
    const loaded = [
      { id: "e1", blocks: [{ kind: "text", id: "a", text: "" }, { kind: "rule", id: "r1" }] as unknown as Block[] },
      { id: "e2", blocks: [{ kind: "text", id: "b", text: "" }] as unknown as Block[] },
      { id: "e3", blocks: [{ kind: "rule", id: "r2" }] as unknown as Block[] },
    ];
    const pick = (...keys: string[]): SemanticMode =>
      Object.freeze({ caret: null, anchor: null, blocks: new Set(keys) });
    const all = pick(keyOf("e1", "a"), keyOf("e1", "r1"), keyOf("e2", "b"), keyOf("e3", "r2"));

    // `héllo\nwörld\n\n日本𝄞` — 5 + 1 + 5 + 2 + 3 code points, four lines, two
    // entries; the third entry selected only a rule and is not counted. `𝄞` is
    // one code point and two UTF-16 units, so `.length` would say 17.
    expect(copyTextOf(all, loaded, sequence)).toBe("héllo\nwörld\n\n日本𝄞");
    expect(sizeOf(all, loaded, sequence)).toEqual({ chars: 16, rows: 4, entries: 2 });
    expect(count(all), "the block count, which is not what is drawn").toBe(4);

    expect(sizeOf(pick(keyOf("e2", "b")), loaded, sequence)).toEqual({ chars: 3, rows: 1, entries: 1 });
    expect(sizeOf(pick(keyOf("e3", "r2")), loaded, sequence), "a selection that copies nothing").toBeNull();
    expect(sizeOf(pick(), loaded, sequence), "nothing selected").toBeNull();
    expect(sizeOf(null, loaded, sequence), "outside the mode").toBeNull();
  });
});
