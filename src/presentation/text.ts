/**
 * cells(), truncate() — the single width implementation (C09 I6).
 *
 * Every measurer, C11's column planner, C12's axis labels and C17's cursor
 * resolve width through here. A second implementation anywhere means
 * measurement drifts from rendering by a cell in exactly the cases nobody
 * tests: CJK, ZWJ sequences, combining marks.
 *
 * Naïve length is wrong in five ways and all five appear in real output
 * (C09 §5). `.length` counts UTF-16 code units, so an emoji is 2, a family
 * emoji is 11, and a combining mark is 1 where the terminal draws 0.
 *
 * **No dependency.** DEPENDENCIES.md rules out a width library on the grounds
 * that it would not be the implementation the measurer uses, and a grapheme
 * splitter on the grounds that `Intl.Segmenter` is built in. What remains is
 * the static Unicode data at the foot of this file.
 *
 * Ink measures text too, with its own implementation, and both compute the same
 * number. That agreement is asserted (C09 T2.16), never assumed — see C09 §3
 * and DEPENDENCIES.md's row for `ink`.
 */

/**
 * One segmenter, built once. Constructing one per call is the difference
 * between measuring a 10,000-block transcript in milliseconds and in seconds,
 * and measurement runs on every frame C14 virtualises.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Control characters, stripped before anything is measured or drawn (C09 I18).
 *
 * The implementation moved down to `data/text.ts` when C07 landed: an adapter
 * must strip on the way *into* a block rather than on the way out to the screen
 * (C07 T3.14), and L0 cannot import L1 (MG7). Re-exported rather than
 * reimplemented — two filters over one rule diverge in the cases nobody tests.
 *
 * Every caller here is unaffected, which is the assertion the existing tests
 * make.
 */
export { stripControl } from "../data/text.js";

import { stripControl } from "../data/text.js";
import { SGR_RESET, sgrPattern } from "../terminal/escapes.js";

/** A tab stop, in cells. Fixed rather than configurable — see `expandTabs`. */
export const TAB_STOP = 8;

/**
 * Tabs to spaces, against a fixed stop.
 *
 * A `code` block arrives with tabs and a terminal advances to the next multiple
 * of eight, so measuring a tab as one cell and letting the terminal draw eight
 * is a divergence of seven — per tab, per line (C09 T3.16). Expansion happens
 * before measurement so both halves see the same string.
 */
export function expandTabs(
  text: string,
  tabStop: number = TAB_STOP,
  ambiguous: AmbiguousWidth = "narrow",
): string {
  if (!text.includes("\t")) return text;
  let out = "";
  let column = 0;
  for (const ch of text) {
    if (ch === "\t") {
      const advance = tabStop - (column % tabStop);
      out += " ".repeat(advance);
      column += advance;
      continue;
    }
    if (ch === "\n") {
      out += ch;
      column = 0;
      continue;
    }
    out += ch;
    column += cells(ch, ambiguous);
  }
  return out;
}

/**
 * Whether `East_Asian_Width=Ambiguous` glyphs are one cell or two (C02 I9).
 *
 * **Declared by the caller and never read here**, which is what keeps this file
 * free of an import from `terminal/`: only L1 measures, and a width function
 * that consulted a capability would be one L0's data half could never call.
 */
export type AmbiguousWidth = "narrow" | "wide";

/**
 * Display width in terminal cells, grapheme-aware.
 *
 * A cluster is measured as a unit: a ZWJ family emoji is 2 cells, not 2 per
 * component; a base plus combining marks is the base's width; a variation
 * selector adds nothing of its own.
 *
 * **`ambiguous` defaults to `narrow`, which is today's behaviour**, so every
 * existing call is unchanged and the callers that hold a capability opt in. That
 * is a **partial** adoption by construction: a site that holds the capability and
 * does not pass it measures narrow while the frame beside it is drawn wide, and
 * the ASCII fast path above returns early regardless — correctly, since no ASCII
 * character is ambiguous. Roadmap 51 carries the sweep of the remaining sites and
 * the scan rule that would make forgetting one loud.
 *
 * **The partiality reaches inside this file too**: `truncate` and `wrapCells`
 * measure through `clusterCells`, whose own default is narrow, so a wide session
 * measures a sparkline correctly and still wraps a box-drawing paragraph as
 * though it were narrow. Named here rather than left for a reader to discover —
 * the sweep is one change and this is the first half of it.
 */
export function cells(text: string, ambiguous: AmbiguousWidth = "narrow"): number {
  if (text === "") return 0;

  // **The printable-ASCII path, and it is an equality rather than an
  // approximation** (C09 §5). For a string whose every code unit lies in
  // `[0x20, 0x7e]`: `stripControl` removes nothing (it keeps only tab and
  // newline below `0x20`, and both are excluded here), the segmenter yields one
  // cluster per character, and `clusterCells` answers 1 for each — so the count
  // *is* the length. This is not a fast approximation of the walk; it is the
  // walk's answer, arrived at without allocating a segmenter, an iterator and a
  // string per cluster.
  //
  // `charCodeAt` rather than a regex or `for…of`: both allocate, and this
  // function is called for every cell of every row of every frame.
  let ascii = true;
  for (let i = 0; i < text.length; i += 1) {  // cells-ok — a code-unit cursor, not a width
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      ascii = false;
      break;
    }
  }
  if (ascii) return text.length; // cells-ok — proven equal to the walk above

  let total = 0;
  for (const { segment } of GRAPHEMES.segment(stripControl(text))) {
    total += clusterCells(segment, ambiguous);
  }
  return total;
}

/**
 * Display width of a string that already carries SGR, and the safe truncation
 * that goes with it.
 *
 * **`cells()` is wrong for a rendered line, and wrong in a way that looks
 * right.** `stripControl` drops the ESC byte because it is a control character
 * and keeps `[38;5;241m`, which is ordinary printable text — so a themed row
 * measures eleven cells too wide per colour change. C22's frame padded every
 * chrome row to 80 *counted with the escapes*, which made the visible row about
 * 38 cells and left the previous frame showing across the rest of it.
 *
 * Truncating with `cells()` is worse than measuring with it: the cut lands
 * inside an escape, `[38;5` reaches the terminal as literal text, and the SGR
 * is never terminated — so the colour bleeds down every row below.
 *
 * Here rather than in C22 because this is where display width is decided, and
 * two answers to "how wide is this line" is C09 I1's divergence in the one
 * place that moves the whole frame.
 */
export function displayCells(text: string, ambiguous: AmbiguousWidth = "narrow"): number {
  return cells(text.replace(sgrPattern(), ""), ambiguous);
}

/**
 * Pad or truncate to exactly `width` display cells, preserving escapes.
 *
 * Escapes are copied through and cost nothing; a grapheme that would straddle
 * the boundary is dropped and the gap padded, rather than halved. A truncated
 * line is closed with `SGR_RESET` **only if it was cut**, so an unstyled line
 * gains no bytes and a cut one cannot bleed.
 */
export function fitStyled(
  text: string,
  width: number,
  reset: string,
  ambiguous: AmbiguousWidth = "narrow",
): string {
  if (displayCells(text, ambiguous) === width) return text;

  const sgr = sgrPattern();
  let out = "";
  let used = 0;
  let cut = false;
  let styled = false;
  let i = 0;

  // `i` is a code-unit index into the string, not a measure of it — the walk
  // needs a position and `cells()` answers a different question. Every width
  // decision below goes through `cells`.
  while (i < text.length) {   // cells-ok: a cursor, not a width
    sgr.lastIndex = i;
    const m = sgr.exec(text);
    if (m !== null && m.index === i) {
      out += m[0];
      styled = true;
      i = sgr.lastIndex;
      continue;
    }

    const ch = [...text.slice(i)][0] ?? "";
    if (ch === "") break;
    const w = cells(ch, ambiguous);
    if (used + w > width) {
      cut = true;
      break;
    }
    out += ch;
    used += w;
    i += ch.length;   // cells-ok: advancing the cursor past what was consumed
  }

  // Only a cut that carried style needs closing. An unstyled truncation gaining
  // a reset would put four bytes on every plain row of every frame, and a
  // golden-frame test would then be asserting the reset rather than the row.
  if (cut && styled) out += reset;
  return out + " ".repeat(Math.max(0, width - used));
}

/**
 * A window of display cells over a line that already carries SGR (C09 I20, §5a).
 *
 * `fitStyled` asked from the other end. Compositing a layer over a painted row
 * keeps cells `[0, left)` of that row, writes the layer, and keeps cells
 * `[left + width, columns)` — and the third has no expression as a `slice`. A
 * cut by code unit lands inside an escape, `[38;5` reaches the terminal as
 * literal text, the SGR is never terminated, and the colour bleeds down every
 * row below. That is worse than the mis-measurement `displayCells` exists for,
 * because it survives the frame.
 *
 * **Two rules, and they are the whole reason this is not a substring.**
 *
 * The skipped prefix's SGR is carried forward: a style opened before `from` is
 * still in effect at `from`, and a tail that dropped it draws in the terminal's
 * default colour — which reads as the layer having bled rather than as the base
 * having lost its style. And a cluster straddling either boundary is dropped
 * with its cell blanked, never halved, which is I9's rule over a window rather
 * than over a cut: half a double-width glyph is a row one cell wide, and a row
 * wider than it was measured wraps into a row nobody counted.
 *
 * The result is exactly `to - from` cells, or fewer only when the line itself
 * ends first. Nothing is padded here — the caller knows whether a short tail
 * should be filled, and `paint` does.
 */
export function sliceCells(
  text: string,
  from: number,
  to: number,
  ambiguous: AmbiguousWidth = "narrow",
): string {
  const start = Math.max(0, Math.floor(from));
  const end = Math.max(start, Math.floor(to));
  if (end === start) return "";

  const sgr = sgrPattern();
  // The style in effect at `start`, accumulated across everything skipped. A
  // reset in the prefix clears it, so the tail opens with what the terminal
  // would actually have been showing rather than with every escape ever seen.
  let carried = "";
  let out = "";
  let used = 0;
  let i = 0;
  let started = false;
  let styled = false;

  while (i < text.length) {   // cells-ok: a cursor, not a width
    sgr.lastIndex = i;
    const m = sgr.exec(text);
    if (m !== null && m.index === i) {
      const esc = m[0];
      if (started) {
        out += esc;
        styled = true;
      } else {
        carried = esc === SGR_RESET ? "" : carried + esc;
      }
      i = sgr.lastIndex;
      continue;
    }

    const ch = [...text.slice(i)][0] ?? "";
    if (ch === "") break;
    const w = cells(ch, ambiguous);

    // Straddling the left edge or the right: blanked in both directions, so the
    // window measures `to - from` either way. The left case is a separate path
    // and only the right one resembles `truncate` (C09 T1.13b).
    if (used < start && used + w > start) {
      if (!started) {
        started = true;
        out += carried;
        if (carried !== "") styled = true;
      }
      out += " ".repeat(used + w - start);
      used += w;
      i += ch.length;   // cells-ok: advancing the cursor past what was consumed
      continue;
    }

    if (used >= start && !started) {
      started = true;
      out += carried;
      if (carried !== "") styled = true;
    }

    if (used >= end) break;
    if (used >= start && used + w > end) {
      out += " ".repeat(end - used);
      break;
    }

    if (started) out += ch;
    used += w;
    i += ch.length;   // cells-ok: advancing the cursor past what was consumed
  }

  // Only a window that carried style needs closing, for `fitStyled`'s reason:
  // a reset on every plain piece would put four bytes on every row of every
  // frame, and a golden-frame test would then be asserting the reset.
  if (styled) out += SGR_RESET;
  return out;
}

/**
 * The cluster stream, for C17 (C09 §2, §5).
 *
 * The `cells()` argument one layer down. The editor's cursor is a grapheme
 * index, so it needs where a cluster *ends* rather than how wide a string is —
 * a different question with the same answer underneath, and a second
 * `Intl.Segmenter` in `interaction/` would be two answers to it: agreeing
 * today, parting on whichever ZWJ sequence two Unicode versions disagree
 * about, and paying the construction cost this module exists to pay once.
 *
 * **Nothing is stripped here.** `cells()` strips because a control character
 * has no width; C17 strips on insert (I9) and its buffer keeps `\n` as
 * structure, so stripping again would delete the line breaks the layout walks.
 */
export function graphemes(text: string): readonly string[] {
  const out: string[] = [];
  for (const { segment } of GRAPHEMES.segment(text)) out.push(segment);
  return out;
}

/**
 * One cluster's width in cells.
 *
 * What `cells()` computes internally and cannot expose by returning a total.
 * C17's layout walks clusters and asks each its width, which is the same walk
 * `wrapCells` does — one implementation, so the prompt and every block break at
 * the same place.
 */
export function clusterWidth(cluster: string): number {
  return clusterCells(cluster);
}

/**
 * The width of one grapheme cluster.
 *
 * The base code point carries the width, with two exceptions that matter in
 * real output: an emoji presentation selector (U+FE0F) promotes its base to two
 * cells — `⚠` is one and `⚠️` is two, which is a real misalignment in a status
 * column — and a regional-indicator pair is one flag of two cells rather than
 * two glyphs of two.
 */
function clusterCells(cluster: string, ambiguous: AmbiguousWidth = "narrow"): number {
  const points = [...cluster];
  const base = points[0]?.codePointAt(0);
  if (base === undefined) return 0;
  if (isZeroWidth(base)) return 0;

  if (points.some((p) => p.codePointAt(0) === 0xfe0f)) return 2;
  if (isRegionalIndicator(base)) return 2;

  if (isWide(base)) return 2;
  return ambiguous === "wide" && isAmbiguous(base) ? 2 : 1;
}

/**
 * Truncate to `width` cells, grapheme-aware, ending in the marker (C09 I9).
 *
 * Two things this must never do, both of which put a frame one cell wider than
 * it was measured: split a cluster, and half-draw a double-width glyph. A glyph
 * that would straddle the boundary is dropped and its cell left blank — blank
 * rather than absent, because the row still has to be the width it was measured
 * at.
 *
 * The ASCII form is `~` because `…` is one column and `...` is three; anything
 * else shifts every log line's cut point, for users with a non-UTF-8 locale and
 * nobody else.
 *
 * **The marker is measured rather than assumed, and it used to be assumed**
 * (F292). This read *the marker is 1 cell in both unicode modes* — true of the
 * two **unicode** modes, and this function takes a third capability. `…` is
 * U+2026, East-Asian Ambiguous, so it is **two** cells at
 * `ambiguousWidth: "wide"` and `limit - 1` reserved one. The result was
 * `limit + 1`: the third route to the failure the paragraph above names, past a
 * sentence that was accurate about the question it answered and silent about
 * the one that mattered. Measured before the fix, 29 rows of the plot catalogue's
 * 1841 were 61 cells wide in a 60-cell frame, and a wrapped line scrolls the
 * alternate screen.
 */
export function truncate(
  text: string,
  width: number,
  caps: Readonly<{ unicode: "full" | "bmp" | "ascii"; ambiguousWidth?: AmbiguousWidth }>,
  from: "start" | "end" = "end",
): string {
  const limit = Math.max(0, Math.floor(width));
  if (limit === 0) return "";

  const clean = stripControl(text);
  if (cells(clean, caps.ambiguousWidth) <= limit) return clean;

  // `bmp` keeps the Unicode marker: U+2026 is in the basic plane, and the
  // ASCII form is for terminals that cannot draw beyond it at all.
  const marker = caps.unicode === "ascii" ? "~" : "…";
  const markerCells = clusterCells(marker, caps.ambiguousWidth);
  // **A marker too wide for the slot is not a marker** (F292). At
  // `ambiguousWidth: "wide"` the ellipsis is two cells, so a one-cell limit
  // cannot say *truncated* at all — and returning it anyway put a two-cell
  // glyph in a one-cell slot, which is the same overflow one character smaller.
  // Blank rather than absent, on this module's own rule for a double-width
  // glyph refused at the boundary: the row still has to be the width it was
  // measured at.
  if (markerCells > limit) return " ".repeat(limit);
  const budget = limit - markerCells;
  if (budget <= 0) return marker;

  // `from` names the end characters are removed from (C04 I30), so `"start"` walks
  // the clusters in reverse and keeps the tail. One walk, parameterised, rather
  // than two implementations: a second pass over the same grapheme stream would
  // round differently at the boundary in exactly the CJK and ZWJ cases this
  // module exists for (C09 I9).
  const clusters = [...GRAPHEMES.segment(clean)].map((s) => s.segment);
  const order = from === "start" ? [...clusters].reverse() : clusters;

  let kept = "";
  let used = 0;
  for (const segment of order) {
    const w = clusterCells(segment, caps.ambiguousWidth);
    if (used + w > budget) break;
    kept = from === "start" ? segment + kept : kept + segment;
    used += w;
  }

  // A double-width glyph refused at the boundary leaves a cell to fill, so the
  // result is exactly `limit` cells rather than `limit - 1`. The padding sits
  // beside the marker in both directions, which is what keeps the kept text
  // flush against the end it was kept from.
  const pad = " ".repeat(budget - used);
  return from === "start" ? marker + pad + kept : kept + pad + marker;
}

/**
 * Truncation, reported as its parts.
 *
 * `kept` is a prefix of the input — exactly, in code units — and `suffix` is
 * the padding and marker that were added. A caller that has spans, tokens or
 * any other structure addressed by offset can slice it against `kept` and style
 * `suffix` for itself; `truncate` is this with the two glued together.
 *
 * `code` is the caller that needs it: its syntax tokens are offsets into the
 * block's text, and a marker is not in the token stream.
 */
export function truncateParts(
  text: string,
  width: number,
  caps: Readonly<{ unicode: "full" | "bmp" | "ascii"; ambiguousWidth?: AmbiguousWidth }>,
  from: "start" | "end" = "end",
): Readonly<{ kept: string; prefix: string; suffix: string; start: number }> {
  const whole = stripControl(text);
  const limit = Math.max(0, Math.floor(width));
  if (limit === 0) return { kept: "", prefix: "", suffix: "", start: 0 };
  if (cells(whole, caps.ambiguousWidth) <= limit) return { kept: whole, prefix: "", suffix: "", start: 0 };

  // **The marker is measured, as `truncate` measures it** (F292). This read
  // `limit - 1` while `truncate` read `clusterCells(marker)`, so at
  // `ambiguousWidth: "wide"` the two disagreed by one cell on the same cut —
  // which is the drift a shared helper exists to prevent, one function along.
  const marker = caps.unicode === "ascii" ? "~" : "\u2026";
  const markerCells = clusterCells(marker, caps.ambiguousWidth);
  if (markerCells > limit) return { kept: "", prefix: "", suffix: " ".repeat(limit), start: 0 };
  const budget = limit - markerCells;
  if (budget <= 0) {
    return from === "start"
      ? { kept: "", prefix: marker, suffix: "", start: whole.length } // cells-ok — a code-unit offset
      : { kept: "", prefix: "", suffix: marker, start: 0 };
  }

  // `from` names the end characters are removed from (C04 I30): `"start"` walks
  // the clusters in reverse and keeps the tail, so `kept` is an exact suffix
  // and `start` is its code-unit offset — a caller slicing spans against it
  // adds `start` rather than assuming zero.
  const clusters = [...GRAPHEMES.segment(whole)].map((s) => s.segment);
  const order = from === "start" ? [...clusters].reverse() : clusters;

  let kept = "";
  let used = 0;
  for (const segment of order) {
    const w = clusterCells(segment, caps.ambiguousWidth);
    if (used + w > budget) break;
    kept = from === "start" ? segment + kept : kept + segment;
    used += w;
  }

  const pad = " ".repeat(budget - used);
  return from === "start"
    ? { kept, prefix: marker + pad, suffix: "", start: whole.length - kept.length } // cells-ok — offsets
    : { kept, prefix: "", suffix: pad + marker, start: 0 };
}

/**
 * Compare two strings by grapheme cluster (C11 \u00a74).
 *
 * Here rather than in C11 because this file owns the one segmenter (\u00a71's reason
 * for `cells`, applied to ordering): a second `Intl.Segmenter` built in a sort
 * comparator is both a per-call cost on every frame and a second answer to "where
 * does a cluster end".
 *
 * Clusters are compared by code point, not by locale. `Intl.Collator` would read
 * the ambient locale, which is A03 SS1's objection in a different coat \u2014 a table
 * that sorts differently on a colleague's machine is a golden frame that cannot be
 * shared, and C11 has no injected locale to take one from.
 */
export function compareByGrapheme(a: string, b: string): number {
  if (a === b) return 0;
  const left = [...GRAPHEMES.segment(stripControl(a))];
  const right = [...GRAPHEMES.segment(stripControl(b))];
  const shared = Math.min(left.length, right.length); // cells-ok

  for (let i = 0; i < shared; i += 1) {
    const l = left[i]?.segment ?? "";
    const r = right[i]?.segment ?? "";
    if (l === r) continue;
    const lp = l.codePointAt(0) ?? 0;
    const rp = r.codePointAt(0) ?? 0;
    if (lp !== rp) return lp - rp;
    // Same base, different cluster \u2014 a combining mark or a joiner. Ordered by the
    // whole cluster's code units, which is arbitrary but total and stable.
    return l < r ? -1 : 1;
  }

  // A prefix sorts before the string that extends it.
  return left.length - right.length; // cells-ok
}

/**
 * Break at the width and nowhere else \u2014 no word breaking, no trimming.
 *
 * `code` wraps this way rather than as prose. Two reasons, and the second is
 * what makes it necessary rather than merely apt: breaking source at spaces
 * misrepresents it, and a trimmed break point means the rendered rows are no
 * longer exact slices of the source \u2014 which is what lets syntax tokens,
 * addressed by offset, be sliced against them at all.
 */
export function hardWrapCells(
  text: string,
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
): readonly string[] {
  const limit = Math.max(1, Math.floor(width));
  const out: string[] = [];
  let line = "";
  let used = 0;

  for (const raw of GRAPHEMES.segment(text)) {
    const segment = placeable(raw.segment, limit);
    const w = clusterCells(segment, ambiguous);
    if (used + w > limit && line !== "") {
      out.push(line);
      line = "";
      used = 0;
    }
    line += segment;
    used += w;
  }
  out.push(line);
  return out;
}

/**
 * Break text into lines of at most `width` cells, at cluster boundaries.
 *
 * C09 breaks every line itself and hands Ink strings that already fit (C09 §3).
 * Ink's own wrapping would choose the break points, and a renderer measuring one
 * layout while drawing another is precisely what I1 forbids.
 *
 * Breaks after a space where the line has one and mid-cluster-boundary where it
 * does not — a 10,000-character token still has to render. An explicit newline
 * always breaks, and an empty string is one line rather than none (C04 I17).
 */
export function wrapCells(
  text: string,
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
): readonly string[] {
  return wrapCellsParts(stripControl(text), width, ambiguous).map((row) => row.text);
}

/**
 * A wrapped row and where it begins in the source, in code units (C04 I86).
 *
 * **Every row is an exact contiguous slice of the source from `start`**, which
 * is the property that lets a structure addressed by offset — a span, a token —
 * be sliced against the rows at all. It is not the same as the rows
 * concatenating to the source: a break drops the space it broke at (measured:
 * `"the quick brown fox jumps"` at 10 gives rows summing to 18 units of 19), so
 * a consumer adding up row lengths drifts by one unit per break, and `start` is
 * what it reads instead.
 *
 * **Nothing is stripped here** — `wrapCells` strips before calling, because a
 * caller holding offsets into the text has already stripped its runs one by one
 * (`runsOf`), and stripping again would shift every offset after a control
 * character. `placeable` still substitutes an unfittable cluster, so a row's
 * `text` can differ from the source slice by a `?`; a caller that needs the two
 * equal substitutes first (`placeableRuns`).
 */
export type WrappedRow = Readonly<{ text: string; start: number }>;

/**
 * A `[from, to)` code-unit interval of the text no break may fall strictly
 * inside — a valued span, which wraps as one token (C04 I90, C09 §5).
 *
 * **One property on the wrapper rather than a second wrapper.** A space inside
 * an atom is not a break point; a full row with no break point outside its
 * atoms breaks at the start of the atom the next cluster would extend, when
 * something precedes that atom on the row and the atom fits a row at all; an
 * atom that begins a row and still overflows it, or that could never fit one,
 * is broken at a cluster boundary as any unbroken token is. `wrapCells` passes
 * none, so no caller that is not a run caller changes.
 */
export type Atom = Readonly<{ from: number; to: number }>;

export function wrapCellsParts(
  text: string,
  width: number,
  ambiguous: AmbiguousWidth = "narrow",
  atoms: readonly Atom[] = [],
): readonly WrappedRow[] {
  const limit = Math.max(1, Math.floor(width));
  const out: WrappedRow[] = [];
  let base = 0;

  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      out.push({ text: "", start: base });
      base += 1; // cells-ok — past the newline
      continue;
    }

    let line = "";
    let lineStart = base;
    let used = 0;
    for (const raw of GRAPHEMES.segment(paragraph)) {
      const segment = placeable(raw.segment, limit);
      const w = clusterCells(segment, ambiguous);

      if (used + w > limit && line !== "") {
        // A row that fills exactly and is followed by a space breaks at that
        // space, whether or not it has an earlier break point (C09 §5). The
        // overflow check fires on the space, so `used === limit` here; taking
        // the search's answer instead moved the last word down off a row it
        // fitted (`"aa bb cc dd"` at 5 gave `aa` / `bb` / `cc dd`, F591), and
        // taking no break at all began the next row with the space (F590).
        // Two guards. A row already ending in a space is at its second space
        // or later, where the break was the first one and the surplus is the
        // next row's content — three spaces in `"abc   def"` at 5 keep the
        // pinned `" def"`. And a break strictly inside an atom is no break
        // (C04 I90), which is `breakPoint`'s own test at this position: an
        // unfittable atom is cut at a cluster boundary, and a cluster-boundary
        // cut drops nothing (F593).
        if (
          segment === " " &&
          !line.endsWith(" ") &&
          atomAround(lineStart + line.length + 1, atoms) === undefined // cells-ok — a code-unit cursor
        ) {
          out.push({ text: line, start: lineStart });
          lineStart += line.length + 1; // cells-ok — a code-unit cursor, past the space
          line = "";
          used = 0;
          continue;
        }

        const at = breakPoint(line, lineStart, atoms);
        if (at === null) {
          // No break point outside an atom. If the cluster about to be placed
          // extends an atom that began after this row did — and the atom can
          // fit a row — the atom moves whole to the next row; otherwise the
          // row is cut here, as an unbroken token is (C09 §5).
          const atom = atomAround(lineStart + line.length, atoms); // cells-ok — a code-unit cursor
          const moves =
            atom !== undefined &&
            atom.from > lineStart &&
            cells(text.slice(atom.from, atom.to), ambiguous) <= limit;
          if (moves) {
            const cut = atom.from - lineStart; // cells-ok — a code-unit offset
            const before = line.slice(0, cut).trimEnd();
            // A row that would hold only the space before the atom is dropped
            // with the space, as a break space is.
            if (before !== "") out.push({ text: before, start: lineStart });
            lineStart = atom.from;
            line = line.slice(cut);
          } else {
            out.push({ text: line, start: lineStart });
            lineStart += line.length; // cells-ok — a code-unit cursor
            line = "";
          }
        } else {
          out.push({ text: line.slice(0, at).trimEnd(), start: lineStart });
          lineStart += at; // cells-ok — a code-unit cursor
          line = line.slice(at);
        }
        used = cells(line, ambiguous);
      }
      line += segment;
      used += w;
    }
    out.push({ text: line, start: lineStart });
    base += paragraph.length + 1; // cells-ok — the paragraph and its newline
  }

  return out;
}

/**
 * The cluster substitution `wrapCellsParts` would make, applied to a string
 * beforehand — so that the rows it then produces are exact slices of what was
 * given. One cell in every capability mode, on `placeable`'s own argument.
 */
export function placeableClusters(text: string, width: number): string {
  const limit = Math.max(1, Math.floor(width));
  let ascii = true;
  for (let i = 0; i < text.length; i += 1) { // cells-ok — a code-unit cursor
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      ascii = false;
      break;
    }
  }
  if (ascii) return text;
  let out = "";
  for (const { segment } of GRAPHEMES.segment(text)) out += placeable(segment, limit);
  return out;
}

/**
 * The code-unit offsets at which a grapheme cluster ends, ascending, for a
 * renderer that must not paint an escape inside one (C04 I84, C09).
 *
 * Every index is a boundary for printable ASCII, so that case returns nothing
 * and the caller treats an empty answer as *every index*.
 */
export function clusterEnds(text: string): readonly number[] {
  let ascii = true;
  for (let i = 0; i < text.length; i += 1) { // cells-ok — a code-unit cursor
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      ascii = false;
      break;
    }
  }
  if (ascii) return [];
  const out: number[] = [];
  let at = 0;
  for (const { segment } of GRAPHEMES.segment(text)) {
    at += segment.length; // cells-ok — a code-unit cursor
    out.push(at);
  }
  return out;
}

/**
 * A cluster that cannot fit the line at all, substituted rather than dropped (I19).
 *
 * A cluster is at most two cells, so this fires only at a usable width of 1 —
 * and it fired silently for the whole life of both wrappers. Every CJK glyph
 * and every emoji simply left the output there. **Both halves called the same
 * function, so `measure` and `render` agreed and I1 held**: the frame was
 * arithmetically consistent and describing content it did not hold, which is
 * exactly what I1 cannot see.
 *
 * Three answers were available and two are worse. Placing it anyway overflows
 * the row into one nobody counted — the alternate-screen scroll C09 exists to
 * prevent. A blank keeps the geometry and loses the fact that anything was
 * there. So a one-cell `?`, which is one cell in every capability mode: this
 * runs inside `measure`, which receives no capabilities and so cannot pick a
 * marker the way `truncate` does.
 *
 * **How narrow this has to be is a fact about child count, not terminal width.**
 * A `row` group hands each child `floor((w - (n-1)) / n)`, floored to 1 by
 * `normaliseWidth`, which is 1 whenever `w <= 2n - 1` — sixty children at 120
 * columns. No in-tree adapter builds one, so it is latent rather than live, and
 * it is reachable from C24's public `group()` at an ordinary size (C09 §5).
 *
 * C17 I20 answers the same question the other way: an editor overflows rather
 * than substitutes, because a block renders someone's data and an editor holds
 * what the user typed.
 */
const UNPLACEABLE = "?";

function placeable(segment: string, limit: number): string {
  return clusterCells(segment) > limit ? UNPLACEABLE : segment;
}

/**
 * Where to break a full line: after the last space, or nowhere.
 *
 * Null when the line holds no space to break at — an unbroken token — in which
 * case the caller breaks at the cluster boundary rather than growing past the
 * width. A line that overflows is a row the terminal adds and nobody counted.
 */
function breakPoint(line: string, lineStart: number, atoms: readonly Atom[]): number | null {
  let at = line.lastIndexOf(" ");
  while (at > 0) {
    // The break lands after the space; a break strictly inside an atom is not
    // one, and the search continues towards the row's start (C04 I90).
    if (atomAround(lineStart + at + 1, atoms) === undefined) return at + 1; // cells-ok — a code-unit offset
    at = line.lastIndexOf(" ", at - 1);
  }
  return null;
}

/** The atom `offset` falls strictly inside, if any — a boundary is inside none. */
function atomAround(offset: number, atoms: readonly Atom[]): Atom | undefined {
  for (const atom of atoms) {
    if (atom.from < offset && offset < atom.to) return atom;
  }
  return undefined;
}

// --- Unicode data ---------------------------------------------------------
//
// Static, and a table rather than a package (DEPENDENCIES.md). East Asian Wide
// and Fullwidth ranges, plus the emoji blocks a terminal draws double-width.

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || // zero-width space
    cp === 0x200c || // zero-width non-joiner
    cp === 0x200d || // zero-width joiner
    cp === 0xfeff || // byte-order mark
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacriticals
    (cp >= 0x0483 && cp <= 0x0489) ||
    (cp >= 0x0591 && cp <= 0x05bd) ||
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    (cp >= 0x0e31 && cp <= 0x0e3a) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) || // combining, extended
    (cp >= 0x1dc0 && cp <= 0x1dff) || // combining, supplement
    (cp >= 0x20d0 && cp <= 0x20f0) || // combining for symbols
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) || // combining half marks
    // **Variation selectors 17-256.** `Mn`, like every line above, and
    // absent until the Ambiguous table was derived from its source: UAX #11
    // classifies U+E0100..U+E01EF as Ambiguous, so without this line the
    // derivation would have started measuring a combining mark at two cells
    // under the wide convention. A repair that introduces an over-count one
    // table over is the shape a generated table makes possible and a
    // hand-written one hid.
    (cp >= 0xe0100 && cp <= 0xe01ef) // variation selectors, supplement
  );
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/**
 * `East_Asian_Width=Ambiguous`, derived from the property rather than recalled
 * (C02 I9).
 *
 * **The authority is `EastAsianWidth-17.0.0.txt`, dated 2025-07-24**, read from
 * `unicode.org/Public/UCD/latest/ucd/`. `AMBIGUOUS_RANGES` below is every
 * `; A` row in that file, sorted and merged: 179 ranges over 138,739 code
 * points. It is data, not a package — DEPENDENCIES.md refuses a width library
 * for `cells()` on the grounds that two implementations of one rule diverge in
 * the cases nobody tests, and that reasoning is untouched by where the *table*
 * came from.
 *
 * **This reverses the rule that stood here** (F665). The old table began
 * at U+2010 and its own comment called the omission deliberate: *most of the
 * property is Cyrillic, Greek and Latin letters that no terminal draws two
 * cells wide, so the test of inclusion is whether the tree draws from the
 * range.* Both halves are wrong, and neither is wrong by a little.
 *
 * - The premise is false **about the capability it is attached to**.
 *   `ambiguousWidth: "wide"` is set when the terminal applies the wide
 *   convention, and a terminal that applies it applies it to the *property* —
 *   Greek, Cyrillic and Latin-1 included. That is what the option means in the
 *   emulators that offer it. A sentence about fonts answered a question about
 *   glyph design; the capability asks about a width convention.
 * - The inclusion test is indexed to the wrong corpus. `cells()` measures what
 *   it is handed, and most of what it is handed is far-side text — an adapter's
 *   error message, a log line, a column of units. *Does the tree draw from this
 *   range* is a question about the glyph tables; `§` `·` `×` `°` `±` `µ` `π`
 *   `Σ` arrive from outside them.
 *
 * The cost was one-directional and it is the hazard C01 and C02 both name: a
 * row measured at *n* cells that draws *n+1* wraps, and a wrapped line scrolls
 * the alternate screen. Measured against the property before the change, at
 * `ambiguousWidth: "wide"`: **138,132 code points measured one cell where the
 * property says two**, three of them (`§` `·` `×`) members of SS47's
 * `PROSE_MARKS` — the one set exempted from the substitution rule *because it
 * is prose*, and so the one set that reaches a frame unconverted.
 *
 * **`DRAWN_AS_GEOMETRY` is a deviation, and it is recorded rather than
 * inherited.** These are the blocks the framework draws its own geometry from,
 * kept whole even where the property says Neutral: 625 code points are
 * Ambiguous here for no reason but this list (576 Neutral, 49 Wide). The reason
 * is that the deviation errs in the harmless direction — an over-count pads a
 * row, an under-count wraps it — and that a glyph the framework draws its own
 * geometry from should measure what a wide-convention terminal draws it as.
 *
 * **The premise this list used to rest on is false at HEAD, and it was checked
 * rather than inherited** (`LANEW-GEOMETRY-PREMISE`). It read *C12 and C09 gate those glyphs on this
 * answer — `halfBlockEligible`, `linedraw`, the ramp arms — so classifying them
 * Ambiguous is what makes the wide-convention gate fire at all*, and named its
 * own retirement: *the day they take a capability directly, this list is dead.*
 * They already do. `isAmbiguous` has exactly **one** caller in the tree —
 * `clusterCells`, four hundred lines up — and every gate named above reads
 * `caps.ambiguousWidth` directly. So the list is not dead but it is no longer
 * load-bearing for a *gate*: what survives is the measurement question above,
 * which is a smaller claim and the one the rows assert.
 *
 * **And 49 of its code points are settled elsewhere now.** The property calls
 * them `W`, `isWide` answers first, and they are two cells under both
 * conventions; the figure below is 625 code points of which **576** are the
 * deviation's own after that.
 *
 * **The largest consequence, stated so it is re-checkable rather than
 * rediscovered**: the property makes the private use areas Ambiguous
 * (U+E000..U+F8FF and the two supplementary planes, 137,468 code points), so a
 * consumer's icon font measures two cells under the wide convention. That is
 * what the property says and what a wide-convention terminal does; it is not
 * something this repository has measured on a real emulator.
 *
 * **The debt this paragraph used to carry is paid**: `isWide` had the same
 * disease and a worse one, because its errors landed in the *default* mode. It
 * is now `WIDE_RANGES`, derived from the same file and the same revision — see
 * its docstring for the two directions it was wrong in and for why the overlap
 * between the two tables is settled by the property rather than by the order of
 * the two `if`s in `clusterCells`.
 */
function isAmbiguous(cp: number): boolean {
  return inRanges(cp, AMBIGUOUS_RANGES) || inRanges(cp, DRAWN_AS_GEOMETRY);
}

/**
 * `[lo, hi]` pairs, flat and ascending, searched in log time.
 *
 * A flat array rather than an array of pairs: 179 ranges are searched on every
 * grapheme of every row of every frame C14 virtualises, and the pair objects
 * would be 179 allocations read a million times.
 */
function inRanges(cp: number, ranges: readonly number[]): boolean {
  let lo = 0;
  let hi = (ranges.length >> 1) - 1;   // cells-ok: a pair count, not a display width
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < (ranges[mid * 2] as number)) hi = mid - 1;
    else if (cp > (ranges[mid * 2 + 1] as number)) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Every `; A` row of `EastAsianWidth-17.0.0.txt`, merged. Generated, not typed:
 * the table above it was written by hand and nothing had ever checked it
 * against its source.
 */
const AMBIGUOUS_RANGES: readonly number[] = [
  0xa1, 0xa1, 0xa4, 0xa4, 0xa7, 0xa8, 0xaa, 0xaa, 0xad, 0xae,
  0xb0, 0xb4, 0xb6, 0xba, 0xbc, 0xbf, 0xc6, 0xc6, 0xd0, 0xd0,
  0xd7, 0xd8, 0xde, 0xe1, 0xe6, 0xe6, 0xe8, 0xea, 0xec, 0xed,
  0xf0, 0xf0, 0xf2, 0xf3, 0xf7, 0xfa, 0xfc, 0xfc, 0xfe, 0xfe,
  0x101, 0x101, 0x111, 0x111, 0x113, 0x113, 0x11b, 0x11b, 0x126, 0x127,
  0x12b, 0x12b, 0x131, 0x133, 0x138, 0x138, 0x13f, 0x142, 0x144, 0x144,
  0x148, 0x14b, 0x14d, 0x14d, 0x152, 0x153, 0x166, 0x167, 0x16b, 0x16b,
  0x1ce, 0x1ce, 0x1d0, 0x1d0, 0x1d2, 0x1d2, 0x1d4, 0x1d4, 0x1d6, 0x1d6,
  0x1d8, 0x1d8, 0x1da, 0x1da, 0x1dc, 0x1dc, 0x251, 0x251, 0x261, 0x261,
  0x2c4, 0x2c4, 0x2c7, 0x2c7, 0x2c9, 0x2cb, 0x2cd, 0x2cd, 0x2d0, 0x2d0,
  0x2d8, 0x2db, 0x2dd, 0x2dd, 0x2df, 0x2df, 0x300, 0x36f, 0x391, 0x3a1,
  0x3a3, 0x3a9, 0x3b1, 0x3c1, 0x3c3, 0x3c9, 0x401, 0x401, 0x410, 0x44f,
  0x451, 0x451, 0x2010, 0x2010, 0x2013, 0x2016, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2020, 0x2022, 0x2024, 0x2027, 0x2030, 0x2030, 0x2032, 0x2033, 0x2035, 0x2035,
  0x203b, 0x203b, 0x203e, 0x203e, 0x2074, 0x2074, 0x207f, 0x207f, 0x2081, 0x2084,
  0x20ac, 0x20ac, 0x2103, 0x2103, 0x2105, 0x2105, 0x2109, 0x2109, 0x2113, 0x2113,
  0x2116, 0x2116, 0x2121, 0x2122, 0x2126, 0x2126, 0x212b, 0x212b, 0x2153, 0x2154,
  0x215b, 0x215e, 0x2160, 0x216b, 0x2170, 0x2179, 0x2189, 0x2189, 0x2190, 0x2199,
  0x21b8, 0x21b9, 0x21d2, 0x21d2, 0x21d4, 0x21d4, 0x21e7, 0x21e7, 0x2200, 0x2200,
  0x2202, 0x2203, 0x2207, 0x2208, 0x220b, 0x220b, 0x220f, 0x220f, 0x2211, 0x2211,
  0x2215, 0x2215, 0x221a, 0x221a, 0x221d, 0x2220, 0x2223, 0x2223, 0x2225, 0x2225,
  0x2227, 0x222c, 0x222e, 0x222e, 0x2234, 0x2237, 0x223c, 0x223d, 0x2248, 0x2248,
  0x224c, 0x224c, 0x2252, 0x2252, 0x2260, 0x2261, 0x2264, 0x2267, 0x226a, 0x226b,
  0x226e, 0x226f, 0x2282, 0x2283, 0x2286, 0x2287, 0x2295, 0x2295, 0x2299, 0x2299,
  0x22a5, 0x22a5, 0x22bf, 0x22bf, 0x2312, 0x2312, 0x2460, 0x24e9, 0x24eb, 0x254b,
  0x2550, 0x2573, 0x2580, 0x258f, 0x2592, 0x2595, 0x25a0, 0x25a1, 0x25a3, 0x25a9,
  0x25b2, 0x25b3, 0x25b6, 0x25b7, 0x25bc, 0x25bd, 0x25c0, 0x25c1, 0x25c6, 0x25c8,
  0x25cb, 0x25cb, 0x25ce, 0x25d1, 0x25e2, 0x25e5, 0x25ef, 0x25ef, 0x2605, 0x2606,
  0x2609, 0x2609, 0x260e, 0x260f, 0x261c, 0x261c, 0x261e, 0x261e, 0x2640, 0x2640,
  0x2642, 0x2642, 0x2660, 0x2661, 0x2663, 0x2665, 0x2667, 0x266a, 0x266c, 0x266d,
  0x266f, 0x266f, 0x269e, 0x269f, 0x26bf, 0x26bf, 0x26c6, 0x26cd, 0x26cf, 0x26d3,
  0x26d5, 0x26e1, 0x26e3, 0x26e3, 0x26e8, 0x26e9, 0x26eb, 0x26f1, 0x26f4, 0x26f4,
  0x26f6, 0x26f9, 0x26fb, 0x26fc, 0x26fe, 0x26ff, 0x273d, 0x273d, 0x2776, 0x277f,
  0x2b56, 0x2b59, 0x3248, 0x324f, 0xe000, 0xf8ff, 0xfe00, 0xfe0f, 0xfffd, 0xfffd,
  0x1f100, 0x1f10a, 0x1f110, 0x1f12d, 0x1f130, 0x1f169, 0x1f170, 0x1f18d, 0x1f18f, 0x1f190,
  0x1f19b, 0x1f1ac, 0xe0100, 0xe01ef, 0xf0000, 0xffffd, 0x100000, 0x10fffd,
];

/**
 * The blocks the framework draws geometry from, kept Ambiguous whole. See
 * `isAmbiguous` for why this deviation exists and which premise retires it.
 */
const DRAWN_AS_GEOMETRY: readonly number[] = [
  0x2010, 0x2027, // general punctuation: dashes, quotes, ellipsis
  0x2190, 0x21ff, // arrows
  0x2200, 0x22ff, // mathematical operators
  0x2460, 0x24ff, // enclosed alphanumerics
  0x2500, 0x257f, // box drawing
  0x2580, 0x259f, // block elements — the height ladder lives here
  0x25a0, 0x25ff, // geometric shapes — ▌ ● ○ ▸ ▾
  0x2600, 0x26ff, // miscellaneous symbols
  0x2b00, 0x2b1f, // arrows and shapes, supplemental — no Ambiguous member at
                  // all in the property, so this range is deviation entire
];

/**
 * `East_Asian_Width` in {`W`, `F`}, derived from the property rather than
 * recalled — the second half of what `isAmbiguous` left owed (F665, and this
 * pass's own finding on the Wide table, `LANEW-WIDE`).
 *
 * **The authority is `EastAsianWidth-17.0.0.txt`, dated 2025-07-24**, the same
 * file and the same revision `AMBIGUOUS_RANGES` was generated from, read from
 * `unicode.org/Public/UCD/latest/ucd/`. `WIDE_RANGES` is every `; W` and `; F`
 * row in it, sorted and merged: 123 ranges over 182,876 code points. Wide and
 * Fullwidth are one table because they are one answer — both are two cells under
 * every convention, and the distinction is about the *source* of the glyph, not
 * its width.
 *
 * **This is the table whose errors landed in the default mode.** The hand-written
 * ranges above it were seventeen coarse blocks, and measured against the property
 * they were wrong in both directions:
 *
 * - **8,619 code points are `W` or `F` and measured one cell**, in 65 runs —
 *   Tangut and its components (7,529), Kana Extended/Supplement and Nushu (687),
 *   Tai Xuan Jing and counting rods (110), the Yijing hexagrams (64), enclosed
 *   ideographic supplement (61), Hangul Jamo Extended-A (29), and about
 *   thirty-five singletons: `⌚` `⏰` `⚡` `⚪` `⛄` `✅` `✨` `❌` `❗` `➕`
 *   `⭐` `⭕` `🀄` among them. Every one is an **under-count at
 *   `ambiguousWidth: "narrow"`** — the default, and the convention every golden
 *   frame in the tree is rendered in — which is I1's hazard in the mode that is
 *   always on: a row measured at *n* cells that draws *n+1* wraps, and a wrapped
 *   line scrolls the alternate screen.
 * - **369 code points measured two cells and are not `W` or `F`**, in 51 runs.
 *   Most are unassigned gaps the coarse blocks swallowed (U+2FD6..U+2FEF,
 *   U+31E6..U+31EE, U+A4C7..U+A4CF); 302 are the **text-presentation** emoji of
 *   plane 1 — U+1F321..U+1F32C, U+1F5A5..U+1F5FA and their neighbours — which
 *   the property calls Neutral because a terminal draws them one cell **until a
 *   variation selector asks for the emoji form**, which `clusterCells` already
 *   answers two for. Checked rather than assumed: of those 369, **none has
 *   `Emoji_Presentation=Yes`** (`emoji-data.txt`, 17.0.0, 2025-07-25), so no
 *   glyph a terminal draws double-width loses a cell here.
 *
 * **The two tables overlap, and the overlap is resolved by the property rather
 * than by the order of the two `if`s.** `0x3041..0x33ff` claimed
 * U+3248..U+324F, which the property calls Ambiguous — so those eight measured
 * **two at narrow where they should measure one**, an over-count sitting inside
 * an under-counting table. Deriving both tables from one file makes the
 * arithmetic impossible rather than merely fixed: the property's classes are
 * disjoint, so `WIDE_RANGES ∩ AMBIGUOUS_RANGES = ∅` by construction, and with
 * an empty intersection the order of the two tests cannot decide anything.
 * Measured: 0 code points in both. This is why the repair is a **derivation and
 * not an addition** — a second table unioned on top of the old one would have
 * kept all eight, and T1.28c is the row that refuses it.
 *
 * **Where the property and the recorded deviation do meet, the property's answer
 * stands — and the ordering is not what says so.** `DRAWN_AS_GEOMETRY` keeps
 * nine blocks Ambiguous whole,
 * and **49 of their code points are `W` in the property** — `⛄` `⚡` `⛔` `◽`
 * `⚽` and the zodiac among them. They are two cells in **both** modes, and the
 * reason is that both tables answer 2 for them rather than that `clusterCells`
 * asks `isWide` first. **Measured**: swapping the two tests in `clusterCells`
 * so the Ambiguous arm runs first fails no row in the suite, because at narrow
 * the Ambiguous arm is short-circuited by the convention and at wide both arms
 * say two. The ordering is therefore *not* what resolves this — a sentence
 * resting on it would forbid nothing (`LANEW-ORDER`) — and what does settle it
 * is that a glyph the property already calls Wide is two cells under *every* convention,
 * which is the whole of what the deviation was trying to buy for it. What the
 * list still governs is the 576 Neutral code points in those blocks, which is
 * what its figure means after this change.
 *
 * **The population this is indexed to is far-side text, not the tree's own
 * literals.** The request that raised this said `⚡` appears 26 times in `src/`
 * and `test/`; measured at the commit before this change it was **6** — one a
 * docstring, four a test fixture's label, one a spinner corpus — and 36 in the
 * whole repository, nearly all of it prose that never reaches a frame. That
 * count is not the argument in either direction, and the old table's
 * comment resting on one like it is how it went wrong: `cells()` measures
 * whatever a far side hands it, and a container name, a log line, a commit
 * subject or a unit column may carry any of these.
 */
function isWide(cp: number): boolean {
  return inRanges(cp, WIDE_RANGES);
}

/**
 * Every `; W` and `; F` row of `EastAsianWidth-17.0.0.txt`, merged. Generated,
 * not typed — for the reason `AMBIGUOUS_RANGES` was, and with a second one: the
 * table it replaced had never been checked against its source and was wrong about
 * 8,988 code points in both directions.
 *
 * **The file's three `@missing`-style defaults were checked and add nothing
 * today.** Its header gives `W` to the *unassigned* code points of
 * U+3400..U+4DBF, U+4E00..U+9FFF and the CJK Compatibility Ideographs block, and
 * to everything undesignated in planes 2 and 3 — rules that live in prose above
 * the data rather than in a row a parser sees. (The third block is named rather
 * than written in hex: a code point of the form `U+F` and three digits is
 * indistinguishable from a citation of the ledger to A03 SP5's pattern, which
 * takes `+` as a word boundary — and this is the one file in the tree where a
 * code point and a finding number can collide.) Measured against 17.0.0: those
 * blocks are listed in full, so the defaults contribute **0** code points beyond
 * the rows. Recorded
 * because the day a revision stops listing them, a generator reading rows alone
 * loses tens of thousands of cells silently and in the under-counting direction.
 */
const WIDE_RANGES: readonly number[] = [
  0x1100, 0x115f, 0x231a, 0x231b, 0x2329, 0x232a, 0x23e9, 0x23ec, 0x23f0, 0x23f0,
  0x23f3, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615, 0x2630, 0x2637, 0x2648, 0x2653,
  0x267f, 0x267f, 0x268a, 0x268f, 0x2693, 0x2693, 0x26a1, 0x26a1, 0x26aa, 0x26ab,
  0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26ce, 0x26d4, 0x26d4, 0x26ea, 0x26ea,
  0x26f2, 0x26f3, 0x26f5, 0x26f5, 0x26fa, 0x26fa, 0x26fd, 0x26fd, 0x2705, 0x2705,
  0x270a, 0x270b, 0x2728, 0x2728, 0x274c, 0x274c, 0x274e, 0x274e, 0x2753, 0x2755,
  0x2757, 0x2757, 0x2795, 0x2797, 0x27b0, 0x27b0, 0x27bf, 0x27bf, 0x2b1b, 0x2b1c,
  0x2b50, 0x2b50, 0x2b55, 0x2b55, 0x2e80, 0x2e99, 0x2e9b, 0x2ef3, 0x2f00, 0x2fd5,
  0x2ff0, 0x303e, 0x3041, 0x3096, 0x3099, 0x30ff, 0x3105, 0x312f, 0x3131, 0x318e,
  0x3190, 0x31e5, 0x31ef, 0x321e, 0x3220, 0x3247, 0x3250, 0xa48c, 0xa490, 0xa4c6,
  0xa960, 0xa97c, 0xac00, 0xd7a3, 0xf900, 0xfaff, 0xfe10, 0xfe19, 0xfe30, 0xfe52,
  0xfe54, 0xfe66, 0xfe68, 0xfe6b, 0xff01, 0xff60, 0xffe0, 0xffe6, 0x16fe0, 0x16fe4,
  0x16ff0, 0x16ff6, 0x17000, 0x18cd5, 0x18cff, 0x18d1e, 0x18d80, 0x18df2, 0x1aff0, 0x1aff3,
  0x1aff5, 0x1affb, 0x1affd, 0x1affe, 0x1b000, 0x1b122, 0x1b132, 0x1b132, 0x1b150, 0x1b152,
  0x1b155, 0x1b155, 0x1b164, 0x1b167, 0x1b170, 0x1b2fb, 0x1d300, 0x1d356, 0x1d360, 0x1d376,
  0x1f004, 0x1f004, 0x1f0cf, 0x1f0cf, 0x1f18e, 0x1f18e, 0x1f191, 0x1f19a, 0x1f200, 0x1f202,
  0x1f210, 0x1f23b, 0x1f240, 0x1f248, 0x1f250, 0x1f251, 0x1f260, 0x1f265, 0x1f300, 0x1f320,
  0x1f32d, 0x1f335, 0x1f337, 0x1f37c, 0x1f37e, 0x1f393, 0x1f3a0, 0x1f3ca, 0x1f3cf, 0x1f3d3,
  0x1f3e0, 0x1f3f0, 0x1f3f4, 0x1f3f4, 0x1f3f8, 0x1f43e, 0x1f440, 0x1f440, 0x1f442, 0x1f4fc,
  0x1f4ff, 0x1f53d, 0x1f54b, 0x1f54e, 0x1f550, 0x1f567, 0x1f57a, 0x1f57a, 0x1f595, 0x1f596,
  0x1f5a4, 0x1f5a4, 0x1f5fb, 0x1f64f, 0x1f680, 0x1f6c5, 0x1f6cc, 0x1f6cc, 0x1f6d0, 0x1f6d2,
  0x1f6d5, 0x1f6d8, 0x1f6dc, 0x1f6df, 0x1f6eb, 0x1f6ec, 0x1f6f4, 0x1f6fc, 0x1f7e0, 0x1f7eb,
  0x1f7f0, 0x1f7f0, 0x1f90c, 0x1f93a, 0x1f93c, 0x1f945, 0x1f947, 0x1f9ff, 0x1fa70, 0x1fa7c,
  0x1fa80, 0x1fa8a, 0x1fa8e, 0x1fac6, 0x1fac8, 0x1fac8, 0x1facd, 0x1fadc, 0x1fadf, 0x1faea,
  0x1faef, 0x1faf8, 0x20000, 0x2fffd, 0x30000, 0x3fffd,
];
