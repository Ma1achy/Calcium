/**
 * C23 I84–I86 — the away ledger: what settled while the reader was not watching
 * (ruling 51, §014, `R-BLK-314`).
 *
 * *When you come back, the transcript says what you missed.* Two absences say
 * so and they share one form: a child surface holding the keyboard (*on
 * detach, what changed while you were away*) and the terminal losing focus
 * (`ESC [ O` … `ESC [ I`). Each is a **mark** — opened when the reader stops
 * watching and closed when they return — and the close appends one notice
 * entry naming what settled in between.
 *
 * Two halves, as `notify.ts`: the ledger is the one place that remembers, and
 * `summaryOf` is a function of what it returned. **Nothing here appends or
 * composes**: `documents.ts` composes the entry (C23 I61) and the composition
 * root appends it, because the frame that shows the notice is its own.
 */
import { completionLine, failed, type LinearEntry } from "./linear.js";

/** Who opened the mark: a child attaching, or the terminal losing focus. */
export type MarkKind = "attached" | "away";

/** One settlement, as it read when it settled (I84) — the entry may be gone by the close. */
export type Settlement = Readonly<{ id: string; line: string; failed: boolean }>;

export type Ledger = Readonly<{
  /** Open a mark; a mark of that kind already open stays as it is (I84). */
  open: (kind: MarkKind) => void;
  /** An entry that may have settled — C13's settled `append` or `settle`. */
  settled: (entry: LinearEntry) => void;
  /**
   * An entry no mark counts: the surface host wrote it, and it is live (I84).
   * **Retroactive**, because the id exists only once the append has returned —
   * and the append's own change has reached `settled` by then.
   */
  exclude: (id: string) => void;
  /**
   * Close a mark, and what it has to report — **failures first**, otherwise in
   * the order they settled (I85). Empty for a mark that is not open or that
   * saw nothing another mark had not already reported (I86).
   */
  close: (kind: MarkKind) => readonly Settlement[];
}>;

/**
 * **A command entry**: one with a command line that the surface host did not
 * write (I84). The command line is the condition C09 §4 already reads for a
 * notice's continuation mark — a shell-origin notice has `command: ""`, and
 * this ledger's own notice is one, so it can never report itself to a second
 * open mark.
 */
const counts = (entry: LinearEntry, excluded: ReadonlySet<string>): boolean =>
  !entry.streaming && entry.doc.command !== "" && !excluded.has(entry.id);

export function createLedger(): Ledger {
  const marks = new Map<MarkKind, Settlement[]>();
  // **Excluded by id, not by the order the attached mark opens in.** Opening
  // it after the child's append keeps the attached mark clean and does nothing
  // for an away mark already open when the child attached (walk row L11), so
  // the ordering could not be the mechanism for both.
  //
  // **And excluded after the fact.** C13 emits the append's change inside
  // `append`, so a mark open across the attach has recorded the child's entry
  // before anyone holds the id to exclude it with — the first cut excluded
  // forwards only, and T4.86 caught the away mark reporting `child game`.
  const excluded = new Set<string>();

  return Object.freeze({
    open(kind) {
      if (!marks.has(kind)) marks.set(kind, []);
    },
    settled(entry) {
      if (!counts(entry, excluded)) return;
      // **Taken now** (I84): the line an evicted entry would have read at the
      // close is the one it read here, and after an eviction there is no other.
      const settlement: Settlement = Object.freeze({
        id: entry.id,
        line: completionLine(entry),
        failed: failed(entry.doc),
      });
      for (const held of marks.values()) {
        if (!held.some((s) => s.id === entry.id)) held.push(settlement);
      }
    },
    exclude(id) {
      excluded.add(id);
      for (const [kind, held] of marks) marks.set(kind, held.filter((s) => s.id !== id));
    },
    close(kind) {
      const held = marks.get(kind);
      if (held === undefined) return [];
      marks.delete(kind);
      // **The first close reports it, and the others forget it** (I86) —
      // dropped from every mark still open rather than remembered as said, so
      // what the ledger holds is only ever what is still owed.
      const ids = new Set(held.map((s) => s.id));
      for (const [other, rest] of marks) marks.set(other, rest.filter((s) => !ids.has(s.id)));
      return [...held.filter((s) => s.failed), ...held.filter((s) => !s.failed)];
    },
  });
}

/** What the notice's head reads with, resolved by the caller at the terminal's rung. */
export type SummaryWords = Readonly<{
  /** The resolved separator slot (C09 I49), never a literal `·`. */
  separator: string;
  /** `scrollBottom`'s chord through `chordText` (C16 I58), or `null` when nothing binds it. */
  bottom: string | null;
}>;

/**
 * The close's words (I85): a head — the count, and for a return of focus the
 * way to the bottom — then one line per settlement, in the order given. `null`
 * for nothing to report, so an empty close cannot append by accident. The
 * entry is `documents.ts`'s to compose (C23 I61): this file says what, not how.
 */
export function summaryOf(
  kind: MarkKind,
  settlements: readonly Settlement[],
  words: SummaryWords,
): Readonly<{ head: string; lines: readonly string[] }> | null {
  if (settlements.length === 0) return null;
  const n = settlements.length;
  const count = `${String(n)} ${n === 1 ? "entry" : "entries"} settled`;
  const head =
    kind === "attached"
      ? `${count} while attached`
      : `${count} while you were away${words.bottom === null ? "" : ` ${words.separator} ${words.bottom} to the bottom`}`;
  return Object.freeze({ head, lines: settlements.map((s) => s.line) });
}
