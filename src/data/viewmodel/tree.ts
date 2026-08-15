/**
 * Which blocks hold blocks — asked once, of the definition, and checked by the
 * compiler.
 *
 * **This module exists because `scroll` was a defect in six places at once.**
 * The kind landed, `descendants` and `validateDocument` were updated, and four
 * other walks kept enumerating `panel | group`: a patch into a scrolled child
 * was a silent no-op that answered `ok`, a live panel inside a scroll never
 * ticked, and the session cap counted a five-hundred-child container as one.
 * Every one of those sites was correct on the day it was written.
 *
 * `descendants`' own comment named the hazard as *a second copy of this walk
 * would miss the next container kind* — and there was no second copy. There
 * were six independent enumerations, none of them a copy of any other, so the
 * defence was against duplication and the failure was **enumeration**. A rule
 * that has to be remembered at six call sites is remembered at two of them.
 *
 * **`CONTAINERS` is a `Record` and not a `Set`, and that is the whole
 * mechanism.** `ContainerBlock` is derived from `Block` by the compiler — every
 * member declaring `children` — so a `Record` keyed by its `kind` is checked
 * for exhaustiveness in both directions: a new container kind fails to compile
 * until it is listed, and a kind listed here that has no children fails too. A
 * `Set` of the same three strings type-checks with any of them missing, which
 * is exactly the failure this replaces.
 *
 * What it deliberately does **not** answer: whether a caller should descend. A
 * container that declares its own `elements` owns them (C26 §4b cell 3), and
 * `registry.elementsIn` must not walk past it. That is a question about the
 * definition and it is asked there — this module answers only *does this block
 * hold blocks*.
 */

import type { Block } from "./types.js";

/** Every member of the union declaring `children` — derived, never listed. */
export type ContainerBlock = Extract<Block, { children: readonly Block[] }>;

/**
 * The exhaustiveness gate. Adding a `children` field to a kind makes this fail
 * to compile, which is the only moment at which the six walks can be updated
 * together.
 */
const CONTAINERS: Readonly<Record<ContainerBlock["kind"], true>> = Object.freeze({
  panel: true,
  group: true,
  scroll: true,
});

/**
 * Does this kind name hold children? Takes `unknown` because `validateDocument`
 * asks it of untrusted input, where the kind may be any string at all (I4).
 */
export function isContainerKind(kind: unknown): boolean {
  return typeof kind === "string" && Object.hasOwn(CONTAINERS, kind);
}

/** The same question of a constructed block, as a narrowing guard. */
export function hasChildren(block: Block): block is ContainerBlock {
  return isContainerKind(block.kind);
}

/**
 * Nested blocks, one level down, **including a table's detail** — the walk a
 * caller wants when it is looking for a block by id rather than composing a
 * frame. A row is not a block; a row's `detail` is (C04 §3).
 *
 * `table` stays enumerated here and is not derived, because `rows` is a field
 * of one kind and detail blocks are reached through a row rather than held by
 * the block. Deriving it would mean a second structural rule with one
 * inhabitant, which is the shape this module was written to avoid.
 */
export function childBlocks(block: Block): readonly Block[] {
  if (hasChildren(block)) return block.children;
  if (block.kind === "table") return block.rows.flatMap((r) => r.detail ?? []);
  return [];
}
