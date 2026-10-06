// C22 I153 — the frame folds prose punctuation at the ASCII rung (§6t, F1483).
import { describe, expect, it } from "vitest";

import { cells, foldProse, PROSE_FOLD } from "../../src/presentation/text.js";
import { PROSE_MARKS } from "../../tools/enforce/source-scans.mjs";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("C22 I153 — prose at the ASCII rung", () => {
  it("C22 T1.187 (I153, A03 SS47): foldProse is printable ASCII of the mark's own cells at both conventions, leaves sequences whole, and folds exactly PROSE_MARKS", () => {
    // **The domain, by equality**: SS47 lets these through because they are
    // prose, and this is where prose meets the rung.
    expect(new Set(Object.keys(PROSE_FOLD)), "the fold's domain is SS47's allowance").toEqual(PROSE_MARKS);
    expect(PROSE_MARKS.size, "the ten").toBe(10);
    for (const ambiguous of ["narrow", "wide"] as const) {
      for (const mark of PROSE_MARKS) {
        const folded = foldProse(`a${mark}b`, ambiguous);
        expect(folded, `${mark} at ${ambiguous} is printable ASCII`).toMatch(/^[\x20-\x7e]+$/u);
        expect(cells(folded, ambiguous), `${mark} at ${ambiguous} keeps its cells`).toBe(cells(`a${mark}b`, ambiguous));
        expect(folded.startsWith("a") && folded.endsWith("b"), `${mark}: its neighbours are untouched`).toBe(true);
      }
    }
    // **Sequences pass byte for byte**: an SGR run, and an OSC 8 hyperlink whose
    // URI carries a mark, with the text between and after them folded.
    const link = `${ESC}]8;;https://example.test/\u2014x${BEL}`;
    const row = `${ESC}[1;38;5;12mfault \u2014 here${ESC}[0m ${link}ok \u00b7 go${ESC}]8;;${BEL}`;
    const folded = foldProse(row);
    expect(folded).toBe(
      `${ESC}[1;38;5;12mfault - here${ESC}[0m ${link}ok - go${ESC}]8;;${BEL}`,
    );
    // **A text-presentation selector goes with its mark**, or the row would
    // carry the one non-ASCII character on the rung (SS57).
    expect(foldProse("\u26a0\ufe0e on"), "the warning sign and its selector").toMatch(/^[\x20-\x7e]+$/u);
    // The control: a row with no mark is returned as the same string.
    const plain = `${ESC}[1mplain${ESC}[0m`;
    expect(foldProse(plain)).toBe(plain);
    // And the wide convention pads: an em dash is two cells there.
    expect(foldProse("\u2014", "wide")).toBe("- ");
  });
});
