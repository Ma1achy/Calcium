// A03 SP16 — a titled row locates the row its spec declares, mutated (F1489).
//
// **A gate that stops matching goes green**, and SP16's arms are each one
// condition: the file's owner declaring the id, the attributed spec having
// retired it, and neither declaring it (F1500). The last arm's reader is
// `TEST_ROW`, which SP7 shares, so its head shapes are mutated here too. Each mutation below leaves `make enforce` green on the real tree
// — the debt list is keyed by what the rule finds, and nothing it finds is new
// — so the fire tests are what see it.
//
// The control is the reader emptied: no row is read, so the real corpus is
// clean and empty — which is why SP16's corpus row asserts its size first.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/enforce-commitments.test.ts";
const RULES = "tools/enforce/commitments.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: RULES,
    from: "    for (const r of rowIdsIn(f, text)) {\n      const mine =",
    to: "    for (const r of []) {\n      const mine =",
    why: "the reader emptied: every file reads as holding no row, and the corpus row's size assertion fails",
  },
  mutations: [
    {
      // **F1489 itself**: the owner's declaration not consulted, so a title
      // citing another spec first under the owner's id dangles quietly.
      name: "the file's owner is not asked",
      file: RULES,
      from: "      if (theirs !== null && theirs.declared.has(r.id) && !theirs.retired.has(r.id)) {\n",
      to: "      if (false) {\n",
      expect: "SP16: F1489's shape fails",
    },
    {
      // **Lane b4-exec2's instance**: C23 T3.20 superseded and a live row
      // titled with it. The retired arm removed, it resolves as declared.
      name: "a retired id resolves as a declared one",
      file: RULES,
      from: "      if (mine.retired.has(r.id)) {\n",
      to: "      if (false) {\n",
      expect: "SP16: a live row reusing a retired id fails",
    },
    {
      // The vocabulary one word short: a head saying *superseded* reads live.
      name: "a superseded head is not a retirement",
      file: RULES,
      from: "(?:[Ss]uperseded|[Rr]etired|[Ss]truck)\\b)/gmu;",
      to: "(?:[Rr]etired|[Ss]truck)\\b)/gmu;",
      expect: "SP16: a live row reusing a retired id fails",
    },
    {
      // The finding not reported: found, keyed, and dropped.
      name: "a misfiled row not on the list is not reported",
      file: RULES,
      from: "  if (fresh.length > 0) {\n    violations.push({\n      rule: \"SP16\",\n",
      to: "  if (false) {\n    violations.push({\n      rule: \"SP16\",\n",
      expect: "SP16: F1489's shape fails",
    },
    {
      // Compared as a subset: a repaired row's entry outlives its reason.
      name: "a cleared entry stays on the list",
      file: RULES,
      from: "  if (cleared.length > 0) {\n    violations.push({\n      rule: \"SP16\",\n",
      to: "  if (false) {\n    violations.push({\n      rule: \"SP16\",\n",
      expect: "SP16: the debt list is compared by equality",
    },
    {
      // The attributed spec's own declaration skipped: a row both specs
      // declare reads as the owner's, which is every same-id row in a
      // shared file.
      name: "the attributed spec's declaration is not consulted",
      file: RULES,
      from: "      if (mine.declared.has(r.id)) continue;\n",
      to: "",
      expect: "SP16: the controls",
    },
    {
      // **F1500's arm off**: a row naming an id no spec declares is found,
      // keyed, and not reported — the state the 639 were in.
      name: "a dangling row not on the list is not reported",
      file: RULES,
      from: "  if (unlisted.length > 0) {\n",
      to: "  if (false) {\n",
      expect: "SP16 (F1500): a row naming an id no spec declares fails",
    },
    {
      // The list compared as a subset: a row declared since keeps its entry.
      name: "a dangling entry whose row is declared stays on the list",
      file: RULES,
      from: "  if (resolved.length > 0) {\n",
      to: "  if (false) {\n",
      expect: "SP16 (F1500): the dangling list is compared by equality",
    },
    {
      // **The reader one shape short**: a letter range read as its ends, so
      // `T2.4b–e` declares two rows and the two between dangle.
      name: "a letter range is not expanded",
      file: RULES,
      from: "  if (toLetter !== undefined && letter !== undefined && toLetter >= letter) {\n",
      to: "  if (false) {\n",
      expect: "SP7 (F1500): the five head shapes",
    },
    {
      // C08's `- **H** — **T1.14**`: the tag refused, the row unread.
      name: "a tag before the head is not read",
      file: RULES,
      from: "^[ \\t]*- (?:\\*\\*[A-Z]\\*\\* — )?\\*\\*(T",
      to: "^[ \\t]*- \\*\\*(T",
      expect: "SP7 (F1500): the five head shapes",
    },
    {
      // A list read as one id: `T2.9, T2.9b` declares neither.
      name: "a list is not split",
      file: RULES,
      from: "  if (bare.includes(\", \")) return bare.split(\", \");\n",
      to: "",
      expect: "SP7 (F1500): the five head shapes",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
