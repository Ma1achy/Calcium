// C09 I79 — a cut line is walked to the cut with the measurer's cursor, and
// no further. Mutated (T6.125, F1205).
//
// **The frame is the same under every mutation but one** — the cursor's
// clusters are the segmenter's, so a walk that goes on past the cut and drops
// what it built answers the same bytes on most lines. T3.90 counts the
// segmenter's asks and iterations on the cut path, which is where the cost
// lives; T1.53 reads the one line the frame can see: a wide glyph refused at
// the boundary followed by a narrower cluster the overrun walk would keep.
//
// **The control segments the whole line** through the iterator, which is the
// tree before I79: T3.90 counts one iteration where it expects none.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts test/edge/text-cursor.test.ts";
const TEXT = "src/presentation/text.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
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
    file: TEXT,
    from: "  let segments: Segments | null = null;\n  if (from === \"end\") {\n    let used = 0;\n    let i = 0;\n",
    to: "  let segments: Segments | null = null;\n  if (from === \"end\") {\n    let used = 0;\n    let i = 0;\n    void [...GRAPHEMES.segment(text)];\n",
    why: "the whole line is iterated once before the walk — the tree before I79 — and T3.90 counts an iteration where it expects none",
  },
  mutations: [
    {
      // **The walk goes on past the cut.** The overrun cluster is dropped and
      // the next one tried: the count is the line's, and a narrower cluster
      // after a refused wide one is kept past it.
      name: "PAST-THE-CUT: the overrun cluster is skipped rather than ending the walk",
      file: TEXT,
      from: "      const w = clusterCells(cluster, ambiguous);\n      if (used + w > budget) break;\n      used += w;\n      i += cluster.length;   // cells-ok: advancing the cursor past what was consumed\n    }\n    return { kept: text.slice(0, i), used };",
      to: "      const w = clusterCells(cluster, ambiguous);\n      if (used + w > budget) { i += cluster.length; continue; }\n      used += w;\n      i += cluster.length;   // cells-ok: advancing the cursor past what was consumed\n    }\n    return { kept: text.slice(0, i), used };",
      expect: "T1.53",
    },
    {
      // **The tail arm's boundaries from the iterator**, the walk before I79
      // on the one arm that needs the whole line.
      name: "TAIL-ITERATED: the reverse arm takes its boundaries from the segmenter's iterator",
      file: TEXT,
      from: "  const starts: number[] = [];\n  const widths: number[] = [];\n  let i = 0;\n  while (i < text.length) {   // cells-ok: a cursor, not a width\n    const run = plainRun(text, i);\n    if (run > i) {\n      for (; i < run; i += 1) {   // cells-ok: a code-unit cursor over a run of one-cell units\n        starts.push(i);\n        widths.push(1);\n      }\n      continue;\n    }\n    const cluster = soloAt(text, i) ? text.charAt(i) : clusterAt((segments ??= GRAPHEMES.segment(text)), i); // C09 I74\n    if (cluster === \"\") break;\n    starts.push(i);\n    widths.push(clusterCells(cluster, ambiguous));\n    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed\n  }",
      to: "  const starts: number[] = [];\n  const widths: number[] = [];\n  for (const s of GRAPHEMES.segment(text)) {\n    starts.push(s.index);\n    widths.push(clusterCells(s.segment, ambiguous));\n  }",
      expect: "T3.90",
    },
    {
      // **A run keeps its last unit** when the unit after it can extend it:
      // a mark is cut from its base at the boundary.
      name: "RUN-KEEPS-ITS-LAST: the cursor's give-up at a following mark removed on the head arm",
      file: TEXT,
      from: "      const run = plainRun(text, i);\n      if (run > i) {\n        const room = budget - used;",
      to: "      let run = i; while (run < text.length && text.charCodeAt(run) >= 0x20 && text.charCodeAt(run) <= 0x7e) run += 1;\n      if (run > i) {\n        const room = budget - used;",
      expect: "T1.53",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
