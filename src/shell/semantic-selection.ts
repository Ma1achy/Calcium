/**
 * Semantic copy mode's model (C14 §6a, C16 §5d, `R-SEL-003`, `R-SEL-005`,
 * `R-SEL-008`, `R-SEL-015`).
 *
 * **Pure, and separate from `session.ts` for a reason that is not tidiness.**
 * The one rule this mode has that nothing else in the tree has is C16 I51's
 * asymmetry — `esc` clears then leaves, `⌃c` only leaves — and the surface that
 * would otherwise show it is the footer's mode label, which is **parked** on a
 * word the design does not supply (C14 §6a). A rule whose only observation point
 * is unbuilt is a rule nothing can be written against, which is A03 §2's class
 * arriving by scheduling rather than by wording. So the transition is a function
 * and the state is its argument.
 *
 * `null` is *not in the mode*, and it is the same value as *no selection*
 * deliberately: `R-SEL-005` says a selection is state **within** a rung rather
 * than a rung of its own, so the pair that cannot exist — not in the mode, three
 * entries selected — has no representation here rather than a guard against it.
 */

/** The caret, and the entries a copy would take (`R-SEL-015`). */
export type SemanticSelection = Readonly<{
  /** An entry id. `null` when the transcript is empty. */
  caret: string | null;
  /**
   * **Entry ids, because a block is atomic in a selection** (`R-SEL-003`).
   *
   * A set rather than a range: `A` takes every loaded entry and an extend takes
   * a contiguous run, and both are sets of whole entries. A range would be the
   * cheaper representation and would make the atomicity a property the callers
   * have to maintain rather than one the type has.
   */
  entries: ReadonlySet<string>;
}>;

/** The mode, or `null` when it is not up. */
export type SemanticMode = SemanticSelection | null;

const frozen = (caret: string | null, entries: ReadonlySet<string>): SemanticSelection =>
  Object.freeze({ caret, entries });

/** Enter, seeded with a caret. A second call is a no-op (C16 §5d D3). */
export function enter(mode: SemanticMode, caret: string | null): SemanticMode {
  return mode ?? frozen(caret, new Set<string>());
}

/**
 * `esc` — clear the selection if there is one, otherwise leave (C16 I51, §5d D1/D2).
 *
 * The reader presses one key twice and the footer says which press they are on.
 * `⌃c` does **not** come through here: it is `null` directly, because the
 * ladder's rung answers *cancel the innermost thing* and a rung that also tidied
 * up would be answering two questions (C16 I23).
 */
export function escape(mode: SemanticMode): SemanticMode {
  if (mode === null) return null;
  return mode.entries.size === 0 ? null : frozen(mode.caret, new Set<string>());
}

/** `a` — take the entry under the caret (`R-SEL-008`). */
export function selectCaret(mode: SemanticMode): SemanticMode {
  if (mode === null || mode.caret === null) return mode;
  return frozen(mode.caret, new Set([...mode.entries, mode.caret]));
}

/**
 * `A` — take every loaded entry (`R-SEL-008`).
 *
 * *Says what it did, because the window is not the record*: the count this
 * returns is the loaded entries, not the session's, and `⌃a` is deliberately
 * unbound because a key that silently produces a clipboard of megabytes is a
 * trap.
 */
export function selectAll(mode: SemanticMode, loaded: readonly string[]): SemanticMode {
  return mode === null ? null : frozen(mode.caret, new Set(loaded));
}

/**
 * How many entries a copy **right now** would take (`R-SEL-015`).
 *
 * The rule's own wording, and it is not the same sentence as *how many are
 * highlighted*: the two differ the moment a block is partly covered, and a block
 * is atomic so they cannot differ here. Stated in the rule's terms so the
 * motions landing later cannot quietly change what the number means.
 */
export const count = (mode: SemanticMode): number => mode?.entries.size ?? 0;
