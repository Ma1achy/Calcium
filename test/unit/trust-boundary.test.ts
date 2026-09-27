// C09 §7d — the trust boundary, over the registry rather than over the call sites.
//
// **The mechanism was never in question; its coverage was.** `stripControl`
// exists, is well argued and is called from nineteen modules — because nineteen
// authors remembered. A twentieth render path is invisible to any rule phrased
// over the nineteen, which is why this is a property over every registered kind
// and not an assertion that a function is called (C09 I89, `R-TRU-001`).
//
// **And the registry is the production one** (C09 I127). This file ran on a
// bare registry, so `table`, `plot` and `patch` fell back to `raw` — which
// strips — and `patch` leaked through its path, hunk header and line text while
// the sweep reported it clean. The kinds swept are now `graph.blocks`' own.
import { beforeAll, describe, expect, it } from "vitest";

import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { measurable, visible } from "../support/render.js";
import { buildGraph } from "../support/session.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { neutraliseControl } from "../../src/data/text.js";
import { cells } from "../../src/presentation/text.js";
import { NOT_NEUTRALISED, neutralBlock } from "../../src/presentation/blocks/neutral.js";
import type { BlockRegistry } from "../../src/presentation/blocks/index.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
/**
 * The single-byte C1 CSI introducer, `0x9b`.
 *
 * **In the payload because a mutation said it was not.** The filter covers
 * `0x7f`–`0x9f` and the sweep never carried a byte in that range, so narrowing
 * `isControl` to C0 alone changed nothing any row could see — a rule correct
 * about a class the corpus had no member of.
 */
const C1_CSI = String.fromCharCode(0x9b);

/**
 * Three classes in one string, because they fail differently.
 *
 * An SGR span repaints what follows it and survives a filter that only looks
 * for cursor motion; an erase-display clears the screen the transcript is drawn
 * on; an OSC sets the window title and is terminated by `BEL` rather than by a
 * letter, so a filter written against CSI alone lets it through whole.
 */
const PAYLOAD = `${ESC}[31mRED${ESC}[0m${ESC}[2J${ESC}]0;title${BEL}${C1_CSI}7m`;

/**
 * The payload as a reader sees it once neutralised (C09 I125) — **written out
 * rather than computed**, so a change to the notation fails T2.156b and is read
 * rather than absorbed. `cat -v`'s form: `^[` for ESC, `^G` for BEL, `M-^[`
 * for the C1 CSI.
 */
const RESIDUE = "^[[31mRED^[[0m^[[2J^[]0;title^GM-^[7m";

/**
 * Every bidi format character (C04 I110, C09 I125): the marks, the embeddings
 * and overrides, and the isolates. An override reorders every cell after it on
 * the row, so a frame carrying one draws text that is not the text measured.
 */
const BIDI = ["؜", "‎", "‏", "‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩"];
const BIDI_PAYLOAD = `A${BIDI.join("")}Z`;

/**
 * The names the registry leaves alone (C09 I124), **declared here and compared
 * by equality** with the registry's own list — so a name added there is a
 * decision this file has to agree with, and the poisoner below skips the same
 * fields the neutraliser does. Escaping one side of a reference breaks it: a
 * table column's `key` is the property name in every `row.cells`.
 */
const IDENTIFIERS = ["areas", "current", "data", "digest", "from", "id", "key", "kind", "target", "to"];
const isIdentifier = (name: string): boolean => IDENTIFIERS.includes(name) || name.endsWith("Id");

/**
 * The (kind, field) pairs whose poisoned value never reaches the frame at
 * width 100 on the production registry (C09 I127) — compared by equality, so a
 * field that starts drawing, or stops, is a decision someone reads.
 */
const NOT_DRAWN = [
  "code:language",
  "comparison:rows[].verdict",
  "form:buttons[].action.command",
  "form:buttons[].action.label",
  "form:fields[].hint",
  "group:direction",
  "image:alt",
  "notice:tone",
  "patch:language",
  "pills:chips[].tone",
  "plot:form",
  "plot:series[].label",
  "split:children[].language",
  "status:state",
  "steps:steps[].state",
  "table:columns[].align",
  "table:rows[].cells.state.tone",
  "tape:members[].detail",
  "tape:members[].state",
  "tip:actions[].command",
  "tree:nodes[].children[].children[].children[].label",
];

/** `suffix` appended to every content string in a block; identifiers and the exempt kind left alone. */
const poisonWith = (suffix: string) => {
  const poison = (value: unknown): unknown => {
    if (typeof value === "string") return value + suffix;
    if (Array.isArray(value)) return value.map(poison);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isIdentifier(k) ? v : poison(v)]));
    }
    return value;
  };
  return poison;
};
const poison = poisonWith(PAYLOAD);

/** The payload's control sequences, by name, in a drawn frame — the frame's own SGR is not the subject (SS14). */
const hitsIn = (drawn: string): string[] => {
  const hits: string[] = [];
  if (drawn.includes(`${ESC}[2J`)) hits.push("erase-display");
  if (drawn.includes(`${ESC}]`)) hits.push("OSC introducer");
  if (drawn.includes(BEL)) hits.push("BEL");
  if (drawn.includes(`${ESC}[31m`)) hits.push("the payload's own SGR");
  if (drawn.includes(C1_CSI)) hits.push("C1 CSI");
  for (const ch of BIDI) if (drawn.includes(ch)) hits.push(`U+${ch.codePointAt(0)?.toString(16) ?? ""}`);
  return hits;
};

/**
 * **The production registry**, built the way a session builds it (C09 I127):
 * `graph.blocks` is what `construct.ts` registered — the defaults, then `table`,
 * `plot` and `patch` through the public mechanism.
 */
let production: BlockRegistry;
beforeAll(async () => {
  production = (await buildGraph()).graph.blocks;
});

describe("C09 §7d — the trust boundary", () => {
  it("T2.190 (C09 I127): the sweep's registry is a constructed session's, and its kinds less terminal equal the kinds swept", () => {
    const kit = measurable({ registry: production });
    const swept = [...new Set(CORPUS.map((b) => b.kind))].filter((k) => k !== "terminal").sort();
    const registered = kit.kinds.filter((k) => k !== "terminal").sort();
    // **Equality, not a subset** — a kind the product registers and this sweep
    // never draws is the gap the bare registry hid for three kinds.
    expect(registered, "the production registry's kinds, less the exempt one").toEqual(swept);
    for (const kind of ["table", "plot", "patch"]) {
      expect(kit.registry.get(kind)?.kind, `${kind} is drawn by its own definition, not by raw`).toBe(kind);
    }
  });

  it("T2.156 (C09 I89, §7d, R-TRU-001): no control byte survives a block's fields to its rendered lines", () => {
    const kit = measurable({ registry: production });

    // **The control first, and it is the one this row cannot do without.** A
    // sweep over a corpus that never carried the payload reports exactly the
    // clean page a sweep over a corpus that stripped it reports — and the
    // session probe this row grew out of was vacuous on its first run for
    // precisely that reason, reporting *no control bytes* about a frame that
    // held none of the payload at all. So the residue must be **present**: the
    // text arrived, shown as the escape it was (C09 I125).
    let sawResidue = 0;

    const leaked: string[] = [];
    for (const block of CORPUS) {
      // **`terminal` is exempt and is asserted by T2.156d, never by being
      // skipped** (C09 I56, I89). Its text is emitted unstripped so a child's
      // colour can cross as `runs`, and the exemption is paid for by C04 I110's
      // gate — which this corpus bypasses, building blocks directly.
      if (block.kind === "terminal") continue;
      const poisoned = poison(block) as Block;
      let lines: readonly string[];
      try {
        lines = kit.renderToLines(poisoned, 60);
      } catch (e) {
        leaked.push(`${block.kind}: threw — ${String(e).slice(0, 80)}`);
        continue;
      }
      const drawn = lines.join("\n");
      const hits = hitsIn(drawn);
      if (hits.length > 0) leaked.push(`${block.kind}: ${hits.join(", ")}`);

      // Some kinds draw no text at all — `rule`, `spacer` — and a kind that
      // shows nothing cannot leak. They are not excused from the sweep above;
      // they simply do not contribute to the control, which is counted over the
      // corpus rather than asserted per kind for that reason.
      if (visible(drawn).includes(RESIDUE.slice(0, 9))) sawResidue += 1;
    }

    expect(leaked, "a control byte reached the frame from a block's own fields").toEqual([]);
    expect(
      sawResidue,
      "the corpus carried the payload — without this, a sweep that dropped it reads identically",
    ).toBeGreaterThan(CORPUS.length / 2);
  });

  it("T2.156d (C09 I89, I56, §7d, C04 I110): the exempt kind's gate refuses what the sweep would have carried", () => {
    // **The half of I89 that is not optional.** `terminal` is exempt from
    // `stripControl` (I56) because a child's screen carries the child's colour
    // as `runs`, and a kind that strips cannot carry it. The exemption is paid
    // for one layer down, and **a skipped kind and a gated kind read the same
    // in a green run** — so the payment is asserted here rather than assumed.
    //
    // The sweep above reported this kind as leaking on its first run, and the
    // sweep was what was wrong: it builds blocks directly and so never passes
    // the boundary the exemption is paid at. A fix was written into `spansOf`
    // and reverted; it would have taken the colour out of a live terminal to
    // close a hole no document can reach.
    const doc = (text: string): unknown => ({
      schema: "tui.view/1",
      command: "x",
      status: "ok",
      meta: {},
      blocks: [{ kind: "terminal", id: "t", cols: 80, screen: "lines", lines: [{ text }] }],
    });
    const errorsOf = (text: string): readonly string[] => {
      const result = validateDocument(doc(text) as never) as { ok: boolean; error?: readonly string[] };
      return result.ok ? [] : (result.error ?? []);
    };

    // **Read as the difference the line makes, not as document validity.** The
    // envelope here is a fixture and carries its own complaints; what this row
    // is about is the one error the *line* produces, so the gate's own message
    // is the subject and everything else is held constant and compared.
    const gateErrors = (text: string): readonly string[] =>
      errorsOf(text).filter((e) => e.includes("C04 I110"));
    const otherErrors = (text: string): readonly string[] =>
      errorsOf(text).filter((e) => !e.includes("C04 I110"));

    const clean = "plain text";
    const payloads: (readonly [string, string])[] = [
      ["an ESC introducer", `x${ESC}[2Jy`],
      ["a C1 introducer", `x${C1_CSI}31my`],
      ["a BEL", `x${BEL}y`],
      // **Every bidi format character, one at a time** (C04 I110, widened by
      // ruling 71): the renderer does not neutralise this kind, so an override
      // here would reorder the frame exactly as an escape would repaint it.
      ...BIDI.map((ch) => [`U+${(ch.codePointAt(0) ?? 0).toString(16)}`, `x${ch}y`] as const),
    ];
    for (const [label, payload] of payloads) {
      expect(gateErrors(payload).length, `${label} is refused by C04 I110`).toBe(1);
      expect(
        otherErrors(payload),
        `${label} changes nothing but the line — so the row is about the control and not the envelope`,
      ).toEqual(otherErrors(clean));
    }

    // **The control, and it is the direction that matters.** A gate that
    // refused every line would satisfy the rows above exactly, so a clean line
    // — right-to-left text included, which carries no format character — must
    // produce no C04 I110 error.
    expect(gateErrors(clean), "a clean line is not refused by the gate").toEqual([]);
    expect(gateErrors("שלום עולם"), "right-to-left letters are text, not format characters").toEqual([]);
  });

  it("T1.86 (C09 I125, C09 I124): neutraliseControl over each class, idempotent, tab and newline kept, and a span moves with its text", () => {
    const cases: (readonly [number, string])[] = [
      [0x1b, "^["],
      [0x00, "^@"],
      [0x07, "^G"],
      [0x0d, "^M"],
      [0x1f, "^_"],
      [0x7f, "^?"],
      [0x80, "M-^@"],
      [0x85, "M-^E"],
      [0x9b, "M-^["],
      [0x9f, "M-^_"],
      [0x061c, "<U+061C>"],
      [0x200e, "<U+200E>"],
      [0x200f, "<U+200F>"],
      [0x202a, "<U+202A>"],
      [0x202e, "<U+202E>"],
      [0x2066, "<U+2066>"],
      [0x2069, "<U+2069>"],
    ];
    for (const [cp, form] of cases) {
      const text = `a${String.fromCharCode(cp)}b`;
      const once = neutraliseControl(text);
      expect(once, `U+${cp.toString(16)}`).toBe(`a${form}b`);
      expect(neutraliseControl(once), `U+${cp.toString(16)} is idempotent`).toBe(once);
      // **ASCII, so the same at every rung** — measure equals render because
      // there is nothing a rung could read differently.
      for (const ambiguous of ["narrow", "wide"] as const) {
        expect(cells(once, ambiguous), `U+${cp.toString(16)} at ${ambiguous}`).toBe(once.length);
      }
    }
    // Tab and newline are what the wrapper and the tab expander act on.
    expect(neutraliseControl("a\tb\nc")).toBe("a\tb\nc");
    // The neighbours of each range are text.
    for (const cp of [0x20, 0x7e, 0xa0, 0x061b, 0x200d, 0x2010, 0x2029, 0x202f, 0x2065, 0x206a]) {
      const text = `a${String.fromCharCode(cp)}b`;
      expect(neutraliseControl(text), `U+${cp.toString(16)} is left alone`).toBe(text);
    }
    // **A clean string is its own answer** — the common case allocates nothing.
    const clean = "a clean string, with some length to it";
    expect(neutraliseControl(clean)).toBe(clean);
    // A surrogate pair is two code units the table answers `null` for, so it passes whole.
    expect(neutraliseControl(`${ESC}😀`)).toBe("^[😀");

    // **The span half** (C04 I83). Offsets index the raw text, and the
    // neutralised text is longer, so a span over `RED` after an ESC has to move
    // with it — or the neutraliser recolours the wrong three characters.
    const raw = { kind: "raw", id: "r", text: `${ESC}[1mRED rest`, spans: [{ from: 4, to: 7, tone: "error" }] } as unknown as Block;
    const neutral = neutralBlock(raw) as unknown as { text: string; spans: readonly { from: number; to: number }[] };
    expect(neutral.text).toBe("^[[1mRED rest");
    const [span] = neutral.spans;
    expect(neutral.text.slice(span?.from, span?.to), "the span still covers RED").toBe("RED");
    // **And below the top level**, where the first draft never went: its record
    // test refused an array, so a table cell and a hunk line stayed raw while a
    // top-level `text` came out clean — and this row, asking only the top level,
    // passed. A cell's text and span, and a column `key` that must not move,
    // because it is the property name `row.cells` is read by.
    const key = `k${ESC}`;
    const table = {
      kind: "table",
      id: "t",
      columns: [{ key, label: `L${ESC}` }],
      rows: [{ id: "r", cells: { [key]: { text: `${ESC}ab`, spans: [{ from: 1, to: 2 }] } } }],
    } as unknown as Block;
    const deep = neutralBlock(table) as unknown as {
      columns: readonly { key: string; label: string }[];
      rows: readonly { cells: Readonly<Record<string, { text: string; spans: readonly { from: number; to: number }[] }>> }[];
    };
    expect(deep.columns[0]?.label).toBe("L^[");
    expect(deep.columns[0]?.key, "an identifier is not neutralised").toBe(key);
    const cell = deep.rows[0]?.cells[key];
    expect(cell?.text).toBe("^[ab");
    expect(cell?.text.slice(cell.spans[0]?.from, cell.spans[0]?.to), "a nested span moves with its text").toBe("a");
    // Identity: a clean block is itself, and a block met again is the same answer.
    const tidy = { kind: "raw", id: "t", text: "tidy" } as unknown as Block;
    expect(neutralBlock(tidy)).toBe(tidy);
    expect(neutralBlock(raw)).toBe(neutral);
    expect(neutralBlock(neutral as unknown as Block), "the neutralised block is its own answer").toBe(neutral);
  });

  it("T2.191 (C09 I124, C09 I127): per (kind, field), each field poisoned alone draws its neutralised residue and no control", () => {
    // **The identifier list first, by equality with the registry's** — the
    // poisoner below skips exactly these, so a name the neutraliser leaves
    // alone and this file does not know is a drift a reader has to rule on.
    expect([...NOT_NEUTRALISED].sort()).toEqual(IDENTIFIERS);

    const kit = measurable({ registry: production });

    // Every string leaf of a block, as a path; the generalised form (`[]` for an
    // index) names the field, and the first occurrence of each is the one poisoned.
    type Path = readonly (string | number)[];
    const leaves = (value: unknown, at: Path, out: Path[]): void => {
      if (typeof value === "string") out.push(at);
      else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, [...at, i], out));
      else if (value !== null && typeof value === "object") {
        if ((value as { kind?: unknown }).kind === "terminal") return;
        for (const [k, v] of Object.entries(value)) if (!isIdentifier(k)) leaves(v, [...at, k], out);
      }
    };
    const field = (at: Path): string => at.map((p) => (typeof p === "number" ? "[]" : `.${p}`)).join("").replace(/^\./u, "");
    const withAt = (value: unknown, at: Path): unknown => {
      if (at.length === 0) return `${PAYLOAD}${String(value)}`;
      const [head, ...rest] = at;
      if (Array.isArray(value)) return value.map((v, i) => (i === head ? withAt(v, rest) : v));
      const record = value as Record<string, unknown>;
      return { ...record, [head as string]: withAt(record[head as string], rest) };
    };

    const leaked: string[] = [];
    const undrawn: string[] = [];
    let drawnFields = 0;
    for (const block of Object.values(ONE_PER_KIND)) {
      if (block.kind === "terminal") continue;
      const paths: Path[] = [];
      leaves(block, [], paths);
      const seen = new Set<string>();
      for (const at of paths) {
        const name = `${block.kind}:${field(at)}`;
        if (seen.has(name)) continue;
        seen.add(name);
        // **The payload leads**, so a field cut at its end still shows it: `^[`
        // is two cells, and a frame shows it only if the field reached it.
        const drawn = kit.renderToLines(withAt(block, at) as Block, 100).join("\n");
        const hits = hitsIn(drawn);
        if (hits.length > 0) leaked.push(`${name}: ${hits.join(", ")}`);
        if (visible(drawn).includes("^[")) drawnFields += 1;
        else undrawn.push(name);
      }
    }

    expect(leaked, "a field's control reached the frame").toEqual([]);
    // **Read one by one before they were declared.** Enumerations and
    // discriminants a renderer resolves rather than draws (a poisoned one is an
    // unknown value, answered by the default); acted-on values (`command`, an
    // action's own `label` beside the button's); `image:alt` at a rung that
    // draws the pixels; a hint that is all-or-nothing and no longer fits once
    // the payload leads it; a single-series plot with no legend; a tape
    // member's shed detail; and the tree's collapsed third level.
    expect(undrawn.sort(), "the fields a kind does not draw, declared").toEqual(NOT_DRAWN);
    expect(drawnFields, "fields drawn with their residue").toBeGreaterThan(0);
  });

  it("T2.192 (C09 I125, C09 I89): the bidi payload reaches no frame as the character and appears as <U+XXXX>", () => {
    const kit = measurable({ registry: production });
    const bidi = poisonWith(BIDI_PAYLOAD);
    const leaked: string[] = [];
    const forms = new Set<string>();
    let shown = 0;
    for (const block of CORPUS) {
      if (block.kind === "terminal") continue;
      const drawn = kit.renderToLines(bidi(block) as Block, 100).join("\n");
      const found = BIDI.filter((ch) => drawn.includes(ch));
      if (found.length > 0) leaked.push(`${block.kind}: ${found.map((c) => (c.codePointAt(0) ?? 0).toString(16)).join(" ")}`);
      const seen = BIDI.map((ch) => neutraliseControl(ch)).filter((form) => visible(drawn).includes(form));
      for (const form of seen) forms.add(form);
      if (seen.length > 0) shown += 1;
    }
    expect(leaked, "a bidi format character reached the frame").toEqual([]);
    // **The set, not its first member** — a range narrowed to lose the isolates
    // keeps U+061C, and a field cut short loses the tail, so the control is that
    // every one of the twelve was drawn by some frame.
    expect([...forms].sort(), "every bidi format character was drawn as <U+XXXX>").toEqual(
      BIDI.map((ch) => neutraliseControl(ch)).sort(),
    );
    expect(shown, "the corpus carried the payload").toBeGreaterThan(CORPUS.length / 2);
  });

  it("T2.193 (C09 I126): every kind's copy carries no control and no bidi format character, and carries the residue", () => {
    const kit = measurable({ registry: production });
    const both = poisonWith(`${PAYLOAD}${BIDI_PAYLOAD}`);
    // A C0 other than `\n` and `\t`, DEL, C1, or a bidi format character.
    const forbidden = (unit: number): boolean =>
      (unit < 0x20 && unit !== 0x09 && unit !== 0x0a) ||
      (unit >= 0x7f && unit <= 0x9f) ||
      BIDI.includes(String.fromCharCode(unit));
    const dirty: string[] = [];
    const bare: string[] = [];
    for (const block of Object.values(ONE_PER_KIND)) {
      if (block.kind === "terminal") continue;
      const poisoned = both(block) as Block;
      for (const [route, text] of [
        ["copyOf", kit.registry.copyOf(poisoned)],
        ["copySequence", kit.registry.copySequence([poisoned])],
      ] as const) {
        if (text === null || text === "") continue;
        const at = [...text].findIndex((ch) => forbidden(ch.charCodeAt(0)));
        if (at >= 0) dirty.push(`${block.kind} via ${route}: U+${(text.codePointAt(at) ?? 0).toString(16)}`);
        if (route === "copyOf" && !(text.includes("^[") && text.includes("<U+202E>"))) bare.push(block.kind);
      }
    }
    expect(dirty, "a copy carried a control or a bidi format character").toEqual([]);
    // Kinds whose copy carries none of their poisoned strings — declared, compared by equality.
    expect(bare.sort(), "the kinds that copy without a content string").toEqual([]);
  });

  it("T2.156b (C09 I89, §7d): the sweep can see a leak — the fabricated violation", () => {
    // **The rule's own check, and it is not about the tree.** The assertion
    // above is an absence, and an absence assertion is satisfied by a corpus
    // that renders nothing, a matcher that looks for the wrong bytes and a tree
    // that is correct, identically. This renders the payload through a path
    // that does *not* neutralise and asserts the matcher fires — so a green run
    // above is about the neutraliser being reached rather than about the search.
    const drawn = `a line ${PAYLOAD} and more ${BIDI_PAYLOAD}`;
    expect(hitsIn(drawn).sort()).toEqual(
      [
        "BEL",
        "C1 CSI",
        "OSC introducer",
        "erase-display",
        "the payload's own SGR",
        ...BIDI.map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16)}`),
      ].sort(),
    );

    // And the residue is what the same string looks like once neutralised,
    // which is the value the controls above compare against — written out
    // rather than computed, so a change to the notation (C09 I125) fails here
    // and is read rather than absorbed.
    expect(neutraliseControl(PAYLOAD)).toBe(RESIDUE);
  });
});
