// Reading Ink's own layout, for the tests that hold it to agreement with ours.
//
// C09 §3: Ink paints pre-broken lines, but it still measures text for box
// sizing with its own implementation. Two implementations of one number, and
// the duplication cannot be removed — only pinned (C09 T2.16).
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";

/**
 * The width Ink lays `text` out at, in cells.
 *
 * Read off a right-aligned box rather than from Ink's internals: a box of known
 * width filled from the end pads by `width - measured`, so the leading spaces
 * are Ink's answer. Reading the internals would pin a private function; this
 * pins the number that actually decides where a line breaks.
 */
export function inkWidth(text: string, box = 120): number {
  const element = createElement(
    Box,
    { width: box, justifyContent: "flex-end" },
    createElement(Text, null, text),
  );
  const first = renderToString(element, { columns: box }).split("\n")[0] ?? "";

  // Spaces counted explicitly, not by `trimStart`. `trimStart` treats U+FEFF as
  // whitespace and eats it along with the padding, which reported a
  // byte-order-marked string as one cell narrower than Ink actually laid it
  // out — a defect in the instrument that reads exactly like a defect in
  // `cells()`. Ink pads with U+0020 and nothing else.
  let leading = 0;
  while (first[leading] === " ") leading += 1;
  return box - leading;
}

/** Render an element at `width` and return the rows it occupies. */
export function renderToLines(element: Parameters<typeof renderToString>[0], width: number): readonly string[] {
  return renderToString(element, { columns: width }).split("\n");
}
