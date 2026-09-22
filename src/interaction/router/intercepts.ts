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
 * is the child's **and** a rejection at a question **and** a rejection in copy
 * mode **and** silence when idle, and those four live in four places until they
 * live in one.
 */

import type { InputEvent, OwnerRung, Verdict } from "./types.js";

/** The intercepts §103 names. An app-registered one joins this union (M7). */
export type InterceptId = "interrupt" | "page-scroll" | "wheel";

/**
 * What one intercept does at one rung.
 *
 * `undefined` for a rung means *this intercept does not apply here* — the ladder
 * runs normally — which is different from `pass` and from `reject`, and the
 * distinction is the reason this is a partial record rather than a total one.
 */
export type OwnerApplicability = Partial<Record<OwnerRung, Verdict>> &
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
    scope: "handle",
    idle: "reject",
    why: "a child owns its own signal; a question and a frozen screen are resolved by their own exits, not by cancelling something else",
  },
  /** §103: *COPY MODE rejects while frozen; otherwise the active viewport handles without moving focus.* */
  "page-scroll": {
    copy: "reject",
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
    copy: "reject",
    idle: "handle",
    why: "tracking-off is a terminal fact and handled before decode; in copy mode the wheel would move a screen that is deliberately still",
  },
});

/**
 * The verdict an intercept declares at a rung, or `null` where it declares none.
 *
 * `null` is *the ladder runs normally* and is deliberately not `"pass"`: passing
 * is a decision an owner took, and this is the absence of one.
 */
export function interceptVerdict(id: InterceptId, rung: OwnerRung | null): Verdict | null {
  const table = INTERCEPTS[id];
  if (rung === null) return table.idle;
  return table[rung] ?? null;
}

/**
 * Which intercept an event is, or `null` for an ordinary one.
 *
 * **Three reserved routes, and the wheel is the one that is easy to miss because
 * it is not a key.** §103 names all three together — *interrupt · page-scroll ·
 * the wheel* — and a table that carried only `⌃c` would have been the special
 * case it replaced, with two more rows of documentation.
 *
 * `⌥↑`/`⌥↓` are the design's `page.up`/`page.down` (binding.031, binding.032).
 * `pageup`/`pagedown` are kept beside them because the tree binds those today and
 * M6 is where the keymap becomes the registry's; an intercept that recognised
 * only the design's chord would go quiet for one MR on the route people use.
 */
export function interceptOf(e: InputEvent): InterceptId | null {
  if (e.kind === "mouse") return e.button.startsWith("wheel") ? "wheel" : null;
  if (e.kind !== "key") return null;
  const { key } = e;
  if (key.ctrl && key.name === "c") return "interrupt";
  const paging = key.name === "pageup" || key.name === "pagedown";
  const metaArrow = key.meta && (key.name === "up" || key.name === "down");
  return paging || metaArrow ? "page-scroll" : null;
}
