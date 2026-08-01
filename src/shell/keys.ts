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

import { accept, contextAt, menuLayer, remainderOf, MENU_ID } from "../interaction/completion/index.js";
import { SEARCH_ID } from "../interaction/history/index.js";
import type { CompletionEngine } from "../interaction/completion/index.js";
import type { LineEditor } from "../interaction/editor/index.js";
import type { HistoryStore } from "../interaction/history/index.js";
import type { KeyAction } from "../interaction/router/types.js";
import type { Manifest } from "../data/manifest/index.js";
import type { OverlayManager } from "../viewport/overlay/index.js";

/** The prompt's own extent, for anchoring (C19 §6, C20 §5). */
export type PromptAnchor = Readonly<{ row: number; rows: number }>;

export type KeyDeps = Readonly<{
  editor: LineEditor;
  completion: CompletionEngine;
  overlays: OverlayManager;
  history: HistoryStore;
  manifest: Manifest | null;
  /** Where the prompt sits, from the composed frame rather than a fresh read. */
  anchor: () => PromptAnchor;
  /** How big a layer may be (C15 `Region`), for the menu's "… n more". */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
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
}>;

/** What a bound key does. Returns nothing: the loop commits (C22 I27). */
export type KeyEffect = () => void;

export interface KeyEffects {
  readonly table: Readonly<Record<KeyAction, KeyEffect>>;
  /** The menu's selected row, for the tests that drive it. */
  readonly selected: number;
}

/**
 * The table, plus the one piece of state a menu needs.
 *
 * Selection lives here rather than on C15's layer because a layer is content
 * and a placement: C15 places what it is given and holds no cursor. Rebuilding
 * the layer's blocks on each move is what `update` is for.
 */
export function createKeyEffects(deps: KeyDeps): KeyEffects {
  let candidates: readonly { value: string; delimiter?: string }[] = [];
  let selected = 0;
  let remainder = 0;
  let seq = 0;

  function redrawMenu(): void {
    if (candidates.length === 0) return;
    deps.overlays.update(MENU_ID, {
      content: menuLayer(candidates, selected, remainder, deps.anchor()).content,
    });
  }

  function closeMenu(): void {
    candidates = [];
    selected = 0;
    remainder = 0;
    deps.overlays.dismiss(MENU_ID);
  }

  function applyCandidate(whole: boolean): void {
    const candidate = candidates[selected];
    if (candidate === undefined) return;

    const ctx = contextAt(deps.editor.text, deps.editor.cursor, deps.manifest);
    const edit = accept(ctx, candidate, whole);
    const before = deps.editor.text;
    deps.editor.setText(
      before.slice(0, edit.start) + edit.text + before.slice(edit.end),
      edit.start + edit.text.length,
    );
    closeMenu();
  }

  const table: Readonly<Record<KeyAction, KeyEffect>> = Object.freeze({
    // --- C17 ---------------------------------------------------------------
    insertNewline: () => void deps.editor.insert("\n"),

    // --- C19 ---------------------------------------------------------------
    //
    // Fire-and-forget: a source may be a network call, and C22 I18's rule that
    // input is never blocked on a fetch applies to every fetch. The menu appears
    // when the promise settles; the prompt stays live throughout.
    complete: () => {
      const ctx = contextAt(deps.editor.text, deps.editor.cursor, deps.manifest);
      seq += 1;
      const mine = seq;
      void deps.completion.request(ctx, mine).then((result) => {
        // A later request supersedes this one. The engine sequences its own
        // work; this guards the *menu*, which is state the engine has never
        // seen.
        if (mine !== seq) return;
        if (result.candidates.length === 0) {
          closeMenu();
          // The dismissal is a state change like the appearance is, and it
          // settles in the same place (I31).
          deps.redraw();
          return;
        }
        candidates = result.candidates;
        selected = 0;
        remainder = 0;
        deps.overlays.push(menuLayer(candidates, selected, 0, deps.anchor()));

        // **The indicator needs the placement, and the placement needs the
        // region** — how many candidates fit is a fact about the frame, not
        // about the list. C15 answers it only once the layer is on the stack,
        // so this is a second pass rather than an argument to the first.
        const placed = deps.overlays
          .layout(deps.overlayRegion())
          .find((p) => p.layer.id === MENU_ID);
        remainder = remainderOf(placed ?? null, candidates.length, placed?.layer.content.length ?? 0);
        redrawMenu();

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

    menuNext: () => {
      if (candidates.length === 0) return;
      selected = (selected + 1) % candidates.length;
      redrawMenu();
    },
    menuPrev: () => {
      if (candidates.length === 0) return;
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
        closeMenu();
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
    historyNext: () => {
      const entry = deps.history.next();
      if (entry !== null) deps.editor.setText(entry);
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

  return {
    table,
    get selected() {
      return selected;
    },
  };
}
