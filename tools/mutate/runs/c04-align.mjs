// C04 I44 — a row group's vertical alignment, mutated.
//
// **The field shipped with a renderer and no test.** These are the two ways to
// have it and be wrong: ignore it, and collapse its middle value. Both leave
// every measurement identical, which is why the row that catches them reads the
// frame.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/sequence.test.ts";
const SRC = "src/presentation/blocks/kinds/containers.ts";

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
    // The state the field was in until T3.22: declared, accepted by the builder,
    // and dropped on the way to the frame.
    name: "align is declared and ignored",
    file: SRC,
    from: "...(align === undefined ? {} : { justifyContent: DOWN[align] }),",
    to: "...{},",
    expect: "T3.22",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    from: "const align = block.align?.[index];",
    to: "const align = undefined;",
    why:
      "no child is ever aligned — if this survives, nothing reads the frame a row group " +
      "composes and the mutation below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
