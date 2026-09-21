/**
 * Two normative registry edits, both in service of one commitment: **the two
 * high-contrast themes keep 7 : 1, and the registry is where that is written.**
 *
 * **The design labelled two themes `HC` and stated no ratio.** 7 : 1 was the
 * repository's claim — roadmap 24, asserted by T2.24 and nowhere expressible,
 * because `FLOORS` names the minimum *every* theme must clear and a theme that
 * promises more had no way to declare it. Measured against the ported themes,
 * `hcDark` kept the promise everywhere and `hcLight` broke it on `bgElev` for
 * eight refs at 6.55–6.96: the palette was authored against `bg` (pure white)
 * and the elevated ground was never re-checked. The same class as `nord`'s diff
 * surfaces — a pair the design did not measure.
 *
 * **1 · Four composed inks on `hcLight`'s `bgElev`**, using R-THM-001's own
 * composition mechanism rather than moving the ground. Lightening `bgElev` from
 * `#ebebeb` to `#f5f5f5` would clear 7 : 1 with one declaration, and would shrink
 * the elevation step against `#ffffff` from 9% lightness to 4% — on the theme
 * whose point is that surfaces are tellable apart. Composition costs four
 * declarations and keeps the step.
 *
 * Four, not eight, because `syntax.comment` `syntax.key` `syntax.operator` and
 * `syntax.string` are derived from `tone.muted` `tone.error` `tone.identifier`
 * and `tone.ok`, and a derived slot inherits its tone's composition.
 *
 * **Darkened along the RGB ray, which preserves the hue exactly** — every ink
 * keeps the hue it had (0°, 120°, 183°, and `muted` is achromatic before and
 * after) and moves only in value, by the least that clears 7 : 1. Asserted
 * afterwards: ten distinct tones on `bgElev`, the closest pair 58 units apart in
 * RGB, and `muted` still quieter than `default` — 7.09 against 17.62.
 *
 * **2 · `R-THM-002` registers the promise**, so it is a design commitment rather
 * than a repository-only claim, and `validateHighContrast` enforces it for both
 * themes from the `floor` a theme now declares.
 *
 * **Every replacement asserts it matched** (CLAUDE.md): this exits non-zero if a
 * declaration is already present, if a value is not what it expects, or if the
 * result does not clear 7 : 1 with ten distinct tones.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, "../../docs/design/language/calcium-registry.json");
const registry = JSON.parse(readFileSync(path, "utf8"));

let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };

/** slot → [the flat ink it replaces on `bgElev`, the composed ink]. */
const COMPOSE = {
  muted: ["#525252", "#4d4d4d"],
  ok: ["#005c00", "#005b00"],
  error: ["#a80000", "#a10000"],
  identifier: ["#00595e", "#00575b"],
};

const GROUND = "bgElev";
const THEME = "hcLight";

// --- 1 · the composed inks ---------------------------------------------------
const flatOf = (slot) => {
  const r = registry.themeRules.find((x) => x.selector === `[data-theme="${THEME}"] .c-${slot}`);
  return r?.declarations.match(/color:(#[0-9a-fA-F]{3,8})/)?.[1]?.toLowerCase();
};

const added = [];
for (const [slot, [want, ink]] of Object.entries(COMPOSE)) {
  const selector = `[data-theme="${THEME}"] .bg-${GROUND} .c-${slot},[data-theme="${THEME}"] .c-${slot}.bg-${GROUND}`;
  if (registry.themeRules.some((x) => x.selector === selector)) fail(`${slot}: already composed on ${GROUND}`);
  const flat = flatOf(slot);
  if (flat !== want) fail(`${slot}: flat ink is ${flat}, expected ${want} — the palette moved under this script`);
  added.push({ selector, declarations: `color:${ink}`, status: "current", ruleIds: ["R-THM-001"] });
}

// --- 2 · the rule ------------------------------------------------------------
const RULE = {
  id: "R-THM-002",
  title: "A high-contrast theme keeps 7 : 1, and says so",
  text: "The two high-contrast themes hold every meaning ink to 7 : 1 against every surface they paint text on, not to the 4.5 : 1 every other theme meets. A theme that promises more than the common floor declares the floor it promises, because a promise no check can read is a label; hcDark and hcLight declare 7 and are held to it at load, on the same path and by the same code as every other floor. Where a ground costs an ink its margin, the theme composes a darker ink for that ground rather than moving the ground — an elevated surface a reader cannot tell from the page is the failure the theme exists to prevent.",
  status: "current",
  sectionKey: "current-contract",
  tags: ["contract"],
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
RULE.contentDigest = ruleContentDigest(RULE);
if (registry.rules.some((r) => r.id === RULE.id)) fail(`${RULE.id} already exists — this script has run`);
if (!registry.sections.some((s) => s.key === RULE.sectionKey)) fail(`section ${RULE.sectionKey} missing`);

if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

registry.themeRules.push(...added);
registry.rules.push(RULE);

const asciiOnly = (text) => text.replace(/[-￿]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
const serialised = `${asciiOnly(JSON.stringify(registry, null, 1))}\n`;
if (!serialised.startsWith('{\n "meta": {\n  "name"')) {
  console.error("FAIL · serialisation does not match the registry's shape");
  process.exit(1);
}
writeFileSync(path, serialised);

console.log(`composed ${added.length} inks on ${THEME}.${GROUND}, registered ${RULE.id}`);
for (const [slot, [from, to]] of Object.entries(COMPOSE)) console.log(`  ${slot.padEnd(11)} ${from} -> ${to}`);
