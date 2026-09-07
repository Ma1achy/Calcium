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
import type { Block, Ramp, TextSpan, ViewDocument } from "../../src/data/viewmodel/index.js";
import { stripControl } from "../../src/data/text.js";
import { atomsOf, runLines, runsOf, runsText, sliceRuns, wrapRuns } from "../../src/presentation/runs.js";
import { clusterEnds, truncateParts, wrapCells, wrapCellsParts } from "../../src/presentation/text.js";
import { runStyle, withSpan } from "../../src/presentation/blocks/paint.js";
import { resolve, resolveTone, type Style } from "../../src/presentation/theme/index.js";
import { COLORMAPS, continuousColour, nearestAnsi256, sample } from "../../src/presentation/theme/colormap.js";
import { mixHex, rampStyle, stepOf } from "../../src/presentation/theme/ramp.js";
import { animateT, extentT, rampCadenceMs } from "../../src/presentation/blocks/ramp.js";
import { spinnerIntervalMs } from "../../src/presentation/blocks/glyphs.js";
import { readFileSync } from "node:fs";
import { doc } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";
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
  // **A ramp at the gate** (C04 §3am.2). The span arm and the bar arm share one
  // checker; the rows below run each ramp through **both**, so a rule that held
  // on one carrier and not the other is a row that fails on one arm only.
  const span = (ramp: unknown): unknown => ({ kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 3, ramp }] });
  const bar = (ramp: unknown): unknown => ({ kind: "progress", id: "p", label: "build", current: 3, total: 10, ramp });

  it("T1.29 (C04 I106): the arity table at the gate — one backing for gradient and step, none for palette, bands on step alone in 2..8, each refusal naming its rule", () => {
    const table: readonly Readonly<{ name: string; ramp: unknown; ok: boolean; names?: RegExp }>[] = [
      { name: "gradient, slot pair", ramp: { fill: "gradient", from: "default", to: "accent" }, ok: true },
      { name: "step, slot pair, bands 2", ramp: { fill: "step", from: "default", to: "accent", bands: 2 }, ok: true },
      { name: "step, slot pair, bands 8", ramp: { fill: "step", from: "default", to: "accent", bands: 8 }, ok: true },
      { name: "palette, bare", ramp: { fill: "palette" }, ok: true },
      { name: "gradient, animated", ramp: { fill: "gradient", from: "default", to: "accent", animate: "shimmer" }, ok: true },
      { name: "gradient, both backings", ramp: { fill: "gradient", from: "default", to: "accent", colormap: "viridis" }, ok: false, names: /one backing.*not both.*C04 I106/u },
      { name: "gradient, no backing", ramp: { fill: "gradient" }, ok: false, names: /one backing.*C04 I106/u },
      { name: "half a pair", ramp: { fill: "gradient", from: "default" }, ok: false, names: /a pair.*C04 I106/u },
      { name: "a pair naming no slot", ramp: { fill: "gradient", from: "default", to: "#ff0000" }, ok: false, names: /"from" and "to" must each be one of.*C04 I106/u },
      { name: "palette with a pair", ramp: { fill: "palette", from: "default", to: "accent" }, ok: false, names: /no backing.*names nothing.*C10 I16/u },
      { name: "palette with a colormap", ramp: { fill: "palette", colormap: "viridis" }, ok: false, names: /no backing.*C04 I106/u },
      { name: "palette with bands", ramp: { fill: "palette", bands: 3 }, ok: false, names: /"bands" rides on "step" alone/u },
      { name: "bands on a gradient", ramp: { fill: "gradient", from: "default", to: "accent", bands: 3 }, ok: false, names: /"bands" rides on "step" alone/u },
      { name: "bands 1", ramp: { fill: "step", from: "default", to: "accent", bands: 1 }, ok: false, names: /2\.\.8.*one band is a gradient/u },
      { name: "bands 9", ramp: { fill: "step", from: "default", to: "accent", bands: 9 }, ok: false, names: /2\.\.8/u },
      { name: "bands 2.5", ramp: { fill: "step", from: "default", to: "accent", bands: 2.5 }, ok: false, names: /2\.\.8/u },
      { name: "an unknown fill", ramp: { fill: "rainbow" }, ok: false, names: /"fill" must be one of gradient, step, palette/u },
      { name: "an unknown key", ramp: { fill: "palette", easing: "ease-in" }, ok: false, names: /unknown member "easing".*C04 I106/u },
      { name: "not a record", ramp: "viridis", ok: false, names: /must be a record with a "fill"/u },
    ];
    for (const row of table) {
      const errors = errorsOf(span(row.ramp));
      if (row.ok) expect(errors, `span: ${row.name}`).toEqual([]);
      else {
        expect(errors, `span: ${row.name}`).toHaveLength(1);
        expect(errors[0], `span: ${row.name}`).toMatch(row.names ?? /C04 I106/u);
        expect(errors[0], `span: ${row.name} names the span`).toMatch(/spans\[0\]\.ramp/u);
      }
    }
    // The same table on the bar — every row agrees, because the arity is the
    // ramp's and not the carrier's.
    for (const row of table) {
      const errors = errorsOf(bar(row.ramp));
      if (row.ok) expect(errors, `bar: ${row.name}`).toEqual([]);
      else expect(errors, `bar: ${row.name}`).toHaveLength(1);
    }
  });

  it("T1.30 (C04 I107, I108): value and ramp on one span refused; a colormap backing refused on a span and admitted on progress; a ramp on a hunk line refused; a bar without a ramp validates as it did", () => {
    const both = errorsOf({
      kind: "notice", id: "n", tone: "info", text: "abcdef", colormap: "viridis",
      spans: [{ from: 0, to: 3, value: 0.5, ramp: { fill: "palette" } }],
    });
    expect(both).toHaveLength(1);
    expect(both[0]).toMatch(/"value" and "ramp" on one span.*two unmeasured colours.*C04 I107/u);

    const mapped = { fill: "gradient", colormap: "viridis" };
    const onSpan = errorsOf(span(mapped));
    expect(onSpan).toHaveLength(1);
    expect(onSpan[0]).toMatch(/colormap backing is refused on a span.*proven per slot.*C04 I107, C10 I26/u);
    expect(errorsOf(bar(mapped)), "the bar admits the same backing").toEqual([]);
    expect(errorsOf(bar({ fill: "step", colormap: "magma", bands: 4 }))).toEqual([]);

    const hunk = errorsOf({
      kind: "patch", id: "d", path: "a.ts", language: "ts",
      hunks: [{ header: "@@", lines: [{ kind: "add", text: "abcdef", spans: [{ from: 0, to: 3, ramp: { fill: "palette" } }] }] }],
    });
    expect(hunk).toHaveLength(1);
    expect(hunk[0]).toMatch(/"ramp" is refused on this member.*C04 I107, I91/u);

    expect(errorsOf({ kind: "progress", id: "p", label: "build", current: 3, total: 10 })).toEqual([]);
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

describe("C04 §3am.1 — the value member and the measurer", () => {
  const text = "The cat sat on the mat .";
  const perToken = (member: Partial<TextSpan>): readonly TextSpan[] => {
    const out: TextSpan[] = [];
    let at = 0;
    for (const token of text.split(" ")) {
      out.push({ from: at, to: at + token.length, ...member }); // cells-ok — code-unit offsets
      at += token.length + 1; // cells-ok — a code-unit cursor
    }
    return out;
  };
  const valued = perToken({}).map((s, i) => ({ ...s, value: i / 6 }));
  const withSpans = (spans?: readonly TextSpan[]): Block =>
    block({ kind: "notice", id: "n", tone: "default", text, colormap: "viridis", ...(spans === undefined ? {} : { spans }) } as Block);

  it("C04 T2.36 (C04 I90, C04 I83): measure is the same with every span member but value, and differs with value exactly when a valued run would straddle a row", () => {
    const kit = measurable();
    for (const width of [1, 3, 5, 7, 12, 40, 80]) {
      const plain = kit.measure(withSpans(), width);
      for (const member of [{ bold: true }, { italic: true }, { underline: true }, { tone: "identifier" as const }, { tone: "meta" as const, bold: true }]) {
        expect(kit.measure(withSpans(perToken(member)), width), `${JSON.stringify(member)} at ${String(width)}`).toBe(plain);
      }
      // A value per token: prose already breaks at the spaces between tokens,
      // so a single-word token never straddles a row and the count is the
      // plain one at every width — the brief's frame at 12 and at 80 included.
      expect(kit.measure(withSpans(valued), width), `valued at ${String(width)}`).toBe(plain);
      expect(kit.renderToLines(withSpans(valued), width).length, `rows at ${String(width)}`).toBe(plain);
    }
    expect(kit.measure(withSpans(valued), 12)).toBe(2);
    expect(kit.measure(withSpans(valued), 80)).toBe(1);

    // **Where it differs**: a token that would otherwise be cut by the
    // no-break-point arm. `x(abcde)yz` at 6 is `x(abcd` / `e)yz` plain and
    // `x(` / `abcde)` / `yz` valued — one row more, and the render agrees.
    const straddle = (spans?: readonly TextSpan[]): Block =>
      block({ kind: "notice", id: "n", tone: "default", text: "x(abcde)yz", colormap: "viridis", ...(spans === undefined ? {} : { spans }) } as Block);
    const bold = straddle([{ from: 2, to: 7, bold: true }]);
    const val = straddle([{ from: 2, to: 7, value: 0.5 }]);
    expect(kit.measure(straddle(), 6)).toBe(2);
    expect(kit.measure(bold, 6), "bold is appearance and moves nothing").toBe(2);
    expect(kit.measure(val, 6), "value is geometry and moves the row").toBe(3);
    expect(kit.renderToLines(val, 6).length).toBe(3);
    expect(kit.measure(val, 12), "and at a width where nothing straddles, nothing moves").toBe(kit.measure(straddle(), 12));
  });
});

describe("C09 — runs, the arithmetic spans and tokens share", () => {
  it("T1.19 (C09 I9, C04 I89, C04 I90): runs carry tone and value, and a valued run is an atom the wrapper keeps whole", () => {
    const runs = runsOf("aa bb cc dd", [{ from: 3, to: 8, value: 0.5 }, { from: 9, to: 11, tone: "identifier", bold: true }]);
    expect(runs).toEqual([{ text: "aa " }, { text: "bb cc", value: 0.5 }, { text: " " }, { text: "dd", attrs: { bold: true }, tone: "identifier" }]);
    expect(atomsOf(runs), "a bold run is not an atom; a valued one is").toEqual([{ from: 3, to: 8 }]);
    expect(sliceRuns(runs, 4, 6)).toEqual([{ text: "b cc", value: 0.5 }, { text: " " }, { text: "d", attrs: { bold: true }, tone: "identifier" }]);
    expect(runLines(runsOf("a\nb", [{ from: 0, to: 3, value: 1 }]))).toEqual([[{ text: "a", value: 1 }], [{ text: "b", value: 1 }]]);
    expect(runsOf("ab", [{ from: 0, to: 1 }]), "a span with no member is a plain run — the painter coalesces it with its neighbour").toEqual([{ text: "a" }, { text: "b" }]);

    // The wrapper: a space inside an atom is not a break point. Plain, the row
    // is exactly full when the space arrives and the space is the break, so
    // `aa bb` holds (F591; measured before the arm: `aa` / `bb` / `cc dd`).
    expect(wrapCellsParts("aa bb cc dd", 5)).toEqual([{ text: "aa bb", start: 0 }, { text: "cc dd", start: 6 }]);
    expect(wrapCellsParts("aa bb cc dd", 5, "narrow", [{ from: 3, to: 8 }])).toEqual([{ text: "aa", start: 0 }, { text: "bb cc", start: 3 }, { text: "dd", start: 9 }]);
    // No break point outside the atom: it moves whole when something precedes it.
    expect(wrapCellsParts("x(abcde)yz", 6)).toEqual([{ text: "x(abcd", start: 0 }, { text: "e)yz", start: 6 }]);
    expect(wrapCellsParts("x(abcde)yz", 6, "narrow", [{ from: 2, to: 7 }])).toEqual([{ text: "x(", start: 0 }, { text: "abcde)", start: 2 }, { text: "yz", start: 8 }]);
    // An atom wider than a row is broken as text is — the plain answer.
    expect(wrapCellsParts("ab abcdefghij cd", 6, "narrow", [{ from: 3, to: 13 }])).toEqual(wrapCellsParts("ab abcdefghij cd", 6));
    // A full row followed by a space: the space is the break and begins no
    // row, whether or not the row has an earlier break point. Measured before
    // the arm existed: `" gh"` (F590) and `aa` / `bb` / `cc dd` (F591).
    expect(wrapCellsParts("abcdef gh", 6)).toEqual([{ text: "abcdef", start: 0 }, { text: "gh", start: 7 }]);
    expect(wrapCellsParts("aa bb cc dd", 5, "narrow", [{ from: 3, to: 8 }]).map((r) => r.text)).not.toContain(" dd");
    // …unless the break would fall strictly inside an atom, which is no break
    // (C04 I90): an atom too wide for a row is cut at a cluster boundary and
    // drops nothing. Measured before the guard: `aaa bbb` / `ccc`, a content
    // space swallowed inside a value (F593).
    expect(wrapCellsParts("aaa bbb ccc", 7, "narrow", [{ from: 0, to: 11 }])).toEqual([{ text: "aaa bbb", start: 0 }, { text: " ccc", start: 7 }]);

    // `wrapRuns` derives the atoms from `value` alone.
    expect(wrapRuns(runsOf("x(abcde)yz", [{ from: 2, to: 7, bold: true }]), 6).map((r) => runsText(r))).toEqual(["x(abcd", "e)yz"]);
    expect(wrapRuns(runsOf("x(abcde)yz", [{ from: 2, to: 7, value: 0.5 }]), 6)).toEqual([[{ text: "x(" }], [{ text: "abcde", value: 0.5 }, { text: ")" }], [{ text: "yz" }]]);
  });

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
  it("T1.22 (C10 I33, C04 I89) — the tone arm: a run's tone replaces the block's, by reference, with the attribute still on top", () => {
    const theme = store().current;
    for (const depth of DEPTHS) {
      const ctx = { theme, capabilities: { ...FULL_CAPS, colourDepth: depth } };
      for (const blockTone of TONES) {
        const base = resolveTone(blockTone, theme, caps(depth));
        for (const spanTone of TONES) {
          const other = resolveTone(spanTone, theme, caps(depth));
          expect(runStyle({ text: "x", tone: spanTone }, base, ctx), `${spanTone} on ${blockTone} at ${String(depth)}`).toBe(other);
          const merged = runStyle({ text: "x", tone: spanTone, attrs: { underline: true } }, base, ctx);
          expect(merged.colour, `${spanTone} on ${blockTone} at ${String(depth)}`).toEqual(other.colour);
          expect(merged.underline).toBe(true);
          expect(merged.background).toBeUndefined();
        }
        expect(runStyle({ text: "x" }, base, ctx), "no member is the block's style itself").toBe(base);
      }
    }
    // The fixture responds: at 24-bit `identifier` and `ok` are different colours.
    expect(resolveTone("identifier", theme, caps(24)).colour).not.toEqual(resolveTone("ok", theme, caps(24)).colour);
  });

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

describe("C09 §5 — ramps, the five loops", () => {
  it("T1.28 (C09 I53): each effect's t' at tick 0 is the static table; shimmer moves one cell per tick; breathe is 1 at tick 5 and 0 at 15; rampCadenceMs is spinnerIntervalMs and ramp.ts carries no millisecond literal", () => {
    const n = 10;
    const ts = Array.from({ length: n }, (_, i) => extentT(i, n));
    expect(ts[0]).toBe(0);
    expect(ts[n - 1]).toBe(1);
    expect(extentT(0, 1), "one cell is the midpoint").toBe(0.5);

    // **`none` and `undefined` are the identity**, at every tick.
    for (const tick of [0, 1, 7, 23]) {
      ts.forEach((t, i) => {
        expect(animateT("none", t, tick, n, i)).toBe(t);
        expect(animateT(undefined, t, tick, n, i)).toBe(t);
      });
    }

    // **`shimmer`**: the band's centre is at −1.5 at tick 0 (just off the left
    // edge), one cell further each tick, wrapping at n + 3.
    const band = (tick: number): number[] => ts.map((t, i) => animateT("shimmer", t, tick, n, i));
    expect(band(0)).toEqual(ts.map((_, i) => (i === 0 ? 0 : 0)));
    expect(band(2)[0]).toBeCloseTo(1 - 0.5 / 1.5); // centre at 0.5: cell 0 is 0.5 away
    expect(band(3)[1]).toBeCloseTo(1 - 0.5 / 1.5); // centre at 1.5: cells 1 and 2 are 0.5 away
    expect(band(4)[2]).toBeCloseTo(1 - 0.5 / 1.5);
    // The peak sits on a cell when the centre does: centre = k − 1.5 is integral for no k,
    // so every cell is at least 0.5 from it and the maximum is 2/3 — asserted, so a
    // change to the half-width shows here rather than in a frame.
    for (let k = 1; k <= n + 1; k += 1) expect(Math.max(...band(k)), `tick ${String(k)}`).toBeCloseTo(2 / 3);
    // At the two ticks where the band is off the edge nothing is lit — the rest, not a hold.
    expect(Math.max(...band(0))).toBe(0);
    expect(Math.max(...band(n + 2))).toBe(0);
    expect(band(n + 3), "wraps").toEqual(band(0));
    // One cell per tick: the argmax advances by one.
    const peakAt = (k: number): number => band(k).indexOf(Math.max(...band(k)));
    expect(peakAt(3)).toBe(1);
    expect(peakAt(4)).toBe(2);
    expect(peakAt(5)).toBe(3);

    // **`wave`**: a translation of 1/n per tick, wrapping at n.
    expect(animateT("wave", 0, 1, n, 0)).toBeCloseTo(0.1);
    expect(animateT("wave", 0.95, 1, n, 9)).toBeCloseTo(0.05);
    ts.forEach((t, i) => expect(animateT("wave", t, n, n, i)).toBeCloseTo(animateT("wave", t, 0, n, i)));

    // **`breathe`**: 20 ticks, constant across the extent.
    expect(animateT("breathe", 0, 0, n, 0)).toBeCloseTo(0.5);
    expect(animateT("breathe", 0, 5, n, 0)).toBeCloseTo(1);
    expect(animateT("breathe", 0, 15, n, 0)).toBeCloseTo(0);
    expect(animateT("breathe", 0.2, 5, n, 2)).toBe(animateT("breathe", 0.9, 5, n, 9));
    expect(animateT("breathe", 0, 20, n, 0)).toBeCloseTo(animateT("breathe", 0, 0, n, 0));

    // **`pulse`**: two states, five ticks each.
    expect([0, 4, 5, 9, 10].map((k) => animateT("pulse", 0.3, k, n, 3))).toEqual([0, 0, 1, 1, 0]);

    // **`heartbeat`**: the envelope, and it repeats at 12.
    const beat = Array.from({ length: 13 }, (_, k) => animateT("heartbeat", 0.3, k, n, 3));
    expect(beat).toEqual([1, 0.5, 0, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 1]);

    // **The cadence is the kinds' lookup and the module carries no literal.**
    expect(rampCadenceMs()).toBe(spinnerIntervalMs());
    const source = readFileSync(new URL("../../src/presentation/blocks/ramp.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    expect(source, "no millisecond literal — the cadence is a lookup").not.toMatch(/\b(100|80|120)\b\s*;|_MS\s*=\s*\d/u);
  });
});

describe("C10 §4h — a ramp sampled on the ladder", () => {
  const theme = DARK_THEME;
  const hexAt = (tone: "default" | "accent", depth: 24 | 8 | 4 | 1): string | number | undefined => {
    const c = resolveTone(tone, theme, caps(depth)).colour;
    return c === undefined ? undefined : c.kind === "rgb" ? c.hex : c.index;
  };

  it("T1.38 (C10 I36): a slot-pair gradient is from at 0, to at 1, the sRGB midpoint at 0.5; 8-bit is nearestAnsi256 of the mix; 4-bit is two indices and never a third; 1-bit is from's class; palette index 9 is categorical.c2; a colormap at 4-bit is undefined", () => {
    const pair: Ramp = { fill: "gradient", from: "default", to: "accent" };
    const from = hexAt("default", 24) as string;
    const to = hexAt("accent", 24) as string;
    expect(from).not.toBe(to);
    const at = (t: number, depth: 24 | 8 | 4 | 1): Style | undefined => rampStyle(pair, t, 0, theme, caps(depth));

    expect(at(0, 24)).toEqual({ colour: { kind: "rgb", hex: from } });
    expect(at(1, 24)).toEqual({ colour: { kind: "rgb", hex: to } });
    const mid = at(0.5, 24)?.colour;
    expect(mid?.kind).toBe("rgb");
    if (mid?.kind === "rgb") {
      expect(mid.hex).toBe(mixHex(from, to, 0.5));
      // The same arithmetic `sample` applies between two stops (C10 §4h).
      const two = { name: "two", kind: "sequential" as const, data: [channelsOf(from), channelsOf(to)] };
      expect(mid.hex).toBe(sample(two as never, 0.5));
    }
    expect(at(0.5, 8)).toEqual({ colour: { kind: "ansi256", index: nearestAnsi256(mixHex(from, to, 0.5)) } });

    // **4-bit is a step of two and never a third.**
    const fourFrom = hexAt("default", 4);
    const fourTo = hexAt("accent", 4);
    expect(at(0.49, 4)).toEqual({ colour: { kind: "ansi16", index: fourFrom } });
    expect(at(0.51, 4)).toEqual({ colour: { kind: "ansi16", index: fourTo } });
    const indices = new Set(Array.from({ length: 101 }, (_, i) => (at(i / 100, 4)?.colour as { index: number }).index));
    expect([...indices].sort()).toEqual([fourFrom, fourTo].sort());

    // **1-bit is `from`, resolved as the slot is** — a class, not a colour.
    for (const t of [0, 0.3, 0.7, 1]) expect(at(t, 1)).toEqual(resolveTone("default", theme, caps(1)));

    // **`step`** quantises first: three bands over a pair are three colours at 24-bit.
    const stepped: Ramp = { fill: "step", from: "default", to: "accent", bands: 3 };
    const hexes = new Set(Array.from({ length: 101 }, (_, i) => (rampStyle(stepped, i / 100, 0, theme, caps(24))?.colour as { hex: string }).hex));
    expect(hexes.size).toBe(3);
    expect(stepOf(0.99, 3)).toBe(1);
    expect(stepOf(0.34, 3)).toBe(0.5);

    // **`palette`** is the categorical slot, cycling past eight.
    const palette: Ramp = { fill: "palette" };
    expect(rampStyle(palette, 0, 9, theme, caps(24))).toEqual({ colour: resolve("categorical.c2", theme, caps(24)).colour });
    expect(rampStyle(palette, 0, 9, theme, caps(4))?.colour?.kind).toBe("ansi16");
    expect(rampStyle(palette, 0, 9, theme, caps(1))).toBeUndefined();

    // **A colormap** is `continuousColour` unchanged: something at 8, nothing at 4.
    const mapped: Ramp = { fill: "gradient", colormap: "viridis" };
    expect(rampStyle(mapped, 0.5, 0, theme, caps(24))).toEqual({ colour: continuousColour(COLORMAPS["viridis"]!, 0.5, caps(24)) });
    expect(rampStyle(mapped, 0.5, 0, theme, caps(8))?.colour?.kind).toBe("ansi256");
    expect(rampStyle(mapped, 0.5, 0, theme, caps(4))).toBeUndefined();
    expect(rampStyle(mapped, 0.5, 0, theme, caps(1))).toBeUndefined();
  });
});

function channelsOf(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
