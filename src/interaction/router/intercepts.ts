/**
 * The global-intercept table (§103, R-OWN-001).
 *
 * **The mechanism existed as one special case and not as a mechanism** (C16 §3a
 * W4). `⌃c` is read before the ladder by name in `dispatch`, which is exactly a
 * global-intercept — so the tree had an intercept and no table, and the other two
 * the design names had neither. §103 is explicit that these are *declared
 * overrides, not contradictions in the ladder*, and that an app may register one
 * *only with an owner, fallback and collision test*.
 *
 * **Why a table rather than three branches.** A branch answers *what happens to
 * this key*; the table answers *what happens to this key at every rung*, which is
 * the question §103 asks and the one a branch cannot be read for. The
 * owner-applicability is the whole content: `interrupt` is not *the child's*, it
 * is the child's **and** a rejection at a question **and** a rejection in
 * native selection **and** silence when idle, and those four live in four places until they
 * live in one.
 */

import type { InputEvent, OwnerRung, Verdict } from "./types.js";

/** The intercepts §103 names. An app-registered one joins this union (M7). */
export type InterceptId = "interrupt" | "page-scroll" | "wheel";

/**
 * What one intercept does at one rung.
 *
 * **Total over the ladder, and it was partial** (C16 I39). The first version
 * declared a row only where §103 named one and let the rest fall through, on the
 * reading that an absent row means *this intercept does not apply here*. For a
 * route no rung may claim, *the ladder decides* is exactly the claim the route is
 * reserved against — so the omission was not a smaller table, it was the hole the
 * table replaced, restated. It shipped the defect it was built to stop:
 * `page-scroll` named `copy` and idle, `question` fell through, and a confirm's
 * answer handler swallowed `⌥↑` — leaving a reader unable to scroll to read the
 * thing they were being asked to approve.
 *
 * So every rung carries a verdict and TypeScript is what enforces it: a seventh
 * rung is a decision somebody takes rather than a default they inherit.
 */
export type OwnerApplicability = Readonly<Record<OwnerRung, Verdict>> &
  Readonly<{
    /** What happens when no rung above `scope` owns the keyboard. */
    idle: Verdict;
    /** Prose, because a declared override that nobody can read is a special case with a table around it. */
    why: string;
  }>;

export const INTERCEPTS: Readonly<Record<InterceptId, OwnerApplicability>> = Object.freeze({
  /**
   * §103: *interrupt — CHILD handles; QUESTION and COPY MODE reject; an ordinary
   * running owner handles tool/turn interrupt; idle rejects silently.*
   *
   * The `question` row is the one the tree already reached by a different route
   * and for a reason worth keeping: C16 §5's ruling A puts a question above the
   * cancel rungs, because declining and cancelling produce the same outcome and
   * the one that leaves a record wins. Two arguments, one answer — and the
   * table is where they stop being two.
   */
  interrupt: {
    child: "handle",
    copy: "reject",
    question: "reject",
    // **An ordinary running owner handles tool/turn interrupt** (§103), and
    // `substate` and `inside` are ordinary running owners. They were absent
    // rather than decided, which read as agreement with `scope` and was not one.
    substate: "handle",
    inside: "handle",
    scope: "handle",
    idle: "reject",
    why: "a child owns its own signal; a question and a frozen screen are resolved by their own exits, not by cancelling something else",
  },
  /**
   * §103: *COPY MODE rejects while frozen; otherwise the active viewport handles
   * without moving focus* — and the design says which viewport that is.
   * `binding.031`/`.032` give `page.up`/`page.down` `scope: "transcript"`, so
   * `⌥↑` scrolls the **transcript** whatever is focused, including when a
   * `scroll` box has focus. That is R-BLK-112's whole point: the chord is the one
   * that never moves focus and never asks where it is.
   */
  "page-scroll": {
    // **`otherwise` is every other rung, the child included** (C16 I40). A
    // captured child owns its keys; it does not own the transcript scrolled
    // behind it, and a reader who cannot page while a child is attached cannot
    // read what the child just wrote.
    child: "handle",
    copy: "reject",
    question: "handle",
    substate: "handle",
    inside: "handle",
    scope: "handle",
    idle: "handle",
    why: "the screen is frozen, so scrolling it would be scrolling a picture; every other rung scrolls the viewport and FOCUS IS NOT MOVED BY IT",
  },
  /**
   * §103: *the wheel is not delivered in COPY MODE or while mouse tracking is
   * off; otherwise its pointer-hit owner handles it.*
   *
   * *Not delivered* is `reject` rather than an absent row: the bytes arrive and
   * are consumed, and a rung that let them fall would scroll whatever is beneath
   * a frozen screen.
   */
  wheel: {
    child: "handle",
    copy: "reject",
    question: "handle",
    substate: "handle",
    inside: "handle",
    scope: "handle",
    idle: "handle",
    why: "tracking-off is a terminal fact and handled before decode; in native selection the wheel would move a screen that is deliberately still",
  },
});

/**
 * The verdict an intercept declares at a rung. Total, so there is no `null`.
 *
 * **The return type narrowed with the table** (C16 I39). `Verdict | null` was the
 * signature that let a caller read *no verdict here* as *carry on down the
 * ladder*, which is the one answer a reserved route must never give.
 */
export function interceptVerdict(id: InterceptId, rung: OwnerRung | null): Verdict {
  const table = INTERCEPTS[id];
  return rung === null ? table.idle : table[rung];
}

/**
 * Which intercept an event is, or `null` for an ordinary one.
 *
 * **Three reserved routes, and the wheel is the one that is easy to miss because
 * it is not a key.** §103 names all three together — *interrupt · page-scroll ·
 * the wheel* — and a table that carried only `⌃c` would have been the special
 * case it replaced, with two more rows of documentation.
 *
 * **`⌥↑`/`⌥↓` alone, and `PgUp`/`PgDn` were wrongly here** (I40). The design
 * reserves two chords: `binding.031` and `binding.032`, `page.up`/`page.down`,
 * `scope: "transcript"`, and R-BLK-112 says what the scope buys — *⌥↑ ⌥↓, the
 * wheel and the trackpad scroll WITHOUT moving focus. The prompt keeps it and
 * you keep typing.* `PgUp`/`PgDn` are **in no binding and in no rule**: measured,
 * the string does not occur anywhere in `calcium-registry.json`. They are the
 * repo's own keys, they behave like the arrows, and they belong to whichever
 * viewport you are inside — which is the ladder's answer, not a reserved one.
 *
 * Keeping them here made one route out of two different things and forced I40
 * into a compromise: *the active viewport* had to mean the focused box for
 * `PgUp` and the transcript for `⌥↑`, and one verdict cannot say both.
 */
export function interceptOf(e: InputEvent): InterceptId | null {
  if (e.kind === "mouse") return e.button.startsWith("wheel") ? "wheel" : null;
  if (e.kind !== "key") return null;
  const { key } = e;
  if (key.ctrl && key.name === "c") return "interrupt";
  return key.meta && (key.name === "up" || key.name === "down") ? "page-scroll" : null;
}
