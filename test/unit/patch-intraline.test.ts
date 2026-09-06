// C25 I10 tier 1 — the intra-line diff: token rule, LCS, cap, and the three
// rulings the by-hand walk produced (whitespace, unrelated pair, caller's spans).
//
// **Every row here asserts offsets, not the presence of a span.** A span that
// exists and covers the wrong cells passes any row that counts spans, and the
// frame is the only other instrument that would see it — so the unit tier reads
// `from`/`to` against the text by hand.
import { describe, expect, it } from "vitest";
import {
  INTRALINE_TOKEN_CAP,
  changedRuns,
  intralineLines,
  intralineSpans,
} from "../../src/data/viewmodel/intraline.js";
import type { Hunk } from "../../src/data/viewmodel/index.js";

type Line = Hunk["lines"][number];

const u = (from: number, to: number): Readonly<{ from: number; to: number; underline: true }> => ({ from, to, underline: true });

describe("C25 I10 — the token rule", () => {
  it("T1.9 (C25 I10): punctuation and whitespace are their own tokens, so one changed argument is one changed span", () => {
    // `foo(a, b)` → foo ( a , ␠ b ) — the `b` is at offset 7.
    const r = intralineSpans("foo(a, b)", "foo(a, c)");
    expect(r.removed).toEqual([u(7, 8)]);
    expect(r.added).toEqual([u(7, 8)]);
  });

  it("T1.9 (C25 I10): an underscore joins a word, a run of spaces is one token, a combining mark stays with its base", () => {
    expect(intralineSpans("x_1 = y", "x_2 = y").removed).toEqual([u(0, 3)]);
    // Three spaces against one: the whitespace token changed, the words did not.
    expect(intralineSpans("a   b", "a b")).toEqual({ removed: [u(1, 4)], added: [u(1, 2)] });
    // `e` + U+0301 + `a` is one token; a mark split from its base would give [2, 3).
    expect(intralineSpans("éa z", "éb z").removed).toEqual([u(0, 3)]);
  });
});

describe("C25 I10 — the LCS and its spans", () => {
  it("T1.10 (C25 I10): one changed word is one span per side over that word, and nothing else", () => {
    const r = intralineSpans("  replicas: 2", "  replicas: 3");
    expect(r).toEqual({ removed: [u(12, 13)], added: [u(12, 13)] });
  });

  it("T1.10 (C25 I10): identical lines emit no spans", () => {
    expect(intralineSpans("const a = 1;", "const a = 1;")).toEqual({ removed: [], added: [] });
    expect(intralineSpans("", "")).toEqual({ removed: [], added: [] });
  });

  it("T1.10 (C25 I10): adjacent changed tokens merge into one span, and a matched token between two changes splits them", () => {
    // `b.c` against `x,y`: three adjacent changed tokens, one span.
    expect(intralineSpans("a b.c d", "a x,y d")).toEqual({ removed: [u(2, 5)], added: [u(2, 5)] });
    // `b` and `d` changed with ` c ` matched between: two spans, the space untouched.
    expect(intralineSpans("a b c d", "a x c y")).toEqual({ removed: [u(2, 3), u(6, 7)], added: [u(2, 3), u(6, 7)] });
  });

  it("T1.10 (C25 I10): an insertion is a span on the add side alone, a deletion on the remove side alone", () => {
    expect(intralineSpans("a c", "a b c")).toEqual({ removed: [], added: [u(2, 4)] });
    expect(intralineSpans("a b c", "a c")).toEqual({ removed: [u(2, 4)], added: [] });
  });
});

describe("C25 I10 — the cap", () => {
  it("T1.11 (C25 I10): exactly the cap on both sides is diffed; one token over on one side is not", () => {
    // ` a` × 100 is 200 tokens — a space and a word each time.
    const at = " a".repeat(INTRALINE_TOKEN_CAP / 2);
    const atChanged = `${" a".repeat(INTRALINE_TOKEN_CAP / 2 - 1)} b`;
    const atCap = intralineSpans(at, atChanged);
    expect(atCap.removed).toEqual([u(at.length - 1, at.length)]); // cells-ok — a code-unit offset
    expect(atCap.added).toEqual([u(at.length - 1, at.length)]); // cells-ok — a code-unit offset

    const over = `x${at}`;
    expect(intralineSpans(over, `x${atChanged}`)).toEqual({ removed: [], added: [] });
    // Over on the *other* side alone is the same refusal.
    expect(intralineSpans(atChanged, over)).toEqual({ removed: [], added: [] });
  });
});

describe("C25 I10 — whitespace is a token", () => {
  it("T1.12 (C25 I10): a re-indent underlines the changed indentation on both sides", () => {
    expect(intralineSpans("  foo()", "    foo()")).toEqual({ removed: [u(0, 2)], added: [u(0, 4)] });
  });

  it("T1.12 (C25 I10): a trailing space is one underlined cell on the side that gained it", () => {
    expect(intralineSpans("foo", "foo ")).toEqual({ removed: [], added: [u(3, 4)] });
  });
});

describe("C25 I10 — an unrelated pair gets no spans", () => {
  it("T1.13 (C25 I10): no shared non-whitespace token → nothing; one shared word → the rest underlined", () => {
    expect(intralineSpans("foo bar", "baz qux")).toEqual({ removed: [], added: [] });
    expect(intralineSpans("foo bar", "foo qux")).toEqual({ removed: [u(4, 7)], added: [u(4, 7)] });
    // Sharing only punctuation counts as related: `;` is not whitespace.
    expect(intralineSpans("a;", "b;")).toEqual({ removed: [u(0, 1)], added: [u(0, 1)] });
  });
});

describe("C25 I10 — the writer over a hunk's lines", () => {
  const rm = (text: string, spans?: Line["spans"]): Line => (spans === undefined ? { kind: "remove", text } : { kind: "remove", text, spans });
  const ad = (text: string, spans?: Line["spans"]): Line => (spans === undefined ? { kind: "add", text } : { kind: "add", text, spans });
  const cx = (text: string): Line => ({ kind: "context", text });

  it("T1.14 (C25 I10): the nth remove is diffed against the nth add, and the lopsided tail carries none", () => {
    const out = intralineLines([cx("k: 0"), rm("k: 1"), rm("k: 2"), rm("k: 3"), ad("k: 9"), cx("k: 5")]);
    expect(out.map((l) => l.spans)).toEqual([undefined, [u(3, 4)], undefined, undefined, [u(3, 4)], undefined]);
  });

  it("T1.14 (C25 I10): a context line carries none, even between two changed lines that would diff", () => {
    // The context line breaks the run: the remove and the add are in different
    // runs and are not paired with each other.
    const out = intralineLines([rm("k: 1"), cx("k: 1"), ad("k: 2")]);
    expect(out.map((l) => l.spans)).toEqual([undefined, undefined, undefined]);
  });

  it("T1.14 (C25 I10): interleaved removes and adds keep the document's order — the run is paired, not reordered", () => {
    const out = intralineLines([rm("a 1"), ad("a 2"), rm("b 1"), ad("b 2")]);
    expect(out.map((l) => `${l.kind}:${l.text}`)).toEqual(["remove:a 1", "add:a 2", "remove:b 1", "add:b 2"]);
    expect(out.map((l) => l.spans)).toEqual([[u(2, 3)], [u(2, 3)], [u(2, 3)], [u(2, 3)]]);
  });

  it("T1.14 (C25 I10): a line the caller gave spans keeps them, and its partner is left alone", () => {
    const given = [{ from: 0, to: 1, bold: true }];
    const out = intralineLines([rm("k: 1", given), ad("k: 2"), rm("j: 1"), ad("j: 2", given)]);
    expect(out[0]?.spans).toBe(given);
    expect(out[1]?.spans).toBeUndefined();
    expect(out[2]?.spans).toBeUndefined();
    expect(out[3]?.spans).toBe(given);
  });

  it("T1.14 (C25 I10): the writer is idempotent — a second pass over its own output changes nothing", () => {
    const once = intralineLines([rm("k: 1"), ad("k: 2")]);
    expect(intralineLines(once)).toEqual(once);
  });

  it("T1.14 (C25 I10): lines with nothing to write are returned as the same array", () => {
    const lines = [cx("a"), rm("x y"), ad("p q")];
    expect(intralineLines(lines)).toBe(lines);
  });

  it("T1.14 (C25 I10): changedRuns groups a maximal run and passes context through", () => {
    const lines = [cx("a"), rm("b"), ad("c"), ad("d"), cx("e"), rm("f")];
    const groups = changedRuns(lines);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toBe(lines[0]);
    expect(groups[1]).toEqual({ removes: [lines[1]], adds: [lines[2], lines[3]] });
    expect(groups[2]).toBe(lines[4]);
    expect(groups[3]).toEqual({ removes: [lines[5]], adds: [] });
  });
});
