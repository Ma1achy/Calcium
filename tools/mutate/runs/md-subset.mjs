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
    from: '          glyph: "bullet",\n',
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
    from: "return Math.min(level, MAX_DEPTH) * INDENT_CELLS;",
    to: "return level * INDENT_CELLS;",
    expect: "T2.47",
  },
  {
    // The quote's tone. It draws the same characters either way, which is why
    // the assertion is on the block and not on the frame.
    // Re-anchored when the quote gained the inline pass (C04 §3am): the line
    // now spreads `inline(...)` where it carried `text`.
    name: "a blockquote is toned like a paragraph",
    file: SRC,
    from: 'tone: "muted", ...inline(body.join("\\n"))',
    to: 'tone: "default", ...inline(body.join("\\n"))',
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
    // The inline pass skipped on a heading: a `rule` label keeps `**`. The
    // paragraph rows still pass, which is why T2.34 walks the four members.
    name: "a heading does not run the inline pass",
    file: SRC,
    from: "      const { text: label, spans } = inline((heading[1] ?? \"\").trim());",
    to: "      const { text: label, spans } = { text: (heading[1] ?? \"\").trim(), spans: undefined };",
    expect: "T2.34",
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
