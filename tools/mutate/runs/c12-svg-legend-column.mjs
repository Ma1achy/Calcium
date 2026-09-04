// C12's right band — the legend's anchor and the column's cut, mutated (I115, §3ak.50f).
//
// **The first mutation restores the shipped defect, and every earlier row about
// the right band survives it.** `area()` takes the value column's reserve *and*
// the legend's band off `box.right`, and the labels, the callout and the legend
// all anchored on `box.right` — so the column was painted over the legend while
// its own 52.8 px reserve stood empty at the canvas. `RM1` (every string inside
// the `viewBox`) and `RC1` (no callout over a right-hand value label) both
// agree with that frame, because the overprint is between two *different*
// writers and each row is about one of them. `RC7` is the row that asks about
// the band rather than about a writer.
//
// **The run was written after the pass, and two of its rows died only on the
// second pass.** The two cuts — the right label's and the callout's — were
// moved from the page's edge to the column's, and reverting either failed
// nothing on the first pass: no frame in the catalogue has a right legend *and*
// a writer past the cap, so the clause had no instance in the corpus. The
// clause was not vacuous; the corpus was. `RC7` gained two constructed
// fixtures — a 48-character `yCallout: "name"` at the default width (374 px
// against a 213.3 px cap), and a `0.000123` readout at `svgLayout(160, 200)`
// (8 glyphs against a 53.3 px cap, the only way a *numeric* label reaches the
// cap: `formatReadout` writes ~18 characters at worst, 140 px against 213.3 at
// the default width) — and both mutations die on the cut **string**.
//
// **Two controls, and only one has a slot in the harness.** The harness's
// `control` is a mutation whose kill is not in doubt — it proves the pass can
// see a kill at all — so it is the shipped defect, which `RC7` was written
// against. The *survivor* control — the column's edge widened by `1e-9`, inside
// the tolerance `fitLabel` already admits, moving no cut in the corpus or the
// fixtures — was run by hand and survived, as a control must; it has no slot
// here because the harness refuses a control that survives (`BlindHarnessError`,
// which is how this file's first version was caught with the two inverted).
// `+ 12` → `+ 13` on the legend's gap was rejected as the survivor control:
// `RC7` asserts positions, so it sees a pixel — which is the point of asserting
// positions.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-svg-path.test.ts";
const SVG = "src/presentation/plot/svg.ts";

const ANCHOR = 'const originX = place === "right" ? box.right + rightRoom(figure, layout) + 12';
const LABEL_CUT = "          : fitLabel(text, box.right + rightRoom(figure, layout) - at);";
const WALK_CALL = "    return walk(figure, block, box, box.right + rightRoom(figure, layout), theme, out, rows);";

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
    file: SVG,
    from: ANCHOR,
    to: 'const originX = place === "right" ? box.right + 12',
    why: "the shipped defect: the legend anchors on box.right and `alpha` is struck through `99.12` on two committed frames, which is the picture RC7 was written from",
  },
  mutations: [
    {
      // **THE DEFECT, restored exactly**: the legend anchored on the box's edge,
      // 6 px along from the value labels, with the column's reserve on the far
      // side of it. RM1 and RC1 survive this, which is the finding.
      name: "THE DEFECT: the legend anchors on box.right, so the column is painted over it and its reserve stands empty",
      file: SVG,
      from: ANCHOR,
      to: 'const originX = place === "right" ? box.right + 12',
      expect: "RC7",
    },
    {
      // Over-pushing. A rule that moves every legend outward by the band clears
      // the two contended frames and runs 81 uncontended ones toward the edge —
      // RC7's no-column half sees the move, and RM1 sees the strings that leave
      // the page.
      name: "the legend is pushed out by the whole band unconditionally, so figures with no column move too",
      file: SVG,
      from: ANCHOR,
      to: 'const originX = place === "right" ? box.right + LEGEND_SHARE * layout.width + 12',
      expect: "RC7",
    },
    {
      // The right label's cut returned to the page's edge. Killed by the narrow
      // fixture alone: at 160 px the cap is 53.3 and `0.000123` wants 62.4, so
      // cut to the column it reads `0.000…` and cut to the page it stands whole.
      name: "the right-hand value label is cut to the page and not the column, so a capped label runs into the legend's band",
      file: SVG,
      from: LABEL_CUT,
      to: "          : fitLabel(text, layout.width - at);",
      expect: "RC7",
    },
    {
      // The callout's cut returned to the page's edge, at the walk's one call
      // site. Killed by the capped-callout fixture: 27 characters to the
      // column, 42 to the page, through the legend's text at 537.6.
      name: "the callout is cut to the page and not the column, so a capped callout runs into the legend's band",
      file: SVG,
      from: WALK_CALL,
      to: "    return walk(figure, block, box, layout.width, theme, out, rows);",
      expect: "RC7",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
