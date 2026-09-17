// C09 I72 — the rows arm at its edges: SGR-only rows, OSC controls, styled and plain trailing blanks, wide characters, the empty block.
//
// Each edge is stated as the bytes Ink's output layer writes for it, and each
// is also held against the tokeniser's serialiser — so the row says what the
// form is, and the reference says the statement is true of Ink and not only of
// the normaliser.
import { describe, expect, it } from "vitest";
import { styledCharsFromTokens, styledCharsToString, tokenize } from "@alcalzone/ansi-tokenize";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import type { Block, Probe } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition, RenderContextInput } from "../../src/presentation/blocks/index.js";
import { elementOf, rows } from "../../src/presentation/blocks/paint.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { normaliseRow, placeRows } from "../../src/presentation/rows.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { TEST_KINDS, twin } from "../support/lifted.js";
import { DARK_THEME, FULL_CAPS, registry } from "../support/render.js";
import { InkOracle, oracleName } from "../support/ink-oracle.js";

const oracle = new InkOracle("edge-rows");

/** The element arm as `render-lines` ran it for every block before C09 I72: a sentinel row below, then split. */
function throughInk(element: Parameters<typeof renderToString>[0], width: number): readonly string[] {
  const painted = renderToString(
    createElement(Box, { flexDirection: "column" }, element, createElement(Text, { key: "sentinel" }, ".")),
    { columns: width },
  );
  const lines = painted.split("\n");
  return lines.slice(0, Math.max(0, lines.length - 1)); // cells-ok — rows, not columns
}

const reference = (row: string): string =>
  styledCharsToString(styledCharsFromTokens(tokenize(row))).trimEnd();

/** The stated form, and the reference agreeing that it is Ink's. */
function holds(row: string, form: string): void {
  expect(normaliseRow(row), JSON.stringify(row)).toBe(form);
  expect(reference(row), `the reference for ${JSON.stringify(row)}`).toBe(form);
}

describe("C09 I72 — rows at the edges", () => {
  it("T3.88 (C09 I72): an SGR-only row normalises to empty, an OSC control is dropped, styled trailing blanks stay with their closing codes, plain ones go, a wide character keeps its cells, and rows([]) is one empty row in the frame", () => {
    // SGR with nothing visible: no character to carry the state, so nothing is written.
    holds("\x1b[31m\x1b[1m\x1b[0m", "");
    holds("\x1b[38;5;196m", "");
    // An OSC control — a title, here — is not a style and is not text.
    holds("a\x1b]0;title\x07b", "ab");
    holds("a\x1b]2;t\x1b\\b", "ab");
    // Styled trailing blanks are cells with a state, and the state closes after them.
    holds("ab\x1b[41m  \x1b[0m", "ab\x1b[41m  \x1b[49m");
    holds("ab\x1b[1m\x1b[31m  ", "ab\x1b[1m\x1b[31m  \x1b[39m\x1b[22m");
    // Plain trailing blanks are trimmed, whatever closed before them.
    holds("ab   ", "ab");
    holds("\x1b[32mab\x1b[0m   ", "\x1b[32mab\x1b[39m");
    // A wide character is copied whole; the state around it is unchanged.
    holds("\x1b[32m日本\x1b[0m x", "\x1b[32m日本\x1b[39m x");
    holds("한\x1b[4m글\x1b[24m", "한\x1b[4m글\x1b[24m");
    // The reset closes every open code at once, in the order the tokeniser undoes them.
    holds("\x1b[1m\x1b[4m\x1b[31mx\x1b[0my", "\x1b[1m\x1b[4m\x1b[31mx\x1b[39m\x1b[24m\x1b[22my");
    // A hyperlink is a style: opened before its text and closed after it.
    holds("\x1b]8;;https://x.test\x07link\x1b]8;;\x07 tail", "\x1b]8;;https://x.test\x07link\x1b]8;;\x07 tail\x1b]8;;\x07");

    // `rows([])` is one empty row — C09 I14's floor — and it is one row in the frame
    // on both arms.
    const empty: BlockDefinition = {
      kind: "empty-rows",
      measure: () => 1,
      render: () => rows([]),
    } as unknown as BlockDefinition;
    const inked: BlockDefinition = {
      kind: "one-text",
      measure: () => 1,
      render: () => createElement(Text, null, " "),
    } as unknown as BlockDefinition;
    const r = registry([empty, inked]);
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    expect(renderToLines(r, { kind: "empty-rows", id: "e" } as unknown as Block, 20, options)).toEqual([""]);
    expect(renderToLines(r, { kind: "one-text", id: "t" } as unknown as Block, 20, options)).toEqual([""]);
  });
  it("T3.89 (C09 I73): a group with a mosaic child composes elements and the probe reads react; placeRows declines a row wider than its cell and composeRow an overlap; a row group with a short child is the tallest child's height with the short cell blank below, and a panel whose body answers more rows than measured extends below the rails — each equal to the element path through Ink", () => {
    const r = registry(TEST_KINDS);
    const B = (spec: Record<string, unknown>): Block => spec as unknown as Block;
    const both = (b: Block, width: number): { got: readonly string[]; expected: readonly string[]; names: string[] } => {
      const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 };
      const expected = oracle.rows(oracleName(`${b.kind}-${b.id}`, "full", width), () =>
        throughInk(elementOf(r.render(twin(b), ctx)), width),
      );
      const names: string[] = [];
      const probe: Probe = { ...NO_PROBE, on: true, span: (name: string) => { names.push(name); return NO_SPAN; } };
      const got = renderToLines(r, b, width, { theme: DARK_THEME, capabilities: FULL_CAPS, probe });
      return { got, expected, names };
    };
    // **An element child.** Since I73 reached `mosaic` no kind C09 ships answers
    // an element, so the fallback's only constructor is a registered kind that
    // does — `lifted`, which wraps its child's rows back into an element. A row
    // asserting a fallback needs something able to reach it, and the previous
    // subject (a mosaic) stopped being one in the same commit that moved it.
    const withElement = B({ kind: "group", id: "g-element", direction: "column", children: [ONE_PER_KIND.notice, B({ kind: "lifted", id: "lf", inner: ONE_PER_KIND.notice })] });
    const m = both(withElement, 60);
    expect(m.got).toEqual(m.expected);
    expect(m.names.filter((n) => n === "react")).toHaveLength(1);
    expect(m.names.filter((n) => n === "rows")).toHaveLength(0);
    // **The declines**: a row wider than its cell, and two pieces overlapping.
    expect(placeRows([{ x: 0, top: 0, width: 2, rows: ["abc"] }], 1)).toBeNull();
    expect(placeRows([{ x: 0, top: 0, width: 3, rows: ["abc"] }, { x: 2, top: 0, width: 3, rows: ["def"] }], 1)).toBeNull();
    expect(placeRows([{ x: 0, top: 0, width: 3, rows: ["abc"] }, { x: 4, top: 1, width: 3, rows: ["def"] }], 2)).toEqual(["abc", "    def"]);
    // **One placed child wider than the group.** `placeable` keeps at least one
    // child however narrow the group is, so a fixed `{cells: 50}` share at a
    // width of 20 places a cell the group has no room for — the only
    // construction that reaches what used to be a decline to Ink, and one that
    // **no assertion built** while the row's text claimed it: the decline fired
    // zero times across the whole suite and every golden (F1210). Ink cut the
    // child's row at the group's edge and drew nothing for the cell starting
    // past it, and the capture is that answer.
    const over = B({ kind: "group", id: "g-over", direction: "row", flex: [{ cells: 50 }, 1], children: [
      B({ kind: "raw", id: "ov-w", text: "W".repeat(50) }),
      B({ kind: "raw", id: "ov-t", text: "t1\nt2\nt3\nt4\nt5" }),
    ] });
    const o = both(over, 20);
    expect(o.got).toEqual(o.expected);
    expect(o.got, "the over-wide child is cut at the group's edge").toEqual(["W".repeat(20)]);
    expect(o.names.filter((n) => n === "react"), "and it composes rows rather than declining").toHaveLength(0);

    // **A short child**: measured three, answered one.
    const short = B({ kind: "group", id: "g-short", direction: "row", flex: [1, 1], children: [B({ kind: "short", id: "sh" }), B({ kind: "raw", id: "tall", text: "a\nb\nc" })] });
    const s = both(short, 40);
    expect(s.got).toEqual(s.expected);
    expect(s.got).toHaveLength(3); // cells-ok — rows
    expect(s.got[1], "the short cell is blank below its row").toMatch(/^\s+b$/u);
    // **An over-tall body**: measured one, answered three; the rails stop at one.
    const tall = B({ kind: "panel", id: "p-tall", title: "T", children: [B({ kind: "tall", id: "tl" })] });
    const p = both(tall, 20);
    expect(p.got).toEqual(p.expected);
    expect(p.got).toHaveLength(5); // cells-ok — top, three body rows, bottom
    expect(p.got[2], "the second body row has no rail").not.toMatch(/[│|]/u);
  });

  it("T3.91 (C09 I73, F1209): every capture this row asks for is one the tree holds, and no other", () => {
    const { asked, committed } = oracle.settle();
    expect(asked.length, "the row asked for captures").toBeGreaterThan(0);
    expect(committed, "committed equals asked").toEqual(asked);
  });
});
