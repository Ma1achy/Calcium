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
export function defaultStart(choices: readonly Readonly<{ default?: true }>[]): number {
  const marked = choices.findIndex((c) => c.default === true);
  return marked < 0 ? choices.length - 1 : marked;
}
