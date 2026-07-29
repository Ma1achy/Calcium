/**
 * The constructors. The one place a block's shape invariants are enforced.
 *
 * C04 §4b — see spec. These take a **complete** block and return a frozen one.
 * C24's `b` is the ergonomic layer over them — generated ids, bare strings as
 * cells, action helpers — and it never freezes or validates directly. If it did,
 * I1 would have two enforcement points, and the one that drifts is always the
 * one with fewer tests: a block frozen twice is indistinguishable from a block
 * frozen once, right up until one of the two paths stops doing it.
 *
 * Three invariants live here, all at construction rather than at render:
 *
 *   I1  deep freeze, at every nesting depth
 *   I6  a glyph on `error` and `warn` tones
 *   §3  `height` present for `form: "line"`
 *
 * They throw rather than returning a result, and that is not in tension with
 * I15. `applyPatch` is fallible because it runs on every stream tick against
 * data from the far side; a constructor runs against a literal an adapter
 * author wrote, and the failure is a bug in that source rather than a condition
 * to handle. The distinction is who can fix it.
 */

import {
  GLYPH_REQUIRED_TONES,
  type Block,
  type Cell,
  type Notice,
  type Plot,
  type Tone,
  type ViewDocument,
} from "./types.js";

/**
 * I1 — freeze at every nesting depth. A shallow `Object.freeze` on a document
 * leaves `blocks[0].rows[2]` mutable, and a T1.1 that only probes the top level
 * passes anyway. That is the failure this function exists to make impossible.
 *
 * Cycles are tolerated here rather than refused: `seen` keeps the walk finite,
 * and refusal is `validateDocument`'s job (I18). A constructor that hung on a
 * cyclic literal would fail worse than one that freezes it and lets validation
 * name the problem.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

/** Thrown by a constructor. A bug in the calling adapter, not a runtime condition. */
export class BlockShapeError extends Error {
  override readonly name = "BlockShapeError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * I6 — a tone that means "something is wrong" carries a glyph, so the meaning
 * survives 1-bit, monochrome and colour-blind rendering (D29). Checked at
 * construction rather than at the renderer, which is where D29 says the
 * constraint belongs: the renderer has no way to invent one.
 */
function requireGlyph(tone: Tone | undefined, glyph: string | undefined, where: string): void {
  if (tone === undefined || !GLYPH_REQUIRED_TONES.has(tone)) return;
  if (glyph !== undefined && glyph.length > 0) return;
  throw new BlockShapeError(
    `${where}: tone "${tone}" requires a non-empty glyph (C04 I6, D29) — ` +
      `colour alone does not survive 1-bit or a colour-blind reader`,
  );
}

/**
 * §3 — `form: "line"` requires `height`. No default: a plot's height is a
 * layout decision the surface must make, and a magic default produces silently
 * wrong-sized plots that nobody notices are wrong. `sparkline` is always 1 and
 * must not carry one.
 */
function checkPlotHeight(plot: Plot): void {
  if (plot.form === "line" && plot.height === undefined) {
    throw new BlockShapeError(
      `plot "${plot.id}": form "line" requires an explicit height (C04 §3, C12) — ` +
        `there is no default, because a defaulted height is wrong silently`,
    );
  }
}

/** Every shape check that applies to a block, by kind. */
function checkShape(block: Block): void {
  switch (block.kind) {
    case "notice":
      requireGlyph(block.tone, (block as Notice).glyph, `notice "${block.id}"`);
      break;
    case "plot":
      checkPlotHeight(block);
      break;
    case "table":
      for (const row of block.rows) {
        for (const [key, cell] of Object.entries(row.cells)) {
          requireGlyph(cell.tone, cell.glyph, `table "${block.id}" row "${row.id}" cell "${key}"`);
        }
      }
      break;
    default:
      // I6 names `Notice` and `Cell`, and this implements exactly that.
      //
      // Worth recording rather than widening: `keyValue` rows and `pills` chips
      // carry a `tone` and have no `glyph` field, so a row toned `error` cannot
      // satisfy D29 on any renderer. That is a gap in the vocabulary, not a
      // rule to enforce here — closing it means either adding a glyph field to
      // those kinds or narrowing their tone type, and both are spec changes.
      break;
  }
}

/**
 * The single constructor. Every kind goes through it, including the three
 * registered elsewhere (`table`, `plot`, `patch`) — C04 owns every shape, so it
 * enforces every shape, and C11, C12 and C25 own only the engines.
 */
export function block<B extends Block>(spec: B): B {
  checkShape(spec);
  for (const child of childrenOf(spec)) checkShape(child);
  return deepFreeze(spec);
}

/**
 * Container children, so a nested block's shape is checked at construction too.
 *
 * `seen` is path-scoped and keeps the walk finite on a cyclic literal, matching
 * `deepFreeze` and for the same reason: a constructor that hangs fails worse
 * than one that completes and lets `validateDocument` name the cycle (I18).
 */
function* childrenOf(b: Block, seen: WeakSet<object> = new WeakSet()): Generator<Block> {
  if (seen.has(b)) return;
  seen.add(b);

  const nested: readonly Block[] =
    b.kind === "panel" || b.kind === "group"
      ? b.children
      : b.kind === "table"
        ? b.rows.flatMap((r) => r.detail ?? [])
        : [];
  for (const child of nested) {
    yield child;
    yield* childrenOf(child, seen);
  }
}

/**
 * I13 — `meta.origin` has no default here. C23 sets it on every append, and a
 * constructor that supplied one would be the path by which "always present"
 * quietly becomes "usually present".
 */
export function document(spec: ViewDocument): ViewDocument {
  for (const b of spec.blocks) {
    checkShape(b);
    for (const child of childrenOf(b)) checkShape(child);
  }
  return deepFreeze(spec);
}

/** A cell, checked for I6 in isolation — used by C24's `b` when building rows. */
export function cell(spec: Cell): Cell {
  requireGlyph(spec.tone, spec.glyph, "cell");
  return deepFreeze(spec);
}
