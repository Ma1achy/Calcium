// C09 I32 — a status asks for a tick only while its line moves (ruling 106 c,
// F1526; T6.193).
//
// **One site, and the alternative it replaced is the mutation**: answering for
// `status` by kind, as it did, woke the session at the set's cadence over a
// settled `error` box that drew the same bytes every time.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const ANIMATION = "src/presentation/blocks/animation.ts";
const FILES = ["test/contract/blocks.test.ts", "test/integration/spinner-wiring.test.ts", "test/edge/status.test.ts"].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): no status asks at all.
  file: ANIMATION,
  from: "    return activityLine(status, \"\") === \"\" ? null : spinnerIntervalMs(status.spinner, caps);",
  to: "    return null;",
  why: "loading asks for nothing — if this survives, no row reads a moving status's wake",
};

const MUTATIONS = [
  {
    name: "T6.193: tickIntervalOf answers for status by kind alone",
    file: ANIMATION,
    from: "    return activityLine(status, \"\") === \"\" ? null : spinnerIntervalMs(status.spinner, caps);",
    to: "    return spinnerIntervalMs(status.spinner, caps);",
    expect: "T2.231",
  },
  {
    // **A second list of the states that move**, which the comment refuses: it
    // agrees on every state but `retrying` with no countdown.
    name: "a list of states in place of the renderer's answer",
    file: ANIMATION,
    from: "    return activityLine(status, \"\") === \"\" ? null : spinnerIntervalMs(status.spinner, caps);",
    to: "    return status.state === \"loading\" || status.state === \"retrying\" ? spinnerIntervalMs(status.spinner, caps) : null;",
    expect: "T2.231",
  },
  {
    name: "the default set's interval in place of the block's",
    file: ANIMATION,
    from: "    return activityLine(status, \"\") === \"\" ? null : spinnerIntervalMs(status.spinner, caps);",
    to: "    return activityLine(status, \"\") === \"\" ? null : spinnerIntervalMs(undefined, caps);",
    expect: "T2.231",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472): the verdict is
 * judged from failure lines, and these are what a reader checks it against.
 */
const named = () => {
  // `from` gone **and** `to` present, mutations before the control: several
  // share a `from`, and the control's `to` is a substring of the clean tree.
  const hit = [...MUTATIONS, { name: "control", ...CONTROL }].find((m) => !read(m.file).includes(m.from) && read(m.file).includes(m.to));
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
