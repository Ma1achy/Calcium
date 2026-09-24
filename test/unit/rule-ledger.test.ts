// The rule ledger's own gate, asserted by breaking it (A03 SS66).
//
// **A gate is not verified by passing.** `tools/rule-status.mjs` was green on its
// second run and one of its four checks did nothing: a `covered` row naming a
// path and no identifier passed with the path pointed at a file that has never
// held the mechanism. Three rows were in that state, so the green run was
// measuring three rows it could not see.
//
// So each row below is a **control**: the ledger is mutated in one way, the tool
// runs against the mutated copy, and the row asserts which sentence comes back.
// A control that stops failing is the finding.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LEDGER = "docs/design/language/RULE_LEDGER.md";
const text = (): string => readFileSync(LEDGER, "utf8");

/** The tool against a mutated ledger — `{ code, out }`, because the code is the verdict. */
function run(ledger: string, scope?: string): Readonly<{ code: number; out: string }> {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const path = join(dir, "LEDGER.md");
  writeFileSync(path, ledger);
  const args = scope === undefined ? [] : ["--scope", scope];
  try {
    const out = execFileSync("node", ["tools/rule-status.mjs", "--file", path, ...args], {
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "" };
  }
}

/** One row's line, by rule id — the mutation's anchor. */
function row(id: string): string {
  const line = text().split("\n").find((l) => l.startsWith(`| **${id}**`));
  expect(line, `${id} has a ledger row`).toBeDefined();
  return line as string;
}

/**
 * Each row here spawns `rule-status.mjs` two or three times, and the tool walks
 * `src/` per backticked identifier across 118 rows (`R-INT-005` alone cites
 * four files). **Measured 2026-09-24: 1.5 s per invocation on an idle
 * container** — and the suite runs fifteen workers wide, each spawning node
 * subprocesses of its own, so the same call has been observed past vitest's
 * 30 s default while passing in 1.5 s when this file runs alone.
 *
 * **The budget is the harness's, not the rule's**: every assertion below is
 * unchanged, and a row that fails on its own still fails. `mutate-anchors`'
 * `SWEEP_BUDGET_MS` is the same decision one file over, for the same reason.
 */
const LEDGER_BUDGET_MS = 120_000;

describe("A03 SS66 — the rule ledger resolves against the tree", () => {
  it("T1.154 (SS66, R-SPC-001): the live ledger is green, and its five states partition the registry", { timeout: LEDGER_BUDGET_MS }, () => {
    const { code, out } = run(text());
    expect(out, "the counts are reported rather than left to a reader").toMatch(
      /^\d+ current rules — \d+ cited, \d+ covered, \d+ unmet, \d+ parked, \d+ owed$/mu,
    );
    expect(out).toContain("every claim resolves");
    expect(code, "and it is green").toBe(0);
  });

  it("T1.155 (SS66): an `owed` row whose rule has since been cited is a violation", { timeout: LEDGER_BUDGET_MS }, () => {
    // **The negative check, and the only one a snapshot cannot hold.** A ledger
    // asserting only its positive claims certifies whichever subset chose to
    // carry one; the stale half is the half that reads as coverage. This is the
    // arm that fired on SS66's own landing — the A03 row cites `R-SPC-001` and
    // `R-REG-002`, and both were still marked `owed` when it was written.
    const before = row("R-SEL-012");
    const { code, out } = run(text().replace(before, before.replace("`cited`", "`owed`")));
    expect(out).toContain("R-SEL-012: marked `owed` and now cited");
    expect(code).toBe(1);
  });

  it("T1.156 (SS66): a rule with no row, and a row with no rule, both fail", { timeout: LEDGER_BUDGET_MS }, () => {
    const dropped = run(text().split("\n").filter((l) => !l.startsWith("| **R-SEL-012**")).join("\n"));
    expect(dropped.out).toContain("R-SEL-012: a current rule with no ledger row");
    expect(dropped.code).toBe(1);

    // The other direction: a row for an id the registry does not carry as
    // `current`. `R-SEL-999` exists nowhere, which is what makes it the control.
    const extra = run(`${text()}\n| **R-SEL-999** — invented | \`owed\` | nothing in the tree names it |`);
    expect(extra.out).toContain("R-SEL-999: a ledger row for a rule that is not `status: current`");
    expect(extra.code).toBe(1);
  });

  it("T1.157 (SS66): a `covered` row's subject must resolve, and must be more than a path", { timeout: LEDGER_BUDGET_MS }, () => {
    // **Two arms, and the second is the one the first control pass missed.**
    // Moving the file is caught by the identifier check; removing the identifier
    // leaves a path that exists, which is not evidence that the rule lives in it.
    const moved = run(text().replace("`src/shell/pull.ts` `pullIntoView`", "`src/shell/chrome.ts` `pullIntoView`"));
    expect(moved.out).toContain("R-INT-004: names `pullIntoView`, which is in none of the files it cites");
    expect(moved.code).toBe(1);

    const bare = run(text().replace("`src/presentation/table/cells.ts:106` `decimalPoints`", "`src/presentation/table/cells.ts`"));
    expect(bare.out).toContain("names a path with no identifier in it");
    expect(bare.code).toBe(1);
  });

  it("T1.154b (SS66): a `parked` row names an open question, and a retracted one fails it", { timeout: LEDGER_BUDGET_MS }, () => {
    const before = row("R-SEL-012");
    const as = (by: string): string => text().replace(before, `| **R-SEL-012** — x | \`parked\` | ${by} |`);
    // Open, so green: the control that shows the arm reads the file at all.
    expect(run(as("parked as 18, the postures")).code, "an open question").toBe(0);
    // **16 is retracted** — the entry exists, and a check that only asked
    // whether the number appeared would pass it.
    const retracted = run(as("parked as 16"));
    expect(retracted.out).toContain("R-SEL-012: parked as 16, which is not an open entry");
    expect(retracted.code).toBe(1);
    const bare = run(as("waiting on a question"));
    expect(bare.out).toContain("R-SEL-012: marked `parked` and names no question");
  });

  it("T1.154c (SS66): an `unmet` row is cited and anchors its reason", { timeout: LEDGER_BUDGET_MS }, () => {
    const before = row("R-SEL-012");
    const as = (by: string): string => text().replace(before, `| **R-SEL-012** — x | \`unmet\` | ${by} |`);
    expect(run(as("C10 §4k: no painter")).code, "cited, and anchored to a section").toBe(0);
    const loose = run(as("it does not hold"));
    expect(loose.out).toContain("R-SEL-012: marked `unmet` and anchors its reason to no path, section or invariant");
    expect(loose.code).toBe(1);
    // **The path arm, which the section anchor above never takes.** A path is an
    // anchor only if it exists — otherwise *unmet* can be written against a file
    // that was renamed away, which names no place at all.
    expect(run(as("`src/shell/confirm.ts` draws none")).code, "a path that exists").toBe(0);
    const gone = run(as("`src/shell/nowhere.ts` draws none"));
    expect(gone.out).toContain("R-SEL-012: marked `unmet` and anchors its reason to no path");
    // **The other half: an unmet rule nothing cites is owed.** An empty corpus
    // makes every rule uncited, so the arm is taken on the same row — rather
    // than on whichever rule happens to be uncited, a population the audit
    // exists to empty. The anchored control above is what shows the empty
    // scope is the only thing that changed.
    const empty = mkdtempSync(join(tmpdir(), "ledger-scope-"));
    const uncited = run(as("C10 §4k: no painter"), empty);
    expect(uncited.out).toContain("R-SEL-012: marked `unmet` and cited nowhere");
    expect(uncited.code).toBe(1);
  });
});
