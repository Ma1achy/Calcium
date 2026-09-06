// C10 tier 2 — contract. Purity, the properties a shipped theme must have, and
// the source scans that keep a palette from leaking out of its two consumers.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS } from "../support/budget.js";

import {
  defaultTheme,
  decorationTextPairs,
  diffPairs,
  errorTagPairs,
  validateTokens,
  selectionPairs,
  floorFor,
  ratio,
  resolve,
  resolveBackground,
  resolveTone,
  textSurfaces,
  type ColourRef,
} from "../../src/presentation/theme/index.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { caps, DEPTHS, store, SURFACES, SYNTAX_SLOTS, TONES } from "../support/theme.js";

// This file walks `src/`; `budget.ts` carries the measurement and why the 5 s
// default is not a margin. Re-measure before raising it.
vi.setConfig({ testTimeout: SCAN_BUDGET_MS });

/**
 * **Derived from the theme set, never written here** (C10 I28, §5a.4).
 *
 * This was `["dark", "light"] as const` and it drove eleven rows — including
 * T2.3's 4-bit injectivity and T2.4's floors, the two the roadmap names as
 * *already-decided rules every shipped theme passes*. A literal makes that
 * sentence false the day a third theme ships: it is checked by nothing and the
 * suite stays green. A coverage set a test writes for itself covers exactly what
 * the test already knew about.
 */
const VARIANTS = Object.keys(defaultTheme);

/** The tokens beside the name, so no row indexes a record and finds `undefined`. */
const SHIPPED = Object.entries(defaultTheme);

/**
 * Every hex a theme's palettes carry, with **every** slot that carries it — so
 * a colour scraped out of a document can be named and given its floor.
 *
 * **Built from the tokens rather than from a list**, for T2.23's reason: a list
 * here covers what the test already knew about.
 *
 * **`string[]` and not `string`, and the map was the second kind** (F654, found
 * by T2.29b on its first run). I17 forbids two slots of *one* palette sharing a
 * value and says nothing across palettes, and the shipped set is full of them:
 * eight on light, ten on high-contrast — `tone.default` is `syntax.punctuation`
 * and `spectrum.outline`, `tone.muted` is `syntax.comment`. A one-slot map keeps
 * whichever came last in `Object.entries`, so T2.27 has been resolving axis
 * furniture to `syntax.comment` and taking **that** slot's floor. Nothing fails
 * today because both floors clear on the shipped values; the row was measuring a
 * slot it had not chosen, and a theme where the two hexes diverged would be
 * checked at the wrong number. A collision is a dropped input, and no assertion
 * about the ratio can see it.
 */
function slotsByHex(tokens: (typeof SHIPPED)[number][1]): Map<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const [family, palette] of Object.entries(tokens.palettes)) {
    for (const [slot, hex] of Object.entries(palette.slots)) {
      if (typeof hex !== "string") continue;
      const key = hex.toLowerCase();
      const names = out.get(key);
      if (names === undefined) out.set(key, [`${family}.${slot}`]);
      else names.push(`${family}.${slot}`);
    }
  }
  return out;
}

/** The one `<rect>` that covers the page, and the hex it is filled with. */
function pageFill(svg: string): string | undefined {
  return /<rect width="100%" height="100%" fill="(#[0-9a-f]{6})"\/>/u.exec(svg)?.[1];
}

/** Every `fill` an SVG `<text>` element carries, in document order. */
function textFills(svg: string): readonly string[] {
  return [...svg.matchAll(/<text[^>]*\sfill="(#[0-9a-f]{6})"/gu)].map((m) => m[1] ?? "");
}

/** One catalogue spec as a plot block. */
function plotOf(form: string, variant: string): Parameters<typeof plotToSvg>[0] | undefined {
  const spec = (CATALOGUE_FORMS as Record<string, Record<string, Record<string, unknown>>>)[form]?.[variant];
  if (spec === undefined) return undefined;
  const { cursor, ...rest } = spec;
  void cursor;
  return { kind: "plot", id: "t225", ...rest } as Parameters<typeof plotToSvg>[0];
}

function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("C10 contract", () => {
  /**
   * **T2.27 (C10 I34, §4f.3) — the page a renderer paints is a surface
   * `textSurfaces` holds.**
   *
   * §4's exclusion of `bgDeep` names a trigger — *if a surface ever paints text
   * on it* — and named no watcher, so the SVG plot arm painted every label on
   * the one surface no floor is measured against, for as long as it has
   * existed. This is the watcher, for the one ground that has one.
   *
   * **Asserted against `textSurfaces(tokens)` and never against a hex**, so what
   * fails is *this ground is not a text surface* whatever the theme makes it —
   * the class rather than the instance. Reverting the page to `surface.bgDeep`
   * fails this row on every shipped theme (T6.86).
   */
  it("T2.27 (I34, §4f): the SVG arm's page is a text surface, and every label on it clears its floor", () => {
    let checked = 0; // cells-ok — a frame count
    for (const [variant, tokens] of SHIPPED) {
      const theme = store(variant).current;
      const grounds = new Set(textSurfaces(tokens).map(([, hex]) => hex.toLowerCase()));
      const named = slotsByHex(tokens);
      for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
        for (const name of Object.keys(variants)) {
          const block = plotOf(form, name);
          if (block === undefined) continue;
          const svg = plotToSvg(block, theme);
          if (svg === null) continue; // a refusal has no page
          const page = pageFill(svg);
          expect(page, `${variant} ${form}/${name} paints a page`).toBeDefined();
          expect(grounds, `${variant} ${form}/${name}: the page is a surface text lands on`)
            .toContain((page ?? "").toLowerCase());
          checked += 1; // cells-ok — a frame count
          // **The page-coloured fill is delegated now, not exempted** (§4g.3).
          // A tile or node label inked in the page's ground over a series fill
          // measures 1 against the page by construction, so this row cannot
          // check it — but `decorationTextPairs` can, and the difference
          // between an exemption and a delegation is that the second names the
          // check which does hold the case. `ratio` is symmetric, so the pair
          // is the same one the callout makes in the other order.
          const covered = new Set(
            decorationTextPairs(tokens).map(([, , , hex]) => hex.toLowerCase()),
          );
          for (const fill of textFills(svg)) {
            if (fill.toLowerCase() === (page ?? "").toLowerCase()) {
              expect(covered, `${variant} ${form}/${name}: the page is a ground the §4g pairing covers`)
                .toContain((page ?? "").toLowerCase());
              continue;
            }
            const slots = named.get(fill.toLowerCase()) ?? [];
            expect(slots.length, `${variant} ${form}/${name}: ${fill} is a palette slot and not a literal`)
              .toBeGreaterThan(0);
            // **The strictest of the slots this hex could be** (F654). One hex
            // is several slots across palettes on two of the three shipped
            // themes, and picking one of them picks its floor — so the floor is
            // the highest any candidate demands rather than whichever the map
            // happened to keep.
            const floor = Math.max(...slots.map((s) => floorFor(s.split(".")[1] ?? "")));
            expect(ratio(fill, page ?? "#000000"), `${variant} ${form}/${name}: ${slots.join(" / ")} on the page`)
              .toBeGreaterThanOrEqual(floor);
          }
        }
      }
    }
    // Derived, so a form or variant leaving the catalogue moves it (F256).
    const forms = Object.values(CATALOGUE_FORMS).reduce((n, v) => n + Object.keys(v).length, 0);
    expect(checked, "every drawn frame on every shipped theme").toBeGreaterThan(forms * SHIPPED.length * 0.5);
  });

  /**
   * **T2.29 (C10 I35, §4g.3) — the pairing, by equality and not by result.**
   *
   * T2.14b's form and for its reason: every alternative arm *passes* on the
   * shipped tokens, so what separates them is which pairs are named. `spectrum`
   * is asserted absent because it is the wide arm's whole cost — 7 of the light
   * theme's 9 stops sit under 4.5 — and a palette measured out of a pairing and
   * quietly kept in it is the drift T2.14c exists to stop.
   */
  it("T2.29 (I35, §4g): the decoration pairing is the eight categorical slots on the two text surfaces", () => {
    for (const [variant, tokens] of SHIPPED) {
      const pairs = decorationTextPairs(tokens);
      const grounds = textSurfaces(tokens).map(([name]) => name);
      expect([...new Set(pairs.map(([, , surface]) => surface))], variant).toEqual(grounds);
      for (const ground of grounds) {
        expect(
          pairs.filter(([, , surface]) => surface === ground).map(([palette, slot]) => `${palette}.${slot}`),
          `${variant} on ${ground}`,
        ).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((c) => `categorical.${c}`));
      }
      // The wide arm, asserted absent. `spectrum` is declared art (I16, SS21)
      // and binding it here rejects the light theme outright.
      expect(pairs.map(([palette]) => palette), variant).not.toContain("spectrum");
    }
  });

  /**
   * **T2.29a (C10 I35, §4g.1) — the figures, recomputed.**
   *
   * T2.4's shape: the ratios come from the shipped tokens rather than from
   * A01 A.1, so the catalogue is an assertion rather than a record. The
   * tightest pair is named on its own, because a passing sweep does not say
   * which slot was in question — and this one has 5% of headroom, which is the
   * answer to *would anything notice if it stopped clearing*.
   */
  it("T2.29a (I35, §4g): every decoration text pair clears the meaning floor, tightest named", () => {
    let tightest = { pair: "", measured: Number.POSITIVE_INFINITY };
    let checked = 0; // cells-ok — a pair count
    for (const [variant, tokens] of SHIPPED) {
      for (const [palette, slot, surface, hex] of decorationTextPairs(tokens)) {
        const value = tokens.palettes[palette]?.slots[slot] ?? "";
        const measured = ratio(value, hex);
        expect(measured, `${variant} ${palette}.${slot} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        if (measured < tightest.measured) tightest = { pair: `${variant} ${palette}.${slot} on ${surface}`, measured };
        checked += 1; // cells-ok — a pair count
      }
    }
    expect(checked, "eight slots on two surfaces on every shipped theme").toBe(8 * 2 * SHIPPED.length);
    expect(tightest.pair).toBe("light categorical.c4 on bgElev");
    expect(tightest.measured).toBeCloseTo(4.74, 2);
  });

  /**
   * **T2.29b (C10 I35, §4g.2) — the generalising cell of the classification
   * table, mechanised.**
   *
   * §4g's walk asked *is there any other text in either arm whose ink and
   * ground are not a validated pair*, and the sweep that answered it was done
   * by hand. This is the part of it a suite can hold: every `<text>` fill the
   * arm emits is a slot one of the two pairings names. It fails on a text site
   * inked from a palette neither reaches — which is what the outline label, the
   * graph node label and the unboxed hierarchy label each were, and none of
   * them appears in either finding.
   */
  it("T2.29b (I35, §4g): every text fill in the SVG arm is a slot some pairing names", () => {
    let checked = 0; // cells-ok — a fill count
    for (const [variant, tokens] of SHIPPED) {
      const theme = store(variant).current;
      const named = slotsByHex(tokens);
      // **Paired *hexes*, not paired slot names** (F654). A fill is a colour and
      // the pairing is a colour's; asking whether a name is paired asks a
      // question the document cannot answer, because `tone.default` and
      // `spectrum.outline` are one hex on two of the three shipped themes and
      // only one of them is paired.
      const pairedHex = new Set([
        ...decorationTextPairs(tokens).map(([palette, slot]) =>
          (tokens.palettes[palette]?.slots[slot] ?? "").toLowerCase()),
        ...Object.entries(tokens.palettes)
          .filter(([, palette]) => palette.carries === "meaning")
          .flatMap(([, palette]) => Object.values(palette.slots).map((hex) => String(hex).toLowerCase())),
      ]);
      const grounds = new Set(textSurfaces(tokens).map(([, hex]) => hex.toLowerCase()));
      for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
        for (const name of Object.keys(variants)) {
          const block = plotOf(form, name);
          if (block === undefined) continue;
          const svg = plotToSvg(block, theme);
          if (svg === null) continue;
          for (const fill of textFills(svg)) {
            checked += 1; // cells-ok — a fill count
            // A ground used as ink: the pair is the ground's own, backwards.
            if (grounds.has(fill.toLowerCase())) continue;
            const slots = named.get(fill.toLowerCase()) ?? [fill];
            expect(pairedHex, `${variant} ${form}/${name}: ${slots.join(" / ")} is a slot some pairing names`)
              .toContain(fill.toLowerCase());
          }
        }
      }
    }
    expect(checked, "the arm draws text at all").toBeGreaterThan(100);
  });

  /**
   * **T2.29c (C10 I35, §4g.3) — the check fires, by fabricated violation.**
   *
   * T2.14f's row and its argument: T2.29 asserts the pairing's *shape* and
   * T2.29a its *results*, and both survive the check never being called — a
   * mechanism tested by calling it says nothing about the wiring. So this one
   * goes through `validateTokens`, which is what a theme actually meets, with a
   * control on the unmodified tokens so an empty corpus cannot pass for a clean
   * one.
   */
  it("T2.29c (I35, §4g): a categorical slot under the floor is refused by name", () => {
    for (const [variant, tokens] of SHIPPED) {
      expect(validateTokens(tokens).map((e) => e.path), `${variant}: the control is clean`)
        .not.toContain("palettes.categorical.c4");
      // A mid grey: distinct from every other slot (I17) and far from the
      // background on no theme in particular — it measures under 4.5 against
      // every shipped `bg`, which is the property this row needs.
      const broken = {
        ...tokens,
        palettes: {
          ...tokens.palettes,
          categorical: {
            ...tokens.palettes["categorical"]!,
            slots: { ...tokens.palettes["categorical"]!.slots, c4: "#767676" },
          },
        },
      };
      const errors = validateTokens(broken);
      const named = errors.filter((e) => e.path === "palettes.categorical.c4");
      expect(named.length, `${variant}: the slot is named`).toBeGreaterThan(0);
      expect(named[0]?.message, `${variant}: and the ratio is in the message`).toMatch(/: 1 against bg/u);
    }
  });

  /**
   * **T2.28 (C10 I34, §4f.2) — four sites, one constant.**
   *
   * The page, a sankey label's halo, a tile label's ink and the stroke parting
   * two adjacent tiles are all *the page showing through*, and a second constant
   * for any of them is a rim rather than a hole — a difference a byte-compare
   * golden records faithfully and cannot object to. Asserted as an equality
   * across the four rather than four comparisons against a literal.
   */
  it("T2.28 (I34, §4f): the page, the halo, the tile ink and the separator are one colour", () => {
    for (const [variant] of SHIPPED) {
      const theme = store(variant).current;
      const sankey = plotToSvg(plotOf("sankey", "crowded") ?? plotOf("sankey", "default")!, theme);
      const treemap = plotToSvg(plotOf("treemap", "default")!, theme);
      expect(sankey, `${variant}: the sankey draws`).not.toBeNull();
      expect(treemap, `${variant}: the treemap draws`).not.toBeNull();
      const page = pageFill(sankey ?? "");
      expect(pageFill(treemap ?? ""), `${variant}: both figures paint the same page`).toBe(page);

      const halos = [...(sankey ?? "").matchAll(/<text[^>]*\sstroke="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
      expect(halos.length, `${variant}: the sankey haloes its node labels`).toBeGreaterThan(0);
      for (const h of halos) expect(h, `${variant}: a halo is the page`).toBe(page);

      const inks = [...(treemap ?? "").matchAll(/<text[^>]*\sfill="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
      expect(inks.length, `${variant}: the treemap names its tiles`).toBeGreaterThan(0);
      for (const i of inks) expect(i, `${variant}: a tile label is inked in the page`).toBe(page);

      const edges = [...(treemap ?? "").matchAll(/<rect[^>]*\sstroke="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
      expect(edges.length, `${variant}: adjacent tiles are parted`).toBeGreaterThan(0);
      for (const e of edges) expect(e, `${variant}: a separator is the page`).toBe(page);
    }
  });

  it("T2.1 (I1): a thousand calls return identical styles and touch nothing", () => {
    const current = store().current;
    const first = resolveTone("ok", current, caps(8));

    for (let i = 0; i < 1000; i++) {
      expect(resolveTone("ok", current, caps(8))).toEqual(first);
    }
  });

  it("T2.2 (I11): a warm cache agrees with a cold one for every key", () => {
    // Asserted by comparing results, not by inspecting the cache. A test that
    // knows the cache exists tests the cache; this tests the property the cache
    // is not allowed to break.
    const cold = store().current;
    const warm = store().current;

    for (const depth of DEPTHS) {
      for (const tone of TONES) {
        const a = resolveTone(tone, cold, caps(depth));
        resolveTone(tone, warm, caps(depth));
        expect(resolveTone(tone, warm, caps(depth))).toEqual(a);
      }
    }
  });

  it("T2.23 (C10 I28, §5a.4): the coverage set is derived, asserted on the source", () => {
    // **A value comparison here is vacuous and the mutation pass proved it.**
    // The first version asserted `VARIANTS` equals `Object.keys(defaultTheme)`
    // — which a literal `["dark", "light"]` also satisfies, exactly while the
    // shipped set has two members. So the row passed against the defect it was
    // written for, and would have started failing only once a third theme
    // existed, which is the moment it was supposed to protect.
    //
    // **So the assertion is structural**: the declaration derives from the set.
    // *Assert the artefact, not a proxy* — a coverage set is a property of how
    // it was written, and no value it takes today can express that.
    const source = readFileSync(new URL("./theme.test.ts", import.meta.url), "utf8");
    expect(source, "the coverage set derives from the theme set").toContain(
      "const VARIANTS = Object.keys(defaultTheme);",
    );
    expect(source, "and the literal it replaced is gone").not.toMatch(
      /const VARIANTS = \[/u,
    );

    // The value half stays, because a derivation that returns nothing would
    // leave every loop below passing over an empty set.
    expect(VARIANTS).toEqual(Object.keys(defaultTheme));
    expect(SHIPPED.map(([name]) => name)).toEqual(VARIANTS);
    expect(VARIANTS.length, "or every loop below is vacuous").toBeGreaterThan(0);

    // **The limit, stated**: this reads one file. Ten other rows in this suite
    // loop `SHIPPED`, and a future file writing its own list is outside it.
    expect(source.match(/of SHIPPED\)/gu)?.length ?? 0).toBeGreaterThan(8);
  });

  it("T2.3 (I5): the 4-bit map is injective across the five tones that must stay apart", () => {
    // `ok` and `error` on one colour is a failed row that reads as a passing
    // one. `dim` and `muted` colliding costs nothing, and is not asserted.
    for (const [variant, tokens] of SHIPPED) {
      const indices = ["ok", "warn", "error", "info", "accent"].map(
        (t) => tokens.fourBit[`tone.${t}`],
      );
      expect(new Set(indices).size, `${variant} collapses two meaning tones at 4-bit`).toBe(5);
    }
  });

  it("T2.4 (I3): every shipped theme clears every floor on bg and bgElev", () => {
    // Recomputed from the shipped token, not read from A01 A.1's recorded
    // figure. That is what makes the catalogue an assertion this test upholds
    // rather than a record of what someone intended.
    for (const [variant, tokens] of SHIPPED) {
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (palette.carries !== "meaning") continue;

        for (const [slot, value] of Object.entries(palette.slots)) {
          for (const surface of [tokens.surfaces.bg, tokens.surfaces.bgElev]) {
            expect(
              ratio(value, surface),
              `${variant} ${name}.${slot} (${value}) against ${surface}`,
            ).toBeGreaterThanOrEqual(floorFor(slot));
          }
        }
      }
    }
  });

  it("T2.5 (I13): no ANSI index outside the curated map, and SS19 fires", () => {
    const rule = SCANS.find((s) => s.id === "SS19");
    expect(rule, "SS19 is gone from the scan table").toBeDefined();
    // **No exception.** `four-bit.ts` was allowed by name and never matched —
    // its indices are bare numbers, a form the pattern cannot see — so SS53
    // removed the entry; a file that spells an SGR in `theme/` fires whoever it is.
    expect(rule?.allow).toEqual([]);

    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS19")).toEqual([]);
    // And SS19 fires: a raw SGR in the one file that used to be exempt.
    const fabricated = checkSourceScans(
      ["src/presentation/theme/four-bit.ts"],
      () => 'const red = "\u001b[31m";\n',
    ).filter((v) => v.rule === "SS19");
    expect(fabricated.map((v) => v.file)).toEqual(["src/presentation/theme/four-bit.ts:1"]);
  });

  it("T2.6 (I12): theme/ reads no environment", () => {
    const violations = checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS10" || v.rule === "SS11");
    expect(violations).toEqual([]);
  });

  it("T2.7: every Tone in C04's union has a token in every shipped theme", () => {
    // Exhaustive over the type, so adding a tone without tokens fails the build
    // rather than rendering as nothing on the day someone uses it.
    for (const [variant, tokens] of SHIPPED) {
      for (const tone of TONES) {
        expect(tokens.palettes["tone"]?.slots[tone], `${variant} ${tone}`).toBeTypeOf("string");
      }
      expect(Object.keys(tokens.palettes["tone"]!.slots).sort()).toEqual([...TONES].sort());
    }
  });

  it("T2.8 (I16): syntax and spectrum stay inside their declared consumers", () => {
    for (const id of ["SS20", "SS21"]) {
      expect(SCANS.find((s) => s.id === id), `${id} is gone from the scan table`).toBeDefined();
    }
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS20" || v.rule === "SS21")).toEqual([]);
  });

  it("T2.9 (I14): no hex literal in a block-producing module", () => {
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS16" || v.rule === "SS17")).toEqual([]);
  });

  it("T2.13 (§2): syntax has exactly its nine slots in every shipped theme", () => {
    for (const [, tokens] of SHIPPED) {
      expect(Object.keys(tokens.palettes["syntax"]!.slots).sort()).toEqual(
        [...SYNTAX_SLOTS].sort(),
      );
    }
  });

  it("T2.14 (§2, I15): every syntax slot clears its floor on both surfaces", () => {
    // `comment` is checked at 3 : 1 and the rest at 4.5. Recessive is the
    // requirement, not a compromise on it.
    for (const [variant, tokens] of SHIPPED) {
      for (const slot of SYNTAX_SLOTS) {
        const value = tokens.palettes["syntax"]!.slots[slot]!;
        for (const surface of [tokens.surfaces.bg, tokens.surfaces.bgElev]) {
          expect(ratio(value, surface), `${variant} syntax.${slot}`).toBeGreaterThanOrEqual(floorFor(slot));
        }
      }
    }
    expect(floorFor("comment")).toBe(3);
  });

  it("T2.15 (§3): at depth 1 every syntax slot is typographic and emits no colour", () => {
    for (const [variant] of SHIPPED) {
      const themes = store(variant);
      for (const slot of SYNTAX_SLOTS) {
        const style = resolve(`syntax.${slot}`, themes.current, caps(1));
        expect(style.colour, `syntax.${slot}`).toBeUndefined();
      }
      // Including `key`, which is the slot that would be dropped by a mapping
      // written before the ninth existed.
      expect(resolve("syntax.key", themes.current, caps(1))).toEqual({});
    }
  });

  it("T2.16 (I17): no two slots of one palette share a 24-bit value", () => {
    // The test that caught `key`/`number`, and then caught light `number`/`type`
    // — which the contrast correction itself created, so nothing but
    // recomputation could have found it.
    for (const [variant, tokens] of SHIPPED) {
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        const values = Object.values(palette.slots);
        expect(new Set(values).size, `${variant} ${name} has two slots on one value`).toBe(values.length);
      }
    }
  });

  it("T2.18 (I24): every resolved colour names its depth, and the kinds are exactly three", () => {
    // The list is written out literally rather than derived from the type. A
    // list computed from `ColourValue` agrees with itself and passes on any
    // addition, which is a rule with nothing to be wrong about — C05 T1.7c's
    // shape, applied to a union that a renderer switches on.
    const KINDS = ["rgb", "ansi256", "ansi16"];
    const seen = new Set<string>();

    for (const [variant] of SHIPPED) {
      const current = store(variant).current;
      const refs: ColourRef[] = [
        ...TONES.map((t) => `tone.${t}` as const),
        ...SYNTAX_SLOTS.map((s) => `syntax.${s}` as const),
        ...SURFACES.map((s) => `surface.${s}` as const),
      ];

      for (const ref of refs) {
        for (const depth of DEPTHS) {
          const colour = resolve(ref, current, caps(depth)).colour;
          if (colour === undefined) continue;

          expect(typeof colour, `${ref} at depth ${depth} must not be a bare string`).toBe("object");
          expect(KINDS, `${ref} at depth ${depth}`).toContain(colour.kind);
          seen.add(colour.kind);
        }
      }
    }

    // And all three are reachable, so the check is not passing because two of
    // them never occur.
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it("T2.19 (I24): no string literal is assigned to a colour field anywhere in src/", () => {
    const rule = SCANS.find((s) => s.id === "SS36");
    expect(rule, "SS36 is gone from the scan table").toBeDefined();
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS36")).toEqual([]);
  });

  it("T2.17 (I17): at depth 8 the five meaning tones stay distinct", () => {
    // Two tones distinct in hex can quantise onto one index, and that failure is
    // invisible in the truecolour terminal where every value was authored and
    // every golden will be reviewed.
    for (const [variant] of SHIPPED) {
      const current = store(variant).current;
      const indices = ["ok", "warn", "error", "info", "accent"].map((t) => {
        const colour = resolveTone(t as never, current, caps(8)).colour;
        return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
      });
      expect(new Set(indices).size, `${variant} collapses two meaning tones at 8-bit`).toBe(5);
    }
  });

  it("every slot and surface has a 4-bit entry, so nothing silently loses colour at depth 4", () => {
    for (const [variant, tokens] of SHIPPED) {
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (name === "spectrum") continue; // decoration; the art is not themed at 4-bit
        for (const slot of Object.keys(palette.slots)) {
          expect(tokens.fourBit[`${name}.${slot}`], `${variant} ${name}.${slot}`).toBeTypeOf("number");
        }
      }
      for (const surface of SURFACES) {
        expect(tokens.fourBit[`surface.${surface}`], `${variant} surface.${surface}`).toBeTypeOf("number");
      }
    }
  });

  // --- §4a, the diff surfaces ----------------------------------------------

  it("T2.14a (I22): twenty-four ratios per theme — twelve slots × two diff surfaces", () => {
    // Recomputed from the shipped tokens, never read from A01 A.1. The catalogue
    // is an assertion this upholds rather than a record of what someone intended,
    // which is T2.4's reason applied to the surfaces C25 made text-bearing.
    const failures: string[] = [];
    let checked = 0;

    for (const [variant, tokens] of SHIPPED) {
      for (const [palette, slot, surface, hex] of diffPairs(tokens)) {
        checked += 1;
        const value = tokens.palettes[palette]?.slots[slot];
        const measured = ratio(value as string, hex);
        const floor = floorFor(slot);
        if (measured < floor) {
          failures.push(`${variant} ${palette}.${slot} on ${surface}: ${measured.toFixed(2)} < ${floor}`);
        }
      }
    }

    // **Twenty-four per theme, and the total derived from the set.** This read
    // `toBe(48)` — twelve × two × *two variants* — which is a count in prose
    // with no mechanism: it went stale the moment a third theme shipped, and it
    // is the one row that noticed, correctly and for the wrong reason. The
    // per-theme figure is the claim; the multiplier is whoever is in the set.
    expect(checked, "twelve slots × two surfaces × every shipped theme").toBe(24 * SHIPPED.length);
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T2.24 (roadmap 24): high-contrast keeps its own promise, which the framework cannot", () => {
    // **The promise is 7 : 1 and it is nowhere expressible.** `FLOORS` is a
    // module constant naming the *minimum* every theme must clear, so a theme
    // that promises more has no way to declare it and no way to be held to it —
    // which makes this row the only thing standing between "high-contrast" and a
    // name. Asserted here rather than in the tokens, because a value that meets
    // a target and a value that was nudged past one are the same value.
    const hc = defaultTheme["high-contrast"];
    expect(hc, "the set holds it").toBeDefined();
    if (hc === undefined) return;

    const PROMISE = 7;
    const failures: string[] = [];
    for (const [name, palette] of Object.entries(hc.palettes)) {
      if (palette.carries !== "meaning") continue;
      for (const [slot, value] of Object.entries(palette.slots)) {
        for (const [surface, ground] of textSurfaces(hc)) {
          const measured = ratio(value, ground);
          if (measured < PROMISE) {
            failures.push(`${name}.${slot} on ${surface}: ${measured.toFixed(2)} < ${PROMISE}`);
          }
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);

    // **`muted` is the slot this theme exists to answer** — 2.14–2.42 on the
    // light variant against every candidate wash, under its own 2.5 floor, and
    // recorded during the selection work as a reason not to pair it. Named
    // rather than left to the sweep above, because the sweep passing does not
    // say which slot was in question.
    const muted = hc.palettes["tone"]?.slots["muted"];
    expect(ratio(muted!, hc.surfaces.bg), "muted, the quietest slot here").toBeGreaterThanOrEqual(
      PROMISE,
    );

    // And it is still recessive: quieter than `dim`, which is quieter than
    // `default`. A promise that flattened the three would have bought the floor
    // by losing what the tones are for.
    const tone = (slot: string): number => ratio(hc.palettes["tone"]!.slots[slot]!, hc.surfaces.bg);
    expect(tone("muted")).toBeLessThan(tone("dim"));
    expect(tone("dim")).toBeLessThan(tone("default"));

    // **The rung where the claim stops.** At 4-bit the values are the
    // emulator's, so contrast is unprovable and only distinctness survives —
    // which is what the curated map promises instead (C10 I26).
    const five = ["ok", "warn", "error", "info", "accent"].map((t) => hc.fourBit[`tone.${t}`]);
    expect(new Set(five).size, "distinctness is what this depth can keep").toBe(5);
  });

  it("T2.14b (I22): the diff surfaces are paired with exactly those twelve slots", () => {
    // **Asserted on the pairing, not on its results**, because both ways of
    // getting it wrong pass a results-only check on a theme that happens to be
    // fine. Widening it to every `meaning` slot fails on seven tones that never
    // land on a diff background; narrowing it to `syntax` leaves the numbers and
    // the marker unchecked on the surface they are drawn on.
    const pairs = diffPairs(defaultTheme["dark"]!);
    const slots = [...new Set(pairs.map(([palette, slot]) => `${palette}.${slot}`))].sort();

    expect(slots).toEqual([
      "syntax.comment",
      "syntax.function",
      "syntax.key",
      "syntax.keyword",
      "syntax.number",
      "syntax.operator",
      "syntax.punctuation",
      "syntax.string",
      "syntax.type",
      "tone.error",
      "tone.muted",
      "tone.ok",
    ]);
    expect([...new Set(pairs.map(([, , surface]) => surface))].sort()).toEqual(["diffAdd", "diffRemove"]);
  });

  it("T2.14e (C10 I32, §4d): the tag's ground IS `tone.error`, in every theme", () => {
    // **Two hex literals that must agree is a pair waiting to drift**, and this
    // one drifted four times in one sitting — hue 0 against hue 9, then a
    // hue-matched ground that read brick, then a tone the loader refused, then a
    // ground and a tone one lightness step apart. Every round was two numbers
    // being tuned toward each other by eye.
    //
    // They are one colour and this is what says so. The rule, the message and
    // the tag's ground are the same value by assertion rather than by
    // agreement, so a change to either has to be a change to both.
    for (const [variant, tokens] of SHIPPED) {
      expect(tokens.surfaces.errorGround, `${variant}: ground is the tone`).toBe(
        tokens.palettes.tone?.slots["error"],
      );
    }
  });

  it("T2.14f (C10 I32, §4d): the tag's own check fires, and it reads both halves from `surfaces`", () => {
    // **The mutation pass is what asked for this row.** Removing the floor
    // comparison from `validateErrorTag` survived every other assertion here:
    // the pair was measured nowhere and every row about it agreed, which is a
    // check that cannot fire dressed as one that passes (A03 §2).
    //
    // A fabricated violation rather than an assertion about the shipped values,
    // because the shipped values pass — and a check is proved by breaking what it
    // covers, not by watching it agree.
    for (const [variant, tokens] of SHIPPED) {
      const ink = tokens.surfaces.errorInk;
      const ground = tokens.surfaces.errorGround;
      expect(validateTokens(tokens), `${variant}: the shipped pair is legal`).toEqual([]);

      // Ink one shade off the ground: a real colour, plainly illegible on it.
      const broken = {
        ...tokens,
        surfaces: { ...tokens.surfaces, errorInk: ground },
      };
      const errors = validateTokens(broken);
      expect(
        errors.some((e) => e.path === "surfaces.errorInk"),
        `${variant}: ink on its own ground is caught, and named by path`,
      ).toBe(true);
      expect(ratio(ground, ground)).toBeCloseTo(1, 5);

      // **And the pair is read from `surfaces`, both halves.** Written the first
      // way this reached for `tokens.palettes[…].slots[…]` and `continue`d on a
      // miss, so a foreground living in `surfaces` was skipped in silence. A
      // ground the function cannot resolve must produce **no pair**, never a
      // half-pair measured against a default.
      const noGround = {
        ...tokens,
        surfaces: { ...tokens.surfaces, errorGround: "not-a-colour" },
      };
      expect(errorTagPairs(noGround), `${variant}: an unresolvable half is no pair`).toEqual([]);
      expect(errorTagPairs(tokens).length, `${variant}: and the real one is one pair`).toBe(1);
      expect(ink).not.toBe(ground);
    }
  });

  it("T2.14c (C10 I22, §4a, §4b, §4d): ten surfaces, and the withdrawn strong pair is absent", () => {
    // The pair that was specified, measured and removed. Asserted absent rather
    // than merely unmentioned: a spec that measured something out and a token
    // file that quietly kept it is exactly the drift this suite exists to stop,
    // and an unused surface with no floor behind it is what someone reaches for.
    for (const [variant, tokens] of SHIPPED) {
      const names = Object.keys(tokens.surfaces).sort();
      expect(names, variant).toEqual([
        "bg",
        "bgDeep",
        "bgElev",
        "border",
        "borderStrong",
        "diffAdd",
        "diffRemove",
        // §4a — the error tag's pair. **Two entries, and they are one thing**:
        // a ground with no ink of its own borrows a foreground nothing measured
        // against it, so `errorTagPairs` checks them together and neither may
        // arrive alone. Sorted order puts the ground before the ink.
        "errorGround",
        "errorInk",
        // §4b — the selection wash. A text-bearing surface with a pairing of
        // its own (`selectionPairs`), not an eighth entry in the diff one.
        "selection",
      ]);
    }
  });

  it("T2.14d (§4b): the selection pairing is `tone.default` alone, and is not the diff one", () => {
    // **Written because widening `diffPairs` was the first attempt and four
    // rows refused it** — T2.14b above states outright that `tone.default`
    // must not be in the diff pairing, and it was right: a function whose name
    // says one thing and whose contents say two stops being readable. The
    // sibling is asserted here so the split cannot quietly become a merge.
    for (const [variant, tokens] of SHIPPED) {
      const pairs = selectionPairs(tokens);
      expect(pairs.map(([palette, slot]) => palette + "." + slot), variant).toEqual([
        "tone.default",
      ]);
      expect([...new Set(pairs.map(([, , surface]) => surface))]).toEqual(["selection"]);
      // `muted` is deliberately not paired, and C10 §4b carries the measured
      // reason: on light it sits under its own floor against every candidate
      // wash. Ghost text is muted and is drawn after the buffer's last
      // cluster, so it is adjacent to a selection and never inside one.
      expect(pairs.map(([, slot]) => slot), variant).not.toContain("muted");
    }
  });

  it("T2.20 (I21): over every ref × every depth, `background` is absent or a tagged value", () => {
    // T2.18's assertion for the second channel, and the kinds are written out
    // literally for the same reason: a list derived from the type agrees with
    // itself and passes on any addition.
    const KINDS = ["rgb", "ansi256", "ansi16"];
    const refs: ColourRef[] = [
      ...SURFACES.map((s) => `surface.${s}` as ColourRef),
      ...TONES.map((t) => `tone.${t}` as ColourRef),
      ...SYNTAX_SLOTS.map((s) => `syntax.${s}` as ColourRef),
    ];

    for (const [variant] of SHIPPED) {
      const current = store(variant).current;
      for (const ref of refs) {
        for (const depth of DEPTHS) {
          const background = resolveBackground(ref, current, caps(depth)).background;
          if (background === undefined) continue;
          expect(typeof background, `${ref} at ${depth}`).toBe("object");
          expect(KINDS, `${ref} at ${depth}`).toContain(background.kind);
        }
      }
    }
  });
});
