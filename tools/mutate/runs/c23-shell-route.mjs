// C23 §3c — the shell route as a live screen, mutated.
//
// **What this run replaces.** Its first version was written against a route that
// drained both streams into a string and appended one `raw` block; three of its
// five mutations named lines that no longer exist. A run whose anchors have gone
// is not a weaker run, it is a run that tests nothing — `anchors.mjs` is the
// only thing that says so, and it said so here.
//
// The mutations below are the ways the live route is quietly wrong: an arm
// chosen by trying rather than asking, a coalescing gate that draws anyway, a
// settle that reads the screen before the parser has it, a cursor left on a
// screen nobody is writing to, and a resize that reaches the emulator first.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/execution.test.ts test/unit/emulator.test.ts " +
  "test/contract/notice-family.test.ts";
const FILE = "src/shell/execution.ts";
const RUNNER = "src/data/process/runner.ts";

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
    file: FILE,
    from: "      const failed = cancelled || exit.code !== 0 || exit.signal !== null;",
    to: "      const failed = false;",
    why:
      "a route that never fails cannot satisfy a row about failing — T3.17 asserts the entry, " +
      "its status and its error field, so a pass where this survives is a pass that saw no kill",
  },
  mutations: [
    {
      // **The measured instance**, in the shape it had for the life of the
      // build: the status set from the exit code and no `error` beside it. It
      // reads as correct — the status is right — and it is the one combination
      // C04 I3 forbids.
      name: "status \"error\" composed with no error field, as it shipped",
      file: FILE,
      from: "          ...(failed\n            ? {\n                error: {",
      to: "          ...(false\n            ? {\n                error: {",
      expect: "T3.17",
    },
    {
      // A route that calls every exit a failure passes every assertion about
      // the error path. The control arm in T3.18 is the only thing that asks.
      name: "every exit is a failure, including a clean one",
      file: FILE,
      from: "      const failed = cancelled || exit.code !== 0 || exit.signal !== null;",
      to: "      const failed = true;",
      expect: "T3.18",
    },
    {
      // A signal reported as an exit code says `code 1` for a command the user
      // killed, which is the wrong sentence about the right event.
      name: "a signal is reported as an exit code",
      file: FILE,
      from: "        : exit.signal !== null\n          ? `Killed by ${exit.signal}.`",
      to: "        : false\n          ? `Killed by ${String(exit.signal)}.`",
      expect: "T3.18",
    },
    {
      // **The arm chosen by trying rather than asking** (C23 I63, C21 I18). The
      // flag exists so a configuration error is not indistinguishable from a
      // child that failed to start; hard-coding it true is the half that fails
      // on a runner with no factory, which is the ordinary case.
      name: "the PTY arm is taken whether or not a factory was injected",
      file: FILE,
      from: "      const usePty = deps.runner.hasPty;",
      to: "      const usePty = true;",
      expect: "T1.52",
    },
    {
      // The other direction, and the one that reads as conservative: never
      // taking the terminal arm loses the child's colours with no cause.
      name: "the pipe arm is always taken",
      file: FILE,
      from: "      const usePty = deps.runner.hasPty;",
      to: "      const usePty = false;",
      expect: "T1.52",
    },
    {
      // `hasPty` answering from anywhere but the deps. The flag and the throw
      // then disagree, which is the state T1.13 was written against.
      name: "hasPty is a constant rather than a report",
      file: RUNNER,
      from: "    get hasPty(): boolean {\n      return deps.pty !== undefined;\n    },",
      to: "    hasPty: true,",
      expect: "T1.13",
    },
    {
      // **The coalescing gate removed** (C23 I64). Every frame it draws is
      // correct — a hundred times over — which is C03's own defect shape and
      // the reason this row counts patches rather than reading one.
      name: "every chunk draws, whatever the scheduler is holding",
      file: FILE,
      from: "        if (!deps.scheduler.pending) draw();",
      to: "        draw();",
      expect: "T1.51",
    },
    {
      // The gate inverted into a suppression with no catch-up: the tail of a
      // quiet child then waits for a chunk that never comes, and the readout is
      // the only thing that would have rendered it.
      name: "the readout registration is dropped",
      file: FILE,
      from: "    refresh.readout(pendingId, scrollId, () => snapshot());",
      to: "    void snapshot;",
      expect: "T1.53",
    },
    {
      // **The accept gate, back where it does not close the window** (F850's
      // second instance). `finished` is set after the drain, so a chunk accepted
      // while `writes` is awaited chains onto it past the await and writes to a
      // disposed emulator. One scheduler turn wide: it reproduced on CI and not
      // on the machine that wrote it.
      name: "the accept gate closes after the drain rather than before it",
      file: FILE,
      from: "      accepting = false;\n      // **Before anything reads the screen**",
      to: "      // **Before anything reads the screen**",
      expect: "T3.64",
    },
    {
      // **The settle reading a screen the parser has not caught up with**
      // (C27 I3). Measured: a command whose whole output was one line settled
      // blank, and every assertion about its exit code passed.
      name: "the writes in flight are not awaited before the final snapshot",
      file: FILE,
      from: "      await writes;\n      dropResize();",
      to: "      dropResize();",
      expect: "T3.17",
    },
    {
      // A cursor left on a settled screen draws a caret nobody is writing at.
      name: "the cursor survives the settle",
      file: FILE,
      from: "      delete final.cursor;",
      to: "",
      expect: "T2.47",
    },
    {
      // **The child told a width the emulator does not have** (C23 I65).
      //
      // The rule here was an ordering claim twice, and three mutations of the
      // order survived a row written to catch them — a repaint reaches the
      // emulator through the write queue, so no write can land between the two
      // calls however they are sequenced (F852). What can be wrong is the
      // figure: the region is four columns wider than the body.
      name: "the child is told the region's width rather than the body's",
      file: FILE,
      from: "          resizeChild?.(next, rows);",
      to: "          resizeChild?.(deps.region().width, rows);",
      expect: "T4.64",
    },
    {
      // A `spawnPty` that throws, caught and retried on pipes. A configuration
      // error becomes a child that merely lost its colours.
      name: "a failed PTY spawn falls back to the pipe arm",
      file: FILE,
      from: "      const usePty = deps.runner.hasPty;",
      to: "      const usePty = deps.runner.hasPty && command !== command;",
      expect: "T3.63",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
