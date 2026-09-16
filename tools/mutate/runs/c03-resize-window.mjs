// C03 I15 — resize as a coalesced reason, and C22's handler no longer writing
// the width. Mutated.
//
// **The row this run exists for is `HANDLER-RESIZE-BACK`.** The defect was a
// second writer of the viewport's width whose only effect was to re-measure the
// whole transcript per `SIGWINCH` instead of per frame — 544 ms for a 30-event
// drag at a thousand entries (F423) — and **every frame it produced was
// correct**. A suite indexed by what a frame contains cannot see it, which is
// why it survived to be measured rather than reviewed. So the question this run
// asks is whether anything at all fails when the writer comes back.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/unit/frame-scheduler.test.ts",
  "test/unit/profiler-seams.test.ts",
  "test/contract/frame-scheduler.test.ts",
  "test/edge/frame-scheduler.test.ts",
  "test/revert/frame-scheduler.test.ts",
  "test/integration/frame-scheduler.test.ts",
  "test/integration/lifecycle.test.ts",
  "test/integration/viewport.test.ts",
].join(" ");

const SCHED = "src/terminal/frame-scheduler.ts";
const SHELL = "src/shell/construct.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SCHED,
    from: 'const IMMEDIATE: ReadonlySet<CommitReason> = new Set<CommitReason>(["input", "completion"]);',
    to: "const IMMEDIATE: ReadonlySet<CommitReason> = new Set<CommitReason>([]);",
    why: "input immediacy is C03 I2 and half this file asserts it; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The state before C03 I15. Every frame it writes is correct — just thirty
      // times over — so this is the mutation that says whether the suite can
      // see a cost rather than a contradiction.
      name: "RESIZE-IMMEDIATE: resize goes back to writing per signal",
      file: SCHED,
      from: 'new Set<CommitReason>(["input", "completion"]);',
      to: 'new Set<CommitReason>(["input", "completion", "resize"]);',
      expect: "T1.21",
    },
    {
      // §3's strictly-shorter rule, relaxed into a sliding window. A window
      // re-armed on every commit never fires during a continuous drag — the
      // starvation case §8a A1 rules against, and what a per-event `setTimeout`
      // in the handler would have produced.
      name: "WINDOW-SLIDES: the deadline is re-armed by every resize",
      file: SCHED,
      from: "if (state !== \"idle\" && armed !== null && ms >= armed) {",
      to: "if (state !== \"idle\" && armed !== null && ms > armed) {",
      expect: "T1.22",
    },
    {
      // The window without the eager flag. C03 I7 sets contamination at commit so a
      // frame written for any reason inside the window is a repaint; take it
      // away and an input mid-drag diffs against dimensions that are gone.
      name: "CONTAMINATION-DROPPED: the flag is no longer set at commit",
      file: SCHED,
      from: '    if (reason === "resize") contaminated = true;',
      to: "",
      expect: "T1.10",
    },
    {
      // Two rejections with two reasons, collapsed back into one. The message a
      // user reads would say "never delayed" about a reason delayed by 16 ms.
      name: "FIXED-WINDOW-CONFIGURABLE: a config may lengthen the resize window",
      file: SCHED,
      from: "    if (FIXED_WINDOW.has(key)) {",
      to: "    if (false as boolean) {",
      expect: "T2.5",
    },
    {
      // **The one this run exists for.** The second writer restored: correct
      // frames, correct rows, and the transcript re-measured per signal.
      name: "HANDLER-RESIZE-BACK: the resize handler writes the width again",
      file: SHELL,
      from: "      pipeline.resized();\n      scheduler.commit(\"resize\");",
      to:
        "      stores.viewport.resize({ width: lifecycle.size().columns, " +
        "height: stores.viewport.scroll.viewportHeight });\n" +
        "      pipeline.resized();\n      scheduler.commit(\"resize\");",
      expect: "T4.7",
    },
    {
      // **The tie flattened** (C03 T6.18, F1199). `stream` and `resize` share
      // 16 ms, so strictness by window alone hands a repaint the last reason
      // committed, and T1.24 reads `stream`.
      name: "TIE-FLAT: strictness is the window alone, and resize ties with stream",
      file: SCHED,
      from: '    return -windows[reason] + (reason === "resize" ? 0.5 : 0);',
      to: "    return -windows[reason];",
      expect: "T1.24",
    },
    {
      // **The slot cancelled when nothing was deferred** — the tree before
      // F1200 (C03 T6.19). The next commit arms its own window and the
      // frames sit at 16, 33, 50 again.
      name: "SLOT-CANCELLED: a write whose deferral is empty cancels the slot it opened",
      file: SCHED,
      from: "    if (first === null) return; // The slot the write opened stands (I17).",
      to: '    if (first === null) {\n      cancelTimer();\n      state = "idle";\n      return;\n    }',
      expect: "T1.26",
    },
    {
      // **A lapsing slot writes.** The timer's paced arm removed: a slot with
      // nothing in it renders a frame nobody committed.
      name: "LAPSE-WRITES: the slot's timer runs the write whether or not anything is pending",
      file: SCHED,
      from: '      if (state === "paced") {\n        state = "idle";\n        return;\n      }\n      runWrite();',
      to: "      runWrite();",
      expect: "T1.27",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
