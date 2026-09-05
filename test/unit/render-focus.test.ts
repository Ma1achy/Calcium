// C11 I14 and C22 I58 — the selection is painted, and the extent is in the key.
//
// **Measured before any of this landed** (F764, arc3 Lane A): after `↓ ⇧↓ ⇧↓`
// the frame showed the head in `accent` and the two rows above it in
// `default`. `FocusState` carried `{blockId, rowId}` and `y` was the extent's
// only reader. And `⌃a` at the tail wrote a frame that was byte-identical to the
// one before it, because the head had not moved and neither had the key.
//
// **Two harnesses, on purpose.** The unit rows hand `renderToLines` a focus and
// ask the table and the chips what they paint; they pass with `focusFor`
// returning the head alone, because the test supplies the list. The session rows
// read the screen after keystrokes, and they are the only rows that can say
// whether anything *writes* the field (C22 I58's pairing rule, I71's argument).
// A suite holding the unit rows alone would report *the renderer paints it* on
// the day nothing produces it.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin, capabilities } from "../support/fake-terminal.js";
import { rowContaining, styleAt, styledScreenFrom, textOf, type CellStyle } from "../support/styled-screen.js";
import { measurable } from "../support/render.js";
import type { FocusState } from "../../src/presentation/blocks/index.js";
import { selectionStyle, tone } from "../../src/presentation/blocks/paint.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import { focusKey } from "../../src/shell/render-cache.js";

/** The wire forms (C16 I17, keymap.ts: `⇧↓` is `CSI 1;2B`). */
const DOWN = "\u001b[B";
const SHIFT_DOWN = "\u001b[1;2B";
const CTRL_A = "\u0001";

const SIZE = { columns: 80, rows: 24 };

const META = {
  verb: "rows",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

const COLUMNS = [
  { key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false },
  { key: "state", label: "State", align: "left", priority: 5, minWidth: 10, sortable: false },
];
/**
 * Four rows: two carry a cell tone and one a span tone — both runs a selection
 * must drop to `default` (C11 I14). The span is the fixture M7 asked for: a
 * mutation keeping span tones on a selected row failed nothing until a row had one.
 */
const ROWS = [
  { id: "a", cells: { name: { text: "alpha" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  { id: "b", cells: { name: { text: "bravo" }, state: { text: "exited", spans: [{ from: 0, to: 3, tone: "identifier" }] } } },
  { id: "c", cells: { name: { text: "charlie" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  { id: "d", cells: { name: { text: "delta" }, state: { text: "paused", tone: "warn", glyph: "warn" } } },
];
const TABLE = { kind: "table", id: "t", columns: COLUMNS, rows: ROWS };

/** A painting session whose one verb yields the four-row table, and a keyboard. */
async function painting() {
  const stdin = fakeStdin();
  const built = await buildSession(
    {
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "four rows", args: [], flags: [] }],
      },
      localHandlers: {
        rows: () => ({ schema: "tui.view/1", status: "ok", meta: META, blocks: [TABLE] }),
      },
    } as never,
    { ...SIZE },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  await type("/rows\r");
  await Promise.resolve();
  const screen = () => styledScreenFrom(built.stdout.chunks, SIZE);
  /** The style of the first cell of the row holding `name`, or a throw — a missing row is not a tone. */
  const toneOf = (name: string): CellStyle => {
    const row = rowContaining(screen(), name);
    if (row === null) throw new Error(`no row holds ${name}`);
    const s = styleAt(row, name);
    if (s === null) throw new Error(`no cell holds ${name}`);
    return s;
  };
  return { ...built, type, screen, toneOf };
}

/** The session's theme: `buildSession` passes `defaultTheme` and a session opens dark. */
const loadedTheme = loadTheme(defaultTheme, "dark");
if (!loadedTheme.ok) throw new Error("theme failed to load");
const theme = loadedTheme.value.current;

/** `sgr(style)` without the frame, so an expected tone reads as the model's channel. */
const params = (style: ReturnType<typeof tone>): string => sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");

describe("C11 I14 — the selection is painted, read from a session's screen", () => {
  it("T4.8 (C11 I14, C26 I16): ↓ ⇧↓ ⇧↓ washes alpha and bravo, accents charlie, leaves delta", async () => {
    const s = await painting();
    // The session's theme resolves at 8-bit (`TERM=xterm-256color`), so the
    // expected channels come from the same resolution the frame used.
    const caps = capabilities({ colourDepth: 8 });
    const accent = params(tone("accent", theme, caps));
    const plain = params(tone("default", theme, caps));
    const wash = params(selectionStyle(theme, caps));
    expect(wash, "the wash is a background at 8-bit").toMatch(/^48;/u);

    // **The control**: no focus, nothing washed, nothing accented.
    for (const name of ["alpha", "bravo", "charlie", "delta"]) {
      expect(s.toneOf(name), `${name} before any key`).toEqual({ fg: plain, bg: "", attrs: [] });
    }

    await s.type(DOWN);
    expect(s.toneOf("alpha"), "↓ focuses alpha").toEqual({ fg: accent, bg: "", attrs: [] });

    await s.type(SHIFT_DOWN);
    await s.type(SHIFT_DOWN);
    // **Which rows, not how many.** A wash on the wrong three rows satisfies
    // every count; the assertion names each row and its tone.
    expect(s.toneOf("alpha"), "alpha is selected: default ink over the wash").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(s.toneOf("bravo"), "bravo is selected").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(s.toneOf("charlie"), "charlie is the head: accent, no wash").toEqual({ fg: accent, bg: "", attrs: [] });
    expect(s.toneOf("delta"), "delta is outside the extent").toEqual({ fg: plain, bg: "", attrs: [] });
    // And the wash runs across the row, gap included — *selected*, not
    // *highlighted* (C22 §6e's distinction): the state column of a selected row
    // is washed and its own `ok` tone is dropped to `default`.
    const alphaRow = rowContaining(s.screen(), "alpha");
    expect(styleAt(alphaRow!, "running"), "alpha's state cell: default over the wash").toEqual({ fg: plain, bg: wash, attrs: [] });
    const charlieRow = rowContaining(s.screen(), "charlie");
    expect(styleAt(charlieRow!, "running"), "charlie's state cell takes the head's accent").toEqual({ fg: accent, bg: "", attrs: [] });

    // **An unshifted motion collapses** (C26 I16): `↓` to delta, nothing washed.
    await s.type(DOWN);
    expect(s.toneOf("delta")).toEqual({ fg: accent, bg: "", attrs: [] });
    for (const name of ["alpha", "bravo", "charlie"]) {
      expect(s.toneOf(name), `${name} after the collapse`).toEqual({ fg: plain, bg: "", attrs: [] });
    }
  });

  it("T4.61 (C22 I58): ⌃a at the tail moves no head and must still move the frame", async () => {
    const s = await painting();
    const caps = capabilities({ colourDepth: 8 });
    const plain = params(tone("default", theme, caps));
    const wash = params(selectionStyle(theme, caps));

    for (const _ of ["a", "b", "c", "d"]) await s.type(DOWN);
    expect(textOf(rowContaining(s.screen(), "delta")!)).toContain("delta");
    expect(s.toneOf("alpha"), "at the tail, nothing above is washed").toEqual({ fg: plain, bg: "", attrs: [] });
    const before = s.stdout.chunks.length;

    // **The row about the extent's axis and no other.** The head is already on
    // `delta`, so `(blockId, rowId)` does not move; with the extent out of the
    // key the slot is served and this frame is the one before it. The render
    // count cannot see the defect — the frame path runs and paints from the
    // cache — which is why the assertion is on the screen.
    await s.type(CTRL_A);
    expect(s.stdout.chunks.length, "⌃a wrote a frame").toBeGreaterThan(before);
    expect(s.toneOf("alpha"), "alpha washed by ⌃a").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(s.toneOf("bravo"), "bravo washed by ⌃a").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(s.toneOf("charlie"), "charlie washed by ⌃a").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(s.toneOf("delta").bg, "the head is not washed").toBe("");
  });
});

describe("C11 I14 — the renderer, handed the extent directly", () => {
  const registry = measurable({ definitions: [tableDefinition] }).registry;

  const render = (focus: FocusState | null, depth: 24 | 1 = 24): readonly string[] =>
    renderToLines(registry, block(TABLE as never), 60, { theme, capabilities: capabilities({ colourDepth: depth }), focus });
  const styled = (lines: readonly string[]) => styledScreenFrom([lines.join("\r\n")], { columns: 60, rows: lines.length });
  const cellOf = (lines: readonly string[], name: string): CellStyle => {
    const row = rowContaining(styled(lines), name);
    const s = row === null ? null : styleAt(row, name);
    if (s === null) throw new Error(`no cell holds ${name}`);
    return s;
  };
  const pair = (blockId: string, rowId: string) => ({ blockId, rowId });

  it("T1.23 (C11 I14): a, b, c selected with the head on c — a and b washed, c accent, the row above unwashed", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const plain = params(tone("default", theme, caps));
    const wash = params(selectionStyle(theme, caps));
    const ok = params(tone("ok", theme, caps));

    const none = render(null);
    expect(cellOf(none, "running"), "the control: `ok` tone with no focus").toEqual({ fg: ok, bg: "", attrs: [] });
    const identifier = params(tone("identifier", theme, caps));
    expect(cellOf(none, "exited"), "the control: the span's own tone with no focus").toEqual({ fg: identifier, bg: "", attrs: [] });

    const three = render({ blockId: "t", rowId: "c", selected: [pair("t", "a"), pair("t", "b"), pair("t", "c")] });
    expect(cellOf(three, "alpha")).toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(three, "bravo")).toEqual({ fg: plain, bg: wash, attrs: [] });
    // **A span's tone drops with the cell's** (C11 I14): `exi` is `identifier` at
    // rest and `default` over the wash. M7 — keeping span tones on a selected
    // row — survived until this line existed.
    expect(cellOf(three, "exited"), "the span inside a selected row").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(three, "charlie")).toEqual({ fg: accent, bg: "", attrs: [] });
    expect(cellOf(three, "delta")).toEqual({ fg: plain, bg: "", attrs: [] });
    // The header row above `alpha` is not washed either.
    expect(cellOf(three, "Name").bg).toBe("");

    // **Under another block's id the same pairs paint nothing here.** Filtered
    // by the pair's block, not gated on the head's (T6.17's third mutation).
    const elsewhere = render({ blockId: "x", rowId: "c", selected: [pair("x", "a"), pair("x", "b"), pair("x", "c")] });
    expect(elsewhere, "a sibling's selection leaves this table as it is with no focus").toEqual(none);

    // **And a selection whose head is in a sibling still names rows here.**
    const straddling = render({ blockId: "x", rowId: "chip-0", selected: [pair("t", "d"), pair("x", "chip-0")] });
    expect(cellOf(straddling, "delta"), "delta washed although the head is elsewhere").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(straddling, "charlie").bg).toBe("");

    // **The sentinel, measured**: the head alone is byte-identical to absent.
    const headAlone = render({ blockId: "t", rowId: "c", selected: [pair("t", "c")] });
    expect(headAlone).toEqual(render({ blockId: "t", rowId: "c" }));
  });

  it("T1.23 (C11 I14, C10 §4b): at 1-bit the wash is reverse video, on the selected rows and not the head", () => {
    const three = render({ blockId: "t", rowId: "c", selected: [pair("t", "a"), pair("t", "b"), pair("t", "c")] }, 1);
    expect(cellOf(three, "alpha").attrs, "alpha: inverse").toContain(7);
    expect(cellOf(three, "bravo").attrs, "bravo: inverse").toContain(7);
    expect(cellOf(three, "charlie").attrs, "the head is bold (accent's mono class), not inverse").not.toContain(7);
    expect(cellOf(three, "delta").attrs).not.toContain(7);
    // The whole row, gap included — the state cell of a selected row is inverse too.
    const alphaRow = rowContaining(styled(three), "alpha")!;
    expect(styleAt(alphaRow, "running")!.attrs).toContain(7);
  });

  it("T1.24 (C11 I14, C26 §7): pills paint the focused chip accent over the ground, and a selected chip default over it", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const muted = params(tone("muted", theme, caps));
    const plain = params(tone("default", theme, caps));
    const wash = params(selectionStyle(theme, caps));
    const pills = block({
      kind: "pills",
      id: "p",
      chips: [{ label: "all" }, { label: "exited" }, { label: "dead" }],
    } as never);
    const paint = (focus: FocusState | null) =>
      renderToLines(registry, pills, 60, { theme, capabilities: caps, focus });

    // **The control is the frame at HEAD**, where a focused chip drew as an
    // unfocused one: `render` consulted `active` and `tone` only.
    const none = paint(null);
    expect(cellOf(none, "exited")).toEqual({ fg: muted, bg: "", attrs: [] });

    // **The head is accent over the selection ground, not accent alone** (C26
    // §7). `active` already spends `accent` as data — the assertion two lines
    // down — so a head in `accent` alone was the F769 frame: `running` and
    // `exited` in one colour. The ground is a channel no chip datum uses.
    const focused = paint({ blockId: "p", rowId: "chip-1" });
    expect(cellOf(focused, "exited"), "the head chip is accent over the ground").toEqual({ fg: accent, bg: wash, attrs: [] });
    expect(cellOf(focused, "all"), "its neighbour is not").toEqual({ fg: muted, bg: "", attrs: [] });
    const withActive = block({ kind: "pills", id: "p", chips: [{ label: "all" }, { label: "exited" }, { label: "dead", active: true }] } as never);
    const activeFrame = renderToLines(registry, withActive, 60, { theme, capabilities: caps, focus: { blockId: "p", rowId: "chip-1" } });
    expect(cellOf(activeFrame, "dead"), "an active chip is accent with no ground — the datum").toEqual({ fg: accent, bg: "", attrs: [] });
    expect(cellOf(activeFrame, "exited"), "and the head beside it differs by the ground alone").toEqual({ fg: accent, bg: wash, attrs: [] });
    expect(cellOf(activeFrame, "dead")).not.toEqual(cellOf(activeFrame, "exited"));

    const selected = paint({ blockId: "p", rowId: "chip-2", selected: [pair("p", "chip-0"), pair("p", "chip-1"), pair("p", "chip-2")] });
    expect(cellOf(selected, "all"), "chip-0 washed").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(selected, "exited"), "chip-1 washed").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(selected, "dead"), "chip-2 is the head: accent ink over the same ground").toEqual({ fg: accent, bg: wash, attrs: [] });
    // At 1-bit the ground is reverse video and the head is bold as well.
    const mono = renderToLines(registry, pills, 60, { theme, capabilities: capabilities({ colourDepth: 1 }), focus: { blockId: "p", rowId: "chip-1" } });
    const monoCells = styledScreenFrom([mono.join("\r\n")], { columns: 60, rows: mono.length });
    const monoHead = styleAt(rowContaining(monoCells, "exited")!, "exited")!;
    expect(monoHead.attrs, "1-bit head: bold and inverse").toEqual(expect.arrayContaining([1, 7]));
    expect(styleAt(rowContaining(monoCells, "all")!, "all")!.attrs).not.toContain(7);

    // Another block's focus leaves every chip in its own tone.
    expect(paint({ blockId: "t", rowId: "chip-1", selected: [pair("t", "chip-0"), pair("t", "chip-1")] })).toEqual(none);
  });
});

describe("C22 I58 — the key carries the extent", () => {
  it("T1.x (I58): two focuses with one head and different extents key apart; absent and the head alone key alike", () => {
    const head = { blockId: "t", rowId: "d" };
    const all = { ...head, selected: [{ blockId: "t", rowId: "a" }, { blockId: "t", rowId: "b" }, { blockId: "t", rowId: "d" }] };
    expect(focusKey(all), "⌃a at the tail: the head stands still and the key must not").not.toBe(focusKey(head));
    // **`focusKey`'s own warning, honoured**: two values that draw alike key alike.
    expect(focusKey({ ...head, selected: [] })).toBe(focusKey(head));
    // Different extents, same head, same length — the pairs are in the key, not a count.
    const other = { ...head, selected: [{ blockId: "t", rowId: "b" }, { blockId: "t", rowId: "c" }, { blockId: "t", rowId: "d" }] };
    expect(focusKey(other)).not.toBe(focusKey(all));
    expect(focusKey(null)).toBe("");
  });
});

/** The frame glyphs a plot's furniture draws — what a block-level focus is allowed to move (C26 §7). */
const FRAME_GLYPHS = new Set([..."┌─┐│┤├└┬┴┘"]);
const SGR = /\u001b\[[0-9;]*m/gu;

describe("C26 §7 — a block-level focus paints the cells the block already reserves", () => {
  const registry = measurable({ definitions: [tableDefinition, plotDefinition] }).registry;
  const cellsOf = (lines: readonly string[], columns: number) => styledScreenFrom([lines.join("\r\n")], { columns, rows: lines.length });
  /** Every (row, col) whose style differs between two frames of one text, with the glyph and both styles. */
  const styleDiff = (a: readonly string[], b: readonly string[], columns: number) => {
    const ca = cellsOf(a, columns);
    const cb = cellsOf(b, columns);
    const out: { row: number; col: number; ch: string; was: CellStyle; now: CellStyle }[] = [];
    for (let row = 0; row < ca.length; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const x = ca[row]![col]!;
        const y = cb[row]![col]!;
        if (JSON.stringify(x.style) !== JSON.stringify(y.style)) out.push({ row, col, ch: x.ch, was: x.style, now: y.style });
      }
    }
    return out;
  };

  const PLOT = block({ kind: "plot", id: "p", form: "line", height: 5, axes: true, series: [{ label: "train", values: [10, 20, 30, 40, 50] }] } as never);
  const plotAt = (focus: FocusState | null, depth: 24 | 1 = 24) =>
    renderToLines(registry, PLOT, 80, { theme, capabilities: capabilities({ colourDepth: depth }), focus });

  it("T1.25 (C26 §7, C12 I85): a focused plot turns exactly its frame accent — 164 cells, seven rows, no glyph and no label moves", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const muted = params(tone("muted", theme, caps));
    const none = plotAt(null);
    const focused = plotAt({ blockId: "p", rowId: null });

    // **The text is byte-identical**: the frame moves no glyph and no cell (C11 I17's rule on a plot).
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const diff = styleDiff(none, focused, 80);
    // **Which cells, not how many alone.** Every differing cell is a frame glyph,
    // and every one went from `muted` to `accent`; the y-labels `60` and `0`, the
    // x-labels and the curve are untouched. Measured: 164 at this width — the
    // lid (77), five side-rule pairs (10), the bottom rule with its ticks (77).
    expect(diff.length, "the frame's cells at 80 columns").toBe(164);
    expect(new Set(diff.map((d) => d.row)).size, "the lid, five area rows, the bottom rule — not the x-label row").toBe(7);
    for (const d of diff) {
      expect(FRAME_GLYPHS.has(d.ch), `cell ${String(d.row)},${String(d.col)} holds ${JSON.stringify(d.ch)} — not a frame glyph`).toBe(true);
      expect(d.was.fg, "was muted").toBe(muted);
      expect(d.now.fg, "now accent").toBe(accent);
    }
    const labelRow = rowContaining(cellsOf(focused, 80), "60")!;
    expect(styleAt(labelRow, "60")!.fg, "the y-label keeps muted: the enclosure lights up, not the scale").toBe(muted);
    expect(textOf(focused[focused.length - 1] === undefined ? [] : cellsOf(focused, 80)[focused.length - 1]!), "the x-label row exists").toContain("0.0");
    expect(diff.some((d) => d.row === focused.length - 1), "and no cell of it moved").toBe(false);

    // **The controls**: a row focus on this block, and a block focus on another, paint nothing here.
    expect(plotAt({ blockId: "p", rowId: "r" })).toEqual(none);
    expect(plotAt({ blockId: "q", rowId: null })).toEqual(none);
  });

  it("T1.25 (C26 §7, F34): at 1-bit the same cells go from dim to bold — a weight, not a colour", () => {
    const none = plotAt(null, 1);
    const focused = plotAt({ blockId: "p", rowId: null }, 1);
    const diff = styleDiff(none, focused, 80);
    expect(diff.length, "the same 164 cells").toBe(164);
    for (const d of diff) {
      expect(d.was.attrs, `${JSON.stringify(d.ch)} was dim`).toContain(2);
      expect(d.now.attrs, `${JSON.stringify(d.ch)} is bold`).toContain(1);
      expect(d.now.attrs).not.toContain(2);
    }
  });

  const SCROLL = (n: number) => block({
    kind: "scroll",
    id: "s",
    height: 3,
    children: Array.from({ length: n }, (_, i) => ({ kind: "notice", id: `n${String(i + 1)}`, tone: "info", text: `line ${String(i + 1)}` })),
  } as never);
  const scrollAt = (n: number, focus: FocusState | null, depth: 24 | 1 = 24, offset = 2) =>
    renderToLines(registry, SCROLL(n), 40, { theme, capabilities: capabilities({ colourDepth: depth }), focus, scrollOffsets: { s: offset } });

  it("T1.26 (C26 §7, C04 I49): a focused scroll turns its residue row accent and nothing else; a box whose content fits paints nothing", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const dim = params(tone("dim", theme, caps));
    const none = scrollAt(6, null);
    // A scroll's elements are its children, so a focus inside it names a child.
    const focused = scrollAt(6, { blockId: "s", rowId: "n3" });
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const residueRow = none.findIndex((l) => /2 above, 1 below/u.test(l));
    expect(residueRow, "the fixture has a residue row, and it is the last").toBe(3);
    const diff = styleDiff(none, focused, 40);
    expect(diff.length, "exactly the residue text's cells").toBeGreaterThan(0);
    expect(new Set(diff.map((d) => d.row)), "and only on the residue row").toEqual(new Set([residueRow]));
    for (const d of diff) {
      expect(d.was.fg).toBe(dim);
      expect(d.now.fg).toBe(accent);
    }
    expect(diff.map((d) => d.ch).join("").trim(), "the whole residue text and nothing beside it").toBe("⋯ 2 above, 1 below");

    // **The consequence, said rather than absorbed**: three children in a
    // three-row box have no residue row, so focus paints nothing there.
    expect(scrollAt(3, { blockId: "s", rowId: "n2" }, 24, 0)).toEqual(scrollAt(3, null, 24, 0));
    // Another block's focus leaves the residue dim.
    expect(scrollAt(6, { blockId: "t", rowId: "n3" })).toEqual(none);
    // 1-bit: dim to bold on the residue row.
    const monoDiff = styleDiff(scrollAt(6, null, 1), scrollAt(6, { blockId: "s", rowId: "n3" }, 1), 40);
    expect(new Set(monoDiff.map((d) => d.row))).toEqual(new Set([residueRow]));
    for (const d of monoDiff) {
      expect(d.was.attrs).toContain(2);
      expect(d.now.attrs).toContain(1);
    }
  });
});
