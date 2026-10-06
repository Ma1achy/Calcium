// C10 I64 — a declared floor is a ratio a pair can meet and not less than the
// common one: finite, at least DEFAULT_FLOOR, at most 21.
import { describe, expect, it } from "vitest";

import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { ratio, validateTokens } from "../../src/presentation/theme/contrast.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ThemeTokens } from "../../src/presentation/theme/types.js";

const HC = REGISTRY_THEMES["hcDark"]!;
const withFloor = (floor: number | undefined): ThemeTokens => {
  const { floor: _drop, ...rest } = HC;
  return (floor === undefined ? rest : { ...rest, floor }) as ThemeTokens;
};
const withFloorOf = (t: ThemeTokens, floor: number | undefined): ThemeTokens => {
  const { floor: _drop, ...rest } = t;
  return (floor === undefined ? rest : { ...rest, floor }) as ThemeTokens;
};
const floorErrors = (t: ThemeTokens) => validateTokens(t).filter((e) => e.path === "floor");

describe("C10 I64 — the declared floor's domain", () => {
  it("T1.54 (C10 I64): validateTokens refuses a floor that is non-finite, below 4.5 or above 21", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 3, 21.5]) {
      expect(floorErrors(withFloor(bad)), `floor ${String(bad)} is refused`).toHaveLength(1);
    }
    for (const good of [4.5, 7, 21, undefined]) {
      expect(floorErrors(withFloor(good)), `floor ${String(good)} is legal`).toEqual([]);
    }
  });

  it("T2.69 (C10 I64): loadTheme refuses a set whose hcDark floor is NaN", () => {
    // An accent the common floor accepts and the promise refuses — the review's
    // #949400, 5.79 : 1 on bgElev — so only the declared floor can refuse it,
    // and a vacuous floor lets it load. (A 3 : 1 ink would be refused by the
    // common floor too, and the row would pass with the check removed.)
    const accent = "#949400";
    expect(ratio(accent, HC.surfaces["bgElev"]!)).toBeCloseTo(5.79, 2);
    const weak = { ...HC, palettes: { ...HC.palettes, tone: { ...HC.palettes["tone"]!, slots: { ...HC.palettes["tone"]!.slots, accent } } } } as ThemeTokens;

    const control = loadTheme({ ...defaultTheme, hcDark: weak });
    expect(control.ok, "the promise refuses it").toBe(false);
    const common = loadTheme({ ...defaultTheme, hcDark: withFloorOf(weak, undefined) });
    expect(common.ok, "and the common floor alone accepts it").toBe(true);

    const vacuous = loadTheme({ ...defaultTheme, hcDark: { ...weak, floor: Number.NaN } });
    expect(vacuous.ok, "NaN no longer empties the check").toBe(false);
    if (vacuous.ok) return;
    expect(vacuous.error.map((e) => e.path), "refused at the floor itself").toContain("hcDark.floor");
  });
});
