// §079 and §074 — the tones, the surfaces and the weight, as a frame.
//
// **The corpus's fourth axis, and the first that records colour.** Every other
// lines corpus strips SGR on a stated argument: a frame carrying shape and
// colour together moves when either does, so neither is protected. That is
// right about a frame of blocks and it is exactly what left §079 unframeable —
// *tones and surfaces* is a table **of the values**, and a frame that strips
// them draws twenty-one rows of the same swatch.
//
// So this records what `resolve` answers rather than a painted row: the slot,
// the value, and the weight. Reading it against §079's fixture is reading two
// tables side by side, which is the comparison the fixture asks for.
//
// **§074 falls out of the same frame and is not a second one.** Its claim is
// that the tone still reads at one bit — *ok · warn · error · accent ·
// identifier → bold; default · info · meta → plain; dim · muted → faint* — and
// the 1-bit rung is where every colour cell is `—` and the weight column is the
// whole of what is left. A frame at 24-bit alone could not show it; a frame at
// 1-bit alone would not show that the colour is what went.
import { describe, expect, it } from "vitest";

import { resolveBackground, resolveTone } from "../../src/presentation/theme/index.js";
import { SURFACE_SLOTS, THEME_NAMES, TONE_SLOTS, cellOf, themeFor } from "../support/theme-tokens.js";

/**
 * The four rungs, and each is a different claim.
 *
 * 24-bit is the value the registry holds; 8-bit and 4-bit are quantisations,
 * where two slots a theme separated can land on one entry; 1-bit is where
 * colour is gone entirely and §074's ladder is the carrier.
 */
const DEPTHS = [24, 8, 4, 1] as const;

describe("§079, §074 — tones, surfaces and weight, across ten themes", () => {
  for (const colourDepth of DEPTHS) {
    it(`at ${String(colourDepth)}-bit`, () => {
      const caps = { colourDepth, unicode: "full", ambiguousWidth: "narrow" } as const;
      const frame = THEME_NAMES.map((name) => {
        const theme = themeFor(name);
        const tones = TONE_SLOTS.map(
          (t) => `  ${t.padEnd(14, " ")}${cellOf(resolveTone(t as never, theme, caps))}`,
        );
        // **A surface is asked for as a ground**, which is the channel §079
        // draws it in and the one `resolveBackground` is the only route to. A
        // surface resolved as a foreground would be the same hex reported in a
        // channel nothing paints it in.
        const surfaces = SURFACE_SLOTS.map(
          (s) => `  ${s.padEnd(14, " ")}${cellOf(resolveBackground(`surface.${s}`, theme, caps))}`,
        );
        return [`── ${name} (${theme.variant})`, "  · tones", ...tones, "  · surfaces", ...surfaces].join("\n");
      }).join("\n");
      expect(frame).toMatchSnapshot();
    });
  }
});
