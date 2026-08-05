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
import type { KeyAction } from "../interaction/router/types.js";
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
   * The live entry's focusable rows, or empty (C16 I22).
   *
   * C16 takes row ids as data and holds no opinion about what a row is, so
   * whether a block is navigable is answered from the block (C11 I14). Empty is
   * what makes `↓` a no-op over a notice rather than focus landing somewhere
   * with nothing in it.
   */
  liveRows: () => readonly string[];
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
      const rows = deps.liveRows();
      // A block with nothing focusable is not entered: `activeTarget` would say
      // `liveBlock`, every key would resolve against a target with no bindings,
      // and they would all be dropped.
      if (rows.length === 0) return;
      deps.focus.enterLiveBlock(rows[0] ?? null);
    },

    // --- the way back, and between rows (C16 I22) ------------------------
    //
    // Entry with no exit is a session whose prompt cannot be reached, so both
    // routes are bindings rather than one: `Esc`, which S01's footer already
    // prints as `esc prompt`, and `↑` from the first row, mirroring the entry.
    focusPrompt: () => void deps.focus.reset(),
    rowDown: () => {
      const rows = deps.liveRows();
      const current = deps.focus.current;
      if (current.at !== "liveBlock") return;
      const i = rows.indexOf(current.rowId ?? "");
      const next = rows[i + 1];
      if (next !== undefined) deps.focus.focusRow(next);
    },
    rowUp: () => {
      const rows = deps.liveRows();
      const current = deps.focus.current;
      if (current.at !== "liveBlock") return;
      const i = rows.indexOf(current.rowId ?? "");
      // At the first row — or at a row the block no longer has — `↑` leaves.
      if (i <= 0) {
        deps.focus.reset();
        return;
      }
      deps.focus.focusRow(rows[i - 1] ?? null);
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
      const state = deps.history.searchState;
      if (state === null) return;
      // **The cursor goes with the content** (C15 I19). The caret sits at the
      // end of the query and the query is what just changed, so an update
      // carrying only `content` leaves it where the previous keystroke put it —
      // a caret that stops following the text being typed into it.
      const next = deps.history.searchLayer(deps.anchor());
      deps.overlays.update(SEARCH_ID, {
        content: next.content,
        ...(next.cursor !== undefined && { cursor: next.cursor }),
      });
    },
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
    reset: () => {
      closeMenu();
      suppressedAt = null;
    },
    get selected() {
      return selected;
    },
  };
}
