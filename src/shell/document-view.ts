/**
 * C22 §13a — the view a verb's result becomes, and `patch-view.ts`'s sibling.
 *
 * §13 reserved *a verb whose result is a pushed view* through four stretches and
 * warned that a partial producer is the most likely thing to be mistaken for a
 * resolution. §13a takes it, and this is the producer: the second thing in the
 * tree to raise a `kind: "view"` layer, and the first to raise one holding an
 * app-supplied document.
 *
 * **Pushed at step 3's moment, filled at step 4's** (I45). C23 I3 puts the
 * pending entry before the transport so that something is on screen before the
 * work starts, and ruling the entry away would have removed that: a slow verb
 * would look like a hung terminal. So `open` pushes with a waiting block and
 * `fill` replaces it, and the ordering C23 I3 protects is unchanged.
 *
 * **The window falls on block boundaries** (I46, C25 I18). `Layer.content` is
 * `Block[]`, so an owner cannot hand C15 a slice of rendered output — it hands
 * back a smaller sequence, which C15 measures through the same registry as
 * everything else. There is no second height codepath here, and `Placed` gains
 * no scroll offset.
 *
 * **A plot is atomic inside that window and always will be.** C12 I1 makes a
 * plot's height a function of the block alone and puts the series out of the
 * height's reach, so reducing a plot's data changes nothing and reducing its
 * `height` rescales the curve rather than windowing it. The ceiling is
 * *granular where the kind divides, atomic where it does not*; row-granular
 * scroll is not on the path, and a comment promising it would be describing
 * something C12 I1 forbids.
 *
 * Measured rather than assumed: S3, the surface this was built for, is 21 rows
 * at 120 and at 80 against a region a view fills, so nothing of it is out of
 * view and the granularity is invisible. Per-kind reducers for `table`,
 * `keyValue` and `panel` need no mid-row slicing and no measurer change, and
 * they are unwritten — `windowPatch` needed a dedicated file and a concept of
 * indivisible units, and each further reducer is that work again. They wait for
 * a consumer, like everything else here.
 */
import type { Block, ViewDocument } from "../data/viewmodel/index.js";
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";
import { b } from "./builders/index.js";

/** The layer id. One view at a time — C15 I1 forbids nesting. */
export const DOCUMENT_VIEW_ID = "document-view";

/** The block the view shows between `open` and `fill`. */
const WAITING_ID = "document-view-waiting";

export type DocumentViewMotion = "up" | "down" | "top" | "bottom" | "pageUp" | "pageDown";

export type DocumentViewDeps = Readonly<{
  overlays: OverlayManager;
  /** Measured through the registry, because the window must agree with C15. */
  measure: (block: Block, width: number) => number;
  /** The region a view fills, which is the whole of it (C15 §4). */
  region: () => Readonly<{ width: number; height: number }>;
  /** A frame, because a motion changes what is on screen and nothing else will. */
  redraw: () => void;
}>;

export interface DocumentView {
  /**
   * Raise the view for `command`, showing that it is running.
   *
   * Returns a refusal string, or `null` when the view opened — `patch-view`'s
   * convention, and for its reason: C15's own refusal is a throw reached from
   * somewhere it cannot be reported.
   */
  open(command: string): string | null;
  /** The verb's document arrived (or its failure did). */
  fill(doc: ViewDocument): boolean;
  /**
   * Replace one block, for the refresh driver — **total, never throwing**.
   *
   * Two steps, and the second can fail: the held document is patched and the
   * window reprojected. A throw between them would leave the owner holding a
   * document no frame ever displayed, and the next motion would reproject a
   * state nothing had shown — C13's `settle(id, doc)` hazard, in a component two
   * removed from the driver that called it. So both are assigned together or
   * neither is, and a failure is `false`. The driver's `false → release(host)`
   * covers the other side.
   */
  putBlock(blockId: string, next: Block): boolean;
  /** The block the view currently holds for an id, so staleness can retitle. */
  blockAt(blockId: string): Block | null;
  move(motion: DocumentViewMotion): boolean;
  /** `Esc`. Appends nothing — B03 §2, and there is no entry to touch (I45). */
  pop(): boolean;
  /** The command this view was opened for, or `null` when nothing is open. */
  readonly openFor: string | null;
}

type State = Readonly<{ command: string; blocks: readonly Block[]; offset: number }>;

export function createDocumentView(deps: DocumentViewDeps): DocumentView {
  let state: State | null = null;

  const waiting = (command: string): readonly Block[] =>
    Object.freeze([b.spinner(`${command} — running`, { id: WAITING_ID })]);

  /**
   * The blocks that fit, from `offset`.
   *
   * **At least one block, always.** A block taller than the whole region would
   * otherwise window to nothing, and an empty view is indistinguishable from a
   * broken one; C15 reports the overflow through `Placed.truncated`, which is
   * what that field is for. This is the one place the block-boundary rule and
   * the region can genuinely disagree, and showing the block is the honest half.
   */
  const project = (at: State): readonly Block[] => {
    const { width, height } = deps.region();
    const from = Math.max(0, Math.min(at.offset, at.blocks.length - 1));
    const out: Block[] = [];
    let used = 0;
    for (let i = from; i < at.blocks.length; i += 1) {
      const block = at.blocks[i] as Block;
      const rows = deps.measure(block, width);
      if (out.length > 0 && used + rows > height) break;
      out.push(block);
      used += rows;
    }
    return Object.freeze(out);
  };

  const layerFor = (at: State): Layer => ({
    id: DOCUMENT_VIEW_ID,
    kind: "view",
    placement: { kind: "fill" },
    content: project(at),
    // `Esc` pops it, which is what makes C16 §4's coverage clause necessary: a
    // dismissable layer takes the permissive branch, and this one covers the
    // region.
    dismissable: true,
  });

  const render = (at: State): void => {
    deps.overlays.update(DOCUMENT_VIEW_ID, { content: layerFor(at).content });
    deps.redraw();
  };

  /** The last offset from which the tail still fills the region, or 0. */
  const lastOffset = (at: State): number => {
    const { width, height } = deps.region();
    let used = 0;
    for (let i = at.blocks.length - 1; i >= 0; i -= 1) {
      used += deps.measure(at.blocks[i] as Block, width);
      if (used > height) return Math.min(i + 1, at.blocks.length - 1);
    }
    return 0;
  };

  return {
    get openFor() {
      return state?.command ?? null;
    },

    open(command) {
      // C15 throws on a view over a non-empty stack (C15 I1), and this is
      // reached from C23 rather than from a keymap, so the stack is checked
      // rather than caught.
      if (deps.overlays.top !== null) return `close what is open before running ${command}`;
      state = { command, blocks: waiting(command), offset: 0 };
      deps.overlays.push(layerFor(state));
      deps.redraw();
      return null;
    },

    fill(doc) {
      const at = state;
      if (at === null) return false;
      // The offset goes back to the top: the waiting block is not row zero of
      // the document, so carrying an offset across would be counting blocks the
      // reader never saw.
      state = { ...at, blocks: doc.blocks, offset: 0 };
      render(state);
      return true;
    },

    putBlock(blockId, next) {
      const at = state;
      if (at === null) return false;
      if (!at.blocks.some((x) => x.id === blockId)) return false;
      const blocks = at.blocks.map((x) => (x.id === blockId ? next : x));
      const candidate: State = { ...at, blocks };
      // Reprojected into a local first — see the interface comment. Nothing is
      // assigned until the projection has succeeded.
      let content: readonly Block[];
      try {
        content = project(candidate);
      } catch {
        return false;
      }
      state = candidate;
      const applied = deps.overlays.update(DOCUMENT_VIEW_ID, { content });
      if (!applied) return false;
      deps.redraw();
      return true;
    },

    blockAt(blockId) {
      return state?.blocks.find((x) => x.id === blockId) ?? null;
    },

    move(motion) {
      const at = state;
      if (at === null) return false;
      const page = Math.max(1, deps.region().height - 1);
      const end = lastOffset(at);
      const wanted = ((): number => {
        switch (motion) {
          case "top":
            return 0;
          case "bottom":
            return end;
          case "up":
            return at.offset - 1;
          case "down":
            return at.offset + 1;
          case "pageUp":
            return at.offset - page;
          case "pageDown":
            return at.offset + page;
        }
      })();
      const next = Math.max(0, Math.min(wanted, end));
      if (next === at.offset) return false;
      state = { ...at, offset: next };
      render(state);
      return true;
    },

    pop() {
      if (state === null) return false;
      state = null;
      deps.overlays.dismiss(DOCUMENT_VIEW_ID, "explicit");
      deps.redraw();
      return true;
    },
  };
}
