// Entry 16 step 3 — the window, the collapse and the resize, mutated.
//
// **All three subjects are one defect wearing three faces**: the compositor
// writes `lines[0 … height)`, so whatever an owner puts last is what it loses,
// and every owner here was putting something load-bearing there. The menu lost
// its indicator and its bottom edge on every occasion the indicator fired; the
// confirm lost its choices, which is the reader's only way to answer.
//
// None of it was visible to an assertion. `Placed.truncated` was true, the
// remainder was computed, the anchor was a number every other number agreed
// with. A frame is what said otherwise, three times.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/integration/completion.test.ts test/integration/confirm.test.ts " +
  "test/integration/session.test.ts";
const MENU = "src/interaction/completion/menu.ts";
const KEYS = "src/shell/keys.ts";
const CONFIRM = "src/shell/confirm.ts";
const CONSTRUCT = "src/shell/construct.ts";

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
    // **The window removed at the call site**, which is the state the tree
    // shipped in. `menuWindow` still exists and still computes the right
    // answer; nothing hands it to the blocks. Every assertion about the
    // remainder passes, because the number was always right.
    name: "the menu hands over every candidate again",
    file: KEYS,
    from: "    const slice = candidates.slice(w.start, w.start + w.shown);",
    to: "    const slice = candidates;",
    expect: "T4.9",
  },
  {
    // **The window pinned at the top.** Correct for the first rows and wrong
    // the moment the selection passes the fold — the marker moves into a cut
    // row and the menu reads as frozen while the index is moving.
    name: "the window never follows the selection",
    file: MENU,
    from: "  return Object.freeze({ start: Math.max(0, at - fits + 1), shown: fits });",
    to: "  return Object.freeze({ start: 0, shown: fits });",
    expect: "T4.10",
  },
  {
    // **The floor, which is the one clamp that fires.** Without it a selection
    // in the first rows gives a negative start and the slice comes back short —
    // the menu draws fewer rows than its box, from the wrong end.
    //
    // Its two neighbours were dead and are gone: `min(at - fits + 1, total - fits)`
    // and `min(start, at)` could not be violated, which a mutation found and no
    // reading did.
    name: "the window has no floor at zero",
    file: MENU,
    from: "  return Object.freeze({ start: Math.max(0, at - fits + 1), shown: fits });",
    to: "  return Object.freeze({ start: at - fits + 1, shown: fits });",
    expect: "T4.10",
  },
  {
    // **`fits` carried across a new list** — the line tier 5 restored. Kept as
    // a listed survivor with its reason, never as a weakened assertion.
    name: "a narrowed menu keeps the previous fit",
    file: KEYS,
    from: "    fits = 0;",
    to: "",
    expect: "C19 T5.1",
  },
  {
    // **One row more than the placement holds**, which is the off-by-one the
    // chrome arithmetic invites: `menuRowsShown` already subtracts the rules
    // and the indicator, so adding a row back puts the indicator in the cut
    // again — the original defect, one row's worth.
    //
    // It sits beside *a narrowed menu keeps the previous fit*, below, which
    // this file first deleted as dead and tier 5 restored.
    name: "the window takes one row more than the placement holds",
    file: KEYS,
    from: "    const w = menuWindow(candidates.length, selected, fits);",
    to: "    const w = menuWindow(candidates.length, selected, fits + 1);",
    expect: "T4.9",
  },
  {
    // **The confirm marks its payload instead of dropping it.** The shape the
    // ruling started from, and the frame is what refused it: an appended row is
    // the first thing the clamp takes, so the indicator is drawn nowhere and
    // the choices are still gone.
    name: "the confirm appends the elision instead of replacing the payload",
    file: CONFIRM,
    from: '        ? // ASCII, because this text is authored where the capability is not\n          // (C09 I22, F122) — the same reason C19 writes its indicator flat.\n          block({ kind: "raw", id: "confirm-elided", text: "..." })\n        : opts.detail,',
    to: '        ? opts.detail\n        : opts.detail,',
    expect: "T4.28",
  },
  {
    // **The collapse fires always.** Passes every assertion about the choices
    // being on the frame, and throws away a payload that fitted — Ruling C's
    // whole subject, which is showing the reader what the answer will affect.
    name: "the payload is dropped whether or not it fitted",
    file: CONFIRM,
    from: "      if (truncated(deps)) {",
    to: "      if (true) {",
    expect: "T4.29",
  },
  {
    // **The advisory fraction back on a question.** Half the region is right
    // for a peek and wrong for something that must be answerable, and the
    // difference only shows on a short terminal.
    name: "the question takes the default height fraction",
    file: CONFIRM,
    from: "        maxHeightFraction: 0.8,\n",
    to: "",
    expect: "T4.28",
  },
  {
    // **The resize refresh dropped**, which is the state the tree shipped in.
    // Measured before the fix: the menu at row 21 with the prompt at 37.
    name: "a resize leaves the anchors where they were",
    file: CONSTRUCT,
    from: "      refreshAnchors();\n",
    to: "",
    expect: "T4.33",
  },
  {
    // **Refreshed after the frame is asked for.** The ordering that reads as a
    // preference: the commit composes from the stale placement and the fresh
    // one lands on the frame after it, so the wrong position is drawn once and
    // corrected by whatever comes next.
    name: "the anchors are refreshed after the commit",
    file: CONSTRUCT,
    from: "      pipeline.resized();\n      scheduler.commit(\"resize\");",
    to: "      scheduler.commit(\"resize\");\n      refreshAnchors();",
    expect: "T4.33",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry would name a
 * mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "a narrowed menu keeps the previous fit",
    "only a **dynamic** source constructs it — a spinner placement first, then the real set — " +
      "and no row in this set drives one. It survived, the reasoning agreed it was dead, the " +
      "line was deleted, and C19 T5.1, T5.3 and T5.4 failed with `/ps --status=` drawing " +
      "`running` and nothing else. **The line is back and the fix is elsewhere**: windowing is " +
      "now gated on `remainder > 0`, so a `fits` from the wrong placement cannot drop " +
      "candidates that fitted, and this reset is the belt beside that brace. Which is why it " +
      "survives twice over — the state is unconstructible here, and the guard above it now " +
      "covers the same case",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: MENU,
    from: "export function menuWindow(",
    to: "export function menuWindow(\n  ...control\n) {\n  throw new Error(`control ${String(control.length)}`);\n}\nfunction unusedMenuWindow(",
    why:
      "the window refuses to compute at all — if this survives, nothing in the set reaches " +
      "`menuWindow` and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
