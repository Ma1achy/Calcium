// Roadmap 11 — the block half of markdown, as a mapping.
//
// **The rows that matter are the frame ones.** A mapping is easy to assert by
// kind and easy to get wrong in the frame: a bullet that renders as a literal
// character, a heading that draws nothing, a quote indistinguishable from a
// paragraph. So the shapes are checked once and the frame is read for the three
// constructs whose target was a decision rather than a correspondence.
import { describe, expect, it } from "vitest";

import { markdownBlocks } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Block, Table } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const registry = createBlockRegistry({ defaults: true });
registry.register(tableDefinition as unknown as BlockDefinition);

const frame = (blocks: readonly Block[], caps = FULL_CAPS, width = 40): readonly string[] =>
  renderSequenceToLines(registry, blocks, width, {
    theme: DARK_THEME,
    capabilities: caps,
    focus: null,
  }).map((line) => line.replace(/\[[0-9;]*m/gu, "").trimEnd());

const kinds = (blocks: readonly Block[]): readonly string[] => blocks.map((b) => b.kind);

describe("roadmap 11 — the named subset, as blocks", () => {
  it("T2.40: each construct reaches the target the plan named", () => {
    const source = [
      "# Title",
      "",
      "A paragraph.",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "",
      "> quoted",
      "",
      "```json",
      '{"a": 1}',
      "```",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    expect(kinds(markdownBlocks(source))).toEqual([
      "rule", // heading
      "raw", // paragraph
      "notice", // bullet
      "notice", // bullet
      "notice", // ordered
      "notice", // quote
      "code",
      "table",
    ]);
  });

  it("T2.41: a fence keeps its body verbatim and its info string becomes the language", () => {
    // **Verbatim matters more than it looks.** Everything inside a fence is
    // literal, including lines that would otherwise be headings or list items —
    // which is why the fence is matched before every other construct.
    const [code] = markdownBlocks(["```python", "# not a heading", "- not a list", "```"].join("\n"));

    expect(code).toMatchObject({ kind: "code", language: "python", text: "# not a heading\n- not a list" });

    const [plain] = markdownBlocks(["```", "x", "```"].join("\n"));
    expect(plain, "no info string is `text`, not empty").toMatchObject({ language: "text" });
  });

  it("T2.42: a table's keys are positional, so repeated headers do not collide", () => {
    // A header's text is a label and may repeat; keying on it would drop a
    // column silently, which is the same defect shape as the flat row-id
    // namespace C26 §8b.6 removed.
    const [table] = markdownBlocks(["| n | n |", "| - | - |", "| 1 | 2 |"].join("\n")) as readonly [Table];

    expect(table.columns.map((c) => c.key)).toEqual(["c0", "c1"]);
    expect(table.columns.map((c) => c.label)).toEqual(["n", "n"]);
    expect(table.rows[0]?.cells["c1"]).toMatchObject({ text: "2" });
  });

  it("T2.43: a delimiter row is what makes a header a header", () => {
    // **The guard that shows the fixture responds.** Without the lookahead a
    // line containing a pipe becomes a table, and every row above would still
    // pass — they all supply the delimiter.
    expect(kinds(markdownBlocks("a | b is not a table")), "no delimiter, no table").toEqual(["raw"]);
    expect(kinds(markdownBlocks("| a | b |\n| - | - |")), "and with one, it is").toEqual(["table"]);
  });

  it("T2.33 (C04 §3am, roadmap 11): inline emphasis is spans over the marker-stripped text, and inline code stays literal", () => {
    // The reversal T2.44 was written to permit: the markers are gone and the
    // spans sit at the offsets of the words they marked, in the emitted text.
    const [para] = markdownBlocks("a **bold** and *em* and _em_ and `code` word");
    expect(para).toEqual({
      kind: "raw",
      id: "md-0",
      text: "a bold and em and em and `code` word",
      spans: [
        { from: 2, to: 6, bold: true },
        { from: 11, to: 13, italic: true },
        { from: 18, to: 20, italic: true },
      ],
    });

    // Nested emphasis is adjacent disjoint spans with combined attributes
    // (§3am cell 12); an unpaired marker is a character; markers inside a
    // backtick run do not toggle.
    expect(markdownBlocks("**a *b* c**")[0]).toMatchObject({
      text: "a b c",
      spans: [
        { from: 0, to: 2, bold: true },
        { from: 2, to: 3, bold: true, italic: true },
        { from: 3, to: 5, bold: true },
      ],
    });
    expect(markdownBlocks("2 * 3 and a_b")[0]).toEqual({ kind: "raw", id: "md-0", text: "2 * 3 and a_b" });
    expect(markdownBlocks("`a*b*c` and *d*")[0]).toMatchObject({
      text: "`a*b*c` and d",
      spans: [{ from: 12, to: 13, italic: true }],
    });
  });

  it("T2.34 (C04 §3am, I88): the four members take spans, and a fence does not run the inline pass", () => {
    const [item] = markdownBlocks("- one **two**");
    expect(item).toMatchObject({ kind: "notice", glyph: "bullet", text: "one two", spans: [{ from: 4, to: 7, bold: true }] });
    const [quote] = markdownBlocks("> *quoted*");
    expect(quote).toMatchObject({ kind: "notice", tone: "muted", text: "quoted", spans: [{ from: 0, to: 6, italic: true }] });
    const [heading] = markdownBlocks("# A **title**");
    expect(heading).toMatchObject({ kind: "rule", label: "A title", spans: [{ from: 2, to: 7, bold: true }] });
    // Two columns: the delimiter regex needs two cells to see a table at all,
    // which is entry 11's residue and not this arc's.
    const [table] = markdownBlocks("| h | i |\n|---|---|\n| **x** | y |") as [Table];
    expect(table.rows[0]?.cells["c0"]).toEqual({ text: "x", spans: [{ from: 0, to: 1, bold: true }] });
    expect(table.rows[0]?.cells["c1"]).toEqual({ text: "y" });
    const [fence] = markdownBlocks("```\n**not** *emphasis*\n```");
    expect(fence).toMatchObject({ kind: "code", text: "**not** *emphasis*" });
    expect(fence).not.toHaveProperty("spans");
    // The frame: the bytes carry the attribute and the visible text has no markers.
    const lines = frame(markdownBlocks("a **bold** word"));
    expect(lines).toEqual(["a bold word"]);
  });

  it("T2.45 (the frame): a list item draws the glyph slot, and it degrades", () => {
    // **Read the frame, not the block.** A bullet asserted as `glyph: "bullet"`
    // passes for an implementation that draws nothing, and the whole reason a
    // list item is a `notice` rather than a `raw` is the gutter.
    const blocks = markdownBlocks("- one\n- two");

    expect(frame(blocks)).toEqual(["• one", "• two"]);
    expect(frame(blocks, ASCII_CAPS), "and the ASCII rendering is the slot's own").toEqual([
      "- one",
      "- two",
    ]);
  });

  it("T2.46 (the frame): a heading draws a rule and a quote is not a paragraph", () => {
    // The two targets that were decisions. A heading must be visibly a divider;
    // a quote must be visibly not body text — and at 1-bit *muted* is `dim`,
    // which is an attribute rather than a colour, so the distinction survives.
    const [heading] = frame(markdownBlocks("# Title"));
    expect(heading, "a divider carrying the text").toMatch(/^──\sTitle\s─+$/u);

    expect(frame(markdownBlocks("> quoted")), "no gutter, and that is the named residue").toEqual([
      "quoted",
    ]);
    // The tone is the whole of the distinction, so it is asserted on the block:
    // `frame` strips SGR, and a quote that came back `default` would draw the
    // same characters as the paragraph beside it.
    expect(markdownBlocks("> quoted")[0], "muted, which is `dim` at 1-bit").toMatchObject({
      kind: "notice",
      tone: "muted",
    });
  });

  it("T2.47: nesting indents by two per level and caps at three", () => {
    // The third residue. Deeper items clamp rather than indenting further,
    // because the indent comes out of the text's own width.
    const deep = markdownBlocks(
      ["- a", "  - b", "    - c", "      - d", "        - e"].join("\n"),
    );

    expect(frame(deep, FULL_CAPS, 40)).toEqual([
      "• a",
      "•   b",
      "•     c",
      "•       d",
      "•       e",
    ]);
  });
});
