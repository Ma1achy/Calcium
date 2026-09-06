// Roadmap 11's block half — the mapping, mutated.
//
// **A mapping's rows all pass against a mapping that maps nothing to the same
// place.** Every mutation here is a target quietly changed: the language
// dropped, the gutter dropped, the table keyed on a label, the delimiter
// lookahead removed, the depth cap removed. Each leaves a translator that still
// produces blocks and still renders.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/markdown.test.ts";
const SRC = "src/data/viewmodel/markdown.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // The info string discarded. Every fence still becomes a `code` block and
    // every row about structure still passes; only the highlighting is gone,
    // which is invisible to anything that does not read the language.
    name: "a fence's info string is dropped",
    file: SRC,
    from: 'language: info === "" ? "text" : info,',
    to: 'language: "text",',
    expect: "T2.41",
  },
  {
    // The gutter dropped. The block is still a `notice` and the text is still
    // the item's — this is exactly the defect a shape-only assertion misses,
    // and the reason T2.45 reads the frame.
    name: "a list item loses its glyph slot",
    file: SRC,
    // Re-anchored when the depth cap gained its mark (C04 I96): the literal
    // slot is now `markOf(...)`, which picks between two.
    from: '          glyph: markOf(bullet[1] ?? ""),\n',
    to: "",
    expect: "T2.45",
  },
  {
    // Keyed on the header's text. Correct for every table whose headers differ,
    // which is every table anyone writes by hand while testing.
    name: "a table is keyed on the header label rather than the position",
    file: SRC,
    from: "      key: `c${String(i)}`,",
    to: "      key: label,",
    expect: "T2.42",
  },
  {
    // The lookahead removed: any line with a pipe becomes a table. Every row
    // that supplies a delimiter still passes.
    name: "a pipe alone makes a table",
    file: SRC,
    from: 'if (line.includes("|") && DELIMITER.test(lines[i + 1] ?? "")) {',
    to: 'if (line.includes("|")) {',
    expect: "T2.43",
  },
  {
    // The cap removed. Correct at two levels, unbounded at five.
    name: "nesting indents without a cap",
    file: SRC,
    from: "return Math.min(depthOf(raw), MAX_DEPTH) * INDENT_CELLS;",
    to: "return depthOf(raw) * INDENT_CELLS;",
    expect: "T2.47",
  },
  {
    // The quote's tone. It draws the same characters either way, which is why
    // the assertion is on the block and not on the frame.
    // Re-anchored when the quote gained the inline pass (C04 §3am): the line
    // now spreads `inline(...)` where it carried `text`.
    name: "a blockquote is toned like a paragraph",
    file: SRC,
    // Re-anchored when the quote gained its rail (C04 I95): the line now
    // carries the glyph slot between the tone and the inline pass.
    from: 'tone: "muted", glyph: "quote"',
    to: 'tone: "default", glyph: "quote"',
    expect: "T2.46",
  },
  {
    // **The markers kept** — the translation this arc replaces. Every block
    // still arrives, every kind is right, and the text carries seven
    // characters the reader was not meant to see.
    name: "inline emphasis keeps its markers",
    file: SRC,
    from: "        flush();\n        if (mark.kind === \"**\") bold = !bold;",
    to: "        text += mark.kind;\n        flush();\n        if (mark.kind === \"**\") bold = !bold;",
    expect: "T2.33",
  },
  {
    // An unpaired marker consumed rather than kept: `2 * 3` loses its star and
    // an italic runs to the end of the line.
    name: "an unpaired marker toggles",
    file: SRC,
    from: "    if (ofKind.length % 2 === 1) literal.add(ofKind[ofKind.length - 1]?.at ?? -1);",
    to: "",
    expect: "T2.33",
  },
  {
    // Inline code as an attribute rather than a slot: the backticks still go,
    // the offsets are still right, and the run is bold where it should be a
    // tone — C04 I89's consumer, mapped onto C04 I85's member.
    name: "inline code is a bold span rather than an identifier tone",
    file: SRC,
    from: "          ...(code ? { tone: CODE_TONE } : {}),",
    to: "          ...(code ? { bold: true } : {}),",
    expect: "T2.33",
  },
  {
    // The backticks kept as text — the translation before this arc. Every
    // other span's offsets are the old ones, so a row asserting them fails.
    name: "inline code keeps its backticks",
    file: SRC,
    from: "      text += source.slice(pos + 1, close);",
    to: "      text += source.slice(pos, close + 1);",
    expect: "T2.33",
  },
  {
    // The delimiter back to two cells: `| h |` over `|---|` is a paragraph
    // again, and every two-column row still passes.
    name: "a delimiter row needs two cells",
    file: SRC,
    from: "const DELIMITER = /^(?=.*\\|)\\s*\\|?\\s*:?-+:?\\s*(?:\\|\\s*:?-+:?\\s*)*\\|?\\s*$/u;",
    to: "const DELIMITER = /^(?=.*\\|)\\s*\\|?\\s*:?-+:?\\s*(?:\\|\\s*:?-+:?\\s*)+\\|?\\s*$/u;",
    expect: "T2.48",
  },
  {
    // The pipe requirement dropped: a paragraph with a `|` over a line of
    // dashes is a table. Every table row still passes — they all have pipes.
    name: "a line of dashes is a delimiter row",
    file: SRC,
    from: "const DELIMITER = /^(?=.*\\|)\\s*",
    to: "const DELIMITER = /^\\s*",
    expect: "T2.48",
  },
  {
    // The inline pass skipped on a heading: a `rule` label keeps `**`. The
    // paragraph rows still pass, which is why T2.34 walks the four members.
    name: "a heading does not run the inline pass",
    file: SRC,
    from: "      const { text: label, spans } = inline((heading[2] ?? \"\").trim());",
    to: "      const { text: label, spans } = { text: (heading[2] ?? \"\").trim(), spans: undefined };",
    expect: "T2.34",
  },
  {
    // **The tier collapsed back onto one form** — the residue this arc closes,
    // reinstated. Every kind row still passes, every span row still passes, and
    // six heading levels draw one figure again.
    name: "every heading level maps to one tier",
    file: SRC,
    from: 'const level = Math.min((heading[1] ?? "#").length, MAX_TIER) as HeadingLevel;',
    to: "const level = 2 as HeadingLevel;",
    expect: "T2.106",
  },
  {
    // The tiers reduced to two. `###` becomes `##`, which is a form that
    // exists, so every frame is still well-formed and one distinction is gone.
    name: "the heading tiers are two rather than three",
    file: SRC,
    from: "const MAX_TIER = 3;",
    to: "const MAX_TIER = 2;",
    expect: "T2.106",
  },
  {
    // The rail dropped from the quote. The block is still a `muted` notice and
    // the text is still the quotation's — the residue before this arc, and the
    // reason T2.46 and T2.107 read the frame rather than the block.
    name: "a blockquote loses its rail",
    file: SRC,
    from: 'tone: "muted", glyph: "quote", ',
    to: 'tone: "muted", ',
    expect: "T2.107",
  },
  {
    // The cap's mark dropped. Correct at every depth inside the cap, and depth
    // 3 and depth 4 are one frame again — a document that means two things,
    // which no assertion about a single item can see.
    name: "an item past the depth cap keeps the ordinary bullet",
    file: SRC,
    from: 'return depthOf(raw) > MAX_DEPTH ? "nested" : "bullet";',
    to: 'return "bullet";',
    expect: "T2.108",
  },
  {
    // The mark one level early: depth 3 is marked as past the cap. The frame is
    // still unambiguous between 3 and 4, so only a row that names the depths
    // fails.
    name: "the cap's mark fires one level early",
    file: SRC,
    from: 'return depthOf(raw) > MAX_DEPTH ? "nested" : "bullet";',
    to: 'return depthOf(raw) >= MAX_DEPTH ? "nested" : "bullet";',
    expect: "T2.108",
  },
  {
    // The ordered arm left unmarked. Bullets keep their mark, so every frame
    // row about a bullet list still passes, and the arm with no glyph at all is
    // exactly where the two depths have nothing to tell them apart.
    name: "an ordered item past the cap takes no mark",
    file: SRC,
    from: '...(depthOf(ordered[1] ?? "") > MAX_DEPTH ? { glyph: "nested" as const } : {}),',
    to: "",
    expect: "T2.108",
  },
  {
    // **The rail drawn as a glyph** — the defect the frame found and no count
    // could. Same rows, same width, same reserved columns; the mark appears
    // once and every continuation row sits under a blank.
    name: "a rail is drawn on the first row only",
    file: SIMPLE,
    from: "              (index === 0 || rail) && block.glyph !== undefined",
    to: "              index === 0 && block.glyph !== undefined",
    expect: "T2.107",
  },
  {
    // Tier 3 draws a rule again. Three tiers become two, and the row is still
    // exactly the width — which is what makes this invisible to geometry.
    name: "tier 3 fills with the rule rather than with blanks",
    file: SIMPLE,
    from: 'const fillChar = block.level === 3 && label !== "" ? " " : weight;',
    to: "const fillChar = weight;",
    expect: "T2.106",
  },
  {
    // The empty-label fallback removed (C09 I21 against tier 3): a rule with no
    // label draws a two-cell lead and blanks — a boundary that is not there.
    name: "an empty label at tier 3 takes the blank fill",
    file: SIMPLE,
    from: 'const fillChar = block.level === 3 && label !== "" ? " " : weight;',
    to: 'const fillChar = block.level === 3 ? " " : weight;',
    expect: "T2.106",
  },
  {
    // Tier 1 loses its weight. Two tiers of three collapse and every row is
    // still exactly the width.
    name: "tier 1 draws the light rule",
    file: SIMPLE,
    from: "const weight = block.level === 1 ? g.heavyHorizontal : g.horizontal;",
    to: "const weight = g.horizontal;",
    expect: "T2.106",
  },
];

const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    from: "    if (paragraph.length === 0) return;",
    to: "    return;",
    why:
      "no paragraph ever reaches the output — if this survives, no row asserts what the " +
      "translator produces and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length > 0 ? 1 : 0);
