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
import { NO_SPAN } from "../../../data/viewmodel/index.js";
import {
  childWidths,
  childGapOf,
  insetWidth,
  normaliseWidth,
  placeable,
  sequenceHeight,
} from "../../../data/viewmodel/index.js";
import type { Block, CopyFn, Group, MeasureFn, Mosaic, MosaicRect, Panel, Scroll, WidthFn } from "../../../data/viewmodel/index.js";
import { axesOf, groupPlacements, mosaicRects, parseAreas } from "../../../data/viewmodel/index.js";
import type { NavElement } from "../types.js";
import { cells, sliceCells, stripControl, truncate } from "../../text.js";
import { SPINNER_CELLS, glyphs, scrollbarSet, spinnerFrames } from "../glyphs.js";
import { scrollbarColumn } from "../scrollbar.js";
import { based, clampSpans, groundSequence, paint, rows, tone } from "../paint.js";
import { composeRow, fitRow, placeRows, rowCells, type Placed } from "../../rows.js";
import { layout, measure as solveHeight, type Box, type Size } from "../../layout/index.js";
import type { BlockDefinition, Rendered, RenderContext, Windowed } from "../types.js";
import { glyphTick } from "../ramp.js";

// **`rowsOfAll` stood here and is gone with the arm it gated.** It answered
// `null` when any child returned an element, and every container branched on
// that answer — which is what made it the seam C09 I73 was written at. Since
// F1209 narrowed `Rendered` to `readonly string[]` it was `rendered.map((r) => r)`:
// a gate with nothing to refuse, four callers deep, and a name still promising a
// decision. The four read their children's rows directly now.

/** A container's own height, over children measured at the width it gives them. */
// **`childHeights` stood here and is gone with the arm it served** (C29 1.3).
// It mapped a row's placed children onto `measureChild(child, widths[i])`, and
// the engine's pass 3 does exactly that from the leaf: a `paint` leaf's
// `measure` is called at the width pass 2 solved, so the map and the `tallest`
// loop over it are both C29 I2's *max across the axis*.

// --- panel -----------------------------------------------------------------

export const panelDefinition: BlockDefinition<Panel> = {
  kind: "panel",

  // §7a — the title, then the children (I86). The title is text a producer
  // wrote and the border is not, so the frame goes and the words stay. The
  // footer is dropped: it is where this component puts counts and hints it
  // computed, which is rendering by the same test the border fails.
  copy: (block, copyChild) =>
    [
      block.title,
      joinChildren(block.children, copyChild),
    ].filter((t) => t !== "").join("\n"),

  measure(block: Panel, width: number, measureChild: MeasureFn): number {
    // **The engine's** (C29 I12). A panel's children are a sequence, so
    // `gapBefore` applies inside a panel exactly as it does at a document's top
    // level (C04 §3a) — and the border is one row of padding each side, so
    // *an empty panel is still two rows* falls out of the shape.
    return solveHeight(panelMeasureBox(block, width, { kind: "grow" }, measureChild), normaliseWidth(width));
  },

  /**
   * C09 §2c — the widest child plus the border, or the title or footer plus
   * their furniture, whichever is wider. The furniture is five: `railPart`
   * truncates to `inner − 3` and wraps the text in a space each side, so a
   * title of `n` cells needs `n + 5` columns to draw untruncated with one
   * horizontal glyph beside it; a live title carries its glyph and a space.
   * Children are asked at the inset width they are rendered at.
   */
  width(block: Panel, width: number, widthChild: WidthFn): number {
    const w = normaliseWidth(width);
    // **The same box, asked the other question** (C29 I2): a `FIT` column's
    // natural width is the widest child, and the border is the padding round
    // it. The `widest` loop and the `+ BORDER_INSET` were those two facts
    // written as arithmetic.
    const framed = layout(panelMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;
    const rail = (text: string | undefined, live: boolean): number => {
      const shown = stripControl(text ?? "");
      if (shown === "") return 0;
      // **One cell for the spinner frame and one for its space** — a constant
      // rather than a lookup, and that is what makes `measure` capability-free
      // here: every frame of every set is one cell at both alphabets (T2.75,
      // T2.70), so the reservation cannot depend on which set is resolved. It
      // read `glyphCells("live") + 1` while a static rail held the slot.
      return cells(shown) + (live ? SPINNER_CELLS + 1 : 0) + 5; // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42), and narrow is the measurer's convention
    };
    return Math.max(
      1,
      Math.min(w, Math.max(framed, rail(block.title, block.live === true), rail(block.footer, false))),
    );
  },

  render(block: Panel, ctx: RenderContext): Rendered {
    // The child count, which is what a container's cost is proportional to and
    // what no duration states. Each child is its own node; this is how many.
    ctx.probe?.gauge("panel.children", block.children.length); // cells-ok — a count of items, not a display width
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

    // **A live region is marked by a spinner frame, not by a static rail**
    // (C04 I39, F18, R-GLY-003). It was `Glyph.live`'s `▌`, and M4 retires that
    // token for two reasons that are both the design's: the design carries no
    // static live mark — liveness is the spinner (§030) — and `▌` is the
    // design's selection rail and caret (§017), so a repository token stood on
    // a design character for a fact the design draws another way. Retiring it
    // also freed `|` for `Glyph.quote`'s rail, which `focus` had pushed off `>`.
    //
    // **The frame rides in the title's own text**, so the fill arithmetic below
    // is untouched and a panel is still children + 2. Every frame of every set
    // is one cell at both alphabets (T2.75, T2.70), so the title does not
    // change width as it animates and `measure` never sees the tick (I8).
    const frames = spinnerFrames(ctx.capabilities);
    const titlePart = railPart(
      block.live === true
        ? `${frames[glyphTick(ctx.tick, ctx.motion) % frames.length] ?? g.dotted} ${stripControl(block.title)}`.trimEnd() // cells-ok — a frame index
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
    const rendered = block.children.map((child) => ctx.renderChild(child, inner));
    const total = sequenceHeight(block.children, inner, ctx.measureChild);
    const side = paint([
      { text: Array.from({ length: Math.max(1, total) }, () => g.vertical).join("\n"), style: dim },
    ]);

    // **The rows arm** (C09 I73): the body's rows between the rails, each line
    // as Ink's grid would hold it — the rail's line at column 0, the body row
    // at column 1, the other rail at `1 + inner`. The rails are as tall as the
    // measured body and the body as tall as its rows; whichever is taller
    // leaves the other's column blank, as the row box does.
    const childRows = rendered;
    {
      const body: string[] = [];
      // **No gap row is pushed here, and that is 2a.** A child's spacing is its
      // own `padding` and is inside the rows `renderChild` returned (C09 I80),
      // so a container that added one would be the second author of it.
      block.children.forEach((_child, index) => {
        for (const row of childRows[index] ?? []) body.push(row);
      });
      // An empty body is one blank row, and the rail floor `Math.max(1, total)`
      // is what draws it: the height below is the rail's, so nothing is pushed
      // for it here — a push was, and the mutation pass showed it dead.
      const rail = side.split("\n");
      const height = Math.max(rail.length, body.length); // cells-ok — a row count
      const lines: string[] = [top];
      for (let y = 0; y < height; y += 1) { // cells-ok — a row index
        // **The body row cut to the inset** (F1211). A child answering a row
        // wider than the width it was given used to push the right rail into
        // its own columns, `composeRow` declined, and the panel fell back to
        // Ink — which **wrapped**, so the frame drew four rows where `measure`
        // committed three. The cut keeps the count and closes the border.
        const bodyRow = fitRow(body[y] ?? "", width < 3 ? width : inner);
        const railRow = rail[y] ?? "";
        lines.push(composeRow(
          width < 3
            ? [{ x: 0, row: bodyRow }]
            : [{ x: 0, row: railRow }, { x: 1, row: bodyRow }, { x: 1 + inner, row: railRow }],
        ));
      }
      lines.push(bottom);
      return lines;
    }
  },
};

// --- group -----------------------------------------------------------------

// The vertical axis used to be a table from `Valign` to Yoga's `justifyContent`,
// with a comment saying there was no horizontal table because there was no
// horizontal axis: every renderer fits its output to the width it is handed.
// That was true of the seam that existed — `measure(block, width) → height` —
// and C09 §2c's `width` is the seam it lacked (F817). Both axes are now
// `groupPlacements` in `measure.ts`, read here as margins and by the registry's
// element walk as offsets (C04 I103), because the two used to disagree (F816).

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
  const w = normaliseWidth(width);
  const solved = layout(scrollMeasureBox(block, w, measureChild), w);
  return block.children.map((child, i) => {
    // A child the engine did not place cannot happen — the box is built from
    // these children — and the fallback is the degenerate range rather than a
    // throw, because `elements` and `render` both walk this and a missing child
    // must cost nothing rather than take the frame down.
    const rect = solved.children[i]?.rect;
    const from = rect?.y ?? 0; // cells-ok — a row cursor, not a width
    return { child, from, to: from + (rect?.height ?? 0) };
  });
}

/**
 * A scroll's content as a C29 box (C29 §6) — **the column the offset scrolls**.
 *
 * `FIXED` at the full width, because a scroll insets nothing: its box is drawn
 * by bounding rows rather than by a border (C04 I49), which is the arm
 * `childWidths` carries for this kind and the reason it is not `insetWidth`'s.
 *
 * **Not `sequenceChildren`, and the omission is the rule.** C04 §3a's sequence
 * is a document's top level, a panel's children or a column group's children; a
 * scroll is none of the three and never counted a `gapBefore` row. Reaching for
 * the shared builder here would add a row to every scroll holding a gap child —
 * a frame moving because two shapes look alike.
 *
 * **The clip is not on this box.** The offset selects children in `render` and
 * an unsliceable child is still drawn whole (T2.28b, F855, F1215); C29 I15's
 * `clip` plus a negative offset is what that becomes when the render arm moves,
 * and putting it here now would bound a box nothing is yet cutting to.
 */
function scrollMeasureBox(block: Scroll, width: number, measureChild: MeasureFn): Box {
  return {
    id: "scroll\u00b7content",
    direction: "column",
    width: { kind: "fixed", n: normaliseWidth(width) },
    height: { kind: "fit" },
    align: { x: "stretch" },
    children: block.children.map((child, i) => ({
      id: `c${String(i)}`,
      children: {
        kind: "paint" as const,
        natural: 0,
        measure: (cw: number) => measureChild(child, cw),
        render: () => [],
      },
    })),
  };
}

/**
 * The rows the box gives its content: `height`, or **zero when collapsed**
 * (C04 I98). The residue row is chrome on top of this in both cases, which is
 * what makes a collapsed box *the residue row and nothing else* without a second
 * rule about what it draws.
 */
function interiorOf(block: Scroll): number {
  return block.collapsed === true ? 0 : block.height; // cells-ok — a row count
}

/** The content's total height, which decides the residue row (C04 I49). */
function contentHeight(block: Scroll, width: number, measureChild: MeasureFn): number {
  const ranges = childRanges(block, width, measureChild);
  const last = ranges.at(-1); // cells-ok — a child count, not a width
  return last === undefined ? 0 : last.to;
}

/**
 * Whether this box spends a column on a bar, and the width its content gets
 * (C09 I93, §7f, §021).
 *
 * **Measured at the full width, and re-measured one cell narrower only if it
 * overflowed.** The circularity to avoid is obvious once stated: a bar takes a
 * column, a narrower content can be taller, and taller content is what decides
 * whether there is a bar. Narrowing never *shortens* content, so overflow at
 * the full width implies overflow at the narrower one and the question is
 * settled in one step rather than at a fixed point nobody can read.
 *
 * **`measure` is unchanged by this** and that is deliberate: its answer turns
 * on `content > interior` at the full width, which is the same test that puts
 * the bar there. The re-measure can only grow the content, so the residue row
 * it decides does not move either.
 */
function barOf(
  block: Scroll,
  width: number,
  measureChild: MeasureFn,
): Readonly<{ contentWidth: number; content: number; bar: boolean }> {
  const interior = interiorOf(block);
  const full = contentHeight(block, width, measureChild);
  if (full <= interior) return { contentWidth: width, content: full, bar: false };
  // **A collapsed box has no interior for a bar to sit in**, and it draws the
  // residue row alone (C04 I98). Reserving the column there would narrow that
  // row's text for a bar that `scrollbarColumn` answers `null` for anyway.
  if (interior === 0) return { contentWidth: width, content: full, bar: false };
  // **A bar needs a column and something to sit beside it.** At a width of one
  // there is no room for both, and `max(1, width - 1)` drew a two-cell row at a
  // width of one — the overrun that wraps the alternate screen (C09 I1, F1211).
  // It is *a bar that cannot move is decoration* on the other axis: where the
  // column cannot be spent, nothing is drawn and the content keeps the width.
  if (width <= 1) return { contentWidth: width, content: full, bar: false };
  const narrow = width - 1; // cells-ok — a width less its bar
  return { contentWidth: narrow, content: contentHeight(block, narrow, measureChild), bar: true };
}

/**
 * The offset, clamped at read (C04 I48, §3c cell 4).
 *
 * **Never corrected at write.** A store fixed up on every patch is one that
 * accumulates, which C23 I47 forbids of view state — so a stale value is a
 * number this function bounds and nothing else ever sees.
 */
function offsetOf(block: Scroll, ctx: RenderContext, content: number): number {
  const interior = interiorOf(block);
  // **Collapsed, the offset is forced to zero** (C04 §3c S2): the residue row
  // then reads *+N more*, which is the fold's whole statement (C04 I104). A
  // collapsed follow box has nothing to follow.
  if (interior === 0) return 0;
  const most = Math.max(0, content - interior);
  const held = ctx.scrollOffsets?.[block.id];
  // **A follow box nobody has touched opens at its tail** (C04 I97). The field
  // is the initial preference; a held value — including the store's `∞`, which
  // the clamp below resolves — is the reader's, and wins.
  if (held === undefined) return block.follow === true ? most : 0;
  return Math.min(Math.max(0, Math.trunc(held)), most);
}

/**
 * A child's source text — **the registry's answer, not this file's** (§7a, I86).
 *
 * **It was a private switch here and it was wrong in a way that read as
 * deliberate.** The comment said *the source and never the rendering*, which is
 * true, and *a kind whose source this cannot express contributes nothing rather
 * than its painted rows*, which is the right direction — and it answered six
 * kinds and `""` for every other, so five of the seven kinds `R-SEL-004` names
 * copied blank. `table` was *deliberately absent, because C11 already declares a
 * richer `copy` per row and a second answer here would be two sources for one
 * fact*: a correct argument about sources and the wrong conclusion about
 * granularity. A row's copy and a table's are one source at two sizes.
 *
 * `null` is a kind that declines and is dropped; `""` would be a blank line, and
 * a blank line is the entry separator.
 */
/**
 * A child's `copy` as a spreadable member, or nothing (§7a, I86).
 *
 * `exactOptionalPropertyTypes` is what makes this a function rather than
 * `?? undefined`: the type says `copy?: string`, and *present and undefined* is
 * a third state it does not have. A declining child contributes no member.
 */
const copyOrNothing = (text: string | null): Readonly<{ copy?: string }> =>
  text === null || text === "" ? {} : { copy: text };

function joinChildren(children: readonly Block[], copyChild: CopyFn): string {
  return children
    .map(copyChild)
    .filter((t): t is string => t !== null && t !== "")
    .join("\n");
}

export const scrollDefinition: BlockDefinition<Scroll> = {
  kind: "scroll",

  // §7a — the children that answered, one newline apart (I86). **Not two**:
  // two is `R-SEL-004`'s entry separator and this is inside one entry. A child
  // that declines is dropped rather than joined as empty, which is the whole of
  // the omission ruling.
  copy: (block, copyChild) => joinChildren(block.children, copyChild),

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
    const interior = interiorOf(block);
    // Collapsed: `0 + 1`, because C04 I47 refuses an empty scroll so the content
    // is always taller than a zero interior. The residue row is unconditional
    // there *because* the interior is zero, not because C04 I49's condition changed.
    return interior + (contentHeight(block, w, measureChild) > interior ? 1 : 0);
  },

  /** One per child, at block level — which is what makes C04 I47's refusal expressible. */
  elements(block: Scroll, width: number, measureChild: MeasureFn, copyChild: CopyFn): readonly NavElement[] {
    const w = normaliseWidth(width);
    // **A block declaring a collapsed form carries the toggle on every element**
    // (C04 I98). Declared by presence: a scroll without the field has no fold
    // and no affordance. The target is the block, because `expand`'s dispatcher
    // searches rows first and blocks second (C04 §3c S5).
    const activate =
      block.collapsed === undefined
        ? {}
        : {
            activate: Object.freeze({
              kind: "expand" as const,
              label: block.collapsed ? "expand" : "collapse",
              target: block.id,
            }),
          };
    return Object.freeze(
      childRanges(block, w, measureChild).map((r) =>
        Object.freeze({
          id: r.child.id,
          level: "block" as const,
          rows: Object.freeze({ from: r.from, to: r.to }),
          cols: Object.freeze({ from: 0, to: w }),
          ...activate,
          // **A child with no `copy` makes `y` a silent no-op** (C26 I17).
          // `copyElement` filters undefined and empty out and returns early on
          // an empty result, so a container whose elements carried none was a
          // key that did nothing and said nothing — the empty-block class. `y`
          // on a container has an obvious meaning and it was unimplemented
          // rather than refused.
          ...copyOrNothing(copyChild(r.child)),
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
   * **The last sentence was true of the box and false of what it painted, for
   * as long as no child was taller than the box** (F855). `height + 1` is the
   * measure, and `render` drew every overlapping child whole — so a six-row box
   * over a thirty-line screen measured 7 and painted 32, and the residue row
   * went on counting against a window nobody had applied. The ruling above is
   * unchanged: this kind still declares no `window`, because a bounded region's
   * height is declared. What was missing is the window in the other direction —
   * a scroll is not sliced, and it must slice — and that is C09 I58's
   * `windowChild`, taken in `render` below.
   *
   * **The correction this forces is in the classification, not here.** C26 §4a's
   * 2 × 2 sorted kinds by whether they declare `BlockDefinition.window` and read
   * that as *the container has a viewport*. Those are two senses of one word: a
   * scroll has a viewport, in the offset, and needs no `window` at all. So the
   * cell that was said to be empty still is, and this kind is not its inhabitant.
   */

  render(block: Scroll, ctx: RenderContext): Rendered {
    // The child count, which is what a container's cost is proportional to and
    // what no duration states. Each child is its own node; this is how many.
    ctx.probe?.gauge("scroll.children", block.children.length); // cells-ok — a count of items, not a display width
    const full = normaliseWidth(ctx.width);
    const interior = interiorOf(block);
    // **The column is decided before anything is laid out**, because it is the
    // width every child is measured and drawn at (§7f).
    const { contentWidth: width, content, bar } = barOf(block, full, ctx.measureChild);
    const offset = offsetOf(block, ctx, content);

    const ranges = childRanges(block, width, ctx.measureChild);
    const shown = ranges.filter((r) => r.to > offset && r.from < offset + interior);

    // **Each survivor is sliced to the part of it the window holds** (C09 I58,
    // I59). Filtering by overlap and then drawing each child whole is right for
    // several short children and bounds nothing when one child is taller than
    // the interior: the route's own terminal measured 7 rows and painted 32,
    // with `follow` inert and the residue counting against a window that was
    // never applied (F855). `windowChild` returns `null` where the slice would
    // cost the container something — an atomic kind, a floor, a cap, a residual
    // — and the child is then kept whole, which is what every child got before.
    const pieces = shown.map((r) => {
      const height = r.to - r.from;
      const from = Math.max(0, offset - r.from); // cells-ok — a row index
      const to = Math.min(height, offset + interior - r.from); // cells-ok — a row index
      const piece =
        from === 0 && to === height ? r.child : (ctx.windowChild(r.child, width, from, to)?.block ?? r.child);
      return { child: r.child, rendered: ctx.renderChild(piece, width) };
    });
    let residueRow: string | null = null;
    // **The residue, both directions** (C04 I49). A settled container keeps the
    // offset it had, so content is hidden above as well as below — and a
    // bounded region that says neither is the empty-block class (F123).
    if (content > interior) {
      const above = offset;
      const below = Math.max(0, content - interior - offset);
      // **`accent` while focus is inside the box, `dim` otherwise** (C26 §7).
      // The residue row is the box's only chrome and the one set of cells the
      // data reserves whether or not a reader is in it, so it is what carries
      // a focus that would otherwise paint nothing (F769). A scroll's elements
      // are its children, so the head's `blockId` is this box and `rowId` is a
      // child — the test is on the block alone. A box whose content fits has no
      // residue row, and under focus draws as it did; §7 says so.
      const held = ctx.focus !== null && ctx.focus.blockId === block.id;
      const dim = tone(held ? "accent" : "dim", ctx.theme, ctx.capabilities);
      // **The separator is a comma and not a middle dot.** The first version
      // used one and C09 T4.4 caught it under unicode:"ascii" -- a literal
      // non-ASCII character in the very row written to keep the *mark* out of
      // the source. F6's class, one token to the right of where it was watched
      // for, and a comma needs no slot because it is the same everywhere.
      // **Two texts, one mechanism** (C04 I104). An open box says which way the
      // hidden rows lie, because the direction was measured to matter (§3c T6);
      // a collapsed box shows nothing, so *0 above* names a distinction that
      // does not exist (F826) and the fold reads *+N more*. Neither names a key:
      // the affordance is `activate`, and the footer shows its label (C16 I19).
      const text =
        interior === 0
          ? `${glyphs(ctx.capabilities).residue} +${String(content)} more`
          : `${glyphs(ctx.capabilities).residue} ${String(above)} above, ${String(below)} below`;
      residueRow = paint(clampSpans([{ text: truncate(text, width, ctx.capabilities), style: dim }], width, ctx.capabilities));
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
    const padCount = Math.max(0, interior - drawn); // cells-ok — a row count, not a width

    // **The rows arm** (C09 I73): the shown pieces' rows, the pads as empty
    // rows, the residue row — a column, so a concatenation.
    const pieceRows = pieces.map((p) => p.rendered);
    {
      const lines: string[] = [];
      // **Cut to the width** (F1211). A scroll takes the full width and insets
      // nothing, so a child answering a row wider than that put an over-wide
      // row straight into the frame — the count right, the row wrapping at
      // paint time where nothing could see it.
      for (const rows of pieceRows) for (const row of rows) lines.push(fitRow(row, width));
      for (let i = 0; i < padCount; i += 1) lines.push(""); // cells-ok — a row count
      // **The bar runs beside the interior and not beside the residue row**
      // (§7f). They answer different questions — *where* against *how far* —
      // and §021 draws both on one box, so the residue row keeps the full
      // width and the bar keeps the rows it describes.
      if (bar) {
        const column = scrollbarColumn(interior, content, offset, scrollbarSet(ctx.capabilities));
        if (column !== null) {
          // **`accent` while focus is inside the box, `muted` otherwise**
          // (§021, C26 §7) — the same rule the focused container's border
          // takes, and the tone is the whole column's: §021 draws the two
          // states as the same glyphs at two tones.
          const held = ctx.focus !== null && ctx.focus.blockId === block.id;
          const ink = tone(held ? "accent" : "muted", ctx.theme, ctx.capabilities);
          for (let i = 0; i < interior; i += 1) { // cells-ok — a row count
            const row = lines[i] ?? "";
            // **`rowCells`, not `cells`** (C09 I73): a rendered row carries
            // SGR, and a plain measure counts the escape bytes as cells — the
            // pad then comes out zero and the bar sits against the text.
            const pad = " ".repeat(Math.max(0, width - rowCells(row)));
            lines[i] = row + pad + paint([{ text: column[i] ?? "", style: ink }]);
          }
        }
      }
      if (residueRow !== null) lines.push(residueRow);
      return lines;
    }

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
/**
 * What room the grid actually has for a region, or `null` when it has none
 * (C29 §8a C9).
 *
 * **The cut the geometry used to make.** `mosaicRects` answers what the grid
 * says; a container narrower than its own floors is wider than the room it has,
 * and this is where that is paid — once, so `elements` and `render` cannot give
 * two answers about the same cell.
 */
function mosaicRoom(
  rect: MosaicRect,
  width: number,
  height: number,
): Readonly<{ width: number; height: number }> | null {
  const w = Math.min(rect.width, width - rect.left); // cells-ok — a cell count
  const h = Math.min(rect.height, height - rect.top); // cells-ok — a row count
  return w < 1 || h < 1 ? null : { width: w, height: h };
}

export const mosaicDefinition: BlockDefinition<Mosaic> = {
  kind: "mosaic",

  // §7a — the children that answered, one newline apart (I86). **Not two**:
  // two is `R-SEL-004`'s entry separator and this is inside one entry. A child
  // that declines is dropped rather than joined as empty, which is the whole of
  // the omission ruling.
  copy: (block, copyChild) => joinChildren(block.children, copyChild),

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
  elements(block: Mosaic, width: number, _measureChild: MeasureFn, copyChild: CopyFn): readonly NavElement[] {
    const parsed = parseAreas(block.areas);
    if (!parsed.ok) return Object.freeze([]);
    const w = normaliseWidth(width);
    const rects = mosaicRects(parsed.grid, w, block.height, block.columns, block.rows);
    return Object.freeze(
      block.children.flatMap((child, i) => {
        const rect = rects[i];
        if (rect === undefined) return [];
        // **Cut to the grid, and a cell with no room is no target** (C29 §8a
        // C3). The geometry is the grid's and may reach past a container too
        // narrow to hold its own floors; what a reader can reach is what is
        // drawn. This is the same cut `render` takes, so the two cannot give
        // different answers — which they did, as a zero-width focusable
        // element over a cell that was never painted.
        const room = mosaicRoom(rect, w, block.height);
        if (room === null) return [];
        return [
          Object.freeze({
            id: child.id,
            level: "block" as const,
            rows: Object.freeze({ from: rect.top, to: rect.top + room.height }),
            cols: Object.freeze({ from: rect.left, to: rect.left + room.width }),
            ...copyOrNothing(copyChild(child)),
          }),
        ];
      }),
    );
  },

  render(block: Mosaic, ctx: RenderContext): Rendered {
    // The child count, which is what a container's cost is proportional to and
    // what no duration states. Each child is its own node; this is how many.
    ctx.probe?.gauge("mosaic.children", block.children.length); // cells-ok — a count of items, not a display width
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

    // **No floor here.** A height under one composes no lines and I14's floor
    // makes an empty rows answer one blank row; the element arm needed its own
    // because a `Box` of height zero draws nothing, and that duty moved with it.
    const height = block.height; // cells-ok — a row count

    // Each drawable cell's child is rendered at its rect's width and written
    // at the rect's column and row, **its rows cut to the rect's height** — the
    // cut per cell rather than the grid's, because a child taller than its
    // region must lose its own tail and a grid-wide cut would let one cell's
    // overflow decide another's (I35).
    //
    // **Each child is rendered once** (I61). The first form rendered inside the
    // rows attempt and again inside the element fallback, so a mosaic that
    // declined drew every child twice — T1.33 caught it, and neither the
    // captures nor the goldens could, because a second render gives the same
    // bytes.
    // **The cut is here and not in the geometry** (C29 §8a C9). `placeRows`
    // takes the pieces and a height and no width, so the grid's own bound has
    // to be applied to each piece as it is written — the same place `fitRow`
    // cuts an over-wide row (F1211). A cell whose grid position leaves it no
    // room is not drawn, which is what it has always been; what changed is that
    // the rect no longer says it is zero cells wide.
    // **A focused pane takes the region's ground** (I100, §017 `R-COL-005`,
    // `R-FOC-004`). A pane is a *region* in §017's vocabulary — more than one
    // row, holding a child rather than being one — so it takes `focusGround`
    // and not the item's accent and not a border it has not got.
    //
    // **The container paints it because the child cannot.** A pane's element id
    // is the child's id and the focus names `(mosaic.id, child.id)`; a child's
    // own predicate tests its **own** block id — `plot`'s `focusedOn` is
    // `blockId === id && rowId === id` — which a mosaic-scoped focus never
    // matches, so a focused pane holding a plot could not light it however the
    // plot were written.
    //
    // **`based` and not a span pass**: the child has already painted its lines,
    // so the ground has to survive every reset inside them (C11 I25). Each row
    // is padded to the rect's width first — a ground needs cells to paint, and
    // the rect is the pane's whole extent whatever its child chose to fill.
    const focus = ctx.focus ?? null;
    const litPane =
      focus !== null && focus.blockId === block.id && focus.rowId !== null ? focus.rowId : null;
    const paneGround = litPane === null ? "" : groundSequence("surface.focusGround", ctx.theme, ctx.capabilities);
    const drawable = block.children.flatMap((child, i) => {
      const rect = rects[i];
      if (rect === undefined) return [];
      const room = mosaicRoom(rect, width, height);
      if (room === null) return [];
      const drawn = ctx.renderChild(child, room.width);
      if (child.id !== litPane || paneGround === "") return [{ child, rect, room, drawn }];
      // **Inside untouched** (`R-FOC-004`): the child's own lines are unchanged
      // and a ground is put behind them. Stripping it gives back what the
      // unfocused pane drew, byte for byte.
      const padded = drawn.map((line) => `${line}${" ".repeat(Math.max(0, room.width - rowCells(line)))}`); // cells-ok — the pane's own residue
      return [{ child, rect, room, drawn: based(padded, paneGround) }];
    });

    const childRows = drawable.map(({ drawn }) => drawn);
    return rows(placeRows(
      drawable.map(({ rect, room }, i) => ({
        x: rect.left, top: rect.top, width: room.width, height: room.height,
        rows: childRows[i] ?? [],
      })),
      height,
    ));
  },
};

/**
 * The child boxes of a **sequence** — a document's top level, a `panel`'s
 * children, or a `column` group's (C04 §3a).
 *
 * **The wrapper is gone, and its absence is the change** (C04 §3a, C09 I80).
 * A `gapBefore` child used to be wrapped in a box with one row of top padding,
 * because a sequence could not be expressed without saying where that row came
 * from. The block carries its own `padding` now and `measureChild` returns it,
 * so each child is one box and the spacing is inside the height the leaf
 * answers — which is the same arithmetic, one indirection shorter. C29 still has
 * no margin on purpose (§6): a block carrying its own outer spacing is how two
 * adjacent blocks each contributing one row produce two.
 *
 * **The leaf's `render` returns nothing and these boxes are never composed.**
 * Rendering still goes through `groupPlacements` and the panel's own frame, and
 * it moves when `childGap` reaches C04 in phase 2b. The condition to grep from
 * is `groupPlacements`: the day no container calls it, these leaves owe a real
 * `render`.
 *
 * **Each caller supplies the half its own question needs**, and the other is
 * absent rather than stubbed with a plausible number: a `width` arm has no
 * `measureChild` and gets height 0 from every leaf, a `measure` arm has no
 * `widthChild` and gets natural 0. Both are unread on their own side, so a box
 * built for one question cannot be asked the other and give a confident wrong
 * answer.
 */
function sequenceChildren(
  children: readonly Block[],
  at: number,
  measureChild?: MeasureFn,
  widthChild?: WidthFn,
): readonly Box[] {
  return children.map((child, i) => ({
    id: `c${String(i)}`,
    children: {
      kind: "paint" as const,
      natural: widthChild === undefined ? 0 : widthChild(child, at),
      measure: (cw: number) => (measureChild === undefined ? 0 : measureChild(child, cw)),
      render: () => [],
    },
  }));
}

/**
 * A `group` as a C29 box — **the first kind on the engine** (C29 §4).
 *
 * The three rules a column had, each as a declaration rather than as
 * arithmetic:
 *
 *   - *every child gets the container's width* is **`align.x: "stretch"`**
 *     (C29 I9). A C29 column would otherwise give a `FIT` child its natural
 *     width; C04's column is a stretching column, and saying so is what makes
 *     the child's `measure` see `w`. Stretch resolves in **pass 2** here, which
 *     is where the cross axis is width — the clause F1221 corrected, and this
 *     is the box that needed it.
 *   - *a child's own spacing is inside its own height* — **no declaration at
 *     all** (C04 §3a, C09 I80). This used to be `padding.t = 1` on a wrapper
 *     box, the shape `gapBefore` was going to be replaced by, put here one kind
 *     early because a column could not be expressed without it. Phase 2a landed
 *     the replacement on the block, so `measureChild` returns the spacing and
 *     the wrapper had nothing left to add. C29 still has no margin on purpose
 *     (§6): a block carrying its own outer spacing is how two adjacent blocks
 *     each contributing one row produce two.
 *   - *`minRows` floors the height, and a group is at least one row* is
 *     **`height: { kind: "fit", min: max(1, minRows) }`** (C29 I2). `groupRows`
 *     and `atLeastOne` were two clamps in sequence; a `FIT` size with a `min`
 *     is one.
 *
 * **The leaf's `render` returns nothing, and this box is never composed.**
 * Rendering still goes through `groupPlacements`, which is where the horizontal
 * alignment and the element offsets live, and it moves when `childGap` reaches
 * C04 in phase 2b. The condition to grep from is
 * `groupPlacements`: the day no container calls it, this leaf owes a real
 * `render` and the name below is wrong.
 *
 * **Each caller supplies the half its own question needs**, and the other is
 * absent rather than stubbed with a plausible number: `width` has no
 * `measureChild` and gets height 0 from every leaf, `measure` has no
 * `widthChild` and gets natural 0. Both are unread on their own side — a
 * stretched child's width comes from the container and a height comes from the
 * leaf — and a box built for one question cannot be asked the other and get a
 * confident wrong answer.
 */
function groupMeasureBox(block: Group, width: number, own: Size, measureChild?: MeasureFn, widthChild?: WidthFn): Box {
  const w = normaliseWidth(width);
  const column = block.direction === "column";
  // **A row's children are the placed ones and their divided widths** (C04
  // I42). `placeable` and `childWidths` stay where they are: the division has
  // its own leftover policy — a group spends nothing — and moving it into the
  // engine's distribution is 1.7's ruling, not this one (F1219).
  const widths = childWidths(block, w);
  const children = column ? block.children : block.children.slice(0, placeable(block, w));
  return {
    id: "group",
    direction: column ? "column" : "row",
    width: own,
    height: { kind: "fit", min: Math.max(1, block.minRows ?? 0) },
    // **A column stretches and a row does not.** A column hands every child the
    // container's width, which on that box is the cross axis; a row hands each
    // child its own divided share, which is a `FIXED` on the main axis and has
    // nothing to stretch (C29 I9).
    ...(column ? { align: { x: "stretch" as const } } : {}),
    childGap: childGapOf(block),
    // **A column is a sequence and a row is not** (C04 §3a): a row's children
    // are `FIXED` at the share `childWidths` divided, where a column's stretch
    // to the container's width. A child's own `padding` is inside its own box
    // in both directions — the old field was ignored side by side and space
    // inside a box is not (C09 I80, `C04_PADDING_WALK` A4).
    //
    // **`childGap` is declared on both axes now** (C04 I121) and defaults to
    // `0` down, so a column's box is unchanged while a row's still reads 1.
    children: column
      ? sequenceChildren(children, w, measureChild, widthChild)
      : children.map((child, i) => ({
          id: `c${String(i)}`,
          width: { kind: "fixed" as const, n: widths[i] ?? 1 },
          children: {
            kind: "paint" as const,
            natural: widthChild === undefined ? 0 : widthChild(child, widths[i] ?? 1),
            measure: (cw: number) => (measureChild === undefined ? 0 : measureChild(child, cw)),
            render: () => [],
          },
        })),
  };
}

/**
 * A `panel` as a C29 box (C29 §6).
 *
 * **The border is padding of one on every side.** A panel's height was
 * `atLeastOne(sequenceHeight(...)) + 2` and its width `widest + BORDER_INSET`;
 * both are one `padding` and the content's own `min` of one. **An empty panel
 * is still two rows** because the border is content, unlike an empty group
 * (C04 I17) — which falls out of the padding rather than needing a clause.
 *
 * The content's own size mirrors the question being asked: `FIT`, so the
 * children's naturals decide the panel's width; `GROW`, so they are handed the
 * inset width when a height is wanted. Its `min` of one is what keeps a panel
 * at width 2 measuring its children at 1 rather than at 0, which is
 * `insetWidth`'s own floor.
 *
 * **The rails are not here.** A title and a footer are furniture rather than
 * children, and their width is the panel's own arithmetic in `width` below.
 */
function panelMeasureBox(block: Panel, width: number, own: Size, measureChild?: MeasureFn, widthChild?: WidthFn): Box {
  const inner = insetWidth(normaliseWidth(width));
  const content: Size = own.kind === "fit" ? { kind: "fit", min: 1 } : { kind: "grow", min: 1 };
  return {
    id: "panel",
    width: own,
    padding: { l: 1, r: 1, t: 1, b: 1 },
    children: [
      {
        id: "panel\u00b7content",
        direction: "column",
        width: content,
        height: { kind: "fit", min: 1 },
        align: { x: "stretch" },
        children: sequenceChildren(block.children, inner, measureChild, widthChild),
      },
    ],
  };
}

/**
 * A group's own measured height (C04 I102) — **the one computation, so
 * `measure` and `window`'s decline branch cannot drift** (C09 I69). A column is
 * a C29 box and takes `measure`; a row takes its tallest placed child and
 * floors at `minRows`.
 */
function groupHeight(block: Group, width: number, measureChild: MeasureFn): number {
  const placed = block.children.slice(0, placeable(block, width));
  if (placed.length === 0) return 0; // cells-ok
  // **Both arms are the engine's** (C29 I12). `GROW` on the width, because the
  // box is being asked for a height at a width it has been given — `FIT` would
  // take the root's natural width, which is the *other* question this shape
  // answers, in `width` below.
  //
  // A column sums along its axis and a row maxes across it, which is C29 I2 and
  // is the whole of what `sequenceHeight` and the `tallest` loop used to be.
  return solveHeight(groupMeasureBox(block, width, { kind: "grow" }, measureChild), normaliseWidth(width));
}

export const groupDefinition: BlockDefinition<Group> = {
  kind: "group",

  // §7a — the children that answered, one newline apart (I86). **Not two**:
  // two is `R-SEL-004`'s entry separator and this is inside one entry. A child
  // that declines is dropped rather than joined as empty, which is the whole of
  // the omission ruling.
  copy: (block, copyChild) => joinChildren(block.children, copyChild),

  measure(block: Group, width: number, measureChild: MeasureFn): number {
    // **`groupHeight`, the one computation** (C09 I69): a column is a sequence
    // and a row is its tallest child, both floored at `minRows`, and `window`'s
    // decline branch reads the same function so the two cannot drift. An empty
    // container measures 0 — the one legitimate zero, absence of content rather
    // than empty content (C04 I17, T3.5). Asked of the placed children and their
    // heights read once (C28 I31, F940).
    return groupHeight(block, width, measureChild);
  },

  /**
   * C09 §2c — a container answers only when its layout does not depend on the
   * width it is given. A `row` whose shares are all `{cells}` sums them and the
   * gutters; a `column` whose children are all `left` takes the widest. Every
   * other group fills: a weighted row rendered at its own sum would re-divide
   * that sum and land its children elsewhere, and a column holding a `right`
   * child would move it when the column's cell shrank (C04 §3 table row 11a).
   */
  width(block: Group, width: number, widthChild: WidthFn): number {
    const w = normaliseWidth(width);
    if (block.direction === "column") {
      if (block.children.some((_child, i) => axesOf(block.align?.[i]).h !== "left")) return w;
      // **The same box, asked the other question** (C29 I2). A `FIT` container's
      // natural width is the max across its axis, which is the widest child —
      // and the floor of 1 is the `min`, not a `Math.max` after the fact. The
      // stretch is pass 2's and does not reach pass 1, so the natural the
      // children declare is still what decides this.
      return layout(groupMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;
    }
    const shares = block.flex;
    if (shares === undefined || shares.some((share) => typeof share !== "object")) return w;
    // **The same box, asked the other question.** A `FIT` row's natural width
    // is the sum along its axis plus its gaps (C29 I2) — which is the fixed
    // shares and their gutters, and the floor of 1 is the `min`.
    return layout(groupMeasureBox(block, w, { kind: "fit", min: 1 }, undefined, widthChild), w).rect.width;
  },

  /**
   * **A `column` group divides; a `row` group and a `column` with `minRows` do
   * not** (C09 I69). A column's rows are its children's, laid end to end with a
   * `gapBefore` row before any child that declares one — exactly what
   * `sequenceHeight` counts and `render` draws — so a window `[from, to)` is the
   * contiguous run of children whose rows meet it, **each kept whole**. The
   * partial first and last child are returned entire; their off-window rows are
   * the residual, so I26 holds without a second height codepath.
   *
   * **The gap rule is `windowSequence`'s** (C14 I25), one level up: the gap row
   * is kept by keeping the child's own `gapBefore` when the window opens on or
   * above it, and dropped by rewriting the flag off when the window opens below
   * it. `skipRows` steps over the first kept child's rows above `from`, that gap
   * row included when it is kept.
   *
   * **`row` and `minRows` decline.** A row's children are side by side, so no
   * contiguous run of them is a row range; and `minRows` pads the group past its
   * children's rows (C04 I102), pad rows that belong to no child — a window over
   * them would break I26 from outside any child. Both return the whole block with
   * the range as residual, the shape `windowSequence` already pays for a kind
   * that declares nothing (registry.ts).
   *
   * **Children are not windowed recursively.** The seam takes `measureChild` and
   * no `windowChild`, so a child taller than the window is kept whole and charged
   * to the residual — the slack a non-dividing kind already costs, bounded
   * because the case that wants this is a long list of short children (F1149).
   */
  window(block: Group, width: number, from: number, to: number, measureChild: MeasureFn): Windowed {
    const w = normaliseWidth(width);

    // **Decline, from inside the one member** (I69). The whole block, with the
    // range as the residual — `windowSequence`'s answer for a kind declaring
    // nothing, so the two paths agree.
    if (block.direction === "row" || block.minRows !== undefined) {
      const height = groupHeight(block, w, measureChild);
      return Object.freeze({
        block,
        skipRows: Math.max(0, Math.trunc(from)),
        dropRows: Math.max(0, height - Math.max(0, Math.trunc(to))),
      });
    }

    const height = sequenceHeight(block.children, w, measureChild);
    const lo = Math.max(0, Math.min(Math.trunc(from), height));
    const hi = Math.max(lo, Math.min(Math.trunc(to), height));

    const kept: Block[] = [];
    const keptIdx: number[] = [];
    let skip = -1;
    let lastBottom = 0;
    let row = 0; // cells-ok — a row cursor, not a width

    for (const [i, child] of block.children.entries()) {
      // **The gap row is inside the child's height now** (C04 I25, C09 I80), so
      // the cursor is a plain sum and there is no row above a child to keep or
      // drop separately — which was the only reason this loop rewrote a field
      // on the piece it hands back.
      const h = measureChild(child, w);
      const top = row;
      const bottom = top + h;
      row = bottom;

      if (bottom <= lo || top >= hi) continue;

      // **`skipRows` is set once, on the first kept child** — the rows of it
      // that precede `from`.
      if (skip < 0) skip = lo - top;

      kept.push(child);
      keptIdx.push(i);
      lastBottom = bottom;
    }

    // A degenerate range keeps nothing; decline rather than return an empty
    // group, whose `measure` is 0 and would break I26.
    if (kept.length === 0 || skip < 0) { // cells-ok — a count of kept children
      return Object.freeze({ block, skipRows: lo, dropRows: Math.max(0, height - hi) });
    }

    const dropRows = Math.max(0, lastBottom - hi);
    // **`align` and `flex` re-indexed to the kept subset** — a right-aligned
    // child keeps its column, and the arrays stay parallel to `children`.
    const align = block.align === undefined ? undefined : keptIdx.map((i) => block.align?.[i] ?? "left");
    const flex = block.flex === undefined ? undefined : keptIdx.map((i) => block.flex?.[i] ?? 1);

    return Object.freeze({
      block: Object.freeze({
        ...block,
        children: Object.freeze(kept),
        ...(align === undefined ? {} : { align: Object.freeze(align) }),
        ...(flex === undefined ? {} : { flex: Object.freeze(flex) }),
      }),
      skipRows: skip,
      dropRows,
    });
  },

  render(block: Group, ctx: RenderContext): Rendered {
    const width = normaliseWidth(ctx.width);
    const probe = ctx.probe;
    probe?.gauge("group.children", block.children.length); // cells-ok — a count of items, not a display width
    const widths = childWidths(block, width);
    // **One placement, read here as margins** (C04 I103). `left` renders at the
    // cell and moves nothing, so an unaligned row is byte for byte what it was;
    // `centre` and `right` render the child at its content width and offset it
    // (C04 I101). The vertical offset is against the row's height — the tallest
    // child or `minRows` — and zero in a column, where the cell is the child's own
    // height and there is nothing to move inside.
    // **The container's own work, and the only part of it the tree cannot
    // already see.** Every child is a node in its own right, because
    // `renderChild` and `measureChild` both go through the registry. This does
    // not draw a child — it asks each one's width and height to decide where it
    // goes — so its cost lands in the group's self time with nothing naming it.
    let placements;
    {
      using _p = probe?.span("group.place") ?? NO_SPAN;
      placements = groupPlacements(block, width, ctx.measureChild, ctx.widthChild);
    }

    const placed = block.children.slice(0, placeable(block, width));
    const ats = placed.map((_child, index) => placements[index] ?? { left: 0, top: 0, width: widths[index] ?? 1 });
    const rendered = placed.map((child, index) => ctx.renderChild(child, (ats[index] as (typeof ats)[number]).width));

    // **The rows arm** (C09 I73). A column is its children's rows in order, a
    // gap an empty row, each row padded by the child's alignment offset, and
    // the floor `minRows` of empty rows; a row lays each child's rows into its
    // cell — the cells left to right with the gutter (C04 I103) — at the
    // placement's offset, as tall as the tallest child or `minRows`. Declined
    // when a child answers an element, or when the cells would exceed the
    // width, where the row box shrinks and clips and this arm would not.
    const childRows = rendered;
    {
      if (block.direction === "column") {
        const lines: string[] = [];
        placed.forEach((_child, index) => {
          const at = ats[index] as (typeof ats)[number];
          const pad = at.left > 0 ? " ".repeat(at.left) : "";
          // **Cut to the width** (F1211). A column group pads and concatenates
          // rather than placing, so a child answering a row wider than the
          // group put that row straight into the frame — the count right and
          // the row wrapping at paint time, where nothing can see it.
          for (const row of childRows[index] ?? []) lines.push(row === "" ? "" : fitRow(pad + row, width));
        });
        // **The measurer's floor, not `minRows` alone** (F1223, C09 I1).
        // `groupHeight` floors a non-empty group at one row and this floored at
        // `minRows` and at nothing else, so a column holding nothing but an
        // empty `group` measured 1 and drew 0. C04 I17's *every measurer
        // returns at least 1* has exactly one exception — an empty container —
        // and that exception is the whole of the case.
        //
        // **Duplicated rather than derived.** Calling `groupHeight` from here
        // is the version that cannot drift, and it measures every child a
        // second time, which C09 I61 forbids (T1.33). So the same three clauses
        // are written twice and T2.18e is what watches them agreeing.
        const floor = placed.length === 0 ? 0 : Math.max(1, block.minRows ?? 0); // cells-ok — a row count
        while (lines.length < floor) lines.push(""); // cells-ok — a row count
        return lines;
      }
      // **Each cell clamped to what is left of the width, as `mosaicRects`
      // clamps a region** (I35, I73). `placeable` keeps at least one child, so
      // a single child whose fixed `{cells: n}` share exceeds the group is
      // placed wider than the group has room for — the one construction that
      // reaches this, and the reason it existed as a decline to Ink. Measured
      // against Ink before the decline was replaced: the over-wide child's row
      // is cut at the group's edge, and a cell starting past the edge is not
      // drawn **and contributes no height**, which is C04 I72's rule for a
      // mosaic region arriving in the other container that clamps.
      const blocks: Placed[] = [];
      let x = 0;
      let tallest = 0;
      placed.forEach((_child, index) => {
        const at = ats[index] as (typeof ats)[number];
        const left = x + at.left;
        x += (widths[index] ?? 1) + childGapOf(block);
        // **No guard for a cell past the edge, because `placeable` is the
        // guard.** It keeps a child only while `used + needed <= w`, so every
        // placed child after the first ends inside the width; the one that can
        // overrun is the **first**, which `placeable`'s floor of one keeps
        // whatever its width. So the clamp bites exactly once, at `left = 0`,
        // and a `room < 1` test was written here and survived its own mutation
        // twice — unreachable, and the survivor is what said so.
        const room = Math.min(at.width, width - left);
        const rows = childRows[index] ?? [];
        const cut = room === at.width ? rows : rows.map((row) => sliceCells(row, 0, room));
        blocks.push({ x: left, top: at.top, width: room, rows: cut });
        tallest = Math.max(tallest, at.top + cut.length); // cells-ok — a row count
      });
      // The same floor as the column arm's, for the same reason (F1223).
      const floor = placed.length === 0 ? 0 : Math.max(1, block.minRows ?? 0); // cells-ok — a row count
      return placeRows(blocks, Math.max(tallest, floor));
    }

  },
};
