/**
 * C09 I81 — the shed step, shared by the four kinds that owe a narrow ladder.
 *
 * **Shedding and truncating are different mechanisms**, and the defect this
 * exists to fix is four kinds applying the second to a problem of the first.
 * Truncation is for a single run too long for its box — a path, a message, a
 * label. Shedding is for a **row of parts** too narrow for all of them. Applied
 * to a row, truncation cuts every part at once and the row becomes unreadable
 * in every column, which is what `comparison` at twelve columns drew: `  field
 * b……` over `~ l…  3…  2…`, four parts each cut to nothing.
 *
 * **One implementation, not a fifth.** `status`'s `widthRung` and `plot`'s
 * `layoutFor` are the shape — a computation inside a definition that picks a
 * form for a width — and neither has a shed step. This is that step, factored
 * out because four kinds need the same one and doing it four times privately is
 * how a repository comes to hold eight ladders (F1232).
 *
 * **One order governs shrinking and shedding alike, and that is the finding the
 * first draft produced.** Written with a shed order alone and read as a frame,
 * `events` shrank its timestamp at forty columns — where the whole time fitted
 * twice over — because the deficit was taken from every part at once. A row has
 * a part that should give up room first and a part that should give it up last,
 * and it is the **same** order that says which sheds first. Two orders would be
 * two records of one decision.
 */

import { cells } from "../text.js";

/**
 * What running out of width does to a part (C09 I81).
 *
 * **A part's minimum means a different thing per tier**, which is why the tier
 * is declared rather than inferred from the numbers: it is a **floor** for
 * content and a **threshold** for decoration, and *decoration never widens its
 * container* is the same sentence said the other way.
 */
export type Tier =
  /** Shrinks to its floor, then sheds. Visible and recoverable while it is drawn. */
  | "content"
  /** Sheds whole with no trace, because nothing was lost. */
  | "decoration";

// **There were three, and the third had nothing to do** (F1233). `peer` held a
// row of equals in lockstep so that `comparison`'s two value columns could not
// narrow by different amounts — and the kind hands them **one** natural width,
// the widest of either column, because two columns of a comparison are one
// measurement. So their slack was equal before the tier ran, removing the arm
// moved no frame at any width from 4 to 80, and the mutation pass is what said
// so. Equal columns are the kind's construction, stated where the widths are
// taken; a tier that cannot be disobeyed is a tier nothing tests.

export type Part = Readonly<{
  id: string;
  /** Its width with nothing taken away, in cells. */
  natural: number;
  /**
   * Its floor if `content`, its threshold if `decoration` — **the width below
   * which it is not drawn at all**, because a part drawn under its floor is
   * illegible and the rule is that every part still drawn can be read.
   */
  min: number;
  tier: Tier;
  /**
   * **Higher is more important**: a part gives up room before any part above it
   * does, and sheds before any part above it does. The order is the kind's to
   * declare, because only the kind knows which part carries the meaning.
   *
   * **The highest-ranked part never sheds** — it is the last one standing, and
   * a row that shed it would say nothing at all.
   */
  rank: number;
}>;

export type ShedResult = Readonly<{
  /** The survivors, in declaration order, with the width each is drawn at. */
  kept: readonly Readonly<{ id: string; width: number }>[];
  /**
   * The withholding, ready to draw, or `null` where there is nothing to say or
   * no room to say it.
   *
   * **Composed here and not by the caller, because the mark and the budget that
   * reserves it are one decision** — which is this step's first finding and was
   * very nearly its last. Left to the caller the mark is appended after the
   * widths are settled, and `clampSpans` takes the overflow off the **first**
   * span: at four columns `keyValue` drew `… ⋯1`, the key crushed to one cell
   * to make room for a mark announcing that something else had gone. The mark
   * cannot be the part that survives.
   *
   * A count and not a list, because a list of what went is wider than what
   * stayed. The lead is the `residue` slot (C09 I22, C04 I49) — `⋯` against
   * `~`, one cell at both conventions — handed in because this module holds no
   * capabilities.
   */
  mark: string | null;
}>;

/**
 * One pass's answer, with the fact that only this module needs.
 *
 * **`clipped` is not published, and MG24 is why the distinction got made.** It
 * says the last part standing is still wider than the row — which is the step's
 * own reason for preferring one pass over the other, and nothing a kind can act
 * on: every caller's spans go through `clampSpans`, so the container already
 * takes the cut. A published member no consumer can use is a seam with one
 * side, which is the rule's subject exactly.
 */
type Solved = Readonly<{
  kept: readonly Readonly<{ id: string; width: number }>[];
  /**
   * Parts shed, lowest rank first — **counted here and published only as the
   * mark** (F1233). It was a member of the result until the mutation pass asked
   * what read it: `steps` did, to decide whether to draw a part, and the width
   * beside it already said the same thing — so removing the check changed no
   * frame and the row that should have caught it could not. Two spellings of
   * *gone* is one too many, and the one that survives is the width.
   */
  shed: readonly string[];
  clipped: boolean;
}>;

/**
 * The width a part will not go below — **and the tier is what decides whether
 * the declared minimum is one**.
 *
 * Decoration is a *threshold*: it is drawn whole or it is shed, so its floor is
 * its natural width whatever it declared. Stated here rather than trusted to
 * every kind writing `min: natural`, because a decoration part with a smaller
 * floor reads as deliberate and draws `sc\u2026` beside a message with twenty
 * cells to spare — which is the frame that produced the rule.
 */
const floorOf = (p: Part): number => (p.tier === "decoration" ? p.natural : p.min);

const spanOf = (parts: readonly Part[], at: (p: Part) => number, gap: number): number =>
  parts.reduce((a, p) => a + at(p), 0) + Math.max(0, parts.length - 1) * gap; // cells-ok — a part count

/**
 * Shed until the row fits, then share what is left (C09 I81).
 *
 * The invariant's four lines, in order, and **the last two are the fix**: today
 * the cut runs on every part at once and the shrink order does not exist.
 *
 * **Why not C29's `distribute`.** The engine's deficit rule shrinks every child
 * toward its own floor together, which is right for a row of columns that are
 * peers and wrong for a row of parts that are ranked. Here the order *is* the
 * decision — the message gives up its room before the timestamp gives up any —
 * so a proportional rule would answer a different question correctly.
 */
export function shedRow(
  parts: readonly Part[],
  width: number,
  gap: number,
  lead: string,
): ShedResult {
  // **The withholding is a part of the row and is budgeted like one.** A mark
  // appended after the widths are settled is a mark the clamp pays for, which
  // takes the cells out of whichever part happens to be last — silently, and
  // from the part the order said to protect. So the row is solved, and solved
  // again against a narrower budget if anything went. Two passes at most: the
  // second can only shed more, and a third would have nothing new to remove
  // that the second did not already see.
  const first = solveRow(parts, Math.max(0, Math.floor(width)), gap); // cells-ok — a cell count
  if (first.shed.length === 0) return stated(first, null); // cells-ok — a part count
  // The mark's own separator, floored at one cell: a row whose parts carry
  // their own leading gaps passes `gap: 0`, and a mark written hard against the
  // last part is a mark that reads as part of it.
  const mark = markCells(lead, parts.length) + Math.max(gap, 1); // cells-ok — a cell count
  const second = solveRow(parts, Math.max(0, Math.floor(width) - mark), gap); // cells-ok — a cell count
  // **The reservation gives way where it would make the row clip, and
  // `clipped` is what says so.** At four columns `events` shed its type and its
  // time, reserved three cells for `⋯2` and had one left for the message — the
  // frame was the withholding and nothing else, a row saying only that it
  // cannot say anything. A mark is worth its cells while the row still fits
  // without cutting; past that the row wins. **The first pass is the answer
  // then, not a narrower second one**: it is the same shedding against a budget
  // that spends nothing on a mark the container was going to clip anyway.
  return second.clipped ? stated(first, null) : stated(second, lead);
}

/**
 * A pass's answer with its withholding settled — **and `null` where the budget
 * did not pay for one.** A mark the row has no room for is not a silence: it is
 * the difference between a row that says it withheld something and a row that
 * spends its last cells saying so.
 */
const stated = (solved: Solved, lead: string | null): ShedResult =>
  Object.freeze({
    kept: solved.kept,
    shed: solved.shed,
    mark: lead === null || solved.shed.length === 0 ? null : `${lead}${String(solved.shed.length)}`, // cells-ok — a part count
  });

/** One pass of the ladder, against a budget the caller has already reserved from. */
function solveRow(parts: readonly Part[], width: number, gap: number): Solved {
  const budget = Math.max(0, width); // cells-ok — a cell count
  // Lowest rank first — the order parts are shed in. Shrinking reads the same
  // list backwards, which is the whole of the two-directions rule below.
  const order = [...parts].sort((a, b) => a.rank - b.rank || parts.indexOf(a) - parts.indexOf(b));
  let alive = [...parts];
  const gone: string[] = [];

  for (;;) {
    const widths = new Map(alive.map((p) => [p.id, p.natural]));
    const total = (): number =>
      [...widths.values()].reduce((a, n) => a + n, 0) + Math.max(0, widths.size - 1) * gap; // cells-ok — a part count

    // 2. Shrink, **the part with the most slack giving first**, down to its own
    // floor before the next part gives anything.
    //
    // **The shrink order is derived and only the shed order is declared, and
    // that is the second thing the frames settled.** Taking it from the rank
    // was tried both ways and each way is right for one kind and wrong for
    // another: `events` wants its message — the *highest* ranked part — to
    // absorb the deficit, and `keyValue` wants its value — the *lower* ranked
    // one — to absorb it, because in the first the important part is the
    // elastic one and in the second it is not. Slack tells them apart with
    // nothing declared: the part with room to give, gives. A proportional
    // split over every part is the other tempting answer and it is the defect
    // this replaces wearing a fairer name — at forty columns it cut two cells
    // off a timestamp to spare a message that had twenty-six to spare.
    //
    // **Equal slack splits by largest remainder**, ties to the earlier part:
    // `comparison`'s two values arrive with one width between them, so they
    // give up their cells together and an odd cell goes to the left-hand column
    // (C29 I4's rule, and for the same reason).
    for (;;) {
      const over = total() - budget;
      if (over <= 0) break;
      const slack = new Map(
        alive.filter((p) => widths.has(p.id)).map((p) => [p.id, widths.get(p.id)! - floorOf(p)]),
      );
      const most = Math.max(0, ...slack.values());
      if (most <= 0) break;
      const members = alive.filter((p) => slack.get(p.id) === most);
      const take = Math.min(most * members.length, over); // cells-ok — a part count
      const each = Math.floor(take / members.length); // cells-ok — a part count
      let left = take - each * members.length; // cells-ok — a part count
      for (const p of members) {
        const extra = left > 0 ? 1 : 0;
        left -= extra;
        widths.set(p.id, widths.get(p.id)! - Math.min(each + extra, most));
      }
    }

    if (total() <= budget) {
      return Object.freeze({
        kept: Object.freeze(alive.map((p) => ({ id: p.id, width: widths.get(p.id)! }))),
        shed: Object.freeze(gone),
        clipped: false,
      });
    }

    // 3. Still over with every survivor at its floor: shed the lowest-ranked
    // one whole and go again. **The highest-ranked part is never shed** — a row
    // that shed it would say nothing at all — so the loop ends at one part.
    const worst = order.find((p) => widths.has(p.id));
    if (worst === undefined || alive.length <= 1) { // cells-ok — a part count
      return Object.freeze({
        kept: Object.freeze(alive.map((p) => ({ id: p.id, width: Math.min(p.natural, budget) }))),
        shed: Object.freeze(gone),
        clipped: true,
      });
    }
    gone.push(worst.id);
    alive = alive.filter((p) => p.id !== worst.id);
  }
}

/**
 * The mark's width, reserved before the widths are settled (C09 I108).
 *
 * **It was the constant `2` and the constant was a sentence about one rung.**
 * The justification read *two cells covers `⋯1` through `⋯9`* — true, and
 * written where the lead is a **parameter**. The ASCII `residue` is `...`, three
 * cells, so `...2` is four against a reservation of two, and the shortfall came
 * out of the clamp: a rendered `events` row at 20 columns drew
 * `rolled the flee~ ..~`, the mark itself cut and its **count truncated away**.
 * A residue mark that has lost its count is not a degraded mark; it is a mark
 * that says nothing, which is the exact failure this reservation exists to
 * prevent — named in the paragraph above and defeated by the line below it.
 *
 * **Both halves are derived now, so neither is a guess.** The lead is measured
 * rather than assumed, and the count's width comes from the most parts that can
 * ever shed — the highest-ranked one never does, so it is `parts.length - 1`.
 * That removes the old bound's escape clause (*a row with ten parts to shed is
 * not a row this mechanism is saving*) rather than restating it: a kind with
 * eleven parts now reserves three cells for the count because it can need them.
 */
const markCells = (lead: string, parts: number): number =>
  // narrow-ok — the lead is `⋯` only where the terminal is narrow. `⋯` is
  // Ambiguous, so measuring it matters; but the whole glyph set falls to ASCII
  // wholesale at the wide arm (C02 I9, T2.75: `glyphs(WIDE_CAPS)` equals
  // `glyphs(ASCII_CAPS)`), so a wide terminal hands in `...`, which is three
  // cells under either convention. The narrow measurement is right for every
  // lead this is ever called with, and this module holds no capabilities to
  // ask with.
  cells(lead) + String(Math.max(1, parts - 1)).length; // cells-ok — a digit count // narrow-ok — see above

/** The row's span at its natural widths, for a caller deciding whether to ask at all. */
export const naturalSpan = (parts: readonly Part[], gap: number): number =>
  spanOf(parts, (p) => p.natural, gap);
