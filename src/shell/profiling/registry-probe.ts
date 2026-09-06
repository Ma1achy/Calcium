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
export type ProbeableRegistry = {
  measure: (block: { kind: string; id: string }, width: number) => number;
  render: (block: { kind: string; id: string }, ctx: unknown) => unknown;
  measureSequence: (blocks: readonly { kind: string; id: string }[], width: number) => number;
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

  registry.measure = (block, width) => {
    if (!prof.on) return measure(block, width);
    using _s = prof.element(block.kind, block.id);
    return measure(block, width);
  };

  registry.render = (block, ctx) => {
    if (!prof.on) return render(block, ctx);
    using _s = prof.element(block.kind, block.id);
    return render(block, ctx);
  };

  registry.measureSequence = (blocks, width) => {
    if (!prof.on) return measureSequence(blocks, width);
    // **A count, because the count is the finding.** `measureSequence` runs
    // every frame whatever the cache holds — a fact no counter recorded before
    // this — and the per-block spans below it say nothing about how often the
    // sequence itself was walked.
    prof.count("measure.sequences");
    prof.gauge("measure.sequence.blocks", blocks.length);
    using _s = prof.span("measure");
    return measureSequence(blocks, width);
  };
}
