/**
 * The runtime grammar for `TextSpan.foreground` references carried by C04 data.
 *
 * Exactly one separator keeps `palette.slot` unambiguous. Names are bounded to
 * portable identifier characters on this path: letters, digits, `_` and `-`,
 * while whitespace, control characters and nested path-like forms are refused
 * before presentation. The slot may begin with a digit (`spectrum.0`); neither
 * half may be empty.
 */
const SPAN_FOREGROUND_REF = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

/**
 * Parse one semantic span foreground, or return `null` without throwing.
 *
 * This is deliberately narrower than generic C10 `resolve`, whose public
 * `ColourRef` contract splits on the first dot and permits dots in slot keys.
 * C04 validation and C10's span-only resolver share this parser.
 */
export function parseSpanForegroundRef(value: unknown): readonly [string, string] | null {
  if (typeof value !== "string") return null;
  const match = SPAN_FOREGROUND_REF.exec(value);
  if (match === null) return null;
  const palette = match[1];
  const slot = match[2];
  return palette === undefined || slot === undefined ? null : [palette, slot];
}
