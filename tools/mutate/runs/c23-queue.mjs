// Roadmap 33 — the queue, mutated.
//
// **Three of these were named before the code existed**, which is the only way
// to know a row was written to catch something rather than to describe what was
// built. Each is a defect a one-item fixture cannot see:
//
//   DRAIN-ALL     the loop empties the queue on one release. Every one-item
//                 fixture passes; it takes two submissions and one completion.
//   STACK         the queue drains from the end. Both items settle, so a row
//                 asserting *both settled* passes — the pair is the claim.
//   CANCEL-ORDER  `clearQueue()` after the release instead of before, so the
//                 release drains and the next item starts on the keystroke that
//                 was meant to stop everything. Invisible with one item, because
//                 there is nothing behind it to start.
//
// The fourth and fifth are the seam: `into` ignored at `appendAndCommit`, and
// `runApp` appending a fresh pending entry over the queued one — the site the
// compiler could not check, and the one that actually failed when it was built.
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
    from: "      enqueue(line, result);",
    to: "      return;",
    why: "with nothing enqueued the guard silently swallows every second submission; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      name: "DRAIN-ALL: the loop empties the queue rather than stopping at the guard",
      file: FILE,
      from: "      while (guard.route === null) {",
      to: "      while (queue.length > 0) {",
      expect: "T3.18",
    },
    {
      name: "STACK: the queue drains from the end",
      file: FILE,
      from: "        const next = queue.shift();",
      to: "        const next = queue.pop();",
      expect: "T3.19",
    },
    {
      name: "CANCEL-ORDER: the queue is cleared after the release, not before",
      file: FILE,
      from: "      cancelInFlight?.();\n      clearQueue();\n      guard.release();",
      to: "      cancelInFlight?.();\n      guard.release();\n      clearQueue();",
      expect: "T3.20",
    },
    {
      name: "the seam is ignored — every arm appends, which is the default behaviour",
      file: FILE,
      from: "      if (settle?.into != null) {",
      to: "      if (false && settle?.into != null) {",
      expect: "T1.6",
    },
    {
      name: "runApp appends a fresh pending entry over the queued one",
      file: FILE,
      // Re-anchored 2026-09-05 (Lane P, C23 I54): step 3 became an `if` over `settle.into`
      // when the pending entry became the card; the mutation is the same one.
      from: "    if (settle.into === null) {\n      pendingId = deps.transcript.append(",
      to: "    if (true) {\n      pendingId = deps.transcript.append(",
      expect: "T3.17",
    },
    {
      name: "a queued VIEW invocation never settles the entry it was given",
      file: FILE,
      from: "      if (settle.into !== null) {",
      to: "      if (false && settle.into !== null) {",
      expect: "T3.21",
    },
    {
      name: "a queued submission's history is written when it is typed, not when it runs",
      file: FILE,
      from: "    queue.push({ line, result, id });",
      to: "    queue.push({ line, result, id });\n    deps.history.append(line, 0);",
      expect: "T1.21b",
    },
    {
      name: "enqueue's append escapes containment",
      file: FILE,
      from: "      contain(\"enqueue\", cause);\n      return;",
      to: "      throw cause;",
      expect: "T1.46",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
