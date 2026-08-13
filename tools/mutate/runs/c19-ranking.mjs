// C19 I26 — recency ranking, mutated.
//
// **The subject is an ordering, and an ordering is the hardest thing to test by
// accident.** Every mutation here produces a menu that is still well-formed,
// still deduplicated and still filtered — only the sequence is wrong, which is
// exactly the class a suite indexed by "what is in the set" agrees with.
//
// The rule is a *refinement* of source order, so two of these attack the
// refinement rather than the sort: a comparator that is not stable and one that
// ranks before deduplication both leave the recency claim true and break what it
// was built on top of.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/completion.test.ts";
const ENGINE = "src/interaction/completion/engine.ts";

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
    // **The ordering reversed.** Least-recently-run first is the same rule with
    // the comparator's arms swapped, and it is what the obvious edit produces
    // when someone "fixes" a sort they read as backwards.
    name: "recency sorts oldest first",
    file: ENGINE,
    from: "      return y - x;",
    to: "      return x - y;",
    expect: "T1.16",
  },
  {
    // **Never-run sorts FIRST.** The candidates the reader has never used take
    // the top of the menu, which is the state C19 I26 exists to end — and every row
    // about which values are present still passes.
    name: "never-run candidates sort ahead of run ones",
    file: ENGINE,
    from: "      if (x === null) return 1;\n      if (y === null) return -1;",
    to: "      if (x === null) return -1;\n      if (y === null) return 1;",
    expect: "T1.16",
  },
  {
    // **The refinement broken while the ranking still works.** Answering a
    // non-zero value for two never-run candidates makes the sort reorder them,
    // so source order stops surviving underneath — T1.16's fourth candidate and
    // T1.16b are the only rows that can see it, and they were written for it.
    name: "two never-run candidates no longer compare equal",
    file: ENGINE,
    from: "      if (x === y) return 0;",
    to: "      if (x === y) return x === null ? -1 : 0;",
    expect: "T1.16b",
  },
  {
    // **Kept although it survives, because the survival is the result.** It was
    // written to show that ranking before dedupe reverses T3.18, and it showed
    // the opposite: the two orders are indistinguishable, so the sentence that
    // justified the order was not a constraint. See EXPECTED_SURVIVORS.
    name: "ranking runs before dedupe rather than after",
    file: ENGINE,
    from: "    return rank(dedupe(matching(out, ctx.prefix)), opts.recency);",
    to: "    return dedupe(rank(matching(out, ctx.prefix), opts.recency));",
    expect: "T1.16c",
  },
  {
    // **The seam ignored.** An engine that drops `recency` orders exactly as it
    // did before C19 I26 — which is a *correct* menu on a fresh session, and the
    // reason T1.16b asserts equality with an unranked engine rather than
    // asserting the ordering twice.
    name: "the injected recency function is ignored",
    file: ENGINE,
    from: "  if (recency === undefined) return candidates;",
    to: "  if (recency !== undefined) return candidates;",
    expect: "T1.16",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry here would name
 * a mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "ranking runs before dedupe rather than after",
    "behaviourally equivalent, and that is the finding. `recency` is a function of the " +
      "VALUE, so two copies of one value carry identical keys and a stable sort leaves the " +
      "first where it was — dedupe-then-rank and rank-then-dedupe cannot differ. The code's " +
      "comment claimed the swap would reverse T3.18 and let the later source's copy win; it " +
      "would not, and the comment is now corrected. The order stays because sorting a list " +
      "you are about to shorten is work for nothing, which is a real reason and a smaller " +
      "one. If this ever starts being caught, `recency` has stopped being a function of the " +
      "value alone and the whole seam wants re-reading.",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: ENGINE,
    from: "  if (recency === undefined) return candidates;",
    to: "  return [];",
    why:
      "ranking answers an empty set for everything — if this survives, no row reaches the " +
      "ranker at all and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

// **The staleness arm, and it is why the map is not just a comment.** An
// exemption checked by membership alone outlives its reason: a mutation that
// starts being caught leaves an entry behind that reads as deliberate. This
// fails the pass either way — an unexplained survivor, or an exemption that no
// longer applies.
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
