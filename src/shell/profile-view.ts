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
 * **A window, because a card is not always a screen's worth** (C28 I51, F947). The
 * overview as first built measured 40 rows at twelve frames through the
 * registry that draws it — the 28 F947 recorded was a bare registry measuring
 * a plot as its JSON (F959) — over the 24-row region the harness has, and C15
 * clips what does not fit without drawing anything to say so (C15 I8). The
 * projection is `document-view.ts`'s written a second time — block boundaries,
 * the registry's `measureSequence` over the candidate sequence, at least one
 * block — and the duplication is recorded in C28 §3c rather than resolved,
 * because extracting it edits a file this round does not own.
 *
 * **And the overview no longer needs the window at 24 rows** (C28 I52): it
 * measures 23 rows or fewer at 80 columns for every report, which is this
 * region minus the header below. The header carries no gap for the same
 * reason — it drew a blank first row on every page of every card.
 */
import type { Block } from "../data/viewmodel/index.js";
import { glyphs } from "../presentation/blocks/index.js";
import type { GlyphCaps } from "../presentation/blocks/index.js";
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";
import { b } from "./builders/index.js";
import { warnNotice } from "./documents.js";
import { SECTIONS, deckOf, profileDeck } from "./profiling/panes/index.js";
import type { ProfileSection } from "./profiling/panes/index.js";
import { TIER_RANK } from "./profiling/types.js";
import type { ProfileReport, Profiler, Tier } from "./profiling/types.js";

/** The layer id. One view at a time — C15 I1 forbids nesting. */
export const PROFILE_VIEW_ID = "profile-view";

/**
 * How often the open view redraws itself (C28 I51).
 *
 * The sampler's default cadence (`ProfileOptions.sampleMs`) and the 1 Hz
 * readout C23 I64 already runs, so the memory cards are never more than one
 * sample behind. **Never per frame**: a view that redrew on every frame would
 * raise the frame that redraws it, and the loop would be the profiler measuring
 * itself.
 */
export const VIEW_REFRESH_MS = 1000;

/** The header's id, and the hidden-rows notice's. Reserved so a card cannot collide (C04 I14). */
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
   * The deck defaults to an ASCII arm for a caller with no terminal; a view has
   * one, and `·` is `East_Asian_Width=Ambiguous`, so the default is the one arm
   * a real terminal must never get.
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
   * Raise the view on `section`, raising the tier to `spans` if it is below.
   *
   * Returns a refusal string, or `null` when the view opened — the other two
   * owners' convention, and for their reason: the caller is a local handler,
   * which answers in a document and cannot report a throw.
   */
  open(section?: ProfileSection): string | null;
  /**
   * `n`/`p` — the view's own unit is the **card** (C16 I24, C28 §3c).
   *
   * Walks the whole deck: past the last card of a section it lands on the first
   * of the next, and clamps at the two ends of the deck rather than wrapping.
   * The groups are contiguous and the header names which one is up, so crossing
   * a boundary is a thing a reader can see happen (§3c).
   */
  nextCard(direction: 1 | -1): boolean;
  /**
   * `tab`/`⇧tab` — the view's **section**, which here is a group (C16 I33).
   *
   * Answers `false` at the last section exactly as a one-section owner does;
   * what separates them is the header, not the return (I33).
   */
  sectionNext(): boolean;
  sectionPrev(): boolean;
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
  /** The open section, or `null` — the one read `keys.ts` needs to pick the owner. */
  readonly section: ProfileSection | null;
}

type State = {
  /**
   * The address, and it is `(section, index-within-section)` rather than a
   * global ordinal (C28 I58, §9b B18): the per-frame cards hold one entry per
   * retained frame, `worst` is recomputed on every `report()`, and a global
   * ordinal therefore names a different card after a tick the reader did not
   * cause.
   */
  section: ProfileSection;
  index: number;
  /** The tier `open` found, when it raised; `null` when it did not (I50). */
  before: Tier | null;
  /** The last card drawn, kept so a motion re-windows without a new report. */
  blocks: readonly Block[];
  offset: number;
};

const isSection = (x: unknown): x is ProfileSection =>
  typeof x === "string" && (SECTIONS as readonly string[]).includes(x);

export function createProfileView(deps: ProfileViewDeps): ProfileView {
  let state: State | null = null;
  let timer: Disposable | null = null;
  const sep = glyphs(deps.capabilities).separator;

  /**
   * The card at the address, with a header naming the section and the position.
   *
   * **The region is handed down and not discovered** (C28 §3c): a card solves
   * for the height whose `plotHeight` fits, and the row the header takes is the
   * row the card must not ask for — a deck that measured against the whole
   * region drew every `axes: true` card three rows past the bottom (F1133).
   */
  const deckBlocks = (report: ProfileReport, at: State): readonly Block[] => {
    const { width, height } = deps.region();
    return profileDeck(report, at.section, at.index, { w: width, rows: height - 1 }, deps.capabilities);
  };

  /**
   * The one-row header, and it is **chrome rather than a block in the window**.
   *
   * A card is one `panel`, so the windowed sequence is one block long — and a
   * projection that treated the header as its first member showed the header
   * alone at any region the card did not fit in, leaving the reader to page down
   * to reach the figure they opened. The header names the section and the
   * position, which are the two things a reader needs *while* looking at a card
   * that does not fit, so it is drawn first and always (C28 §3c).
   */
  const headerFor = (report: ProfileReport, at: State): Block => {
    const deck = deckOf(report, at.section);
    const i = Math.max(0, Math.min(at.index, deck.length - 1));
    return b.rule(
      `profiler ${sep} ${at.section}`,
      `${String(i + 1)}/${String(Math.max(1, deck.length))}`,
      {
        id: HEADER_ID,
        // One row, not two: the builder's default gap is a blank row above the
        // first thing on the screen (C28 I52).
        gapBefore: false,
      },
    );
  };

  /**
   * The layer's content: the header, then the window on the card.
   *
   * **One `report()` per draw, taken by the caller and handed to both halves.**
   * The first cut had the header and the card each pull their own, which is two
   * readings a second of a report that costs something to produce (I48) and, on
   * an injected clock that advances per read, two readings that differ — a
   * header describing a deck of one length above a card resolved against
   * another. The call sites below take it once, inside `own` (I49).
   */
  const contentFor = (report: ProfileReport, at: State): readonly Block[] =>
    Object.freeze([headerFor(report, at), ...project(at.blocks, at.offset)]);

  /** How many cards the section holds right now — a function of the report (I58). */
  const deckLength = (report: ProfileReport, section: ProfileSection): number =>
    Math.max(1, deckOf(report, section).length);

  /**
   * The blocks that fit, from `offset` — `document-view.ts`'s projection.
   *
   * At least one block, always: a block taller than the region would otherwise
   * window to nothing. That one block is shown under a notice saying how many
   * rows are hidden (C15 I8) — **without** the document view's *n/p move by
   * block* clause, because here `n`/`p` switch cards and the sentence would be
   * false (C28 §9b B5).
   */
  const project = (blocks: readonly Block[], offset: number): readonly Block[] => {
    const { width } = deps.region();
    // The header's row is spent before the window sees the region, which is the
    // same row the card was built against.
    const height = deps.region().height - 1;
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
    const { width } = deps.region();
    const height = deps.region().height - 1;
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
    // **`blocking: true`, and the mechanical mapping got this wrong** (C15 §2c,
    // C16 I8). The old value was `dismissable: true` and the comment above says
    // why that was not the whole answer: the layer was modal by `coversRegion`,
    // the geometry standing in for a field that did not exist. Mapping the flag
    // alone dropped the second half and the view stopped owning input. It is
    // escapable **and** blocking, which is the combination the single flag could
    // not hold and the pair exists for.
    blocking: true,
    dismissal: "escape",
  });

  /**
   * Redraw in place, **inside the bracket** (C28 I49).
   *
   * `update` and the commit together: the seam reads `ownDepth` when the commit
   * reaches it, so a bracket that closed before `redraw` would mark nothing.
   */
  const render = (
    profiler: Profiler,
    at: State,
    reason: "input" | "stream",
    report: ProfileReport,
  ): void => {
    profiler.own(() => {
      deps.overlays.update(PROFILE_VIEW_ID, { content: contentFor(report, at) });
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
      const report = profiler.report();
      at.blocks = deckBlocks(report, at);
      render(profiler, at, "stream", report);
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

  /** `tab`/`⇧tab` — one group, clamped at both ends (C16 I33). */
  const shiftSection = (direction: 1 | -1): boolean => {
    const at = state;
    const profiler = deps.profiler;
    if (at === null || profiler === null) return false;
    // Clamps, never wraps, for C25 §3c A3's reason one view over: wrapping
    // loses the reader's place silently.
    const i = SECTIONS.indexOf(at.section);
    const next = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, i + direction))];
    if (next === undefined || next === at.section) return false;
    at.section = next;
    at.index = 0;
    at.offset = 0;
    const report = profiler.report();
    at.blocks = deckBlocks(report, at);
    render(profiler, at, "input", report);
    return true;
  };

  return {
    get section() {
      return state?.section ?? null;
    },

    open(section = "verdict") {
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
      if (!isSection(section)) {
        return `no section \`${String(section)}\` — one of ${SECTIONS.join(", ")}`;
      }

      const found = profiler.tier;
      const raise = TIER_RANK[found] < TIER_RANK.spans;
      if (raise) profiler.setTier("spans");
      const at: State = { section, index: 0, before: raise ? found : null, blocks: [], offset: 0 };
      state = at;
      profiler.own(() => {
        const report = profiler.report();
        at.blocks = deckBlocks(report, at);
        deps.overlays.push(layerFor(contentFor(report, at)));
        deps.redraw("input");
      });
      arm(profiler);
      return null;
    },

    nextCard(direction) {
      const at = state;
      const profiler = deps.profiler;
      if (at === null || profiler === null) return false;
      // **Clamped against the deck as it is now**, not as it was when the card
      // opened: a frame leaving `worst` shortens the section under a reader who
      // has pressed nothing (I58). One report, read once, for the clamp and for
      // the drawing both.
      const report = profiler.report();
      const here = Math.max(0, Math.min(at.index, deckLength(report, at.section) - 1));
      const wanted = here + direction;
      const s = SECTIONS.indexOf(at.section);
      if (wanted < 0) {
        // Off the top of a section — the previous section's **last** card, so
        // `n` and `p` are inverses across a boundary. Clamps at the deck's end.
        const prev = SECTIONS[s - 1];
        if (prev === undefined) return false;
        at.section = prev;
        at.index = deckLength(report, prev) - 1;
      } else if (wanted >= deckLength(report, at.section)) {
        const next = SECTIONS[s + 1];
        if (next === undefined) return false;
        at.section = next;
        at.index = 0;
      } else {
        at.index = wanted;
      }
      at.offset = 0;
      at.blocks = deckBlocks(report, at);
      render(profiler, at, "input", report);
      return true;
    },

    sectionNext: () => shiftSection(1),
    sectionPrev: () => shiftSection(-1),

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
      // **A motion re-windows and does not re-report** (I48): the card the
      // reader is paging is the card they are looking at, and a fresh report
      // mid-page would move the figure under the window.
      render(profiler, at, "input", profiler.report());
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
