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
 * Control characters, stripped before anything is measured or drawn (C09 I14).
 *
 * C0 except tab and newline — tab is expanded rather than dropped, and a
 * newline is a break the wrapper acts on — plus delete and C1. A tool's output
 * cannot inject an escape sequence into the frame, so this runs on the way in
 * rather than being trusted not to happen.
 *
 * A code-point test rather than a character class, because writing the class
 * means writing the escape character into a file that is not
 * `terminal/escapes.ts` (C01 I1, A03 SS14). The range is the same either way;
 * only one of the two forms can be written here.
 */
function isControl(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a) return false; // tab, newline
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

/** A tab stop, in cells. Fixed rather than configurable — see `expandTabs`. */
export const TAB_STOP = 8;

/** Every text field passes through here before it is measured or rendered. */
export function stripControl(text: string): string {
  let clean = true;
  for (const ch of text) {
    if (isControl(ch.codePointAt(0) ?? 0)) {
      clean = false;
      break;
    }
  }
  if (clean) return text;

  let out = "";
  for (const ch of text) {
    if (!isControl(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

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
 * Display width in terminal cells, grapheme-aware.
 *
 * A cluster is measured as a unit: a ZWJ family emoji is 2 cells, not 2 per
 * component; a base plus combining marks is the base's width; a variation
 * selector adds nothing of its own.
 */
export function cells(text: string): number {
  if (text === "") return 0;
  let total = 0;
  for (const { segment } of GRAPHEMES.segment(stripControl(text))) {
    total += clusterCells(segment);
  }
  return total;
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
function clusterCells(cluster: string): number {
  const points = [...cluster];
  const base = points[0]?.codePointAt(0);
  if (base === undefined) return 0;
  if (isZeroWidth(base)) return 0;

  if (points.some((p) => p.codePointAt(0) === 0xfe0f)) return 2;
  if (isRegionalIndicator(base)) return 2;

  return isWide(base) ? 2 : 1;
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

  let out = "";
  let used = 0;
  for (const { segment } of GRAPHEMES.segment(clean)) {
    const w = clusterCells(segment);
    if (used + w > budget) break;
    out += segment;
    used += w;
  }

  // A double-width glyph refused at the boundary leaves a cell to fill, so the
  // result is exactly `limit` cells rather than `limit - 1`.
  return out + " ".repeat(budget - used) + marker;
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

  for (const { segment } of GRAPHEMES.segment(text)) {
    const w = clusterCells(segment);
    if (w > limit) continue;
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
    for (const { segment } of GRAPHEMES.segment(paragraph)) {
      const w = clusterCells(segment);

      // A cluster wider than the whole line can never be placed. At width 1 a
      // CJK glyph is exactly that, and drawing it anyway puts two cells in a
      // one-cell row — which the terminal wraps into a row nobody counted.
      // Dropping it is the only option that keeps the geometry honest, and both
      // halves drop it, because both call this.
      if (w > limit) continue;

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
