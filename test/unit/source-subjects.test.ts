import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sourceOf } from "../support/source.js";

/**
 * **A source-text assertion lives in a different file from its subject, and
 * nothing said where** (F1070).
 *
 * `test/support/source.ts` lets a row assert against another file's text. Five
 * suites use it over seven subjects, and **three of the seven name a file in
 * another component** — including a mutual crossing, where C10's suite asserts
 * about C12's source and C12's suite asserts about C10's.
 *
 * **That is invisible to the discipline every lane follows.** A lane edits its
 * component and runs the files it touched; a row asserting about those files
 * from a neighbouring component's suite is in neither set. It is not
 * hypothetical: C12 I125 moved a runtime assertion into the constructor of a
 * branded type — a strictly stronger design — and a row in C10's suite that
 * asserted the *old call text* went red. The lane's own gates were green.
 *
 * **So this is the reverse index**, and it is a list rather than a rule for the
 * usual reason: what a lane needs is *which file asserts about mine*, which no
 * gate over the code can answer and a table can. Compared by equality in both
 * directions, so a new subject must be declared and a deleted one must be
 * struck.
 *
 * **The scan sees one encoding, and the other is declared beside it.** A path
 * written as a literal is derivable; a path that arrives as a walk variable or
 * through a constant is not, and a matcher that reports absence when the value
 * changes form is the failure this repository has measured repeatedly. Those
 * callers are **counted and named** rather than excluded.
 *
 * **And the scan reads stripped source, which it learned on its own first run.**
 * The paragraph above once wrote the call shape out in prose to explain itself,
 * and the matcher found it — an eighth subject that is a sentence. That is the
 * documented class exactly: prose about a mechanism is denser than the
 * mechanism, so the best-explained file fails hardest. The remedy was already in
 * the tree and is the helper this file is an index *of*.
 */
const TEST_ROOT = "test";

/** Every `*.test.ts` under `test/`, repo-relative. */
function testFiles(dir = TEST_ROOT, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) testFiles(path, out);
    else if (path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/**
 * Subject → the suites asserting about its text, derived from `sourceOf("…")`.
 *
 * **Three of these cross a component boundary** and are the reason the table
 * exists: `theme.test.ts` is C10's and reaches into C12's two renderers, and
 * `plot-svg-colour.test.ts` is C12's and reaches into C10's token table.
 */
const LITERAL_SUBJECTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // C10's suite, asserting about C12's source. The crossing that went red.
  "src/presentation/plot/sankey.ts": ["test/unit/theme.test.ts"],
  "src/presentation/plot/scatter3.ts": ["test/unit/theme.test.ts"],
  // C12's suite, asserting about C10's source. The same crossing, reversed.
  "src/presentation/theme/tokens-dark.ts": ["test/unit/plot-svg-colour.test.ts"],
  // Inside one component.
  "src/presentation/plot/svg.ts": ["test/unit/plot-svg-path.test.ts"],
  // **This file's own control, and the index therefore indexes itself.** SR3
  // reads `theme.test.ts` to prove the matcher sees a literal it is known to
  // contain, which makes that suite a subject like any other — so reordering
  // its `sourceOf` calls breaks a row two files away, and this line is where a
  // reader finds that out.
  "test/unit/theme.test.ts": ["test/unit/source-subjects.test.ts"],
  // An instrument beside its own subject.
  "tools/contact-defaults.mjs": ["test/unit/catalogue-tools.test.ts"],
  "tools/phase-catalogue.mjs": ["test/unit/catalogue-tools.test.ts"],
  "tools/plot-catalogue.mjs": ["test/unit/catalogue-tools.test.ts"],
});

/**
 * Suites that call `sourceOf` with a path the scan cannot read.
 *
 * **Counted, not excluded**, and each carries why. The moment one of these
 * starts writing literals it must move into the table above, which the equality
 * arm below enforces from the other side.
 */
const COMPUTED_CALLERS: Readonly<Record<string, string>> = Object.freeze({
  "test/contract/capabilities.test.ts":
    "C02 T2.10 walks `src/` and calls `sourceOf(file)` on each, plus `sourceOf(ALLOWED)` " +
    "through a constant. Its subject is the whole tree rather than a named file, so there " +
    "is no entry a lane could look itself up in — the row is a scan and the table is for " +
    "point assertions.",
});

/** Files that import the helper at all. */
function importers(files: readonly string[]): string[] {
  return files.filter((f) => /from "\.\.?\/(?:\.\.\/)?support\/source\.js"/u.test(sourceOf(f)));
}

describe("test/support/source.ts — who asserts about whose text", () => {
  /**
   * **SR1 — the index is complete, both directions.**
   *
   * Containment either way is silent about the other: subset-of-declared lets a
   * new crossing land unlisted, and declared-subset-of-found lets an entry
   * outlive the row that justified it. Both have happened in this repository to
   * lists of exactly this shape.
   */
  it("SR1 (F1070): every literal subject is declared, and every declaration is still asserted", () => {
    const found = new Map<string, string[]>();
    for (const file of testFiles()) {
      for (const m of sourceOf(file).matchAll(/\bsourceOf\("([^"]+)"\)/gu)) {
        const subject = m[1] ?? "";
        const at = found.get(subject) ?? [];
        if (!at.includes(file)) at.push(file);
        found.set(subject, at);
      }
    }
    const derived = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
    const declared = Object.fromEntries(
      Object.entries(LITERAL_SUBJECTS)
        .map(([k, v]) => [k, [...v]] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    expect(derived, "the reverse index is what the suite actually does").toEqual(declared);
  });

  /**
   * **SR2 — the computed callers are counted rather than dropped.**
   *
   * A file that imports the helper and writes no literal is invisible to SR1,
   * which is exactly how an exemption becomes a hole. So the two sets are
   * asserted to partition the importers.
   */
  it("SR2 (F1070): every importer either declares its subjects or is a named computed caller", () => {
    const all = importers(testFiles());
    const literal = new Set(Object.values(LITERAL_SUBJECTS).flat());
    const computed = new Set(Object.keys(COMPUTED_CALLERS));
    expect(
      all.filter((f) => !literal.has(f) && !computed.has(f)),
      "an importer in neither set is a source assertion nobody can look up",
    ).toEqual([]);
    expect(
      [...computed].filter((f) => !all.includes(f)),
      "a computed caller that stopped importing the helper is a stale exemption",
    ).toEqual([]);
  });

  /**
   * **SR3 — the reader control, because both rows above are satisfied by a
   * scanner that finds nothing.**
   *
   * SR1's equality passes on two empty objects and SR2's filters pass on an
   * empty list. This asserts the walk reaches the tree and the matcher sees a
   * subject it is known to contain.
   */
  it("SR3 (F1070): the scan reaches the tree and the matcher sees a known subject", () => {
    const files = testFiles();
    expect(files.length, "the walk finds the suite").toBeGreaterThan(300);
    expect(files, "and a file the index names").toContain("test/unit/theme.test.ts");
    expect(
      /\bsourceOf\("([^"]+)"\)/u.exec(sourceOf("test/unit/theme.test.ts"))?.[1],
      "the matcher reads a literal it is known to contain, through the stripper",
    ).toBe("src/presentation/plot/sankey.ts");
  });
});
