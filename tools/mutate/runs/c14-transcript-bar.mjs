// C14 I62–I64 — the transcript's bar in the margin column, and a press on it
// (review batch 4, shell lane, §6q.2).
//
// **The margin column is blank on every row without the bar**, so a frame
// with no bar is a frame that was right yesterday: T6.42 is the control, and
// every positive arm of T1.83 fails without it.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const PAINT = "src/shell/paint.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = "test/unit/transcript-bar.test.ts test/integration/transcript-bar.test.ts";

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
    // T6.42 (C14 I62) — the bar's column dropped from the paint.
    file: PAINT,
    from: "  return withTranscriptBar(out, frame, deps, width);\n",
    to: "  return out;\n",
    why: "T6.42 — the bar's column dropped: T1.83 fails on every overflowing arm",
  },
  mutations: [
    {
      name: "the thumb is accent at the prompt too",
      file: PAINT,
      from: 'scroll.focused ? "accent" : "muted"',
      to: '"accent"',
      expect: "T1.83",
    },
    {
      // C14 I63 — `floor` for `round`: the last row still lands (r = h − 1 is exact)
      // and a middle row lands one short whenever the product is not whole.
      name: "the jump floors rather than rounds",
      file: CONSTRUCT,
      from: "Math.round((r * maxTop) / (region.height - 1))",
      to: "Math.floor((r * maxTop) / (region.height - 1))",
      expect: "T4.46",
    },
    {
      // C14 I63 — the bar's column one to the left: a press on the transcript's
      // last content column jumps, and one on the bar is an ordinary press.
      name: "the press is read one column in from the bar",
      file: CONSTRUCT,
      from: "    if (column !== region.left + region.width) return null;\n",
      to: "    if (column !== region.left + region.width - 1) return null;\n",
      expect: "T4.46",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
