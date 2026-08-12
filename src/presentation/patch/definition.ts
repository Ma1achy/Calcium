/**
 * C25 — the patch renderer, registered rather than privileged.
 *
 * The seventeenth kind and the last one C09 does not ship. `patchDefinition` goes
 * in through the public `register`, which is what makes three separately built
 * components — C11's `table`, C12's `plot`, this — the evidence that the extension
 * path is a mechanism rather than a claim. Deleting the register call removes the
 * kind, and there is no fallback that quietly supplies it.
 *
 * **Every row leaves through `line()`.** That is C12's lesson taken rather than
 * relearned: it rendered nineteen rows at width 1 against a declared five, because
 * one row skipped the clamp and the terminal wrapped each of them. Here the funnel
 * carries a second obligation — the row's background covers it to the full width —
 * so a row built any other way is both unclamped and ragged.
 */
import type { ReactElement } from "react";
import { rows } from "../blocks/paint.js";
import { cells } from "../text.js";
import { atLeastOne, normaliseWidth } from "../../data/viewmodel/index.js";
import { collapseText } from "./collapse.js";
import { hunkRows, isCollapsed, layoutFor, patchHeight, type Layout } from "./height.js";
import { windowRows } from "./window.js";
import { blankSide, dress, gutterSpans, line, textSpans } from "./lines.js";
import { patchLayout, type PatchLayout } from "./layout.js";
import type { Hunk, Patch } from "../../data/viewmodel/index.js";
import type { Span } from "../blocks/paint.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";

type Line = Hunk["lines"][number];

/** The one cell split spends on telling the two halves apart. */
const SEPARATOR = "\u2502";

/** A run of consecutive changed lines, and the rows it pairs into. */
type Run = Readonly<{ removes: readonly Line[]; adds: readonly Line[] }>;

/**
 * The path header. `── path ─────` in the block's own hand, because the block
 * should be complete on its own — a patch appearing outside S10 has no context
 * without it, and a surface that already names the file drops its rule rather than
 * the block dropping its header (C25 §9's Q1, settled that way).
 */
function header(block: Patch, layout: PatchLayout, ctx: RenderContext): string {
  const rule = ctx.capabilities.unicode === "ascii" ? "-" : "─";
  const label = ` ${block.path} `;
  const lead = `${rule}${rule}${label}`;

  // **The rule runs to the width.** Reading the frame is what caught it: stopping
  // at the label leaves the path floating with no region under it, and the figure
  // in §2 draws the rule across. `clampSpans` in `line()` cuts it back at a narrow
  // width, so the repeat is a ceiling rather than a promise.
  const trail = Math.max(0, layout.width - cells(lead));
  const spans: Span[] = [{ text: lead }, { text: rule.repeat(trail) }];
  return line(spans, "context", layout, ctx);
}

/** Unified: both number columns, then the marker, then the text. */
function unifiedRow(item: Line, block: Patch, layout: PatchLayout, ctx: RenderContext): string {
  return line(
    [...gutterSpans(item, layout, ctx), ...textSpans(item.text, block.language, layout.text, ctx)],
    item.kind,
    layout,
    ctx,
  );
}

/**
 * Split: a removed line beside its added counterpart.
 *
 * **The pairing is why split exists**, and it is also why height depends on width:
 * one removed line and two added ones are three rows unified and two split. I2a
 * carries that, and `pairedRows` computes the same number this loop draws — the two
 * are written as a pair for I1's sake, exactly as every other kind's halves are.
 */
function splitRows(run: Run, block: Patch, layout: PatchLayout, ctx: RenderContext): readonly string[] {
  const height = Math.max(run.removes.length, run.adds.length); // cells-ok — a row count
  const out: string[] = [];

  for (let i = 0; i < height; i += 1) {
    const left = run.removes[i];
    const right = run.adds[i];

    const leftSpans =
      left === undefined
        ? blankSide(layout)
        : [...gutterSpans(left, layout, ctx, "old"), ...textSpans(left.text, block.language, layout.text, ctx)];
    const rightSpans =
      right === undefined
        ? blankSide(layout)
        : [...gutterSpans(right, layout, ctx, "new"), ...textSpans(right.text, block.language, layout.text, ctx)];

    // **Each side carries its own background**, and the row carries none. A paired
    // row changed on both sides in different directions, so one colour across it
    // would claim the wrong thing on one half — and an unpaired add came out with
    // its whole row green, asserting that the blank left side had gained the line
    // too. That was visible in a frame and in no assertion.
    out.push(
      line(
        [
          ...dress(padTo(leftSpans, layout), left === undefined ? "context" : "remove", ctx),
          { text: SEPARATOR },
          ...dress(padTo(rightSpans, layout), right === undefined ? "context" : "add", ctx),
        ],
        "context",
        layout,
        ctx,
      ),
    );
  }

  return out;
}

/** Pad one side to its full column width, so the separator lands in one place. */
function padTo(spans: readonly Span[], layout: PatchLayout): readonly Span[] {
  const used = spans.reduce((n, s) => n + s.text.length, 0); // cells-ok — plain text, padded by width
  const short = layout.gutter + layout.text - used;
  return short <= 0 ? spans : [...spans, { text: " ".repeat(short) }];
}

/** A hunk's changed lines, grouped into the runs split pairs and unified does not. */
function runsOf(lines: readonly Line[]): readonly (Line | Run)[] {
  const out: (Line | Run)[] = [];
  let removes: Line[] = [];
  let adds: Line[] = [];

  const flush = (): void => {
    if (removes.length > 0 || adds.length > 0) out.push({ removes, adds }); // cells-ok — line counts
    removes = [];
    adds = [];
  };

  for (const item of lines) {
    if (item.kind === "context") {
      flush();
      out.push(item);
      continue;
    }
    if (item.kind === "remove") removes.push(item);
    else adds.push(item);
  }
  flush();

  return out;
}

function hunkLines(hunk: Hunk, block: Patch, layout: PatchLayout, ctx: RenderContext): readonly string[] {
  const out: string[] = [];

  if (isCollapsed(hunk.collapsedBefore)) {
    out.push(line([{ text: collapseText(hunk.collapsedBefore as number, ctx.capabilities) }], "context", layout, ctx));
  }

  out.push(line([{ text: hunk.header }], "context", layout, ctx));

  if (layout.layout === "unified") {
    for (const item of hunk.lines) out.push(unifiedRow(item, block, layout, ctx));
    return out;
  }

  for (const group of runsOf(hunk.lines)) {
    if ("kind" in group) {
      // A context line is one row in both layouts, and in split it is the same text
      // on both sides — which is what makes the eye track across the separator.
      out.push(
        line(
          [
            ...padTo(
              [...gutterSpans(group, layout, ctx, "old"), ...textSpans(group.text, block.language, layout.text, ctx)],
              layout,
            ),
            { text: SEPARATOR },
            ...gutterSpans(group, layout, ctx, "new"),
            ...textSpans(group.text, block.language, layout.text, ctx),
          ],
          "context",
          layout,
          ctx,
        ),
      );
      continue;
    }
    out.push(...splitRows(group, block, layout, ctx));
  }

  return out;
}

export const patchDefinition: BlockDefinition<Patch> = {
  kind: "patch",

  // Exact at every width, constant within a layout, and it never tokenises (I3).
  // `collapsedBefore` is a field, so measuring a collapsed region reads it rather
  // than deriving anything — which is what keeps this cheap enough for C14 to call
  // per block per frame.
  measure: (block: Patch, width: number): number => atLeastOne(patchHeight(block, normaliseWidth(width))),

  /**
   * C09 I25 — rows `[from, to)`, as a smaller `patch` plus leading slack.
   *
   * **The kind F134 was filed about, and the half the pin does not fix.** The
   * transcript path renders a patch whole at every scroll position: opening a
   * 5,000-line diff is 3.7 s and each drag step 3.2 s, against `logs`'s 85.9 ms
   * and 8.4 ms measured under identical load.
   *
   * `skipRows` carries the path header and any hunk header the range does not
   * contain — forced by the block shape (C25 I18), so they are slack rather
   * than a budget the caller never asked to spend. The gutter travels pinned
   * (C25 I21a), which is what stops the window narrowing it from its own slice.
   */
  window: (block: Patch, width: number, from: number, to: number) =>
    windowRows(block, normaliseWidth(width), from, to),

  render(block: Patch, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const layout: Layout = layoutFor(block, width);
    const columns = patchLayout(block, width, layout);

    const out: string[] = [header(block, columns, ctx)];
    for (const hunk of block.hunks) out.push(...hunkLines(hunk, block, columns, ctx));

    // The tail, below everything (C04 §3). The same row a `collapsedBefore` draws,
    // from the block's field rather than a hunk's — which is why `collapseText` takes
    // a count and not a hunk.
    if (isCollapsed(block.collapsedAfter)) {
      out.push(
        line([{ text: collapseText(block.collapsedAfter as number, ctx.capabilities) }], "context", columns, ctx),
      );
    }

    return rows(out);
  },
};

/** Re-exported for the suite: the arithmetic and the drawing must agree (I1). */
export { hunkRows, patchHeight };
