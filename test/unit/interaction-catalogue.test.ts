// `tools/interaction-catalogue.mjs` — the focus and selection corpus's own fixture.
//
// **What a catalogue's fixture can honestly assert**: not the picture, but that
// the corpus renders, that the frames respond to the state they are named for,
// and — the row this corpus exists for — that the 1-bit arm still carries the
// selection when the colour is gone. The 1-bit PNG showed *no* selection on the
// day the corpus was first rendered while the bytes carried `7m`: the
// rasteriser had no arm for reverse video (`catalogue-png.mjs`'s header). IC4
// is the row that would have said so.
import { describe, expect, it } from "vitest";

import { tone, focusStyle, selectionStyle } from "../../src/presentation/blocks/paint.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { sgr } from "../../src/terminal/escapes.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS } from "../../tools/plot-catalogue.mjs";
import { parseLine, unparsedSgr } from "../../tools/catalogue-png.mjs";
import { SCENES, WIDTH, everyFrame, frameFor } from "../../tools/interaction-catalogue.mjs";
import { styledScreenFrom, rowContaining, styleAt } from "../support/styled-screen.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const caps = CAPS as readonly { name: string; caps: TerminalCapabilities }[];
const capsNamed = (name: string): TerminalCapabilities => {
  const hit = caps.find((c) => c.name === name);
  if (hit === undefined) throw new Error(`no capability arm ${name}`);
  return hit.caps;
};
const scene = (name: string) => {
  const s = SCENES[name];
  if (s === undefined) throw new Error(`no scene ${name}`);
  return s;
};

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;
const params = (style: ReturnType<typeof tone>): string => sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");

const styled = (lines: readonly string[]) => styledScreenFrom([lines.join("\r\n")], { columns: WIDTH, rows: lines.length });
const cellOf = (lines: readonly string[], name: string) => {
  const row = rowContaining(styled(lines), name);
  const s = row === null ? null : styleAt(row, name);
  if (s === null) throw new Error(`no cell holds ${name}`);
  return s;
};

describe("interaction-catalogue — the corpus renders", () => {
  it("IC1: every scene renders at every arm, and no frame is empty", () => {
    let rendered = 0;
    const scenes = Object.keys(SCENES);
    expect(scenes.length, "scenes").toBeGreaterThanOrEqual(6); // cells-ok — a scene count
    for (const { sceneName, capsName, frame } of everyFrame()) {
      const body = frame.split("\n").slice(1);
      expect(body.length, `${sceneName} at ${capsName} rendered no rows`).toBeGreaterThan(0); // cells-ok — a row count
      expect(frame.split("\n")[0]).toContain(sceneName);
      rendered += 1;
    }
    console.log(`interaction-catalogue — ${String(rendered)}/${String(scenes.length * caps.length)} rows`);
    expect(rendered).toBe(scenes.length * caps.length);
  });

  it("IC2 (C11 I14): the selection scene at 24-bit washes a and b, accents c, leaves d — the same frame the session draws", () => {
    const c = capsNamed("24bit");
    const accent = params(tone("accent", theme, c));
    const wash = params(selectionStyle(theme, c));
    const focusBg = params(focusStyle(theme, c));
    // Each ink on the ground it lands on (C10 I48): a row keeps its cells' own
    // tones and the ground decides what each of them inks as.
    const plainOnWash = params(tone("default", theme, c, "selection"));
    const plainOnFocus = params(tone("default", theme, c, "focusGround"));
    const lines = frameFor(scene("table-selection"), c);
    expect(cellOf(lines, "alpha")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(cellOf(lines, "bravo")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    // **The head is inside the extent, so selection owns its ground** (R-SEL-006,
    // C10 I47) and `▸` in the reserved column is what focus keeps. Its cells are
    // inked like every other row's, on the ground the row took (C11 I14, F1240).
    expect(cellOf(lines, "charlie")).toEqual({ fg: plainOnWash, bg: wash, attrs: [] });
    expect(accent, "and not accent, which the retired rule painted here").not.toBe(plainOnWash);
    expect(cellOf(lines, "delta").bg).toBe("");
    // **The frame responds to the thing under test**: the focus scene, same
    // table, washes nothing and puts `bravo` on the focus ground — a *different*
    // ground, which is the whole of this change.
    const focus = frameFor(scene("table-focus"), c);
    expect(cellOf(focus, "bravo")).toEqual({ fg: plainOnFocus, bg: focusBg, attrs: [] });
    expect(focusBg, "and the two grounds are not one").not.toBe(wash);
    for (const name of ["alpha", "charlie", "delta"]) expect(cellOf(focus, name).bg, `${name} unwashed`).toBe("");
  });

  it("IC3 (C11 I14): the cross-block scene hands one extent to two blocks and each keeps its own pairs", () => {
    const c = capsNamed("24bit");
    const wash = params(selectionStyle(theme, c));
    const lines = frameFor(scene("entry-cross-block-selection"), c);
    expect(cellOf(lines, "charlie").bg, "table row c, selected").toBe(wash);
    expect(cellOf(lines, "delta").bg, "table row d, selected").toBe(wash);
    expect(cellOf(lines, "alpha").bg, "table row a, outside").toBe("");
    expect(cellOf(lines, "all").bg, "chip-0, selected").toBe(wash);
    expect(cellOf(lines, "exited").bg, "chip-2, outside").toBe("");
  });

  it("IC4 (C11 I14, C10 §4b): at 1-bit the selected rows are reverse video and the rasteriser parses it", () => {
    const c = capsNamed("1bit");
    const lines = frameFor(scene("table-selection"), c);
    expect(cellOf(lines, "alpha").attrs).toContain(7);
    expect(cellOf(lines, "bravo").attrs).toContain(7);
    // **The head inverts too, and `▸` is what tells it apart** (R-SEL-006: at
    // 1-bit the selection is reverse video while the focus mark persists). This
    // read *the head is not inverse*, which was true when one ground served both
    // facts and left focus with no carrier once colour was gone.
    expect(cellOf(lines, "charlie").attrs, "the head is inside the extent, so it inverts").toContain(7);
    expect(cellOf(lines, "delta").attrs).not.toContain(7);

    // **The instrument's half.** On the day this corpus was first rendered the
    // bytes carried `7m` and the PNG carried nothing: `unparsedSgr` answered
    // `[7]`. The arm exists now; this is the watcher that says it still does,
    // and it is asserted on the *frame* the tool writes rather than on a string.
    const frame = lines.join("\n");
    expect(unparsedSgr(frame), "every SGR in the 1-bit selection frame is parsed").toEqual([]);
    const spans = parseLine(lines.find((l) => l.includes("alpha"))!) as readonly { text: string; colour: string; background: string | null }[];
    const alpha = spans.find((s) => s.text.includes("alpha"));
    expect(alpha?.background, "an inverse run is drawn with a filled cell").not.toBeNull();
  });

  it("IC5 (C26 §7): a focus inside the scrolled container turns exactly the residue row accent — and a table under block focus still paints nothing", () => {
    // **Flipped from byte-identical** (F769's recorded residue, ruled in C26
    // §7): the scroll's residue row is the one set of cells the box reserves
    // whether or not a reader is in it, and it now carries the focus. Asserted
    // as *which cells*, because a frame that merely differs would pass with the
    // highlight on a child. The scene is the catalogue's own, under a focus
    // naming one of its children — a scroll's elements are its children.
    const c = capsNamed("24bit");
    const accent = params(tone("accent", theme, c));
    const dim = params(tone("dim", theme, c));
    const muted = params(tone("muted", theme, c));
    const none = frameFor(scene("scroll-midstream"), c);
    const focused = frameFor({ ...scene("scroll-midstream"), focus: { blockId: "s", rowId: "n4" } }, c);
    const plain = (lines: readonly string[]) => lines.map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""));
    expect(plain(focused), "no glyph moves").toEqual(plain(none));
    const a = styled(none);
    const b = styled(focused);
    const moved: { row: number; ch: string; was: string; now: string }[] = [];
    for (let row = 0; row < a.length; row += 1) {
      for (let col = 0; col < WIDTH; col += 1) {
        const x = a[row]![col]!;
        const y = b[row]![col]!;
        if (JSON.stringify(x.style) !== JSON.stringify(y.style)) moved.push({ row, ch: x.ch, was: x.style.fg, now: y.style.fg });
      }
    }
    expect(moved.length).toBeGreaterThan(0);
    // **The box's chrome is two things now** (C26 §7, C09 I92, §021): the
    // residue row and the bar's column, both reserved whether or not a reader
    // is in the box, and §021 gives the bar the same rule in the same words —
    // *the thumb takes the ACCENT when its container has focus*.
    expect(
      new Set(moved.map((m) => m.row)),
      "the residue row and the bar's column, and no other row",
    ).toEqual(new Set([0, 1, 2, 3]));
    expect(
      moved.filter((m) => m.row === 3).map((m) => m.ch).join("").trim(),
    ).toBe("⋯ 2 above, 1 below");
    for (const m of moved) {
      // `dim` is the residue row's resting ink and `muted` is the bar's; they
      // were never the same word, and both go to `accent`.
      expect(m.was).toBe(m.row === 3 ? dim : muted);
      expect(m.now).toBe(accent);
    }

    // **Still recorded, not approved**: a table under `rowId: null` paints
    // nothing. The scene is the catalogue's and the remainder is C11's (C26 §7
    // names it), so the row keeps pinning it until that renderer reads it.
    const blockFocus = frameFor(scene("table-block-focus"), c);
    const tableNone = frameFor({ ...scene("table-block-focus"), focus: null }, c);
    expect(blockFocus).toEqual(tableNone);
  });

  it("IC7 (C26 §7, F769): the focused inactive chip and the active chip beside it are no longer one colour", () => {
    // **The frame F769 recorded**: `pills-focus-24bit` drew `running` (active)
    // and `exited` (the head) both `38;2;232;168;124`. The head now carries the
    // selection ground and the active chip does not.
    const c = capsNamed("24bit");
    const accent = params(tone("accent", theme, c));
    const lines = frameFor(scene("pills-focus"), c);
    expect(cellOf(lines, "exited"), "the head: accent over the focus ground").toEqual({ fg: accent, bg: params(focusStyle(theme, c)), attrs: [] });
    expect(cellOf(lines, "running"), "the active chip: accent, no ground").toEqual({ fg: accent, bg: "", attrs: [] });
    expect(cellOf(lines, "all").bg, "an ordinary chip has no ground").toBe("");
    // **At 1-bit the head is bold and NOT inverse** (C10 I47): `focusStyle` has
    // no inverse rung, because inverse is selection's and a second one would draw
    // a focused chip and a selected one as the same frame. The head and the
    // active chip are then both bold — which is the cost of a scene with no
    // selection in it, and the reason `▸` exists one block-kind over (C11 §5b).
    const mono = frameFor(scene("pills-focus"), capsNamed("1bit"));
    expect(cellOf(mono, "exited").attrs, "bold, and no inverse").toEqual([1]);
    expect(cellOf(mono, "running").attrs).toContain(1);
    expect(cellOf(mono, "running").attrs).not.toContain(7);
  });

  it("IC8 (C26 §7, C04 §3, C09 I83): the focused notice keeps its own tone over the focus ground and the plain notice beside it is untouched", () => {
    const c = capsNamed("24bit");
    const info = params(tone("info", theme, c));
    const lines = frameFor(scene("notice-action-focus"), c);
    // **Its own tone over the focus ground** (C09 I83): a notice keeps the tone
    // it declared, which the shared-ground mechanism could not express.
    // The slot is the notice's and the hex is the ground's answer (C10 I48).
    const errorOnFocus = params(tone("error", theme, c, "focusGround"));
    expect(cellOf(lines, "image pull failed"), "the button, focused").toEqual({ fg: errorOnFocus, bg: params(focusStyle(theme, c)), attrs: [] });
    expect(cellOf(lines, "✗"), "its glyph too").toEqual({ fg: errorOnFocus, bg: params(focusStyle(theme, c)), attrs: [] });
    expect(errorOnFocus, "the ground moves the ink").not.toBe(params(tone("error", theme, c)));
    expect(cellOf(lines, "no containers"), "the plain notice: its tone, no ground").toEqual({ fg: info, bg: "", attrs: [] });
    const mono = frameFor(scene("notice-action-focus"), capsNamed("1bit"));
    // **No ground and no inverse at 1-bit** (C09 I83): the notice keeps its own
    // tone at its mono class, and says nothing false about focus.
    expect(cellOf(mono, "image pull failed").attrs, "no inverse").not.toContain(7);
    expect(cellOf(mono, "no containers").attrs).not.toContain(7);
  });

  it("IC6 (C04 I49): the scrolled container mid-stream shows the residue row for both directions", () => {
    const c = capsNamed("24bit");
    const plain = frameFor(scene("scroll-midstream"), c).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""));
    expect(plain).toHaveLength(4); // cells-ok — a row count: height 3 plus the residue
    expect(plain[0]).toContain("line 3");
    expect(plain[2]).toContain("line 5");
    expect(plain[3]).toMatch(/2 above, 1 below/u);
  });
});
