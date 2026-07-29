// A03 SP1 — every commitment cites an invariant or names whose rule it is.
//
// The rule that stops the 2026-07-29 pairing audit from being a thing done once.
// That audit read 355 invariants against 358 commitments by hand and found 103
// mismatches; the cause was that the two lists were parallel prose with nothing
// checking they agreed, so a commitment could be added or an invariant deleted
// and no artefact noticed.
//
// Two directions, as with every rule here: it fires on the real tree, and it
// fires on fabricated input. The second is the whole lesson of SS26 — a rule
// with nothing to be wrong about passes exactly like a rule that is satisfied,
// and this one is especially exposed to that, because a document with no
// Commitments section produces no findings and looks compliant.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkCommitments,
  commitmentsOf,
  invariantsOf,
  specFiles,
} from "../../tools/enforce/commitments.mjs";

/**
 * A spec with the two sections and nothing else.
 *
 * `invariants` are `["I1", "one"]` pairs and are emitted in the corpus's exact
 * form — `- **I1** — text`. The bold wraps the id alone, and that matters: a
 * fabrication writing `- **I1 — text**` parses as no invariant at all, so every
 * citation reads as dangling and the rule looks broken when it is the fixture
 * that is.
 */
function spec(invariants: readonly (readonly [string, string])[], commitments: readonly string[]): string {
  return [
    "# C99 — fabricated",
    "",
    "## Invariants",
    "",
    ...invariants.map(([id, text]) => `- **${id}** — ${text}`),
    "",
    "---",
    "",
    "## Commitments",
    "",
    ...commitments.map((t, i) => `${String(i + 1)}. ${t}`),
    "",
    "---",
    "",
  ].join("\n");
}

/**
 * Fabricated source for the file under test; the real tree for everything else.
 *
 * A stub returning the fabrication for *every* path makes a cross-reference to
 * C09 I5 resolve against the fabrication's own invariant list, so the one marker
 * that reaches outside the document is the one the stub cannot exercise. The
 * fallback is what lets `(→ C09 I5)` be tested as the real resolution it is.
 */
const at =
  (source: string, self = "docs/components/C99_x.md") =>
  (file: string): string =>
    file === self ? source : readFileSync(file, "utf8");

describe("A03 SP1 — commitment/invariant pairing", () => {
  it("SP1: the real corpus is clean, and it is a corpus", () => {
    // Both halves. The first is the rule; the second is what stops it passing
    // because it looked at nothing — twenty-five specs, several hundred
    // commitments, and a count that fails if the glob ever stops matching.
    const files = specFiles();
    expect(files.length).toBe(25);

    const total = files.reduce((n, f) => n + commitmentsOf(f).length, 0);
    expect(total).toBeGreaterThan(300);

    expect(checkCommitments(files), "run `make enforce` for the detail").toEqual([]);
  });

  it("SP1: a commitment citing nothing fails", () => {
    const source = spec(
      [["I1", "a real invariant."]],
      ["Backed by nothing at all, and it reads perfectly well."],
    );
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP1");
    expect(violations[0]?.message).toContain("cites nothing");
  });

  it("SP1: the three markers each satisfy it", () => {
    // Backed, summary, cross-reference — A02 §1's three, and the categories the
    // audit produced. A fourth would mean the audit missed a shape.
    const source = spec(
      [["I1", "one."], ["I2", "two."], ["I3", "three."]],
      [
        "Backed by one invariant (I1).",
        "The readable form of several (I2, I3).",
        "Someone else's rule (→ C09 I5).",
      ],
    );
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
  });

  it("SP1: a citation of an invariant the spec does not declare fails", () => {
    // The failure mode a citation rule invites. Without this the rule degrades
    // from "cites an invariant" to "contains a bracket", which is worse than no
    // rule because it reads as enforced.
    const source = spec([["I1", "the only one."]], ["Cites a ghost (I9)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("which C99 does not declare");
  });

  it("SP1: a cross-reference that does not resolve fails", () => {
    // "the overclaim it was meant to replace, one indirection on" — C09 has no
    // I99, so pointing at it is the same unbacked claim wearing a citation.
    const source = spec([["I1", "one."]], ["Someone else's rule (→ C09 I99)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("C09 does not declare");
  });

  it("SP1: a cross-reference to a spec that does not exist fails", () => {
    const source = spec([["I1", "one."]], ["Points nowhere (→ C99 I1)."]);
    const violations = checkCommitments(["docs/components/C98_x.md"], at(source, "docs/components/C98_x.md"));

    expect(violations[0]?.message).toContain("not a spec");
  });

  it("SP1: an architecture cross-reference resolves by section, not by invariant", () => {
    // A01–A04 declare no invariants — A03's SS and MG rules are the
    // architecture's invariants in enforceable form — so `(→ A01 A.1)` is
    // accepted as a section reference and not chased for an `I<n>`.
    const source = spec([["I1", "one."]], ["A palette decision (→ A01 A.1)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
  });

  it("SP1: a numbered list outside the Commitments section is not a commitment", () => {
    // The boundary is why this parses rather than greps. §4's routes, §5's
    // wiring checklist and the tier tables are all numbered, and treating them
    // as commitments would produce dozens of findings and get the rule deleted.
    const source = [
      "# C99",
      "",
      "## 4. Resolution",
      "",
      "1. an exact fixture matches",
      "2. the world can answer",
      "",
      "---",
      "",
      "## Invariants",
      "",
      "- **I1** — one.",
      "",
      "---",
      "",
      "## Commitments",
      "",
      "1. Backed (I1).",
      "",
      "---",
    ].join("\n");

    expect(commitmentsOf("docs/components/C99_x.md", at(source))).toHaveLength(1);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
  });

  it("SP1: suffixed invariant ids resolve", () => {
    // C04 I20a exists. A rule that only matched `I\\d+` would report it as
    // dangling on the one spec that needed to interleave an invariant.
    const source = spec([["I20a", "the suffixed one."]], ["Backed (I20a)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
    expect(invariantsOf("docs/components/C99_x.md", at(source)).has("I20a")).toBe(true);
  });

  it("SP1: every invariant in a multi-citation is resolved, not just one", () => {
    // The hole the third pass found in this rule an hour after it shipped. The
    // first parser captured one id per parenthetical, so `(I1, I99)` resolved
    // I99 and ignored I1 — or resolved I1 and ignored I99, depending on where
    // the lazy quantifier landed. Either way a summary commitment could carry a
    // dangling citation beside a good one and pass, which is the "contains a
    // bracket" degradation this rule exists to prevent, inside the rule itself.
    const source = spec([["I1", "one."]], ["A summary of two (I1, I99)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("cites I99");
  });

  it("SP1: a cross-reference is not read as a local citation", () => {
    // Found by running the rule, not by reading it. `(→ C04 I20)` matched the
    // local-citation pattern first and reported a dangling reference in the one
    // spec that had got the cross-reference right.
    const source = spec([["I1", "one."]], ["Elsewhere's (→ C04 I20)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
  });
});
