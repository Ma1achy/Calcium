/**
 * S1's banner — the whale and the wordmark.
 *
 * A `raw` block above the dashboard panel, chosen at document-build time.
 * **It is chrome: it must never cost the dashboard its density**, which is the
 * one thing the frame-read checks.
 *
 * Three things are the app's job at build time, and `DOCKER_TUI_BANNER.md`
 * carries why. All three are asserted in `test/banner.test.ts` against the
 * document itself, so the art here and the art there cannot drift:
 *
 * - **No tab characters.** A tab is one cell to `cells()` and advances the
 *   terminal to its next stop — eight columns, or whatever it is set to. So
 *   measurement and rendering disagree *and the disagreement varies by machine*.
 *   This project's own defect class, arriving inside the art.
 * - **The whale is trimmed and padded to 40.** Two operations, not one: its
 *   content runs to 40 and its trailing whitespace runs to 43, so padding alone
 *   would leave three rows wider than the rest and the wordmark would start at a
 *   different column on each.
 * - **The wordmark's top pad is already in the document.** Eight rows, the first
 *   blank, seven of content. The app must **not strip it** — a build step that
 *   trimmed blank lines would silently undo a padding its author believed had
 *   been applied, and adding one would produce nine.
 */

import { cells } from "@fmx/calcium";
import type { Block } from "@fmx/calcium";

/** Columns between the whale and the wordmark. Four reads well; two is tight. */
const GAP = 4;

/** The whale's stored width, and the column the wordmark starts at. */
const WHALE_CELLS = 40;

/**
 * The whale — pure ASCII, so it needs no depth variant.
 *
 * Stored **as written**, and normalised by `pad` below rather than by hand: a
 * constant that is already padded is a constant somebody will re-indent.
 */
const WHALE = [
  "                    ##        .",
  "              ## ## ##       ==",
  "           ## ## ## ##      ===",
  '       /""""""""""""""""\\___/ ===',
  "  ~~~ {~~ ~~~~ ~~~ ~~~~ ~~ ~ /  ===- ~~~",
  "       \\______ o          __/",
  "         \\    \\        __/",
  "          \\____\\______/",
];

/**
 * The wordmark in block elements — `▄ ▀ █`.
 *
 * **The leading blank row is load-bearing** and is the top pad that puts the
 * wordmark's baseline on the whale's hull rather than its spout. Eight entries,
 * seven of content.
 */
const WORDMARK_BLOCKS = [
  "",
  " ▄▄▄▄▄                         ▄▄",
  " ██▀▀▀██                       ██",
  " ██    ██   ▄████▄    ▄█████▄  ██ ▄██▀    ▄████▄    ██▄████",
  " ██    ██  ██▀  ▀██  ██▀    ▀  ██▄██     ██▄▄▄▄██   ██▀",
  " ██    ██  ██    ██  ██        ██▀██▄    ██▀▀▀▀▀▀   ██",
  " ██▄▄▄██   ▀██▄▄██▀  ▀██▄▄▄▄█  ██  ▀█▄   ▀██▄▄▄▄█   ██",
  " ▀▀▀▀▀       ▀▀▀▀      ▀▀▀▀▀   ▀▀   ▀▀▀    ▀▀▀▀▀    ▀▀",
];

/**
 * The ASCII wordmark, and **the app carries it rather than the framework**.
 *
 * Step 1's em-dash finding, one layer up: capability substitution covers glyphs
 * the *framework* picks, not text an *adapter* supplies. `▄▀█` in a `raw` block
 * pass through untouched and render as garbage on a terminal that cannot show
 * them, so choosing is the app's job. Recorded as the correct app-side answer
 * rather than mistaken for a framework gap.
 *
 * Five rows against the whale's eight, so it is **bottom-aligned** — the pad
 * goes on top, which is the same reasoning as the block wordmark's single row.
 */
const WORDMARK_ASCII = [
  " ____             _",
  "|  _ \\  ___   ___| | _____ _ __",
  "| | | |/ _ \\ / __| |/ / _ \\ '__|",
  "| |_| | (_) | (__|   <  __/ |",
  "|____/ \\___/ \\___|_|\\_\\___|_|",
];

/** Trim, then pad — two operations, and the trim is the one easy to forget. */
const pad = (line: string, width: number): string => {
  const trimmed = line.replace(/\s+$/u, "");
  return trimmed + " ".repeat(Math.max(0, width - cells(trimmed)));
};

/** Top-pad to `rows`, so a shorter column sits on the whale's baseline. */
const alignBottom = (lines: readonly string[], rows: number): readonly string[] => [
  ...Array.from({ length: Math.max(0, rows - lines.length) }, () => ""),
  ...lines,
];

const compose = (right: readonly string[]): readonly string[] => {
  const rows = Math.max(WHALE.length, right.length);
  const rightRows = alignBottom(right, rows);
  return Array.from({ length: rows }, (_, i) =>
    // The left column is padded so the right one starts at the same column on
    // every row; the composed row is then right-trimmed, because trailing space
    // costs cells in a measured block and shows in nothing.
    `${pad(WHALE[i] ?? "", WHALE_CELLS)}${" ".repeat(GAP)}${rightRows[i] ?? ""}`.replace(/\s+$/u, ""),
  );
};

const widthOf = (lines: readonly string[]): number =>
  lines.reduce((n, l) => Math.max(n, cells(l)), 0);

/**
 * The variants, widest first — **and the tier threshold is each variant's own
 * width rather than a constant.**
 *
 * `DOCKER_TUI_BANNER.md`'s table gives one set of thresholds (≥103 composed,
 * 80–102 whale alone, <80 nothing), which is right for the block-element
 * wordmark and wrong for the ASCII one: whale + ASCII wordmark is **76 cells**,
 * so it fits comfortably inside the tier the table reserves for the whale alone.
 * Measured while building it; a fixed 103 would have shown a lone whale on an
 * 80-column ASCII terminal with room for the name beside it.
 */
type Variant = Readonly<{ name: string; lines: readonly string[]; blocks: boolean }>;

const VARIANTS: readonly Variant[] = [
  { name: "wide-blocks", lines: compose(WORDMARK_BLOCKS), blocks: true },
  { name: "wide-ascii", lines: compose(WORDMARK_ASCII), blocks: false },
  { name: "whale", lines: WHALE.map((l) => pad(l, WHALE_CELLS).replace(/\s+$/u, "")), blocks: false },
];

/** Exported for the tests and the tier table — the four the document names. */
export const variants = (): readonly Readonly<{
  name: string;
  rows: number;
  width: number;
  blocks: boolean;
}>[] => VARIANTS.map((v) => ({ name: v.name, rows: v.lines.length, width: widthOf(v.lines), blocks: v.blocks }));

/** Below this there is no art at all — the title line S1 already has. */
export const FLOOR = 40;

/**
 * The widest variant that fits, or `null`.
 *
 * `blocks` is whether the terminal can draw `▄ ▀ █`. **The app decides**, because
 * `detectCapabilities` is not exported and a local handler is given no
 * capabilities at all (FINDINGS F43) — the third instance of the framework
 * holding a fact the consumer needs and not offering it.
 */
export function bannerLines(width: number, blocks: boolean): readonly string[] | null {
  for (const v of VARIANTS) {
    if (v.blocks && !blocks) continue;
    if (widthOf(v.lines) <= width) return v.lines;
  }
  return null;
}

export function banner(width: number, blocks: boolean): Block | null {
  const lines = bannerLines(width, blocks);
  if (lines === null || width < FLOOR) return null;
  return { kind: "raw", id: "banner", text: lines.join("\n") } as Block;
}

/**
 * The same banner as a **row group**, which is what roadmap 38 exists to make
 * possible (C04 I44).
 *
 * **The whale declares its cells and the wordmark takes what is left.** A
 * proportion cannot express this — `40 : 61` gives the whale 41 columns at 105
 * and 47 at 120, so the gap between the two arts widens with the terminal — and
 * `{cells: 43}` is the whale's 40 plus the 4-column gap this file chose, less
 * the one cell of gutter the container puts between every pair.
 *
 * **What the framework now does that this file did by hand**: padding every
 * whale row to a uniform width, which `pad` did and the renderer's `fit` does;
 * and holding the two arts in one block without either of them knowing the
 * other's width.
 *
 * What is still the app's: the **wordmark's leading blank row**, which is a
 * vertical alignment a row group has no opinion about (a short child sits at the
 * top), and the variant choice, which is this file's own tiering.
 */
export function bannerRow(width: number, blocks: boolean): Block | null {
  if (width < FLOOR) return null;
  const wordmark = wordmarkFor(width, blocks);
  if (wordmark === null) return null;

  return {
    kind: "group",
    id: "banner",
    direction: "row",
    children: [
      { kind: "raw", id: "banner-whale", text: WHALE.join("\n") },
      { kind: "raw", id: "banner-wordmark", text: wordmark.join("\n") },
    ],
    flex: [{ cells: WHALE_CELLS + GAP - 1 }, 1],
  } as Block;
}

/** The wordmark the composed variant at this width would use, or `null`. */
function wordmarkFor(width: number, blocks: boolean): readonly string[] | null {
  for (const v of VARIANTS) {
    if (v.blocks && !blocks) continue;
    if (widthOf(v.lines) > width) continue;
    if (v.name === "wide-blocks") return WORDMARK_BLOCKS;
    if (v.name === "wide-ascii") return WORDMARK_ASCII;
    return null;
  }
  return null;
}
