/**
 * The render tree, taken by decoration (C28 I31, A02 §2 Seam 1).
 *
 * **This is the whole per-element story, and it costs C09 nothing.** Every
 * interesting member of `Registry` is an arrow property assigned in the class
 * body — `measure`, `width`, `measureSequence`, `elementsOf`, `elementsIn`,
 * `windowSequence`, `renderSequence`, `windowChild`, `render` — so each is an
 * *own property of the instance*, not a prototype method. Reassigning one from
 * out here replaces the property that the class's own `this.measure` and
 * `this.render` resolve through, and those are also exactly what the registry
 * hands down as `measureChild` and `renderChild`. So a wrapper installed here
 * is entered again for every child, at every depth, without one line changing
 * in `src/presentation/`.
 *
 * MG1 is what makes that safe rather than clever: `src/shell/profiling/` is
 * rank 4, nothing below it can import it, and the registry never learns a
 * profiler exists.
 *
 * **What it replaces.** The measure seam used to time `measureSequence` as a
 * whole and then divide the result equally across the blocks in it:
 *
 *     for (const block of blocks) prof.attribute(kind, id, spent / blocks.length)
 *
 * A `plot` measures in 57 µs and a `rule` in 220 ns — 260× apart — and that
 * line gave them the same figure. So `byKind` was not an attribution at all: it
 * reported *how many blocks of each kind were on screen*, and reported it in a
 * table captioned "which renderer to look at". Nothing in the suite could catch
 * it, because a fabricated number is a number.
 *
 * **Nesting makes inclusive time wrong, so the spans report self time.** A
 * `group` measures its children, so an inclusive parent counts every child
 * twice and the outermost node is the widest bar in every tree ever drawn.
 * `tree.ts` subtracts `childTime` at close.
 *
 * **Three measure calls a wrapper cannot see**, all inside the class and
 * therefore not through the property: the two direct `definition.measure` calls
 * in `#form` — both of which run for any block over the row cap — and the
 * committed measure `render` takes. No decoration from out here enters them, so
 * the registry carries a `probe` slot instead and this function sets it. That is
 * the measure-side twin of `RenderContext.probe`, and it is why `Measure` grew
 * an optional fourth parameter.
 */
import type { Probe } from "../../data/viewmodel/probe.js";
import type { Profiler } from "./types.js";

/**
 * The subset of the registry this decorates.
 *
 * Structural rather than the concrete class: `construct.ts` holds a
 * `ReturnType<typeof createBlockRegistry>` and this file must not import C09 to
 * name it — the point of the exercise is that no edge is added.
 */
type Block = { kind: string; id: string };

export type ProbeableRegistry = {
  measure: (block: Block, width: number) => number;
  render: (block: Block, ctx: unknown) => unknown;
  measureSequence: (blocks: readonly Block[], width: number) => number;
  /** The slot the registry hands to a definition's `measure` — see above. */
  probe: Probe;
};

/**
 * Install the wrappers. Idempotent by construction — call it once, after the
 * registry is sealed and before anything renders.
 *
 * Returns nothing: the registry is mutated in place because that is the only
 * thing the class's own recursion will see. A returned copy would be entered
 * from outside and stepped around from inside, which is the shape that produces
 * a tree with no children in it.
 */
export function instrumentRegistry(registry: ProbeableRegistry, prof: Profiler): void {
  // The slot first: a definition instrumenting its own measure reads this, and
  // the wrappers below never enter those calls.
  registry.probe = prof.asProbe();
  const measure = registry.measure;
  const render = registry.render;
  const measureSequence = registry.measureSequence;

  // **`using` is kept out of every fast path, and this is not a style choice.**
  // esbuild and tsc both downlevel a `using` declaration by allocating a
  // disposable stack at *function entry* and wrapping the whole body in
  // try/catch/finally — so `finally` runs, and the array is allocated, on the
  // early return too:
  //
  //     registry.measure = (block, width) => {
  //       var _stack = [];                                  // ← every call
  //       try { if (!prof.on) return measure(block, width); // ← including this one
  //       ... } finally { __callDispose(_stack, ...); }     // ← and this
  //     };
  //
  // Measured on 50 rules in two groups, 203 measure calls per pass: a raw pass
  // is 30.5 µs and the same pass through a wrapper at `tier: "off"` was
  // **195.6 µs — +541 %, with the profiler disabled.** Splitting the recording
  // arm into its own function leaves the guard a plain conditional call and the
  // disabled path allocates nothing. This matters here and not in a block
  // definition because the subject is 0.6 µs; an array allocation is invisible
  // beside a 2 ms plot render and dominates a rule's measure.
  const measured = (block: Block, width: number): number => {
    using _s = prof.element(block.kind, block.id);
    return measure(block, width);
  };

  const rendered = (block: Block, ctx: unknown): unknown => {
    using _s = prof.element(block.kind, block.id);
    return render(block, ctx);
  };

  const sequenced = (blocks: readonly Block[], width: number): number => {
    using _s = prof.span("measure");
    return measureSequence(blocks, width);
  };

  registry.measure = (block, width) => (prof.on ? measured(block, width) : measure(block, width));
  registry.render = (block, ctx) => (prof.on ? rendered(block, ctx) : render(block, ctx));

  registry.measureSequence = (blocks, width) => {
    // **A count, because the count is the finding.** `measureSequence` runs
    // every frame whatever the cache holds — a fact no counter recorded before
    // this — and the per-block spans below it say nothing about how often the
    // sequence itself was walked.
    //
    // **Outside the `prof.on` guard, deliberately.** `on` is *spanning*, so
    // gating the whole seam on it left `tier: "counters"` recording nothing at
    // all — a tier named after counters at which no counter here could fire.
    // `count` and `gauge` carry their own tier guard, and this runs once per
    // sequence rather than once per block, so the two calls at `off` are a
    // rounding error against the 203 element calls the same pass makes.
    prof.count("measure.sequences");
    prof.gauge("measure.sequence.blocks", blocks.length);
    return prof.on ? sequenced(blocks, width) : measureSequence(blocks, width);
  };
}
