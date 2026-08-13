/**
 * Derived focus, and the one stored location.
 *
 * C16 §3 — see spec.
 *
 * **`activeTarget` is the only ordering in this component.** C16 §5's Ctrl-C
 * ladder is documentation of behaviour derived from it, not a second list: its
 * rungs are handlers registered on these targets, so the ladder cannot hold an
 * order of its own to disagree with. The disagreement C16's spec pass found —
 * copy mode above both overlay rungs, against A02 §2 — was possible only because
 * the ladder existed as a separate artefact, and the moment for it to reappear is
 * the commit where both files exist. `FOCUS_ORDER` below is that single artefact.
 */

import type { FocusTarget, StoredFocus } from "./types.js";

/**
 * What `activeTarget` needs to know, structurally.
 *
 * Structural rather than imported: C15's `Layer` and C13's `TranscriptEntry`
 * carry a great deal this function must not read, and taking the shapes by
 * structure keeps I15's purity a property of the signature. It also keeps this
 * file free of an import from `viewport/`, which is a real edge C16 does have but
 * has no reason to spend here.
 */
export type FocusInputs = Readonly<{
  /** C15's `top`. `null` when the stack is empty. */
  overlayTop: Readonly<{ kind: "overlay" | "view" }> | null;
  copyMode: boolean;
  /** C13's live entry, or `null` when the transcript is empty. */
  liveEntry: Readonly<{ id: string }> | null;
  stored: StoredFocus;
}>;

/**
 * A02 §2's priority, and the array order **is** the priority.
 *
 * Exported so T2.5 can be exhaustive over it rather than over a hand-written
 * list that would need keeping in step — a target added to the union and not to a
 * keymap is a compile-level gap only while these two things are the same thing.
 */
export const FOCUS_ORDER = Object.freeze([
  "overlay",
  "copyMode",
  "pushedView",
  // **Above `prompt` and below every layer** (C26 I2). A block being interacted
  // with outranks the prompt, which is the whole of the navigation/interaction
  // split; it does not outrank an overlay that must be answered, copy mode,
  // which takes every key, or a view, which covers the region.
  //
  // Its position needs no argument of its own beyond that, and that is the
  // point: adding a rung to C16 §5's ladder is this line and nothing else.
  "interaction",
  "prompt",
  "liveBlock",
  "global",
] as const satisfies readonly FocusTarget[]);

/**
 * First match wins, recomputed on every dispatch (I1, I15).
 *
 * `pushedView` needs no separate "is there a view" input, and that is worth
 * saying because the obvious reading is that it does. Overlays always sit above
 * views (C15 I2), so a view is reachable as the *top* exactly when no overlay is
 * open — and when an overlay is open, the first row wins anyway. The top alone is
 * therefore sufficient, and asking C15 for `hasView` as well would add an input
 * that can disagree with the one beside it.
 */
export function activeTarget(deps: FocusInputs): FocusTarget {
  if (deps.overlayTop?.kind === "overlay") return "overlay";
  if (deps.copyMode) return "copyMode";
  if (deps.overlayTop?.kind === "view") return "pushedView";
  // **Before the `prompt` row, and gated on the live entry** (C26 I2). The mode
  // is stored, so it can outlive the entry that was being interacted with —
  // freezing is a mode exit nobody signals (C26 §8a trace, the live-block
  // freeze), and answering `interaction` for an entry that is no longer live
  // would hand every key to a block the reader cannot act on.
  if (deps.stored.at === "liveBlock" && deps.stored.mode === "interact" && deps.liveEntry !== null) {
    return "interaction";
  }
  if (deps.stored.at === "prompt") return "prompt";
  if (deps.liveEntry !== null) return "liveBlock";
  return "global";
}

/**
 * The one piece of stored focus state in the system (§3).
 *
 * A location rather than a bit: when focus is in the live block, which row holds
 * it is part of the same fact and has no separate owner.
 *
 * **`reset` is a call, never a subscription** (I2). C13's `Change` carries a
 * single `append` kind, so a subscriber could not tell a command outcome from a
 * notice append — and the rule is about *running a command*, which only the
 * caller knows it did. L4 calls this from C23 §4's submit row, between the append
 * and the commit.
 */
export interface FocusStore {
  readonly current: StoredFocus;
  /** Called by L4 on append. The whole of I2. */
  reset(): void;
  /** `↓` from the prompt. `null` row means "the block, no row yet". */
  enterLiveBlock(rowId: string | null): void;
  /**
   * **The reader stepped out**, and it is not `reset()` (C26 I13).
   *
   * `Esc`, `↑` past the first row, and Ctrl-C's live-block rung. All three are
   * the reader leaving; `reset()` is C16 I2's *a command ran*, which is L4's and
   * arrives from the submit row.
   *
   * **Both produce `{at: "prompt"}` today, so the distinction is currently
   * invisible — and it was already wrong.** `toPrompt()` had exactly one caller
   * in the tree, the Ctrl-C rung, while `Esc` and `↑` called `reset()`. Focus
   * memory hangs off this pair, and with the call sites as they were the
   * emphatic exit would have kept the memory and the two ordinary ones wiped it.
   * C26 §8b.2.
   */
  toPrompt(): void;
  /** Row navigation within the live block; a no-op at the prompt. */
  focusRow(rowId: string | null): void;
  /**
   * Enter or leave interaction mode on the focused row (C26 I2, I14).
   *
   * A no-op at the prompt for `focusRow`'s reason: entering the live block is
   * one call's decision, and a mode change arriving from a stale handler would
   * hand the block every key without a keystroke.
   */
  setMode(mode: "navigate" | "interact"): void;
}

const AT_PROMPT: StoredFocus = Object.freeze({ at: "prompt" });

export function createFocusStore(): FocusStore {
  let stored: StoredFocus = AT_PROMPT;

  return {
    get current() {
      return stored;
    },
    reset() {
      stored = AT_PROMPT;
    },
    enterLiveBlock(rowId) {
      // Entry is always into navigation. Landing in interaction would give the
      // block every key before the reader has seen where focus went.
      stored = Object.freeze({ at: "liveBlock", rowId, mode: "navigate" });
    },
    toPrompt() {
      stored = AT_PROMPT;
    },
    focusRow(rowId) {
      // Deliberately a no-op at the prompt rather than a way in. Entering the
      // live block is `↓`'s decision and belongs to one call, or a row focus
      // arriving from a stale handler would move focus without a keystroke.
      if (stored.at !== "liveBlock") return;
      // **Moving between rows leaves interaction**, which is the two-level
      // escape read from the other end: a mode belongs to the element it was
      // entered on, and carrying it to the next row would make `↓` mean
      // something different depending on how the reader arrived.
      stored = Object.freeze({ at: "liveBlock", rowId, mode: "navigate" });
    },
    setMode(mode) {
      if (stored.at !== "liveBlock") return;
      stored = Object.freeze({ at: "liveBlock", rowId: stored.rowId, mode });
    },
  };
}
