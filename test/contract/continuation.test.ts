// The `⎿` continuation mark — the slot, and the eligibility rule that is a
// property of the ENTRY rather than of the block.
//
// **Every other `Glyph` names a state the block is in.** This one names a
// relationship to a line that has to exist, so the interesting rows are the
// negatives: the two blocks that read as consumers and are not. Both were named
// as consumers before anyone looked, and both fail for a reason that had not
// been stated — which is F161's shape reached from the other side.
//
// The width row is the one nothing else would catch. `⎿` is not the character a
// reader reaches for; `└` is, and `└` doubles at `ambiguousWidth: "wide"`. A
// row asserting only *the mark is one cell* passes for `└` under the default
// convention, which is exactly when a substitution looks safe and is not.
import { describe, expect, it } from "vitest";

import { GLYPH_TOKENS, glyphCells, glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { cells } from "../../src/presentation/text.js";
import { noticeDoc } from "../../src/shell/documents.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

/** The block a single-block notice document carries, whatever its id. */
const only = (doc: ReturnType<typeof noticeDoc>) => doc.blocks[0];

/** The glyph slot of that block, or `undefined` when it has none. */
const slotOf = (doc: ReturnType<typeof noticeDoc>): string | undefined => {
  const b = only(doc);
  return b !== undefined && b.kind === "notice" ? b.glyph : undefined;
};

describe("the continuation mark", () => {
  it("T2.94 (C09 §4): the mark is one cell under BOTH conventions, and the corner a reader would reach for is not", () => {
    // **The measurement the character was chosen on**, asserted against its
    // alternatives rather than on its own. `⎿` is `East_Asian_Width=Neutral`;
    // `└` and `╰` are Ambiguous, as are `▲` and `⋯` already in these tables.
    //
    // This buys nothing today — `glyphs()` discards the whole Unicode set at
    // `wide`, and `glyphFor` follows `unicode` alone — so the row asserts a
    // property of the character and says so. It is here because the swap it
    // catches (someone preferring `└`, which looks more like a corner) is
    // invisible under the default convention and wrong under the other.
    const mark = glyphFor("continuation", FULL_CAPS);
    expect(mark, "the mark is U+23BF").toBe("⎿");
    expect(cells(mark, "narrow"), "one cell at narrow").toBe(1);
    expect(cells(mark, "wide"), "and one cell at wide, which `└` is not").toBe(1);

    for (const corner of ["└", "╰"]) {
      expect(
        cells(corner, "wide"),
        `${corner} is the substitution this row exists to refuse`,
      ).toBe(2);
    }
  });

  it("T2.95 (C04 §5, I5): the mark is in the vocabulary on the same terms as every other token", () => {
    // Not a special case in the table. T2.5b and T2.5c already sweep the whole
    // of it; this asserts membership, so that a token added to `Glyph` and
    // forgotten in `GLYPH_TABLE` fails here rather than at a call site.
    expect(GLYPH_TOKENS).toContain("continuation");
    expect(glyphCells("continuation")).toBe(1);
    expect(glyphFor("continuation", ASCII_CAPS), "`tree(1)`'s hook").toBe("`");
  });

  it("T2.96 (C09 §4): a muted notice takes the mark, and the condition is that a command line exists", () => {
    // **The eligibility rule, and both halves of it.** `commandRows` returns
    // `[]` for `command: ""`, so a mark there would subordinate the notice to
    // whatever entry happens to precede it — a different submission.
    const withCommand = noticeDoc("/ps", "queued behind /logs", "muted", { origin: "user" });
    expect(slotOf(withCommand), "there is a line above it").toBe("continuation");

    const without = noticeDoc("", "queued behind /logs", "muted", { origin: "user" });
    expect(slotOf(without), "nothing to hang from, so no mark").toBeUndefined();
  });

  it("T2.97 (C04 I6): an obliged glyph is never displaced by the mark — the cancelled notice is the case", () => {
    // **The consumer that shares every other property and cannot take it.**
    // `warn` and `error` are in `GLYPH_REQUIRED_TONES`, so C04 I6 has already
    // spent the slot; the notice is otherwise identical to the queued one,
    // which is what makes it the instructive negative rather than an obvious
    // one.
    const cancelled = noticeDoc("/ps", "cancelled before it ran", "warn", { origin: "user" });
    expect(slotOf(cancelled), "I6 owns this slot").toBe("warn");

    const info = noticeDoc("/guide", "the app's own verb", "info", { origin: "user" });
    expect(slotOf(info), "and `info` keeps its own").toBe("info");
  });

  it("T2.98 (C23 §5a, F15): the fault notice takes no mark, and it fails the rule twice over", () => {
    // **Built as `contain` builds it** — `command: ""`, tone `error`, status
    // `error` — because the point of the row is that BOTH reasons hold and
    // either alone would give the right answer with the wrong rule.
    const fault = noticeDoc("", "route: Error: boom", "error", { origin: "defect" }, "error");
    expect(slotOf(fault), "the tone owns the slot").toBe("error");

    // The second reason, isolated: the same document with a tone that does not
    // oblige a glyph still takes no mark, because the command is empty.
    const muted = noticeDoc("", "route: Error: boom", "muted", { origin: "defect" });
    expect(slotOf(muted), "and there is no line above it either way").toBeUndefined();
  });
});
