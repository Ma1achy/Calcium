// C09 I72 — a renderer may answer rows, and a row it answers is the frame's row
// byte for byte. Mutated.
//
// **Two things can be wrong and the goldens see only one.** A normaliser that
// drifts from Ink's form moves every styled row in every golden; a registry
// that composes the rows arm differently from the element arm — a gap as a
// space, a floor padded with blanks, the cap's marker above the block — moves
// frames too, but only frames holding that composition. T1.46 and T2.143 are
// the rows that see both at once, against the tokeniser's own serialiser and
// against Ink, and T3.88 says each edge in bytes.
//
// **The control returns the rows unnormalised**: `paint` closes each span with
// a reset and Ink closes with the code's own end, so every styled corpus row
// differs and T2.143 sees it on the first block.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/rows.test.ts test/edge/rows.test.ts test/contract/rows-arm.test.ts test/revert/block-cap.test.ts test/edge/blocks.test.ts";
const ROWS = "src/presentation/rows.ts";
const LINES = "src/presentation/render-lines.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: LINES,
    from: "    return (rendered as readonly string[]).map(normaliseRow);",
    to: "    return rendered as readonly string[];",
    why: "the rows arm hands back paint's form, reset-closed, and every styled corpus row differs from Ink's",
  },
  mutations: [
    {
      // **The open state written before every character** rather than where it
      // changes: a two-character styled run carries its codes twice.
      name: "STATE-EVERY-CHAR: the open codes are written before every visible character",
      file: ROWS,
      from: "    if (changed) {\n      out += between(shown, live);\n      shown = live;\n      changed = false;\n    }",
      to: "    out += live.map((c) => c.code).join(\"\");\n    shown = live;\n    changed = false;",
      expect: "T1.46",
    },
    {
      // **The open state never closed**: the last styled character's codes
      // stay open past the row's end, which Ink never writes.
      name: "FINAL-UNDO-DROPPED: the state open at the last character is not undone",
      file: ROWS,
      from: "  if (seen) out += between(shown, []);\n  return out.trimEnd();",
      to: "  return out.trimEnd();",
      expect: "T1.46",
    },
    {
      // **Trailing blanks kept**: a row padded to its width keeps the pad.
      name: "TRIM-DROPPED: trailing blanks are not trimmed",
      file: ROWS,
      from: "  if (seen) out += between(shown, []);\n  return out.trimEnd();",
      to: "  if (seen) out += between(shown, []);\n  return out;",
      expect: "T1.46",
    },
    {
      // **Bold replaces dim**: the two intensity codes share an end code, and
      // treating them as one kind drops the first when the second arrives.
      name: "INTENSITY-REPLACING: bold and dim replace each other instead of accumulating",
      file: ROWS,
      from: "  if (isIntensity(c)) {\n    return state.some((held) => held.code === c.code) ? state.slice() : [...state, c];\n  }\n",
      to: "",
      expect: "T1.46",
    },
    {
      // **The reset as a style**: `0` no longer clears the state, it joins it.
      name: "RESET-AS-STYLE: the reset does not clear the state",
      file: ROWS,
      from: "  if (c.code === SGR_RESET) return [];\n",
      to: "",
      expect: "T1.46",
    },
    {
      // **A control kept**: an OSC that is not a hyperlink is copied as text.
      name: "CONTROL-KEPT: an OSC control sequence is written through",
      file: ROWS,
      from: "        const found = osc(row, i);\n        if (found !== null) {",
      to: "        const found = osc(row, i);\n        if (found !== null && found.link) {",
      expect: "T1.46",
    },
    {
      // **The clustered mark kept**: a combining mark after a sequence's `m`
      // is written where the tokeniser dropped it inside the grapheme.
      name: "SWALLOW-DROPPED: a mark clustering with the sequence's last byte is kept",
      file: ROWS,
      // Anchored with the state flag above it, because `visibleOf` repeats the
      // step (C09 I73) and the normaliser is the one T1.46 reads.
      from: "        changed = true;\n        i = last + 1 + swallowed(row, last);",
      to: "        changed = true;\n        i = last + 1;",
      expect: "T1.46",
    },
    {
      // **A gap as a space**: Ink wrote the `Text` holding a space and trimmed
      // it; the rows arm must write the trimmed form.
      name: "GAP-SPACE: a gapBefore row is a single space",
      file: LINES,
      from: '    if (block.gapBefore === true) out.push("");',
      to: '    if (block.gapBefore === true) out.push(" ");',
      expect: "T2.143",
    },
    {
      // **The floor a row short.** T2.143's Ink side lifts the same padded rows
      // through `elementOf`, so it moves with the mutation and sees nothing —
      // the floored block is C09's composition on both arms, and T3.54 is the
      // row that reads the floor against the frame. (A pad of spaces rather
      // than empty rows was run first and survived — the normaliser trims a
      // blank row to nothing, so that mutation cannot reach the frame; T6.119
      // records both.)
      name: "FLOOR-SHORT: the rows arm pads the floor one row short",
      file: REGISTRY,
      from: '      return [...lines, ...Array.from({ length: floor - lines.length }, () => "")]; // cells-ok — rows',
      to: '      return [...lines, ...Array.from({ length: floor - lines.length - 1 }, () => "")]; // cells-ok — rows',
      expect: "T3.54",
    },
    {
      // **The marker above the block**: C14 I24 puts it beneath. T2.143's
      // Ink side composes through the same registry, so it moves with the
      // mutation and sees nothing; T6.22 reads the marker as the last row.
      name: "MARKER-FIRST: the cap's marker precedes the block's rows",
      file: REGISTRY,
      from: "    if (Array.isArray(drawn)) return [...(drawn as readonly string[]), marker];",
      to: "    if (Array.isArray(drawn)) return [marker, ...(drawn as readonly string[])];",
      expect: "T6.22",
    },
    {
      // **Both spans for one block**: the deck would count the rows arm as Ink.
      name: "SPAN-BOTH: the rows arm opens the react span as well",
      file: LINES,
      from: '    using _rows = probe?.span("rows") ?? NO_SPAN;\n    return (rendered as readonly string[]).map(normaliseRow);',
      to: '    using _rows = probe?.span("rows") ?? NO_SPAN;\n    using _also = probe?.span("react") ?? NO_SPAN;\n    return (rendered as readonly string[]).map(normaliseRow);',
      expect: "T2.143",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
