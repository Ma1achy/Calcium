// C19 I29, I23 — the menu's current candidate is marked at rest, and the menu
// closes on the prompt's rule (rulings 89 and 90, F1474, F1475; T6.25, T6.26).
//
// **Two rulings, two sites each.** The current at rest is decided twice — on
// push (`menuLayer`) and on every redraw (`windowedBlocks`) — and the bottom
// edge would come back on either arm of `menuBlocks`, the one with the
// indicator and the one without. And the chrome count the window is sized by,
// which has to fall with the edge.
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
  "test/unit/completion-current.test.ts",
  "test/integration/completion-current.test.ts",
  "test/revert/completion-current.test.ts",
  "test/integration/completion-as-you-type.test.ts",
  "test/integration/completion.test.ts",
  "test/integration/session.test.ts",
  "test/edge/completion.test.ts",
].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): the table names no current.
  // Re-anchored 2026-09-30 (ruling 99, C19 I30): one form, one indent less.
  file: MENU,
  from: "    current: current === null ? OUT_OF_VIEW : `${MENU_ID}-${String(current)}`,",
  to: "    current: OUT_OF_VIEW,",
  why:
    "no candidate is ever current, so no row is marked at rest or after Tab — "
    + "if this survives, the rows are not reading the mark",
};

const MUTATIONS = [
  {
    // **T6.25, on push**: the current taken from the selection alone.
    name: "T6.25: menuLayer marks nothing at rest",
    file: MENU,
    from: "    content: menuBlocks(candidates, selected ?? 0, remainder),",
    to: "    content: menuBlocks(candidates, selected, remainder),",
    expect: "T1.72",
  },
  {
    // **T6.25, on redraw**: a typed menu's current names no candidate.
    name: "T6.25: windowedBlocks marks nothing at rest",
    file: KEYS,
    from: "    const current = selection.at ?? 0;",
    to: "    const current = selection.at ?? -1;",
    expect: "T4.11",
  },
  {
    // **T6.26, the untruncated arm**: the menu's own bottom rule back.
    name: "T6.26: a bottom rule under the candidates",
    file: MENU,
    from: "  if (remainder <= 0) return Object.freeze([top, body]);",
    to: "  if (remainder <= 0) return Object.freeze([top, body, { ...top, id: `${MENU_ID}-edge` }]);",
    expect: "T3.25",
  },
  {
    // **T6.26, the truncated arm**: the rule back under the indicator.
    name: "T6.26: a bottom rule under the indicator",
    file: MENU,
    from: "    { kind: \"raw\", id: `${MENU_ID}-more`, text: `+ ${String(remainder)} more` } satisfies Block,\n  ]);",
    to: "    { kind: \"raw\", id: `${MENU_ID}-more`, text: `+ ${String(remainder)} more` } satisfies Block,\n    { ...top, id: `${MENU_ID}-edge` },\n  ]);",
    // Not the session's C19 T4.12 (titled T4.34 then, F1489), which the first draft named and which stays
    // green: the rule lands one row past the box and the frame cuts it, so no
    // stacked rule reaches the screen. The pass scored it caught because the id
    // was in the output (F1472); the FAIL lines named T4.9 (C19 T6.26).
    expect: "T4.9",
  },
  {
    // **The chrome count keeps the edge it lost**: the window shows one
    // candidate fewer than the box holds, and the remainder counts it.
    name: "menuRowsShown still charges the bottom edge",
    file: MENU,
    from: "  const chrome = placed.truncated ? 2 : 1;",
    to: "  const chrome = placed.truncated ? 3 : 2;",
    // Survived the first draft: a window one row short fits inside the box it
    // was sized for, and T4.9 asked only that nothing be cut (C19 T6.27).
    expect: "T6.27",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472). The pass reports
 * `caught` when the named row's id is anywhere in the output, and vitest prints
 * a passing row's line under a file where another row failed, so the verdict
 * alone cannot say the named row went red. The `FAIL` lines can.
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
