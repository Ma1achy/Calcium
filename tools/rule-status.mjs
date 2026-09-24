// The rule ledger, resolved against the tree.
//
//     node tools/rule-status.mjs                  # the real ledger
//     node tools/rule-status.mjs --file <path>    # a fixture's
//
// **Every `current` rule in the registry is in exactly one of three states**, and
// the three sets partition the population by equality. `roadmap-status.mjs` is
// the template and the argument is its: a verifier that checked only the rows
// carrying a claim would certify whichever subset chose to carry one, and the
// set that grows quietly is the one nobody is asserting about.
//
// ## The four checks, and the fourth is the one that matters
//
// **1. The ledger's rules are the registry's `current` rules**, both ways. A rule
// added to the registry, or a row left behind by one that was superseded, fails
// here on the day it happens.
//
// **2. A `cited` row's R-ID really appears** outside `docs/design/language/`.
//
// **3. A `covered` row's subject resolves.** Every `path` it names exists, and
// every backticked identifier appears in at least one file the row cites — the
// check that caught a roadmap row naming a real mechanism in the wrong file.
//
// **5. A `parked` row names an open question** — `parked as N`, and entry N in
// `docs/design/PARKED_QUESTIONS.md` exists and is not retracted, so a row cannot
// outlive the question it waits on.
//
// **6. An `unmet` row is cited and says where.** Uncited, it is `owed`; and its
// reason carries a path that exists, a section or an invariant, so *unmet* cannot
// be written without naming the place the rule fails.
//
// (Five states since SS66's amendment: `cited` now means *not yet audited*, and
// `unmet` and `parked` came out of it.)
//
// **4. An `owed` row's R-ID does NOT appear outside the registry.** This is the
// direction a snapshot cannot hold. Without it, a rule that gets built and cited
// leaves its `owed` row behind and the remainder reads larger than it is, for
// exactly as long as nobody re-derives the number by hand — which is the failure
// the ledger exists to stop, reproduced inside the ledger.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LEDGER = "docs/design/language/RULE_LEDGER.md";
const REGISTRY = "docs/design/language/calcium-registry.json";
// The corpus a citation may live in — everything but the registry's own home,
// because a rule citing itself is not a reference to it.
const argScope = process.argv.indexOf("--scope");
/**
 * `--scope <dir>` replaces the corpus, and it exists for one control: an
 * `unmet` row that nothing cites. Once `owed` emptied, no real rule was
 * reliably uncited, so the control could not take that arm on the live tree.
 */
const SCOPE = argScope === -1 ? [
  "src", "test", "tools", "docs/components", "docs/architecture",
  "docs/design/layout", "docs/design/PARKED_QUESTIONS.md", "CALCIUM_ROADMAP.md",
] : [process.argv[argScope + 1]];

const argFile = process.argv.indexOf("--file");
const ledgerPath = argFile === -1 ? LEDGER : process.argv[argFile + 1];

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const current = new Set(
  registry.rules.filter((r) => r.status === "current").map((r) => r.id),
);

/** Every R-ID named anywhere in `SCOPE`. `grep` exits 1 on no match, which is a result. */
function citedIds() {
  try {
    const out = execFileSync("grep", ["-rhoE", "R-[A-Z]{3}-[0-9]{3}", ...SCOPE], {
      encoding: "utf8",
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

const ROW = /^\| \*\*(R-[A-Z]{3}-\d{3})\*\* — (.*?) \| `(cited|covered|unmet|parked|owed)` \| (.*?) \|$/u;
const rows = [];
for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
  const m = ROW.exec(line);
  if (m !== null) rows.push({ id: m[1], title: m[2], state: m[3], by: m[4] });
}

const problems = [];
const seen = new Set();

// 1 — the two populations, by equality.
for (const r of rows) {
  if (seen.has(r.id)) problems.push(`${r.id}: two rows in the ledger`);
  seen.add(r.id);
  if (!current.has(r.id)) {
    problems.push(`${r.id}: a ledger row for a rule that is not \`status: current\``);
  }
}
for (const id of current) {
  if (!seen.has(id)) problems.push(`${id}: a current rule with no ledger row`);
}

const cited = citedIds();

/** The open entries of the parked file, by number — a retracted or ruled one is not open. */
const PARKED = "docs/design/PARKED_QUESTIONS.md";
const openQuestions = new Set(
  [...readFileSync(PARKED, "utf8").matchAll(/^\*\*(\d+) · (?!RETRACTED|RULED)/gmu)].map((m) => m[1]),
);

for (const r of rows) {
  // 2 — a citation claim is a claim about the corpus.
  if (r.state === "cited" && !cited.has(r.id)) {
    problems.push(`${r.id}: marked \`cited\` and named nowhere outside the registry`);
  }
  // 4 — and so is the absence of one.
  if (r.state === "owed" && cited.has(r.id)) {
    problems.push(
      `${r.id}: marked \`owed\` and now cited — move the row rather than leaving it, ` +
        `or the remainder reads larger than it is`,
    );
  }
  // 5 — a parked row waits on a question that is still asked.
  if (r.state === "parked") {
    const n = /parked as (\d+)/iu.exec(r.by)?.[1];
    if (n === undefined) problems.push(`${r.id}: marked \`parked\` and names no question — write \`parked as N\``);
    else if (!openQuestions.has(n)) {
      problems.push(`${r.id}: parked as ${n}, which is not an open entry in ${PARKED}`);
    }
  }
  // 6 — an unmet row was looked at, and says where it fails.
  if (r.state === "unmet") {
    if (!cited.has(r.id)) {
      problems.push(`${r.id}: marked \`unmet\` and cited nowhere — an unaudited absence is \`owed\``);
    }
    const anchored = [...r.by.matchAll(/`([^`]*\/[^`]*\.[a-z]+)[^`]*`/gu)].some((m) => existsSync(m[1])) ||
      /§\d|\b[CA]\d{2} [IT§]|\bI\d+/u.test(r.by);
    if (!anchored) {
      problems.push(`${r.id}: marked \`unmet\` and anchors its reason to no path, section or invariant`);
    }
  }
  // 3 — a covered row's subject resolves.
  if (r.state === "covered") {
    const paths = [...r.by.matchAll(/`([^`]*\/[^`]*\.[a-z]+)[^`]*`/gu)].map((m) => m[1]);
    const names = [...r.by.matchAll(/`([^`]+)`/gu)].map((m) => m[1]);
    const files = paths.filter((p) => {
      if (existsSync(p)) return true;
      problems.push(`${r.id}: cites ${p}, which does not exist`);
      return false;
    });
    const idents = names.filter((n) => !n.includes("/") && /^[A-Za-z_][\w."]*$/u.test(n));
    for (const name of idents) {
      if (files.length === 0) continue;
      const found = files.some((f) => readFileSync(f, "utf8").includes(name));
      if (!found) {
        problems.push(`${r.id}: names \`${name}\`, which is in none of the files it cites`);
      }
    }
    // **A path that exists is the weakest claim a row can make**, and the first
    // control pass proved it: moving `pull.ts` to `chrome.ts` left the row
    // green, because the row named a file and nothing that had to be inside it.
    // So a `covered` row carries at least one identifier the cited file holds —
    // which is the difference between *this file exists* and *this file is
    // where the rule lives*.
    if (files.length > 0 && idents.length === 0) {
      problems.push(
        `${r.id}: marked \`covered\` and names a path with no identifier in it — ` +
          `a file that exists is not evidence that the rule lives there`,
      );
    }
    if (paths.length === 0 && !/\b[CIT]\d|§/u.test(r.by)) {
      problems.push(`${r.id}: marked \`covered\` and names no subject to resolve`);
    }
  }
}

const count = (s) => rows.filter((r) => r.state === s).length;
console.log(
  `${String(rows.length)} current rules — ` +
    `${String(count("cited"))} cited, ${String(count("covered"))} covered, ` +
    `${String(count("unmet"))} unmet, ${String(count("parked"))} parked, ${String(count("owed"))} owed`,
);
if (problems.length === 0) {
  console.log("every claim resolves, and the five sets partition the population");
  process.exit(0);
}
for (const p of problems) console.log(`  ${p}`);
console.log(`${String(problems.length)} problems.`);
process.exit(1);
