// C26 stage 3 — focus as an address, mutated.
//
// **The subject is a resolution rule, so the mutations restore the defects it
// replaced.** Each one is a form the code actually had: matching on the element
// id alone (§8b.6), falling forward to the wrong place, and the two call sites
// that read `indexOf`'s −1 as two different things.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-focus.test.ts test/unit/session-keys.test.ts";
const FOCUS = "src/interaction/router/focus.ts";
const KEYS = "src/shell/keys.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The defect itself, restored.** `focusFor` found the first block holding
    // the id and `liveRowAction` looked it up the same way, so two tables each
    // carrying `r1` drew the highlight on the first and fired its action.
    //
    // Every row about a single-table document still passes, which is why this
    // survived stage 2 — the change whose whole subject it was.
    name: "resolution matches on the element id alone, ignoring the block",
    file: FOCUS,
    from: "    (p) => p.blockId === address.blockId && p.element.id === address.elementId,",
    to: "    (p) => p.element.id === address.elementId,",
    expect: "T1.3h",
  },
  {
    // The other half of the same address. Matching on the block alone puts
    // focus on the block's first element whatever the reader chose.
    name: "resolution matches on the block alone, ignoring the element",
    file: FOCUS,
    from: "    (p) => p.blockId === address.blockId && p.element.id === address.elementId,",
    to: "    (p) => p.blockId === address.blockId,",
    expect: "T1.3h",
  },
  {
    // **The fall-forward, aimed at the ruling rather than at the arithmetic.**
    // C26 I10 says the block is the finest scope resolution can honour, because the
    // lost element's position went with it. Falling to the start of the whole
    // list instead is arithmetically simpler and drops the reader out of the
    // block they were reading.
    name: "a stale address falls to the top of the document, not to its own block",
    file: FOCUS,
    from: "  const inBlock = elements.findIndex((p) => p.blockId === address.blockId);\n  if (inBlock !== -1) return inBlock;",
    to: "  const inBlock = -1;\n  if (inBlock !== -1) return inBlock;",
    expect: "T1.3i",
  },
  {
    // An empty list answering `0` rather than `null`. That is an index into
    // nothing, and it is the shape that let `indexOf`'s −1 mean two different
    // things at two call sites.
    name: "an empty element list resolves to index 0 rather than null",
    file: FOCUS,
    from: "  if (elements.length === 0) return null;",
    to: "  if (false) return null;",
    expect: "T1.3i",
  },
  {
    // `↑` testing the edge before resolution, which is what `rows.indexOf(...)`
    // did: a stale address arrived as −1 and left to the prompt, while `rowDown`
    // read the same −1 as "start again at the top".
    name: "↑ leaves to the prompt on a stale address, as indexOf's −1 did",
    file: KEYS,
    from: "      if (i === null || i === 0) {\n        deps.focus.toPrompt();",
    to: "      if (i === null || i === 0 || current.element === null || !elements.some((p) => p.blockId === current.element?.blockId && p.element.id === current.element?.elementId)) {\n        deps.focus.toPrompt();",
    expect: "T1.17",
  },
  {
    // `⏎` resolving, then reading a *different* element's action — the shape
    // `liveRowAction` had when it took a bare id into its own walk.
    name: "⏎ fires the first element's action rather than the focused one",
    file: KEYS,
    from: "      const action = elements[i]?.element.activate;",
    to: "      const action = elements.find((p) => p.element.activate !== undefined)?.element.activate;",
    expect: "T1.16",
  },
];

/**
 * Empty — and it was not on the first run, which is what this pass was for.
 *
 * **Two findings, and both were fixtures where the two rulings coincide.**
 * Neither was visible from a green suite; both rows passed sixteen assertions
 * between them while being unable to distinguish a rule from its opposite.
 *
 *   1. `⏎ fires the first element's action` **SURVIVED**. Only one element in
 *      the fixture carried an action, so *the focused element's action* and
 *      *the first action in the list* were the same object. Both colliding rows
 *      are now armed, with different actions.
 *   2. `a stale address falls to the top` was **CAUGHT ELSEWHERE**. The stale
 *      address pointed into the *first* block, where *stay in the block* and
 *      *fall to the document top* both answer 0. It now points into the second.
 *
 * The convenient setup is the one where both readings agree, and a row written
 * against it tests the rule against itself and agrees. The C26 I13 survivor remains
 * the model for a genuine exemption: a named reason and a staleness arm, never
 * a weakened assertion.
 */
const EXPECTED_SURVIVORS = new Map();

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FOCUS,
    from: "  if (elements.length === 0) return null;\n  // **In the block, on no element yet**",
    to: "  return null;\n  // **In the block, on no element yet**",
    why:
      "resolution answers null for everything — if this survives, no row drives focus through " +
      "the resolver at all and every kill below is unearned",
  },
  mutations: MUTATIONS,
});

console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length > 0 ? 1 : 0);
