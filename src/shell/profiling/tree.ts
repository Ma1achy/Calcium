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
  readonly children: OpenNode[];
};

export function openNode(name: string, parent: OpenNode | null, at: number): OpenNode {
  const node: OpenNode = {
    name,
    parent,
    startedAt: at,
    childTime: 0,
    self: null,
    total: null,
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

/** One node's totals across the session. */
export type NodeStat = Readonly<{
  key: string;
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
 * `frames` is separate from `calls` on purpose. A node measured once per frame
 * over forty frames and a node measured forty times in one frame have the same
 * `calls` and are completely different defects; the ratio is the one that says
 * *this was recomputed within a single frame*, which is the layout-thrash
 * reading and the whole reason the count is kept beside the duration.
 */
export class Aggregate {
  readonly #rows = new Map<string, {
    calls: number; self: number; total: number; max: number; frames: number; lastFrame: number;
  }>();

  add(key: string, self: number, total: number, frame: number): void {
    const row = this.#rows.get(key);
    if (row === undefined) {
      this.#rows.set(key, { calls: 1, self, total, max: self, frames: 1, lastFrame: frame });
      return;
    }
    row.calls += 1;
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
    for (const [key, r] of this.#rows) {
      out.push(Object.freeze({
        key, calls: r.calls, self: r.self, total: r.total, max: r.max, frames: r.frames,
      }));
    }
    out.sort((a, b) => b.self - a.self);
    return Object.freeze(out);
  }
}

/** A closed node, as a report carries it. */
export type TreeNode = Readonly<{
  name: string;
  self: number;
  total: number;
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
    self,
    total,
    children: Object.freeze(node.children.map((c) => freezeTree(c, endedAt))),
  });
}
