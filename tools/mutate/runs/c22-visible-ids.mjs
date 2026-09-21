// C22 I106 — the visibility gate's set of ids is built once per range object.
// Mutated (T6.121, F1201).
//
// **Two mutations, one row each way.** A set rebuilt on every call has the
// right members and a fresh identity; a set never rebuilt keeps the first
// identity and answers a new range from the old members. T1.61 asserts both
// halves, so each mutation fails exactly the half the other passes.
//
// **The control is the set with nothing in it**: `of()` returns an empty set
// and every membership row reads `false`.
//
// **Blind spot, stated.** The wiring in `construct.ts` — the gate reading
// `visibleIds.of(...).has(...)` in place of the `.some` it replaced — has no
// observable but cost: both forms answer the same on every host, so no row can
// fail when the wrapper is reverted. The bench (`tools/bench/stress.mjs
// stream`) is what sees it, and F1201's close carries the figure.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/visible-ids.test.ts";
const VI = "src/shell/visible-ids.ts";

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
    file: VI,
    from: "      for (const entry of range.entries) ids.add(entry.id);",
    to: "      void range.entries;",
    why: "the set is built with nothing in it: every membership row reads false",
  },
  mutations: [
    {
      // **Rebuilt on every call.** The members are right and the identity is
      // fresh each time — the tree before I106, with a set in place of a walk.
      name: "REBUILT-PER-CALL: the range it last saw is never compared",
      file: VI,
      from: "    if (range !== this.#range) {",
      to: "    if (range !== this.#range || true) {",
      expect: "T1.61",
    },
    {
      // **Never rebuilt.** The first range's set is kept for ever and a second
      // range's id is answered from the first's members.
      name: "STALE-SET: the set is built once and the range is compared to nothing",
      file: VI,
      from: "    if (range !== this.#range) {",
      to: "    if (this.#range === null) {",
      expect: "T1.61",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
