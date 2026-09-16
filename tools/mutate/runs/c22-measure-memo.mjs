// C22 I100, C09 I70 — the session's measure memo: handed to the registry by
// the window and by C14's measurer, read and written as the registry's own,
// held by nobody past the call. Mutated.
//
// **The shape this run exists to catch is a memo that is wired at one seam and
// not the other.** The window and the measurer each measure the same entry
// through the same `WeakMap`; drop it from either and the frame still draws
// right, the heights still agree, and the only thing that changed is that a
// still document is measured every frame again — which is F1160 back, seen by
// nothing but a count. T4.88 counts at both seams, T1.44 at the registry.
//
// **Left out, with its reason.** The profiler's wrapper round `measure` also
// forwards the memo, and nothing in L4 calls `measure` with one — the two
// seams call `measureSequence` and `windowSequence`, and a child's miss reaches
// `measure` inside an already-open scope, where a handed memo is ignored by
// I70's own rule. A mutation dropping it there fails nothing and indicts
// nothing, so it is not on the list.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/blocks.test.ts test/integration/render-cache.test.ts";
const REG = "src/presentation/blocks/registry.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";
const PROBE = "src/shell/profiling/registry-probe.ts";

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
    file: REG,
    from: "      this.probe.hit(\"measure\");\n      return held.rows;",
    to: "      this.probe.hit(\"measure\");\n      return held.rows + 1;",
    why: "a memo hit answers one row too many — every group is taller on its second ask, which T1.9, T1.44 and the sequence rows all see",
  },
  mutations: [
    {
      // **The handed memo ignored.** A fresh map per call as before: the
      // answers are right, the seams agree, and the second call through the
      // caller's memo asks every child again.
      name: "MEMO-IGNORED: the registry opens a fresh memo whatever the caller handed",
      file: REG,
      from: "    this.#memo = memo ?? new Map();",
      to: "    this.#memo = new Map();",
      expect: "T1.44",
    },
    {
      // **The memo kept past the call.** A call without one reads the last
      // caller's, and the registry now holds a reference the invariant says it
      // does not; T1.44's last clause measures afresh and finds hits.
      name: "MEMO-KEPT: the caller's memo stays open for the next call",
      file: REG,
      // Re-anchored 2026-09-16 (C09 I76, F1191): the call's scratch is reset beside the memo.
      from: "    } finally {\n      this.#memo = null;\n      this.#scratch = undefined;\n    }",
      to: "    } finally {\n      if (memo === undefined) this.#memo = null;\n      this.#scratch = undefined;\n    }",
      expect: "T1.44",
    },
    {
      // **The window's sequence measure unmemoised.** Every run's height is
      // measured afresh each frame to place the window; the group misses and
      // its forty children reach the definition again.
      name: "WINDOW-SEQUENCE-UNMEMOISED: the session's window measures each run afresh",
      file: SESSION,
      from: "      measureSequence: (run: readonly Block[], w: number) => graph.blocks.measureSequence(run, w, graph.measures),",
      to: "      measureSequence: (run: readonly Block[], w: number) => graph.blocks.measureSequence(run, w),",
      expect: "T4.88",
    },
    {
      // **The window itself unmemoised.** The same seam one member over.
      name: "WINDOW-UNMEMOISED: the session's window slices each run afresh",
      file: SESSION,
      // Re-anchored 2026-09-16 (C22 I100, F1191): the scratch travels beside the memo.
      from: "        graph.blocks.windowSequence(run, w, lo, hi, graph.measures, scratch),",
      to: "        graph.blocks.windowSequence(run, w, lo, hi, undefined, scratch),",
      expect: "T4.88",
    },
    {
      // **The scratch not handed to the window** (C22 I100, F1191). Every frame
      // resolves the form and derives the plan afresh; T4.89g's scratch hits
      // read none.
      name: "SCRATCH-NOT-HANDED: the session windows the entry with no scratch",
      file: SESSION,
      from: "    const pieces = windowEntry(entryLayout(entry.doc.blocks, width), from, to, memoised, graph.scratch);",
      to: "    const pieces = windowEntry(entryLayout(entry.doc.blocks, width), from, to, memoised);",
      expect: "T4.89g",
    },
    {
      // **C14's measurer unmemoised.** The frame half still passes — the
      // window's first frame writes the memo and the second reads it — and
      // the patch half sees it: the re-measure on the new `rev` misses the
      // group and all forty children, not the two objects that changed.
      name: "MEASURER-UNMEMOISED: C14's measurer measures each entry afresh",
      file: CONSTRUCT,
      from: "        return measureEntry((run, w) => built.blocks.measureSequence(run, w, measures), blocks, width);",
      to: "        return measureEntry((run, w) => built.blocks.measureSequence(run, w), blocks, width);",
      expect: "T4.88",
    },
    {
      // **The profiler's wrapper drops the memo.** Under `spans` every
      // sequence measure goes through `sequenced`; a wrapper forwarding two
      // of three arguments leaves the memo unread on exactly the profiled
      // runs, and T4.88's patch half runs at `spans` to see it.
      name: "PROBE-DROPS-MEMO: the spanning wrapper calls measureSequence without the memo",
      file: PROBE,
      from: "    return measureSequence(blocks, width, memo);\n  };",
      to: "    return measureSequence(blocks, width);\n  };",
      expect: "T4.88",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
