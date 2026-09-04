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
});

describe("C10 §4e — attributes are not on the glyph axis", () => {
  it("T3.11 (C10 I33): `unicode: \"ascii\"` still writes SGR 3 for an italic span, and the width is the plain width", () => {
    const text = "a b c";
    const [row] = measurable({ capabilities: ASCII_CAPS }).renderToLines(notice(text, [{ from: 2, to: 3, italic: true }]), 10);
    expect(attrs(row ?? "")).toBe("a \x1b[3mb\x1b[23m c");
    expect(cells(visible(row ?? ""))).toBe(cells(text));
  });
});
