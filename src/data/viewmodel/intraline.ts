/**
 * C25 I10 / C04 I91 — the intra-line diff: the writer for `Hunk.lines[].spans`.
 *
 * **Once, at construction, and never at render.** C25 I7 keeps the renderer pure
 * over the block, and C25 §9 names the intra-line diff as where diff viewers get
 * slow — a second diff algorithm per changed line, per frame, if it lived in the
 * renderer. So it lives here, one layer below the builder that calls it, and the
 * renderer paints whatever the line carries.
 *
 * **The pairing is the renderer's, shared rather than restated.** Split layout
 * draws the *n*th remove of a run beside the *n*th add (C25 §2), and `changedRuns`
 * is the grouping both that drawing and this diff read — so the underline on the
 * left half of a split row is the underline of the change on its right half. A
 * second grouping here would be a second place for the two to disagree, and the
 * disagreement would be visible only in a frame.
 *
 * **Attributes only.** The spans written here carry `underline: true` and nothing
 * else: a hunk line's two palettes are the gutter's and the syntax's, and the
 * gate refuses `tone` and `value` on one (C04 I91). C10 §4a is why the carrier is
 * an underline and not a background — the tint budget is spent by the line
 * background, and an attribute survives 1-bit where a surface does not.
 */
import type { Hunk, TextSpan } from "./types.js";

type Line = Hunk["lines"][number];

/** A maximal run of consecutive changed lines, the unit split layout pairs (C25 §2). */
export type ChangedRun = Readonly<{ removes: readonly Line[]; adds: readonly Line[] }>;

/**
 * The most tokens a side may have and still be diffed (C25 I10).
 *
 * The LCS below is O(n·m) in a table of `(n + 1) × (m + 1)` cells, so this bounds
 * a pair at 40 401 cells. Above it the pair emits no spans — the line background
 * still says the line changed — and the number is a constant so the suite
 * asserts the boundary rather than a point on one side of it (C25 T1.11).
 */
export const INTRALINE_TOKEN_CAP = 200;

/**
 * A hunk's lines grouped into the runs split layout pairs and unified does not.
 *
 * A context line is its own entry; every maximal stretch of changed lines is one
 * `ChangedRun` holding its removes and its adds in order. C25's `definition.ts`
 * draws from this and `intralineLines` diffs from it, which is what makes the two
 * agree by construction.
 */
export function changedRuns(lines: readonly Line[]): readonly (Line | ChangedRun)[] {
  const out: (Line | ChangedRun)[] = [];
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

/** A token of the intra-line diff: its text and its code-unit offsets in the line. */
type Token = Readonly<{ text: string; from: number; to: number; blank: boolean }>;

/**
 * The token rule (C25 I10): a run of letters, digits, marks or `_` is one token, a
 * run of whitespace is one token, and every other character is a token of its
 * own. Marks stay with their base so a boundary never lands inside a cluster the
 * writer can see; one it cannot (a ZWJ sequence) is snapped by `runsOf` (C04
 * I84), so the rule here need not be cluster-aware to be safe.
 */
const TOKEN = /[\p{L}\p{N}\p{M}_]+|\s+|[^\p{L}\p{N}\p{M}_\s]/gu;

function wordTokens(text: string): readonly Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const from = m.index ?? 0;
    const piece = m[0];
    out.push({ text: piece, from, to: from + piece.length, blank: /^\s+$/u.test(piece) }); // cells-ok — a code-unit offset
  }
  return out;
}

/**
 * Which tokens of each side are *not* on a longest common subsequence.
 *
 * The table is filled from the end so the backtrack walks forward; a tie between
 * skipping a removed token and skipping an added one skips the removed one first,
 * which is one deterministic answer among several equally long ones — the suite
 * asserts the set of changed tokens, never which instance of a repeated token
 * moved.
 */
function unmatched(a: readonly Token[], b: readonly Token[]): Readonly<{ a: boolean[]; b: boolean[] }> {
  const n = a.length; // cells-ok — a token count
  const m = b.length; // cells-ok — a token count
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const here = i * width + j;
      table[here] =
        a[i]?.text === b[j]?.text
          ? (table[here + width + 1] ?? 0) + 1
          : Math.max(table[here + width] ?? 0, table[here + 1] ?? 0);
    }
  }

  const changedA = new Array<boolean>(n).fill(true);
  const changedB = new Array<boolean>(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]?.text === b[j]?.text) {
      changedA[i] = false;
      changedB[j] = false;
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { a: changedA, b: changedB };
}

/** Adjacent changed tokens merged into one span, carrying `underline` and nothing else. */
function spansOf(tokens: readonly Token[], changed: readonly boolean[]): readonly TextSpan[] {
  const out: TextSpan[] = [];
  let open: { from: number; to: number } | null = null;
  const close = (): void => {
    if (open !== null) out.push({ from: open.from, to: open.to, underline: true });
    open = null;
  };
  for (let k = 0; k < tokens.length; k += 1) { // cells-ok — a token count
    const token = tokens[k];
    if (token === undefined || changed[k] !== true) {
      close();
      continue;
    }
    if (open !== null && open.to === token.from) open.to = token.to;
    else {
      close();
      open = { from: token.from, to: token.to };
    }
  }
  close();
  return out;
}

/**
 * The spans for one paired remove/add line (C25 I10).
 *
 * Empty on both sides when the pair is over the cap, when the two lines share no
 * non-whitespace token — every token underlined on both sides restates the line
 * background and distinguishes nothing — or when nothing differs. Whitespace is a
 * token, so a re-indent or a trailing space is a change with an underline under
 * it: `underline` is the one channel visible on a blank cell.
 */
export function intralineSpans(
  removed: string,
  added: string,
): Readonly<{ removed: readonly TextSpan[]; added: readonly TextSpan[] }> {
  const NONE = Object.freeze({ removed: [], added: [] });
  const a = wordTokens(removed);
  const b = wordTokens(added);
  if (a.length > INTRALINE_TOKEN_CAP || b.length > INTRALINE_TOKEN_CAP) return NONE; // cells-ok — token counts

  const changed = unmatched(a, b);
  // The unrelated ruling: a shared token that is not whitespace, or nothing.
  const related = a.some((token, k) => !token.blank && changed.a[k] !== true);
  if (!related) return NONE;

  return { removed: spansOf(a, changed.a), added: spansOf(b, changed.b) };
}

/**
 * A hunk's lines with the intra-line diff written onto every paired line.
 *
 * Within each `ChangedRun` the *n*th remove is diffed against the *n*th add and
 * both lines receive their spans; the unpaired tail of a lopsided run, and every
 * `context` line, carry none. **A line the caller already gave spans is left
 * alone, and so is its partner** — one writer does not overwrite another's work,
 * and it is what makes `b.patch` idempotent over its own output.
 */
export function intralineLines(lines: readonly Line[]): readonly Line[] {
  // Keyed by the line object, because a run's removes and adds may interleave
  // (`-a +b -c +d` is one run) and the document's order is not the pairing's.
  // Re-emitting removes-then-adds would reorder the hunk; mapping over `lines`
  // cannot.
  const written = new Map<Line, Line>();
  for (const group of changedRuns(lines)) {
    if ("kind" in group) continue;
    const paired = Math.min(group.removes.length, group.adds.length); // cells-ok — line counts
    for (let i = 0; i < paired; i += 1) {
      const left = group.removes[i];
      const right = group.adds[i];
      if (left === undefined || right === undefined) continue;
      if (left.spans !== undefined || right.spans !== undefined) continue;
      const spans = intralineSpans(left.text, right.text);
      if (spans.removed.length > 0) written.set(left, { ...left, spans: spans.removed }); // cells-ok — a span count
      if (spans.added.length > 0) written.set(right, { ...right, spans: spans.added }); // cells-ok — a span count
    }
  }
  return written.size === 0 ? lines : lines.map((line) => written.get(line) ?? line); // cells-ok — a map size
}
