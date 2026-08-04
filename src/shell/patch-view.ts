/**
 * C22 §3 — the fullscreen patch view, and the first thing in the tree to push a
 * `kind: "view"` layer.
 *
 * C25 §3b specified this when L2 landed and it has had no producer since: C15
 * places views, C16's `focus.ts` routes to `pushedView`, and nothing raised one.
 * That is the seventeenth gap, and this narrows it rather than closing it — a
 * *verb's result* being a view is still the ruling C22 §13 records as undecided.
 *
 * **One piece of state, and it is a row offset** (I41). The obvious shape holds
 * an offset *and* a hunk index, and they disagree: `G` leaves the index pointing
 * at the hunk the reader scrolled away from, so `p` jumps upward from a place
 * nothing on screen explains. `n` and `p` compute a hunk's row from the offset
 * instead, so there is nothing to disagree with. Found by the trace in C25 §3c,
 * and invisible to any test that drives one motion at a time.
 *
 * **The window is recomputed from the live block, never snapshotted** (I42). A
 * patch is exactly what `expand` produces one keystroke earlier, so a snapshot
 * shows a diff the entry no longer holds. And when the entry goes, the layer
 * goes with it: C15's `anchorEvicted` is this reason code and C15 cannot detect
 * the condition — it subscribes to nothing and holds no entry ids (C15 I10) — so
 * the watching is here.
 */
import type { Block, Patch } from "../data/viewmodel/index.js";
import {
  clampOffset,
  hunkHeaderRows,
  windowPatch,
} from "../presentation/patch/window.js";
import type { EntryId, TranscriptView } from "../viewport/transcript/index.js";
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";

/** The layer id. One view at a time — C15 I1 forbids nesting. */
export const PATCH_VIEW_ID = "patch-view";

export type PatchViewDeps = Readonly<{
  overlays: OverlayManager;
  transcript: TranscriptView;
  /** The region a view fills, which is the whole of it (C15 §4). */
  region: () => Readonly<{ width: number; height: number }>;
  /** A frame, because a motion changes what is on screen and nothing else will. */
  redraw: () => void;
}>;

export interface PatchView {
  /**
   * Raise the view over `blockId`, resolved **within `from`'s document**.
   *
   * Returns a refusal string, or `null` when the view opened. A string rather
   * than a throw because the caller is C23's action dispatcher, which patches a
   * notice into the source entry — and because C15's own refusal *is* a throw,
   * reached from a renderer's callback where it has nowhere to be reported
   * (C23 I31).
   */
  open(from: EntryId | null, blockId: string): string | null;
  /** Every motion the keymap binds, by name (C16 §6). */
  move(motion: PatchViewMotion): boolean;
  /**
   * `Esc` — the view's own dismissal, not §5's cancellation rung.
   *
   * **There is deliberately no `isOpen`.** One was written and MG24 fired on
   * it: nothing consumes it, because whether a view is open is already answered
   * by `activeTarget` from the layer stack (C16 §3), and a second source for one
   * fact is how two answers come to disagree. The state stays private.
   */
  pop(): boolean;
}

export type PatchViewMotion =
  | "nextHunk"
  | "prevHunk"
  | "top"
  | "bottom"
  | "pageUp"
  | "pageDown";

type State = Readonly<{ entry: EntryId; blockId: string; offset: number }>;

export function createPatchView(deps: PatchViewDeps): PatchView {
  let state: State | null = null;

  /** The block as it is **now**, or null if the entry or the block has gone. */
  function live(at: State): Patch | null {
    const entry = deps.transcript.entries.find((e) => e.id === at.entry);
    if (entry === undefined) return null;
    const found = entry.doc.blocks.find((b: Block) => b.id === at.blockId);
    if (found === undefined || found.kind !== "patch") return null;
    return found;
  }

  function layerFor(patch: Patch, offset: number): Layer {
    const region = deps.region();
    return {
      id: PATCH_VIEW_ID,
      kind: "view",
      placement: { kind: "fill" },
      content: [windowPatch(patch, region.width, offset, region.height)],
      // `Esc` pops it, which is what makes the coverage clause in C16 §4
      // necessary: a dismissable layer takes the permissive branch, and this one
      // covers the region.
      dismissable: true,
    };
  }

  function render(at: State, patch: Patch): void {
    deps.overlays.update(PATCH_VIEW_ID, { content: layerFor(patch, at.offset).content });
    deps.redraw();
  }

  function dismiss(reason: "explicit" | "anchorEvicted"): boolean {
    if (state === null) return false;
    state = null;
    deps.overlays.dismiss(PATCH_VIEW_ID, reason);
    deps.redraw();
    return true;
  }

  /**
   * **Watched, not checked on the next keystroke** (I42).
   *
   * The first draft looked for the block only when a motion arrived, which
   * leaves a diff for a vanished entry on the screen until the reader presses
   * something — and if they press `Esc` first it pops to nothing, which reads as
   * having worked. C13 evicts on its own schedule and says so; this listens.
   *
   * A `patch` on the entry the view is showing is the other half: the window is
   * recomputed, so an expansion arriving underneath shows through rather than
   * being frozen at push time.
   */
  deps.transcript.subscribe((change) => {
    const at = state;
    if (at === null) return;
    if (change.kind === "clear") {
      dismiss("anchorEvicted");
      return;
    }
    if (change.kind === "evict") {
      if (change.ids.includes(at.entry)) dismiss("anchorEvicted");
      return;
    }
    if (change.kind !== "patch" || change.id !== at.entry) return;
    const patch = live(at);
    if (patch === null) {
      dismiss("anchorEvicted");
      return;
    }
    // The offset is re-clamped against the new document: a patch that shortened
    // the diff can leave the offset past its end.
    const region = deps.region();
    state = { ...at, offset: clampOffset(patch, region.width, region.height, at.offset) };
    render(state, patch);
  });

  return {
    open(from, blockId) {
      if (from === null) return `\`${blockId}\` has no entry to resolve against`;

      const entry = deps.transcript.entries.find((e) => e.id === from);
      if (entry === undefined) return `the entry this came from is no longer in the transcript`;

      // **Resolved within this entry and nowhere wider** (C04 I34, C23 I31). A
      // free string an adapter supplies, matched against the whole transcript,
      // would let one entry's action fill the screen with another entry's data.
      const found = entry.doc.blocks.find((b: Block) => b.id === blockId);
      if (found === undefined) return `no block \`${blockId}\` in this entry`;
      if (found.kind !== "patch") return `\`${blockId}\` is a ${found.kind}, not a patch`;

      // C15 throws on a view over a non-empty stack (C15 I1) and this is called
      // from a renderer's callback, so the stack is checked rather than caught.
      if (deps.overlays.top !== null) {
        return `close what is open before opening \`${found.path}\``;
      }

      state = { entry: from, blockId, offset: 0 };
      deps.overlays.push(layerFor(found, 0));
      deps.redraw();
      return null;
    },

    move(motion) {
      const at = state;
      if (at === null) return false;
      const patch = live(at);
      if (patch === null) return dismiss("anchorEvicted");

      const region = deps.region();
      const page = Math.max(1, region.height - 1);
      const headers = hunkHeaderRows(patch, region.width);

      const wanted = ((): number => {
        switch (motion) {
          case "top":
            return 0;
          case "bottom":
            return Number.MAX_SAFE_INTEGER;
          case "pageUp":
            return at.offset - page;
          case "pageDown":
            return at.offset + page;
          case "nextHunk":
            // Clamps, never wraps: wrapping to the top of a diff loses the
            // reader's place silently (C25 §3c A3).
            return headers.find((row) => row > at.offset) ?? at.offset;
          case "prevHunk":
            return [...headers].reverse().find((row) => row < at.offset) ?? at.offset;
        }
      })();

      const offset = clampOffset(patch, region.width, region.height, wanted);
      state = { ...at, offset };
      render(state, patch);
      return true;
    },

    pop() {
      return dismiss("explicit");
    },
  };
}
