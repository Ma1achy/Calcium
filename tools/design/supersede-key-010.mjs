// Supersedes R-KEY-010 with R-KEY-011 and registers the chip preview's second
// scroll route, `⌥k`/`⌥j` (F1441; C16 I36, C22 I143, §6q.5).
//
//     node tools/design/supersede-key-010.mjs [--dir <dir>]
//
// **A one-shot, kept for `supersede-thm-003.mjs`'s reason**: the registry is the
// normative source, `contentDigest` comes from the builder's own
// `ruleContentDigest`, and the edit has to be auditable after it has run.
//
// **Why a second route and not a measurement.** Windows Terminal's documented
// default keymap binds `alt+shift+up`/`alt+shift+down` to `resizePane`, so on
// that terminal `⌥⇧↑`/`⌥⇧↓` may never reach the application — and no Windows
// session can be run here. The design closes an undeliverable chord by never
// letting an action depend on it (`R-CAP-001`, *every action has a
// base-terminal route*), which is what §6c did for `⌘` and `⌃⇥`. `ESC k` and
// `ESC j` are deliverable without the Kitty protocol, the prompt binds neither,
// and `j`/`k` are a pager's line keys.
//
// **The text changes in one clause and nothing else**, asserted: the old clause
// is present exactly once and the successor's text is the old text with that
// clause replaced. The two new bindings cite the successor, as do the three the
// old rule's citations move to.
//
// **Every write is asserted**: a run on a registry that already holds the
// successor is a no-op that says so; a chord already bound, or anything else
// that does not match, exits non-zero having written nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const registryPath = join(dir, "calcium-registry.json");

const OLD = "R-KEY-010";
const NEXT = "R-KEY-011";
const CLAUSE =
  "The preview owns three chords the prompt does not bind, each deliverable without the Kitty protocol: " +
  "⌥⇧↑ and ⌥⇧↓ scroll the preview, and ⌥o opens the chip in the reader's editor.";
const REPLACEMENT =
  "The preview owns five chords the prompt does not bind, each deliverable without the Kitty protocol: " +
  "⌥⇧↑ and ⌥⇧↓ scroll the preview, and so do ⌥k and ⌥j, because a terminal's own keymap may take " +
  "the first pair and no action depends on a chord it may take; ⌥o opens the chip in the reader's editor.";
/** `[binding id, action id, label, chord]`, after the action's first binding. */
const KEYS = [
  ["binding.preview-scroll-up-k", "preview.scroll.up", "scroll the chip preview up", "⌥k"],
  ["binding.preview-scroll-down-j", "preview.scroll.down", "scroll the chip preview down", "⌥j"],
];

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
const byId = new Map(registry.rules.map((r) => [r.id, r]));
if (byId.has(NEXT)) {
  console.log(`already superseded · ${NEXT} present, nothing written`);
  process.exit(0);
}
const old = byId.get(OLD);
if (old === undefined) fail(`${OLD} missing`);
else if (old.status !== "current") fail(`${OLD} is ${old.status}, not current`);
else if (old.text.split(CLAUSE).length !== 2) fail(`${OLD}'s text does not carry the clause exactly once`);
const keyIds = registry.rules.map((r) => r.id).filter((id) => id.startsWith("R-KEY-")).sort();
if (keyIds.at(-1) !== OLD) fail(`the last R-KEY id is ${String(keyIds.at(-1))}, not ${OLD}`);
for (const [id, actionId, , chord] of KEYS) {
  if (registry.bindings.some((b) => b.id === id)) fail(`${id} already exists`);
  if (!registry.actions.some((a) => a.id === actionId && a.status === "current")) fail(`${actionId} is not a current action`);
  // **The collision check, over both profiles and every current record.**
  for (const b of registry.bindings) {
    if (b.status === "current" && b.chord === chord) fail(`${b.id} already binds ${chord} in ${b.profile}`);
  }
}
if (failed > 0) stop();

const next = {
  id: NEXT,
  title: old.title,
  text: old.text.replace(CLAUSE, REPLACEMENT),
  status: "current",
  sectionKey: old.sectionKey,
  tags: old.tags,
  supersedes: [OLD],
  supersededBy: null,
  ...(old.condensedGroup === undefined ? {} : { condensedGroup: old.condensedGroup }),
  legacyIds: [],
  contentDigest: "",
};
next.contentDigest = ruleContentDigest(next);
if (JSON.stringify(Object.keys(next)) !== JSON.stringify(Object.keys(old))) {
  fail(`rule key order ${JSON.stringify(Object.keys(next))} against ${JSON.stringify(Object.keys(old))}`);
}
old.status = "superseded";
old.supersededBy = NEXT;
registry.rules.splice(registry.rules.indexOf(old) + 1, 0, next);

// Citations move to the successor, counted so an expected one not found shows.
let moved = 0;
const walk = (node) => {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "ruleIds" && Array.isArray(value)) {
      node[key] = value.map((id) => (id === OLD ? (moved += 1, NEXT) : id));
    } else if (key !== "rules" && key !== "sectionBlocks") walk(value);
  }
};
walk(registry);
if (moved !== 6) fail(`${String(moved)} citations moved, not 6 (three actions and three bindings)`);

// Each new binding sits after its action's first, in the template's key order.
for (const [id, actionId, label, chord] of KEYS) {
  const first = registry.bindings.find((b) => b.actionId === actionId && b.status === "current");
  if (first === undefined) { fail(`${actionId} has no binding to follow`); continue; }
  const record = { ...first, id, chord, label, ruleIds: [NEXT] };
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(Object.keys(first))) fail("binding key order");
  registry.bindings.splice(registry.bindings.indexOf(first) + 1, 0, record);
}
if (failed > 0) stop();
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8"));
const landed = after.rules.find((r) => r.id === NEXT);
if (landed === undefined || landed.contentDigest !== ruleContentDigest(landed)) {
  console.error(`FAIL · ${NEXT} did not land with a matching digest`);
  process.exit(1);
}
const scrolls = after.bindings.filter((b) => b.actionId.startsWith("preview.scroll.") && b.status === "current");
if (scrolls.length !== 4 || scrolls.some((b) => b.profile !== "default-terminal" || b.ruleIds[0] !== NEXT)) {
  console.error(`FAIL · ${String(scrolls.length)} preview scroll bindings, not 4 default-terminal ones citing ${NEXT}`);
  process.exit(1);
}
console.log(`superseded ${OLD} → ${NEXT}; ${String(moved)} citations moved; 2 bindings added`);
