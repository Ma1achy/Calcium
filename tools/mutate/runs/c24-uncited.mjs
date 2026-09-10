// C24's uncited invariants, mutated — and the two defects the rows found.
//
// **The rows here were written to *name* invariants, and naming is SP9's own
// stated blind spot**: it checks that an invariant is named by a row, never that
// the row naming it checks it. So this pass is the instrument that asks the
// other half, and it is the only one that can — a row citing `C24 I13` and
// asserting nothing about the sweep is green in every gate the repo has.
//
// Two of the mutations are the defects the rows were written against rather than
// invented pressure: `SCROLL-ARM` restores the exemption entry that made
// `degradesTo1Bit` refuse a legitimate document (F925), and `ASK-FIRST` restores
// the fake's own copy of the shell's default-choice rule (F926). A row that
// cannot see its own finding come back is a row that recorded a fix rather than
// holding one.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/public-api.test.ts test/contract/expect-document.test.ts";
const EXPECT_DOC = "src/testing/expect-document.ts";
const PRODUCER = "src/testing/producer-context.ts";
const VIEWMODEL = "src/data/viewmodel/types.ts";
const TEXT = "src/presentation/text.ts";
const CONTEXT = "src/interaction/completion/context.ts";
const CODE = "src/presentation/blocks/kinds/code.ts";
const BUILDERS = "src/shell/builders/types.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: EXPECT_DOC,
    from: "      for (const block of doc.blocks) visit(block);",
    to: "      for (const block of doc.blocks) void block;",
    why: "the sweep visiting nothing fails every D29 row; a run where this survives is not executing the compliance suite at all",
  },
  mutations: [
    {
      // **F925, put back.** The exemption whose reason says the children are
      // swept and whose effect is that nothing reads them.
      name: "scroll is an exemption again, not an arm",
      file: EXPECT_DOC,
      from: '          case "scroll":\n          case "mosaic":\n',
      to: '          case "mosaic":\n',
      expect: "T2.12",
    },
    {
      // The other half of the same finding: the container arm without the
      // premise check is `panel`'s old shape, which F102's guard never reached.
      name: "the container premise is not checked",
      file: EXPECT_DOC,
      from: "            assertContainerPremise(block);\n",
      to: "",
      expect: "degradesTo1Bit sweeps every kind",
    },
    {
      // A container arm that stops at one level. Every single-depth row still
      // passes; only the nested one moves.
      name: "the container arm does not recurse",
      file: EXPECT_DOC,
      from: "            assertContainerPremise(block);\n            for (const child of block.children) visit(child);",
      to: "            assertContainerPremise(block);",
      expect: "degradesTo1Bit sweeps every kind",
    },
    {
      // **F926, put back.** The marked one, else the *first* — true-sounding,
      // and the opposite of the rule the shell applies.
      name: "the fake reimplements the default choice as the first",
      file: PRODUCER,
      from: "    ask: (opts) => Promise.resolve(opts.choices[defaultStart(opts.choices)]?.key ?? \"\"),",
      to: "    ask: (opts) => Promise.resolve((opts.choices.find((c) => c.default) ?? opts.choices[0])?.key ?? \"\"),",
      expect: "T2.16",
    },
    {
      // The animation clock arriving on the measure side. C04's own rule, and
      // the one nothing but the declaration can hold.
      name: "measure receives a tick",
      file: VIEWMODEL,
      from: "  probe?: Probe,\n) => number;",
      to: "  probe?: Probe,\n  tick?: number,\n) => number;",
      expect: "T2.5",
    },
    {
      // The measurer publishing a `.length`. T2.13's non-vacuity guard is the
      // only thing between a consumer and a silent disagreement (C09 I1).
      name: "cells counts code units",
      file: TEXT,
      from: '  if (text === "") return 0;',
      to: '  return text.length;',
      expect: "T2.13",
    },
    {
      // The producer ignoring the manifest it is handed: a context that derives
      // from the line alone, which is the hand-built literal I19 refuses.
      name: "contextAt resolves no tool",
      file: CONTEXT,
      from: "export function contextAt(\n  input: string,\n  cursor: number,\n  manifest: Manifest | null,\n): CompletionContext {",
      to: "export function contextAt(\n  input: string,\n  cursor: number,\n  manifest: Manifest | null,\n): CompletionContext {\n  manifest = null;",
      expect: "T2.14",
    },
    {
      // **A factory you can import and cannot install.** The registration is
      // accepted and discarded, which is the asymmetry C24 I22 exists to refuse
      // and the one an export-list assertion cannot see.
      name: "registerGrammar discards its argument",
      file: CODE,
      from: "  lowlight.register(language, grammar);\n  memo.clear();",
      to: "  void language;\n  void grammar;\n  memo.clear();",
      expect: "T2.15",
    },
    {
      // **A third module reaching I/O from the runtime entry.** `text.ts` is
      // where `cells` and `truncate` come from, so it is on the entry and the
      // set grows to three — which is the direction F927 says an allow-list
      // compared by membership would have accepted in silence.
      name: "a second published module reaches node:fs",
      file: TEXT,
      from: 'import { stripControl } from "../data/text.js";',
      to: 'import { readFileSync } from "node:fs";\nvoid readFileSync;\nimport { stripControl } from "../data/text.js";',
      expect: "T2.6",
    },
    {
      // A driving policy on the declaration. I28's claim is that pausing is not
      // configurable, and the field is how it would become so.
      name: "LiveSpec gains a pause knob",
      file: BUILDERS,
      from: "export type LiveSpec",
      to: "export type LiveSpecUnused = Readonly<{ pause?: boolean }>;\nexport type LiveSpec",
      expect: "T2.17",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
