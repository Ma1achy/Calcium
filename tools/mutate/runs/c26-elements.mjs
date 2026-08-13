// C26 stage 2 — the element seam, mutated.
//
// **The generic sweep is the point of the seam, so the mutations aim at it.** A
// conformance suite nobody has watched fail is a suite nobody has checked, and
// `window`'s earned its keep exactly this way: two fabrications against `patch`
// each failed exactly one row.
//
// The last mutation is the interesting one and it is aimed at the predicates
// rather than at the code — see `EXPECTED_SURVIVORS`.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/block-elements.test.ts test/unit/table.test.ts";
const TABLE = "src/presentation/table/definition.ts";
const REG = "src/presentation/blocks/registry.ts";

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
    // **The defect the three walks had**, reintroduced one layer down. Without
    // the recursion a table inside a panel declares nothing, and every
    // behavioural row about a top-level table still passes.
    name: "elementsIn stops at the top level, as the three walks did",
    file: REG,
    from: '        if (block.kind === "panel" || block.kind === "group") {',
    to: "        if (false) {",
    expect: "T2.21",
  },
  {
    // Declared order rather than drawn order. Focus follows what the reader
    // sees, so a sorted table would move focus somewhere they did not point.
    name: "tableElements walks declared order rather than sorted order",
    file: TABLE,
    from: "  for (const r of sortedRows(block)) {",
    to: "  for (const r of block.rows) {",
    expect: "T1.1",
  },
  {
    // The header row unaccounted for, so every element sits one row high. It
    // stays inside the block, so containment cannot see it — the order is still
    // right and the disjointness still holds. T2.23 is the row that is *about*
    // this, added because the first pass reported CAUGHT ELSEWHERE: T2.21 saw it
    // by accident, through an assertion about a panel border.
    name: "the header row is not counted, so every element is one row too high",
    file: TABLE,
    from: "  let row = hasHeader(block) ? 1 : 0; // cells-ok — a row cursor, not a width",
    to: "  let row = 0; // cells-ok — a row cursor, not a width",
    expect: "T2.23",
  },
  {
    // Two elements claiming one cell. A pointer resolving to both is a click
    // that does two things or neither.
    name: "every element spans the whole block, so rows overlap",
    file: TABLE,
    from: "        rows: Object.freeze({ from: row, to: row + height }),",
    to: "        rows: Object.freeze({ from: 0, to: 2 }),",
    expect: "T2.16",
  },
  {
    // **Aimed at the predicates rather than at the code, and the aim was right
    // about them and wrong about the outcome.** The four generic predicates
    // genuinely cannot see this: every element stays inside the block, in reading
    // order, disjoint and stable, while the list is collectively short and every
    // row after an expanded one points at the wrong place.
    //
    // It was predicted to survive and it does not, because `T2.24` — added in the
    // same pass for a different reason, to give the header mutation a row that was
    // *about* it — asserts that each element starts where the last ended. That is
    // **contiguity**, and it is the property the four were missing.
    //
    // Contiguity is not promoted to a fifth generic predicate, and the reason is
    // C26 I6's shape: elements tile a table because a table's rows tile it, and a
    // kind whose elements have gaps between them — hunks in a patch, with context
    // rows between — would fail a generic contiguity rule while being correct. So
    // it stays a kind-specific row, and the generic sweep's blind spot stands as
    // recorded: only the vacuous window × elements agreement covers it for a kind
    // that does not tile.
    name: "the detail's rows are not counted, so offsets are collectively short",
    file: TABLE,
    from: "    const height = 1 + detailHeight(block, r, w, measureChild);",
    to: "    const height = 1;",
    expect: "T2.24",
  },
];

/**
 * **Empty, and it was not when this file was written.**
 *
 * The last mutation was predicted to survive, with a paragraph explaining why the
 * four generic predicates could not see a collective shortfall. The prediction was
 * right about the predicates and wrong about the run: `T2.24` catches it, and
 * `T2.24` was added in the same pass for an unrelated reason. The mutation aimed
 * at the sweep found a row that had just arrived to cover something else.
 *
 * Recorded here rather than quietly deleted, because *a mutation that fails
 * nothing indicts an artefact* has a mirror — **a mutation that was expected to
 * fail nothing and does indicts the prediction**, and the prediction was a
 * sentence about what the suite could see.
 */
const EXPECTED_SURVIVORS = new Map();

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TABLE,
    from: "  if (!hasBody(block)) return Object.freeze([]);",
    to: "  return Object.freeze([]);",
    why:
      "a table that declares no elements at all — if this survives, the sweep is walking an " +
      "empty corpus and every kill below is unearned",
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
process.exit(unexpected.length > 0 ? 1 : 0);
