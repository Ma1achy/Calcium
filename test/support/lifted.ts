// Test-only kinds for C09 I73's rows arm — **the reference is the element arm
// the containers still carry**, reached by making every leaf answer an element.
//
// `lifted` wraps a block and answers `elementOf(its rows)`, which is what every
// leaf answered before I72; a container whose children are lifted takes its
// element path, and Ink writes what Ink wrote. `twin(block)` lifts the leaves
// under a container, recursively, so a nested container also falls back. The
// other kinds are fixtures the corpus lacks: a row ending in an open style, a
// row filling its cell in one style, a child answering fewer rows than it
// measures, and one answering more.
import { elementOf, rows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const ESC = "\x1b";

export type Lifted = Readonly<{ kind: "lifted"; id: string; inner: Block }>;

export const liftedDefinition = {
  kind: "lifted",
  measure: (b: Lifted, width: number, measureChild: (block: Block, width: number) => number): number =>
    measureChild(b.inner, width),
  width: (b: Lifted, width: number, widthChild: (block: Block, width: number) => number): number =>
    widthChild(b.inner, width),
  render: (b: Lifted, ctx: { width: number; renderChild: (block: Block, width: number) => unknown }) =>
    elementOf(ctx.renderChild(b.inner, ctx.width) as never),
} as unknown as BlockDefinition<never>;

/** A row that ends in an open red, so a pad after it must not inherit the style. */
export const danglingDefinition = {
  kind: "dangling",
  measure: (): number => 1,
  render: (_b: Block, ctx: { width: number }): readonly string[] => rows([`${ESC}[31m${"red  ".slice(0, ctx.width)}`]),
} as unknown as BlockDefinition<never>;

/** A row filling the whole cell in one style, so two adjacent cells share it at the seam. */
export const solidDefinition = {
  kind: "solid",
  measure: (): number => 1,
  render: (_b: Block, ctx: { width: number }): readonly string[] =>
    rows([`${ESC}[31m${"x".repeat(ctx.width)}${ESC}[39m`]),
} as unknown as BlockDefinition<never>;

/** Measures three rows and answers one — the short child of a row group. */
export const shortDefinition = {
  kind: "short",
  measure: (): number => 3,
  render: (_b: Block, ctx: { width: number }): readonly string[] => rows(["short".slice(0, ctx.width)]),
} as unknown as BlockDefinition<never>;

/** Measures one row and answers three — the over-tall body of a panel. */
export const tallDefinition = {
  kind: "tall",
  measure: (): number => 1,
  render: (_b: Block, ctx: { width: number }): readonly string[] =>
    rows(["tall 1", "tall 2", "tall 3"].map((t) => t.slice(0, ctx.width))),
} as unknown as BlockDefinition<never>;

export const TEST_KINDS: readonly BlockDefinition<never>[] = [
  liftedDefinition,
  danglingDefinition,
  solidDefinition,
  shortDefinition,
  tallDefinition,
];

// **The wrapper carries what the parent reads off a child** — `gapBefore` — or
// the twin silently drops every gap, which is how the first draft compared a
// gapped group against a gapless one and blamed the arm.
const lift = (b: Block): Block =>
  ({ kind: "lifted", id: `lifted-${b.id}`, inner: b, ...(b.gapBefore === true ? { gapBefore: true } : {}) }) as unknown as Block;

/** The block with every leaf lifted, so each container composes elements. */
export function twin(b: Block): Block {
  const any = b as unknown as Record<string, unknown>;
  if (b.kind === "group" || b.kind === "panel" || b.kind === "scroll") {
    return { ...any, children: (any.children as readonly Block[]).map(twin) } as unknown as Block;
  }
  if (b.kind === "table") {
    const rowsOf = any.rows as readonly Record<string, unknown>[];
    return {
      ...any,
      rows: rowsOf.map((r) => (r.detail === undefined ? r : { ...r, detail: (r.detail as readonly Block[]).map(twin) })),
    } as unknown as Block;
  }
  return lift(b);
}
