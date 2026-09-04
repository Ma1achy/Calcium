// C12 I110, I111, §3ap — the sankey's placement and drawing over `graph`'s layering.
//
// **Every mutation is a cell of §3ap.4's table**, because a row governed by one
// rule restates it: the bar taken from one side (K6), the weight read from one
// origin (K1), the dummy drawn as a bar (K4), a label written where it does not
// fit and labels written inner-first (K3), the sacrifice order reversed (K5),
// the shade returned to the block and the shared cell's background dropped
// (K9, K13), the colour taken from the drawn end (K7), the notice row spent
// last (K12) and the slices stacked by declaration (K2).
//
// **Three of these report every count correctly and draw the wrong figure** —
// the one-origin weight, the drawn-end colour and the declaration-order slices
// — which is why the rows under them read cells and slots rather than totals.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SANKEY = "src/presentation/plot/sankey.ts";

const FILES = "test/unit/plot-sankey.test.ts test/golden/plot-forms.test.ts";

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
    file: SANKEY,
    from: "const GAPS = [2, 1, 0] as const;",
    to: "const GAPS = [0] as const;",
    why: "no gap between bars restacks every layer, so SK1's walked positions and every sankey golden move",
  },
  mutations: [
    {
      // **K6 — the bar taken from the in-side alone.** `hub` shrinks to its
      // two units, the loss disappears, and every ribbon still fits it.
      name: "a bar is its in-side, not the larger side",
      file: SANKEY,
      from: "      barH.set(id, Math.max(ins, outs, opts.quantum ? 1 : opts.min));",
      to: "      barH.set(id, Math.max(ins, opts.quantum ? 1 : opts.min));",
      expect: "SK2",
    },
    {
      // **K1 — the weight of the first origin only.** `a→b 2` beside `b→a 3`
      // draws a ribbon of two: right in every count but the one that is the data.
      name: "a deduplicated edge keeps only the surviving weight",
      file: SANKEY,
      from: "  const weights = laid.origins.map((os) => os.reduce((s, o) => s + (g.edges[o]?.weight ?? 0), 0));",
      to: "  const weights = laid.origins.map((os) => g.edges[os[0] ?? -1]?.weight ?? 0);",
      expect: "SK3",
    },
    {
      // **K4 — the dummy drawn as a bar**: a node the graph does not have, in
      // the right colour at the right rows.
      name: "a dummy is painted as a bar",
      file: SANKEY,
      from: "    for (let hr = b.y0; hr < b.y1; hr += 1) put(hr, xOf(b.layer), { owner, bar: real }); // cells-ok — a half-row index",
      to: "    for (let hr = b.y0; hr < b.y1; hr += 1) put(hr, xOf(b.layer), { owner, bar: true }); // cells-ok — a half-row index",
      expect: "SK4",
    },
    {
      // **K3 — the fit test removed.** `rate-limiter` is written under
      // `upstream-service` at 40 columns and the row reads both names.
      name: "a label is written wherever its bar is",
      file: SANKEY,
      from: "      if (col < lo || col + w > hi) continue;",
      to: "      if (false) continue;",
      expect: "SK5",
    },
    {
      // **K3 the other way — inner-first.** The middle name survives and the
      // sink's is the one that goes.
      name: "labels are written from the first layer onward rather than outside in",
      file: SANKEY,
      from: "    const l = i % 2 === 0 ? i / 2 : k - 1 - (i - 1) / 2; // cells-ok — a layer index",
      to: "    const l = i; // cells-ok — a layer index",
      expect: "SK5",
    },
    {
      // **K5 — the sacrifice order reversed.** The largest sources go first and
      // the notice names `src-12`.
      name: "the drop takes the most flow first",
      file: SANKEY,
      from: "    .sort((a, b) => (declaredFlow.get(a) ?? 0) - (declaredFlow.get(b) ?? 0) || b - a);",
      to: "    .sort((a, b) => (declaredFlow.get(b) ?? 0) - (declaredFlow.get(a) ?? 0) || b - a);",
      expect: "SK6",
    },
    {
      // **K13 — the ribbon's interior returned to the block.** The 24-bit frame
      // still reads in colour; the one-bit frame is one block with letters in it.
      name: "the ribbon interior is the solid block",
      file: SANKEY,
      from: 'const UNICODE: Alphabet = Object.freeze({ bar: "█", top: "▀", bottom: "▄", ribbon: "▒", ascii: false });',
      to: 'const UNICODE: Alphabet = Object.freeze({ bar: "█", top: "▀", bottom: "▄", ribbon: "█", ascii: false });',
      expect: "SK7",
    },
    {
      // **K9 — the shared cell's background dropped.** The lower flow vanishes
      // from every cell it shares, and no count changes.
      name: "two owners in one cell paint only the upper one",
      file: SANKEY,
      from: "    return cell(a.top, top.owner, bot.owner);",
      to: "    return cell(a.top, top.owner);",
      expect: "SK7",
    },
    {
      // **K7 — the colour from the drawn end.** The reversed ribbon arrives in
      // `a`'s slot and the reversal's one visible sign beside the count is gone.
      name: "a ribbon takes the colour of the node it is drawn from",
      file: SANKEY,
      from: "    const at = first === undefined ? -1 : g.nodes.findIndex((node) => node.id === first.from);",
      to: "    const at = first === undefined ? -1 : g.nodes.findIndex((node) => node.id === first.to);",
      expect: "SK3",
    },
    {
      // **K12 — the notice row spent after the drawing.** `composeRows` slices
      // the figure to its height and `1 reversed` is the row that falls off.
      name: "the notice row is not budgeted before the drawing",
      file: SANKEY,
      from: "    const budget = cut === 0 && probe.reversed === 0 ? areaRows : areaRows - 1; // cells-ok — a row count",
      to: "    const budget = areaRows; // cells-ok — a row count",
      expect: "SK3",
    },
    {
      // **K2 — slices stacked by declaration.** `a→x` was declared first, so it
      // takes the top of `a`'s bar and crosses `a→y` on the way down; every bar
      // height and every crossing count of the *ordering* pass is unchanged.
      name: "outgoing slices are stacked in declaration order",
      file: SANKEY,
      from: "    js.sort((p, q) => centreOf(bar(laid.edges[p]![1])) - centreOf(bar(laid.edges[q]![1])) || byId(p, q));",
      to: "    js.sort(byId);",
      expect: "SK1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
