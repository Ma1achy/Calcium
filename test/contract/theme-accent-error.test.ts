// C10 I65 (R-THM-006) — accent and error stay apart wherever colour carries.
//
// **Asserted through the resolver, not the token table.** Two different hex
// strings in `tokens.generated.ts` can still land on one index at 8-bit or 4-bit,
// and the rule is about what renders — so the row asks `resolveTone` at each
// depth, which is the path a painted cell takes.
import { describe, expect, it } from "vitest";

import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { resolveTone } from "../../src/presentation/theme/resolve.js";

const open = (name: string) => {
  const r = loadTheme(defaultTheme, name);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.current;
};

describe("C10 I65 — accent and error", () => {
  it("T2.70 (C10 I65): every theme resolves accent and error to different colours at 4, 8 and 24 bits, and to none at 1", () => {
    const names = Object.keys(defaultTheme);
    expect(names, "every shipped theme, not a sample").toHaveLength(10);
    for (const name of names) {
      const theme = open(name);
      for (const colourDepth of [4, 8, 24] as const) {
        const accent = resolveTone("accent", theme, { colourDepth }).colour;
        const error = resolveTone("error", theme, { colourDepth }).colour;
        expect(accent, `${name} accent at ${String(colourDepth)} bits carries a colour`).toBeDefined();
        expect(accent, `${name} at ${String(colourDepth)} bits: accent and error render distinctly`).not.toEqual(error);
      }
      // At 1-bit neither is a colour, so the error's carriers are its glyph and
      // its outcome word (C09 I45) — a tint here would be a carrier that dies.
      expect(resolveTone("accent", theme, { colourDepth: 1 }).colour, `${name} accent at 1 bit`).toBeUndefined();
      expect(resolveTone("error", theme, { colourDepth: 1 }).colour, `${name} error at 1 bit`).toBeUndefined();
    }

    // The values R-THM-006 names: mono's error keeps white as the loudest step.
    const mono = open("mono");
    expect(resolveTone("accent", mono, { colourDepth: 24 }).colour).toEqual({ kind: "rgb", hex: "#f0f0f0" });
    expect(resolveTone("error", mono, { colourDepth: 24 }).colour).toEqual({ kind: "rgb", hex: "#ffffff" });
  });
});
