// C22 §4 gate 3b — the usability gate (C22 I61, F8).
//
// **The four rows here are the ones a green run cannot distinguish from four
// restatements of one rule.** Each mutation is a tree somebody could plausibly
// have written — the gate ahead of construction, the gate after acquire, a
// constant message, the two gates swapped — and three of them leave T3.20
// passing, which is the whole reason the row set has four members rather than
// one.
//
// Unit-tier, so no rebuild: these rows drive `createTui` against a fake TTY
// (`test/edge/session-gate.test.ts`) and read the source tree directly.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/edge/session-gate.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

// **The gate's body grew and the pasted copy rotted with nothing watching**
// (F140 added the teardown, F1117 found it). `from: GATE` is a *name*, and the
// anchor reader required a literal in that position — so this was not a stale
// anchor, it was **not an anchor**: the mutation fell out of the corpus and this
// run's control threw at its first `apply`, unstartable, while the sweep said no
// run had drifted.
//
// Computed from both ends now rather than pasted, so the comment block the
// teardown brought with it cannot rot it again. The ends are short, unique and
// load-bearing: the predicate, and the throw the gate exists to reach.
const GATE_HEAD = "    if (!isUsable(this.#graph.capabilities)) {";
const GATE_TAIL = "      throw new UnusableTerminalError(cause);\n    }";

// **The span, computed rather than pasted**, because "the gate runs after
// acquire" has to *move* it and a mutation that only adds one leaves the
// original firing first — which is how that row survived its first run looking
// like a finding about the test. The middle is gate 4's whole body and is not
// worth reproducing here; anchoring on both ends and slicing keeps the two
// halves of the move in one replacement.
const SRC = readFileSync(`${ROOT}/src/shell/session.ts`, "utf8");
const OPEN = "    this.#open();\n  }";
// **Both ends asserted before the slice.** `indexOf` returning −1 makes
// `slice` read from the end of the file and produces an anchor that matches
// nothing — a script that reports success having found nothing, which is the
// rule this repo applies to its own edit scripts.
const GATE_AT = SRC.indexOf(GATE_HEAD);
const GATE_TO = SRC.indexOf(GATE_TAIL, GATE_AT);
if (GATE_AT === -1 || GATE_TO === -1) {
  throw new Error("c22-gate3b: the gate's head or tail is no longer in session.ts — re-derive both before running");
}
const GATE = SRC.slice(GATE_AT, GATE_TO + GATE_TAIL.length);
const SPAN = SRC.slice(GATE_AT, SRC.indexOf(OPEN) + OPEN.length);
const MOVED = SPAN.slice(GATE.length).replace(OPEN, `${GATE}\n${OPEN}`).replace(/^\n+/, "");

const results = runPass({
  read,
  write,
  run,
  // **A literal, so the sweep watches it** (F1117). The control was `from: GATE`
  // — a name — and that is the one form the anchor reader could not see, which
  // is how it sat stale long enough for the run to be unstartable. The throw is
  // the gate's whole purpose and one line of it, so the anchor is short, unique
  // and rots only when the thing it is about changes.
  control: {
    file: "src/shell/session.ts",
    from: "      throw new UnusableTerminalError(cause);",
    to: "",
    why: "with the throw gone nothing refuses an empty `env` — `start()` resolves — so T3.20 cannot pass, and a run where this survives is a run that cannot see a kill at all",
  },
  mutations: [
    {
      // **The one the spec argues about at length**, and the only mutation here
      // that makes the tree *look* better: reading the env directly is simpler,
      // needs no resolved record, and could sit beside gate 1 with nothing
      // constructed — I36's own preference. It refuses the app that supplied a
      // valid `altScreen` override, which C02 I4 entitles to open.
      name: "the gate reads `config.env` instead of the resolved record",
      file: "src/shell/session.ts",
      from: "if (!isUsable(this.#graph.capabilities)) {",
      to: 'if (this.config.env["TERM"] === undefined || this.config.env["TERM"] === "dumb") {',
      expect: "T3.20b",
    },
    {
      // The refusal still arrives and still names the field; C01 has entered
      // the alternate screen by the time it does. Every assertion about the
      // error survives this, which is why T3.20 asserts the screen as well.
      name: "the gate runs after acquire, so C01 refuses first",
      file: "src/shell/session.ts",
      from: SPAN,
      to: MOVED,
      expect: "T3.20",
    },
    {
      // **This one survived on its first run and the test was wrong, not the
      // code.** Pinning `term` to `undefined` makes every refusal answer
      // *"`TERM` is not set"* — which still contains `TERM` and still omits
      // `TuiConfig.env`, so T3.20c passed while the dumb arm had been deleted.
      // The row claimed to separate three arms and separated two. It now names
      // the value, and asserts a missing `TERM` does *not* name it.
      name: "the `dumb` arm is deleted — every cause becomes `TERM` is not set",
      file: "src/shell/session.ts",
      from: '  const term = env["TERM"];',
      to: '  const term = undefined as string | undefined;',
      expect: "T3.20c",
    },
    {
      // **The tree the first ruling actually specified**, and the diff is what
      // disproved it — not this pass. Deferring an unusable terminal on size
      // waits for a resize that cannot cure it and then throws C01's unnamed
      // fatal out of an unguarded `onResize`, after `start()` resolved. T3.20,
      // T3.20b and T3.20c are all untouched by it.
      name: "gate 3b is moved back after gate 4, as the first ruling had it",
      file: "src/shell/session.ts",
      from: `${GATE}\n\n    const size = this.#graph.lifecycle.size();`,
      to: "    const size = this.#graph.lifecycle.size();",
      expect: "T3.20d",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
