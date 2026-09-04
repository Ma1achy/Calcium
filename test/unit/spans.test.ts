// Spans in the view model — C04 §3am, the unit rows.
//
// **The measurement pair is asserted on the pair.** T1.25 compares a block's
// measure with and without its spans, so a measurer that starts reading
// `spans` fails here at the first width rather than at a frame. And the pair
// is shown to be non-vacuous: the same blocks are rendered and the frames
// differ, so the spans reached the renderer and the measurer still did not
// see them.
import { describe, expect, it } from "vitest";
import { block, validateBlock, validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block, TextSpan, ViewDocument } from "../../src/data/viewmodel/index.js";
import { stripControl } from "../../src/data/text.js";
import { runsOf, runsText, sliceRuns, wrapRuns } from "../../src/presentation/runs.js";
import { clusterEnds, truncateParts, wrapCells, wrapCellsParts } from "../../src/presentation/text.js";
import { withSpan } from "../../src/presentation/blocks/paint.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { doc } from "../support/blocks.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { caps, DEPTHS, store, TONES } from "../support/theme.js";
import { tableDefinition } from "../../src/presentation/table/index.js";

const SPANS: readonly TextSpan[] = Object.freeze([
  Object.freeze({ from: 0, to: 1, bold: true }),
  Object.freeze({ from: 2, to: 4, italic: true }),
]);

function notice(text: string, spans?: readonly TextSpan[]): Block {
  return block({ kind: "notice", id: "n", tone: "info", text, ...(spans === undefined ? {} : { spans }) });
}

function errorsOf(value: unknown): readonly string[] {
  const outcome = validateBlock(value);
  return outcome.ok ? [] : outcome.error;
}

describe("C04 §3am — spans, the gate", () => {
  it("T1.23 (C04 I84): sorted, disjoint, integer, in-range spans validate clean, and so does the block without them", () => {
    expect(errorsOf(notice("a bc d", SPANS))).toEqual([]);
    expect(errorsOf(notice("a bc d"))).toEqual([]);
    // The same on the other three members of I88.
    expect(errorsOf(block({ kind: "raw", id: "r", text: "a bc d", spans: SPANS }))).toEqual([]);
    expect(errorsOf(block({ kind: "rule", id: "h", label: "a bc d", spans: SPANS }))).toEqual([]);
    expect(
      errorsOf(
        block({
          kind: "table",
          id: "t",
          columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 4, sortable: false }],
          rows: [{ id: "r0", cells: { c0: { text: "a bc d", spans: SPANS } } }],
        }),
      ),
    ).toEqual([]);
  });

  it("T1.24 (C04 I84, I85): each malformation is one error naming the span's index, and nine faults report nine", () => {
    const faults: readonly Readonly<{ name: string; text: string; spans: readonly unknown[]; at: number }>[] = [
      { name: "a non-integer from", text: "abcdef", spans: [{ from: 1.5, to: 3 }], at: 0 },
      { name: "a negative from", text: "abcdef", spans: [{ from: -1, to: 3 }], at: 0 },
      { name: "from === to", text: "abcdef", spans: [{ from: 2, to: 2 }], at: 0 },
      { name: "from > to", text: "abcdef", spans: [{ from: 3, to: 1 }], at: 0 },
      { name: "to past the text", text: "abcdef", spans: [{ from: 0, to: 7 }], at: 0 },
      { name: "out of order", text: "abcdef", spans: [{ from: 2, to: 3 }, { from: 0, to: 1 }], at: 1 },
      { name: "overlapping by one unit", text: "abcdef", spans: [{ from: 0, to: 2 }, { from: 1, to: 3 }], at: 1 },
      { name: "a surrogate split", text: "a\u{1F600}b", spans: [{ from: 1, to: 2 }], at: 0 },
      { name: "an unknown attribute", text: "abcdef", spans: [{ from: 0, to: 1, colour: "red" }], at: 0 },
    ];
    for (const fault of faults) {
      const errors = errorsOf({ kind: "notice", id: "n", tone: "info", text: fault.text, spans: fault.spans });
      expect(errors, fault.name).toHaveLength(1);
      expect(errors[0], fault.name).toMatch(new RegExp(`spans\\[${String(fault.at)}\\]`, "u"));
      expect(errors[0], fault.name).toMatch(/C04 I8[45]/u);
    }

    // The fixture responds to the thing under test: the surrogate document is
    // a real split, and the same offset one unit along is clean.
    expect(errorsOf({ kind: "notice", id: "n", tone: "info", text: "a\u{1F600}b", spans: [{ from: 1, to: 3 }] })).toEqual([]);

    const all = doc({
      blocks: faults.map((f, i) => ({ kind: "notice", id: `n${String(i)}`, tone: "info", text: f.text, spans: f.spans }) as unknown as Block),
    });
    const outcome = validateDocument(all);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error, "nine faults, nine lines").toHaveLength(9);
  });

  it("T1.26 (C04 I87): a document carrying spans on all four members survives the JSON round trip", () => {
    const d: ViewDocument = doc({
      blocks: [
        notice("a bc d", SPANS),
        block({ kind: "raw", id: "r", text: "a bc d", spans: SPANS }),
        block({ kind: "rule", id: "h", label: "a bc d", spans: SPANS }),
        block({
          kind: "table",
          id: "t",
          columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 4, sortable: false }],
          rows: [{ id: "r0", cells: { c0: { text: "a bc d", spans: SPANS } } }],
        }),
      ],
    });
    const back: unknown = JSON.parse(JSON.stringify(d));
    const outcome = validateDocument(back);
    expect(outcome.ok).toBe(true);
    expect(back).toEqual(d);
  });
});

describe("C04 §3am — spans and the measurer", () => {
  const long = "the quick brown fox jumps over the lazy dog and keeps running until the line has to wrap twice";
  const spans: readonly TextSpan[] = [
    { from: 10, to: 19, bold: true },
    { from: 35, to: 43, italic: true },
    { from: 60, to: 70, underline: true },
  ];
  const pairs: readonly Readonly<{ name: string; plain: Block; styled: Block }>[] = [
    { name: "raw", plain: block({ kind: "raw", id: "r", text: `${long}\n${long}` }), styled: block({ kind: "raw", id: "r", text: `${long}\n${long}`, spans }) },
    { name: "notice", plain: block({ kind: "notice", id: "n", tone: "ok", glyph: "ok", text: long }), styled: block({ kind: "notice", id: "n", tone: "ok", glyph: "ok", text: long, spans }) },
    { name: "rule", plain: block({ kind: "rule", id: "h", label: long }), styled: block({ kind: "rule", id: "h", label: long, spans }) },
    {
      name: "table",
      plain: block({
        kind: "table",
        id: "t",
        columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 60, sortable: false }],
        rows: [{ id: "r0", cells: { c0: { text: long } } }],
      }),
      styled: block({
        kind: "table",
        id: "t",
        columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 60, sortable: false }],
        rows: [{ id: "r0", cells: { c0: { text: long, spans } } }],
      }),
    },
  ];

  it("T1.25 (C04 I83, I86): measure is the same number with and without spans at every width — and the frames differ", () => {
    const kit = measurable({ definitions: [tableDefinition] });
    for (const { name, plain, styled } of pairs) {
      let differed = false;
      for (const width of [1, 7, 12, 40, 60, 80, 120]) {
        expect(kit.measure(styled, width), `${name} at ${String(width)}`).toBe(kit.measure(plain, width));
        const a = kit.renderToLines(plain, width);
        const b = kit.renderToLines(styled, width);
        expect(b.length, `${name} rendered rows at ${String(width)}`).toBe(a.length);
        if (a.join("\n") !== b.join("\n")) differed = true;
      }
      expect(differed, `${name}: the spans reached the frame, so the equal measure is not vacuous`).toBe(true);
    }
  });
});

describe("C09 — runs, the arithmetic spans and tokens share", () => {
  it("(C04 I86) wrapCellsParts: every row is an exact slice of the source from its start, and the break space is in no row", () => {
    const text = "the quick brown fox jumps";
    const rows = wrapCellsParts(text, 10);
    expect(rows.map((r) => r.text)).toEqual(wrapCells(text, 10));
    expect(rows.map((r) => r.start)).toEqual([0, 10, 20]);
    for (const row of rows) expect(text.slice(row.start, row.start + row.text.length)).toBe(row.text); // cells-ok
    expect(rows.reduce((n, r) => n + r.text.length, 0), "the dropped break spaces").toBe(text.length - 2); // cells-ok

    // Two spaces dropped; a leading space kept; paragraphs count their newline.
    expect(wrapCellsParts("ab  cd", 4)).toEqual([{ text: "ab", start: 0 }, { text: "cd", start: 4 }]);
    expect(wrapCellsParts("abc   def", 5)).toEqual([{ text: "abc", start: 0 }, { text: " def", start: 5 }]);
    expect(wrapCellsParts("a\n\nb", 10)).toEqual([{ text: "a", start: 0 }, { text: "", start: 2 }, { text: "b", start: 3 }]);
  });

  it("(C04 I84) runsOf: the runs concatenate to stripControl(text), with a control character inside a span", () => {
    const text = "abc d";
    const runs = runsOf(text, [{ from: 1, to: 4, bold: true }]);
    expect(runsText(runs)).toBe(stripControl(text));
    expect(runs).toEqual([{ text: "a" }, { text: "bc", attrs: { bold: true } }, { text: " d" }]);
    expect(runsOf("plain", undefined)).toEqual([{ text: "plain" }]);
    expect(runsOf("", [])).toEqual([]);
  });

  it("(C04 I84) a boundary inside a grapheme cluster snaps to the cluster's end", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const text = `a${family}b`;
    expect(clusterEnds(text)).toEqual([1, 1 + family.length, 2 + family.length]); // cells-ok
    const runs = runsOf(text, [{ from: 1, to: 3, italic: true }]);
    expect(runs).toEqual([{ text: "a" }, { text: family, attrs: { italic: true } }, { text: "b" }]);
    // A span that collapses onto one boundary after snapping is dropped, not
    // emitted empty; and ASCII has no clusters to snap.
    expect(runsOf(text, [{ from: 2, to: 3, bold: true }])).toEqual([{ text: "a" }, { text: family, attrs: { bold: true } }, { text: "b" }]);
    expect(clusterEnds("ascii only")).toEqual([]);
  });

  it("(C04 I86) wrapRuns slices by source start, and a substituted cluster keeps its span", () => {
    const text = "the quick brown fox jumps";
    const rows = wrapRuns(runsOf(text, [{ from: 10, to: 19, bold: true }]), 10);
    expect(rows).toEqual([
      [{ text: "the quick" }],
      [{ text: "brown fox", attrs: { bold: true } }],
      [{ text: "jumps" }],
    ]);
    expect(wrapRuns(runsOf("中", [{ from: 0, to: 1, bold: true }]), 1)).toEqual([[{ text: "?", attrs: { bold: true } }]]);
  });

  it("(C04 I86, C09 I9) truncateParts reports the kept slice's offset from either end, and measures its marker", () => {
    expect(truncateParts("abcdefgh", 5, FULL_CAPS)).toEqual({ kept: "abcd", prefix: "", suffix: "…", start: 0 });
    expect(truncateParts("abcdefgh", 5, FULL_CAPS, "start")).toEqual({ kept: "efgh", prefix: "…", suffix: "", start: 4 });
    expect(sliceRuns([{ text: "abcdef" }, { text: "gh", attrs: { bold: true } }], 4, 4)).toEqual([{ text: "ef" }, { text: "gh", attrs: { bold: true } }]);
    // F292's second instance: at `ambiguousWidth: "wide"` the ellipsis is two
    // cells, and `limit - 1` reserved one — so `kept + suffix` was `limit + 1`.
    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const parts = truncateParts("abcdefgh", 5, wide);
    expect(parts.kept.length + 2, "kept plus a two-cell marker fits the limit").toBeLessThanOrEqual(5); // cells-ok
    expect(parts.kept).toBe("abc");
  });
});

describe("C10 §4e — span attributes and the resolved tone", () => {
  it("T1.22 (C10 I33): for every attribute, tone and depth the merge keeps both colour channels and sets the attribute", () => {
    const theme = store().current;
    for (const attr of ["bold", "italic", "underline"] as const) {
      for (const tone of TONES) {
        for (const depth of DEPTHS) {
          const base = resolveTone(tone, theme, caps(depth));
          const merged = withSpan(base, { [attr]: true });
          expect(merged.colour, `${attr} on ${tone} at ${String(depth)}`).toEqual(base.colour);
          expect(merged.background, `${attr} on ${tone} at ${String(depth)}`).toEqual(base.background);
          expect(merged[attr], `${attr} on ${tone} at ${String(depth)}`).toBe(true);
          expect(withSpan(base, undefined), "no attributes is the tone itself, by reference").toBe(base);
        }
      }
    }
  });
});
