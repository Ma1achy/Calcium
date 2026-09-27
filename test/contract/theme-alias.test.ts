// C10 I63 — a retired theme name resolves to the generated theme that replaced
// it, wherever a name is read, and never shadows a name the set declares.
import { describe, expect, it } from "vitest";

import { defaultTheme, loadTheme, themeNames } from "../../src/presentation/theme/index.js";
import { ratio } from "../../src/presentation/theme/contrast.js";
import { resolveThemeName } from "../../src/presentation/theme/store.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ThemeSet } from "../../src/presentation/theme/types.js";

const HC = REGISTRY_THEMES["hcDark"]!;
const open = (set: ThemeSet, opening?: string) => {
  const r = loadTheme(set, opening);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("C10 I63 — the high-contrast alias", () => {
  it("T1.53 (C10 I63): loadTheme(defaultTheme, \"high-contrast\") opens hcDark by identity, and setTheme resolves the alias", () => {
    const store = open(defaultTheme, "high-contrast");
    expect(store.current.tokens, "the generated object, not a copy").toBe(HC);
    expect(store.current.tokens.floor, "and so its promise").toBe(7);
    expect(store.resolveName("high-contrast")).toBe("hcDark");
    expect(store.names, "names lists declared themes only").not.toContain("high-contrast");

    // From another theme, the alias switches; from its target, it is no switch —
    // the active name is stored resolved, so the two spellings are one theme.
    const from = open(defaultTheme);
    expect(from.current.tokens).toBe(REGISTRY_THEMES["dark"]);
    from.setTheme("high-contrast");
    expect(from.current.tokens).toBe(HC);
    const before = from.current;
    from.setTheme("hcDark");
    expect(from.current, "the target after its alias is no switch").toBe(before);
    from.setTheme("high-contrast");
    expect(from.current, "nor is the alias after its target").toBe(before);
  });

  it("T2.67 (C10 I63, R-THM-002): a 5.79 : 1 accent override on bgElev through the alias is refused", () => {
    // The review's measured case, against the unfloored hand-written set this
    // name used to reach: an accent at 5.79 : 1 on `bgElev` loaded with no error.
    const accent = "#949400";
    expect(ratio(accent, HC.surfaces["bgElev"]!), "the fixture is the measured case").toBeCloseTo(5.79, 2);

    const hc = open(defaultTheme, "high-contrast");
    const refused = hc.applyOverrides({ palettes: { tone: { accent } } });
    expect(
      refused.some((e) => /5\.79 : 1 against bgElev .* below the 7 : 1 this theme declares/u.test(e.message)),
      "refused on bgElev, against the promise",
    ).toBe(true);
    expect(hc.current.tokens, "and nothing changed").toBe(HC);

    // The control: an accent clearing 7 : 1 on every surface hcDark paints is
    // accepted through the same alias — so the refusal is the promise's. (Not
    // `dark` with the same value: an ink at 5.79 on #121212 is 4.20 on dark's
    // focusGround whatever its hue, so dark refuses it too — C10 T2.67.)
    const clears = open(defaultTheme, "high-contrast");
    expect(clears.applyOverrides({ palettes: { tone: { accent: "#c098ff" } } })).toEqual([]);
  });

  it("T2.68 (C10 I63): the alias never shadows a declared key, and resolves to nothing without its target", () => {
    // A set holding its own `high-contrast` keeps it.
    const own = { ...defaultTheme, "high-contrast": { ...REGISTRY_THEMES["dark"]!, name: "mine" } };
    expect(resolveThemeName(own, "high-contrast")).toBe("high-contrast");
    expect(open(own, "high-contrast").current.tokens.name).toBe("mine");
    expect(themeNames(own).filter((n) => n === "high-contrast"), "listed once, as the set's own").toHaveLength(1);

    // A set without `hcDark` refuses the alias as it refuses any unknown name.
    const without: ThemeSet = { dark: REGISTRY_THEMES["dark"]!, light: REGISTRY_THEMES["light"]! };
    expect(resolveThemeName(without, "high-contrast")).toBeUndefined();
    const r = loadTheme(without, "high-contrast");
    expect(r.ok).toBe(false);
    expect(() => open(without).setTheme("high-contrast")).toThrow(/no theme named "high-contrast"/u);
    expect(themeNames(without), "no alias whose target is absent").toEqual(["dark", "light"]);

    // The shipped set: every declared name, then the alias.
    expect(themeNames(defaultTheme)).toEqual([...Object.keys(defaultTheme), "high-contrast"]);
    // `hasOwn`, not `in`: an inherited property is not a theme.
    expect(resolveThemeName(defaultTheme, "toString")).toBeUndefined();
  });
});
