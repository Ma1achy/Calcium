// Registers R-KEY-010 and the chip preview's three bindings — `⌥⇧↑`/`⌥⇧↓` scroll
// it and `⌥o` opens the chip (ruling 53 and its amendment, §101; C22 I143, I144,
// §6q).
//
//     node tools/design/register-preview-keys.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-watch-jump.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run. The digest
// is the builder's own `ruleContentDigest`, so the two cannot disagree.
//
// **Three collections, one decision.** The rule is ruling 53 made current — `⏎`
// always sends, and the preview's own keys are chords the prompt does not bind;
// the three actions are the preview's verbs; the three bindings are the route.
// **`default-terminal` only**: `ESC o` and `CSI 1;4A`/`B` are deliverable without
// the Kitty protocol (the ruling measured them, and C22 §6q.1 again), so an
// `enhanced-terminal` record would be a second record of the same bytes.
// `scope: "prompt"` because the preview is a prompt substate (C15 I29, ruling 61),
// and `when: "previewing"` because the chord means nothing when no preview is up.
//
// **It lands with its ledger row, never alone** (`tools/rule-status.mjs` check 1),
// then `release.mjs 0.21` seals it and `make design` regenerates KEYS.md.
//
// **Every write is asserted**: a run on a registry that already holds the rule is a
// no-op that says so; a chord already bound in either profile, or anything else
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

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

const ID = "R-KEY-010";
const SECTION = "replace-or-float-and-where-a-chip-previews-101";
/** `[action id, label, chord]` — the chord in the registry's notation. */
const KEYS = [
  ["preview.scroll.up", "scroll the chip preview up", "⌥⇧↑"],
  ["preview.scroll.down", "scroll the chip preview down", "⌥⇧↓"],
  ["preview.open", "open the chip in the editor", "⌥o"],
];

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
if (registry.rules.some((r) => r.id === ID)) {
  console.log(`already registered · ${ID} present, nothing written`);
  process.exit(0);
}
const keyIds = registry.rules.map((r) => r.id).filter((id) => id.startsWith("R-KEY-")).sort();
if (keyIds.at(-1) !== "R-KEY-009") fail(`the last R-KEY id is ${String(keyIds.at(-1))}, not R-KEY-009`);
if (!registry.sections.some((s) => s.key === SECTION)) fail(`section ${SECTION} missing`);
const ruleTemplate = registry.rules.find((r) => r.id === "R-KEY-009");
const actionTemplate = registry.actions.find((a) => a.id === "watch.jump.1");
const bindingTemplate = registry.bindings.find((b) => b.id === "binding.watch-jump-1");
if (ruleTemplate === undefined || actionTemplate === undefined || bindingTemplate === undefined) fail("a template record is missing");
// **The collision check, over both profiles and every status that is current.**
for (const b of registry.bindings) {
  for (const [, , chord] of KEYS) {
    if (b.status === "current" && b.chord === chord) fail(`${b.id} already binds ${chord} in ${b.profile}`);
  }
}
for (const [id] of KEYS) {
  if (registry.actions.some((a) => a.id === id)) fail(`${id} is already an action`);
}
if (failed > 0) stop();

const rule = {
  id: ID,
  title: "A chip preview's own keys are chords the prompt does not bind, and enter always sends",
  text:
    "While a chip preview is up, the prompt keeps every key it binds, and enter sends. The preview " +
    "owns three chords the prompt does not bind, each deliverable without the Kitty protocol: " +
    "⌥⇧↑ and ⌥⇧↓ scroll the preview, and ⌥o opens the chip in the " +
    "reader's editor. The preview's key row names them from the keymap.",
  status: "current",
  sectionKey: SECTION,
  tags: ["interaction"],
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
rule.contentDigest = ruleContentDigest(rule);
if (JSON.stringify(Object.keys(rule)) !== JSON.stringify(Object.keys(ruleTemplate))) {
  fail(`rule key order ${JSON.stringify(Object.keys(rule))} against ${JSON.stringify(Object.keys(ruleTemplate))}`);
}
const actions = KEYS.map(([id, label]) => ({ id, label, status: "current", ruleIds: [ID] }));
const bindings = KEYS.map(([id, label, chord]) => ({
  id: `binding.${id.replaceAll(".", "-")}`,
  actionId: id,
  chord,
  scope: "prompt",
  label,
  profile: "default-terminal",
  status: "current",
  ruleIds: [ID],
  kind: "key",
  when: "previewing",
}));
if (JSON.stringify(Object.keys(actions[0])) !== JSON.stringify(Object.keys(actionTemplate))) fail("action key order");
if (JSON.stringify(Object.keys(bindings[0])) !== JSON.stringify(Object.keys(bindingTemplate))) fail("binding key order");
if (failed > 0) stop();

registry.rules.push(rule);
registry.actions.push(...actions);
registry.bindings.push(...bindings);
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8"));
const landed = after.rules.find((r) => r.id === ID);
if (landed === undefined || landed.contentDigest !== ruleContentDigest(landed)) {
  console.error(`FAIL · ${ID} did not land with a matching digest`);
  process.exit(1);
}
const previewActions = after.actions.filter((a) => a.id.startsWith("preview.")).length;
const previewBindings = after.bindings.filter((b) => b.actionId.startsWith("preview.")).length;
if (previewActions !== 3 || previewBindings !== 3) {
  console.error(`FAIL · ${String(previewActions)} actions and ${String(previewBindings)} bindings landed, not 3 and 3`);
  process.exit(1);
}
console.log(`registered ${ID}, 3 actions and 3 bindings; rules now ${String(after.rules.length)}`);
