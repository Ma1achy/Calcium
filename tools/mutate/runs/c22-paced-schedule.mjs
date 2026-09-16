// C22 I108 — the schedule C22 hands C03 dates a window from the last slot's own
// firing, floored at one sixtieth of a second. Mutated (T6.123, F1207).
//
// **Nothing here is visible in a frame**: every mutation draws the same bytes a
// little sooner or later, so T1.63 reads the delay the wrapper hands the timer
// and T4.92 reads the delay C03's composed slot hands `setTimeout`.
//
// **The replay gate is not mutated here.** Its fail-on-revert is T5.1, which
// replays a recorded PTY session against `dist/` — tier 5 needs a build the
// mutation harness does not do, so a mutation of the gate would run against
// stale bytes and read as survived. The row is real and it is named in T6.123;
// this run covers the arithmetic and the wiring, not the replay.
//
// **The control floors at twenty**, which T1.63's first arm sees and nothing
// else does: a change the corpus can see that is not a mutation of the rule.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/paced-schedule.test.ts test/integration/render-cache.test.ts";
const PS = "src/shell/paced-schedule.ts";
const CT = "src/shell/construct.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: PS,
    from: "export const FRAME_PERIOD_MS = 1000 / 60;",
    to: "export const FRAME_PERIOD_MS = 20;",
    why: "the floor is twenty: T1.63's first arm reads 20 against the sixtieth it expects, and T4.92's start-up slot with it",
  },
  mutations: [
    {
      // **Every window from the arm** — the tree before C22 I108: the lateness
      // of a firing is never recovered.
      name: "CHAIN-REMOVED: every window is dated from the arm",
      file: PS,
      from: "    const due = (chained && firing !== null ? firing.due : now) + window;",
      to: "    const due = now + window;",
      expect: "T1.63",
    },
    {
      // **No floor**: a 16 ms window dated end to end draws 62.5 a second.
      name: "FLOOR-REMOVED: the window is armed as asked",
      file: PS,
      from: "    const window = Math.max(ms, FRAME_PERIOD_MS);",
      to: "    const window = ms;",
      expect: "T1.63",
    },
    {
      // **The chain left standing after the firing**: an arm outside any
      // firing — a lapsed slot's successor, a lone commit — chains too.
      name: "CHAIN-OUTLIVES-FIRING: the deadline is left set when the callback returns",
      file: PS,
      from: "      } finally {\n        firing = null;\n      }",
      to: "      } finally {\n        firing = slot;\n      }",
      expect: "T1.63",
    },
    {
      // **The wiring**: C03 handed the ambient schedule, as before I108.
      name: "WIRING-AMBIENT: construct hands C03 the ambient schedule",
      file: CT,
      from: "          ? pacedSchedule(config.sampleClock, config.schedule)",
      to: "          ? config.schedule",
      expect: "T4.92",
    },
    {
      // **Two cadences chained into one**: the 80 ms spinner window dating the
      // 16 ms frame window, which halves the rate rather than shifting a phase.
      name: "SAME-WINDOW-REMOVED: any firing chains any arm",
      file: PS,
      from: "    const chained = firing !== null && firing.window === window;",
      to: "    const chained = firing !== null;",
      expect: "T1.63",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
