// C12's right margin, mutated (I113, §3ak.49).
//
// **The defect this restores shipped inside a golden.** `line-callout-both`
// recorded `alpha 0.8774` at `x=620.4` in a 640-wide viewBox — 67 px off the
// page — and a byte-compare golden agrees with whatever it recorded, so the
// frame certified the defect for as long as it existed. Every row here is
// therefore *geometric* over the emitted document rather than a comparison
// against a recorded frame.
//
// **The rule has two halves and they are killed by different rows**, which the
// hand pass found and which is the reason this file is indexed the way it is:
//
// - the **reserve** (`rightRoom`) is what makes the string fit — RM2, RM3,
//   RM4, RM5;
// - the **fit** (`fitLabel` at the drawing site) is what contains a string past
//   the cap — RM1.
//
// So removing the reserve alone does **not** kill RM1: the fit still cuts the
// callout to the page, and the frame becomes `alp…` rather than running off it.
// A containment row cannot see a reserve going missing, and a reserve row
// cannot see containment going missing. Both are here, and each names the half
// it covers.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-svg-path.test.ts";
const SVG = "src/presentation/plot/svg.ts";

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
    from: "const SVG_EM_MAX = 0.65;",
    to: "const SVG_EM_MAX = 0.2;",
    why: "a third of a glyph's advance reserves a third of the room; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT, restored exactly**: the fixed fraction on the right and
      // no cut at the drawing site. This is what shipped.
      name: "THE DEFECT: the right margin is `width · pad` and the callout is written whole",
      file: SVG,
      from: "  return Math.min(layout.width / 3, widest * SVG_FONT_SIZE * SVG_EM_MAX) + LABEL_GAP;\n}\n\n/**\n * A gutter label cut to the room it has",
      to: "  return 0;\n}\n\n/**\n * A gutter label cut to the room it has",
      also: [{ file: SVG, from: "`${escape(fitLabel(text, canvas - at))}</text>`);", to: "`${escape(text)}</text>`);" }],
      expect: "RM1",
    },
    {
      // The reserve alone. RM1 survives this and that is the finding, not a
      // gap: the fit contains what the missing reserve would have overrun.
      name: "the reserve is gone and the fit is not, so the callout is cut instead of placed",
      file: SVG,
      from: "  return Math.min(layout.width / 3, widest * SVG_FONT_SIZE * SVG_EM_MAX) + LABEL_GAP;\n}\n\n/**\n * A gutter label cut to the room it has",
      to: "  return 0;\n}\n\n/**\n * A gutter label cut to the room it has",
      expect: "RM2",
    },
    {
      // **The bound put back to the estimate it replaced.** 0.6 is below every
      // monospace face measured — 0.6001 to 0.6182 — so a string sized at it
      // overruns the room reserved for it by up to 3%, which is the defect one
      // glyph at a time. G6c5 dies with it, on the other side of the box.
      name: "the advance is the old estimate, which is below every face measured",
      file: SVG,
      from: "const SVG_EM_MAX = 0.65;",
      to: "const SVG_EM_MAX = 0.6;",
      expect: "RM1",
    },
    {
      // **The reserve and the fit are two derivations of one product.** At
      // exactly the granted room `23.400000000000006 / 7.8` is `2.9999…`, so
      // `100` renders as `1…` in a margin sized for `100`. Found by reading the
      // diff of the moved frames, not by a count.
      name: "the tolerance is gone, so a string in a margin sized for it loses its last glyph",
      file: SVG,
      from: " + 1e-9); // cells-ok — a character count",
      to: "); // cells-ok — a character count",
      expect: "RM5",
    },
    {
      // The two `area()` callers given different rooms. The marks walk would
      // draw the data against one box and the axis emitter the furniture
      // against another — every arithmetic assertion still passing.
      name: "the marks walk reserves nothing, so the data and the furniture answer to two boxes",
      file: SVG,
      // **Re-anchored when the callout's row collector was threaded through
      // this call** (C12 I114, §3ak.50b), and **re-run by hand rather than
      // re-anchored on faith** — a stale anchor and a dead mutation read the
      // same green. It still kills `RM3`, and now `RM4`, `RC2` and `G11a` with
      // it.
      from: "    return walk(figure, block, box, layout.width, theme, out, rows);",
      to: "    return walk(figure, block, area(layout, figure.legend, gutterRoom(block, figure, layout)), layout.width, theme, out, rows);",
      expect: "RM3",
    },
    {
      // The cap removed: a 36-character callout takes 281 px of a 640-wide
      // page, so the plot area is what pays for a label.
      name: "the margin is uncapped, so a long callout takes the figure",
      file: SVG,
      from: "  return Math.min(layout.width / 3, widest * SVG_FONT_SIZE * SVG_EM_MAX) + LABEL_GAP;\n}\n\n/**\n * A gutter label cut to the room it has",
      to: "  return widest * SVG_FONT_SIZE * SVG_EM_MAX + LABEL_GAP;\n}\n\n/**\n * A gutter label cut to the room it has",
      expect: "RM4",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
