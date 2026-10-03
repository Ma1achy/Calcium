/**
 * A selection over a list, shared by the popups (roadmap entry 16).
 *
 * **The walk sized this and it is smaller than the entry read**: the two
 * implementations agreed exactly on how the selection *moves* — `% length` in
 * both directions, in `confirm.ts` and in `keys.ts` alike — and diverged only on
 * where it starts. So this is a store plus one supplied field, not a merge of
 * two mechanisms.
 *
 * **The start is supplied and never inferred, which is the whole safety
 * argument.** The confirm opens on the choice marked `default` and falls back to
 * the **last** — `confirm.ts` gives the reason: for a destructive verb the safe
 * option is conventionally last, and a default that silently means *the first
 * thing offered* is the wrong way for that to fail. The menu opens on `null`, or
 * on 0 when a `Tab` asked for it (C19 I20, I22). A store that guessed would have
 * to pick one, and picking 0 passes every navigation assertion, every
 * single-choice case and every menu row while putting `/prune` on `yes`.
 *
 * `null` means *a display rather than a choice* (C19 I20), and a null selection
 * does not move: the guard lives here rather than at each call site, because it
 * is the same guard and it was written twice.
 */

export interface ChoiceSelection {
  /** The index, or `null` while the list is a display rather than a choice. */
  readonly at: number | null;
  /** Forward, wrapping. A `null` selection stays null. */
  next(): void;
  /** Backward, wrapping. */
  prev(): void;
  /** A new list, with the start its owner decides (never inferred here). */
  reset(size: number, start: number | null): void;
}

export function createChoiceSelection(size: number, start: number | null): ChoiceSelection {
  let count = size;
  let index = start;

  const move = (by: number): void => {
    if (index === null || count <= 0) return;
    index = (index + by + count) % count;
  };

  return {
    get at() {
      return index;
    },
    next: () => void move(1),
    prev: () => void move(-1),
    reset: (nextSize, nextStart) => {
      count = nextSize;
      index = nextStart;
    },
  };
}

/**
 * The confirm's start: the choice marked `default`, falling back to the last.
 *
 * **The fallback is the load-bearing half.** Every caller in this repository
 * marks a default, so this only runs for one that forgot — and the claim is that
 * forgetting should be safe. It is a function here rather than a rule inside the
 * store for the reason above: a store that knew this rule would apply it to the
 * completion menu too, where the last candidate is not a safe answer but an
 * arbitrary one.
 */
export function defaultStart(
  choices: readonly Readonly<{ default?: true; reply?: true; inspect?: true }>[],
): number {
  const marked = choices.findIndex((c) => c.default === true);
  if (marked >= 0) return marked;
  // **The last choice that answers** (C23 I93, ruling 6). A `reply…` opens a
  // line and an inspection suspends, so neither is an answer: a fallback that
  // landed on one made `esc` open a reply or an inspection rather than
  // resolve. With none that answers, the last, which is the rule as it stood.
  for (let i = choices.length - 1; i >= 0; i -= 1) {
    const c = choices[i]!;
    if (c.reply !== true && c.inspect !== true) return i;
  }
  // **Unreachable through `ask`**, which refuses a set with nothing that
  // answers (C23 I93, F1495) — kept total so a caller that has not validated
  // still gets an index into the set rather than `-1`.
  return choices.length - 1;
}

/**
 * What `ask` refuses before anything is queued or pushed (C23 I93, ruling 6),
 * and what the testing stand-in refuses too, so a handler tested against it
 * cannot pass on a set the shell throws on.
 *
 * A second default makes `esc` and the opening selection disagree about which
 * is safe, and a default on `reply…` or an inspection is a safe answer that
 * answers nothing — `esc` would open a line or suspend.
 *
 * **And a set in which nothing answers has no safe answer at all** (F1495,
 * `R-BLK-348`). `esc` resolves with `defaultStart`'s choice, and with every
 * choice a `reply…` or an inspection that was one of them — resolved as an
 * *answer*, with no text, because `esc` settles directly and never opens the
 * reply. On an approval the key was not `deny`, and the tool ran (C23 §8a
 * A6.11 rows 1–3).
 */
export function invalidChoices(
  choices: readonly Readonly<{ key: string; default?: true; reply?: true; inspect?: true }>[],
): string | null {
  if (choices.length === 0) {
    // A question with nothing to answer it cannot resolve, and resolving it
    // with an invented key would put a value in the handler's hands that no
    // caller wrote. Construction error, C23 I27's standard.
    return "ask() needs at least one choice";
  }
  const defaults = choices.filter((c) => c.default === true);
  if (defaults.length > 1) {
    return `ask() takes at most one default choice, and ${String(defaults.length)} are marked (C23 I93)`;
  }
  const d = defaults[0];
  if (d !== undefined && (d.reply === true || d.inspect === true)) {
    return `ask(): the default choice "${d.key}" ${d.reply === true ? "opens a reply" : "opens an inspection"} and answers nothing (C23 I93)`;
  }
  if (choices.every((c) => c.reply === true || c.inspect === true)) {
    return "ask(): every choice opens a reply or an inspection, so none answers and esc has nothing safe to resolve with (C23 I93)";
  }
  return null;
}
