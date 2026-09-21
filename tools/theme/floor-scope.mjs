/**
 * `R-THM-004` — a normative registry edit registering the rule that would have
 * caught this class all three times.
 *
 * **The class.** A palette is authored against the page; a second ground is added
 * later; the inks are never re-measured against it, and nothing reports it because
 * the gate's scope is a *list* of grounds rather than every ground the theme paints
 * text on. It was `nord`'s diff surfaces, then `hcLight`'s `bgElev`, then
 * `focusGround` across the whole set — seven inks short in two themes, and sixteen
 * of nineteen in each high-contrast theme.
 *
 * Every instance was found by widening the scope, never by a failure. So the scope
 * is the rule, and `textSurfaces` carrying `focusGround` in the same commit is the
 * rule executed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, "../../docs/design/language/calcium-registry.json");
const registry = JSON.parse(readFileSync(path, "utf8"));

const RULE = {
  id: "R-THM-004",
  title: "A floor's scope is every ground the theme paints text on",
  text: "A contrast floor is a claim about a pair, so its scope is every ground a theme paints text on and never a list of grounds somebody wrote down. The focus ground is one of them: a focused region washes its whole extent, bodies included, so a code body's palette lands there exactly as the meaning tones do and is held to the same floors there. Where a ground costs an ink its margin, the theme composes a nearer ink for that ground, keeping the hue and moving only in value by the least that clears; where the palette in question is lent rather than carried here, the composition is authored beside the values it replaces and this document stays normative for what it holds. Three palettes were authored against the page and measured against it alone, and each was found by widening the scope rather than by any failure, which is why the scope is stated as a rule and not left to the list.",
  status: "current",
  sectionKey: "current-contract",
  tags: ["contract"],
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
RULE.contentDigest = ruleContentDigest(RULE);

if (registry.rules.some((r) => r.id === RULE.id)) {
  console.error(`FAIL · ${RULE.id} already exists — this script has run`);
  process.exit(1);
}
if (!registry.sections.some((s) => s.key === RULE.sectionKey)) {
  console.error(`FAIL · section ${RULE.sectionKey} missing`);
  process.exit(1);
}

registry.rules.push(RULE);

const asciiOnly = (text) => text.replace(/[^\x00-\x7f]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
const serialised = `${asciiOnly(JSON.stringify(registry, null, 1))}\n`;
if (!serialised.startsWith('{\n "meta": {\n  "name"')) {
  console.error("FAIL · serialisation does not match the registry's shape");
  process.exit(1);
}
writeFileSync(path, serialised);
console.log(`registered ${RULE.id}`);
