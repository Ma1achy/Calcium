// The corpus's second axis, mutated.
//
// **The axis exists because the first one is exhaustive and the wrong one**, so
// the rows here are indexed by *how an axis stops being an axis*: an entry
// removed, a name removed, an entry that renders nothing, and a capability arm
// dropped from the frames. Each leaves a green run that still reads as
// *every state is framed*.
//
// The last of those is the one worth having in the file whatever it does,
// because it asks the question nothing else does: **what guards the variant
// list?** A state axis with no wide arm is exactly the corpus that let F171
// ship, and if dropping the arm fails nothing then the axis has the same shape
// as the thing it replaced.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/states.test.ts test/golden/states.test.ts";
const STATES = "test/support/states.ts";
const CONTRACT = "test/contract/states.test.ts";
const GOLDEN = "test/golden/states.test.ts";

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
    // **An entry dropped from the inventory**, which is the drift the equality
    // arm exists for: the frames shrink, every remaining one still passes, and
    // the suite reads as covering a state it no longer holds.
    name: "a state is removed from the fixture list",
    file: STATES,
    from: '    name: "plot-zero-minimum",',
    to: '    name: "plot-zero-minimum-RENAMED",',
    expect: "T2.100",
  },
  {
    // The same drift from the other side — a declared name with no fixture.
    // Both directions matter, which is why this is `toEqual` and not a
    // containment check in either orientation.
    name: "a name is declared that no fixture answers",
    file: CONTRACT,
    from: '  "prompt-paste-chip",',
    to: '  "prompt-paste-chip",\n  "a-state-nobody-wrote",',
    expect: "T2.100",
  },
  {
    // **A state that renders nothing snapshots as a header and a blank**, which
    // reads exactly like a state that renders — the vacuity class arriving in a
    // golden file, where it is least visible because the frame still looks like
    // a frame.
    name: "a state renders no rows at all",
    file: STATES,
    from: "      if (first === undefined) return [];",
    to: "      return [];",
    expect: "T2.101",
  },
  {
    // **The reason field made decorative.** An entry whose `why` is a category
    // rather than an argument is one nobody can decide to delete, which is how
    // an inventory becomes a list of names that outlives what it was for.
    name: "a state's reason is a category rather than an argument",
    file: STATES,
    from:
      '    why:\n' +
      '      "a chip is ONE grapheme to the editor and N cells to the terminal, so every index assertion " +\n' +
      '      "passes at any label width — only a frame measures the difference (roadmap 30)",',
    to: '    why: "for coverage",',
    expect: "T2.103",
  },
  {
    // **The variant list, which nothing else asks about.** See the exemption.
    name: "the wide arm is dropped from the frames",
    file: GOLDEN,
    from:
      '  { name: "dark-wide", theme: DARK_THEME, capabilities: { ...FULL_CAPS, ambiguousWidth: "wide" as const } },\n',
    to: "",
    expect: "golden",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map([
  [
    "the wide arm is dropped from the frames",
    "**nothing guards the variant list, and that is a finding rather than a gap in this run.** " +
      "Removing a variant leaves the remaining snapshots byte-identical and orphans the rest; " +
      "vitest reports obsolete snapshots and does not fail on them, so the frames a corpus draws " +
      "are decided by a literal no assertion reads. It is the same shape as the defect this axis " +
      "was built for — a corpus complete over what it indexes and silent about what it does not — " +
      "one level out, and it is recorded rather than closed because closing it means asserting a " +
      "snapshot *count*, which goes stale on every legitimate addition and would be deleted by the " +
      "first person it inconvenienced. What makes the wide arm survive review instead is T2.101, " +
      "which renders every state under every capability arm and fails if one stops drawing",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: STATES,
    from: "export const STATES: readonly StateFixture[] = Object.freeze([",
    to: "export const STATES: readonly StateFixture[] = Object.freeze([].slice(0) || [",
    why: "an empty axis frames nothing — if this survives, no row below is earned",
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
