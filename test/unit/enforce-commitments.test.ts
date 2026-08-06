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
import { checkFindings } from "../../tools/enforce/findings.mjs";
import {
  checkCommitments,
  checkOrdering,
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
  tableColumn,
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
    const source = spec([["I1", "one."]], ["Elsewhere's (→ C04 I28)."]);
    expect(checkCommitments(["docs/components/C99_x.md"], at(source))).toEqual([]);
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
    // parser that stopped matching would report twenty-five clean documents.
    const files = specFiles();
    expect(files.length).toBe(25);

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
    // other twenty-four stayed invisible.
    const files = referenceFiles();
    const components = files.filter((f) => f.startsWith("docs/components/"));
    expect(components.length, "all 25 component specs").toBe(25);

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

  it("SP3: the exception list is two entries, and both are fabrication sites", () => {
    // Written out rather than counted, because the interesting fact is *which*:
    // the only files excused are the two that fabricate specs for these very
    // tests. Every other id in the tree resolves.
    expect(Object.keys(REFERENCE_EXCEPTIONS).sort()).toEqual([
      "test/unit/enforce-commitments.test.ts",
      "tools/enforce/commitments.mjs",
    ]);
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
  it("SP5: the real tree is clean, and the rule actually read it", () => {
    const v = checkFindings();
    expect(v.scanned, "files scanned").toBeGreaterThan(50);
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
    expect(v.citations, "it looked at the citation and accepted it").toBe(0);
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
