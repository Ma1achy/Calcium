/**
 * The high-contrast themes take focus and selection as **bands** — a normative
 * registry edit, and the answer to a contradiction the design could not hold.
 *
 * **What was wrong.** `R-THM-002` promises the two high-contrast themes 7 : 1 on
 * every surface they paint text on. Measured, `hcDark`'s `focusGround` `#2e2e2e`
 * fails it for 16 of 19 meaning inks — and cannot be made to pass, because the
 * **brightest possible red reaches 3.40 : 1** on that ground. No composed ink
 * exists. `selection` fails identically in both themes, and in `hcLight` the two
 * grounds sat at L 0.5841 and L 0.5780 — **1.01 : 1**, separated by hue alone, on
 * the theme whose reader may not be reading hue.
 *
 * **The remedy, ruled.** Each ground becomes a band in the sense Windows High
 * Contrast means it: one clearly distinct colour, and **one ink for everything on
 * it**, chosen to clear 7 : 1. The promise then holds by construction rather than
 * by nineteen separate compositions that a twentieth slot can fall through — which
 * is how this defect happened. `hcDark`'s selection already had a grouped
 * composition covering nine slots, and the nine were not the nineteen.
 *
 * So the ink is a property of the **band**, not an enumeration over slots: the
 * `.bg-<band>` rule carries `color:` beside `background:`, and everything drawn on
 * that band inherits it. A slot nobody listed cannot fall through, because there
 * is no list.
 *
 * **Tone is spent on that row**, which is the cost and it is paid in the open:
 * state moves to the glyph and the outcome word, which is the same predicate the
 * 1-bit rung uses — *does tone carry here* — asked per cell instead of per
 * terminal. `▸` still marks focus.
 *
 * **The five constraints, and which bind.** Recorded in the rule itself rather
 * than only in the values, so the gate checks each as stated:
 *
 * - every ink ≥ 7 : 1 on its band — the promise
 * - the selection band ≥ 3 : 1 from `bg` — the ground is selection's **only**
 *   carrier (R-SEL-006: selection owns the ground, focus keeps its mark)
 * - the focus band ≥ 3 : 1 from the selection band — they can be adjacent rows
 * - the focus band ≥ 2 : 1 from `bg` — relaxed, because `▸` in the focus ink
 *   already carries focus at ≥ 7 : 1 and the band need only read as an extent
 *
 * **The consequence, which inverts the obvious layout.** Selection needs the
 * stronger separation from `bg` and focus the weaker, so **focus is the band
 * nearer `bg` and selection the band further from it** — in both themes, falling
 * straight out of the constraints rather than chosen. On `hcDark` that makes
 * selection the bright one; on `hcLight`, the dark one.
 *
 * **Every replacement asserts it matched** (CLAUDE.md): this exits non-zero if a
 * value is not what it expects, if a band rule already carries an ink, or if any
 * of the five constraints fails on the values it is about to write.
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

/** theme → band → [the ground it replaces, the new ground, the band's one ink]. */
const BANDS = {
  hcDark: {
    focusGround: ["#2e2e2e", "#234f92", "#ffffff"],
    selection: ["#00405c", "#efc51c", "#000000"],
  },
  hcLight: {
    focusGround: ["#c9c9c9", "#7face3", "#000000"],
    selection: ["#a8ccf0", "#46176d", "#ffffff"],
  },
};

const BG = { hcDark: "#000", hcLight: "#ffffff" };

// --- the arithmetic, run before anything is written ---------------------------
const lum = (h) => {
  const x = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  const c = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const [theme, bands] of Object.entries(BANDS)) {
  const bg = BG[theme];
  const [, focus, focusInk] = bands.focusGround;
  const [, sel, selInk] = bands.selection;
  const checks = [
    [`${theme}: the focus ink on its band`, ratio(focusInk, focus), 7],
    [`${theme}: the selection ink on its band`, ratio(selInk, sel), 7],
    [`${theme}: the selection band against bg`, ratio(sel, bg), 3],
    [`${theme}: the focus band against the selection band`, ratio(focus, sel), 3],
    [`${theme}: the focus band against bg`, ratio(focus, bg), 2],
  ];
  for (const [name, got, need] of checks) {
    if (got < need) fail(`${name}: ${got.toFixed(3)} < ${need}`);
  }
  console.log(`${theme}`);
  for (const [name, got, need] of checks) console.log(`  ${got >= need ? "ok" : "FAIL"}  ${name.padEnd(52)} ${got.toFixed(3)} >= ${need}`);
}

// --- the edit -----------------------------------------------------------------
const bandRule = (theme, band) =>
  registry.themeRules.find((x) => x.selector === `[data-theme="${theme}"] .bg-${band}`);

for (const [theme, bands] of Object.entries(BANDS)) {
  for (const [band, [want]] of Object.entries(bands)) {
    const rule = bandRule(theme, band);
    if (rule === undefined) { fail(`${theme} .bg-${band}: no rule`); continue; }
    if (rule.declarations.includes("color:")) fail(`${theme} .bg-${band}: already carries an ink — this script has run`);
    const got = rule.declarations.match(/background:(#[0-9a-fA-F]{3,8})/)?.[1]?.toLowerCase();
    if (got !== want) fail(`${theme} .bg-${band}: ground is ${got}, expected ${want} — the palette moved under this script`);
  }
}

/**
 * The enumerated composition this replaces. Nine slots of nineteen, which is the
 * defect rather than a partial fix: the ten it omits fell through to flat inks and
 * broke the promise silently.
 */
const ENUMERATED = registry.themeRules.filter(
  (x) => x.selector.includes(".bg-selection .c-") && x.selector.includes('[data-theme="hcDark"]'),
);
if (ENUMERATED.length !== 1) fail(`expected one enumerated hcDark selection group, found ${ENUMERATED.length}`);

const RULE = {
  id: "R-THM-003",
  title: "A high-contrast theme takes focus and selection as bands",
  text: "In a high-contrast theme, focus and selection are bands rather than grounds an ink is composed against: the band declares one colour and one ink, and everything drawn on the band takes that ink, so the theme's ratio holds by construction and no slot can fall through a list. Tone is spent on a banded row, so state moves to the glyph and the outcome word, which is the one-bit rung's carrier asked per cell rather than per terminal; the focus mark persists on the band. Four contrasts bind and the gate checks each as stated: every ink keeps the theme's declared ratio against its own band; the selection band keeps 3 : 1 against the page, because the ground is selection's only carrier; the focus band keeps 3 : 1 against the selection band, because the two can be adjacent; and the focus band keeps only 2 : 1 against the page, because the focus mark already carries focus at the declared ratio and the band need only read as an extent. It follows that the focus band is the one nearer the page and the selection band the one further from it, which is a consequence of the constraints rather than a choice.",
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

if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

for (const [theme, bands] of Object.entries(BANDS)) {
  for (const [band, [, ground, ink]] of Object.entries(bands)) {
    const rule = bandRule(theme, band);
    rule.declarations = `background:${ground};color:${ink}`;
    rule.ruleIds = [...new Set([...(rule.ruleIds ?? []), "R-THM-003"])];
  }
}
registry.themeRules = registry.themeRules.filter((x) => !ENUMERATED.includes(x));
registry.rules.push(RULE);

const asciiOnly = (text) => text.replace(/[^\x00-\x7f]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
const serialised = `${asciiOnly(JSON.stringify(registry, null, 1))}\n`;
if (!serialised.startsWith('{\n "meta": {\n  "name"')) {
  console.error("FAIL · serialisation does not match the registry's shape");
  process.exit(1);
}
writeFileSync(path, serialised);

console.log(`\nwrote 4 bands, dropped the ${String(ENUMERATED.length)} enumerated group, registered ${RULE.id}`);
