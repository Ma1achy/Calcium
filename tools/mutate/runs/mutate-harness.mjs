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
    from: "  if (hits === 0) throw new AnchorError(file, from);",
    to: "  if (false) throw new AnchorError(file, from);",
    why: "MH3 asserts an unmatched anchor throws; an `apply` that never throws cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The defect that shipped.** The colours sit between `Tests` and the
      // count, so the naive regex reads every kill as a survivor.
      name: "the summary is read without stripping the colours",
      file: FILE,
      // Re-anchored when `killed` gained the timeout arm: the marker is now an
      // alternative beside vitest's summary, and stripping still has to happen
      // before either is read.
      from: "  return /Tests\\s+\\d+ failed/.test(strip(output)) || timedOut(output);",
      to: "  return /Tests\\s+\\d+ failed/.test(output) || timedOut(output);",
      expect: "MH1",
    },
    {
      // Today's defect. A truncated run reported as a survivor is the report
      // that reads as thoroughness.
      name: "a run with no summary is counted as a survivor again",
      file: FILE,
      from: "      outcome = !ran(output)",
      to: "      outcome = false",
      expect: "MH4c",
    },
    {
      // **The third state, and the branch is where it can be lost.** `unbuilt`
      // stays correct, `report` stays correct, and every mutation that takes a
      // suite down reads SURVIVED again — which is the whole of F922.
      name: "a mutation that does not compile is counted as a survivor again",
      file: FILE,
      from: "        : unbuilt(output)",
      to: "        : false",
      expect: "MH8",
    },
    {
      // `ran` answering `killed`'s question. The two differ on exactly one
      // input — a run that finished green — and that is the common case, so a
      // suite indexed by the failing rows would agree.
      name: "`ran` only recognises a failing summary, so every green run reads as blind",
      file: FILE,
      from: "  return /Tests\\s+\\d+ (failed|passed)/.test(strip(output)) || timedOut(output);",
      to: "  return /Tests\\s+\\d+ failed/.test(strip(output)) || timedOut(output);",
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
      // **F897's mechanism, and the branch is where it can be lost** (F1018).
      // `incomplete` stays correct, `report` stays correct, and every run that
      // lost a worker reads SURVIVED again — which is the whole of F897.
      name: "a run that reported fewer tests than it collected is a survivor again",
      file: FILE,
      from: "          : incomplete(output)",
      to: "          : false",
      expect: "MH9e",
    },
    {
      // The predicate answering the reported count against itself — F929's
      // reader in this file's vocabulary. Every crashed run then sums to its
      // own bracket and nothing is ever lost.
      name: "the collected count is read as the reported one",
      file: FILE,
      from: "  return t !== null && t.reported < t.collected;",
      to: "  return t !== null && t.reported < t.reported;",
      expect: "MH9",
    },
    {
      // The blind spot inverted: a summary with no bracket read as a loss
      // rather than as unanswerable. Every truncated capture in the fixture
      // turns indeterminate while every assertion still passes.
      name: "a summary with no total is read as an incomplete run",
      file: FILE,
      from: "  if (total === null) return null;",
      to: "  if (total === null) return { reported: 0, collected: 1 };",
      expect: "MH9d",
    },
    {
      // The first of the three moments. A baseline that lost rows is not the
      // corpus, and nothing below it is measured against anything known.
      name: "the clean run is not asked whether it lost rows",
      file: FILE,
      from: "  if (incomplete(clean)) {",
      to: "  if (false) {",
      expect: "MH9f",
    },
    {
      // The worst of the three: the control pair, the harness's own guard
      // against blindness, satisfied by a blind run.
      name: "the control's run is not asked whether it lost rows",
      file: FILE,
      from: "  if (incomplete(controlRun)) {",
      to: "  if (false) {",
      expect: "MH9f",
    },
    {
      // The summary line contradicting the rows above it — the compression
      // class in a tool's own output, which this file has paid for twice.
      name: "an indeterminate row is counted as a survivor in the summary",
      file: FILE,
      // **The predicate moved and the row follows it** (F1106). The five
      // not-a-survivor states became one named `isSurvivor`, because the
      // type-check has to ask the same question at a second site — so the
      // anchor now names the function rather than the filter, and the mutation
      // reaches both readers at once. The claim MH9e makes is unchanged.
      from: "  return !o.killed && !o.noSummary && !o.anchorMissed && !o.ambiguous && !o.unbuilt && !o.indeterminate;",
      to: "  return !o.killed && !o.noSummary && !o.anchorMissed && !o.ambiguous && !o.unbuilt;",
      expect: "MH9e",
    },
    {
      // **F277's own sentence, mechanised — and then answered** (F1037, F1113).
      // The report could not tell an ambiguous anchor from a unique one, so the
      // count was written onto the survivor's row; the count is a **refusal**
      // now, because a mutation that kills on the wrong site reads `caught` and
      // the annotation never appears at all. Losing the refusal puts the pass
      // back to mutating whichever copy `replace` reaches first.
      name: "an ambiguous anchor is applied to its first site again",
      file: FILE,
      from: "  if (hits > 1) throw new AmbiguousAnchorError(file, from, hits);",
      to: "",
      expect: "MH10",
    },
    {
      // The refusal recorded and never printed — F768's shape one arm over: the
      // state is right and the row says nothing about what to do.
      name: "the refused anchor's count is recorded and never printed",
      file: FILE,
      from: "            ? `   \u2190 its anchor matches ${String(r.hits)}x \u2014 extend it until it is unique`",
      to: '            ? ""',
      expect: "MH10",
    },
    {
      // **The refusal in the wrong place**, which is the shape it was in before:
      // a count taken over `m.from` alone never saw an `also` edit, so a pair
      // whose second wiring was ambiguous applied to a site nobody chose with
      // nothing anywhere reporting it. `apply` is where every edit passes.
      name: "the control and the `also` edits escape the refusal",
      file: FILE,
      from: "  const hits = hitsOf(src, from);\n  if (hits === 0) throw new AnchorError(file, from);",
      to: "  const hits = 1;\n  if (!src.includes(from)) throw new AnchorError(file, from);",
      expect: "MH10b",
    },
    {
      // The survivor line back to two dispositions, which is how a mutation
      // whose subject moved routes to *write a test* against a test that is
      // right.
      name: "the survivor line names two dispositions again",
      file: FILE,
      from: "            `were written from, or about the mutation. **Ask why the mutation cannot reach the ` +",
      to: "            `were written from. **Do not ask why the mutation cannot reach the ` +",
      expect: "MH10",
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
    {
      // **The type-check asked of every row** (F1106). It is gated on the
      // survivor because that is where the reader is about to be told the
      // tests are weak; asked of a kill it costs 1.3 s for an answer nobody
      // reads, and MH11c counts the calls for exactly this reason.
      name: "the type-check is asked of every row, not only a survivor",
      file: FILE,
      from: "      if (isSurvivor(outcome)) {\n        const err = typecheck();",
      to: "      if (true) {\n        const err = typecheck();",
      expect: "MH11c",
    },
    {
      // **A baseline nobody measured**, which is the failure every guard in
      // this file exists against — arriving inside the guard that was added to
      // catch it. A tree already red attributes its own error to the first
      // mutation that survives.
      name: "the clean tree is assumed to type-check rather than asked",
      file: FILE,
      from: "          const base = typecheck();",
      to: "          const base = null;",
      expect: "MH11b",
    },
    {
      // The summary counting a row it did not measure — the same compression
      // class as the indeterminate row above, two states later.
      name: "a row that did not type-check is counted as a survivor",
      file: FILE,
      from: "  const survivors = results.filter(isSurvivor).filter((r) => !r.untyped);",
      to: "  const survivors = results.filter(isSurvivor);",
      expect: "MH11",
    },
    {
      // The compiler's own line dropped, leaving a state with no reason on it
      // — which routes the reader back to the tests it was written to route
      // them away from.
      name: "the untyped row carries no error line",
      file: FILE,
      from: "        ? `   ← ${r.untyped.trim()}`",
      to: '        ? ""',
      expect: "MH11",
    },
    {
      // **The unused family counted again.** 44 of the 61 reds in the corpus
      // measurement were TS6133, every one a good mutation that orphaned a
      // binding — so a check that counts them reclassifies the majority of its
      // own hits as rotted `to`s.
      name: "an orphaned binding counts as a `to` that will not type-check",
      file: FILE,
      from: '      const real = errors.filter((l) => !/error TS(?:6133|6192|6196)\\b/u.test(l));',
      to: "      const real = errors;",
      expect: "MH11d",
    },
    {
      // The other direction, and the one that makes the exclusion dangerous: a
      // filter that swallows everything answers `null` to a tree the project
      // would refuse, which is the blindness the whole row exists against.
      name: "the type-check finds nothing worth reporting in any tree",
      file: FILE,
      from: "      return real[0] ?? null;",
      to: "      return null;",
      expect: "MH11d",
    },
    {
      // **F1472, restored.** A passing row's title is printed under a file that
      // failed, so the substring finds it and the report says `caught`.
      name: "the named row is looked for anywhere in the output",
      file: FILE,
      from: "                byNamedTest: named,",
      to: "                byNamedTest: output.includes(m.expect),",
      expect: "MH12",
    },
    {
      // An id without its boundary or its position: T9.4 inside T9.4h, and a
      // row a failing case merely cites.
      name: "a row id is looked for anywhere on a FAIL line",
      file: FILE,
      from: "    ? lines.some((line) => rowsOn(line).some((ids) => ids.includes(expect)))",
      to: "    ? lines.some((line) => line.includes(expect))",
      expect: "MH12b",
    },
    {
      name: "a `·` ends the head, so the second row of a pair is not named",
      file: FILE,
      from: '        if (token === "·" && ids.length > 0) continue;',
      to: "",
      expect: "MH12b",
    },
    {
      name: "a `:` does not end the head, so the subject of a title's sentence is named",
      file: FILE,
      from: '        if (token.endsWith(":")) break;',
      to: "",
      expect: "MH12b",
    },
    {
      name: "`caughtBy` names the component that qualifies a row",
      file: FILE,
      from: "    const rows = ids.length > 1 && QUALIFIER.test(ids[0]) ? ids.slice(1) : ids;",
      to: "    const rows = ids;",
      expect: "MH12b",
    },
    {
      name: "`caughtBy` names the outermost describe rather than the row",
      file: FILE,
      from: "    const ids = rowsOn(line).filter((head) => head.length > 0).at(-1) ?? [];",
      to: "    const ids = rowsOn(line).filter((head) => head.length > 0).at(0) ?? [];",
      expect: "MH12b",
    },
    {
      // A kill with no `FAIL` line reads as not-named, which is a guess in the
      // other direction: `CAUGHT ELSEWHERE` with nobody to name.
      name: "a run with no FAIL line is judged rather than reported unattributable",
      file: FILE,
      from: "  if (lines.length === 0) return null;",
      to: "",
      expect: "MH12c",
    },
    {
      name: "the report folds an unattributable kill into CAUGHT ELSEWHERE",
      file: FILE,
      from: "          : r.byNamedTest === null",
      to: "          : false",
      expect: "MH12c",
    },
    {
      // `output.includes(null)` searched for the string `null`, so a declared
      // survivor that was killed read `caught` whenever a diff printed one.
      name: "a declared survivor's `null` is looked for as text",
      file: FILE,
      from: '  if (typeof expect !== "string") return false;',
      to: '  if (typeof expect !== "string") return output.includes(expect);',
      expect: "MH12b",
    },
    {
      // **The all-clear under a CAUGHT ELSEWHERE row**, which is what a reader
      // of the last line alone saw.
      name: "the all-clear ignores kills the named row did not make",
      file: FILE,
      from: " &&\n            elsewhere + unattributed === 0\n",
      to: "\n",
      expect: "MH13",
    },
    {
      name: "an unattributable kill is counted as caught elsewhere",
      file: FILE,
      from: "  const unattributed = killedRows.filter((r) => r.byNamedTest === null).length;",
      to: "  const unattributed = 0;",
      expect: "MH13",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
