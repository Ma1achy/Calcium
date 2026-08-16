// Golden frames for the corpus's second axis — one per *state*.
//
// `blocks.test.ts` frames `ONE_PER_KIND`, which is exhaustive over kinds and
// holds one state of each. **That is why three features shipped with no golden
// frame**: a new state of an existing kind is invisible to a corpus indexed by
// kind, however complete that index is. `test/support/states.ts` carries the
// second axis and the three instances that produced it.
//
// **`ambiguousWidth: "wide"` is a variant here and nowhere else**, because it is
// the arm F171 lived in: `cells()` counts a blank braille cell as one, so every
// width and length assertion passed while the lowest reading drew as padding.
// The only instrument that reaches a glyph nobody can see is a picture.
import { describe, expect, it } from "vitest";

import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME } from "../support/render.js";
import { STATES } from "../support/states.js";

const WIDTHS = [40, 80] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
  { name: "light-unicode", theme: LIGHT_THEME, capabilities: FULL_CAPS },
  { name: "dark-wide", theme: DARK_THEME, capabilities: { ...FULL_CAPS, ambiguousWidth: "wide" as const } },
] as const;

describe("golden frames — one per state", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${String(width)}`, () => {
        const frame = STATES.map((state) => {
          const rows = state.rows(width, variant.capabilities, variant.theme);
          // Stripped of SGR: these frames are about *what is drawn*, and C10's
          // own goldens own colour. A snapshot carrying both changes when either
          // does, and then neither is protected.
          return [`── ${state.of} · ${state.name}`, ...rows]
            .map((l) => l.replace(/\[[0-9;]*m/gu, ""))
            .join("\n");
        }).join("\n");

        expect(frame).toMatchSnapshot();
      });
    }
  }
});
