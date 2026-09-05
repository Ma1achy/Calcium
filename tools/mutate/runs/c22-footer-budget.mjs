// The footer's row budget, mutated — C22 §6k, I79, I80 (T6.95–T6.97).
//
// **Every mutation here leaves a frame that still sums.** That is the point:
// `heightsSum` compares the frame with itself, so a subtraction that uses one
// number and a painter that uses another agree with each other and disagree
// with the screen. The rows that catch these read the frame (T3.38) or sweep
// the budget (T1.36) rather than asking the sum whether it holds.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/frame-budget.test.ts test/unit/session-paint.test.ts";
const FRAME = "src/shell/frame.ts";
const PAINT = "src/shell/paint.ts";
const CONFIG = "src/shell/config.ts";

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
    // **T6.95.** The sum asserted against a constant again. Holds at every
    // budget while the painter draws a footer of another height — the frame
    // agrees with itself and not with the screen.
    name: "heightsSum reads a constant footer of one",
    file: FRAME,
    from: "  return HEADER_ROWS + f.region.height + f.promptRows + f.footerRows === f.size.rows;",
    to: "  return HEADER_ROWS + f.region.height + f.promptRows + 1 === f.size.rows;",
    expect: "T1.36",
  },
  {
    // **T6.96.** The painter writes `1` back. The line count comes up short by
    // `b − 1` and, before that, row 22 is the prompt rather than the footer's
    // first block — only a frame read sees which.
    name: "paint draws the footer on one row regardless of the budget",
    file: PAINT,
    from: "      ...region(frame.footer, frame.footerRows, width, deps),",
    to: "      ...region(frame.footer, 1, width, deps),",
    expect: "T3.38",
  },
  {
    // **T6.97, first half.** The upper bound dropped: a budget of seven is
    // accepted and the region at the size gate goes to zero at a size the
    // gate said was fine.
    name: "validateConfig drops the upper bound",
    file: CONFIG,
    from: "    (!Number.isInteger(footerRows) || footerRows < 1 || footerRows > MAX_FOOTER_ROWS)",
    to: "    (!Number.isInteger(footerRows) || footerRows < 1)",
    expect: "T1.35",
  },
  {
    // **T6.97, second half.** The subtraction in `compose` uses `1` while
    // `heightsSum` uses the budget: the sum is false at every budget above one,
    // and T1.37 fails too — the two implementations of the subtraction have
    // diverged, which is the drift `initialRegionHeight`'s comment names.
    name: "compose subtracts one for the footer instead of the budget",
    file: FRAME,
    from: "  const height = Math.max(0, size.rows - HEADER_ROWS - footerRows - promptRows);",
    to: "  const height = Math.max(0, size.rows - HEADER_ROWS - 1 - promptRows);",
    expect: "T1.36",
  },
];

const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: FRAME,
    from: "  const height = Math.max(0, size.rows - HEADER_ROWS - footerRows - promptRows);",
    to: "  const height = 0;",
    why:
      "the region is always empty — if this survives, no row in the set composes a frame and " +
      "every kill below is unearned",
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
