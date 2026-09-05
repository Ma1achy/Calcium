// C22 §6l — the frame's default look (I80–I83), and the footer that follows
// its content. Roadmap entry 29's second answer: §6k made the footer a declared
// budget, and the reader's ruling is that the footer is as tall as its blocks,
// two rules bound the prompt at every size, and a card's body hangs two cells
// in under the hook.
//
// **Every mutation the run file makes leaves a frame that still sums.** That is
// the point: `heightsSum` compares the frame with itself, so a subtraction that
// uses one number and a painter that uses another agree with each other and
// disagree with the screen. The rows that catch these read the frame (T1.38,
// T3.38) or sweep the footer's height (T1.40) rather than asking the sum
// whether it holds.
import { describe, expect, it } from "vitest";

import { compose, heightsSum, initialRegionHeight, type Composed } from "../../src/shell/frame.js";
import { paint, type PaintDeps } from "../../src/shell/paint.js";
import {
  DEFAULT_FOOTER_ROWS,
  HEADER_ROWS,
  HEADER_RULE_ROWS,
  MAX_FOOTER_ROWS,
  MIN_ROWS,
  RULE_ROWS,
  resolveConfig,
  type Ambient,
} from "../../src/shell/config.js";
import { clusterCells, foldHome, formatClock, makeDefaultChrome } from "../../src/shell/chrome.js";
import { BODY_INDENT, ENTRY_GAP, HOOK_INDENT, elementsOfEntry, entryLayout, measureEntry, renderEntryPieces, windowEntry } from "../../src/shell/entry-layout.js";
import type { Chrome, SessionSnapshot, TuiConfig } from "../../src/shell/types.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { block } from "../../src/data/viewmodel/index.js";
import { displayCells } from "../../src/presentation/text.js";
import { paint as paintSpans, tone } from "../../src/presentation/blocks/paint.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/home/ada/work",
  env: Object.freeze({ HOME: "/home/ada" }),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});

const NOW = 1_700_000_000_000;

const REGISTRY = createBlockRegistry({ defaults: true });

function frameAt(rows: number, chrome: Chrome, wanted = 1, columns = 80, session = SESSION): Composed {
  return compose({
    chrome,
    session: () => session,
    copyMode: () => false,
    now: () => NOW,
    size: () => ({ columns, rows }),
    promptRows: () => wanted,
    measureSequence: REGISTRY.measureSequence,
  });
}

const notice = (id: string, text: string): Block =>
  block({ kind: "notice", id, tone: "muted", text }); // a chrome fixture, not a surface

/** A chrome whose footer returns `n` one-row notices — `n` rows of content. */
const FOOTER = (n: number): Chrome => ({
  header: () => [],
  footer: () => Array.from({ length: n }, (_, i) => notice(`f${String(i + 1)}`, `footer ${String(i + 1)}`)),
});

function deps(over: Partial<PaintDeps> = {}): PaintDeps {
  return {
    registry: REGISTRY,
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    transcriptRows: () => [],
    promptRows: () => [""],
    spinning: () => false,
    ghost: () => null,
    overlays: () => [],
    promptCursor: () => ({ row: 0, col: 2 }),
    promptSelection: () => [],
    suppressBackground: () => false,
    promptFocused: () => true,
    ...over,
  };
}

const BASE: TuiConfig = {
  name: "t",
  binary: "t",
  manifest: { tools: [] } as unknown as TuiConfig["manifest"],
  theme: {} as TuiConfig["theme"],
};

const AMBIENT: Ambient = {
  clock: () => NOW,
  cwd: "/work",
  fs: {} as Ambient["fs"],
  schedule: () => ({ [Symbol.dispose]: () => undefined }),
  platform: "linux",
};

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
const hasSgr = (s: string): boolean => /\x1b\[[0-9;]*m/.test(s);

describe("C22 §6l — the frame's default look", () => {
  it("T1.35 (C22 I80; I79 retired, §6l.2 row 7): the maximum footer is derived from the gate, the rules and the prompt's cap — three today", () => {
    // **The derivation, not the figure** (§6l.4 C). Three is what the constants
    // give today — four until the header's rule (I87) took a row; the figure
    // moves when `MIN_ROWS` moves and a hand-written `3` would still read as
    // correct the day the gate changed.
    expect(MAX_FOOTER_ROWS).toBe(MIN_ROWS - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - Math.floor(MIN_ROWS / 2) - 1);
    expect(MAX_FOOTER_ROWS, "and the figure, so a reader has it").toBe(3);
    expect(HEADER_ROWS).toBe(1);
    expect(HEADER_RULE_ROWS).toBe(1);
    expect(RULE_ROWS).toBe(2);
    expect(DEFAULT_FOOTER_ROWS).toBe(1);
    // At MIN_ROWS with the prompt at its cap the tallest footer leaves one row.
    expect(frameAt(MIN_ROWS, FOOTER(MAX_FOOTER_ROWS), 200).region.height).toBe(1);
    // **No field to refuse** (§6l.4 F): the resolved chrome is two functions.
    const resolved = resolveConfig(BASE, AMBIENT).chrome;
    expect(Object.keys(resolved).sort()).toEqual(["footer", "header"]);
  });

  it("T1.47 (C22 I87, §6l.7 row 21): a default frame paints a rule on row HEADER_ROWS, byte-identical to the rule above the prompt, and the region starts below it", () => {
    for (const columns of [80, 100, 60]) {
      const f = frameAt(24, makeDefaultChrome("plots-tui", "/usr/local/bin/plots"), 1, columns);
      expect(f.region.top).toBe(HEADER_ROWS + HEADER_RULE_ROWS);
      expect(heightsSum(f)).toBe(true);
      const lines = paint(f, deps());
      expect(lines).toHaveLength(24);
      const headerRule = lines[HEADER_ROWS] ?? "";
      const promptRule = lines[f.region.top + f.region.height] ?? "";
      // **The same row, not a row that looks the same**: a rule of the wrong
      // glyph or tone under the header would read as a third kind of line.
      expect(headerRule, `${String(columns)}: the header's rule is the prompt's`).toBe(promptRule);
      expect(strip(headerRule)).toMatch(/^─+$/);
      expect(displayCells(strip(headerRule))).toBe(columns);
      // The region's first row is content, not the rule.
      expect(strip(lines[f.region.top] ?? "")).not.toMatch(/^─+$/);
    }
  });

  it("T1.36 (C22 I80, I82): the sum holds for every footer height at every size down to the clamp", () => {
    for (let f = 0; f <= MAX_FOOTER_ROWS; f += 1) {
      // The smallest size whose region is non-negative with the prompt at its
      // cap: `rows − 4 − f − ⌊rows/2⌋ ≥ 0`, which is `2f + 7`.
      for (let rows = 2 * f + 7; rows <= 60; rows += 1) {
        for (const wanted of [1, 200]) {
          const frame = frameAt(rows, FOOTER(f), wanted);
          const promptRows = Math.max(1, Math.min(wanted, Math.floor(rows / 2)));
          expect(heightsSum(frame), `f=${String(f)} rows=${String(rows)} wanted=${String(wanted)}`).toBe(true);
          expect(frame.footerRows).toBe(f);
          expect(frame.region.top).toBe(HEADER_ROWS + HEADER_RULE_ROWS);
          expect(frame.region.height).toBe(rows - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - promptRows - f);
          expect(frame.overlayRegion.height, "C22 I28 — one number, not two").toBe(frame.region.height);
        }
      }
    }
    // **The boundary from the other side** (§6l.3 row 6): too short for the
    // chrome plus a capped prompt, the region clamps to 0 and the sum is false,
    // which is what `render-frame.ts` draws the fallback on.
    const short = frameAt(2 * MAX_FOOTER_ROWS, FOOTER(MAX_FOOTER_ROWS), 200);
    expect(short.region.height).toBe(0);
    expect(heightsSum(short)).toBe(false);

    // The design's numbers: 24 rows, a three-line footer, a two-row prompt → 15 (16 before the header's rule, C22 I87).
    expect(frameAt(24, FOOTER(3), 2).region.height).toBe(24 - 1 - 1 - 2 - 2 - 3);
  });

  it("T1.37 (C22 I34, §6l.2 row 8): the pre-frame height guesses one footer row and the first frame corrects it by f − 1", () => {
    const size = { columns: 80, rows: 30 };
    expect(initialRegionHeight(size)).toBe(frameAt(30, FOOTER(1)).region.height);
    expect(initialRegionHeight(size), "the default chrome's footer is one row, so a default session is corrected by nothing").toBe(
      frameAt(30, makeDefaultChrome("t", "t")).region.height,
    );
    // A three-row footer: the guess overstates the region by two; compose
    // overwrites it on the first render, which is C22 I34's whole claim.
    expect(initialRegionHeight(size)).toBe(frameAt(30, FOOTER(3)).region.height + 2);
    // No footer: the guess understates by one.
    expect(initialRegionHeight(size)).toBe(frameAt(30, FOOTER(0)).region.height - 1);
  });

  it("T1.38 (C22 I81): two rules bound the prompt — the `horizontal` glyph across the width, muted at 24-bit, plain at 1-bit, `-` at ascii", () => {
    const f = frameAt(24, FOOTER(1));
    expect(f.region.height).toBe(24 - 1 - 1 - 2 - 1 - 1);
    const lines = paint(f, deps());
    expect(lines).toHaveLength(24);
    const upper = 24 - 1 - 1 - 2; // rows − footer − prompt − 2
    const lower = 24 - 1 - 1; // rows − footer − 1
    expect(strip(lines[upper] ?? "")).toBe("─".repeat(80));
    expect(strip(lines[lower] ?? "")).toBe("─".repeat(80));
    // **The muted tone's own bytes, not merely some SGR** — an accent rule
    // would carry an SGR too (T6.98's mutation), and the spec says muted.
    const muted = paintSpans([{ text: "─".repeat(80), style: tone("muted", DARK_THEME, FULL_CAPS) }]);
    expect(lines[upper], "muted at 24-bit").toBe(muted);
    expect(lines[lower]).toBe(muted);
    expect(hasSgr(muted), "and muted is a real style at 24-bit, so the comparison holds weight").toBe(true);
    expect(strip(lines[upper + 1] ?? ""), "the prompt sits between them").toBe("❯");
    expect(strip(lines[lower + 1] ?? ""), "the footer below the lower rule").toBe("footer 1");
    for (const line of lines) expect(displayCells(line)).toBe(80);

    const mono = paint(f, deps({ capabilities: MONO_UNICODE_CAPS }));
    expect(strip(mono[upper] ?? "")).toBe("─".repeat(80));
    expect(hasSgr(mono[upper] ?? ""), "no SGR at 1-bit — a rule is geometry").toBe(false);
    expect(hasSgr(mono[lower] ?? "")).toBe(false);

    const ascii = paint(f, deps({ capabilities: ASCII_CAPS }));
    expect(strip(ascii[upper] ?? "")).toBe("-".repeat(80));
    expect(strip(ascii[lower] ?? "")).toBe("-".repeat(80));
  });

  it("T1.39 (C22 I81, §6l.2 row 3): a footer returning `[]` is zero rows, and the lower rule is the frame's last row", () => {
    const f = frameAt(24, FOOTER(0));
    expect(f.footerRows).toBe(0);
    expect(f.region.height).toBe(24 - 1 - 1 - 2 - 1);
    const lines = paint(f, deps());
    expect(lines).toHaveLength(24);
    expect(strip(lines[23] ?? ""), "the rule, not a blank").toBe("─".repeat(80));
    expect(strip(lines[22] ?? "")).toBe("❯");
    expect(strip(lines[21] ?? "")).toBe("─".repeat(80));
  });

  it("T1.40 (C22 I82): footers of 0, 1, 3 and 9 rows compose to 0, 1, 3 and MAX_FOOTER_ROWS, each summing, and the 9-row footer paints its top", () => {
    for (const [content, rows] of [
      [0, 0],
      [1, 1],
      [3, 3],
      [9, MAX_FOOTER_ROWS],
    ] as const) {
      const f = frameAt(30, FOOTER(content));
      expect(f.footerRows, `${String(content)} rows of content`).toBe(rows);
      expect(heightsSum(f)).toBe(true);
      expect(paint(f, deps())).toHaveLength(30);
    }
    // **Truncated top-down, never scrolled** (§6l.2 row 5): the first
    // MAX_FOOTER_ROWS blocks are on the last MAX_FOOTER_ROWS rows.
    const nine = paint(frameAt(30, FOOTER(9)), deps());
    const footer = nine.slice(30 - MAX_FOOTER_ROWS).map(strip);
    expect(footer).toEqual(Array.from({ length: MAX_FOOTER_ROWS }, (_, i) => `footer ${String(i + 1)}`));
    expect(nine.map(strip).some((l) => l.includes(`footer ${String(MAX_FOOTER_ROWS + 1)}`))).toBe(false);
  });

  it("T1.41 (C22 I83, §6l.2 rows 11, 13, 14): entryLayout renders a card's header at the width and its body at width − 2 under the hook; other documents lay out whole", () => {
    const step = block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: "ps(--all) · 0.4s · ok" });
    const body = block({ kind: "notice", id: "b", tone: "muted", text: "the body row" });
    const other = block({ kind: "notice", id: "o", tone: "muted", text: "another" });
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    const rows = (blocks: readonly Block[], width: number): readonly string[] => {
      const layout = entryLayout(blocks, width);
      const total = measureEntry(REGISTRY.measureSequence, blocks, width);
      return renderEntryPieces(REGISTRY, windowEntry(layout, 0, total, REGISTRY), options).rows;
    };

    // Row 11: header at 40, body at 36, two blanks and `⎿ ` on the body's first
    // row (§6l.6 row 16 — the hook at the header's text column). Every entry
    // ends with its blank row (C22 I85), so the rendered set is one longer.
    const card = rows([step, body, other], 40);
    const header = renderSequenceToLines(REGISTRY, [step], 40, options);
    const bodyAt36 = renderSequenceToLines(REGISTRY, [body, other], 36, options);
    expect(card).toHaveLength(header.length + bodyAt36.length + ENTRY_GAP);
    expect(card.slice(0, header.length)).toEqual(header);
    expect(strip(card[header.length] ?? "")).toBe(`  ⎿ ${strip(bodyAt36[0] ?? "")}`);
    expect(strip(card[header.length + 1] ?? "")).toBe(`    ${strip(bodyAt36[1] ?? "")}`);
    const hookRow = card[header.length] ?? "";
    expect(hasSgr(hookRow.slice(0, hookRow.indexOf("⎿"))), "the hook is muted — an SGR opens before it").toBe(true);
    // Rendered lines are not squared off — `paint`'s `exact` does that — so the
    // claim is the bound: nothing the layout prefixes overruns the width.
    for (const line of card) expect(displayCells(line)).toBeLessThanOrEqual(40);

    // Row 14: a header with no body hangs no hook — the header and the blank.
    expect(rows([step], 40)).toEqual([...header, ""]);
    expect(entryLayout([step], 40).filter((run) => !run.blank)).toHaveLength(1);

    // Row 13: a document whose first block is not a `step` notice is one run.
    expect(rows([body, other], 40)).toEqual([...renderSequenceToLines(REGISTRY, [body, other], 40, options), ""]);
    expect(entryLayout([body, other], 40)[0]?.indent).toBe(0);
  });

  it("T1.44 (C22 I84, §6l.6 row 16): the card's hook and C09's continuation mark are one column — compared as two rendered forms, not two constants", () => {
    const step = block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: "ps · ok" });
    const body = block({ kind: "notice", id: "b", tone: "muted", text: "the body row" });
    const queued = block({ kind: "notice", id: "q", tone: "muted", glyph: "continuation", text: "queued behind /logs" });
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    const layout = entryLayout([step, body], 40);
    const total = measureEntry(REGISTRY.measureSequence, [step, body], 40);
    const card = renderEntryPieces(REGISTRY, windowEntry(layout, 0, total, REGISTRY), options).rows.map(strip);
    const notice = renderSequenceToLines(REGISTRY, [queued], 40, options).map(strip);
    const hookAt = card[1]?.indexOf("⎿") ?? -1;
    expect(hookAt, "the hook at the header's text column").toBe(HOOK_INDENT);
    expect(notice[0]?.indexOf("⎿"), "C09's own lead for the same mark").toBe(hookAt);
    expect(card[1], "two blanks, the hook, a space, the body at 36").toBe(
      `  ⎿ ${strip(renderSequenceToLines(REGISTRY, [body], 36, options)[0] ?? "")}`,
    );
    expect(layout.find((run) => run.indent > 0)?.width).toBe(40 - BODY_INDENT);
  });

  it("T1.45 (C22 I85, §6l.6 rows 18–19): every entry ends with one blank row — measured, drawn, windowed and element-free", () => {
    const note = block({ kind: "notice", id: "n", tone: "muted", text: "one row" });
    const chips = block({ kind: "pills", id: "p", chips: [{ label: "a" }, { label: "b" }] });
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    const total = measureEntry(REGISTRY.measureSequence, [note], 40);
    expect(total, "the sequence plus the entry's blank").toBe(REGISTRY.measureSequence([note], 40) + ENTRY_GAP);
    const layout = entryLayout([note], 40);
    const whole = renderEntryPieces(REGISTRY, windowEntry(layout, 0, total, REGISTRY), options);
    expect(whole.rows).toHaveLength(total);
    expect(whole.rows.at(-1), "the last row is the blank").toBe("");
    expect(whole.faults).toEqual([]);
    const short = renderEntryPieces(REGISTRY, windowEntry(layout, 0, total - 1, REGISTRY), options);
    expect(short.rows, "a window short of the blank draws none").toHaveLength(total - 1);
    expect(short.rows.every((r) => strip(r) !== "")).toBe(true);
    const onlyBlank = renderEntryPieces(REGISTRY, windowEntry(layout, total - 1, total, REGISTRY), options);
    expect(onlyBlank.rows, "a window of the blank alone draws exactly one").toEqual([""]);
    const elements = elementsOfEntry(REGISTRY, [chips], 40);
    const chipsTotal = measureEntry(REGISTRY.measureSequence, [chips], 40);
    expect(elements.length).toBeGreaterThan(0);
    for (const { element } of elements) expect(element.rows.to, "no element on the blank").toBeLessThanOrEqual(chipsTotal - ENTRY_GAP);
  });

  it("T1.46 (C22 I86, §6l.6 row 20): default chrome is two clusters — the clock and the cwd end at the last column, /help begins at 0, and the right cluster's cells is the registry's own width", () => {
    const chrome = makeDefaultChrome("plots-tui", "/usr/local/bin/plots");
    for (const columns of [80, 100, 60]) {
      const f = frameAt(24, chrome, 1, columns);
      const lines = paint(f, deps());
      const header = strip(lines[0] ?? "");
      const footer = strip(lines[23] ?? "");
      expect(header.startsWith("plots-tui"), `${String(columns)}: the name at column 0`).toBe(true);
      expect(displayCells(header), `${String(columns)}: the clock's last cell is the last column`).toBe(columns);
      expect(header.endsWith(formatClock(NOW, columns))).toBe(true);
      expect(footer.startsWith("/help"), `${String(columns)}: /help at column 0`).toBe(true);
      expect(displayCells(footer), `${String(columns)}: the cwd ends at the last column`).toBe(columns);
      expect(footer.endsWith("~/work")).toBe(true);
    }
    // The figure the group is told, against the figure C09 measures — at widths
    // the cluster fits and one it does not.
    for (const chips of [[{ label: "12:34:56" }], [{ label: "~/work" }], [{ label: "a" }, { label: "bb" }, { label: "COPY" }]]) {
      const pills = block({ kind: "pills", id: "x", chips });
      const wanted = clusterCells(chips);
      expect(REGISTRY.width(pills, 200), JSON.stringify(chips)).toBe(wanted);
      expect(REGISTRY.width(pills, wanted), "and at exactly its own width").toBe(wanted);
    }
  });

  it("T1.42 (C22 I83, §6l.2 row 12): a body that wraps once more at width − 2 is measured and rendered with the same extra row", () => {
    const step = block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: "ps" });
    // 39 cells of prose: one row at 40, two at 36.
    const body = block({ kind: "notice", id: "b", tone: "muted", text: "a".repeat(39) });
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    const flush = REGISTRY.measureSequence([step, body], 40);
    const measured = measureEntry(REGISTRY.measureSequence, [step, body], 40);
    expect(measured, "the measurer sees the wrap, and the entry's blank (C22 I85)").toBe(flush + 1 + ENTRY_GAP);
    const drawn = renderEntryPieces(
      REGISTRY,
      windowEntry(entryLayout([step, body], 40), 0, measured, REGISTRY),
      options,
    );
    expect(drawn.rows, "and the renderer draws it").toHaveLength(measured);
    expect(drawn.faults).toEqual([]);
    // A window into the body alone: no header, the hook still on the body's first row.
    const tail = renderEntryPieces(REGISTRY, windowEntry(entryLayout([step, body], 40), 1, measured, REGISTRY), options);
    expect(tail.rows).toHaveLength(measured - 1);
    expect(strip(tail.rows[0] ?? "").startsWith("  ⎿ ")).toBe(true);
    expect(strip(tail.rows[1] ?? "").startsWith("    a")).toBe(true);
  });

  it("T1.43 (C22 §6l.4 E): the default footer is one muted pills row — `/help`, the cwd with $HOME as `~`, and `stopping` when the session says so — and no key name", () => {
    const chrome = makeDefaultChrome("t", "t");
    const f = frameAt(24, chrome);
    expect(f.footerRows).toBe(1);
    const lines = paint(f, deps());
    const footer = strip(lines[23] ?? "");
    expect(footer).toContain("/help");
    expect(footer).toContain("~/work");
    expect(footer).not.toContain("/home/ada");
    expect(footer).not.toContain("stopping");
    expect(footer, "verbs and facts, never keys (C16 I19)").not.toMatch(/\b(ctrl|esc|tab|enter|⏎|⇧)\b/i);

    const stopping = paint(frameAt(24, chrome, 1, 80, { ...SESSION, stopping: true }), deps());
    expect(strip(stopping[23] ?? "")).toContain("stopping");

    expect(foldHome("/home/ada", "/home/ada")).toBe("~");
    expect(foldHome("/home/adam/x", "/home/ada"), "a prefix that is not a directory boundary").toBe("/home/adam/x");
    expect(foldHome("/work", undefined)).toBe("/work");
  });

  it("T3.38 (C22 I80, I82): frame read — the footer's blocks sit on the last f rows below the lower rule, and the default frame carries the default footer", () => {
    const f3 = frameAt(24, FOOTER(3));
    const lines = paint(f3, deps());
    expect(lines).toHaveLength(24);
    expect(f3.region.height).toBe(24 - 1 - 1 - 2 - 1 - 3);
    expect(lines.slice(21).map(strip)).toEqual(["footer 1", "footer 2", "footer 3"]);
    expect(strip(lines[20] ?? ""), "the lower rule directly above the footer").toBe("─".repeat(80));
    expect(strip(lines[19] ?? "")).toBe("❯");
    for (const line of lines) expect(displayCells(line)).toBe(80);

    // The resolved default chrome paints the same frame as `makeDefaultChrome`.
    const resolved = resolveConfig(BASE, AMBIENT).chrome;
    const explicit = paint(frameAt(24, makeDefaultChrome("t", "t")), deps());
    expect(paint(frameAt(24, resolved), deps())).toEqual(explicit);
    expect(strip(explicit[23] ?? "")).toContain("/help");
  });

  it("T3.39 (C22 I28, §6l.2 row 10): with a three-row footer the layer region is the transcript region and paint returns rows lines", () => {
    const f = frameAt(30, FOOTER(3));
    expect(f.overlayRegion.height).toBe(f.region.height);
    expect(f.region.height).toBe(30 - 1 - 1 - 2 - 1 - 3);
    expect(paint(f, deps())).toHaveLength(30);
  });
});
