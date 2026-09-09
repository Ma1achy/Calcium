// C06 I19 — `durationMs` is two monotonic readings apart (F972).
//
// **One mutation and a control, because the row it names is one row.** T1.13
// ticks the injected `elapsed` 150 ms between spawn and close and asserts the
// figure; a transport that reads once is green under every other row in the
// file — the escalation ladder is on `schedule`, and no row but this one looks
// at the figure. The wiring above C06 — the root handing the transport
// `config.clock` — is C28 T5.1c's to see, and lives in c28-profiler.mjs.
//
// **Anchored on the settle path with its neighbour**, because the same line is
// written three times in `subprocess.ts` — the spawn failure, the settle and
// the stream's end — and `replace()` takes the first (F219).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const FILE = "src/data/transport/subprocess.ts";
const CMD = "npx vitest run test/unit/transport.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "        signal: exit.signal,\n        stdout,\n",
    to: "        signal: exit.signal,\n        stdout: undefined,\n",
    why: "T1.6 asserts the settled payload; a result that drops it fails at once",
  },
  mutations: [
    {
      // **The natural line**: a figure of zero is a number, the result is
      // well-formed, and every parity row compares fields that are still there.
      name: "DURATION-ONE-READ: durationMs is the start read against itself",
      file: FILE,
      from: "        stderr: err.text(),\n        durationMs: clock.elapsed() - started,",
      to: "        stderr: err.text(),\n        durationMs: 0,",
      expect: "T1.13",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
