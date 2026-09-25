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

import { GLYPH_DOMAINS, glyphFor, glyphs, headMark, spinnerFrames } from "../../src/presentation/blocks/glyphs.js";
import { ownerLine } from "../../src/shell/chrome.js";
import { FULL_CAPS } from "../support/render.js";

const REGISTRY = JSON.parse(
  readFileSync("docs/design/language/calcium-registry.json", "utf8"),
) as {
  glyphs: readonly Record<string, unknown>[];
  delimiters: readonly Record<string, unknown>[];
};

const glyph = (id: string): Record<string, unknown> | undefined =>
  REGISTRY.glyphs.find((g) => g["id"] === id);

/**
 * **`»` is a delimiter record, not a glyph one**, and that is why it needs its
 * own accessor. Every sweep that looked for it among `glyphs` came back empty
 * and read as *the ruling was never applied* — a matcher that sees one shape
 * reporting absence when the value lives in another.
 */
const delimiter = (id: string): Record<string, unknown> | undefined =>
  REGISTRY.delimiters.find((d) => d["id"] === id);

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

  /**
   * **Retiring a slot is half a ruling, and the comment above used to be the
   * other half.** M4.1 asserted that `live` is gone and that `|` moved, and
   * named both replacements in prose — *still updating* and *my keys go here* —
   * with nothing checking that either arrived. A retirement whose replacements
   * are described and not asserted is a slot deleted and two facts dropped, and
   * every one of those assertions passes.
   */
  it("M4.1b: `live`'s two facts arrived where the ruling sent them", () => {
    // **Fact one — *still updating*.** It goes to the running head-mark state
    // and the duration spinner beside it, which is two carriers rather than
    // one: above 1-bit the mark is the constant and tone says the state, and
    // below it the mark is the state (C09 I45, SS64).
    expect(headMark("running", { ...FULL_CAPS }), "coloured: the constant mark").toBe("running");
    expect(
      headMark("running", { ...FULL_CAPS, colourDepth: 1 }),
      "1-bit: the mark is the state, which is what survives when tone is gone",
    ).toBe("running");
    expect(
      headMark("queued", { ...FULL_CAPS, colourDepth: 1 }),
      "and a different state is a different mark, or the carrier is not one",
    ).not.toBe(headMark("running", { ...FULL_CAPS, colourDepth: 1 }));
    // The motion half, which is the fact `live` actually carried: something is
    // still happening. A set with one frame animates nothing.
    expect(spinnerFrames(CAPS, "agent").length, "the duration slot turns").toBeGreaterThan(1);

    // **Fact two — *my keys go here*.** It goes to the footer's owner line
    // (R-KEY-004) and to `▸` on the focused row. `ownerLine(null)` is the
    // control: no owner raised is no row, so a line that always drew something
    // would satisfy the first assertion alone.
    expect(ownerLine("child", FULL_CAPS).length, "an owner names itself in the footer").toBeGreaterThan(0);
    expect(ownerLine(null, FULL_CAPS), "and nothing owning is no row").toEqual([]);
    expect(glyphFor("focus", CAPS), "and the focused row keeps `▸`").toBe("▸");
    expect(glyphFor("focus", ASCII), "at every rung").toBe(">");
  });

  it("M4.2: `current` is the chooser row, the tape and the form's default button", () => {
    // **The collision domains, not the glyph table.** The ruling is about which
    // positions `›` may occupy — a chooser row and a tape, and not `row-lead`,
    // because over every `›` in the design not one is a transcript gutter.
    // §105's form is the third, and it is a button row's slot, not a gutter
    // (C04 §3ar S7).
    expect(GLYPH_DOMAINS.current, "the three consumers, named").toEqual(["chooser-row", "tape", "form"]);
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

    // **And on the record, which is the half the ruling names and which
    // nothing watched.** The row above asserts the note beside the *slot*;
    // *note its mode-line rôle on the record for its first renderer* is about
    // the registry, and `»` lives in `delimiters` rather than `glyphs` — so a
    // sweep of the glyph records comes back empty and reads as the ruling
    // never having been applied. Asserted here so the record cannot be
    // emptied without a red.
    const tape = delimiter("tape-right");
    expect(tape?.["unicode"], "the registry's own record").toBe("»");
    expect(tape?.["status"]).toBe("current");
    expect(String(tape?.["secondRoleNote"] ?? ""), "the mode-line rôle").toContain("mode line");
    expect(String(tape?.["secondRoleNote"] ?? ""), "and its first renderer").toContain(
      "first renderer",
    );
  });

  it("M4.6: SS59 is a gate, not an inventory row", () => {
    const scans = readFileSync("tools/enforce/source-scans.mjs", "utf8");
    // **`{ id: "SS59"` is the scan; a mention in a comment is not.** The
    // distinction is the whole of *promoted to a gate*: an inventoried rule
    // reads as enforcement and runs nothing.
    expect(scans, "SS59 is a scan entry").toMatch(/\{\s*id:\s*"SS59"/u);
  });
});
