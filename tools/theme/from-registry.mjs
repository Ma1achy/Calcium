/**
 * Emits `src/presentation/theme/tokens.generated.ts` — the ten themes' token
 * values, read from the design registry (C10 §2, R-THM-001).
 *
 * **The registry is the source and this is a projection**, the same relationship
 * `calcium-design-language-revised.html` has to it. Regenerate with `make themes`.
 *
 * **What the registry does NOT carry, and where the rest comes from.** It has
 * tones, surfaces and a fixed hue vocabulary, and no `syntax`, `categorical` or
 * `spectrum` palette for any theme — while `validateTokens` requires the first two
 * of every theme (C10 I30, and rightly: an unresolvable reference paints as the
 * default foreground, silently). The hues cannot fill the gap, because they are
 * theme-INDEPENDENT — `h-blue` is `#3b82f6` in all ten, and `hi-blue` is the ink
 * to write on it rather than a brighter blue. So a theme that the registry does
 * not measure those palettes for inherits them from the shipping theme of its own
 * polarity, whose values ARE measured against their floors. Nothing is invented;
 * where the design is silent the repository's existing answer stands.
 *
 * **`.term`, `.sw` and `.rmp` are skipped.** They are the HTML preview's own
 * chrome — R-THM-001's text names them, *"including composed ink-on-surface values
 * and preview controls"* — and `.term`'s `background` is the specimen's frame
 * rather than an instruction to paint the emulator's. No registry rule assigns a
 * terminal background, so `background: "terminal"` survives wherever it shipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(
  resolve(here, "../../docs/design/language/calcium-registry.json"), "utf8"));
const out = resolve(here, "../../src/presentation/theme/tokens.generated.ts");

/** `#222` and `#222222` are one colour; only one of them is a diff. */
const norm = (hex) => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/**
 * Polarity, and it decides two things: which shipping theme lends the unmeasured
 * palettes, and whether the theme paints its own ground.
 */
const LIGHT_THEMES = new Set(["light", "paper", "hcLight"]);

/**
 * **A theme that promises more than the common floor declares it** (R-THM-002).
 * The two high-contrast themes are named for a ratio, and before this the ratio
 * lived in a roadmap entry and one contract row — a claim about the tokens as
 * they stood rather than a constraint on the ones that follow. `hcLight` is what
 * proved that: it arrived at 6.55 : 1 on `bgElev` for eight refs, under a
 * promise nothing could read.
 */
const PROMISES = new Map([["hcDark", 7], ["hcLight", 7]]);

/**
 * **Which curated 4-bit map a theme lends, and `hcDark` is why this is a
 * function.** The registry is CSS and carries no ANSI indices, so the sixteen-
 * colour rung is repository data the design does not cover — which is one of the
 * two reasons `tokens-dark.ts` and its siblings stay in the tree.
 *
 * A first draft read `variant === "light" ? LIGHT : DARK`, and it silently threw
 * away `HIGH_CONTRAST_FOUR_BIT`: a map curated *for* high contrast, differing
 * from the dark one where the difference matters — `syntax.type` on plain yellow
 * so `number`'s bright yellow stays its own, and so on. Nothing caught it,
 * because `DARK_FOUR_BIT` is also legal and also keeps the five tones distinct.
 * **The mutation pass is what found it**: `c10-named-set`'s *high-contrast
 * collapses two tones at 4-bit* survived, and a mutation that cannot reach a
 * test is a question about the caller before it is a question about the row.
 *
 * `hcLight` is **not** given that map, and the map's own docblock says why: it
 * puts the bright half in the foreground *because the ground is index 0*. On
 * `hcLight` the ground is white, so a bright foreground is the illegible arm of
 * the same reasoning. It takes `LIGHT`'s.
 */
const fourBitLender = (id, variant) =>
  id === "hcDark" ? "HIGH_CONTRAST" : variant === "light" ? "LIGHT" : "DARK";

/**
 * **Who paints, and it is the shipping decision preserved rather than a new one.**
 * `dark` inherits by C10 I25 — *a dark theme in a dark terminal is what `terminal`
 * is for, and painting would destroy a translucent or blurred terminal* — and that
 * argument reaches every dark theme here, none of which the registry instructs to
 * paint. A light theme must paint or it is illegible in a dark terminal, and a
 * high-contrast theme must paint or it cannot promise the ratio it exists for.
 */
const PAINTS = new Set(["light", "paper", "hcDark", "hcLight"]);

const SKIP_SELECTORS = /\.term|\.sw|\.rmp/;


/** WCAG relative luminance and contrast, the same arithmetic `contrast.ts` uses. */
const chan = (hex, i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lum = (hex) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(chan(hex, 0)) + 0.7152 * f(chan(hex, 1)) + 0.0722 * f(chan(hex, 2));
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/**
 * **Where the derivation falls short of a floor, it pays for itself.**
 *
 * The registry carries no syntax palette, so it composes no ink for syntax on a
 * diff ground either — and three derived slots land marginally under 4.5 : 1 there
 * (`nord.keyword` 4.31 and `nord.function` 4.15 on `diffAdd`, `mono.keyword` 4.32
 * on `diffRemove`). These are the derivation's residue rather than a design defect:
 * the design is silent about syntax, and a silence cannot be violated.
 *
 * So the ink is walked away from the ground, one step of 1/255 per channel at a
 * time, until it clears — the smallest move that satisfies the check, which is how
 * `tokens-dark.ts` describes authoring its own values: *against the check rather
 * than before it*. It stops at black or white and returns null rather than
 * pretending, so a floor that cannot be met is an error and not a silent pass.
 */
function clearFloor(ink, ground, floor) {
  const up = lum(ink) > lum(ground);
  let current = ink;
  for (let step = 0; step < 255; step += 1) {
    if (contrast(current, ground) >= floor) return step === 0 ? ink : current;
    const parts = [0, 1, 2].map((i) => {
      const v = Number.parseInt(current.slice(1 + i * 2, 3 + i * 2), 16);
      return Math.max(0, Math.min(255, v + (up ? 1 : -1)));
    });
    const next = `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (next === current) return null;
    current = next;
  }
  return null;
}

/** The floors `contrast.ts` applies, for the slots this solver can reach. */
const FLOOR = { comment: 3 };
const floorOf = (slot) => FLOOR[slot] ?? 4.5;

const HUE = /^h-|^hi-/;
/**
 * The ten agent hues, **per theme and in three tiers** (C10 I53, §070, §093).
 *
 * **This was two module-level records keyed by hue name, under a comment saying
 * the hues are theme-independent and land once as `HUES`.** Both halves were
 * wrong. There is no `HUES` — nothing read either record, so nothing shipped —
 * and the premise does not survive measurement over the registry's 300 tokens:
 *
 *     c-h-*   the hue's ink      `#3b82f6` in eight themes, `#4e8ef6` in light
 *                                and `#4e8df5` in paper, where a mid blue needs
 *                                lifting off a light ground
 *     bg-h-*  the hue's ground   nine distinct values across ten themes
 *     c-hi-*  the ink ON it      `#000000` or `#ffffff`, by theme
 *
 * Keyed by hue alone, ten themes overwrite each other and the last read wins.
 * So the tiers are collected inside `tokensFor` with everything else that is a
 * theme's own, and the name `hue` is the lookup rather than the value.
 */
const hueName = (slot) => slot.replace(/^h-|^hi-/, "");

/**
 * The hue order, taken once from the registry's document order (§093).
 *
 * **A sequence and not a set**, because the ordering is §093's whole argument:
 * the first assignment ran the spectrum and gave *five identities a deuteranope
 * cannot separate*, and the replacement interleaves by perceptual distance —
 * blue orange cyan pink lime violet yellow green red purple. A set comparison
 * passes the arrangement this one exists to retire.
 *
 * Read from the selectors rather than written down here, so the projection has
 * one source; T2.53 is what holds the two together.
 */
const HUE_ORDER = (() => {
  const out = [];
  for (const rule of registry.themeRules) {
    for (const m of rule.selector.matchAll(/\.c-h-([a-z0-9]+)\b/g)) {
      if (!out.includes(m[1])) out.push(m[1]);
    }
  }
  return out;
})();

function tokensFor(themeId) {
  const tone = {};
  const surfaces = {};
  const composed = {};
  const bandInk = {};
  const hues = {};
  for (const rule of registry.themeRules) {
    if (SKIP_SELECTORS.test(rule.selector)) continue;
    // **Ink ON a ground** — `.bg-X .c-Y`, which the registry writes twice in one
    // selector (descendant and same-element) for the HTML's sake.
    //
    // **That was read as *one pairing per rule*, and the first half of the
    // sentence is what made the second look checked** (C10 §4b.1). Both forms
    // of one pairing is true of every rule; it does not follow that a rule
    // carries one pairing. Six registry rules name several tones in one
    // selector list — `.bg-selection .c-dim, …, .bg-selection .c-muted, …,
    // .bg-selection .c-meta, …` is three — and an anchored match took the
    // first and `continue`d past the rest. **Seven declared values never
    // reached the token set**, all on `selection`, six of them `muted`, and
    // no floor could see the loss because `SELECTION_SLOTS` excluded exactly
    // those tones. So the selector list is split and every member is read.
    const pairs = rule.selector
      .split(",")
      .map((sel) => sel.trim().match(/^\[data-theme="([a-zA-Z]+)"\] \.bg-([a-zA-Z-]+) \.c-([a-zA-Z-]+)$/))
      .filter((m) => m !== null);
    if (pairs.length > 0) {
      const colour = rule.declarations.match(/(?:^|;)color:(#[0-9a-fA-F]{3,8})/);
      for (const pair of pairs) {
        if (pair[1] !== themeId) continue;
        if (colour === null || HUE.test(pair[2]) || HUE.test(pair[3])) continue;
        const ground = `surface.${pair[2]}`;
        composed[ground] ??= {};
        composed[ground][`tone.${pair[3]}`] = norm(colour[1]);
      }
      continue;
    }
    const match = rule.selector.match(/^\[data-theme="([a-zA-Z]+)"\] (\.[a-zA-Z-]+)$/);
    if (match === null || match[1] !== themeId) continue;
    const slot = match[2];
    const colour = rule.declarations.match(/(?:^|;)color:(#[0-9a-fA-F]{3,8})/);
    const ground = rule.declarations.match(/(?:^|;)background:(#[0-9a-fA-F]{3,8})/);
    if (slot.startsWith(".c-") && colour !== null) {
      const name = slot.slice(3);
      // The hue's two ink tiers, per theme — see `HUE_ORDER` for why this is
      // not the `HUES` the sentence that stood here promised.
      if (HUE.test(name)) {
        const hue = hueName(name);
        hues[hue] ??= {};
        // `hi-` is the ink drawn ON the hue's ground; `h-` is the hue's own ink.
        hues[hue][name.startsWith("hi-") ? "on" : "ink"] = norm(colour[1]);
      }
      // **An ink is paired with a ground, so it is a surface** — the placement
      // `errorInk` already has. Put in `tone` it would be measured against `bg`,
      // where a black ink for a yellow ground fails every floor for a pairing
      // nothing draws (C10 §4d's argument, one ground over).
      else if (name.endsWith("Ink")) surfaces[name] = norm(colour[1]);
      else tone[name] = norm(colour[1]);
    } else if (slot.startsWith(".bg-")) {
      const value = ground?.[1] ?? colour?.[1];
      if (value === undefined) continue;
      const name = slot.slice(4);
      if (HUE.test(name)) {
        const hue = hueName(name);
        hues[hue] ??= {};
        hues[hue].ground = norm(value);
      }
      else surfaces[name] = norm(value);
      // **A band declares its ground and its one ink together** (R-THM-003).
      // Before this arm existed the `color:` on such a rule was read, found to be
      // a `.bg-` selector, and dropped \u2014 a declaration with no reader, which is
      // the shape that makes a promise unenforceable. A band's ink is total by
      // construction: everything drawn on the band takes it, so no slot can fall
      // through an enumeration, which is exactly how the nine-of-nineteen group
      // this replaces came to break the ratio silently.
      if (ground !== null && colour !== null && !HUE.test(name)) bandInk[name] = norm(colour[1]);
    }
  }

  // **`.bg-error` is `.bg-errorGround` under a second name, and only one ships.**
  // The registry carries both selectors — 10 uses of the first in its specimens
  // and 22 of the second — with the same declaration in all ten themes, which is
  // an alias in CSS and a collision in a token set: `surface.error` beside
  // `tone.error` is two different colours reachable by one word, and a typo
  // between them resolves rather than failing. `errorGround` is the name the
  // repository already ships and the one the design uses twice as often, so the
  // alias is dropped — asserted equal rather than assumed, because the day the
  // design gives them different values this is a design change and not a dedupe.
  if (surfaces["error"] !== undefined) {
    if (surfaces["error"] !== surfaces["errorGround"]) {
      throw new Error(`.bg-error ${surfaces["error"]} and .bg-errorGround ${surfaces["errorGround"]} have parted; they are no longer one surface`);
    }
    delete surfaces["error"];
  }

  return { tone, surfaces, composed, bandInk, hues };
}

/**
 * **The ThemeSet's order is a resolution order, not the registry's presentation
 * order.** `resolveTheme` takes the *first* theme of a matching polarity when a
 * terminal reports one and the app has expressed no preference, so declaration
 * order decides which light theme a `COLORFGBG: "0;15"` session lands on. The
 * registry lists `hcLight` before `light` because the HTML groups the
 * high-contrast pair together, and inheriting that order would ship high
 * contrast to every light terminal.
 *
 * So the canonical pair leads, the accessibility pair follows, and the rest sit
 * in the registry's own order behind them. Asserted against the registry by
 * equality rather than by length — a theme added to the registry and not named
 * here would otherwise be dropped silently.
 */
const ORDER = ["dark", "light", "hcDark", "hcLight", "ink", "warm", "nord", "viol", "mono", "paper"];

const current = registry.themes.filter((t) => t.status === "current");
{
  const have = [...current.map((t) => t.id)].sort().join(" ");
  const want = [...ORDER].sort().join(" ");
  if (have !== want) throw new Error(`ORDER does not cover the registry: ${want} vs ${have}`);
}
const themes = ORDER.map((id) => current.find((t) => t.id === id));
const collected = new Map(themes.map((t) => [t.id, tokensFor(t.id)]));

let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };
if (themes.length !== 10) fail(`expected 10 current themes, found ${themes.length}`);
for (const [id, { tone, surfaces }] of collected) {
  if (Object.keys(tone).length === 0) fail(`${id} produced no tones`);
  if (surfaces.bg === undefined) fail(`${id} has no bg surface`);
  // **The check the user's instruction earns**: a theme whose `bg` came from a
  // `.term` rule would mean the skip failed, so assert the skip fired by value.
  const term = registry.themeRules.find((r) =>
    r.selector === `[data-theme="${id}"] .term`);
  if (term === undefined) fail(`${id} has no .term rule — the projection changed shape`);
}
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const lit = (v) => JSON.stringify(v);


/**
 * **A derived slot inherits its source tone's composition, not just its value.**
 *
 * `syntax.keyword` IS `tone.meta` in a derived theme, so a ground that composes
 * `tone.meta` differently composes `syntax.keyword` the same way. Without this the
 * derived palettes reproduce exactly the failures composition exists to fix —
 * measured: `nord` cleared its four tones and kept eight identical failures on
 * `keyword`, `key`, `function`, `c1`, `c4` and `c7`, which are those same tones
 * under other names.
 */
function withDerived(themeId, composed) {
  if (MEASURED.has(themeId)) return composed;
  const out = {};
  for (const [ground, inks] of Object.entries(composed)) {
    const merged = { ...inks };
    for (const [family, map] of [["syntax", SYNTAX_FROM_TONE], ["categorical", CATEGORICAL_FROM_TONE]]) {
      for (const [slot, toneName] of Object.entries(map)) {
        const ink = inks[`tone.${toneName}`];
        if (ink !== undefined) merged[`${family}.${slot}`] = ink;
      }
    }
    out[ground] = merged;
  }
  return out;
}

/**
 * The diff grounds a derived syntax slot is painted on (`patch/lines.ts` resolves
 * `syntax.*` for a hunk body), solved to their floor. Prose tones are not here
 * because prose does not land on a diff row.
 */
function solveDiffGrounds(themeId, tone, surfaces, composed) {
  if (MEASURED.has(themeId)) return composed;
  const out = { ...composed };
  for (const name of ["diffAdd", "diffRemove"]) {
    const ground = surfaces[name];
    if (ground === undefined) continue;
    for (const [slot, toneName] of Object.entries(SYNTAX_FROM_TONE)) {
      const ref = `syntax.${slot}`;
      const key = `surface.${name}`;
      const ink = out[key]?.[ref] ?? tone[toneName];
      const floor = floorOf(slot);
      if (contrast(ink, ground) >= floor) continue;
      const solved = clearFloor(ink, ground, floor);
      if (solved === null) {
        fail(`${themeId}: ${ref} cannot reach ${floor} : 1 against ${name} (${ground})`);
        continue;
      }
      out[key] = { ...out[key], [ref]: solved };
    }
  }
  return out;
}
/**
 * `<band>` -> the one ink everything on that band takes (R-THM-003), omitted
 * entirely when a theme declares no band.
 *
 * Separate from `composed` because it is a different claim. `composed` is a
 * per-slot exception — *this ink, on this ground, is that value* — and its
 * coverage is whatever was enumerated. A band ink is **total**: it is the ink for
 * everything on the band, so a slot that nobody thought of is covered by
 * construction rather than by having been listed.
 */
function bandInkBlock(bandInk) {
  const names = Object.keys(bandInk).sort();
  if (names.length === 0) return "";
  const body = names.map((n) => `      ${JSON.stringify(n)}: ${lit(bandInk[n])},`).join("\n");
  return `\n    bandInk: Object.freeze({\n${body}\n    }),`;
}

/**
 * `surface.<ground>` -> `tone.<slot>` -> hex, merged with the lender's own
 * compositions and omitted entirely when there are none of either.
 *
 * **Two authors, and the merge is per ground rather than per theme.** The registry
 * carries ten meaning tones and six ink slots and no syntax palette at all, so a
 * theme's `syntax` and `categorical` values are lent from a token file here — and
 * a composition can only be authored where the value it replaces lives. The
 * registry composes what it holds; the lender composes what it lends.
 *
 * A shallow spread would be wrong and silently so: both authors compose on
 * `surface.focusGround`, so one ground's record would replace the other's whole
 * record and drop every entry in it. The spread is therefore repeated **inside**
 * each ground the registry touches, and the lender's remaining grounds come
 * through the outer one.
 *
 * The registry is applied last, because it is normative where the two overlap.
 */
function composedBlock(composed, lender) {
  const grounds = Object.keys(composed).sort();
  if (grounds.length === 0 && lender === undefined) return "";
  const lent = lender === undefined ? "" : `      ...(${lender}.composed ?? {}),\n`;
  const body = grounds.map((g) => {
    const inherit = lender === undefined ? "" : `        ...(${lender}.composed?.[${JSON.stringify(g)}] ?? {}),\n`;
    const inks = Object.entries(composed[g]).sort(([a], [b]) => a.localeCompare(b))
      .map(([ref, hex]) => `        ${JSON.stringify(ref)}: ${lit(hex)},`).join("\n");
    return `      ${JSON.stringify(g)}: Object.freeze({\n${inherit}${inks}\n      }),`;
  }).join("\n");
  return `\n    composed: Object.freeze({\n${lent}${body}\n    }),`;
}


/**
 * **What a theme whose palettes the registry does not carry gets instead.**
 *
 * A theme this repository already ships keeps its own measured palette — those
 * values were authored against these floors and re-deriving them would discard
 * the measurement for nothing. Every other theme derives from ITS OWN registry
 * tones, which are floor-checked by construction.
 *
 * **The correspondence is not invented; `four-bit.ts` already states it.** Its
 * curated 16-colour map assigns each syntax slot an ANSI colour — keyword magenta,
 * string green, comment grey, number yellow, key red, function blue, operator
 * cyan, punctuation white — and each tone the same colour. Read one through the
 * other and the map below is what the repository already believes. Borrowing was
 * the first attempt and it fails, because a floor is measured against a GROUND:
 * `nord`'s `bgElev` is lighter than `dark`'s, so dark's syntax colours lose their
 * margin on it. 64 errors borrowed, 16 derived, eight of ten themes clean.
 */
const SYNTAX_FROM_TONE = {
  keyword: "meta", string: "ok", comment: "muted", number: "warn", key: "error",
  type: "accent", function: "info", operator: "identifier", punctuation: "dim",
};
/** Eight distinct tones, loudest first; `default` and `muted` are text, not data. */
const CATEGORICAL_FROM_TONE = {
  c1: "info", c2: "ok", c3: "warn", c4: "meta",
  c5: "identifier", c6: "accent", c7: "error", c8: "dim",
};
/** The themes whose palettes this repository measured before the registry existed. */
const MEASURED = new Map([["dark", "DARK"], ["light", "LIGHT"], ["hcDark", "HIGH_CONTRAST"]]);

function derived(themeId, tone, lender) {
  const owner = MEASURED.get(themeId);
  if (owner !== undefined) {
    return `      // ${themeId} is a theme this repository already measured against these\n` +
      `      // floors; the registry carries no syntax or categorical tokens to match.\n` +
      `      categorical: lend(${owner}, "categorical"),\n` +
      `      syntax: lend(${owner}, "syntax"),`;
  }
  const one = (name, map) => {
    const body = Object.entries(map)
      .map(([k, t]) => `          ${JSON.stringify(k)}: ${lit(tone[t])}, // ${t}`).join("\n");
    return `      ${name}: Object.freeze({\n` +
      `        carries: ${name === "syntax" ? '"meaning"' : '"decoration"'},\n` +
      `        monochrome: ${name === "syntax" ? '"typographic"' : '"foreground"'},\n` +
      `        slots: Object.freeze({\n${body}\n        }),\n` +
      (name === "syntax" ? `        classes: classesOf(${lender}, "syntax"),\n` : "") +
      `      }),`;
  };
  return `      // Derived from this theme's own registry tones — see SYNTAX_FROM_TONE.\n` +
    one("categorical", CATEGORICAL_FROM_TONE) + "\n" + one("syntax", SYNTAX_FROM_TONE);
}

/**
 * The ten hues in §093's order, three tiers each (C10 I53).
 *
 * **Thrown on rather than defaulted**, in both directions: a hue the registry
 * orders but this theme does not carry, and a tier missing from one it does.
 * A hue with two of its three tiers is the failure the ink-on-band rule exists
 * to prevent — a band painted with a guessed ink — and it would project as a
 * `hues` record that looks complete to every reader but the one that needs the
 * missing tier.
 */
function huesBlock(themeId, hues) {
  const names = Object.keys(hues);
  const missing = HUE_ORDER.filter((h) => !names.includes(h));
  const extra = names.filter((h) => !HUE_ORDER.includes(h));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${themeId}: hues ${JSON.stringify(missing)} missing, ${JSON.stringify(extra)} unordered`);
  }
  const body = HUE_ORDER.map((h) => {
    for (const tier of ["ink", "ground", "on"]) {
      if (typeof hues[h][tier] !== "string") throw new Error(`${themeId}: hue ${h} has no ${tier}`);
    }
    return `      ${JSON.stringify(h)}: Object.freeze({ ink: ${lit(hues[h].ink)}, ground: ${lit(hues[h].ground)}, on: ${lit(hues[h].on)} }),`;
  }).join("\n");
  return `\n    hues: Object.freeze({\n${body}\n    }),`;
}

/**
 * The hue's INK tier as a palette, so the one resolver every block goes through
 * can name a hue (C10 I55, §070).
 *
 * **Emitted from the same `hues` record rather than collected a second time**,
 * which is the whole lesson of I53: two collectors for one fact is how the fact
 * ends up with two values. T2.56 asserts the two agree in the shipped file, so
 * the single source survives a hand edit as well as a regeneration.
 *
 * **`decoration`, and §070 settles it in its own first line**: *the tones mean
 * something; this is you choosing what your terminal looks like*, and *chrome
 * only — a painted label is furniture*. So the palette carries no meaning, and
 * `monochrome: "foreground"` is the honest 1-bit answer: decoration may degrade
 * to nothing, where a meaning palette would owe a typographic class per slot.
 */
function huePalette(hues) {
  const body = HUE_ORDER.map((h) => `          ${JSON.stringify(h)}: ${lit(hues[h].ink)},`).join("\n");
  return `\n      hue: Object.freeze({\n` +
    `        carries: "decoration",\n` +
    `        monochrome: "foreground",\n` +
    `        slots: Object.freeze({\n${body}\n        }),\n` +
    `      }),`;
}

const slots = (record) => Object.entries(record)
  .map(([k, v]) => `      ${JSON.stringify(k)}: ${lit(v)},`).join("\n");

const body = themes.map((theme) => {
  const { tone, surfaces } = collected.get(theme.id);
  const variant = LIGHT_THEMES.has(theme.id) ? "light" : "dark";
  const lender = variant === "light" ? "LIGHT" : "DARK";
  return `  ${JSON.stringify(theme.id)}: Object.freeze({
    name: ${lit(theme.label)},
    variant: ${lit(variant)},
    background: ${lit(PAINTS.has(theme.id) ? "surface" : "terminal")},${PROMISES.has(theme.id) ? `\n    floor: ${PROMISES.get(theme.id)},` : ""}
    surfaces: Object.freeze({
${slots(surfaces)}
    }),
    palettes: Object.freeze({
      tone: Object.freeze({
        carries: "meaning",
        monochrome: "typographic",
        slots: Object.freeze({
${slots(tone).replace(/^ {6}/gm, "          ")}
        }),
        // The 1-bit typographic fallback per slot (C10 I15). The registry carries
        // no such record, and a tone that resolves to nothing at 1-bit carries
        // nothing — so ${lender}'s classes stand, as with the palettes below.
        classes: classesOf(${lender}, "tone"),
      }),
${derived(theme.id, tone, lender)}
      spectrum: lend(${lender}, "spectrum"),${huePalette(collected.get(theme.id).hues)}
    }),
    fourBit: ${fourBitLender(theme.id, variant)}.fourBit,${bandInkBlock(collected.get(theme.id).bandInk)}${composedBlock(solveDiffGrounds(theme.id, tone, surfaces, withDerived(theme.id, collected.get(theme.id).composed)), MEASURED.get(theme.id))}${huesBlock(theme.id, collected.get(theme.id).hues)}
  }),`;
}).join("\n");

const source = `// Generated by \`tools/theme/from-registry.mjs\` — do not edit by hand.
// Regenerate with \`make themes\` after the design registry changes.
//
// ${themes.length} themes, projected from \`docs/design/language/calcium-registry.json\`.
// The registry is normative for these values (R-THM-001); this file is a projection
// of it, and a hand edit here is a value the design does not hold.

import { DARK } from "./tokens-dark.js";
import { HIGH_CONTRAST } from "./tokens-high-contrast.js";
import { LIGHT } from "./tokens-light.js";
import type { MonoClass, PaletteSpec, ThemeSet, ThemeTokens } from "./types.js";

/**
 * A lender's palette, by name. \`palettes\` is an open record, so a bare lookup is
 * \`| undefined\` — and a missing palette here is a build-time fact worth throwing
 * on rather than a value worth defaulting, since the theme it would produce is the
 * one C10 I30 exists to refuse.
 */
const lend = (tokens: ThemeTokens, family: string): PaletteSpec => {
  const palette = tokens.palettes[family];
  if (palette === undefined) {
    throw new Error(\`\${tokens.name} declares no \${family} palette to lend\`);
  }
  return palette;
};

/**
 * A lender's per-slot typographic classes (C10 I15). Separate from \`lend\` because
 * \`classes\` is optional under \`exactOptionalPropertyTypes\`, so passing the lookup
 * through unchecked would offer \`undefined\` to a property that does not accept it —
 * and a "meaning" palette without classes carries nothing at 1-bit, which is a
 * theme worth refusing at build time rather than shipping.
 */
const classesOf = (tokens: ThemeTokens, family: string): Readonly<Record<string, MonoClass>> => {
  const classes = lend(tokens, family).classes;
  if (classes === undefined) {
    throw new Error(\`\${tokens.name}'s \${family} palette declares no classes to lend\`);
  }
  return classes;
};

export const REGISTRY_THEMES: ThemeSet = Object.freeze({
${body}
});
`;

writeFileSync(out, source);
console.log(`wrote ${themes.length} themes · ${source.length} bytes`);
for (const t of themes) {
  const { tone, surfaces } = collected.get(t.id);
  console.log(`  ${t.id.padEnd(9)} ${Object.keys(tone).length} tones · ` +
    `${Object.keys(surfaces).length} surfaces · ` +
    `${PAINTS.has(t.id) ? "paints" : "inherits"} its ground`);
}
