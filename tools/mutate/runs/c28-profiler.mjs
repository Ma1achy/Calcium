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
  "npx vitest run test/unit/profiler-tree.test.ts test/unit/profiler-seams.test.ts test/unit/profiler.test.ts test/unit/profiler-export.test.ts test/unit/profiler-async.test.ts";
const REC = "src/shell/profiling/recorder.ts";
const NODE = "src/shell/profiling/node.ts";
const SCANS = "tools/enforce/source-scans.mjs";
const TREE = "src/shell/profiling/tree.ts";
const SEAM = "src/shell/profiling/registry-probe.ts";
const HCACHE = "src/viewport/viewport/cache.ts";
const RCACHE = "src/shell/render-cache.ts";
const PLOT = "src/presentation/plot/definition.ts";
const EXPORT = "src/shell/profiling/export.ts";
const ASYNC = "src/shell/profiling/async-probe.ts";
const TYPES = "src/shell/profiling/types.ts";
const CONSTRUCT = "src/shell/construct.ts";

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
      name: "CAP-INERT: the cap admits everything",
      file: NODE,
      // **The silent-truncation class inverted.** Nothing is refused, so a
      // 60 MB heap snapshot lands whole on the disk of a process suspected of
      // leaking — and every field of the result agrees with itself: `bytes` is
      // the profile's size, `dropped` is 0, `truncated` is false. Correct,
      // consistent, and describing a cap that did not happen.
      from: "      const room = capBytes - written;",
      to: "      const room = Number.MAX_SAFE_INTEGER;",
      expect: "T1.15",
    },
    {
      // The excess stops being counted while the cap still bites. The file is
      // right and `droppedBytes` reads 0 — so 8 MB written of 61 is
      // indistinguishable from 8 of 8, which is the difference between a cap
      // that is working and one that is wrong.
      // **What replaced DROPPED-UNCOUNTED**, which survived two passes. That
      // mutation deleted the counter from `capped`'s no-room branch, and the
      // branch turned out to be unreachable: every capture writes the sink once
      // — `getHeapSnapshot()` measured one chunk of 5.19 MB — so nothing a test
      // can construct gets there. The branch is gone (F878) and this takes its
      // place on the arm that does run: the excess counted as the amount kept.
      name: "DROPPED-IS-KEPT: the overrun reports what was written, not what was refused",
      file: NODE,
      from: "      dropped += chunk.length - room;",
      to: "      dropped += room;",
      expect: "T1.15d",
    },
    {
      // `truncated` derived from nothing. A reader holding only the file cannot
      // see the cap, which is the whole reason the flag is on the result — so
      // this is the field's own vacuity class.
      name: "NEVER-TRUNCATED: the flag is a constant",
      file: NODE,
      from: "        truncated: dropped > 0,",
      to: "        truncated: false,",
      expect: "T1.15",
    },
    {
      // **The tier refusal removed.** A capture at `counters` posts to an
      // inspector the session never connected — or, with one, takes a 2.6-second
      // stall a tier below the one that asked for it.
      name: "ANY-TIER: a capture is allowed at every tier",
      file: REC,
      from: "      if (TIER_RANK[tier] < TIER_RANK.deep) {",
      to: "      if (TIER_RANK[tier] < TIER_RANK.off) {",
      expect: "T3.4",
    },
    {
      // The file lands with an extension neither tool opens. Every byte is
      // correct and the capture is unreadable by the two programs it was
      // written for, which no assertion about bytes can see.
      name: "WRONG-EXTENSION: a capture is named .json",
      file: REC,
      from: '  cpu: "cpuprofile",',
      to: '  cpu: "json",',
      expect: "T1.15",
    },
    {
      // The capture happens and the report does not name it. A file on disk the
      // report is silent about is a file nobody finds, and `dropped.captureBytes`
      // reads 0 for a session that dropped megabytes.
      name: "UNRECORDED: the capture is returned and not recorded",
      file: REC,
      from: "      self.addCapture(result);",
      to: "",
      expect: "T1.15",
    },
    {
      // **SS58's allow list widened to the directory.** Every file under
      // `src/shell/profiling/` may then read the process, which is the rule
      // reading as present and covering three files less than it says.
      name: "SSP-WIDE: the allow list names the directory",
      file: SCANS,
      from: '    scope: "src/", allow: ["src/shell/profiling/node.ts"],',
      to: '    scope: "src/", allow: ["src/shell/profiling/"],',
      expect: "T2.4",
    },
    {
      // **The two arms folded into one**, which is the mistake the rule's own
      // `why` names: SS59 gains SS58's allow list, and the profiler is exempted
      // from the user-timing leak it exists to find.
      name: "SSPU-EXEMPT: the user-timing arm allows node.ts",
      file: SCANS,
      from: '    pattern: /\\bperformance\\.(?:mark|measure)\\b/,\n    scope: "src/", allow: [],',
      to: '    pattern: /\\bperformance\\.(?:mark|measure)\\b/,\n    scope: "src/", allow: ["src/shell/profiling/node.ts"],',
      expect: "T2.4b",
    },
    {
      // **The exporter's five, and every one of them opens.** A trace viewer
      // validates a schema and nothing else, so each mutation below produces a
      // document Perfetto draws without complaint — which is the reason these
      // rows exist rather than a snapshot of the JSON.
      name: "TILED: children are laid end to end inside their parent",
      file: EXPORT,
      // The layout a reader would write if `startedAt` were not carried: each
      // child begins where the last one ended, inside the parent. Every bar
      // keeps its width, the nesting is right, and the parent's self time —
      // the only thing that says where the frame actually went — vanishes.
      from: "      ts: Math.round(node.startedAt * MS_TO_US),",
      to: "      ts: Math.round((depth === 0 ? node.startedAt : tiled) * MS_TO_US),",
      expect: "T1.45",
      also: [
        {
          file: EXPORT,
          from: "function walk(node: TreeNode, out: TraceEvent[], depth: number): void {",
          to: "let tiled = 0;\nfunction walk(node: TreeNode, out: TraceEvent[], depth: number): void {\n  const here = tiled;",
        },
        {
          file: EXPORT,
          from: "  for (const child of node.children) walk(child, out, depth + 1);",
          to: "  tiled = depth === 0 ? node.startedAt : here;\n  for (const child of node.children) {\n    walk(child, out, depth + 1);\n    tiled += child.total;\n  }",
        },
      ],
    },
    {
      // The conversion dropped on one field rather than applied twice, because
      // dropping it is the half a proportional picture hides: every bar shrinks
      // by the same thousand and the flame chart is unchanged.
      name: "HALF-CONVERTED: dur stays in milliseconds",
      file: EXPORT,
      from: "      dur: Math.round(node.total * MS_TO_US),",
      to: "      dur: Math.round(node.total),",
      expect: "T1.46",
    },
    {
      // I32's retention read as a measurement — the count a reader would take
      // from the document if the field were not there, written into the field.
      name: "DRAWN-AS-SESSION: the session's frame count is the number of trees",
      file: EXPORT,
      from: "      framesInSession: String(report.frames),",
      to: "      framesInSession: String(withTrees.length),",
      expect: "T1.47",
    },
    {
      // One colour for both feeds. A block instance and a phase inside it are
      // the two readings the element table separates, and a viewer colours by
      // this field alone.
      name: "ONE-CATEGORY: an element and a phase are the same kind",
      file: EXPORT,
      from: '      cat: node.name.includes("#") ? "element" : "phase",',
      to: '      cat: "phase",',
      expect: "T1.49",
    },
    {
      // C28 I4, in the format where it is most tempting: a line-oriented record
      // that a reader will `jq` a column out of, and a column that adds up is
      // what a missing column looks like.
      name: "THE-SUM: NDJSON publishes work + wait",
      file: EXPORT,
      from: "        work: frame.work,\n        wait: frame.wait,",
      to: "        work: frame.work,\n        wait: frame.wait,\n        total: frame.work + frame.wait,",
      expect: "T1.48",
    },
    {
      // **The async seams' six, and the first is the one the whole file is
      // for.** `trace` was written, tested against interleaving, and had no
      // caller in `src/` — so every mutation below was unreachable until the
      // decorators landed. MG25 is what said so.
      // **The call site, not the function.** Every row in `profiler-async` but
      // T1.24 calls a decorator directly, so all of them stay green on the day
      // the root stops handing the bracket down. MG25 says a decorator is named
      // somewhere in `src/`; it cannot say the right profiler reached it.
      name: "UNWIRED: the root builds the bracket and hands down nothing",
      file: CONSTRUCT,
      from: "        : { trace: deps.profiler.trace.bind(deps.profiler) as TraceFn }),",
      to: "        : {}),",
      expect: "T1.24",
    },
    {
      name: "NO-FORK: a traced span runs in the caller's context",
      file: REC,
      // Without the fork, two concurrent traces share the sync box: the second
      // opens inside the first, and the report gives the same `count` with
      // self time instead of two independent durations.
      from: "      return contexts.fork(async () => {",
      to: "      return (async () => {",
      expect: "T1.19",
      also: [
        {
          file: REC,
          from: "          record(node, end(node, ctx));\n        }\n      });",
          to: "          record(node, end(node, ctx));\n        }\n      })();",
        },
      ],
    },
    {
      // The span around the loop rather than around `next()`, which is the
      // reading a total gives: one number a slow far side and a slow shell both
      // produce, and they want opposite fixes.
      name: "STREAM-AROUND-LOOP: the wait and the work are one span",
      file: ASYNC,
      from: "          const step = await prof.trace(\"stream\", () => it.next());",
      to: "          const step = await it.next();",
      expect: "T1.20",
      also: [
        {
          file: ASYNC,
          from: "      const it = src[Symbol.asyncIterator]();\n      try {",
          to: "      const it = src[Symbol.asyncIterator]();\n      using _whole = prof.span(\"stream\");\n      try {",
        },
      ],
    },
    {
      // F881, restored. In-process view-model construction filed under the one
      // heading a reader uses to decide a cost is not theirs to fix.
      name: "ADAPT-FAR-SIDE: the adapter is the far side again",
      file: TYPES,
      from: '  adapt: "compute",',
      to: '  adapt: "far side",',
      expect: "T1.18",
    },
    {
      // The local verb route filed with the keystroke path, which is the
      // conflation this round's plan carried: two different things called
      // `handler`.
      name: "LOCAL-IS-INPUT: a document-producing route groups as input",
      file: TYPES,
      from: '  local: "compute",',
      to: '  local: "input",',
      expect: "T1.22",
    },
    {
      // A decorator that changes what the user reads. Every timing row stays
      // green; only the patch sequence says otherwise.
      name: "PATCH-DROPPED: the stream swallows its first patch",
      file: ASYNC,
      from: "          if (step.done === true) return;\n          yield step.value;",
      to: "          if (step.done === true) return;\n          if (step.value.kind !== \"data\") yield step.value;",
      expect: "T1.23",
    },
    {
      // The abandoned generator, which leaves the source's reader attached and
      // moves no number in the report.
      name: "NO-CLOSE: an early break leaves the source open",
      file: ASYNC,
      from: "        await it.return?.();",
      to: "        void 0;",
      expect: "T1.23",
    },
    {
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
