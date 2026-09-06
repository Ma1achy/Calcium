/**
 * The instrumentation seam, declared where `Measure` is (C28 I30).
 *
 * **L0, and that is the whole design.** A renderer that wants to say what it
 * spent time on needs a name for the thing it calls; it must not need the thing
 * itself. `Measure` and `MeasureFn` are declared beside this for the same
 * reason — the contract lives at the bottom, the implementation at the top, and
 * the layers between name the type and import nothing. C09 does not import C28,
 * C12 does not import C28, and MG1 is what makes that a fact rather than a
 * convention: `src/shell/profiling/` is rank 4, so nothing below it can reach it.
 *
 * It is the same shape as `measureChild`, where the registry passes itself.
 *
 * **Nothing here reads a clock.** SS1 bans that outside `session.ts` and SS4
 * bans it in `src/viewport/` with no exceptions at all. A call site says *this
 * region is called `raster`*; the profiler is the only thing that knows when.
 * That is why the interface has no `now()` and cannot grow one.
 *
 * **`on` exists because a label can cost more than the span.** `probe.count(`
 * `` `plot.series.${series.label}` `` `)` builds a string whether or not anyone
 * is recording. A guard is the difference between an instrumented renderer and
 * a slower one.
 */

/**
 * Why a cache lookup did not answer.
 *
 * **Declared here rather than with the profiler** because the two caches that
 * report it are at different layers — C22's `RenderCache` at L4 and C14's
 * `HeightCache` at L2 — and L2 cannot import L4. The enum has to sit below both,
 * which is the same argument as `Probe` itself.
 *
 * A closed union rather than a free string, because the reason is the whole
 * point: a hit rate says a cache is missing and every cache misses. *Which axis
 * rejected the slot* is what separates a cold entry from a key that moves when
 * nothing changed, and only the second is a defect. A string would make the
 * report's per-cache breakdown a parsing exercise and let a typo read as a new
 * reason.
 *
 * Not every member applies to every cache — `HeightCache` has three axes and
 * cannot report `theme` — and that is not a defect in the union. A cache reports
 * from the axes it compares.
 */
export type MissReason =
  | "absent" | "rev" | "width" | "theme" | "focus" | "range" | "evicted" | "nothing-changed";

/**
 * What a component reports about itself.
 *
 * Every member is a no-op on `NO_PROBE`, so a call site never branches on
 * absence — `ctx.probe ?? NO_PROBE` at the top, then straight-line code. The
 * optional-property form (`ctx.probe?.count(...)`) is equivalent and is what the
 * registry uses, because it has no context object to default into.
 */
export interface Probe {
  /**
   * A nested region of work.
   *
   * `using _s = probe.span("raster")` — the disposal is the close, so an early
   * return and a throw both end the span where the block ends. Nesting is by
   * call order: a span opened inside another is its child, and the parent's
   * reported figure is **self time**, with children subtracted. That is what
   * makes a tree readable — an inclusive parent repeats every child's cost and
   * the widest bar is always the outermost one, which tells a reader nothing.
   */
  span(name: string): Disposable;

  /**
   * An integer, summed over the session.
   *
   * For things that happen rather than things that take time: cache lookups,
   * re-entries, rows emitted, bytes written. A count is the cheapest true thing
   * a component can say, and it is often the finding — *this ran four times per
   * frame* needs no duration to be a defect.
   */
  count(name: string, by?: number): void;

  /**
   * A value at an instant, kept as a distribution rather than a sum.
   *
   * For sizes rather than events: series length, cell count, a memo's entry
   * count, the depth of a tree. **This is the axis that turns a duration into a
   * complexity claim** — cost alone says a plot was slow, cost against point
   * count says whether it is linear.
   */
  gauge(name: string, value: number): void;

  /** A labelled instant on the session timeline. */
  mark(label: string): void;

  /**
   * A cache answered.
   *
   * `cache` names the store, not the entry — `"render"`, `"height"`, `"tokens"`.
   */
  hit(cache: string): void;

  /**
   * A cache did not answer, **and which axis rejected the slot**.
   *
   * The pair exists rather than a single ratio because the ratio is not
   * actionable on its own. A cache at 40 % is healthy if the misses are `absent`
   * on a scrolling transcript and broken if they are `focus` on a screen where
   * nothing moved. Same number, opposite findings.
   */
  miss(cache: string, reason: MissReason): void;

  /**
   * Whether anything is recording.
   *
   * Read it before building a label or walking a structure purely to describe
   * it. Never read it to decide whether to do real work: a component that
   * behaves differently under measurement is not the component being measured.
   */
  readonly on: boolean;
}

/**
 * The disposable `NO_PROBE.span` returns — also frozen and shared, and exported
 * because a real profiler needs it too for the below-tier arm.
 */
export const NO_SPAN: Disposable = Object.freeze({
  [Symbol.dispose]: (): void => undefined,
});

/**
 * The absent probe, frozen and shared.
 *
 * One object for the whole process rather than one per context: a context is
 * built per render and a fresh no-op per frame is allocation in the hot path
 * for nothing. `on` is `false`, so a guarded call site does no work at all.
 */
export const NO_PROBE: Probe = Object.freeze({
  span: (): Disposable => NO_SPAN,
  count: (): void => undefined,
  gauge: (): void => undefined,
  mark: (): void => undefined,
  hit: (): void => undefined,
  miss: (): void => undefined,
  on: false,
});
