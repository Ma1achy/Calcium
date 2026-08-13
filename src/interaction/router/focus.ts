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

import type { ElementAddress, FocusTarget, StoredFocus } from "./types.js";

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
 * What resolution needs of an element list, structurally (C26 I10).
 *
 * **Structural rather than an import of `NavElement`, on the argument this file
 * already makes for `FocusInputs`**: taking the shape by structure keeps purity a
 * property of the signature, and keeps a file about stored focus free of an edge
 * into `presentation/`. One decision applied twice, not a second one that agrees.
 */
export type PlacedElement = Readonly<{
  blockId: string;
  element: Readonly<{ id: string }>;
}>;

/**
 * Which element an address names, **or the nearest survivor forward** (C26 I10).
 *
 * Exact match on both halves first. On no match the address is stale — a refresh
 * replaced the block under it (`putBlock` is total and never throws, so nothing
 * signals that the element went) — and resolution falls **forward** to the next
 * element in the list.
 *
 * *Nearest* is the list's own order and not a second notion of distance: the list
 * is in reading order by C26 I5, so the two cannot disagree.
 *
 * **One resolver for the render side and the key side, because neither can own
 * it.** `focusFor` is a per-frame read and must write nothing, so a fall-forward
 * computed there would leave the store holding a dead address and the next `↓`
 * counting from it — the collision this replaced, one layer over. A fall-forward
 * that *did* write would put a mutation inside a render query. Both call this,
 * display and the next keystroke agree by construction, and the store is repaired
 * by the next focus-moving keystroke. Same argument as `elements` itself: one
 * source, or they disagree (C26 I8).
 *
 * Returns an **index**, because every caller wants either the element or its
 * neighbours and only the index answers both.
 */
export function resolveFocus(
  address: ElementAddress | null,
  elements: readonly PlacedElement[],
): number | null {
  if (elements.length === 0) return null; // graphemes-ok: an element count, not text
  // **In the block, on no element yet** — entry's own state, not a stale address.
  // It resolves to the first element rather than to nothing, so `↓` from here
  // moves to the second and not back to the top.
  if (address === null) return 0;

  const exact = elements.findIndex(
    (p) => p.blockId === address.blockId && p.element.id === address.elementId,
  );
  if (exact !== -1) return exact;

  // Stale — the element went. **Its position went with it**, and that is the
  // limit on how fine this can be: the list is the new one, so there is no index
  // to count from and nothing says where the missing element used to sit. The
  // block is therefore the finest scope resolution can honour, and saying so is
  // better than an arithmetic that looks precise and is guessing.
  //
  // The block survives — a row was removed from a table the reader is still
  // looking at — so focus stays in it, at its first element.
  const inBlock = elements.findIndex((p) => p.blockId === address.blockId);
  if (inBlock !== -1) return inBlock;

  // The block itself went. Nothing about the old position survives, so this
  // falls to the start of what is there rather than pretending to a neighbour.
  return 0;
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
  /** `↓` from the prompt. `null` means "the block, no element yet". */
  enterLiveBlock(element: ElementAddress | null): void;
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
  /** Movement between elements; a no-op at the prompt. */
  focusRow(element: ElementAddress | null): void;
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
    enterLiveBlock(element) {
      // Entry is always into navigation. Landing in interaction would give the
      // block every key before the reader has seen where focus went.
      stored = Object.freeze({ at: "liveBlock", element, mode: "navigate" });
    },
    toPrompt() {
      stored = AT_PROMPT;
    },
    focusRow(element) {
      // Deliberately a no-op at the prompt rather than a way in. Entering the
      // live block is `↓`'s decision and belongs to one call, or a row focus
      // arriving from a stale handler would move focus without a keystroke.
      if (stored.at !== "liveBlock") return;
      // **Moving between rows leaves interaction**, which is the two-level
      // escape read from the other end: a mode belongs to the element it was
      // entered on, and carrying it to the next row would make `↓` mean
      // something different depending on how the reader arrived.
      stored = Object.freeze({ at: "liveBlock", element, mode: "navigate" });
    },
    setMode(mode) {
      if (stored.at !== "liveBlock") return;
      stored = Object.freeze({ at: "liveBlock", element: stored.element, mode });
    },
  };
}
