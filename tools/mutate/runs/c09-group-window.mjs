// C09 I69 — the column group's `window`: divide by whole children, decline for a
// row or a `minRows` column. Mutated.
//
// **The shape this run exists to catch is a window that balances.** Like `table`
// (c11-table-window), almost every wrong column window keeps I26's arithmetic and
// changes which rows — or which columns — come back: an `align` left un-re-indexed
// draws a right-aligned child in the wrong place while measuring the same height;
// a gap row kept when the window opens below it is one row too tall *and* wrong;
// a row group that divides instead of declining lays its children side by side
// and answers a row range no run of them ever was. So the mutations below aim at
// the byte-identity and decline rows (T2.139–T2.142), not at I26 alone.
//
// **The control declines unconditionally.** A declined window returns the whole
// block with the range as its residual, which is a *correct* window — its slice
// is `whole.slice(from, to)` and I26 holds — so it is invisible to every byte and
// I26 assertion. It is caught only by T2.139, which asserts the column *divides*
// (skipRows steps into the first child, dropRows out of the last). A run where the
// control survives is a run that cannot tell dividing from declining, which is the
// whole subject here.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/block-window.test.ts test/contract/block-elements.test.ts " +
  "test/contract/blocks.test.ts test/contract/view-model.test.ts";
const FILE = "src/presentation/blocks/kinds/containers.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);

// **`maxBuffer`, c11-table-window's reason.** A mutation that makes every window
// wrong produces thousands of `window-rows`/measurement failures whose stdout
// runs past `execSync`'s 1 MiB default; the throw then carries a truncated
// summary, which `ran()` reads as the harness going blind.
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
    file: FILE,
    from: "    if (block.direction === \"row\" || block.minRows !== undefined) {",
    to: "    if (true) {",
    why: "declining unconditionally is a correct window, so only T2.139's divide assertion sees it; a run where it survives cannot tell dividing from declining",
  },
  mutations: [
    {
      // **The align re-index, direction one.** `align` stays parallel to the full
      // `children`, so a windowed subset reads the wrong slot — a right-aligned
      // last child drawn left. Same height, same slice length; T2.141 reads the
      // frame and the column moves.
      name: "ALIGN-NOT-REINDEXED: the window keeps the block's own `align`, not the subset's",
      file: FILE,
      from: "    const align = block.align === undefined ? undefined : keptIdx.map((i) => block.align?.[i] ?? \"left\");",
      to: "    const align = block.align;",
      expect: "T2.141",
    },
    {
      // **The gap rule.** Keeping every child exactly as declared keeps its
      // `gapBefore` when the window opens below the gap, so the slice is one row
      // too tall and holds a gap row the range excluded. I26 breaks with it, so
      // T2.142's both-directions row catches it.
      name: "GAP-NOT-STRIPPED: a child keeps its `gapBefore` whatever the window covers",
      file: FILE,
      from:
        "      const piece =\n" +
        "        gapKept === (gap === 1)\n" +
        "          ? child\n" +
        "          : gapKept\n" +
        "            ? ({ ...child, gapBefore: true } as Block)\n" +
        "            : ({ ...child, gapBefore: false } as Block);",
      to: "      const piece = child;",
      expect: "T2.142",
    },
    {
      // **The trailing residual.** `dropRows` is the last kept child's rows below
      // `to`; zeroing it keeps a kept-whole last child but claims the window ends
      // at its bottom, so `measure − skip − drop` overshoots `to − from`.
      name: "DROP-ZERO: the last kept child contributes no residual",
      file: FILE,
      from: "    const dropRows = Math.max(0, lastBottom - hi);",
      to: "    const dropRows = 0;",
      expect: "T2.138",
    },
    {
      // **The decline, direction row.** A row group divides instead of declining:
      // its children are side by side, so the contiguous run the code takes is not
      // a row range and the returned group measures the tallest child, not the
      // range. T2.140 asserts the row group is returned whole.
      name: "ROW-DIVIDES: a row group falls into the dividing path",
      file: FILE,
      from: "    if (block.direction === \"row\" || block.minRows !== undefined) {",
      to: "    if (block.minRows !== undefined) {",
      expect: "T2.140",
    },
    {
      // **The decline, direction `minRows`.** A padded column divides, so the pad
      // rows that belong to no child fall inside the window and I26 breaks from
      // outside any child. T2.140 asserts the `minRows` column is returned whole.
      name: "MINROWS-DIVIDES: a `minRows` column falls into the dividing path",
      file: FILE,
      from: "    if (block.direction === \"row\" || block.minRows !== undefined) {",
      to: "    if (block.direction === \"row\") {",
      expect: "T2.140",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
