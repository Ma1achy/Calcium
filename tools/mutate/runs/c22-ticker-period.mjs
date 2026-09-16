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
// The fourth mutation is C03's: the window longer than the interval it floors
// (F1197's second half), which T4.35 in `spinner-wiring` sees and no row here does.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/orbit-wiring.test.ts test/integration/spinner-wiring.test.ts";
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
      // five, and T4.35 sees nine glyphs of ten.
      name: "WINDOW-100: C03's spinner window longer than the fastest glyph interval",
      file: SCHEDULER,
      from: "  spinner: 80,\n});",
      to: "  spinner: 100,\n});",
      expect: "T4.35",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
