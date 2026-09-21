// C10 §2, C09 §4 — the curated tables, pinned by exact value.
//
// **A property test cannot see a substitution, and that is what this file is
// for.** Measured 2026-09-21: the theme generator handed `hcDark` the ordinary
// dark theme's ANSI indices instead of `HIGH_CONTRAST_FOUR_BIT`, and every row
// about it passed — because `DARK_FOUR_BIT` is legal, and it also keeps the five
// tones distinct, which is what those rows checked. What was lost was the
// *curation*: `syntax.type` on plain yellow so `number`'s bright yellow stays
// its own, and the rest of that map's argument.
//
// A test written over a constant's **properties** cannot distinguish the
// constant from any other value with those properties. Deliberateness is the
// thing at risk here, and deliberateness is not a property of a value. So these
// rows assert the value itself.
//
// **A digest, and a shape beside it.** The digest is what makes the pin total —
// any different value fails, which is what *legal-but-different must fail*
// means. It is also opaque, so each row carries its entry count and the entries
// whose docblocks argue for them, written out. The digest says *something
// moved*; the literals say *and here is what it was for*.
//
// **Driven, not an allow-list I keep by hand.** Every exported frozen table in
// the curated modules must be named in `PINNED` or in `DERIVED` with a reason.
// A table added and pinned by neither fails T2.40 — which is the failure mode
// an allow-list has by construction, and the one `an exemption list must be
// driven` was written for.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DARK_FOUR_BIT,
  HIGH_CONTRAST_FOUR_BIT,
  LIGHT_FOUR_BIT,
  MUST_STAY_DISTINCT,
} from "../../src/presentation/theme/four-bit.js";
import { OKABE_ITO_CANONICAL, VISIONS } from "../../src/presentation/theme/cvd.js";
import { COLORMAPS } from "../../src/presentation/theme/colormap.js";
import { CATEGORY_REFS } from "../../src/presentation/theme/categorical.js";
import { REQUIRED_SLOTS } from "../../src/presentation/theme/contrast.js";
import {
  GLYPH_SUBSTITUTIONS,
  GLYPH_TOKENS,
  SPINNER_SETS,
  SUBSTITUTIONS,
  barStyle,
  barStyleNames,
  glyphs,
} from "../../src/presentation/blocks/glyphs.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";

/**
 * **Key order is not part of a table's identity, and its values are.** A
 * canonical form sorts keys and keeps arrays in order, so re-ordering a record's
 * declarations is free and changing one index is not — which is the line this
 * file wants, since a curated map's order is how it reads and its values are
 * what it promises.
 */
const canon = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
};
const digest = (v: unknown): string => createHash("sha256").update(canon(v)).digest("hex").slice(0, 16);
const size = (v: unknown): number => (Array.isArray(v) ? v.length : Object.keys(v as object).length);

const FULL = { unicode: "full", ambiguousWidth: "narrow" } as const;

/** name → [the table, its digest, its entry count]. */
const PINNED: readonly (readonly [string, unknown, string, number])[] = [
  // C10 §3 — the three 4-bit maps. Sixteen indices whose *values* are the
  // emulator's, so what is curated is which slot takes which index.
  ["DARK_FOUR_BIT", DARK_FOUR_BIT, "10c76c5b8151425d", 36],
  ["LIGHT_FOUR_BIT", LIGHT_FOUR_BIT, "a5fa703bf4622d52", 36],
  ["HIGH_CONTRAST_FOUR_BIT", HIGH_CONTRAST_FOUR_BIT, "f2313581e78f13e9", 36],
  ["MUST_STAY_DISTINCT", MUST_STAY_DISTINCT, "986f97e461ee9d63", 5],

  // C10 §4j — the calibrating set. A *different* palette that also separates
  // under all three dichromacies would pass `collisions() === []` exactly as
  // this one does, which is why the control is pinned and not merely checked.
  ["OKABE_ITO_CANONICAL", OKABE_ITO_CANONICAL, "53888dcda8a8f11f", 8],
  ["VISIONS", VISIONS, "0ba27118ccb50985", 4],

  // C10 §4h, §4j — the colormaps and the categorical refs.
  ["COLORMAPS", COLORMAPS, "58331dfd4c1300a3", 142],
  ["CATEGORY_REFS", CATEGORY_REFS, "8734f8b4ee8d8521", 8],
  ["REQUIRED_SLOTS", REQUIRED_SLOTS, "3835a7b1f1ce3417", 3],

  // C09 §4 — the alphabets. A spinner frame swapped for another one-cell glyph,
  // or an ASCII fallback swapped for another ASCII character, passes every width
  // and distinctness row this repository has.
  ["SPINNER_SETS", SPINNER_SETS, "8eb8fcab0826b8e0", 26],
  ["SUBSTITUTIONS", SUBSTITUTIONS, "71fcc16b8ef11716", 38],
  ["GLYPH_SUBSTITUTIONS", GLYPH_SUBSTITUTIONS, "bd881d6a04811cde", 17],
  ["GLYPH_TOKENS", GLYPH_TOKENS, "f2ffe9b608503d76", 17],

  // `GLYPH_TABLE` and `BAR_STYLES` are module-private, so they are pinned
  // through the projections that ship — which is the better subject anyway: what
  // a caller receives, rather than the literal behind it.
  ["glyphs(full)", glyphs(FULL), "6ed613b3044a283b", 38],
  ["glyphs(ascii)", glyphs({ ...FULL, unicode: "ascii" }), "63a0e1d871278aa3", 38],
  ["barStyles", Object.fromEntries(barStyleNames().map((n) => [n, barStyle(n)])), "4734f4464136cb64", 9],
];

/**
 * Exported frozen tables in the curated modules that are **derived** and need no
 * pin — each with the reason, because *derived* is a claim and an unstated one
 * reads as an omission.
 */
const DERIVED: Readonly<Record<string, string>> = {
  CUBE_LEVELS: "the xterm 256-colour cube's own six levels \u2014 the emulator's, not a choice",
  NO_STYLE: "the empty Style; its emptiness is the claim and C09 T1.2 asserts it",
  MARKER3_COLUMN: "C12's 3-D marker column, derived from the braille block's own encoding",
  DARK: "the ink oracle's frozen palette \u2014 `test/support/ink-oracle.ts` pins it at 1 913 captures",
  LIGHT: "a lender for the 4-bit rung; the shipped light theme is the registry's",
  HIGH_CONTRAST: "the same, and T2.39a pins its 4-bit map by reference",
};

const here = dirname(fileURLToPath(import.meta.url));
const MODULES = [
  "src/presentation/theme/four-bit.ts",
  "src/presentation/theme/cvd.ts",
  "src/presentation/theme/colormap.ts",
  "src/presentation/theme/categorical.ts",
  "src/presentation/theme/contrast.ts",
  "src/presentation/theme/types.ts",
  "src/presentation/theme/index.ts",
  "src/presentation/theme/tokens-dark.ts",
  "src/presentation/theme/tokens-light.ts",
  "src/presentation/theme/tokens-high-contrast.ts",
  "src/presentation/blocks/glyphs.ts",
];

describe("C10 §2 / C09 §4 — the curated tables", () => {
  it("T2.39 (C10 I44, §2): every curated table is the value it was curated as", () => {
    // **Both halves of each row.** The digest is the pin; the count is what a
    // reader checks against the module, and it is what says *which way* a table
    // moved when the digest fails — a dropped entry and an edited one read the
    // same from a hash alone.
    for (const [name, table, want, count] of PINNED) {
      expect(size(table), `${name}: entry count`).toBe(count);
      expect(digest(table), `${name}: the curated value — if this is deliberate, re-take it here and say why in the commit`).toBe(want);
    }
  });

  it("T2.39a (C10 I44, C10 I26): the entries whose docblocks argue for them, written out", () => {
    // **A digest says something moved and nothing about what it was for.** These
    // are the entries a docblock in the module makes an argument about, so a
    // reader meeting a failed digest has the reasoning here rather than in a
    // diff. Deliberately a handful and not the whole map: the digest is the
    // total pin, and this is the part that carries meaning.

    // `HIGH_CONTRAST_FOUR_BIT`'s own comment: plain yellow, so `number`'s bright
    // yellow stays its own. This is the entry whose loss went unnoticed for a
    // whole MR, because the map it lives in was orphaned rather than edited.
    expect(HIGH_CONTRAST_FOUR_BIT["syntax.type"], "plain yellow, so number's bright yellow stays its own").toBe(3);
    expect(DARK_FOUR_BIT["syntax.type"], "and the dark map differs here, which is the whole point").not.toBe(
      HIGH_CONTRAST_FOUR_BIT["syntax.type"],
    );

    // The five whose distinctness is the 4-bit rung's only promise (C10 I26).
    expect([...MUST_STAY_DISTINCT]).toEqual(["ok", "warn", "error", "info", "accent"]);

    // `hcDark` lends the curated map and `hcLight` does not, because that map
    // puts the bright half in the foreground *because the ground is index 0*.
    expect(defaultTheme["hcDark"]!.fourBit).toBe(HIGH_CONTRAST_FOUR_BIT);
    expect(defaultTheme["hcLight"]!.fourBit).toBe(LIGHT_FOUR_BIT);
  });

  it("T2.40 (C10 I44): every exported frozen table in the curated modules is pinned or declared derived", () => {
    // **The driver, and it is what stops this file becoming a list that rots.**
    // An allow-list is only as good as the discipline of adding to it; an
    // equality check over the module's own exports makes the addition
    // compulsory. A table added and named in neither set fails here, with the
    // name it was given.
    const declared = new Set([...PINNED.map(([n]) => n), ...Object.keys(DERIVED)]);
    const found: string[] = [];
    for (const rel of MODULES) {
      const src = readFileSync(resolve(here, "../..", rel), "utf8");
      for (const m of src.matchAll(/^export const ([A-Za-z_][A-Za-z0-9_]*)\b[^=]*=\s*(?:Object\.freeze|\{|\[)/gmu)) {
        found.push(m[1]!);
      }
    }
    expect(found.length, "the scan found the modules' exports").toBeGreaterThan(10);

    const unpinned = found.filter((n) => !declared.has(n));
    expect(
      unpinned,
      "a curated table is pinned by value; a derived one is named in DERIVED with why it needs no pin",
    ).toEqual([]);

    // **Both directions.** A name in `DERIVED` that no module exports any more
    // is an exemption outliving its subject — the shape a subset check lets
    // through, and the reason `compare-exemption-lists-by-equality` exists.
    // `PINNED` needs no such row: every entry imports its table, so a retired
    // one fails to compile.
    const stale = Object.keys(DERIVED).filter((n) => !found.includes(n));
    expect(stale, "a derived-table exemption whose table is gone").toEqual([]);
  });

  it("T2.41 (C09 I45, C02 I9): the ASCII set is also the wide set, and that is a ruling", () => {
    // **A collision, asserted so it is not read as one.** Two different
    // capability records producing byte-identical output is ordinarily the tell
    // for a dropped input — and here it is the documented answer: box drawing is
    // `East_Asian_Width=Ambiguous` throughout, so on a terminal that draws
    // ambiguous glyphs wide, every border and bar is twice the width it was
    // measured at. The ASCII rung is the only set with no ambiguous member, so
    // it serves both (C02 I9, roadmap 51).
    //
    // Pinned here because the alternative — a third set of narrow substitutes —
    // was considered and refused, and a future reader finding two identical sets
    // would otherwise reasonably assume a bug.
    expect(digest(glyphs({ ...FULL, ambiguousWidth: "wide" })), "wide takes the ASCII set").toBe(
      digest(glyphs({ ...FULL, unicode: "ascii" })),
    );
    expect(digest(glyphs(FULL)), "and neither is the full set").not.toBe(
      digest(glyphs({ ...FULL, unicode: "ascii" })),
    );

    // `DEFAULT_BAR_STYLE` resolves, which is what `DERIVED` claims of it.
    expect(barStyleNames()).toContain("block");
    expect(barStyle("block"), "the default resolves to a style").toBeDefined();
  });
});
