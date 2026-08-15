// Roadmap 51's bar half — the styles, and the tier asserted over what
// `barStyle` RETURNS.
//
// **Over the return value and never over the table**, which is the only form
// that catches a style offered on the wrong arm — and it is what caught the
// spinner sets. A row reading `BAR_STYLES.halfblock.narrowOnly` asserts that
// somebody wrote a flag; a row measuring `barStyle(wide).on` asserts that the
// flag is consulted, and those differ exactly when the lookup is wrong.
import { describe, expect, it } from "vitest";

import { barStyle, barStyleNames } from "../../src/presentation/blocks/glyphs.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const NARROW = { ...FULL_CAPS, ambiguousWidth: "narrow" as const };

describe("roadmap 51 — bar styles, and ambiguous width is a tier", () => {
  it("T2.90: every style draws one cell per glyph at the terminal it is offered on", () => {
    // **The property the whole tier exists for, over the returned pair.** A bar
    // is a repeat of one glyph, so a glyph of two cells is a bar of twice its
    // computed width — and `progress` subtracts the label and the percentage
    // from the row before repeating, so the overflow lands as a wrapped line
    // rather than as a visibly wide bar.
    for (const name of barStyleNames()) {
      for (const caps of [NARROW, WIDE, ASCII_CAPS]) {
        const { on, off } = barStyle(caps, name);
        const w = caps.ambiguousWidth ?? "narrow";
        expect(cells(on, w), `${name} on at ${String(caps.unicode)}/${w}`).toBe(1);
        expect(cells(off, w), `${name} off at ${String(caps.unicode)}/${w}`).toBe(1);
      }
    }
  });

  it("T2.91 (C02 I9): a wide terminal gets ASCII for six of the seven unicode styles", () => {
    // **Measured, and it corrects `CALCIUM_BARS.md`.** Its determinate table
    // reads as though `▐` were the only narrow glyph and the rest wide; they are
    // all `Ambiguous`, so all six fall. `braille` is the only unicode style that
    // survives, which is the fact the document does not state.
    const fell = barStyleNames().filter(
      (n) => barStyle(WIDE, n).on !== barStyle(NARROW, n).on,
    );

    expect(fell.sort(), "seven, and braille is not among them").toEqual(
      ["beads", "block", "halfblock", "posts", "rectangle", "slant", "squares"],
    );
    expect(barStyle(WIDE, "braille").on, "braille is width-stable").toBe("⣿");
  });

  it("T2.92: an unknown or absent name is the default, never a throw", () => {
    // A bar is decoration over a number that is already correct, so a session
    // that will not start because a style was misspelled is worse than one drawn
    // with the wrong glyph — `spinnerFrames`'s argument, and the same answer.
    expect(barStyle(NARROW, "no-such-style")).toEqual(barStyle(NARROW));
    // **The default is `block`, which is the pair that already shipped.** The
    // golden frames said so: making `halfblock` the default restyled every bar
    // in the tree, a visible change to shipped output arriving as a side effect
    // of adding a field.
    expect(barStyle(NARROW).on, "the default is what was already drawn").toBe("█");
  });

  it("T2.93: ASCII wins over the width tier, because it is the stronger refusal", () => {
    // The order of the two tests, asserted rather than described: a terminal
    // that cannot draw the glyph at all is not a terminal that draws it twice as
    // wide, so `unicode` is read first and `braille` falls here where it does
    // not fall at `wide`.
    expect(barStyle(ASCII_CAPS, "braille").on, "ASCII takes even the stable one").toBe("#");
    expect(barStyle(WIDE, "braille").on, "and width alone does not").toBe("⣿");
  });
});
