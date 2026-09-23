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
  "C04 I39 / R-GLY-003 (M4): a live region is marked by a spinner frame, where Ink drew `Glyph.live`'s static `▌` — a token the design has no slot for, on a character the design spends on the selection rail";
const RESIDUE_ASCII =
  "R-GLY-003 / §095 (M4): the residue mark's ASCII half is the design's `...` where Ink drew a one-cell `~` — and only the ASCII half, because `⋯` is both what Ink drew and what the design draws";
const SCROLLBAR =
  "C09 I92 and C09 I93 / §7f / §021 (M14): a scroll whose content overflows spends its last column on a bar, so its content is laid out one cell narrower and every interior row gains a track or thumb glyph";
const RESIDUE_AND_SCROLLBAR = `${RESIDUE_ASCII} — and, at this rung too, ${SCROLLBAR}`;
const BAR_EMPTY =
  "C09 I94 / R-PRG-001 / §033 (M16): the ASCII bar's empty cell is the registry's `-` where Ink drew `.` — a track against an absence, and the pair shipped wrong from the day `BAR_STYLES` existed because every row over the table measured a width and none named an `off`";

/**
 * Kinds that landed **after** Ink was removed, and why each is not a retirement.
 *
 * **A third disposition, and it had to be one.** A retirement says *Ink drew
 * this and a ruling changed it*, and it is driven by asserting the bytes still
 * differ — which needs bytes. A kind registered after the producer was deleted
 * has no capture and can never have one, so there is nothing to differ from:
 * the byte-equality half of the sweep is simply unavailable for it.
 *
 * **Driven the only way it can be**: a row reaching one of these asserts that
 * no capture exists under its key. The day a capture appears the entry is
 * wrong and says so, which is the same expiry a retirement has, inverted.
 * What the sweep keeps for these kinds is the other half of its subject — that
 * exactly one `rows` arm opens — so they are swept and not skipped.
 */
export const POST_INK: ReadonlyMap<string, string> = new Map([
  [
    "tape",
    "C04 I124 / §3ao / §095 (M14): the tape is a kind §095 asks for and Ink never "
    + "drew — it was registered after the producer was deleted, so no capture of it "
    + "exists and none can be made",
  ],
]);

/** Every width the two sweeps render at, so a rung-wide ruling is not a hand-copied list. */
const ALL_WIDTHS = [2, 12, 24, 32, 40, 60, 80, 100, 120, 160, 200] as const;
/**
 * Every width a bar is drawn at — `ALL_WIDTHS` without 2.
 *
 * **Measured, not reasoned**: a sweep of the capture directory for a run of the
 * empty cell returns exactly these ten widths under `ascii` and `mono`, for the
 * two progress keys and no others. At two columns there is no run left to draw,
 * so those captures are byte-identical and stay off the list — which is what
 * makes it a driven exemption rather than a cross product.
 */
const BAR_WIDTHS = [12, 24, 32, 40, 60, 80, 100, 120, 160, 200] as const;

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
      // **The four blocks that draw a residue row, at the two rungs that take
      // the ASCII set.** Named from a measured sweep and read after: 88
      // captures, every width, `ascii` and `mono` only.
      //
      // **The `full` arm is deliberately absent, and its absence is the
      // measurement that corrected an earlier ruling.** A first pass padded the
      // mark into a three-cell slot at every rung, which moved the Unicode arm
      // too and put 128 captures on this list. `reservedCells` at every rung is
      // a rule about marks in **fixed columns**, where following content aligns
      // to the column; a residue lead is followed only by its own count, so
      // nothing aligns to it. With the padding gone the Unicode arm draws `⋯`
      // exactly as Ink did, agrees again, and comes off the list — which is
      // this list working as a driven exemption rather than as a note.
      // **The bar is not a colour, so it moves every rung.** The four keys are
      // the corpus's overflowing scrolls and no others: a box whose content
      // fits draws no bar (C09 I92), which is why this list is the same four
      // the residue ruling already named rather than every scroll in the
      // corpus. Named before the run and read after.
      ["t2143-scroll-scroll-1", ALL_WIDTHS, RESIDUE_AND_SCROLLBAR, ["ascii", "mono"]],
      ["t2143-scroll-scroll-1", ALL_WIDTHS, SCROLLBAR, ["full"]],
      ["t2143-scroll-adv-overfull-scroll", ALL_WIDTHS, RESIDUE_AND_SCROLLBAR, ["ascii", "mono"]],
      ["t2143-scroll-adv-overfull-scroll", ALL_WIDTHS, SCROLLBAR, ["full"]],
      // T2.144's container corpus draws the same row from two more scrolls, at
      // the same two rungs and the same eleven widths — the measurement
      // agreeing with itself across two independent sweeps.
      ["t2144-scroll-sc-residue", ALL_WIDTHS, RESIDUE_AND_SCROLLBAR, ["ascii", "mono"]],
      ["t2144-scroll-sc-residue", ALL_WIDTHS, SCROLLBAR, ["full"]],
      ["t2144-scroll-sc-off", ALL_WIDTHS, RESIDUE_AND_SCROLLBAR, ["ascii", "mono"]],
      ["t2144-scroll-sc-off", ALL_WIDTHS, SCROLLBAR, ["full"]],
      // The one panel that declares `live`. Width 2 is absent for a different
      // reason than the scrolls': at two columns the title is gone entirely, so
      // there is no mark to change.
      ["t2144-panel-p-live", [12, 24, 32, 40, 60, 80, 100, 120, 160, 200], LIVE_SPINNER],
      // **The two progress keys, at the two rungs that take the ASCII pair.**
      // The `full` arm is absent because it draws `█░` and never the ASCII
      // pair, and `adv-zero-total` is on the list beside `prog-1` because a
      // bar at 0% is all empty cells — the one capture where the changed
      // character is the *whole* run rather than its tail.
      ["t2143-progress-prog-1", BAR_WIDTHS, BAR_EMPTY, ["ascii", "mono"]],
      ["t2143-progress-adv-zero-total", BAR_WIDTHS, BAR_EMPTY, ["ascii", "mono"]],
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

  /**
   * The ruling that puts this kind beyond Ink's reach, or `null`.
   *
   * Not counted as asked: there is no capture to ask for, and counting one
   * would make {@link settle}'s equality demand a file nothing can write.
   */
  postInk(kind: string): string | null {
    return POST_INK.get(kind) ?? null;
  }

  /** Whether a capture exists — what drives {@link postInk}'s entries. */
  has(name: string): boolean {
    return existsSync(join(this.#dir, name));
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
