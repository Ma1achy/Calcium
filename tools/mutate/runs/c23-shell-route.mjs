// F151 — C23 §2's `shell` route, mutated.
//
// **The first mutation is the state the route shipped in.** It composed
// `status: "error"` with no `error` field, C04 I3 forbids that in both
// directions, and `transcript.append` refused every failing command — so the
// route produced no entry at all and the reader saw a fault notice citing two
// invariant numbers in place of the command they typed. If T3.17 cannot see
// that, T3.17 is not the row it claims to be.
//
// The rest are the ways this fix is quietly wrong: the stderr read reverted to
// the shape that dropped the sentence, the two streams drained in sequence, and
// a route that calls everything a failure — which would satisfy every assertion
// about the error path and break the success path nothing was watching.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/execution.test.ts";
const FILE = "src/shell/execution.ts";

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
    from: "      const failed = exit.code !== 0 || exit.signal !== null;",
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
      // T3.17 — the document is refused, so there is no entry at all.
      expect: "T3.17",
    },
    {
      // The half that is easy to lose again: `stdout` alone is what the route
      // read, and the fake agreed with it for as long as neither used `stderr`.
      // A failing command's one explanatory line lives there and nowhere else.
      name: "only stdout is drained, so the shell's own line is dropped",
      file: FILE,
      from: "      const [out, err] = await Promise.all([drain(child.stdout), drain(child.stderr)]);",
      to: "      const out = await drain(child.stdout);\n      const err = \"\";",
      // T3.17 — "list: not found" never reaches a block.
      expect: "T3.17",
    },
    {
      // A route that calls every exit a failure passes every assertion about
      // the error path. The control arm in T3.18 is the only thing that asks.
      name: "every exit is a failure, including a clean one",
      file: FILE,
      from: "      const failed = exit.code !== 0 || exit.signal !== null;",
      to: "      const failed = true;",
      // T3.18 — the success arm gets a notice and an error field it must not.
      expect: "T3.18",
    },
    {
      // A signal reported as an exit code says `code 1` for a command the user
      // killed, which is the wrong sentence about the right event.
      name: "a signal is reported as an exit code",
      file: FILE,
      from: "        exit.signal !== null\n          ? `Killed by ${exit.signal}.`\n          : ",
      to: "        false\n          ? `Killed by ${String(exit.signal)}.`\n          : ",
      // T3.18 — "Killed by SIGTERM." becomes "The command exited with code 1."
      expect: "T3.18",
    },
    {
      // The success path is asserted to be byte-identical to what it was. A
      // fix that tidies it while it is open is the change nothing asked for and
      // nothing was covering.
      name: "the success path elides an empty raw block",
      file: FILE,
      from: "            : [block({ kind: \"raw\", id: blockId(\"raw\"), text: out })],",
      to: "            : out === \"\" ? [] : [block({ kind: \"raw\", id: blockId(\"raw\"), text: out })],",
      // T3.18 — the control arm's single raw block. The default fake yields
      // "out", so this survives unless a row states the shape rather than the
      // text, which is the finding if it does.
      expect: "T3.18",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
