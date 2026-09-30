// Supersedes the sixteen key bindings whose chord a terminal without the Kitty
// protocol cannot send, and adds a base route for each (C16 §6c, review batch 2,
// M6 item 2).
//
//     node tools/design/supersede-bindings.mjs [--dir <dir>]
//
// **A one-shot, kept for the reason `supersede-rulings.mjs` is**: the registry is
// the normative source, and the edit has to be auditable after it has run.
//
// **What was wrong is the design's `profile` field.** Every binding said
// `default-terminal`, including `⌘1`, `⇧⏎`, `⌃⇧C` and `⌃⇥` — chords that are
// byte-identical to their unmodified forms without the protocol — so the field
// asserted a route the design intended and not one a base terminal delivers, and
// the keymap kept a second record of deliverability on its rows (C16 §6b). The
// remedy is the design's to make: each mislabelled record becomes `superseded`,
// an `enhanced-terminal` successor carries the same chord, and a new
// `default-terminal` record carries the base route §6a already bound.
//
// **Supersession, not amendment.** Bindings carry no digest and no baseline, so
// nothing would refuse an edit in place — which is the reason to do it the way
// the sealed records are done: the old record stays addressable, the links are
// reciprocal, and `validateRegistry` now walks them (C16 T1.174).
//
// **Every lookup asserts it matched** (CLAUDE.md): this exits non-zero and writes
// nothing if a record is missing, already superseded, carries a chord other than
// the one named here, or if a new id is taken.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const registryPath = join(dir, "calcium-registry.json");

/**
 * `[old id, its chord, the family's name for new ids, the base chord]`.
 *
 * The old chord is asserted rather than trusted: a record whose chord moved since
 * this list was written is a record this script does not know about.
 */
const FAMILIES = [
  ["binding.002", "⇧⏎", "newline", "⌥⏎"],
  ["binding.014", "⌃⇧C", "copy", "⌥w"],
  // **`⌃Y`, capitalised**, as the registry writes every control chord (`⌃C`,
  // `⌃]`) — `chordText` renders a control letter upper-case, and C16 T1.98
  // compares the two by equality.
  ["binding.015", "⌃⇧V", "paste", "⌃Y"],
  // **The sixteenth, which the review's count missed**: `⌃⇥` is `⇥` on a
  // legacy terminal, exactly as `⇧⏎` is `⏎`.
  ["binding.020", "⌃⇥", "agent-next", "⌥."],
  ["binding.021", "⌃⇧⇥", "agent-previous", "⌥,"],
  ["binding.022", "⌘1", "agent-1", "⌥1"],
  ["binding.023", "⌘2", "agent-2", "⌥2"],
  ["binding.024", "⌘3", "agent-3", "⌥3"],
  ["binding.025", "⌘4", "agent-4", "⌥4"],
  ["binding.026", "⌘5", "agent-5", "⌥5"],
  ["binding.027", "⌘6", "agent-6", "⌥6"],
  ["binding.028", "⌘7", "agent-7", "⌥7"],
  ["binding.029", "⌘8", "agent-8", "⌥8"],
  ["binding.030", "⌘9", "agent-9", "⌥9"],
  ["binding.033", "⌘↑", "transcript-top", "⌃home"],
  ["binding.034", "⌘↓", "transcript-bottom", "⌃end"],
];

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
let failed = 0;
const fail = (m) => {
  console.error(`  ${m}`);
  failed += 1;
};

// The round-trip first: a serialisation that differs from the file before the
// edit rewrites every record and buries forty-eight in the diff.
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2 — nothing written");

const byId = new Map(registry.bindings.map((b) => [b.id, b]));
const plan = [];
for (const [oldId, chord, family, baseChord] of FAMILIES) {
  const old = byId.get(oldId);
  const enhancedId = `binding.${family}-enhanced`;
  const baseId = `binding.${family}-base`;
  if (old === undefined) {
    fail(`${oldId} missing`);
    continue;
  }
  if (old.status === "superseded") fail(`${oldId} is already superseded — this script has run`);
  else if (old.status !== "current") fail(`${oldId} is ${old.status}, not current`);
  if (old.chord !== chord) fail(`${oldId} is ${old.chord}, not ${chord} — the list is stale`);
  if (old.profile !== "default-terminal") fail(`${oldId} already says ${old.profile}`);
  if (old.kind !== "key") fail(`${oldId} is a ${old.kind} binding, not a key`);
  for (const id of [enhancedId, baseId]) if (byId.has(id)) fail(`${id} already exists`);
  if (registry.bindings.some((b) => b.status === "current" && b.chord === baseChord)) {
    fail(`${baseChord} is already a current binding's chord`);
  }
  plan.push({ old, enhancedId, baseId, baseChord });
}
const profiles = registry.bindingCatalogues?.profiles;
if (!Array.isArray(profiles)) fail("bindingCatalogues.profiles missing");
else if (profiles.some((p) => p.id === "enhanced-terminal")) fail("enhanced-terminal is already catalogued");
if (failed > 0) {
  console.error(`FAIL · ${failed} problems, nothing written`);
  process.exit(1);
}

/** The record's own fields in its own order, so a successor reads like its predecessor. */
const record = (from, fields) => {
  const out = {};
  for (const key of Object.keys(from)) out[key] = key in fields ? fields[key] : from[key];
  for (const [key, value] of Object.entries(fields)) if (!(key in out)) out[key] = value;
  return out;
};

for (const { old, enhancedId, baseId, baseChord } of plan) {
  const enhanced = record(old, {
    id: enhancedId,
    profile: "enhanced-terminal",
    status: "current",
    supersedes: [old.id],
    supersededBy: null,
  });
  const base = record(old, {
    id: baseId,
    chord: baseChord,
    profile: "default-terminal",
    status: "current",
    supersedes: [],
    supersededBy: null,
  });
  old.status = "superseded";
  old.supersededBy = enhancedId;
  registry.bindings.splice(registry.bindings.indexOf(old) + 1, 0, enhanced, base);
}
profiles.push({ id: "enhanced-terminal", status: "current", ruleIds: ["R-KEY-003"] });

writeFileSync(registryPath, serialise(registry));

// Read back, and assert the edit is what this header says it is.
const after = JSON.parse(readFileSync(registryPath, "utf8"));
const current = after.bindings.filter((b) => b.status === "current");
const superseded = after.bindings.filter((b) => b.status === "superseded");
if (superseded.length !== FAMILIES.length) fail(`${superseded.length} superseded, expected ${FAMILIES.length}`);
for (const [oldId] of FAMILIES) {
  const old = after.bindings.find((b) => b.id === oldId);
  const next = after.bindings.find((b) => b.id === old?.supersededBy);
  if (next === undefined || !next.supersedes?.includes(oldId)) fail(`${oldId}: the link is not reciprocal`);
}
if (failed > 0) {
  console.error(`FAIL · ${failed} problems after writing — inspect the registry`);
  process.exit(1);
}
console.log(
  `superseded ${FAMILIES.length} bindings · ${FAMILIES.length} enhanced successors · ` +
    `${FAMILIES.length} base routes · ${current.length} current bindings`,
);
