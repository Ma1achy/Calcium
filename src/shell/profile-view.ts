/**
 * C28 §3c — the profiler's view, and the third owner of a `kind: "view"` layer.
 *
 * `patch-view.ts` and `document-view.ts` are the precedents and this follows
 * their shape: one layer with a stable id, refused rather than thrown when the
 * stack is not empty (C15 I1's refusal is a throw, reached from a handler with
 * nowhere to report it), updated in place (C15 I14), popped by its owner.
 *
 * **What is different is what the owner holds.** A patch view holds an offset;
 * this holds a profiler tier it raised and a timer it armed, and both outlive a
 * layer that was removed by someone else. C16's ⌃c ladder answers a pushed view
 * with `overlays.pop()` (`router.ts`'s `pushedView` rung, through
 * `construct.ts`'s `popLayer`) and never calls an owner — measured on the
 * document view: after that call its `openFor` still names its command over an
 * empty stack (F944). For this owner the same shape is a tier raised for the
 * rest of the session and a timer firing every second into an `update` that
 * returns `false`. So the teardown runs from C15's change stream (C15 I25) and
 * `pop()` is one more caller of it, not a second copy (C28 I50).
 *
 * **Every commit this raises is the profiler's own** (C28 I49, I12). The commit
 * seam in `construct.ts` passes `false` for what it knows and reads
 * `profiler.own`'s bracket; a view that redrew outside the bracket would inflate
 * every figure it draws by the cost of drawing it, which is the reading I12
 * exists to end. On the timer and on a key alike.
 *
 * **A window, because the pane is not a screen's worth** (C28 I51, F947). The
 * overview measures 28 rows against a bare 12-frame fixture, over the 24-row
 * region the harness has, and C15 clips what does not fit without drawing
 * anything to say so (C15 I8). The projection is `document-view.ts`'s written a
 * second time — block boundaries, the registry's `measureSequence` over the
 * candidate sequence, at least one block — and the duplication is recorded in
 * C28 §3c rather than resolved, because extracting it edits a file this round
 * does not own.
 */
import type { Block } from "../data/viewmodel/index.js";
import { glyphs } from "../presentation/blocks/index.js";
import type { GlyphCaps } from "../presentation/blocks/index.js";
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";
import { b } from "./builders/index.js";
import { warnNotice } from "./documents.js";
import { PANES, paneTitle, profilePane } from "./profiling/panes.js";
import type { PaneName } from "./profiling/panes.js";
import { TIER_RANK } from "./profiling/types.js";
import type { Profiler, Tier } from "./profiling/types.js";

/** The layer id. One view at a time — C15 I1 forbids nesting. */
export const PROFILE_VIEW_ID = "profile-view";

/**
 * How often the open view redraws itself (C28 I51).
 *
 * The sampler's default cadence (`ProfileOptions.sampleMs`) and the 1 Hz
 * readout C23 I64 already runs, so the memory pane is never more than one
 * sample behind. **Never per frame**: a view that redrew on every frame would
 * raise the frame that redraws it, and the loop would be the profiler measuring
 * itself.
 */
export const VIEW_REFRESH_MS = 1000;

/** The header's id, and the hidden-rows notice's. Reserved so a pane cannot collide (C04 I14). */
const HEADER_ID = "profile-view-header";
const HIDDEN_ID = "profile-view-hidden";

export type ProfileViewMotion = "top" | "bottom" | "pageUp" | "pageDown";

export type ProfileViewDeps = Readonly<{
  overlays: OverlayManager;
  /** `null` when the session was built without one; `open` then refuses (C23 I68). */
  profiler: Profiler | null;
  /**
   * The terminal's, whole (C09 I49, F828).
   *
   * `profilePane` defaults to an ASCII arm for a caller with no terminal; a view
   * has one, and `·` is `East_Asian_Width=Ambiguous`, so the default is the one
   * arm a real terminal must never get.
   */
  capabilities: GlyphCaps;
  /** The registry's, so the window agrees with what C15 places (C09 I1). */
  measureSequence: (blocks: readonly Block[], width: number) => number;
  /** The region a view fills, which is the whole of it (C15 §4). */
  region: () => Readonly<{ width: number; height: number }>;
  /** `Ambient.schedule` — the seam the sampler already uses (C28 §4). */
  schedule: (fn: () => void, ms: number) => Disposable;
  /**
   * A frame. `stream` from the timer, `input` from a key — C03's reasons, so a
   * keypress is served on the keypress's terms and a tick on a stream's.
   */
  redraw: (reason: "input" | "stream") => void;
}>;

export interface ProfileView {
  /**
   * Raise the view on `pane`, raising the tier to `spans` if it is below.
   *
   * Returns a refusal string, or `null` when the view opened — the other two
   * owners' convention, and for their reason: the caller is a local handler,
   * which answers in a document and cannot report a throw.
   */
  open(pane?: PaneName): string | null;
  /** `n`/`p` — the view's own unit is the pane (C28 §3c). Clamps at the ends. */
  switchPane(direction: 1 | -1): boolean;
  /** The window's motions, by name (C16 §6). */
  move(motion: ProfileViewMotion): boolean;
  /** `Esc`. Dismisses the layer and runs the same teardown a non-owner's `pop()` reaches. */
  pop(): boolean;
  /**
   * The session is ending: stop the timer, drop the subscription, **leave the
   * tier** (C28 I50, §9b S5). The profiler is disposed before the graph's
   * cleanup runs, so a restore would be a no-op; against a live one it would
   * reset a ring nobody has read.
   */
  dispose(): void;
  /** The open pane, or `null` — the one read `keys.ts` needs to pick the owner. */
  readonly pane: PaneName | null;
}

type State = {
  pane: PaneName;
  /** The tier `open` found, when it raised; `null` when it did not (I50). */
  before: Tier | null;
  /** The last pane drawn, kept so a motion re-windows without a new report. */
  blocks: readonly Block[];
  offset: number;
};

const isPane = (x: unknown): x is PaneName =>
  typeof x === "string" && (PANES as readonly string[]).includes(x);

export function createProfileView(deps: ProfileViewDeps): ProfileView {
  let state: State | null = null;
  let timer: Disposable | null = null;
  const sep = glyphs(deps.capabilities).separator;

  /** The pane, with a header naming it — `paneTitle`'s first consumer (C24 I33). */
  const paneBlocks = (profiler: Profiler, pane: PaneName): readonly Block[] => {
    const i = PANES.indexOf(pane);
    return Object.freeze([
      b.rule(`profiler ${sep} ${paneTitle(pane)}`, `${String(i + 1)}/${String(PANES.length)}`, {
        id: HEADER_ID,
      }),
      ...profilePane(profiler.report(), pane, deps.capabilities),
    ]);
  };

  /**
   * The blocks that fit, from `offset` — `document-view.ts`'s projection.
   *
   * At least one block, always: a block taller than the region would otherwise
   * window to nothing. That one block is shown under a notice saying how many
   * rows are hidden (C15 I8) — **without** the document view's *n/p move by
   * block* clause, because here `n`/`p` switch panes and the sentence would be
   * false (C28 §9b B5).
   */
  const project = (blocks: readonly Block[], offset: number): readonly Block[] => {
    const { width, height } = deps.region();
    const from = Math.max(0, Math.min(offset, blocks.length - 1));
    const out: Block[] = [];
    let used = 0;
    for (let i = from; i < blocks.length; i += 1) {
      const block = blocks[i] as Block;
      const rows = deps.measureSequence([...out, block], width);
      if (out.length > 0 && rows > height) break;
      out.push(block);
      used = rows;
    }
    const only = out[0];
    if (only === undefined || used <= height) return Object.freeze(out);
    return Object.freeze([hidden(used, height, width), only]);
  };

  /** Two passes, because the notice's own height decides how much it hides. */
  const hidden = (rows: number, height: number, width: number): Block => {
    const build = (n: number): Block =>
      warnNotice(`${String(n)} more rows — this block is taller than the screen`, HIDDEN_ID);
    let self = 1;
    for (let pass = 0; pass < 2; pass += 1) {
      const candidate = build(rows - Math.max(0, height - self));
      const measured = deps.measureSequence([candidate], width);
      if (measured === self) return candidate;
      self = measured;
    }
    return build(rows - Math.max(0, height - self));
  };

  /** The last offset from which the tail still fills the region, or 0. */
  const lastOffset = (blocks: readonly Block[]): number => {
    const { width, height } = deps.region();
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (deps.measureSequence(blocks.slice(i), width) > height) {
        return Math.min(i + 1, blocks.length - 1);
      }
    }
    return 0;
  };

  const layerFor = (content: readonly Block[]): Layer => ({
    id: PROFILE_VIEW_ID,
    kind: "view",
    placement: { kind: "fill" },
    content,
    // `Esc` pops it, which is what makes C16 §4's coverage clause necessary: a
    // dismissable layer takes the permissive branch, and this one covers the
    // region.
    dismissable: true,
  });

  /**
   * Redraw in place, **inside the bracket** (C28 I49).
   *
   * `update` and the commit together: the seam reads `ownDepth` when the commit
   * reaches it, so a bracket that closed before `redraw` would mark nothing.
   */
  const render = (profiler: Profiler, at: State, reason: "input" | "stream"): void => {
    profiler.own(() => {
      deps.overlays.update(PROFILE_VIEW_ID, { content: project(at.blocks, at.offset) });
      deps.redraw(reason);
    });
  };

  const arm = (profiler: Profiler): void => {
    timer = deps.schedule(() => {
      timer = null;
      const at = state;
      // A tick that finds the view closed does nothing and re-arms nothing;
      // the disposal in `closed` is the mechanism and this is the belt.
      if (at === null) return;
      at.blocks = paneBlocks(profiler, at.pane);
      render(profiler, at, "stream");
      arm(profiler);
    }, VIEW_REFRESH_MS);
  };

  /**
   * The teardown, and the only one (C28 I50, §9b S3–S4).
   *
   * Reached from the subscription below for every removal — `Esc` through
   * `pop()`, the ⌃c ladder's `overlays.pop()`, a disposable — and idempotent, so
   * `pop()` calling it after its own `dismiss` has already run it is a no-op.
   * The tier is restored **only if opening raised it**: `setTier` resets the
   * ring (C28 I18), and the recorder's short-circuit on an unchanged tier is a
   * guard one component away that this file must not lean on (§9b B2).
   */
  const closed = (): boolean => {
    const at = state;
    if (at === null) return false;
    state = null;
    timer?.[Symbol.dispose]();
    timer = null;
    const profiler = deps.profiler;
    if (profiler !== null && at.before !== null) profiler.setTier(at.before);
    if (profiler !== null) profiler.own(() => void deps.redraw("input"));
    return true;
  };

  const subscription = deps.overlays.subscribe((change) => {
    // Filtered on the id: a menu or a confirm popped above the view carries its
    // own id, and a teardown on *any* removal would close the view under it
    // (§9b S11).
    if ((change.kind === "pop" || change.kind === "dismiss") && change.id === PROFILE_VIEW_ID) {
      closed();
    }
  });

  return {
    get pane() {
      return state?.pane ?? null;
    },

    open(pane = "overview") {
      const profiler = deps.profiler;
      if (profiler === null) {
        return "no profiler to show — this session was built without `TuiConfig.profile`";
      }
      // Before the stack check, so a second `open` while open cannot re-raise
      // and overwrite the tier the first one found (§9b S7).
      if (state !== null) return "close the profiler view before opening it again";
      // C15 throws on a view over a non-empty stack (C15 I1), and this is
      // reached from C23 rather than from a keymap, so the stack is checked
      // rather than caught.
      if (deps.overlays.top !== null) return "close what is open before opening the profiler";
      if (!isPane(pane)) return `no pane \`${String(pane)}\` — one of ${PANES.join(", ")}`;

      const found = profiler.tier;
      const raise = TIER_RANK[found] < TIER_RANK.spans;
      if (raise) profiler.setTier("spans");
      const at: State = { pane, before: raise ? found : null, blocks: [], offset: 0 };
      state = at;
      profiler.own(() => {
        at.blocks = paneBlocks(profiler, pane);
        deps.overlays.push(layerFor(project(at.blocks, 0)));
        deps.redraw("input");
      });
      arm(profiler);
      return null;
    },

    switchPane(direction) {
      const at = state;
      const profiler = deps.profiler;
      if (at === null || profiler === null) return false;
      // Clamps, never wraps, for C25 §3c A3's reason one view over: wrapping
      // loses the reader's place silently.
      const i = PANES.indexOf(at.pane);
      const next = PANES[Math.max(0, Math.min(PANES.length - 1, i + direction))];
      if (next === undefined || next === at.pane) return false;
      at.pane = next;
      at.offset = 0;
      at.blocks = paneBlocks(profiler, next);
      render(profiler, at, "input");
      return true;
    },

    move(motion) {
      const at = state;
      const profiler = deps.profiler;
      if (at === null || profiler === null) return false;
      const end = lastOffset(at.blocks);
      const page = Math.max(1, project(at.blocks, at.offset).length);
      const wanted = ((): number => {
        switch (motion) {
          case "top":
            return 0;
          case "bottom":
            return end;
          case "pageUp":
            return at.offset - page;
          case "pageDown":
            return at.offset + page;
        }
      })();
      const next = Math.max(0, Math.min(wanted, end));
      if (next === at.offset) return false;
      at.offset = next;
      render(profiler, at, "input");
      return true;
    },

    pop() {
      if (state === null) return false;
      // The dismiss emits synchronously and the subscription runs `closed`;
      // calling it again here is the idempotent belt for the day a manager
      // emits late (C15 I25 says it does not, and C15 T6.23 is the row).
      deps.overlays.dismiss(PROFILE_VIEW_ID, "explicit");
      closed();
      return true;
    },

    dispose() {
      timer?.[Symbol.dispose]();
      timer = null;
      subscription[Symbol.dispose]();
      state = null;
    },
  };
}
