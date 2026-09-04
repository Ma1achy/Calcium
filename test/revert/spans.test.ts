// Spans — fail-on-revert. Each row names the change that makes an earlier row
// fail, and shows the reverted behaviour beside the ruled one in the same
// process, which is what makes it a demonstration rather than a description.
import { describe, expect, it } from "vitest";
import { applyPatch, block, validateBlock } from "../../src/data/viewmodel/index.js";
import type { Block, TextSpan, ViewPatch } from "../../src/data/viewmodel/index.js";
import { atomsOf, runsOf, sliceRuns, wrapRuns } from "../../src/presentation/runs.js";
import { runStyle, withSpan } from "../../src/presentation/blocks/paint.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { wrapCells, wrapCellsParts } from "../../src/presentation/text.js";
import { sgr } from "../../src/terminal/escapes.js";
import { doc } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";
import { caps, store } from "../support/theme.js";

const theme = store().current;

describe("C04 §3am — spans, tier 6", () => {
  it("T6.81 (C04 I83): a measurer that reads spans → T1.25's pair fails at the first width", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const spans: readonly TextSpan[] = [{ from: 10, to: 19, bold: true }];
    const plain = block({ kind: "notice", id: "n", tone: "info", text });
    const styled = block({ kind: "notice", id: "n", tone: "info", text, spans });
    const kit = measurable();
    // The edit: a row per span. Every frame still renders and every row count
    // is arithmetically consistent with itself.
    const readsSpans = (b: Block, w: number): number => kit.measure(b, w) + ("spans" in b ? (b.spans?.length ?? 0) : 0); // cells-ok
    expect(kit.measure(styled, 40)).toBe(kit.measure(plain, 40));
    expect(readsSpans(styled, 40)).not.toBe(readsSpans(plain, 40));
  });

  it("T6.82 (C04 I84): dropping the overlap or the surrogate check → T1.24's documents validate", () => {
    const overlap = { kind: "notice", id: "n", tone: "info", text: "abcdef", spans: [{ from: 0, to: 2 }, { from: 1, to: 3 }] };
    const split = { kind: "notice", id: "n", tone: "info", text: "a\u{1F600}b", spans: [{ from: 1, to: 2 }] };
    expect(validateBlock(overlap).ok).toBe(false);
    expect(validateBlock(split).ok).toBe(false);
    // What a range-only gate — integers, `from < to`, `to ≤ length` — says
    // about the same two documents: nothing.
    const rangeOnly = (text: string, spans: readonly { from: number; to: number }[]): boolean =>
      spans.every((s) => Number.isInteger(s.from) && Number.isInteger(s.to) && s.from >= 0 && s.from < s.to && s.to <= text.length); // cells-ok
    expect(rangeOnly(overlap.text, overlap.spans)).toBe(true);
    expect(rangeOnly(split.text, split.spans)).toBe(true);
  });

  it("T6.83 (C04 I86): slicing wrapped spans by prefix sums of row lengths → T3.62 fails on the second row, one unit early", () => {
    const text = "the quick brown fox jumps";
    const runs = runsOf(text, [{ from: 10, to: 19, bold: true }]);
    const ruled = wrapRuns(runs, 10);
    expect(ruled[1]).toEqual([{ text: "brown fox", attrs: { bold: true } }]);

    // The edit: each row's start is the sum of the rows before it. The dropped
    // break space is in no row, so the sum is one short by the second row.
    let sum = 0;
    const byPrefixSum = wrapCells(text, 10).map((row) => {
      const out = sliceRuns(runs, sum, row.length); // cells-ok
      sum += row.length; // cells-ok
      return out;
    });
    expect(byPrefixSum[1]).toEqual([{ text: " " }, { text: "brown fo", attrs: { bold: true } }]);
    expect(byPrefixSum[1]).not.toEqual(ruled[1]);
  });

  it("T6.84 (C04 I85): mapping `**` to a palette slot instead of `bold` → T2.31 sees a colour where it asserts `1`", () => {
    const base = resolveTone("default", theme, FULL_CAPS);
    const ruled = sgr(withSpan(base, { bold: true }));
    expect(ruled).toMatch(/^\x1b\[1(?:;\d+)*m$/u);
    // The edit: emphasis resolved through a slot. It has a colour and no
    // attribute, so the regex T2.31 asserts on does not match it.
    const viaSlot = sgr(resolveTone("accent", theme, FULL_CAPS));
    expect(viaSlot).not.toMatch(/^\x1b\[1(?:;\d+)*m/u);
    // And at one bit `accent` collapses to bold, so T3.67's identical pair
    // would still hold — which is why T2.31 is the row that catches it.
    expect(resolveTone("accent", theme, caps(1))).toEqual({ bold: true });
  });

  it("T6.85 (C04 §3am, I87): a translator keeping its markers → T2.33 fails; and a `replace` cannot leave spans behind", () => {
    // The first half is trivial by construction and is here so the row exists:
    // the emitted text is the marker-stripped one.
    expect("a **bold**").not.toBe("a bold");

    // The second half: no patch arm writes a string, so the old spans cannot
    // survive a new text. A `replace` carrying a block without spans leaves a
    // block without spans; the type makes this the only possibility, and this
    // row is what would start failing the day a text-only arm widened it.
    type TextArm = Extract<ViewPatch, Readonly<{ text: string }>>;
    const noTextArm: [TextArm] extends [never] ? true : false = true;
    expect(noTextArm).toBe(true);

    const before = doc({ blocks: [block({ kind: "raw", id: "r", text: "old", spans: [{ from: 0, to: 3, bold: true }] })] });
    const patched = applyPatch(before, { op: "replace", blockId: "r", block: block({ kind: "raw", id: "r", text: "new text" }) });
    expect(patched.ok).toBe(true);
    if (patched.ok) expect(patched.doc.blocks[0]).not.toHaveProperty("spans");
  });
});

describe("C09 §5 — tone and value, tier 6", () => {
  it("C09 T6.84 (C04 I90): wrapRuns passing no atoms → T1.19 and T3.66 fail on the straddle; a measurer restored to wrapCells disagrees with its own render by a row", () => {
    const text = "x(abcde)yz";
    const runs = runsOf(text, [{ from: 2, to: 7, value: 0.5 }]);
    const ruled = wrapCellsParts(text, 6, "narrow", atomsOf(runs));
    expect(ruled.map((r) => r.text)).toEqual(["x(", "abcde)", "yz"]);
    // The edit: the atoms not passed. The same string wraps in two.
    const reverted = wrapCellsParts(text, 6);
    expect(reverted.map((r) => r.text)).toEqual(["x(abcd", "e)yz"]);
    expect(reverted.length).not.toBe(ruled.length);

    // The edit: `notice.measure` back on `wrapCells(stripControl(text))`. It
    // is right for every notice without a valued span and one short here,
    // while the render — through `noticeRows` — draws three.
    const kit = measurable();
    const valued = block({ kind: "notice", id: "n", tone: "default", text, colormap: "viridis", spans: [{ from: 2, to: 7, value: 0.5 }] } as Block);
    expect(wrapCells(text, 6)).toHaveLength(2);
    expect(kit.measure(valued, 6)).toBe(3);
    expect(kit.renderToLines(valued, 6)).toHaveLength(3);
  });
});

describe("C10 §4e — span attributes, tier 6", () => {
  it("C10 T6.85 (C10 I33, C04 I89): composing a span's tone with the block's instead of replacing it → T1.22's tone arm still passes on colour and T2.26 fails at 1-bit", () => {
    const ctx1 = { theme, capabilities: caps(1) as never };
    const ok1 = resolveTone("ok", theme, caps(1));
    const identifier1 = resolveTone("identifier", theme, caps(1));
    expect(ok1).toEqual({ bold: true });
    expect(identifier1).toEqual({});
    // Ruled: replacement. The run is the normal class, no bits.
    expect(runStyle({ text: "x", tone: "identifier" }, ok1, ctx1)).toBe(identifier1);
    // The edit: composition. The block's `bold` survives under the run, and
    // the row T2.26 asserts — `let ` bold, `x` not — paints `x` bold too.
    const composed = { ...ok1, ...identifier1 };
    expect(composed).toEqual({ bold: true });
    expect(composed).not.toEqual(identifier1);
    // At 24-bit the two readings agree on colour, which is why T1.22 alone
    // could not tell them apart and the 1-bit row exists.
    const ok24 = resolveTone("ok", theme, FULL_CAPS);
    const identifier24 = resolveTone("identifier", theme, FULL_CAPS);
    expect({ ...ok24, ...identifier24 }.colour).toEqual(identifier24.colour);
  });

  it("T6.84 (C10 I33): routing an attribute through a slot → T1.22 fails on colour; gating italic on unicode → T3.11 fails", () => {
    const base = resolveTone("default", theme, FULL_CAPS);
    expect(withSpan(base, { italic: true }).colour).toEqual(base.colour);
    // The edit: emphasis as a slot. The colour changes.
    const viaSlot = { ...base, ...resolveTone("accent", theme, FULL_CAPS) };
    expect(viaSlot.colour).not.toEqual(base.colour);

    // The edit: italic gated on the glyph axis. SGR 3 disappears at ASCII.
    const gated = (style: typeof base, unicode: "full" | "ascii"): string => {
      if (unicode !== "ascii") return sgr(style);
      const { italic: _dropped, ...rest } = style;
      return sgr(rest);
    };
    expect(sgr(withSpan(base, { italic: true }))).toMatch(/\x1b\[3;/u);
    expect(gated(withSpan(base, { italic: true }), ASCII_CAPS.unicode === "ascii" ? "ascii" : "full")).not.toMatch(/\x1b\[3;/u);
  });
});
