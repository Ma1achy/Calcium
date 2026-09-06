// Spans — the contract rows: the bytes a span produces, and the member `code` refuses.
import { describe, expect, it } from "vitest";
import { block, validateBlock, validateDocument } from "../../src/data/viewmodel/index.js";
import { RAMP_ANIMATIONS, RAMP_KEYS, TEXT_SPAN_KEYS } from "../../src/data/viewmodel/types.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { Block, Ramp, TextSpan } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";
import { paint, paintRuns, withSpan } from "../../src/presentation/blocks/paint.js";
import { runsOf } from "../../src/presentation/runs.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { COLORMAPS, continuousColour, sample } from "../../src/presentation/theme/colormap.js";
import { NO_STYLE, CATEGORY_REFS, refOf, resolve } from "../../src/presentation/theme/index.js";
import * as marks from "../../src/presentation/plot/marks.js";
import { ANIMATES, animationIntervalOf, tickIntervalOf } from "../../src/presentation/blocks/index.js";
import { RAMP_EXTENT } from "../../src/presentation/blocks/ramp.js";
import { spinnerIntervalMs } from "../../src/presentation/blocks/glyphs.js";
import { sliceRuns, wrapRuns } from "../../src/presentation/runs.js";
import { readFileSync, readdirSync } from "node:fs";
import { SGR_RESET, sgr } from "../../src/terminal/escapes.js";
import { DARK_THEME, FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { caps, store } from "../support/theme.js";

const at = (depth: 1 | 4 | 8 | 24) => ({ ...FULL_CAPS, colourDepth: depth });
const rgbOf = (hex: string): string => [1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(";");

/**
 * The attribute escapes of a rendered row, with the colour escapes removed.
 *
 * Ink re-encodes what `paint` wrote: one escape per attribute, closed in
 * reverse (`ESC[1m ESC[3m … ESC[23m ESC[22m`), colour as its own `38;2` / `39`
 * pair. Measured on the probe rather than assumed, and asserted in that form —
 * the numeric-order claim about `sgr()` is T1.19's, one layer down.
 */
function attrs(line: string): string {
  return line.replace(/\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7]|39|48;[^m]*|4[0-7]|10[0-7]|49)m/gu, "");
}

function noticeWith(spans: readonly TextSpan[]): readonly string[] {
  return measurable().renderToLines(block({ kind: "notice", id: "n", tone: "default", text: "a b c", spans }), 20);
}

describe("C04 §3am — spans, the contract", () => {
  it("T2.31 (C04 I85, C10 I33): the first frame in which a renderer writes italic — the bytes, in numeric order", () => {
    // `b` is painted inside an SGR whose parameters include 3, closed with a
    // reset before ` c`; the assertion is on the bytes and not on the field.
    const [italic] = noticeWith([{ from: 2, to: 3, italic: true }]);
    expect(attrs(italic ?? "")).toBe("a \x1b[3mb\x1b[23m c");
    const [bold] = noticeWith([{ from: 2, to: 3, bold: true }]);
    expect(attrs(bold ?? "")).toBe("a \x1b[1mb\x1b[22m c");
    const [underline] = noticeWith([{ from: 2, to: 3, underline: true }]);
    expect(attrs(underline ?? "")).toBe("a \x1b[4mb\x1b[24m c");
    const [all] = noticeWith([{ from: 2, to: 3, bold: true, italic: true, underline: true }]);
    expect(attrs(all ?? "")).toBe("a \x1b[1m\x1b[3m\x1b[4mb\x1b[24m\x1b[23m\x1b[22m c");
    expect(all, "the tone's colour is still on the row").toMatch(/\x1b\[38;/u);

    // The bytes `paint` wrote before Ink re-encoded them — numeric order, one
    // sequence, the tone's colour behind the attributes (C10 I33).
    const tone = resolveTone("default", store().current, FULL_CAPS);
    const merged = sgr(withSpan(tone, { bold: true, italic: true, underline: true }));
    expect(merged).toMatch(/^\x1b\[1;3;4;38;/u);
    expect(paint(paintRuns(runsOf("a b c", [{ from: 2, to: 3, bold: true, italic: true, underline: true }]), tone, { theme: store().current, capabilities: FULL_CAPS }))).toBe(
      `${sgr(tone)}a ${SGR_RESET}${merged}b${SGR_RESET}${sgr(tone)} c${SGR_RESET}`,
    );
  });

  it("T2.32 (C04 I88): a `code` block carrying spans is refused, and a `raw` block carrying the same array is accepted", () => {
    const spans = [{ from: 0, to: 1, bold: true }];
    const code = validateBlock({ kind: "code", id: "c", language: "text", text: "abc", spans });
    expect(code.ok).toBe(false);
    if (!code.ok) expect(code.error.join(" ")).toMatch(/"spans" is refused on code .*\(C04 I88\)/u);
    expect(validateBlock({ kind: "raw", id: "r", text: "abc", spans }).ok).toBe(true);
  });
});

describe("C04 §3am.1 — tone and value, the rendering half", () => {
  const toned = block({ kind: "notice", id: "n", tone: "ok", text: "let x = 1", spans: [{ from: 4, to: 5, tone: "identifier" }] });

  it("C04 T2.35 (C04 I89): a span's tone paints the run in the tone's SGR and the rest in the block's; at 1-bit the run is the tone's collapse and nothing else", () => {
    const theme = store().current;
    const [row] = measurable().renderToLines(toned, 20);
    // At 24-bit a tone's style is its colour and nothing else, so the whole
    // style is the `38` the row carries.
    const ok = sgr(resolveTone("ok", theme, FULL_CAPS));
    const identifier = sgr(resolveTone("identifier", theme, FULL_CAPS));
    expect(ok).toMatch(/^\x1b\[38;2;/u);
    expect(identifier).not.toBe(ok);
    // Ink re-encodes a colour change as the next `38` with no reset between.
    expect(row).toBe(`${ok}let ${identifier}x${ok} = 1\x1b[39m`);

    // 1-bit: `ok` is the emphasised class and `identifier` the normal one, so
    // the run is the one *without* SGR 1 — the collapse, uncompensated.
    const mono = measurable({ capabilities: MONO_CAPS });
    expect(mono.renderToLines(toned, 20)).toEqual(["\x1b[1mlet \x1b[22mx\x1b[1m = 1\x1b[22m"]);
    expect(mono.renderToLines(block({ kind: "notice", id: "n", tone: "ok", text: "let x = 1" }), 20)).toEqual(["\x1b[1mlet x = 1\x1b[22m"]);
  });

  const valued = (colormap = "viridis"): Block =>
    block({
      kind: "raw",
      id: "r",
      text: "alpha beta gamma",
      colormap,
      spans: [{ from: 0, to: 5, value: 0 }, { from: 6, to: 10, value: 0.5 }, { from: 11, to: 16, value: 1 }],
    } as Block);
  const plain = block({ kind: "raw", id: "r", text: "alpha beta gamma" });

  it("C04 T2.36 (C04 I90, C10 I31): three valued spans paint three backgrounds from the map at 8-bit and above, and none at 4-bit", () => {
    const map = COLORMAPS["viridis"];
    if (map === undefined) throw new Error("viridis is a colormap");
    const [eight] = measurable({ capabilities: at(8) }).renderToLines(valued(), 40);
    const indices = [...(eight ?? "").matchAll(/\x1b\[48;5;(\d+)m/gu)].map((m) => Number(m[1]));
    expect(indices).toHaveLength(3);
    expect(indices, "the indices are `continuousColour`'s — a heatmap cell went through the same call").toEqual(
      [0, 0.5, 1].map((v) => {
        const c = continuousColour(map, v, at(8));
        return c?.kind === "ansi256" ? c.index : -1;
      }),
    );
    // The backgrounds sit on the words and not on the spaces between them.
    expect(eight).toMatch(/^\x1b\[48;5;\d+malpha\x1b\[49m \x1b\[48;5;\d+mbeta\x1b\[49m \x1b\[48;5;\d+mgamma\x1b\[49m/u);

    const [full] = measurable({ capabilities: at(24) }).renderToLines(valued(), 40);
    expect(full).toContain(`\x1b[48;2;${rgbOf(sample(map, 0.5))}mbeta`);

    const four = measurable({ capabilities: at(4) });
    const [row4] = four.renderToLines(valued(), 40);
    expect(row4).not.toContain("\x1b[48");
    expect(four.renderToLines(valued(), 40), "byte-identical to the unvalued block — the colormap ladder says nothing below 8-bit").toEqual(four.renderToLines(plain, 40));
    expect(measurable({ capabilities: at(8) }).renderToLines(valued(), 40), "and the fixture responds at 8-bit").not.toEqual(measurable({ capabilities: at(8) }).renderToLines(plain, 40));
  });

  it("C10 T2.26 (C10 I33, C10 I31, C04 I89, C04 I90): the depths — no SGR 1 on the identifier run at 1-bit, no 48 at 4-bit, `continuousColour`'s index at 8, `sample`'s hex at 24", () => {
    const map = COLORMAPS["magma"];
    if (map === undefined) throw new Error("magma is a colormap");
    const [mono] = measurable({ capabilities: MONO_CAPS }).renderToLines(toned, 20);
    expect(mono).toBe("\x1b[1mlet \x1b[22mx\x1b[1m = 1\x1b[22m");

    const one = block({ kind: "notice", id: "n", tone: "default", text: "alpha beta", colormap: "magma", spans: [{ from: 6, to: 10, value: 0.25 }] } as Block);
    const bare = block({ kind: "notice", id: "n", tone: "default", text: "alpha beta" });
    expect(measurable({ capabilities: at(4) }).renderToLines(one, 20)).toEqual(measurable({ capabilities: at(4) }).renderToLines(bare, 20));
    const c8 = continuousColour(map, 0.25, at(8));
    expect(c8?.kind).toBe("ansi256");
    expect(measurable({ capabilities: at(8) }).renderToLines(one, 20)[0]).toContain(`\x1b[48;5;${String(c8?.kind === "ansi256" ? c8.index : -1)}mbeta`);
    expect(measurable({ capabilities: at(24) }).renderToLines(one, 20)[0]).toContain(`\x1b[48;2;${rgbOf(sample(map, 0.25))}mbeta`);

    // Both members on one span: `38` from the slot, `48` from the map.
    const both = block({ kind: "notice", id: "n", tone: "default", text: "alpha beta", colormap: "magma", spans: [{ from: 6, to: 10, value: 0.25, tone: "identifier" }] } as Block);
    const [row] = measurable({ capabilities: at(24) }).renderToLines(both, 20);
    const identifier = sgr(resolveTone("identifier", store().current, FULL_CAPS));
    expect(row).toContain(identifier);
    expect(row).toContain(`\x1b[48;2;${rgbOf(sample(map, 0.25))}m`);
  });
});

describe("C10 §4e — span attributes at one bit", () => {
  it("T2.25 (C10 I33): at depth 1 an emphasised tone absorbs a bold span, a normal one shows it, a dim one writes both in numeric order", () => {
    const theme = store().current;
    const at1 = caps(1);
    const ok = resolveTone("ok", theme, at1);
    expect(withSpan(ok, { bold: true })).toEqual({ bold: true });
    expect(withSpan(ok, { bold: true })).toEqual(ok);
    expect(withSpan(resolveTone("default", theme, at1), { bold: true })).toEqual({ bold: true });
    const muted = withSpan(resolveTone("muted", theme, at1), { bold: true });
    expect(muted).toEqual({ dim: true, bold: true });
    expect(sgr(muted)).toBe("\x1b[1;2m");
  });
});

describe("C04 §3am.1 — `elide`", () => {
  const registry = createBlockRegistry({ defaults: true });
  const rows = (b: Block, width: number): readonly string[] =>
    renderSequenceToLines(registry, [b], width, { theme: DARK_THEME, capabilities: FULL_CAPS })
      .map((line) => line.replace(/\u001b\[[0-9;]*m/gu, "").trimEnd());
  const TEXT = "verb(a-rather-long-argument-that-will-not-fit) · 4s · 12 rows";
  const ARG: TextSpan = { from: TEXT.indexOf("(") + 1, to: TEXT.indexOf(")"), elide: true };

  it("T2.114 (C04 I105, I107): the eighth and ninth members are admitted, inert on a wrapped token, and the boundary the fitter shortens first on a fitted one", () => {
    expect(TEXT_SPAN_KEYS.size).toBe(9);
    expect(TEXT_SPAN_KEYS.has("elide")).toBe(true);
    expect(TEXT_SPAN_KEYS.has("ramp")).toBe(true);
    const marked = block({ kind: "notice", id: "n", tone: "info", glyph: "info", text: TEXT, spans: [ARG] });
    expect(validateBlock(marked).ok).toBe(true);
    const typed = validateBlock({ ...marked, spans: [{ ...ARG, elide: "yes" }] } as unknown as Block);
    expect(typed.ok).toBe(false);
    if (!typed.ok) expect(typed.error.join(" ")).toMatch(/"elide" must be a boolean/u);

    // **Inert on a wrapped token**: measure and frame identical with and without.
    const plain = block({ kind: "notice", id: "n", tone: "info", glyph: "info", text: TEXT });
    for (const width of [80, 40, 24, 12]) {
      expect(registry.measure(marked, width), `measure at ${String(width)}`).toBe(registry.measure(plain, width));
      expect(rows(marked, width), `frame at ${String(width)}`).toEqual(rows(plain, width));
    }

    // **On a fitted token the marked run gives way first** (C09 I46): the run
    // ends in the marker and the runs outside it are byte-identical.
    const head = block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: TEXT, spans: [ARG] });
    const wide = rows(head, 80)[0] ?? "";
    const narrow = rows(head, 40)[0] ?? "";
    expect(wide).toBe(`⬤ ${TEXT}`);
    expect(rows(head, 40)).toHaveLength(1);
    expect(narrow.startsWith("⬤ verb(")).toBe(true);
    expect(narrow.endsWith(") · 4s · 12 rows")).toBe(true);
    expect(narrow).toContain("…) · 4s · 12 rows");
    expect(narrow.length, "shorter, and only in the marked run").toBeLessThan(wide.length);
  });

  it("T2.117 (C04 I106, I109): RAMP_KEYS has six members; a seventh key and animate: sweep are refused by name; a ramped document round-trips through JSON", () => {
    expect(RAMP_KEYS.size).toBe(6);
    expect([...RAMP_KEYS].sort()).toEqual(["animate", "bands", "colormap", "fill", "from", "to"]);
    expect(RAMP_ANIMATIONS).toEqual(["none", "shimmer", "wave", "breathe", "pulse", "heartbeat"]);

    const ramped = (ramp: unknown): unknown => ({ kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 3, ramp }] });
    const seventh = validateBlock(ramped({ fill: "palette", period: 200 }));
    expect(seventh.ok).toBe(false);
    if (!seventh.ok) expect(seventh.error.join(" ")).toMatch(/unknown member "period" — a ramp carries fill, from, to, colormap, bands, animate and nothing else/u);
    const sweep = validateBlock(ramped({ fill: "gradient", from: "default", to: "accent", animate: "sweep" }));
    expect(sweep.ok).toBe(false);
    if (!sweep.ok) expect(sweep.error.join(" ")).toMatch(/"animate" must be one of none, shimmer, wave, breathe, pulse, heartbeat.*C04 I109/u);

    // §5a — a ramp on every carrier and on the bar survives the round trip.
    const R: Ramp = { fill: "gradient", from: "default", to: "accent", animate: "wave" };
    const S: readonly TextSpan[] = [{ from: 0, to: 3, ramp: R }];
    const d = doc({
      blocks: [
        block({ kind: "notice", id: "n", tone: "info", text: "a bc d", spans: S }),
        block({ kind: "raw", id: "r", text: "a bc d", spans: S }),
        block({ kind: "rule", id: "h", label: "a bc d", spans: [{ from: 0, to: 3, ramp: { fill: "palette" } }] }),
        block({
          kind: "table",
          id: "t",
          columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 4, sortable: false }],
          rows: [{ id: "r0", cells: { c0: { text: "a bc d", spans: [{ from: 0, to: 3, ramp: { fill: "step", from: "muted", to: "ok", bands: 3 } }] } } }],
        }),
        block({ kind: "progress", id: "p", label: "build", current: 3, total: 10, ramp: { fill: "gradient", colormap: "viridis" } }),
      ],
    });
    const back: unknown = JSON.parse(JSON.stringify(d));
    expect(validateDocument(back).ok).toBe(true);
    expect(back).toEqual(d);
  });
});

describe("C09 §5 — ramps, the extent and the split", () => {
  const theme = DARK_THEME;
  const fgOf = (span: string): string => {
    // The foreground parameter of a painted span's opening SGR, or "" for none.
    const m = /\x1b\[([0-9;]*)m/u.exec(span);
    if (m === null) return "";
    const params = m[1] ?? "";
    const fg = /(?:^|;)(38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7])(?:;|$)/u.exec(params);
    return fg?.[1] ?? "";
  };

  it("T2.118 (C09 I50): RAMP_EXTENT is exhaustive over BlockKind — clusters for the four carriers, axis for progress, none for the rest", () => {
    const kinds = Object.keys(ANIMATES).sort();
    expect(Object.keys(RAMP_EXTENT).sort(), "the record's key set is the kind union's — the same population ANIMATES is checked against").toEqual(kinds);
    const carriers = Object.entries(RAMP_EXTENT).filter(([, v]) => v !== "none").map(([k]) => k).sort();
    expect(carriers).toEqual(["notice", "progress", "raw", "rule", "table"]);
    expect(RAMP_EXTENT.progress).toBe("axis");
    for (const k of ["notice", "raw", "rule", "table"] as const) expect(RAMP_EXTENT[k]).toBe("clusters");
  });

  it("T2.119 (C09 I51, I52): one span per cluster and none inside a ZWJ family; a wrapped span continues its at; a bar at 30% and 90% agree on the first 30% of cells and the off cells carry muted", () => {
    const registry = createBlockRegistry();
    const ctx = { theme, capabilities: FULL_CAPS };
    const text = "héllo 👨‍👩‍👧 ok";
    const ramp: Ramp = { fill: "gradient", from: "default", to: "accent" };
    const runs = runsOf(text, [{ from: 0, to: text.length, ramp }]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.ramp).toEqual({ ramp, at: 0, of: 10, ordinal: 0 });
    const painted = paintRuns(runs, NO_STYLE, ctx);
    // One span per cluster: ten, and the family is one of them, whole.
    expect(painted.map((s) => s.text)).toEqual(["h", "é", "l", "l", "o", " ", "👨‍👩‍👧", " ", "o", "k"]);
    expect(painted.map((s) => s.text).join("")).toBe(text);
    for (const s of painted) expect(s.text, "no split inside a cluster").not.toMatch(/^\u200d|\u200d$/u);
    const row = paint(painted);
    expect(row).not.toMatch(/\u200d\x1b/u);
    // The ends are the slots, the middle is between them, and ten distinct colours.
    const fgs = painted.map((s) => fgOf(sgr(s.style ?? {})));
    expect(new Set(fgs).size).toBe(painted.length);

    // **A wrapped span continues**: the second row's first run starts where the
    // first row's cluster count ends.
    const prose = "alpha beta gamma";
    const wrapped = wrapRuns(runsOf(prose, [{ from: 0, to: prose.length, ramp }]), 11, "narrow");
    expect(wrapped.map((r) => r.map((x) => x.text).join(""))).toEqual(["alpha beta", "gamma"]);
    expect(wrapped[0]?.[0]?.ramp).toEqual({ ramp, at: 0, of: 16, ordinal: 0 });
    expect(wrapped[1]?.[0]?.ramp).toEqual({ ramp, at: 11, of: 16, ordinal: 0 });
    // and a **cut** shortens `of` to what is drawn.
    const cut = sliceRuns(runsOf(prose, [{ from: 0, to: prose.length, ramp }]), 0, 5);
    expect(cut[0]?.ramp).toEqual({ ramp, at: 0, of: 5, ordinal: 0 });

    // **A palette cycles identities, and on text the identity is the span**: five
    // words, five palette spans, five colours — each word whole. The first frame
    // read on landing showed five rainbows, which is the per-cluster answer.
    const words = "alpha beta gamma delta epsilon";
    const wordSpans = ((): TextSpan[] => { const out: TextSpan[] = []; let a = 0; for (const w of words.split(" ")) { out.push({ from: a, to: a + w.length, ramp: { fill: "palette" } }); a += w.length + 1; } return out; })(); // cells-ok — code-unit offsets
    const wordRuns = runsOf(words, wordSpans);
    expect(wordRuns.filter((r) => r.ramp !== undefined).map((r) => r.ramp?.ordinal)).toEqual([0, 1, 2, 3, 4]);
    const wordSpansPainted = paintRuns(wordRuns, NO_STYLE, ctx).filter((s) => s.text.trim() !== "");
    expect(wordSpansPainted.map((s) => s.text)).toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(new Set(wordSpansPainted.map((s) => fgOf(sgr(s.style ?? {})))).size).toBe(5);
    expect(fgOf(sgr(wordSpansPainted[1]?.style ?? {}))).toBe(fgOf(sgr(resolve("categorical.c2", theme, FULL_CAPS))));

    // **The bar over the axis.** At 30% and at 90% the first 30% of cells agree
    // byte for byte, and the `off` cells carry `muted`. Not 100%: the percent
    // gains a digit there and the bar loses a cell, so the axis itself moves —
    // measured on landing, and recorded beside C09 I52.
    const bar = (current: number): string =>
      renderSequenceToLines(registry, [block({ kind: "progress", id: "p", label: "build", current, total: 10, ramp: { fill: "gradient", colormap: "viridis" } })], 40, { theme, capabilities: FULL_CAPS })[0] ?? "";
    const spansOf = (line: string): string[] => line.split(/(?=\x1b\[[0-9;]*m)/u).filter((s) => s.includes("█"));
    const at30 = spansOf(bar(3));
    const at100 = spansOf(bar(9));
    expect(at30.length).toBeGreaterThan(2);
    expect(at100.length).toBeGreaterThan(at30.length);
    for (let i = 0; i < at30.length; i += 1) expect(fgOf(at30[i] ?? ""), `cell ${String(i)}`).toBe(fgOf(at100[i] ?? ""));
    const muted = fgOf(sgr(resolveTone("muted", theme, FULL_CAPS)));
    expect(bar(3)).toContain(muted);
    expect(bar(10), "a full bar has no off cell").not.toContain(muted);
    expect(bar(10).length, "a full bar still draws").toBeGreaterThan(20);
  });

  it("T2.120 (C09 I54): tickIntervalOf answers spinnerIntervalMs() for a shimmer span, null for none or no animate, finds it inside a panel; ANIMATES keeps two true entries", () => {
    const moving = block({ kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 3, ramp: { fill: "palette", animate: "shimmer" } }] });
    const still = block({ kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 3, ramp: { fill: "palette", animate: "none" } }] });
    const plain = block({ kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 3, ramp: { fill: "palette" } }] });
    expect(tickIntervalOf(moving)).toBe(spinnerIntervalMs());
    expect(tickIntervalOf(still)).toBeNull();
    expect(tickIntervalOf(plain)).toBeNull();
    const bar = block({ kind: "progress", id: "p", label: "l", current: 1, total: 2, ramp: { fill: "gradient", colormap: "magma", animate: "wave" } });
    expect(tickIntervalOf(bar)).toBe(spinnerIntervalMs());
    const table = block({
      kind: "table",
      id: "t",
      columns: [{ key: "c0", label: "c", align: "left", priority: 50, minWidth: 4, sortable: false }],
      rows: [{ id: "r0", cells: { c0: { text: "a bc d", spans: [{ from: 0, to: 1, ramp: { fill: "palette", animate: "pulse" } }] } } }],
    });
    expect(tickIntervalOf(table)).toBe(spinnerIntervalMs());
    const nested = block({ kind: "group", id: "g", direction: "column", children: [block({ kind: "panel", id: "pn", title: "t", children: [moving] })] } as never);
    expect(animationIntervalOf([nested])).toBe(spinnerIntervalMs());
    expect(animationIntervalOf([block({ kind: "panel", id: "pn", title: "t", children: [still] } as never)])).toBeNull();
    expect(Object.values(ANIMATES).filter((v) => v).length, "by kind, still two").toBe(2);
  });
});

describe("C10 §4h — the categorical cycle, one copy", () => {
  it("T2.30 (C10 I37): refOf and CATEGORY_REFS from theme/categorical.ts are the same references marks.ts re-exports; theme/** imports nothing from blocks/** or plot/**", () => {
    expect(marks.refOf).toBe(refOf);
    expect(marks.CATEGORY_REFS).toBe(CATEGORY_REFS);
    expect(refOf(9)).toBe("categorical.c2");
    // **The direction that would be a cycle**, read from the sources with
    // comments stripped: `theme/` is below both `blocks/` and `plot/`, and
    // imports nothing from either at run time. The first draft of this row
    // asserted the other direction — `blocks/` importing nothing from `plot/` —
    // and failed on `kinds/image.ts`, which is how §4h's reason was corrected.
    const dir = new URL("../../src/presentation/theme/", import.meta.url);
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const source = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
      expect(source, f).not.toMatch(/^import (?!type )[^;]*from "[./]*\/(?:plot|blocks)\//mu);
    }
  });
});
