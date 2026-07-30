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
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import { SGR_RESET, sgr } from "../../terminal/escapes.js";
import { resolve, resolveBackground, resolveTone, type Style } from "../theme/index.js";
import type { ColourRef, ResolvedTheme } from "../theme/index.js";
import type { Tone } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells, truncate } from "../text.js";

/** A run of text and the style it carries. Width is the text's, never the run's. */
export type Span = Readonly<{ text: string; style?: Style }>;

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
 * function rather than a flag because the two are not interchangeable — C10 I22
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

/** The display width of a row of spans, measured on the text and not the styling. */
export function spanCells(spans: readonly Span[]): number {
  let total = 0;
  for (const span of spans) total += cells(span.text);
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
export function pad(text: string, width: number): string {
  const short = width - cells(text);
  return short <= 0 ? text : text + " ".repeat(short);
}

/** Pad on the left — the right-aligned column of a `keyValue` or a table. */
export function padStart(text: string, width: number): string {
  const short = width - cells(text);
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
  caps: Pick<TerminalCapabilities, "unicode">,
): readonly Span[] {
  const limit = Math.max(0, Math.floor(width));
  if (spanCells(spans) <= limit) return spans;

  const out: Span[] = [];
  let used = 0;
  for (const span of spans) {
    const w = cells(span.text);
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
  // I17's floor, applied where every non-container renderer ends rather than in
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
