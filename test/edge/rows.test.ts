// C09 I72 — the rows arm at its edges: SGR-only rows, OSC controls, styled and plain trailing blanks, wide characters, the empty block.
//
// Each edge is stated as the bytes Ink's output layer writes for it, and each
// is also held against the tokeniser's serialiser — so the row says what the
// form is, and the reference says the statement is true of Ink and not only of
// the normaliser.
import { describe, expect, it } from "vitest";
import { styledCharsFromTokens, styledCharsToString, tokenize } from "@alcalzone/ansi-tokenize";
import { Text } from "ink";
import { createElement } from "react";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { rows } from "../../src/presentation/blocks/paint.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { normaliseRow } from "../../src/presentation/rows.js";
import { DARK_THEME, FULL_CAPS, registry } from "../support/render.js";

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
});
