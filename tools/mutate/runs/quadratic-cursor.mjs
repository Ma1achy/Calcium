// F937 and F938, mutated: the quadratic cursor in `fitStyled` and `sliceCells`.
//
// **The subject is a cost, and a cost has no failing case.** Both functions were
// green under every row that reached them while `[...text.slice(i)][0]` copied
// the rest of the row to read one code point, on every character of every row
// of every frame — 53 % of frame work. So the rows written against it are of
// two kinds and this run has to reach both: the *rule* (SS60, whose vitest
// witness is the fabrication row in `enforce-rules.test.ts`) and the
// *measurement* (T3.77 and T3.78, a ratio at 400 cells against 50 with a 20 ms
// floor under each operand). The spread put back is caught by the second kind
// here and by `make enforce` outside this run; the rule weakened is caught by
// the first. Neither alone is the claim.
//
// **The read and the step are separate claims**, which T6.105 says in prose and
// the code-unit mutations say in code: `i += 1` walks the low half of every
// astral pair as a character of its own, and nothing about the read notices.
//
// **And the step is a cluster, not a code point** (C09 I63, F939, F955). The walk
// takes three kinds of piece — an escape, a run of printable ASCII, one cluster
// from the segmenter — and each has a mutation: the cluster arm reverted to a
// code point, the run admitting a joiner, the run not giving up its last
// character before an extender, the tail rule removed, the remainder segmented
// to reach the cursor (the quadratic by the mechanism SS60 cannot see, which
// T3.84 sees), and the measure's scan counting an escape as a cell.
//
// **What the timing rows cannot see is stated rather than left**: a spread put
// back at one site leaves the other row green — which is why each site has a
// row — and the bound at 24× is what a contended machine has room under, so a
// survivor here on a loaded box is re-run once before it is read (F8, F929).
//
// **Every expectation below was measured by hand before this file was written**
// — each mutation applied from a good copy, the named files run, the tree
// restored and compared — so the `expect` fields are what failed, not what was
// meant to. And the run's own precondition: `CMD` includes
// `enforce-rules.test.ts`, whose *every implemented rule is inventoried in A03*
// row is red until SS60 has its A03 §4 row, and `runPass` refuses a clean tree
// that does not pass. Land the row first, or the harness throws before the
// control.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/text.test.ts test/edge/text-cursor.test.ts test/unit/enforce-rules.test.ts";

const TEXT = "src/presentation/text.ts";
const SCANS = "tools/enforce/source-scans.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: "  if (ascii) return text.length; // cells-ok — proven equal to the walk above",
    to: "  if (ascii) return text.length + 1; // cells-ok — proven equal to the walk above",
    why: "every ASCII string measures one cell too many, which T1.13's first row sees outright; a run where this survives is not executing the text suite at all",
  },
  mutations: [
    {
      // **The quadratic by the mechanism SS60 cannot see** (F938's stated
      // blind spot, F955, F958). The remainder of the row is *materialised* per
      // cluster — every cluster after the cursor built to read the first — and
      // no spread is written, so the scan is silent. The styled ASCII rows of
      // T3.77 and T3.78 never reach the cluster arm, so both stay green;
      // T3.84's CJK row is the one that sees it, on the pad path. **Measured
      // first with `GRAPHEMES.segment(text.slice(i))` in place of this, which
      // survived**: a slice is a view in V8 and `containing` is lazy, so that
      // spelling is linear and was a vacuous fabrication (F958).
      name: "FIT-REMAINDER: the fitStyled cluster arm builds every cluster after the cursor",
      file: TEXT,
      from:
        "    segments ??= GRAPHEMES.segment(text);\n" +
        "    const cluster = clusterAt(segments, i);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "    if (used + w > width) {",
      to:
        "    segments ??= GRAPHEMES.segment(text);\n" +
        "    const cluster = graphemes(text.slice(i))[0] ?? \"\";\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "    if (used + w > width) {",
      expect: "T3.84",
    },
    {
      // The same at the window's cluster arm: T3.84's tail ratio.
      name: "SLICE-REMAINDER: the sliceCells cluster arm builds every cluster after the cursor",
      file: TEXT,
      from:
        "    segments ??= GRAPHEMES.segment(text);\n" +
        "    const cluster = clusterAt(segments, i);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      to:
        "    segments ??= GRAPHEMES.segment(text);\n" +
        "    const cluster = graphemes(text.slice(i))[0] ?? \"\";\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      expect: "T3.84",
    },
    {
      // **The third instance, put back** (F938): the `g` regex scans to the
      // next escape anywhere after the cursor. The reason it survives moved:
      // the regex is asked only where the code unit at the cursor is the
      // escape byte, and the callers' `m.index === i` check is kept, so a
      // forward search costs a scan only from a bare escape and can never skip
      // text. Listed to say so: a survivor here is the recorded blind spot, not
      // a finding about the tests.
      name: "STICKY-OFF: the escape match is a forward search again",
      file: TEXT,
      from: "  return new RegExp(sgrPattern().source, \"y\");",
      to: "  return sgrPattern();",
      expect: "(none — expected to survive)",
    },
    {
      // **The step, not the read** (T6.105). The cursor advances one code unit
      // past a cluster; the next ask finds the same cluster beginning before
      // the cursor and the tail rule yields its remainder as a piece, so the
      // low half of every astral pair lands in the output on its own.
      name: "FIT-UNIT: the fitStyled cursor advances one code unit past a cluster",
      file: TEXT,
      from:
        "    out += cluster;\n" +
        "    used += w;\n" +
        "    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed",
      to:
        "    out += cluster;\n" +
        "    used += w;\n" +
        "    i += 1;   // cells-ok: advancing the cursor past what was consumed",
      expect: "T1.31",
    },
    {
      // The same in the window's main path. **T1.16c stays green** — measured,
      // and it is F939's own mechanism: the composition law is arithmetic over
      // pieces, so only a row that reads the output, not a sum, sees the step.
      name: "SLICE-UNIT: the sliceCells cursor advances one code unit past a cluster",
      file: TEXT,
      from:
        "    if (started) out += cluster;\n" +
        "    used += w;\n" +
        "    i += cluster.length;   // cells-ok: advancing the cursor past what was consumed",
      to:
        "    if (started) out += cluster;\n" +
        "    used += w;\n" +
        "    i += 1;   // cells-ok: advancing the cursor past what was consumed",
      expect: "T1.31",
    },
    {
      // **The cluster step reverted to a code point** at the fitStyled site
      // (C09 I63, F939): the family is walked as seven pieces again, so the row it
      // sits in is padded by nothing. T1.36's Prepend row sees it too.
      name: "FIT-POINT: the fitStyled cluster arm takes one code point",
      file: TEXT,
      from:
        "    const cluster = clusterAt(segments, i);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "    if (used + w > width) {",
      to:
        "    const cluster = String.fromCodePoint(text.codePointAt(i) ?? 0x20);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "    if (used + w > width) {",
      expect: "T3.79",
    },
    {
      // The same at the window: the joiner between two blanks comes back.
      name: "SLICE-POINT: the sliceCells cluster arm takes one code point",
      file: TEXT,
      from:
        "    const cluster = clusterAt(segments, i);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      to:
        "    const cluster = String.fromCodePoint(text.codePointAt(i) ?? 0x20);\n" +
        "    if (cluster === \"\") break;\n" +
        "    const w = pieceCells(cluster, c, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      expect: "T3.79",
    },
    {
      // **The plain run admitting the joiner.** A family still measures 2 —
      // it begins with a pictograph, so `containing` takes the whole cluster
      // and the run never lands on its joiners — and T1.13 stays green;
      // what the run takes is a joiner standing alone, `cells("\\u200d")` at
      // 1 for 0, which T3.79's record of the per-code-point sums sees.
      // Measured: T3.79 alone.
      name: "RUN-ZWJ: the plain set admits U+200D",
      file: TEXT,
      from: "  return c >= 0x20 && c <= 0x7e;\n}",
      to: "  return (c >= 0x20 && c <= 0x7e) || c === 0x200d;\n}",
      expect: "T3.79",
    },
    {
      // **`cells()`'s own fast path admitting the joiner.** A family still
      // leaves the path at its first pictograph and measures 2, so T1.13
      // stays green here too; a joiner standing alone is eleven-elevenths
      // printable and measures 1 for 0, which T3.79's record sees. Measured:
      // T3.79 alone — both joiner mutations are thin, and say so.
      name: "FAST-ZWJ: the printable-ASCII path admits U+200D",
      file: TEXT,
      from:
        "  for (let i = 0; i < text.length; i += 1) {  // cells-ok — a code-unit cursor, not a width\n" +
        "    const c = text.charCodeAt(i);\n" +
        "    if (c < 0x20 || c > 0x7e) {",
      to:
        "  for (let i = 0; i < text.length; i += 1) {  // cells-ok — a code-unit cursor, not a width\n" +
        "    const c = text.charCodeAt(i);\n" +
        "    if ((c < 0x20 || c > 0x7e) && c !== 0x200d) {",
      expect: "T3.79",
    },
    {
      // **The run keeping its last character before an extender**: a keycap
      // becomes a digit beside a zero-width tail (one cell for two) and a
      // spacing mark a cell of its own (two for one). A combining mark is zero
      // cells either way, which is why T1.31 stays green and T1.36 holds the
      // keycap.
      name: "RUN-GREEDY: the plain run does not give up its last character",
      file: TEXT,
      from: "  if (end > i && end < text.length && text.charCodeAt(end) >= 0xa0) end -= 1;   // cells-ok: a code-unit cursor\n",
      to: "",
      expect: "T1.36",
    },
    {
      // **The tail rule removed**: a mark placed directly after an escape
      // joins the escape's `m`, and the whole cluster is emitted from the
      // cursor — so the `m` is repeated in the output.
      name: "TAIL-OFF: the cluster found before the cursor is emitted whole",
      file: TEXT,
      from: "  return found.index < i ? found.segment.slice(i - found.index) : found.segment;",
      to: "  return found.segment;",
      expect: "T1.36",
    },
    {
      // **The measure's scan counting an escape as a cell**: a styled row is
      // no longer already `width`, and T1.30's first styled row is cut.
      name: "COUNT-ESCAPE: displayCells's scan counts an escape as one cell",
      file: TEXT,
      from:
        "      const m = sgr.exec(text);\n" +
        "      if (m !== null && m.index === i) {\n" +
        "        i = sgr.lastIndex;\n" +
        "        continue;\n" +
        "      }\n" +
        "    }\n" +
        "    return cells(text.replace(sgrPattern(), \"\"), ambiguous);",
      to:
        "      const m = sgr.exec(text);\n" +
        "      if (m !== null && m.index === i) {\n" +
        "        total += 1;\n" +
        "        i = sgr.lastIndex;\n" +
        "        continue;\n" +
        "      }\n" +
        "    }\n" +
        "    return cells(text.replace(sgrPattern(), \"\"), ambiguous);",
      expect: "T1.30",
    },
    {
      // **The window's run arm taking the run from its start** rather than
      // from `start`: the cells before the window's left edge come back.
      name: "WINDOW-LO: the window's run arm ignores the left edge",
      file: TEXT,
      from: "      const lo = Math.max(used, start);",
      to: "      const lo = used;",
      expect: "T1.16",
    },
    {
      // **T1.30's own subject**: a pad is not a cut, and four bytes on every
      // plain row would have every golden asserting the reset rather than the
      // row. Listed because `fitStyled` had no row of its own until F937.
      name: "RESET-ALWAYS: a cut closes whether or not it carried style",
      file: TEXT,
      from: "  if (cut && styled) out += reset;",
      to: "  if (cut) out += reset;",
      expect: "T1.30",
    },
    {
      // **The rule, blinded to the line that shipped.** Indexing at `[1]`
      // rather than `[0]` matches nothing in the tree and nothing in the
      // fabrication, so the scan reports compliance exactly as an unimplemented
      // rule would — the A03 §2 class, caught by commitment 14's row. Measured:
      // all three fabrication rows and the control row fail; the control row is
      // the one named, because the fabrication rows are an `it.each` whose
      // title is a template and the anchor sweep reads titles verbatim.
      name: "RULE-BLIND: SS60 asks for the second element",
      file: SCANS,
      from: "    pattern: /(?:\\[\\.\\.\\.[^;\\n]*?\\]|Array\\.from\\([^;\\n]*?\\))\\s*(?:\\[0\\]|\\.at\\(0\\))/,",
      to: "    pattern: /(?:\\[\\.\\.\\.[^;\\n]*?\\]|Array\\.from\\([^;\\n]*?\\))\\s*(?:\\[1\\]|\\.at\\(1\\))/,",
      expect: "SS60 fires on the cursor's read and is silent on a spread the code reads whole",
    },
    {
      // **The rule, narrowed to one spelling.** The spread arm alone passes the
      // copied line and fails the `Array.from` fabrication — one fabrication per
      // spelling is what makes this a kill rather than a survivor. The row is
      // `$rule fires on a fabricated violation` rendered for SS60; the anchor
      // sweep reads the template, so the expectation is the template's tail.
      name: "RULE-NARROW: SS60 forgets Array.from",
      file: SCANS,
      from: "    pattern: /(?:\\[\\.\\.\\.[^;\\n]*?\\]|Array\\.from\\([^;\\n]*?\\))\\s*(?:\\[0\\]|\\.at\\(0\\))/,",
      to: "    pattern: /\\[\\.\\.\\.[^;\\n]*?\\]\\s*(?:\\[0\\]|\\.at\\(0\\))/,",
      expect: "fires on a fabricated violation",
    },
    {
      // **The rule, retargeted.** `RULE_INVARIANTS` compares the declared spec
      // by equality, so a rule pointed at a different invariant fails there
      // rather than drifting from the one it was written for (F934's class).
      name: "RULE-RETARGET: SS60 declares C09 I20",
      file: SCANS,
      from: "  { id: \"SS60\", spec: \"C09 I60 · C09 T3.77\",",
      to: "  { id: \"SS60\", spec: \"C09 I20 · C09 T3.77\",",
      expect: "fires on a fabricated violation",
    },
  ],
});

console.log(report(results));

// A survivor is a finding about the rows, with one listed exception above whose
// `expect` says so in the anchor sweep's reserved words; the exit code is still
// one bit and it stays honest.
const unexpected = results.filter((r) => !r.killed && r.expect !== "(none — expected to survive)");
process.exit(unexpected.length > 0 ? 1 : 0);
