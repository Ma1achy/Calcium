// SP12's fire-test — the register's open set, and the reader that could not
// read it. A03 §7a, F1031.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkOpenSet,
  dispositionOf,
  keyedRows,
  TRIAGE_OPEN,
} from "../../tools/enforce/findings.mjs";

const TRIAGE = "examples/docker/TRIAGE.md";
const real = (): string => readFileSync(TRIAGE, "utf8");
const io = (text: string): { read: () => string } => ({ read: () => text });

describe("SP12 — the register's open set", () => {
  /**
   * **T1.1 — the reader, driven by every shape the register actually uses.**
   *
   * These are not invented cases. Each row below is the shape of a real entry,
   * and the last three are the shapes that broke earlier drafts of this reader:
   * a superseded marker left in place, prose containing the word, and a bold
   * span whose first word is not the disposition. A reader is an instrument, and
   * an instrument written before its subject measures its author's guess.
   */
  it("T1.1 (SP12): the reader takes the last marker and refuses prose", () => {
    const cases: readonly [string, string, string | null][] = [
      ["the common form", "| **F1** | a thing | **Open** |", "open"],
      ["shouted", "| **F2** | a thing · **OPEN** |", "open"],
      ["a bare cell", "| **F3** | a column gets its minimum | open |", "open"],
      ["partly, which means not done", "**F4** — a thing · **Partly** (F991) — the half that stands", "open"],
      ["closed", "| **F5** | a thing | **Closed** (F991) |", "closed"],
      ["lowercase fixed in a cell", "| **F6** | a thing | **fixed** |", "closed"],
      // **The last marker wins**, because dispositions are appended: the row
      // records its state when filed and gains `**Closed**` when the sweep
      // resolves it, and both stay because the history is the evidence.
      //
      // **The first draft of this row could not fail.** It read
      // `Open · **Closed** (F991)`, where the `Open` is unbolded prose the
      // reader correctly ignores — so there was one marker, first and last were
      // the same, and a mutation making the reader take the first survived it.
      // Caught by the mutation pass, which is the only thing that asks a case
      // whether it can be violated. The shape below is `F547`'s and `F537`'s.
      ["a superseded marker", "| **F7** | a thing. **OPEN** · **Closed** (F991) — repaired |", "closed"],
      // Prose is not a marker. F8's real row ends *"the shell refuses to open"*
      // after a `**Closed**`, and read as open to the first draft here.
      ["the word in prose", "| **F8** | a thing · **Closed** (F991) — the shell refuses to open |", "closed"],
      // A bold span whose first word is not the vocabulary is a column value.
      // F247's real row ends `| **gate open** |`.
      ["a bold span that is not a marker", "| **F9** | a thing · **Closed** | **gate open** |", "closed"],
      ["no disposition at all", "| **F10** | a thing nobody dispositioned |", null],
    ];
    for (const [why, row, want] of cases) {
      expect(dispositionOf(row), why).toBe(want);
    }
  });

  /**
   * **T1.2 — the corpus is non-empty, in both directions.**
   *
   * A rule phrased over a corpus inherits that corpus's blind spots, and a
   * stubbed reader empties the corpus the rule resolves against — so the rule
   * passes on nothing and reads exactly like a rule that is satisfied. This is
   * the control, and it asserts both answers appear: a reader that returned
   * `closed` for everything would satisfy the equality arm the day the list
   * emptied.
   */
  it("T1.2 (SP12): the real register yields both answers, so the rule resolves against something", () => {
    const rows = keyedRows(real());
    expect(rows.size, "keyed rows in the register").toBeGreaterThan(900);

    let open = 0;
    let closed = 0;
    let unstated = 0;
    for (const row of rows.values()) {
      const d = dispositionOf(row);
      if (d === "open") open += 1;
      else if (d === "closed") closed += 1;
      else unstated += 1;
    }
    expect(open, "open findings").toBeGreaterThan(0);
    expect(closed, "closed findings").toBeGreaterThan(0);
    expect(unstated, "rows stating no disposition — reported, not gated").toBeGreaterThan(0);
    expect(open + closed + unstated, "every row gets exactly one answer").toBe(rows.size);

    // **The control for *last wins* specifically**, because the case above is a
    // fabrication and a fabrication proves the reader and not the corpus. Five
    // real rows carry two markers whose answers differ — `**OPEN** · **Closed**
    // (F991)` is the shape — so a first-marker reader reports five closed
    // findings as open, against this register, today.
    let flips = 0;
    for (const row of rows.values()) {
      const marks = [...row.matchAll(/\*\*\s*(Open|OPEN|Closed|Fixed|Partly)\b[^*]*\*\*/gu)].map((m) =>
        /^(open|partly)$/iu.test(m[1] as string) ? "open" : "closed",
      );
      if (marks.length >= 2 && marks[0] !== marks[marks.length - 1]) flips += 1;
    }
    expect(flips, "rows where first-marker and last-marker disagree").toBeGreaterThan(0);
  });

  /**
   * **T1.3 — the fabricated violations, both directions.**
   *
   * Equality and not containment, and the reason is measured rather than
   * argued: a subset check in either direction is silent about the other side.
   * Contained-in-findings lets an entry be deleted from the list unnoticed;
   * contained-in-list lets a stale entry sit on it. Both arms fire here.
   */
  it("T1.3 (SP12): a row that opens off-list fires, and a list entry that closed fires", () => {
    const clean = checkOpenSet(io(real()));
    expect(clean.length, "the register as it stands").toBe(0);

    // **The fabricated ids are derived, not written.** Two literal `F9999xx`
    // constants stood here and SP5 read them as citations of findings the
    // ledger does not have — a fixture that fabricates a violation for one rule
    // becoming a real violation of another. Derived from the ledger's own
    // maximum, they are non-existent by construction and invisible to a
    // citation resolver, which is SP6's fabrication's precedent: its id was a
    // literal `F999` until the ledger reached F999 and the row then failed
    // while the gate was correct. FINDINGS F1041.
    const ledger = readFileSync("examples/docker/FINDINGS.md", "utf8");
    const top = Math.max(0, ...[...ledger.matchAll(/^## F(\d+)/gmu)].map((m) => Number(m[1])));
    const absent = `F${String(top + 1)}`;
    const alsoAbsent = `F${String(top + 2)}`;

    // **Appeared** — a keyed row reads open and the list does not carry it.
    const opened = `${real()}\n\n| **${absent}** | a fabricated finding | **Open** |\n`;
    const a = checkOpenSet(io(opened));
    expect(a.length, "an unlisted open row").toBe(1);
    expect(a[0]?.rule).toBe("SP12");
    expect(a[0]?.message, "names the finding").toContain(absent);

    // **Cleared** — the list carries a finding whose row no longer reads open.
    const b = checkOpenSet(io(real()), [...TRIAGE_OPEN, alsoAbsent]);
    expect(b.length, "a listed finding that is not open").toBe(1);
    expect(b[0]?.rule).toBe("SP12");
    expect(b[0]?.message, "names the entry").toContain(alsoAbsent);
  });

  /**
   * **T1.4 — the measurement that forced the rule, held as an assertion.**
   *
   * A `**Open**` grep answers 16 where the set is 39, and **eighteen of the
   * difference are `**Partly**`** — a disposition invented for a finding whose
   * remedy landed in part, which every reader in this repository was counting as
   * done. This row is what stops `partly` quietly rejoining the closed side: the
   * two counts are asserted apart, so a reader that stopped distinguishing them
   * fails here rather than shrinking the open set by eighteen.
   */
  it("T1.4 (SP12): partly is open, and it is most of what a naive grep misses", () => {
    const text = real();
    const rows = keyedRows(text);

    const bolded = [...rows.values()].filter((r) => /\*\*Open\*\*/u.test(r)).length;
    const actual = [...rows.values()].filter((r) => dispositionOf(r) === "open").length;
    expect(actual, "the reader sees more than the naive grep").toBeGreaterThan(bolded);

    const partly = [...rows.values()].filter((r) => /\*\*Partly\*\*/u.test(r)).length;
    expect(partly, "partly entries exist and are open").toBeGreaterThan(0);
    expect(dispositionOf("| **F1** | a thing · **Partly** (F991) — the half that stands |"), "partly means not done")
      .toBe("open");

    expect(TRIAGE_OPEN.length, "the list is the reader's own answer").toBe(actual);
  });
});
