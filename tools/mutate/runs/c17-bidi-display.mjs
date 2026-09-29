// C17 I36, C22 I33, §5g — the reader's own bidi characters, drawn visible and
// kept as typed (F1401, T6.40, T6.150).
//
// **Two rows that are not blocks, and one rule about what they draw.** The walk
// and `commandRows` each neutralise for display and nothing else, so each
// mutation below attacks one of the three places the rule could be broken
// without the other two noticing: the row drawn raw, the substitution mistaken
// for a chip, and the remedy moved into the buffer, which is where the reader's
// command lives and must not change.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Not mutated, and why**: C23 I90's `drawn` taking the raw character. No row
// reaches the real `drawn` — C23 T1.100's world supplies its own — so the
// survivor is known before the run, and a known survivor is a comment rather
// than a row (a finding recorded with review batch 4's bidi lane).
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LAYOUT = "src/interaction/editor/layout.ts";
const PAINT = "src/shell/paint.ts";
const FILES =
  "test/unit/editor.test.ts test/unit/session-paint.test.ts test/integration/typed-bidi.test.ts test/integration/trust-writer.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the neutraliser a
    // no-op, so both rows draw both characters raw and the prompt, the echo and
    // the frame's bytes all carry them. If this survives, no row below reads
    // what the walk or the echo drew.
    file: "src/data/text.ts",
    from: "export function neutraliseControl(text: string): string {",
    to: "export function neutraliseControl(text: string): string {\n  if (text.length >= 0) return text;",
    why:
      "the neutraliser returns its input, so the prompt and the echo draw U+2066 and U+202E raw — "
      + "if this survives, the rows are not reading the rows they think they are",
  },
  mutations: [
    // ---- C17 I36 — the walk (T6.40) -----------------------------------------
    {
      // **The row drawn raw**, which is what shipped: the prompt reordered and
      // two caret positions on one cell.
      name: "T6.40: the walk draws an unsubstituted cluster as itself",
      file: LAYOUT,
      from: "      let shown = chip ?? neutraliseControl(cluster);",
      to: "      let shown = chip ?? cluster;",
      expect: "T1.61",
    },
    {
      // **Measured as the form, drawn raw** — the half-fix: the widths are
      // right, so the caret arithmetic agrees with itself, and the row a
      // terminal reads is not the row the caret was computed on.
      name: "T6.40: the form measured but the raw cluster drawn",
      file: LAYOUT,
      from: "      row += shown;",
      to: "      row += chip ?? cluster;",
      expect: "T1.61",
    },
    {
      // **The chip test the walk used**: true of a neutralised character too,
      // so every override is painted a chip's ground.
      name: "T6.40: a chip span recorded wherever the drawn text differs from the cluster",
      file: LAYOUT,
      from: "      if (chip !== undefined) {",
      to: "      if (shown !== cluster) {",
      expect: "T1.61",
    },
    {
      // **A chip's name measured raw**: the label reorders, and the elision
      // cuts a string the walk then draws wider.
      name: "T6.40: chipLabel composes the raw name",
      file: LAYOUT,
      from: "neutraliseControl(chip.name)",
      to: "chip.name",
      expect: "T1.62",
    },
    {
      // **The remedy moved into the buffer** — I9 widened to strip the
      // characters on insert. Plausible, and it changes the reader's command.
      name: "T6.40: the buffer strips U+2066 and U+202E on insert",
      file: "src/interaction/editor/graphemes.ts",
      from: "    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;",
      to: "    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2066 || cp === 0x202e) continue;",
      expect: "T1.61",
    },
    // ---- C22 I33 — the echo (T6.150) ----------------------------------------
    {
      name: "T6.150: commandRows wraps the raw line",
      file: PAINT,
      from: ".flatMap((line) => hardWrapCells(neutraliseControl(line), body));",
      to: ".flatMap((line) => hardWrapCells(line, body));",
      expect: "T1.179",
    },
    {
      // **Neutralised after the wrap**: every row reads right and the row
      // count is the raw line's, so the height the measurer takes is short.
      name: "T6.150: commandRows neutralises each row after wrapping the raw line",
      file: PAINT,
      from: ".flatMap((line) => hardWrapCells(neutraliseControl(line), body));",
      to: ".flatMap((line) => hardWrapCells(line, body).map(neutraliseControl));",
      expect: "T1.179",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
