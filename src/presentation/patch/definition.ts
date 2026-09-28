/**
 * C25 — the patch renderer, registered rather than privileged.
 *
 * The eighteenth kind and still the last one C09 does not ship -- `scroll`
 * arrived among the defaults, so the ordinal moved and the claim after it did
 * not. `patchDefinition` goes
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
import { NO_SPAN } from "../../data/viewmodel/index.js";
import { rows } from "../blocks/paint.js";
import { cells } from "../text.js";
import { atLeastOne, changedRuns, normaliseWidth, type ChangedRun } from "../../data/viewmodel/index.js";
import { capOf, foldPatch, shownBlock } from "./cap.js";
import { collapseText, moreText } from "./collapse.js";
import { hunkRows, isCollapsed, layoutFor, patchHeight, type Layout } from "./height.js";
import { planFrom, windowRows } from "./window.js";
import { blankSide, dress, gutterSpans, line, REST, textSpans, type Mark } from "./lines.js";
import { lineId, patchElements } from "./elements.js";
import { patchLayout, type PatchLayout } from "./layout.js";
import type { Hunk, Patch } from "../../data/viewmodel/index.js";
import type { Span } from "../blocks/paint.js";
import type { BlockDefinition, RenderContext, Rendered } from "../blocks/types.js";

type Line = Hunk["lines"][number];

/** What focus says about each line, asked once per line in drawing order (I25). */
type MarkOf = (line: Line) => Mark;

/**
 * The marks for one render (C25 I25, §3d).
 *
 * **The extent is filtered by its own block id, never gated on the head's** —
 * a selection whose head sits in a sibling block still names lines here, which
 * is C11 I14's T6.17 lesson. **Claimed in drawing order**, the order
 * `patchElements` places them in, so a repeated id marks the one line that
 * declared it and not both (I24).
 */
function marksFor(block: Patch, ctx: RenderContext): MarkOf {
  const focus = ctx.focus;
  if (focus === null) return () => REST;
  const head = focus.blockId === block.id ? focus.rowId : null;
  const selected = new Set((focus.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId));
  if (head === null && selected.size === 0) return () => REST;
  const claimed = new Set<string>();
  return (item) => {
    const id = lineId(item);
    if (id === null || claimed.has(id)) return REST;
    claimed.add(id);
    const isSelected = selected.has(id);
    const isHead = id === head;
    return isSelected || isHead ? { selected: isSelected, head: isHead } : REST;
  };
}

/** The one cell split spends on telling the two halves apart. */
const SEPARATOR = "\u2502";

/**
 * A run of consecutive changed lines, and the rows it pairs into. **C04's
 * `changedRuns` and not a grouping of this file's own** (C25 I10): the builder's
 * intra-line diff pairs the *n*th remove with the *n*th add of the same run, so
 * the two must read one grouping or the underline on a split row's left half
 * describes a change on some other row.
 */
type Run = ChangedRun;

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
  const trail = Math.max(0, layout.width - cells(lead, ctx.capabilities.ambiguousWidth));
  const spans: Span[] = [{ text: lead }, { text: rule.repeat(trail) }];
  return line(spans, "context", layout, ctx);
}

/** Unified: both number columns, then the marker, then the text. */
function unifiedRow(item: Line, block: Patch, layout: PatchLayout, ctx: RenderContext, mark: Mark): string {
  return line(
    [
      ...gutterSpans(item, layout, ctx, undefined, mark),
      ...textSpans(item.text, block.language, layout.text, ctx, item.spans, item.kind, mark),
    ],
    item.kind,
    layout,
    ctx,
    mark,
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
function splitRows(run: Run, block: Patch, layout: PatchLayout, ctx: RenderContext, markOf: MarkOf): readonly string[] {
  const height = Math.max(run.removes.length, run.adds.length); // cells-ok — a row count
  const out: string[] = [];

  for (let i = 0; i < height; i += 1) {
    const left = run.removes[i];
    const right = run.adds[i];
    // Left before right, as `patchElements` places them.
    const leftMark = left === undefined ? REST : markOf(left);
    const rightMark = right === undefined ? REST : markOf(right);

    const leftSpans =
      left === undefined
        ? blankSide(layout)
        : [
            ...gutterSpans(left, layout, ctx, "old", leftMark),
            ...textSpans(left.text, block.language, layout.text, ctx, left.spans, left.kind, leftMark),
          ];
    const rightSpans =
      right === undefined
        ? blankSide(layout)
        : [
            ...gutterSpans(right, layout, ctx, "new", rightMark),
            ...textSpans(right.text, block.language, layout.text, ctx, right.spans, right.kind, rightMark),
          ];

    // **Each side carries its own background**, and the row carries none. A paired
    // row changed on both sides in different directions, so one colour across it
    // would claim the wrong thing on one half — and an unpaired add came out with
    // its whole row green, asserting that the blank left side had gained the line
    // too. That was visible in a frame and in no assertion.
    out.push(
      line(
        [
          ...dress(padTo(leftSpans, layout), left === undefined ? "context" : "remove", ctx, leftMark),
          { text: SEPARATOR },
          ...dress(padTo(rightSpans, layout), right === undefined ? "context" : "add", ctx, rightMark),
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

function hunkLines(hunk: Hunk, block: Patch, layout: PatchLayout, ctx: RenderContext, markOf: MarkOf): readonly string[] {
  const out: string[] = [];

  if (isCollapsed(hunk.collapsedBefore)) {
    out.push(line([{ text: collapseText(hunk.collapsedBefore as number, ctx.capabilities) }], "context", layout, ctx));
  }

  out.push(line([{ text: hunk.header }], "context", layout, ctx));

  if (layout.layout === "unified") {
    for (const item of hunk.lines) out.push(unifiedRow(item, block, layout, ctx, markOf(item)));
    return out;
  }

  for (const group of changedRuns(hunk.lines)) {
    if ("kind" in group) {
      // A context line is one row in both layouts, and in split it is the same text
      // on both sides — which is what makes the eye track across the separator.
      // One element across the row (I24), so one mark and one ground for it.
      const mark = markOf(group);
      out.push(
        line(
          [
            ...padTo(
              [
                ...gutterSpans(group, layout, ctx, "old", mark),
                ...textSpans(group.text, block.language, layout.text, ctx, undefined, "context", mark),
              ],
              layout,
            ),
            { text: SEPARATOR },
            ...gutterSpans(group, layout, ctx, "new", mark),
            ...textSpans(group.text, block.language, layout.text, ctx, undefined, "context", mark),
          ],
          "context",
          layout,
          ctx,
          mark,
        ),
      );
      continue;
    }
    out.push(...splitRows(group, block, layout, ctx, markOf));
  }

  return out;
}

export const patchDefinition: BlockDefinition<Patch> = {
  kind: "patch",

  // §7a — *a patch as unified diff rather than the rendered two-column view*
  // (C09 I86, `R-SEL-004`). The rule names the hazard exactly: `layout: "split"`
  // is a rendering, and a copy taken from it is two half-lines per line and
  // pastes as nothing anyone can apply. So the hunks, in their own form, with
  // the marker each line already is.
  copy: (block) =>
    [
      `--- a/${block.path}`,
      `+++ b/${block.path}`,
      ...block.hunks.flatMap((h) => [
        h.header,
        ...h.lines.map((l) => `${l.kind === "add" ? "+" : l.kind === "remove" ? "-" : " "}${l.text}`),
      ]),
    ].join("\n"),

  // C25 I24, §3d — every numbered line, where `render` draws it.
  elements: (block: Patch, width: number) => patchElements(block, width),

  // C09 I124, C25 I14 — `expanded` toggled where a `cap` withholds hunks.
  fold: foldPatch,

  // Exact at every width, constant within a layout, and it never tokenises (I3).
  // `collapsedBefore` is a field, so measuring a collapsed region reads it rather
  // than deriving anything — which is what keeps this cheap enough for C14 to call
  // per block per frame.
  //
  // **The cap is read here and never a viewport** (C25 I14, D12): capped, the
  // admitted hunks and the marker row; expanded or uncapped, the whole block.
  measure: (block: Patch, width: number): number => {
    const w = normaliseWidth(width);
    const capped = capOf(block, w);
    return atLeastOne(capped === null ? patchHeight(block, w) : patchHeight(shownBlock(block, capped), w) + 1);
  },

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
  window: (block: Patch, width: number, from: number, to: number, _measure, scratch) => {
    const w = normaliseWidth(width);
    const capped = capOf(block, w);
    // **The plan from the caller's scratch** (I22, C09 I76): derived once per
    // block and width and read back at every window after — F1191 measured
    // the derivation at 2.2 ms a frame beside a 20,000-line patch.
    if (capped === null) return windowRows(block, w, from, to, planFrom(scratch, block, w));
    // **Capped (C25 I14): a range above the marker is a window of the body,
    // and one reaching it is the whole capped form with its head as slack.**
    // The body is an ordinary patch — its gutter pinned from the block — so
    // `windowRows` takes it unchanged. The marker is not a row that model
    // knows, and a piece carrying it has to be the block itself; the cost is
    // the capped form, which is the cap's rows and no more. C09 I26's equality
    // holds either way: the range reaching the marker ends at the last row.
    const body = shownBlock(block, capped);
    const bodyRows = patchHeight(body, w);
    if (to > bodyRows) return Object.freeze({ block, skipRows: Math.max(0, Math.trunc(from)), dropRows: 0 });
    return windowRows(body, w, from, to);
  },

  render(whole: Patch, ctx: RenderContext): Rendered {
    const width = normaliseWidth(ctx.width);
    // **The capped form draws its body and then its marker** (C25 I14): the
    // body is an ordinary patch, so everything below reads it unchanged and the
    // marker row is the one addition — measured by `measure` from the same
    // `capOf`, which is what keeps the two agreeing.
    const capped = capOf(whole, width);
    const block = capped === null ? whole : shownBlock(whole, capped);
    const probe = ctx.probe;
    // **F134's kind, and the split that says which half.** A 5,000-line diff
    // takes 3.7 s to open against `logs`'s 85.9 ms under identical load. The
    // layout is a function of the block and the width; the lines are per hunk
    // line and include the intra-line span work. One figure could not say which
    // of the two the seconds were in.
    let columns;
    {
      using _l = probe?.span("patch.layout") ?? NO_SPAN;
      const layout: Layout = layoutFor(block, width);
      columns = patchLayout(block, width, layout);
    }
    if (probe?.on === true) {
      probe.gauge("patch.hunks", block.hunks.length); // cells-ok — a count of items, not a display width
      probe.gauge(
        "patch.lines",
        block.hunks.reduce((n, h) => n + h.lines.length, 0), // cells-ok — a line count
      );
    }
    using _lines = probe?.span("patch.lines") ?? NO_SPAN;

    const out: string[] = [header(block, columns, ctx)];
    const markOf = marksFor(block, ctx);
    for (const hunk of block.hunks) out.push(...hunkLines(hunk, block, columns, ctx, markOf));

    // The tail, below everything (C04 §3). The same row a `collapsedBefore` draws,
    // from the block's field rather than a hunk's — which is why `collapseText` takes
    // a count and not a hunk.
    if (isCollapsed(block.collapsedAfter)) {
      out.push(
        line([{ text: collapseText(block.collapsedAfter as number, ctx.capabilities) }], "context", columns, ctx),
      );
    }

    // The cap's marker, in the tail's place (C25 I14): the body carries no
    // tail, because the tail sits below hunks this form does not draw.
    if (capped !== null) {
      out.push(line([{ text: moreText(capped.dropped, ctx.capabilities) }], "context", columns, ctx));
    }

    return rows(out);
  },
};

/** Re-exported for the suite: the arithmetic and the drawing must agree (I1). */
export { hunkRows, patchHeight };
