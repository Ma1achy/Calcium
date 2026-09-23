/**
 * The pull — focus moves the window by the minimum (C26 I24, §7a, §021, §095).
 *
 * **One sentence, two axes.** §021 states it of a scroll box's rows —
 * *FOCUS PULLS THE VIEWPORT, BY THE MINIMUM, one row for one row* — and §095's
 * rule 2 states it of a tape's members in the same words. What the two share is
 * a distance; what differs is the unit, and the unit belongs to the container.
 *
 * **The window's size is what separates the two callers.** A scroll box's is a
 * row count it is told, and that is this function. A tape's is a function of
 * its own contents, because a mark that appears costs cells the members were
 * using — so `tapeWindow` is this rule with the window size solved inside it
 * (C04 I125), and not a second rounding of it. T1.48 is what holds them
 * together: over a tape whose members are uniform and whose marks cost nothing,
 * the two agree at every held start.
 */

/**
 * The window's new start, given where it is and what has to be inside it.
 *
 * **The end rule is applied before the start rule, and that is the ruling.**
 * Both orderings are self-consistent; applying the start rule last is what makes
 * a target taller than the window show its **head**, which is where a reader
 * entering a long thing wants to be. Applying it first shows the tail.
 *
 * A window of nothing is not moved: there is no position that reveals a target
 * in zero rows, so a move would be a number chosen rather than a distance
 * measured.
 */
export function pullIntoView(held: number, from: number, to: number, window: number): number {
  if (window <= 0) return held; // cells-ok — a row count
  let start = Math.max(0, held);
  // Ends after the window — the window ends where the target ends.
  if (to > start + window) start = to - window;
  // Begins before it — the window starts where the target begins. Last, so a
  // target that cannot fit shows its head.
  if (from < start) start = from;
  return Math.max(0, start);
}
