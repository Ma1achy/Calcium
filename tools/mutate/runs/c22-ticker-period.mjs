// C22 I105 — the ticker's period is the longer of its interval and C03's
// window, never their sum. Mutated (T6.120, F1197).
//
// **The frame is the same under every mutation** — a spinner glyph or a camera
// angle is a function of elapsed time (I74), so a wake that comes late draws
// the state that is due — and only the count of frames in a span of the clock
// moves. T4.17u reads that count on both arms and bounds the rates; T4.17j
// bounds their ratio and is expected to survive every mutation here, which is
// the reason T4.17u exists.
//
// **The control arms nothing.** No wake, no orbit, and every rate row fails.
//
// **Two of these mutate C03's window table, and the rows that see them are in
// `test/unit/frame-scheduler.test.ts`** — T1.7 asserts `[80]` with F1197's own
// *80 and not 100* beside it, T1.3 asserts `[16]`. Both survived until the
// `CMD` was widened to run that file (F1214): each named a row in a suite the
// `CMD` did execute, which is the only direction the harness checks, and the
// exact witness sat one directory away. T4.35 is no longer one of them — the
// surplus sampling that defeated aliasing, 150 ms x 30, also made it blind to a
// 25% change in the window, so the row written against this mutation cannot
// fail it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/frame-scheduler.test.ts test/integration/orbit-wiring.test.ts test/integration/spinner-wiring.test.ts";
const SESSION = "src/shell/session.ts";
const SCHEDULER = "src/terminal/frame-scheduler.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER, timeout: 600_000 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const ARM = "    this.#spinner = this.config.schedule(() => void this.#animate(), Math.max(0, due - now));";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SESSION,
    from: ARM,
    to: "    this.#spinner = null;",
    why: "nothing is armed, so no orbit turns and no spinner counts: every rate and angle row fails",
  },
  mutations: [
    {
      // **The shipped code**: the full interval from the paint, laid end to end
      // with the window — 5 and 15 over 990 ms, which T4.17j's ratio accepts.
      name: "FROM-THE-PAINT: the wake is armed for the fastest interval counted from the paint",
      file: SESSION,
      from: ARM,
      to: "    this.#spinner = this.config.schedule(() => void this.#animate(), Math.min(...[spinnerMs, orbitMs, framesMs].filter((m): m is number => m !== null)));",
      expect: "T4.17u",
    },
    {
      // **The stamps ignored**: due is counted from now, which is the same
      // period by another route — the paint's lateness is not subtracted.
      name: "STAMP-IGNORED: the spinner's and the orbit's due times are counted from now, not from their stamps",
      file: SESSION,
      from: "    if (spinnerMs !== null) due = Math.min(due, this.#tickAt + spinnerMs);\n    if (orbitMs !== null) due = Math.min(due, this.#motionAt + orbitMs);",
      to: "    if (spinnerMs !== null) due = Math.min(due, now + spinnerMs);\n    if (orbitMs !== null) due = Math.min(due, now + orbitMs);",
      expect: "T4.17u",
    },
    {
      // **Only the orbit corrected**: the spinner keeps the old period and
      // T4.17u's first arm fails alone.
      name: "SPINNER-FROM-NOW: the orbit is due from its stamp and the spinner from the paint",
      file: SESSION,
      from: "    if (spinnerMs !== null) due = Math.min(due, this.#tickAt + spinnerMs);",
      to: "    if (spinnerMs !== null) due = Math.min(due, now + spinnerMs);",
      expect: "T4.17u",
    },
    {
      // **The second half**: the window back at 100 over an 80 ms set. The
      // period is the window, the frames fall on ticks 1, 2, 3, 5 of every
      // five. **T4.35 was written for that and no longer sees it** (F1214); the
      // row that does is T1.7, which asserts the integer itself.
      name: "WINDOW-100: C03's spinner window longer than the fastest glyph interval",
      file: SCHEDULER,
      from: "  spinner: 80,\n});",
      to: "  spinner: 100,\n});",
      expect: "T1.7",
    },
    {
      // **The window back at 33** (F1199), and **the row that was said to see it
      // does not** — measured, not inferred (F1214): T4.17u's orbit count over
      // sixty-two 16 ms wakes reads **58 at a 16 ms window, 57 at 33 and 47 at
      // 200**, where the window as a floor would give about five. Its rate is
      // set by `ORBIT_MS`, which `ORBIT-33` mutates and which is caught. T1.3
      // asserts the 16 this table arms, which is the only exact witness.
      name: "STREAM-33: C03's stream window at the 30 fps it shipped with",
      file: SCHEDULER,
      from: "  stream: 16,\n",
      to: "  stream: 33,\n",
      expect: "T1.3",
    },
    {
      // **The orbit's own cadence back at 33** with the window at 16: the
      // interval is the longer of the two and the orbit draws at 30 again.
      name: "ORBIT-33: ORBIT_MS at the cadence the stream window used to set",
      file: SESSION,
      from: "const ORBIT_MS = 16;",
      to: "const ORBIT_MS = 33;",
      expect: "T4.17u",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
