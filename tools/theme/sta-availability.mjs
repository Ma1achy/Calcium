/**
 * `R-STA-004` — the precedence list acquires the rung it was missing.
 *
 * **The gap, found by composing two facts rather than by reading the list.**
 * `R-STA-002` ranks six facts: owner or armed, copy selection, focus, hover
 * preview, semantic extent, structural surface. The state product names **seven
 * axes** — pointer, selection, choice, disclosure, availability, freshness,
 * validity — of which the precedence list mentions two. So a composition drawn
 * from any of the other five has no ruling, and **disabled + error** is one that
 * occurs: availability wants a ground (a WELL, fixture 017) and validity wants
 * one (the error ground), and nothing ranks them.
 *
 * **The ruling.** Availability sits above semantic extent and below hover
 * preview. The reason is one the design already states rather than a preference:
 * `⇥` skips a disabled element, so it is not a thing you can act on, and a
 * ground saying *this went wrong* on a thing you cannot act on asks for an
 * action the element will refuse. Error keeps its mark and its word, which is
 * `R-COR-003`'s two carriers intact, so nothing is lost by the displacement.
 *
 * **Why this is an addition and not a supersession, which is a property of the
 * registry and not a preference.** The first draft superseded `R-STA-002` and
 * restated the whole list. Two gates refuse that together: `build-calcium.mjs`
 * requires every `supersededBy` to name a **current** rule, and `R-SEC-106` —
 * released — points at `R-STA-002`, so superseding it makes that released link
 * invalid; and `lint-immutable.mjs` forbids redirecting a released rule's
 * `supersededBy`, so the link cannot be moved to follow. **A released rule with
 * an inbound supersession link cannot be superseded**, and every amendment to
 * one is therefore additive. That is the same shape `R-THM-003` and `R-THM-004`
 * already take.
 *
 * **Every replacement asserts it matched** (CLAUDE.md): this exits non-zero if
 * `R-STA-002` is not the rule this one amends, if its text has moved, or if the
 * new id is taken.
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

const NEW_ID = "R-STA-004";
const old = registry.rules.find((r) => r.id === "R-STA-002");
if (old === undefined) fail("R-STA-002 is not in the registry");
else {
  if (old.status !== "current") fail(`R-STA-002 is ${old.status}, expected current`);
  const WANT = "A cell has one ground. Precedence is owner or armed, copy selection, focus, hover preview, semantic extent, then structural surface; displaced facts retain a mark, edge, or weight.";
  if (old.text !== WANT) fail("R-STA-002's text moved under this script");
}
if (registry.rules.some((r) => r.id === NEW_ID)) fail(`${NEW_ID} already exists — this script has run`);

const RULE = {
  id: NEW_ID,
  title: "Availability ranks above a semantic extent",
  text: "Availability takes its place in the one-ground precedence, above a semantic extent and below a hover preview, so that a disabled element keeps its well where an invalid one would otherwise take the error ground. The reason is that tab skips a disabled element, so it is not a thing anyone can act on, and a ground saying that something went wrong on a thing nobody can act on asks for an action the element will refuse. The displaced validity keeps its mark and its outcome word, which is two carriers and neither of them colour, so the rank costs that fact nothing. The state axes are seven and the precedence names three of them, so a composition drawn from choice or disclosure is still unruled; freshness is ruled here only in that it contests no ground at all, because a stale reading dims its content and says when it was taken rather than taking a ground, and the chrome around it does not dim.",
  status: "current",
  sectionKey: old?.sectionKey ?? "current-contract",
  tags: ["contract"],
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
RULE.contentDigest = ruleContentDigest(RULE);

if (!registry.sections.some((s) => s.key === RULE.sectionKey)) fail(`section ${RULE.sectionKey} missing`);
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

registry.rules.push(RULE);

const asciiOnly = (text) => text.replace(/[^\x00-\x7f]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
const serialised = `${asciiOnly(JSON.stringify(registry, null, 1))}\n`;
if (!serialised.startsWith('{\n "meta": {\n  "name"')) {
  console.error("FAIL · serialisation does not match the registry's shape");
  process.exit(1);
}
writeFileSync(path, serialised);
console.log(`registered ${NEW_ID}, amending R-STA-002 by addition`);
