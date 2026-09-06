// Spans — the edges: a wrap, a cut, a cluster, a substitution, a glyph, and a depth.
//
// **Bytes, not counts.** Every row here is a cell of the classification table
// in `docs/notes/CALCIUM_SPANS_DESIGN.md` §4 where two rules meet, and each is
// asserted on the painted row — because every height assertion passes for a
// span sliced one unit early, and only the bytes say where the attribute landed.
//
// **The bytes are Ink's.** `renderToLines` goes through `renderToString`, which
// parses what `paint` wrote and re-emits one escape per attribute, closed in
// reverse, with the colour as its own pair — measured on a probe, not assumed.
// `attrs()` strips the colour pair so a row reads as the attribute placement
// alone; the colour's presence is asserted separately where it matters.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block, TextSpan } from "../../src/data/viewmodel/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import { DARK_THEME } from "../support/render.js";

const BOLD = "\x1b[1m";
const UNBOLD = "\x1b[22m";

function attrs(line: string): string {
  return line.replace(/\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7]|39|48;[^m]*|4[0-7]|10[0-7]|49)m/gu, "");
}

function notice(text: string, spans: readonly TextSpan[], over: Partial<{ tone: "default" | "ok"; glyph: "ok" }> = {}): Block {
  return block({ kind: "notice", id: "n", tone: over.tone ?? "default", text, spans, ...(over.glyph === undefined ? {} : { glyph: over.glyph }) });
}

// `minWidth` is what a column with no `flex` gets and nothing more (F50), so
// the fixture asks for the width its text needs — or the cut lands before
// the span begins and the row asserts nothing.
const COLUMN = { key: "c0", label: "c", align: "left" as const, priority: 50, minWidth: 12, sortable: false };
const tables = (): ReturnType<typeof measurable> => measurable({ definitions: [tableDefinition] });

describe("C04 §3am — spans at the edges", () => {
  it("T3.62 (C04 I86): a span across a wrap continues on the next row, sliced by source start and not by row arithmetic", () => {
    const rows = measurable().renderToLines(notice("the quick brown fox jumps", [{ from: 10, to: 19, bold: true }]), 10);
    expect(rows.map(visible)).toEqual(["the quick", "brown fox", "jumps"]);
    // The second row is exactly the bold run — the whole of `brown fox`, and
    // nothing before it. A prefix-sum slicer starts the run at `rown fox` and
    // leaves the `b` plain; the bytes say which.
    expect(rows.map(attrs)).toEqual(["the quick", `${BOLD}brown fox${UNBOLD}`, "jumps"]);
    expect(rows[1], "the tone's colour is still on the bold row").toMatch(/\x1b\[38;/u);
  });

  it("T3.63 (C04 I86): a span straddling a cut is clipped to the kept text, and the marker is outside every span", () => {
    // `raw` carries no tone: the plain pieces have no escape at all, the bold
    // piece opens and closes around `w`, and the marker follows unstyled.
    const [row] = measurable().renderToLines(block({ kind: "raw", id: "r", text: "hello world", spans: [{ from: 6, to: 11, bold: true }] }), 8);
    expect(row).toBe(`hello ${BOLD}w${UNBOLD}…`);

    // `truncateFrom: "start"` keeps the tail: the span on the last two
    // characters survives and the marker leads.
    const table = block({
      kind: "table",
      id: "t",
      columns: [{ ...COLUMN, truncateFrom: "start" }],
      rows: [{ id: "r0", cells: { c0: { text: "abcdefghij", spans: [{ from: 8, to: 10, bold: true }] } } }],
      showHeader: false,
    });
    const lines = tables().renderToLines(table, 6);
    const cell = lines.find((l) => visible(l).includes("ij"));
    expect(cell, "the tail is what the frame shows").toBeDefined();
    expect(visible(cell ?? "").trimEnd()).toMatch(/^…[a-j]*ij$/u);
    expect(attrs(cell ?? "")).toContain(`${BOLD}ij${UNBOLD}`);
    expect(attrs(cell ?? ""), "the marker is not inside the span").not.toContain(`${BOLD}…`);
  });

  it("T3.64 (C04 I84): a boundary inside a cluster snaps outward to the cluster's edges, and the width does not move", () => {
    const kit = measurable();
    const decomposed = "éx";
    const [row] = kit.renderToLines(notice(decomposed, [{ from: 0, to: 1, bold: true }]), 10);
    expect(attrs(row ?? "")).toBe(`${BOLD}é${UNBOLD}x`);
    expect(cells(visible(row ?? ""))).toBe(cells(decomposed));

    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const [zwj] = kit.renderToLines(notice(`a${family}b`, [{ from: 1, to: 3, bold: true }]), 10);
    expect(attrs(zwj ?? "")).toBe(`a${BOLD}${family}${UNBOLD}b`);
    expect(cells(visible(zwj ?? ""))).toBe(4);
  });

  it("T3.65 (C04 I86, C09 I19): a cluster the wrapper substitutes keeps its span, and the row is one cell", () => {
    const rows = measurable().renderToLines(notice("中", [{ from: 0, to: 1, bold: true }]), 1);
    expect(rows.map(attrs)).toEqual([`${BOLD}?${UNBOLD}`]);
    expect(rows.map((r) => cells(visible(r)))).toEqual([1]);
  });

  it("T3.66 (C04 I84): a cell's spans are offsets into `text`, not into the glyph-prefixed body", () => {
    const table = block({
      kind: "table",
      id: "t",
      columns: [COLUMN],
      rows: [{ id: "r0", cells: { c0: { text: "abcdef", glyph: "ok", spans: [{ from: 0, to: 3, bold: true }] } } }],
      showHeader: false,
    });
    const lines = tables().renderToLines(table, 20);
    const cell = lines.find((l) => visible(l).includes("abc"));
    expect(cell).toBeDefined();
    expect(visible(cell ?? "").trimEnd()).toBe("✓ abcdef");
    expect(attrs(cell ?? "")).toContain(`${BOLD}abc${UNBOLD}`);
    expect(attrs(cell ?? ""), "the glyph and its space are outside the span").not.toContain(`${BOLD}✓`);
  });

  it("T3.67 (C04 I85, C10 I33) — the accepted loss, asserted: at one bit an emphasised tone absorbs a bold span", () => {
    const text = "the quick brown fox";
    const spans: readonly TextSpan[] = [{ from: 4, to: 9, bold: true }];
    const mono = measurable({ capabilities: MONO_CAPS });
    const withSpans = mono.renderToLines(notice(text, spans, { tone: "ok" }), 30);
    const without = mono.renderToLines(block({ kind: "notice", id: "n", tone: "ok", text }), 30);
    expect(withSpans, "byte-identical: SGR 1 inside SGR 1").toEqual(without);

    const full = measurable({ capabilities: FULL_CAPS });
    expect(full.renderToLines(notice(text, spans, { tone: "ok" }), 30), "and at 24-bit the two differ").not.toEqual(
      full.renderToLines(block({ kind: "notice", id: "n", tone: "ok", text }), 30),
    );
  });
  it.todo("T3.77 (C04 I107, I108): a ramped span measures the same as its plain twin over the sweep, at tick 0 and tick 7; a colormap-ramped progress measures 1 — not deferred on a component: lands with the ramp resolver");
});

describe("C09 §5 — tone and value, the frames", () => {
  const text = "The cat sat on the mat .";
  const tokens = ((): readonly TextSpan[] => {
    const out: TextSpan[] = [];
    let at = 0;
    text.split(" ").forEach((token, i) => {
      out.push({ from: at, to: at + token.length, value: i / 6 }); // cells-ok — code-unit offsets
      at += token.length + 1; // cells-ok — a code-unit cursor
    });
    return out;
  })();
  const cat = block({ kind: "notice", id: "n", tone: "default", text, colormap: "viridis", spans: tokens } as Block);
  const plain = block({ kind: "notice", id: "n", tone: "default", text });
  const eight = { ...FULL_CAPS, colourDepth: 8 as const };
  const four = { ...FULL_CAPS, colourDepth: 4 as const };
  const backgrounds = (line: string): number => (line.match(/\x1b\[48;5;\d+m/gu) ?? []).length;

  it("T3.66 (C09 I1, C04 I90, C10 I31): a value per token at 12 and at 80 — one background per token, none on the spaces, and the measure is the rows", () => {
    const kit = measurable({ capabilities: eight });
    const at12 = kit.renderToLines(cat, 12);
    expect(at12.map(visible)).toEqual(["The cat sat", "on the mat ."]);
    expect(at12.map(backgrounds)).toEqual([3, 4]);
    // Between two tokens: the background closes, the space, the next opens.
    for (const row of at12) expect(row).toMatch(/\x1b\[49m \x1b\[48;5;\d+m/u);
    expect(kit.measure(cat, 12)).toBe(2);

    const at80 = kit.renderToLines(cat, 80);
    expect(at80.map(visible)).toEqual([text]);
    expect(at80.map(backgrounds)).toEqual([7]);
    expect(kit.measure(cat, 80)).toBe(1);

    const k4 = measurable({ capabilities: four });
    expect(k4.renderToLines(cat, 12), "4-bit: byte-identical to the unvalued block").toEqual(k4.renderToLines(plain, 12));
    expect(k4.renderToLines(cat, 80)).toEqual(k4.renderToLines(plain, 80));
  });

  it("T3.66 (C09 I1, C04 I90): the straddle — two rows plain, three valued, and the valued row is the whole token", () => {
    const kit = measurable({ capabilities: eight });
    const straddle = (spans?: readonly TextSpan[]): Block =>
      block({ kind: "notice", id: "n", tone: "default", text: "x(abcde)yz", colormap: "viridis", ...(spans === undefined ? {} : { spans }) } as Block);
    expect(kit.renderToLines(straddle(), 6).map(visible)).toEqual(["x(abcd", "e)yz"]);
    const valued = kit.renderToLines(straddle([{ from: 2, to: 7, value: 0.5 }]), 6);
    expect(valued.map(visible)).toEqual(["x(", "abcde)", "yz"]);
    expect(valued.map(backgrounds)).toEqual([0, 1, 0]);
    expect(valued[1]).toMatch(/\x1b\[48;5;\d+mabcde\x1b\[49m\)/u);
    expect(kit.measure(straddle([{ from: 2, to: 7, value: 0.5 }]), 6)).toBe(3);
    expect(kit.measure(straddle(), 6)).toBe(2);
    // A valued run wider than the row is broken as text and carries its
    // background onto both rows, as a bold word would carry its bold.
    const wide = kit.renderToLines(block({ kind: "notice", id: "n", tone: "default", text: "ab abcdefghij cd", colormap: "viridis", spans: [{ from: 3, to: 13, value: 0.9 }] } as Block), 6);
    expect(wide.map(visible)).toEqual(["ab", "abcdef", "ghij", "cd"]);
    expect(wide.map(backgrounds)).toEqual([0, 1, 1, 0]);
  });

  it("T3.66 (C09 I1, C04 I89, C11 I14): a toned run in a table cell keeps its colour unfocused and takes the accent, unbroken, under focus", () => {
    const table = block({
      kind: "table",
      id: "t",
      columns: [COLUMN],
      rows: [{ id: "r0", cells: { c0: { text: "run make now", spans: [{ from: 4, to: 8, tone: "identifier" }] } } }],
      showHeader: false,
    });
    const identifier = sgr(resolveTone("identifier", DARK_THEME, FULL_CAPS));
    const accent = sgr(resolveTone("accent", DARK_THEME, FULL_CAPS));
    const [unfocused] = tables().renderToLines(table, 20);
    expect(unfocused).toContain(`${identifier}make`);
    const [focused] = measurable({ definitions: [tableDefinition], focus: { blockId: "t", rowId: "r0" } }).renderToLines(table, 20);
    expect(focused).toContain(`${accent}run make now`);
    expect((focused ?? "").match(/\x1b\[38;/gu), "one colour on the focused row").toHaveLength(1);
  });
});

describe("C10 §4e — attributes are not on the glyph axis", () => {
  it("T3.11 (C10 I33): `unicode: \"ascii\"` still writes SGR 3 for an italic span, and the width is the plain width", () => {
    const text = "a b c";
    const [row] = measurable({ capabilities: ASCII_CAPS }).renderToLines(notice(text, [{ from: 2, to: 3, italic: true }]), 10);
    expect(attrs(row ?? "")).toBe("a \x1b[3mb\x1b[23m c");
    expect(cells(visible(row ?? ""))).toBe(cells(text));
  });
});

describe("C09 §5 — ramps at the rungs", () => {
  it.todo("T3.71 (C09 I51, C10 I36): a slot-pair gradient at 4-bit is two colours; 1-bit is byte-identical to the block toned from; a colormap bar at 4-bit is byte-identical to no ramp — not deferred on a component: lands with the ramp resolver");
  it.todo("T3.72 (C09 I51, I53): a single-cluster span samples the midpoint; under shimmer its five frames carry at most two colours; under wave every tick is the midpoint — not deferred on a component: lands with the ramp resolver");
});

describe("C10 §4h — motion at the rungs", () => {
  it.todo("T3.35 (C10 I36, C09 I53): a shimmer at 4-bit is five identical two-colour frames; at 24-bit five distinct; at 1-bit equal to the block toned from — not deferred on a component: lands with the ramp resolver");
});
