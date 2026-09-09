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

/** What `segment` returns: the clusters of one string, asked one at a time by `containing`. */
type Segments = ReturnType<Intl.Segmenter["segment"]>;

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
 * A cluster is measured as the terminal advances (I65): a ZWJ family emoji is
 * 2 cells, not 2 per component; a base plus nonspacing marks is the base's
 * width and a spacing mark is a cell of its own; a variation selector adds
 * nothing of its own.
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

  // **The segmenter is asked only where a cluster can be longer than one code
  // unit** (I63, F955). A row holding one box-drawing glyph among a hundred
  // and forty ASCII characters used to be segmented whole — a segment object
  // per character, forty of the sixty microseconds a transcript row cost —
  // when every run of printable ASCII in it is one cluster per unit by the
  // argument above. So a run is counted by its length and the segmenter is
  // handed only what follows one; `plainRun` leaves a run's last character to
  // it when the next unit could extend that character, so the two paths never
  // disagree about where a cluster ends.
  const clean = stripControl(text);
  let total = 0;
  let segments: Segments | null = null;
  let i = 0;
  while (i < clean.length) {   // cells-ok: a cursor, not a width
    const run = plainRun(clean, i);
    if (run > i) {
      total += run - i;   // cells-ok — one cell per unit, by the path above
      i = run;
      continue;
    }
    segments ??= GRAPHEMES.segment(clean);
    const cluster = clusterAt(segments, i);
    if (cluster === "") break;
    total += clusterCells(cluster, ambiguous);
    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed
  }
  return total;
}

/** Printable ASCII — one cluster of one cell per code unit, on every path (§5). */
function isPlain(c: number): boolean {
  return c >= 0x20 && c <= 0x7e;
}

/**
 * The end of the run of printable ASCII beginning at `i`, shortened so that
 * every character in it is a whole cluster — or `i` when there is no run.
 *
 * A printable ASCII character is a cluster of its own unless what follows it
 * extends it: a combining mark, a joiner, a spacing mark, all of which lie at
 * U+00A0 or above. A control breaks a cluster on both sides (UAX #29 GB4 and
 * GB5), so a run ending at an escape or a tab is whole and costs the segmenter
 * nothing — which is what every styled row is made of. Only a run followed by
 * a non-control outside ASCII gives up its last character, and the segmenter
 * then answers for that character and its extension together.
 */
function plainRun(text: string, i: number): number {
  let end = i;
  while (end < text.length && isPlain(text.charCodeAt(end))) end += 1;   // cells-ok: a code-unit cursor
  if (end > i && end < text.length && text.charCodeAt(end) >= 0xa0) end -= 1;   // cells-ok: a code-unit cursor
  return end;
}

/**
 * The cluster beginning at code-unit offset `i`, read in place — the cursor's
 * step in the measurer and in both styled walks (I63), or `""` past the end.
 *
 * `containing` answers for one cluster from one position and allocates that
 * cluster alone, which is what keeps the walk linear (I60): its cost is the
 * cluster's and not the remainder's, measured at 50 against 400 cells beside
 * the iterator (F955). The walks ask only at a boundary — after a run, after an
 * escape, after a cluster — with one exception. An escape's final `m` is a
 * letter, and a combining mark or a joiner placed directly after an escape
 * joins it in the segmenter's eyes; the cluster found then begins before `i`,
 * and the piece is its tail from `i` — the mark alone, zero cells — so an
 * escape is never inside a cluster. C04 I84 keeps a renderer from painting an
 * escape inside a cluster in the first place, which makes this a corner and
 * not a path.
 */
function clusterAt(segments: Segments, i: number): string {
  const found = segments.containing(i);
  if (found === undefined) return "";
  return found.index < i ? found.segment.slice(i - found.index) : found.segment;
}

/**
 * A cluster's width on the styled walks: the measurer's answer, whatever the
 * cluster is.
 *
 * A control character is a cluster of its own and `cells` strips it (I18), so
 * it has no width, and the walks carry it through unmeasured rather than
 * dropping it. The test here is only *which* clusters to ask `cells` about —
 * the C0, DEL and C1 ranges the filter is defined over — and the rule itself is
 * applied by `stripControl`, not restated.
 */
function pieceCells(cluster: string, first: number, ambiguous: AmbiguousWidth): number {
  return first < 0x20 || (first >= 0x7f && first <= 0x9f)
    ? cells(cluster, ambiguous)
    : clusterCells(cluster, ambiguous);
}

/**
 * The escape byte as a code unit, read from `escapes.ts` rather than written
 * here (C01 I1, SS14). The walks ask *is this an escape* of a code unit before
 * they ask the sticky regex, so a run of plain characters pays no regex call.
 */
const ESC_UNIT = SGR_RESET.charCodeAt(0);

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
 *
 * **The printable-ASCII path, with escapes** (I63, F955). For a row whose every
 * code unit is printable ASCII or inside an SGR sequence, the width is the
 * count of the printable units: stripping the escapes leaves printable ASCII,
 * which `cells` measures as its length. That is the path every styled ASCII
 * row takes, in one scan of its code units and no allocation — `replace` used
 * to build the stripped row for every row of every frame before `cells` saw it.
 * Anything else falls through to the stripped measure, so the two paths can
 * only agree.
 */
export function displayCells(text: string, ambiguous: AmbiguousWidth = "narrow"): number {
  const sgr = sgrAt();
  let total = 0;
  let i = 0;
  while (i < text.length) {   // cells-ok: a cursor, not a width
    const c = text.charCodeAt(i);
    if (isPlain(c)) {
      total += 1;
      i += 1;
      continue;
    }
    if (c === ESC_UNIT) {
      sgr.lastIndex = i;
      const m = sgr.exec(text);
      if (m !== null && m.index === i) {
        i = sgr.lastIndex;
        continue;
      }
    }
    return cells(text.replace(sgrPattern(), ""), ambiguous);
  }
  return total;
}

/**
 * `sgrPattern` as a **sticky** regex — a match at `lastIndex` or nothing — for
 * the measurer and the two cursors (C09 I60).
 *
 * **The third instance of the class, found by the bench beside the other two
 * and not by the finding** (F938). The walk asks *is there an escape at the
 * cursor* by setting `lastIndex` and calling `exec`, and a `g` regex answers a
 * different question: *where is the next escape anywhere after the cursor*. On a
 * row with no escape at all that is a scan to the end of the row, once per
 * character — the spread's cost again, by another mechanism, and the one SS60's
 * comment says it cannot see. Measured after the spread went: an unstyled row
 * still cost 15.7× at 400 cells against 50, where the styled row beside it cost
 * 7.9×, because a colour change every twenty cells bounded the scan and no
 * change at all did not.
 *
 * Built from `sgrPattern`'s source rather than written, so the escape byte stays
 * in the one file C01 I1 allows it (SS14). The callers now test the code unit
 * at the cursor against `ESC_UNIT` first, so the regex runs once per escape
 * rather than once per character; the sticky flag is still what makes the
 * question the one the code asks, and the callers' `m.index === i` check is
 * kept — always true under it, and what keeps a forward search a cost rather
 * than a walk that skips to the next escape.
 */
function sgrAt(): RegExp {
  return new RegExp(sgrPattern().source, "y");
}

/**
 * Pad or truncate to exactly `width` display cells, preserving escapes.
 *
 * Escapes are copied through and cost nothing; a cluster that would straddle
 * the boundary is dropped whole and the gap padded, rather than halved (I9). A
 * truncated line is closed with `SGR_RESET` **only if it was cut**, so an
 * unstyled line gains no bytes and a cut one cannot bleed.
 *
 * **The cursor steps by cluster, as the measurer counts** (I63, F939). It
 * stepped by code point and asked `cells` of each, and a cluster whose width is
 * not the sum of its parts — a ZWJ family at 2 + 0 + 2 + 0 + 2 + 0 + 2, `⚠️` at
 * 1 + 0, a flag at 2 + 2 — was counted wrong: a 14-cell row holding a family,
 * fitted to 20, was padded by nothing, and `⚠️x` fitted to 2 came back three
 * cells wide. Three kinds of piece now, and the plain one is taken as a run: an
 * escape, copied through; a run of printable ASCII, cut wherever the width
 * lands; and otherwise one cluster from the segmenter, kept whole or not at all.
 */
export function fitStyled(
  text: string,
  width: number,
  reset: string,
  ambiguous: AmbiguousWidth = "narrow",
): string {
  if (displayCells(text, ambiguous) === width) return text;

  const sgr = sgrAt();
  let segments: Segments | null = null;
  let out = "";
  let used = 0;
  let cut = false;
  let styled = false;
  let i = 0;

  // `i` is a code-unit index into the string, not a measure of it — the walk
  // needs a position and `cells()` answers a different question. Every width
  // decision below goes through `cells`'s own cluster arithmetic.
  while (i < text.length) {   // cells-ok: a cursor, not a width
    const c = text.charCodeAt(i);
    if (c === ESC_UNIT) {
      sgr.lastIndex = i;
      const m = sgr.exec(text);
      if (m !== null && m.index === i) {
        out += m[0];
        styled = true;
        i = sgr.lastIndex;
        continue;
      }
    }

    // A run of one-cell characters, taken as a substring and cut wherever the
    // width lands — no cell of it can straddle the boundary.
    const run = plainRun(text, i);
    if (run > i) {
      const room = Math.max(0, width - used);
      if (run - i > room) {
        out += text.slice(i, i + room);
        used += room;
        cut = true;
        break;
      }
      out += text.slice(i, run);
      used += run - i;   // cells-ok — one cell per unit, by `cells`'s ASCII path
      i = run;
      continue;
    }

    // One cluster, whole or not at all (I9, I63).
    segments ??= GRAPHEMES.segment(text);
    const cluster = clusterAt(segments, i);
    if (cluster === "") break;
    const w = pieceCells(cluster, c, ambiguous);
    if (used + w > width) {
      cut = true;
      break;
    }
    out += cluster;
    used += w;
    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed
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
 *
 * The same three pieces as `fitStyled`'s walk (I63): an escape, a run of
 * printable ASCII — whose part inside the window is a substring, since no cell
 * of it can straddle an edge — and otherwise one cluster, which is where the
 * two rules above do their work.
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

  const sgr = sgrAt();
  let segments: Segments | null = null;
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
    const c = text.charCodeAt(i);
    if (c === ESC_UNIT) {
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
    }

    // A run of one-cell characters. Wholly before the window it is skipped;
    // otherwise the window opens at its first cell inside, and the part inside
    // is the substring between the two edges.
    const run = plainRun(text, i);
    if (run > i) {
      const n = run - i;   // cells-ok — one cell per unit, by `cells`'s ASCII path
      if (used + n <= start) {
        used += n;
        i = run;
        continue;
      }
      if (!started) {
        started = true;
        out += carried;
        if (carried !== "") styled = true;
      }
      if (used >= end) break;
      const lo = Math.max(used, start);
      const hi = Math.min(used + n, end);
      out += text.slice(i + (lo - used), i + (hi - used));
      if (used + n > end) break;
      used += n;
      i = run;
      continue;
    }

    segments ??= GRAPHEMES.segment(text);
    const cluster = clusterAt(segments, i);
    if (cluster === "") break;
    const w = pieceCells(cluster, c, ambiguous);

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
      i += cluster.length;   // cells-ok: advancing the cursor past what was consumed
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

    if (started) out += cluster;
    used += w;
    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed
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
 * The width of one grapheme cluster: what the terminal advances by, summed
 * over the cluster's code points (I65, F978).
 *
 * Two rules are asked first because they are about the cluster and not its
 * parts, and both are as they were: an emoji presentation selector (U+FE0F)
 * after a base promotes the cluster to two cells — `⚠` is one and `⚠️` is
 * two, which is a real misalignment in a status column — and a
 * regional-indicator pair is one flag of two cells rather than two glyphs of
 * two. A selector with nothing before it promotes nothing and falls through
 * to the sum, where it is the zero-width mark it is; the walks' tail rule can
 * hand one over alone (`clusterAt`).
 *
 * Otherwise every code point contributes what the terminal draws it as.
 * Nothing for a zero-width code point — a nonspacing or enclosing mark, a
 * format character, `ZERO_WIDTH_RANGES` — and nothing for an emoji modifier
 * after a base, which recolours the base's glyph. A joiner (U+200D) **ends the
 * sum**: what follows it is drawn into the base's glyph, so a family stays two
 * and `a` + ZWJ stays one. Anything else is two where the property calls it
 * Wide, two where the session is wide and it is Ambiguous, and one otherwise.
 * So a spacing mark is a cell — `aः` and `कि` are two, as string-width and
 * xterm both draw them — a nonspacing mark none, and a zero-width base defers
 * to what follows it: `؀1` is one, a lone `́` is none.
 *
 * **This replaces a rule that gave every cluster the width of its base code
 * point alone** (F969, F978). The old rule was right for every shape the tree
 * had measured — a mark folds into its base, a selector adds nothing — and
 * wrong for the one it had not: a spacing mark (`Mc`, 471 code points, the
 * vowel signs of Devanagari, Bengali, Tamil and their neighbours) takes a cell
 * of its own, and Ink counts it. A `raw` row padded to the width by this
 * measure was one cell over by Ink's, and Ink wrapped it into a second row
 * the measurer never counted — I1's failure in the direction that scrolls the
 * alternate screen (T2.133). T1.36 had asserted the old answer as the rule.
 *
 * **A lone modifier is decided by the modifier rule's own reason.** U+1F3FB
 * alone recolours nothing; string-width and the property both make it two,
 * and zeroing it would be an under-count on the Ink side. So the modifier is
 * skipped only once something in the cluster has taken a cell. `a🏻` is one
 * cell here and to string-width, and two to xterm-headless, which draws the
 * swatch beside the letter; that residue is the emulator's (C27 I6).
 *
 * The walk is by index with `codePointAt`, advancing two past an astral code
 * point — no spread and no slice (F955, SS60) — so a cluster of one code
 * point, which is every cluster of a CJK or box-drawing row, costs one
 * iteration and no allocation; the figures are in C09 §5.
 */
function clusterCells(cluster: string, ambiguous: AmbiguousWidth = "narrow"): number {
  const base = cluster.codePointAt(0);
  if (base === undefined) return 0;

  // U+FE0F is one code unit and never half of a surrogate pair, so a substring
  // search is the code-point test without spreading the cluster into an array
  // — which this function did once per cluster of every measured string (F955).
  if (cluster.indexOf("\ufe0f") > 0) return 2;
  if (isRegionalIndicator(base)) return 2;

  let total = 0;
  let i = 0;
  while (i < cluster.length) {   // cells-ok: a code-unit cursor, not a width
    const cp = cluster.codePointAt(i) as number;
    i += cp > 0xffff ? 2 : 1;   // cells-ok: past the code point, in code units
    if (cp === 0x200d) break;
    if (isZeroWidth(cp) || (total > 0 && isEmojiModifier(cp))) continue;
    if (isWide(cp)) total += 2;
    else if (ambiguous === "wide" && isAmbiguous(cp)) total += 2;
    else total += 1;
  }
  return total;
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
 * A row as the cells the terminal draws it in — the inverse of a label
 * writer's join, for a merge that reads a row by cell (C12 I119, F981).
 *
 * Each grapheme cluster sits at its first cell and `""` fills the cells a wide
 * one occupies after it, which is the array `chargrid.ts`'s `write` builds
 * (C12 I118) before its rows are joined into a layer's strings. A cluster that
 * measures nothing is appended to the cell before it — the one that owns the
 * cluster it follows, past any `""`, so a mark after a wide glyph rides on the
 * glyph and the glyph's second cell stays what the merge reads as its own —
 * or dropped at the head, where no cell precedes it. C12's `mergedRow` read
 * every layer at column `x` as `[...row][x]`, a code-point index into a string
 * that no longer carried the cells: a three-member family emoji was five
 * columns to that walk and two to the terminal, two CJK ideographs two and
 * four, so every cell after a name on its row drifted and the gridlines with
 * it (F977). The measure is `cells()` per cluster — the writer's own — so the
 * two cannot disagree about a cell.
 *
 * **The fast set is a checked claim, not a table** (I63). A row whose every
 * code unit is printable ASCII is one cell per unit on every path, which is
 * the equality `cells` proves; and at `narrow`, a row of arrows, box drawing,
 * block elements or braille, or of sextants (one surrogate pair each) —
 * `CELL_PER_UNIT_RANGES` — is one cell per unit or pair too. Those are the
 * alphabets every rasterised layer is drawn in, so a curve's row is split
 * without a segmenter; a label's row, holding a name, walks the clusters. The
 * three BMP ranges are East-Asian Ambiguous in part (braille is Neutral), which
 * is why the set is admitted at `narrow` only — at `wide` a box-drawing glyph
 * measures two (I65) and the row takes the cluster walk, where `glyphs()` has
 * already fallen the furniture back to ASCII (C09 §4). C09 T1.40 asserts every
 * member of the set measures one cell at the mode it is admitted in and is not
 * zero-width, so a table revision that made one of them wide or combining fails
 * that row rather than a frame.
 */
export function rowCells(text: string, ambiguous: AmbiguousWidth): readonly string[] {
  if (text === "") return [];
  const out: string[] = [];
  if (cellPerUnit(text, ambiguous)) {
    let i = 0;
    while (i < text.length) { // cells-ok — a code-unit cursor
      const c = text.charCodeAt(i);
      const units = c >= 0xd800 && c <= 0xdbff ? 2 : 1;
      out.push(text.slice(i, i + units));
      i += units; // cells-ok — past the unit or the pair, in code units
    }
    return out;
  }
  for (const cluster of graphemes(text)) {
    const w = cells(cluster, ambiguous);
    if (w === 0) {
      let at = out.length - 1; // cells-ok — the cell before this cluster
      while (at > 0 && out[at] === "") at -= 1; // cells-ok — back past a continuation
      if (at >= 0) out[at] = `${out[at] ?? ""}${cluster}`;
      continue;
    }
    out.push(cluster);
    for (let k = 1; k < w; k += 1) out.push("");
  }
  return out;
}

/**
 * The alphabets a rasterised layer is drawn in — arrows, box drawing and block
 * elements, braille, and the sextants of Symbols for Legacy Computing — as
 * `[lo, hi]` pairs, flat and ascending like the tables below. One cell per
 * code point at `narrow`, and `rowCells` splits a row of them without a
 * segmenter. Exported so C09 T1.40 checks the claim against `cells()` rather
 * than restating the list.
 */
export const CELL_PER_UNIT_RANGES: readonly number[] = [
  0x2190, 0x21ff, 0x2500, 0x259f, 0x2800, 0x28ff, 0x1fb00, 0x1fbff,
];

/** Whether every code unit of `text` is a cell of its own — printable ASCII at either mode, the set above at `narrow`. */
function cellPerUnit(text: string, ambiguous: AmbiguousWidth): boolean {
  let i = 0;
  while (i < text.length) { // cells-ok — a code-unit cursor
    const c = text.charCodeAt(i);
    if (isPlain(c)) {
      i += 1; // cells-ok — a code-unit cursor
      continue;
    }
    if (ambiguous !== "narrow") return false;
    const cp = text.codePointAt(i) as number;
    if (!inRanges(cp, CELL_PER_UNIT_RANGES)) return false;
    i += cp > 0xffff ? 2 : 1; // cells-ok — past the code point, in code units
  }
  return true;
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
// Static, and tables rather than a package (DEPENDENCIES.md): the zero-width
// set, East Asian Wide and Fullwidth, Ambiguous, and the emoji blocks a
// terminal draws double-width — each derived from its property and checked
// against it (T1.27, T1.28, T1.38), because the three that were written by hand
// were each found wrong against their source (C09 §5).

/**
 * Zero-width to the terminal: a nonspacing or enclosing mark, or a format
 * character — `ZERO_WIDTH_RANGES`, derived and not typed, with U+00AD kept out
 * (every terminal draws a soft hyphen). One caller, `clusterCells`, which asks
 * it of every code point in a cluster rather than of the base alone (I65).
 */
function isZeroWidth(cp: number): boolean {
  return inRanges(cp, ZERO_WIDTH_RANGES);
}

/** U+1F3FB..U+1F3FF, the five skin-tone modifiers: after a base they recolour its glyph and take no cell. */
function isEmojiModifier(cp: number): boolean {
  return cp >= 0x1f3fb && cp <= 0x1f3ff;
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/**
 * `General_Category` in {`Mn`, `Me`, `Cf`} — every nonspacing mark, enclosing
 * mark and format character — minus U+00AD, derived from the property rather
 * than recalled: the third table in this file with the disease the first two
 * had (F979), and the one whose errors landed on the *cluster* and not only
 * on the code point.
 *
 * **The authority is the Unicode Character Database as Node's ICU carries
 * it — `process.versions.unicode` 17.0, ICU 78.2, Node 22.23** — read through
 * `\p{Mn}`, `\p{Me}` and `\p{Cf}` over every code point and merged: 375
 * ranges over 2,241 code points (2,059 `Mn`, 13 `Me`, 169 `Cf`). The same
 * revision `EastAsianWidth-17.0.0.txt` is, so the three tables describe one
 * Unicode. T1.38 re-derives it at test time and compares by equality, so the
 * table is checked rather than recorded, and it goes stale loudly the day the
 * runtime's Unicode moves.
 *
 * **The hand-written ranges it replaces were wrong in both directions**, and
 * consulted for a cluster's base alone, so their errors on a code point of its
 * own were the smaller half (F978):
 *
 * - **1,607 marks and format characters lay outside them** — 1,441 `Mn`/`Me`
 *   (Hebrew points past U+05BD, Arabic marks past U+065F, every Indic virama
 *   and nonspacing vowel sign, Cyrillic Extended, the whole of plane 1's marks)
 *   and 166 `Cf` (the bidi controls, the Arabic number signs, the tag
 *   characters, the musical-symbol formatting) — each measured **one cell**
 *   alone, and at a cluster's base one cell for the cluster. 1,606 join the
 *   table here; the 1,607th is U+00AD, below.
 * - **24 code points inside them are not marks at all**: U+0E32 and U+0E33,
 *   two Thai *letters* (`า` and `ำ`, category `Lo`) that the coarse
 *   `0x0e31..0x0e3a` swallowed — so `กา` measured **one cell for two**, the
 *   under-count that wraps — and 22 unassigned code points of U+1ADE..U+1AFF.
 *
 * The larger half was never the table's: a **spacing** mark (`Mc`, 471 code
 * points, none of them here and none ever in the old list) is a cell to every
 * terminal and to Ink, and `clusterCells` gave a cluster its base's width
 * alone, so `aः` `कि` `கொ` `কা` each measured one for two — F969's open
 * paragraph, which T1.36 asserted as the rule.
 *
 * **Two things are deliberately not in it, and both are recorded rather than
 * adopted.** U+00AD, SOFT HYPHEN, is `Cf` and every terminal draws it — xterm
 * advances a cell, and Markus Kuhn's `wcwidth` gives it width 1 by name in its
 * header — so it measures one here where string-width measures none: an
 * over-count on the Ink side, which pads short and cannot wrap. And the Hangul
 * conjoining jamo — the medial vowels and final consonants U+1160..U+11FF and
 * U+D7B0..U+D7FF — are letters (`Lo`), which `wcwidth` zeroes so that a
 * decomposed syllable L+V+T measures the two cells the precomposed one does.
 * This table does **not**: a decomposed `가` (U+1100 U+1161) measures three
 * here against two to xterm and to string-width, which collapses L+V(+T)
 * itself. A known limit in the safe direction — an over-count of one cell per
 * decomposed syllable — and not a rule, until far-side output arrives in NFD
 * Hangul. Emoji modifiers (`Sk`) are not here either: they are
 * `clusterCells`'s own rule, zero after a base and a glyph of their own alone.
 */
const ZERO_WIDTH_RANGES: readonly number[] = [
  0x300, 0x36f, 0x483, 0x489, 0x591, 0x5bd, 0x5bf, 0x5bf, 0x5c1, 0x5c2,
  0x5c4, 0x5c5, 0x5c7, 0x5c7, 0x600, 0x605, 0x610, 0x61a, 0x61c, 0x61c,
  0x64b, 0x65f, 0x670, 0x670, 0x6d6, 0x6dd, 0x6df, 0x6e4, 0x6e7, 0x6e8,
  0x6ea, 0x6ed, 0x70f, 0x70f, 0x711, 0x711, 0x730, 0x74a, 0x7a6, 0x7b0,
  0x7eb, 0x7f3, 0x7fd, 0x7fd, 0x816, 0x819, 0x81b, 0x823, 0x825, 0x827,
  0x829, 0x82d, 0x859, 0x85b, 0x890, 0x891, 0x897, 0x89f, 0x8ca, 0x902,
  0x93a, 0x93a, 0x93c, 0x93c, 0x941, 0x948, 0x94d, 0x94d, 0x951, 0x957,
  0x962, 0x963, 0x981, 0x981, 0x9bc, 0x9bc, 0x9c1, 0x9c4, 0x9cd, 0x9cd,
  0x9e2, 0x9e3, 0x9fe, 0x9fe, 0xa01, 0xa02, 0xa3c, 0xa3c, 0xa41, 0xa42,
  0xa47, 0xa48, 0xa4b, 0xa4d, 0xa51, 0xa51, 0xa70, 0xa71, 0xa75, 0xa75,
  0xa81, 0xa82, 0xabc, 0xabc, 0xac1, 0xac5, 0xac7, 0xac8, 0xacd, 0xacd,
  0xae2, 0xae3, 0xafa, 0xaff, 0xb01, 0xb01, 0xb3c, 0xb3c, 0xb3f, 0xb3f,
  0xb41, 0xb44, 0xb4d, 0xb4d, 0xb55, 0xb56, 0xb62, 0xb63, 0xb82, 0xb82,
  0xbc0, 0xbc0, 0xbcd, 0xbcd, 0xc00, 0xc00, 0xc04, 0xc04, 0xc3c, 0xc3c,
  0xc3e, 0xc40, 0xc46, 0xc48, 0xc4a, 0xc4d, 0xc55, 0xc56, 0xc62, 0xc63,
  0xc81, 0xc81, 0xcbc, 0xcbc, 0xcbf, 0xcbf, 0xcc6, 0xcc6, 0xccc, 0xccd,
  0xce2, 0xce3, 0xd00, 0xd01, 0xd3b, 0xd3c, 0xd41, 0xd44, 0xd4d, 0xd4d,
  0xd62, 0xd63, 0xd81, 0xd81, 0xdca, 0xdca, 0xdd2, 0xdd4, 0xdd6, 0xdd6,
  0xe31, 0xe31, 0xe34, 0xe3a, 0xe47, 0xe4e, 0xeb1, 0xeb1, 0xeb4, 0xebc,
  0xec8, 0xece, 0xf18, 0xf19, 0xf35, 0xf35, 0xf37, 0xf37, 0xf39, 0xf39,
  0xf71, 0xf7e, 0xf80, 0xf84, 0xf86, 0xf87, 0xf8d, 0xf97, 0xf99, 0xfbc,
  0xfc6, 0xfc6, 0x102d, 0x1030, 0x1032, 0x1037, 0x1039, 0x103a, 0x103d, 0x103e,
  0x1058, 0x1059, 0x105e, 0x1060, 0x1071, 0x1074, 0x1082, 0x1082, 0x1085, 0x1086,
  0x108d, 0x108d, 0x109d, 0x109d, 0x135d, 0x135f, 0x1712, 0x1714, 0x1732, 0x1733,
  0x1752, 0x1753, 0x1772, 0x1773, 0x17b4, 0x17b5, 0x17b7, 0x17bd, 0x17c6, 0x17c6,
  0x17c9, 0x17d3, 0x17dd, 0x17dd, 0x180b, 0x180f, 0x1885, 0x1886, 0x18a9, 0x18a9,
  0x1920, 0x1922, 0x1927, 0x1928, 0x1932, 0x1932, 0x1939, 0x193b, 0x1a17, 0x1a18,
  0x1a1b, 0x1a1b, 0x1a56, 0x1a56, 0x1a58, 0x1a5e, 0x1a60, 0x1a60, 0x1a62, 0x1a62,
  0x1a65, 0x1a6c, 0x1a73, 0x1a7c, 0x1a7f, 0x1a7f, 0x1ab0, 0x1add, 0x1ae0, 0x1aeb,
  0x1b00, 0x1b03, 0x1b34, 0x1b34, 0x1b36, 0x1b3a, 0x1b3c, 0x1b3c, 0x1b42, 0x1b42,
  0x1b6b, 0x1b73, 0x1b80, 0x1b81, 0x1ba2, 0x1ba5, 0x1ba8, 0x1ba9, 0x1bab, 0x1bad,
  0x1be6, 0x1be6, 0x1be8, 0x1be9, 0x1bed, 0x1bed, 0x1bef, 0x1bf1, 0x1c2c, 0x1c33,
  0x1c36, 0x1c37, 0x1cd0, 0x1cd2, 0x1cd4, 0x1ce0, 0x1ce2, 0x1ce8, 0x1ced, 0x1ced,
  0x1cf4, 0x1cf4, 0x1cf8, 0x1cf9, 0x1dc0, 0x1dff, 0x200b, 0x200f, 0x202a, 0x202e,
  0x2060, 0x2064, 0x2066, 0x206f, 0x20d0, 0x20f0, 0x2cef, 0x2cf1, 0x2d7f, 0x2d7f,
  0x2de0, 0x2dff, 0x302a, 0x302d, 0x3099, 0x309a, 0xa66f, 0xa672, 0xa674, 0xa67d,
  0xa69e, 0xa69f, 0xa6f0, 0xa6f1, 0xa802, 0xa802, 0xa806, 0xa806, 0xa80b, 0xa80b,
  0xa825, 0xa826, 0xa82c, 0xa82c, 0xa8c4, 0xa8c5, 0xa8e0, 0xa8f1, 0xa8ff, 0xa8ff,
  0xa926, 0xa92d, 0xa947, 0xa951, 0xa980, 0xa982, 0xa9b3, 0xa9b3, 0xa9b6, 0xa9b9,
  0xa9bc, 0xa9bd, 0xa9e5, 0xa9e5, 0xaa29, 0xaa2e, 0xaa31, 0xaa32, 0xaa35, 0xaa36,
  0xaa43, 0xaa43, 0xaa4c, 0xaa4c, 0xaa7c, 0xaa7c, 0xaab0, 0xaab0, 0xaab2, 0xaab4,
  0xaab7, 0xaab8, 0xaabe, 0xaabf, 0xaac1, 0xaac1, 0xaaec, 0xaaed, 0xaaf6, 0xaaf6,
  0xabe5, 0xabe5, 0xabe8, 0xabe8, 0xabed, 0xabed, 0xfb1e, 0xfb1e, 0xfe00, 0xfe0f,
  0xfe20, 0xfe2f, 0xfeff, 0xfeff, 0xfff9, 0xfffb, 0x101fd, 0x101fd, 0x102e0, 0x102e0,
  0x10376, 0x1037a, 0x10a01, 0x10a03, 0x10a05, 0x10a06, 0x10a0c, 0x10a0f, 0x10a38, 0x10a3a,
  0x10a3f, 0x10a3f, 0x10ae5, 0x10ae6, 0x10d24, 0x10d27, 0x10d69, 0x10d6d, 0x10eab, 0x10eac,
  0x10efa, 0x10eff, 0x10f46, 0x10f50, 0x10f82, 0x10f85, 0x11001, 0x11001, 0x11038, 0x11046,
  0x11070, 0x11070, 0x11073, 0x11074, 0x1107f, 0x11081, 0x110b3, 0x110b6, 0x110b9, 0x110ba,
  0x110bd, 0x110bd, 0x110c2, 0x110c2, 0x110cd, 0x110cd, 0x11100, 0x11102, 0x11127, 0x1112b,
  0x1112d, 0x11134, 0x11173, 0x11173, 0x11180, 0x11181, 0x111b6, 0x111be, 0x111c9, 0x111cc,
  0x111cf, 0x111cf, 0x1122f, 0x11231, 0x11234, 0x11234, 0x11236, 0x11237, 0x1123e, 0x1123e,
  0x11241, 0x11241, 0x112df, 0x112df, 0x112e3, 0x112ea, 0x11300, 0x11301, 0x1133b, 0x1133c,
  0x11340, 0x11340, 0x11366, 0x1136c, 0x11370, 0x11374, 0x113bb, 0x113c0, 0x113ce, 0x113ce,
  0x113d0, 0x113d0, 0x113d2, 0x113d2, 0x113e1, 0x113e2, 0x11438, 0x1143f, 0x11442, 0x11444,
  0x11446, 0x11446, 0x1145e, 0x1145e, 0x114b3, 0x114b8, 0x114ba, 0x114ba, 0x114bf, 0x114c0,
  0x114c2, 0x114c3, 0x115b2, 0x115b5, 0x115bc, 0x115bd, 0x115bf, 0x115c0, 0x115dc, 0x115dd,
  0x11633, 0x1163a, 0x1163d, 0x1163d, 0x1163f, 0x11640, 0x116ab, 0x116ab, 0x116ad, 0x116ad,
  0x116b0, 0x116b5, 0x116b7, 0x116b7, 0x1171d, 0x1171d, 0x1171f, 0x1171f, 0x11722, 0x11725,
  0x11727, 0x1172b, 0x1182f, 0x11837, 0x11839, 0x1183a, 0x1193b, 0x1193c, 0x1193e, 0x1193e,
  0x11943, 0x11943, 0x119d4, 0x119d7, 0x119da, 0x119db, 0x119e0, 0x119e0, 0x11a01, 0x11a0a,
  0x11a33, 0x11a38, 0x11a3b, 0x11a3e, 0x11a47, 0x11a47, 0x11a51, 0x11a56, 0x11a59, 0x11a5b,
  0x11a8a, 0x11a96, 0x11a98, 0x11a99, 0x11b60, 0x11b60, 0x11b62, 0x11b64, 0x11b66, 0x11b66,
  0x11c30, 0x11c36, 0x11c38, 0x11c3d, 0x11c3f, 0x11c3f, 0x11c92, 0x11ca7, 0x11caa, 0x11cb0,
  0x11cb2, 0x11cb3, 0x11cb5, 0x11cb6, 0x11d31, 0x11d36, 0x11d3a, 0x11d3a, 0x11d3c, 0x11d3d,
  0x11d3f, 0x11d45, 0x11d47, 0x11d47, 0x11d90, 0x11d91, 0x11d95, 0x11d95, 0x11d97, 0x11d97,
  0x11ef3, 0x11ef4, 0x11f00, 0x11f01, 0x11f36, 0x11f3a, 0x11f40, 0x11f40, 0x11f42, 0x11f42,
  0x11f5a, 0x11f5a, 0x13430, 0x13440, 0x13447, 0x13455, 0x1611e, 0x16129, 0x1612d, 0x1612f,
  0x16af0, 0x16af4, 0x16b30, 0x16b36, 0x16f4f, 0x16f4f, 0x16f8f, 0x16f92, 0x16fe4, 0x16fe4,
  0x1bc9d, 0x1bc9e, 0x1bca0, 0x1bca3, 0x1cf00, 0x1cf2d, 0x1cf30, 0x1cf46, 0x1d167, 0x1d169,
  0x1d173, 0x1d182, 0x1d185, 0x1d18b, 0x1d1aa, 0x1d1ad, 0x1d242, 0x1d244, 0x1da00, 0x1da36,
  0x1da3b, 0x1da6c, 0x1da75, 0x1da75, 0x1da84, 0x1da84, 0x1da9b, 0x1da9f, 0x1daa1, 0x1daaf,
  0x1e000, 0x1e006, 0x1e008, 0x1e018, 0x1e01b, 0x1e021, 0x1e023, 0x1e024, 0x1e026, 0x1e02a,
  0x1e08f, 0x1e08f, 0x1e130, 0x1e136, 0x1e2ae, 0x1e2ae, 0x1e2ec, 0x1e2ef, 0x1e4ec, 0x1e4ef,
  0x1e5ee, 0x1e5ef, 0x1e6e3, 0x1e6e3, 0x1e6e6, 0x1e6e6, 0x1e6ee, 0x1e6ef, 0x1e6f5, 0x1e6f5,
  0x1e8d0, 0x1e8d6, 0x1e944, 0x1e94a, 0xe0001, 0xe0001, 0xe0020, 0xe007f, 0xe0100, 0xe01ef,
];

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
 * rather than inherited** (`F696`). It read *C12 and C09 gate those glyphs on this
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
 * pass's own finding on the Wide table, `F693`).
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
 * resting on it would forbid nothing (`F698`) — and what does settle it
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

/**
 * Every base of an emoji variation sequence outside ASCII — the code points a
 * font may draw in its emoji form, two cells wide, while every table above
 * says one (C09 I45, F823).
 *
 * **Derived from `emoji-variation-sequences.txt`, Unicode 17.0.0 (file dated
 * 2025-01-30), the `FE0F` rows.** 371 bases in the file; the 13 below U+0080
 * are excluded by construction and with the reason: `#`, `*` and `0`–`9` are
 * keycap bases that no terminal draws as emoji without their U+20E3, and they
 * are the alphabet the glyph tables degrade to — a rule that refused them would
 * refuse the ASCII rung itself (F832). 359 remain, as 180 ranges.
 *
 * **A test-time refusal and never a measurement.** `cells()` does not consult
 * this: terminals disagree about presentation, so a width that guessed at it
 * would be wrong differently on every machine, where one that ignores it is
 * wrong the same way everywhere and the tables can be chosen around it. The
 * consumers are C09 T2.112, T2.71 and A03 SS57, which refuse a character from
 * the vocabulary; nothing resizes one. Its first run over the tree found the
 * head mark `⏺` U+23FA, which F823 was written about, `ℹ` U+2139, which nobody
 * had asked about (F832), and then nine more in three families nobody had
 * measured — the `arrow` spinner's diagonals, two bar styles' squares, and a
 * `⚠` in the fixtures report (F833).
 */
const EMOJI_VARIATION_BASES: readonly number[] = [
  0x00a9, 0x00a9, 0x00ae, 0x00ae, 0x203c, 0x203c, 0x2049, 0x2049, 0x2122, 0x2122,
  0x2139, 0x2139, 0x2194, 0x2199, 0x21a9, 0x21aa, 0x231a, 0x231b, 0x2328, 0x2328,
  0x23cf, 0x23cf, 0x23e9, 0x23f3, 0x23f8, 0x23fa, 0x24c2, 0x24c2, 0x25aa, 0x25ab,
  0x25b6, 0x25b6, 0x25c0, 0x25c0, 0x25fb, 0x25fe, 0x2600, 0x2604, 0x260e, 0x260e,
  0x2611, 0x2611, 0x2614, 0x2615, 0x2618, 0x2618, 0x261d, 0x261d, 0x2620, 0x2620,
  0x2622, 0x2623, 0x2626, 0x2626, 0x262a, 0x262a, 0x262e, 0x262f, 0x2638, 0x263a,
  0x2640, 0x2640, 0x2642, 0x2642, 0x2648, 0x2653, 0x265f, 0x2660, 0x2663, 0x2663,
  0x2665, 0x2666, 0x2668, 0x2668, 0x267b, 0x267b, 0x267e, 0x267f, 0x2692, 0x2697,
  0x2699, 0x2699, 0x269b, 0x269c, 0x26a0, 0x26a1, 0x26a7, 0x26a7, 0x26aa, 0x26ab,
  0x26b0, 0x26b1, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26c8, 0x26c8, 0x26ce, 0x26cf,
  0x26d1, 0x26d1, 0x26d3, 0x26d4, 0x26e9, 0x26ea, 0x26f0, 0x26f5, 0x26f7, 0x26fa,
  0x26fd, 0x26fd, 0x2702, 0x2702, 0x2705, 0x2705, 0x2708, 0x270d, 0x270f, 0x270f,
  0x2712, 0x2712, 0x2714, 0x2714, 0x2716, 0x2716, 0x271d, 0x271d, 0x2721, 0x2721,
  0x2728, 0x2728, 0x2733, 0x2734, 0x2744, 0x2744, 0x2747, 0x2747, 0x274c, 0x274c,
  0x274e, 0x274e, 0x2753, 0x2755, 0x2757, 0x2757, 0x2763, 0x2764, 0x2795, 0x2797,
  0x27a1, 0x27a1, 0x27b0, 0x27b0, 0x27bf, 0x27bf, 0x2934, 0x2935, 0x2b05, 0x2b07,
  0x2b1b, 0x2b1c, 0x2b50, 0x2b50, 0x2b55, 0x2b55, 0x3030, 0x3030, 0x303d, 0x303d,
  0x3297, 0x3297, 0x3299, 0x3299, 0x1f004, 0x1f004, 0x1f170, 0x1f171, 0x1f17e, 0x1f17f,
  0x1f202, 0x1f202, 0x1f21a, 0x1f21a, 0x1f22f, 0x1f22f, 0x1f237, 0x1f237, 0x1f30d, 0x1f30f,
  0x1f315, 0x1f315, 0x1f31c, 0x1f31c, 0x1f321, 0x1f321, 0x1f324, 0x1f32c, 0x1f336, 0x1f336,
  0x1f378, 0x1f378, 0x1f37d, 0x1f37d, 0x1f393, 0x1f393, 0x1f396, 0x1f397, 0x1f399, 0x1f39b,
  0x1f39e, 0x1f39f, 0x1f3a7, 0x1f3a7, 0x1f3ac, 0x1f3ae, 0x1f3c2, 0x1f3c2, 0x1f3c4, 0x1f3c4,
  0x1f3c6, 0x1f3c6, 0x1f3ca, 0x1f3ce, 0x1f3d4, 0x1f3e0, 0x1f3ed, 0x1f3ed, 0x1f3f3, 0x1f3f3,
  0x1f3f5, 0x1f3f5, 0x1f3f7, 0x1f3f7, 0x1f408, 0x1f408, 0x1f415, 0x1f415, 0x1f41f, 0x1f41f,
  0x1f426, 0x1f426, 0x1f43f, 0x1f43f, 0x1f441, 0x1f442, 0x1f446, 0x1f449, 0x1f44d, 0x1f44e,
  0x1f453, 0x1f453, 0x1f46a, 0x1f46a, 0x1f47d, 0x1f47d, 0x1f4a3, 0x1f4a3, 0x1f4b0, 0x1f4b0,
  0x1f4b3, 0x1f4b3, 0x1f4bb, 0x1f4bb, 0x1f4bf, 0x1f4bf, 0x1f4cb, 0x1f4cb, 0x1f4da, 0x1f4da,
  0x1f4df, 0x1f4df, 0x1f4e4, 0x1f4e6, 0x1f4ea, 0x1f4ed, 0x1f4f7, 0x1f4f7, 0x1f4f9, 0x1f4fb,
  0x1f4fd, 0x1f4fd, 0x1f508, 0x1f508, 0x1f50d, 0x1f50d, 0x1f512, 0x1f513, 0x1f549, 0x1f54a,
  0x1f550, 0x1f567, 0x1f56f, 0x1f570, 0x1f573, 0x1f579, 0x1f587, 0x1f587, 0x1f58a, 0x1f58d,
  0x1f590, 0x1f590, 0x1f5a5, 0x1f5a5, 0x1f5a8, 0x1f5a8, 0x1f5b1, 0x1f5b2, 0x1f5bc, 0x1f5bc,
  0x1f5c2, 0x1f5c4, 0x1f5d1, 0x1f5d3, 0x1f5dc, 0x1f5de, 0x1f5e1, 0x1f5e1, 0x1f5e3, 0x1f5e3,
  0x1f5e8, 0x1f5e8, 0x1f5ef, 0x1f5ef, 0x1f5f3, 0x1f5f3, 0x1f5fa, 0x1f5fa, 0x1f610, 0x1f610,
  0x1f687, 0x1f687, 0x1f68d, 0x1f68d, 0x1f691, 0x1f691, 0x1f694, 0x1f694, 0x1f698, 0x1f698,
  0x1f6ad, 0x1f6ad, 0x1f6b2, 0x1f6b2, 0x1f6b9, 0x1f6ba, 0x1f6bc, 0x1f6bc, 0x1f6cb, 0x1f6cb,
  0x1f6cd, 0x1f6cf, 0x1f6e0, 0x1f6e5, 0x1f6e9, 0x1f6e9, 0x1f6f0, 0x1f6f0, 0x1f6f3, 0x1f6f3,
];

/**
 * U+FE0E — *draw the preceding character as text, not as an emoji* (C09 I45).
 *
 * **The remedy rather than the refusal** (F854). A base written bare is drawn
 * two cells wide by a font that prefers the emoji form; qualified by this
 * selector it is drawn as a glyph, and `cells()` counts the selector zero — so
 * the pair measures what every width table says the base measures.
 *
 * Exported because it is the answer the rule points at: SS57 names it in its
 * message, and `blocks.test.ts` reads it rather than spelling a second copy.
 */
export const TEXT_PRESENTATION = "\ufe0e";

/** Whether `cp` has an emoji presentation form — see `EMOJI_VARIATION_BASES`. */
export function hasEmojiForm(cp: number): boolean {
  return inRanges(cp, EMOJI_VARIATION_BASES);
}
