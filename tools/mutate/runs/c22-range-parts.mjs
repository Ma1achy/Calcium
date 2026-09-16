// C22 I101 — the render slot's range split: the parts held under the stable
// key, the assembly on a range miss, and what drops them. Mutated.
//
// **The shape this run exists to catch is an assembly that is not the sequence
// render.** Every part is a block rendered alone and laid where the full render
// would lay it; a gap row dropped, an `align` lost, a sliced block held and
// read back at the wrong range — each is a frame that differs from the fresh
// one by a row, and the reader who scrolled is the only one who sees it.
// T4.89b sweeps every position against the fresh render, byte for byte, and
// is the referee; the session rows count who rendered.
//
// **Left out, with its reason.** The `\0` in a child's key cannot be mutated
// into a collision the corpus can see — a top-level block and a group's child
// never share an id in one document (C04 I14) — so a key without the
// separator fails nothing and indicts nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/render-cache.test.ts test/unit/profiler-seams.test.ts";
const CACHE = "src/shell/render-cache.ts";
const LAYOUT = "src/shell/entry-layout.ts";
const SESSION = "src/shell/session.ts";

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
    file: LAYOUT,
    from: 'const GAP_ROW = "";',
    to: 'const GAP_ROW = " ";',
    why: "a gap row of one space — every assembled window over a `gapBefore` block differs from the fresh render by a byte, which T4.89b sees at the first gap",
  },
  mutations: [
    {
      // **The range split dropped from the slot.** A range miss opens no parts,
      // so every scroll assembles nothing and renders every kept child — F1161
      // back, with the reason still reported as `range`.
      name: "RANGE-OPENS-NOTHING: a range miss keeps no parts",
      file: CACHE,
      from: '    if (slot.range !== range) return this.#miss(id, "range", slot.lines, slot.parts);',
      to: '    if (slot.range !== range) return this.#miss(id, "range", slot.lines, null);',
      expect: "T4.89a",
    },
    {
      // **The parts kept across any miss** — §6c row 3b's fabricated violation.
      // A rev, focus or theme miss stores the old map back, and a part held
      // under a frame from before is read after it.
      name: "PARTS-OUTLIVE-REV: the slot's parts are carried across a miss on another axis",
      file: CACHE,
      from: "    const parts = open !== null && open.id === id ? open.parts : new Map<string, readonly string[]>();",
      to: "    const parts = open !== null && open.id === id ? open.parts : (this.#slots.get(id)?.parts ?? new Map<string, readonly string[]>());",
      expect: "T4.89c",
    },
    {
      // **The gap row dropped from the assembly.** A `gapBefore` child's row
      // is gone, and every window over it is a row short against the fresh
      // render — the corpus's first gap.
      name: "GAP-DROPPED: a child's gapBefore draws no row in the assembly",
      file: LAYOUT,
      from: "        if (child.gapBefore === true) rows.push(GAP_ROW);",
      to: "        if (child.gapBefore === true) rows.length += 0;",
      expect: "T4.89b",
    },
    {
      // **The child's `align` lost.** Rendered alone at `left`, a right-aligned
      // child sits at the left edge in the assembled window and at the right
      // in the fresh one.
      name: "ALIGN-LOST: a child is rendered alone without its align",
      file: LAYOUT,
      from: "          const alone: Group = { ...group, gapBefore: false, children: [child], align: [align] };",
      to: '          const alone: Group = { ...group, gapBefore: false, children: [child], align: ["left"] };',
      expect: "T4.89b",
    },
    {
      // **A sliced block held.** Its rows are the range's; held under its id and
      // read back at the next range, the window shows the previous slice.
      name: "SLICED-HELD: a block the window sliced is held and read back",
      file: LAYOUT,
      from: "      rows.push(...ownRows(block, render([block])));\n    }",
      to: "      const held2 = held.part(block.id) ?? ownRows(block, render([block]));\n      held.hold(block.id, held2);\n      rows.push(...held2);\n    }",
      expect: "T4.89d",
    },
    {
      // **A whole block not held.** Rendered alone on every range miss: the
      // rows are right, and the render count is the count before I101.
      name: "WHOLE-NOT-HELD: a top-level whole block is rendered on every range",
      file: LAYOUT,
      from: "        lines = ownRows(block, render([block]));\n        held.hold(block.id, lines);",
      to: "        lines = ownRows(block, render([block]));",
      expect: "T4.89d",
    },
    {
      // **The session never hands the parts over.** The cache opens them and
      // `visibleRows` renders the sequence anyway — every wiring present, no
      // assembly reached.
      name: "PARTS-NOT-PASSED: the session renders the sequence on a range miss",
      file: SESSION,
      // Re-anchored 2026-09-16: the parts pass through `withoutAnimating` (C22 I103).
      from: "    const parts = held === undefined ? withoutAnimating(graph.rendered.parts(entry.id), pieces) : undefined;",
      to: "    const parts = undefined as ReturnType<typeof graph.rendered.parts>;",
      expect: "T4.89a",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
