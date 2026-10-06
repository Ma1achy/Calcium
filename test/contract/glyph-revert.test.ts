// C09 I114 — `↺` is registered (parked 17).
//
// **Read from the registry and from `glyphs()`, both.** A record with no slot is
// SS65's; a slot with no record is a mark SS64 cannot see, because its domains
// are built from records — the shape `↺` had for as long as it was prose.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GLYPH_SET_DOMAINS, glyphs } from "../../src/presentation/blocks/glyphs.js";
import { checkGlyphPresence, checkMarkDomains } from "../../tools/enforce/source-scans.mjs";

const REGISTRY = readFileSync("docs/design/language/calcium-registry.json", "utf8");
const GLYPHS = readFileSync("src/presentation/blocks/glyphs.ts", "utf8");

describe("C09 I114 — the revert affordance", () => {
  it("T2.176 (C09 I114, SS64, SS65): `glyphs(caps).revert` is ↺ / < and the registry record agrees", () => {
    expect(glyphs({ unicode: "full", ambiguousWidth: "narrow" }).revert).toBe("↺");
    expect(glyphs({ unicode: "ascii", ambiguousWidth: "narrow" }).revert).toBe("<");
    // U+21BA is Ambiguous, so `wide` takes the ASCII set wholesale (C02 I9).
    expect(glyphs({ unicode: "full", ambiguousWidth: "wide" }).revert).toBe("<");

    const record = (JSON.parse(REGISTRY) as { glyphs: { id: string; unicode: string; ascii: string; collisionDomains: string[]; status: string }[] })
      .glyphs.find((g) => g.id === "revert");
    expect(record, "the registry has the record").toMatchObject({
      unicode: "↺",
      ascii: "<",
      collisionDomains: ["inline"],
      status: "current",
    });

    // The tree places it where the record does — a slot in another domain
    // contests other marks, and SS64 reads the tree's table, not the record's.
    expect(GLYPH_SET_DOMAINS.revert, "the tree's domain is the record's").toEqual(record?.collisionDomains);

    // Both gates green with it: the record has a slot, and the slot's ASCII
    // contests nothing in the content row.
    expect(checkGlyphPresence(REGISTRY, GLYPHS)).toEqual([]);
    expect(checkMarkDomains(REGISTRY, GLYPHS)).toEqual([]);

    // **The control is the first reach.** `~` is `nested`'s ASCII in `row-lead`,
    // and `content-row` holds `row-lead` and `inline` — so the record at `~` is
    // reported, which is what ruled it out and what says the check can see this
    // record at all.
    const tilde = REGISTRY.replace('"unicode": "↺",\n      "ascii": "<",', '"unicode": "↺",\n      "ascii": "~",');
    expect(tilde, "the fabrication changed the record").not.toBe(REGISTRY);
    const found = checkMarkDomains(tilde, GLYPHS);
    expect(found.map((v) => v.rule)).toContain("SS64");
    expect(found.map((v) => v.message).join("\n")).toContain("~");
  });
});
