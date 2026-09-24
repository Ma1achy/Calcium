/**
 * Derived focus, and the one stored location.
 *
 * C16 §3 — see spec.
 *
 * **`activeTarget` is the only ordering in this component.** C16 §5's Ctrl-C
 * ladder is documentation of behaviour derived from it, not a second list: its
 * rungs are handlers registered on these targets, so the ladder cannot hold an
 * order of its own to disagree with. The disagreement C16's spec pass found —
 * native selection above both overlay rungs, against A02 §2 — was possible only because
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
  overlayTop: Readonly<{ kind: "overlay" | "panel" }> | null;
  nativeSelection: boolean;
  /**
   * Semantic copy mode is up (C14 §6a, I50).
   *
   * **Two booleans rather than one three-valued field**, and the reason is that
   * they are two facts rather than one with three settings: the handoff is a
   * statement about the terminal's mouse and this is a statement about the
   * app's own selection. A terminal cannot be in both, but nothing here is what
   * makes that true — the entry rows are, because neither resolves once
   * `activeTarget` answers the other. A union here would encode the exclusion in
   * the type and put the guard in two places.
   */
  semanticSelection: boolean;
  /**
   * A child process holds the terminal (§103, R-OWN-002).
   *
   * Read from the same fact the Ctrl-C ladder reads — `inFlight() === "shell"` —
   * rather than from a second source, because two answers to *is a child
   * attached* is the disagreement this component has paid for before.
   */
  attachedChild: boolean;
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
  // **The child is the top rung** (§103, R-OWN-002): *the CHILD · an attached PTY
  // · takes all but host.detach ⌃] · leaves by host escape.* Above a question,
  // because a child that has the terminal cannot be interrupted by something the
  // host drew over it.
  "child",
  "overlay",
  "nativeSelection",
  // **The second target at `copy`** (I50, C14 §6a). Beside `nativeSelection`
  // rather than at a rung of its own: `RUNG_OF` maps both here, and the pair
  // differs only in what `escape` does.
  "semanticSelection",
  // **A ninth target at an existing rung** (§2c, R-BLK-109). `RUNG_OF` maps it
  // to `substate`. It stood beside `pushedView`, which is what "targets are not
  // rungs" bought — two targets at one rung, separate because their `escape`
  // rows disagreed. The view went with R-EXA-082 (F1254) and the mapping is
  // still many-to-one; `prompt` and `liveBlock` below share `scope`.
  "panel",
  // **Above `prompt` and below every layer** (C26 I2). A block being interacted
  // with outranks the prompt, which is the whole of the navigation/interaction
  // split; it does not outrank an overlay that must be answered, or native selection,
  // which takes every key.
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
 * **Every layer row reads the top and nothing else**, and that is worth saying
 * because the obvious reading is that each needs its own *is one of these open*
 * input. The stack is ordered, so a layer is reachable as the top exactly when
 * nothing above it is open — and when something is, the earlier row wins anyway.
 * A second input per kind would be a thing that can disagree with the one beside
 * it. (The rule was written for `pushedView`, which R-EXA-082 retired; it is the
 * panel's and the overlay's now.)
 */
export function activeTarget(deps: FocusInputs): FocusTarget {
  if (deps.attachedChild) return "child";
  if (deps.overlayTop?.kind === "overlay") return "overlay";
  if (deps.nativeSelection) return "nativeSelection";
  // **The same rung, and the order between them decides nothing** (I50). Both
  // map to `copy`, and the two cannot be up at once because each mode's entry
  // rows stop resolving once `activeTarget` answers the other. So this line's
  // position relative to the one above is not a priority ruling — there is no
  // state in which both are true for it to rule on.
  if (deps.semanticSelection) return "semanticSelection";
  // **A panel is a SUBSTATE and not a question** (§2c, R-BLK-109, R-BLK-866).
  // *FIND and COMPLETION are PROMPT SUBSTATES — the prompt, relabelled*, and
  // *a command palette is a PANEL whose list is a ladder*. So a panel takes the
  // `substate` rung: the mapping M5 wrote down and could not express while a
  // completion menu was an `overlay` and therefore a question. It sits below
  // `nativeSelection` because a frozen screen outranks a thing you opened on top of a
  // live one.
  if (deps.overlayTop?.kind === "panel") return "panel";
  // **Before the `prompt` row, and gated on the live entry** (C26 I2). The mode
  // is stored, so it can outlive the entry that was being interacted with —
  // freezing is a mode exit nobody signals (C26 §8a trace, the live-block
  // freeze), and answering `interaction` for an entry that is no longer live
  // would hand every key to a block the reader cannot act on.
  //
  // **The liveness gate is withdrawn** (C26 I2, §8b.9, §102, `R-INT-005`). It
  // read `deps.liveEntry !== null && deps.stored.entryId === deps.liveEntry.id`,
  // on §4g row d's ground that A01 D4 withdraws a block's keys on freeze so a
  // settled entry has nothing to interact with. §102's heading is *VIEW STATE IS
  // NOT LIVENESS* and its starred line answers it: *A 3D PLOT IS INTERACTIVE
  // BECAUSE IT HAS A CAMERA, not because it is live. Settled an hour ago, from a
  // call that finished — it STILL ORBITS.* The row was right about D4 and wrong
  // about what D4 withdraws — the adapter's bindings, not the camera the block
  // declared, which lives in `Cameras` per entry and survives the freeze.
  //
  // **And the mode cannot arrive here by drift**: `focusRow` clears it on every
  // move between rows, so the one way in is `⏎` on an element declaring view
  // state (C26 I26).
  if (deps.stored.at === "liveBlock" && deps.stored.mode === "interact") {
    return "interaction";
  }
  if (deps.stored.at === "prompt") return "prompt";
  // **The transcript is the owner whether or not anything is live** (R-COR-002,
  // C16 §3a W1). This row read `if (deps.liveEntry !== null) return "liveBlock"`,
  // and the `null` arm fell through to `global` — so with focus stored in the
  // transcript the owner was `global` while nothing ran and `liveBlock` the
  // moment an entry appeared. **A content arrival moved the keyboard's owner**,
  // which is the one thing R-COR-002 forbids: *a render event may change drawing
  // but never keyboard ownership.*
  //
  // Measured rather than reasoned: the two calls differ on `liveEntry` alone and
  // return different targets. It was invisible to every existing row because each
  // asserts the owner for a *state*, and this is a property of a *transition* —
  // the sequence trace's job, and the ladder had no trace until M5.
  //
  // `interaction` above still needs the live entry, and that gate is untouched:
  // being *inside* a block is a thing you cannot be once it has settled, where
  // *standing in the transcript* is not. One rung, `scope`, either way.
  return "liveBlock";
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
 * The selection's extent — the head and every element between it and the
 * anchor, inclusive (C26 I16, §5c trace 3).
 *
 * **The head goes through `resolveFocus`; the anchor does not.** A stale head is
 * where focus *is* — it falls as I10 says and is highlighted there. I10's fall
 * lands on the block's first element, which for an anchor widened a selection to
 * rows the reader never chose (anchor `b1` gone → `a1..c1` copied, F764,
 * measured). The list is the new one and the anchor's old position went with
 * it, so an exact match is the only honest answer and a stale anchor collapses
 * to the head.
 *
 * **One function for the render side and the key side, on `resolveFocus`'s own
 * argument.** `focusFor` washes the extent and `copyElement` copies it; the same
 * eight lines sat in both files, each with a comment pointing at the other,
 * which is C26 §8b.4's hazard — two instances read as a pair and part the first
 * time one is edited. `extent` always holds the head, so an extent of one is
 * *no selection*: the store's `anchor === element` sentinel, one step resolved.
 *
 * `null` exactly when `resolveFocus` is — the list is empty.
 */
export function extentOf<P extends PlacedElement>(
  stored: Readonly<{ element: ElementAddress | null; anchor: ElementAddress | null }>,
  elements: readonly P[],
): Readonly<{ head: P; extent: readonly P[] }> | null {
  const head = resolveFocus(stored.element, elements);
  if (head === null) return null;
  const headElement = elements[head];
  if (headElement === undefined) return null;
  const anchorAt = stored.anchor;
  const exact =
    anchorAt === null
      ? -1
      : elements.findIndex((p) => p.blockId === anchorAt.blockId && p.element.id === anchorAt.elementId);
  const anchor = exact === -1 ? head : exact;
  return Object.freeze({
    head: headElement,
    extent: Object.freeze(elements.slice(Math.min(anchor, head), Math.max(anchor, head) + 1)), // graphemes-ok: element indices, not text
  });
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
  /**
   * `↓` from the prompt, into `entryId` — the live entry, from that key. `null`
   * means "the block, no element yet".
   */
  enterLiveBlock(entryId: string, element: ElementAddress | null): void;

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
  /**
   * Movement to an element in `entryId`; a no-op at the prompt. Collapses a
   * selection.
   *
   * **The entry comes in with every move, and it is the resolved one** (C26
   * I22). `focusedEntryId()` answers the live entry when the stored one was
   * evicted, so a move that kept `stored.entryId` would leave the store pointing
   * at an entry that no longer exists while the highlight sat on the live one —
   * the half-repaired store I10 says the next keystroke must not leave. `tab`
   * and `⇧tab` are this call with a different entry (C26 I21): a move is a move,
   * and one rule drops the anchor and the mode for both.
   */
  focusRow(entryId: string, element: ElementAddress | null): void;
  /**
   * The same movement with the anchor held (C26 §5c).
   *
   * **The entry is the callers' to keep, and this trusts them.** This used to
   * carry an entry-changed arm that dropped the anchor — eviction's case — and
   * it was the defect (F764): after an eviction the first `⇧↓` arrived with the
   * live entry, the arm fired, and the reader's first extension selected
   * nothing. `keys.ts` now repairs the store through `focusRow` before it
   * extends, and `pointerEffect` extends only inside the focused entry, so no
   * caller reaches here with a changed entry and the arm had become a sentence.
   * An arm nothing reaches is removed rather than kept as a guard.
   */
  extendRow(entryId: string, element: ElementAddress | null): void;
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
    enterLiveBlock(entryId, element) {
      // Entry is always into navigation. Landing in interaction would give the
      // block every key before the reader has seen where focus went.
      stored = Object.freeze({ at: "liveBlock", entryId, element, anchor: null, mode: "navigate" });
    },
    toPrompt() {
      stored = AT_PROMPT;
    },
    focusRow(entryId, element) {
      // Deliberately a no-op at the prompt rather than a way in. Entering the
      // live block is `↓`'s decision and belongs to one call, or a row focus
      // arriving from a stale handler would move focus without a keystroke.
      if (stored.at !== "liveBlock") return;
      // **Moving between rows leaves interaction**, which is the two-level
      // escape read from the other end: a mode belongs to the element it was
      // entered on, and carrying it to the next row would make `↓` mean
      // something different depending on how the reader arrived.
      //
      // **And it collapses the selection** (C26 §5c), which is C17 I21's rule
      // one level up: an unshifted motion drops the region, so the model stays
      // invisible until someone holds Shift.
      stored = Object.freeze({ at: "liveBlock", entryId, element, anchor: null, mode: "navigate" });
    },

    /**
     * `⇧↑`/`⇧↓` — move the head and leave the anchor (C26 §5c).
     *
     * The anchor is placed on the **first** extension and never touched again.
     * A version that moved the anchor instead is right on the first keystroke
     * and wrong on the second, which is the defect C17 §5b's shape was built
     * against and it is the same defect here.
     *
     * A no-op at the prompt, for `focusRow`'s reason.
     */
    extendRow(entryId, element) {
      if (stored.at !== "liveBlock") return;
      stored = Object.freeze({
        at: "liveBlock",
        entryId,
        element,
        anchor: stored.anchor ?? stored.element,
        mode: "navigate",
      });
    },
    setMode(mode) {
      if (stored.at !== "liveBlock") return;
      stored = Object.freeze({
        at: "liveBlock",
        entryId: stored.entryId,
        element: stored.element,
        anchor: stored.anchor,
        mode,
      });
    },
  };
}
