// Where a configuration value came from, and the ladder that paints it
// (C22 I115, C23 I80, ruling 28).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/config-provenance.test.ts";
const CONFIG = "src/shell/config.ts";
const TABLE = "src/shell/config-table.ts";

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
    // **The reading the premise rules out**: a caller's value is `config`.
    name: "a caller's motion is recorded as config",
    file: CONFIG,
    from: '      { key: "motion", value: config.motion ?? "full", source: "default" },',
    to: '      { key: "motion", value: config.motion ?? "full", source: config.motion === undefined ? "default" : "config" },',
    expect: "T1.72",
  },
  {
    // The value recorded from the framework's constant, not the resolved one.
    name: "the record keeps the default, not the value that won",
    file: CONFIG,
    from: '      { key: "motion", value: config.motion ?? "full", source: "default" },',
    to: '      { key: "motion", value: "full", source: "default" },',
    expect: "T1.72",
  },
  {
    // The ladder's two quiet rungs swapped.
    name: "config is muted and default meta",
    file: TABLE,
    from: '  default: "muted",\n  config: "meta",',
    to: '  default: "meta",\n  config: "muted",',
    expect: "T1.75",
  },
  {
    // The column drawn in one tone: the fact survives as a word and the ladder
    // is gone.
    name: "the source cell carries no tone",
    file: TABLE,
    from: "        source: { text: s.source, tone: PROVENANCE_TONE[s.source] },",
    to: "        source: { text: s.source },",
    expect: "T1.75",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: no setting is recorded at all.
    file: CONFIG,
    from: "    settings: Object.freeze<Setting[]>([",
    to: "    settings: Object.freeze<Setting[]>([]), _unused: ([",
    why: "resolveConfig records nothing — if this survives, nothing reads the record",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
