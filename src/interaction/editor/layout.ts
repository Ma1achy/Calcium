/**
 * The one walk: display rows, their count, and the cursor's cell.
 *
 * C17 §2, §7b, I3, I4, I18, I19, I20 — see spec.
 *
 * `displayRows` is a measurement contract in C09 I1's sense. The frame's
 * viewport height is `rows − header − prompt − footer` (S01 §3), so a prompt
 * that lies about its height misaligns everything above it rather than only
 * itself — and L4 draws the rows this returns rather than wrapping the buffer
 * again (I18, S01 §3). One walk, for the reason there is one `cells()`.
 *
 * Three rules came out of drawing the figure (§7b), and each is an off-by-one
 * on its own:
 *
 *   - **`usable = max(1, width − gutter)`**, with `first` on the buffer's first
 *     display row only. Every later row takes `cont`, whether it is a wrap or a
 *     new logical line.
 *   - **A row exists for every position the cursor can occupy** (I19), so a
 *     logical line whose last cluster exactly fills a row emits a trailing
 *     empty row — per line. `ceil(cells / usable)` is one short there, agrees
 *     everywhere else, and leaves the cursor at the end of a full command with
 *     no row to sit on. T3.8's trailing `\n` is this same rule.
 *   - **Clusters are walked, never divided** (I20). One that does not fit moves
 *     whole and leaves its cell blank; one wider than `usable` takes a row of
 *     its own and *overflows* it. C09 I19 substitutes a `?` in the same case
 *     and the divergence is deliberate: a block renders someone's data, an
 *     editor holds what the user typed. **A chip is elided instead** (I32):
 *     its label is this component's composition, not the user's text.
 */

import { graphemes } from "./graphemes.js";
// Aliased: `walk` has a local `cells` — the positions array — and the two are
// different subjects. Shadowing them was a compile error rather than a silent
// one, which is the one direction this collision could have gone well.
import { cells as widthOf, truncate } from "../../presentation/text.js";
import { neutraliseControl } from "../../data/text.js";

export type Gutter = Readonly<{ first: number; cont: number }>;

export type Cell = Readonly<{ row: number; col: number }>;

/** The usable columns on a display row. Row 0 of the buffer carries `first`. */
function usableAt(row: number, width: number, gutter: Gutter): number {
  const w = Number.isFinite(width) ? Math.floor(width) : 1;
  const indent = row === 0 ? gutter.first : gutter.cont;
  return Math.max(1, w - Math.max(0, Math.floor(indent)));
}

/**
 * The rows, and the display position of every cursor index, from one walk.
 *
 * Returned together because they are the same traversal: `layout` and
 * `cursorCell` computing their answers separately is the divergence I18 exists
 * to prevent, one file lower than the one S01 would have introduced it in.
 *
 * `cells[i]` is where the cursor sits when `cursor === i`, so it has one more
 * entry than the buffer has clusters — the end position is a position.
 */
/**
 * What a cluster **draws as**, when it is not itself (roadmap 30).
 *
 * **The one place *one grapheme, N cells* lands.** A paste chip is a single
 * sentinel in the buffer — so every grapheme index in C17 is untouched, which is
 * why the entry stays inside C17 — and it draws as `[JSON · 47 lines]`. The walk
 * is where those two facts meet, and it is the only place: `layout`,
 * `displayRows`, `cursorCell` and `selectionSpans` share this function for the
 * same reason there is one `cells()`, so one seam serves all four.
 *
 * **The gutter's class with the circularity absent**: a chip's width is its own
 * label's, fixed and independent of the terminal width, so it resolves in one
 * pass rather than needing the width it is computing.
 *
 * **`limit` is the width the walk gave it** (I32, §5e). With none it is the
 * label, which is what the fit test and every caller outside the walk want;
 * with one it is the label fitted to it — *a kind shortens itself, given the
 * width it got* (§099). Only the walk passes one, and only once the label has
 * proved wider than the row it has opened.
 */
export type ClusterText = (cluster: string, limit?: number) => string | undefined;

/**
 * What a chip **is** — the parts its label is composed from (C17 I25, §5c).
 *
 * **The label is C17's and not the application's.** `construct.ts` used to hand
 * over a finished string, which put §099's form in every application separately
 * and is the opposite of the design's *a kind shortens itself, given the width
 * it got*: the engine hands a box its solved width and the kind decides what
 * goes in it.
 *
 * `kind` decides the preview and nothing about the label; `name` is what a
 * reader calls it — a paste's detected content kind, a file's basename;
 * `target` is what the preview opens when that is not the content, and C17
 * never reads it.
 */
export type ChipKind = "paste" | "file" | "image";

/** A pasted or attached block, standing in the buffer as one grapheme (roadmap 30, I25). */
/**
 * A chip as a **producer** supplies it — everything but the ordinal (C17 I25,
 * C19 I28).
 *
 * The ordinal is numbered per session and never reset, which is a fact about a
 * buffer's whole life; no caller holds it, and two callers each keeping a
 * counter is one prompt with two `#1`s.
 */
export type ChipParts = Omit<Chip, "ordinal">;

/**
 * Where a chip goes and what closes it (C19 I28, I16).
 *
 * **Both members belong to one edit**, which is why they arrive together rather
 * than as a span argument and a second `insert` call: the region the chip stands
 * in for and the delimiter that closes its token are one undo unit, and either
 * one taken separately is a `⌃_` that does half the job.
 */
export type ChipInsert = Readonly<{
  /** A span of the buffer in **code units** — the shape `accept` produces. */
  replace?: Readonly<{ start: number; end: number }>;
  /** Appended inside the same edit; `" "` for a unique match. */
  delimiter?: string;
}>;

export type Chip = Readonly<{
  ordinal: number;
  kind: ChipKind;
  name: string;
  /** Drawn `47L`. Absent for an image, which is not measured in lines. */
  lines?: number;
  content: string;
  target?: string;
}>;

/**
 * The rung a chip is drawn at (C17 I25, §5c).
 *
 * **Two rungs and one form.** §099 and §101 draw ` #1 json · 47L ` with a space
 * either side; `R-BLK-078` and `R-BLK-336` draw `[#1 json · 47L]`. Read as two
 * formats the design contradicts itself; §099's own caption settles it — *a
 * chip is one word that happens to be painted* — so a plain-text fixture shows
 * the ground's own padding where it cannot show a ground, and **the bracket is
 * what says *chip* where there is nothing to paint with**.
 *
 * Both members come from capabilities, which are read once and handed down, so
 * this is settled when the editor is built and never per frame.
 */
export type ChipLook = Readonly<{
  separator: string;
  painted: boolean;
  /**
   * The tier `separator` was taken from, which the elision's marker is taken
   * from too (I32, §5e): `…` wherever the separator is `·`, `~` wherever it is
   * the ASCII set's. **Not the terminal's `unicode` field as it stands**: the
   * ASCII glyph set is also the wide set (C02 I9), so at `ambiguousWidth:
   * "wide"` the separator is `:` and the marker must be `~` — a `…` there is two
   * cells the walk measures as one.
   */
  unicode: "full" | "bmp" | "ascii";
}>;

/** The frame either rung spends — a space either side, or the two brackets (I25). */
const CHIP_FRAME = 2;

/**
 * A chip's label, composed (C17 I25, §5c, §099) — and, given a `limit` it does
 * not fit, elided in the middle to exactly that many cells (I32, §5e).
 */
export function chipLabel(chip: Chip, look: ChipLook, limit?: number): string {
  const size = chip.lines === undefined ? "" : ` ${look.separator} ${String(chip.lines)}L`;
  // **A `file` drops the ordinal and every other kind keeps it** (I25, §011,
  // §099, §101). A paste's `name` is its detected kind, so two pastes of JSON
  // are one word twice and the number is what tells them apart; a file's name
  // is its own, and `#1` in front of `parse.ts` says nothing the reader did not
  // have. §099 draws both in one row — `look at  parse.ts  and  #1 json · 47L
  // then` — which is the contrast, and §011 confirms it.
  //
  // **`image` is on the keeping side, and the first ruling put it on the other
  // by inference.** *A filename identifies itself whatever it holds* reads like
  // the same rule and is a step past the evidence: §101's `#2 loss-curve.png`
  // is the only image chip label the design draws, and it is numbered.
  //
  // Minting is untouched — the number is still the map's key — and this is only
  // whether the label spends cells on it.
  const mark = chip.kind === "file" ? "" : `#${String(chip.ordinal)} `;
  // **The name shown, not carried** (I36, §5g). A chip's parts come from a
  // producer, and a file chip's name is a filename — far-side text, drawn in a
  // row no block resolve reaches. Neutralised here, before it is measured or
  // cut, so the elision below cuts the `<U+202E>` form as text and the label
  // is exactly its width; `chipAt` and `resolved` keep the name as it is.
  const text = `${mark}${neutraliseControl(chip.name)}${size}`;
  // The space either side is the ground's, so it belongs to the painted rung
  // alone — a bracketed label padded as well would be a chip inside a chip.
  const frame = (inner: string): string => (look.painted ? ` ${inner} ` : `[${inner}]`);
  const whole = frame(text);
  if (limit === undefined) return whole;
  const room = Math.max(1, Math.floor(limit));
  if (widthOf(whole) <= room) return whole;
  // **The middle, because the head says which and the tail says how much**
  // (I32, `R-BLK-801`): `#1` and `47L` are the two parts that tell two chips
  // apart, and an end cut keeps the first and loses the second. C09 I103's cut
  // rather than a second one, so the boundary rounds the way every other middle
  // cut does and never splits a cluster.
  const tier = { unicode: look.unicode } as const;
  // **The marker is `truncate`'s own answer at one cell**, not a literal here:
  // a zero budget returns the marker alone, so the ASCII tier's `~` comes from
  // the one place that decides it.
  const marker = truncate(text, 1, tier, "middle");
  const inner = room - CHIP_FRAME;
  // Too narrow for a frame beside the marker: the marker alone, padded, so the
  // chip still takes exactly the cells it was given (I32).
  if (inner < widthOf(marker)) return marker + " ".repeat(Math.max(0, room - widthOf(marker)));
  return frame(truncate(text, inner, tier, "middle"));
}

/** A `ClusterText` that resolves a sentinel through a table and composes its label. */
export function chipText(
  chipAt: (cluster: string) => Chip | undefined,
  look: ChipLook,
): ClusterText {
  return (cluster, limit) => {
    const chip = chipAt(cluster);
    return chip === undefined ? undefined : chipLabel(chip, look, limit);
  };
}

/** One frozen empty array, because most prompts hold no chip (I24). */
const EMPTY_SPANS: readonly CellSpan[] = Object.freeze([]);

export function walk(
  text: string,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): Readonly<{ rows: readonly string[]; cells: readonly Cell[]; chips: readonly CellSpan[] }> {
  const rows: string[] = [];
  const cells: Cell[] = [];
  /**
   * The cells each substituted cluster covers (I26, §5c).
   *
   * **Recorded here rather than derived from `cells` afterwards**, and the
   * first draft did derive it and was wrong. The position *before* a chip is
   * recorded before the wrap that moves the chip happens, so it names the end
   * of the previous row — a span built from it is empty or on the wrong row,
   * which is exactly the *right about the row, wrong about the column* defect
   * this seam exists to prevent. The walk knows the row, the column and the
   * width at the moment it draws, and nothing else does.
   *
   * **Lazy, because most prompts hold no chip** and the walk is asked about
   * five times a frame (I24): a null here costs nothing and the array is made
   * by the first substitution.
   */
  let chips: CellSpan[] | null = null;

  let row = "";
  let used = 0;

  const open = (): void => {
    rows.push(row);
    row = "";
    used = 0;
  };

  /**
   * Which display row the walk is on.
   *
   * Named once rather than annotated four times. `rows.length` is a count of
   * rows and not of anything text-shaped, so `// graphemes-ok` is the honest
   * claim (SS40, test/support/README.md) — and stating it in one place is the
   * difference between a claim a reviewer can check and four marks that start
   * to read as "the scan complained here".
   */
  const at = (): number => rows.length; // graphemes-ok

  for (const line of text.split("\n")) {
    // The cursor's position at the start of this logical line.
    cells.push({ row: at(), col: gutterAt(at(), gutter) + used });

    for (const cluster of graphemes(line)) {
      // **Measured as it is drawn**, which is the invariant the seam exists for:
      // measuring the sentinel and drawing the label gives a prompt whose wrap
      // and whose cursor disagree with the frame, and every grapheme-index
      // assertion passes either way.
      //
      // **What a cluster no `drawAs` substitutes draws as** (I36, §5g): itself,
      // unless it is a bidi format character, which draws as its `<U+202E>`
      // form (C09 I128). The prompt is not a block, so C09 I127's resolve never
      // reaches it, and a raw override reorders the row it is typed into. Here
      // rather than in the buffer, because the buffer is the reader's input and
      // is submitted as typed; here rather than in the painter, because all
      // five callers of this walk must see the eight cells or the caret, the
      // wash and the wrap each disagree with the row. Each bidi character is a
      // grapheme of its own (`GCB=Control`), so the form is one position.
      const chip = drawAs?.(cluster);
      let shown = chip ?? neutraliseControl(cluster);
      // **`cells`, not `clusterWidth`, and the reason is here because the next
      // person will have the same true thought.** `clusterWidth` measures a
      // cluster **by its base code point** — correct for a cluster, and wrong
      // for a *substituted string*: handed `[JSON · 47 lines]` it returns the
      // width of `[`. It is the natural function to reach for on the line above,
      // it is right about clusters, and it silently under-counts every label.
      //
      // Safe on the unchanged path: `cells()` and `clusterWidth()` are the same
      // walk — one implementation, so the prompt and every block break at the
      // same place — and `cells(oneCluster)` is `clusterWidth(oneCluster)`.
      let w = widthOf(shown);

      // Moves whole. A cluster wider than the whole row still goes on one — it
      // overflows rather than being dropped or substituted (I20).
      if (used > 0 && used + w > usableAt(at(), width, gutter)) open();

      // **The limit is the row the cluster lands on, read after the open** (I32,
      // §5e). It was read once, before it, which was right for the fit test —
      // decided on the row being left — and is wrong for the elision, which
      // must fit the row being entered; the two agree only while the gutter's
      // two figures do.
      const limit = usableAt(at(), width, gutter);

      // **A chip wider than its row is elided, and a typed cluster is not**
      // (I32, I20). The label is C17's composition and the walk is the only
      // thing that knows the width it got; a typed cluster is the user's and
      // overflows. Asked a second time, with the limit, only here — so the
      // walk still calls `drawAs` once per cluster on every row that fits.
      if (w > limit && chip !== undefined && drawAs !== undefined) {
        shown = drawAs(cluster, limit) ?? shown;
        w = widthOf(shown);
      }

      // **Where the substitution landed, taken as it lands.** An elided chip
      // never passes its row (I32), so the clamp is a guard rather than a rule:
      // it binds only where `width` is at or inside the gutter and `usable` is
      // floored at 1 (§7b) — no cells past the width to paint.
      //
      // **A chip's, and only a chip's** (I36): `shown !== cluster` is true of a
      // neutralised bidi character too, and would paint it a chip's ground.
      if (chip !== undefined) {
        const from = gutterAt(at(), gutter) + used;
        (chips ??= []).push(Object.freeze({ row: at(), from, to: Math.min(from + w, width) }));
      }

      row += shown;
      used += w;

      // A row that is exactly full ends here, so the position after this
      // cluster is the start of the next row (I19). Opening it now rather than
      // when the next cluster arrives is what gives that position a cell.
      if (used >= limit) open();

      cells.push({ row: at(), col: gutterAt(at(), gutter) + used });
    }

    // End of the logical line. When the last cluster filled the row exactly,
    // the fullness test above already opened a fresh one and this pushes it
    // empty — which is I19's trailing row, and the same push that gives a
    // buffer ending in `\n` its final empty row (T3.8). The two are one rule.
    open();
  }

  // The position before a `\n` is pushed by the line's last cluster and the one
  // after it by the next line's first push, so the count is exact; the slice is
  // a guard on that arithmetic rather than a trim.
  return { rows, cells: cells.slice(0, cellCount(text)), chips: chips ?? EMPTY_SPANS }; // graphemes-ok
}

function gutterAt(row: number, gutter: Gutter): number {
  return Math.max(0, Math.floor(row === 0 ? gutter.first : gutter.cont));
}

/** Positions, which is clusters plus one. */
function cellCount(text: string): number {
  return graphemes(text).length + 1; // graphemes-ok
}

export function layout(
  text: string,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): readonly string[] {
  return walk(text, width, gutter, drawAs).rows;
}

export function displayRows(
  text: string,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): number {
  return layout(text, width, gutter, drawAs).length; // graphemes-ok
}

export function cursorCell(
  text: string,
  cursor: number,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): Cell {
  const { cells } = walk(text, width, gutter, drawAs);
  const i = Math.min(Math.max(0, cursor), cells.length - 1); // graphemes-ok
  return cells[i] ?? { row: 0, col: gutterAt(0, gutter) };
}

/**
 * A run of cells on one display row, `[from, to)` (roadmap entry 23).
 *
 * Half-open, like every other range in this component, so an empty run is
 * `from === to` and cannot be spelled two ways.
 */
export type CellSpan = Readonly<{ row: number; from: number; to: number }>;

/**
 * Which cells a buffer region covers, per display row (C17 I21, I18).
 *
 * **The same walk `layout` and `cursorCell` use**, which is what makes this a
 * consequence of I18 rather than a second measurement beside it. A span
 * computed by re-wrapping the text here would part company with the drawn rows
 * at exactly the boundaries this component exists for.
 *
 * **A row the region passes *through* is washed to the full width**, and that is
 * the rule rather than an aesthetic. A wash stopping at the last cluster of an
 * intermediate row reads as *highlighted*; one running through the padding
 * reads as *selected*, and the newline or wrap it covers is genuinely part of
 * the region. Only the last row stops at the head. No assertion about which
 * characters are in the region distinguishes the two — a frame-read does.
 *
 * Geometry is untouched (I17 with C11 I9): this returns cells to style, never
 * cells to add, so `displayRows` is the same number with a selection and
 * without one.
 */
export function selectionSpans(
  text: string,
  from: number,
  to: number,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): readonly CellSpan[] {
  const lo = Math.min(from, to); // graphemes-ok: two buffer positions, ordered
  const hi = Math.max(from, to); // graphemes-ok: the same
  if (lo === hi) return Object.freeze([]);

  const { cells } = walk(text, width, gutter, drawAs);
  const start = cells[Math.min(lo, cells.length - 1)]; // graphemes-ok: a cell index
  const end = cells[Math.min(hi, cells.length - 1)]; // graphemes-ok: a cell index
  if (start === undefined || end === undefined) return Object.freeze([]);

  const out: CellSpan[] = [];
  for (let row = start.row; row <= end.row; row += 1) {
    const first = row === start.row ? start.col : gutterAt(row, gutter);
    // **`width`, not the row's last cluster.** The region continues past this
    // row, so the wash does too — through the padding and the wrap.
    const last = row === end.row ? end.col : width;
    if (last > first) out.push(Object.freeze({ row, from: first, to: last }));
  }
  return Object.freeze(out);
}

/**
 * Which cells each chip covers, per display row (C17 I26, §5c).
 *
 * **`selectionSpans`' sibling, off the same walk** (I18) — a ground measured by
 * re-wrapping here would part company with the drawn rows at exactly the
 * boundaries this component exists for, and a span right about the row and
 * wrong about the column paints the prompt's own text as a chip.
 *
 * **A chip is one wrap unit** (I26), so a span never crosses a row: the walk
 * moves a cluster whole when it does not fit. The one case where the position
 * after a chip is on the next row is the chip that filled its own — which a
 * chip wider than the row now does exactly, elided to it (I32) rather than
 * overflowing — and there the span ends at the row's last cell.
 */
export function chipSpans(
  text: string,
  width: number,
  gutter: Gutter,
  drawAs?: ClusterText,
): readonly CellSpan[] {
  if (drawAs === undefined) return EMPTY_SPANS;
  return walk(text, width, gutter, drawAs).chips;
}
