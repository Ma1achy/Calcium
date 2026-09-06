// C16 I27 — `mergeBlock` places a colliding key rather than refusing it, mutated.
//
// **The throw was the tree's state**: a block key colliding with `global` or an
// existing `liveBlock` binding was refused at construction, so the ten liveBlock
// rows and the four global ones were closed to every adapter and interaction
// mode had no producer. C16 I27 merges a colliding key at `interaction` and a free
// one at `liveBlock`. The two mutations are the refusal restored and the silent
// shadow — every block key at `liveBlock`, where a collision is a duplicate.
//
// Anchors and expectations are Lane D's, each run by hand on 2026-09-03.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-keymap.test.ts";

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
    file: "src/interaction/router/keymap.ts",
    from: "        const target: FocusTarget = collides ? \"interaction\" : \"liveBlock\";",
    to: "        if (collides) throw new KeymapError(\"refused\");\n        const target: FocusTarget = \"liveBlock\";",
    why: "the throw restored — T2.4b, T2.4c and T2.4e fail; this is the shipped behaviour C16 I27 replaced, and a run that cannot see it restored cannot see the ruling",
  },
  mutations: [
    {
      name: "every block key lands at liveBlock (silent shadow)",
      file: "src/interaction/router/keymap.ts",
      from: "        const target: FocusTarget = collides ? \"interaction\" : \"liveBlock\";",
      to: "        const target: FocusTarget = \"liveBlock\";",
      expect: "T2.4c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
