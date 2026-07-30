// C10 tier 5 — e2e. Every one of these needs a rendered frame, so every one of
// them waits on the renderer that produces it.
import { describe, expect, it } from "vitest";
import { ALL_KINDS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable, visible } from "../support/render.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells } from "../../src/presentation/text.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const DEPTHS = [24, 8, 4, 1] as const;
const VARIANTS = [
  { name: "dark", theme: DARK_THEME },
  { name: "light", theme: LIGHT_THEME },
] as const;

const ALL_THREE = [
  tableDefinition as unknown as BlockDefinition<never>,
  plotDefinition as unknown as BlockDefinition<never>,
  patchDefinition as unknown as BlockDefinition<never>,
];

describe("C10 e2e", () => {
  // C09's fourteen have had golden frames since C09 — `test/golden/blocks.test.ts`,
  // four widths × both variants × both unicode modes. What was deferred here was the
  // *whole* union: `table`, `plot` and `patch` are registered by C11, C12 and C25,
  // so "every block kind" could not be honest until the last of them existed.
  //
  // **It exists now.** C11 and C12 have their own goldens and C25's are at
  // `test/golden/patch.test.ts`; this is the vocabulary in one frame, which is a
  // different claim from any of them — that the seventeen render *together*, in both
  // variants, at all four depths, without one of them throwing on a capability the
  // others tolerate.
  it("T5.1: every block kind renders in both variants at all four depths", () => {
    const failures: string[] = [];

    for (const variant of VARIANTS) {
      for (const depth of DEPTHS) {
        const kit = measurable({
          definitions: ALL_THREE,
          theme: variant.theme,
          capabilities: { ...FULL_CAPS, colourDepth: depth },
        });

        expect(kit.kinds, "the whole vocabulary must be present").toHaveLength(17);

        for (const kind of ALL_KINDS) {
          const block = ONE_PER_KIND[kind];
          const where = `${variant.name} depth ${String(depth)} ${kind}`;

          try {
            const rendered = kit.renderToLines(block, 100);
            const measured = kit.measure(block, 100);
            if (rendered.length !== measured) {
              failures.push(`${where}: measured ${String(measured)}, drew ${String(rendered.length)}`); // cells-ok
            }
            for (const row of rendered) {
              if (cells(visible(row)) > 100) failures.push(`${where}: a row over its width`);
            }
          } catch (error) {
            failures.push(`${where}: threw ${String(error)}`);
          }
        }
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T5.1a (D29): at depth 1 no kind emits a colour, and every one still renders", () => {
    // The other half of the union claim, and the one D29 rests on. A kind that
    // carried its meaning in colour would be indistinguishable here from one that
    // carried it in a glyph — until a reader on a monochrome terminal could not tell
    // a failure from a success.
    for (const mode of [FULL_CAPS, ASCII_CAPS]) {
      const kit = measurable({
        definitions: ALL_THREE,
        capabilities: { ...mode, colourDepth: 1 },
      });

      for (const kind of ALL_KINDS) {
        for (const row of kit.renderToLines(ONE_PER_KIND[kind], 100)) {
          expect(/\[[0-9;]*(?:38;|48;|3[0-7]m|4[0-7]m|9[0-7]m|10[0-7]m)/.test(row), `${kind} at one bit`).toBe(
            false,
          );
        }
      }
    }
  });

  it.todo("T5.2: a real session under TERM=xterm emits no truecolour escapes — waits on L4");
  it.todo("T5.3: a real session under TERM=dumb emits no colour at all, statuses still distinct — waits on L4");
  it.todo("T5.4: /theme toggled fifty times mid-session — no flicker, no half-themed frame — waits on L4");
});
