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
import xterm from "@xterm/headless";
import { composeRow, normaliseRow } from "../../src/presentation/rows.js";
import { cells } from "../../src/presentation/text.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS } from "../support/render.js";

/** The row as Ink's `Output.get` writes it: the dependency's own three calls, then the trim. */
const reference = (row: string): string =>
  styledCharsToString(styledCharsFromTokens(tokenize(row))).trimEnd();

/** The intensity codes, which share one close — `22` ends both (F1258). */
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

/**
 * A row as the terminal holds it, a visible character at a time: each
 * character's codes after the tokeniser's reduction, split into its intensity
 * and the rest (C09 I72, F1258). **The reduction is the terminal's meaning where
 * the serialiser is not**: it drops both intensity codes on `22`, which is what
 * a terminal does, and the diff the serialiser writes forgot it.
 */
const readBack = (row: string): readonly Readonly<{ intensity: string; rest: string }>[] =>
  styledCharsFromTokens(tokenize(row)).map((c) => {
    const codes = c.styles.map((st) => st.code).sort();
    return {
      intensity: codes.filter((x) => x === BOLD || x === DIM).join(""),
      rest: `${c.value}\u0000${codes.filter((x) => x !== BOLD && x !== DIM).join("")}`,
    };
  });

/**
 * **One row's verdict against the dependency** (T1.46): the same bytes, or the
 * one correction and nothing else. A row where the two differ must be a row
 * where the serialiser strands an intensity code — its output reads back with
 * less bold or dim than the row painted — while `normaliseRow`'s reads back with
 * exactly the row's, and every other code on every character is the same in the
 * two. So a normaliser that diverged from the tokeniser anywhere else fails
 * here, and so does one that corrected the wrong thing.
 */
function verdict(row: string, got: string): "same" | "corrected" {
  const ref = reference(row);
  if (got === ref) return "same";
  const painted = readBack(row);
  const ours = readBack(got);
  const theirs = readBack(ref);
  expect(ours.map((c) => c.rest), `outside intensity the bytes read back as Ink's: ${JSON.stringify([row, ref, got])}`).toEqual(
    theirs.map((c) => c.rest),
  );
  expect(ours.map((c) => c.intensity), `the correction reads back as painted: ${JSON.stringify([row, got])}`).toEqual(
    painted.slice(0, ours.length).map((c) => c.intensity),
  );
  expect(
    theirs.some((c, i) => c.intensity !== painted[i]?.intensity),
    `and Ink's did not — a divergence with nothing to correct: ${JSON.stringify([row, ref])}`,
  ).toBe(true);
  return "corrected";
}

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
  it("T1.46 (C09 I72, F1258): normaliseRow equals the tokeniser's serialiser byte for byte, but for re-opening an intensity code a shared 22 closed, over every corpus row at four widths under three capability sets, ten thousand seeded rows of random text and SGR and two thousand dense in the intensity codes", () => {
    // **This row pinned the defect, and it was the equality that did it**
    // (F1258). It held `normaliseRow` to Ink's serialiser byte for byte, and
    // Ink's `diffAnsiCodes` closes a dim run inside a bold one with `22` and
    // never re-opens the bold — so the equality was what kept the copy
    // faithful to the bug. It now asserts the terminal's meaning where the two
    // part, and Ink's bytes everywhere else (`verdict` above).
    const registry = createBlockRegistry();
    const blocks = [...Object.values(ONE_PER_KIND), ...CORPUS];
    let corpusRows = 0;
    let corpusMoved = 0; // rows the normaliser changed — the fixture responding, not merely agreeing
    let styled = 0;
    let corpusCorrected = 0;
    for (const block of blocks) {
      for (const width of WIDTHS) {
        for (const capabilities of CAPS) {
          const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
          const rendered = registry.render(block, ctx);
          if (!Array.isArray(rendered)) continue;
          for (const row of rendered as readonly string[]) {
            const got = normaliseRow(row);
            if (verdict(row, got) === "corrected") corpusCorrected += 1;
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
    // **No block in the corpus paints a bold run through a dim one**, measured
    // when F1258 landed: the block corpus is byte-identical to Ink's.
    expect(corpusCorrected, "block-corpus rows the correction moved").toBe(0);

    const rand = lcg(0x5eed_c09);
    let fuzzMoved = 0;
    let fuzzCorrected = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const row = seededRow(rand);
      const got = normaliseRow(row);
      if (verdict(row, got) === "corrected") fuzzCorrected += 1;
      if (got !== row) fuzzMoved += 1;
    }
    expect(fuzzMoved).toBeGreaterThan(5000);

    // **The seeded corpus never builds the case** — measured: none of its ten
    // thousand rows holds `1` and `2` on one character and `1` alone on the
    // next, which takes `22` then a re-opened code between them. So a corpus
    // dense in the intensity codes is what shows the correction responds:
    // without it the row would pass with the fix reverted.
    const dense = lcg(0x1d_22);
    const INTENSE = ["0", "1", "2", "22", "31", "39", "1;2", "2;1"];
    let denseCorrected = 0;
    for (let i = 0; i < 2000; i += 1) {
      let row = "";
      const n = 2 + Math.floor(dense() * 10);
      for (let j = 0; j < n; j += 1) row += dense() < 0.5 ? `${ESC}[${pick(dense, INTENSE)}m` : pick(dense, ["a", "b"]);
      if (verdict(row, normaliseRow(row)) === "corrected") denseCorrected += 1;
    }
    expect(fuzzCorrected, "random seeded rows the correction moved").toBe(0);
    expect(denseCorrected, "intensity-dense rows the correction moved").toBeGreaterThan(0);
  });

  it("T1.85 (C09 I72, F1258): {bold, dim} then {bold} re-opens the bold after the shared 22, and {bold, dim} then {dim} the dim; the terminal reads every cell back as painted", async () => {
    // F1258's own row: a `{bold, dim}` span, then `{bold}` spans, as `paint`
    // writes them — each its own sequence and reset.
    const boldBeside = `${ESC}[1;2m18${ESC}[0m${ESC}[1m ${ESC}[0m${ESC}[1mctx${ESC}[0m`;
    expect(normaliseRow(boldBeside), "the bold re-opened after the shared 22").toBe(
      `${ESC}[1m${ESC}[2m18${ESC}[22m${ESC}[1m ctx${ESC}[22m`,
    );
    // Ink's bytes, which the row above no longer equals — the defect, kept in
    // view so the difference is one code and that code.
    expect(reference(boldBeside)).toBe(`${ESC}[1m${ESC}[2m18${ESC}[22m ctx${ESC}[22m`);
    const dimBeside = `${ESC}[1;2m18${ESC}[0m${ESC}[2m ctx${ESC}[0m`;
    expect(normaliseRow(dimBeside), "the dim re-opened after the shared 22").toBe(
      `${ESC}[1m${ESC}[2m18${ESC}[22m${ESC}[2m ctx${ESC}[22m`,
    );
    // **The control**: dim then bold closes the dim and opens the bold, which
    // Ink already wrote — the correction changes no byte of it.
    const dimThenBold = `${ESC}[2m18${ESC}[0m${ESC}[1m ctx${ESC}[0m`;
    expect(normaliseRow(dimThenBold)).toBe(reference(dimThenBold));

    // **And the terminal's reading, a cell at a time** — F1258 was found this
    // way and the bytes above are a claim about it.
    const cellsOf = async (bytes: string): Promise<string> => {
      const term = new xterm.Terminal({ cols: 20, rows: 1, allowProposedApi: true });
      await new Promise<void>((done) => term.write(bytes, done));
      const line = term.buffer.active.getLine(0);
      let out = "";
      for (let x = 0; x < 6; x += 1) {
        const cell = line?.getCell(x);
        out += `${cell?.getChars() || " "}:${cell?.isBold() ? "B" : "-"}${cell?.isDim() ? "D" : "-"} `;
      }
      term.dispose();
      return out.trim();
    };
    const painted = await cellsOf(boldBeside);
    expect(painted, "the painter's own bytes").toBe("1:BD 8:BD  :B- c:B- t:B- x:B-");
    expect(await cellsOf(normaliseRow(boldBeside)), "the normalised row reads back as painted").toBe(painted);
    expect(await cellsOf(reference(boldBeside)), "Ink's did not").toBe("1:BD 8:BD  :-- c:-- t:-- x:--");
    expect(await cellsOf(normaliseRow(dimBeside))).toBe(await cellsOf(dimBeside));
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
    // **An overlap is cut, not declined and not overwritten** (F1210, F1211).
    // This returned `null` and the frame fell through to Ink, which overwrote;
    // the arm that answered is deleted, so the composer is total and the later
    // piece keeps only the cells past the cursor. A piece wholly behind it
    // contributes nothing — the only caller this decline ever had was this line
    // (F1210), which is why the behaviour is stated here rather than inferred
    // from a frame.
    expect(composeRow([{ x: 0, row: "abc" }, { x: 1, row: "|" }])).toBe("abc");
    expect(composeRow([{ x: 0, row: "abc" }, { x: 1, row: "||||" }])).toBe("abc||");
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
