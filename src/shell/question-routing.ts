/**
 * Replace or float — does the answer need the prompt? (C23 §7f, I73, §101).
 *
 * **One rule for every popup consumer, and it is a table rather than six
 * decisions.** §101 settles what the dismissable axis could not: an approval
 * and a choice replace the prompt because there is nothing to type, a typed
 * reply floats above a prompt that goes live beneath it, and a peek, a
 * completion menu and a search float without blocking.
 *
 * **Blocking and replacing are independent**, and the typed reply is the cell
 * that shows it: it blocks *and* floats, which no ordering of one axis
 * produces. That is why this answers a record of three fields rather than one
 * enum with six members — the enum would be the tie, written down.
 *
 * Pure, and nothing here knows about a layer, a frame or a store. The shell
 * asks it what a consumer is and pushes what it answers.
 */
import type { Choice } from "./local/registry.js";

/**
 * §101's six rows. `approval` and `choice` route identically and are kept
 * apart because the design names them apart; nothing may branch on the
 * difference, and T1.68 asserts that their answers are equal rather than
 * asserting each.
 */
export type QuestionConsumer = "approval" | "choice" | "reply" | "peek" | "completion" | "find";

export type QuestionRouting = Readonly<{
  /**
   * Does this take the prompt's rows (C23 I74)? Never a placement mode: the
   * prompt's height is one function and a replacing consumer answers it.
   */
  replaces: boolean;
  /** Does it own input while it is up (C15 I26, `R-QST-001`)? */
  blocking: boolean;
  /** What closes it (C15 I26, `R-BLK-779`). */
  dismissal: "escape" | "focus" | "answer";
}>;

const TABLE: Readonly<Record<QuestionConsumer, QuestionRouting>> = Object.freeze({
  // The prompt has no job — there is nothing to type — so the rows it would
  // spend are the question's. An owner is waiting, so only an answer closes it.
  approval: Object.freeze({ replaces: true, blocking: true, dismissal: "answer" as const }),
  choice: Object.freeze({ replaces: true, blocking: true, dismissal: "answer" as const }),
  // **The cell that proves the two axes are independent.** The answer is
  // composed at the prompt, so the prompt must be live and the question floats
  // above it — and it still blocks, and is still not escapable, because an
  // owner is waiting on it.
  reply: Object.freeze({ replaces: false, blocking: true, dismissal: "answer" as const }),
  // A projection of focus and nothing else, so focus leaving is what closes it.
  peek: Object.freeze({ replaces: false, blocking: false, dismissal: "focus" as const }),
  completion: Object.freeze({ replaces: false, blocking: false, dismissal: "escape" as const }),
  find: Object.freeze({ replaces: false, blocking: false, dismissal: "escape" as const }),
});

/** §101's table, by consumer. */
export function routingFor(consumer: QuestionConsumer): QuestionRouting {
  return TABLE[consumer];
}

/**
 * Which row of the table a question is in **right now** (C23 I73).
 *
 * **Derived from the question's state, never declared by its caller.** A
 * choice-only question that gains a `reply…` has changed state, not kind: the
 * same question with the same id and the same awaiting handler moves from
 * replacing to floating, and the prompt comes live beneath it. A caller that
 * declared the placement would be declaring it for a state the question has
 * not reached.
 *
 * `approval` is two choices and `choice` is more, which is the design's own
 * naming and not a branch: both answer the same routing, and a reader looking
 * for where the difference matters should find that it does not.
 */
export function questionConsumer(choices: readonly Choice[], replying: boolean): QuestionConsumer {
  if (replying) return "reply";
  return choices.length <= 2 ? "approval" : "choice"; // cells-ok — a choice count
}
