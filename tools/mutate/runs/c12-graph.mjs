// C12 I58, §3ai — the layered pipeline, and the passes the recipe does not name.
//
// **The mutations attack the four passes nobody would list**, because the two
// that everybody names — layer assignment and the median heuristic — are the two
// a reader checks. Cycle removal, deduplication, the best-kept record and the
// drop's reach are where a defect looks like correct code.
//
// **Two of these report the right number and draw the wrong figure**, which is
// why the suite under them has to include the golden corpus rather than only the
// sweeps: `bestKept` holding a reference and the medians sorted incrementally
// both leave every crossing count intact and only the frame disagrees (§3ai.5).
//
// **Anchors checked for uniqueness before the pass** (F219), and the run uses
// the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const GRAPH = "src/presentation/plot/graph.ts";

const FILES =
  "test/unit/plot-graph-gate.test.ts test/unit/plot-sweep.test.ts test/golden/plot-forms.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    file: GRAPH,
    from: "const GAP = 2;",
    to: "const GAP = 9;",
    why: "nine cells between labels widens every layer, so the golden frames move and the fit drops nodes that fitted",
  },
  mutations: [
    {
      // **The pass the recipe does not name, removed.** Without it a two-node
      // cycle survives into layering, the longest-path guard answers 0, and an
      // edge runs backwards through a figure whose whole direction claim is its
      // layering.
      name: "cycle removal never reverses anything",
      file: GRAPH,
      from: "      if (state[v] === 1) back.add(i);",
      to: "      if (state[v] === 1) void i;",
      expect: "golden",
    },
    {
      // **Deduplication before reversal rather than after** (§3ai.4 G1), which
      // is the order the ruling is about. `a -> b` and `b -> a` both survive,
      // reversal makes them the same edge, and one line is drawn twice.
      name: "the deduplication runs on the un-reversed edge",
      file: GRAPH,
      from: "    const key = `${e[0]}:${e[1]}`;",
      to: "    const key = `${String(i)}`;",
      expect: "golden",
    },
    {
      // **The best-kept record as a reference rather than a copy** (§3ai.5 S5).
      // This is the one that reports the right number: `bestCost` is correct
      // throughout and the array it points at keeps being mutated, so the
      // function returns the last ordering while claiming the best.
      name: "best-kept holds a reference to the rows the next sweep mutates",
      file: GRAPH,
      from: "      best = rows.map((r) => [...r]);",
      to: "      best = rows;",
      expect: "golden",
    },
    {
      // **Medians read against a half-applied order** (§3ai.5 S2) — deltas read
      // as state, in an ordering pass. Every count still agrees.
      name: "the medians are computed as the sort proceeds",
      file: GRAPH,
      from: "    const keyed = row.map((id, i) => ({ id, m: median(id, nbrs, p), i }));",
      to: "    const keyed = row.map((id, i) => ({ id, m: 0, i }));",
      expect: "golden",
    },
    {
      // **The drop stops taking the edges with it** (§3ai.4 G4), so a segment
      // survives to a node that is no longer drawn and the figure grows a line
      // to a place nothing is.
      name: "a dropped node leaves its edges behind",
      file: GRAPH,
      from: "    if (!keep.has(a) || !keep.has(b)) continue;",
      to: "    if (false) continue;",
      expect: "golden",
    },
    {
      // **Pass 7 removed entirely** (§3ai.6). The figure still fits, still has
      // the same crossing count and still measures nine rows — it just steps
      // sideways as it descends. GG7 reads the columns, which is the assertion
      // the golden cannot make: a snapshot agrees with whatever it recorded, and
      // the zigzag survived review and a commit inside one.
      name: "the layers are not pulled toward their neighbours",
      file: GRAPH,
      from: "  for (let pass = 0; pass < 4; pass += 1) { // cells-ok — a sweep count",
      to: "  for (let pass = 0; pass < 0; pass += 1) { // cells-ok — a sweep count",
      expect: "GG7",
    },
    {
      // **The clamp restored**, which is the defect the first build of pass 7
      // shipped and GG7 found within a minute. It looks like a safety floor and
      // it is a relative move: the figure is shifted as a whole afterwards, so
      // flooring one node at zero displaces it against every other and nothing
      // downstream can undo it. Three centres agreed and the fourth was one cell
      // out — which no count reports.
      name: "a node pulled left of the origin is floored there",
      file: GRAPH,
      from: "        if (line !== undefined) line[i] = m - Math.floor((cw(row[i] ?? 0) - 1) / 2); // cells-ok — a column position",
      to: "        if (line !== undefined) line[i] = Math.max(0, m - Math.floor((cw(row[i] ?? 0) - 1) / 2)); // cells-ok — a column position",
      expect: "GG7",
    },
    {
      // **The sweep count taken to zero.** F242 measured one sweep cutting
      // crossings four- to fivefold, so this is the figure the number was chosen
      // against rather than an arbitrary knob.
      name: "the ordering pass never runs",
      file: GRAPH,
      from: "const SWEEPS = 2;",
      to: "const SWEEPS = 0;",
      expect: "golden",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
