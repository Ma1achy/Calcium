// Roadmap 9 — a Mermaid diagram as a `code` block.
//
// **The rows are about the seam, not about the renderer.** What is asserted is
// that the transform stays one call wide: the capability mapping, the colour
// refusal, and the block's shape. Nothing here asserts what a flowchart looks
// like — that is the package's business, and a row that pinned its output would
// be a row that fails on its next release for no reason anyone here cares about.
import { describe, expect, it } from "vitest";

import { mermaidCode } from "../../src/presentation/mermaid.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const SOURCE = "graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do it]\n  B -->|no| D[Stop]\n";

const nonAscii = (text: string): readonly string[] =>
  [...new Set([...text].filter((c) => (c.codePointAt(0) ?? 0) > 127))];

describe("roadmap 9 — mermaid as a code block", () => {
  it("T2.80: the block is `code`, its language is `text`, and it carries a grid", () => {
    // **`text` and never `mermaid`.** What the block holds is the rendered
    // picture; asking C09 to highlight it would be asking a lexer to tokenise a
    // diagram. The source is gone by this point, which is what *a transform in
    // front* means.
    const drawn = mermaidCode(SOURCE, FULL_CAPS);

    expect(drawn.kind).toBe("code");
    expect(drawn.language).toBe("text");
    expect(drawn.text.split("\n").length, "more than one row").toBeGreaterThan(3);
    expect(drawn.text, "the node labels survive").toContain("Start");
  });

  it("T2.81 (C02 I9): the renderer's ASCII switch is the ambiguous-width tier", () => {
    // **The unicode output is box drawing, which is ambiguous throughout** — so
    // it is one cell where the terminal says narrow and two where it says wide,
    // and a diagram whose glyphs double is not a diagram. `useAscii` is the wide
    // arm as well as the ASCII one, which is the same switch `glyphs()` makes
    // for the framework's own set.
    const narrow = mermaidCode(SOURCE, FULL_CAPS).text;
    const wide = mermaidCode(SOURCE, WIDE_CAPS).text;
    const ascii = mermaidCode(SOURCE, ASCII_CAPS).text;

    expect(nonAscii(narrow).length, "narrow draws box characters").toBeGreaterThan(0);
    expect(nonAscii(wide), "wide draws none").toEqual([]);
    expect(nonAscii(ascii), "and neither does ASCII").toEqual([]);

    // The property the arm exists for, asserted rather than inferred: every
    // character the wide arm emits is one cell *measured as wide*.
    for (const ch of new Set([...wide])) {
      if (ch === "\n") continue;
      expect(cells(ch, "wide"), `${ch} on a wide terminal`).toBeLessThanOrEqual(1);
    }
  });

  it("T2.82: no colour is baked in — C10 owns it", () => {
    // The renderer will emit ANSI itself if asked. A block carrying baked
    // colour is the objection `DEPENDENCIES.md` makes to `shiki`, and a diagram
    // is not the exception.
    for (const caps of [FULL_CAPS, WIDE_CAPS, ASCII_CAPS]) {
      // eslint-disable-next-line no-control-regex
      expect(mermaidCode(SOURCE, caps).text, "no escapes").not.toMatch(/\[/u);
    }
  });

  it("T2.83: an unparseable source becomes text rather than a throw", () => {
    // A diagram is content from a far side, so C04 I4's direction applies: a
    // document that will not render is worse than one that says what went
    // wrong. The transform is total for the same reason the validator is.
    const drawn = mermaidCode("this is not a diagram {{{", FULL_CAPS);

    expect(drawn.kind).toBe("code");
    expect(typeof drawn.text).toBe("string");
  });
});
