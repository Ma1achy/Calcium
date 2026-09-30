// C19 I23 — the menu's window is sized in rows, and the pills form fills its
// box (F1487; T6.28).
//
// **Two files, three questions.** `menuWindowOf` decides how many pills a run
// of rows holds and where the run starts; `keys.ts` hands it the placement's
// width and counts what the window leaves out. Each has a revert that reads as
// harmless: the pills form sized as the table's (F1487 itself), the width not
// the placement's, the indicator counting the table's number, the selection or
// the wheel no longer placing the start.
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
  "test/integration/pointer-layers.test.ts",
  "test/unit/completion-current.test.ts",
  "test/integration/session.test.ts",
].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): the pills window is the whole list.
  file: MENU,
  from: "  if (rows <= 0 || fits(0, total)) return Object.freeze({ start: 0, shown: total });",
  to: "  if (true) return Object.freeze({ start: 0, shown: total });",
  why: "every pill handed over and the frame cuts them — if this survives, no row reads the pills window",
};

const MUTATIONS = [
  {
    // **T6.28, F1487 itself**: the pills form sized one candidate a row.
    name: "T6.28: the pills window sized as the table's",
    file: MENU,
    from: "  if (candidates.some((c) => c.detail !== undefined)) {",
    to: "  if (candidates.length > 0) {",
    expect: "T4.9",
  },
  {
    // **T6.28, the width**: the pills packed at a width not the placement's.
    name: "T6.28: keys.ts hands no placement width",
    file: KEYS,
    from: "    across = placed?.width ?? 0;",
    to: "    across = 0;",
    expect: "T3.30",
  },
  {
    // **The indicator counting the table's number**, which a pills window's is not.
    name: "the indicator counts rows, not the pills left out",
    file: KEYS,
    from: "fits <= 0 ? remainder : candidates.length - w.shown);",
    to: "remainder);",
    expect: "T3.30",
  },
  {
    // **The selection no longer places the start**: arrowing past the window
    // moves the mark into chips that are not drawn.
    name: "the pills window ignores the selection",
    file: MENU,
    from: "  const start = from === null ? earliest(selected ?? 0) : ",
    to: "  const start = from === null ? 0 : ",
    expect: "T3.30",
  },
  {
    // **T6.28, the wheel's clamp**: run past the end, the window runs off it.
    name: "T6.28: the wheel's clamp dropped",
    file: MENU,
    from: ": Math.min(Math.max(0, from), earliest(total - 1));",
    to: ": Math.max(0, from);",
    expect: "T3.30",
  },
  {
    // **One row short**: a run that exactly fills the rows is refused.
    name: "fits refuses a run that fills the rows exactly",
    file: MENU,
    from: "width) <= rows;",
    to: "width) < rows;",
    expect: "T4.9",
  },
  {
    // **The longest run one chip short**: the binary search's step. Named T4.9
    // in the first draft and scored CAUGHT ELSEWHERE: T4.9 reads the box's
    // height, and one chip fewer on the last row keeps it. T3.30's selection
    // arm is what sees it — the earliest start whose run reaches the selection,
    // one chip short, leaves the selected chip out (`/z19-entry` at 100 × 16).
    name: "longest stops a chip early",
    file: MENU,
    from: "      if (fits(start, mid)) lo = mid;",
    to: "      if (fits(start, mid + 1)) lo = mid;",
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
