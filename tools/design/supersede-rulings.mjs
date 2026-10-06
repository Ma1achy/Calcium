// Supersedes two registry rules and adds one, on the rulings for parked questions
// 6, 25 and 10.
//
// **A one-shot, kept for the same reason `register-sel.mjs` is**: the registry is
// the normative source, a digest computed by hand is how one goes wrong silently,
// and the edit has to be auditable after it has run. `contentDigest` comes from the
// builder's own `ruleContentDigest`.
//
// **Supersession, not amendment**, because every one of the three is released:
// `lint-immutable.mjs` seals a released rule's digest (title, text, section) and
// allows exactly one change to it — `current` or `example` to `superseded`, with a
// reciprocal link to a successor that lists it. So the old wording stays
// addressable and the successor carries the ruling.
//
// **Every lookup asserts it matched** (CLAUDE.md): a run that reports success
// having changed nothing is a failure, and this exits non-zero and writes nothing
// if a rule is missing, already superseded, or a successor id is taken.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "../../docs/design/language/calcium-registry.json");

/** `[old, successor, title, text, tags, question]`. */
const SUCCESSIONS = [
  [
    "R-SEL-002",
    "R-SEL-016",
    "The render must survive a naive drag",
    "A wrapped line's continuation carries no decoration in the gutter; the scrollbar is the " +
      "last column, so a drag that stops short of it is clean; nothing meaningful is drawn in a " +
      "column a reader would not drag through. A bounded block keeps its vertical rules: semantic " +
      "copy is the clean path through a box, and a naive drag that takes the border with the " +
      "content is accepted. This is a constraint on layout, not a note.",
    ["measurement"],
    6,
  ],
  [
    "R-STR-003",
    "R-STR-005",
    "Width-bounded nesting",
    "Every nested level costs two columns, and nesting is limited by width while the deepest " +
      "child still clears its own minimum width.",
    ["contract"],
    25,
  ],
];

/**
 * **Question 10 adds a rule rather than superseding one.** The ruling reads *§035's
 * `[#][#][.]` specimen is superseded in the registry*, and the registry cannot do
 * that: a specimen block must carry `example` status (`build-calcium.mjs`'s block
 * validation), so a superseded one is refused — and it never bound anything, since
 * R-REG-002 makes an example block retained content and not a normative source. What
 * the ruling needs is a normative sentence saying *data beats prose* here, so it
 * lands as a current rule and §035's section cites it.
 */
const ADDITION = {
  id: "R-PRG-003",
  title: "The ASCII bar rung is one pair",
  text:
    "At the ASCII rung every bar draws the registry's one pair, `#` filled and `-` empty, one " +
    "character per cell, whatever its granularity. Granularity is carried above the ASCII rung; " +
    "a spinner or text status independently carries active or stalled liveness.",
  tags: ["atomic"],
  section: "meter-semantics-quantity-granularity-and-liveness-035",
};

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };

// **The round-trip first**: a serialisation that differs from the file before the
// edit rewrites every record and buries three in the diff.
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2 — nothing written");

const byId = new Map(registry.rules.map((r) => [r.id, r]));
for (const [old, successor] of SUCCESSIONS) {
  const rule = byId.get(old);
  if (rule === undefined) fail(`${old} missing`);
  else if (rule.status === "superseded") fail(`${old} is already superseded — this script has run`);
  if (byId.has(successor)) fail(`${successor} already exists`);
}
if (byId.has(ADDITION.id)) fail(`${ADDITION.id} already exists`);
const citing = registry.sections.find((s) => s.key === ADDITION.section);
if (citing === undefined) fail(`section ${ADDITION.section} missing`);
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

for (const [old, successor, title, text, tags] of SUCCESSIONS) {
  const retired = byId.get(old);
  const next = {
    id: successor,
    title,
    text,
    status: "current",
    sectionKey: retired.sectionKey,
    tags,
    supersedes: [old],
    supersededBy: null,
    ...(retired.condensedGroup === undefined ? {} : { condensedGroup: retired.condensedGroup }),
    legacyIds: [],
    contentDigest: "",
  };
  next.contentDigest = ruleContentDigest(next);
  retired.status = "superseded";
  retired.supersededBy = successor;
  registry.rules.splice(registry.rules.indexOf(retired) + 1, 0, next);
}

// **Citations move to the successor.** `validateRegistry` refuses a record that
// cites a non-current rule, so every `ruleIds` list naming an old id now names its
// successor — counted per id, so a citation that was expected and not found is
// visible rather than a silent zero. The superseded rule's own record and the
// sections' retained history are not citations and are not touched.
const successorOf = new Map(SUCCESSIONS.map(([o, s]) => [o, s]));
const moved = new Map(SUCCESSIONS.map(([o]) => [o, 0]));
const walk = (node, path) => {
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "ruleIds" && Array.isArray(value)) {
      node[key] = value.map((id) => {
        const next = successorOf.get(id);
        if (next === undefined) return id;
        moved.set(id, moved.get(id) + 1);
        console.log(`  ${path}.ruleIds: ${id} → ${next}`);
        return next;
      });
    } else if (key !== "rules" && key !== "sectionBlocks") walk(value, `${path}.${key}`);
  }
};
walk(registry, "registry");
for (const [id, n] of moved) console.log(`  ${id}: ${n} citation(s) moved`);

// A block's `ruleIds` names its own record, not a rule it cites — skipped above.
const added = {
  id: ADDITION.id,
  title: ADDITION.title,
  text: ADDITION.text,
  status: "current",
  sectionKey: "current-contract",
  tags: ADDITION.tags,
  supersedes: [],
  supersededBy: null,
  legacyIds: [],
  contentDigest: "",
};
added.contentDigest = ruleContentDigest(added);
const anchor = byId.get("R-PRG-002");
if (anchor === undefined) { console.error("  R-PRG-002 missing — nowhere to place R-PRG-003"); process.exit(1); }
registry.rules.splice(registry.rules.indexOf(anchor) + 1, 0, added);
citing.ruleIds = [...citing.ruleIds, ADDITION.id];
console.log(`  ${ADDITION.id} added; ${ADDITION.section} cites it`);

writeFileSync(registryPath, serialise(registry));
console.log(`superseded ${SUCCESSIONS.map(([o, s]) => `${o} → ${s}`).join(", ")}; added ${ADDITION.id}`);
console.log(`current rules now ${registry.rules.filter((r) => r.status === "current").length}`);
