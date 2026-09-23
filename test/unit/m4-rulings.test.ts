// M4's six rulings, asserted against the tree (§The head mark, the design kit).
//
// **This exists because the claim had no home.** *M4 landed* was carried across
// several sessions as a settled fact, re-checked by grep each time and disputed
// again the next — which is the sixth blind spot exactly: every other instrument
// checks an artefact, and nothing checks whether a belief has a source. A claim
// repeated across steps acquires the authority of a ruling without ever having
// been one, and the cheapest fix is to make it answerable by running the suite.
//
// **Each row reads the thing the ruling is about, not a mention of it.** A grep
// for `live` answers on a comment; what the ruling says is that the *slot* is
// gone, so that is what is asserted.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GLYPH_DOMAINS, glyphFor, glyphs } from "../../src/presentation/blocks/glyphs.js";

const REGISTRY = JSON.parse(
  readFileSync("docs/design/language/calcium-registry.json", "utf8"),
) as { glyphs: readonly Record<string, unknown>[] };

const glyph = (id: string): Record<string, unknown> | undefined =>
  REGISTRY.glyphs.find((g) => g["id"] === id);

const CAPS = { unicode: "full", ambiguousWidth: "narrow" } as const;
const ASCII = { unicode: "ascii", ambiguousWidth: "narrow" } as const;

describe("M4 — the six rulings, against the tree", () => {
  it("M4.1: `live` is retired and `|` is the quote rail's ASCII rung", () => {
    // **The slot, not a mention.** `live` carried two facts and both moved:
    // *still updating* to the running head-mark state with its duration
    // spinner, *my keys go here* to the footer's owner line and `▸` on focus.
    // `GLYPH_TABLE` is private, so the slot set is read off the one table that
    // is published over the same key — a first draft imported the private one
    // and asserted `Object.keys(undefined)`, which fails for the wrong reason.
    expect(Object.keys(GLYPH_DOMAINS), "no `live` slot survives").not.toContain("live");
    // **`glyphFor`, not `glyphs()`.** The second answers the *structural* set —
    // rules, corners, the residue — and a mark is not in it; a draft that asked
    // it for `quote` got `undefined` and would have read as the slot being
    // gone, which is what this row is trying to distinguish.
    expect(glyphFor("quote", CAPS), "the quote rail").toBe("⎸");
    expect(glyphFor("quote", ASCII), "and `|` is its ASCII rung, which `live` used to hold").toBe("|");
  });

  it("M4.2: `current` is the chooser row and the tape", () => {
    // **The collision domains, not the glyph table.** The ruling is about which
    // positions `›` may occupy — a chooser row and a tape, and not `row-lead`,
    // because over every `›` in the design not one is a transcript gutter.
    expect(GLYPH_DOMAINS.current, "both consumers, named").toEqual(["chooser-row", "tape"]);
  });

  it("M4.3: the residue is `⋯` and `...`, reserving three cells at every rung", () => {
    expect(glyphs(CAPS).residue, "the unicode rung").toBe("⋯");
    expect(glyphs(ASCII).residue, "and the ASCII rung").toBe("...");
    // **Three at every rung**, which is what makes the geometry identical
    // across them: a mark reserving one cell in unicode and three in ASCII
    // moves everything beside it when the capability changes.
    expect(glyph("ellipsis")?.["reservedCells"], "the registry's own record").toBe(3);
    expect(glyph("ellipsis")?.["ascii"], "and its ASCII form").toBe("...");
  });

  it("M4.4: the registry's `rule` is ─ U+2500", () => {
    expect(glyph("rule")?.["unicode"], "U+2500, not an em dash").toBe("─");
  });

  it("M4.5: `»` stays tape-right, and its mode-line rôle is on the record", () => {
    expect(glyphs(CAPS).tapeRight, "the shed count's mark").toBe("»");
    // **The note is the ruling.** `»` leads the mode line in §003, §004 and
    // §007 — a chrome row's lead, not a shed count — and a shared mark with
    // two meanings is F161's hazard. The record says the first renderer
    // registers its own rather than reusing this one, and a row that only
    // checked the character would pass while that note was deleted.
    const source = readFileSync("src/presentation/blocks/glyphs.ts", "utf8");
    expect(source, "the second rôle is recorded beside the slot").toContain("mode line");
    expect(source, "and so is the refusal to share the mark").toMatch(/its own mark rather than\s+\*?\s*reusing this one/u);
  });

  it("M4.6: SS59 is a gate, not an inventory row", () => {
    const scans = readFileSync("tools/enforce/source-scans.mjs", "utf8");
    // **`{ id: "SS59"` is the scan; a mention in a comment is not.** The
    // distinction is the whole of *promoted to a gate*: an inventoried rule
    // reads as enforcement and runs nothing.
    expect(scans, "SS59 is a scan entry").toMatch(/\{\s*id:\s*"SS59"/u);
  });
});
