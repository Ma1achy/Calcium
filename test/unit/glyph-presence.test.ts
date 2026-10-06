// C09 §7c — every registry glyph resolves to a mark this tree can draw.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { checkGlyphPresence, GLYPH_HOMES } from "../../tools/enforce/source-scans.mjs";

const REGISTRY = readFileSync("docs/design/language/calcium-registry.json", "utf8");
const GLYPHS = readFileSync("src/presentation/blocks/glyphs.ts", "utf8");

/** The slot as `glyphs.ts` writes it — the escaped form, which is the hazard. */
const SLOT = 'question: ["\\u27e9", "?"],';

describe("C09 §7c — the carrier matrix's marks", () => {
  it("T2.155 (C09 I88): SS65 fires when a current registry glyph resolves to no mark this tree can draw", () => {
    expect(checkGlyphPresence(REGISTRY, GLYPHS), "the tree as it stands").toEqual([]);

    // **The fabricated violation, and it is the rule's own first finding.**
    // `⟩` U+27E9 was in no file in `src/` while both question components named
    // it as their first carrier. Taking the slot back out is the state the scan
    // was written against, and it is what says it can see an absence at all.
    expect(GLYPHS, "the fixture has something to remove").toContain(SLOT);
    const without = GLYPHS.replace(SLOT, "");
    const found = checkGlyphPresence(REGISTRY, without);
    expect(found.map((v) => v.rule)).toEqual(["SS65"]);
    expect(found[0]?.message).toContain("question");
    expect(found[0]?.message, "and it says why SS64 could not").toContain("both sides");

    // **The two readings that cancelled, and each is asserted alone.** On the
    // first run this rule was green on a file it had read wrongly twice: the
    // slot is written `⟩`, which a raw-text match calls absent, and the
    // character appears in a comment distinguishing it from `›`, which a
    // whole-file match calls present. Either fixed alone flips the verdict;
    // both together looked exactly like a satisfied rule (A03 §2).
    expect(without, "the mark survives in prose, and must not count").toContain("⟩");
    expect(GLYPHS, "and the live slot is escaped, and must count").not.toContain('["⟩"');

    // **The control, and it is the dangerous direction.** A vocabulary read
    // wrongly *empty* reports every glyph and is loud; one read wrongly *wide*
    // reports none and is silent. So the scan looks for marks the file
    // certainly holds before it trusts what it read, and that guard fires.
    const gutted = checkGlyphPresence(REGISTRY, "const nothing = 1;\n");
    expect(gutted, "an unparsed vocabulary is a violation, not a pass").toHaveLength(1);
    expect(gutted[0]?.message).toContain("read wrongly wide");
  });

  it("T2.155b (C09 I88): the allow-list carries its premise and expires by itself", () => {
    // **Asserted as the mark, not as a length.** A character count measures the
    // prose and is green for eighty characters of anything; what an exemption
    // owes is the mark it excuses, so the entry can be found from the glyph.
    expect(GLYPH_HOMES).toEqual({ reader: expect.stringContaining("❯") });

    // **The bidirectional arm fired, and this is the row after it fired.** It
    // was written against `tape-left` and `tape-right`, whose entries said *this
    // entry is itself a violation the day that MR lands* — and M14 landed them,
    // `make enforce` reported both, and the entries came out. So the subject is
    // now **fabricated**: a live entry for a mark the file certainly holds. A
    // row that lost its arm when the arm worked would be a check that expires
    // the moment it succeeds, which is the opposite of what the list needs.
    // **The real list plus one fabrication**, not a list of one: replacing the
    // homes wholesale un-excuses `reader`, whose `❯` is a registry mark that
    // deliberately lives elsewhere — so the row would report two violations and
    // only one of them would be the one under test.
    const found = checkGlyphPresence(REGISTRY, GLYPHS, {
      ...GLYPH_HOMES,
      current: "a fabricated home for `›`, a registry mark `glyphs.ts` certainly holds",
    });
    expect(found.map((v) => v.rule)).toEqual(["SS65"]);
    expect(
      found[0]?.message.startsWith("GLYPH_HOMES names current,"),
      "an entry whose glyph has arrived is itself the violation",
    ).toBe(true);
  });
});
