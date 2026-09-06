/**
 * Which kinds animate, and how fast (C09 I32, C22 I60, F227).
 *
 * **A `Record<BlockKind, boolean>` and never a `Set`.** A record is checked for
 * exhaustiveness in **both** directions — a kind added to the union without an
 * entry here is a type error, and an entry naming a kind that no longer exists
 * is one too. A `Set` of two strings compiles with either missing, which is
 * F228's class: a hand-maintained list beside a generated one, where the
 * hand-maintained list is the one that reads as authoritative.
 *
 * **Two entries by kind, and that is the whole population of kinds.** `status`
 * animates unconditionally (C09 I32) and `steps` draws a spinner frame while a
 * step is active. A block also animates **by content** — a span or a bar whose
 * ramp carries an `animate` (C09 I54) — and `tickIntervalOf` answers for both;
 * this record stays what it was, the kinds that animate by nature.
 */
import { spinnerIntervalMs } from "./glyphs.js";
import { animatesByContent, rampCadenceMs } from "./ramp.js";
import type { Block, BlockKind, Status } from "../../data/viewmodel/index.js";

export const ANIMATES: Readonly<Record<BlockKind, boolean>> = Object.freeze({
  code: false,
  comparison: false,
  events: false,
  group: false,
  keyValue: false,
  image: false,
  logs: false,
  mosaic: false,
  notice: false,
  panel: false,
  patch: false,
  pills: false,
  plot: false,
  progress: false,
  raw: false,
  rule: false,
  scroll: false,
  status: true,
  steps: true,
  table: false,
  tip: false,
});

/** A container's children, for the walk below. Absent means a leaf. */
function childrenOf(block: Block): readonly Block[] {
  const record = block as { children?: readonly Block[] };
  return record.children ?? [];
}

/**
 * The cadence a block wants, in milliseconds, or `null` if it does not animate.
 *
 * **The interval comes from the set and the set comes from the block**, which is
 * the pairing `spinnerIntervalMs` and `spinnerFrames` were built to hold: a
 * caller cannot end up with one set's frames against another's tick. `steps`
 * names no set and resolves to the default, exactly as its renderer does.
 *
 * Driven by `ANIMATES` rather than by a second list, so the two cannot disagree
 * about which kinds are in scope.
 */
export function tickIntervalOf(block: Block): number | null {
  if (ANIMATES[block.kind] === true) {
    return block.kind === "status" ? spinnerIntervalMs((block as Status).spinner) : spinnerIntervalMs();
  }
  // By content (C09 I54): a moving ramp asks for the default set's cadence
  // through the lookup the kinds use; its periods are counted in the ticks C03
  // then delivers.
  return animatesByContent(block) ? rampCadenceMs() : null;
}

/**
 * The fastest cadence anything in these blocks wants, or `null` for none.
 *
 * **Containers are walked**, because a `steps` inside a `panel` inside a `group`
 * is exactly where a live part puts one — a scan of the top level only would
 * answer *nothing animates* for the arrangement the framework itself builds.
 */
export function animationIntervalOf(blocks: readonly Block[]): number | null {
  let fastest: number | null = null;
  const visit = (block: Block): void => {
    const own = tickIntervalOf(block);
    if (own !== null && (fastest === null || own < fastest)) fastest = own;
    for (const child of childrenOf(block)) visit(child);
  };
  for (const block of blocks) visit(block);
  return fastest;
}
