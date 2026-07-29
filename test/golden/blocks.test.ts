// C09 T2.10 — golden frames.
//
// Every kind, four widths, both themes, both unicode modes. Snapshots rather
// than assertions because what they protect is *appearance*, which no
// invariant states and every reviewer notices: a border that changed corner, a
// column that shifted two cells, a spinner frame that is suddenly two wide.
//
// Deterministic by construction. No clock (the tick is a parameter), no
// environment (capabilities are injected), and the colour depth is C10's rather
// than a library's guess about the terminal — which is what stops a golden
// passing in monochrome while production renders truecolour (C09 §3).
import { describe, expect, it } from "vitest";
import { ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable } from "../support/render.js";

const WIDTHS = [40, 60, 80, 120] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
  { name: "light-unicode", theme: LIGHT_THEME, capabilities: FULL_CAPS },
  { name: "light-ascii", theme: LIGHT_THEME, capabilities: ASCII_CAPS },
] as const;

describe("C09 T2.10 — golden frames", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${width}`, () => {
        const kit = measurable({ theme: variant.theme, capabilities: variant.capabilities });
        const frame = Object.values(ONE_PER_KIND)
          .map((block) => {
            const lines = kit.renderToLines(block, width);
            return [
              `── ${block.kind} · measured ${kit.measure(block, width)} · rendered ${lines.length}`,
              ...lines,
            ].join("\n");
          })
          .join("\n");

        expect(frame).toMatchSnapshot();
      });
    }
  }
});
