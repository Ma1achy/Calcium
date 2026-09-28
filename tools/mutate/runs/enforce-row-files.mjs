// A03 SP15 — a test row's id is titled in one file within its spec, mutated
// (review batch 3, M7 item 7).
//
// **A gate that stops matching goes green**, and a debt list that stops being
// compared shrinks nothing and complains about nothing. Each mutation below
// leaves `make enforce` green on the real tree; the fire tests are what see it.
//
// The control is the reader emptied: no row is read, so the real corpus is
// clean and empty — which is why SP15's corpus row asserts its size first.
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
    from: "    for (const r of rowIdsIn(f, text)) {\n      rows++;\n",
    to: "    for (const r of []) {\n      rows++;\n",
    why: "the reader emptied: every file reads as holding no row, and the corpus row's size assertion fails",
  },
  mutations: [
    {
      // The rule removed: a split is found and nothing is reported.
      name: "a split not on the list is not reported",
      file: RULES,
      from: "  if (fresh.length > 0) {\n    violations.push({\n      rule: \"SP15\",\n",
      to: "  if (false) {\n    violations.push({\n      rule: \"SP15\",\n",
      expect: "SP15: one id titled in two files within one spec fails",
    },
    {
      // Compared as a subset: a cleared entry outlives its reason.
      name: "a cleared entry stays on the list",
      file: RULES,
      from: "  if (cleared.length > 0) {\n    violations.push({\n      rule: \"SP15\",\n",
      to: "  if (false) {\n    violations.push({\n      rule: \"SP15\",\n",
      expect: "SP15: the debt list is compared by equality",
    },
    {
      // The title's own citation ignored: a row qualified by its title is
      // attributed to its file, so two specs' T1.1 in unowned files vanish.
      name: "the title's citation does not attribute",
      file: RULES,
      from: "    out.push({ id: m[2], spec: m[1] ?? m[3] ?? ownerOf(file), line: i + 1 });\n",
      to: "    out.push({ id: m[2], spec: m[1] ?? ownerOf(file), line: i + 1 });\n",
      expect: "SP15: one id titled in two files within one spec fails",
    },
    {
      // A row quoted in a block comment read as one. The first draft of this
      // mutation removed `withoutTodos` on the reading that it stripped the
      // deferrals, and it survived: `ROW_OPENS` never opens on `it.todo(`, so
      // for deferrals the call is a second exclusion and no single mutation of
      // either can see it. What the call alone carries is the comments.
      name: "a commented-out row is a row",
      file: RULES,
      from: "  const lines = withoutTodos(text).split(\"\\n\");\n  const out = [];\n",
      to: "  const lines = text.split(\"\\n\");\n  const out = [];\n",
      expect: "SP15: the controls",
    },
    {
      // A title the formatter wrapped is not read.
      name: "a wrapped title is skipped",
      file: RULES,
      from: "    const title = /\\(\\s*$/u.test(lines[i]) ? (lines[i + 1] ?? \"\") : lines[i];\n",
      to: "    const title = lines[i];\n",
      expect: "SP15: the attribution is SP9's",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
