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
 * Measured rather than assumed: S3, the surface this was built for, is **30
 * rows at 120 and 30 at 80** against a region a view fills, so nothing of it is
 * out of view and the granularity is invisible.
 *
 * **The figure was 21 and that was an estimate of a different composition.** It
 * was taken before S3 existed, from a drawing with three blocks and no axis
 * caption; the built surface has four blocks, three of them live panels with
 * borders, and an eight-row plot. Corrected from a replayed capture at both
 * widths rather than recomputed, because the point of the number is what a
 * terminal shows. The conclusion is unchanged — 30 still fits a view region on a
 * 40-row terminal — and the margin it had was half what the comment claimed. Per-kind reducers for `table`,
 * `keyValue` and `panel` need no mid-row slicing and no measurer change, and
 * they are unwritten — `windowPatch` needed a dedicated file and a concept of
 * indivisible units, and each further reducer is that work again. They wait for
 * a consumer, like everything else here.
 */
import { applyPatch } from "../data/viewmodel/index.js";
import type { Block, ErrorLike, ViewDocument, ViewPatch } from "../data/viewmodel/index.js";
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";
import { b } from "./builders/index.js";
import { followTail } from "./tail.js";

/** The layer id. One view at a time — C15 I1 forbids nesting. */
export const DOCUMENT_VIEW_ID = "document-view";

/** The block the view shows between `open` and `fill`. */
const WAITING_ID = "document-view-waiting";

/** The I47 indicator's id. Reserved, so a document cannot collide with it (C04 I14). */
const TRUNCATED_ID = "document-view-truncated";

export type DocumentViewMotion = "up" | "down" | "top" | "bottom" | "pageUp" | "pageDown";

export type DocumentViewDeps = Readonly<{
  overlays: OverlayManager;
  /**
   * Measured through the registry, because the window must agree with C15.
   *
   * **The sequence, not a block at a time** — and that distinction is a defect
   * this used to have. `renderSequenceToLines` separates blocks, so a window of
   * *n* blocks is *n* rows taller than the sum of their heights, and a
   * projection that added `measure(block)` one at a time packed nearly twice
   * what the region could hold. C15 then cut the excess in silence. The
   * registry has `measureSequence` for exactly this and the viewport is already
   * given it (`construct.ts`); this was handed the per-block one.
   *
   * Found by reading a frame, not by arithmetic: the split rendered with a
   * blank row between every block and the projection had no idea.
   */
  measureSequence: (blocks: readonly Block[], width: number) => number;
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
  /**
   * Apply a `ViewPatch` to the held document — the streaming route's seam (I48).
   *
   * **Through C04's `applyPatch`, which is the same function C13 calls**
   * (`transcript/store.ts`). A view that re-implemented `append` would be a
   * second answer to a settled question, exactly as a second height codepath
   * would be (I46).
   *
   * **Not merged with `putBlock`, and the difference is the contract rather
   * than the mechanism.** `putBlock` is the refresh driver's and is total: the
   * driver knows the id exists and a `false` means *release the host*. This
   * reports C13's three-armed outcome, because that is what `streamInto`
   * branches on — a malformed patch says so, an already-final one says
   * something else, and a loop that could not tell them apart would append the
   * wrong notice.
   *
   * `ok: false` with no reason when nothing is open: a patch may already be in
   * flight when `pop()` runs, and the loop treats it as *stop consuming*.
   * Returning rather than throwing for C13's `settle(id, doc)` reason — a throw
   * would abandon the loop mid-iteration with the subscription still registered.
   */
  patch(view: ViewPatch): DocumentViewPatch;
  /** The block the view currently holds for an id, so staleness can retitle. */
  blockAt(blockId: string): Block | null;
  move(motion: DocumentViewMotion): boolean;
  /** `Esc`. Appends nothing — B03 §2, and there is no entry to touch (I45). */
  pop(): boolean;
  /** The command this view was opened for, or `null` when nothing is open. */
  readonly openFor: string | null;
}

/**
 * **C13's `PatchOutcome` arms, deliberately** — minus `rev`, which is an entry's.
 *
 * The same discriminants because `streamInto` branches on them: a malformed
 * patch says one thing to the reader and an already-gone target says another,
 * and a loop that could not tell them apart would append the wrong notice. A
 * shape of its own here rather than C13's type imported, because `rev` has no
 * meaning for a view and a field that is always the same number is a field
 * somebody will read.
 */
export type DocumentViewPatch =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "closed" | "layer" | "project" }>
  | Readonly<{ ok: false; reason: "patch"; error: ErrorLike }>;

type State = Readonly<{ command: string; blocks: readonly Block[]; offset: number }>;

/**
 * The `meta` a held document is given so `applyPatch` can take it.
 *
 * **Never read.** `applyPatch` is pure over `blocks` and this route has no
 * transport, no exit code and no duration — the entry route's `meta` comes from
 * a `RawResult` and a stream has none until it ends. Written once here rather
 * than invented per patch, so nothing downstream can mistake it for provenance.
 */
const EMPTY_META: ViewDocument["meta"] = Object.freeze({
  verb: null,
  adapter: "document-view",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [],
  stderr: "",
  transport: "local",
  origin: "user",
});

export function createDocumentView(deps: DocumentViewDeps): DocumentView {
  let state: State | null = null;

  const waiting = (command: string): readonly Block[] =>
    Object.freeze([b.spinner(`${command} — running`, { id: WAITING_ID })]);

  /**
   * The blocks that fit, from `offset`.
   *
   * **At least one block, always.** A block taller than the whole region would
   * otherwise window to nothing, and an empty view is indistinguishable from a
   * broken one. This is the one place the block-boundary rule and the region
   * can genuinely disagree, and showing the block is **half** the honest answer;
   * saying that it was cut is the other half (I47).
   *
   * **This comment used to cite `Placed.truncated` as the mechanism reporting
   * the overflow, and nothing here read it.** C19's menu does (C19 §5); this
   * file named the field, named what it was for, and had no consumer of it —
   * which reads exactly like a file that reads it. The fact is now stated on
   * screen, and from this projection's own measurement rather than from a
   * second layout: a row count and the region are what C15 compares too, and
   * `deps.measure` is deliberately the same registry so the two cannot drift.
   */
  const project = (at: State): readonly Block[] => {
    const { width, height } = deps.region();
    const from = Math.max(0, Math.min(at.offset, at.blocks.length - 1));
    const out: Block[] = [];
    let used = 0;
    for (let i = from; i < at.blocks.length; i += 1) {
      const block = at.blocks[i] as Block;
      // The candidate sequence, because what a block costs depends on what is
      // beside it. Asking the block alone is what put the separator rows
      // outside the arithmetic.
      const rows = deps.measureSequence([...out, block], width);
      if (out.length > 0 && rows > height) break;
      out.push(block);
      used = rows;
    }
    // **I47 — overflow here means exactly one block, and that is a consequence
    // rather than a test.** The loop breaks before a second block can push
    // `used` past the region, so `used > height` can only be the first block
    // exceeding it alone. Guarding on `out.length !== 1` as well reads as
    // caution and is a clause nothing can make false — A03 §2's vacuity class,
    // caught by a mutation that swapped it out and failed nothing.
    //
    // That single block is the unscrollable case: the offset indexes blocks, so
    // there is no second offset to move to and the rows past the region are
    // reachable by no key. More blocks below is *not* this — `n` reaches those,
    // and an indicator there would cry wolf.
    const only = out[0];
    if (only === undefined || used <= height) return Object.freeze(out);
    return Object.freeze([notice(used, height, width), only]);
  };

  /**
   * The I47 indicator, **above the block it describes**.
   *
   * Below is where it belongs by reading order and where it cannot go: the
   * block is taller than the region, so anything after it sits past row
   * `height` and is the first thing cut. An indicator that the truncation
   * truncates is A03 §2's vacuity class wearing a glyph. The implementation
   * settled this, not the walk — the walk ruled that the view says so and had
   * no reason to think about where.
   *
   * Two passes, because the indicator's own height decides how much of the
   * block is shown and therefore the number it states. Measured rather than
   * assumed to be one row: it wraps at a narrow width, and a hard-coded 1 would
   * overstate what the reader can see by exactly the rows the wrap cost.
   */
  const notice = (rows: number, height: number, width: number): Block => {
    const build = (hidden: number): Block =>
      b.notice.warn(
        `${String(hidden)} more rows — this block is taller than the screen, and `
          + `n/p move by block so they cannot reach them`,
        { id: TRUNCATED_ID },
      );
    let self = 1;
    for (let pass = 0; pass < 2; pass += 1) {
      const candidate = build(rows - Math.max(0, height - self));
      const measured = deps.measureSequence([candidate], width);
      if (measured === self) return candidate;
      self = measured;
    }
    return build(rows - Math.max(0, height - self));
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
    for (let i = at.blocks.length - 1; i >= 0; i -= 1) {
      if (deps.measureSequence(at.blocks.slice(i), width) > height) {
        return Math.min(i + 1, at.blocks.length - 1);
      }
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

    patch(view) {
      const at = state;
      if (at === null) return { ok: false, reason: "closed" };
      // A whole `ViewDocument` is what `applyPatch` takes, and the view holds
      // blocks and an offset. The command is carried so a `document` patch —
      // which replaces the lot — cannot silently rename what the view is for.
      const held: ViewDocument = {
        schema: "tui.view/1",
        command: at.command,
        status: "ok",
        blocks: at.blocks,
        meta: EMPTY_META,
      };
      const result = applyPatch(held, view);
      if (!result.ok) return { ok: false, reason: "patch", error: result.error };

      /**
       * **A follow keeps the bottom, and only if it had it** (I48).
       *
       * `lastOffset` is computed against the *old* block list, so this asks
       * *were we at the end before this arrived* — which is the question tail
       * semantics turn on. A reader who has scrolled up is reading, and moving
       * the window under them is the same failure as never moving it.
       *
       * **Through `followTail`, which `ScrollOffsets` shares** (C04 I97). The
       * comparison used to be written here and was about to be written a second
       * time in rows; two copies of `>=` are two places for one to become `>`.
       */
      const grown: State = { ...at, blocks: result.doc.blocks };
      const candidate: State = {
        ...grown,
        offset: followTail(at.offset, lastOffset(at), lastOffset(grown)),
      };
      // Both assigned together or neither, for `putBlock`'s reason: a throw
      // between the document and the projection leaves the owner holding a
      // document no frame ever displayed.
      let content: readonly Block[];
      try {
        content = project(candidate);
      } catch {
        return { ok: false, reason: "project" };
      }
      state = candidate;
      if (!deps.overlays.update(DOCUMENT_VIEW_ID, { content })) {
        return { ok: false, reason: "layer" };
      }
      deps.redraw();
      return { ok: true };
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
