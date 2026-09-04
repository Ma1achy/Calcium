// A03 SP10 — a mnemonic test-row label is unique within its spec (F635).
//
// **Every mutation is a cell of the walk table in the lane's report**, because a
// row governed by one rule restates it: the two families sharing one anchor
// (the invariant arm, the mid-line arm, the indentation arm), the duplicate list
// naming each id once (shared with SP7, so one mutation must fail on both
// sides), and the wiring — a rule implemented, inventoried, fabricated against
// and never invoked by the gate, which is the one that survived on the first
// pass and is why `SP10: the gate calls it` exists.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo`
// (F237). This run file is written and **not run here** — the lane's four
// mutations were applied by hand and restored, and each is recorded below with
// the row it must kill.
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const RULES = "tools/enforce/commitments.mjs";
const RUNNER = "tools/enforce/index.mjs";

// Both files, because the SP family's fire-tests live beside the parser and the
// inventory equality (A03 commitment 14b) lives in the rules file — a mutation
// that removes a rule from `SPEC_RULES` dies there rather than here.
const FILES = "test/unit/enforce-commitments.test.ts test/unit/enforce-rules.test.ts";

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
    file: RULES,
    from: "const NUMBERED = /^T\\d+\\./;",
    to: "const NUMBERED = /^ZZ/;",
    why:
      "no id is numbered, so every T row moves into the mnemonic family and out " +
      "of SP7's — both corpus rows change what they see and the partition row fails",
  },
  mutations: [
    {
      // The invariant arm. `[A-Z]+` swallows a bolded invariant declaration, which puts
      // every invariant list under a rule SP2 already owns — a duplicate reported
      // twice, in a family it does not belong to.
      name: "a single leading capital is a mnemonic label",
      file: RULES,
      from: "|[A-Z]{2,}\\d+[a-z]?)\\*\\*/gm",
      to: "|[A-Z]+\\d+[a-z]?)\\*\\*/gm",
      expect: "SP10: an invariant declaration is not a row",
    },
    {
      // The shared duplicate list. Measured by hand: this fails on **both**
      // sides, which is the point of one implementation — a second copy would
      // lose the clause on one of them and nothing would say so.
      // The expectation names SP10's row alone because MA4 resolves it against
      // a single test path; SP7's row dies in the same run and is the evidence
      // that the implementation is shared rather than copied.
      name: "a duplicate is named once per recurrence",
      file: RULES,
      from: "    if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);",
      to: "    if (seen.has(id)) duplicated.push(id);",
      expect: "SP10: every duplicate is named",
    },
    {
      // The under-matching direction, and the one that goes quiet: a tier
      // written as a nested list is skipped and the rule reports compliance
      // exactly like a satisfied one. Also fails on both sides.
      name: "a row must start at column zero",
      file: RULES,
      from: "const TEST_ROW = /^[ \\t]*- \\*\\*(T",
      to: "const TEST_ROW = /^- \\*\\*(T",
      expect: "SP10: an indented label is still a row",
    },
    {
      // **The one that survived the first pass.** Every fire-test calls the
      // checker directly, so a rule the gate never invokes passed the whole
      // family — implemented, inventoried, fabricated against, and off.
      name: "the gate does not call the rule",
      file: RUNNER,
      from: "  ...checkMnemonicRowIds(specs),",
      to: "",
      expect: "SP10: the gate calls it, and so does every other SP rule",
    },
    {
      // The scope, from the other side: a corpus-wide comparison gates `IF8`,
      // which C09 and C22 both declare about different things. The blind spot
      // is a ruling, and this is what makes it one.
      name: "uniqueness is corpus-wide rather than per document",
      file: RULES,
      from: "  for (const file of files) {\n    const ids = mnemonicRowsOf(file, readFile);",
      to: "  for (const file of files) {\n    const ids = files.flatMap((f) => mnemonicRowsOf(f, readFile));",
      expect: "SP10: one label in two specs is legitimate",
    },
  ],
});

report(results);
