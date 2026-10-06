/**
 * The regional tone budget — C10, `R-COL-002`, §090.
 *
 * **The rule is a count and nothing counted it.** `R-COL-002` reads *the tone
 * budget is regional: an entry has three tones, while code, plots, and patches
 * carry their own adjacent palettes*, and §090 gives both the figure and the
 * threshold in one line — *an ordinary entry: three semantic tones. Five is a
 * smell* — along with the reason the count must be regional rather than global:
 * *a full frame counting twelve tones is not breaking the rule — the rule was
 * about one ENTRY, and it was stated globally.*
 *
 * So the budget is **three**, the gate is **five**, and the two are different
 * numbers on purpose: three is what an entry should spend and five is where
 * spending it becomes a defect. A gate at three would fail entries the design
 * does not object to; a budget of five would lose the figure the design states.
 */
import type { Block, Tone } from "../../data/viewmodel/index.js";

/**
 * The kinds whose subtree is a region of its own (`R-COL-002`, §090).
 *
 * **Exactly the three the rule names**, and no more. §090 lists a fourth —
 * *identity chrome: its own ten hues* — and the rule's own text does not, so it
 * is left out: a hue is not a `Tone` and never enters this count anyway, where
 * adding a block kind on the strength of a neighbouring sentence would widen
 * the exemption past what the rule says.
 *
 * A region is skipped **whole**, not merely at its root: a code block's syntax
 * palette is inside it, and counting its children would charge the entry for
 * the very palette the rule says it carries separately.
 */
const REGIONS: ReadonlySet<string> = new Set(["code", "plot", "patch"]);

/** Every `Tone` a block tree names directly, by the fields that carry one. */
function collect(block: Block, out: Set<Tone>): void {
  if (REGIONS.has(block.kind)) return;

  const b = block as unknown as Record<string, unknown>;
  const take = (v: unknown): void => {
    if (typeof v === "string") out.add(v as Tone);
  };

  take(b["tone"]);
  for (const key of ["rows", "cells", "spans", "steps", "lines", "items", "series"]) {
    const list = b[key];
    if (Array.isArray(list)) for (const entry of list) walkRecord(entry, out);
    else if (list !== null && typeof list === "object") walkRecord(list, out);
  }

  const children = b["children"];
  if (Array.isArray(children)) for (const child of children) collect(child as Block, out);
  const detail = b["blocks"];
  if (Array.isArray(detail)) for (const child of detail) collect(child as Block, out);
}

/**
 * A nested record's tones, for the shapes that are not blocks.
 *
 * A table row's cells, a keyValue row, a step — each carries a `tone` without
 * being a `Block`, so a walk over block kinds alone would count none of them
 * and the gate would read green over an entry spending ten.
 */
function walkRecord(value: unknown, out: Set<Tone>): void {
  if (value === null || typeof value !== "object") return;
  const r = value as Record<string, unknown>;
  if (typeof r["kind"] === "string" && REGIONS.has(r["kind"])) return;
  if (typeof r["tone"] === "string") out.add(r["tone"] as Tone);
  for (const v of Object.values(r)) {
    if (Array.isArray(v)) for (const entry of v) walkRecord(entry, out);
    else if (v !== null && typeof v === "object") walkRecord(v, out);
  }
}

/** The distinct semantic tones one entry spends, regions excluded. */
export function entryTones(blocks: readonly Block[]): ReadonlySet<Tone> {
  const out = new Set<Tone>();
  for (const block of blocks) collect(block, out);
  return out;
}

/** §090's threshold: *three semantic tones. Five is a smell.* */
export const TONE_BUDGET = 3;
export const TONE_SMELL = 5;
