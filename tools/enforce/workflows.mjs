// A03 SS62 — the workflows against their record. A04 §6.
//
// **`grep -rln '\.github' tools/ Makefile` returned nothing.** `make enforce`
// ran sixty-one source scans, a module graph, a commitment audit, a
// findings-register check and a todo-expiry sweep, and not one of them opened
// the two files that decide whether any of it runs. Four findings in one day
// came out of that directory and every one was found by a person going to look:
// F1086's trigger excluding branch pushes, in the tree forty-four days; F1089's
// workflow with neither of its two triggers; F1090's stage list naming five
// where the job runs seven; F1094's job installing four packages for rows that
// need five.
//
// This is SS31's shape with the subject changed. `DEPENDENCIES.md` is a
// document about `package.json` and SS31 compares them, because a document
// about a file drifts from it and the drift is invisible to a reader holding
// either one. A04 §6 is a document about `.github/workflows/` and had no such
// rule. FINDINGS F1095.
import { readFileSync, readdirSync } from "node:fs";

/** The rules this module implements. See MODULE_GRAPH_RULES for why. */
export const WORKFLOW_RULES = ["SS62"];

const A04 = "docs/architecture/A04_repo_scaffolding.md";
const WORKFLOW_DIR = ".github/workflows";

/**
 * Every `make` target a workflow's steps run, in file order, deduplicated.
 *
 * Deliberately textual rather than a YAML parse: the subject is
 * `- run: make e2e`, one line, and a parser would add a dependency to buy
 * nothing. The cost is that a target invoked through a shell variable or a
 * composite action is invisible, which is this rule's first blind spot and is
 * stated in A03's row.
 */
export function targetsRun(yaml) {
  const found = new Set();
  for (const m of yaml.matchAll(/run:\s*make\s+([a-z0-9-]+)/g)) found.add(m[1]);
  return [...found].sort();
}

/**
 * One `## N.` section of a document, heading included, up to the next one.
 *
 * Returns `""` when the heading is absent, which the caller reports rather
 * than treating as a section with nothing in it — an empty corpus makes every
 * target agree, and a rule reporting no disagreements over nothing reads
 * exactly like a reconciled one (A03 §2).
 */
export function sectionOf(doc, heading) {
  const start = doc.indexOf(heading);
  if (start === -1) return "";
  const next = doc.indexOf("\n## ", start + heading.length);
  return next === -1 ? doc.slice(start) : doc.slice(start, next);
}

/**
 * The part of a section a target may be *named* in: fenced blocks and inline
 * code spans, nothing else.
 *
 * **A prose match would pass on the word.** `check`, `test` and `install` are
 * ordinary English and appear in that section a dozen times each in sentences
 * about something else, so a section could stop naming a target as a target and
 * this rule would not notice. Restricted to code, §6 yields 875 characters of
 * its 8 932 — a tenth — and all ten targets still resolve, which is the
 * measurement that says the restriction is tight rather than merely smaller.
 */
export function codeOf(section) {
  const fenced = [...section.matchAll(/^```[\s\S]*?^```/gm)].map((m) => m[0]);
  const spans = [...section.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return [...fenced, ...spans].join("\n");
}

function names(code, target) {
  return new RegExp(`(?<![a-z0-9-])${target}(?![a-z0-9-])`).test(code);
}

/**
 * The disk, injected — SS62's fabricated violation is a pair of documents that
 * disagree, which no path in this tree can be (A03 commitment 14).
 */
export function checkWorkflows(io = {}) {
  const readFile = io.readFile ?? ((f) => readFileSync(f, "utf8"));
  const list =
    io.list ??
    (() => {
      try {
        return readdirSync(WORKFLOW_DIR)
          .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
          .map((f) => `${WORKFLOW_DIR}/${f}`);
      } catch {
        return [];
      }
    });

  const v = [];
  const files = list();
  if (files.length === 0) {
    v.push({
      rule: "SS62",
      file: WORKFLOW_DIR,
      message: "no workflow files — this rule's corpus is empty, which is not the same as clean",
      spec: "A04 §6",
    });
    return v;
  }

  const section = sectionOf(readFile(A04), "## 6. CI");
  if (section === "") {
    v.push({
      rule: "SS62",
      file: A04,
      message: "§6 not found — the record this rule resolves against is missing, so nothing can disagree",
      spec: "A04 §6",
    });
    return v;
  }
  const code = codeOf(section);

  for (const file of files) {
    for (const target of targetsRun(readFile(file))) {
      if (names(code, target)) continue;
      v.push({
        rule: "SS62",
        file,
        message:
          `runs \`make ${target}\` and A04 §6 does not name it — a stage or a job CI runs ` +
          `and the section that is CI's record has no word for, which is how \`proof\` ran ` +
          `on every pull request for as long as it did with nothing describing it`,
        spec: "A04 §6",
      });
    }
  }
  return v;
}
