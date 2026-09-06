// C02 I11 — the identification gated once, and every reader seeing the gate.
// Mutated.
//
// **The row this run exists for is `GATE-PER-READER`.** The defect is not a
// wrong answer: it is the gate applied to one capability instead of to the
// identification, which answers correctly for that one and wrongly for the other
// two. Thirty-four capability tests passed unchanged on the day the gate landed,
// because nothing had ever asserted the three readers together inside tmux — so
// the question this run asks is whether a row can now tell a gate on the
// identification from a gate on a reader.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/capabilities.test.ts test/edge/capabilities.test.ts " +
  "test/contract/capabilities.test.ts";
const CAPS = "src/terminal/capabilities.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: CAPS,
    // **The first control here could not be caught and the harness said so.** It
    // added an *unused* entry to `BY_TERM` — nothing enumerates the table, it is
    // a lookup, so the mutation was unobservable by construction. A control has
    // to be a thing the suite asserts, not merely a change to the subject.
    from: '  "xterm-kitty": "kitty",',
    to: '  "xterm-kitty": "wezterm",',
    why: "kitty's protocol arm is asserted directly; a run where re-pointing it survives cannot see a kill",
  },
  mutations: [
    {
      // The state before F432: the identification reaches every capability and
      // only `colourDepth` remembers the multiplexer.
      name: "GATE-DROPPED: the identification is not gated at all",
      file: CAPS,
      from: "  const terminal = inTmux ? null : identified;",
      to: "  const terminal = identified;",
      expect: "T1.12b",
    },
    {
      // **The one this run exists for.** The gate re-applied per reader, on the
      // reader that already had it — correct for `colourDepth`, wrong for the
      // other two, and invisible to any row that names one capability.
      name: "GATE-PER-READER: only `colourDepth` asks whether the sequence arrives",
      file: CAPS,
      from: "  const terminal = inTmux ? null : identified;",
      to: "  const terminal = identified;",
      also: [
        {
          file: CAPS,
          from: "  if (terminal !== null) return 24;",
          to: "  if (terminal !== null && !inTmuxGate()) return 24;",
        },
        {
          file: CAPS,
          from: "function detectColourDepth(",
          to: "function inTmuxGate() { return process.env[\"TMUX\"] !== undefined; }\nfunction detectColourDepth(",
        },
      ],
      expect: "T1.12b",
    },
    {
      // The gate inverted: applied outside a multiplexer and not inside it. The
      // answers are all wrong and every one of them is a plausible value, which
      // is what a row asserting a *type* rather than a value would miss.
      name: "GATE-INVERTED: the identification applies only inside tmux",
      file: CAPS,
      from: "  const terminal = inTmux ? null : identified;",
      to: "  const terminal = inTmux ? identified : null;",
      expect: "T1.12b",
    },
    {
      // `TERM_PROGRAM` is the route that survives the hop, so a gate that only
      // looked at `TERM` would leave the reachable case ungated.
      name: "PROGRAM-ROUTE-LOST: identification by TERM_PROGRAM is dropped",
      file: CAPS,
      from: "  const byProgram = program === undefined ? undefined : BY_PROGRAM[program];",
      to: "  const byProgram = undefined;",
      expect: "T1.12c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
