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
// the last two mutations say in code: `i += 1` walks the low half of every
// astral pair as a character of its own, and nothing about the read notices.
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
      // **F937 as it shipped, at the site it named.** The read allocates the
      // rest of the row on every character; the pad path walks the whole row;
      // T3.77's ratio goes from ~8× to ~48×. SS60 fires on the line too, under
      // `make enforce`, which this run does not execute.
      name: "FIT-SPREAD: the spread restored at the fitStyled site",
      file: TEXT,
      from:
        "    const ch = pointAt(text, i);\n" +
        "    if (ch === \"\") break;\n" +
        "    const w = cells(ch, ambiguous);\n" +
        "    if (used + w > width) {",
      to:
        "    const ch = [...text.slice(i)][0] ?? \"\";\n" +
        "    if (ch === \"\") break;\n" +
        "    const w = cells(ch, ambiguous);\n" +
        "    if (used + w > width) {",
      expect: "T3.77",
    },
    {
      // **The second site, which F937 did not name** (F938). T3.77 stays green
      // — it never calls `sliceCells` — and that is the argument for two rows.
      name: "SLICE-SPREAD: the spread restored at the sliceCells site",
      file: TEXT,
      from:
        "    const ch = pointAt(text, i);\n" +
        "    if (ch === \"\") break;\n" +
        "    const w = cells(ch, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      to:
        "    const ch = [...text.slice(i)][0] ?? \"\";\n" +
        "    if (ch === \"\") break;\n" +
        "    const w = cells(ch, ambiguous);\n" +
        "\n" +
        "    // Straddling the left edge or the right",
      expect: "T3.78",
    },
    {
      // **The third instance, put back** (F938): the `g` regex scans to the
      // next escape anywhere after the cursor, so an unstyled row is walked
      // once per character. Bounded by a colour change every twenty cells on
      // the styled rows the timing rows use, so this is expected to **survive
      // both timing rows** and is listed to say so: the bench is what saw it
      // (15.7× against 7.9× at 400/50 on a plain row), and no row in the suite
      // measures a plain row. A survivor here is the recorded blind spot, not a
      // finding about the tests. Measured: 41 of 41 rows green with it applied.
      name: "STICKY-OFF: the escape match is a forward search again",
      file: TEXT,
      from: "  return new RegExp(sgrPattern().source, \"y\");",
      to: "  return sgrPattern();",
      expect: "(none — expected to survive)",
    },
    {
      // **The step, not the read** (T6.105). The low half of every astral pair
      // re-enters the walk as a one-cell character and lands in the output.
      // Measured: T1.31 and T3.79 fail, T1.30 and T1.16c stay green.
      name: "FIT-UNIT: the fitStyled cursor advances one code unit",
      file: TEXT,
      from:
        "    out += ch;\n" +
        "    used += w;\n" +
        "    i += ch.length;   // cells-ok: advancing the cursor past what was consumed\n" +
        "  }\n" +
        "\n" +
        "  // Only a cut that carried style needs closing.",
      to:
        "    out += ch;\n" +
        "    used += w;\n" +
        "    i += 1;   // cells-ok: advancing the cursor past what was consumed\n" +
        "  }\n" +
        "\n" +
        "  // Only a cut that carried style needs closing.",
      expect: "T1.31",
    },
    {
      // The same in the window's main path. **T1.16c stays green** — measured,
      // and it is F939's own mechanism: the composition law is arithmetic over
      // pieces that are each wrong by the same amount, so only a row that reads
      // the output, not a sum, sees the step. That is why T1.31 exists.
      name: "SLICE-UNIT: the sliceCells cursor advances one code unit",
      file: TEXT,
      from:
        "    if (started) out += ch;\n" +
        "    used += w;\n" +
        "    i += ch.length;   // cells-ok: advancing the cursor past what was consumed",
      to:
        "    if (started) out += ch;\n" +
        "    used += w;\n" +
        "    i += 1;   // cells-ok: advancing the cursor past what was consumed",
      expect: "T1.31",
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
