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
      /**
       * The entry focus is in (C26 I21, §4g).
       *
       * **On the location and not on the address**, because the entry is the
       * outer scope the element sits in (C26 §3, `entry → block → row → cell`)
       * rather than a third half of the element's name — and `element: null`,
       * *in the block on no element yet*, needs an entry to be in, which an
       * address cannot carry. The `anchor` shares this entry by construction:
       * a selection is extended within one entry's list and cannot straddle two.
       *
       * Until this member existed every reader of focus read `liveId` instead,
       * and the three places that would have had to agree about *which entry*
       * all agreed on the same constant — which is why the address never
       * carried one. The target keeps its name: `liveBlock` is now *a transcript
       * block*, and the word is historical.
       */
      entryId: string;
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
  | Readonly<{
      kind: "key";
      key: Key;
      /**
       * The kitty keyboard protocol's event type, when the sequence carried
       * one (C16 §2, C02 I12). **Optional and absent under legacy reporting**,
       * so every consumer that ignores it is unchanged and every `toEqual`
       * record written before it exists unchanged. Nothing may be reachable
       * only through it — A03 SS55 is the rule and it is vacuous today.
       */
      event?: "press" | "repeat" | "release";
    }>
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{
      kind: "mouse";
      /** 0-based terminal row and column. */
      row: number;
      col: number;
      /**
       * SGR 1006's `Cb` bits 0–1, 6 and 7 (C16 §2's table, I30). `button0`–`2`
       * are the three buttons, `button8`–`11` the 128-range, and the wheel's
       * four directions are named because bits 0–1 select them.
       */
      button: `button${number}` | "wheelUp" | "wheelDown" | "wheelLeft" | "wheelRight";
      /** The final byte: `M` is a press or a motion report, `m` the release. */
      press: boolean;
      /** Bits 4, 8 and 16 — carried, never interpreted here (I30). */
      shift: boolean;
      meta: boolean;
      ctrl: boolean;
      /** Bit 32 — a mode-1002 drag report; `press: true, motion: true` is not a second click. */
      motion: boolean;
    }>;

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
  // **Every element the focused entry declares** (C26 §5c, I16) — anchor on
  // the first, head on the last, and never across an entry: the list is the
  // focused entry's, so the copy cannot depend on what lies between two.
  // `⌃a` at `liveBlock`; the prompt's `⌃a` is `home` and the editor's
  // select-all is `⌥a` (`selectAll` above), which is why this is a second name.
  | "selectAllElements"
  // --- focus (I22) ---------------------------------------------------------
  //
  // `↓` enters through `historyNext`'s second clause rather than an action of
  // its own: one binding, two effects, in order. These three are the way back
  // and the movement between rows.
  | "focusPrompt"
  | "rowUp"
  | "rowDown"
  // --- between entries (C26 I21, §4g) ----------------------------------------
  //
  // **The only two keys that change which entry focus is in.** `↑`/`↓` step
  // within the focused entry and its edge stops them (C26 I19); these step the
  // outer scope, landing on the target entry's first element. `tab` was free at
  // `liveBlock` and `⇧tab`'s wire form `CSI Z` was not decoded until this row
  // needed it — added rather than assumed, because T2.13 walks every row here
  // through the real decoder (I17).
  | "entryPrev"
  | "entryNext"
  // --- the horizontal pair (C12 §3s, C22 I76) --------------------------------
  //
  // `←`/`→` at `liveBlock`. The vertical pair steps elements and the horizontal
  // one had no subject: both fell through to nothing, because `liveBlock`'s
  // handler resolves the table and step 3 binds no arrow. A focused plot moves
  // its crosshair; a kind with no horizontal interior is a no-op, which is the
  // camera family's precedent (C22 I75) and the cost of binding before every
  // consumer exists. A table's column cursor is the second consumer (C26 §11).
  | "cursorLeft"
  | "cursorRight"
  // --- re-run the focused entry (C23 I18) ------------------------------------
  //
  // **Not an action kind.** The five `Action` kinds fire against a document's
  // data and are refused from a frozen entry (A01 D5); this fires the entry's
  // **recorded command** through C23 §2's submit, which is the one thing a
  // settled entry holds that is not stale. Both consumers C23 I18 names — a
  // notebook's *re-run this cell* and an agent harness's *retry that tool call*
  // — are this key on a settled entry.
  | "rerunEntry"
  | "orbitLeft"
  | "orbitRight"
  | "tiltDown"
  | "tiltUp"
  | "dollyIn"
  | "dollyOut"
  | "cameraReset"
  | "orbitToggle"
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
  // **Entry and exit, and the exit is the target's own dismissal** (C16 §5c,
  // 2026-09-05). This read *the exit is §5's rung and not an action* for as long
  // as `⌃c` was the only way out — and measured, `Esc` in copy mode was dropped
  // silently on a frozen screen. A `copyMode`-target row has no order of its own:
  // it resolves at the moment `activeTarget` answers `copyMode`, exactly as the
  // rung does, so I24's objection to a *second mechanism* was true of a `global`
  // row and not of this one. `⌃c` stays the ladder's; `pushedView` has the same
  // pair (`viewPop` and the rung).
  //
  // A mode with entry and no exit is B1; a mode with an exit and no entry is
  // the same defect inverted, and just as testable.
  | "enterCopyMode"
  | "exitCopyMode";

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
