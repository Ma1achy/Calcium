// C12 I120 — a label clears the last one kept on its row, or it is dropped.
//
// **The rule has two writers and the finding thought it had one.** F992 named
// the bar's value labels as the writer with no guard and `columnLabels` as the
// sibling that had one; the sibling's guard was `start >= cells(row)`, which
// forbids an overlap and permits exact adjacency, so it drew `montuewedthu`.
// Half these mutations are aimed at that half.
//
// **The two that only a fold can fail** are `a refusal reserves` and `one edge
// for the whole area`. Both leave a frame that is arithmetically self-consistent
// and quieter than the right one — every surviving label correct, in the right
// place, with fewer of them — which is why LC2 and LC3 assert the survivors by
// name rather than counting them.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CAT = "src/presentation/plot/categorical.ts";
const DEF = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-label-collision.test.ts 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CAT,
    from: "  if (!showValue) return out;",
    to: "  return out;",
    why: "a vertical bar that writes no number at all fails LC1's own control — the fixture must still compose `4.17.4` — as well as every row about which numbers survive; a run that cannot see that cannot see anything below",
  },
  mutations: [
    {
      // **The shipped defect, in the writer that was cited as not having it.**
      name: "the claimer permits exact adjacency again",
      file: DEF,
      from: "    if (start <= end) return false; // cells-ok — a column position",
      to: "    if (start < end) return false; // cells-ok — a column position",
      expect: "LC1",
    },
    {
      // **Drop against elide, and it is the cell only the trace reaches.**
      // Moving the edge on a refusal collapses a run of contending labels onto
      // its first — every survivor still correct, and two fewer of them.
      name: "a refusal reserves the cells it was refused",
      file: DEF,
      from: "    if (start <= end) return false; // cells-ok — a column position",
      to: "    if (start <= end) { end = start + width; return false; } // cells-ok — a column position",
      expect: "LC2",
    },
    {
      // The claim stops carrying its row: one edge for the whole plot area, so
      // two numbers on different rows contend because their bands abut.
      name: "one edge for the whole plot area rather than one per row",
      file: DEF,
      from: "      claimers[row]?.(from + start, width) ?? true); // cells-ok — a column position",
      to: "      claimers[0]?.(from + start, width) ?? true); // cells-ok — a column position",
      expect: "LC3",
    },
    {
      // The band's offset dropped, so every claim is made in band-local
      // coordinates and two bands' labels at `start 0` never see each other.
      name: "the claim is made in the band's own coordinates",
      file: DEF,
      from: "      claimers[row]?.(from + start, width) ?? true); // cells-ok — a column position",
      to: "      claimers[row]?.(start, width) ?? true); // cells-ok — a column position",
      expect: "LC1",
    },
    {
      // The wiring rather than the mechanism: `barColumn` still takes a claim
      // and stops asking. Every row that calls `barColumn` with a claimer of
      // its own passes; only the ones going through the renderer fail.
      name: "`barColumn` ignores the claim it was given",
      file: CAT,
      from: "  if (claim !== undefined && !claim(at, left, wide)) return out; // cells-ok — a column position",
      to: "  if (false && claim !== undefined && !claim(at, left, wide)) return out; // cells-ok — a column position",
      expect: "LC1",
    },
    {
      // The other call site. The grouped arm keeps its claim and the
      // single-series arm loses it, which no row indexed by the demo figure
      // alone would see.
      name: "the single-series vertical arm stops passing its claim",
      file: DEF,
      from: "        barColumn(block.series[0]?.values[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat, claim),",
      to: "        barColumn(block.series[0]?.values[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat),",
      expect: "LC1",
    },
    {
      // The grouped arm's claim, for the same reason from the other side.
      name: "the grouped vertical arm stops passing its claim",
      file: DEF,
      from: "        barColumn(ordered[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat, claim),",
      to: "        barColumn(ordered[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat),",
      expect: "LC2",
    },
    {
      // Over-eager: two cells of clearance rather than one. The half that
      // would make this the wrong rule — a placer that refuses labels which
      // were never going to collide.
      name: "the clearance is two cells rather than one",
      file: DEF,
      from: "    if (start <= end) return false; // cells-ok — a column position",
      to: "    if (start <= end + 1) return false; // cells-ok — a column position",
      expect: "LC5",
    },
    {
      // A number that is never written moving the edge anyway. The clause
      // §6p.2 closes on, and the reason the ask sits below every drop.
      name: "a number too wide for its band claims the cells it wanted",
      file: CAT,
      from: "  if (wide > w) return out; // cells-ok — a label width",
      to: "  if (wide > w) { claim?.(h - 1, 0, wide); return out; } // cells-ok — a label width",
      expect: "LC2",
    },
    {
      // `columnLabels`' own half: the names row stops asking at all.
      //
      // **Re-anchored when the placer gained a tail reservation** (C12 I8,
      // F374). The guard was `if (nw > 0 && nw <= w && claim(start, nw)) {`
      // and the function was `columnLabels`; the walk is `place` now, called to
      // a fixed point so the axis can reserve cells for the `+N` it is about to
      // write, and the guard carries `start + nw <= limit` between the two. The
      // subject is unchanged — *a name is kept only where it clears the last
      // one kept* — so this is a move rather than a new mutation.
      name: "the category names stop clearing each other",
      file: DEF,
      from: "    if (nw > 0 && nw <= w && start + nw <= limit && claim(start, nw)) { // cells-ok — a column position",
      to: "    if (nw > 0 && nw <= w && start + nw <= limit && (claim(start, nw) || true)) { // cells-ok — a column position",
      expect: "LC4",
    },
    {
      // A dropped name keeping its tick — the axis ruled where nothing is
      // named, which the string assertion on the row below cannot see.
      name: "a dropped category name keeps its tick",
      file: DEF,
      from: "      ticks.push(centre);\n    }\n    x += w; // cells-ok — a column width",
      to: "    }\n    ticks.push(centre);\n    x += w; // cells-ok — a column width",
      expect: "LC4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
