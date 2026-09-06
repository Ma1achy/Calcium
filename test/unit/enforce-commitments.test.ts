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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFindings, checkTriageInventory } from "../../tools/enforce/findings.mjs";
import {
  checkSectionReferences,
  checkCommitments,
  checkOrdering,
  checkTestRowIds,
  checkReferences,
  checkSeamFour,
  commitmentsOf,
  expectedOrder,
  invariantOrderOf,
  invariantsOf,
  OWNERS,
  REFERENCE_EXCEPTIONS,
  referenceFiles,
  scanReferences,
  SEAM_FILE,
  SEAM_OWNERS,
  seamRows,
  specFiles,
  checkInvariantCoverage,
  tableColumn,
  testRowsOf,
  mnemonicRowsOf,
  checkMnemonicRowIds,
  SPEC_RULES,
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
    // because it looked at nothing — twenty-seven specs, several hundred
    // commitments, and a count that fails if the glob ever stops matching.
    //
    // **It fired on C26 and that is the guard working**, not a maintenance cost:
    // the count went 25 → 26 the moment a spec landed, in CI, on a change whose
    // author had run `enforce` and `check` and not `test`. A derived count would
    // have said nothing, which is the state this number exists to prevent.
    //
    // **Second instance, 26 → 27 on C27** (the terminal emulator, 2026-09-06),
    // and it fired the same way: a spec-alone commit, `enforce` green, six rows
    // red. Two instances is the minimum for noticing a rule rather than evidence
    // for one — what both share is that the landing change touched no code the
    // count is about, so nothing else in the suite had a reason to move.
    const files = specFiles();
    expect(files.length).toBe(27);

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
    // C04 I28a exists. A rule that only matched `I\\d+` would report it as
    // dangling on the one spec that needed to interleave an invariant.
    const source = spec([["I28a", "the suffixed one."]], ["Backed (I28a)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
    expect(invariantsOf("docs/components/C99_x.md", at(source)).has("I28a")).toBe(true);
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
    // Found by running the rule, not by reading it. `(→ C04 I28)` matched the
    // local-citation pattern first and reported a dangling reference in the one
    // spec that had got the cross-reference right.
    //
    // **This row is true and it tests one of the two ways to write one** (F437).
    // The arrow can fall in the middle of a group and eight commitments put it
    // there; those went to the local arm for four years of this rule's life. The
    // four rows below are the other way, and the second of them is the direction
    // this row's shape cannot reach.
    const source = spec([["I1", "one."]], ["Elsewhere's (→ C04 I28)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
  });

  it("SP1: an arrow in the MIDDLE of a group still names another spec (F437)", () => {
    // `GROUP` was `/\((?!→)([^()]*)\)/g` — every group that did not *open* with
    // an arrow, with every `I\d+` inside read as local. `(I1, → C09 I9999)` is
    // such a group, so this reported `cites I9999` against C99.
    const source = spec([["I1", "one."]], ["Both (I1, → C09 I9999)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    // The message is the assertion, not the count: reported *as a
    // cross-reference*. `cites I9999` would be the old arm firing for the old
    // reason, and a bare `toHaveLength(1)` cannot tell those apart.
    expect(violations[0]?.message).toContain("cross-references C09 I9999");
    expect(violations[0]?.message).not.toContain("cites I9999");
  });

  it("SP1: the FALSE PASS — a foreign id colliding with a real local one (F437)", () => {
    // **The direction the row above cannot reach, and the one that actually
    // happened: 8 of 8.** Every mixed group in the corpus named a foreign
    // invariant whose number the citing spec also declared, so the local arm
    // found it and said nothing — a verdict decided by a coincidence of
    // numbering rather than by resolution.
    //
    // C99 declares I28. C09 does **not** declare I28 (it stops at I38 but has no
    // I28 gap — asserted below rather than assumed, because a fixture that
    // agreed with the rule by accident is what this whole finding is about).
    const source = spec([["I28", "a local one with the same number."]], ["Collides (I1x, → C09 I9999)."]);
    const collide = spec([["I9999", "the local homonym."]], ["Collides (→ C09 I9999)."]);

    // Control first: the fabrication's own I9999 exists, so a rule reading the
    // token as local finds it and reports nothing. That is the pre-fix verdict.
    expect(invariantsOf("docs/components/C99_x.md", at(collide)).has("I9999")).toBe(true);

    // And the rule reports it anyway, because it resolves against C09.
    const violations = checkCommitments(["docs/components/C99_x.md"], at(collide));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("cross-references C09 I9999");

    // The mixed form of the same collision, which is where the eight live.
    const mixed = spec([["I1", "one."], ["I9999", "the local homonym."]], ["Collides (I1, → C09 I9999)."]);
    const mv = checkCommitments(["docs/components/C99_x.md"], at(mixed));
    expect(mv).toHaveLength(1);
    expect(mv[0]?.message).toContain("cross-references C09 I9999");

    void source;
  });

  it("SP1: every token after the arrow is resolved, not just the first (F437)", () => {
    // The cross arm read `/^(I\d+[a-z]?)/` off the START of a target that was
    // *everything after the spec id*, so `(→ C04 I67, I68)` checked I67 and
    // dropped I68. Ten groups in the corpus, twenty tokens, ten unchecked.
    const source = spec([["I1", "one."]], ["Two of C09's (→ C09 I5, I9999)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("cross-references C09 I9999");
  });

  it("SP1: a second spec inside one group re-targets what follows it (F437)", () => {
    // `(→ C04 I73, C10 I31)` means C10's I31 and not C04's. Asserted on **which
    // spec the message names**, because reporting the right token against the
    // wrong document is the defect rather than a cosmetic difference.
    const source = spec([["I1", "one."]], ["Two specs (→ C09 I5, C10 I9999)."]);
    const violations = checkCommitments(["docs/components/C99_x.md"], at(source));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("cross-references C10 I9999");
    expect(violations[0]?.message).not.toContain("C09 I9999");
  });

  it("SP1: an arrow naming a section and no invariant is still a citation (F437)", () => {
    // **The repair's own regression, caught by running it.** The walk that
    // replaced the two-pass parser emitted a cross-reference only when an
    // invariant token attached, and `(→ A02 §1)` has none — so eight correctly
    // written commitments across C01, C05 and others became *cites nothing*.
    // Trading one silent defect for eight loud ones is still a defect.
    const source = spec([["I1", "one."]], ["Whose rule it is (→ A02 §1)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);

    // And its control: a bare group with neither an invariant nor an arrow must
    // still fail, or the row above passes by making the rule permissive.
    const bare = spec([["I1", "one."]], ["Nothing at all (§4)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(bare))).toHaveLength(1);
  });

  it("SP1: a cross-reference written without the arrow stays local — the stated blind spot (F437)", () => {
    // **Recorded rather than fixed.** `(C11 I17, I9)` is genuinely ambiguous:
    // the second token is either C11's or the citing spec's, and a rule that
    // guessed would resolve a citation against the wrong document in the other
    // direction. The arrow is the mark that says *elsewhere*; this rule follows
    // the mark and nothing else.
    const source = spec([["I1", "one."]], ["No arrow (C09 I1)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);

    // The blind spot made visible: C09's I9999 does not exist and this passes,
    // because with no arrow the token is read as C99's — which it has.
    const blind = spec([["I9999", "the local one."]], ["No arrow (C09 I9999)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(blind))).toEqual([]);
  });
});

// --- SP2 — the numbers locate what they name ------------------------------
//
// Every fabrication below **asserts that it parses to the ids intended before it
// asserts a verdict.** A03 §2 records SP1 broken twice by its fixtures rather
// than its logic — once by `- **I1 — text**`, which parses as no invariants at
// all and makes every citation in it read as dangling. A fixture written by the
// author of the rule, in the same sitting, carries the author's misreading; the
// only cheap defence is to check that the fixture says what it looks like.

/** Invariants alone, in the corpus's exact form. `spec()` needs commitments too. */
function invariantList(ids: readonly string[]): string {
  return ["# C99 — fabricated", "", "## Invariants", "", ...ids.map((id) => `- **${id}** — text.`), ""].join(
    "\n",
  );
}

describe("A03 SP2 — invariants are numbered 1..n, in order", () => {
  const FILE = "docs/components/C99_x.md";

  /** Parses first, then judges. The fixture is the thing most likely to be wrong. */
  function judge(ids: readonly string[]): readonly [string[], ReturnType<typeof checkOrdering>] {
    const read = at(invariantList(ids), FILE);
    const parsed = invariantOrderOf(FILE, read);
    expect(parsed, "the fabrication does not parse to what it looks like").toEqual([...ids]);
    return [parsed, checkOrdering([FILE], read)];
  }

  it("SP2: the real corpus, and it is a corpus", () => {
    // The vacuity half. `checkOrdering` skips a spec declaring nothing, so a
    // parser that stopped matching would report twenty-six clean documents.
    const files = specFiles();
    expect(files.length).toBe(27);

    const total = files.reduce((n, f) => n + invariantOrderOf(f).length, 0);
    expect(total, "355 invariants at the last audit; the parser must still see them").toBeGreaterThan(
      340,
    );

    expect(checkOrdering(files), "run `make enforce` for the detail").toEqual([]);
  });

  it("SP2: an ordered list passes, lettered variants included", () => {
    const [, clean] = judge(["I1", "I2", "I2a", "I3"]);
    expect(clean).toEqual([]);
  });

  it("SP2: a transposition fails, naming the position and what belongs there", () => {
    // C01's shape: an invariant appended to the end of a related group rather
    // than the end of the list. The right editorial instinct, and the reason the
    // remedy renumbers rather than reorders.
    const [, violations] = judge(["I1", "I2", "I5", "I3", "I4"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP2");
    expect(violations[0]?.message).toContain("position 3 holds I5 where I3 belongs");
  });

  it("SP2: a gap fails, and says which number is missing", () => {
    const [, violations] = judge(["I1", "I2", "I4"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("gap");
    expect(violations[0]?.message).toContain("I3 is not");
  });

  it("SP2: a duplicated id fails", () => {
    // The class A03 §2 records for rule ids, in the invariant list: every check
    // that compares sets sees one member, so the second invariant is invisible
    // to all of them and a citation resolves to whichever a reader finds first.
    const [, violations] = judge(["I1", "I2", "I2", "I3"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("declares I2 twice");
  });

  it("SP2: a lettered id whose base is elsewhere fails", () => {
    // What the letter *means* is "a variant of I2", and the adjacency is the
    // whole of how it says so. `I1, I2, I3, I2a` declares a variant four lines
    // from the thing it varies, which reads as an ordering slip and is not one.
    const [, violations] = judge(["I1", "I2", "I3", "I2a"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("the invariant before it is I3");
  });

  it("SP2: expectedOrder carries the letter rather than the position", () => {
    // The trap a positional renumber falls into, asserted directly because it is
    // the one the renumber script got wrong on its first pass. C04 declared
    // `I20a` immediately after `I20`; `I20` was renumbered to `I28`, so the
    // variant had to become `I28a` — not `I29`, and not whatever id happened to
    // sit at that index, which is what a positional pass produces.
    //
    // **The ids in this comment are pre-renumber and stay that way.** A sentence
    // describing a renumbering cannot itself be renumbered — the rewrite did
    // exactly that here and turned it into nonsense, which is the same class as
    // the note at the top of the pairing audit.
    expect(expectedOrder(["I5", "I6", "I6a", "I7"])).toEqual(["I1", "I2", "I2a", "I3"]);
    expect(expectedOrder(["I1", "I2", "I2a"]), "already correct, so unchanged").toEqual([
      "I1",
      "I2",
      "I2a",
    ]);
  });
});

/** Every `.ts` test file — the corpus `enforce` walks, so the row runs on it. */
function walkTests(dir = "test", out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p2 = `${dir}/${e}`;
    if (statSync(p2).isDirectory()) walkTests(p2, out);
    else if (/\.tsx?$/u.test(e) && !/\.d\.ts$/u.test(e)) out.push(p2);
  }
  return out;
}

describe("A03 SP9 — every invariant is named by at least one test row", () => {
  const SPEC = "docs/components/C99_x.md";
  const TEST = "test/unit/plot.test.ts"; // `TOPICS.plot` attributes bare ids here

  /** A spec and a test corpus, in the real form, parsed before it is judged. */
  function run(invariants: readonly string[], testSource: string, exempt: readonly string[]) {
    const spec = ["# C99 — fabricated", "", "## Invariants", "",
      ...invariants.map((n) => `- **${n}** — text.`), ""].join("\n");
    const read = (f: string): string => (f === SPEC ? spec : testSource);
    return checkInvariantCoverage([SPEC], [TEST], read, exempt);
  }

  it("SP9: the real corpus, and it is a corpus", () => {
    // **The vacuity half, and this rule needs it most** (F361, C12 §3ak.44's
    // neighbourhood). The whole finding is that an unsound matcher reported
    // full coverage — so a parser that stopped seeing invariants, or a walk
    // that stopped seeing tests, reports every spec clean in the same green
    // line the correct answer prints.
    const files = specFiles();
    expect(files.length).toBe(27);
    const r = checkInvariantCoverage(files, walkTests());
    expect(r.declared, "768 invariants at the last count; the parser must still see them")
      .toBeGreaterThan(700); // cells-ok — an invariant count
    expect(r.violations, "run `make enforce` for the detail").toEqual([]);
  });

  it("SP9: an invariant nobody names fails, and the message says which", () => {
    const { violations } = run(["I1", "I2"], 'it("T1.1 (C99 I1): text", () => {});', []);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP9");
    expect(violations[0]?.message).toContain("C99 I2");
  });

  it("SP9: a run-on citation counts, because that is how the corpus cites", () => {
    // `C04 I10, I11, I25` — one spec id governing what follows, which is SP3's
    // own reading. A resolver without it would call two of those three unowned
    // and this rule would demand rows that already exist.
    const { violations } = run(["I1", "I2"], 'it("T1.1 (C99 I1, I2): text", () => {});', []);
    expect(violations).toEqual([]);
  });

  it("SP9: the exemption list is compared by equality, both ways", () => {
    // **A subset check lets a cleared entry outlive its reason unread**, which
    // is `anchors.mjs`' rule and this repository's own finding. So a listed
    // invariant that has since been cited is a failure too — the list may only
    // shrink, and shrinking it is a deliberate edit.
    const cited = 'it("T1.1 (C99 I1, I2): text", () => {});';
    const stale = run(["I1", "I2"], cited, ["C99 I2"]);
    expect(stale.violations).toHaveLength(1);
    expect(stale.violations[0]?.message).toContain("now cited");

    const uncited = 'it("T1.1 (C99 I1): text", () => {});';
    expect(run(["I1", "I2"], uncited, ["C99 I2"]).violations, "and a listed one that is still uncited passes")
      .toEqual([]);
  });
});

describe("A03 SP7 — a test row's number is unique within its spec", () => {
  const FILE = "docs/components/C99_x.md";

  /** A tier list, in the corpus's exact form. Parses first, then judges. */
  function rows(ids: readonly string[]): readonly [string[], ReturnType<typeof checkTestRowIds>] {
    const source = ["# C99 — fabricated", "", "### Tier 1", "", ...ids.map((id) => `- **${id}**: text.`), ""].join(
      "\n",
    );
    const read = at(source, FILE);
    const parsed = testRowsOf(FILE, read);
    return [parsed, checkTestRowIds([FILE], read)];
  }

  it("SP7: the real corpus, and it is a corpus", () => {
    // The vacuity half, and this rule needs it more than SP2 does: a spec with
    // no test rows is skipped, so a parser that stopped matching would report
    // twenty-six clean documents in the same green line.
    const files = specFiles();
    expect(files.length).toBe(27);

    const total = files.reduce((n, f) => n + testRowsOf(f).length, 0);
    expect(total, "1,100 test rows at the last count; the parser must still see them").toBeGreaterThan(
      1000,
    );

    expect(checkTestRowIds(files), "run `make enforce` for the detail").toEqual([]);
  });

  it("SP7: distinct rows pass, letters and tiers included", () => {
    const [parsed, clean] = rows(["T1.1", "T1.2", "T1.2a", "T2.1", "T2.2"]);
    expect(parsed, "the fabrication does not parse to what it looks like").toEqual([
      "T1.1",
      "T1.2",
      "T1.2a",
      "T2.1",
      "T2.2",
    ]);
    expect(clean).toEqual([]);
  });

  it("SP7: a duplicated number fails, and the message names it", () => {
    // C04's shape: `T1.16` declared twice, once about row ids and once about a
    // plot's height. Nothing is missing and nothing dangles, so SP1 and SP3 stay
    // green — the number has simply stopped locating anything.
    const [, violations] = rows(["T1.1", "T1.16", "T1.2", "T1.16"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP7");
    expect(violations[0]?.message).toContain("declares T1.16 twice");
  });

  it("SP7: every duplicate is named, not only the first", () => {
    // Unlike SP2's transposition, these are not consequences of each other: a
    // tier that drifted usually carries several from one append, and a reader
    // fixes each separately. C23 held five.
    // **`T3.1` three times and not twice, and the mutation pass demanded it.**
    // With pairs alone, dropping the `already listed` guard fails nothing: a
    // number appearing twice is pushed once either way. A third occurrence is
    // the only shape where the two readings differ, and it is the shape a tier
    // reaches by being appended to twice.
    const [, violations] = rows(["T3.1", "T3.1", "T6.2", "T6.2", "T3.1"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("T3.1, T6.2");
    expect(violations[0]?.message, "named once, however many times it recurs").not.toContain(
      "T3.1, T6.2, T3.1",
    );
  });

  it("SP7: an `x` placeholder repeats freely, and that is the stated limit", () => {
    // **The rule's blind spot, asserted rather than described.** A spec under
    // construction writes `T3.x` for a row whose number is not yet decided —
    // C26 §8b carries seven — and a placeholder is not a claim about a row. The
    // cost is real and it is named: two rows that both stay `T3.x` are two rows
    // this rule will never separate, and only their landing numbers close that.
    const [parsed, clean] = rows(["T3.x", "T3.x", "T3.1"]);
    expect(parsed, "placeholders are excluded before the comparison").toEqual(["T3.1"]);
    expect(clean).toEqual([]);
  });

  it("SP7: a row named mid-sentence is a citation, not a declaration", () => {
    // **The first version of this row failed nothing and the mutation pass said
    // so.** It fabricated `see T1.2` — plain text, which the pattern could never
    // match with or without its anchor — so dropping the anchor left every
    // assertion green. A test must construct the state it claims, and the state
    // here is a bolded, dashed id *inside* a line: a fail-on-revert row naming
    // the row it breaks in the corpus's own form.
    const source = [
      "# C99 — fabricated",
      "",
      "- **T1.1**: text.",
      "- **T6.1**: reverting the guard - **T1.1** fails, and nothing else does.",
      "",
    ].join("\n");
    const read = at(source, FILE);
    expect(testRowsOf(FILE, read), "the mid-line id is a reference").toEqual(["T1.1", "T6.1"]);
    expect(checkTestRowIds([FILE], read)).toEqual([]);
  });

  it("SP7: an indented row is still a row", () => {
    // The other direction, and the one the anchor was quietly getting wrong: a
    // tier written as a nested list would be skipped entirely, and a rule that
    // stops seeing a section reports compliance exactly like a satisfied one.
    const source = [
      "# C99 — fabricated",
      "",
      "  - **T1.1**: text.",
      "  - **T1.1**: text again.",
      "",
    ].join("\n");
    const read = at(source, FILE);
    expect(testRowsOf(FILE, read)).toEqual(["T1.1", "T1.1"]);
    expect(checkTestRowIds([FILE], read)[0]?.message).toContain("declares T1.1 twice");
  });
});

describe("A03 SP10 — a mnemonic test-row label is unique within its spec", () => {
  const FILE = "docs/components/C99_x.md";

  /** A tier list in the corpus's exact form. Parses first, then judges. */
  function rows(ids: readonly string[]): readonly [string[], ReturnType<typeof checkMnemonicRowIds>] {
    const source = ["# C99 — fabricated", "", "### Tier 1", "", ...ids.map((id) => `- **${id}**: text.`), ""].join(
      "\n",
    );
    const read = at(source, FILE);
    return [mnemonicRowsOf(FILE, read), checkMnemonicRowIds([FILE], read)];
  }

  it("SP10: the real corpus, and it is a corpus", () => {
    // The vacuity half, and this rule needs it more sharply than SP7 does:
    // twenty-three of twenty-six specs declare **no** mnemonic rows at all, so
    // a parser that stopped matching would skip every file and report the same
    // green line. The count is what a reader watches, not the verdict.
    const files = specFiles();
    expect(files.length).toBe(27);

    const declaring = files.filter((f) => mnemonicRowsOf(f).length > 0);
    expect(declaring.map((f) => (f.split("/").pop() ?? "").slice(0, 3)), "C09, C12 and C22 name rows by mnemonic").toEqual([
      "C09",
      "C12",
      "C22",
    ]);

    const total = files.reduce((n, f) => n + mnemonicRowsOf(f).length, 0);
    expect(total, "183 mnemonic rows at the last count; the parser must still see them").toBeGreaterThan(150);

    // The control for the fabrication below: the tree as it stands is clean.
    expect(checkMnemonicRowIds(files), "run `make enforce` for the detail").toEqual([]);
  });

  it("SP10: fires on F635's own shape, in the file it happened in", () => {
    // **The fabricated violation over the real corpus rather than a fixture.**
    // C12 §9 held two rows both called `SK10`; the second was renamed to `SK11`
    // by hand and `make enforce` was green either way. This puts it back — in a
    // scratch copy read through the injected reader, never on disk — and the
    // rule must find it in the document it actually happened in.
    const target = "docs/components/C12_plot_renderer.md";
    const original = readFileSync(target, "utf8");
    expect(original, "the anchor the replacement below depends on").toContain("- **SK11** ");
    const mutated = original.replace("- **SK11** ", "- **SK10** ");
    expect(mutated, "a fabrication that changed nothing is not a fabrication").not.toBe(original);

    const violations = checkMnemonicRowIds(specFiles(), (f) => (f === target ? mutated : readFileSync(f, "utf8")));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP10");
    expect(violations[0]?.file).toBe(target);
    expect(violations[0]?.message).toContain("C12 declares SK10 twice");
  });

  it("SP10: distinct labels pass, families and letter variants included", () => {
    // A letter suffix says *variant of the row above* — SP2's ruling, which SP7
    // inherited — so `SC2b` beside `SC2` is two rows and not a collision.
    const [parsed, clean] = rows(["SK1", "SC2", "SC2b", "HZ10", "CAM3"]);
    expect(parsed, "the fabrication does not parse to what it looks like").toEqual([
      "SK1",
      "SC2",
      "SC2b",
      "HZ10",
      "CAM3",
    ]);
    expect(clean).toEqual([]);
  });

  it("SP10: every duplicate is named, not only the first", () => {
    // SP7's row, and it is here because the guard it tests is now **shared**:
    // `duplicatesIn` is one implementation for both rules, so dropping the
    // `already listed` clause has to fail on this side too. Three occurrences
    // and not two — with pairs alone the two readings agree.
    const [, violations] = rows(["SK1", "SK1", "HZ2", "HZ2", "SK1"]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("SK1, HZ2");
    expect(violations[0]?.message, "named once, however many times it recurs").not.toContain("SK1, HZ2, SK1");
  });

  it("SP10: one label in two specs is legitimate, and that is the stated scope", () => {
    // **The blind spot, asserted rather than described, against the corpus's
    // own instance.** `IF8` is declared in C09 §9 and again in C22 §9, about two
    // different things: a mnemonic means something inside the component that
    // draws it, so `IF` in one spec and `IF` in another are different subjects.
    // A corpus-wide comparison would gate this and be switched off.
    const declared = specFiles().filter((f) => mnemonicRowsOf(f).includes("IF8"));
    expect(declared.map((f) => (f.split("/").pop() ?? "").slice(0, 3)), "the reuse is real today").toEqual([
      "C09",
      "C22",
    ]);
    expect(checkMnemonicRowIds(declared), "and it is not a violation").toEqual([]);
  });

  it("SP10: an invariant declaration is not a row, and SP2 keeps it", () => {
    // `[A-Z]{2,}` and not `[A-Z]+`. A single leading capital is what an
    // invariant looks like, and matching those would put every invariant list
    // under this rule — reporting a duplicate SP2 already owns, in a family it
    // does not belong to, twice for one defect.
    const source = ["# C99 — fabricated", "", "- **I39** — an invariant.", "- **I39** — and again.", ""].join("\n");
    const read = at(source, FILE);
    expect(mnemonicRowsOf(FILE, read)).toEqual([]);
    expect(checkMnemonicRowIds([FILE], read)).toEqual([]);
  });

  it("SP10: the two families partition the corpus, so no row is counted twice", () => {
    // The structural interaction between SP7 and SP10: one anchor, two callers.
    // A label claimed by both would be one defect reported twice, and one
    // claimed by neither is the gap the pair exists to close.
    for (const file of specFiles()) {
      const numbered = new Set(testRowsOf(file));
      const mnemonic = mnemonicRowsOf(file);
      expect(mnemonic.filter((id) => numbered.has(id)), `${file} has a row in both families`).toEqual([]);
    }
  });

  it("SP10: the gate calls it, and so does every other SP rule", () => {
    // **The mutation pass asked for this row and nothing in the suite answered.**
    // Deleting `...checkMnemonicRowIds(specs)` from `tools/enforce/index.mjs`
    // failed **nothing**: every fire-test above calls the checker directly, so a
    // rule that is implemented, inventoried, fabricated against and never
    // invoked by `make enforce` passes the whole family. Measured on SP7 as
    // well — unwiring it fails nothing either — so this closes the class rather
    // than the instance it was found on.
    //
    // **Stated limit**: it proves the gate *calls* the checker, not that it
    // gates on the result. SP8 deliberately reports without gating, so demanding
    // the spread into `violations` would be wrong for one of the ten.
    const carriers: Record<string, string> = {
      SP1: "checkCommitments",
      SP2: "checkOrdering",
      SP3: "checkReferences",
      SP4: "checkSeamFour",
      SP5: "checkFindings",
      SP6: "checkTriageInventory",
      SP7: "checkTestRowIds",
      SP8: "checkSectionReferences",
      SP9: "checkInvariantCoverage",
      SP10: "checkMnemonicRowIds",
    };

    // Equality, so a rule added to `SPEC_RULES` without a carrier fails here
    // rather than being invisible to the loop below.
    expect([...SPEC_RULES].sort()).toEqual(Object.keys(carriers).sort());

    const runner = readFileSync("tools/enforce/index.mjs", "utf8");
    for (const [rule, fn] of Object.entries(carriers)) {
      expect(runner, `${rule}: the gate never calls ${fn}`).toMatch(new RegExp(`\\b${fn}\\(`));
    }
  });

  it("SP10: a label named mid-sentence is a citation, not a declaration", () => {
    // The anchor, in the shape the corpus actually writes: a fail-on-revert row
    // naming the row it breaks. Shared with SP7 rather than reimplemented, so
    // this is the same clause tested from the second side.
    const source = [
      "# C99 — fabricated",
      "",
      "- **SK10**: text.",
      "- **SK11**: reverting the guard - **SK10** fails, and nothing else does.",
      "",
    ].join("\n");
    const read = at(source, FILE);
    expect(mnemonicRowsOf(FILE, read), "the mid-line id is a reference").toEqual(["SK10", "SK11"]);
    expect(checkMnemonicRowIds([FILE], read)).toEqual([]);
  });

  it("SP10: an indented label is still a row", () => {
    // The under-matching direction, which is the one that goes quiet: a tier
    // written as a nested list would be skipped entirely and the rule would
    // report compliance exactly like a satisfied one.
    const source = ["# C99 — fabricated", "", "  - **SK10**: text.", "  - **SK10**: text again.", ""].join("\n");
    const read = at(source, FILE);
    expect(mnemonicRowsOf(FILE, read)).toEqual(["SK10", "SK10"]);
    expect(checkMnemonicRowIds([FILE], read)[0]?.message).toContain("declares SK10 twice");
  });
});

// --- SP3 — every reference resolves ---------------------------------------

describe("A03 SP3 — invariant references resolve outside the specs too", () => {
  it("SP3: the real tree is clean, and the resolver saw it", () => {
    // **Both halves, and the second is the whole point.** A resolver that walked
    // nothing, or whose token pattern stopped matching, returns no violations —
    // indistinguishable from a clean tree. So the count of references it actually
    // resolved is asserted, four figures, against a corpus of ~1500.
    const files = referenceFiles();
    expect(files.length, "src, test, tools and every document including components/").toBeGreaterThan(
      200,
    );

    const { violations, resolved } = checkReferences(files);
    expect(resolved, "the resolver must see the corpus, not merely fail to object").toBeGreaterThan(
      3000,
    );
    expect(
      violations.map((v) => `${v.file} — ${v.message}`),
      "run `make enforce` for the detail",
    ).toEqual([]);
  });

  it("SP3: the component specs are in the corpus, and are most of it", () => {
    // The gap this closed, asserted from the direction that found it. SP3's
    // corpus walked every documentation directory except `docs/components/` —
    // deliberately, and the rule's own message said so — on the premise that a
    // component spec's citations were covered elsewhere. They were not: SP1
    // checks that a commitment cites an invariant and SP2 checks ordering, and
    // neither resolves a cross-spec citation. So `C13 I99` in a component spec
    // dangled and passed, while the identical line in a behaviour spec failed.
    //
    // Asserting the *share* rather than the presence, because a single component
    // file slipping into the corpus would satisfy a membership check while the
    // other twenty-five stayed invisible.
    const files = referenceFiles();
    const components = files.filter((f) => f.startsWith("docs/components/"));
    expect(components.length, "all 27 component specs").toBe(27);

    const { resolved } = checkReferences(components);
    expect(resolved, "the densest citation corpus in the project").toBeGreaterThan(1500);
  });

  it("SP3: a bare id in a component spec resolves against that spec", () => {
    // One file, declaring and citing — which is what a spec is, and what the
    // resolver has to handle: `specPath("C14")` points back at this same file.
    const read = () =>
      "- **I19** — entryAtRow is pure and total.\n\n- **T1.1** (I19): a row resolves to an entry.\n";

    // The self-ownership rule. Without it every spec citing its own invariants —
    // which is what a spec mostly does — reads as an unowned bare reference, and
    // the check's first run reports 1052 violations that are all its own doing.
    // A check whose first run is that wrong gets switched off, not fixed.
    expect(
      checkReferences(["docs/components/C14_viewport.md"], read, {}).violations,
    ).toEqual([]);
  });

  it("SP3: a dangling citation inside a component spec fails", () => {
    const read = (f: string) =>
      f === "docs/components/C16_input_router.md"
        ? "- **T9.9** (C13 I99): fabricated.\n"
        : "- **I1** — At most one entry is live.\n";

    const { violations } = checkReferences(["docs/components/C16_input_router.md"], read, {});
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("C13 I99");
  });

  it("SP3: every owner-map entry matches something in the tree", () => {
    // SS26's class, inside the map this rule depends on. A row for
    // `src/presentation/blocks` when the tree holds `src/presentation/block/`
    // silently un-owns every file under it, and every bare reference in them
    // becomes an unowned one — or worse, resolves against a topic guess.
    const files = referenceFiles();
    for (const owner of OWNERS) {
      expect(
        files.some((f) => f.startsWith(owner.path)),
        `OWNERS names ${owner.path}, which matches no file`,
      ).toBe(true);
    }
  });

  it("SP3: a qualified reference to an invariant that does not exist fails", () => {
    const read = at("// C09 I99 says so.\n", "src/fake.ts");
    const { violations } = checkReferences(["src/fake.ts"], read, {});

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP3");
    expect(violations[0]?.message).toContain("cites C09 I99");
  });

  it("SP3 fires: the C02 test citing C01's invariants, restored", () => {
    // **The fabrication is the real defect**, copied from the call site rather
    // than invented (A03 commitment 14a). `test/integration/capabilities.test.ts`
    // cited a bare `I13` about aborting before first paint — C01's rule, in a
    // file about C02 — and had done since the file was written. That id is as it
    // stood then; C01's is `I14` after the renumber, and the fixture below is the
    // original text rather than a translation of it.
    const read = at(
      "    // I13, and the reason it is stated as \"aborts before first paint\".\n",
      "test/integration/capabilities.test.ts",
    );
    const { violations } = checkReferences(["test/integration/capabilities.test.ts"], read, {});

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("cites C02 I13 (bare, by owner)");
  });

  it("SP3 fires: a bare reference in a file nothing owns", () => {
    const read = at("Something about I5.\n", "docs/surfaces/S99_fake.md");
    const { violations } = checkReferences(["docs/surfaces/S99_fake.md"], read, {});

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("nothing before it says which spec owns it");
  });

  it("SP3: an owner is authoritative and adjacency overrides it", () => {
    // The two halves of resolution, in one file. `I2a` is C25's because the file
    // is C25's, even though C14 is named in the sentence before it — proximity
    // does not overrule an owner, and four of the first run's findings were
    // exactly that mistake. `C10 I21` is C10's because it says so.
    const read = at(
      [
        " * C14 virtualises on it.",
        " * I2a is the weaker one.",
        " * The surface comes from C10 I21.",
        "",
      ].join("\n"),
      "src/presentation/patch/height.ts",
    );

    expect(checkReferences(["src/presentation/patch/height.ts"], read, {}).violations).toEqual([]);
  });

  it("SP3: a qualified reference wrapped across lines is still qualified", () => {
    // **The rule's own first defect, found by running it.** `lines.ts` writes
    // `(C10\n * I21)`, and a resolver reading one line at a time sees a bare
    // `I21` in a C25 file and reports a defect that is not there. Adjacency is
    // measured over the gap between the two tokens — whitespace and the leaders a
    // wrapped line carries — rather than over a line.
    const read = at(
      [
        "/**",
        " * The background arrives through C10's `resolveBackground` (C10",
        " * I21), so the two channels cannot degrade differently.",
        " */",
        "",
      ].join("\n"),
      "src/presentation/patch/lines.ts",
    );

    expect(checkReferences(["src/presentation/patch/lines.ts"], read, {}).violations).toEqual([]);
  });

  it("SP3: in a document, proximity is the only signal and it carries the paragraph", () => {
    // The corpus cites in run-on lists — the pairing audit's appendix is
    // `C03 I9 · C04 I10, I11, I25 · C05 …` — and in blockquotes that wrap mid
    // sentence, so the scope crosses lines and ends at the blank one.
    const read = at(
      ["C04 I10, I11 and I12 are unbacked.", "", "And I1 is nobody's."].join("\n"),
      "docs/surfaces/S99_fake.md",
    );
    const { violations } = checkReferences(["docs/surfaces/S99_fake.md"], read, {});

    expect(violations, "the run-on list resolves; the id after the break does not").toHaveLength(1);
    expect(violations[0]?.message).toContain("bare I1");
  });

  it("SP3: markdown code is a form being illustrated, not a reference", () => {
    // Six exception entries the plan expected, replaced by one rule read off the
    // corpus: every id inside a code span or a fenced block in the documents is
    // an illustration — `(I3, I4)`, `T3.7 (I5): …`, `- **I1** — text` — and not
    // one occurrence anywhere is a real reference.
    const read = at(
      ["Cite it as `T3.7 (I5): …` in the test name.", "", "```", "3. …text… (I99)", "```", ""].join(
        "\n",
      ),
      "docs/surfaces/S99_fake.md",
    );

    expect(checkReferences(["docs/surfaces/S99_fake.md"], read, {}).violations).toEqual([]);
  });

  it("scanReferences: offsets survive masking, and the specs read their code", () => {
    // The two things the renumber depends on and SP3 does not.
    //
    // **Offsets.** Code is blanked to spaces rather than removed, so a reference
    // after a code span still points at the character it points at. A strip that
    // shortened the line would move every reference after it, and the renumber
    // rewrites by offset.
    const line = "The `code` span, then C09 I5.";
    const [ref] = scanReferences("docs/surfaces/S99_fake.md", line);
    expect(line.slice(ref?.start, ref?.end)).toBe("I5");

    // **Fenced code in a spec is read.** Ten references live in fenced type
    // declarations in `docs/components/` — `// pin the range (I33)` — the exact
    // opposite of the documents, where every id inside code is an illustration.
    const fenced = ["```ts", "  yMin?: number;   // pin the range (I33)", "```"].join("\n");
    expect(
      scanReferences("docs/components/C04_view_model.md", fenced, { owner: "C04", code: true }),
      "with code:false these would be invisible to the renumber",
    ).toHaveLength(1);
  });

  it("SP3: an exception whose reason has expired fails", () => {
    // Both directions, `checkSourceMap`'s shape. An exception list that only
    // grows is the silent-forever gap the rule exists to close, and the entry
    // that outlives its file is how it grows.
    const read = at("// C09 I5 resolves perfectly well.\n", "src/fake.ts");
    const { violations } = checkReferences(["src/fake.ts"], read, { "src/fake.ts": "stale" });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("has outlived its reason");
  });

  it("SP3: the exception list is four entries in two kinds, and the kinds are named", () => {
    // Written out rather than counted, because the interesting fact is *which*.
    // **And partitioned, because the second kind arrived inside the first.** The
    // row read *two entries, and both are fabrication sites* — true when written,
    // and a third category appeared the day three dated design notes were
    // unpacked into `docs/notes/`. Widening a count would have absorbed it: the
    // list would still have been "the exceptions" and nobody would have seen
    // that "every file excused fabricates a spec" had stopped being true.
    const FABRICATION = [
      "test/unit/enforce-commitments.test.ts",
      "tools/enforce/commitments.mjs",
    ];
    // Dated working documents citing a bare invariant whose owner is plain in
    // the paragraph. Excused on the same argument `docs/archive/` is: rewriting
    // one to cite ids the tool's way falsifies the record it exists to be. Named
    // one by one so the rest of `docs/notes/` stays checked.
    //
    // **`CALCIUM_3D_DESIGN.md` was here and is gone**, and the bidirectional arm
    // is what removed it rather than anyone remembering. Its reason named a
    // condition — *the design's premise is open pending a measurement* — the
    // measurement was taken and the note rewritten against it, so every
    // reference in it resolves and the excuse became a violation of its own
    // rule. **A reason that names a condition is one a gate can retire**, which
    // is what the deferral problem usually cannot manage: there the condition is
    // prose and nothing watches it, and here it was *the file being wrong*,
    // which the rule already checks every run (F431).
    const DATED_NOTES = [
      "docs/notes/CALCIUM_BLOCK_STATES.md",
      "docs/notes/CALCIUM_ML_BLOCKS.md",
    ];

    expect(Object.keys(REFERENCE_EXCEPTIONS).sort()).toEqual(
      [...FABRICATION, ...DATED_NOTES].sort(),
    );
    // **Every excused file exists**, or an exception outlives its subject — the
    // shape the row above this one tests for a stale reason, one field over.
    for (const f of Object.keys(REFERENCE_EXCEPTIONS)) {
      const at = join(import.meta.dirname, "..", "..", f);
      expect(existsSync(at), `${f} is excused and must exist`).toBe(true);
    }
  });
});

/**
 * Seam 4 and an owner's own table, fabricated.
 *
 * The seam doc carries the owner column; the owner doc does not. That asymmetry
 * is real — Seam 4 says who owns each row and the owner's section is already
 * scoped to itself — and a fixture that gave both three columns would agree with
 * a checker reading the wrong index in either.
 */
function seamDoc(rows: readonly (readonly [string, string])[]): string {
  return [
    "### Seam 4 — L4 orchestrates cross-layer effects",
    "",
    "| Effect | Sequence | Owner |",
    "|---|---|---|",
    ...rows.map(([effect, owner]) => `| ${effect} | \`a()\` → \`b()\` | ${owner} |`),
    "",
    "---",
    "",
  ].join("\n");
}

function ownerDoc(effects: readonly string[]): string {
  return [
    "### 3c. The sequences C99 owns",
    "",
    "| Effect | Sequence | Where |",
    "|---|---|---|",
    ...effects.map((effect) => `| ${effect} | \`a()\` → \`b()\` | §3 |`),
    "",
    "---",
    "",
  ].join("\n");
}

const FAKE_OWNER = { file: "docs/components/C99_fake.md", heading: /^###\s+3c\./ };

/** A reader over the two fabricated documents and nothing else. */
function reader(seam: string, owner: string) {
  return (f: string): string => {
    if (f === SEAM_FILE) return seam;
    if (f === FAKE_OWNER.file) return owner;
    throw new Error(`unexpected read: ${f}`);
  };
}

describe("A03 SP4 — Seam 4 and its owners agree, both directions", () => {
  it("SP4: the real tree is clean, and it is a corpus", () => {
    // **The corpus assertion first, for SP2's reason.** A heading that stopped
    // matching would yield no rows and no disagreements, and "clean" would mean
    // "could not read the table". The counts are asserted before the cleanliness
    // so that failure mode is a red test rather than a green one.
    const rows = seamRows();
    expect(rows.length, "Seam 4's rows").toBeGreaterThanOrEqual(12);
    expect(new Set(rows.map((r) => r.owner)), "both L4 components own rows").toEqual(
      new Set(["C22", "C23"]),
    );
    for (const [id, o] of Object.entries(SEAM_OWNERS)) {
      expect(tableColumn(o.file, o.heading).length, `${id} declares an orchestration table`)
        .toBeGreaterThan(0);
    }

    expect(checkSeamFour().map((v) => v.message), "SP4").toEqual([]);
  });

  // --- the two directions, fabricated separately ---------------------------
  //
  // **Two fabrications, and the second is why.** A rule written for equality can
  // be implemented as a subset and pass a single fixture — the vacuity class,
  // arriving inside the check built to close a duplication. One fabrication per
  // direction is the only arrangement where a one-directional implementation
  // fails, and the third test below is what makes that explicit.

  // --- SP5 — the findings ledger's citations --------------------------------
  //
  // **The corpus assertion comes first and it is not a formality here.** This
  // rule shipped vacuous twice, and both times `enforce` printed success: once
  // taking `index.mjs`'s file list, which is `walk("src")` and holds none of the
  // files that cite the ledger, and once with a range guard that skipped every
  // number past the maximum on a ledger with no gaps. Four fabricated violations,
  // zero firings. `scanned` and `citations` exist so a test can tell "clean" from
  // "did not run", which is the only difference that mattered.
  //
  // **And a third time, in the counter itself.** `citations` was incremented
  // inside the violation branch, so it was a second name for `violations.length`
  // — 0 on a clean tree whether the rule had walked past 412 citations or none.
  // This row asserted only `scanned`, which counts *files opened* and stays high
  // when the regex matches nothing and when the scope holds the wrong files. The
  // pair that failed both earlier times is regex-and-scope *together*, and only
  // `citations` can show it. F82.
  it("SP6: the real tree is clean, and the rule actually read it", () => {
    // **The rule this test exists for was green while 55 of 145 findings were
    // keyed nowhere** — because the evidence it offered was a sum over the
    // groups, and a total computed over the groups can only describe the
    // groups. F142, and F87's proxy one level out.
    const clean = checkTriageInventory();
    expect(clean.ids, "findings read").toBeGreaterThan(100);
    expect(clean.keyed, "and every one is keyed").toBe(clean.ids);
    expect(clean.map((x) => x.message), "SP6").toEqual([]);
  });

  /** The ledger and the triage as they are, for the two fabrications below. */
  const inventoryIo = (): { ledger: string; triage: string } => ({
    ledger: readFileSync("examples/docker/FINDINGS.md", "utf8"),
    triage: readFileSync("examples/docker/TRIAGE.md", "utf8"),
  });
  const io = (l: string, t: string) => ({
    read: (f: string) => (f.endsWith("TRIAGE.md") ? t : l),
  });

  it("SP6 fires: a finding filed and keyed nowhere", () => {
    // The drift the rule exists to catch, and the direction that actually
    // happened: 55 of them.
    const { ledger, triage } = inventoryIo();
    const filed = checkTriageInventory(
      io(`${ledger}\n\n## F999 — a fabricated finding\n\nbody.\n`, triage),
    );

    expect(filed.map((x) => x.message).join(" "), "an unkeyed finding fails").toContain("F999");
  });

  it("SP6 fires: a key removed, which also moves the sum", () => {
    // **The reverse, and it is a different rule wearing one id.** Removing a key
    // fails completeness *and* the total, so this fabrication is what proves the
    // sum check is live rather than inert behind the completeness check —
    // two violations, not one.
    //
    // **Split from the row above on the day `SPEC_RULES` learned about SP6.**
    // Commitment 14b requires a row per rule whose title says it *fires*, and
    // all three of these were one `it` — so the family check could not see any
    // of them, and SP6 sat in A03's table with the fabrication written and
    // invisible. A bundled row can only be split.
    const { ledger, triage } = inventoryIo();
    const unkeyed = checkTriageInventory(io(ledger, triage.replace("**F142**", "F142")));

    expect(unkeyed.length, "a removed key fails completeness and the sum").toBe(2);
  });

  /**
   * A reader that fakes **only the citing file** (F281).
   *
   * **The rows below handed their stub to the whole rule**, so `sectionsOf` read
   * it too and every spec's index came back empty — and a rule that finds no
   * sections reports every citation as dangling. Measured: `C12 §3a`, which
   * exists and is cited across the corpus, produced a violation under that
   * setup. So the two fabricated violations fired for any input at all and could
   * not tell a missing section from a present one, which is A03 §2's vacuity
   * class arriving in the instrument a rule owes.
   *
   * **That is why the one-letter pattern survived**: the probes agreed with the
   * rule instead of testing it.
   */
  const citing = (path: string, text: string) => (f: string): string =>
    f === path ? text : readFileSync(f, "utf8");

  it("SP8: the real tree is read, and its residue is a worklist rather than a gate", () => {
    // **SP8 is reported and not gated, and this row is what makes that expire.**
    // SP3 shipped with its two findings already fixed; this one arrived with 120
    // dangling across 58 targets, and a gate that fails on a hundred
    // pre-existing citations is switched off rather than fixed (F146's shape
    // from the other side).
    //
    // So the residue is asserted to be **non-empty**, which reads backwards and
    // is the point: the day someone closes the last one this row goes red and
    // says *now gate it*. A deferral that names a condition and is watched by
    // nothing is the class CLAUDE.md records three instances of; this is the
    // condition, watched.
    const v = checkSectionReferences(referenceFiles());
    // The counter, for SP5's reason exactly: a rule reporting zero over a corpus
    // it cannot read looks exactly like one reporting zero over a clean corpus,
    // and this rule's whole subject is a pointer that resolves to nothing.
    expect(v.resolved, "sections resolved — the rule saw its subject").toBeGreaterThan(3000);
    expect(
      v.violations.length,
      "when this reaches zero, move SP8 into the gated list in enforce/index.mjs",
    ).toBeGreaterThan(0);
  });

  it("SP8 fires: a citation to a section that was never written", () => {
    // The defect the rule exists for, and the one it found on its first run:
    // `C12 §3q` was pointed at by three source comments and had never been
    // written. A citation reads as a source.
    const at = "docs/architecture/A01_fabricated.md";
    const v = checkSectionReferences([at], citing(at, "The rule is stated in C12 §9z, which does not exist."));
    expect(v.violations.map((x) => x.message).join(" ")).toContain("no such section");
    // **The control, and it is what the row was missing.** A citation that
    // resolves must produce nothing — otherwise the assertion above is satisfied
    // by a rule that cannot read any document at all.
    const ok = checkSectionReferences([at], citing(at, "The rule is stated in C12 §3a."));
    expect(ok.violations, "a citation that resolves produces nothing").toEqual([]);
  });

  it("SP8 fires (F281): a two-letter section id, which the rule read as a one-letter one", () => {
    // **The fabricated violation above used `§9z`, and that is why the blind
    // spot survived**: one letter is the shape the pattern already handled, so
    // the probe agreed with the rule instead of testing it. `\d+[a-z]?` reads
    // `3ag` as **`3a`** — which C12 declares — so the citation resolved against
    // a section saying something else, and `### 3ak.12` matched no heading at
    // all. **612 citations in the corpus use two or more letters.**
    //
    // The pair below is what discriminates: under the old pattern **both** read
    // as `3a` and both resolved.
    const at = "docs/architecture/A01_fabricated.md";
    // **`§3aq` was the fabricated id until 2026-09-05, when C12 wrote a §3aq**
    // (the hidden series, I116) and the probe stopped being fabricated — the
    // row failed, which is the probe doing its job. `§3zq` is a two-letter id
    // no document is likely to reach; if it ever does, move again.
    const bad = checkSectionReferences([at], citing(at, "As C12 §3zq settles it."));
    expect(bad.violations.map((x) => x.message).join(" "), "C12 has no §3zq").toContain("§3zq");
    const ok = checkSectionReferences([at], citing(at, "As C12 §3ag settles it."));
    expect(ok.violations, "and C12 does have §3ag").toEqual([]);
  });

  it("SP8 fires (F281): a sub-section of a parent that numbers its own headings", () => {
    // **The dotted fallback is right about `§8b.7` and it hid a whole class.**
    // That id names the seventh *item inside* C26 §8b — a numbered line, not a
    // heading — so an index of headings cannot see it and reporting it would be
    // over-reporting. `§3ak.12` has the same shape and means a heading.
    //
    // What tells them apart is the parent: C12 §3ak declares `3ak.1` … `3ak.12`
    // as headings, and a document numbering its sub-sections that way is not
    // also using inline numbering for the same ids.
    const at = "docs/architecture/A01_fabricated.md";
    const v = checkSectionReferences([at], citing(at, "As C12 §3ak.99 has it."));
    expect(v.violations.map((x) => x.message).join(" ")).toContain("§3ak.99");
    const ok = checkSectionReferences([at], citing(at, "As C12 §3ak.11 has it."));
    expect(ok.violations, "and a sub-section that was written resolves").toEqual([]);

    // **The limit, stated, because an unrecorded one reads as strength.** A
    // *first* sub-section under a parent with no numbered children still falls
    // back — the two meanings are genuinely indistinguishable there.
    const item = checkSectionReferences([at], citing(at, "As C26 §8b.7 has it."));
    expect(item.violations, "an item inside a section is not a missing heading").toEqual([]);
  });

  it("SP8 fires: a bare § in a file no document owns", () => {
    // The other half — a pointer with nothing before it saying which document
    // owns it. Unresolvable rather than wrong, and it reads the same to a
    // reader either way.
    const at = "examples/docker/NOTES.md";
    const v = checkSectionReferences([at], citing(at, "See §4b for the ordering."));
    expect(v.violations.map((x) => x.message).join(" ")).toContain("bare §4b");
  });

  it("SP5: the real tree is clean, and the rule actually read it", () => {
    const v = checkFindings();
    expect(v.scanned, "files scanned").toBeGreaterThan(50);
    // A floor well under the true count (412 across 66 files at F82) so that
    // adding or removing findings does not move it, and far enough above zero
    // that a scope or regex regression cannot slip beneath it.
    expect(v.citations, "citations resolved — the rule saw its subject").toBeGreaterThan(200);
    expect(v.map((x) => x.message), "SP5").toEqual([]);
  });

  it("SP5 fires: a citation past the end of the ledger", () => {
    const known = new Set(["F1", "F2", "F3"]);
    const v = checkFindings({
      known,
      files: ["fake.ts"],
      read: () => "see FINDINGS F99 for why",
    });

    expect(v).toHaveLength(1);
    expect(v[0]?.rule).toBe("SP5");
    expect(v[0]?.message).toContain("F99");
  });

  it("SP5: `U+F900` is a code point and not a citation of F900", () => {
    // **The one hex form the word rule did not reach.** `0xF900` and `\uF900`
    // were excluded from the start because `x` and `u` are word characters;
    // `+` is not, so the Unicode form read as a citation and the rule invented
    // one — the loud failure rather than the quiet one. It fired on a docstring
    // naming a block of the East Asian Width property.
    const known = new Set(["F1", "F2", "F3"]);
    const v = checkFindings({
      known,
      files: ["fake.ts"],
      read: () => "the CJK compatibility ideographs at U+F900..U+FAFF are Wide",
    });
    expect(v, "a code point cites nothing").toHaveLength(0);
  });

  it("SP5: and a real citation beside one still resolves — the control", () => {
    // **Without this the narrowing is indistinguishable from one that stopped
    // reading the line.** The same line carries a code point and a citation.
    const known = new Set(["F1", "F2", "F3"]);
    const v = checkFindings({
      known,
      files: ["fake.ts"],
      read: () => "U+F900 is Wide, which is F99's subject",
    });
    expect(v, "the citation past the end still fires").toHaveLength(1);
    expect(v[0]?.message).toContain("F99");
    expect(v[0]?.message, "and the code point is not named").not.toContain("F900");
  });

  it("SP5 fires: a gap in the middle, which is the other way to be wrong", () => {
    const v = checkFindings({
      known: new Set(["F1", "F3"]),
      files: ["fake.ts"],
      read: () => "as F2 established",
    });
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("F2");
  });

  it("SP5: a live number passes — it checks existence, not aim", () => {
    // The stated limit, asserted so it is a decision rather than an oversight.
    // The citation that prompted this rule pointed at a real, unrelated finding
    // and still resolves.
    const v = checkFindings({
      known: new Set(["F1", "F2", "F3"]),
      files: ["fake.ts"],
      read: () => "see F2",
    });
    expect(v).toHaveLength(0);
    // **This assertion used to read `toBe(0)` under this exact message.** The
    // message states the intent — *it looked at the citation and accepted it* —
    // and the number asserted the opposite, because `citations` only counted
    // failures. Both were written in one sitting and neither was checked against
    // the other, which is F65's shape (an artefact wrong about itself) arriving
    // in a test rather than in a drawing. F82.
    expect(v.citations, "it looked at the citation and accepted it").toBe(1);
  });

  it("SP4 fires: a Seam 4 row its owner does not name", () => {
    // The C15–C20 shape inverted: the table knows about a sequence and the spec
    // that owns it has never heard of it.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["Command submit", "C99"], ["Scroll", "C99"]]), ownerDoc(["Command submit"])),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SP4");
    expect(violations[0]?.message).toContain('"scroll"');
    expect(violations[0]?.message).toContain("does not name it");
    expect(violations[0]?.file, "reported against the spec that is missing the row")
      .toBe(FAKE_OWNER.file);
  });

  it("SP4 fires: a sequence its owner declares that Seam 4 does not list", () => {
    // **The direction a subset check does not look, and the live one.** Four real
    // rows were found here — `Pop a pushed view`, `Stall detected`, `View refresh
    // tick` and `cd` / `export` — each declared in C23 §4 and absent from Seam 4
    // before this rule was written.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["Command submit", "C99"]]), ownerDoc(["Command submit", "Stall detected"])),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('"stall detected"');
    expect(violations[0]?.message).toContain("does not list it");
    expect(violations[0]?.file, "reported against the table that is missing the row")
      .toBe(SEAM_FILE);
  });

  it("SP4: both directions at once produce two findings, not one", () => {
    // **The control for the pair above, and the mutation pass measured it.**
    // Implementing SP4 as a subset — dropping the second loop — leaves the first
    // fabrication *passing*. Only the second direction's fabrication and this
    // case go red. So one fixture would have shown a green suite over a rule that
    // checks half of what it claims, which is the vacuity class arriving inside
    // the check built to close a duplication.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["Command submit", "C99"], ["Scroll", "C99"]]), ownerDoc(["Command submit", "Stall detected"])),
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.file).sort()).toEqual([SEAM_FILE, FAKE_OWNER.file].sort());
  });

  it("SP4 fires: an owner with rows and no orchestration table at all", () => {
    // C22's real state until SP4 was written: five Seam 4 rows and nothing to
    // compare them against. Reported once rather than five times — the finding is
    // the missing section, not each row.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["Scroll", "C99"], ["Resize", "C99"]]), "### 3c. Nothing here\n\n---\n"),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("declares no orchestration table");
    expect(violations[0]?.message).toContain("half a table");
  });

  it("SP4 fires: a Seam 4 table it cannot read reports the failure, not compliance", () => {
    // **This rule's own vacuity, closed.** A heading that stopped matching yields
    // no rows, no disagreements and a green run — passing for exactly the reason
    // it cannot see the thing it was asked about. SS26's failure, which this
    // family keeps rediscovering, so it is closed at the point of writing.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader("### Seam 5 — something else\n\n---\n", ownerDoc(["Scroll"])),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("could not be read");
  });

  it("SP4: markdown differences are not architectural differences", () => {
    // `` `cd` / `export` `` and `cd / export` are one row written by two hands.
    // Failing on that would make the rule about markdown; failing on "Submit"
    // against "Command submit" is the point, and that still fails.
    const violations = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["`cd` / `export`", "C99"]]), ownerDoc(["cd / export"])),
    );
    expect(violations, "backticks and emphasis are noise").toEqual([]);

    const renamed = checkSeamFour(
      { C99: FAKE_OWNER },
      reader(seamDoc([["Command submit", "C99"]]), ownerDoc(["Submit"])),
    );
    expect(renamed, "two names for one row is drift, and is caught").toHaveLength(2);
  });
});
