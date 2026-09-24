/**
 * C16 §8 I53 — key repeat, declared per binding (`R-KEY-002`, `R-DEG-002`).
 *
 * **A terminal sends no key-up**, so a held arrow normally arrives as a stream
 * of presses at the operating system's rate — §020 measures the usual pair at
 * 500 ms before the first repeat and 30 ms between them, *and neither number is
 * ours*. The kitty protocol sends `press`, `repeat` and `release` separately
 * (`KITTY_EVENT`, `decode.ts`), which is what makes the rate a decision.
 *
 * **Nothing here schedules anything, and that is the invariant rather than an
 * implementation note.** This module is a pure function over durations: the
 * repeats are the terminal's, and the policy only decides which to act on and
 * what each is worth. A reader who has disabled key repeat sends none and
 * therefore gets none — a timer that fired on its own would quietly give them
 * a repeat they turned off, and no assertion about a rate would see it.
 */

/**
 * The two numbers §020 insists are two questions, plus whether holding earns
 * more than one step.
 *
 * *Both are per-BINDING, because they are not one question* — a page and a row
 * disagree about the delay for the same reason they disagree about the rate.
 */
type RepeatPolicy = Readonly<{
  /** Delay before auto-shift — the pause before it runs at all. */
  das: number;
  /** Auto-repeat rate — the floor between two acted-on repeats, once running. */
  arr: number;
  /**
   * Whether a longer hold is worth more per repeat (`ACCELERATION`).
   *
   * **Declared rather than defaulted, and the design settles each case by its
   * own reason.** §020 names it for the slider — *and it ACCELERATES after a
   * second* — and argues the ladder from a list: *so a 10,000-row table is
   * crossable by holding an arrow, and a 2-row one is not overshot*. The other
   * three are refused by the same sentences that set their numbers: a page is
   * *a whole screen* each, so sixteen of them is not a faster crossing but a
   * lost place; an orbit is *analogue* at 60 fps, where a step count is the
   * wrong unit entirely; and `⌫` is *slow to start — a mis-hold is expensive*,
   * which acceleration would invert.
   */
  accelerate: boolean;
}>;

/**
 * §020's acceleration ladder — the hold durations, and what a repeat is worth
 * inside each.
 *
 * Held as a table rather than as branches so the boundaries are one edit and
 * can be asserted as data; the last band has no ceiling and is written `null`
 * rather than `Infinity`, which would compare unequal to itself across a JSON
 * round trip if this ever reaches the registry.
 */
export const ACCELERATION: readonly Readonly<{ untilMs: number | null; steps: number }>[] =
  Object.freeze([
    Object.freeze({ untilMs: 1000, steps: 1 }),
    Object.freeze({ untilMs: 3000, steps: 4 }),
    Object.freeze({ untilMs: null, steps: 16 }),
  ]);

/**
 * What a binding that declares nothing is worth (I53's last clause).
 *
 * `das: 0` and `arr: 0` because the terminal's own repeat is already delayed
 * and already rate-limited — imposing a second floor on top would be this
 * application deciding a rate it was told not to decide. One step, always:
 * *text entry and destructive actions do not inherit navigation repeat*.
 */
export const DEFAULT_REPEAT: RepeatPolicy = Object.freeze({ das: 0, arr: 0, accelerate: false });

/**
 * §020's table, by the action ids the keymap actually carries.
 *
 * **Four of the five rows have a subject here and the fifth does not.** §020
 * lists a slider at 200/40; the keymap has no slider action — `valuesToggle`
 * is a disclosure, not a continuous control — so declaring one would be a
 * policy for a consumer that does not exist (F161's shape). It is left out
 * rather than guessed at, and arrives with the control.
 */
export const REPEAT_POLICIES: ReadonlyMap<string, RepeatPolicy> = new Map<string, RepeatPolicy>([
  // `↑↓ in a list — 170 / 25 — fast, and it is discrete`. Both lists the tree
  // has: the transcript's rows and the completion menu.
  ["rowUp", Object.freeze({ das: 170, arr: 25, accelerate: true })],
  ["rowDown", Object.freeze({ das: 170, arr: 25, accelerate: true })],
  ["menuNext", Object.freeze({ das: 170, arr: 25, accelerate: true })],
  ["menuPrev", Object.freeze({ das: 170, arr: 25, accelerate: true })],
  // `⌥↑ ⌥↓ page — 250 / 90 — slower, each one is a whole screen`.
  ["scrollPageUp", Object.freeze({ das: 250, arr: 90, accelerate: false })],
  ["scrollPageDown", Object.freeze({ das: 250, arr: 90, accelerate: false })],
  // `a 3D orbit — 0 / 16 — NO delay, 60fps — it is analogue`.
  ["orbitLeft", Object.freeze({ das: 0, arr: 16, accelerate: false })],
  ["orbitRight", Object.freeze({ das: 0, arr: 16, accelerate: false })],
  // `⌫ in the prompt — 300 / 30 — slow to start, a mis-hold is expensive`.
  ["backspace", Object.freeze({ das: 300, arr: 30, accelerate: false })],
]);

/**
 * What this repeat is worth — `0` to let it pass unacted.
 *
 * **Durations rather than timestamps**, so the caller owns the clock and this
 * owns the rule; the router already receives `now` as a parameter and reads it
 * once per event, and two readings inside one decision is how a rate becomes
 * sensitive to how long the decision took.
 *
 * `sinceLastMs` is not nullable and there is no *never acted* arm, because the
 * state cannot be constructed: a repeat is always preceded by the press that
 * produced it, and the press acts. A sentinel for an unreachable case is the
 * vacuity class with an extra branch (A03 §2).
 */
export function repeatSteps(policy: RepeatPolicy, heldMs: number, sinceLastMs: number): number {
  // Still inside the delay — the pause before it runs.
  if (heldMs < policy.das) return 0;
  // Running, but sooner than the declared rate.
  if (sinceLastMs < policy.arr) return 0;
  if (!policy.accelerate) return 1;
  for (const band of ACCELERATION) {
    if (band.untilMs === null || heldMs < band.untilMs) return band.steps;
  }
  // Unreachable: the last band's ceiling is `null`. Returning the slowest arm
  // rather than throwing, because a repeat is not worth a crash.
  return 1;
}

/** The policy a binding carries, or the one that inherits nothing (I53). */
export function repeatFor(action: string): RepeatPolicy {
  return REPEAT_POLICIES.get(action) ?? DEFAULT_REPEAT;
}
