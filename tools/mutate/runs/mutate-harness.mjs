// Group 9 — the mutation harness, mutated by itself.
//
// **The self-reference is sound and worth stating.** The file being mutated is
// loaded into *this* process before the first write; each run is a fresh child
// `vitest`, which imports the mutated copy. So the harness doing the mutating is
// never the harness under test, and a mutation that broke reporting would break
// the child's assertions rather than this process's arithmetic.
//
// What it cannot check is itself going blind during this very pass — the same
// residue MH4c is about, one level up. The control pair is the only guard there,
// and it is why the pair exists.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/mutate-harness.test.ts";
const FILE = "tools/mutate/mutate.mjs";

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
    from: "export function apply(src, { file, from, to }) {\n  if (!src.includes(from)) throw new AnchorError(file, from);",
    to: "export function apply(src, { file, from, to }) {\n  if (false) throw new AnchorError(file, from);",
    why: "MH3 asserts an unmatched anchor throws; an `apply` that never throws cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The defect that shipped.** The colours sit between `Tests` and the
      // count, so the naive regex reads every kill as a survivor.
      name: "the summary is read without stripping the colours",
      file: FILE,
      from: "  return /Tests\\s+\\d+ failed/.test(strip(output));",
      to: "  return /Tests\\s+\\d+ failed/.test(output);",
      expect: "MH1",
    },
    {
      // Today's defect. A truncated run reported as a survivor is the report
      // that reads as thoroughness.
      name: "a run with no summary is counted as a survivor again",
      file: FILE,
      from: "      outcome = ran(output)",
      to: "      outcome = true",
      expect: "MH4c",
    },
    {
      // `ran` answering `killed`'s question. The two differ on exactly one
      // input — a run that finished green — and that is the common case, so a
      // suite indexed by the failing rows would agree.
      name: "`ran` only recognises a failing summary, so every green run reads as blind",
      file: FILE,
      from: "  return /Tests\\s+\\d+ (failed|passed)/.test(strip(output));",
      to: "  return /Tests\\s+\\d+ failed/.test(strip(output));",
      expect: "MH6",
    },
    {
      name: "the control pair is not checked, so a blind harness reports",
      file: FILE,
      from: "  if (!controlKilled) {",
      to: "  if (false) {",
      expect: "MH4",
    },
    {
      // **This survived on its first run, and the survivor was a finding about
      // the fixture.** Every row above mutates one file, and each write is
      // `originals + this mutation`, so the previous row is overwritten anyway
      // — the per-row restore is redundant until two files are in play. MH7 is
      // the row that puts them in play.
      name: "the tree is not restored between mutations",
      file: FILE,
      from: "    } finally {\n      restore();\n    }",
      to: "    } finally {\n    }",
      expect: "MH7",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
