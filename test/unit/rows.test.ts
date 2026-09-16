// C09 I72 — the rows arm's normaliser against the tokeniser's own serialiser.
//
// **The reference is the dependency Ink's output layer uses**, called the way
// Ink calls it: `tokenize`, `styledCharsFromTokens`, `styledCharsToString`,
// then `trimEnd`. `normaliseRow` is a second implementation of that form, and a
// second implementation is verified by the first over inputs neither author
// chose — the block corpus's own rows, and ten thousand seeded rows that carry
// every SGR shape the row lists, compound and empty and unknown, wide and
// combining text, a hyperlink, and trailing blanks styled and plain.
import { describe, expect, it } from "vitest";
import { styledCharsFromTokens, styledCharsToString, tokenize } from "@alcalzone/ansi-tokenize";
import { normaliseRow } from "../../src/presentation/rows.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS } from "../support/render.js";

/** The row as Ink's `Output.get` writes it: the dependency's own three calls, then the trim. */
const reference = (row: string): string =>
  styledCharsToString(styledCharsFromTokens(tokenize(row))).trimEnd();

const WIDTHS = [20, 40, 80, 120] as const;
const CAPS = [FULL_CAPS, ASCII_CAPS, MONO_CAPS] as const;

/** A small deterministic generator — the corpus is the seed, not the run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const pick = <T>(rand: () => number, from: readonly T[]): T => from[Math.floor(rand() * from.length)] as T;

const ESC = "\x1b";
const SIMPLE_PARAMS = [
  "0", "1", "2", "3", "4", "7", "9", "22", "23", "24", "27", "29",
  "30", "31", "32", "33", "34", "35", "36", "37", "39",
  "40", "41", "42", "43", "44", "45", "46", "47", "49",
  "90", "91", "92", "93", "94", "95", "96", "97",
  "100", "101", "102", "103", "104", "105", "106", "107",
  "5", // unknown to the table: closes with `0`
];
const EXTENDED = (rand: () => number): string => {
  const ground = rand() < 0.5 ? "38" : "48";
  if (rand() < 0.5) return `${ground};5;${String(Math.floor(rand() * 256))}`;
  const c = (): string => String(Math.floor(rand() * 256));
  return `${ground};2;${c()};${c()};${c()}`;
};
const sgrOf = (rand: () => number): string => {
  const r = rand();
  if (r < 0.06) return `${ESC}[m`; // empty — a style to the tokeniser, not a reset
  if (r < 0.3) return `${ESC}[${EXTENDED(rand)}m`;
  if (r < 0.55) {
    // compound: one to three parts, extended ones among them
    const n = 1 + Math.floor(rand() * 3);
    const parts: string[] = [];
    for (let i = 0; i < n; i += 1) parts.push(rand() < 0.3 ? EXTENDED(rand) : pick(rand, SIMPLE_PARAMS));
    return `${ESC}[${parts.join(";")}m`;
  }
  return `${ESC}[${pick(rand, SIMPLE_PARAMS)}m`;
};
const TEXT = [
  "a", "bc", "def", "ghij", " ", "  ", "x y", "—", "…",
  "日本", "語", "한", "👍", "🇬🇧",
  "é", "äb", "́x", "̈", "‍", "z️",
  "\t", "[", "m", ";", "5", "\x1b", "\x1b[", "\x1b[31", "\x1b]",
];
const CONTROLS = [
  `${ESC}]0;title\x07`,
  `${ESC}]2;t\x9c`,
  `${ESC}]1;x${ESC}\\`,
  `${ESC}]8;nolink\x07`, // a link prefix with no second `;` — an OSC control, dropped
];
const LINKS = [
  `${ESC}]8;;https://example.test/a\x07`,
  `${ESC}]8;id=1;https://example.test/b${ESC}\\`,
  `${ESC}]8;;\x07`,
  `${ESC}]8;;${ESC}\\`,
];

function seededRow(rand: () => number): string {
  const n = 1 + Math.floor(rand() * 12);
  let row = "";
  for (let i = 0; i < n; i += 1) {
    const r = rand();
    if (r < 0.45) row += sgrOf(rand);
    else if (r < 0.5) row += pick(rand, CONTROLS);
    else if (r < 0.56) row += pick(rand, LINKS);
    else row += pick(rand, TEXT);
  }
  // trailing blanks, styled or plain, on a third of the rows
  const t = rand();
  if (t < 0.15) row += "   ";
  else if (t < 0.3) row += `${sgrOf(rand)}  ${ESC}[0m`;
  else if (t < 0.36) row += `${sgrOf(rand)}  `;
  return row;
}

describe("C09 I72 — normaliseRow", () => {
  it("T1.46 (C09 I72): normaliseRow equals the tokeniser's serialiser byte for byte over every corpus row at four widths under three capability sets and over ten thousand seeded rows of random text and SGR", () => {
    const registry = createBlockRegistry();
    const blocks = [...Object.values(ONE_PER_KIND), ...CORPUS];
    let corpusRows = 0;
    let corpusMoved = 0; // rows the normaliser changed — the fixture responding, not merely agreeing
    let styled = 0;
    for (const block of blocks) {
      for (const width of WIDTHS) {
        for (const capabilities of CAPS) {
          const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
          const rendered = registry.render(block, ctx);
          if (!Array.isArray(rendered)) continue;
          for (const row of rendered as readonly string[]) {
            const got = normaliseRow(row);
            expect(got, `${block.kind} at ${String(width)}: ${JSON.stringify(row)}`).toBe(reference(row));
            corpusRows += 1;
            if (got !== row) corpusMoved += 1;
            if (row.includes(ESC)) styled += 1;
          }
        }
      }
    }
    // The corpus holds rows the form changes, and rows carrying SGR at all —
    // an agreement over unstyled text would test the copy and not the state.
    // Measured 2026-09-16: 918 rows, 496 carrying SGR, 568 changing form — the
    // plain ones by a trailing pad trimmed, the styled ones by their closers.
    expect(corpusRows).toBeGreaterThan(800);
    expect(styled).toBeGreaterThan(400);
    expect(corpusMoved).toBeGreaterThan(400);

    const rand = lcg(0x5eed_c09);
    let fuzzMoved = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const row = seededRow(rand);
      const got = normaliseRow(row);
      expect(got, `seeded row ${String(i)}: ${JSON.stringify(row)}`).toBe(reference(row));
      if (got !== row) fuzzMoved += 1;
    }
    expect(fuzzMoved).toBeGreaterThan(5000);
  });
});
