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
// **The values are pinned in a file, and a failure prints the entries that
// moved.** An earlier draft pinned each table by a digest, which is total — any
// different value fails, which is what *legal-but-different must fail* means —
// and opaque: a failure said *something moved* and nothing about what, so a
// legitimate change could only be reviewed by reading two revisions of the
// module side by side. `curated-pinned.json` is total in the same way and
// reviewable as well, and a failing row names the entries and their old and new
// values. `test/support/curated.ts` carries the list and the reasoning.
//
// **It is not a snapshot.** No `-u`, and no write path from here: re-taking the
// pin is `npx tsx tools/curated/pin.ts --write`, an act with a diff to read
// afterwards, not a keystroke that records whatever the code now does.
//
// **Driven, not an allow-list I keep by hand.** Every exported table the type
// checker finds in the curated scope must be named in `CURATED` or in `DERIVED`
// with a reason.
// A table added and pinned by neither fails T2.40 — which is the failure mode
// an allow-list has by construction, and the one `an exemption list must be
// driven` was written for.
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
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { CURATED, DERIVED, PROJECTIONS, SCOPE, canon, canonical, entryDiff } from "../support/curated.js";
import { discoverTables } from "../support/exported-tables.js";

const here = dirname(fileURLToPath(import.meta.url));
const PINNED = JSON.parse(
  readFileSync(resolve(here, "../support/curated-pinned.json"), "utf8"),
) as Record<string, unknown>;
const FULL = { unicode: "full", ambiguousWidth: "narrow" } as const;

describe("C10 §2 / C09 §4 — the curated tables", () => {
  it("T2.39 (C10 I44, §2): every curated table is the value it was curated as", () => {
    // **Equality against the pinned file, table by table.** Compared per table
    // rather than whole so the failure names the table first; `entryDiff` then
    // names the entries inside it, with old and new beside each other. That
    // list is the review: a legitimate change reads as a handful of slots, and
    // a substitution reads as the one slot it touched.
    const now = canonical();
    expect(Object.keys(now).sort(), "the pinned set and the curated set are the same set").toEqual(
      Object.keys(PINNED).sort(),
    );
    for (const name of Object.keys(now)) {
      const moved = entryDiff(PINNED[name], now[name]);
      expect(
        moved,
        `${name} moved. If that was meant, re-take the pin with \`npx tsx tools/curated/pin.ts --write\` and say why in the commit`,
      ).toEqual([]);
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

    // The five meaning tones and `muted` (C10 I17, I26): `muted` joined by
    // PARKED 79, so no fact shares an index with the quiet grey.
    expect([...MUST_STAY_DISTINCT]).toEqual(["ok", "warn", "error", "info", "accent", "muted"]);

    // `hcDark` lends the curated map and `hcLight` does not, because that map
    // puts the bright half in the foreground *because the ground is index 0*.
    expect(defaultTheme["hcDark"]!.fourBit).toBe(HIGH_CONTRAST_FOUR_BIT);
    expect(defaultTheme["hcLight"]!.fourBit).toBe(LIGHT_FOUR_BIT);
  });

  it("T2.40 (C10 I44): the tables the checker discovers are the curated and derived sets, and the projections are named", () => {
    // **The driver, and it is what stops this file becoming a list that rots.**
    // The type checker names every exported table in scope — by its declared
    // type, not its initialiser's spelling — and three sets are compared by
    // equality. A table added and named in neither fails here, with its name.
    const root = resolve(here, "../..");
    const tables = discoverTables(root, SCOPE(root));
    const names = tables.map((t) => t.name);

    // Two declarations under one name: a pin by name covers whichever the pin
    // file happened to import, and the other goes unpinned.
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    expect(twice, "one declaration per table name").toEqual([]);

    // **The checker is asked something it must get right**, one table per
    // initialiser shape, so an answer of nothing — or of literals only, which is
    // what the regex saw — is a failure rather than a green run.
    for (const [shape, name] of [
      ["literal", "ANSI16_WINDOWS_HEX"],
      ["identifier", "defaultTheme"],
      ["member", "DARK_FOUR_BIT"],
      ["constructor", "FREE_WIDTH_SLOTS"],
    ] as const) {
      expect(names, `the ${shape}-initialised table is discovered`).toContain(name);
    }

    const exported = Object.keys(CURATED).filter((n) => !Object.hasOwn(PROJECTIONS, n));
    const both = exported.filter((n) => Object.hasOwn(DERIVED, n));
    expect(both, "a table is pinned or derived, not both").toEqual([]);

    // Equality, both directions at once: an undeclared table and a declaration
    // whose table is gone both show up as a difference here.
    expect(
      [...names].sort(),
      "a curated table is pinned by value; a derived one is named in DERIVED with why it needs no pin",
    ).toEqual([...exported, ...Object.keys(DERIVED)].sort());

    // The projection keys are CURATED's non-exported keys exactly.
    expect(
      Object.keys(CURATED).filter((n) => !names.includes(n)).sort(),
      "a CURATED key that is no exported table names the private table it projects",
    ).toEqual(Object.keys(PROJECTIONS).sort());
  }, 60_000);

  it("T2.40a (C10 I44): canon reads a Set as its sorted members and refuses other non-plain objects", () => {
    expect(canon(new Set(["b", "a"]))).toEqual(["a", "b"]);
    expect(canon({ s: new Set([2, 1]) })).toEqual({ s: [1, 2] });
    expect(canonical()["FREE_WIDTH_SLOTS"], "pinned as its member, not as {}").toEqual(["residue"]);
    class Box {
      readonly v = 1;
    }
    for (const v of [new Map([["a", 1]]), new Date(0), new Box()]) {
      expect(() => canon(v), `a ${v.constructor.name} is refused`).toThrow(/canon cannot read/u);
    }
    // The control: plain records, null-prototype records and arrays still read.
    expect(canon(Object.assign(Object.create(null) as object, { b: 1, a: 2 }))).toEqual({ a: 2, b: 1 });
    expect(canon([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });

  it("C10 T2.41 (C09 I45, C02 I9): the ASCII set is also the wide set, and that is a ruling", () => {
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
    const ascii = glyphs({ ...FULL, unicode: "ascii" });
    expect(glyphs({ ...FULL, ambiguousWidth: "wide" }), "wide takes the ASCII set").toEqual(ascii);
    expect(glyphs(FULL), "and neither is the full set").not.toEqual(ascii);

    // And the ASCII rung is pinned, so this row is about *why* two sets agree
    // rather than a second record of what they hold — T2.39 is that record.
    expect(Object.keys(CURATED)).toContain("glyphs(ascii)");
  });
});
