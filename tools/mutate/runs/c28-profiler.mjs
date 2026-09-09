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
  "npx vitest run test/unit/profiler-gauges.test.ts test/unit/profiler-tree.test.ts test/unit/profiler-seams.test.ts test/unit/profiler.test.ts test/unit/profiler-export.test.ts test/unit/profiler-async.test.ts test/unit/profiler-budget.test.ts test/unit/profiler-recorder.test.ts test/edge/profiler.test.ts test/integration/profiler.test.ts test/revert/profiler.test.ts";
const REC = "src/shell/profiling/recorder.ts";
const NODE = "src/shell/profiling/node.ts";
const SCANS = "tools/enforce/source-scans.mjs";
const TREE = "src/shell/profiling/tree.ts";
const REPLAY = "src/shell/profiling/replay.ts";
const RECORD = "src/shell/profiling/record.ts";
const CONFIG = "src/shell/config.ts";
const SEAM = "src/shell/profiling/registry-probe.ts";
const HCACHE = "src/viewport/viewport/cache.ts";
const RCACHE = "src/shell/render-cache.ts";
const PLOT = "src/presentation/plot/definition.ts";
const EXPORT = "src/shell/profiling/export.ts";
const ASYNC = "src/shell/profiling/async-probe.ts";
const TYPES = "src/shell/profiling/types.ts";
const CONSTRUCT = "src/shell/construct.ts";
const BUDGET = "src/testing/profile.ts";
const SESSION = "src/shell/session.ts";
const TREPLAY = "src/testing/replay.ts";
const PAINT = "src/shell/paint.ts";
const RENDER_FRAME = "src/shell/render-frame.ts";
const VIEWPORT = "src/viewport/viewport/viewport.ts";
const LEAKS = "src/shell/profiling/leaks.ts";
const SCRATCH = "src/shell/render-scratch.ts";
const PANES = "src/shell/profiling/panes.ts";
const RING = "src/shell/profiling/ring.ts";
const LEAKSRC = "src/shell/profiling/leaks.ts";
const CHROME = "src/shell/chrome.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const STATUS = "src/presentation/blocks/kinds/status.ts";
const IMAGE = "src/presentation/blocks/kinds/image.ts";
const SCHED = "src/terminal/frame-scheduler.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

/**
 * Survivors with a reason, and a staleness arm — the `c19-menu-window.mjs` form.
 *
 * Two wirings the unit corpus cannot see, one file below the seam T1.104
 * resolves, and the row that counts for both is tier 5's parity on both
 * channels (C28 T5.1c), which this run does not execute. Each was applied by
 * hand from a copy, `dist/` rebuilt, T5.1c and T5.1d watched go red, and the
 * source restored by digest (F971, F972). `anchors.mjs`'s `CROSS_TIER` names
 * the expectation so the sweep accepts it; this map is what keeps the pass
 * honest about it — a listed name that is caught after all fails the pass.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "ROOT-HANDS-TAPPED: the session gives the sampler the tapped elapsed",
    "`resolveConfig` is right and `session.ts` hands the sampler `this.config.elapsed` — the " +
      "tapped clock — instead of `sampleClock`. No unit row constructs a recording session " +
      "around the root; tier 5's T5.1c counts mono reads consumed against recorded and is red " +
      "(2 903 against 2 905 at three seconds), T5.1d with it. By hand, restored by digest (F971)",
  ],
  [
    "C06-ON-WALL: the root hands the transport the wall clock",
    "`construct.ts` hands C06 `config.clock` for `elapsed` while the stand-in mirrors mono: the " +
      "live side takes two wall reads per call the replay does not, the replay two mono reads the " +
      "live side did not, and only tier 5's parity row sees both counts disagree — T5.1c and " +
      "T5.1d red by hand, restored by digest (F972)",
  ],
]);

const results = runPass({
  read,
  write,
  run,
  control: {
    file: REC,
    from: "      const { node, ctx } = begin(`${kind}#${id}`);\n      return new ElementHandle(node, ctx, kind, currentEntry);",
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
      from: "      nodes.add(this.node.name, this.entry, spent, this.node.total ?? spent, seq);",
      to: "      nodes.add(this.node.name, this.entry, this.node.total ?? spent, this.node.total ?? spent, seq);",
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
      // **A refusal rendered as a zero**, which is the whole of I37. The table
      // still has six rows, the arithmetic still adds up, and the verdict flips
      // from `undecided` to `closed` — a gate closed on an experiment nobody
      // ran. Every assertion about the four measured rows stays green.
      name: "REFUSAL-AS-ZERO: a row nothing measures reports 0",
      file: BUDGET,
      from: "function resizeCorruption(report: ProfileReport): UnansweredRow {",
      to: "function resizeCorruption(report: ProfileReport): UnansweredRow {\n  if (report.frames >= 0) return measured(spec(\"resize-corruption\"), 0, \"0\", 0) as unknown as UnansweredRow;",
      expect: "T1.27",
    },
    {
      // The same failure one level up, and the sharper one: the rows are still
      // refused and the *verdict* folds them into a pass. A reader acts on the
      // verdict.
      name: "CLOSED-OVER-BLANKS: an unanswered row does not stop `closed`",
      file: BUDGET,
      from: "    crossed.length > 0 ? \"justified\" : unanswered.length > 0 ? \"undecided\" : \"closed\";",
      to: "    crossed.length > 0 ? \"justified\" : \"closed\";",
      expect: "T1.29",
    },
    {
      // A crossing inside the histogram's own bucketing reported like one four
      // milliseconds clear of the threshold (C28 I13). Both are `crossed: true`
      // and the table reads identically.
      name: "NO-MARGINAL: a crossing is never reported as inside its own error",
      file: BUDGET,
      from: "    marginal: Math.abs(value - spec.threshold) <= value * relativeError,",
      to: "    marginal: false,",
      expect: "T1.28",
    },
    {
      // The appendix's row is *per frame*. A session total is the same number
      // with a different unit, it is larger rather than absent, and it crosses
      // the threshold on a session that was never near it.
      name: "BYTES-NOT-PER-FRAME: the row reports the session's total",
      file: BUDGET,
      from: "  const per = written / report.frames;",
      to: "  const per = written;",
      expect: "T1.25",
    },
    {
      // **A tier that records nothing hands out a report anyway.** `off` builds
      // no profiler, so the callback firing at all means the tier gate went —
      // which is the defect the plan recorded as *`tier: \"off\"` still
      // constructs everything*, arriving through the seam that made the report
      // readable.
      name: "TIER-OFF-REPORTS: the profiler is built whatever the tier",
      file: SESSION,
      from: "if (this.config.profile !== undefined && isRecording(profileTier)) {",
      to: "if (this.config.profile !== undefined) {",
      expect: "T1.59",
    },
    {
      // The report handed out twice — once at construction, once at stop. A
      // consumer appending both records the session twice, and the second one is
      // right, so nothing downstream looks wrong.
      name: "REPORT-TWICE: the report is also handed out at construction",
      file: SESSION,
      from: "        cpus: cpuCount(),\n      });\n    }",
      to: "        cpus: cpuCount(),\n      });\n      this.config.profile.onReport?.(this.#profiler.report());\n    }",
      expect: "T1.58",
    },
    {
      // **A span's histogram fed inclusive time instead of self.** Every sum
      // still adds up, every per-row figure is still a duration, and
      // `spans.frame` becomes the frame's whole cost — which is exactly what a
      // reader assumes it already is. F885 is what that denominator published.
      name: "SPAN-INCLUSIVE: a span records its children's time as its own",
      file: REC,
      from: "    hist(spanHists, node.name).add(self);",
      to: "    hist(spanHists, node.name).add(node.total ?? self);",
      expect: "T1.62",
    },
    {
      // A declared `SpanName` with no opener. The phase table keeps its row and
      // the row reads zero, which is the one thing a breakdown must not say
      // about work that happened.
      name: "NO-ASSEMBLE: the draw phase's larger half is never opened",
      file: PAINT,
      from: '  using _assemble = deps.probe?.span("assemble") ?? NO_SPAN;',
      to: "",
      expect: "T1.60", // and T1.61, and MG30
    },
    {
      // **The span beside the work rather than around it.** It has a count and
      // no time in it, so every *was it opened* assertion stays green and only
      // the residue moves — which is why T1.61 asserts the sum as well as the
      // four counts.
      // Replaced `OVERLAYS-BESIDE`, which survived. That mutation closed the
      // span before the call it names, and the harness T1.61 runs under injects
      // a counter clock: every leaf span reads 1 whether it brackets its subject
      // or not, so the report is byte-identical either way. Bracketing is now
      // T1.2's row over a stepping clock; what a counter clock still sees is the
      // wiring, so this mutation takes the second call site out of the wrapper.
      // Since C22 I96 there is one layout per frame and it happens in
      // `renderFrame`, which hands it to `paint()` and `cursorFor()`; the
      // bypass a counter clock can still see is that one call going round
      // the wrapper, so T1.61's `exactly once` reads zero.
      name: "WRAPPER-BYPASSED: the frame's one overlay layout is not measured",
      file: RENDER_FRAME,
      from: "    placed = placedLayers(painting);",
      to: "    placed = painting.overlays();",
      expect: "T1.61",
    },
    {
      name: "SPAN-ZERO: a span records nothing between its ends",
      file: TREE,
      from: "  const total = Math.max(0, at - node.startedAt);",
      to: "  const total = Math.max(0, node.startedAt - node.startedAt);",
      expect: "T1.2",
    },
    {
      name: "SITE-ONE-POPULATION: a between-frames span is filed as in-frame",
      file: TYPES,
      from: '  local: "session",',
      to: '  local: "frame",',
      expect: "T1.64",
    },
    {
      name: "SHARE-ACROSS-POPULATIONS: a session span is given a share of the frames' work",
      file: BUDGET,
      from: '        share: site === "frame" && work > 0 ? entry[1] / work : null,',
      to: "        share: work > 0 ? entry[1] / work : null,",
      expect: "T1.65",
    },
    {
      name: "RESIDUE-CLAMPED: a residue below zero is reported as zero",
      file: BUDGET,
      from: "  const residue = work - parts - frameSelf;",
      to: "  const residue = Math.max(0, work - parts - frameSelf);",
      expect: "T1.66",
    },
    {
      name: "SUBSPAN-UNCOUNTED: a component's own span is shown and not counted",
      file: BUDGET,
      from: "      unphased += sum;\n      parts += sum;",
      to: "      unphased += sum;",
      expect: "T1.66",
    },
    {
      // **The key, which is F892's whole subject.** A block id is unique within
      // its document and a transcript holds many; without the entry, two
      // components are one row and the row's `calls / frames` is the sum of two
      // numerators over one denominator. Measured on a real session at 2.3 per
      // frame true against 5.3 reported — and the report stays well-formed,
      // ordered and plausible throughout, which is this file's whole premise.
      name: "ENTRY-DROPPED: the aggregate keys by the block id alone",
      file: REC,
      from: "      nodes.add(this.node.name, this.entry, spent, this.node.total ?? spent, seq);",
      to: "      nodes.add(this.node.name, null, spent, this.node.total ?? spent, seq);",
      expect: "T1.67",
    },
    {
      // The other half: the rows split and the divisor does not. A repair that
      // fixed only the key would leave this, and it is the figure that misleads.
      name: "ENTRY-FRAMES-SHARED: the row's frame counter ignores the entry",
      file: TREE,
      from: "    const at = entry === null ? key : `${entry}\\u0000${key}`;",
      to: "    const at = key;",
      expect: "T1.67",
    },
    {
      // Unattributed work filed under a name, which is the wrong attribution
      // rather than the absent one — and the shortfall a reader is told to
      // expect disappears, so nothing looks wrong.
      name: "CHROME-AS-ENTRY: work belonging to no entry is given one",
      file: REC,
      from: "      if (this.entry !== null) hist(byEntry, this.entry).add(spent);",
      to: '      hist(byEntry, this.entry ?? "chrome").add(spent);',
      expect: "T1.68",
    },
    {
      // The scope clears instead of restoring. Nothing nests one today, so this
      // is the row's own subject and T1.70 says as much.
      name: "ENTRY-CLEARED: the scope's close drops the entry rather than restoring it",
      file: REC,
      from: "      currentEntry = this.#was;",
      to: "      currentEntry = null;",
      expect: "T1.70",
    },
    {
      // **The wiring, not the mechanism.** Every row above calls `entry()`
      // itself and would pass on the day nothing in `src/shell/` opened one.
      name: "SHELL-BRACKET-GONE: the per-entry loop opens no scope",
      file: SESSION,
      from: "    using _entry = profiler?.entry(entry.id) ?? NO_SPAN;",
      to: "    using _entry = NO_SPAN;",
      expect: "T4.2",
    },
    {
      // The seam's half, which the height cache reaches on a miss. Warm, this
      // survives — which is why the row that catches it appends entries.
      name: "SEAM-ID-DROPPED: C14 measures without naming the entry",
      file: VIEWPORT,
      from: "      this.#measureSequence(entry.doc.blocks, this.#width, entry.id);",
      to: "      this.#measureSequence(entry.doc.blocks, this.#width);",
      expect: "T2.15",
    },
    {
      // The registry built at construction rather than on the first `track`.
      // A session at `off` then holds a process-wide handle for a feature it
      // never uses, and no report can show it.
      name: "EAGER-REGISTRY: the leak tracker arms before anything is tracked",
      file: LEAKS,
      from: "  #registry: FinalizationRegistry<string> | null = null;",
      to: "  #registry: FinalizationRegistry<string> | null = new FinalizationRegistry<string>(() => undefined);",
      expect: "T1.73",
    },
    {
      // The tracker holds what it watches. Every figure stays plausible and the
      // instrument built to find leaks becomes one.
      name: "STRONG-TRACKER: the tracker keeps a reference to everything it watches",
      file: LEAKS,
      from: "    this.#created.set(name, (this.#created.get(name) ?? 0) + 1);",
      to: "    this.#created.set(name, (this.#created.get(name) ?? 0) + 1);\n    (this as unknown as { keep?: object[] }).keep = [...((this as unknown as { keep?: object[] }).keep ?? []), held];",
      expect: "T1.73",
    },
    {
      // Counting at `off`. The registry arms for a session that never profiles.
      name: "TRACK-UNGATED: `off` counts and registers like every other tier",
      file: REC,
      from: "      if (disposed || !counting()) return;\n      leaks.track(name, held);",
      to: "      if (disposed) return;\n      leaks.track(name, held);",
      expect: "T1.73",
    },
    {
      // `live` reported as what was collected. Every figure is a number, the
      // table fills, and the column means the opposite of its heading.
      name: "LIVE-INVERTED: live reports what died rather than what remains",
      file: LEAKS,
      from: "      out[name] = Object.freeze({ created, finalised, live: created - finalised });",
      to: "      out[name] = Object.freeze({ created, finalised, live: finalised });",
      expect: "T1.71",
    },
    {
      // The distinguisher removed: a run that collected nothing reads as a
      // report about retention, which is the first reading and the wrong one.
      name: "COLLECTED-ASSUMED: the table assumes a collection happened",
      file: BUDGET,
      from: "  return Object.freeze({ rows: Object.freeze(rows), collected: anyFinalised > 0, floor: 1 });",
      to: "  return Object.freeze({ rows: Object.freeze(rows), collected: true, floor: 1 });",
      expect: "T1.74",
    },
    {
      // The scratch store registers its slot instead of its key. Same count,
      // same table, and it answers a question nobody asked — the slot dies when
      // the store drops it, and the `WeakMap`'s premise is about the key.
      name: "TRACK-THE-SLOT: the store watches what it holds rather than what it is keyed by",
      file: SCRATCH,
      from: '    this.#probe.track("scratch.carrier", owner);',
      to: '    this.#probe.track("scratch.carrier", { key, value });',
      expect: "T1.75",
    },
    {
      // F895, and the axis it is about: the guard reads the tier where the
      // question is the data. Reverting it is what shipped, so this is the
      // mutation the defect itself was.
      name: "OV-TIER-ONLY: the overview asks the tier whether there is data",
      file: PANES,
      from: "  } else if (lat.work.count === 0) {",
      to: "  } else if (false) {",
      expect: "T1.16",
    },
    {
      name: "ALWAYS-EMPTY: the overview takes the empty branch with data in the ring",
      file: PANES,
      // The other direction, and the one T1.16's control exists for: a guard
      // widened until it refuses everything satisfies every assertion about
      // the empty case.
      from: "  } else if (lat.work.count === 0) {",
      to: "  } else if (true) {",
      expect: "T1.16c",
    },
    {
      name: "DI-TIER-ONLY: the distribution asks the tier whether there is data",
      file: PANES,
      from: "  const out: Block[] = lat.work.count === 0",
      to: "  const out: Block[] = false",
      expect: "T1.16",
    },
    {
      // The third instance: the right branch printing the other axis's
      // sentence. Killed only by the row that reads the notice text — a row
      // asserting that a notice appears is green on this.
      name: "FR-ONE-SENTENCE: the frame pane tells a reader on `spans` to raise the tier",
      file: PANES,
      from: '        spanning(r)\n          ? "no spans recorded — the tier is high enough and nothing has been measured yet"\n          : "no spans recorded — raise the tier to `spans`",',
      to: '        "no spans recorded — raise the tier to `spans`",',
      expect: "T1.16b",
    },
    {
      name: "WINDOW-LABEL-GONE: a percentile over a truncated ring is unqualified",
      file: BUDGET,
      from: "    dropped > 0",
      to: "    false",
      expect: "T1.10",
    },
    {
      // The caveat that is always there is a caveat nobody reads, and it makes
      // every whole report describe itself as a window.
      name: "WINDOW-LABEL-ALWAYS: every report says it is over the window",
      file: BUDGET,
      from: "    dropped > 0",
      to: "    true",
      expect: "T1.10",
    },
    {
      // The tier-3 rows, whose deferrals said they landed with the recorder and
      // did not (F896). Every one below was written against a subject that had
      // existed all round.
      name: "WAIT-FROM-LATEST: the wait runs from the last commit, not the earliest",
      file: REC,
      from: "      if (earliestUnserved === null) earliestUnserved = elapsed();",
      to: "      earliestUnserved = elapsed();",
      expect: "T3.1",
    },
    {
      // The other half: the mark outlives the frame it belonged to, so a
      // repaint reports the wait of a frame that was already served.
      name: "WAIT-MARK-KEPT: endFrame does not clear the unserved mark",
      file: REC,
      from: "      earliestUnserved = null;",
      to: "      // earliestUnserved = null;",
      expect: "T3.1",
    },
    {
      name: "DROP-UNCOUNTED: the ring discards without counting",
      file: RING,
      from: "    if (this.#held === this.#items.length) this.#dropped += 1;",
      to: "    if (false) this.#dropped += 1;",
      expect: "T3.2",
    },
    {
      // The guard that refuses the tier a caller is least likely to be on and
      // passes the three they are — which is why T3.4 runs over all four.
      name: "CAPTURE-OFF-ONLY: capture refuses at `off` and runs at every other tier",
      file: REC,
      from: '      if (TIER_RANK[tier] < TIER_RANK.deep) {',
      to: '      if (tier === "off") {',
      expect: "T3.4",
    },
    {
      name: "SETTIER-AFTER-DISPOSE: the tier can still be changed after dispose",
      file: REC,
      from: "      if (disposed || next === tier) return;",
      to: "      if (next === tier) return;",
      expect: "T3.8",
    },
    {
      name: "COMMIT-AFTER-DISPOSE: a commit still counts after dispose",
      file: REC,
      from: "    commit(reason: CommitReason, own: boolean): void {\n      if (disposed || !counting()) return;",
      to: "    commit(reason: CommitReason, own: boolean): void {\n      if (!counting()) return;",
      expect: "T3.8",
    },
    {
      // A fallback is a frame's absence, not its cost: counted in the durations
      // it reports the framework as fast on the frames where it gave up.
      name: "FALLBACK-IN-DURATIONS: a frame that gave up is timed like one that drew",
      file: REC,
      from: '      if (outcome === "fallback") {\n        excludedFallback += 1;\n        return;\n      }',
      to: '      if (outcome === "fallback") {\n        excludedFallback += 1;\n      }',
      expect: "T3.7",
    },
    {
      // Recorded on the success path only, so the span is missing for exactly
      // the polls that went wrong.
      name: "TRACE-RECORDS-ON-SUCCESS-ONLY: a rejecting trace records nothing",
      file: REC,
      from: "        try {\n          return await fn();\n        } finally {\n          record(node, end(node, ctx));\n        }",
      to: "        const out = await fn();\n        record(node, end(node, ctx));\n        return out;",
      expect: "T3.11",
    },
    {
      // F900: the headline from the newest sample whatever its flag, so a
      // stopped clock is drawn as the present state.
      name: "SUSPENDED-UNREAD: the memory pane headlines the newest sample, suspended or not",
      file: PANES,
      from: "  const last = running[running.length - 1];",
      to: "  const last = r.samples[r.samples.length - 1];",
      expect: "T3.10",
    },
    {
      // Its control: a caveat on every report is a caveat nobody reads, and it
      // passes every assertion about the suspended case.
      name: "CAVEAT-ALWAYS: every report says some samples were suspended",
      file: PANES,
      from: "        suspendedCount === 0",
      to: "        false",
      expect: "T3.10",
    },
    {
      name: "RESOLUTION-ZEROED: a delay figure travels with a resolution of zero, qualifying nothing",
      file: NODE,
      from: "        loopDelayResolutionMs: RESOLUTION_MS,",
      to: "        loopDelayResolutionMs: 0,",
      expect: "T3.3",
    },
    {
      // The tier-6 reverts, each a change someone would plausibly make. Their
      // deferrals said *lands with the module each row names*; every module
      // landed and nothing watched (F896).
      name: "TOTAL-AS-WORK: work is published as work plus wait",
      file: REC,
      from: "        work,",
      to: "        work: work + frameWait,",
      expect: "T6.1",
    },
    {
      name: "CANARY-DEAD: the timing-entry count is a constant",
      file: NODE,
      from: "        timingEntries: performance.getEntries().length,",
      to: "        timingEntries: 0,",
      expect: "T6.2",
    },
    {
      name: "FALLBACK-TIMED: a frame that gave up is timed like one that drew",
      file: REC,
      from: '      if (outcome === "fallback") {\n        excludedFallback += 1;\n        return;\n      }',
      to: '      if (outcome === "fallback") {\n        excludedFallback += 1;\n      }',
      expect: "T6.3",
    },
    {
      name: "INCLUSIVE-AS-SELF: a container is charged its children's time",
      file: REC,
      from: "      nodes.add(this.node.name, this.entry, spent, this.node.total ?? spent, seq);",
      to: "      nodes.add(this.node.name, this.entry, this.node.total ?? spent, this.node.total ?? spent, seq);",
      expect: "T6.4",
    },
    {
      name: "SPANS-AT-EVERY-TIER: the duration keys are emitted zeroed below `spans`",
      file: REC,
      from: "        ...(spanning()",
      to: "        ...(true",
      expect: "T6.5",
    },
    {
      name: "COUNTING-AT-OFF: the disabled tier records like every other",
      file: REC,
      from: '  const counting = (): boolean => tier !== "off";',
      to: "  const counting = (): boolean => true;",
      expect: "T6.6",
    },
    {
      name: "RING-KEPT-ACROSS-TIER: a tier change leaves the ring alone",
      file: REC,
      from: "      resetRing();\n      tier = next;",
      to: "      tier = next;",
      expect: "T6.7",
    },
    {
      name: "CAPTUREDIR-LITERAL: the recorder's default stands in for the resolution",
      file: SESSION,
      from: "captureDir: this.config.profile.captureDir ?? `${this.config.stateDir}/profile`,",
      to: "",
      expect: "T1.54",
    },
    {
      name: "LASTFRAME-KEPT-ACROSS-TIER: a figure from the tier before the change",
      file: REC,
      from: "    lastWork = undefined;\n    samples.clear();",
      to: "    samples.clear();",
      expect: "T1.10",
    },
    {
      name: "LASTFRAME-DRAWN-ONLY: a run of fallbacks holds the last drawn frame's figure",
      file: REC,
      from: "      lastWork = work;",
      to: '      if (outcome === "frame") lastWork = work;',
      expect: "T1.10",
    },
    {
      name: "CHROME-COST-UNLABELLED: the number without the word that says which frame",
      file: CHROME,
      from: "return `last ${figure.padStart(5, \" \")}ms`;",
      to: "return `${figure.padStart(5, \" \")}ms`;",
      expect: "T1.10b",
    },
    {
      name: "COST-CELL-RAGGED: the figure is drawn at its own width",
      file: CHROME,
      // F911: `last 9.6ms` and `last <0.1ms` are ten cells and eleven, so the
      // cell moves by a column whenever the cost crosses 10 ms and every cell
      // after it shifts. The replay comparison is what found it, and this is
      // the mutation that stops it coming back.
      from: 'return `last ${figure.padStart(5, " ")}ms`;',
      to: "return `last ${figure}ms`;",
      expect: "T1.10c",
    },
    {
      name: "SUSPEND-UNSET: the writer writes the constant it replaced",
      file: REC,
      from: "      suspended = on;",
      to: "      suspended = false;",
      expect: "T4.5",
    },
    {
      name: "SUSPEND-NO-UNWIND: a refused suspend strands the flag",
      file: CONSTRUCT,
      from: "      profiler.setSuspended(false);\n      throw err;",
      to: "      throw err;",
      expect: "T4.5",
    },
    {
      name: "STRICTEST-AS-FIRST: the reason that arrived first, not the strictest",
      file: SCHED,
      from: "      driving === null || strictness(reason) > strictness(driving) ? reason : driving;",
      to: "      driving === null ? reason : driving;",
      expect: "T1.24",
    },
    {
      name: "STRICTEST-AS-LAST: the reason that arrived last",
      file: SCHED,
      from: "      driving === null || strictness(reason) > strictness(driving) ? reason : driving;",
      to: "      reason;",
      expect: "T1.24",
    },
    {
      name: "LIVE-IS-FINALISED: what remains is reported as what was collected",
      file: LEAKSRC,
      from: "live: created - finalised",
      to: "live: finalised",
      expect: "T6.12",
    },
    // C28 I45 — the per-kind input gauges. **Every one of these keeps the report
    // well-formed**: a gauge of the clamped value is a real number about a real
    // frame, and a deleted gauge is indistinguishable from a kind nobody
    // instrumented. That is the whole reason T1.77 compares two sets rather than
    // reading a list (F906).
    {
      name: "RULE-LABEL-CLAMPED: the label gauged after the truncate",
      file: SIMPLE,
      from: '    ctx.probe?.gauge("rule.label", block.label.length);',
      to: '    ctx.probe?.gauge("rule.label", Math.min(block.label.length, normaliseWidth(ctx.width)));',
      expect: "T1.78",
    },
    {
      name: "PROGRESS-LABEL-CLAMPED: the same clamp on progress",
      file: SIMPLE,
      from: '    ctx.probe?.gauge("progress.label", block.label.length);',
      to: '    ctx.probe?.gauge("progress.label", Math.min(block.label.length, Math.max(0, Math.floor(width / 3))));',
      expect: "T1.78",
    },
    {
      name: "NOTICE-SPANS-GONE: one gauge for two independent inputs",
      file: SIMPLE,
      from: '    ctx.probe?.gauge("notice.spans", block.spans?.length ?? 0);',
      to: "",
      expect: "T1.79",
    },
    {
      name: "NOTICE-ROWS-AS-WIDTH: the first row's length in place of the count",
      file: SIMPLE,
      from: '    ctx.probe?.gauge("notice.rows", wrapped.length);',
      to: '    ctx.probe?.gauge("notice.rows", wrapped[0]?.length ?? 0);',
      expect: "T1.79",
    },
    {
      name: "TIP-ROWS-GONE: a kind with no gauge at all",
      file: SIMPLE,
      from: '    ctx.probe?.gauge("tip.rows", wrapped.length);',
      to: "",
      expect: "T1.77",
    },
    {
      name: "STATUS-ROWS-GONE: the coverage row is what catches this",
      file: STATUS,
      from: '    ctx.probe?.gauge("status.rows", height);',
      to: "",
      expect: "T1.77",
    },
    {
      name: "IMAGE-PIXELS-AS-CELLS: the drawn size in place of the source extent",
      file: IMAGE,
      from: '      ctx.probe?.gauge("image.pixels", px.width * px.height);',
      to: '      ctx.probe?.gauge("image.pixels", cols * rows);',
      expect: "T1.80",
    },
    {
      name: "GEOMETRY-AS-RESIZE: the initial size becomes an event a replay delivers",
      file: RECORD,
      from: '      write({ t: "geometry", n: n++, columns: size.columns, rows: size.rows });',
      to: '      write({ t: "resize", n: n++, columns: size.columns, rows: size.rows });',
      expect: "T1.84",
    },
    {
      name: "GEOMETRY-DRIVEN: the initial size is delivered as a signal",
      file: REPLAY,
      from: '      case "geometry":\n        geometry = e;\n        break;',
      to: '      case "geometry":\n        geometry = e;\n        timeline.push({ ...e, t: "resize" });\n        break;',
      expect: "T1.84",
    },
    // **`NO-EXIT-FLUSH` was carried here as an absence with a reason**, because
    // its only witness was T5.1 — a tier-5 row this harness cannot run, since
    // tier 5 executes against `dist/` and a `src/` mutation is invisible to it
    // without a build per mutation. The absence was the honest form and it was
    // not the end of it: the flush had no invariant either, which is the same
    // gap seen from the spec's side. C28 I48 and T1.91 now give it a tier-1
    // witness, and the two mutations below are killed by different assertions —
    // the deleted hook by the listener count, the emptied one by the flush.
    {
      // **The mutation F912's whole diagnosis rests on.** Without the hook a
      // signal exit loses the clock batch and writes no `end` line, and a reader
      // cannot tell that from a recording killed mid-write.
      name: "NO-EXIT-FLUSH: the recording ends only from `stop()`",
      file: CONFIG,
      from: '    process.on("exit", () => void recording.end());\n',
      to: "",
      expect: "T1.91",
    },
    {
      // The other half, and the one a reader skims past: the hook is present,
      // registered, visible in a diff — and does nothing. A row asserting only
      // that a listener was added is green under it.
      name: "EXIT-HOOK-EMPTY: the hook is installed and flushes nothing",
      file: CONFIG,
      from: '    process.on("exit", () => void recording.end());',
      to: "    process.on(\"exit\", () => {});",
      expect: "T1.91",
    },
    {
      // **A prefix is not a disagreement.** Folding `truncated` into the verdict
      // is the tidier's move — both are *the replay did not match* — and it
      // makes a recorder killed mid-write read as a session that changed.
      name: "TRUNCATED-IS-DIVERGENCE: a recording that stopped early fails the comparison",
      file: REPLAY,
      from: "    identical: !shortfall || rec.truncated,",
      to: "    identical: !shortfall && !rec.truncated,",
      expect: "T6.8",
    },
    {
      // The same false positive from the other side: a replay that ran on past
      // a truncated recording has more frames, and nothing recorded them to
      // disagree with. The surplus is counted, not judged.
      name: "COUNT-IS-DIVERGENCE: a frame-count difference is a divergence whatever the recording",
      file: REPLAY,
      from: "    identical: !shortfall || rec.truncated,",
      to: "    identical: !shortfall,",
      expect: "T6.15",
    },
    {
      name: "PACE-BY-NOTHING: the drive fires every event without waiting",
      file: REPLAY,
      from: "      while (deps.frames() - base < expected && spun < bound) {",
      to: "      while (false && deps.frames() - base < expected && spun < bound) {",
      expect: "T1.89",
    },
    {
      name: "BASE-ABSORBS-FRAMES: the pacing baseline swallows the startup frames",
      file: REPLAY,
      from: "  const base = Math.max(0, deps.frames() - leading);",
      to: "  const base = deps.frames();",
      expect: "T1.89",
    },
    {
      name: "ELIDED-ONE-HALF: a cursor-only replay excuses any recorded frame",
      file: REPLAY,
      from: "        elided:\n          mask.some((re) => new RegExp(re.source, re.flags.replace(\"g\", \"\")).test(recorded)) &&\n          CURSOR_ONLY.test(Buffer.from(b).toString(\"utf8\")),",
      to: '        elided: CURSOR_ONLY.test(Buffer.from(b).toString("utf8")),',
      expect: "T1.86",
    },
    {
      name: "CLOCK-MASK-WIDE: the mask takes an HH:MM as well, and eats a duration",
      file: REPLAY,
      from: "  /(?<![\\d:])[0-2]\\d:[0-5]\\d:[0-5]\\d(?![\\d:])/gu,",
      to: "  /(?<![\\d:])[0-2]\\d:[0-5]\\d(?::[0-5]\\d)?(?![\\d:])/gu,",
      expect: "T1.87",
    },
    {
      name: "OWN-STICKY: the bracket is not restored when the surface throws",
      file: REC,
      from: "      ownDepth += 1;\n      try {\n        return fn();\n      } finally {\n        ownDepth -= 1;\n      }",
      to: "      ownDepth += 1;\n      const out = fn();\n      ownDepth -= 1;\n      return out;",
      expect: "T1.88",
    },
    {
      name: "OWN-ANY: a frame is the profiler's if any commit was its own",
      file: REC,
      from: "      frameSelf = commitsSinceFrame > 0 && ownCommitsSinceFrame === commitsSinceFrame;",
      to: "      frameSelf = ownCommitsSinceFrame > 0;",
      expect: "T1.88",
    },
    {
      name: "DRAIN-UNBOUNDED-NOT: the drain returns before waiting at all",
      file: REC,
      from: "      while (inFlight.size > 0 && elapsed() < until) {",
      to: "      while (false && inFlight.size > 0 && elapsed() < until) {",
      expect: "T3.5",
    },
    {
      name: "ABANDON-SILENT: a capture still running is dropped rather than recorded",
      file: REC,
      from: "      abandonedCaptures += inFlight.size;",
      to: "      abandonedCaptures += 0;",
      expect: "T3.5",
    },
    {
      name: "WIDTH-AT-CLOSE: the resize overwrites the width every open span holds",
      file: REC,
      from: "      for (const node of openSpans) node.crossedResize = true;\n      width = columns;",
      to: "      for (const node of openSpans) node.crossedResize = true;\n      width = columns;\n      for (const node of openSpans) (node as { width: number | null }).width = columns;",
      expect: "T3.9",
    },
    {
      name: "TAG-EVERY-SPAN: a span is tagged whether or not it crossed one",
      file: TREE,
      from: "    crossedResize: false,",
      to: "    crossedResize: true,",
      expect: "T3.9",
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
    {
      // **F964's member, restored.** A word boundary before the digits, which
      // the chrome's SGR `m` never yields — a mask that matched nothing the
      // header drew, and a T5.1b green for exactly as long as it stayed dead.
      name: "HEADER-MASK-WORD-BOUNDARY: the header-clock mask asks for a boundary an SGR's `m` never gives",
      file: REPLAY,
      from: "  /(?<![\\d:])[0-2]\\d:[0-5]\\d:[0-5]\\d(?![\\d:])/gu,",
      to: "  /\\b[0-2]\\d:[0-5]\\d:[0-5]\\d\\b/gu,",
      expect: "T1.101",
    },
    // --- C28 I53 — the sampler is off the recorded channel (F971) -------------
    {
      // **The natural line rather than a mistake**: the tick stamps from the
      // clock every other read uses. It compiles to a TS6133 on the now-unused
      // `sampleClock` and still emits, so the build's exit is the only tell.
      name: "SAMPLER-ON-CHANNEL: the tick stamps from the recorded elapsed",
      file: REC,
      from: "samples.push(probe.sample(suspended, sampleClock()));",
      to: "samples.push(probe.sample(suspended, elapsed()));",
      expect: "T1.102",
    },
    {
      // The root hands the sampler the tap. `resolveConfig` is right and
      // `session.ts` is wrong, one file below T1.104's reach; the row that sees
      // it is tier 5's parity count, listed in anchors.mjs's CROSS_TIER.
      name: "ROOT-HANDS-TAPPED: the session gives the sampler the tapped elapsed",
      file: SESSION,
      from: "sampleClock: this.config.sampleClock,",
      to: "sampleClock: this.config.elapsed,",
      expect: "C28 T5.1c",
    },
    {
      name: "CONFIG-HANDS-AMBIENT: the sampler's clock is performance.now and not the injected one",
      file: CONFIG,
      from: "    sampleClock: rawElapsed,",
      to: "    sampleClock: ambient.elapsed,",
      expect: "T1.104",
    },
    {
      name: "CONFIG-HANDS-TAPPED: the sampler's clock is the tap",
      file: CONFIG,
      from: "    sampleClock: rawElapsed,",
      to: "    sampleClock: recording === null ? rawElapsed : recording.mono(rawElapsed),",
      expect: "T1.104",
    },
    // --- C28 I14, I46 — the stand-in's reads and its turn (F972, F974) ---------
    {
      name: "STAND-IN-READS-NOTHING: the transport stand-in serves without the mono pair",
      file: TREPLAY,
      from: "          const started = elapsed();\n          const next = take(verb);\n          await turn(next?.n);\n          void (elapsed() - started);\n          return next?.value as RawResult;",
      to: "          const next = take(verb);\n          await turn(next?.n);\n          return next?.value as RawResult;",
      expect: "T1.103",
    },
    {
      name: "STAND-IN-SERVES-AT-ONCE: the answer is served when asked, not where it was recorded",
      file: TREPLAY,
      from: "          await turn(next?.n);\n          void (elapsed() - started);",
      to: "          await Promise.resolve();\n          void (elapsed() - started);",
      expect: "T1.103",
    },
    {
      // C06 on the wall clock while the stand-in mirrors mono: live takes two
      // wall reads the replay does not, the replay two mono reads live did not.
      // Both counts disagree, and only the parity row counts (C06 T6.17).
      name: "C06-ON-WALL: the root hands the transport the wall clock",
      file: CONSTRUCT,
      from: "clock: { elapsed: config.elapsed, schedule: config.schedule },",
      to: "clock: { elapsed: config.clock, schedule: config.schedule },",
      expect: "C28 T5.1c",
    },
  ],
});

console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
