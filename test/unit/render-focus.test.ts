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
import { measurable, visible } from "../support/render.js";
import type { FocusState } from "../../src/presentation/blocks/index.js";
import { glyphFor, headMark } from "../../src/presentation/blocks/glyphs.js";
import { background, focusStyle, isBand, selectionStyle, tone } from "../../src/presentation/blocks/paint.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { block, mosaicRects, parseAreas } from "../../src/data/viewmodel/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import { focusKey } from "../../src/shell/render-cache.js";
import { GUTTER_CELLS } from "../support/table-gutter.js";

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
    // **Focus has a ground of its own now** (C10 I47, R-SEL-006): the head was
    // `accent` over *nothing* and is `accent` over `focusGround`, so the two
    // facts are two grounds rather than one ground told apart by ink.
    const focusBg = params(focusStyle(theme, caps));
    // **And each ink on the ground it lands on** (C10 I48). At 8-bit the ground
    // binds through the cube, because the composed set quantises as a set on
    // that ground — so these are three different indices, not one read three
    // times.
    const plainOnFocus = params(tone("default", theme, caps, "focusGround"));
    const plainOnWash = params(tone("default", theme, caps, "selection"));
    const okOnWash = params(tone("ok", theme, caps, "selection"));
    expect(wash, "the wash is a background at 8-bit").toMatch(/^48;/u);
    expect(focusBg, "and so is the focus ground").toMatch(/^48;/u);
    expect(focusBg, "and they are different grounds").not.toBe(wash);

    // **The control**: no focus, nothing washed, nothing accented.
    for (const name of ["alpha", "bravo", "charlie", "delta"]) {
      expect(s.toneOf(name), `${name} before any key`).toEqual({ fg: plain, bg: "", attrs: [] });
    }

    await s.type(DOWN); // the card's head is the first element (C09 I47)
    await s.type(DOWN);
    // The head's cells keep their own tones (C11 I14 as amended) — `alpha` has
    // none, so it is `default` resolved on the focus ground, and `▸` in the
    // reserved column is what says the head is here.
    expect(s.toneOf("alpha"), "↓ ↓ focuses alpha").toEqual({ fg: plainOnFocus, bg: focusBg, attrs: [] });

    await s.type(SHIFT_DOWN);
    await s.type(SHIFT_DOWN);
    // **Which rows, not how many.** A wash on the wrong three rows satisfies
    // every count; the assertion names each row and its tone.
    expect(s.toneOf("alpha"), "alpha is selected: its own tone over the wash").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(s.toneOf("bravo"), "bravo is selected").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    // **The head inside the extent takes the selection ground** (R-SEL-006). It
    // was `accent` over nothing, which is the old mechanism: one ground, two
    // facts, told apart by ink. Selection owns the ground where both hold, and
    // the mark in the reserved column is what says *here* — so the head's cells
    // are inked like every other row's, on the ground the row took.
    expect(s.toneOf("charlie"), "charlie is the head, and its cells keep their tones").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(accent, "accent is no longer what a head's cells are painted in").not.toBe(plainOnWash);
    expect(s.toneOf("delta"), "delta is outside the extent").toEqual({ fg: plain, bg: "", attrs: [] });
    // And the wash runs across the row, gap included — *selected*, not
    // *highlighted* (C22 §6e's distinction). **The state column keeps its `ok`
    // tone**, resolved on the wash: it was dropped to `default`, which is the
    // rule F1240 retired.
    const alphaRow = rowContaining(s.screen(), "alpha");
    expect(styleAt(alphaRow!, "running"), "alpha's state cell keeps `ok` on the wash").toEqual({ fg: okOnWash, bg: wash, attrs: [] });
    const charlieRow = rowContaining(s.screen(), "charlie");
    expect(styleAt(charlieRow!, "running"), "and so does the head's").toEqual({ fg: okOnWash, bg: wash, attrs: [] });
    expect(okOnWash, "which is not the one ink the old rule forced").not.toBe(plainOnWash);

    // **An unshifted motion collapses** (C26 I16): `↓` to delta, nothing washed.
    await s.type(DOWN);
    // The extent collapses to the head alone, which is `selected` **absent**
    // (C26 I16's sentinel) — so the ground is focus's, not selection's.
    expect(s.toneOf("delta")).toEqual({ fg: plainOnFocus, bg: focusBg, attrs: [] });
    for (const name of ["alpha", "bravo", "charlie"]) {
      expect(s.toneOf(name), `${name} after the collapse`).toEqual({ fg: plain, bg: "", attrs: [] });
    }
  });

  it("T4.61 (C22 I58): ⌃a at the tail moves no head and must still move the frame", async () => {
    const s = await painting();
    const caps = capabilities({ colourDepth: 8 });
    const plain = params(tone("default", theme, caps));
    const plainOnWash = params(tone("default", theme, caps, "selection"));
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
    expect(s.toneOf("alpha"), "alpha washed by ⌃a").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(s.toneOf("bravo"), "bravo washed by ⌃a").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(s.toneOf("charlie"), "charlie washed by ⌃a").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    // **The head inside the extent takes the selection ground** (R-SEL-006:
    // *focused and selected takes selectionGround and keeps the focus mark*).
    // It was unwashed, which was the old mechanism telling the two apart by ink
    // on one ground; `⌃a` selects every row including this one, so the ground is
    // selection's and `▸` is what still says the head is here.
    expect(s.toneOf("delta").bg, "the head is washed too, and keeps its mark").toBe(wash);
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
    const plain = params(tone("default", theme, caps));
    const wash = params(selectionStyle(theme, caps));
    const focusBg = params(focusStyle(theme, caps));
    const ok = params(tone("ok", theme, caps));
    // **The inks on the grounds they land on** (C10 I48). The row's cells keep
    // their own slots; which hex each slot takes is the ground's answer.
    const plainOnWash = params(tone("default", theme, caps, "selection"));
    const identifierOnWash = params(tone("identifier", theme, caps, "selection"));
    const accentOnWash = params(tone("accent", theme, caps, "selection"));
    const accentOnFocus = params(tone("accent", theme, caps, "focusGround"));

    const none = render(null);
    expect(cellOf(none, "running"), "the control: `ok` tone with no focus").toEqual({ fg: ok, bg: "", attrs: [] });
    const identifier = params(tone("identifier", theme, caps));
    expect(cellOf(none, "exited"), "the control: the span's own tone with no focus").toEqual({ fg: identifier, bg: "", attrs: [] });

    const three = render({ blockId: "t", rowId: "c", selected: [pair("t", "a"), pair("t", "b"), pair("t", "c")] });
    expect(cellOf(three, "alpha")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(cellOf(three, "bravo")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    // **A span keeps its tone, and the wash decides what that tone inks as**
    // (C11 I14 as amended, C10 I48). This row read *a span's tone drops with the
    // cell's* — true of a resolver with one ink per slot, where a span on a wash
    // could keep its meaning or stay legible and not both. `exi` is `identifier`
    // at rest and `identifier` composed for the selection ground here (F1240).
    expect(cellOf(three, "exited"), "the span inside a selected row keeps its own tone").toEqual({
      fg: identifierOnWash,
      bg: wash,
      attrs: [],
    });
    // **`dark` composes nothing for `identifier` on this ground**, so the value
    // equals the page's — and asserting that it moved would pin a theme's
    // current numbers rather than the rule. What the row is about is that it is
    // not `default`, which is the ink the retired rule painted here.
    expect(identifierOnWash, "the same slot, whatever the ground answers").toBe(identifier);
    expect(identifierOnWash, "and not the one ink the old rule forced").not.toBe(plainOnWash);
    // **The head is inside the extent, so selection owns its ground too**
    // (R-SEL-006). `▸` in the reserved column is what is left of focus, and the
    // head's cells keep their own tones like every other row's — `charlie` has
    // none, so it is `default` on the wash.
    expect(cellOf(three, "charlie")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(cellOf(three, "delta")).toEqual({ fg: plain, bg: "", attrs: [] });
    expect(accentOnWash, "kept resolved so the row does not depend on a value it never reads").not.toBe("");
    // **The header row above `alpha` is not washed either** — and it is
    // asserted against the wash now rather than against a bare ground.
    // `bg === ""` stood for *not washed* while nothing painted a header; C11
    // I24 gives it `bgElev` across the whole row, and the row went red on a
    // table whose selection reaches exactly as far as it always did. A proxy
    // for the subject holds until something else acquires the same property.
    expect(cellOf(three, "Name").bg, "the header is not washed").not.toBe(wash);
    expect(cellOf(three, "Name").bg, "it carries its own structural ground").toBe(
      params(background("surface.bgElev", theme, caps)),
    );

    // **Under another block's id the same pairs paint nothing here.** Filtered
    // by the pair's block, not gated on the head's (T6.17's third mutation).
    const elsewhere = render({ blockId: "x", rowId: "c", selected: [pair("x", "a"), pair("x", "b"), pair("x", "c")] });
    expect(elsewhere, "a sibling's selection leaves this table as it is with no focus").toEqual(none);

    // **And a selection whose head is in a sibling still names rows here.**
    const straddling = render({ blockId: "x", rowId: "chip-0", selected: [pair("t", "d"), pair("x", "chip-0")] });
    expect(cellOf(straddling, "delta"), "delta washed although the head is elsewhere").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(cellOf(straddling, "charlie").bg, "and charlie holds no focus here").toBe("");

    // **The sentinel is a kind, not a size** (C26 I16, C11 I14, T2.12). `selected`
    // **absent** is the head alone; a `selected` naming the head is a *real*
    // one-element selection and takes the selection ground, which R-SEL-006
    // requires. The previous form of this row asserted the two were
    // byte-identical, which pinned the sentinel in the test by its **size** —
    // and a size test paints a real single-row selection as focus.
    const sentinel = render({ blockId: "t", rowId: "c" });
    expect(cellOf(sentinel, "charlie"), "absent: the head takes the focus ground").toEqual({
      fg: params(tone("default", theme, caps, "focusGround")),
      bg: focusBg,
      attrs: [],
    });
    const headAlone = render({ blockId: "t", rowId: "c", selected: [pair("t", "c")] });
    expect(cellOf(headAlone, "charlie"), "present, one element: a real selection").toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(accentOnFocus, "and accent is no longer what a head's cells are painted in").not.toBe("");
    expect(headAlone, "so the two are not the same frame").not.toEqual(sentinel);
    // **And the producer never emits the second form**, which is what keeps the
    // sentinel free at the seam rather than in this renderer: `focusFor` returns
    // the head alone with `selected` absent (C26 §5c).
  });

  it("T1.23 (C11 I14, C10 §4b, R-SEL-006): at 1-bit the selection is reverse video and the focus mark persists", () => {
    const three = render({ blockId: "t", rowId: "c", selected: [pair("t", "a"), pair("t", "b"), pair("t", "c")] }, 1);
    expect(cellOf(three, "alpha").attrs, "alpha: inverse").toContain(7);
    expect(cellOf(three, "bravo").attrs, "bravo: inverse").toContain(7);
    // **The head is inverse too, and `▸` is what tells it from its neighbours**
    // (R-SEL-006: *at 1-bit the selection becomes reverse video while the focus
    // mark persists, so neither fact rests on colour alone*). This row read *the
    // head is bold, not inverse* — true of the mechanism where one ground served
    // both facts, and the reason focus had no carrier once the ground was gone.
    expect(cellOf(three, "charlie").attrs, "the head is inside the extent, so it inverts").toContain(7);
    expect(cellOf(three, "delta").attrs).not.toContain(7);
    const lineWith = (lines: readonly string[], name: string): string =>
      visible(lines.find((l) => visible(l).includes(name)) ?? "");
    expect(lineWith(three, "charlie"), "and the mark is in the reserved column").toContain("▸ ");
    for (const other of ["alpha", "bravo", "delta"]) {
      expect(lineWith(three, other), `${other} carries no mark`).not.toContain("▸");
    }
    // **A focused row outside any extent has the mark and nothing else at 1-bit**,
    // because `focusGround` answers `NO_STYLE` without colour and the mark is the
    // whole carrier — which is why `focusStyle` has no inverse rung: a second one
    // would draw a focused row and a selected one as the same frame.
    const alone = render({ blockId: "t", rowId: "c" }, 1);
    expect(cellOf(alone, "charlie").attrs, "no ground survives 1-bit").not.toContain(7);
    expect(lineWith(alone, "charlie")).toContain("▸ ");
    // The whole row, gap included — the state cell of a selected row is inverse too.
    const alphaRow = rowContaining(styled(three), "alpha")!;
    expect(styleAt(alphaRow, "running")!.attrs).toContain(7);
  });

  it("T1.24 (C11 I14, C26 §7): pills paint the focused chip accent over the ground, and a selected chip default over it", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const muted = params(tone("muted", theme, caps));
    const wash = params(selectionStyle(theme, caps));
    const focusBg = params(focusStyle(theme, caps));
    // **Each ink on the ground it lands on** (C10 I48). A chip's tone is the
    // slot; which hex that slot takes is the ground's answer, and on `dark`'s
    // selection `muted` and `accent` are both values the page does not hold.
    const accentOnFocus = params(tone("accent", theme, caps, "focusGround"));
    const accentOnWash = params(tone("accent", theme, caps, "selection"));
    const mutedOnWash = params(tone("muted", theme, caps, "selection"));
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
    expect(cellOf(focused, "exited"), "the head chip is accent over the FOCUS ground").toEqual({ fg: accentOnFocus, bg: focusBg, attrs: [] });
    expect(cellOf(focused, "all"), "its neighbour is not").toEqual({ fg: muted, bg: "", attrs: [] });
    const withActive = block({ kind: "pills", id: "p", chips: [{ label: "all" }, { label: "exited" }, { label: "dead", active: true }] } as never);
    const activeFrame = renderToLines(registry, withActive, 60, { theme, capabilities: caps, focus: { blockId: "p", rowId: "chip-1" } });
    expect(cellOf(activeFrame, "dead"), "an active chip is accent with no ground — the datum").toEqual({ fg: accent, bg: "", attrs: [] });
    expect(cellOf(activeFrame, "exited"), "and the head beside it differs by the ground, and by the ink the ground composes").toEqual({ fg: accentOnFocus, bg: focusBg, attrs: [] });
    expect(cellOf(activeFrame, "dead")).not.toEqual(cellOf(activeFrame, "exited"));

    const selected = paint({ blockId: "p", rowId: "chip-2", selected: [pair("p", "chip-0"), pair("p", "chip-1"), pair("p", "chip-2")] });
    // **A selected chip keeps its own tone** (C11 I14 as amended, C10 I48). It
    // was forced to `default`, which was the drop-to-one-ink rule in a second
    // painter: there was one ink per slot and it was the page's, so a chip on a
    // wash could take its own tone or take a legible one and not both (F1240).
    expect(cellOf(selected, "all"), "chip-0 washed, its own tone on the wash").toEqual({ fg: mutedOnWash, bg: wash, attrs: [] });
    expect(cellOf(selected, "exited"), "chip-1 the same").toEqual({ fg: mutedOnWash, bg: wash, attrs: [] });
    expect(cellOf(selected, "dead"), "chip-2 is the head: accent, because a pill row has no gutter to put a mark in").toEqual({ fg: accentOnWash, bg: wash, attrs: [] });
    // And the head is still told from its neighbours by ink, which is what
    // `accent` buys here and does not buy in a table (C11 §5b).
    expect(mutedOnWash, "two inks, not one").not.toBe(accentOnWash);
    // **At 1-bit a focused chip is bold and NOT inverse** (C10 I47, R-SEL-006).
    // `focusStyle` answers `NO_STYLE` without colour and has no inverse rung on
    // purpose: inverse is selection's, and a second one would draw a focused chip
    // and a selected chip as the same frame. `accent`'s mono class is the weight
    // that is left. A *selected* chip still inverts, which is the row below.
    const monoFocus = capabilities({ colourDepth: 1 });
    const mono = renderToLines(registry, pills, 60, { theme, capabilities: monoFocus, focus: { blockId: "p", rowId: "chip-1" } });
    const monoCells = styledScreenFrom([mono.join("\r\n")], { columns: 60, rows: mono.length });
    const monoHead = styleAt(rowContaining(monoCells, "exited")!, "exited")!;
    expect(monoHead.attrs, "1-bit head: bold, and not inverse").toEqual([1]);
    expect(styleAt(rowContaining(monoCells, "all")!, "all")!.attrs).not.toContain(7);
    const monoSel = renderToLines(registry, pills, 60, { theme, capabilities: monoFocus, focus: { blockId: "p", rowId: "chip-2", selected: [pair("p", "chip-1"), pair("p", "chip-2")] } });
    const selCells = styledScreenFrom([monoSel.join("\r\n")], { columns: 60, rows: monoSel.length });
    expect(styleAt(rowContaining(selCells, "exited")!, "exited")!.attrs, "a selected chip inverts").toContain(7);

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
    // **The session's form** — `focusFor` writes the element's id, and a plot's
    // element is its block (C12 I85). This row constructed `rowId: null` for
    // three weeks and was green while a focused plot in a session painted
    // nothing (F802); the null form is a control below now.
    const focused = plotAt({ blockId: "p", rowId: "p" });

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

    // **The controls**: another row's id on this block, another block's focus, and
    // the `rowId: null` form no session writes — each paints nothing here.
    expect(plotAt({ blockId: "p", rowId: "r" })).toEqual(none);
    expect(plotAt({ blockId: "q", rowId: "q" })).toEqual(none);
    expect(plotAt({ blockId: "p", rowId: null })).toEqual(none);
  });

  it("T1.25 (C26 §7, F34): at 1-bit the same cells go from dim to bold — a weight, not a colour", () => {
    const none = plotAt(null, 1);
    const focused = plotAt({ blockId: "p", rowId: "p" }, 1);
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
    const muted = params(tone("muted", theme, caps));
    const none = scrollAt(6, null);
    // A scroll's elements are its children, so a focus inside it names a child.
    const focused = scrollAt(6, { blockId: "s", rowId: "n3" });
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const residueRow = none.findIndex((l) => /2 above, 1 below/u.test(l));
    expect(residueRow, "the fixture has a residue row, and it is the last").toBe(3);
    const diff = styleDiff(none, focused, 40);
    expect(diff.length, "exactly the residue text's cells").toBeGreaterThan(0);
    // **The box's chrome, which is now two things** (C26 §7, C09 I92, §021).
    // The residue row was the only chrome a scroll reserved; a box that
    // overflows also spends its last column on a bar, and §021 gives it the
    // same rule in the same words — *the thumb takes the ACCENT when its
    // container has focus, the same rule the focused-container border takes*.
    // So *and nothing else* still holds and its subject widened.
    expect(
      new Set(diff.map((d) => d.row)),
      "the residue row and the bar's column, and no other row",
    ).toEqual(new Set([0, 1, 2, residueRow]));
    for (const d of diff) {
      // **`dim` on the residue row and `muted` on the bar**, and both go to
      // `accent`: the residue's tone is C26 §7's and the bar's is §021's, and
      // they were not the same word to begin with.
      expect(d.was.fg, "the chrome's resting ink").toBe(d.row === residueRow ? dim : muted);
      expect(d.now.fg).toBe(accent);
    }
    const onResidue = diff.filter((d) => d.row === residueRow);
    expect(onResidue.map((d) => d.ch).join("").trim(), "the whole residue text and nothing beside it").toBe(
      "⋯ 2 above, 1 below",
    );
    // **One cell per interior row and it is the last**, which is what says the
    // bar is a column rather than a wash over the rows it sits beside.
    for (const row of [0, 1, 2]) {
      const cellsAt = diff.filter((d) => d.row === row);
      expect(cellsAt.length, `one cell on row ${String(row)}`).toBe(1);
      expect(cellsAt[0]?.col, "and it is the last column").toBe(39);
    }

    // **The consequence, said rather than absorbed**: three children in a
    // three-row box have no residue row, so focus paints nothing there.
    expect(scrollAt(3, { blockId: "s", rowId: "n2" }, 24, 0)).toEqual(scrollAt(3, null, 24, 0));
    // Another block's focus leaves the residue dim.
    expect(scrollAt(6, { blockId: "t", rowId: "n3" })).toEqual(none);
    // 1-bit: dim to bold on the residue row.
    const monoDiff = styleDiff(scrollAt(6, null, 1), scrollAt(6, { blockId: "s", rowId: "n3" }, 1), 40);
    // The bar is glyphs and not colour, so it is there at 1-bit too and takes
    // the same weight change the residue row takes.
    expect(new Set(monoDiff.map((d) => d.row))).toEqual(new Set([0, 1, 2, residueRow]));
    for (const d of monoDiff) {
      expect(d.was.attrs).toContain(2);
      expect(d.now.attrs).toContain(1);
    }
  });

  // --- plot3d — the frame is `scatter3.ts`'s, so it is lit there (C26 §7, C12 §3al) ---
  const PLOT3D = block({
    kind: "plot", id: "p3", form: "plot3d", height: 8, series: [], camera: {},
    points3: [
      { label: "a", points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 0 }] },
      { label: "b", points: [{ x: 1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 }] },
    ],
  } as never);
  const plot3dAt = (focus: FocusState | null, depth: 24 | 1 = 24) =>
    renderToLines(registry, PLOT3D, 60, { theme, capabilities: capabilities({ colourDepth: depth }), focus });

  it("T1.27 (C26 §7, C12 I85): a focused plot3d turns its frame accent — every moved cell was muted, the tick labels stay muted, no glyph moves", () => {
    const caps = capabilities({ colourDepth: 24 });
    const accent = params(tone("accent", theme, caps));
    const muted = params(tone("muted", theme, caps));
    const none = plot3dAt(null);
    // **The id the session writes**: `focusFor` puts the element's id in `rowId`,
    // and a plot's element is its block (C12 `elements()`). Measured before this
    // arm existed: zero rows differed under exactly this focus.
    const focused = plot3dAt({ blockId: "p3", rowId: "p3" });
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const diff = styleDiff(none, focused, 60);
    expect(diff.length, "the frame has cells to carry it").toBeGreaterThan(20);
    for (const d of diff) {
      expect(d.ch.trim(), `cell ${String(d.row)},${String(d.col)} is a glyph, not a blank`).not.toBe("");
      expect(d.was.fg, `${JSON.stringify(d.ch)} was muted`).toBe(muted);
      expect(d.now.fg, `${JSON.stringify(d.ch)} is accent`).toBe(accent);
    }
    // The scale keeps `muted`: a tick label's digits are not in the diff.
    const labelCells = diff.filter((d) => /[0-9.-]/u.test(d.ch));
    expect(labelCells, "no tick-label digit moved").toEqual([]);
    const screen = cellsOf(focused, 60);
    const labelRow = rowContaining(screen, "0.5");
    expect(labelRow, "the fixture has a tick label to read").not.toBeNull();
    expect(styleAt(labelRow!, "0.5")!.fg, "the tick label keeps muted").toBe(muted);

    // **The controls**: another block's focus paints nothing here — and so does
    // `rowId: null`, the form the 2-D rows above construct and no session writes
    // (C26 §7's recorded hole). This arm tests for the session's form only.
    expect(plot3dAt({ blockId: "q", rowId: "q" })).toEqual(none);
    expect(plot3dAt({ blockId: "p3", rowId: null })).toEqual(none);
  });

  it("T1.27 (C26 §7, F34): at 1-bit a focused plot3d goes from dim to bold on exactly its frame — a weight, not a colour — and the tick labels do not move", () => {
    // **The 3-D frame carries a `Style` a cell** (F803, closed the day it was
    // filed): `frameInkAt` holds `slot(...)` whole rather than its `.colour`, so
    // at 1-bit `muted` is `2m` and focus turns the frame `1m`, as `furniture.ts`
    // does for the 2-D frame. The row this replaces pinned the opposite — a frame
    // with no dim glyph to move — and its premise assertion is inverted below.
    const none = plot3dAt(null, 1);
    const focused = plot3dAt({ blockId: "p3", rowId: "p3" }, 1);
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const diff = styleDiff(none, focused, 60);
    expect(diff.length, "the frame's cells at 60 columns").toBeGreaterThan(20);
    for (const d of diff) {
      expect(d.was.attrs, `${JSON.stringify(d.ch)} was dim`).toContain(2);
      expect(d.now.attrs, `${JSON.stringify(d.ch)} is bold`).toContain(1);
      expect(d.now.attrs).not.toContain(2);
      expect(/\d/u.test(d.ch), "no tick label moved").toBe(false);
    }
    const dimCells = cellsOf(none, 60).flatMap((row) => row.filter((c) => c.ch.trim() !== "" && c.style.attrs.includes(2)));
    expect(dimCells.length, "the unfocused frame is dim — the weight is there to move").toBeGreaterThan(20);
    expect(plot3dAt({ blockId: "q", rowId: "q" }, 1), "another block's focus paints nothing here").toEqual(none);
  });

  // --- mosaic — no furniture of its own, so focus is invisible, and that is pinned (C26 §7) ---
  const MOSAIC = block({
    kind: "mosaic", id: "m", height: 4, areas: "ab/cd",
    children: [
      { kind: "notice", id: "a", tone: "info", text: "A" },
      { kind: "notice", id: "b", tone: "ok", text: "B" },
      { kind: "notice", id: "c", tone: "warn", glyph: "warn", text: "C" },
      { kind: "notice", id: "d", tone: "error", glyph: "error", text: "D" },
    ],
  } as never);
  const mosaicAt = (focus: FocusState | null) =>
    renderToLines(registry, MOSAIC, 60, { theme, capabilities: capabilities({ colourDepth: 24 }), focus });
  /** Non-blank cells of a frame that lie in none of the given rectangles — a mosaic's own furniture, if it had any. */
  const outsideRects = (lines: readonly string[], rects: readonly { left: number; top: number; width: number; height: number }[]) => {
    const screen = cellsOf(lines, 60);
    const out: { row: number; col: number; ch: string }[] = [];
    for (let row = 0; row < screen.length; row += 1) {
      for (let col = 0; col < 60; col += 1) {
        const ch = screen[row]![col]!.ch;
        if (ch.trim() === "") continue;
        const inside = rects.some((r) => row >= r.top && row < r.top + r.height && col >= r.left && col < r.left + r.width);
        if (!inside) out.push({ row, col, ch });
      }
    }
    return out;
  };

  it("T1.28 (C26 §7, C04 I71, C09 I100): a focused mosaic pane takes the region's ground — and every non-blank cell still lies inside a child's rectangle, so the ground is the whole of the treatment", () => {
    const none = mosaicAt(null);
    // **This row asserted *byte-identical* and the premise it rested on was
    // true** — which is why it survived being read. *No cell of the mosaic's
    // own to tone* is measured below and still holds; the rule it served was
    // *a tone on furniture the data draws*, and §017's focus model is
    // **grounds**, which need no furniture. C26 §7 is amended and C09 I100 is
    // the rule: a pane is a *region*, so it takes `focusGround`.
    //
    // A mosaic's elements are its children (C26 §4b cell 3), so a focus inside it names one.
    const litB = mosaicAt({ blockId: "m", rowId: "b" });
    expect(litB, "focus on a cell is no longer invisible").not.toEqual(none);
    const ground = sgr(focusStyle(theme, capabilities({ colourDepth: 24 })));
    expect(litB.join("\n"), "the pane takes the region's ground").toContain(ground);
    // **And the ground is all of it** (`R-FOC-004`, *rather than painting its
    // data*): strip it and the frame is what the unfocused one drew.
    expect(
      litB.map((l) => l.replaceAll(ground, "").replace(/\u001b\[49m/gu, "").trimEnd()),
      "inside untouched",
    ).toEqual(none.map((l) => l.trimEnd()));
    // **A different pane, so the row cannot pass on a container that grounds
    // every cell**: `d`'s frame is not `b`'s.
    expect(mosaicAt({ blockId: "m", rowId: "d" }), "each pane is its own").not.toEqual(litB);
    // **The structural half, which was always the sound one.** The row goes
    // red the day the mosaic draws a gap, a rail or a border of its own — which
    // is the day the residue-row precedent applies as well.
    const parsed = parseAreas("ab/cd");
    if (!parsed.ok) throw new Error(parsed.fault);
    const rects = mosaicRects(parsed.grid, 60, 4, undefined, undefined);
    expect(rects, "four cells, two by two").toHaveLength(4);
    expect(none.map((l) => l.replace(SGR, "")).join("").trim(), "the fixture draws its children").toContain("A");
    expect(outsideRects(none, rects), "no non-blank cell outside a child's rectangle").toEqual([]);
    // **The instrument responds**: one glyph painted into the gap between
    // rows — where a rail would be — is reported.
    const narrowed = rects.map((r) => ({ ...r, width: Math.min(r.width, 29) }));
    expect(outsideRects(none, narrowed), "the frame itself has nothing in the column the narrowing exposes").toEqual([]);
    const forged = none.map((l, i) => (i === 1 ? `${" ".repeat(29)}│` : l));
    expect(outsideRects(forged, narrowed)).toEqual([{ row: 1, col: 29, ch: "│" }]);
  });

  // --- notice — with an action it is a button, and a focused button is painted (C26 §7, C04 §3) ---
  const RETRY = { kind: "fill", label: "retry", command: "pull" } as const;
  // **A call head and not a button** (C09 I83 as I102 amends it). This fixture
  // carried `action: RETRY`, which makes it a *button* — and a focused button
  // takes the chosen pair, not `focusGround`. The two members of the focus ring
  // were one when this row was written, so it was reading the call head's rule
  // off the button's only instance. `state` is the other member, and it is the
  // one this invariant governs.
  const NOTICE = block({ kind: "notice", id: "n", tone: "error", glyph: "error", text: "pull failed", state: "failed" } as never);
  const BUTTON = block({ kind: "notice", id: "n", tone: "error", glyph: "error", text: "pull failed", action: RETRY } as never);
  const PLAIN = block({ kind: "notice", id: "n", tone: "error", glyph: "error", text: "pull failed" } as never);
  const noticeAt = (b: typeof NOTICE, focus: FocusState | null, depth: 24 | 1 = 24) =>
    renderToLines(registry, b, 40, { theme, capabilities: capabilities({ colourDepth: depth }), focus });

  it("T1.75b (C09 I45, C14 I54, R-THM-005): a washed call head on the selection band takes the state's own mark", () => {
    const STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
    const caps = capabilities({ colourDepth: 24 });
    const WASHED: ReadonlySet<string> = new Set(["n"]);
    const headOf = (t: typeof theme, state: (typeof STATES)[number], washed?: ReadonlySet<string>): string => {
      const b = block({ kind: "notice", id: "n", tone: "info", glyph: "running", text: "x", state } as never);
      const [first] = renderToLines(registry, b, 20, { theme: t, capabilities: caps, focus: null, ...(washed === undefined ? {} : { washed }) });
      return [...(first ?? "").replace(SGR, "")][0] ?? "";
    };
    const running = glyphFor("running", caps);
    const own = STATES.map((s) => glyphFor(headMark(s, capabilities({ colourDepth: 1 })), caps));
    for (const variant of ["hcDark", "hcLight"] as const) {
      const loaded = loadTheme(defaultTheme, variant);
      if (!loaded.ok) throw new Error(`${variant} must load`);
      const hc = loaded.value.current;
      expect(STATES.map((s) => headOf(hc, s, WASHED)), `${variant}: washed, the state's own mark`).toEqual(own);
      expect(STATES.map((s) => headOf(hc, s)), `${variant}: not washed, ●`).toEqual(STATES.map(() => running));
      // A washed set naming another block leaves this head alone.
      expect(headOf(hc, "failed", new Set(["other"])), `${variant}: another block's wash`).toBe(running);
    }
    // The control: `dark` does not band its selection, so `washed` moves nothing.
    expect(STATES.map((s) => headOf(theme, s, WASHED)), "dark: washed, still ●").toEqual(STATES.map(() => running));
  });

  it("T1.75 (C09 I45, C10 I45, R-THM-005): a focused call head on a band takes the state's own mark, and the page keeps ●", () => {
    const STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
    const caps = capabilities({ colourDepth: 24 });
    const headOf = (t: typeof theme, state: (typeof STATES)[number], focus: FocusState | null): string => {
      const b = block({ kind: "notice", id: "n", tone: "info", glyph: "running", text: "x", state } as never);
      const [first] = renderToLines(registry, b, 20, { theme: t, capabilities: caps, focus });
      return [...(first ?? "").replace(SGR, "")][0] ?? "";
    };
    const FOCUS = { blockId: "n", rowId: "n" };
    const running = glyphFor("running", caps);
    for (const variant of ["hcDark", "hcLight"] as const) {
      const loaded = loadTheme(defaultTheme, variant);
      if (!loaded.ok) throw new Error(`${variant} must load`);
      const hc = loaded.value.current;
      // Every state's own mark, and five of them: the band spends the tone,
      // so shape is the carrier left — the 1-bit rung, asked of the cell.
      const focused = STATES.map((s) => headOf(hc, s, FOCUS));
      expect(focused, `${variant}: the state's own mark on the band`).toEqual(
        STATES.map((s) => glyphFor(headMark(s, capabilities({ colourDepth: 1 })), caps)),
      );
      expect(new Set(focused).size, `${variant}: five states, five marks`).toBe(5);
      // **The band is found by its name** (C10 I45): the theme having bands is
      // not every ground being one. `bgElev` is where the page's heads sit in a
      // card, and it is no band in either theme.
      expect(isBand(hc, "focusGround"), `${variant}: focus is a band`).toBe(true);
      expect(isBand(hc, "bgElev"), `${variant}: the elevated page is not`).toBe(false);
      // Off the band the same theme keeps the collapse: tone still carries.
      expect(STATES.map((s) => headOf(hc, s, null)), `${variant}: the page keeps ●`).toEqual(STATES.map(() => running));
    }
    // The control: `dark`'s focus ground is not a band, so focus moves nothing.
    expect(STATES.map((s) => headOf(theme, s, FOCUS)), "dark: focused, still ●").toEqual(STATES.map(() => running));
  });

  it("T1.29 (C26 §7, C04 §3, C09 I83): a focused notice keeps its own tone over the focus ground — glyph and text; one without an action declares nothing and cannot move", () => {
    const caps = capabilities({ colourDepth: 24 });
    const error = params(tone("error", theme, caps));
    // **The tone on the ground is a different value from the tone on the page**
    // (C10 I48): `dark` composes `#fa6464` for `tone.error` on `focusGround`,
    // where the page's is `#f05a5a`. Resolved rather than written out, so the
    // row is the rule and not this theme's numbers.
    const errorOnFocus = params(tone("error", theme, caps, "focusGround"));
    const focusBg = params(focusStyle(theme, caps));
    // **The head's mark is resolved from its state** (I45), so the character
    // this row looks for is `headMark`'s answer and not the `error` glyph's `✗` — and above one bit every state collapses onto `●`, the `running` slot, which is the M4 rung.
    const mark = glyphFor(headMark("failed", caps), caps);
    const none = noticeAt(NOTICE, null);
    const focused = noticeAt(NOTICE, { blockId: "n", rowId: "n" });
    expect(focused.map((l) => l.replace(SGR, ""))).toEqual(none.map((l) => l.replace(SGR, "")));
    const at = (lines: readonly string[], text: string) => {
      const row = rowContaining(cellsOf(lines, 40), text);
      if (row === null) throw new Error(`no row holds ${text}`);
      const s = styleAt(row, text);
      if (s === null) throw new Error(`no cell holds ${text}`);
      return s;
    };
    expect(at(none, "pull failed"), "unfocused: the tone, no ground").toEqual({ fg: error, bg: "", attrs: [] });
    // **The notice keeps its own tone over the FOCUS ground** (C09 I83, C10 I47).
    // It was `accent` over the *selection* ground, which dropped the tone so a
    // focused `info` notice would not read as an unfocused `accent` one — a
    // workaround for focus and selection sharing a ground. They no longer do, so
    // the tone stays the notice's: *colour is declared, not inherited* (§017).
    // **And it is resolved against the ground** (C10 I48): the notice's own
    // tone is the slot, and which hex that slot takes is the ground's answer.
    expect(at(focused, "pull failed"), "focused: its own tone over the focus ground").toEqual({ fg: errorOnFocus, bg: focusBg, attrs: [] });
    expect(at(focused, mark), "the head mark keeps its character and takes the same paint").toEqual({ fg: errorOnFocus, bg: focusBg, attrs: [] });
    // And the two are not one value, so the row is not satisfied by a painter
    // that never asks which ground it is on (F1240).
    expect(errorOnFocus, "the ground moves the ink").not.toBe(error);
    expect(at(none, mark).fg).toBe(error);

    // **The element, as a count** (C09): one with an action, none without.
    // **The element half is the BUTTON's**, and it is the half that made this
    // fixture a button in the first place.
    const withAction = registry.elementsIn([BUTTON], 40);
    expect(withAction).toHaveLength(1);
    expect(withAction[0]?.element).toMatchObject({ id: "n", level: "block", activate: RETRY, copy: "pull failed" });
    expect(withAction[0]?.element.rows).toEqual({ from: 0, to: 1 });
    expect(registry.elementsIn([PLAIN], 40), "no action, no element").toHaveLength(0);
    // And the plain notice cannot be reached by focus, so no frame of it moves.
    expect(noticeAt(PLAIN, { blockId: "n", rowId: "n" })).toEqual(noticeAt(PLAIN, null));
    // Controls: another block's focus, and the `rowId: null` form no session writes.
    expect(noticeAt(NOTICE, { blockId: "q", rowId: "q" })).toEqual(none);
    expect(noticeAt(NOTICE, { blockId: "n", rowId: null })).toEqual(none);

    // **1-bit: no ground, and no inverse** (C09 I83, C10 I47). `focusGround`
    // answers `NO_STYLE` without colour and `focusStyle` has no inverse rung —
    // inverse is selection's, and a notice is not selectable. What is left is the
    // notice's own tone at its mono class, which is `error`'s: the frame says
    // *this went wrong* and says nothing false about focus.
    const mono = noticeAt(NOTICE, { blockId: "n", rowId: "n" }, 1);
    expect(at(mono, "pull failed").attrs, "no inverse at 1-bit").not.toContain(7);
    expect(at(mono, "pull failed")).toEqual(at(noticeAt(NOTICE, null, 1), "pull failed"));
  });
});

/**
 * C11 §5b — the reserved focus column, and the sentinel's kind.
 *
 * **The content column is the assertion, not the mark.** A reservation that
 * appeared with the fact renders identically in the focused frame; the only
 * place the two mechanisms differ is the frame where nothing is drawn.
 */
describe("C11 §5b — the reserved gutter", () => {
  const registry = measurable({ definitions: [tableDefinition] }).registry;
  const caps24 = capabilities({ colourDepth: 24 });
  const styled = (lines: readonly string[]) =>
    styledScreenFrom([lines.join("\r\n")], { columns: 60, rows: lines.length });
  const scene = (focus: FocusState | null): readonly string[] =>
    renderToLines(registry, TABLE as never, 60, { theme, capabilities: caps24, focus });
  const lineWith = (lines: readonly string[], name: string): string =>
    visible(lines.find((l) => visible(l).includes(name)) ?? "");
  const contentAt = (lines: readonly string[], name: string): number => lineWith(lines, name).indexOf(name);
  const pairOf = (blockId: string, rowId: string) => ({ blockId, rowId });

  it("T2.11 (C11 I15, C11 I14, C11 §5b): the focus gutter is reserved on every row, whatever its state", () => {
    const frames = {
      nothing: scene(null),
      focused: scene({ blockId: "t", rowId: "c" }),
      selected: scene({ blockId: "t", rowId: "a", selected: [pairOf("t", "a"), pairOf("t", "c")] }),
      both: scene({ blockId: "t", rowId: "c", selected: [pairOf("t", "a"), pairOf("t", "c")] }),
    };
    // **The column the ink begins at, in all four frames, header included.** This
    // is the whole row: a gutter that appeared with focus would give three of
    // these one number and one another, and every assertion about the *mark*
    // would still pass in all four. The header is in the set because the
    // reservation is the block's and not the body's — the columns beneath it
    // have to stay one axis (C09 I82's rule from the other side).
    const cols = Object.fromEntries(
      Object.entries(frames).map(([k, f]) => [k, [contentAt(f, "charlie"), contentAt(f, "Name")]]),
    );
    const first = cols["nothing"];
    for (const [name, got] of Object.entries(cols)) {
      expect(got, `${name}: the content edge does not move`).toEqual(first);
    }
    expect(first?.[0] ?? 0, "and it is past the reserved column").toBeGreaterThanOrEqual(GUTTER_CELLS);

    // **Header against body, in each frame on its own.** The set above is
    // compared *across* frames, and a header that left the reservation moves in
    // all four together — so the cross-frame comparison is blind to it and a
    // comment saying the header is in the set is not an assertion that it is
    // (measured: the mutation was caught elsewhere, not here). The columns
    // beneath a header have to stay one axis, which is C09 I82's rule from the
    // other side.
    for (const [name, f] of Object.entries(frames)) {
      expect(contentAt(f, "Name"), `${name}: the header sits on the body's axis`).toBe(contentAt(f, "charlie"));
    }

    // **And the rows a detail draws**, which are emitted on their own path and
    // so can forget the gutter while every parent row keeps it — geometry that
    // measures correctly and is wrong. Narrow enough that a column is dropped,
    // which is what gives the row a detail at all.
    const CHILD = { kind: "code", id: "kid", language: "text", text: "what was lost\nand a second row" };
    const expanded = {
      ...TABLE,
      rows: ROWS.map((r) => (r.id === "c" ? { ...r, expanded: true, detail: [CHILD] } : r)),
    };
    const detail = renderToLines(registry, expanded as never, 60, {
      theme,
      capabilities: caps24,
      focus: { blockId: "t", rowId: "c" },
    }).map(visible);
    const kids = detail.filter((l) => l.includes("what was lost") || l.includes("and a second row"));
    expect(kids, "the frame draws the detail's rows").toHaveLength(2);
    // **The column, not the cells.** A detail row's own indent is spaces too, so
    // slicing the reserved cells off and finding them blank is satisfied by a
    // frame that never reserved them — the mutation dropping `blank` from this
    // path survived exactly that assertion. What moves is where the text starts:
    // inside the gutter, so strictly right of the row the detail belongs to.
    const bodyEdge = contentAt(detail, "charlie");
    for (const line of kids) {
      const ink = line.length - line.trimStart().length;
      expect(ink, `a detail row is inset inside the gutter: ${JSON.stringify(line)}`).toBeGreaterThan(bodyEdge);
      expect(line.length, "and no row outruns the width").toBeLessThanOrEqual(60);
    }

    // The marks differ where the edge does not.
    const marked = (lines: readonly string[], name: string): boolean => lineWith(lines, name).startsWith("\u25b8");
    expect(marked(frames.nothing, "charlie"), "nothing focused").toBe(false);
    expect(marked(frames.focused, "charlie"), "focused").toBe(true);
    expect(marked(frames.selected, "charlie"), "selected but not the head").toBe(false);
    expect(marked(frames.both, "charlie"), "focused and selected keeps the mark").toBe(true);
  });

  it("T2.12 (C11 I14, C26 I16): the sentinel is a kind, not a size", () => {
    const cellAt = (lines: readonly string[], name: string) => {
      const row = rowContaining(styled(lines), name);
      const c = row === null ? null : styleAt(row, name);
      if (c === null) throw new Error(`no cell holds ${name}`);
      return c;
    };
    const wash = params(selectionStyle(theme, caps24));
    const focusBg = params(focusStyle(theme, caps24));

    // `selected` **absent** is the head alone — C26 I16's sentinel — so the head
    // takes the focus ground.
    const sentinel = scene({ blockId: "t", rowId: "c" });
    expect(cellAt(sentinel, "charlie").bg, "absent: focus owns the ground").toBe(focusBg);
    // `selected` **present** naming only the head is a *real* one-element
    // selection, and R-SEL-006 gives selection the ground. A test on the extent's
    // **size** paints this as focus and calls that the sentinel, which is what
    // the previous form of T1.23 pinned — in the test rather than in the type.
    const one = scene({ blockId: "t", rowId: "c", selected: [pairOf("t", "c")] });
    expect(cellAt(one, "charlie").bg, "present, one element: selection owns it").toBe(wash);
    expect(one, "so the two are not one frame").not.toEqual(sentinel);
    // And the mark is on the head in both, which is what keeps focus readable
    // once selection has taken the ground.
    for (const [name, f] of [["absent", sentinel], ["one element", one]] as const) {
      expect(lineWith(f, "charlie"), `${name}: the mark`).toContain("\u25b8 ");
    }
  });
});

/**
 * C11 I14 as amended — a row on a ground keeps its cells' tones.
 *
 * **The rule this replaces was true of a resolver that could not answer.** A
 * focused or selected row was repainted in one ink — `accent`, or `default`
 * under selection — and a span's tone was dropped with it, because there was one
 * ink per slot and it was the page's: a `failed` cell on a wash could take its
 * own tone or take a legible one and not both. C10 I48's resolver takes the
 * ground, so the two stopped being alternatives (F1240).
 *
 * Asserted through the resolver on the ground rather than against a hex, so the
 * rows are the rule and not this theme's current values.
 */
describe("C11 I14 — the ink a focused or selected row takes", () => {
  const registry = measurable({ definitions: [tableDefinition] }).registry;
  const caps24 = capabilities({ colourDepth: 24 });
  const TONED = {
    kind: "table",
    id: "t",
    columns: COLUMNS,
    rows: [
      { id: "a", cells: { name: { text: "alpha" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
      {
        id: "b",
        cells: {
          // **A span tone the theme composes on both grounds**, which the
          // mutation pass asked for (F1242): the first form used `identifier`,
          // and `dark` composes nothing for it on either ground — so the span
          // half of this row held whether or not `paintRuns` was told which
          // ground it was painting on. A fixture has to be shown to respond to
          // the thing under test (`test/support/README.md`). `error` moves on
          // both, which the guard below asserts rather than assumes.
          name: { text: "bravo", spans: [{ from: 0, to: 5, tone: "error" }] },
          state: { text: "failed", tone: "error", glyph: "error" },
        },
      },
    ],
  };
  const scene = (focus: FocusState | null, t = theme): readonly string[] =>
    renderToLines(registry, TONED as never, 60, { theme: t, capabilities: caps24, focus });
  const inkOfCell = (lines: readonly string[], needle: string): string => {
    const grid = styledScreenFrom([lines.join("\r\n")], { columns: 60, rows: lines.length });
    const row = rowContaining(grid, needle);
    const cell = row === null ? null : styleAt(row, needle);
    if (cell === null) throw new Error(`no cell holds ${needle}`);
    return cell.fg;
  };

  it("T2.13 (C11 I14, C10 I48, C10 §4k.2 row 1, F1240): a focused or selected row keeps every cell's own tone", () => {
    // Focus alone: the row takes `focusGround`, so every ink is the value the
    // theme composed for that ground.
    const focused = scene({ blockId: "t", rowId: "b" });
    expect(inkOfCell(focused, "failed"), "failure keeps its tone, on the focus ground").toBe(
      params(tone("error", theme, caps24, "focusGround")),
    );
    expect(inkOfCell(focused, "bravo"), "and a span keeps its own").toBe(
      params(tone("error", theme, caps24, "focusGround")),
    );
    // **The fixture responds to the thing under test.** Both grounds move this
    // tone, so a painter that resolved the span on the page would fail here.
    for (const ground of ["focusGround", "selection"] as const) {
      expect(
        params(tone("error", theme, caps24, ground)),
        `${ground} composes a different ink for the span's tone`,
      ).not.toBe(params(tone("error", theme, caps24)));
    }

    // Selection takes the ground where both hold, so the inks move with it —
    // one expression in `definition.ts` answers both halves, which is what stops
    // a row washed with one surface being inked for another.
    const selected = scene({ blockId: "t", rowId: "b", selected: [{ blockId: "t", rowId: "b" }] });
    expect(inkOfCell(selected, "failed"), "and on the selection ground").toBe(
      params(tone("error", theme, caps24, "selection")),
    );

    // **The old rule's two values are what the frame must not hold.** Named
    // rather than merely absent: an assertion that the ink equals the composed
    // value passes on a theme where the composition happens to equal `accent`,
    // and `dark` is not that theme.
    for (const wrong of ["accent", "default"] as const) {
      expect(inkOfCell(selected, "failed"), `not the ${wrong} the drop-to-one-ink rule painted`).not.toBe(
        params(tone(wrong, theme, caps24)),
      );
    }

    // **A banded theme is the same rule and not an exception** (R-THM-005): the
    // band answers for every slot, so the row does read as one ink — the
    // one-ink reading kept exactly where it was ever true.
    const hc = loadTheme(defaultTheme, "hcDark");
    if (!hc.ok) throw new Error("hcDark must load");
    const banded = scene({ blockId: "t", rowId: "b", selected: [{ blockId: "t", rowId: "b" }] }, hc.value.current);
    expect(inkOfCell(banded, "failed"), "the band's single ink").toBe(
      params(tone("error", hc.value.current, caps24, "selection")),
    );
    expect(inkOfCell(banded, "failed"), "and every other slot takes it too").toBe(
      params(tone("ok", hc.value.current, caps24, "selection")),
    );
  });

  it("T6.25 (C11 I14, C10 I48, F1240): restoring the drop-to-one-ink map → T2.13 fails", () => {
    // **The revert simulated at its own seam**, since the map it restores was
    // five lines in `rowSpans`: force the row's ink to `default` and the frame
    // holds a value the ground never composed. The row is the *difference* — a
    // revert that produced the same bytes would be a rule with nothing to be
    // wrong about (A03 §2).
    const reverted = params(tone("default", theme, caps24));
    const selected = scene({ blockId: "t", rowId: "b", selected: [{ blockId: "t", rowId: "b" }] });
    expect(inkOfCell(selected, "failed"), "the frame does not hold the reverted ink").not.toBe(reverted);
    expect(reverted, "and the reverted ink is not what the ground composes").not.toBe(
      params(tone("error", theme, caps24, "selection")),
    );
  });
});
