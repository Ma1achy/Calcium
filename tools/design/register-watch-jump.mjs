// Registers R-KEY-009 and `watch.jump[n]` — the watch row's direct route
// (ruling 50, §085; C16 I77, C16 §6d).
//
//     node tools/design/register-watch-jump.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-key-008.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run. The digest
// is the builder's own `ruleContentDigest`, so the two cannot disagree.
//
// **Three collections, one decision.** The rule is §085's sentence made
// current; the nine actions are `watch.jump[n]` spelled as the agent jumps are
// (`agent.1`–`agent.9`), because an effect takes no argument; the nine bindings
// are the route. **No `enhanced-terminal` record**, and that is the rule's own
// condition answered rather than a gap: `⌥1`–`9` and `⌘1`–`9` are the agent
// jumps, and `⌃1`–`9` is unsendable without the protocol (`⌃3` is `ESC`) and the
// platform's with it (R-REF-002). So the binding is the row's `1`–`9`, `global`
// when `focused` — `move.left`'s convention, *within the focused thing*.
//
// **It lands with its ledger row, never alone** (`tools/rule-status.mjs` check 1),
// then `release.mjs 0.16` seals it and `make design` regenerates KEYS.md.
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

const ID = "R-KEY-009";
const SECTION = "prism-the-six-hour-run-085";
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
if (registry.rules.some((r) => r.id === ID)) {
  console.log(`already registered · ${ID} present, nothing written`);
  process.exit(0);
}
const keyIds = registry.rules.map((r) => r.id).filter((id) => id.startsWith("R-KEY-")).sort();
if (keyIds.at(-1) !== "R-KEY-008") fail(`the last R-KEY id is ${String(keyIds.at(-1))}, not R-KEY-008`);
if (!registry.sections.some((s) => s.key === SECTION)) fail(`section ${SECTION} missing`);
const ruleTemplate = registry.rules.find((r) => r.id === "R-KEY-008");
const actionTemplate = registry.actions.find((a) => a.id === "host.detach");
const bindingTemplate = registry.bindings.find((b) => b.id === "binding.host-detach");
if (ruleTemplate === undefined || actionTemplate === undefined || bindingTemplate === undefined) fail("a template record is missing");
// **The collision check, over both profiles.** A current binding in either
// profile spelling a bare digit would be a second meaning for the key; the
// registry has none, and this is where that is asserted rather than assumed.
for (const b of registry.bindings) {
  if (b.status === "current" && DIGITS.includes(b.chord)) fail(`${b.id} already binds ${b.chord} in ${b.profile}`);
}
for (const d of DIGITS) {
  if (registry.actions.some((a) => a.id === `watch.jump.${d}`)) fail(`watch.jump.${d} already an action`);
}
if (failed > 0) stop();

const rule = {
  id: ID,
  title: "A watch jump is an action, and its chord is the watch row's where no direct chord is free",
  text:
    "watch.jump[n] is an action. It receives a direct chord only when the resolved profile can " +
    "assign one without a collision; in every profile, with the watch row focused, 1 to 9 scroll " +
    "to the nth watch's entry and open it. \u2303\u21e5 remains exclusively frame and tab switching.",
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
const actions = DIGITS.map((d) => ({ id: `watch.jump.${d}`, label: `jump to watch ${d}`, status: "current", ruleIds: [ID] }));
const bindings = DIGITS.map((d) => ({
  id: `binding.watch-jump-${d}`,
  actionId: `watch.jump.${d}`,
  chord: d,
  scope: "global",
  label: `jump to watch ${d}`,
  profile: "default-terminal",
  status: "current",
  ruleIds: [ID],
  kind: "key",
  when: "focused",
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
const jumpActions = after.actions.filter((a) => a.id.startsWith("watch.jump.")).length;
const jumpBindings = after.bindings.filter((b) => b.actionId.startsWith("watch.jump.")).length;
if (jumpActions !== 9 || jumpBindings !== 9) {
  console.error(`FAIL · ${String(jumpActions)} actions and ${String(jumpBindings)} bindings landed, not 9 and 9`);
  process.exit(1);
}
console.log(`registered ${ID}, 9 actions and 9 bindings; rules now ${String(after.rules.length)}`);
