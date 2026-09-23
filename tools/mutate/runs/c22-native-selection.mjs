// Copy mode — the producer, the exit, the hold and the toggle, mutated.
//
// **Every mutation here leaves a mode that still works from the outside.** The
// key is still bound, the flag still moves, the header still says COPY. What
// changes is whether the mode can be *left*, whether the hold lets a resize
// through, and whether resuming abandons the diff — none of which a row about
// "does ⌥v enter copy mode" can see.
//
// The fourth thing worth mutating is not here, and that is the finding rather
// than a gap: **a second writer of the mouse escape is caught by `make
// enforce`, not by a test.** SS14 bans an escape literal outside
// `terminal/escapes.ts` and SS15 bans the private-mode numbers themselves, so
// applying the toggle from `session.ts` fails the gate before any suite runs.
// A mutation asserting it here would be a second, weaker copy of a rule that
// already holds.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/frame-scheduler.test.ts test/unit/lifecycle.test.ts " +
  "test/integration/session.test.ts";
const SCHED = "src/terminal/frame-scheduler.ts";
const LIFE = "src/terminal/lifecycle.ts";
const SESSION = "src/shell/session.ts";

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
    // **B1, restored.** The state the tree was in for the whole of C26: the
    // ⌃c rung resolves, consumes the key and calls something that does nothing.
    // Entering still works, the indicator still appears, and the reader is
    // stuck — which is why the entry and the exit ship in one commit.
    name: "the exit is a stub again — copy mode can be entered and not left",
    file: SESSION,
    from: "      exitCopyMode: () => this.#setCopyMode(false),",
    to: "      exitCopyMode: () => undefined,",
    expect: "T4.31",
  },
  {
    // **The seam's whole argument, reversed.** A repaint on resume looks
    // identical on a screen and throws away the property that chose
    // `suspend()`/`resume()` over a no-op `render`: suspension writes nothing,
    // so the diff's model of the terminal is still true.
    name: "resume repaints instead of diffing",
    file: SCHED,
    from: "    suspended = false;\n    // **An ordinary commit",
    to: "    suspended = false;\n    contaminated = true;\n    // **An ordinary commit",
    expect: "T1.19",
  },
  {
    // **The one case where deferring costs state nobody can see.** Suspension
    // holding a contaminated write is the plausible reading — "suspended means
    // nothing is written" — and it leaves a wrapped line scrolling the
    // alternate screen with the application unable to observe it.
    name: "suspension holds a contaminated write too",
    file: SCHED,
    from: "    if (suspended && !contaminated) {",
    to: "    if (suspended) {",
    expect: "T1.16",
  },
  {
    // **The record and the modes disagree.** Leaving `held` untouched makes
    // release emit a second `leave` for a mode already left, and makes the
    // idempotence check answer from a stale set. One record, or two that drift.
    name: "the mouse toggle does not update `held`",
    file: LIFE,
    from: "    emit(mouseMode.leave);\n    held.delete(\"mouse\");",
    to: "    emit(mouseMode.leave);",
    expect: "T1.23",
  },
  {
    // **The guard that keeps a child's modes a child's.** While suspended the
    // terminal belongs to something else, and writing a mode into it is the
    // class C01's state machine exists to prevent.
    name: "the toggle fires while suspended",
    file: LIFE,
    from: '    if (state !== "acquired") return; // suspended or released: not ours to change.',
    to: '    if (state === "released") return;',
    expect: "T1.24",
  },
  {
    // **The order inside the transition.** Suspending before the indicator's
    // frame is drawn is the natural writing order and it is wrong: the reader
    // is told nothing and simply finds the mouse dead, which is the failure the
    // indicator exists to prevent.
    name: "the hold takes effect before the indicator is drawn",
    file: SESSION,
    from: '      graph.scheduler.commit("input");\n      graph.scheduler.flush();\n      graph.scheduler.suspend();',
    to: '      graph.scheduler.suspend();\n      graph.scheduler.commit("input");\n      graph.scheduler.flush();',
    expect: "T4.30",
  },
  {
    // **The order inside the exit** (C22 T6.91). Resuming first paints a frame
    // into a terminal whose selection is still the terminal's; T4.31 passes,
    // because it asks whether both bytes arrived and not which came first.
    name: "the exit resumes the screen before it takes the mouse back",
    file: SESSION,
    from: "    graph.lifecycle.setMouseTracking(true);\n    graph.scheduler.resume();",
    to: "    graph.scheduler.resume();\n    graph.lifecycle.setMouseTracking(true);",
    expect: "T4.31b",
  },
  {
    // **Tracking back, screen never** (C22 T6.92). From the reader's chair a
    // session that has hung with a live mouse; the indicator stays because no
    // frame is written to remove it.
    name: "the exit drops resume()",
    file: SESSION,
    from: "    graph.lifecycle.setMouseTracking(true);\n    graph.scheduler.resume();",
    to: "    graph.lifecycle.setMouseTracking(true);",
    expect: "T4.32",
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
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SCHED,
    from: "    if (suspended && !contaminated) {",
    to: "    if (true) {",
    why:
      "the scheduler never writes anything at all — if this survives, no row in the set reaches " +
      "a frame and every kill below is unearned",
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
