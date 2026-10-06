/**
 * `findTool` and `visibleTools`. C05 §3a, §6 — see spec.
 *
 * Longest match wins (I7): `serving scale` beats `serving`, and the case that
 * matters is the one where both exist. Shortest-match is the plausible mistake —
 * it works on every single-token verb and fails the day a sub-verb is added,
 * which is long after anyone is looking. T6.3 is what catches it.
 */

import type { Manifest, ToolDef, ToolMatch } from "./types.js";

type ToolIndex = Readonly<{
  byName: ReadonlyMap<string, ToolDef>;
  maxTokens: number;
}>;

/**
 * The index, keyed on the **manifest object** rather than on its content.
 *
 * This is the first cache in the tree, so the reasoning is written down rather
 * than assumed. Purity holds because the key is identity and the manifest is
 * frozen: same input, same output, no I/O, and the index dies with the manifest
 * that produced it. Keyed on content instead — a hash of the binary and version,
 * say — two manifests differing only in a field the key ignored would share an
 * index, which passes every other test in C05 §8. T2.8 asserts the identity
 * property directly for exactly that reason.
 */
const INDEX = new WeakMap<Manifest, ToolIndex>();

function indexOf(m: Manifest): ToolIndex {
  const cached = INDEX.get(m);
  if (cached !== undefined) return cached;

  const byName = new Map<string, ToolDef>();
  let maxTokens = 0;
  for (const tool of m.tools) {
    byName.set(tool.name, tool);
    const tokens = tool.name.split(" ").length;
    if (tokens > maxTokens) maxTokens = tokens;
  }

  const built: ToolIndex = Object.freeze({ byName, maxTokens });
  INDEX.set(m, built);
  return built;
}

/**
 * Resolve tokens to a tool, longest prefix first.
 *
 * Hidden tools resolve. `hidden` means invocable but not offered — see
 * `visibleTools`, and T1.15, which asserts the pair together because separately
 * both halves pass while the intent goes missing between them.
 */
export function findTool(m: Manifest, tokens: readonly string[]): ToolMatch | null {
  const index = indexOf(m);

  // Bounded by the longest name in the manifest, so a tool whose name has more
  // spaces than any invocation supplies simply never matches (T3.13), and a
  // 5,000-tool manifest costs a handful of map lookups rather than a scan.
  const longest = Math.min(index.maxTokens, tokens.length);

  for (let n = longest; n >= 1; n--) {
    const tool = index.byName.get(tokens.slice(0, n).join(" "));
    if (tool !== undefined) {
      return Object.freeze({ tool, consumed: n, residual: Object.freeze(tokens.slice(n)) });
    }
  }

  return null;
}

/**
 * The tools an app offers: help listings and completion. One definition of
 * "visible", so `hidden` cannot come to mean two things in two modules.
 */
export function visibleTools(m: Manifest): readonly ToolDef[] {
  return Object.freeze(m.tools.filter((t) => t.hidden !== true));
}

/**
 * The tokens that ask this far side for JSON, resolved (C05 I26, C06 I25, F1).
 *
 * **A function rather than an expression at `execution.ts`' call site**, for
 * `visibleTools`' reason above: two implementations of a resolution drift on
 * exactly the case that matters, and this one has a case — the verb replaces
 * the manifest's *whole*, never merging with it, because merging two token
 * sequences has no meaning. C06 is handed the answer and never learns what a
 * verb is. (It cited `isViewInvocation` for that reason, and two call sites;
 * the predicate went with the pushed view, R-EXA-082, and left its doc comment
 * above this one with nothing under it.)
 *
 * **Three states**: a verb's declaration wins; absent inherits the manifest's;
 * a manifest with none resolves to `["--json"]`, which is what the transport
 * appended unconditionally before the member existed. `[]` survives all three —
 * it is a declaration of *no tokens*, and returning `undefined` for it would
 * make a verb that already emits JSON inherit instead.
 */
export function jsonFlagFor(manifest: Manifest, tool: ToolDef): readonly string[] | undefined {
  return tool.jsonFlag ?? manifest.jsonFlag;
}

