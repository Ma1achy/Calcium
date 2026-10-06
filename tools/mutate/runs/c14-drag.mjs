// The drag — the container a gesture belongs to, and the bands (C14 §6f,
// `R-SEL-012`, `R-SEL-013`, `R-SEL-014`).
//
// **Every mutation here leaves a drag that selects and a scroll that moves.**
// What changes is which container the gesture owns and where a band begins —
// and neither is visible from a row asserting that dragging selects something.
//
// The first is the section's reason for existing: taking the container from the
// event that supplies the distance reads as consistency, and hands the gesture
// to whatever the pointer happens to be over.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/copy-drag.test.ts";
const MODEL = "src/shell/drag-selection.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The container taken from the pointer's world rather than the
    // gesture's** (C14 I44). The pointer supplies the distance, so taking the
    // container from the same place reads as consistent — and the moment the
    // reader drags out of a box the transcript starts moving underneath them,
    // which is indistinguishable from the selection jumping.
    name: "the autoscroll scrolls the transcript rather than the gesture's container",
    file: MODEL,
    from: "    container: drag.container,",
    to: "    container: VIEWPORT,",
    expect: "T1.44",
  },
  {
    // **Outermost rather than innermost** (C14 I46). *Where you start decides
    // what you can address*: a press inside a nested box that bound to the
    // outer one would scroll the wrong thing on every gesture in a nest, and
    // agrees with the correct answer everywhere else.
    name: "a nested press binds to the outermost container instead of the innermost",
    file: MODEL,
    from: "    if (best === null || box.to - box.from < best.to - best.from) best = box;",
    to: "    if (best === null || box.to - box.from > best.to - best.from) best = box;",
    expect: "T1.44",
  },
  {
    // **The first band's boundary** (C14 I45). One cell past falls into the
    // 60 ms band, so the slowest, most controllable band is the one that never
    // happens — and every fixture sitting in the middle of a band agrees.
    name: "one cell past the rect takes the middle band rather than the slow one",
    file: MODEL,
    from: "  if (past <= 1) return 120;",
    to: "  if (past < 1) return 120;",
    expect: "T1.45",
  },
  {
    // **The rect read as closed rather than half-open.** The last row of the
    // container counts as one cell past under the correct reading and as inside
    // under this one, so the scroll begins one row later than the reader's
    // pointer says — a lag with no symptom except that it feels wrong.
    name: "the rect's last row is treated as outside rather than as its edge",
    file: MODEL,
    from: "  if (value >= to) return value - to + 1;",
    to: "  if (value > to) return value - to + 1;",
    expect: "T1.45",
  },
  {
    // **No band means the slowest band** (C14 I45, `R-SEL-014`). It reads as a
    // safe default and it makes *within the rect there is no scroll* false: a
    // drag that never leaves the container creeps, and the container the drag is
    // merely passing through is no longer scenery.
    name: "a pointer inside the rect scrolls slowly instead of not at all",
    file: MODEL,
    from: "  if (afterMs === null) return null;",
    to: "  const _unused = afterMs;",
    expect: "T1.46",
  },
  {
    // C14 I50 — across entries the edges swap: a later entry clamps to the top.
    name: "an earlier entry clamps to the box's last row",
    file: "src/shell/drag-selection.ts",
    from: "    return order.indexOf(caret.entryId) < order.indexOf(box.entryId) ? first : last;\n",
    to: "    return order.indexOf(caret.entryId) < order.indexOf(box.entryId) ? last : first;\n",
    expect: "T1.48",
  },
  {
    // C14 I50 — one row past the box's end is let through.
    name: "the box's end is inclusive",
    file: "src/shell/drag-selection.ts",
    from: "  if (caret.row >= box.to) return last;\n",
    to: "  if (caret.row > box.to) return last;\n",
    expect: "T1.48",
  },
  {
    // C14 I50 — the clamp withdrawn inside the entry: the prose below is reached.
    name: "a caret below the box is not clamped",
    file: "src/shell/drag-selection.ts",
    from: "  if (caret.row >= box.to) return last;\n",
    to: "",
    expect: "T1.48",
  },
  {
    // C14 I51 — the ends ordered by entry only, as shipped.
    name: "an upward drag inside one entry keeps press-then-pointer order",
    file: "src/shell/semantic-selection.ts",
    from: "  const forward = a < b || (a === b && from.row <= to.row);\n",
    to: "  const forward = a <= b;\n",
    expect: "T1.49",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): one band for every
    // distance, so the table row fails and so does *inside the rect is no
    // scroll*. If this survives, nothing below reaches the bands.
    file: MODEL,
    from: "  if (past <= 0) return null;",
    to: "  if (past <= 0) return 120;",
    why:
      "every distance takes one band, so the band table and *inside is no scroll* both fail — " +
      "if this survives, nothing below reaches the arithmetic",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
