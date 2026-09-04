/**
 * C25 §2 — one row, and the two palettes on it.
 *
 * Every row in a patch uses two palettes at once: a tone in the gutter and
 * `syntax` slots in the text. That is the case C10 I16 was widened for, and in a
 * patch it is the **general** case rather than an exception on some lines (I12).
 *
 * **All three line kinds are syntax-highlighted, and only the gutter varies.** The
 * one well-known renderer that leaves removed lines plain gives its reason as
 * keeping them simple beneath a red deletion background, which is a fact about the
 * strength of its background rather than about diffs — and with a subtle background
 * the premise does not transfer. C25 §2 records the experiment that would overturn
 * it.
 *
 * **The background covers the row to its full width.** A background that stops
 * where the text stops is ragged, and the row is the unit a reader sees. So every
 * row is padded to `layout.width` and the padding carries the background, and every
 * row leaves this file through one `line()` — which is what makes I9's clamp
 * mechanical rather than remembered. C12 needed the same funnel and found out the
 * hard way: nineteen rendered rows against a declared five, because one row skipped
 * the clamp and the terminal wrapped every one of them.
 */
import { sliceTokens, tokenise, type Token } from "../blocks/index.js";
import { runsOf, sliceRuns } from "../runs.js";
import {
  background,
  clampSpans,
  pad,
  padStart,
  paint,
  slot,
  spanCells,
  tone,
  withBackground,
  withSpan,
  type Span,
} from "../blocks/paint.js";
import { truncateParts } from "../text.js";
import type { Hunk, TextSpan, Tone } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { PatchLayout } from "./layout.js";

type Line = Hunk["lines"][number];
type Kind = Line["kind"];

/** §3's table. The marker is not decoration — D29 forbids colour carrying it alone. */
const MARKERS: Readonly<Record<Kind, string>> = Object.freeze({
  add: "+",
  remove: "-",
  context: " ",
});

const TONES: Readonly<Record<Kind, Tone>> = Object.freeze({
  add: "ok",
  remove: "error",
  context: "muted",
});

/** The surface a row's background comes from, or none for an unchanged line. */
const SURFACES: Readonly<Record<Kind, string | null>> = Object.freeze({
  add: "surface.diffAdd",
  remove: "surface.diffRemove",
  context: null,
});

/**
 * The one exit from this module.
 *
 * Pads to the full width, applies the row's background to every span including the
 * padding, and clamps. In that order: the pad is what the background needs to cover
 * and the clamp is what the terminal needs in order not to wrap.
 */
export function line(spans: readonly Span[], kind: Kind, layout: PatchLayout, ctx: RenderContext): string {
  const clamped = clampSpans(spans, layout.width, ctx.capabilities);
  const short = layout.width - spanCells(clamped);
  const filled: readonly Span[] = short <= 0 ? clamped : [...clamped, { text: " ".repeat(short) }];

  return paint(dress(filled, kind, ctx));
}

/**
 * A run of spans, given the background its line kind calls for.
 *
 * **In split layout the background belongs to a side, not to a row**, and reading a
 * frame is what said so: a paired row has a removed line on the left and an added
 * one on the right, so painting the row one colour claims a change on the side that
 * did not have one — and the blank facing an unpaired add came out green across its
 * whole width, asserting that the left had gained the line too. So the split path
 * dresses each half and passes `context` for the row, and `unified` dresses the row
 * because a unified row *is* one side.
 *
 * The background arrives through C10's `resolveBackground` rather than by moving a
 * foreground value across, so the two channels cannot degrade differently (C10
 * I21), and `withBackground` merges rather than replaces so a span cannot gain a
 * background and lose its foreground.
 */
export function dress(spans: readonly Span[], kind: Kind, ctx: RenderContext): readonly Span[] {
  const surface = SURFACES[kind];
  if (surface === null) return spans;

  const behind = background(surface as ColourRef, ctx.theme, ctx.capabilities);
  if (behind.background === undefined) return spans;

  return spans.map((span) => ({ text: span.text, style: withBackground(span.style, behind) }));
}

/**
 * A line's gutter: two number columns, then the marker, all in the line's tone.
 *
 * **The gutter is toned, not neutral chrome** (§2). A removed row reads as one red
 * unit rather than as grey numbers beside red text, and a coloured number is
 * visibly decoration — which is the argument for a non-selectable gutter that C14
 * inherits as a question.
 *
 * A line missing a number renders a blank column rather than shifting the gutter,
 * because a shifted gutter is what the two-column decision exists to prevent.
 */
export function gutterSpans(
  line: Line,
  layout: PatchLayout,
  ctx: RenderContext,
  side?: "old" | "new",
): readonly Span[] {
  const style = tone(TONES[line.kind], ctx.theme, ctx.capabilities);
  const spans: Span[] = [];

  if (layout.numbers > 0) {
    const shown = side === undefined ? ["old", "new"] : [side];
    for (const which of shown) {
      const no = which === "old" ? line.oldNo : line.newNo;
      spans.push({ text: padStart(no === undefined ? "" : String(no), layout.numbers), style });
      spans.push({ text: " " });
    }
  }

  spans.push({ text: MARKERS[line.kind], style });
  spans.push({ text: " " });
  return spans;
}

/**
 * A line's text, tokenised and truncated.
 *
 * **Truncated, never wrapped** (I2). A wrapped diff line destroys the gutter
 * alignment that makes a diff readable, and that is a claim about alignment rather
 * than about arithmetic — `logs` makes the same call for the same reason. The
 * tokens are sliced to the kept portion by C09's own slicer, because cutting them
 * twice in two files is how the two come to disagree about where a token ends.
 *
 * **Two run streams over one text, merged by slicing** (C25 I10). The syntax
 * tokens carry colour and the line's `spans` carry an attribute — the collision
 * C04 I88 refuses on `code` is admitted here because the channels differ. The
 * spans become runs through `runsOf` (so a boundary inside a cluster snaps, C04
 * I84), are cut to the kept portion, and the token stream is then sliced at each
 * run's boundary and given the run's attributes by `withSpan`. A token cut in two
 * keeps its slot on both halves; the truncation marker is appended after and
 * takes no run's attributes, because it is not text the span was written over.
 */
export function textSpans(
  text: string,
  language: string,
  budget: number,
  ctx: RenderContext,
  lineSpans?: readonly TextSpan[],
): readonly Span[] {
  if (budget <= 0) return [];

  // **`truncateParts` rather than `truncate`**, and the difference was visible only
  // in a golden. `truncate` returns the marker *inside* the string, so slicing the
  // token stream to its length consumes one character more of the source than the
  // row shows — the marker is not a token — and the effect is that the marker is
  // silently dropped. A 10,000-character line came out cut mid-word at exactly the
  // width, with nothing saying it had been cut, which is the one truncation defect a
  // reader cannot detect. `code.ts` reaches for the same helper for the same reason.
  const { kept, suffix } = truncateParts(text, budget, ctx.capabilities);
  const tokens: readonly Token[] = sliceTokens(tokenise(text, language), 0, kept.length); // cells-ok
  const fallback = tone("default", ctx.theme, ctx.capabilities);

  const styled = (token: Token): Span => ({
    text: token.text,
    style:
      token.slot === null ? fallback : slot(`syntax.${token.slot}`, ctx.theme, ctx.capabilities),
  });

  const spans: Span[] = [];
  if (lineSpans === undefined || lineSpans.length === 0) { // cells-ok — a span count
    spans.push(...tokens.map(styled));
  } else {
    let at = 0;
    for (const run of sliceRuns(runsOf(text, lineSpans), 0, kept.length)) { // cells-ok
      for (const token of sliceTokens(tokens, at, run.text.length)) { // cells-ok — a code-unit length
        const base = styled(token);
        spans.push(run.attrs === undefined ? base : { text: base.text, style: withSpan(base.style ?? {}, run.attrs) });
      }
      at += run.text.length; // cells-ok — a code-unit cursor
    }
  }

  if (suffix !== "") spans.push({ text: suffix, style: fallback });

  return spans;
}

/** A row of padding on one side of a split layout — the blank an unpaired line faces. */
export function blankSide(layout: PatchLayout): readonly Span[] {
  return [{ text: pad("", layout.gutter + layout.text) }];
}
