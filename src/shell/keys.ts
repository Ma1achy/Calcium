/**
 * C22 §3 step 11 — what a bound key actually does.
 *
 * C16 §6 — see spec. C16 names actions and executes none (C16 I19): resolving
 * `historyPrev` into a call on C20 would put L3's router in charge of L3's
 * history store and L2's overlay stack, which is the reaching A02 Seam 4 exists
 * to prevent. So the names live there and the effects live here.
 *
 * **This is not `actions.ts`.** That file is C23's block-action dispatch — the
 * `↑ promote` on a table row, arriving from a far-side envelope — and it shares
 * only the word. Each names the other so the collision is visible to whoever
 * next thinks the two should be one file.
 *
 * **Total over `KeyAction`, and that is the whole mechanism** (C22 I26). Until
 * this table existed, every one of C16's fourteen bindings was a name `/help`
 * rendered and nothing dispatched — the anti-drift claim was "help renders from
 * the table dispatch uses", and it was vacuous in the direction nobody checked.
 * A `Record<KeyAction, …>` makes both halves unconstructible: an action nobody
 * implements does not compile, and neither does an implementation nobody binds.
 */

import {
  accept,
  contextAt,
  menuLayer,
  menuRowsShown,
  remainderOf,
  MENU_ID,
  SPINNER_MS,
} from "../interaction/completion/index.js";
import { SEARCH_ID } from "../interaction/history/index.js";
import type {
  Candidate,
  CompletionContext,
  CompletionEngine,
} from "../interaction/completion/index.js";
import type { LineEditor } from "../interaction/editor/index.js";
import type { HistoryStore } from "../interaction/history/index.js";
import type { ElementAddress, KeyAction } from "../interaction/router/types.js";
import { resolveFocus } from "../interaction/router/focus.js";
import type { Action } from "../data/viewmodel/index.js";
import type { NavElement } from "../presentation/blocks/index.js";
import type { EntryId } from "../viewport/transcript/index.js";
import type { Manifest } from "../data/manifest/index.js";
import type { OverlayManager } from "../viewport/overlay/index.js";
import type { FocusStore } from "../interaction/router/focus.js";
import type { DocumentView, DocumentViewMotion } from "./document-view.js";
import type { PatchView, PatchViewMotion } from "./patch-view.js";

/** The prompt's own extent, for anchoring (C19 §6, C20 §5). */
export type PromptAnchor = Readonly<{ row: number; rows: number }>;

export type KeyDeps = Readonly<{
  editor: LineEditor;
  completion: CompletionEngine;
  overlays: OverlayManager;
  history: HistoryStore;
  /**
   * C14, for the four scroll actions (C16 I23).
   *
   * Narrowed to what they call rather than taking the store: the effects move
   * the viewport and commit nothing, and a wider type here would let one of
   * them reach `resize`, whose height is the composed region's and the frame's
   * to set (C22 I34).
   */
  viewport: Readonly<{
    pageUp(): void;
    pageDown(): void;
    scrollToTop(): void;
    scrollToBottom(): void;
  }>;
  manifest: Manifest | null;
  /** Where the prompt sits, from the composed frame rather than a fresh read. */
  anchor: () => PromptAnchor;
  /** How big a layer may be (C15 `Region`), for the menu's "… n more". */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  /** C16's stored focus — the one piece of it in the system (C16 §3). */
  focus: FocusStore;
  /**
   * Enter copy mode (C16 §5b, C03 §4a).
   *
   * **The entry half only, and the exit is deliberately not here.** Leaving is
   * `⌃c` on the ladder's copy-mode rung, which already calls `exitCopyMode` —
   * so a matching effect in this table would be a second exit with an order of
   * its own. The pair still ships together; they just do not ship *here*
   * together.
   */
  enterCopyMode: () => void;
  /**
   * The fullscreen patch view (C25 §3b, C22 I41).
   *
   * Named here rather than reached through `overlays`, because the motions are
   * the view's own arithmetic over one offset and C16 executes no action itself
   * (I19). The seven `view*` entries below are what makes `pushedView` a target
   * with a vocabulary rather than a name in a union.
   */
  patchView: PatchView;
  /**
   * C22 §13a's view. One target, two owners — C15 I1 allows one view at a time,
   * so at most one of these is open and the keymap needs no third target.
   */
  documentView: DocumentView;
  /** C22 I46 — the pop releases the view's parts, rather than a later fetch doing it. */
  releaseView: () => void;
  /**
   * Every navigable element in the live entry, addressed and in reading order,
   * or empty (C16 I22, C26 §5).
   *
   * C16 holds no opinion about what a row is, so whether a block is navigable is
   * answered from the block (C11 I14). Empty is what makes `↓` a no-op over a
   * notice rather than focus landing somewhere with nothing in it.
   *
   * **One function where there were two, and the second one's reason was already
   * false** (C26 §8b.7). `liveRowAction` was separate *"because `liveRows` is
   * asked on every arrow keystroke and this only on `enter`"* — while its body
   * called the same full registry walk, and had done since the three walks
   * collapsed into one. Both had to become address-shaped anyway, and one pull
   * answering both questions is what stops a second answer to *what is here*
   * existing at all.
   *
   * The element carries its own `activate` (C26 §5), so the *first action* rule
   * this used to apply lives in the kind that declares the element rather than
   * here: C04 I19 makes `fill` the default kind, so a well-formed row's first
   * action is the one `enter` should do, and `tableElements` is where that is
   * now decided. Most elements have none — navigating to read is worth doing on
   * its own.
   */
  liveElements: () => readonly PlacedNavElement[];
  /** The entry those elements belong to, for an action's origin (C23 I37). */
  liveEntryId: () => EntryId | null;
  /**
   * C23's dispatcher (C23 I16). Supplied, never constructed here — an action is
   * a submission by another route, and L4's routing component owns routes.
   */
  onAction: (action: Action, from: EntryId | null) => void;
  /**
   * Commit a frame for something that settled after its batch (C22 I31).
   *
   * The keystroke's own commit is the read loop's (I27) and covers the
   * synchronous effects of dispatch. A completion source is fire-and-forget by
   * design — input is never blocked on a fetch (I18) — so the menu is pushed by
   * a continuation running after that commit, and nothing composes a frame from
   * it. The layer is on the stack and the screen has never heard of it, until
   * the next key happens to draw one.
   */
  redraw: () => void;
  /**
   * A one-shot wake, for the spinner's threshold (C22 I38).
   *
   * C22's injected scheduler rather than a timer of this file's own: A03 bans
   * a clock outside `shell/session.ts` and C16's decoder already reports its
   * deadlines rather than firing them. The same shape one layer up.
   */
  schedule: (fn: () => void, ms: number) => Disposable;
}>;

/**
 * An element and the block that declared it — C09's `elementsIn` pairing (C26 §5).
 *
 * The pair is the address: `blockId` from here and `element.id` from the element
 * are exactly what `StoredFocus` stores, so nothing has to be joined by a search.
 */
export type PlacedNavElement = Readonly<{
  // Broken across lines deliberately: MG24's member walk does not see a
  // single-line declaration, so the line shape decides whether these two members
  // are watched at all (FINDINGS F159).
  blockId: string;
  element: NavElement;
}>;

/** The address of a placed element. One expression, so no call site spells it. */
const addressOf = (p: PlacedNavElement): ElementAddress =>
  Object.freeze({ blockId: p.blockId, elementId: p.element.id });

/** What a bound key does. Returns nothing: the loop commits (C22 I27). */
export type KeyEffect = () => void;

export interface KeyEffects {
  readonly table: Readonly<Record<KeyAction, KeyEffect>>;
  /**
   * The menu's selected row, or `null` while it is a display (C19 I20).
   *
   * Read by the composition root to decide precedence, not only by tests: a
   * menu holding no selection lets the prompt's bindings resolve first, which
   * is how `Enter` still submits under a menu nobody asked for.
   */
  readonly selected: number | null;
  /**
   * The buffer changed by typing — recompute the as-you-type menu (C19 §6a).
   *
   * Called by the composition root after a printable key or a paste, and by the
   * editing effects here. Static sources only: this path never runs a dynamic
   * source (C19 I3, T2.1a).
   */
  afterEdit(): void;
  /**
   * A character was typed into an open reverse search, or one was deleted
   * (C20 §7, `searchType` / `searchBackspace`).
   *
   * **Here rather than in the keymap for the same reason `afterEdit` is here**:
   * a printable key is not a `KeyAction`, so the composition root is its only
   * caller and a table row could never reach it. C16 I23 forbids a second
   * keymap in the root, not a second entry point for the keys the keymap does
   * not name.
   *
   * `null` is a backspace. One method rather than two because the two differ
   * only in which C20 call they make and share the whole of the layer refresh —
   * `searchEnd` takes its action for the same reason (C20 §7).
   */
  searchTyped(text: string | null): void;
  /** The line went away — close the menu and forget `Esc`'s suppression (C19 I19). */
  reset(): void;
}

/**
 * The table, plus the one piece of state a menu needs.
 *
 * Selection lives here rather than on C15's layer because a layer is content
 * and a placement: C15 places what it is given and holds no cursor. Rebuilding
 * the layer's blocks on each move is what `update` is for.
 */
export function createKeyEffects(deps: KeyDeps): KeyEffects {
  let candidates: readonly Candidate[] = [];
  /** `null` while the menu is a display of what is available (C19 I20). */
  let selected: number | null = null;
  /**
   * Did a `Tab` open this menu (C19 I22)?
   *
   * The one bit that decides what a keystroke does to it. A requested menu may
   * hold candidates no static source can produce, so it is *filtered* by what
   * follows and dismissed by anything that does not extend the prefix —
   * widening it would mean running a dynamic source on a keystroke (C19 I3). A
   * typed menu holds only static candidates, which cost a filter over an array,
   * so it is rebuilt outright and backspace widens it back.
   */
  let requested = false;
  /** The prefix the open menu was built for — "does this keystroke extend it". */
  let builtFor = "";
  let remainder = 0;
  let seq = 0;
  /**
   * Where `Esc` dismissed a typed menu, as the token's start offset (C19 I19).
   *
   * Without it the next character reopens what was just dismissed and `Esc`
   * joins I32's class from the other direction — a key that appears to do
   * nothing. Held per token, so moving on clears it.
   */
  let suppressedAt: number | null = null;

  const ctxNow = (): CompletionContext =>
    contextAt(deps.editor.text, deps.editor.cursor, deps.manifest);

  function redrawMenu(): void {
    if (candidates.length === 0) return;
    deps.overlays.update(MENU_ID, {
      content: menuLayer(candidates, selected, remainder, deps.anchor()).content,
    });
  }

  /**
   * Push it, or update the one already there (C19 I21).
   *
   * C15 throws on a duplicate id, and `complete` over a typed menu is exactly
   * the case that reaches this twice — inside a promise continuation, where the
   * throw is an unhandled rejection with no frame attached to it. `update`
   * answering *whether the layer is on the stack* is the question; asking the
   * top instead is wrong the moment anything sits above it.
   *
   * The placement goes with the content: the prompt grows rows as it is typed
   * into, and an anchor left behind places the menu over the line below it.
   */
  function showMenu(next: readonly Candidate[], sel: number | null, prefix: string): void {
    candidates = next;
    selected = sel;
    builtFor = prefix;
    const layer = menuLayer(candidates, selected, remainder, deps.anchor());
    if (deps.overlays.update(MENU_ID, { content: layer.content, placement: layer.placement })) {
      return;
    }
    remainder = 0;
    deps.overlays.push(menuLayer(candidates, selected, 0, deps.anchor()));
  }

  function hasMenu(): boolean {
    return candidates.length > 0;
  }

  function closeMenu(): void {
    candidates = [];
    selected = null;
    requested = false;
    builtFor = "";
    remainder = 0;
    deps.overlays.dismiss(MENU_ID);
  }

  /**
   * How many the placement could not show (C15 I8).
   *
   * The indicator needs the placement and the placement needs the region — how
   * many candidates fit is a fact about the frame, not about the list — and
   * C15 answers it only once the layer is on the stack, so this is a second
   * pass rather than an argument to the first.
   */
  function countRemainder(): void {
    const placed = deps.overlays.layout(deps.overlayRegion()).find((p) => p.layer.id === MENU_ID);
    // **Rows, not blocks** (C19 I23). `content.length` counts boxes, and the
    // table holding sixty candidates is one of them — so a menu clamped to ten
    // rows used to report fifty-nine missing where fifty are.
    remainder = remainderOf(placed ?? null, candidates.length, menuRowsShown(placed ?? null));
    redrawMenu();
  }

  /** One edit, so one undo unit (C19 I11). */
  function applyEdit(ctx: CompletionContext, candidate: Candidate, whole: boolean): void {
    const edit = accept(ctx, candidate, whole);
    const before = deps.editor.text;
    deps.editor.setText(
      before.slice(0, edit.start) + edit.text + before.slice(edit.end),
      edit.start + edit.text.length,
    );
  }

  function applyCandidate(whole: boolean): void {
    const candidate = selected === null ? undefined : candidates[selected];
    if (candidate === undefined) return;
    applyEdit(ctxNow(), candidate, whole);
    closeMenu();
  }

  /**
   * The as-you-type recompute (C19 §6a, I19, I22).
   *
   * **`suggest`, never `request`** — the whole boundary is this one call. The
   * obvious implementation reaches for the engine's request path, which runs
   * the dynamic sources, and every assertion about the candidate set agrees
   * with both. C19 T2.1a is the row that does not.
   */
  /**
   * Redraw the search overlay after its query or its hit moved (C15 I19).
   *
   * **The cursor goes with the content.** The caret sits at the end of the
   * query and the query is what just changed, so an update carrying only
   * `content` leaves it where the previous keystroke put it — a caret that
   * stops following the text being typed into it.
   *
   * Shared by `searchOlder` and `searchTyped` rather than written twice: they
   * are two ways to move the same overlay, and a second copy is the arm that
   * gets updated alone.
   */
  function refreshSearchLayer(): void {
    if (deps.history.searchState === null) return;
    const next = deps.history.searchLayer(deps.anchor());
    deps.overlays.update(SEARCH_ID, {
      content: next.content,
      ...(next.cursor !== undefined && { cursor: next.cursor }),
    });
  }

  function afterEdit(): void {
    const ctx = ctxNow();

    if (requested) {
      // C19 §8's requested-menu row: filter what it holds, and dismiss when the
      // keystroke does not extend the prefix, because filtering cannot widen.
      const prefix = ctx.prefix;
      if (prefix === builtFor) return;
      if (!prefix.startsWith(builtFor)) {
        closeMenu();
        return;
      }
      const narrowed = candidates.filter((c) => c.value.startsWith(prefix));
      if (narrowed.length === 0) {
        closeMenu();
        return;
      }
      showMenu(narrowed, selected === null ? null : 0, prefix);
      countRemainder();
      return;
    }

    if (suppressedAt !== null && suppressedAt !== ctx.replace.start) suppressedAt = null;

    const next = deps.completion.suggest(ctx);
    // **Two, and one is ghost text's case** (C19 I19). A one-row menu under a
    // prompt already showing the suggestion draws the same word twice.
    if (next.length < 2 || suppressedAt !== null) {
      if (hasMenu()) closeMenu();
      return;
    }
    // A rebuild clears the selection: a set the user has not seen cannot have a
    // row they chose in it, so the menu is a display again (C19 I22).
    showMenu(next, null, ctx.prefix);
    countRemainder();
  }

  const raw: Readonly<Record<KeyAction, KeyEffect>> = Object.freeze({
    // --- C17 ---------------------------------------------------------------
    insertNewline: () => void deps.editor.insert("\n"),

    // --- C19 ---------------------------------------------------------------
    //
    // Fire-and-forget: a source may be a network call, and C22 I18's rule that
    // input is never blocked on a fetch applies to every fetch. The menu appears
    // when the promise settles; the prompt stays live throughout.
    complete: () => {
      const ctx = ctxNow();
      // An explicit request is the user asking again, so `Esc`'s hold on the
      // token is over (C19 I19). The suppression is about opening unasked.
      suppressedAt = null;
      seq += 1;
      const mine = seq;

      // **The wake, and it is the half without which the spinner is invisible**
      // (C22 I38, C19 §7). `spinning` becomes true 500 ms after the earliest
      // call still in flight, and nothing draws a frame at that moment: the
      // keystroke's own commit belongs to the batch that has already ended
      // (I27), and the source's continuation only fires when it settles —
      // which for a slow source is the thing being waited on. So without this,
      // the spinner appears when the user next types, which is the *key that
      // appears to do nothing until you press another one* (I32) reached
      // through a different timer.
      //
      // Armed unconditionally and cheap: `spinning` is read at paint, so a
      // request that settled first draws a frame with no spinner in it.
      deps.schedule(() => {
        if (mine === seq) deps.redraw();
      }, SPINNER_MS);

      void deps.completion.request(ctx, mine).then((result) => {
        // A later request supersedes this one. The engine sequences its own
        // work; this guards the *menu*, which is state the engine has never
        // seen.
        if (mine !== seq) return;

        // **C19 §5's algorithm, which had no caller until now** (C19 I16).
        // `commonPrefix` was computed on every request and read by nothing
        // outside C19's own tests, so `Tab` opened a menu in every case —
        // including the unique match, where the answer is to insert it. The
        // same shape as the ghost: a mechanism complete on its own side of a
        // seam with nothing on the other.
        //
        // Rule 3 appends the candidate's delimiter and rule 4 does not, which
        // is what makes a second `Tab` useful without a press counter: the
        // first closes the token, so the second is in the next slot.
        const found = result.candidates;
        if (found.length === 0) {
          closeMenu();
          // The dismissal is a state change like the appearance is, and it
          // settles in the same place (I31).
          deps.redraw();
          return;
        }
        const only = found[0];
        if (found.length === 1 && only !== undefined) {
          applyEdit(ctx, only, true);
          closeMenu();
          deps.redraw();
          return;
        }
        if (result.commonPrefix.length > ctx.prefix.length) {
          applyEdit(ctx, { value: result.commonPrefix }, false);
          closeMenu();
          deps.redraw();
          return;
        }

        // Rule 5. A `Tab` menu is a choice the user asked to make, so it opens
        // with a selection and owns its keys from here (C19 I20, I22).
        requested = true;
        showMenu(found, 0, ctx.prefix);
        countRemainder();

        // **The frame this continuation has no batch to be part of** (I31).
        deps.redraw();
      });
    },

    // **One action, not two** (C16 §6). Two bindings for one `(target, key)` is
    // a construction error, so the fallback is here rather than in the table.
    acceptGhostOrForward: () => {
      const ctx = contextAt(deps.editor.text, deps.editor.cursor, deps.manifest);
      const ghost = deps.completion.ghost(ctx);
      if (ghost === null || ghost === "") {
        deps.editor.move("charRight");
        return;
      }
      deps.editor.insert(ghost);
    },

    // A menu holding no selection never reaches these: the prompt's bindings
    // resolve first while it is a display (C19 I20), so `↑` is history and
    // `Tab` is `complete`. The `null` arm is the guard, not a fallback.
    menuNext: () => {
      if (candidates.length === 0 || selected === null) return;
      selected = (selected + 1) % candidates.length;
      redrawMenu();
    },
    menuPrev: () => {
      if (candidates.length === 0 || selected === null) return;
      selected = (selected + candidates.length - 1) % candidates.length;
      redrawMenu();
    },
    menuAccept: () => void applyCandidate(true),

    // Generic rather than the menu's alone: C15's `pop()` inspects the top and
    // refuses a non-dismissable layer, which is what lets one row serve every
    // overlay and still leave a confirm standing (C16 I8).
    dismiss: () => {
      const top = deps.overlays.top;
      if (top === null) return;
      if (top.id === MENU_ID) {
        // **`Esc` holds for the token** (C19 I19). A menu that opens by itself
        // must stay closed for more than one keystroke, or the dismissal is
        // undone by the next character.
        const at = ctxNow().replace.start;
        closeMenu();
        suppressedAt = at;
        return;
      }
      if (top.id === SEARCH_ID) {
        const found = deps.history.searchEnd("cancel");
        if (found !== null) deps.editor.setText(found);
        return;
      }
      deps.overlays.pop();
    },

    // --- C20 ---------------------------------------------------------------
    historyPrev: () => {
      const entry = deps.history.previous(deps.editor.text);
      if (entry !== null) deps.editor.setText(entry);
    },
    // **One binding, two effects, in order** (C16 I22). C20's walk has a defined
    // bottom — `↓` past the newest entry restores the stashed draft — so
    // entering the live block is what `↓` does *after* that end rather than a
    // case competing with history. `next()` answering `null` is precisely
    // "navigation is inactive or already finished".
    historyNext: () => {
      const entry = deps.history.next();
      if (entry !== null) {
        deps.editor.setText(entry);
        return;
      }
      const elements = deps.liveElements();
      // A block with nothing focusable is not entered: `activeTarget` would say
      // `liveBlock`, every key would resolve against a target with no bindings,
      // and they would all be dropped.
      const first = elements[0];
      if (first === undefined) return;
      deps.focus.enterLiveBlock(addressOf(first));
    },

    // --- the way back, and between rows (C16 I22) ------------------------
    //
    // Entry with no exit is a session whose prompt cannot be reached, so both
    // routes are bindings rather than one: `Esc`, which S01's footer already
    // prints as `esc prompt`, and `↑` from the first row, mirroring the entry.
    // **`toPrompt()`, not `reset()`** (C26 I13, §8b.2). Both produce
    // `{at: "prompt"}` today, so this line changes no behaviour — and it was
    // wrong, in the direction that matters: `reset()` is C16 I2's *a command
    // ran*, arriving from C23's submit row, and this is the reader stepping out.
    // `toPrompt()` existed for exactly this and had one caller in the tree, the
    // Ctrl-C rung. Focus memory hangs off the pair, so with these two call sites
    // as they were the emphatic exit would have kept the memory and the two
    // ordinary ones wiped it.
    focusPrompt: () => void deps.focus.toPrompt(),
    rowDown: () => {
      const elements = deps.liveElements();
      const current = deps.focus.current;
      if (current.at !== "liveBlock") return;
      // **`resolveFocus`, not `indexOf`** (C26 I10, §8b.7). The old line was
      // `rows.indexOf(current.rowId ?? "")` over a flat list of row ids, which
      // found the *first* block carrying the id and counted from there — so with
      // two tables each holding `r1` the next `↓` continued from the wrong one.
      // It also answered −1 for a row the block no longer has, which quietly
      // meant "start again from the top" while `rowUp` read the same −1 as
      // "leave to the prompt".
      const i = resolveFocus(current.element, elements);
      if (i === null) return;
      const next = elements[i + 1];
      if (next !== undefined) deps.focus.focusRow(addressOf(next));
    },
    /**
     * **F21's whole subject: the route from a keystroke to `actions.ts`.**
     *
     * `src/shell/actions.ts` implemented all five `Action` arms and nothing in
     * `src/` called the dispatcher — `pipeline.onAction` was reached only from a
     * unit test. So an app could build a `view` action, have C04 validate it and
     * C09 render its label into a row, and no keystroke would ever arrive. C24
     * I16's subject arriving on `Action`.
     *
     * Silent on a row with no action, rather than a notice. Pressing `enter` on
     * a row that does nothing is a question, not a mistake, and a refusal per
     * keystroke on a table where most rows have no action is noise the reader
     * cannot act on. The refusals that matter — a frozen entry, a bad scheme —
     * are the dispatcher's and are unaffected.
     */
    rowActivate: () => {
      const current = deps.focus.current;
      if (current.at !== "liveBlock") return;
      // Resolved rather than looked up by id (C26 I10). The old form took the
      // bare row id into a second walk that matched the *first* block carrying
      // it, so `⏎` on the second table's `r1` fired the first table's action.
      const elements = deps.liveElements();
      const i = resolveFocus(current.element, elements);
      if (i === null) return;
      // `activate` is the element's own, declared by the kind (C26 §5), rather
      // than a row shape this layer would otherwise have to know.
      const action = elements[i]?.element.activate;
      const from = deps.liveEntryId();
      if (action === undefined || from === null) return;
      deps.onAction(action, from);
    },
    rowUp: () => {
      const elements = deps.liveElements();
      const current = deps.focus.current;
      if (current.at !== "liveBlock") return;
      const i = resolveFocus(current.element, elements);
      // At the first element `↑` leaves. **A stale address no longer arrives
      // here as one** (C26 I10): it used to reach this as `indexOf`'s −1 and
      // exit to the prompt, while `rowDown` read the same −1 as "go to the top"
      // and `focusFor` drew no highlight at all — three call sites, three
      // answers, none of them the invariant's. Resolution falls forward before
      // the edge is tested, so only a real first element leaves.
      //
      // `toPrompt()` for `focusPrompt`'s reason above: this is the reader
      // stepping out, and it is the second of the two call sites C26 §8b.2 found
      // wired to C16 I2's append transition.
      if (i === null || i === 0) {
        deps.focus.toPrompt();
        return;
      }
      const previous = elements[i - 1];
      deps.focus.focusRow(previous === undefined ? null : addressOf(previous));
    },
    // --- C17 -----------------------------------------------------------
    //
    // **One C17 operation each** (C16 I21). The union is derived from the
    // editor's surface, so these are a transcription rather than a design: an
    // action with no method does not compile, and T2.14 fails on a method with
    // no action.
    backspace: () => void deps.editor.deleteBackward(),
    delete: () => void deps.editor.deleteForward(),
    killWordLeft: () => void deps.editor.killTo("wordLeft"),
    killWordRight: () => void deps.editor.killTo("wordRight"),
    killToStart: () => void deps.editor.killTo("lineStart"),
    killToEnd: () => void deps.editor.killTo("lineEnd"),
    yank: () => void deps.editor.yank(),
    // Bound to nothing today: `⌃_` and `⌃⇧-` are the same byte and the decoder
    // does not name it. Present because C17's methods are (I21).
    undo: () => void deps.editor.undo(),
    redo: () => void deps.editor.redo(),
    wordLeft: () => void deps.editor.move("wordLeft"),
    wordRight: () => void deps.editor.move("wordRight"),
    home: () => void deps.editor.move("lineStart"),
    end: () => void deps.editor.move("lineEnd"),
    left: () => void deps.editor.move("charLeft"),

    // --- C14, through the keymap like everything else that is a key (C16 I23)
    //
    // **The commit is the read loop's, not these** (C22 I27). C14 moves and C22
    // commits — a viewport committing its own frame would be L2 reaching into
    // L0 — and two committers means one frame too many for a scroll and none
    // for whichever handler forgets, of which only the second is invisible.
    scrollPageUp: () => void deps.viewport.pageUp(),
    scrollPageDown: () => void deps.viewport.pageDown(),
    scrollTop: () => void deps.viewport.scrollToTop(),
    scrollBottom: () => void deps.viewport.scrollToBottom(),

    // --- the pushed view (C16 I24) -----------------------------------------
    //
    // Every one is the same call with a different motion, which is the point:
    // the view holds one offset and computes each destination from it, so there
    // is no per-motion state here to fall out of step (C22 I41).
    // **One target, two owners** (C22 §13a). C15 I1 permits one view at a time,
    // so `onView` asks which is open rather than the keymap growing a second
    // `pushedView` target — a target per producer would put the same seven keys
    // in two tables, and the day they disagreed nothing would say so.
    //
    // `n`/`p` are the hunk motions on a patch and one block on a document,
    // which is S3's footer read literally: *n/p scroll*. The two are the same
    // gesture over each view's own unit, which is what makes one binding right
    // rather than a compromise.
    viewNextHunk: () => void onView("nextHunk", "down"),
    viewPrevHunk: () => void onView("prevHunk", "up"),
    viewTop: () => void onView("top", "top"),
    viewBottom: () => void onView("bottom", "bottom"),
    viewPageUp: () => void onView("pageUp", "pageUp"),
    viewPageDown: () => void onView("pageDown", "pageDown"),
    // `Esc` is the view's own dismissal and deliberately not `dismiss`, which
    // pops whatever layer is on top: this one knows it is closing *its* view and
    // drops its offset with it (A01 D7).
    viewPop: () => {
      // **Released here, which is the trigger C23 I33's set did not have** (I46).
      // The order matters: release first, so a fetch that resolves during the
      // pop finds no registration rather than a half-dismissed view.
      if (deps.documentView.openFor !== null) {
        deps.releaseView();
        void deps.documentView.pop();
        return;
      }
      void deps.patchView.pop();
    },

    reverseSearch: () => {
      deps.history.searchOpen(deps.editor.text);
      deps.overlays.push(deps.history.searchLayer(deps.anchor()));
    },
    searchOlder: () => {
      deps.history.searchOlder();
      refreshSearchLayer();
    },

    // --- selection (C17 §5b, I21) ------------------------------------------
    //
    // **Seven rows and no logic**, which is the point: `extend` is `move` with
    // the anchor held inside C17, so nothing here decides anything and there is
    // no second place for the two to disagree.
    extendCharLeft: () => void deps.editor.extend("charLeft"),
    extendCharRight: () => void deps.editor.extend("charRight"),
    extendWordLeft: () => void deps.editor.extend("wordLeft"),
    extendWordRight: () => void deps.editor.extend("wordRight"),
    extendLineStart: () => void deps.editor.extend("lineStart"),
    extendLineEnd: () => void deps.editor.extend("lineEnd"),
    selectAll: () => void deps.editor.selectAll(),
    // **The region reaches the kill buffer and nowhere else** (C17 §5a). The
    // system clipboard is a separate axis — a capability question about the
    // terminal — and folding it in here would make "one clipboard" a claim
    // about two things, one of which C17 cannot see.
    copySelection: () => void deps.editor.copy(),

    // --- copy mode (C16 §5b) -----------------------------------------------
    //
    // **Entry only. The exit is the `⌃c` rung**, which is the ladder's and not
    // this table's — a second way out here would give copy mode an order of its
    // own, which is exactly what makes it a target rather than a mode.
    enterCopyMode: () => void deps.enterCopyMode(),
  });

  /**
   * Send a motion to whichever view is open (C22 §13a).
   *
   * Two motions per binding because the vocabularies differ where the units
   * differ: a patch moves by hunk, a document by block. Anything the two share
   * — `top`, `bottom`, the pages — passes the same name twice, and that
   * repetition is deliberate: it keeps the mapping visible at the call site
   * rather than hidden in a table that would have to be read to know whether a
   * key does the same thing in both.
   */
  const onView = (patch: PatchViewMotion, document: DocumentViewMotion): boolean =>
    deps.documentView.openFor !== null
      ? deps.documentView.move(document)
      : deps.patchView.move(patch);

  /**
   * The actions after which the as-you-type menu is recomputed (C19 §6a).
   *
   * **An allow-list with its reason, not a prefix match**: a C17 operation
   * added to the union joins this set deliberately or does not, and either way
   * someone decided. What is *not* here is as load-bearing as what is —
   * `historyPrev` and `historyNext` replace the whole line and a menu over a
   * recalled command is noise, and `menuAccept` is an acceptance rather than
   * typing, so recomputing there would reopen the menu it just closed.
   */
  const RECOMPUTES: ReadonlySet<KeyAction> = new Set<KeyAction>([
    "backspace",
    "delete",
    "killWordLeft",
    "killWordRight",
    "killToStart",
    "killToEnd",
    "yank",
    "undo",
    "redo",
    "insertNewline",
  ]);

  const table: Readonly<Record<KeyAction, KeyEffect>> = Object.freeze(
    Object.fromEntries(
      Object.entries(raw).map(([action, effect]) => [
        action,
        RECOMPUTES.has(action as KeyAction)
          ? () => {
              effect();
              afterEdit();
            }
          : effect,
      ]),
    ) as Record<KeyAction, KeyEffect>,
  );

  return {
    table,
    afterEdit,
    // **C20 built both of these and nothing called them** — `⌃r` opened a search
    // whose query could never become non-empty, because the composition root's
    // overlay handler forwards printable keys only for the completion menu and
    // dropped them for everything else. FINDINGS F97.
    searchTyped: (text) => {
      if (deps.history.searchState === null) return;
      if (text === null) deps.history.searchBackspace();
      else deps.history.searchType(text);
      refreshSearchLayer();
    },
    reset: () => {
      closeMenu();
      suppressedAt = null;
    },
    get selected() {
      return selected;
    },
  };
}
