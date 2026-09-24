/**
 * A block, and the terminal rows it actually occupies (C09).
 *
 * **This lived in `src/testing/` and it was never a testing utility.** A test
 * was its first caller, so it was written where the caller was — and then
 * `shell/paint.ts`, `shell/composite.ts` and `shell/session.ts` came to depend
 * on `renderSequenceToLines` for real frame composition. The package declares
 * `@fmx/calcium/testing` dev-only and C24 I8 says it is absent from a production
 * bundle; tracing the built runtime entry found three edges into
 * `dist/testing/index.js`, dragging both conformance suites in behind them.
 *
 * Nothing was wrong with the code and the layering was never violated — L1
 * importing L0 and L4 importing L1 are both downward. **The defect was
 * entirely one of address**, and it was invisible until C24 gave the tree an
 * entry point to trace from: with no `src/index.ts`, there was no production
 * bundle to be absent from.
 *
 * It sits in `presentation/` because that is what it is — the render path
 * expressed as lines, beside the registry that drives it. `src/testing/` keeps
 * the two conformance suites, which a consumer genuinely runs.
 */
import { NO_SPAN, normaliseWidth } from "../data/viewmodel/index.js";
import type { Block } from "../data/viewmodel/index.js";
import type { BlockRegistry, RenderContext, RenderContextInput, Rendered } from "./blocks/index.js";
import { normaliseRow } from "./rows.js";
import type { ResolvedTheme } from "./theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { Motion } from "./blocks/index.js";

/**
 * Everything a render needs that is not the registry or the block. Defaulted
 * so a caller asserting about geometry does not have to assemble a theme.
 */
export type RenderOptions = Readonly<{
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  /** The reader's motion preference (C09 I99); absent is `"full"`. */
  motion?: Motion;
  tick?: number;
  focus?: RenderContext["focus"];
  /** Blocks under a banded selection (C14 I54). Absent is none, and is the only value off a band. */
  washed?: RenderContext["washed"];
  /** Per-container scroll offsets, in rows (C04 I48). Absent is none. */
  scrollOffsets?: RenderContext["scrollOffsets"];
  /** Per-plot cursor positions, in sample indices. Absent is no cursor. */
  cursorPositions?: RenderContext["cursorPositions"];
  /** Per-plot live cameras (C12 I83). Absent is each block's own. */
  cameras?: RenderContext["cameras"];
  /** Per-image frame indices (C04 I93, C22 I77). Absent is frame 0. */
  frames?: RenderContext["frames"];
  /**
   * The scope a placement is identified within (C09 I66). Absent is the
   * picture's identity, and it must be absent on the seam too.
   */
  placementScope?: RenderContext["placementScope"];
  /** Per-plot series overrides (C04 I99, C22 I78). Absent is each block's own `hidden`. */
  seriesVisibility?: RenderContext["seriesVisibility"];
  /**
   * Caller-owned scratch (C12 I107). Absent is a miss on every lookup, which is
   * the same frame at the same cost — a cache whose absence changes a picture
   * is not a cache, and PR10's control asserts exactly that.
   */
  scratch?: RenderContext["scratch"];
  /** C28's seam (I30). Absent is not recording. */
  probe?: RenderContext["probe"];
}>;

/**
 * The rows a block occupies at `width`.
 *
 * This is the right-hand side of C09 I1: `measure(block, w)` must equal
 * `renderToLines(registry, block, w).length`. Ink renders to a string
 * synchronously with no terminal, no stdout and no event listeners, so this is
 * a pure function of its arguments — which is what allows it in a unit test
 * rather than only behind a PTY.
 */
export function renderToLines(
  registry: BlockRegistry,
  block: Block,
  width: number,
  options: RenderOptions,
): readonly string[] {
  const ctx: RenderContextInput = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    focus: options.focus ?? null,
    ...(options.washed === undefined ? {} : { washed: options.washed }),
    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),
    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),
    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.placementScope === undefined ? {} : { placementScope: options.placementScope }),
    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),
    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
    tick: options.tick ?? 0,
    ...(options.probe === undefined ? {} : { probe: options.probe }),
  };

  const probe = options.probe;
  let rendered: Rendered;
  {
    using _build = probe?.span("elements") ?? NO_SPAN;
    rendered = registry.render(block, ctx);
  }
  return linesOf(rendered, probe);
}

/**
 * A render's rows, each put into the form Ink's output layer wrote (C09 I72).
 *
 * **There is one arm.** This tested whether the answer was rows or an element
 * and sent the second through Ink, and the probe opened `rows` for the one and
 * `react` for the other so the deck could say what a document was made of. No
 * kind answers an element since I73 reached `mosaic`, and `Rendered` narrowed
 * to rows with Ink's removal (F1209); the `react` span is gone with it, which
 * is why the deck's arm counts are now a statement about history.
 */
function linesOf(rendered: Rendered, probe: RenderContext["probe"]): readonly string[] {
  using _rows = probe?.span("rows") ?? NO_SPAN;
  return rendered.map(normaliseRow);
}

/**
 * The rows a *sequence* of blocks occupies — a document's top level.
 *
 * The other side of `measureSequence`: `gapBefore` is the only thing in C04's
 * vocabulary that produces vertical space, and the surfaces are drawn with it,
 * so composing a surface and counting rows is how an illustration becomes a
 * checkable claim rather than a picture (docs/surfaces/HEIGHT_AUDIT.md).
 */
export function renderSequenceToLines(
  registry: BlockRegistry,
  blocks: readonly Block[],
  width: number,
  options: RenderOptions,
): readonly string[] {
  const ctx: RenderContextInput = {
    width,
    theme: options.theme,
    capabilities: options.capabilities,
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    focus: options.focus ?? null,
    ...(options.washed === undefined ? {} : { washed: options.washed }),
    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),
    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),
    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.placementScope === undefined ? {} : { placementScope: options.placementScope }),
    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),
    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
    tick: options.tick ?? 0,
    ...(options.probe === undefined ? {} : { probe: options.probe }),
  };

  // **The two halves are timed apart, and this is the split that matters most**
  // (C28 I31). Everything in `elements` is Calcium building the answer — every
  // block's `render`, every container's placement arithmetic. Everything in
  // `react` is React and Yoga: `createContainer`, `updateContainerSync`,
  // `calculateLayout`, the string walk, then a full unmount and
  // `yogaNode.free()`. Ink reuses nothing between calls, so that is a complete
  // mount-and-teardown cycle per invocation and there is no reason to assume it
  // is the cheap half. Merged into one span the question is unanswerable;
  // split, the first frame answers it — and answered, it was half the orbit
  // frame (F1168), which is why the sequence is now composed **block by block**
  // (C09 I72): a block answering rows is normalised into the frame's rows and
  // pays nothing for Ink; a block answering an element takes the Ink path
  // alone, in the same column box at the same width the registry's whole-
  // sequence element arm gave it, so its rows are the rows the whole tree would
  // have written — that arm is gone (F1209) and its bytes are a capture. A
  // block's own padding row is one empty row, as the `Text` holding a space came
  // out of Ink; the registry emits it now (C09 I80) and this composer does not.
  const probe = options.probe;
  const w = normaliseWidth(width);
  const out: string[] = [];
  for (const block of blocks) {
    // **No gap row here, and that is the point of 2a** (C09 I80). A block's
    // spacing is its own padding and the registry applies it, so this composer
    // adds nothing to the document's height — which is C04 I25's half that did
    // not change.
    let rendered: Rendered;
    {
      using _build = probe?.span("elements") ?? NO_SPAN;
      rendered = registry.render(block, { ...ctx, width: w });
    }
    for (const line of linesOf(rendered, probe)) out.push(line);
  }
  return out;
}
