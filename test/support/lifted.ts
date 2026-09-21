// Test-only kinds for C09 I73's rows arm — fixtures the corpus lacks.
//
// **`lifted` and `twin` were here and are gone with Ink** (F1209). `lifted`
// wrapped a block and answered `elementOf(its rows)`, which is what every leaf
// answered before I72, and `twin` lifted the leaves under a container so the
// container took its element path and Ink wrote the reference. That reference
// is committed now (`ink-oracle.ts`), and there is no element path to reach.
//
// What is left is the fixtures: a row ending in an open style, a row filling
// its cell in one style, a child answering fewer rows than it measures, one
// answering more, and one answering a row **wider than the width it was given**
// — the last added by F1211, which is the only way to reach a composer's cut.
import { rows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const ESC = "\x1b";

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

/** Answers a row wider than the width it was given — the only way to reach a composer's decline. */
export const wideDefinition = {
  kind: "wide",
  measure: (): number => 1,
  render: (_b: Block, ctx: { width: number }): readonly string[] => rows(["W".repeat(ctx.width + 4)]),
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
  wideDefinition,
  danglingDefinition,
  solidDefinition,
  shortDefinition,
  tallDefinition,
];

