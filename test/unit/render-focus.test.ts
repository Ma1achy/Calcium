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

  it("T1.24 (C11 I14): pills paint the focused chip accent and a selected chip washed", () => {
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

    const focused = paint({ blockId: "p", rowId: "chip-1" });
    expect(cellOf(focused, "exited"), "the head chip is accent").toEqual({ fg: accent, bg: "", attrs: [] });
    expect(cellOf(focused, "all"), "its neighbour is not").toEqual({ fg: muted, bg: "", attrs: [] });

    const selected = paint({ blockId: "p", rowId: "chip-2", selected: [pair("p", "chip-0"), pair("p", "chip-1"), pair("p", "chip-2")] });
    expect(cellOf(selected, "all"), "chip-0 washed").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(selected, "exited"), "chip-1 washed").toEqual({ fg: plain, bg: wash, attrs: [] });
    expect(cellOf(selected, "dead"), "chip-2 is the head").toEqual({ fg: accent, bg: "", attrs: [] });

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
