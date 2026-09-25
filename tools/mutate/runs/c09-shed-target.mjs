// A row that sheds is a target whose peek holds what it withheld (C09 I113).
//
// **Each mutation leaves the drawn row alone.** The mark still reads `+n` and
// the frame is byte-identical without a key pressed; what moves is whether the
// row can be reached, where focus lands on it, and what the peek says — the
// half of §104 a frame with nothing focused cannot show.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/shed-target.test.ts test/integration/peek.test.ts";
const SHED = "src/presentation/blocks/shed.ts";
const KINDS = "src/presentation/blocks/kinds/structured.ts";

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
    // The detail dropped: the row is still a stop, and its peek never opens —
    // a target that says nothing about why it is one.
    name: "a shedding row publishes no detail",
    file: SHED,
    from: "        ...(detail === null ? {} : { detail }),",
    to: "        ...({}),",
    expect: "T1.81",
  },
  {
    // Every element on the block's first row: the ring and the peek sit on the
    // header of a comparison, one row above the item they describe.
    name: "the elements ignore the kind's first item row",
    file: SHED,
    from: "        rows: Object.freeze({ from: firstRow + i, to: firstRow + i + 1 }),",
    to: "        rows: Object.freeze({ from: i, to: i + 1 }),",
    expect: "T1.81",
  },
  {
    name: "events withholds its type and the peek does not say so",
    file: KINDS,
    from: '          ...(gone.has("type") ? [{ label: "type", value: event.type }] : []),',
    to: "          ...[],",
    expect: "T1.81",
  },
  {
    name: "steps withholds its detail and the peek does not say so",
    file: KINDS,
    from: '        return step?.detail === undefined || !gone.has("detail") ? [] : [{ label: step.label, value: step.detail }];',
    to: "        return [];",
    expect: "T1.81",
  },
  {
    // The plan taken at the narrow convention: on text holding East-Asian
    // Ambiguous characters a wide terminal sheds a part the elements do not
    // know went — the direction C09 I113 chose `wide` to rule out.
    name: "keyValue's elements plan at `narrow`",
    file: KINDS,
    from: '    const parts = keyValueParts(block, w, "wide");',
    to: '    const parts = keyValueParts(block, w, "narrow");',
    expect: "T1.82",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): no element is ever published,
    // so the rows are atomic at every width — the state before I113.
    file: SHED,
    from: "  if (plan === null || plan.mark === null) return Object.freeze([]);",
    to: "  return Object.freeze([]);",
    why: "no shedding row is a target — if this survives, nothing reads the elements",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
