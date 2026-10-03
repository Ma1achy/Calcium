// C19 I30 — the menu is a ladder in every case, and the pills form is retired
// (ruling 99, F1496; T6.28).
//
// **Three questions, two files.** `menuBlocks` decides the form and what a row
// carries — the label, its tone, and an empty hint cell for a candidate with no
// `detail`; `menuWindowOf` clamps the wheel's start; `keys.ts` counts what the
// window leaves out. Each has a revert that reads as harmless: the pills form
// back for candidates with no hint (ruling 99 undone), the tone dropped with it
// (the field losing its only reader), the clamp gone, the count off by one.
// It replaces `c19-pills-window.mjs`: F1487's window retired with the form.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const MENU = "src/interaction/completion/menu.ts";
const KEYS = "src/shell/keys.ts";
const FILES = [
  "test/integration/completion.test.ts",
  "test/integration/completion-as-you-type.test.ts",
  "test/unit/completion-current.test.ts",
  "test/edge/completion.test.ts",
].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): every label blank.
  file: MENU,
  from: "        value: { text: c.display ?? c.value, ...",
  to: "        value: { text: \"\", ...",
  why: "no candidate's label is drawn — if this survives, no row reads the menu's rows",
};

const MUTATIONS = [
  {
    // **T6.28, ruling 99 undone**: candidates with no hint draw as pills again.
    name: "T6.28: the pills form back for candidates with no detail",
    file: MENU,
    from: "  const body: Block = {\n    kind: \"table\",",
    to:
      "  const body: Block = candidates.every((c) => c.detail === undefined)\n" +
      "    ? ({ kind: \"pills\", id: `${MENU_ID}-pills`, chips: candidates.map((c, i) => ({ label: c.display ?? c.value, ...(i === current ? { active: true } : {}) })) } as Block)\n" +
      "    : {\n    kind: \"table\",",
    expect: "T3.30",
  },
  {
    // **T6.28, the tone**: the value cell stops carrying it, and the field has
    // no reader left.
    name: "T6.28: the value cell drops the candidate's tone",
    file: MENU,
    from: "value: { text: c.display ?? c.value, ...(c.tone === undefined ? {} : { tone: c.tone }) },",
    to: "value: { text: c.display ?? c.value },",
    expect: "T1.72",
  },
  {
    // **The hint cell filled for a candidate with none**: the label twice.
    name: "the empty hint cell takes the label",
    file: MENU,
    from: "        detail: { text: c.detail ?? \"\" },",
    to: "        detail: { text: c.detail ?? c.value },",
    expect: "T3.30",
  },
  {
    // **T6.28, the wheel's clamp**: run past the end, the window runs off it.
    name: "T6.28: the wheel's clamp dropped",
    file: MENU,
    from: "  return Object.freeze({ start: Math.min(Math.max(0, from), total - w.shown), shown: w.shown });",
    to: "  return Object.freeze({ start: Math.max(0, from), shown: w.shown });",
    expect: "T3.30",
  },
  {
    // **The indicator off by one**: N is no longer the rest.
    name: "the indicator counts one more than the window leaves out",
    file: KEYS,
    from: "    return menuBlocks(slice, at < 0 || at >= w.shown ? null : at, remainder);",
    to: "    return menuBlocks(slice, at < 0 || at >= w.shown ? null : at, remainder + 1);",
    expect: "T3.30",
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
