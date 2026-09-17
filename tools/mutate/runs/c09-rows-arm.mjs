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
    from: "  return rendered.map(normaliseRow);",
    to: "  return rendered;",
    why: "the rows arm hands back paint's form, reset-closed, and every styled corpus row differs from Ink's",
  },
  mutations: [
    {
      // **The open state written before every character** rather than where it
      // changes: a two-character styled run carries its codes twice.
      name: "STATE-EVERY-CHAR: the open codes are written before every visible character",
      file: ROWS,
      from: "    if (changed) {\n      const diff = between(shown, live);\n      if (diverged) out += diff;\n      else if (row.startsWith(diff, op)) op += diff.length; // cells-ok — code units\n      else {\n        diverged = true;\n        out = row.slice(0, op) + diff;\n      }\n      copyState(shown, live);\n      changed = false;\n    }",
      to: "    {\n      if (!diverged) {\n        diverged = true;\n        out = row.slice(0, op);\n      }\n      out += live.map((c) => c.code).join(\"\");\n      copyState(shown, live);\n      changed = false;\n    }",
      expect: "T1.46",
    },
    {
      // **The open state never closed**: the last styled character's codes
      // stay open past the row's end, which Ink never writes.
      name: "FINAL-UNDO-DROPPED: the state open at the last character is not undone",
      file: ROWS,
      from: "  if (seen) {\n    const tail = between(shown, EMPTY_STATE);\n    if (diverged) out += tail;\n    else if (row.startsWith(tail, op)) op += tail.length; // cells-ok — code units\n    else {\n      diverged = true;\n      out = row.slice(0, op) + tail;\n    }\n  }",
      to: "  if (seen) { /* the state open at the last character is left open */ }",
      expect: "T1.46",
    },
    {
      // **Trailing blanks kept**: a row padded to its width keeps the pad.
      name: "TRIM-DROPPED: trailing blanks are not trimmed",
      file: ROWS,
      from: "  if (diverged) return out.trimEnd();\n  // `out` was never built, and what it would hold is `row`'s first `op` units —\n  // `n` of them in every path that reaches here, so the slice is the row.\n  return (op === n ? row : row.slice(0, op)).trimEnd();",
      to: "  if (diverged) return out;\n  return op === n ? row : row.slice(0, op);",
      expect: "T1.46",
    },
    {
      // **Bold replaces dim**: the two intensity codes share an end code, and
      // treating them as one kind drops the first when the second arrives.
      name: "INTENSITY-REPLACING: bold and dim replace each other instead of accumulating",
      file: ROWS,
      from: "  if (isIntensity(c)) {\n    if (!hasCode(state, c.code)) state.push(c);\n    return;\n  }\n",
      to: "",
      expect: "T1.46",
    },
    {
      // **The reset as a style**: `0` no longer clears the state, it joins it.
      name: "RESET-AS-STYLE: the reset does not clear the state",
      file: ROWS,
      from: "  if (c.code === SGR_RESET) {\n    state.length = 0; // cells-ok — a code count\n    return;\n  }\n",
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
      // **A truecolour sequence not taken whole** (I75): `38;2;r;g;b` applied
      // as five codes, and the diff writes them apart where the tokeniser
      // writes one.
      name: "GROUP-DROPPED: 38;2;r;g;b is five parts",
      file: ROWS,
      from: "      } else if (paramIs(row, end + 1, next, CC_2, -1) && next < last) {",
      to: "      } else if (false) {",
      expect: "T1.46",
    },
    {
      // **A closing end written twice** (I75): bold and dim share `22`, and
      // the reference writes it once.
      name: "CLOSE-DUPLICATED: a shared end is written for each code",
      file: ROWS,
      from: "      if (!written) out += end;",
      to: "      out += end;",
      expect: "T1.46",
    },
    {
      // **The byte-decided end wrong** (I75): a foreground colour closed as a
      // background one.
      name: "ENDOF-SWAPPED: 38 closes with 49",
      file: ROWS,
      from: "    if (c2 === CC_3) return FG_CLOSE;",
      to: "    if (c2 === CC_3) return BG_CLOSE;",
      expect: "T1.46",
    },
    {
      // **A padding row as a space**: Ink wrote the `Text` holding a space and
      // trimmed it; whoever writes the row must write the trimmed form.
      //
      // **Re-pointed when the gap moved inside the block, and the move made it
      // vacuous** (F1224, and c14-cap's MARKER-ROW-WINDOWED is the precedent for
      // recording one rather than deleting it). It was `render-lines`'
      // `out.push("")` above a `gapBefore` block — pushed straight into the
      // output, past the arm's normalisation, which is what made writing a space
      // there a defect a frame could hold. The rows are the registry's now and
      // reach the frame through `linesOf` → `normaliseRow`, and **measured:
      // `normaliseRow(" ")` is `""`** — so the byte cannot survive to a frame
      // and no row can see this go. The property is real and is held one layer
      // down by TRIM-DROPPED above, which is the row to keep green.
      //
      // Kept rather than deleted because the deletion would leave no record that
      // the writer's obligation moved to the trim; what is recorded is that
      // nothing constrains the writer itself.
      name: "PAD-SPACE: a block's padding row is a single space",
      file: REGISTRY,
      from: 'const blank = (n: number): readonly string[] => Array.from({ length: n }, () => "");',
      to: 'const blank = (n: number): readonly string[] => Array.from({ length: n }, () => " ");',
      expect: "(none — expected to survive)",
    },
    {
      // **The floor a row short.** T2.143's Ink side used to lift the same
      // padded rows through `elementOf`, so it moved with the mutation and saw
      // nothing, and T3.54 — which reads the floor against the frame — was the
      // only row that caught it. Since F1209 the Ink side is a committed
      // capture that cannot move, and this fails T2.143's sequence at 24 as
      // well: 26 rows where the capture holds 27. Both rows are named, and
      // T3.54 stays the `expect` because it is the one that reads the frame.
      // (A pad of spaces rather than empty rows was run first and survived —
      // the normaliser trims a blank row to nothing, so that mutation cannot
      // reach the frame whatever the oracle is; T6.119 records it.)
      name: "FLOOR-SHORT: the rows arm pads the floor one row short",
      file: REGISTRY,
      from: '    return [...rendered, ...Array.from({ length: floor - rendered.length }, () => "")]; // cells-ok — rows',
      to: '    return [...rendered, ...Array.from({ length: floor - rendered.length - 1 }, () => "")]; // cells-ok — rows',
      expect: "T3.54",
    },
    {
      // **The marker above the block**: C14 I24 puts it beneath. T2.143's Ink
      // side used to compose through the same registry, so it moved with the
      // mutation and saw nothing; T6.22, which reads the marker as the last
      // row, was the only catch. Since F1209 the capture cannot move and
      // T2.143's sequence at 24 fails too — 27 rows against 27, in the wrong
      // order. T6.22 stays the `expect` as the row that names the position.
      name: "MARKER-FIRST: the cap's marker precedes the block's rows",
      file: REGISTRY,
      from: "    return [...drawn, marker];",
      to: "    return [marker, ...drawn];",
      expect: "T6.22",
    },
    {
      // **Two arm spans for one block**: the deck would count it twice. It
      // opened `react` beside `rows` while the element arm existed; that span
      // is gone (F1209), so the mutation opens the same one twice, which is the
      // same defect in the deck and the same assertion catching it.
      name: "SPAN-BOTH: the rows arm opens its span twice for one block",
      file: LINES,
      from: '  using _rows = probe?.span("rows") ?? NO_SPAN;\n  return rendered.map(normaliseRow);',
      to: '  using _rows = probe?.span("rows") ?? NO_SPAN;\n  using _also = probe?.span("rows") ?? NO_SPAN;\n  return rendered.map(normaliseRow);',
      expect: "T2.143",
    },
  ],
});

console.log(report(results));
// **One listed survivor whose `expect` says so** in the anchor sweep's reserved
// words, as c14-cap does for F952: PAD-SPACE cannot reach a frame because
// `normaliseRow(" ")` is `""` (F1224, measured). The exit code stays one honest
// bit for every other row — a run whose exit is a lie about one row is a run
// nobody reads the rest of.
const unexpected = results.filter((r) => !r.killed && r.expect !== "(none — expected to survive)");
process.exit(unexpected.length > 0 ? 1 : 0);
