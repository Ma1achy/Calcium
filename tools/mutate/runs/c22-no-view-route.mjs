// C22 §13a retired — a verb's result is an entry, mutated (R-EXA-082, F1253).
//
// **What is left to mutate after a deletion is the thing the deletion had to
// leave true**, and there are three: no producer is handed a bound, the
// streaming route patches the entry it was given, and the section gesture
// reaches nobody when no owner is up. Each was carried by the view route in one
// direction and is carried by the entry route in the other, which is F1253's
// whole content — a route whose distinguishing rule is implemented by a
// function the other route already calls is not distinguished.
//
// The control is `appendAndCommit` returning before it writes: nothing a
// submission produces reaches the transcript.
//
// **Two earlier controls survived and neither was a finding about the suite.**
// The first gave `streamInto`'s `id` a default, which changes nothing when every
// caller passes one — a mutation that cannot be wrong, A03 §2's vacuity class
// aimed at a control. The second emptied the held blocks the terminal notice is
// composed against, and this run's two files do not reach that composition. The
// tell is the same both times: **a control must be a change the run's own corpus
// can see**, and the cheapest way to pick one is to name a line every row in the
// CMD passes through.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/execution.test.ts test/unit/session-keys.test.ts " +
  "test/unit/local-profile.test.ts";
const EXEC = "src/shell/execution.ts";
const HANDLERS = "src/shell/local/handlers.ts";

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
    file: EXEC,
    from: "    const line = settle?.line;\n    let id: string | null = null;",
    to: "    const line = settle?.line;\n    let id: string | null = null;\n    if (true) return null;",
    why:
      "nothing a submission produces reaches the transcript: every row reading an entry " +
      "fails, and a run where this survives is not executing this file at all"
  },
  mutations: [
    {
      // **The bound put back** (C23 I41). A producer told the region's height
      // is a transcript entry told it is bounded, and the frame it splits
      // against is not the frame it is drawn in. This is the arm the view route
      // owned, re-created on the route that replaced it.
      name: "the adapt route's producer is handed the region's height",
      file: EXEC,
      // Anchored on the line below as well: the same three-line comment and the
      // same call appear twice in this file, and an ambiguous anchor is a
      // mutation whose site nobody chose.
      from: "...producerContext(null),\n        userRequestedJson: result.argv.includes(\"--json\"),",
      to: "...producerContext(deps.region().height),\n        userRequestedJson: result.argv.includes(\"--json\"),",
      expect: "T1.60"
    },
    {
      // The same, read through a running session rather than through the file:
      // T1.46 asks what a producer was actually told, which is the half a
      // source scan cannot reach.
      name: "the bound is the terminal's, whatever the caller said",
      file: EXEC,
      from: "    width: deps.lifecycle.size().columns,\n    height,",
      to: "    width: deps.lifecycle.size().columns,\n    height: 24,",
      expect: "T1.46"
    },
    {
      // **The deck's first card, where the section's whole deck belongs**
      // (C28 §3c, R-EXA-082). This is the shape the pushed view left behind: it
      // showed one card at a time and `n` walked them, so an entry that draws
      // the first and stops is a faithful port of a surface nobody has any
      // more — and it is right about every card it does draw, which is why a
      // row asserting one panel's contents would pass.
      //
      // **It replaces the section gesture's mutation**, which named
      // `keys.ts`'s ladder bottom and expected T1.3v. Both are deleted with the
      // target (F1254), and a mutation whose subject is gone is an anchor that
      // rots rather than a control that holds.
      name: "the section arm draws the deck's first card and stops",
      file: HANDLERS,
      from: "  return doc(`/profile ${section}`, deckOf(deck, section).map((entry) =>",
      to: "  return doc(`/profile ${section}`, deckOf(deck, section).slice(0, 1).map((entry) =>",
      expect: "T1.66"
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
