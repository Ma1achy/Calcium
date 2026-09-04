// C14 §4a, I23 — `code` and `raw` window, and `code` pins its parse. Mutated.
//
// **Every mutation here balances.** A window that slices its text, a window
// that opens inside a wrapped line, a window that hands the whole block back —
// each keeps some count right, and two of the three keep C09 I26's identity
// right. The rows that kill them read the frame (the comment slot), the
// residuals (the unit), or the row count against the region; nothing here is
// killed by an assertion about a field.
//
// **The pin's row is the comment one and no other row can be** (C14 T6.21): a
// sliced text is byte-identical to the pinned one for every block with no
// multi-line token, so a fixture of ordinary lines passes against both.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/block-window.test.ts test/unit/viewport-windows.test.ts " +
  "test/edge/viewport.test.ts test/contract/blocks.test.ts";
const CODE = "src/presentation/blocks/kinds/code.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
// `maxBuffer` on `c11-table-window.mjs`'s argument: a window that is wrong at
// every offset produces a conformance report longer than `execSync`'s default.
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
    file: CODE,
    from: "    atLeastOne(codeRows(block, width).length), // cells-ok",
    to: "    atLeastOne(codeRows(block, width).length) + 1, // cells-ok",
    why: "measure disagreeing with render is C09 I1, and T2.1 kills it on every corpus; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **PIN-DROPPED** (C14 T6.21, C04 T6.80). The window carries the sliced
      // text instead of the whole text and a range. Every count is right; the
      // comment's tail is tokenised as identifiers and drawn in the default
      // tone. Only a row that reads the frame can see it.
      name: "PIN-DROPPED: the window slices `text` instead of pinning `lineRange`",
      file: CODE,
      from: "      block: { ...block, lineRange: [firstLine, lastLine + 1] as const },",
      to:
        "      block: { ...block, text: block.text.split(\"\\n\").slice(firstLine, lastLine + 1).join(\"\\n\") },",
      expect: "T1.18",
    },
    {
      // **PIN-IGNORED**. The window sets the range and `codeRows` reads every
      // line anyway — the windowed block measures the whole block, and I26
      // breaks at every offset. `window-height` is the check that fires.
      name: "PIN-IGNORED: `codeRows` ignores `lineRange` and the window returns the whole block",
      file: CODE,
      from: "  const [lo, hi] = lineRangeOf(block, lines.length); // cells-ok — a line count, not a width",
      to: "  const [lo, hi] = [0, lines.length]; // cells-ok — a line count, not a width",
      expect: "T2.22",
    },
    {
      // **UNIT-SPLIT** (C14 T3.19). The widening to the line's first row is
      // removed, so a window opening inside a wrapped line starts on its
      // middle row: `skipRows` is 0 where it should be 1 and the windowed
      // block, measured whole-line, is a row too tall for the identity.
      name: "UNIT-SPLIT: a window opens inside a wrapped source line",
      file: CODE,
      from: "    while (first > 0 && all[first - 1]?.line === firstLine) first -= 1;",
      to: "",
      expect: "T3.19",
    },
    {
      // **RAW-WHOLE**. `raw`'s window hands the block back unsliced — the
      // shape of a kind declaring no `window`, arriving through one that does.
      name: "RAW-WHOLE: `raw`'s window returns the whole text",
      file: SIMPLE,
      from: "      block: { ...block, text: lines.slice(lo, hi).join(\"\\n\") },",
      to: "      block,",
      expect: "T2.22",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
