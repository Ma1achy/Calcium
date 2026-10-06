// C16 I53 — key repeat through dispatch, mutated.
//
// **Every mutation here leaves the policy table correct and the repeat wrong**,
// which is the whole failure mode: T1.159–T1.159e test the table and the step
// arithmetic in isolation, and the router is where a table keyed by action
// meets the resolution that names the action.
//
// The control is the lookup as it shipped before the ruling: the active target
// alone. Restored, ⌥↑ — bound only at `global` — falls to the default and acts
// on every repeat, which a run that cannot see cannot see anything below it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-dispatch.test.ts test/unit/router-keymap.test.ts";

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
    file: "src/interaction/router/router.ts",
    from: '          const action = (keymap.resolve(activeTarget(inputs()), e.key) ?? keymap.resolve("global", e.key))?.action;\n',
    to: "          const action = keymap.resolve(activeTarget(inputs()), e.key)?.action;\n",
    why: "the shipped lookup before C16 I53's amendment — the target alone, so a global binding never meets its policy",
  },
  mutations: [
    {
      // The absorbed repeat handed on: the policy decided and dispatch ignored it.
      name: "a repeat worth zero steps falls through and acts",
      file: "src/interaction/router/router.ts",
      from: "          if (steps === 0) return true;\n",
      to: "",
      expect: "T1.159f",
    },
    {
      // ARR measured from the press rather than from the last act: past the
      // delay, every repeat is far enough from the press to act.
      name: "the rate is measured from the press, not from the last act",
      file: "src/interaction/router/router.ts",
      from: "          held.set(e.key.name, { pressedAt: was.pressedAt, lastActedAt: t });\n",
      to: "          held.set(e.key.name, { pressedAt: was.pressedAt, lastActedAt: was.lastActedAt });\n",
      expect: "T1.159f",
    },
    {
      // §020's page row losing its delay — the table's own row, by equality.
      name: "the page policy loses its delay",
      file: "src/interaction/router/repeat.ts",
      from: '  ["scrollPageUp", Object.freeze({ das: 250, arr: 90, accelerate: false })],\n',
      to: '  ["scrollPageUp", Object.freeze({ das: 0, arr: 90, accelerate: false })],\n',
      expect: "T1.159",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
