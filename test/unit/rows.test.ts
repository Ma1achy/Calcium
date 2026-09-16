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
import { composeRow, normaliseRow } from "../../src/presentation/rows.js";
import { cells } from "../../src/presentation/text.js";
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
  "⠿", "│", "▄", "→", // the rasterised alphabets — swallowed answers without the segmenter (C09 I74)
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
  it("T1.47 (C09 I73): composeRow pads from where the row ends — cells of the tokeniser's visible characters — over every corpus row and ten thousand seeded rows, and a wide character ends two cells on, a combining mark none, an SGR-only row at zero", () => {
    // **The width is read through the pad**: a second piece at a known column
    // makes the pad `x − rowCells(row)` spaces, and `rowCells` is what the
    // composition rests on. The visible text is the tokeniser's own reading —
    // its characters joined — measured by `cells`, narrow for the ambiguous as
    // `string-width` is.
    const visible = (row: string): string => styledCharsFromTokens(tokenize(row)).map((c) => c.value).join("");
    const check = (row: string, label: string): void => {
      const norm = normaliseRow(row);
      const w = cells(visible(norm));
      const x = w + 3;
      const got = composeRow([{ x: 0, row }, { x, row: "|" }]);
      const expected = norm === "" ? `${" ".repeat(x)}|` : `${norm}   |`;
      expect(got, `${label}: ${JSON.stringify(row)}`).toBe(normaliseRow(expected));
    };
    const registry = createBlockRegistry();
    const blocks = [...Object.values(ONE_PER_KIND), ...CORPUS];
    let corpusRows = 0;
    for (const block of blocks) {
      for (const width of WIDTHS) {
        for (const capabilities of CAPS) {
          const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
          const rendered = registry.render(block, ctx);
          if (!Array.isArray(rendered)) continue;
          for (const row of rendered as readonly string[]) {
            check(row, `${block.kind} at ${String(width)}`);
            corpusRows += 1;
          }
        }
      }
    }
    expect(corpusRows).toBeGreaterThan(800);
    const rand = lcg(0x5eed_c09_47);
    for (let i = 0; i < 10_000; i += 1) check(seededRow(rand), `seeded row ${String(i)}`);
    // The named widths.
    expect(composeRow([{ x: 0, row: "日" }, { x: 2, row: "|" }])).toBe("日|");
    expect(composeRow([{ x: 0, row: "e\u0301" }, { x: 1, row: "|" }])).toBe("e\u0301|");
    expect(composeRow([{ x: 0, row: `${ESC}[31m${ESC}[39m` }, { x: 0, row: "|" }])).toBe("|");
    // Overlap declines: the grid overwrites and this does not.
    expect(composeRow([{ x: 0, row: "abc" }, { x: 1, row: "|" }])).toBeNull();
  });
});

describe("C09 I75 — the rows arm reads parameters in place and reuses its state lists", () => {
  /** `Set` constructions and `split` calls during `fn`, counted through the globals and restored whatever happens. */
  const counted = (fn: () => void): { sets: number; splits: number } => {
    const RealSet = globalThis.Set;
    const realSplit = String.prototype.split;
    let sets = 0; let splits = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Set = function CountingSet(this: unknown, ...args: unknown[]) { sets += 1; return new (RealSet as any)(...args); } as any;
    (globalThis as any).Set.prototype = RealSet.prototype;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (String.prototype as any).split = function (this: string, ...args: unknown[]) { splits += 1; return (realSplit as any).apply(this, args); };
    try { fn(); } finally { globalThis.Set = RealSet; String.prototype.split = realSplit; }
    return { sets, splits };
  };
  const tc = (i: number): string => `${ESC}[38;2;${String(i % 256)};${String((i * 7) % 256)};${String((i * 13) % 256)}m`;
  const c256 = (i: number): string => `${ESC}[48;5;${String(i % 256)}m`;
  it("T1.50 (C09 I75, F1180): a plot-shaped row of eighty truecolour cells, and its 256-colour, compound and empty-parameter kin, normalise to the tokeniser's serialiser with no Set constructed and split never called", () => {
    const rows: string[] = [];
    let plot = ""; for (let i = 0; i < 80; i += 1) plot += `${tc(i)}⠿`; rows.push(`${plot}${ESC}[0m`);
    let bg = ""; for (let i = 0; i < 80; i += 1) bg += `${c256(i)} `; rows.push(`${bg}${ESC}[49m`);
    let compound = ""; for (let i = 0; i < 40; i += 1) compound += `${ESC}[1;38;2;${String(i)};0;${String(255 - i)};4m▄${ESC}[22;24m`; rows.push(compound);
    rows.push(`${ESC}[1;m x ${ESC}[;31mred${ESC}[38;5;m?${ESC}[38;2;1;2m?${ESC}[m`);
    rows.push(`${ESC}]8;;https://example.test/a\x07link${ESC}]8;;\x07 ${ESC}[31m${ESC}[32mgreen${ESC}[0m   `);
    for (const row of rows) {
      let got = "";
      const n = counted(() => { got = normaliseRow(row); });
      expect(got, JSON.stringify(row).slice(0, 80)).toBe(reference(row));
      expect(n.sets, `no Set constructed for ${JSON.stringify(row).slice(0, 40)}`).toBe(0);
      expect(n.splits, `split never called for ${JSON.stringify(row).slice(0, 40)}`).toBe(0);
    }
    // **The counter responds to its subject**: the reference's own path splits and builds sets.
    const control = counted(() => { reference(rows[0] as string); });
    expect(control.sets + control.splits, "the tokeniser's path is seen by the counters").toBeGreaterThan(0);
    // Reported, not gated: the seeded corpus, where a mark after a sequence still segments.
    const rand = lcg(0x5eed_c09_75);
    let sets = 0; let splits = 0;
    for (let i = 0; i < 2000; i += 1) { const r = seededRow(rand); const c = counted(() => { normaliseRow(r); }); sets += c.sets; splits += c.splits; }
    expect(sets).toBe(0);
    expect(splits).toBe(0);
  });
});
