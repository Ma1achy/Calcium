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

  it("T2.33 (C04 §3am, C04 I89, roadmap 11): inline emphasis is attribute spans and inline code an `identifier` span, over the marker-stripped text", () => {
    // The reversal T2.44 was written to permit: the markers are gone and the
    // spans sit at the offsets of the words they marked, in the emitted text.
    // **The backticks go too** (2026-09-04): a code run is a `tone` span, and
    // the slot is `identifier` — the one the tree uses for a name one refers
    // back to (C09 §5). The row as first written kept the backticks and cited
    // the deferral symbol; this is the consumer that expired it.
    const [para] = markdownBlocks("a **bold** and *em* and _em_ and `code` word");
    expect(para).toEqual({
      kind: "raw",
      id: "md-0",
      text: "a bold and em and em and code word",
      spans: [
        { from: 2, to: 6, bold: true },
        { from: 11, to: 13, italic: true },
        { from: 18, to: 20, italic: true },
        { from: 25, to: 29, tone: "identifier" },
      ],
    });

    // Nested emphasis is adjacent disjoint spans with combined attributes
    // (§3am cell 12); an unpaired marker is a character; markers inside a
    // backtick run do not toggle, and a code run inside an emphasis is one
    // span carrying the attribute and the tone.
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
      text: "a*b*c and d",
      spans: [{ from: 0, to: 5, tone: "identifier" }, { from: 10, to: 11, italic: true }],
    });
    expect(markdownBlocks("**and `x`**")[0]).toMatchObject({
      text: "and x",
      spans: [{ from: 0, to: 4, bold: true }, { from: 4, to: 5, bold: true, tone: "identifier" }],
    });
    // An unclosed backtick makes the rest literal; an empty pair is two
    // characters — a span cannot be empty (C04 I84).
    expect(markdownBlocks("a `b *c*")[0]).toEqual({ kind: "raw", id: "md-0", text: "a `b *c*" });
    expect(markdownBlocks("`` and *d*")[0]).toMatchObject({ text: "`` and d", spans: [{ from: 7, to: 8, italic: true }] });

    // The frame: no backticks visible, and the run carries a `38` of its own
    // between the paragraph's plain pieces (`raw` has no tone of its own).
    const [line] = renderSequenceToLines(registry, markdownBlocks("run `make enforce` now"), 40, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
    });
    expect(line?.replace(/\x1b\[[0-9;]*m/gu, "").trimEnd()).toBe("run make enforce now");
    expect(line).toMatch(/^run \x1b\[38;2;\d+;\d+;\d+mmake enforce\x1b\[39m now/u);
  });

  it("T2.34 (C04 §3am, I88): the four members take spans, and a fence does not run the inline pass", () => {
    const [item] = markdownBlocks("- one **two**");
    expect(item).toMatchObject({ kind: "notice", glyph: "bullet", text: "one two", spans: [{ from: 4, to: 7, bold: true }] });
    const [quote] = markdownBlocks("> *quoted*");
    expect(quote).toMatchObject({ kind: "notice", tone: "muted", text: "quoted", spans: [{ from: 0, to: 6, italic: true }] });
    const [heading] = markdownBlocks("# A **title**");
    expect(heading).toMatchObject({ kind: "rule", label: "A title", spans: [{ from: 2, to: 7, bold: true }] });
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

  it("T2.48 (roadmap 11, F583): one delimiter cell makes a one-column table, and a line of dashes does not", () => {
    // **The residue this closes.** `DELIMITER` needed two cells, so `| h |` over
    // `|---|` stayed a paragraph — measured before the change: `["raw"]`.
    const [one] = markdownBlocks("| h |\n|---|\n| x |\n| **y** |") as [Table];
    expect(one).toMatchObject({ kind: "table" });
    expect(one.columns.map((c) => [c.key, c.label])).toEqual([["c0", "h"]]);
    expect(one.rows.map((r) => r.cells["c0"])).toEqual([{ text: "x" }, { text: "y", spans: [{ from: 0, to: 1, bold: true }] }]);
    expect(kinds(markdownBlocks("| h\n|-\n| x")), "an outer pipe on one side is enough").toEqual(["table"]);
    expect(kinds(markdownBlocks("a | b\n|-|")), "one dash cell under a pipe in prose is a table, as GFM has it").toEqual(["table"]);

    // **The non-tables stay non-tables.** The delimiter row must carry a pipe:
    // a bare line of dashes is a paragraph line, under prose with a `|` in it
    // as under anything else, and a delimiter with no header above it is prose.
    expect(kinds(markdownBlocks("a | b in prose\n---")), "dashes with no pipe are prose").toEqual(["raw"]);
    expect(kinds(markdownBlocks("---")), "a bare rule line is prose").toEqual(["raw"]);
    expect(kinds(markdownBlocks("| h |\n| x |")), "no delimiter, no table — T2.43's arm at one column").toEqual(["raw"]);

    // The frame: a one-column table draws its header and its row, nothing else.
    expect(frame(markdownBlocks("| h |\n|---|\n| x |"), FULL_CAPS, 12)).toEqual(["h", "x"]);
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
