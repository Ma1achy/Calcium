/**
 * Rows, spans and the one place SGR is applied.
 *
 * Every kind builds **plain text rows first** and styles them last. That order
 * is what keeps `cells()` meaningful: a styled string carries sequences that
 * occupy no columns, so measuring one is measuring the wrong thing, and every
 * width decision in this component is taken before any style is applied.
 *
 * The rows a renderer produces are the rows the frame occupies (I1). Ink paints
 * them and lays out no text of its own (C09 §3).
 */
import type { AmbiguousWidth } from "../text.js";
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import { SGR_RESET, sgr } from "../../terminal/escapes.js";
import { resolve, resolveBackground, resolveTone, type Style } from "../theme/index.js";
import type { ColourRef, ColourValue, ResolvedTheme } from "../theme/index.js";
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import type { ColormapName, Tone } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells, truncate } from "../text.js";
import type { Run, SpanAttrs } from "../runs.js";

/** A run of text and the style it carries. Width is the text's, never the run's. */
export type Span = Readonly<{ text: string; style?: Style }>;

/**
 * A run's attributes onto the style its block resolved (C10 I33, C04 I85).
 *
 * **A spread, and it touches neither colour channel.** The span contributes at
 * most `bold`, `italic` and `underline`; `colour` and `background` are the
 * tone's and `withBackground`'s, so a span never enters `MONO`, the ladder or a
 * floor — there is no colour for a floor to be about. Returning `style` itself
 * when there is nothing to add is what lets `paintRuns` coalesce unstyled
 * pieces by reference and keep a plain row's bytes exactly what they were.
 */
export function withSpan(style: Style, attrs: SpanAttrs | undefined): Style {
  return attrs === undefined ? style : { ...style, ...attrs };
}

/**
 * What a run needs beyond the block's style to be painted: the theme and
 * capabilities every renderer already holds, and the block's `colormap` by
 * name where the block has one (C04 I90). Structural, so a `RenderContext`
 * satisfies the first two by itself.
 */
export type RunContext = Readonly<{
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  colormap?: ColormapName;
}>;

/**
 * A run's style: the block's, or its span's tone in place of it; the span's
 * attributes spread on top; and its value as a background (C10 I33, C04 I89,
 * C04 I90).
 *
 * **Each colour comes from the resolver its owner already has.** A `tone` goes
 * through `resolveTone` — the same call, the same memo, so two runs of one tone
 * are one reference and coalesce below — and *replaces* `style`, because a run
 * cannot be two tones. A `value` goes through `continuousColour` on the block's
 * map, so the ladder is the colormap's: `undefined` below 8-bit, and the run
 * then paints as its neighbours do and coalesces with them by reference — a
 * 4-bit frame is byte-identical with and without the value (C10 I31). The gate
 * refused a `value` on a block with no map, so the `colormap === undefined`
 * arm is a total function's and not a branch anything reaches.
 */
export function runStyle(run: Run, style: Style, ctx: RunContext): Style {
  const base = run.tone === undefined ? style : resolveTone(run.tone, ctx.theme, ctx.capabilities);
  const merged = withSpan(base, run.attrs);
  if (run.value === undefined || ctx.colormap === undefined) return merged;
  const map = COLORMAPS[ctx.colormap];
  const background = map === undefined ? undefined : continuousColour(map, run.value, ctx.capabilities);
  return background === undefined ? merged : { ...merged, background };
}

/**
 * Runs to spans, adjacent runs of one style merged.
 *
 * The merge is by reference — `runStyle` returns `style` unchanged for a run
 * with nothing to say — so a row with no spans paints as the single span it
 * always was, and a styled run breaks the row into exactly the pieces its
 * members require. A `paint` that closed and reopened the same style between
 * two plain pieces would change every golden frame while drawing the same thing.
 */
export function paintRuns(runs: readonly Run[], style: Style, ctx: RunContext): readonly Span[] {
  const out: { text: string; style: Style }[] = [];
  for (const run of runs) {
    const merged = runStyle(run, style, ctx);
    const last = out[out.length - 1]; // cells-ok — an array index
    if (last !== undefined && last.style === merged) last.text += run.text;
    else out.push({ text: run.text, style: merged });
  }
  return out;
}

/** A tone, resolved. The only way a renderer obtains a style (I4). */
export function tone(
  name: Tone,
  theme: ResolvedTheme,
  caps: TerminalCapabilities,
): Style {
  return resolveTone(name, theme, caps);
}

/**
 * A palette slot other than `tone`, resolved. `code` is the only kind that
 * names one (commitment 4, A03 SS20), and it names `syntax`.
 */
export function slot(
  ref: ColourRef,
  theme: ResolvedTheme,
  caps: TerminalCapabilities,
): Style {
  return resolve(ref, theme, caps);
}

/**
 * A surface, resolved into the **background** channel (C10 §4a).
 *
 * `slot` and `tone` fill `colour`; this fills `background`, and it is a separate
 * function rather than a flag because the two are not interchangeable — C10 I21
 * takes a background only from a `surface` ref, since §4's floors are measured for
 * text *on* a surface and never for a tone behind it.
 *
 * C25 is the only consumer and the only kind that paints a background at all.
 */
export function background(
  ref: ColourRef,
  theme: ResolvedTheme,
  caps: TerminalCapabilities,
): Style {
  return resolveBackground(ref, theme, caps);
}

/**
 * Two palettes on one span: a foreground from one, a background from another.
 *
 * The composition C10 I16 was widened for, in the one place it happens. Written as
 * a merge rather than as two style objects at the call site so a span cannot end up
 * carrying a background and losing its foreground, which is the shape of every
 * mistake this seam invites.
 */
export function withBackground(style: Style | undefined, surface: Style): Style {
  return surface.background === undefined ? (style ?? {}) : { ...style, background: surface.background };
}

/**
 * A run of blank cells whose **background is the datum** (C10 §4c, C12 I29).
 *
 * **A `Span` rather than a `Style`, and that is the whole guarantee.** C10 I21
 * admits a background only from a `surface` ref, because a tone painted behind
 * text is a tone nothing measured a contrast floor for. A matrix cell painted
 * with a colormap value has no text to be illegible — it is a blank cell whose
 * colour *is* the reading — so the floor has nothing to constrain, and that is
 * the one case I21 was widened for.
 *
 * Returning the span means the widening cannot be misused: the text is built
 * here, blank, and there is no way to hand the colour to a glyph. The
 * alternative — a `Style` the caller is trusted to pair with blanks — is a
 * convention, and this component has already paid for four call sites each
 * honouring one.
 *
 * `paint` emits `48` for the background exactly as it does for C25's wash, so
 * nothing downstream changes.
 */
export function wash(width: number, colour: ColourValue): Span {
  const cells = Math.max(0, Math.floor(width));
  return { text: " ".repeat(cells), style: { background: colour } };
}

/** The display width of a row of spans, measured on the text and not the styling. */
export function spanCells(spans: readonly Span[], ambiguous: AmbiguousWidth = "narrow"): number {
  let total = 0;
  for (const span of spans) total += cells(span.text, ambiguous);
  return total;
}

/**
 * Spans to one printable row.
 *
 * The reset closes each styled run rather than the row, so an unstyled span
 * after a styled one is genuinely unstyled — a renderer that reset only at the
 * end would bleed the last colour across everything that followed it.
 */
export function paint(spans: readonly Span[]): string {
  let out = "";
  for (const span of spans) {
    if (span.text === "") continue;
    const opening = span.style === undefined ? "" : sgr(span.style);
    out += opening === "" ? span.text : `${opening}${span.text}${SGR_RESET}`;
  }
  return out;
}

/** Pad a plain string to `width` cells. Wider input is returned unchanged. */
export function pad(text: string, width: number, ambiguous: AmbiguousWidth = "narrow"): string {
  const short = width - cells(text, ambiguous);
  return short <= 0 ? text : text + " ".repeat(short);
}

/** Pad on the left — the right-aligned column of a `keyValue` or a table. */
export function padStart(text: string, width: number, ambiguous: AmbiguousWidth = "narrow"): string {
  const short = width - cells(text, ambiguous);
  return short <= 0 ? text : " ".repeat(short) + text;
}

/**
 * Fit a plain string to exactly `width` cells: truncate if long, pad if short.
 * The two operations that must agree with the measurer, in one place.
 */
export function fit(
  text: string,
  width: number,
  caps: Pick<TerminalCapabilities, "unicode">,
): string {
  return pad(truncate(text, width, caps), width);
}

/**
 * Clamp a row of spans to `width` cells, truncating the span that crosses the
 * boundary and dropping the rest.
 *
 * Every single-row kind ends here, and that is deliberate: a row one cell over
 * its width is a row the terminal wraps itself, adding a line to the frame that
 * no measurer counted. Arithmetic that is exact at 80 columns is rarely exact
 * at 12, and the kinds whose height is "1" are precisely the ones with no room
 * to absorb a mistake.
 *
 * The truncation marker is the capability-appropriate one, so the clamp cannot
 * reintroduce the `...` regression at a narrow width (I5).
 */
export function clampSpans(
  spans: readonly Span[],
  width: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): readonly Span[] {
  const limit = Math.max(0, Math.floor(width));
  if (spanCells(spans, caps.ambiguousWidth) <= limit) return spans;

  const out: Span[] = [];
  let used = 0;
  for (const span of spans) {
    const w = cells(span.text, caps.ambiguousWidth);
    if (used + w <= limit) {
      out.push(span);
      used += w;
      continue;
    }
    const room = limit - used;
    if (room > 0) {
      const cut = truncate(span.text, room, caps);
      out.push(span.style === undefined ? { text: cut } : { text: cut, style: span.style });
    }
    break;
  }
  return out;
}

/**
 * Rows to an element.
 *
 * A blank row is painted as a single space. Ink drops an empty `Text` — a
 * column of `["a", "", "b"]` renders two rows, not three — so a measurer
 * counting the blank and a renderer losing it disagree by one, which is I1
 * violated by the framework rather than by the kind.
 */
export function rows(lines: readonly string[]): ReactElement {
  // I14's floor, applied where every non-container renderer ends rather than in
  // each of them: a block that is present occupies at least one row, so a
  // `logs` with no lines renders one blank row rather than nothing. The
  // containers do not come through here, which is what keeps the one legitimate
  // zero — an empty `group` — expressible.
  const floored = lines.length === 0 ? [""] : lines; // cells-ok

  return createElement(
    Box,
    { flexDirection: "column" },
    floored.map((line, index) =>
      createElement(Text, { key: index }, line === "" ? " " : line),
    ),
  );
}

/** One row, as an element. */
export function row(spans: readonly Span[]): ReactElement {
  return rows([paint(spans)]);
}
