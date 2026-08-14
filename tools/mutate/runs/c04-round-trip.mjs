// C04 I46 — a document is JSON, and the validator refuses what JSON cannot carry.
//
// **A sweep is the easiest thing in this repository to make vacuous**, because
// the failure mode is a property no input can violate, and that passes exactly
// like one that is satisfied (A03 §2). Three of the mutations below aim at the
// sweep rather than at the validator — an empty corpus, the equality assertion
// deleted, and the comparison made strict — and each leaves a green run that
// still reads as *every fixture round-trips*.
//
// **Two of those three survive, and both are the point rather than a gap.** The
// equality half of the property cannot be falsified by any input the union can
// express, and the strict comparison is satisfied by a corpus that happens to
// carry neither `-0` nor an explicit `undefined`. Their exemptions carry the
// argument, C04 §5a carries it in prose, and F167 records that the instruction
// which produced this run predicted exactly one of the two outcomes and got both.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/view-model.test.ts test/revert/view-model.test.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const CONTRACT = "test/contract/view-model.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The finiteness dropped**, which is the state that shipped: `NaN` in,
    // `null` out, and the validator agreeing at both ends.
    name: "a numeric array element is any number, finite or not",
    file: VALIDATE,
    from: "    if (isFiniteNumber(v)) continue;",
    to: '    if (typeof v === "number") continue;',
    expect: "T2.19",
  },
  {
    // **The elements unchecked.** `requireArray` establishes the array and
    // stops — the wider half, and the one no round trip surfaces.
    name: "the array is checked and its elements are not",
    file: VALIDATE,
    from: "  for (const [i, v] of values.entries()) {",
    to: "  for (const [i, v] of [].entries()) {",
    expect: "T2.19",
  },
  {
    // **The second numeric array forgotten**, which is how the first fix would
    // have shipped if the walk had indexed by *round trip* rather than by
    // *where the type says number*: `spark` is reachable only through a cell.
    name: "only the plot's numbers are checked, not the cell's",
    file: VALIDATE,
    from: '          requireFiniteNumbers(cell["spark"], e, `${at} cell "${key}"`, "spark");',
    to: "",
    expect: "T2.19",
  },
  {
    // **The equality assertion removed entirely**, and it survives — which is
    // the finding rather than a gap to be patched. See its exemption below.
    name: "the round trip asserts validity and not equality",
    file: CONTRACT,
    from: '      if (round.ok) expect(round.value, `${b.kind} "${b.id}" round trip`).toEqual(d);',
    to: "",
    expect: "T2.18",
  },
  {
    // **The corpus emptied.** An exit status is one bit and it is the same bit
    // for *clean* and for *did not run*; this is the counter assertion earning
    // its place rather than being a courtesy.
    name: "the sweep runs over nothing",
    file: CONTRACT,
    from: "    for (const b of CORPUS) {",
    to: "    for (const b of []) {",
    expect: "T2.18",
  },
  {
    // **`toEqual` to `toStrictEqual`**, which reads as a tightening and makes
    // the two tolerated inequalities into failures — §5a rows 3 and 4. It is
    // here because the *spec* is what decides which comparison is right, and a
    // mutation that fails nothing would indict the spec rather than the test.
    name: "the comparison is strict, so -0 and a dropped undefined fail",
    file: CONTRACT,
    from: '      if (round.ok) expect(round.value, `${b.kind} "${b.id}" round trip`).toEqual(d);',
    to: '      if (round.ok) expect(round.value, `${b.kind} "${b.id}" round trip`).toStrictEqual(d);',
    expect: "T2.18",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map([
  [
    "the round trip asserts validity and not equality",
    "**the equality half of C04 I46 cannot be falsified by any input today, and that is a finding " +
      "rather than a gap.** Every member of the block union is a string, a number, a boolean, an " +
      "array or a record — there is no `Date`, `Map`, `Set` or `bigint` — so `JSON.parse(JSON." +
      "stringify(d))` equals `d` for every document that can be constructed, and removing the " +
      "assertion changes nothing. What falsifies it is a **type change**, not an input: the day a " +
      "kind carries a value JSON drops, this assertion is the only thing that says so, and it is " +
      "why the row is kept rather than reduced to a validity check. The validator half is not " +
      "vacuous — three fabricated inputs fail it, and two of them shipped accepted (F167)",
  ],
  [
    "the comparison is strict, so -0 and a dropped undefined fail",
    "no fixture in `ONE_PER_KIND` or `ADVERSARIAL` carries a `-0` or an explicit `undefined`, so " +
      "the strict comparison is satisfied by the corpus as it stands. **That is the finding this " +
      "arm exists to state**: the sweep does not decide between the two comparisons, and T3.24 " +
      "does — which is why §5a rows 3 and 4 are asserted directly rather than left to a " +
      "comparison's defaults. If a fixture ever carries either value this becomes stale and the " +
      "staleness arm says so",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: VALIDATE,
    from: "function requireFiniteNumbers(",
    to: "function unusedRequireFiniteNumbers(",
    why:
      "the numeric-array check is not called at all — if this survives, nothing reaches the " +
      "function and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
