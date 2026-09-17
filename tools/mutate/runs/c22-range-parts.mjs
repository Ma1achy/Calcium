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
    // **Re-pointed when the gap moved inside the block** (F1224). It used to be
    // `GAP_ROW = " "`, and there is no `GAP_ROW`: the assembler does not draw
    // spacing any more, the block does (C09 I80). The control's *effect* is what
    // is ported, not its line — a byte on every blank row an assembled window
    // emits, so the assembled and fresh renders differ wherever a padded block
    // appears, which is where the old one differed too.
    // **The whole-block branch, not the children loop.** The loop was the first
    // choice and it stopped running: the fixture's column group gained its own
    // padding, so it is now assembled whole and never reaches the per-child
    // path. A control on a branch the corpus no longer takes is a blind harness
    // that reads as thoroughness — the harness said so rather than reporting a
    // clean pass, which is the guard doing its job.
    from: "      rows.push(...lines);\n    } else {",
    to: '      rows.push(...lines.map((l) => (l === "" ? " " : l)));\n    } else {',
    why: "every blank row in a whole block's assembled rows becomes one space — the assembled window differs from the fresh render by a byte at the first blank, which T4.89b sees",
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
      // Re-anchored 2026-09-16 (C22 I104, F1190): the parts are a `Held` — whole
      // lines and slices — and a fresh one comes from `freshHeld()`.
      from: "    const parts = open !== null && open.id === id ? open.parts : freshHeld();",
      to: "    const parts = open !== null && open.id === id ? open.parts : (this.#slots.get(id)?.parts ?? freshHeld());",
      expect: "T4.89c",
    },
    {
      // **The assembler losing a container's edges, and this row found it**
      // (F1224). It used to push a `GAP_ROW` for a `gapBefore` child and the
      // mutation dropped it, leaving every window a row short. The assembler
      // pushes nothing now — so the re-pointed mutation asked instead what
      // happens to a *padded group*, and survived, because no fixture had one.
      // Giving the fixture a padded container turned the row red with no
      // mutation applied: children rendered alone and laid end to end draw none
      // of the group's own edges, so the assembly was missing the top row and
      // the inset on every line while the fresh render had both.
      //
      // The fix is the window seam's answer — keep a padded group whole — and
      // this mutation is that guard removed, which puts the defect back.
      name: "PAD-GROUP-SPLIT: a padded column group is assembled from its children",
      file: LAYOUT,
      from: "      block.padding === undefined\n    ) {",
      to: "      true\n    ) {",
      expect: "T4.89b",
    },
    {
      // **The child's `align` lost.** Rendered alone at `left`, a right-aligned
      // child sits at the left edge in the assembled window and at the right
      // in the fresh one.
      name: "ALIGN-LOST: a child is rendered alone without its align",
      file: LAYOUT,
      from: "          const alone: Group = { ...group, children: [child], align: [align] };",
      to: '          const alone: Group = { ...group, children: [child], align: ["left"] };',
      expect: "T4.89b",
    },
    {
      // **A sliced block held regardless of its window.** Its rows are the
      // range's; served at the next range, the window shows the previous
      // slice. Re-anchored 2026-09-16 (C22 I104, F1190): a slice *is* held now,
      // under its window — so the mutation is the window condition dropped at
      // the cache, and T4.89d's second scroll renders no new slice.
      name: "SLICED-HELD: a slice is read back at any window",
      file: CACHE,
      from: "        return held !== undefined && held.window === window ? held.lines : undefined;",
      to: "        return held !== undefined ? held.lines : undefined;",
      expect: "T4.89d",
    },
    {
      // **A whole block not held.** Rendered alone on every range miss: the
      // rows are right, and the render count is the count before I101.
      name: "WHOLE-NOT-HELD: a top-level whole block is rendered on every range",
      file: LAYOUT,
      from: "        lines = render([block]);\n        held.hold(block.id, lines);",
      to: "        lines = render([block]);",
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
