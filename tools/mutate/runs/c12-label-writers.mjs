// C12 I118, §3n — one cluster writer for the treemap, `tree`, `graph`, the
// sankey and the point labels (F969, F976).
//
// **The control is the writer writing nothing.** Every row this run reads
// asserts a name in a frame or a cluster in a cell, so a harness that cannot
// see every label vanish can see nothing below.
//
// **The guard is mutated from two sides, and the leading-mark case sees only
// one of them.** Removing `if (w === 0) continue` writes a zero-width cluster
// into the cell and leaves the column where it was, so the next cluster
// overwrites it — a leading mark vanishes exactly as it does with the guard,
// and only a body that is nothing but a mark can tell. Giving the cluster a
// cell of its own (`Math.max(1, w)`, the shape `cluster-escapes.mjs` restores
// in scatter3) moves the column, and that is what the leading-mark case sees.
// T1.130 carries both cases for this reason (C12 T6.96).
//
// **The three callers are restored one at a time**, each to the private
// per-code-point loop it carried, so a call site that quietly stopped going
// through the writer is caught by the row that reads that form — and by C09
// T2.129's equality-compared record, which gains the kind back.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CHARGRID = "src/presentation/plot/chargrid.ts";
const DEF = "src/presentation/plot/definition.ts";
const SANKEY = "src/presentation/plot/sankey.ts";
const PL = "src/presentation/plot/pointlabels.ts";

const FILES =
  "test/unit/plot-tree.test.ts test/unit/plot-hierarchy.test.ts test/unit/plot-sankey.test.ts " +
  "test/unit/plot-point-labels.test.ts test/unit/plot-graph-gate.test.ts test/contract/cluster-escapes.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    // T2.129 renders every kind at four arms and two widths, and a mutation
    // that loses a shape in every frame reports at length: the buffer is set
    // rather than left at `execSync`'s default (`mutate.mjs`, `ran`).
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CHARGRID,
    from: "    row[col] = cluster;\n",
    to: "",
    why: "the writer writes nothing, so every name in every frame this run reads is gone",
  },
  mutations: [
    {
      // **The four writers restored in one line.** Per code point, the
      // zero-width pieces dropped by the guard and the wide ones still given
      // their continuation: `café` is `cafe`, the keycap a bare digit.
      name: "the writer walks code points rather than clusters",
      file: CHARGRID,
      from: "  for (const cluster of graphemes(body)) {",
      to: "  for (const cluster of [...body]) {",
      // T1.130's keycap and family; T2.129's record gains the four kinds.
      expect: "T1.130",
    },
    {
      // **The guard removed.** Invisible to a leading mark — the next cluster
      // overwrites the cell — and visible to a body that is only one.
      name: "a zero-width cluster is written into the cell and the column stays",
      file: CHARGRID,
      from: "    if (w === 0) continue;\n",
      to: "",
      expect: "T1.130",
    },
    {
      // **The cluster given a cell of its own.** The leading mark takes a cell
      // and the label after it shifts by one.
      name: "a zero-width cluster owns a cell of its own",
      file: CHARGRID,
      from: "    const w = cells(cluster, ambiguous);\n    if (w === 0) continue;\n",
      to: "    const w = Math.max(1, cells(cluster, ambiguous));\n",
      expect: "T1.130",
    },
    {
      // **The continuation left unfilled** — the survivor TM5 was written for,
      // now in the one place it lives. A two-cell glyph leaves its second cell
      // blank for an edge, a fill or a ribbon to walk into.
      name: "a wide cluster leaves no continuation cell",
      file: CHARGRID,
      from: "    for (let k = 1; k < w; k += 1) if (col + k < row.length) row[col + k] = \"\"; // cells-ok — a cell count\n",
      to: "",
      // TR11's column arithmetic, TM5's width, T1.130's whole row.
      expect: "TR11",
    },
    {
      // **The treemap's private loop restored** beside the shared writer.
      name: "the treemap writes its names one code point per cell",
      file: DEF,
      from: "    write(named[at.row]!, at.col, text, ambiguous);\n",
      to:
        "    let col = at.col;\n" +
        "    for (const ch of text) {\n" +
        "      named[at.row]![col] = ch;\n" +
        "      const w = cells(ch, ambiguous);\n" +
        "      for (let k = 1; k < w; k += 1) named[at.row]![col + k] = \"\";\n" +
        "      col += w;\n" +
        "    }\n",
      // T2.129: `plot-treemap` loses NFD, KEYCAP and FAMILY; T1.131 with it.
      expect: "T2.129",
    },
    {
      // **The sankey's private loop restored.**
      name: "the sankey writes its labels one code point per cell",
      file: SANKEY,
      from: "      write(line, col, label, caps.ambiguousWidth);\n",
      to:
        "      let c = col;\n" +
        "      for (const ch of label) {\n" +
        "        line[c] = ch;\n" +
        "        const cw = cells(ch, caps.ambiguousWidth);\n" +
        "        for (let j = 1; j < cw; j += 1) line[c + j] = \"\";\n" +
        "        c += cw;\n" +
        "      }\n",
      // T2.129: `plot-sankey` loses KEYCAP and FAMILY; T1.132 with it.
      expect: "T2.129",
    },
    {
      // **The point labels' private copy restored.** Not in T2.129's record —
      // the line plot's labels reached that frame whole before, because Ink
      // was handed the pieces in adjacent cells — so the row that reads the
      // overlay before Ink is the one that sees it.
      name: "the point labels write their names one code point per cell",
      file: PL,
      from: "        write(text[i]![row]!, start + 1, body, ambiguous); // cells-ok — a column position\n",
      to:
        "        {\n" +
        "          let col = start + 1;\n" +
        "          for (const ch of body) {\n" +
        "            text[i]![row]![col] = ch;\n" +
        "            const w = cells(ch, ambiguous);\n" +
        "            for (let k = 1; k < w; k += 1) text[i]![row]![col + k] = \"\";\n" +
        "            col += w;\n" +
        "          }\n" +
        "        }\n",
      expect: "T1.133",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
