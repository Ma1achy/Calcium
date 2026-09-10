/**
 * Spans, accumulated two ways (C28 I31, I32).
 *
 * A flat histogram per span name answers *what does painting cost*. It cannot
 * answer *what does **this** plot cost*, and it cannot answer *what is under
 * the slow one* — both of which are the question a reader actually has. So the
 * same stream of opens and closes feeds two structures:
 *
 * - **`Aggregate`** — one row per node key, summed over the session. `plot#pl-1`
 *   called 42 times for 480 ms of self time. This is the element attribution and
 *   it is bounded by the number of distinct blocks, not by the number of frames.
 * - **`FrameTree`** — the parent/child structure of one frame, kept whole. This
 *   is the flame chart, and it is retained only for the worst frames because a
 *   tree per frame is unbounded in a way a per-key sum is not.
 *
 * **Self time, not inclusive, in both.** A parent that reports its children's
 * cost as its own makes the outermost node the widest bar in every tree ever
 * drawn, which tells a reader nothing they did not know before opening it.
 * `childTime` is subtracted at close, so `Σ self` over a tree is the tree's real
 * cost and each row is what that node did itself.
 *
 * **Closing is per node, not per stack top.** The previous recorder held one
 * pointer and dropped any close that did not match it — which is exactly what an
 * `await` produces, so every async span it ever recorded was silently discarded.
 * A node here carries its own parent, so a close is correct whatever else has
 * happened in between, and the stack pointer is consulted only to decide who a
 * *new* span's parent is.
 */

/** A node while it is open. Mutable by construction — it is being measured. */
export type OpenNode = {
  readonly name: string;
  readonly parent: OpenNode | null;
  readonly startedAt: number;
  /** Inclusive time of every child that has closed, subtracted at close. */
  childTime: number;
  /** Set at close; `null` means it never closed (a throw, or a live capture). */
  self: number | null;
  total: number | null;
  /**
   * The terminal width when the span opened, or `null` before one is known.
   *
   * **The width it opened at, and never the one it closed at** (C28 I26). Width
   * is the axis that decides how much work a measure or a paint does, so a span
   * attributed to the width in force when it finished is a cost filed against
   * geometry that did not produce it — and it is silent, because the number is
   * a plausible width and the duration is real.
   */
  readonly width: number | null;
  /** A resize was delivered between this span opening and closing (C28 I26). */
  crossedResize: boolean;
  readonly children: OpenNode[];
};

export function openNode(
  name: string,
  parent: OpenNode | null,
  at: number,
  width: number | null = null,
): OpenNode {
  const node: OpenNode = {
    name,
    parent,
    startedAt: at,
    childTime: 0,
    self: null,
    total: null,
    width,
    crossedResize: false,
    children: [],
  };
  if (parent !== null) parent.children.push(node);
  return node;
}

/**
 * Close `node` at `at`, returning its self time.
 *
 * Idempotent: a second close is a no-op returning the figure the first
 * produced. `using` cannot double-dispose, but `trace`'s `finally` and an
 * explicit close in the same path can, and a span counted twice is worse than
 * one counted late.
 */
export function closeNode(node: OpenNode, at: number): number {
  if (node.self !== null) return node.self;
  const total = Math.max(0, at - node.startedAt);
  const self = Math.max(0, total - node.childTime);
  node.total = total;
  node.self = self;
  if (node.parent !== null) node.parent.childTime += total;
  return self;
}

/**
 * Which seam entered an element's span (C28 I31).
 *
 * **Required, and that is the finding.** The registry decoration opens a span in
 * the `measure` wrapper and another in the `render` wrapper, both keyed on
 * `kind#id` alone — so one counter held both, and the ratio built on it was
 * printed as *measured more than once per frame* over a figure whose floor is 2
 * for every block that is both measured and rendered. Measured over a 35-frame
 * session: `group#chrome.header` is 0 measures against 35 renders and
 * `table#profile-table` is 67 against 0, a spread no single counter can express
 * (F1098). An optional parameter with a default would have kept every existing
 * call site compiling and recorded a lie for each one.
 */
export type ElementOp = "measure" | "render";

/** One node's totals across the session. */
export type NodeStat = Readonly<{
  key: string;
  /**
   * The transcript entry this element was measured for, absent for chrome
   * (C28 I42).
   *
   * **Part of the identity, not a label.** A block id is unique within its own
   * document (C04 I14) and a transcript holds many, so `kind#id` alone merges
   * two components into one row — and the merged row's `measures / frames` is
   * the sum of their numerators over one denominator, which is the layout-thrash
   * signal the count exists to produce. Measured at 2.3 per frame true against
   * 5.3 reported (F892).
   */
  entry?: string;
  /**
   * Opens of the `measure` seam — **the thrash figure's numerator** (C28 I31).
   *
   * `measures / frames` above 1 is the same block measured twice inside one
   * frame, which is repeated work whatever it cost. This is the reading I31 has
   * always claimed to publish and `calls / frames` could not give, because that
   * quotient's floor is 2 for a block that is drawn at all.
   */
  measures: number;
  /**
   * Opens of the `render` seam — the same defect on the other side.
   *
   * Beside `measures` rather than folded into it: a block rendered twice in a
   * frame is repeated work too, and a reader who cannot see which seam repeated
   * cannot tell a height pass from a paint pass.
   */
  renders: number;
  /**
   * `measures + renders` — how often the registry was entered for this block at
   * all.
   *
   * Kept, because it is a real question and `panes.ts` asks it: the seam-entry
   * count is what says a node was *reached* more than its siblings. It is not
   * the thrash figure and no marker reads it (F1098).
   */
  calls: number;
  self: number;
  total: number;
  max: number;
  /** Distinct frames this key appeared in — `calls / frames` is the thrash figure. */
  frames: number;
}>;

/**
 * Per-key totals, bounded by the number of distinct keys.
 *
 * `frames` is separate from the counts on purpose. A node measured once per
 * frame over forty frames and a node measured forty times in one frame have the
 * same `measures` and are completely different defects; the ratio is the one
 * that says *this was recomputed within a single frame*, which is the
 * layout-thrash reading and the whole reason the count is kept beside the
 * duration.
 *
 * **And the ratio's numerator must be one population.** `calls / frames` was the
 * figure a formatter printed under that sentence for as long as this class
 * existed, and it sums a measure with a render, so its floor is 2 for a block
 * that is drawn — a rate neither population has (F1098, and F892's symptom from
 * a second merge).
 */
export class Aggregate {
  readonly #rows = new Map<string, {
    key: string; entry: string | null;
    measures: number; renders: number;
    self: number; total: number; max: number; frames: number; lastFrame: number;
  }>();

  add(
    key: string,
    entry: string | null,
    op: ElementOp,
    self: number,
    total: number,
    frame: number,
  ): void {
    const at = entry === null ? key : `${entry}\u0000${key}`;
    const row = this.#rows.get(at);
    if (row === undefined) {
      this.#rows.set(at, {
        key,
        entry,
        measures: op === "measure" ? 1 : 0,
        renders: op === "render" ? 1 : 0,
        self, total, max: self, frames: 1, lastFrame: frame,
      });
      return;
    }
    if (op === "measure") row.measures += 1;
    else row.renders += 1;
    row.self += self;
    row.total += total;
    if (self > row.max) row.max = self;
    if (row.lastFrame !== frame) {
      row.frames += 1;
      row.lastFrame = frame;
    }
  }

  get size(): number {
    return this.#rows.size;
  }

  clear(): void {
    this.#rows.clear();
  }

  /**
   * Every row, heaviest self time first.
   *
   * Sorted here rather than by a consumer because the order is the answer: a
   * reader opens this to find what to fix, and an alphabetical list of two
   * hundred block ids is a list nobody reads to the bottom of.
   */
  snapshot(): readonly NodeStat[] {
    const out: NodeStat[] = [];
    for (const r of this.#rows.values()) {
      out.push(Object.freeze({
        key: r.key,
        ...(r.entry === null ? {} : { entry: r.entry }),
        measures: r.measures,
        renders: r.renders,
        calls: r.measures + r.renders,
        self: r.self, total: r.total, max: r.max, frames: r.frames,
      }));
    }
    out.sort((a, b) => b.self - a.self);
    return Object.freeze(out);
  }
}

/** A closed node, as a report carries it. */
export type TreeNode = Readonly<{
  name: string;
  /**
   * When the span opened, on the session's `elapsed` axis.
   *
   * **Carried rather than derived, and that is what it is for.** A parent's
   * children do not tile it — the gaps between them are the parent's own self
   * time — so a consumer laying them out end to end inside the parent produces
   * a timeline that is well-formed, plausible and not what happened. The trace
   * exporter is the caller, and a viewer cannot tell a fabricated layout from a
   * measured one.
   */
  startedAt: number;
  self: number;
  total: number;
  /** The width the span opened at, `null` if none was known (C28 I26). */
  width: number | null;
  /** A resize arrived while it was open, so `width` is not the whole story. */
  crossedResize: boolean;
  children: readonly TreeNode[];
}>;

/**
 * An open tree frozen into a reportable one.
 *
 * A node still open when the frame ended keeps the time it has so far and is
 * marked by `total === null` becoming its elapsed-so-far rather than being
 * dropped. A span left open by a throw is a finding, and discarding it hides
 * the frame that threw.
 */
export function freezeTree(node: OpenNode, endedAt: number): TreeNode {
  const total = node.total ?? Math.max(0, endedAt - node.startedAt);
  const self = node.self ?? Math.max(0, total - node.childTime);
  return Object.freeze({
    name: node.name,
    startedAt: node.startedAt,
    self,
    total,
    width: node.width,
    crossedResize: node.crossedResize,
    children: Object.freeze(node.children.map((c) => freezeTree(c, endedAt))),
  });
}
