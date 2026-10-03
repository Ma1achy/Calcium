// C19 I31 — a line that goes away takes the menu and the hold built against it
// (F1497, F1498; T6.29).
//
// **Two sites in one file.** `recall` is the history walks' way of putting a
// line in the prompt, and it closes the menu and ends `Esc`'s hold; `afterEdit`
// ends the hold when the line empties. Each half can be dropped and read as
// harmless, and the alternative the spec rejected — rebuilding on a recall — is
// a mutation too.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const KEYS = "src/shell/keys.ts";
const FILES = ["test/integration/completion-as-you-type.test.ts", "test/integration/session.test.ts"].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): the recalled line altered.
  file: KEYS,
  from: "  function recall(line: string): void {\n    abandonRequest();\n    deps.editor.setText(line);",
  to: "  function recall(line: string): void {\n    abandonRequest();\n    deps.editor.setText(`${line}x`);",
  why: "every recalled line gains a character — if this survives, no row reads a recall",
};

const MUTATIONS = [
  {
    // **T6.29, F1497 itself**: the recall leaves the menu open.
    name: "T6.29: the recall does not close the menu",
    file: KEYS,
    from: "    deps.editor.setText(line);\n    if (hasMenu()) closeMenu();\n",
    to: "    deps.editor.setText(line);\n",
    expect: "T3.32",
  },
  {
    // **T6.29, the recall's half of the hold.**
    name: "T6.29: the recall leaves the hold standing",
    file: KEYS,
    from: "    if (hasMenu()) closeMenu();\n    suppressedAt = null;\n  }\n",
    to: "    if (hasMenu()) closeMenu();\n  }\n",
    expect: "T3.32",
  },
  {
    // **T6.29, F1498 itself**: the hold outlives an emptied line.
    name: "T6.29: an emptied line keeps the hold",
    file: KEYS,
    from: "(suppressedAt !== ctx.replace.start || deps.editor.text === \"\")",
    to: "(suppressedAt !== ctx.replace.start)",
    expect: "T3.31",
  },
  {
    // **The alternative C19 I31 rejects**: a recall rebuilds the menu.
    name: "the recall rebuilds rather than closes",
    file: KEYS,
    from: "    if (hasMenu()) closeMenu();\n    suppressedAt = null;\n  }\n",
    to: "    if (hasMenu()) closeMenu();\n    suppressedAt = null;\n    afterEdit();\n  }\n",
    expect: "T3.32",
  },
  {
    // **`↓`'s walk**: the prompt's `historyNext` puts the line in by hand.
    name: "historyNext bypasses recall",
    file: KEYS,
    from: "      if (entry !== null) {\n        recall(entry);\n        return;\n      }",
    to: "      if (entry !== null) {\n        deps.editor.setText(entry);\n        return;\n      }",
    expect: "T3.32",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472): the verdict is
 * judged from failure lines, and these are what a reader checks it against.
 */
const named = () => {
  const hit = [{ name: "control", ...CONTROL }, ...MUTATIONS].find((m) => read(m.file).includes(m.to));
  return hit === undefined ? "the clean tree" : hit.name;
};
const run = () => {
  const label = named();
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const both = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    out = e.killed === true ? `${both}\nTIMED OUT after 300000ms` : both;
  }
  const fails = [...new Set(strip(out).split("\n").filter((l) => /^\s*FAIL\s/u.test(l)).map((l) => l.trim()))];
  console.log(`── ${label}: ${String(fails.length)} FAIL line(s)`);
  for (const l of fails) console.log(`   ${l}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: CONTROL,
  mutations: MUTATIONS,
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
