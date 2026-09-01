/**
 * The router's vocabulary.
 *
 * C16 §2 — see spec. Types only; decoding is `decode.ts`.
 *
 * C16 imports nothing from `terminal/` (I13, MG14). Raw mode is C01's and the
 * bytes arrive as data, so nothing here names a file descriptor or a stream.
 */

export type Key = Readonly<{
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /** The raw bytes, for diagnostics. */
  sequence: string;
}>;

/**
 * A02 Seam 3. Array order in `focus.ts`'s `FOCUS_ORDER` is the priority; this is
 * the union that order is exhaustive over.
 */
export type FocusTarget =
  | "overlay"
  | "copyMode"
  | "pushedView"
  /**
   * C26 I2 — interaction mode, and it is **a target rather than a flag**.
   *
   * The block owns its keys while the reader is inside it, and the prompt does
   * not compete: key collision solved structurally rather than per key.
   *
   * **It is here, in the union, because of what the alternative does to the
   * ladder.** C16 §5's rungs 3–7 are handlers registered on these targets, so
   * their order *is* `FOCUS_ORDER`'s and the two cannot disagree. A mode
   * consulted *before* dispatch would be a second priority list, and the ladder
   * would acquire an order of its own again — which is the artefact whose
   * existence produced the copy-mode-above-overlay contradiction against
   * A02 §2. C26 §8a trace 5 is where that was found, and it is the strongest
   * constraint the walk placed on this component's shape.
   */
  | "interaction"
  | "prompt"
  | "liveBlock"
  | "global";

/**
 * Where focus is, as a thing that can be resolved (C26 I10, §8b.7).
 *
 * **`FocusState` in C09 was already this shape**, `{blockId, rowId}`, because a
 * block has to be told whether the focus it is handed is its own (C11 I14). The
 * store held only the second half and `session.ts` re-derived the first by taking
 * the **first** element whose id matched — so two tables each carrying `r1` gave
 * `↓` onto the second's row, the highlight on the first's, and the next `↓`
 * continuing from the first's position.
 *
 * **The defect was never that ids collide.** C04 I31 makes a row id unique within
 * its table and says nothing across blocks, so two tables sharing `r1` are
 * well-formed. It was that one type was the address and the other was half of it,
 * joined by a search — and the remedy is that the stored form stops being
 * narrower than the form it is rendered as, not a uniqueness rule anywhere.
 *
 * Unique with no new rule: C04 I14 makes block ids unique across the document,
 * nested children included, and C26 I6 makes element ids unique within a block's
 * own declaration.
 *
 * **`elementId` rather than `id`, because A03 MG24 matches published members by
 * *name*** — so `blockId` here would be satisfied by any of `FocusState.blockId`'s
 * readers and the rule could say nothing about it, while `elementId` is a name
 * nothing else carries.
 *
 * **The reasoning is right and it guaranteed nothing until this declaration was
 * reformatted, which was measured rather than assumed.** Written on one line —
 * `Readonly<{ blockId: string; elementId: string }>` — a fabricated unconsumed
 * member passes `make enforce` clean, in the `export interface` form too.
 * **MG24's member walk only sees a multi-line declaration**, so the line shape
 * decides whether a published type is watched at all. Broken across lines it
 * fires, which is why it is written this way and must stay so. FINDINGS F159.
 *
 * The naming argument stands and is kept; the sentence that used to follow it —
 * *therefore this member is checked* — did not, and a correct justification
 * attached to a guarantee nobody verified is F84's shape one rule over.
 */
export type ElementAddress = Readonly<{
  blockId: string;
  elementId: string;
}>;

/**
 * The one stored piece of focus state (C16 §3, I1).
 *
 * A *location*, not a bit — which row holds focus inside the live block is part
 * of the same fact and has no separate owner.
 */
export type StoredFocus =
  | Readonly<{ at: "prompt" }>
  /**
   * `mode` rides on the location rather than beside it (C26 I2).
   *
   * A second field would be a second thing to keep in step, and the two cannot
   * disagree if there is only one value: *which row, and whether its keys are
   * ours or the block's* is one fact, exactly as *which row* was already part
   * of *where focus is* rather than a separate owner.
   *
   * **`"navigate"` is the only mode reachable until a kind declares
   * `elements`** (C26 §5), and that is said here rather than left implicit: an
   * invariant about interaction mode holds trivially while nothing can enter
   * it, and the day something can is the day it is first tested for real.
   */
  | Readonly<{
      at: "liveBlock";
      /** `null` — in the block, on no element yet. */
      element: ElementAddress | null;
      /**
       * The other end of an element selection, or `null` (C26 §5c).
       *
       * **The same shape as C17's, one level up**: the *head* is `element`
       * itself rather than a second position, so there is one record of where
       * focus is and the anchor is the only new state. `anchor === element` is
       * no selection, exactly as `anchor === head` is in the editor.
       *
       * One mechanism, two shapes: a character range in the prompt, a set of
       * addresses here, and one clipboard under both (C17 §5a).
       */
      anchor: ElementAddress | null;
      mode: "navigate" | "interact";
    }>;

export type InputEvent =
  | Readonly<{ kind: "key"; key: Key }>
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{ kind: "mouse"; row: number; col: number; button: string; press: boolean }>;

/**
 * A binding, declaratively (C16 §6).
 *
 * Data because Phase 1B adds user-defined bindings, and because `/help` renders
 * from this table — a keymap expressed as conditionals cannot be overridden,
 * listed, or shown.
 */
/**
 * The built-in action names, closed (I19).
 *
 * **Closed is what makes `/help` honest.** C16 executes none of these — the
 * effect table is L4's, in `shell/keys.ts` — and until that table existed every
 * one of them was a name `/help` rendered and nothing dispatched. A union plus a
 * total `Record` makes both halves of that unconstructible: a binding naming an
 * action nobody implements does not compile, and neither does an implementation
 * of an action nobody binds.
 *
 * A `BlockKeymap`'s action stays an open `string` (below). A surface supplies
 * both the binding and the handler, through C23 §3a, so there is nothing here to
 * agree with it.
 */
export type KeyAction =
  | "insertNewline"
  | "complete"
  | "acceptGhostOrForward"
  | "menuNext"
  | "menuPrev"
  | "menuAccept"
  | "dismiss"
  | "historyPrev"
  | "historyNext"
  | "reverseSearch"
  | "searchOlder"
  // --- C17, and the vocabulary is C17's own surface (I21) ------------------
  //
  // Every editing operation the editor exposes has an action here and every
  // action names exactly one of them, so the union is derivable from the
  // interface rather than maintained beside it. Until these existed the prompt
  // had eight bindings and none of them edited: the effect table was total, the
  // union was incomplete, and backspace did nothing at a real prompt.
  //
  | "backspace"
  | "delete"
  | "killWordLeft"
  | "killWordRight"
  | "killToStart"
  | "killToEnd"
  | "yank"
  | "undo"
  | "redo"
  | "wordLeft"
  | "wordRight"
  | "home"
  | "end"
  | "left"
  // --- selection (C17 §5b, I21) --------------------------------------------
  //
  // **Every motion twice**, and the second half is the first with the anchor
  // held. They are separate actions rather than a modifier on the existing
  // rows because the keymap resolves `(target, key)` to one action — a
  // "shifted" flag on an action would be a second dispatch mechanism beside
  // the one C16 I19 commits to.
  //
  // `extendLineStart`/`extendLineEnd` are `⇧Home`/`⇧End` and **not**
  // `⇧⌃a`/`⇧⌃e`: ctrl+shift+letter is the same `0x01` that killed `⌃⇧a` for
  // select-all, which is two more bindings T2.13 has cost.
  | "extendCharLeft"
  | "extendCharRight"
  | "extendWordLeft"
  | "extendWordRight"
  | "extendLineStart"
  | "extendLineEnd"
  | "selectAll"
  // **Copy, and there is one clipboard** (C17 §5a). `⌥w` writes the kill
  // buffer that `⌃k` writes and `⌃y` reads — the emacs pairing readline users
  // already have, and the one key that does not collide with `⌃c`'s cancel.
  | "copySelection"
  // --- the transcript's selection (C26 §5c) ---------------------------------
  //
  // **`liveBlock` only, never `interaction`** (C16 §5a row A4). A block's
  // declared keys are an open set (C26 I14), so a framework binding inside
  // interaction silently shadows one — and the two are separate targets, so the
  // rule is structural rather than remembered.
  //
  // One mechanism, two shapes: `extendRowUp`/`extendRowDown` are `rowUp`/
  // `rowDown` with the anchor held, exactly as C17's extending motions are its
  // ordinary ones.
  | "extendRowUp"
  | "extendRowDown"
  | "copyElement"
  // --- focus (I22) ---------------------------------------------------------
  //
  // `↓` enters through `historyNext`'s second clause rather than an action of
  // its own: one binding, two effects, in order. These three are the way back
  // and the movement between rows.
  | "focusPrompt"
  | "rowUp"
  | "rowDown"
  | "orbitLeft"
  | "orbitRight"
  | "blockPageDown"
  | "blockPageUp"
  // `enter` on a focused row, and the union's gap was the whole of F21: a row
  // could be moved to and not acted on. `actions.ts` implements all five arms
  // and nothing in `src/` reached it, so an app could declare a `view` action,
  // have C04 validate it and C09 render its label, and no keystroke would ever
  // arrive. Entry with no exit was already a binding (I22); entry with no
  // *effect* was not, and reads the same from the table.
  | "rowActivate"
  // --- scrolling (I23) -----------------------------------------------------
  //
  // C14's four operations, named here because every key that scrolls is a
  // binding. They were read out of an `InputEvent` in a `switch` in L4, which
  // is the inverse of the defect I19 prevents: a key that works and that
  // `/help` cannot render, because `/help` renders from the table. Two of the
  // four were reachable by nothing at all, and looked exactly like the two that
  // were not.
  //
  // The wheel has no action here. It is not a key and has no `(target, key)` to
  // resolve on, so it stays in the handler — the boundary rather than an
  // exception to it.
  | "scrollPageUp"
  | "scrollPageDown"
  | "scrollTop"
  | "scrollBottom"
  // --- the pushed view (I24) -----------------------------------------------
  //
  // `pushedView` has been in `FocusTarget` since C16 was written and had no
  // binding anywhere: `activeTarget` resolved to a target with an empty handler
  // set and every key fell through to step 3. Vacuous only for as long as
  // nothing pushed a view, which is the same shape as `frameworkSources` and as
  // the editing bindings above.
  //
  // `viewPop` is `Esc`, and it is **not** §5's Ctrl-C rung under another name:
  // that rung is cancellation and this is the view's own dismissal (A01 D7).
  //
  | "viewNextHunk"
  | "viewPrevHunk"
  | "viewTop"
  | "viewBottom"
  | "viewPageUp"
  | "viewPageDown"
  | "viewPop"
  // --- copy mode (C16 §5b) -------------------------------------------------
  //
  // **Entry only. The exit is §5's rung and not an action**, because leaving is
  // `⌃c` and `⌃c` resolves on the ladder rather than in this table — the same
  // split every other target has. An `exitCopyMode` row here would be a second
  // way out with an order of its own, which is what makes copy mode a target
  // rather than a mode in the first place.
  //
  // A mode with entry and no exit is B1; a mode with an exit and no entry is
  // the same defect inverted, and just as testable.
  | "enterCopyMode";

export type Binding = Readonly<{
  target: FocusTarget;
  key: Readonly<{ name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }>;
  action: string;
}>;

/** A built-in row: a `Binding` whose action is one L4 implements (I19). */
export type BuiltinBinding = Binding & Readonly<{ action: KeyAction }>;

/** What an adapter attaches to a block; C16 merges it into `liveBlock` while live. */
export type BlockKeymap = readonly Readonly<{
  key: Binding["key"];
  action: string;
}>[];

/**
 * What the decoder needs to know about the terminal, as data.
 *
 * A subset of C02's record rather than the record itself: the decoder branches
 * on exactly these two, and taking the whole thing would let a later edit reach
 * for a third without anyone noticing it had grown a dependency.
 */
export type DecodeCapabilities = Readonly<{
  bracketedPaste: boolean;
  mouse: boolean;
}>;

export type DecoderOptions = Readonly<{
  capabilities: DecodeCapabilities;
  /** Injected; C16 reads no ambient clock (I9). */
  now: () => number;
}>;

/**
 * Bytes in, events out.
 *
 * `push` and `poll` both return everything that has become decidable, which is
 * why neither takes a callback: a decoder that emitted through a callback would
 * make "what did these bytes produce" a question about call order rather than
 * about a return value, and every table in §7 is written as input → output.
 *
 * `nextDeadline` exists because three of this component's rules are timeouts and
 * **the decoder owns no timer** — it reports when it would next have something to
 * say and the caller arranges the wake-up. That is what keeps I9 true of the
 * decoder rather than of a scheduler it holds.
 */
export interface Decoder {
  push(chunk: Uint8Array): readonly InputEvent[];
  poll(): readonly InputEvent[];
  /**
   * Discard every partially-decoded state, emitting nothing (I18).
   *
   * For the one gap in the byte stream that is not a slow link: a suspension,
   * whose bytes went to a child. The decoder cannot tell the two apart — that
   * is what makes this a call rather than a rule — so L4 makes it on resume.
   */
  reset(): void;
  /** Absolute time, on the injected clock. `null` when nothing is pending. */
  nextDeadline(): number | null;
}
