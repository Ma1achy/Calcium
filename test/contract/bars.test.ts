// Roadmap 51's bar half — the styles, and the tier asserted over what
// `barStyle` RETURNS.
//
// **Over the return value and never over the table**, which is the only form
// that catches a style offered on the wrong arm — and it is what caught the
// spinner sets. A row reading `BAR_STYLES.halfblock.narrowOnly` asserts that
// somebody wrote a flag; a row measuring `barStyle(wide).on` asserts that the
// flag is consulted, and those differ exactly when the lookup is wrong.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { barStyle, barStyleNames } from "../../src/presentation/blocks/glyphs.js";

/**
 * The registry's alphabets, read rather than copied.
 *
 * **A pair written here would be a second record of the design's**, and the two
 * would drift exactly as the tree's did — which is the whole reason the row
 * exists. `spinners.test.ts` reads `spinners` the same way for the same reason.
 */
const REGISTERED: readonly Readonly<{ id: string; filled: string; empty: string; status: string }>[] = (
  JSON.parse(readFileSync("docs/design/language/calcium-registry.json", "utf8")) as {
    bars: readonly Readonly<{ id: string; filled: string; empty: string; status: string }>[];
  }
).bars.filter((b) => b.status === "current");
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

  // **The four rows above are all about width and fallback, and that is the
  // gap.** Three characters appear in this file and all three are an `on`; no
  // row here or anywhere else in the tree has ever named an `off`. A width
  // assertion is satisfied by any one-cell glyph, so `ascii` drew `#`/`.`
  // against the registry's `#`/`-` under a file whose whole subject is this
  // table. §033's fixture is what found it.
  it("T2.158 (C09 I94, R-PRG-001): the registry's bars are the tree's, by equality both ways", () => {
    // **Equality on the names, not containment.** A subset check in either
    // direction is satisfied by the failure it exists to catch: a style the
    // registry does not register reads as covered, and a registered alphabet
    // the tree never built reads as present.
    expect([...barStyleNames()].sort(), "the names, both ways").toEqual(
      REGISTERED.map((b) => b.id).sort(),
    );

    // **Then the characters, which is what nothing asserted.** `barStyle` is
    // asked at the rung the registry's characters are drawn at — narrow and
    // full Unicode — because the fallbacks are this terminal's business and
    // not the design's.
    const tree = Object.fromEntries(
      barStyleNames().map((n) => [n, { filled: barStyle(NARROW, n).on, empty: barStyle(NARROW, n).off }]),
    );
    const design = Object.fromEntries(REGISTERED.map((b) => [b.id, { filled: b.filled, empty: b.empty }]));
    expect(tree, "every pair, character for character").toEqual(design);

    // **The pair that was wrong, named** — so a reader meeting this row knows
    // what it was written against and a revert of `BAR_ASCII` fails here by
    // name rather than inside a record comparison.
    expect(barStyle(ASCII_CAPS, "block"), "the ASCII rung's pair").toEqual({ on: "#", off: "-" });
    // And `braille`'s empty really is a space, drawn so in §033's own fixture:
    // the row compares characters and does not require two visible ones.
    expect(barStyle(NARROW, "braille").off, "braille's empty is the design's space").toBe(" ");

    // **What this row does NOT cover, and it is a parked question rather than
    // a divergence left standing.** `BAR_STYLES` is not the tree's only record
    // of an ASCII bar pair: `pairFor` in `plot/ramp.ts` holds a second —
    // `filled "#"`, `empty "."`, `absent "-"` — and it is what a `keyValue`
    // row's `bar` draws through `valueBar`. Moving its `empty` to the
    // registry's `-` would make empty and absent the same character at that
    // rung, and §078's `R-TBL-003` is explicit that a missing number is `—`
    // and never a blank: the two marks are distinct in the design and collide
    // only because this tree degrades the em dash to a hyphen where
    // `ambiguousWidth` forbids it. **The design names no ASCII absent mark**,
    // so choosing one is a visible choice it does not specify. Until it is
    // asked, the row covers `BAR_STYLES` — which is what `R-PRG-001` is about
    // — and the second pair is named here rather than left for the next
    // reader to rediscover.
  });
});
