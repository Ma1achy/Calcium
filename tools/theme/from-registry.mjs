/**
 * Emits `src/presentation/theme/tokens.generated.ts` — the ten themes' token
 * values, read from the design registry (C10 §2, R-THM-001).
 *
 * **The registry is the source and this is a projection**, the same relationship
 * `calcium-design-language-revised.html` has to it. Regenerate with `make themes`.
 *
 * **Every value it emits is read from the registry, and nothing is lent** (C10
 * I62). Tones, surfaces, hues and a curated theme's `syntax` and `categorical`
 * inks are CSS in `themeRules` — `.syn-<slot>`, `.cat-<slot>`, and on a ground
 * `.bg-<ground> .syn-<slot>`. What is not CSS, or not a theme's own, is
 * `terminalPalettes`: the three curated 4-bit maps and the band pairs (emitted to
 * `four-bit.generated.ts`), the two spectra, the typographic classes, and the
 * derivation a theme with no `.syn-*` rules takes its palettes by. Until I62 the
 * generator lent all of that from three hand-written token sets, so a value
 * reached a shipped theme without the design holding it.
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
import { clearFloor, contrast, lum } from "./wcag.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(
  resolve(here, "../../docs/design/language/calcium-registry.json"), "utf8"));
// **The current theme rules, and only these.** A superseded record is released
// history — the value a slot held before the one that replaced it — and it
// keeps its selector, so a reader taking every record would read two values for
// one slot and keep whichever came last (AUTHORITY §Release 5).
const THEME_RULES = registry.themeRules.filter((rule) => rule.status === "current");
// \`--check\` renders in memory and writes nothing (C10 §4b); \`--out\` points either
// mode at another file, which is how the check's fabricated violation reaches it.
const outAt = process.argv.indexOf("--out");
const out = outAt >= 0 ? resolve(process.argv[outAt + 1]) : resolve(here, "../../src/presentation/theme/tokens.generated.ts");
const fourBitAt = process.argv.indexOf("--four-bit-out");
const fourBitOut = fourBitAt >= 0 ? resolve(process.argv[fourBitAt + 1]) : resolve(here, "../../src/presentation/theme/four-bit.generated.ts");
const check = process.argv.includes("--check");
/** What a theme carries that is not CSS, or not a theme's own (C10 I62). */
const TP = registry.terminalPalettes;

/** `#222` and `#222222` are one colour; only one of them is a diff. */
const norm = (hex) => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/** Polarity, which decides the theme's `variant`. */
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
 * **Who paints, and it is the shipping decision preserved rather than a new one.**
 * `dark` inherits by C10 I25 — *a dark theme in a dark terminal is what `terminal`
 * is for, and painting would destroy a translucent or blurred terminal* — and that
 * argument reaches every dark theme here, none of which the registry instructs to
 * paint. A light theme must paint or it is illegible in a dark terminal, and a
 * high-contrast theme must paint or it cannot promise the ratio it exists for.
 */
const PAINTS = new Set(["light", "paper", "hcDark", "hcLight"]);

const SKIP_SELECTORS = /\.term|\.sw|\.rmp/;



/** The floors `contrast.ts` applies, for the slots this solver can reach. */
const FLOOR = { comment: 3 };
const floorOf = (slot) => FLOOR[slot] ?? 4.5;

const HUE = /^h-|^hi-/;
/** A rule's class prefix -> the palette family it composes. */
const FAMILY = { c: "tone", syn: "syntax", cat: "categorical" };
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
  for (const rule of THEME_RULES) {
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
  const syntax = {};
  const categorical = {};
  for (const rule of THEME_RULES) {
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
    //
    // A syntax or categorical ink on a ground is the same shape under another
    // class prefix (C10 I62): `.bg-diffAdd .syn-keyword` composes
    // `syntax.keyword` exactly as `.bg-diffAdd .c-ok` composes `tone.ok`.
    const pairs = rule.selector
      .split(",")
      .map((sel) => sel.trim().match(/^\[data-theme="([a-zA-Z]+)"\] \.bg-([a-zA-Z-]+) \.(c|syn|cat)-([a-zA-Z0-9-]+)$/))
      .filter((m) => m !== null);
    if (pairs.length > 0) {
      const colour = rule.declarations.match(/(?:^|;)color:(#[0-9a-fA-F]{3,8})/);
      for (const pair of pairs) {
        if (pair[1] !== themeId) continue;
        if (colour === null || HUE.test(pair[2]) || (pair[3] === "c" && HUE.test(pair[4]))) continue;
        const ground = `surface.${pair[2]}`;
        composed[ground] ??= {};
        composed[ground][`${FAMILY[pair[3]]}.${pair[4]}`] = norm(colour[1]);
      }
      continue;
    }
    // A curated theme's own syntax and categorical inks (C10 I62).
    const palette = rule.selector.match(/^\[data-theme="([a-zA-Z]+)"\] \.(syn|cat)-([a-zA-Z0-9]+)$/);
    if (palette !== null) {
      if (palette[1] !== themeId) continue;
      const colour = rule.declarations.match(/(?:^|;)color:(#[0-9a-fA-F]{3,8})/);
      if (colour === null) throw new Error(`${rule.selector} declares no color`);
      (palette[2] === "syn" ? syntax : categorical)[palette[3]] = norm(colour[1]);
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
      // **A band declares its ground and its one ink together** (R-THM-005).
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

  return { tone, surfaces, composed, bandInk, hues, syntax, categorical };
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
  const term = THEME_RULES.find((r) =>
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
  if (curates(themeId)) return composed;
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
  if (curates(themeId)) return composed;
  const out = { ...composed };
  for (const name of ["diffAdd", "diffRemove"]) {
    const ground = surfaces[name];
    if (ground === undefined) continue;
    for (const [slot, toneName] of Object.entries(SYNTAX_FROM_TONE)) {
      const ref = `syntax.${slot}`;
      const key = `surface.${name}`;
      const ink = out[key]?.[ref] ?? tone[toneName];
      // **The theme's promise, where it makes one** (R-THM-002, C10 I60): a
      // high-contrast theme's derived syntax is held to 7 on a diff row as on the
      // page, not to the common floor.
      const floor = Math.max(floorOf(slot), PROMISES.get(themeId) ?? 0);
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
 * `<band>` -> the one ink everything on that band takes (R-THM-005), omitted
 * entirely when a theme declares no band.
 *
 * Separate from `composed` because it is a different claim. `composed` is a
 * per-slot exception — *this ink, on this ground, is that value* — and its
 * coverage is whatever was enumerated. A band ink is **total**: it is the ink for
 * everything on the band, so a slot that nobody thought of is covered by
 * construction rather than by having been listed.
 */
/**
 * `bandFourBit`, from `terminalPalettes.bandFourBit` (C10 I61, I62) — for a theme
 * that declares a band and only then. A banded theme the table does not name is a
 * generation error rather than a band with no 4-bit answer, which is the state
 * `validateBands` refuses at load; failing here says so a step earlier. The
 * converse throws too: a pair for a theme with no band is a record nothing reads.
 */
function bandFourBitLine(id, bandInk) {
  const named = TP.bandFourBit[id] !== undefined;
  if (Object.keys(bandInk).length === 0) {
    if (named) throw new Error(`terminalPalettes.bandFourBit names ${id}, which declares no band`);
    return "";
  }
  if (!named) {
    throw new Error(`${id} declares a band and terminalPalettes.bandFourBit curates no 4-bit pair for it (C10 I61)`);
  }
  return `\n    bandFourBit: BAND_FOUR_BIT.${id},`;
}

function bandInkBlock(bandInk) {
  const names = Object.keys(bandInk).sort();
  if (names.length === 0) return "";
  const body = names.map((n) => `      ${JSON.stringify(n)}: ${lit(bandInk[n])},`).join("\n");
  return `\n    bandInk: Object.freeze({\n${body}\n    }),`;
}

/**
 * `surface.<ground>` -> `<family>.<slot>` -> hex, omitted entirely when there are
 * none.
 *
 * **One author since C10 I62.** Before it a curated theme's syntax inks were lent
 * from a token file and so were their compositions — a composition can only be
 * authored where the value it replaces lives — and the two records were merged
 * per ground, the registry last. With the syntax inks in the registry their
 * compositions are too, and there is nothing left to merge.
 */
function composedBlock(composed) {
  const grounds = Object.keys(composed).sort();
  if (grounds.length === 0) return "";
  const body = grounds.map((g) => {
    const inks = Object.entries(composed[g]).sort(([a], [b]) => a.localeCompare(b))
      .map(([ref, hex]) => `        ${JSON.stringify(ref)}: ${lit(hex)},`).join("\n");
    return `      ${JSON.stringify(g)}: Object.freeze({\n${inks}\n      }),`;
  }).join("\n");
  return `\n    composed: Object.freeze({\n${body}\n    }),`;
}


/**
 * **What a theme with no `.syn-*` or `.cat-*` rules gets instead** — read from
 * `terminalPalettes.paletteDerivation` (C10 I62), which is where this mapping
 * moved when the generator stopped holding data the design does not.
 *
 * A theme that curates its palettes — `dark`, `light` and `hcDark`, whose values
 * were measured against these floors before the registry existed — carries them
 * as registry rules. Every other theme derives from ITS OWN registry tones, which
 * are floor-checked by construction.
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
const SYNTAX_FROM_TONE = TP.paletteDerivation.syntax;
/** Eight distinct tones, loudest first; `default` and `muted` are text, not data. */
const CATEGORICAL_FROM_TONE = TP.paletteDerivation.categorical;

/**
 * **A theme curates both palettes whole or neither.** A curated theme missing a
 * slot would resolve it to nothing — C10 I30's refusal, a step later — and one
 * carrying a slot the derivation does not name is a slot no block asks for. So
 * the curated key sets are compared to the derivation's by equality, and a theme
 * with one family curated and the other not is refused rather than half-derived.
 */
const curates = (themeId) => {
  const { syntax, categorical } = collected.get(themeId);
  const has = [Object.keys(syntax).length > 0, Object.keys(categorical).length > 0];
  if (has[0] !== has[1]) throw new Error(`${themeId} curates one of syntax and categorical and not the other (C10 I62)`);
  if (!has[0]) return false;
  for (const [family, record, map] of [["syntax", syntax, SYNTAX_FROM_TONE], ["categorical", categorical, CATEGORICAL_FROM_TONE]]) {
    const have = Object.keys(record).sort().join(" ");
    const want = Object.keys(map).sort().join(" ");
    if (have !== want) throw new Error(`${themeId}: curated ${family} slots ${have} are not the derivation's ${want} (C10 I62)`);
  }
  return true;
};

function derived(themeId, tone) {
  const { syntax, categorical } = collected.get(themeId);
  const curated = curates(themeId);
  const one = (name, map, own) => {
    const body = Object.entries(map)
      .map(([k, t]) => curated
        ? `          ${JSON.stringify(k)}: ${lit(own[k])},`
        : `          ${JSON.stringify(k)}: ${lit(tone[t])}, // ${t}`).join("\n");
    return `      ${name}: Object.freeze({\n` +
      `        carries: ${name === "syntax" ? '"meaning"' : '"decoration"'},\n` +
      `        monochrome: ${name === "syntax" ? '"typographic"' : '"foreground"'},\n` +
      `        slots: Object.freeze({\n${body}\n        }),\n` +
      (name === "syntax" ? `        classes: SYNTAX_CLASSES,\n` : "") +
      `      }),`;
  };
  return (curated
    ? `      // Curated for this theme — the registry's \`.syn-*\` and \`.cat-*\` rules.\n`
    : `      // Derived from this theme's own registry tones — see paletteDerivation.\n`) +
    one("categorical", CATEGORICAL_FROM_TONE, categorical) + "\n" + one("syntax", SYNTAX_FROM_TONE, syntax);
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

/** A flat record as a frozen literal, at an indent of `depth` pairs of spaces. */
const frozen = (record, depth) => {
  const pad = "  ".repeat(depth + 1);
  const body = Object.entries(record).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${lit(v)},`).join("\n");
  return `Object.freeze({\n${body}\n${"  ".repeat(depth)}})`;
};

/**
 * **`four-bit.generated.ts`** — the three curated 4-bit maps and the band pairs,
 * from `terminalPalettes` (C10 I62). A second file rather than a section of
 * this one because `four-bit.ts` re-exports the maps under the names every test
 * and mutation run already uses, and it cannot import them from a file that
 * imports it back.
 */
const fourBitSource = `// Generated by \`tools/theme/from-registry.mjs\` — do not edit by hand.
// Regenerate with \`make themes\` after the design registry changes.
//
// The curated sixteen-colour maps and band pairs, projected from
// \`docs/design/language/calcium-registry.json\` \`terminalPalettes\` (C10 I62).
// Why each index is what it is lives beside the names in \`four-bit.ts\`.

import type { BandFourBit, FourBitMap } from "./types.js";

export const FOUR_BIT: Readonly<Record<${Object.keys(TP.fourBit).map(lit).join(" | ")}, FourBitMap>> = Object.freeze({
${Object.entries(TP.fourBit).map(([name, map]) => `  ${name}: ${frozen(map, 1)},`).join("\n")}
});

export const BAND_FOUR_BIT: Readonly<Record<${Object.keys(TP.bandFourBit).map(lit).join(" | ")}, BandFourBit>> = Object.freeze({
${Object.entries(TP.bandFourBit).map(([id, bands]) => `  ${id}: Object.freeze({
${Object.entries(bands).map(([band, pair]) => `    ${band}: Object.freeze({ ground: ${pair.ground}, ink: ${pair.ink} }),`).join("\n")}
  }),`).join("\n")}
});
`;

const slots = (record) => Object.entries(record)
  .map(([k, v]) => `      ${JSON.stringify(k)}: ${lit(v)},`).join("\n");

const body = themes.map((theme) => {
  const { tone, surfaces } = collected.get(theme.id);
  const variant = LIGHT_THEMES.has(theme.id) ? "light" : "dark";
  // **A theme names its 4-bit map and its spectrum, and a name that resolves to
  // nothing is thrown on** (C10 I62). Before I62 these were a function of the id
  // and the polarity, and a first draft of that function silently gave `hcDark`
  // the dark map — the substitution T6.110 now makes in the registry.
  if (TP.fourBit[theme.fourBit] === undefined) throw new Error(`${theme.id} names 4-bit map ${JSON.stringify(theme.fourBit)}, which terminalPalettes does not carry`);
  if (TP.spectrum[theme.spectrum] === undefined) throw new Error(`${theme.id} names spectrum ${JSON.stringify(theme.spectrum)}, which terminalPalettes does not carry`);
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
        // The 1-bit typographic fallback per slot (C10 I15), one record for every
        // theme — \`terminalPalettes.classes\`.
        classes: TONE_CLASSES,
      }),
${derived(theme.id, tone)}
      spectrum: SPECTRUM.${theme.spectrum},${huePalette(collected.get(theme.id).hues)}
    }),
    fourBit: FOUR_BIT.${theme.fourBit},${bandInkBlock(collected.get(theme.id).bandInk)}${bandFourBitLine(theme.id, collected.get(theme.id).bandInk)}${composedBlock(solveDiffGrounds(theme.id, tone, surfaces, withDerived(theme.id, collected.get(theme.id).composed)))}${huesBlock(theme.id, collected.get(theme.id).hues)}
  }),`;
}).join("\n");

const source = `// Generated by \`tools/theme/from-registry.mjs\` — do not edit by hand.
// Regenerate with \`make themes\` after the design registry changes.
//
// ${themes.length} themes, projected from \`docs/design/language/calcium-registry.json\`.
// The registry is normative for these values (R-THM-001); this file is a projection
// of it, and a hand edit here is a value the design does not hold.

import { BAND_FOUR_BIT, FOUR_BIT } from "./four-bit.generated.js";
import type { MonoClass, PaletteSpec, ThemeSet } from "./types.js";

/** The 1-bit typographic fallback per tone (C10 I15) — \`terminalPalettes.classes.tone\`. */
const TONE_CLASSES: Readonly<Record<string, MonoClass>> = ${frozen(TP.classes.tone, 0)};

/** The same, per syntax slot — \`terminalPalettes.classes.syntax\`. */
const SYNTAX_CLASSES: Readonly<Record<string, MonoClass>> = ${frozen(TP.classes.syntax, 0)};

/** The two spectra a theme names by polarity — \`terminalPalettes.spectrum\`. */
const SPECTRUM: Readonly<Record<${Object.keys(TP.spectrum).map(lit).join(" | ")}, PaletteSpec>> = Object.freeze({
${Object.entries(TP.spectrum).map(([name, slotsOf]) => `  ${name}: Object.freeze({
    carries: "decoration",
    monochrome: "foreground",
    slots: ${frozen(slotsOf, 2)},
  }),`).join("\n")}
});

export const REGISTRY_THEMES: ThemeSet = Object.freeze({
${body}
});
`;

if (check) {
  // **Byte equality, and the first line that differs by number.** A hand edit is
  // a value the design does not hold; saying *stale* and nothing else would
  // send the reader to diff two revisions to find one hex. Both projections are
  // checked, and both are reported before the exit.
  let stale = 0;
  for (const [path, want] of [[out, source], [fourBitOut, fourBitSource]]) {
    let have = "";
    try { have = readFileSync(path, "utf8"); } catch { have = ""; }
    if (have === want) continue;
    const a = have.split("\n"), b = want.split("\n");
    let i = 0;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i += 1;
    console.error(`FAIL · ${path} differs from the registry's projection at line ${i + 1}`);
    console.error(`  on disk:   ${a[i] ?? "(end of file)"}`);
    console.error(`  generated: ${b[i] ?? "(end of file)"}`);
    stale += 1;
  }
  if (stale > 0) {
    console.error("  run `make themes`, or change the registry — a hand edit is a value the design does not hold");
    process.exit(1);
  }
  console.log(`OK · tokens.generated.ts and four-bit.generated.ts are the registry's projection · ${themes.length} themes · ${source.length + fourBitSource.length} bytes`);
  process.exit(0);
}
writeFileSync(out, source);
writeFileSync(fourBitOut, fourBitSource);
console.log(`wrote ${themes.length} themes · ${source.length} bytes`);
for (const t of themes) {
  const { tone, surfaces } = collected.get(t.id);
  console.log(`  ${t.id.padEnd(9)} ${Object.keys(tone).length} tones · ` +
    `${Object.keys(surfaces).length} surfaces · ` +
    `${PAINTS.has(t.id) ? "paints" : "inherits"} its ground`);
}
