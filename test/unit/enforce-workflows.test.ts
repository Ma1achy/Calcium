// A03 SS62 — every `make` target a workflow runs is named in A04 §6.
//
// The rule exists because `grep -rln '\.github' tools/ Makefile` returned
// nothing: two files decided whether every gate ran and no gate read them.
// Four findings in one day came out of that directory and each was found by a
// person going to look (F1086, F1089, F1090, F1094 · F1095).
//
// Four things are asserted here and no one of them catches the others:
//
//   - **The corpus is not empty.** A section that failed to parse makes every
//     target agree, and a reconciliation reporting nothing over nothing reads
//     exactly like a reconciled one (A03 §2).
//   - **The rule fires**, naming SS62 and the target.
//   - **Prose does not satisfy it.** `check`, `test` and `install` are ordinary
//     English; if a mention anywhere in the section counted, the rule would pass
//     on the word rather than on the record. This is the row that makes the
//     code-only restriction load-bearing rather than decorative.
//   - **Both empty arms report.** No workflows, and no §6, are each a violation
//     rather than a clean pass.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkWorkflows, codeOf, sectionOf, targetsRun } from "../../tools/enforce/workflows.mjs";

const A04 = "docs/architecture/A04_repo_scaffolding.md";

const YAML = `name: ci
jobs:
  fast:
    steps:
      - run: make install
      - run: make enforce      # a trailing comment
      - run: make test
  full:
    steps:
      - run: make install
      - run: make golden
`;

/** A §6 naming three of the four targets, the fourth in prose only. */
const SECTION = `## 6. CI

\`\`\`
install → enforce → test
\`\`\`

Running the golden frames is what the second job is for.

## 7. Something else
`;

describe("A03 SS62 — the workflows against their record (F1095)", () => {
  it("T1.SS62a: the real corpus is not empty and every target resolves", () => {
    // The vacuity control, first for the reason SSD1 is first. Three separate
    // claims: the section parsed, the code-only restriction left something to
    // match against, and the join over the real files is total.
    const section = sectionOf(readFileSync(A04, "utf8"), "## 6. CI");
    expect(section.length, "A04 §6 parsed").toBeGreaterThan(1000);
    const code = codeOf(section);
    expect(code.length, "the code-only restriction left a corpus").toBeGreaterThan(200);
    expect(code.length, "and it is a fraction of the section, not all of it").toBeLessThan(
      section.length / 2,
    );
    expect(checkWorkflows(), "the tree's own workflows are all named in §6").toEqual([]);
  });

  it("T1.SS62b: the fabricated violation fires, naming the rule and the target", () => {
    const v = checkWorkflows({
      list: () => [".github/workflows/ci.yml"],
      readFile: (f) => (f === A04 ? SECTION : YAML),
    });
    expect(v.map((x) => x.rule), "SS62 is named").toEqual(["SS62"]);
    expect(v[0]?.message, "and the target that is missing").toContain("make golden");
    expect(v[0]?.file, "and the file that runs it").toBe(".github/workflows/ci.yml");
  });

  it("T1.SS62c: prose does not satisfy the rule — the code-only restriction is load-bearing", () => {
    // `golden` appears in SECTION, in a sentence, and the row above reports it
    // missing. Put the same word in a code span and it resolves. Without this
    // row the restriction could be dropped and every assertion above would
    // still pass, which is the shape a mutation pass exists to find.
    const named = SECTION.replace(
      "Running the golden frames",
      "Running `make golden` for the frames",
    );
    expect(
      checkWorkflows({
        list: () => [".github/workflows/ci.yml"],
        readFile: (f) => (f === A04 ? named : YAML),
      }),
      "a backticked mention resolves where the bare word did not",
    ).toEqual([]);
  });

  it("T1.SS62d: both empty arms report rather than passing", () => {
    expect(
      checkWorkflows({ list: () => [], readFile: () => SECTION })[0]?.message,
      "no workflow files is not the same as clean",
    ).toContain("corpus is empty");
    expect(
      checkWorkflows({
        list: () => [".github/workflows/ci.yml"],
        readFile: (f) => (f === A04 ? "# A04\n\n## 7. Something else\n" : YAML),
      })[0]?.message,
      "a missing §6 is not the same as clean",
    ).toContain("§6 not found");
  });

  it("T1.SS62e: the readers are exact", () => {
    expect(targetsRun(YAML), "deduplicated and sorted").toEqual([
      "enforce",
      "golden",
      "install",
      "test",
    ]);
    expect(targetsRun("- run: npm run build\n"), "npm scripts are not make targets").toEqual([]);
    expect(codeOf("a `span` and\n\n```\na block\n```\n"), "both forms").toContain("a block");
    expect(codeOf("no code here"), "and nothing else").toBe("");
    expect(sectionOf("## 6. CI\nx\n## 7. y\n", "## 9. Z"), "an absent heading is empty").toBe("");
  });
});
