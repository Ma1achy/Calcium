/**
 * `panel` and `group` — the two kinds that measure children whose kind they do
 * not know.
 *
 * This is A02 Seam 1 in both halves. The registry passes itself as
 * `measureChild` and as `ctx.renderChild`, so neither kind imports the registry
 * (I7) and measurement stays pure.
 *
 * **The widths are C04's, not this file's.** `childWidths` is shared with the
 * measurement contract precisely so a container cannot invent one: C11 measured
 * its detail at `w - 2` while nothing said so, and a second component reading
 * the same paragraph and writing `w - 1` is a drift that only shows once a child
 * wraps (C04 §3).
 */
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import {
  atLeastOne,
  childWidths,
  insetWidth,
  normaliseWidth,
  placeable,
  ROW_GUTTER,
  sequenceHeight,
} from "../../../data/viewmodel/index.js";
import type { Block, Group, MeasureFn, Mosaic, Panel, Scroll } from "../../../data/viewmodel/index.js";
import { mosaicRects, parseAreas } from "../../../data/viewmodel/index.js";
import type { NavElement } from "../types.js";
import { cells, stripControl, truncate } from "../../text.js";
import { glyphFor, glyphs } from "../glyphs.js";
import { clampSpans, paint, tone } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";

/** A container's own height, over children measured at the width it gives them. */
function childHeights(
  children: readonly Block[],
  widths: readonly number[],
  measureChild: MeasureFn,
): readonly number[] {
  return children.map((child, index) => measureChild(child, widths[index] ?? 1));
}

// --- panel -----------------------------------------------------------------

export const panelDefinition: BlockDefinition<Panel> = {
  kind: "panel",

  measure(block: Panel, width: number, measureChild: MeasureFn): number {
    // A panel's children are a sequence, so `gapBefore` applies inside a panel
    // exactly as it does at a document's top level (C04 §3a).
    const total = sequenceHeight(block.children, insetWidth(width), measureChild);
    // The border, one row each side. An empty panel is still two rows: the
    // border is content, unlike an empty group (C04 I17).
    return atLeastOne(total) + 2;
  },

  render(block: Panel, ctx: RenderContext): ReactElement {
    const g = glyphs(ctx.capabilities);
    const width = normaliseWidth(ctx.width);
    const inner = insetWidth(width);
    const dim = tone("dim", ctx.theme, ctx.capabilities);

    // The title lives in the top border — `┌ cluster ─────┐` (S13). That is why
    // the frame is drawn here rather than delegated to a box-drawing option:
    // no layout engine puts a title in a border.
    // One helper for both rails, because they are the same construction
    // mirrored — and two copies would be two places for the fill arithmetic to
    // drift, which is the arithmetic a border that does not close reports.
    const railPart = (text: string | undefined): string => {
      const shown = truncate(stripControl(text ?? ""), Math.max(0, inner - 3), ctx.capabilities);
      return shown === "" ? "" : ` ${shown} `;
    };

    // **The `live` slot, reachable at last** (C04 I39, F18). It rides in the
    // title's own text, so the fill arithmetic below is untouched and a panel is
    // still children + 2 — and it comes through `glyphFor`, so it is `|` under
    // ASCII rather than a `▌` an app wrote into its title and could not degrade.
    const titlePart = railPart(
      block.live === true
        ? `${glyphFor("live", ctx.capabilities)} ${stripControl(block.title)}`.trimEnd()
        : block.title,
    );
    const fill = Math.max(0, inner - cells(titlePart, ctx.capabilities.ambiguousWidth));

    const top = paint(
      clampSpans(
        [
          { text: g.topLeft, style: dim },
          { text: titlePart, style: tone("accent", ctx.theme, ctx.capabilities) },
          { text: g.horizontal.repeat(fill), style: dim },
          { text: g.topRight, style: dim },
        ],
        width,
        ctx.capabilities,
      ),
    );
    // **`footer` is text in a row that is drawn anyway** (C04 §3), which is why
    // `measure` is untouched: a panel is children + 2 with or without it. S12 §2
    // and S13 §2 both put a pushed view's keymap here, and neither can use the
    // frame's footer — a pushed view leaves header and footer alone (C15 T4.4).
    const footerPart = railPart(block.footer);
    const footerFill = Math.max(0, inner - cells(footerPart, ctx.capabilities.ambiguousWidth));
    const bottom = paint(
      clampSpans(
        [
          { text: g.bottomLeft, style: dim },
          { text: footerPart, style: tone("accent", ctx.theme, ctx.capabilities) },
          { text: g.horizontal.repeat(footerFill), style: dim },
          { text: g.bottomRight, style: dim },
        ],
        width,
        ctx.capabilities,
      ),
    );

    // An empty panel is three rows, not two: the border is content, and
    // `atLeastOne` floors the inside at one row (C04 I17). The blank row has to
    // be drawn, or a panel with nothing in it renders shorter than it measures
    // — which is the empty-container case arriving through the one kind that
    // is *not* an empty container.
    const inside =
      block.children.length === 0 // cells-ok
        ? [createElement(Text, { key: "empty" }, " ")]
        : block.children.flatMap((child, index) => {
            const drawn = createElement(
              Box,
              { key: child.id === "" ? String(index) : child.id },
              ctx.renderChild(child, inner),
            );
            return child.gapBefore === true
              ? [createElement(Text, { key: `gap-${index}` }, " "), drawn]
              : [drawn];
          });

    const body = createElement(
      Box,
      { key: "children", flexDirection: "column", width: inner },
      inside,
    );

    // The border column is as tall as the children *measure*. If a child's two
    // halves disagree, the frame draws a border that does not close — which is
    // the one place an I1 violation is visible in the frame rather than only in
    // the viewport's drift, six screenfuls later.
    const total = sequenceHeight(block.children, inner, ctx.measureChild);
    const side = paint([
      { text: Array.from({ length: Math.max(1, total) }, () => g.vertical).join("\n"), style: dim },
    ]);

    // Below three columns there is no room for two borders and a column of
    // content: `insetWidth` floors the inside at one, so sides plus inside is
    // three whatever the width. The sides are dropped rather than the content,
    // and the children keep the width they were *measured* at — rendering them
    // wider to fill the gap would change their height and break I1 to save a
    // border nobody can see.
    const rowsOfBody =
      width < 3
        ? [body]
        : [
            createElement(Text, { key: "left" }, side),
            body,
            createElement(Text, { key: "right" }, side),
          ];

    return createElement(
      Box,
      { flexDirection: "column", width },
      createElement(Text, { key: "top" }, top),
      createElement(Box, { key: "body", flexDirection: "row" }, rowsOfBody),
      createElement(Text, { key: "bottom" }, bottom),
    );
  },
};

// --- group -----------------------------------------------------------------

/**
 * C04's vocabulary to Ink's, **down the row's height only** (C04 I45).
 *
 * There is no horizontal table because there is no horizontal axis: every
 * renderer fits its output to the width it is handed, so a child fills its
 * allocation and has nothing to be placed within. Heights are measurable and
 * widths are not.
 */
const DOWN = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
} as const;

// --- scroll -----------------------------------------------------------------

/**
 * The child row ranges, in **content** coordinates (C04 §3c cell 8, C26 I4).
 *
 * Content and not box, and the exception is forced: clipping to what is visible
 * would make `elements` depend on the offset, which C26 I3 refuses. The offset
 * is the one map from these rows to drawn rows.
 */
function childRanges(
  block: Scroll,
  width: number,
  measureChild: MeasureFn,
): readonly Readonly<{ child: Block; from: number; to: number }>[] {
  const out: { child: Block; from: number; to: number }[] = [];
  const widths = childWidths(block, width);
  let at = 0; // cells-ok — a row cursor, not a width
  for (const [i, child] of block.children.entries()) {
    const height = measureChild(child, widths[i] ?? 1);
    out.push({ child, from: at, to: at + height });
    at += height;
  }
  return out;
}

/** The content's total height, which decides the residue row (C04 I49). */
function contentHeight(block: Scroll, width: number, measureChild: MeasureFn): number {
  const ranges = childRanges(block, width, measureChild);
  const last = ranges.at(-1); // cells-ok — a child count, not a width
  return last === undefined ? 0 : last.to;
}

/**
 * The offset, clamped at read (C04 I48, §3c cell 4).
 *
 * **Never corrected at write.** A store fixed up on every patch is one that
 * accumulates, which C23 I47 forbids of view state — so a stale value is a
 * number this function bounds and nothing else ever sees.
 */
function offsetOf(block: Scroll, ctx: RenderContext, content: number): number {
  const held = ctx.scrollOffsets?.[block.id] ?? 0;
  const most = Math.max(0, content - block.height);
  return Math.min(Math.max(0, Math.trunc(held)), most);
}

/**
 * A child's source text, for C26 I17's semantic copy.
 *
 * **The source and never the rendering**: no width is consulted, so a truncated
 * cell and a dropped column cannot reach it and the text is the same at every
 * terminal size. A kind whose source this cannot express contributes nothing
 * rather than its painted rows, which is the invariant's own direction — and
 * `table` is deliberately absent, because C11 already declares a richer `copy`
 * per row and a second answer here would be two sources for one fact.
 */
function copyTextOf(child: Block): string {
  switch (child.kind) {
    case "raw":
    case "notice":
    case "tip":
    case "code":
      return child.text;
    case "logs":
      return child.lines.map((l) => l.message).join("\n");
    case "scroll":
      return child.children
        .map(copyTextOf)
        .filter((t) => t !== "")
        .join("\n");
    default:
      return "";
  }
}

export const scrollDefinition: BlockDefinition<Scroll> = {
  kind: "scroll",

  /**
   * `height`, plus the residue row where the content cannot fit (C04 I47, C04 I49).
   *
   * **The condition is on `(block, width)` and never on the offset**, which is
   * what keeps the box the same size as the reader scrolls — a content area
   * that shrank when residue appeared would jitter, and `measure` would depend
   * on view state.
   */
  measure(block: Scroll, width: number, measureChild: MeasureFn): number {
    const w = normaliseWidth(width);
    return block.height + (contentHeight(block, w, measureChild) > block.height ? 1 : 0);
  },

  /** One per child, at block level — which is what makes C04 I47's refusal expressible. */
  elements(block: Scroll, width: number, measureChild: MeasureFn): readonly NavElement[] {
    const w = normaliseWidth(width);
    return Object.freeze(
      childRanges(block, w, measureChild).map((r) =>
        Object.freeze({
          id: r.child.id,
          level: "block" as const,
          rows: Object.freeze({ from: r.from, to: r.to }),
          cols: Object.freeze({ from: 0, to: w }),
          // **A child with no `copy` makes `y` a silent no-op** (C26 I17).
          // `copyElement` filters undefined and empty out and returns early on
          // an empty result, so a container whose elements carried none was a
          // key that did nothing and said nothing — the empty-block class. `y`
          // on a container has an obvious meaning and it was unimplemented
          // rather than refused.
          copy: copyTextOf(r.child),
        }),
      ),
    );
  },

  /**
   * **No `window`, and the sweep is what said so** (C04 §3c cell 1).
   *
   * The walk ruled that two windows compose — the transcript's slicing the box
   * and the offset choosing what fills it — and the build found the composition
   * is not this kind's to make. `window` must return a block that *measures the
   * slice*, and a bounded region's height is declared: it cannot measure less
   * without becoming a different box. Sixteen rows of the conformance sweep say
   * it in one line each.
   *
   * **And nothing is lost, because the reason `window` exists does not apply
   * here.** It bounds the first frame of a kind that can be enormous — `logs`,
   * `patch` — and a scroll is at most `height + 1` rows by construction.
   * `windowSequence` keeps a kind declaring none whole and pays for it out of
   * `skipRows`, which is exactly right for a block that is already small.
   *
   * **The correction this forces is in the classification, not here.** C26 §4a's
   * 2 × 2 sorted kinds by whether they declare `BlockDefinition.window` and read
   * that as *the container has a viewport*. Those are two senses of one word: a
   * scroll has a viewport, in the offset, and needs no `window` at all. So the
   * cell that was said to be empty still is, and this kind is not its inhabitant.
   */

  render(block: Scroll, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const content = contentHeight(block, width, ctx.measureChild);
    const offset = offsetOf(block, ctx, content);
    const g = glyphs(ctx.capabilities);

    const ranges = childRanges(block, width, ctx.measureChild);
    const shown = ranges.filter((r) => r.to > offset && r.from < offset + block.height);

    const children: ReactElement[] = shown.map((r) =>
      createElement(
        Box,
        { key: r.child.id, width, flexDirection: "column" },
        ctx.renderChild(r.child, width),
      ),
    );

    const residue: ReactElement[] = [];
    // **The residue, both directions** (C04 I49). A settled container keeps the
    // offset it had, so content is hidden above as well as below — and a
    // bounded region that says neither is the empty-block class (F123).
    if (content > block.height) {
      const above = offset;
      const below = Math.max(0, content - block.height - offset);
      const dim = tone("dim", ctx.theme, ctx.capabilities);
      // **The separator is a comma and not a middle dot.** The first version
      // used one and C09 T4.4 caught it under unicode:"ascii" -- a literal
      // non-ASCII character in the very row written to keep the *mark* out of
      // the source. F6's class, one token to the right of where it was watched
      // for, and a comma needs no slot because it is the same everywhere.
      const text = `${g.residue} ${String(above)} above, ${String(below)} below`;
      residue.push(
        createElement(
          Text,
          { key: "residue" },
          paint(clampSpans([{ text: truncate(text, width, ctx.capabilities), style: dim }], width, ctx.capabilities)),
        ),
      );
    }

    // **The box states its height, and the sentence that said otherwise was
    // correct and wrong.** It read: *`measure` already told the caller how tall
    // this is, and stating it here would be a second record of one number.* True
    // about records and false about this one — C25 I1 is that measure equals the
    // rendered row count, so the two are not two records of a number, they are
    // the contract. Without it a box of two holding one row **drew one row**, and
    // C14 virtualises on the measured height.
    //
    // Found by a builder-coverage row, not by any of this kind's own eighteen:
    // every fixture had content at least as tall as the box, so *the box pads*
    // and *the box is exactly its children* agreed everywhere they were asked.
    //
    // `overflowY: "hidden"` is the other half and the same invariant: a child
    // taller than the box drew past it in the frame while `measure` still said
    // `height`. The clip is top-aligned at the first shown child, which is where
    // partial-child scrolling is deliberately not attempted — the offset selects
    // children, and a partial row would need a per-child skip C04 §3c has not
    // ruled.
    // **Padded with blank rows and not with a fixed-height box, and the frame is
    // why.** `height` on the Box does pad, and it also clips **bottom-anchored**:
    // a child of five rows in a box of two drew rows three and four. Two rows
    // either way, `measure` agreed, and the box was describing a different
    // document than the one it holds — which is the whole argument for reading
    // the frame rather than the numbers. The mutation removing the clip survived
    // because both readings drew two rows; strengthening the row to ask *which*
    // two is what said so.
    //
    // **So a child taller than the box is still drawn whole and C25 I1 is still
    // false for that one case** — named in T2.28b rather than replaced by a
    // frame showing the wrong rows. §3c trace 1 rules it *aligns to its top*,
    // and taking a child's top rows needs a windowing seam `RenderContext` does
    // not have: it offers `measureChild` and `renderChild` and nothing that
    // slices. A ruling naming an operation the layer below lacks — C23 §8a A4's
    // class, and the remedy is a seam rather than a clip.
    const drawn = shown.reduce((n, r) => n + ctx.measureChild(r.child, width), 0);
    const pads = Array.from(
      { length: Math.max(0, block.height - drawn) }, // cells-ok — a row count, not a width
      (_unused, i) => createElement(Text, { key: `pad-${String(i)}` }, " "),
    );

    return createElement(Box, { flexDirection: "column", width }, ...children, ...pads, ...residue);
  },
};

// --- mosaic ------------------------------------------------------------------

/**
 * A declared grid of absolutely positioned cells (C04 I71, C04 I72 · C09 I35).
 *
 * **Every cell bounds its own child, and that takes two properties rather than
 * one.** `overflow: "hidden"` alone changes nothing: a relative child in a cell
 * shorter than itself is **squashed by flex before it can overflow**, so it
 * draws rows out of its own middle — measured at `row2, row5` of six — and a
 * child that was squashed to fit never overflows for the clip to catch.
 * `flexShrink: 0` is what gives the clip something to do.
 *
 * **The row count agrees in all three arms**, so the frame is the only thing
 * that separates them, and the failure is worst on the block that most needs
 * reading: a bare cell drew an error box's fragment above its bottom border,
 * which looks exactly like a complete box.
 *
 * **`overflowX` on the container is the other axis and a separate mechanism.**
 * An absolutely positioned child is not constrained by its parent's width, a
 * cell's own overflow does not reach the frame, and C09 I1 is about rows — so
 * without this a mosaic at width 40 draws 60 cells with every count agreeing
 * (FINDINGS F244 §4).
 */
export const mosaicDefinition: BlockDefinition<Mosaic> = {
  kind: "mosaic",

  /**
   * `height`, at every width (C04 I71).
   *
   * Declared rather than derived, which is roadmap 38's resolve-then-measure
   * and what makes the grid's arithmetic total: the rows divide a budget that
   * is known before anything is laid out.
   */
  measure(block: Mosaic): number {
    return Math.max(1, block.height); // cells-ok — a row count
  },

  /**
   * One per child, at block level — `scroll`'s correspondence and its reason.
   *
   * The rectangle is the cell's, so a pointer landing inside a cell addresses
   * the child drawn there rather than the row it happens to share with a
   * neighbouring cell — which is the whole difference between a grid and a
   * sequence.
   */
  elements(block: Mosaic, width: number): readonly NavElement[] {
    const parsed = parseAreas(block.areas);
    if (!parsed.ok) return Object.freeze([]);
    const rects = mosaicRects(parsed.grid, normaliseWidth(width), block.height, block.columns, block.rows);
    return Object.freeze(
      block.children.flatMap((child, i) => {
        const rect = rects[i];
        if (rect === undefined) return [];
        return [
          Object.freeze({
            id: child.id,
            level: "block" as const,
            rows: Object.freeze({ from: rect.top, to: rect.top + rect.height }),
            cols: Object.freeze({ from: rect.left, to: rect.left + rect.width }),
            copy: copyTextOf(child),
          }),
        ];
      }),
    );
  },

  render(block: Mosaic, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const parsed = parseAreas(block.areas);
    // **A grid that does not parse is refused at both gates**, so this arm is
    // unreachable from a validated document and from `b.mosaic`. It draws an
    // empty box of the declared height rather than throwing, because a render
    // that throws costs the whole entry an error box for a fault two gates
    // already named.
    const rects = parsed.ok
      ? mosaicRects(parsed.grid, width, block.height, block.columns, block.rows)
      : [];

    const cellsDrawn = block.children.flatMap((child, i) => {
      const rect = rects[i];
      // **A cell with no room is not drawn** (C04 I72). `mosaicRects` clamps to
      // the region because the container's clip cannot be relied on: a cell that
      // clips its own child shadows the ancestor's clip rather than intersecting
      // it, so the geometry is the guarantee (I35).
      if (rect === undefined || rect.width < 1 || rect.height < 1) return [];
      return [
        createElement(
          Box,
          {
            key: child.id,
            position: "absolute" as const,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            overflow: "hidden" as const,
            flexDirection: "column" as const,
          },
          // **`flexShrink: 0` first, or the clip above has nothing to do** (I35).
          createElement(
            Box,
            { flexShrink: 0, flexDirection: "column" as const },
            ctx.renderChild(child, rect.width),
          ),
        ),
      ];
    });

    return createElement(
      Box,
      { width, height: Math.max(1, block.height), overflowX: "hidden" as const }, // cells-ok — a row count
      cellsDrawn,
    );
  },
};

export const groupDefinition: BlockDefinition<Group> = {
  kind: "group",

  measure(block: Group, width: number, measureChild: MeasureFn): number {
    const widths = childWidths(block, width);
    // A child that cannot be placed is measured by neither half (C04 §3).
    const placed = block.children.slice(0, placeable(block, width));
    const heights = childHeights(placed, widths, measureChild);

    // An empty container measures 0, and is the one legitimate zero: it is the
    // absence of content rather than empty content (C04 I17, T3.5).
    if (heights.length === 0) return 0; // cells-ok

    if (block.direction === "column") {
      // A column group is a sequence; a row group is not (C04 §3a). Children
      // side by side have no "before" to put a gap in, so the field is ignored
      // there rather than being an error — which is why the two branches do not
      // share this line.
      return atLeastOne(sequenceHeight(block.children, widths[0] ?? width, measureChild));
    }

    let tallest = 0;
    for (const height of heights) tallest = Math.max(tallest, height);
    return atLeastOne(tallest);
  },

  render(block: Group, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const widths = childWidths(block, width);

    const children = block.children
      .slice(0, placeable(block, width))
      .flatMap((child, index) => {
        // **One axis, and it is not a measurement** (C04 I45). The child's Box
        // is already the width the container computed and already stretches to
        // the row's height, so `justifyContent` places its lines down inside a
        // box that was sized before it was read. Absent is `top`, which is what
        // a row did before this existed.
        const align = block.align?.[index];
        const drawn = createElement(
          Box,
          {
            key: child.id === "" ? String(index) : child.id,
            width: widths[index] ?? 1,
            flexDirection: "column",
            // **No height is stated, and a dead guard is why that is written
            // down.** A first version passed the row's height here, reasoning
            // that `justifyContent` places content along a box's main axis and
            // a box with no height is as tall as its content. The reasoning is
            // sound and the premise is false: the row leaves `alignItems` at
            // its default stretch — for the reason given below — so every child
            // is already the row's height and the arithmetic changed nothing.
            // **It was added while diagnosing a consumer's failing frame that
            // turned out to be a stale `dist/`**, which is how a guard comes to
            // be justified by a sentence that is true and not about the
            // decision it is attached to.
            ...(align === undefined ? {} : { justifyContent: DOWN[align] }),
          },
          ctx.renderChild(child, widths[index] ?? 1),
        );
        return block.direction === "column" && child.gapBefore === true
          ? [createElement(Text, { key: `gap-${index}` }, " "), drawn]
          : [drawn];
      });

    // A `row` group takes the max of its children, so a short child leaves the
    // rest of its column blank rather than pulling the group up. `alignItems`
    // stays at its default stretch for exactly that reason.
    //
    // `overflowX: hidden` is the narrow-width case, and it is not cosmetic.
    // C04 \u00a73 floors a child's width at 1, so at a width too narrow to split —
    // two children at width 1 — the children and their gutter are wider than
    // the group. Clipping keeps the row inside the width it was measured at;
    // without it the terminal wraps the excess into a row nobody counted, which
    // is I1 broken by a case that only appears at the widths nobody looks at.
    // Height is unaffected: each child was laid out at its own width already.
    return createElement(
      Box,
      {
        flexDirection: block.direction === "row" ? "row" : "column",
        width,
        // `columnGap`, never `gap`. The shorthand sets the row gap too, and a
        // row gap on a flex row is a blank line above the children — one extra
        // row, present at every width and invisible until something counts.
        columnGap: block.direction === "row" ? ROW_GUTTER : 0,
        overflowX: "hidden",
      },
      children,
    );
  },
};
