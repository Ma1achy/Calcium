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
export function expandTabs(text: string, tabStop: number = TAB_STOP): string {
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
    column += cells(ch);
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
export function displayCells(text: string): number {
  return cells(text.replace(sgrPattern(), ""));
}

/**
 * Pad or truncate to exactly `width` display cells, preserving escapes.
 *
 * Escapes are copied through and cost nothing; a grapheme that would straddle
 * the boundary is dropped and the gap padded, rather than halved. A truncated
 * line is closed with `SGR_RESET` **only if it was cut**, so an unstyled line
 * gains no bytes and a cut one cannot bleed.
 */
export function fitStyled(text: string, width: number, reset: string): string {
  if (displayCells(text) === width) return text;

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
    const w = cells(ch);
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
export function sliceCells(text: string, from: number, to: number): string {
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
    const w = cells(ch);

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
 * The marker is 1 cell in both unicode modes (C09 I5). `…` is one column and
 * `...` is three, so the ASCII form is `~`; anything else shifts every log
 * line's cut point, for users with a non-UTF-8 locale and nobody else.
 */
export function truncate(
  text: string,
  width: number,
  caps: Readonly<{ unicode: "full" | "bmp" | "ascii" }>,
  from: "start" | "end" = "end",
): string {
  const limit = Math.max(0, Math.floor(width));
  if (limit === 0) return "";

  const clean = stripControl(text);
  if (cells(clean) <= limit) return clean;

  // `bmp` keeps the Unicode marker: U+2026 is in the basic plane, and the
  // ASCII form is for terminals that cannot draw beyond it at all.
  const marker = caps.unicode === "ascii" ? "~" : "…";
  const budget = limit - 1; // the marker's own cell
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
    const w = clusterCells(segment);
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
  caps: Readonly<{ unicode: "full" | "bmp" | "ascii" }>,
): Readonly<{ kept: string; suffix: string }> {
  const whole = stripControl(text);
  const limit = Math.max(0, Math.floor(width));
  if (limit === 0) return { kept: "", suffix: "" };
  if (cells(whole) <= limit) return { kept: whole, suffix: "" };

  const marker = caps.unicode === "ascii" ? "~" : "\u2026";
  const budget = limit - 1;
  if (budget <= 0) return { kept: "", suffix: marker };

  let kept = "";
  let used = 0;
  for (const { segment } of GRAPHEMES.segment(whole)) {
    const w = clusterCells(segment);
    if (used + w > budget) break;
    kept += segment;
    used += w;
  }

  return { kept, suffix: " ".repeat(budget - used) + marker };
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
export function hardWrapCells(text: string, width: number): readonly string[] {
  const limit = Math.max(1, Math.floor(width));
  const out: string[] = [];
  let line = "";
  let used = 0;

  for (const raw of GRAPHEMES.segment(text)) {
    const segment = placeable(raw.segment, limit);
    const w = clusterCells(segment);
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
export function wrapCells(text: string, width: number): readonly string[] {
  const limit = Math.max(1, Math.floor(width));
  const out: string[] = [];

  for (const paragraph of stripControl(text).split("\n")) {
    if (paragraph === "") {
      out.push("");
      continue;
    }

    let line = "";
    let used = 0;
    for (const raw of GRAPHEMES.segment(paragraph)) {
      const segment = placeable(raw.segment, limit);
      const w = clusterCells(segment);

      if (used + w > limit && line !== "") {
        const at = breakPoint(line);
        if (at === null) {
          out.push(line);
          line = "";
        } else {
          out.push(line.slice(0, at).trimEnd());
          line = line.slice(at);
        }
        used = cells(line);
      }
      line += segment;
      used += w;
    }
    out.push(line);
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
function breakPoint(line: string): number | null {
  const at = line.lastIndexOf(" ");
  if (at <= 0) return null;
  return at + 1;
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
    (cp >= 0xfe20 && cp <= 0xfe2f) // combining half marks
  );
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/**
 * `East_Asian_Width=Ambiguous`, the ranges that appear in terminal output (C02
 * I9).
 *
 * **Not the whole property, and the omission is deliberate.** UAX #11 lists
 * hundreds of ranges, most of them Cyrillic, Greek and Latin letters with
 * accents that no terminal renderer has ever drawn two cells wide in practice
 * because the fonts do not have wide forms for them. What this covers is the
 * part that is *drawn as geometry* and therefore actually doubles: box drawing,
 * block elements, geometric shapes, arrows, the dingbat marks C09 draws from,
 * and the enclosed alphanumerics.
 *
 * **The test of a range's inclusion is whether the tree draws from it.** Every
 * one below has a caller: `RAMP_UNICODE`'s lower blocks, `GLYPH_TABLE`'s marks,
 * C09's borders, C12's axes. A range with no caller would be a claim about
 * terminals nobody here has measured — which is the shape this whole finding is
 * about.
 *
 * A width library was the alternative and DEPENDENCIES.md already refuses one
 * for `cells()`: two implementations of one rule diverge in the cases nobody
 * tests.
 */
function isAmbiguous(cp: number): boolean {
  return (
    (cp >= 0x2010 && cp <= 0x2027) || // general punctuation: dashes, quotes, ellipsis
    (cp >= 0x2190 && cp <= 0x21ff) || // arrows
    (cp >= 0x2200 && cp <= 0x22ff) || // mathematical operators
    (cp >= 0x2460 && cp <= 0x24ff) || // enclosed alphanumerics
    (cp >= 0x2500 && cp <= 0x257f) || // box drawing
    (cp >= 0x2580 && cp <= 0x259f) || // block elements — RAMP_UNICODE lives here
    (cp >= 0x25a0 && cp <= 0x25ff) || // geometric shapes — ▌ ● ○ ▸ ▾
    (cp >= 0x2600 && cp <= 0x26ff) || // miscellaneous symbols
    (cp >= 0x2b00 && cp <= 0x2b1f) // arrows and shapes, supplemental
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, Kangxi, punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana through CJK compatibility
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK extension A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe10 && cp <= 0xfe19) || // vertical forms
    (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1f64f) || // pictographs, emoticons
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // transport
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // supplemental symbols
    (cp >= 0x1fa70 && cp <= 0x1faff) || // extended-A
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK extensions B onward
  );
}
