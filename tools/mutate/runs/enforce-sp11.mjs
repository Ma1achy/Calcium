// A03 SP11 — a commitment's number is unique within its spec (F225, F664, F998).
//
// **Every mutation is a cell of the walk's classification table**, because a row
// governed by one rule restates it: the rule off, the debt list compared as a
// subset rather than by equality, the scope ruling that makes reuse across two
// specs legitimate, and the two wirings — the gate that must call the checker and
// the inventory that must name it. SP10's own run is why the last two are here:
// *a rule implemented, inventoried, fabricated against and never invoked by the
// gate* survived that pass, and this rule was written knowing it.
//
// **The walk's shape is a table and not a trace**, deliberately. SP11 has no
// state and consumes no event stream — every one of its rule interactions holds
// at rest, which is the structural kind C18 §8a is indexed for. A sequence trace
// over it would have one row per rule and find nothing.
//
// **Run by hand and restored**, one file at a time with md5 either side: another
// lane's pass was live in this tree while the rule was being built, and passes
// run serially. All six were caught — the control by
// `SP11: the outstanding nine are real`, and the five below by the rows named.
// Two of them were rewritten first, and both rewrites are findings about the
// mutation rather than about the code: collapsing the spec id changed the *key*
// where the corpus-wide claim is about the *scope*, and one `expect` named a row
// title that does not exist.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const RULES = "tools/enforce/commitments.mjs";
const RUNNER = "tools/enforce/index.mjs";
const A03 = "docs/architecture/A03_enforcement_suite.md";

// Both files, on `enforce-sp11`'s siblings' argument: the SP family's
// fabrications live beside the parser, and 14b's inventory equality lives in the
// rules file — a mutation that unhooks the rule from `SPEC_RULES` or from A03's
// table dies there rather than here.
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
    from: "    const numbers = commitmentsOf(file, readFile).map((c) => String(c.n));",
    to: "    const numbers = [];",
    why:
      "no commitment is read at all, so every spec is unique by having nothing " +
      "in it and the empty-list arm reports none of the nine the tree holds",
  },
  mutations: [
    {
      // **The rule off.** The shape F664 is about: SP1 reads every commitment
      // and resolves its citation, and nothing counts the numbers.
      name: "uniqueness is never computed",
      file: RULES,
      from: "    for (const n of duplicatesIn(numbers)) found.push(`${id} ${n}`);",
      to: "    for (const n of []) found.push(`${id} ${n}`);",
      expect: "SP11: fires on F664",
    },
    {
      // **The debt list as a subset.** The direction that cannot be seen from a
      // green run: a repaired entry keeps its excuse, which is how F225's own
      // ruling outlived its reason unread for as long as it did.
      name: "the debt list is compared as a subset",
      file: RULES,
      from: '  if (cleared.length > 0) {\n    violations.push({\n      rule: "SP11",',
      to: '  if (false) {\n    violations.push({\n      rule: "SP11",',
      expect: "SP11: the debt list may only shrink",
    },
    {
      // **The scope ruling.** C09 and C22 both declare a commitment 41 about
      // different things and both are correct — SP10's blind spot for `IF8`, in
      // the other numbered family. A corpus-wide comparison would gate that and
      // be switched off, which is §2's lesson about every rule in the list.
      name: "uniqueness is corpus-wide rather than per document",
      file: RULES,
      from: "    const numbers = commitmentsOf(file, readFile).map((c) => String(c.n));",
      to: "    const numbers = files.flatMap((f) => commitmentsOf(f, readFile).map((c) => String(c.n)));",
      expect: "SP11: uniqueness is within one document",
    },
    {
      // **The one SP10's pass found and nothing else can.** Every fire-test
      // calls the checker directly, so a rule the gate never invokes passes the
      // whole family — implemented, inventoried, fabricated against, and off.
      name: "the gate does not call the rule",
      file: RUNNER,
      from: "  ...checkCommitmentNumbers(specs),\n",
      to: "",
      expect: "SP10: the gate calls it",
    },
    {
      // **The inventory, from the other side.** A rule in the code with no row
      // in A03 is a rule no reader can find, and 14b's equality is what says so.
      name: "A03 does not inventory the rule",
      file: A03,
      from: "| SP11 | A commitment's number is unique within its spec",
      to: "| SPZZ | A commitment's number is unique within its spec",
      expect: "every implemented rule is inventoried in A03",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
