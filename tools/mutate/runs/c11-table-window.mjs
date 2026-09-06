// C11 §5a — `table`'s window: two pins, one seam parameter, two residuals. Mutated.
//
// **Every mutation here is a defect the walk or the build actually produced**,
// which is what makes the run a check on the rows rather than a search for
// something to break. Four came from C09 §6b's table, three from building it
// (F428), and one from a consumer nobody had run yet.
//
// **The shape this run exists to catch is a window that balances.** `table` is
// the first kind whose units are not rows, so almost every way of getting it
// wrong keeps the arithmetic correct and changes which rows come back — the sort
// re-derived from the slice (F429), a slice taken in declaration order, a pin
// dropped. C09 I26 passes on all three, which is why `window-rows` exists and why
// the mutations below are aimed at it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/block-window.test.ts test/unit/table.test.ts " +
  "test/contract/block-elements.test.ts test/contract/table.test.ts";
const DEF = "src/presentation/table/definition.ts";
const SORT = "src/presentation/table/sort.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
// **`maxBuffer`, and the first pass is why.** Three mutations reported NO
// SUMMARY — the harness going blind mid-pass, which `ran()` exists to catch. The
// cause was not a timeout: a mutation that makes every window wrong produces a
// conformance report with thousands of `window-rows` failures, and the child's
// stdout ran past `execSync`'s 1 MiB default. The throw carries a truncated
// `stdout` with the summary cut off it, which is exactly the shape `ran()`
// describes for a buffer cut — arriving here from output volume rather than from
// SIGPIPE.
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
    file: DEF,
    from: "    if (hasActionBar(block)) total += 2;",
    to: "",
    why: "the bar's two rows are C11 I17 and half the table suite asserts them; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The walk's row 1.** `measure` walks `block.rows` and `render` walks
      // `sortedRows`, so a slice taken in declaration order shows different rows
      // than the range C14 addressed — and the counts agree, so C09 I26 passes.
      name: "DECLARATION-ORDER: units are built from `block.rows`, not the display order",
      file: DEF,
      from: "  for (const row of sortedRows(block)) {\n    out.push({ rows: 1 + detailHeight(block, row, width, measureChild), row, bar: false });",
      to: "  for (const row of block.rows) {\n    out.push({ rows: 1 + detailHeight(block, row, width, measureChild), row, bar: false });",
      expect: "T2.14",
    },
    {
      // **F429.** Sort-then-slice looks idempotent and is not: `kindOf` reads the
      // values present, so a slice that drops the one non-numeric value
      // re-classifies its column and re-sorts itself. Same count, same height,
      // same `skipRows`.
      name: "PRESORTED-DROPPED: the window does not say its rows are already ordered",
      file: DEF,
      from: "        presorted: true,",
      to: "        presorted: false,",
      expect: "T1.20",
    },
    {
      // The other half of the pair: the flag is set and nothing reads it, which
      // is F21's shape — a field that exists so nothing looks.
      name: "PRESORTED-IGNORED: `sortedRows` re-derives whatever the block says",
      file: SORT,
      from: "  if (block.presorted === true) return block.rows;",
      to: "",
      expect: "T1.20",
    },
    {
      // **C11 I18, direction one.** Derived from the slice, a window covering the bar
      // whose rows do not declare `actions` draws no bar — two rows short of the
      // range the parent counted.
      name: "BAR-DERIVED: the window pins nothing and the slice is asked",
      file: DEF,
      from: "        actionBar: kept.some((u) => u.bar),",
      to: "",
      expect: "T1.21",
    },
    {
      // **C11 I18, direction two**, and it is the one an assertion in a single
      // direction cannot see: a pin that always says yes satisfies every row
      // about a window that should have a bar.
      name: "BAR-ALWAYS: the pin is set to true whatever the range covers",
      file: DEF,
      from: "        actionBar: kept.some((u) => u.bar),",
      to: "        actionBar: true,",
      expect: "T1.21",
    },
    {
      // **F428's blocker.** The residual that does not exist for the other three
      // kinds, on the kind that needs it.
      name: "NO-TRAILING-SLACK: `dropRows` is always zero",
      file: DEF,
      from: "      dropRows: bottomOf(last) - hi, // cells-ok",
      to: "      dropRows: 0, // cells-ok",
      expect: "T2.14",
    },
    {
      // **C11 I20.** `[0, 1)` is the header alone; without the extension the window
      // is bodyless, C11 §5's empty-table rule fires, and it measures 2 for a
      // range of 1 — with the surplus after the header.
      name: "BODYLESS-ALLOWED: a window may hold no rows",
      file: DEF,
      from: "    if (!units.slice(first, last + 1).some((u) => u.row !== null)) {",
      to: "    if (false) {",
      expect: "T1.22",
    },
    {
      // **C09 I26a.** The parameter accepted and not used: unit boundaries
      // guessed at one row each, which is right for every kind that did not need
      // the seam and wrong for the one that does.
      name: "CHILD-IGNORED: a row's unit is one row, whatever its detail measures",
      file: DEF,
      from: "    out.push({ rows: 1 + detailHeight(block, row, width, measureChild), row, bar: false });",
      to: "    out.push({ rows: 1, row, bar: false });",
      expect: "T2.21",
    },
    {
      // The header kept whether or not the range reaches it — a sticky header,
      // which C09 §2a rules out for a transcript window by name.
      name: "HEADER-STICKY: the header survives a window that starts below it",
      file: DEF,
      from: "        showHeader: first === 0 && hasHeader(block),",
      to: "        showHeader: hasHeader(block),",
      expect: "T1.22",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
