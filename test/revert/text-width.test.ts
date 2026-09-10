// C09 tier 6 — fail-on-revert, for the cluster sum and the derived zero-width
// set (C09 §5, I65; F978, F979).
//
// Each row names the change that makes it fail and constructs the state that
// change produces, in T6.103's form: the reverted rule is built here beside the
// real one, and what it answers is read against the row it would fail. The
// mutations themselves are `tools/mutate/runs/c09-text-zero-width.mjs`.
import { describe, expect, it } from "vitest";
import { Text } from "ink";
import { createElement } from "react";
import { cells } from "../../src/presentation/text.js";
import { renderToLines } from "../support/ink.js";

describe("C09 §5 — the cluster sum and the zero-width set, fail-on-revert", () => {
  it("T6.111 (I65): the sum stops at the base — the old model — → T1.37 fails on `aः`", () => {
    // **The revert is `clusterCells` answering for `codePointAt(0)` alone**,
    // the rule that stood until F978. Built here as the base's own measure:
    // for every spacing-mark shape T1.37 holds it answers what the old
    // function answered — one — and the row's entry is two.
    const baseOnly = (cluster: string): number => cells(String.fromCodePoint(cluster.codePointAt(0) ?? 0));
    const SPACING = { "aः": "a\u0903", "कि": "\u0915\u093f", "கொ": "\u0b95\u0bca", "কা": "\u0995\u09be" };
    for (const [name, text] of Object.entries(SPACING)) {
      expect(baseOnly(text), `${name} under the base rule`).toBe(1);
      expect(cells(text), `${name} — T1.37's entry`).toBe(2);
    }
    // The control: the shapes the base rule got right are where the two agree,
    // so the row is about spacing marks and not about the reconstruction.
    expect(baseOnly("e\u0301"), "a nonspacing mark folds into its base either way").toBe(cells("e\u0301"));
    expect(baseOnly("\u{1F468}\u200d\u{1F469}"), "and a family is its first face either way").toBe(cells("\u{1F468}\u200d\u{1F469}"));
  });

  it("T6.112 (I65, I1): a spacing mark counted as none → T2.133 reads two rows", () => {
    // **The state**: a row padded to the width by a measure that gives a
    // spacing mark nothing — the old answer — and handed to Ink at that width.
    // Ink counts the mark, so the row is two cells over and wraps into the
    // second row the measurer never counted; padded by the real measure the
    // same row is one. Through Ink directly rather than the registry, because
    // the registry now cuts by the real measure and would repair the row on
    // the way — which is the fix, and not the state this row constructs.
    const zeroMc = (text: string): number => cells(text.replace(/\p{Mc}/gu, ""));
    const text = "a\u0903 \u0915\u093f";
    expect(zeroMc(text), "the old answer for the row").toBe(3);
    expect(cells(text), "the real one").toBe(5);
    for (const width of [40, 80]) {
      const old = `${text}${" ".repeat(width - zeroMc(text))}`;
      const now = `${text}${" ".repeat(width - cells(text))}`;
      expect(renderToLines(createElement(Text, null, old), width).length, `padded by the old measure at ${String(width)}`).toBe(2); // cells-ok — rows
      expect(renderToLines(createElement(Text, null, now), width).length, `padded by the real measure at ${String(width)}`).toBe(1); // cells-ok — rows
    }
  });

  it("T6.113 (I65): the joiner no longer ends the sum → T1.37 fails on the family (6)", () => {
    // **The state**: the sum carried past U+200D, every pictograph counted —
    // three faces at two cells each. Built as the sum over the family's code
    // points with the joiner contributing nothing and ending nothing.
    const FAMILY = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}";
    let carried = 0;
    for (const ch of FAMILY) carried += cells(ch); // 2 + 0 + 2 + 0 + 2
    expect(carried, "the sum without the break").toBe(6);
    expect(cells(FAMILY), "T1.37's entry: the joiner ends the sum at the first face").toBe(2);
    // The control: `a` + joiner + `b` is two cells with the break and without
    // it — the segmenter makes two clusters of it — so the family is the row
    // that sees the break and this pair is not.
    let pair = 0;
    for (const ch of "a\u200db") pair += cells(ch);
    expect(pair).toBe(cells("a\u200db"));
  });

  it("T6.114 (I65): U+00AD admitted to the zero set → T1.38 fails", () => {
    // **The state**: the property taken whole — every `Cf`, U+00AD among them
    // — as T1.38 would derive it without the exclusion. The measurer disagrees
    // with it at exactly one code point, so T1.38's equality fails at exactly
    // one range.
    const WHOLE = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
    expect(WHOLE.test("\u00ad"), "U+00AD is Cf, so the whole property admits it").toBe(true);
    expect(cells("\u00ad"), "and the measurer refuses it — a cell, as xterm advances").toBe(1);
    const disagree: number[] = [];
    for (let cp = 0xa0; cp <= 0x2fff; cp += 1) {
      const ch = String.fromCodePoint(cp);
      if (WHOLE.test(ch) !== (cells(ch) === 0)) disagree.push(cp);
    }
    expect(disagree, "over U+00A0..U+2FFF the whole property and the measurer disagree at one code point").toEqual([0xad]);
  });
});
