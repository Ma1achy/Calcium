// F969 / F970 — the instrument that checks C09 I64, and the three painters it
// found, mutated.
//
// **The first three are the instrument.** A check over a corpus inherits the
// corpus's blind spots and its own, and a helper that reports nothing is green
// over two hundred thousand escapes exactly as a correct one is — so the row
// that shows it responds (T2.127b) is what a blinded helper has to fail, and
// the row that shows it stays quiet at a boundary (T2.127c) is what a widened
// one has to fail. The third is the index taken in the wrong string: an escape
// recorded at its position in the styled row lands past the end of the stripped
// one, and `containing` answers nothing there.
//
// **The last three restore the splits F970 measured**: a token boundary taken
// in code units, a cursor cell taken as one code unit at a cell column, and a
// 3-D label written one code point per cell with an SGR each. Each is the
// state the painter shipped in, restored verbatim where the anchor allows.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/cluster-escapes.test.ts";
const HELPER = "test/support/cluster-escapes.ts";
const CODE = "src/presentation/blocks/kinds/code.ts";
const TERMINAL = "src/presentation/blocks/kinds/terminal.ts";
const SCATTER3 = "src/presentation/plot/scatter3.ts";

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
    file: HELPER,
    from: "    if (found.index < index) out.push({ at: index, cluster: found.segment });",
    to: "    out.push({ at: index, cluster: found.segment });",
    why: "a helper that reports every escape cannot survive a corpus of two hundred thousand of them — T2.127 and T2.127c both state rows with escapes at boundaries, so a pass where this survives is a pass that read no frame",
  },
  mutations: [
    {
      // The helper blinded: it strips, segments, and reports nothing. The corpus
      // row stays green — which is the point — and only the fabricated
      // violation can tell.
      name: "the helper reports no escape at all",
      file: HELPER,
      from: "    if (found.index < index) out.push({ at: index, cluster: found.segment });",
      to: "    if (found.index < index) continue;",
      // T2.127b — an SGR between `e` and U+0301 is reported nowhere.
      expect: "T2.127b",
    },
    {
      // The interior test widened by one: an escape *at* a cluster's first code
      // unit is reported as inside it, which is where every renderer puts one.
      name: "an escape at a cluster's start is reported as inside it",
      file: HELPER,
      from: "    if (found.index < index) out.push({ at: index, cluster: found.segment });",
      to: "    if (found.index <= index) out.push({ at: index, cluster: found.segment });",
      // T2.127c — the control's `RED é` is reported at 0.
      expect: "T2.127c",
    },
    {
      // The index taken in the styled row rather than the stripped one. The
      // first escape in a row lands at the same index either way, so every
      // single-escape case passes; the second escape in a cluster lands past
      // the stripped row's end and `containing` answers nothing.
      name: "an escape's index is taken in the styled row",
      file: HELPER,
      from: "        at.push(stripped.length);",
      to: "        at.push(i);",
      // T2.127b — two escapes in one family report one.
      expect: "T2.127b",
    },
    {
      // **F970's first painter, restored.** The token stream is used as
      // highlight.js cut it: `\b\d+` ends a `number` token at the digit, and a
      // Prepend before that digit is a cluster the boundary splits.
      name: "a token boundary is taken in code units, not at the cluster's end",
      file: CODE,
      from: "  const tokens = wholeClusters(parsed, text);",
      to: "  const tokens = parsed;",
      // T2.130 — `؀1` is split in every grammar that tokenises a digit.
      expect: "T2.130",
    },
    {
      // **F970's second painter, restored.** The cursor's cell is the one code
      // unit at the column's index: half a surrogate pair on a flag, the mark
      // alone on `caféx` at column 4.
      name: "the cursor cell is one code unit at the column's index",
      file: TERMINAL,
      from: "  const from = unit;\n  const to = unit + cluster.length; // cells-ok — a code-unit offset",
      to: "  const from = cursorCol;\n  const to = cursorCol + 1;",
      // T2.131 — a lone surrogate on the flag at column 0.
      expect: "T2.131",
    },
    {
      // **F970's third painter, restored.** One cell per code point, the
      // zero-width pieces each given a cell, an SGR on each where the axis has
      // a tone.
      name: "a 3-D label is written one code point per cell",
      file: SCATTER3,
      from: "    for (const cluster of graphemes(l.text)) {\n      const wide = cells(cluster, ambiguous);\n      if (wide === 0) continue;",
      to: "    for (const cluster of [...l.text]) {\n      const wide = Math.max(1, cells(cluster, ambiguous));",
      // T2.132 — an escape inside the family and the keycap.
      expect: "T2.132",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
