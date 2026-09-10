// A03's *Declared* column against each `SCANS` row's own `spec` — the
// reconciliation F934 named and did not build (F1046).
//
// **Two records of one fact with nothing joining them.** A03 §4's rule tables
// carry a Declared cell per rule; `tools/enforce/source-scans.mjs` carries a
// `spec` string per rule, and it is the string a violation prints and SP9 reads
// as a citation. F934 measured the drift by hand — *28 agree, 12 have a code
// `spec` naming more than the table, 5 genuinely contradict* — fixed the one
// disagreement that had a ruling already on the record (SS37), and left the
// rest as prose in a ledger. A number measured once in a finding cannot move
// visibly; this file is what makes it move.
//
// **Why it is here and not in `source-scans.mjs`.** F427's rule: for a claim of
// the form *nothing does X*, the file holding the claim cannot be the one
// making it. `source-scans.mjs` is one of the two records being compared, so an
// assertion living there would be authored by the same hand as its subject. A
// test file holds neither record and reads both.
//
// **Not a `make enforce` rule.** `index.mjs` is where a rule is wired and this
// lane does not own it; the A03 row that would wire it is written into the
// lane's report. A test row is a gate — it fails a build — and it is the
// smallest true thing that can be gated today.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { SCANS } from "../../tools/enforce/source-scans.mjs";
import type { Scan } from "../../tools/enforce/source-scans.d.mts";

const A03_PATH = "docs/architecture/A03_enforcement_suite.md";

/**
 * A document a citation can name. `S\d\d` is the surfaces family, which no
 * Declared cell uses today and which the resolver in `commitments.mjs` accepts,
 * so it is here rather than discovered later.
 */
const DOCUMENT = /^(?:[CAS]\d{2}|FINDINGS|CLAUDE\.md|DEPENDENCIES\.md)$/u;

/** A reference *within* a document — an invariant, a test row, a section, a finding. */
const REFERENCE = /^(?:I\d+[a-z]*|T\d+(?:\.\d+)*[a-z]*|§\s?[\w.]+|F\d+[a-z]?)$/u;

/**
 * A Declared cell, or a rule's `spec`, as a set of **fully qualified** tokens.
 *
 * **The implied prefix is the whole reason this is a parse and not a string
 * compare.** A03 writes `C21 I8, I11, T2.4` and the code writes
 * `C21 I8 · C21 I11 · C21 T2.4`; the two are the same claim in two notations,
 * and comparing them literally reports 45 disagreements and nothing useful. A
 * bare reference binds to the nearest document name **to its left** — the same
 * adjacency rule SP3 and SP8 use, and the rule F359 is about.
 *
 * Fragments that are neither are returned rather than dropped, because an
 * exemption excluded from its own total is how a population stops being read:
 * A03's cells hold prose (`**pending, see below**`) and a silent drop would let
 * a cell become all prose without moving a number.
 */
export function citations(cell: string): { tokens: string[]; ignored: string[] } {
  const tokens: string[] = [];
  const ignored: string[] = [];
  let doc: string | null = null;

  for (const raw of cell.split(/[·,]/u)) {
    const piece = raw.replace(/\*\*/gu, "").replace(/`/gu, "").replace(/^\*|\*$/gu, "").trim();
    if (piece === "") continue;
    const words = piece.split(/\s+/u);
    const head = words[0] ?? "";
    if (DOCUMENT.test(head)) {
      doc = head;
      const rest = words.slice(1).join(" ");
      if (rest === "") tokens.push(doc);
      else if (REFERENCE.test(rest)) tokens.push(`${doc} ${rest.replace(/§\s/u, "§")}`);
      else ignored.push(piece);
      continue;
    }
    if (doc !== null && REFERENCE.test(piece)) tokens.push(`${doc} ${piece.replace(/§\s/u, "§")}`);
    else ignored.push(piece);
  }
  return { tokens, ignored };
}

/** Every `SS`/`MG` row A03's tables declare, id → the Declared cell verbatim. */
export function declaredColumn(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of src.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const id = (cells[1] ?? "").replace(/`/gu, "");
    if (!/^(?:SS|MG)\d+$/u.test(id)) continue;
    out.set(id, cells[cells.length - 2] ?? "");
  }
  return out;
}

type Row = {
  id: string;
  state: "agree" | "code names more" | "A03 names more" | "contradiction" | "no A03 row";
  onlyA03: string[];
  onlyCode: string[];
  ignored: string[];
  /** How many citations each record yielded — the per-row vacuity guard. */
  counts: { a03: number; code: number };
};

/** One row per `SCANS` entry, plus the counters a control reads. */
export function reconcile(
  scans: readonly Scan[],
  a03Source: string,
): { rows: Row[]; declared: number; tokens: number } {
  const declared = declaredColumn(a03Source);
  let tokens = 0;
  const rows = scans.map((scan): Row => {
    const cell = declared.get(scan.id);
    const code = citations(scan.spec);
    tokens += code.tokens.length;
    if (cell === undefined) {
      return {
        id: scan.id,
        state: "no A03 row",
        onlyA03: [],
        onlyCode: code.tokens,
        ignored: [],
        counts: { a03: 0, code: code.tokens.length },
      };
    }
    const a = citations(cell);
    tokens += a.tokens.length;
    const A = new Set(a.tokens);
    const C = new Set(code.tokens);
    const onlyA03 = [...A].filter((x) => !C.has(x));
    const onlyCode = [...C].filter((x) => !A.has(x));
    const state =
      onlyA03.length === 0 && onlyCode.length === 0
        ? "agree"
        : onlyA03.length === 0
          ? "code names more"
          : onlyCode.length === 0
            ? "A03 names more"
            : "contradiction";
    return {
      id: scan.id,
      state,
      onlyA03,
      onlyCode,
      ignored: [...a.ignored, ...code.ignored],
      counts: { a03: a.tokens.length, code: code.tokens.length },
    };
  });
  return { rows, declared: declared.size, tokens };
}

/**
 * **The debt, listed so it can only shrink** — every rule whose two records do
 * not yet say the same thing, with the token that separates them.
 *
 * Compared by equality in both directions, which is `KNOWN_STALE`'s rule, SP9's
 * and SP12's: a subset check is silent about the other side, so a rule that
 * drifts tomorrow would join the list unread and a rule reconciled today would
 * sit on it forever.
 *
 * Every entry here is **one-directional bar one**: the code's `spec` grew as a
 * rule grew and A03's cell did not. That direction cannot be closed from this
 * lane — A03 is another lane's file this round — so each value is the exact
 * token A03's cell is owed, and the report generates the rows from it.
 */
type Debt = {
  /** Citations the code names and A03's cell does not — the row A03 is owed. */
  readonly a03Owes: readonly string[];
  /** Citations A03 names and the code does not. */
  readonly codeOwes: readonly string[];
  readonly why: string;
};

const DECLARED_DEBT: Readonly<Record<string, Debt>> = {
  // **Empty, and that is the point of the arm that says so.** Twelve entries
  // stood here when this file was written — eleven where A03's cell had fallen
  // behind the rule's own `spec`, and one genuine contradiction at `SS56`,
  // where the code was right and A03 named `FINDINGS F739`, a citation that
  // resolves against something real and unrelated. All twelve were applied to
  // A03 §4's tables in one commit with this list emptied beside them, which is
  // what SSD2's *cleared* arm requires: an entry excusing nothing is itself a
  // violation, so the list can only shrink deliberately.
  //
  // **A list that reaches zero is not a list that can be deleted.** The debt
  // was the residue of a reconciliation nothing performed; the reconciliation
  // is now a row, and this map is where its next divergence gets recorded with
  // a reason rather than silently absorbed. FINDINGS F1046, F1041.

};

describe("A03 §4 — the Declared column and each rule's `spec` are one fact (F1046)", () => {
  const a03 = readFileSync(A03_PATH, "utf8");

  it("SSD1: the parse has a corpus — every scan has an A03 row, and both notations tokenise", () => {
    // **The vacuity control, and it is the whole reason this row is first.** A
    // reader that returns nothing makes every rule agree, and a reconciliation
    // reporting no disagreements over an empty corpus is indistinguishable from
    // one over a reconciled tree (A03 §2, SS26). Three things are asserted: the
    // document parsed, the tokeniser is not degenerate on either notation, and
    // the join is total.
    const { rows, declared, tokens } = reconcile(SCANS, a03);
    expect(declared, "A03's rule tables parsed").toBeGreaterThan(60);
    expect(SCANS.length, "SCANS is not empty").toBeGreaterThan(40);
    expect(tokens, "the tokeniser produced citations from both records").toBeGreaterThan(150);
    expect(
      rows.filter((r) => r.state === "no A03 row").map((r) => r.id),
      "every implemented scan is inventoried in A03",
    ).toEqual([]);
    // **Per row, not in total** — a document that parsed and a rule whose own
    // cell yielded nothing are the same silence one level down, and a total
    // hides it. `agree` between two empty sets is the failure this forbids.
    expect(
      rows.filter((r) => r.counts.a03 === 0).map((r) => r.id),
      "a Declared cell yielded no citation, so this rule agrees with nothing",
    ).toEqual([]);
    expect(
      rows.filter((r) => r.counts.code === 0).map((r) => r.id),
      "a rule's `spec` yielded no citation",
    ).toEqual([]);

    // The implied-prefix normalisation, stated as data rather than trusted: the
    // two notations for one claim must come out identical, and a tokeniser that
    // returned `[]` for both would satisfy every equality above.
    expect(citations("C21 I8, I11, T2.4").tokens).toEqual(["C21 I8", "C21 I11", "C21 T2.4"]);
    expect(citations("C21 I8 · C21 I11 · C21 T2.4").tokens).toEqual([
      "C21 I8",
      "C21 I11",
      "C21 T2.4",
    ]);
    expect(citations("C09 I22, C22 I52, FINDINGS F55 · F122").tokens).toEqual([
      "C09 I22",
      "C22 I52",
      "FINDINGS F55",
      "FINDINGS F122",
    ]);
    // Prose in a Declared cell is counted, not dropped — SS26's `**pending, see
    // below**` is the live instance.
    expect(citations("C21 T2.2 · **pending, see below**")).toEqual({
      tokens: ["C21 T2.2"],
      ignored: ["pending", "see below"],
    });
    // **`§ 2` with a space**, which no cell writes today and which
    // `commitments.mjs`' own `SECTION_TOKEN` accepts, so the clause that
    // normalises it would otherwise be a branch nothing exercises — the same
    // silence as an allow-list entry no file exercises (SS53).
    // **Both branches, because only one of them was reachable.** Written with
    // the qualified form alone, the mutation that deletes the *inherited*
    // branch's normalisation failed nothing: `A03 § 2` is one fragment whose
    // head is a document, so it never reaches the branch a bare `§ 3a` takes.
    // A clause with nothing to be wrong about passes exactly like a satisfied
    // one (A03 §2), and the mutation pass is what asks.
    expect(citations("A03 § 2").tokens, "qualified, spaced").toEqual(["A03 §2"]);
    expect(citations("A03 §2, § 9a").tokens, "inherited, spaced").toEqual(["A03 §2", "A03 §9a"]);
  });

  it("SSD2: the rules whose two records disagree are the listed set, and disagree by the listed tokens", () => {
    const { rows } = reconcile(SCANS, a03);
    const disagreeing = rows.filter((r) => r.state !== "agree").map((r) => r.id).sort();
    const listed = Object.keys(DECLARED_DEBT).sort();

    const appeared = disagreeing.filter((id) => !listed.includes(id));
    const cleared = listed.filter((id) => !disagreeing.includes(id));
    expect(
      appeared,
      "a rule's `spec` and A03's cell have drifted apart and nothing said so — " +
        "reconcile them, or add the row to DECLARED_DEBT with the tokens that separate them",
    ).toEqual([]);
    expect(
      cleared,
      "these rules now agree and are still on the debt list — strike them. " +
        "Compared by equality so the list can only shrink deliberately; a subset " +
        "check lets a cleared entry outlive its reason unread",
    ).toEqual([]);

    // **The membership is half the claim and the direction is the other half.**
    // A debt list of ids alone records *which* rules disagree and not *how*, so
    // a rule drifting further along a direction it already carries would not
    // move it — the shape a set over sites has when it is blind to
    // redistribution. Asserted as the whole map, so widening a gap fails.
    const measured = Object.fromEntries(
      rows
        .filter((r) => r.state !== "agree")
        .map((r) => [r.id, { a03Owes: r.onlyCode, codeOwes: r.onlyA03 }]),
    );
    const expected = Object.fromEntries(
      Object.entries(DECLARED_DEBT).map(([id, d]) => [id, { a03Owes: d.a03Owes, codeOwes: d.codeOwes }]),
    );
    expect(measured, "the tokens separating the two records have changed").toEqual(expected);

    // And the census, so a rule that swapped one disagreement for another of a
    // different kind is visible as a shape rather than only as a name.
    const census: Record<string, number> = {};
    for (const r of rows) census[r.state] = (census[r.state] ?? 0) + 1;
    // **47 of 47, and the number is the fragile half of this assertion.** It was
    // 35 / 11 / 1 when this row was written and the twelve landed in A03 §4's
    // tables in the same commit that emptied `DECLARED_DEBT`. A whole census
    // rather than a count of disagreements, so a rule that swapped one
    // disagreement for another of a different kind is visible as a shape and
    // not only as a name — and so that `agree` moving is a failure whichever
    // direction it moves in, including a scan being deleted.
    expect(census, "every scan's two records agree; the debt list is empty beside it").toEqual({
      agree: 47,
    });
  });

  it("SSD3: the four rules F934 left open and could have ruled on are reconciled", () => {
    // **The fail-on-revert row.** F934 fixed SS37 because *only SS37 has a
    // ruling already on the record to apply*, and left five. Four of the five
    // had one by the same standard: SS33's `why` is C01 I9 word for word,
    // SS35's is C04 I26 word for word and C04's commitment 31 says *enforced by
    // SS35*, C22 I54 and C24 I25 both cite F126 as SS48's provenance, and
    // SS59's row is `profiler-seams.test.ts:1003`, which is T2.4b. Reverting any
    // of the four `spec` strings in `source-scans.mjs` fails this row.
    const { rows } = reconcile(SCANS, a03);
    const state = (id: string): string => rows.find((r) => r.id === id)?.state ?? "missing";
    expect({
      SS33: state("SS33"),
      SS35: state("SS35"),
      SS37: state("SS37"),
      SS48: state("SS48"),
      SS59: state("SS59"),
    }).toEqual({
      SS33: "agree",
      SS35: "agree",
      SS37: "agree",
      SS48: "agree",
      SS59: "agree",
    });
  });

  it("SSD4: fabricated violations — a retarget, a growth, a missing row, and an empty document", () => {
    // **Each is the shape someone would actually write**, not a string built to
    // trip the comparison.
    const swap = (id: string, spec: string): Scan[] =>
      SCANS.map((s) => (s.id === id ? { ...s, spec } : s));

    // 1. The retarget, and it is the historical one: SS37's `spec` before F934,
    //    which pointed at C09 I4 while its pattern is C09 I15 word for word.
    const retargeted = reconcile(swap("SS37", "C09 I4 · C09 T2.17"), a03).rows.find(
      (r) => r.id === "SS37",
    );
    expect(retargeted?.state, "a rule pointed at the wrong invariant").toBe("contradiction");
    expect(retargeted?.onlyCode).toEqual(["C09 I4"]);
    expect(retargeted?.onlyA03).toEqual(["C09 I15"]);

    // 2. The growth, which is what eleven rows on the debt list are: a rule
    //    gains a component and the table does not.
    const grown = reconcile(swap("SS1", "C22 T2.4 · C22 I40"), a03).rows.find((r) => r.id === "SS1");
    expect(grown?.state, "a rule grew and A03 did not").toBe("code names more");
    expect(grown?.onlyCode).toEqual(["C22 I40"]);

    // 3. A rule implemented and never inventoried — the state SS58 was in when
    //    C28's spec, its invariant and its test row all cited it and
    //    `grep SS58 tools/enforce/` returned nothing, in the other direction.
    const stranger: Scan = { ...(SCANS[0] as Scan), id: "SS99", spec: "C01 I1" };
    expect(
      reconcile([...SCANS, stranger], a03).rows.find((r) => r.id === "SS99")?.state,
      "a scan A03 does not inventory",
    ).toBe("no A03 row");

    // 4. **The one that matters most, because its symptom is silence.** A reader
    //    that finds nothing must fail on the parse rather than report a clean
    //    reconciliation: every rule would otherwise "agree" against an empty
    //    table. Asserted through the same counters SSD1 reads, so stubbing the
    //    reader cannot empty the corpus this rule resolves against.
    const empty = reconcile(SCANS, "");
    expect(empty.declared, "an unreadable A03 reports no rows").toBe(0);
    expect(
      empty.rows.every((r) => r.state === "no A03 row"),
      "and every rule reports missing rather than agreeing",
    ).toBe(true);
    expect(
      reconcile(SCANS, a03).rows.filter((r) => r.state === "no A03 row"),
      "which is not the live state",
    ).toEqual([]);
  });

  it("SSD5: prose in a Declared cell is counted, and the set that carries it is named", () => {
    // A cell is prose or a citation, and a cell that quietly became prose would
    // read as a cell naming nothing. One row carries it today and the exemption
    // is compared by equality rather than pattern-matched away.
    const { rows } = reconcile(SCANS, a03);
    const withProse = Object.fromEntries(
      rows.filter((r) => r.ignored.length > 0).map((r) => [r.id, r.ignored]),
    );
    expect(withProse, "a Declared cell gained prose — read it before excusing it").toEqual({
      SS26: ["pending", "see below"],
    });
  });
});
