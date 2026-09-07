// The contained failure, in a frame — the path three commits have now been about
// and which **no golden frame held** (C09 I34, I11).
//
// Golden passed on every one of those commits and could not have done otherwise:
// nothing in `test/golden/` renders a definition that throws, so the error box's
// appearance was never recorded and the suite's silence was the absence of a
// subject rather than the absence of a change. *A snapshot records, it does not
// check* — and one that has no subject does not even record.
//
// **The height is what these protect.** A box that fits its message is an
// appearance claim: the tag arrives, the border closes, the wrap lands where the
// gutter says, and the cut carries its mark. None of that is stated by an
// invariant and all of it is noticed by a reader.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME } from "../support/render.js";

const WIDTHS = [30, 40, 80] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
  { name: "light-unicode", theme: LIGHT_THEME, capabilities: FULL_CAPS },
] as const;

/** Three lengths, because the height is the subject and it is a function of them. */
const MESSAGES = {
  short: "ENOENT",
  wrapping: "Cannot read properties of undefined (reading 'series')",
  capped: [
    "TypeError: series.map is not a function",
    "    at plotDefinition.render (plot/definition.ts:1204:18)",
    "    at BlockRegistry.render (blocks/registry.ts:495:47)",
    "    at renderSequence (render-lines.ts:88:20)",
    "    at visibleRows (shell/session.ts:912:9)",
  ].join("\n"),
} as const;

/**
 * Frame 1 and frame 2 of the two-frame path, both recorded.
 *
 * **Frame 1 is not incidental.** F230's ruling is that the frame which discovers
 * the fault completes at the height already committed and the *next* one honours
 * the request — so the short box is a specified state, not a transient nobody
 * meant, and a snapshot that held only the tall one would let it change unseen.
 */
function frames(message: string, width: number, variant: (typeof VARIANTS)[number]): string {
  const faults: { rows: number }[] = [];
  const registry = createBlockRegistry({
    defaults: true,
    onError: (f) => void faults.push({ rows: f.rows }),
  });
  registry.register({
    kind: "plot",
    measure: () => 1,
    render: () => {
      throw new Error(message);
    },
  } as unknown as BlockDefinition);
  registry.seal();

  const opts = { theme: variant.theme, capabilities: variant.capabilities, tick: 0 };
  const first = renderToLines(registry, block({ kind: "plot", id: "p" } as Block), width, opts);
  const asked = faults[0]?.rows ?? 0;
  const second = renderToLines(
    registry,
    block({ kind: "plot", id: "p", minHeight: asked } as Block),
    width,
    opts,
  );
  return [`frame 1 — committed`, ...first, ``, `frame 2 — asked ${String(asked)}`, ...second].join("\n");
}

describe("C09 I34 — the contained failure, in a frame", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      for (const [name, message] of Object.entries(MESSAGES)) {
        it(`${variant.name} ${name} at ${width}`, () => {
          expect(frames(message, width, variant)).toMatchSnapshot();
        });
      }
    }
  }
});
