// Golden frames for the corpus's third axis — one per **design fixture** (M16).
//
// **The axis the other two cannot be.** `blocks.test.ts` is indexed by kind and
// `states.test.ts` by state, both of them the repo's own vocabulary; a surface
// can have a kind, have a state, and still not look like the fixture that
// specifies it. This file is indexed by the design's sections, so a frame here
// is the picture a reader compares against `docs/design/language/fixtures/`.
//
// **Two rungs, not five.** `states.test.ts` earns its five variants — the wide
// arm is where F171 lived, the mono-unicode arm is where *the glyph is the
// channel at every depth* is either true or a sentence. What these frames are
// for is the **shape** against the design's, so the arms that matter are the one
// the fixtures are drawn at and the one that has to survive without Unicode.
import { describe, expect, it } from "vitest";

import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";
import { SURFACES } from "../support/design-surfaces.js";

const WIDTHS = [40, 80] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
] as const;

describe("golden frames — one per design fixture", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${String(width)}`, () => {
        const frame = SURFACES.map((s) => {
          const rows = s.rows(width, variant.capabilities, variant.theme);
          // Stripped of SGR, as the other lines corpora are: these frames are
          // about *what is drawn*, and C10's own goldens own colour. A snapshot
          // carrying both changes when either does, and then neither is
          // protected.
          return [`── §${String(s.section)} · ${s.name}`, ...rows]
            .map((l) => l.replace(/\[[0-9;]*m/gu, ""))
            .join("\n");
        }).join("\n");
        expect(frame).toMatchSnapshot();
      });
    }
  }
});
