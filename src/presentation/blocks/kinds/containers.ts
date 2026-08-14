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
import type { Block, Group, MeasureFn, Panel } from "../../../data/viewmodel/index.js";
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
    const fill = Math.max(0, inner - cells(titlePart));

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
    const footerFill = Math.max(0, inner - cells(footerPart));
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
