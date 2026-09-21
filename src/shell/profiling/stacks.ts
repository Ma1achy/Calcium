/**
 * V8's sampled stacks, folded into a tree a hierarchy form can draw (C28 I62).
 *
 * **A different measurement from the element tree, and the types say so.**
 * `TreeNode` is every framework element measured exactly (I31) — it knows when
 * a span opened, the width it opened at and whether a resize crossed it. A
 * sampler knows a name, a source location and a share of a window, and knows
 * none of those three; a fold that reused `TreeNode` would have to invent them,
 * which is a card fabricating numbers under a form that reads as measurement.
 *
 * **Folded where the profile is produced, not where it is drawn.** A card is a
 * pure function of a report and cannot open a file, and a fold at the card would
 * put a parse inside a redraw once a second. `Profiler.stop` hands back the
 * object; this reads it there.
 */

import type { FrameLocator } from "./locate.js";

/** A node of V8's `.cpuprofile`, as the protocol emits it. */
type ProfileNode = Readonly<{
  id: number;
  callFrame: Readonly<{ functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }>;
  children?: readonly number[];
}>;

/** What `Profiler.stop` returns — the shape, not the class. */
export type CpuProfile = Readonly<{
  nodes?: readonly ProfileNode[];
  samples?: readonly number[];
  timeDeltas?: readonly number[];
}>;

export type StackNode = Readonly<{
  name: string;
  /** `url:line` where V8 had one. `(anonymous)` is common and a location is
   *  what tells two of them apart — which is also why the fold never merges by
   *  name (§9b B24). */
  at: string | null;
  /** Microseconds, as V8 reports them. */
  self: number;
  total: number;
  children: readonly StackNode[];
}>;

export type SampledStacks = Readonly<{
  root: StackNode;
  excluded: Readonly<Record<string, number>>;
  foldMs: number;
}>;

/**
 * The frames in which no application code ran (C28 I63).
 *
 * **`(root)` is deliberately not here.** It is the container every sample hangs
 * from and the base bar of a flame, not a tile competing with the others;
 * excluding it leaves its children with no parent and the fold inventing one,
 * which is a frame that was never on a stack.
 */
export const SYNTHETIC: readonly string[] = Object.freeze([
  "(idle)", "(program)", "(garbage collector)",
]);

/** Where a sample landed that no node declares — a name, so the row can assert it. */
export const UNATTRIBUTED = "(unattributed)";

const frameName = (n: ProfileNode): string => {
  const fn = n.callFrame.functionName;
  return fn === undefined || fn === "" ? "(anonymous)" : fn;
};

/**
 * `url:line`, located through the chunk's source map where a locator is given
 * and answers (I65) — and exactly what V8 said where it is not or does not.
 */
const frameAt = (n: ProfileNode, locate: FrameLocator | undefined): string | null => {
  const url = n.callFrame.url;
  if (url === undefined || url === "") return null;
  const line = n.callFrame.lineNumber;
  if (line === undefined || line < 0) return url;
  const found = locate?.(url, line, n.callFrame.columnNumber ?? 0) ?? null;
  return found === null ? `${url}:${String(line + 1)}` : `${found.url}:${String(found.line + 1)}`;
};

/**
 * The profile as a tree, or `null` where there is nothing honest to draw.
 *
 * `null` in three cases, each a reading rather than a failure:
 *
 *   - **no samples attributed** — `nodes` is emitted whole whatever was
 *     sampled, so trusting it yields real function names all at zero, which is
 *     *measured, and free* and is the one figure a reader cannot doubt (I11);
 *   - **`samples` and `timeDeltas` of different lengths** — zipping to the
 *     shorter attributes part of the window and returns a tree that renders and
 *     describes less than it claims;
 *   - **no nodes at all**.
 */
export function foldCpuProfile(profile: CpuProfile, locate?: FrameLocator): Omit<SampledStacks, "foldMs"> | null {
  const nodes = profile.nodes ?? [];
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  if (nodes.length === 0) return null;
  if (samples.length !== deltas.length) return null;

  const byId = new Map<number, ProfileNode>(nodes.map((n) => [n.id, n]));

  // **Self time is `timeDeltas[i]` against `samples[i]`** — V8's own convention
  // and DevTools'. A negative delta is a clock that went backwards and is
  // clamped rather than subtracted from somebody's total.
  const selfUs = new Map<number, number>();
  let unattributed = 0;
  for (const [i, id] of samples.entries()) {
    const us = Math.max(0, deltas[i] ?? 0);
    if (byId.has(id)) selfUs.set(id, (selfUs.get(id) ?? 0) + us);
    // **Summed into a named residue, not dropped** (§9b B21). A tree that
    // silently loses time still sums to something plausible, and nothing on the
    // card would say which frames it was taken from.
    else unattributed += us;
  }

  const excluded: Record<string, number> = {};
  let real = 0;
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    if (n === undefined) continue;
    const name = frameName(n);
    if (SYNTHETIC.includes(name)) excluded[name] = (excluded[name] ?? 0) + us;
    else real += us;
  }
  if (real === 0 && unattributed === 0) return null;

  // The root is the node nothing declares as a child. V8 emits exactly one;
  // where it does not, the first node is taken and the walk's visited set keeps
  // the recursion bounded either way.
  const claimed = new Set<number>(nodes.flatMap((n) => [...(n.children ?? [])]));
  const rootNode = nodes.find((n) => !claimed.has(n.id)) ?? nodes[0];
  if (rootNode === undefined) return null;

  /**
   * A synthetic frame's children are lifted to its parent and its self time
   * leaves with it (I63) — so a real frame sampled beneath `(program)` is still
   * on the tree, at the depth it would have had.
   *
   * `seen` is a cycle guard rather than a claim about V8, which emits none: an
   * input this fold cannot trust is an input it must not recurse on for ever.
   */
  const walk = (id: number, seen: ReadonlySet<number>): readonly StackNode[] => {
    if (seen.has(id)) return [];
    const n = byId.get(id);
    if (n === undefined) return [];
    const next = new Set(seen).add(id);
    const kids = (n.children ?? []).flatMap((c) => walk(c, next));
    const name = frameName(n);
    if (SYNTHETIC.includes(name)) return kids;
    const self = selfUs.get(id) ?? 0;
    return [Object.freeze({
      name,
      at: frameAt(n, locate),
      self,
      total: self + kids.reduce((sum, k) => sum + k.total, 0),
      children: Object.freeze(kids),
    })];
  };

  const rootName = frameName(rootNode);
  const children = [...(rootNode.children ?? []).flatMap((c) => walk(c, new Set([rootNode.id])))];
  if (unattributed > 0) {
    children.push(Object.freeze({
      name: UNATTRIBUTED, at: null, self: unattributed, total: unattributed,
      children: Object.freeze([]),
    }));
  }
  const rootSelf = SYNTHETIC.includes(rootName) ? 0 : selfUs.get(rootNode.id) ?? 0;
  const root: StackNode = Object.freeze({
    name: rootName,
    at: frameAt(rootNode, locate),
    self: rootSelf,
    total: rootSelf + children.reduce((sum, k) => sum + k.total, 0),
    children: Object.freeze(children),
  });
  return Object.freeze({ root, excluded: Object.freeze(excluded) });
}
