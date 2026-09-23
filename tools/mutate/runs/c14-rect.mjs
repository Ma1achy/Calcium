// The rectangle — the clip to the anchor's block, and cells rather than source
// (C14 §6e, `R-SEL-007`).
//
// **Every mutation here leaves a rectangle that exists and copies.** A reader
// would get text back from all five. What changes is the *rule*: which block the
// clip is taken against, whether a head that leaves clips or refuses, where the
// direction of a cross-entry head comes from, and whether the window is over
// cells or over bytes.
//
// **One clause is deliberately not here**, and its absence is the finding: the
// order of the slice and the strip. Both orders give the same string, because
// `sliceCells` skips escapes when it counts cells — so the sentence that named
// the order could not be mutated, which is how it was found and why C14 I43 no
// longer says it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/copy-rect.test.ts";
const MODEL = "src/shell/semantic-selection.ts";

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
    // **The clip becomes a containment test** — `R-SEL-007` inverted, and the
    // reading of it that sounds identical. *Never crosses a block boundary* is
    // satisfied by refusing, and refusing makes the selection empty while the
    // reader extends past the edge and come back when they return. Every
    // assertion about the rectangle's rows is vacuous against this, which is why
    // T1.42 asserts it is not null before it asserts anything about it.
    name: "a head outside the anchor's block gives no rectangle instead of clipping",
    file: MODEL,
    from: "  const headRow = Math.min(Math.max(raw, span.from), span.to - 1);",
    to: "  if (raw < span.from || raw > span.to - 1) return null;\n  const headRow = raw;",
    expect: "T1.42",
  },
  {
    // **The clip dropped altogether**, which is the other direction and reads as
    // trusting the caller. The rectangle crosses into the block below and the
    // copy takes rows belonging to something the reader never selected — a
    // silent violation, since the text that comes back is real text.
    name: "the head's row is taken as it is, so the rectangle crosses the boundary",
    file: MODEL,
    from: "  const headRow = Math.min(Math.max(raw, span.from), span.to - 1);",
    to: "  const headRow = Number.isFinite(raw) ? raw : anchor.row;",
    expect: "T1.42",
  },
  {
    // **The clip taken against the head's block rather than the anchor's.** It
    // reads as *the block you are in* and it is the opposite of *clips to the
    // region it started in* — the rectangle would follow the reader out instead
    // of holding where they began, and with the head past the end it vanishes.
    name: "the region is the block the head is in, not the one the anchor started in",
    file: MODEL,
    from: "    (sp) => entryOf(sp.key) === anchor.entryId && sp.from <= anchor.row && anchor.row < sp.to,",
    to: "    (sp) => entryOf(sp.key) === head.entryId && sp.from <= head.row && head.row < sp.to,",
    expect: "T1.42",
  },
  {
    // **A cross-entry head keeps its own row.** A row in another entry is not a
    // coordinate in this one's space, and using it anyway is arithmetic that
    // always produces a number — so the rectangle is always plausible and is
    // the wrong one whenever the two entries differ in height.
    name: "a head in another entry uses its own row rather than the document's order",
    file: MODEL,
    from: "  return h > a ? Infinity : -Infinity;",
    to: "  return head.row;",
    expect: "T1.42",
  },
  {
    // **The window becomes a substring** (C14 I43). On unpainted text the two
    // agree exactly, which is most fixtures; on a painted line the bytes of the
    // escape are what comes back, and a double-width cluster is halved into a
    // row one cell wide. This is the clause that replaced the order one.
    name: "the copy windows bytes rather than cells",
    file: MODEL,
    from: '    out.push(sliceCells(line, rect.fromColumn, rect.toColumn + 1, ambiguous).replace(sgr, ""));',
    to: '    out.push(line.slice(rect.fromColumn, rect.toColumn + 1).replace(sgr, ""));',
    expect: "T1.43",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): every rectangle becomes
    // one row tall, so both rows fail — T1.42 on the clipped span and T1.43 on
    // the copy's shape. If this survives, nothing below reaches the model.
    file: MODEL,
    from: "    fromRow: Math.min(anchorRow, headRow),",
    to: "    fromRow: Math.max(anchorRow, headRow),",
    why:
      "every rectangle collapses to its last row, so the clip has nothing to be measured over " +
      "and the copy has one line — if this survives, nothing below reaches the rectangle",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
