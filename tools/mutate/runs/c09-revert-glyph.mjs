// `↺` is registered, and the tree and the record agree about it (C09 I114).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/glyph-revert.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";

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
    // The first reach, in the tree rather than the record: `nested`'s `~`.
    name: "the ASCII half is `~`",
    file: GLYPHS,
    from: '  revert: "<",\n',
    to: '  revert: "~",\n',
    expect: "T2.176",
  },
  {
    // `↻` U+21BB, clockwise — the mark for *redo* in most toolkits, and not the
    // one the design draws on either affordance.
    name: "the Unicode half is the clockwise arrow",
    file: GLYPHS,
    from: '  revert: "\\u21ba",\n',
    to: '  revert: "\\u21bb",\n',
    expect: "T2.176",
  },
  {
    name: "the tree files it under another domain",
    file: GLYPHS,
    from: '  revert: ["inline"],\n',
    to: '  revert: ["plot"],\n',
    expect: "T2.176",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: the Unicode slot gone, so the set has no
    // revert mark at all.
    file: GLYPHS,
    from: '  revert: "\\u21ba",\n',
    to: "",
    why: "the Unicode set has no revert mark — if this survives, nothing reads the slot",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
