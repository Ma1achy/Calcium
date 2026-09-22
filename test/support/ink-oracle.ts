// The Ink arm's output, captured while Ink existed (F1209).
//
// **C09 I72's claim is that a row is byte for byte the row Ink would have
// written, and the only thing that knew what Ink would have written was Ink.**
// T2.143, T2.144, T2.147 and T3.89 proved it by rendering each block both ways
// in the same run. The layout pass deleted Ink, which deleted that reference —
// so the reference was committed first and the rows arm is held to the
// committed bytes instead.
//
// **Freezing it strengthened the rows rather than preserving them.** A live
// oracle composes through the same registry as its subject, so it moves when
// the subject moves: T6.119 recorded the cap's marker and the floor's short pad
// as mutations that failed nothing for exactly that reason, and both fail now.
//
// **Every capture here is final.** The recorder is gone with Ink, which is what
// `frozen` says: these bytes cannot be regenerated, because the thing that
// produced them is not in the tree any more. That is the point rather than a
// limitation — an oracle a subject can rewrite is not an oracle.
//
// **A checker that walked the committed directory alone would agree with a
// corpus that had silently shrunk** — `tools/terminal-baseline.mjs`'s argument,
// and the reason `settle()` exists: every capture the suite asks for is
// compared against the set on disk by equality, both ways, so a block that
// stopped being rendered is a failure and not a quieter run.
//
// **And a capture can be retired, which is the one thing this file could not
// say** (F1233). Every argument above is about an oracle a subject must not be
// able to rewrite, and it left no way to record the other case: a **ruling**
// that deliberately changes what a kind draws. The only moves available were to
// never change a kind again, or to delete a capture — and a deleted capture is
// a gate that got quieter with nothing saying why. So a retirement is a named
// entry with a reason, the file **stays on disk** as the record of what Ink
// drew, and {@link InkOracle.retired} is **driven**: a row that retires a
// capture asserts the bytes actually differ, so a retirement that stopped
// changing anything fails as a stale exemption rather than sitting there.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "golden", "ink-oracle");

/**
 * Captures whose subject a ruling has changed, each with the ruling.
 *
 * **Twenty-one, and the widths are per block rather than a cross product.**
 * The first draft of this list was three blocks × three widths, and the row
 * below caught it: `keyValue` at twenty-four columns does not move, so three of
 * the twenty-seven entries were true of nothing. An exemption list that is
 * driven says so on its first run. C09 I81 replaced four kinds' truncate-everything
 * with a shed step, so Ink's bytes for those frames are the shredding the
 * invariant removes: `comparison` at twelve columns drew `  field  b……` over
 * `~ l…  3…  2…`, four parts each cut to nothing at once.
 *
 * **The list is the blast radius, measured rather than argued.** `steps` is not
 * in it — its corpus block fits at every captured width — and `comparison`'s
 * wide captures are not either, which is the evidence that the header's own
 * misalignment was held back for its own landing.
 */
const LADDER =
  "C09 I81 (F1233): the kind's narrow ladder replaced a cut taken from every part at once";
const HEADER =
  "C09 I82 (F1236): the header reserves the verdict's cells, so its label names the column its values are in";
const LIVE_SPINNER =
  "C04 I39 / R-GLY-001 (M4): a live region is marked by a spinner frame, where Ink drew `Glyph.live`'s static `▌` — a token the design has no slot for, on a character the design spends on the selection rail";
const RESIDUE_SLOT =
  "R-GLY-001 (M4): the residue mark is a declared three-cell slot at every rung — `...` by the design, `⋯` padded to match — where Ink drew a one-cell `~`";

const RETIRED: ReadonlyMap<string, string> = new Map(
  (
    [
      // **A retirement carries its own ruling, not the register's.** One reason
      // string over every entry was right while there was one ruling; a second
      // arrived, and a shared reason would have said `C09 I81` over captures
      // that ruling never touched — a claim about a frame that nothing would re-read
      // (F1236).
      ["t2143-keyValue-kv-1", [2, 12], LADDER],
      ["t2143-events-events-1", [2, 12, 24], LADDER],
      ["t2143-comparison-comparison-1", [2, 12], LADDER],
      // **Every width the ladder did not already take**, which is what makes
      // this list a measurement rather than a guess: the header moves wherever
      // the `b` column is drawn at all, and below 24 the ladder had already
      // shed it. Named before the run and read after — 27 entries, and the diff
      // is one row of each.
      ["t2143-comparison-comparison-1", [24, 32, 40, 60, 80, 100, 120, 160, 200], HEADER],
      // **The two blocks that draw a residue row, and every width bar one.**
      // Named from a measured sweep and read after: 64 captures, both `scroll`
      // kinds, three capability sets — and `full` at two columns is **not** in
      // it, because at two cells the padded `⋯` truncates to exactly what the
      // bare one did. An exemption list that is driven is what makes that
      // absence worth stating rather than rounding up to a cross product.
      ["t2143-scroll-scroll-1", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], RESIDUE_SLOT],
      ["t2143-scroll-adv-overfull-scroll", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], RESIDUE_SLOT],
      ["t2143-scroll-scroll-1", [2], RESIDUE_SLOT, ["ascii", "mono"]],
      ["t2143-scroll-adv-overfull-scroll", [2], RESIDUE_SLOT, ["ascii", "mono"]],
      // T2.144's container corpus draws the same row from two more scrolls, and
      // the width-2 asymmetry repeats exactly — which is the measurement
      // agreeing with itself across two independent sweeps.
      ["t2144-scroll-sc-residue", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], RESIDUE_SLOT],
      ["t2144-scroll-sc-off", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], RESIDUE_SLOT],
      ["t2144-scroll-sc-residue", [2], RESIDUE_SLOT, ["ascii", "mono"]],
      ["t2144-scroll-sc-off", [2], RESIDUE_SLOT, ["ascii", "mono"]],
      // The one panel that declares `live`. Width 2 is absent for a different
      // reason than the scrolls': at two columns the title is gone entirely, so
      // there is no mark to change.
      ["t2144-panel-p-live", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], LIVE_SPINNER],
    ] as const
  ).flatMap(([key, widths, why, only]) =>
    widths.flatMap((width) =>
      (only ?? ["full", "ascii", "mono"]).map(
        (caps) => [oracleName(key, caps, width), why] as const,
      ),
    ),
  ),
);

/**
 * Bytes to rows — **every row terminated, none separated.**
 *
 * `join("\n")` cannot tell `[]` from `[""]`, and both occur: an empty block
 * answers no rows and a block of one blank row answers one. The recorder
 * terminated each row instead, so the empty list is the empty file and the
 * single blank row one newline, and dropping the tail after the last terminator
 * inverts it exactly. The corpus holds both — `group-adv-empty` captured as 0
 * bytes and `code-adv-blank` as 1 — so this is measured rather than argued.
 */
function decode(bytes: string): readonly string[] {
  const parts = bytes.split("\n");
  return parts.slice(0, Math.max(0, parts.length - 1)); // cells-ok — rows, not columns
}

/** A capture's file name. **The width is in it**, or two widths collide. */
export function oracleName(key: string, capsName: string, width: number): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/gu, "_");
  return `${safe}-${capsName}-${String(width)}w.txt`;
}

/** One suite's captured Ink output, read. */
export class InkOracle {
  readonly #dir: string;
  readonly #seen = new Set<string>();

  constructor(suite: string) {
    this.#dir = join(ROOT, suite);
  }

  /**
   * The ruling that retired this capture, or `null` where none did.
   *
   * Counted as asked either way, so `settle()`'s equality both ways still holds
   * and a retired capture cannot be quietly deleted as well.
   */
  retired(name: string): string | null {
    this.#seen.add(name);
    return RETIRED.get(name) ?? null;
  }

  /** A capture. Its producer is deleted, so a missing file cannot be restored. */
  frozen(name: string): readonly string[] {
    this.#seen.add(name);
    const path = join(this.#dir, name);
    if (!existsSync(path)) {
      throw new Error(`${name} is missing — Ink is gone, so nothing in this tree can produce it again`);
    }
    return decode(readFileSync(path, "utf8"));
  }

  /**
   * Every capture asked for, against every capture committed — **by equality,
   * both ways.**
   *
   * A subset check passes a corpus that shrank, which is the whole reason the
   * baseline generator holds its corpus in one place rather than walking a
   * directory. It is also the failure mode a captured oracle has and a live one
   * could not: a live oracle was computed from the corpus that ran.
   */
  settle(): Readonly<{ asked: readonly string[]; committed: readonly string[] }> {
    const committed = existsSync(this.#dir) ? readdirSync(this.#dir).filter((f) => f.endsWith(".txt")) : [];
    return { asked: [...this.#seen].sort(), committed: [...committed].sort() };
  }
}
