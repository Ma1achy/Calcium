// C10 tier 2 — contract. Purity, the properties a shipped theme must have, and
// the source scans that keep a palette from leaking out of its two consumers.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS } from "../support/budget.js";

import {
  defaultTheme,
  loadTheme,
  decorationTextPairs,
  diffPairs,
  DEFAULT_FLOOR,
  errorTagPairs,
  pickPairs,
  validateTokens,
  selectionPairs,
  floorFor,
  inkOn,
  ratio,
  resolve,
  resolveBackground,
  resolveTone,
  textSurfaces,
  collisions,
  OKABE_ITO_CANONICAL,
  type ColourRef,
  type ThemeTokens,
} from "../../src/presentation/theme/index.js";
import { BAND_VS_BAND, BAND_VS_PAGE, FOCUS_VS_PAGE, validateBands } from "../../src/presentation/theme/contrast.js";
import { OKABE_ITO } from "../../src/data/colormaps/qualitative/okabe-ito.js";
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
  /**
   * **T2.42 (C10 I45, R-THM-003) — each of the four, broken on its own.**
   *
   * A gate that passes on the shipped set has been read, not verified: every one
   * of these four constraints holds today, so a sweep over the shipped themes
   * agrees with a gate that checks none of them. Each row moves exactly one value
   * and asserts that the failure names the *path* that has to move — which is what
   * makes the message the reason rather than the number.
   */
  /**
   * **T2.44 (C10 I46, R-THM-004) — the scope, asserted as a membership rather than
   * as a sweep.**
   *
   * Every ratio row in this file passes over a narrower `textSurfaces`; that is
   * how `focusGround` went unmeasured for as long as it did. So the surfaces are
   * named, and the one palette deliberately outside the scope is named with them —
   * an exclusion stated in a comment is an exclusion nothing checks.
   */
  it("T2.44 (I46, R-THM-004): the floor's scope is three named surfaces, and spectrum is outside it", () => {
    for (const [variant, tokens] of SHIPPED) {
      const names = textSurfaces(tokens).map(([n]) => n);
      expect(names, `${variant}: every ground this theme paints text on`).toEqual(["bg", "bgElev", "focusGround"]);
      // `bgDeep` is excluded because no text lands on it, and that exclusion has
      // fired once already with the answer *the surface was wrong* (I34, §4f).
      expect(names, `${variant}: bgDeep carries no text`).not.toContain("bgDeep");
    }
    // **`spectrum` is outside the scope, and the design is why** (R-FOC-004): a
    // plot, picture or image takes focus on its border or axes rather than
    // painting its data, so a series colour never meets the focus ground. Measured
    // when the scope widened: 22 spectrum slots across four themes sit below 4.5
    // on `focusGround`, and every one of them is a pairing nothing draws.
    const pairs = decorationTextPairs(defaultTheme["light"]!);
    expect([...new Set(pairs.map(([palette]) => palette))], "one decoration palette meets text").toEqual(["categorical"]);
    expect(pairs.some(([, , surface]) => surface === "focusGround"), "and it meets the focus ground").toBe(true);
  });

  it("T2.56 (C10 I55, §070, R-THM-001): a hue resolves through `resolve`, and the palette is the `hues` record", () => {
    const THEMES = defaultTheme as unknown as Readonly<Record<string, ThemeTokens>>;
    const HUES = ["blue", "orange", "cyan", "pink", "lime", "violet", "yellow", "green", "red", "purple"];

    let resolved = 0;
    for (const [themeId, tokens] of Object.entries(THEMES)) {
      const theme = { name: themeId, variant: tokens.variant, tokens } as unknown as Parameters<typeof resolve>[1];
      const palette = tokens.palettes["hue"];
      expect(palette, `${themeId}: the ink tier is a palette`).toBeDefined();

      // §070's own first line settles both: *the tones mean something; this is
      // you choosing what your terminal looks like*, and *chrome only — a
      // painted label is furniture*.
      expect(palette!.carries, `${themeId}: a hue is not meaning`).toBe("decoration");
      expect(palette!.monochrome, `${themeId}: and so it may degrade to nothing`).toBe("foreground");

      // **Equal in both directions.** The palette and `hues` are one fact written
      // twice, and only the generator knows they share a source — which is I53's
      // lesson applied to the projection rather than to the collector.
      expect(Object.keys(palette!.slots), `${themeId}: §093's order, in the palette too`)
        .toEqual(Object.keys(tokens.hues!));

      for (const name of HUES) {
        expect(palette!.slots[name], `${themeId} ${name}: the palette carries the ink tier`)
          .toBe(tokens.hues![name]!.ink);

        // Through the PUBLIC resolver, not a field read: the defect I55 exists
        // about was values present and `resolve` answering `{}`.
        const style = resolve(`hue.${name}`, theme, { colourDepth: 24 });
        expect(style.colour, `${themeId} ${name}: resolves at 24-bit`)
          .toEqual({ kind: "rgb", hex: tokens.hues![name]!.ink });
        resolved += 1;

        // Decoration collapses to the default foreground at 1-bit and there is
        // no 4-bit entry for a hue — both asserted rather than assumed, because
        // "it degrades" and "it was never wired" read the same from outside.
        expect(resolve(`hue.${name}`, theme, { colourDepth: 1 }), `${themeId} ${name}: 1-bit`).toEqual({});
        expect(resolve(`hue.${name}`, theme, { colourDepth: 4 }), `${themeId} ${name}: 4-bit`).toEqual({});
      }

      // **At 8-bit all ten survive as ten, and the reason is the mechanism.**
      // `quantiseSet` quantises a palette as a SET (§3), so rank order and
      // distinctness are properties it can hold; a per-slot neighbour can see
      // neither. This is what makes 4-bit the only rung where the identities
      // collapse — sixteen colours leave no room for a set to spread into —
      // and it is why PARKED 21 is about one rung rather than about low depth.
      const eightBit = HUES.map((n) => {
        const c = resolve(`hue.${n}`, theme, { colourDepth: 8 }).colour;
        return c !== undefined && c.kind === "ansi256" ? c.index : -1;
      });
      expect(new Set(eightBit).size, `${themeId}: ten hues, ten 8-bit indices`).toBe(10);

      // The control: a name the palette does not carry resolves to nothing
      // rather than to a neighbour.
      expect(resolve("hue.chartreuse", theme, { colourDepth: 24 }), `${themeId}: an unknown hue`).toEqual({});
    }
    expect(resolved, "ten hues through the resolver in ten themes").toBe(100);
  });

  it("T2.55 (C10 I45, R-THM-003): a third band is measured against ITS OWN ground, not selection's", () => {
    const hc = defaultTheme["hcDark"]!;
    expect(validateBands(hc), "the shipped band clears every constraint").toEqual([]);

    // A third band, whose ground is its own. `groundOf` read *`focusGround` if
    // the name is `focusGround`, otherwise `selection`* — correct for the two
    // entries that exist and wrong for a third, silently.
    const band = (ground: string, ink: string) => ({
      ...hc,
      surfaces: { ...hc.surfaces, probe: ground },
      bandInk: { ...hc.bandInk, probe: ink },
    });

    // **The direction that matters: a defect the old lookup let through.** Black
    // ink on a near-black band is 1.19 : 1 and unreadable; measured against
    // `selection` instead it clears the floor, so the gate said nothing.
    const unreadable = band("#111111", "#000000");
    expect(ratio("#000000", "#111111"), "black on near-black").toBeLessThan(DEFAULT_FLOOR);
    expect(ratio("#000000", hc.surfaces["selection"]!), "and the ground it was being measured against is fine")
      .toBeGreaterThanOrEqual(hc.floor ?? DEFAULT_FLOOR);
    expect(validateBands(unreadable).map((e) => e.path), "the band is reported against its own ground")
      .toContain("bandInk.probe");

    // **And the other direction, which the old lookup reported wrongly.** A band
    // whose ink is right on its own ground and wrong on selection's must be
    // silent — a gate that fires here is naming a ground the band never lands on.
    const fine = band("#000000", "#ffffff");
    expect(validateBands(fine).map((e) => e.path), "a correct third band says nothing")
      .not.toContain("bandInk.probe");

    // The two named bands are unchanged by the generalisation, because their keys
    // were surface names already — which is what the conditional was approximating.
    expect(validateBands(fine), "and nothing else moved").toEqual([]);
  });

  it("T2.42 (I45, R-THM-003): the four band contrasts each fire on their own", () => {
    const hc = defaultTheme["hcDark"]!;
    expect(validateBands(hc), "the shipped band clears every constraint").toEqual([]);
    expect(hc.bandInk, "and it is a banded theme, so the gate is not vacuous").toBeDefined();

    const withSurface = (name: "focusGround" | "selection", hex: string) => ({
      ...hc,
      surfaces: { ...hc.surfaces, [name]: hex },
    });

    // 1 — the ink on its own band. `#767676` on the focus band is far below 7.
    const dullInk = { ...hc, bandInk: { ...hc.bandInk, focusGround: "#767676" } };
    expect(validateBands(dullInk).map((e) => e.path)).toEqual(["bandInk.focusGround"]);

    // 2 — the selection band against the page. Moved to a near-black, so it keeps
    //     its ink's ratio and loses the page's: the one constraint fails alone.
    const faintSelection = withSurface("selection", "#0a0a0a");
    const sel = validateBands(faintSelection).filter((e) => e.path === "surfaces.selection");
    expect(sel, "the selection band must read against the page").toHaveLength(1);
    expect(sel[0]!.message).toContain("only carrier");

    // 3 and 4 — the focus band's two constraints, and **they fail in opposite
    //     directions**, which is why they are two constraints and not one. The
    //     first draft of this row expected a single move to break both; it cannot.
    //     Sliding the focus band onto the page moves it *away* from the selection
    //     band, and sliding it onto selection moves it away from the page. The
    //     band is pinned between them, and each end has its own reason.
    const ontoPage = withSurface("focusGround", "#050505");
    const pageSaid = validateBands(ontoPage).filter((e) => e.path === "surfaces.focusGround");
    expect(pageSaid, "against the page, alone").toHaveLength(1);
    expect(pageSaid[0]!.message).toContain("read as an extent");

    const ontoSelection = withSurface("focusGround", "#e0c030");
    const nearSaid = validateBands(ontoSelection).filter((e) => e.path === "surfaces.focusGround");
    expect(nearSaid, "against the other band, alone").toHaveLength(1);
    expect(nearSaid[0]!.message).toContain("adjacent rows");

    // The figures are named rather than left to the constants, so a constant
    // edited to make a failure go away fails here instead.
    expect([BAND_VS_PAGE, FOCUS_VS_PAGE, BAND_VS_BAND]).toEqual([3, 2, 3]);
  });

  /**
   * **T2.43 (C10 I45) — a band's ink is total, which is the whole of why it exists.**
   */
  it("T2.43 (I45, R-THM-003): every meaning ink on a band resolves to the band's ink", () => {
    for (const id of ["hcDark", "hcLight"]) {
      const t = defaultTheme[id]!;
      for (const band of ["focusGround", "selection"] as const) {
        const ink = t.bandInk?.[band];
        expect(ink, `${id}.${band} declares a band ink`).toBeDefined();
        let seen = 0; // cells-ok — a slot count
        for (const [pn, p] of Object.entries(t.palettes)) {
          if (p.carries !== "meaning") continue;
          for (const slot of Object.keys(p.slots)) {
            // **Including a slot the band never enumerated**, which is the property
            // an enumeration cannot have: `hcDark`'s selection shipped a group of
            // nine where the theme has nineteen, and the ten omitted fell through
            // to flat inks below the promise with nothing to report it.
            expect(inkOn(t, `${pn}.${slot}`, band), `${id} ${pn}.${slot} on ${band}`).toBe(ink);
            seen += 1; // cells-ok — a slot count
          }
        }
        expect(seen, `${id}.${band} covers every meaning slot`).toBe(19);
      }
    }
  });

  it("T2.29a (I35, §4g): every decoration text pair clears the meaning floor, tightest named", () => {
    let tightest = { pair: "", measured: Number.POSITIVE_INFINITY };
    let checked = 0; // cells-ok — a pair count
    for (const [variant, tokens] of SHIPPED) {
      for (const [palette, slot, surface, hex] of decorationTextPairs(tokens)) {
        // `inkOn`, not the flat slot: a theme may compose a different ink for this
        // ground (R-THM-001), and a floor is a claim about the pair that lands.
        const measured = ratio(inkOn(tokens, `${palette}.${slot}`, surface), hex);
        expect(measured, `${variant} ${palette}.${slot} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        if (measured < tightest.measured) tightest = { pair: `${variant} ${palette}.${slot} on ${surface}`, measured };
        checked += 1; // cells-ok — a pair count
      }
    }
    // **Three surfaces, not two** (R-THM-004): `focusGround` joined `textSurfaces`
    // when the floor's scope was stated as *every ground the theme paints text on*
    // rather than as a list. The count is asserted because it is the half that
    // notices a surface leaving the pairing — every ratio row would still pass
    // over a narrower sweep.
    expect(checked, "eight slots on three surfaces on every shipped theme").toBe(8 * 3 * SHIPPED.length);
    // **The tightest pair moved theme and got very much tighter.** It was
    // `light categorical.c4 on bgElev` at 4.74 — 5% of headroom, and the answer
    // to *would anything notice if it stopped clearing*. Over the registry's ten
    // it is `nord categorical.c4 on bgElev` at **4.5010**, which is 0.02% of
    // headroom: the design cut this one to the floor rather than above it. It
    // clears, and it is worth naming that it clears by a fifth of a thousandth,
    // because the next figure recorded here will be the one that does not.
    expect(tightest.pair).toBe("nord categorical.c4 on bgElev");
    expect(tightest.measured).toBeCloseTo(4.5010, 3);
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

  it("T2.4 (I3, I19, I20): every shipped theme clears every floor on bg and bgElev, recomputed", () => {
    // Recomputed from the shipped token, not read from A01 A.1's recorded
    // figure. That is what makes the catalogue an assertion this test upholds
    // rather than a record of what someone intended.
    for (const [variant, tokens] of SHIPPED) {
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (palette.carries !== "meaning") continue;

        for (const [slot, value] of Object.entries(palette.slots)) {
          // **By NAME as well as value**, because composition is keyed on the
          // surface's name — `textSurfaces` yields both and the literal pair did not.
          for (const [surfaceName, surface] of textSurfaces(tokens)) {
            const ink = inkOn(tokens, `${name}.${slot}`, surfaceName);
            expect(
              ratio(ink, surface),
              `${variant} ${name}.${slot} (${value}${ink === value ? "" : ` composed ${ink}`}) against ${surface}`,
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
        for (const [surfaceName, surface] of textSurfaces(tokens)) {
          const ink = inkOn(tokens, `syntax.${slot}`, surfaceName);
          expect(ratio(ink, surface), `${variant} syntax.${slot} on ${surfaceName}`)
            .toBeGreaterThanOrEqual(floorFor(slot));
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
      // **The exemptions, compared by equality rather than tested by membership**
      // — a `continue` per name lets a dead entry outlive its subject, and a
      // silent exemption is the failure this gate is named after.
      //
      //   spectrum  decoration; the art is not themed at 4-bit
      //   hue       PARKED 21. Not *no answer needed* but *no answer the design
      //             records*: `nearestAnsi16` over the ten inks returns six
      //             distinct indices in `dark` and seven in `light`, with `blue`
      //             and `green` both landing on 6 and `orange`, `lime` and
      //             `yellow` all on 11. A mechanical map satisfies this gate and
      //             destroys the identities it exists to keep, and a curated one
      //             is ten visible choices the registry does not carry. Nothing
      //             is silent: C10 I55 records the measurement and T2.56 asserts
      //             the 4-bit answer is `NO_STYLE` rather than a wrong colour.
      const EXEMPT = ["hue", "spectrum"];
      expect(Object.keys(tokens.palettes).filter((n) => EXEMPT.includes(n)).sort(),
        `${variant}: every exemption still names a palette this theme carries`).toEqual(EXEMPT);
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (EXEMPT.includes(name)) continue;
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
        const measured = ratio(inkOn(tokens, `${palette}.${slot}`, surface), hex);
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

  it("T2.24 (I43, roadmap 24, R-THM-002): both high-contrast themes keep the floor they declare", () => {
    // **The promise is 7 : 1 and it used to be nowhere expressible.** `FLOORS`
    // is a module constant naming the *minimum* every theme must clear, so a
    // theme that promised more had no way to declare it and no way to be held to
    // it — which made this row the only thing standing between "high-contrast"
    // and a name.
    //
    // **That is exactly how it went stale.** A claim asserted in one row against
    // the tokens as they stood is not a constraint on the tokens that follow:
    // porting the themes to the registry left `hcLight` at 6.55 : 1 on `bgElev`
    // for eight refs, under a promise nothing could read. R-THM-002 registers
    // the ratio in the design and `ThemeTokens.floor` makes it declarable, so
    // `validateHighContrast` refuses it at load like every other floor.
    //
    // **So this row's subject moved and is sharper for it.** It no longer *is*
    // the check — it asserts the themes declare the floor, that the declaration
    // is what the check reads, and the three things a floor cannot say: that
    // `muted` is still recessive, that the tones stay distinct, and where the
    // claim stops.
    const HC = ["hcDark", "hcLight"] as const;
    const PROMISE = 7;

    for (const name of HC) {
      const hc = defaultTheme[name];
      expect(hc, `the set holds ${name}`).toBeDefined();
      if (hc === undefined) continue;

      // **The declaration, not a literal in this file.** A row that carried its
      // own 7 would agree with itself for ever — which is what the first
      // version of this did.
      expect(hc.floor, `${name} declares what it promises`).toBe(PROMISE);
      expect(validateTokens(hc), `${name} keeps it`).toEqual([]);

      // And the sweep, so the row says which pair is tightest rather than only
      // that none failed. `hcLight` sits exactly on the floor, because it was
      // composed to.
      let tightest = { pair: "", measured: Number.POSITIVE_INFINITY };
      for (const [palette, spec] of Object.entries(hc.palettes)) {
        if (spec.carries !== "meaning") continue;
        for (const slot of Object.keys(spec.slots)) {
          for (const [surface, ground] of textSurfaces(hc)) {
            const measured = ratio(inkOn(hc, `${palette}.${slot}`, surface), ground);
            if (measured < tightest.measured) tightest = { pair: `${palette}.${slot} on ${surface}`, measured };
          }
        }
      }
      expect(tightest.measured, `${name} tightest: ${tightest.pair}`).toBeGreaterThanOrEqual(PROMISE);

      // **`muted` is the slot this theme exists to answer** — 2.14–2.42 on the
      // light variant against every candidate wash, under its own 2.5 floor, and
      // recorded during the selection work as a reason not to pair it. Named
      // rather than left to the sweep above, because the sweep passing does not
      // say which slot was in question.
      const muted = hc.palettes["tone"]?.slots["muted"];
      expect(ratio(muted!, hc.surfaces.bg), `${name} muted, the quietest slot here`)
        .toBeGreaterThanOrEqual(PROMISE);

      // And it is still recessive: quieter than `dim`, which is quieter than
      // `default`. A promise that flattened the three would have bought the
      // floor by losing what the tones are for — which is the risk the moment
      // you start darkening inks to clear a ratio, and is why it is asserted on
      // both themes rather than on the one that was darkened.
      const tone = (slot: string): number => ratio(hc.palettes["tone"]!.slots[slot]!, hc.surfaces.bg);
      expect(tone("muted"), `${name}: muted under dim`).toBeLessThan(tone("dim"));
      expect(tone("dim"), `${name}: dim under default`).toBeLessThan(tone("default"));

      // **And they stay ten**, on the ground they were composed for. Darkening
      // four inks toward a floor is exactly the edit that converges a palette,
      // and a ratio check cannot see two slots arriving at one colour.
      const onElev = Object.keys(hc.palettes["tone"]!.slots)
        .map((slot) => inkOn(hc, `tone.${slot}`, "bgElev"));
      expect(new Set(onElev).size, `${name}: ten tones on bgElev, still ten colours`).toBe(onElev.length);

      // **The rung where the claim stops.** At 4-bit the values are the
      // emulator's, so contrast is unprovable and only distinctness survives —
      // which is what the curated map promises instead (C10 I26).
      const five = ["ok", "warn", "error", "info", "accent"].map((t) => hc.fourBit[`tone.${t}`]);
      expect(new Set(five).size, `${name}: distinctness is what this depth can keep`).toBe(5);
    }

    // **And nothing else declares one**, so the field is not drifting into a
    // second way of writing the ordinary floor.
    const declaring = Object.entries(defaultTheme).filter(([, t]) => t.floor !== undefined).map(([n]) => n);
    expect(declaring.sort(), "only the two themes named for a ratio declare one").toEqual([...HC].sort());
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

  it("T2.14e (C10 I32, §4d, R-THM-001): the tag's ground and the tone are two values, each held to its own pair", () => {
    // **The equality is retired and this row is its inverse.** I32 made
    // `surfaces.errorGround` take `tone.error`'s own value because two hex
    // literals that must agree is a pair waiting to drift — and it drifted four
    // times in one sitting before the equality settled it. What the equality
    // cost was the floor: one value serving as ink on the page *and* as a ground
    // behind white text cannot clear 4.5 in both directions, so `error` got a
    // 2.5 exception and kept it.
    //
    // R-THM-001 splits them, and the split is strictly better: `tone.error` is
    // ink and clears 4.5 against the grounds it lands on, `surfaces.errorGround`
    // is a ground and holds `errorInk` at 4.5, and the exception is retired
    // across all ten themes with the tightest tone at 4.78 (`dark` on `bgElev`).
    //
    // **The drift hazard the equality answered is answered differently now.**
    // Not by the two values being one, but by each being measured against what
    // it actually sits on — `validateTokens` for the tone, `errorTagPairs` for
    // the pair — so a change to either is caught by the check that owns it
    // rather than by an assertion that they match.
    let same = 0; // cells-ok — a theme count
    for (const [variant, tokens] of SHIPPED) {
      const tone = tokens.palettes.tone?.slots["error"];
      const ground = tokens.surfaces.errorGround;
      const ink = tokens.surfaces.errorInk;
      expect(tone, `${variant}: a tone`).toBeDefined();
      expect(ground, `${variant}: a ground`).toBeDefined();

      // The ground holds its ink, which is the pair the tag draws.
      expect(ratio(ink, ground), `${variant}: the tag's own pair`).toBeGreaterThanOrEqual(4.5);
      if (tone === ground) same += 1; // cells-ok — a theme count
    }

    // **Two themes still have them equal and it is not a leftover.** `hcDark`
    // and `hcLight` are the high-contrast pair, where the tone is already loud
    // enough to be a ground — so the equality survives where it is a
    // consequence of the palette rather than a constraint on it, which is the
    // whole of what changed. Asserted as a count so it cannot silently become
    // ten again.
    expect(same, "the equality is a consequence in two themes, not a rule in ten").toBe(2);
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

  it("T2.14c (C10 I22, §4a, §4b, §4d, R-THM-001): twenty-five surfaces, and the withdrawn strong pair is absent", () => {
    // The pair that was specified, measured and removed. Asserted absent rather
    // than merely unmentioned: a spec that measured something out and a token
    // file that quietly kept it is exactly the drift this suite exists to stop,
    // and an unused surface with no floor behind it is what someone reaches for.
    //
    // **Ten became twenty-five and the count is still the row's whole subject.**
    // R-THM-001 assigns fifteen more, every one of which the design draws — the
    // focus ground, the four selection-adjacent ground/ink pairs, the skip pair,
    // the meter fill and the four mode grounds with their shared ink. A ground
    // and its ink are both surfaces, which is the placement `errorInk` already
    // had (§4d): an ink put in `tone` would be measured against `bg`, where a
    // black ink for a red ground fails every floor for a pairing nothing draws.
    //
    // **`.bg-error` is not a twenty-sixth.** The registry carries it as a second
    // name for `.bg-errorGround` with the same declaration in all ten themes,
    // and `surface.error` beside `tone.error` is two colours reachable by one
    // word. The generator drops the alias and asserts the two are equal first.
    for (const [variant, tokens] of SHIPPED) {
      const names = Object.keys(tokens.surfaces).sort();
      expect(names, variant).toEqual([
        "bg",
        "bgDeep",
        "bgElev",
        "border",
        "borderStrong",
        // R-THM-001 — the chosen/pick/link triple: three grounds a reader can be
        // pointed at, each with an ink of its own rather than borrowing one.
        "chosen",
        "chosenInk",
        "diffAdd",
        "diffRemove",
        // §4a — the error tag's pair. **Two entries, and they are one thing**:
        // a ground with no ink of its own borrows a foreground nothing measured
        // against it, so `errorTagPairs` checks them together and neither may
        // arrive alone. Sorted order puts the ground before the ink.
        "errorGround",
        "errorInk",
        // R-THM-001 — the ground focus takes, which C10 §4c's *the shipped
        // default paints nothing* had no room for. M3's precedence stack is what
        // consumes it.
        "focusGround",
        "link",
        "linkInk",
        // R-THM-001 — the four mode grounds and the one ink they share. The ink
        // is shared because the four grounds are chosen to hold it, which is a
        // property of the set rather than of any one of them.
        "mAccept",
        "mAuto",
        "mInk",
        "mManual",
        "mPlan",
        // R-THM-001 — a fill rather than a ground: the part of a meter that is
        // full, which carries no text and is paired with nothing.
        "meterFill",
        "pick",
        "pickInk",
        // §4b — the selection wash. A text-bearing surface with a pairing of
        // its own (`selectionPairs`), not an eighth entry in the diff one.
        "selection",
        "skipGround",
        "skipInk",
      ]);
    }
  });

  it("T2.14d (§4b, §4b.1, I49): the selection pairing is derived from the theme's own compositions, and is not the diff one", () => {
    // **Written because widening `diffPairs` was the first attempt and four
    // rows refused it** — T2.14b above states outright that `tone.default`
    // must not be in the diff pairing, and it was right: a function whose name
    // says one thing and whose contents say two stops being readable. The
    // sibling is asserted here so the split cannot quietly become a merge.
    //
    // **The row asserted `tone.default` alone, and that clause is retired**
    // (C10 §4b.1). It was right about the prompt — ghost text is `muted` and is
    // drawn after the buffer's last cluster — and the design's selection is the
    // transcript's too: the registry repaints nine tones on this ground across
    // nine themes, `muted` among them in six. A composed value *is* the design
    // saying the ref lands here, so the scope rule is unchanged and only its
    // premise moved. What stays asserted is the split from `diffPairs` and the
    // one pairing every theme has whether or not it composes anything.
    for (const [variant, tokens] of SHIPPED) {
      const pairs = selectionPairs(tokens);
      const refs = pairs.map(([palette, slot]) => palette + "." + slot);
      expect(refs, variant).toContain("tone.default");
      expect([...new Set(pairs.map(([, , surface]) => surface))]).toEqual(["selection"]);
      // **Derived, so it is exactly the theme's compositions plus the base.** An
      // equality rather than a membership test: a derivation that quietly
      // returned every slot in the palette would satisfy `toContain` on all of
      // them, which is the shape this row's first version was guarding against
      // from the other side.
      const composed = Object.keys(tokens.composed?.["surface.selection"] ?? {})
        .filter((ref) => {
          const [family, slot] = ref.split(".");
          return tokens.palettes[family ?? ""]?.slots[slot ?? ""] !== undefined;
        });
      expect(refs.slice().sort(), variant).toEqual([...new Set(["tone.default", ...composed])].sort());
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

describe("C10 §2 — the shipped default is a working value", () => {
  it("T2.37 (I18): `defaultTheme` loads with no overrides, and every variant clears every floor", () => {
    // **T2.4 is the contrast half and it is over `SHIPPED`, which *is*
    // `defaultTheme`** — so what is owed here is the other clause: that the one
    // required config field has a working value to fill it with. A framework
    // whose only required field has no working value is a framework nobody
    // starts, and no assertion about ratios can see that.
    for (const [variant] of SHIPPED) {
      const loaded = loadTheme(defaultTheme, variant as keyof typeof defaultTheme);
      expect(loaded.ok, `${variant} did not load`).toBe(true);
      expect(loaded.ok && loaded.value.current, `${variant} loaded empty`).toBeTruthy();
    }

    // And it is one line to fill because it is one value: the whole set is a
    // single frozen export, not a builder the caller has to assemble.
    expect(Object.isFrozen(defaultTheme), "handed over ready to use").toBe(true);
    expect(SHIPPED.length, "and it carries more than one variant").toBeGreaterThan(1);
  });
});

/**
 * **C10 §4j — the debt list, compared by equality.**
 *
 * §4j.3 rules that this is a row and not `validatePalette`: every shipped theme
 * fails the floor, so a load-time throw would refuse the framework's own themes
 * and lowering the floor until they pass is the same edit under another number.
 * What a row can do instead is hold the failure *exactly*, so the day one is
 * repaired the list has to move with it.
 */
describe("C10 §4j — the categorical separation debt", () => {
  /**
   * **The list is `KNOWN_STALE`'s shape and it is here for that list's reason.**
   * A subset check would let a cleared collision outlive its reason unread — the
   * failure mode `compare-exemption-lists-by-equality` was written for. Both
   * directions: a new pair fails this row and a repaired one fails it too.
   */
  const DEBT: Readonly<Record<string, readonly string[]>> = {
    "dark": [
      "protan c2/c5 5.4", "deutan c1/c6 6.3", "deutan c2/c5 3.4", "tritan c1/c7 6.8",
      "tritan c2/c3 1.5", "tritan c2/c5 6.5", "tritan c3/c5 5.1",
    ],
    "light": [
      "protan c1/c4 2.6", "deutan c1/c4 0.6", "deutan c1/c6 3.5", "deutan c4/c6 4.0",
      "tritan c1/c7 5.3", "tritan c2/c3 5.1", "tritan c6/c7 6.5",
    ],
    "hcDark": [
      "protan c2/c5 5.4", "deutan c1/c6 6.3", "deutan c2/c5 3.4", "tritan c1/c7 6.8",
      "tritan c2/c3 1.5", "tritan c2/c5 6.5", "tritan c3/c5 5.1",
    ],
    "hcLight": [
      "protan c1/c4 5.9", "protan c2/c3 5.4", "protan c3/c7 4.9", "deutan c1/c6 3.8",
      "deutan c2/c3 2.5", "deutan c3/c7 6.2", "deutan c4/c5 4.4", "tritan c1/c5 6.8",
      "tritan c2/c5 3.6",
    ],
    "ink": [
      "protan c2/c3 6.2", "protan c3/c6 4.9", "deutan c1/c4 5.4", "deutan c2/c7 2.4",
      "deutan c3/c6 2.3", "tritan c1/c5 3.1", "tritan c6/c7 2.2",
    ],
    "warm": [
      "protan c1/c4 5.3", "protan c2/c3 5.4", "protan c2/c6 3.8", "protan c3/c6 3.5",
      "protan c7/c8 4.5", "deutan c1/c4 1.9", "deutan c2/c6 6.9", "deutan c2/c7 2.4",
      "deutan c3/c6 1.8", "tritan c1/c5 3.9", "tritan c3/c6 4.0", "tritan c4/c8 6.7",
      "tritan c6/c7 6.4",
    ],
    "nord": [
      "protan c1/c4 3.7", "protan c2/c3 6.4", "protan c2/c6 4.0", "protan c3/c6 6.4",
      "protan c4/c8 5.8", "protan c5/c8 3.8", "deutan c2/c7 4.2", "deutan c3/c6 4.7",
      "deutan c4/c8 3.4", "deutan c5/c8 4.1", "deutan c6/c7 5.5", "tritan c2/c8 2.0",
      "tritan c6/c7 5.3",
    ],
    "viol": [
      "protan c1/c4 4.7", "protan c4/c8 5.6", "deutan c1/c6 2.3", "deutan c2/c7 4.7",
      "deutan c4/c5 2.8", "tritan c1/c2 3.9", "tritan c1/c5 5.5", "tritan c2/c5 5.5",
      "tritan c3/c4 5.6", "tritan c4/c7 6.1",
    ],
    "mono": [
      "normal c1/c2 4.5", "normal c1/c8 4.3", "normal c2/c3 6.1", "normal c2/c5 3.1",
      "normal c3/c5 3.0", "normal c4/c8 4.0", "normal c6/c7 3.0", "protan c1/c2 4.5",
      "protan c1/c8 4.3", "protan c2/c3 6.1", "protan c2/c5 3.1", "protan c3/c5 3.0",
      "protan c4/c8 4.0", "protan c6/c7 3.0", "deutan c1/c2 4.5", "deutan c1/c8 4.3",
      "deutan c2/c3 6.1", "deutan c2/c5 3.1", "deutan c3/c5 3.0", "deutan c4/c8 4.0",
      "deutan c6/c7 3.0", "tritan c1/c2 4.5", "tritan c1/c8 4.3", "tritan c2/c3 6.1",
      "tritan c2/c5 3.1", "tritan c3/c5 3.0", "tritan c4/c8 4.0", "tritan c6/c7 3.0",
    ],
    "paper": [
      "deutan c1/c4 2.2", "deutan c1/c5 6.6", "deutan c3/c7 1.4", "deutan c4/c5 4.8",
      "tritan c1/c5 1.7", "tritan c1/c6 5.4", "tritan c3/c4 3.1", "tritan c5/c6 5.6",
    ],
  };



  it("T2.38 (I39, §4j): every shipped theme's collisions are its debt list exactly", () => {
    // The variant set itself, by equality — a theme added with no entry would
    // otherwise be measured by nothing, which is I30's shape one level out.
    expect(SHIPPED.map(([v]) => v).sort(), "the debt list covers every shipped theme")
      .toEqual(Object.keys(DEBT).sort());

    for (const [variant, tokens] of SHIPPED) {
      const slots = tokens.palettes.categorical?.slots ?? {};
      const found = collisions(slots).map((c) => `${c.vision} ${c.a}/${c.b} ${c.deltaE.toFixed(1)}`);
      expect(found, `${variant} — a new collision fails here and a repaired one fails here too`)
        .toEqual(DEBT[variant]);
    }

    // **`hcDark` ships `dark`'s list and not a list of the same length.** The
    // theme exists to maximise distinguishability and its categorical palette is
    // the dark theme's, so the two are asserted identical rather than separately
    // correct — a divergence in either is a finding about a deliberate copy.
    // `hcLight` is *not* in this pair and has a list of its own, which is the
    // half the old three-theme set could not show: the high-contrast themes are
    // two palettes, not one palette in two polarities.
    expect(DEBT["hcDark"], "the same pairs, not merely as many").toEqual(DEBT["dark"]);
    expect(DEBT["hcLight"], "and the light half is its own palette").not.toEqual(DEBT["dark"]);

    // **`mono` collides in `normal` vision and that is the theme working.** It
    // is the only entry here whose list carries `normal` rows, because its eight
    // categorical slots are eight greys and ΔE2000 between two greys is a
    // lightness difference — there is no hue left to separate them with. Seven
    // pairs under the floor in ordinary vision is not debt a repair could clear;
    // it is what a monochrome theme costs, and `classes` is where a monochrome
    // theme carries meaning instead (I16). Named so the row is not read as
    // eight themes with debt and one with a defect.
    expect(
      DEBT["mono"]!.filter((c) => c.startsWith("normal")).length,
      "mono is the only theme that collides before any dichromacy",
    ).toBe(7);
    for (const [name, list] of Object.entries(DEBT)) {
      if (name === "mono") continue;
      expect(list.filter((c) => c.startsWith("normal")), `${name} separates in normal vision`).toEqual([]);
    }

    // The control. Without it a floor of seven and a floor of seventy are the
    // same rule here: every shipped palette fails both.
    expect(collisions(OKABE_ITO_CANONICAL), "canonical Okabe-Ito, the calibrating set").toEqual([]);
  });

  /**
   * **T2.38a (C10 I39, §4j.1) — one substitution, and it is the whole debt.**
   *
   * The three variants diverge from canonical by very different amounts, and
   * the smallest divergence is the one that shows the mechanism. The colormap
   * keeps seven canonical slots and swaps `#3cbf9a` in for black; that swap is
   * the entirety of its collision list. It is the only variant where cause and
   * effect are separable, which is why the row is here rather than folded into
   * the sweep above.
   */
  it("T2.38a (I39, §4j): the colormap's single substitution is the whole of its debt", () => {
    const hex = (t: readonly [number, number, number]): string =>
      `#${t.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const slots: Record<string, string> = {};
    OKABE_ITO.forEach((t, i) => { slots[`m${String(i + 1)}`] = hex(t); });

    const canonical = new Set(Object.values(OKABE_ITO_CANONICAL).map((v) => v.toLowerCase()));
    const novel = Object.entries(slots).filter(([, v]) => !canonical.has(v.toLowerCase()));
    expect(novel, "seven canonical slots and one substitution").toEqual([["m8", "#3cbf9a"]]);

    // And the substitution is the whole debt: one pair, and `m8` is in it.
    expect(collisions(slots).map((c) => `${c.vision} ${c.a}/${c.b} ${c.deltaE.toFixed(1)}`))
      .toEqual(["tritan m2/m8 1.5"]);
  });
});

/**
 * C10 §4k — the six compositions, owed at the spec commit.
 *
 * **Three of the four rows are `it.todo` and the fourth is not**, which is the
 * point of the set. T2.45–T2.47 wait on M3's code; T2.48 asserts the *absence*
 * that makes three of the six golden frames undrawable, and an absence asserted
 * later is an absence nobody watched — the gap would widen silently in exactly
 * the window where somebody is building painters.
 */
describe("C10 §4k — focus, selection and the facts that contest a ground", () => {
  it.todo(
    "T2.45 (I47, R-SEL-006): focused and selected take two grounds and one mark — the ground resolves to `surface.selection` and `\u25b8` is on the head row, at 24-bit, at 1-bit where the row is `inverse`, and in ASCII where the mark is `>`; asserted as a pair, because the mechanism this replaces draws one ground and tells the two apart by ink, which satisfies any row naming a single fact — not deferred on a component: the ground and the mark land with §4k's resolver change in this same MR",
  );
  it.todo(
    "T2.46 (I47, R-STA-003): hover and focus hold disjoint carrier sets at every rung — focus has `\u25b8` at all three and hover never does; at 1-bit, where hover's ground is gone, hover holds bold and focus does not. A disjointness over sets, because two rows each naming one carrier agree while the two facts render identically — not deferred on a component: it lands with §4k's resolver change, and its hover half is exercised through a constructed state until a block declares `hovered`. **This clause used to name mouse mode 1003 and that was the wrong condition** — `lifecycle.ts:125` takes 1003 behind a `hover?: boolean` option and the decoder reads a no-button move, so a pointer move already arrives; the router discards it by rule (§4a row t) and no block carries the field, which is what T2.48 watches",
  );
  it.todo(
    "T2.47 (I47, R-STA-004): where availability meets validity the well takes the ground and the error keeps two carriers — its mark and its outcome word. The row asserts the count, not just the winner: a row naming only which ground won passes a ruling that left validity with nothing — not deferred on a component: it lands with §4k's resolver change, on a constructed availability state until a block declares one",
  );

  /**
   * **A negative row, and the one that expires by its condition rather than by
   * its remedy** (F855, F856). Three of the facts §4k.1 tabulates have no
   * subject in this tree, and a fourth composition is unconstructible for a
   * different reason — which is why the row has two halves rather than one
   * sweep. A comment saying so watches nothing; this goes red the day any of
   * them acquires a subject, which is the day §4k.4's list needs re-reading.
   *
   * **The first draft of this row asserted the wrong absence**, and it is the
   * reason the row exists in this shape. It claimed nothing painted the diff
   * grounds; the grep behind that claim was truncated and `patch/lines.ts` was
   * below the cut. The grounds and the `+` / `−` marks both ship. What is
   * missing is the **addressability** — `patch` declares no elements and reads
   * `ctx.focus` nowhere — so the assertion is on the seam and not on the slot.
   */
  it("T2.48 (I47, §4k.1): the facts with no subject are asserted to have none", () => {
    // **Case 3's blocker is addressability, not the ground.** `patch` paints
    // `surface.diffAdd` and the marks already; what it does not do is declare
    // an element or read focus, so no patch row can be selected.
    const patch = new URL("../../src/presentation/patch/", import.meta.url);
    const patchSrc = readdirSync(patch)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(new URL(f, patch), "utf8"))
      .join("\n");
    expect(/surface\.diffAdd/.test(patchSrc), "the diff ground is painted").toBe(true);
    expect(/ctx\.focus|\belements\s*[:(]/.test(patchSrc), "and no patch row is addressable").toBe(false);

    // No block declares availability, freshness, or a pointer hover.
    const types = readFileSync(new URL("../../src/presentation/blocks/types.ts", import.meta.url), "utf8");
    const declared = ["disabled", "stale", "hovered"].filter((f) =>
      new RegExp(`^\\s*${f}\\??:`, "m").test(types),
    );
    expect(declared, "no block carries an availability, freshness or hover field").toEqual([]);
  });
});

/**
 * C10 I52 — every state axis the registry carries is declared here.
 *
 * **The gate two records named as their watcher and neither could see.** §4k.4
 * says *what M11 owes them is the declaration, since a fact with no declared
 * carrier is a build failure under M11's gate*, and `MILESTONES.md`'s M11 row
 * gives *M11's own gate, on the day a fact arrives with no declaration* as what
 * goes red. Measured before this row existed: **nothing in `src/`, `tools/` or
 * `test/` read `stateAxes` at all**, so the population was never enumerated and
 * neither watcher existed. A deferral whose watcher is imaginary is the
 * strongest form of the class this repository names about itself, because the
 * citation reads as coverage.
 *
 * **Both sides are read, so neither is a transcription.** The registry is the
 * population and the spec is the declaration; a row holding its own copy of
 * twelve names would be a third record to drift (F1240's shape).
 */
describe("C10 I52 — the registry's state axes and the spec's declarations", () => {
  it("T2.53 (C10 I53, §070, §093): the ten hues are three tiers per theme, and the order is a sequence", () => {
    const registry = JSON.parse(
      readFileSync(new URL("../../docs/design/language/calcium-registry.json", import.meta.url), "utf8"),
    ) as { themes: readonly { id: string }[]; themeRules: readonly { selector: string; declarations: string }[] };

    // The registry side, read out of the 300 tokens rather than written down here.
    // `c-h-X` is the hue's ink, `bg-h-X` its ground, `c-hi-X` the ink ON that ground.
    const expected = new Map<string, Map<string, Record<string, string>>>();
    const order: string[] = [];
    for (const rule of registry.themeRules) {
      const colour = /(?:^|[;{\s])color:\s*(#[0-9a-fA-F]{3,8})/u.exec(rule.declarations);
      const ground = /background(?:-color)?:\s*(#[0-9a-fA-F]{3,8})/u.exec(rule.declarations);
      // The theme is in the selector and not a field — `[data-theme="dark"] .c-h-blue`.
      const themeOf = /^\[data-theme="([a-zA-Z]+)"\]/u.exec(rule.selector);
      if (themeOf === null) continue;
      for (const m of rule.selector.matchAll(/\.(c-h|bg-h|c-hi)-([a-z0-9]+)\b/gu)) {
        const [, kind, hue] = m as unknown as [string, string, string];
        if (kind === "c-h" && !order.includes(hue)) order.push(hue);
        const perTheme = expected.get(themeOf[1]!) ?? new Map<string, Record<string, string>>();
        expected.set(themeOf[1]!, perTheme);
        const rec = perTheme.get(hue) ?? {};
        perTheme.set(hue, rec);
        if (kind === "c-h" && colour !== null) rec["ink"] = colour[1]!.toLowerCase();
        if (kind === "c-hi" && colour !== null) rec["on"] = colour[1]!.toLowerCase();
        if (kind === "bg-h" && ground !== null) rec["ground"] = ground[1]!.toLowerCase();
      }
    }

    // The population is measured, not quoted — ten hues over ten themes, three
    // tiers each, which is the 300 the generator called theme-independent.
    expect(order.length, "hues").toBe(10);
    expect(expected.size, "themes carrying hues").toBe(registry.themes.length);

    const THEMES = defaultTheme as unknown as Readonly<Record<string, ThemeTokens>>;
    expect(Object.keys(THEMES).length, "themes shipped").toBe(registry.themes.length);

    for (const [themeId, perTheme] of expected) {
      const hues = THEMES[themeId]?.hues;
      expect(hues, `${themeId}: the projection carries its hues`).toBeDefined();

      // **A sequence and not a set.** §093 replaced a spectral assignment whose
      // failure was that five identities a deuteranope cannot separate sat next
      // to each other; a set comparison passes the arrangement it retired.
      expect(Object.keys(hues!), `${themeId}: §093's order`).toEqual(order);

      // Equality in BOTH directions: no hue in the registry that the projection
      // lacks, and no hue in the projection the registry does not hold.
      expect(new Set(Object.keys(hues!)), `${themeId}: no hue either side invented`).toEqual(new Set(perTheme.keys()));

      for (const [hue, rec] of perTheme) {
        for (const tier of ["ink", "ground", "on"] as const) {
          expect(rec[tier], `${themeId} ${hue}: the registry records its ${tier}`).toBeDefined();
          expect(hues![hue]?.[tier].toLowerCase(), `${themeId} ${hue}: ${tier}`).toBe(rec[tier]);
        }
      }
    }

    // **The control: the pair of themes that lift the ink, and the nine grounds.**
    // Without these the row passes against a projection that collected the hues
    // once and wrote one theme's vocabulary out ten times — which is exactly what
    // the generator's own comment said it did. Both figures are what makes the
    // per-theme claim have something to be wrong about (A03 §2).
    const blueInks = new Set(Object.values(THEMES).map((t) => t.hues!["blue"]!.ink.toLowerCase()));
    expect(blueInks.size, "blue's ink takes three values across the ten themes").toBe(3);
    expect(THEMES["light"]!.hues!["blue"]!.ink.toLowerCase(), "light lifts a mid blue off a light ground").toBe("#4e8ef6");
    expect(THEMES["paper"]!.hues!["blue"]!.ink.toLowerCase(), "paper does the same, and not identically").toBe("#4e8df5");
    const blueGrounds = new Set(Object.values(THEMES).map((t) => t.hues!["blue"]!.ground.toLowerCase()));
    expect(blueGrounds.size, "blue's ground is nine distinct values across ten themes").toBe(9);

    // **`mono` keeps its hues chromatic, and it is the row worth naming.** Every
    // tone and every surface it carries is grey — measured below — and its ten
    // hues are the registry's saturated ones, blue's ink identical to `dark`'s.
    // Ten identities cannot degrade to one grey, so identity is the single axis
    // the greyscale theme does not flatten.
    const grey = (hex: string): boolean => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return r === g && g === b;
    };
    const mono = THEMES["mono"]!;
    expect(Object.values(mono.surfaces).every(grey), "mono's surfaces are grey").toBe(true);
    expect(Object.values(mono.palettes["tone"]!.slots).every(grey), "mono's tones are grey").toBe(true);
    expect(Object.values(mono.hues!).some((h) => grey(h.ink)), "and not one of its hues is").toBe(false);
    expect(mono.hues!["blue"]!.ink, "mono's blue ink is dark's").toBe(THEMES["dark"]!.hues!["blue"]!.ink);
  });

  it("T2.54 (C10 I54, §070): the ink on a hue's band is DERIVED — the higher-contrast of black and white", () => {
    const THEMES = defaultTheme as unknown as Readonly<Record<string, ThemeTokens>>;

    // §070's own rule, in its own words: *the ink on each is chosen by CONTRAST
    // against that hue, so yellow takes black and blue takes white without
    // anyone deciding per theme*. It is a computation, so it is checkable — and
    // a tier that is checkable should not be asserted by copying the registry.
    let pairs = 0;
    let worst = Infinity;
    let white = 0;
    for (const [themeId, tokens] of Object.entries(THEMES)) {
      for (const [hue, rec] of Object.entries(tokens.hues ?? {})) {
        pairs += 1;
        const onBlack = ratio(rec.ground, "#000000");
        const onWhite = ratio(rec.ground, "#ffffff");
        const want = onBlack >= onWhite ? "#000000" : "#ffffff";
        expect(rec.on.toLowerCase(), `${themeId} ${hue}: ${onBlack.toFixed(2)} on black vs ${onWhite.toFixed(2)} on white`)
          .toBe(want);
        if (want === "#ffffff") white += 1;
        worst = Math.min(worst, Math.max(onBlack, onWhite));
      }
    }
    expect(pairs, "ten hues over ten themes").toBe(100);

    // **The floor holds BY the derivation, not beside it** (measured 2026-09-24):
    // the winning ink clears 4.5:1 in all 100, and the worst is 4.62 — `purple`
    // on `nord` and `blue` on `hcDark`, where the two inks are within 2% of each
    // other and the rule is a tie-break. So the assertion is on the *minimum*
    // rather than on a count: a hue whose ground drifted darker would lose the
    // floor before it lost the tie, and only this figure would say so.
    expect(worst, "the winning ink's contrast, at its worst").toBeGreaterThanOrEqual(DEFAULT_FLOOR);

    // **The control, and it is the sentence §070 got wrong.** White wins seven
    // times of a hundred — `purple` in six themes and `blue` in `hcDark` alone.
    // §070 illustrates its rule with *blue takes white*, which is true in one
    // theme of ten and reads as a general claim; the rule it illustrates holds
    // 100 of 100. Without this figure the row passes against a build that
    // hard-coded black, which is 93 of the 100 answers.
    expect(white, "white wins seven times — purple six, blue once").toBe(7);
    expect(THEMES["hcDark"]!.hues!["blue"]!.on.toLowerCase(), "§070's own example, where it is true").toBe("#ffffff");
    expect(THEMES["dark"]!.hues!["blue"]!.on.toLowerCase(), "and where it is not").toBe("#000000");
  });


  it("T2.52 (I52, §4k.4, M11, R-STA-001): the axes and the declarations are equal as sets", () => {
    const registry = JSON.parse(
      readFileSync(new URL("../../docs/design/language/calcium-registry.json", import.meta.url), "utf8"),
    ) as { stateAxes: readonly { id: string }[] };
    const axes = registry.stateAxes.map((a) => a.id).sort();
    expect(axes.length, "the population is the registry's, counted not quoted").toBeGreaterThan(0);

    const spec = readFileSync(new URL("../../docs/components/C10_theme_resolution.md", import.meta.url), "utf8");

    // §4k.3's partition — three rows, each a comma-separated list of axes.
    const partition = ["ranked by name", "reaching a ground only through `semantic extent`", "no rung at all"].map(
      (label) => {
        const row = new RegExp(`^\\s*\\|\\s*\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\*\\*\\s*\\|([^|]*)\\|`, "mu").exec(spec);
        expect(row, `§4k.3 has a row for ${label}`).not.toBeNull();
        return (row?.[1] ?? "").split(",").map((n) => n.trim()).filter((n) => n !== "");
      },
    );
    const ranked = [...new Set(partition.flat())].sort();

    // **Equality, not containment** (F1113's discipline): a subset test passes
    // an axis dropped from the registry while a declaration for it lives on,
    // which is a declaration for a fact that no longer exists and reads exactly
    // like coverage.
    expect(ranked, "§4k.3 partitions exactly the registry's axes").toEqual(axes);

    // §4k.4's carrier table — one row per axis with no rung, and it must be
    // exactly the partition's third row rather than a superset of it.
    const carriers = [...spec.matchAll(/^\s*\|\s*\*\*([a-z]+)\*\*\s*\|\s*\*\*(?:mark|weight|word)/gmu)].map(
      (m) => m[1] as string,
    );
    expect([...new Set(carriers)].sort(), "§4k.4 declares a carrier for exactly the axes with no rung").toEqual(
      [...(partition[2] ?? [])].sort(),
    );
  });
});

/**
 * C10 I48 — the resolver takes the ground, owed at the spec commit.
 *
 * **The row is an equality between two functions and not a table of hexes**,
 * because the defect it closes was two records of one rule disagreeing (F1240):
 * a third record would be a third thing to drift.
 */
describe("C10 I48 — the ink a slot takes on the ground it lands on", () => {
  /**
   * **An equality between two functions, and not a table of hexes.** The defect
   * this closes was two records of one rule disagreeing (F1240), so a third
   * record would be a third thing to drift. The pair count is asserted with it
   * for the reason T2.14c's count is: a ground or a slot leaving the sweep is
   * otherwise a smaller green run.
   */
  it("T2.49 (I48, R-THM-001, R-THM-003, F1240): the painter's ink and the gate's ink are one value", () => {
    const grounds = ["selection", "focusGround"] as const;
    const wrong: string[] = [];
    let pairs = 0;
    let composed = 0;
    for (const name of Object.keys(defaultTheme)) {
      const theme = store(name).current;
      const tokens = theme.tokens;
      for (const ground of grounds) {
        for (const family of ["tone", "syntax"] as const) {
          const palette = tokens.palettes[family];
          if (palette === undefined) continue;
          for (const slotName of Object.keys(palette.slots)) {
            const ref = `${family}.${slotName}` as ColourRef;
            const want = inkOn(tokens, ref, ground);
            const got = resolve(ref, theme, caps(24), ground).colour;
            pairs += 1;
            if (want !== palette.slots[slotName]) composed += 1;
            const hex = got !== undefined && got.kind === "rgb" ? got.hex : "(none)";
            if (hex !== want) wrong.push(`${name} ${ground} ${ref}: painter ${hex}, gate ${want}`);
          }
        }
      }
    }
    expect(wrong, "the painter emits the ink the gate measures").toEqual([]);
    // Ten themes × two grounds × nineteen meaning slots.
    expect(pairs, "the sweep's own size").toBe(380);
    // **And the sweep is not vacuous**, which is the half a pass cannot report:
    // an equality that held because nothing composes is A03 §2's vacuity class
    // wearing this row's name. **178 of the 380 pairs move**, pinned rather than
    // bounded — 72 of them are the two banded themes, where every slot takes the
    // band's single ink, and the other 106 are per-slot compositions across
    // `dark`, `light`, `ink`, `warm`, `nord`, `viol`, `mono` and `paper`. A
    // theme that stops composing for a ground is what this catches, and a bound
    // would let the last one go quietly.
    //
    // **166 until the generator read every selector in a rule** (C10 §4b.1). It
    // took one pairing per registry rule under a comment that was true about the
    // two selector forms and wrong about the rule, and dropped seven declared
    // values — which `withDerived` then failed to propagate, so thirteen token
    // entries were missing. Twelve of the thirteen are meaning slots and land in
    // this figure; `mono`'s `categorical.c4` is decoration and outside the
    // nineteen. The figure moving is the fix arriving, and it moves by exactly
    // what the loss was.
    expect(composed, "pairs where the ground moves the ink").toBe(178);
  });

  it("T2.50 (I50, §074, R-BLK-590): the weight ladder is the design's, over every theme", () => {
    // **`classes` has existed since I15 and nothing compared it to anything.**
    // Three source tables declare ten entries each by hand and `classesOf`
    // lends them to all ten themes; the only check refuses a *missing* table,
    // which a wrong one satisfies exactly. §079's table drawn at one bit is
    // nothing but this column, and reading it is what found `identifier`.
    const LADDER: Readonly<Record<string, readonly string[]>> = {
      emphasised: ["ok", "warn", "error", "accent", "identifier"],
      normal: ["default", "info", "meta"],
      deemphasised: ["dim", "muted"],
    };

    for (const name of Object.keys(defaultTheme)) {
      const tone = defaultTheme[name]?.palettes["tone"];
      const classes = tone?.classes;
      expect(classes, `${name} declares tone classes`).toBeDefined();

      // **Equality both ways, per class.** A containment check is satisfied by
      // the failure this exists to catch — a tone missing from `emphasised`
      // reads as covered by the two it is not in.
      const grouped: Record<string, string[]> = { emphasised: [], normal: [], deemphasised: [] };
      for (const [slot, cls] of Object.entries(classes ?? {})) grouped[cls]?.push(slot);
      for (const cls of Object.keys(LADDER)) {
        expect([...(grouped[cls] ?? [])].sort(), `${name} · ${cls}`).toEqual(
          [...(LADDER[cls] ?? [])].sort(),
        );
      }
    }

    // **The syntax palette is asserted separately and never merged**, on §074's
    // own sentence: *syntax roles resolve first — `syntax.keyword` → bold;
    // every other syntax slot → plain*. Folding the two tables together would
    // let a generic alias answer for a syntax slot, which is the thing that
    // sentence forbids.
    for (const name of Object.keys(defaultTheme)) {
      const classes = defaultTheme[name]?.palettes["syntax"]?.classes ?? {};
      const bold = Object.entries(classes).filter(([, c]) => c === "emphasised").map(([k]) => k);
      expect(bold.sort(), `${name} · syntax, bold`).toEqual(["keyword"]);
    }
  });
});

describe("C10 §073 — the chosen pair", () => {
  it("T2.51 (C10 I51, §073, R-THM-001): `pick` and `pickInk` resolve in every theme, clear the meaning floor, and the check can fire", () => {
    const THEMES = defaultTheme as unknown as Readonly<Record<string, ThemeTokens>>;
    const names = Object.keys(THEMES);
    // **The premise, asserted first.** A theme losing the pair must fail as a
    // missing value rather than pass as a pair nobody measured — which is the
    // state all ten were in before I51, with the values shipping undeclared.
    expect(names.length, "ten themes").toBe(10);
    for (const name of names) {
      const tokens = THEMES[name]!;
      const pairs = pickPairs(tokens);
      expect(pairs.length, `${String(name)} declares the pair`).toBe(1);
      const [inkName, ink, groundName, ground] = pairs[0]!;
      expect(inkName).toBe("pickInk");
      expect(groundName).toBe("pick");
      expect(
        ratio(ink, ground),
        `${String(name)}: ${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(DEFAULT_FLOOR);
    }
  });

  it("T2.51b (C10 I51, A03 §2): the pair reaches `validateTokens`, not merely `pickPairs`", () => {
    // **`errorTagPairs`' sibling defect was a check that could not fire** — its
    // ink lives in `surfaces` and the diff walk reads `palettes`, so the pair
    // was skipped in silence. A row calling `pickPairs` directly passes under
    // exactly that, so this one drives the validator instead.
    const base = (defaultTheme as unknown as Readonly<Record<string, ThemeTokens>>)["dark"]!;
    const broken = {
      ...base,
      surfaces: { ...base.surfaces, pickInk: base.surfaces.pick },
    };
    const errors = validateTokens(broken as never);
    expect(
      errors.some((e) => e.path === "surfaces.pickInk"),
      `an ink equal to its own ground must fail; got ${JSON.stringify(errors.map((e) => e.path))}`,
    ).toBe(true);
    // And the tree's own themes are clean through the same door.
    expect(validateTokens(base as never).filter((e) => e.path === "surfaces.pickInk")).toEqual([]);
  });
});
