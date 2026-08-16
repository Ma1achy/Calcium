/**
 * A Mermaid diagram as a `code` block — a transform in front, and nothing else
 * (roadmap 9).
 *
 * **Thin on purpose, and the maintenance signal is why.** `beautiful-mermaid`
 * published ten releases in its first month and nothing for five and a half
 * after; finished and abandoned look identical at that range. So the package
 * appears at exactly one call site: if it dies, what is lost is this function's
 * body. The block, the capability mapping and the rows that assert them survive
 * a replacement, and none of the renderer's options reach the block's shape.
 *
 * **Its ASCII switch is the tier `ambiguousWidth` just built.** The unicode
 * output is box drawing — `┌ ─ ┐ │ ▼ ◇ ├` — which is `East_Asian_Width=
 * Ambiguous` throughout, so it is one cell where the terminal says narrow and
 * two where it says wide, and a diagram whose glyphs double is not a diagram.
 * `useAscii` is therefore the wide arm as well as the ASCII one: the renderer's
 * own switch and C02 I9's are the same switch, which is what `glyphs()` already
 * does for the framework's own set.
 *
 * **`colorMode: "none"`, and it is not a preference.** The renderer will emit
 * ANSI itself, and a block carrying baked colour is the objection
 * `DEPENDENCIES.md` makes to `shiki` — C10 owns colour, and a diagram is not the
 * exception.
 */

import { renderMermaidASCII } from "beautiful-mermaid";

import { block } from "../data/viewmodel/index.js";
import type { Code } from "../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

/**
 * The diagram, rendered to a `code` block.
 *
 * **`language: "text"` and never `"mermaid"`.** What the block carries is the
 * *rendered* grid, not the source, so asking C09 to highlight it would be
 * asking a lexer to tokenise a picture. The source is gone by this point, which
 * is the whole of what *a transform in front* means.
 *
 * Total: a source the renderer cannot parse yields the error as text rather
 * than throwing, because a diagram is content from a far side and C04 I4's
 * direction applies — a document that will not render is worse than one that
 * says what went wrong.
 */
export function mermaidCode(
  source: string,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  id = "mermaid",
): Code {
  const ascii = caps.unicode === "ascii" || caps.ambiguousWidth === "wide";

  let text: string;
  try {
    text = renderMermaidASCII(source, { useAscii: ascii, colorMode: "none" });
  } catch (err) {
    text = `mermaid: ${err instanceof Error ? err.message : String(err)}`;
  }

  return block({ kind: "code", id, language: "text", text }) as Code;
}
