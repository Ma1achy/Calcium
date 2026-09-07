// C28's instrumentation, mutated — and the rows are indexed by *what a green
// suite cannot tell apart*.
//
// **Every defect this component has had was invisible to a passing test.** Four
// came out of measuring rather than asserting: a `using` in a hot wrapper paid
// on the path that returns before it (F867), a disposable literal costing 17× a
// class (F868), a tier named `counters` at which no counter could fire (F869),
// and three fixtures that produced a well-formed block that was not the block
// under test (F865). The suite was green through all four.
//
// So the mutations here are the ones that keep a report *well-formed*. A tree
// with the wrong shape still prints; an attribution divided equally still fills
// a table; a cache counting every miss as `rev` still publishes a hit rate. A
// fabricated number is a number, which is why the control below empties the
// element table outright — if that survives, no row here is earned.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/profiler-tree.test.ts test/unit/profiler-seams.test.ts test/unit/profiler.test.ts";
const REC = "src/shell/profiling/recorder.ts";
const TREE = "src/shell/profiling/tree.ts";
const SEAM = "src/shell/profiling/registry-probe.ts";
const HCACHE = "src/viewport/viewport/cache.ts";
const RCACHE = "src/shell/render-cache.ts";
const PLOT = "src/presentation/plot/definition.ts";

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
    file: REC,
    from: "      const { node, ctx } = begin(`${kind}#${id}`);\n      return new ElementHandle(node, ctx, kind);",
    to: "      return NO_SPAN;",
    why: "no element is ever opened, so the per-element table is empty — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The inclusive parent**, which is the shape the tree was built to
      // avoid: a `group` measures its children, so charging it their time makes
      // the outermost node the widest bar in every tree ever drawn — and every
      // tree still renders, sums and nests.
      name: "INCLUSIVE: a parent is charged for its children",
      file: TREE,
      from: "  const self = Math.max(0, total - node.childTime);",
      to: "  const self = total;",
      expect: "T1.34", // and T1.36's Σ self
    },
    {
      // The other half of the same subtraction: the parent stops accumulating,
      // so *it* reports self correctly and reads as fixed, while every
      // grandparent above it is inclusive again. One line, two readings.
      name: "NO-ROLLUP: a closing child does not report its time to its parent",
      file: TREE,
      from: "  if (node.parent !== null) node.parent.childTime += total;",
      to: "",
      expect: "T1.34",
    },
    {
      // **The fabricated attribution, restored in the only place it can still
      // live.** Keying an element by kind alone collapses fifty rules onto one
      // row, and the table it produces is a per-*kind* summary — well-formed,
      // plausible, and no longer an attribution. This is the defect the whole
      // seam replaced.
      name: "BY-KIND: the element key drops the instance",
      file: REC,
      from: "      const { node, ctx } = begin(`${kind}#${id}`);",
      to: "      const { node, ctx } = begin(kind);",
      expect: "T1.32", // and T1.43, T1.33
    },
    {
      // Self time recorded as inclusive at the aggregate, with the tree left
      // correct. `Σ nodes.self` then exceeds the frame and the widest row is a
      // container — and both figures are still published, still positive, still
      // ordered.
      name: "AGGREGATE-TOTAL: the per-key row records inclusive time as self",
      file: REC,
      from: "      nodes.add(this.node.name, spent, this.node.total ?? spent, seq);",
      to: "      nodes.add(this.node.name, this.node.total ?? spent, this.node.total ?? spent, seq);",
      expect: "T1.34",
    },
    {
      // **F867's defect, put back.** The disabled path re-enters the recording
      // arm, so `tier: "off"` opens an element per block — and every assertion
      // about a *report* still passes, because the report at `off` is only
      // consulted by the row that says it is empty.
      name: "OFF-RECORDS: the disabled path takes the recording arm",
      file: SEAM,
      from: "  registry.measure = (block, width) => (prof.on ? measured(block, width) : measure(block, width));",
      to: "  registry.measure = (block, width) => measured(block, width);",
      expect: "T1.44",
    },
    {
      // **F869's defect, put back.** The two counters move back inside the
      // `prof.on` conditional — `on` is *spanning*, so the tier named after
      // counters records none. Nothing throws and nothing is missing from a
      // `spans` report, which is the only report anyone reads.
      name: "COUNTERS-DEAD: the sequence counters are gated on spanning",
      file: SEAM,
      from: '    prof.count("measure.sequences");\n    prof.gauge("measure.sequence.blocks", blocks.length);\n    return prof.on ? sequenced(blocks, width) : measureSequence(blocks, width);',
      to: "    return prof.on ? sequenced(blocks, width) : measureSequence(blocks, width);",
      expect: "T1.44",
      also: [
        {
          file: SEAM,
          from: "  const sequenced = (blocks: readonly Block[], width: number): number => {",
          to:
            "  const sequenced = (blocks: readonly Block[], width: number): number => {\n"
            + '    prof.count("measure.sequences");\n'
            + '    prof.gauge("measure.sequence.blocks", blocks.length);',
        },
      ],
    },
    {
      // **The axis order, reversed.** A lookup disagreeing on both `rev` and
      // `width` is claimed by whichever is checked first, and every lookup that
      // moves one axis agrees either way — so five of T1.21's six probes pass
      // under this and the totals are identical.
      name: "AXIS-ORDER: the height cache checks width before rev",
      file: HCACHE,
      from: '    if (slot.rev !== rev) {\n      this.#miss(id, "rev", slot.height);\n      return undefined;\n    }\n    if (slot.width !== width) {\n      this.#miss(id, "width", slot.height);\n      return undefined;\n    }',
      to: '    if (slot.width !== width) {\n      this.#miss(id, "width", slot.height);\n      return undefined;\n    }\n    if (slot.rev !== rev) {\n      this.#miss(id, "rev", slot.height);\n      return undefined;\n    }',
      expect: "T1.21",
    },
    {
      // The render cache's two appearance axes, labelled the other way round.
      // Both are one-axis lookups of the same shape, so **every total is
      // identical** and only reading the specific key after the specific lookup
      // separates them.
      name: "LABEL-SWAP: theme and focus report each other's reason",
      file: RCACHE,
      from: '    if (slot.theme !== theme) return this.#miss(id, "theme", slot.lines);\n    if (slot.focus !== focus) return this.#miss(id, "focus", slot.lines);',
      to: '    if (slot.theme !== theme) return this.#miss(id, "focus", slot.lines);\n    if (slot.focus !== focus) return this.#miss(id, "theme", slot.lines);',
      expect: "T1.55",
    },
    {
      // **The vacuous counter.** `nothing-changed` stops comparing and counts
      // every recomputation — so it reads as a healthy large number instead of
      // a healthy zero, and the figure that says whether invalidating a slot
      // bought anything now says only that the slot was invalidated.
      name: "NOTHING-CHANGED-VACUOUS: the re-measure is not compared",
      file: RCACHE,
      from: "    if (d !== null && d.id === id && sameLines(d.lines, lines)) {",
      to: "    if (d !== null && d.id === id) {",
      expect: "T1.56",
    },
    {
      // The height cache's twin, in the other direction: the comparison holds
      // and the discarded value is never kept, so the counter can never fire
      // and reads as a permanent, healthy zero. A03 §2's vacuity class, in a
      // number rather than a rule.
      name: "NO-DISCARD: the height cache forgets the value it threw away",
      file: HCACHE,
      from: "    this.#discarded = discarded === undefined ? null : { id, height: discarded };",
      to: "    this.#discarded = null;",
      expect: "T1.22",
    },
    {
      // **The phases collapsed into one.** `plot.area` is opened around the
      // whole of `positionalForm` rather than the raster, so layout and
      // furniture nest inside it. Every name in T1.40 still records, every
      // gauge in T1.41 is unchanged, and the split stops meaning anything.
      name: "ONE-PHASE: the area span swallows the layout and the furniture",
      file: PLOT,
      from: '    using _s = probe?.span("plot.area") ?? NO_SPAN;',
      to: "",
      expect: "T1.42",
      also: [
        {
          file: PLOT,
          from: '    using _s = probe?.span("plot.layout") ?? NO_SPAN;',
          to: '    using _s = probe?.span("plot.area") ?? NO_SPAN;',
        },
      ],
    },
    {
      // **The gauge that makes a duration a claim, pointed at the wrong thing.**
      // `plot.samples` reports the series count instead of the sample count, so
      // "the plot took 9 ms" loses the only figure that says whether that is
      // linear — and the gauge is still present, still positive, still named.
      name: "WRONG-SIZE: plot.samples reports the number of series",
      file: PLOT,
      from: "      block.series.reduce((n, sr) => n + sr.values.length, 0), // cells-ok — a sample count",
      to: "      block.series.length, // cells-ok — a sample count",
      expect: "T1.41",
    },
    {
      // **The cell count taken from the data.** `plot.area.cells` is what says
      // the raster is the box and not the series (F870); sourced from the
      // samples it agrees with the intuition the measurement disproved, and the
      // report reads as confirming it.
      name: "CELLS-FROM-DATA: the raster's size is read off the series",
      file: PLOT,
      from: '    probe.gauge("plot.area.cells", drawn * plotHeight(block)); // cells-ok — a cell count',
      to: '    probe.gauge("plot.area.cells", block.series.reduce((n, sr) => n + sr.values.length, 0)); // cells-ok — a cell count',
      expect: "T1.42",
    },
    {
      // The async store built at construction rather than on the transition to
      // a recording tier. C28 I33 exists because merely constructing an
      // `AsyncLocalStorage` taxes every `await` in the process by 55 % — used
      // or not — so an app at `tier: "off"` pays for a profiler it disabled.
      // Nothing observable changes except the tax.
      name: "EAGER-ALS: the async store is built at construction",
      file: REC,
      // Anchored with `startSampler()` above it: the same line appears again in
      // `setTier`, where it is correct, and mutating that one would be a
      // different claim.
      from: "  startSampler();\n  if (spanning()) contexts.enable();",
      to: "  startSampler();\n  contexts.enable();",
      expect: "T1.38",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
