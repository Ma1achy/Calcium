// C10 I30 — the required-slot manifest, and the arm that keeps it honest.
//
// **A manifest is a closed list and a closed list goes stale in one direction
// nobody notices**: a tone or a syntax slot added without a line here, and the
// gate stops covering it while still reporting green. So each family is compared
// by **equality** against the vocabulary it is a manifest *of* — the arm
// `MARK_EXEMPTIONS` and `RAMP_VOCABULARIES` both have.
//
// The `syntax` half reaches into `blocks/kinds/code.ts` for the tokeniser's slot
// map, which is a sideways read inside L1 and legal for a test. Doing it in
// `contrast.ts` would make C10 depend on C09's grammar table for a list of nine
// strings, which is a worse trade than restating them beside an arm that fails
// when they drift.
import { describe, expect, it } from "vitest";

import { REQUIRED_SLOTS, validateTokens } from "../../src/presentation/theme/contrast.js";
import { TONES } from "../../src/data/viewmodel/index.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { SYNTAX_SLOTS } from "../../src/presentation/blocks/kinds/code.js";
import type { ThemeTokens } from "../../src/presentation/theme/types.js";

describe("C10 I30 — every family the framework asks for", () => {
  it("T2.30 (C10 I29): the manifest's tones are C04's tones, both directions", () => {
    expect([...(REQUIRED_SLOTS["tone"] ?? [])].sort()).toEqual([...TONES].sort());
  });

  it("T2.30 (C10 I30): the manifest's syntax slots are the tokeniser's, both directions", () => {
    // **The direction that matters is the one nobody would notice.** A grammar
    // mapped to a tenth slot renders uncoloured under every theme, and the gate
    // would say nothing because its list does not know about it.
    expect([...(REQUIRED_SLOTS["syntax"] ?? [])].sort()).toEqual([...SYNTAX_SLOTS].sort());
  });

  it("T2.30 (C10 I30): every shipped theme answers every required reference", () => {
    // The control this row needs is the row below: a green sweep here means
    // *the themes are complete* only if the gate can fail at all.
    for (const [name, tokens] of Object.entries(defaultTheme)) {
      const missing = validateTokens(tokens).filter((e) => e.path.startsWith("palettes."));
      expect(missing.map((e) => e.path), `${name} is missing a palette slot`).toEqual([]);
    }
  });

  it("T2.30 (C10 I30): a theme missing a family is refused, and one missing a slot is too", () => {
    // **F179's shape, fabricated.** The high-contrast theme was exactly this —
    // `categorical` absent — and it shipped, because a missing palette and a
    // decoration palette collapsed at one bit are the same `NO_STYLE` to every
    // caller. The rule has to be able to fire on both.
    const complete = defaultTheme["dark"];
    expect(complete).toBeDefined();

    const noFamily = {
      ...(complete as ThemeTokens),
      palettes: Object.fromEntries(
        Object.entries((complete as ThemeTokens).palettes).filter(([k]) => k !== "categorical"),
      ),
    } as ThemeTokens;
    const familyErrors = validateTokens(noFamily).filter((e) => e.path === "palettes.categorical");
    expect(familyErrors, "a missing family is named").toHaveLength(1);
    expect(familyErrors[0]?.message).toContain("no such palette");

    const categorical = (complete as ThemeTokens).palettes["categorical"];
    expect(categorical).toBeDefined();
    const noSlot = {
      ...(complete as ThemeTokens),
      palettes: {
        ...(complete as ThemeTokens).palettes,
        categorical: {
          ...(categorical as NonNullable<typeof categorical>),
          slots: Object.fromEntries(
            Object.entries((categorical as NonNullable<typeof categorical>).slots).filter(
              ([k]) => k !== "c8",
            ),
          ),
        },
      },
    } as ThemeTokens;
    const slotErrors = validateTokens(noSlot).filter((e) => e.path === "palettes.categorical.c8");
    expect(slotErrors, "a missing slot is named, not just the family").toHaveLength(1);
  });
});
