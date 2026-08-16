/**
 * `ctx.ask` — a question a local handler awaits (C23 I36, C16 I25).
 *
 * L4's, because it is a sequence across three components and nothing below may
 * hold it: C15 owns the layer, C16 routes the keys, C23 suspends the handler.
 * That is A02 Seam 4's shape and the reason this file is here rather than in any
 * of them.
 *
 * **The layer is pushed `dismissable: false` and the user can still escape it**,
 * which is not the contradiction it reads as. C15's flag says *the router may not
 * discard this layer without telling its owner* — and it may not, because
 * discarding it silently leaves the awaiting handler pending forever. `Esc` and
 * `⌃c` are escapes the **owner** performs, resolving with the default choice
 * (C23 I36). The word means two things and the layer needs opposite answers to
 * them; the flag only ever answered the second. See DOCKER_TUI_COMPLETION.md
 * Ruling A, where the two were one word.
 *
 * **Placement is `centred`** — C15 §`Placed` carries `left` precisely so a
 * centred confirm's horizontal extent is recoverable for hit-testing, so the
 * shape was anticipated there before anything raised one.
 */

import { block } from "../data/viewmodel/construct.js";
import type { Block } from "../data/viewmodel/types.js";
import type { InputEvent } from "../interaction/router/types.js";
import type { Layer, OverlayManager, Placement } from "../viewport/overlay/index.js";
import type { AskOptions, Choice } from "./local/registry.js";
import { cells } from "../presentation/text.js";
import { createChoiceSelection, defaultStart } from "./choice-selection.js";

export const CONFIRM_LAYER_ID = "confirm";

/**
 * How wide the question asks to be.
 *
 * A request rather than a measurement: C15 clamps it to the region, and a
 * producer that measured its own content would need the block registry, which
 * this file deliberately does not have.
 *
 * **72 rather than 56, and the frame decided it.** A destructive confirm carries
 * a table of what it will remove (Ruling C), and at 56 the second column
 * truncated to `Exited …` — losing when the container stopped and whether it had
 * failed, which is exactly the information a reader is being asked to weigh. The
 * question fitted; the evidence did not.
 */
export const CONFIRM_WIDTH = 72;

export type ConfirmDeps = Readonly<{
  overlays: OverlayManager;
  /**
   * The prompt's own span, for an anchored question (`AskOptions.placement`).
   *
   * The same seam C19's menu takes, and for its reason: `rows` is the prompt's
   * extent rather than 1, because a two-row prompt has no single row that
   * places an overlay correctly and both wrong answers produce a placement
   * whose every number is self-consistent (C15 I17).
   *
   * Read at `ask` time and not held: it is a fact about the frame, and the
   * frame moves.
   */
  anchor: () => Readonly<{ row: number; rows: number }>;
  /**
   * The region C15 places against, for the truncation pass (entry 16 R2).
   *
   * The same seam C19's menu takes. How much fits is a fact about the frame and
   * C15 answers it only once the layer is on the stack, so this is a second
   * pass rather than an argument to the first.
   */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  /** The frame is L4's to commit; C15 never paints (A02 Seam 4). */
  invalidate: () => void;
}>;

export interface ConfirmHost {
  /** C23 I36 — resolves with a choice on every path, never null. */
  ask(opts: AskOptions): Promise<string>;
  /**
   * C16 I25 — the top layer's answer handler, or null.
   *
   * **Read from the top only, never searched down the stack**, for the reason
   * C15 `pop()` gives: a question raised over a completion menu must not be
   * answered by the menu.
   */
  answerHandler(): ((e: InputEvent) => boolean) | null;
  /** Whether a question is open — C22 refuses a submission while one is. */
  readonly open: boolean;
}

/**
 * The choice a bare `Enter` takes, and the one `Esc` and `⌃c` resolve with.
 *
 * **Falls back to the last choice rather than the first when none is marked.**
 * For a destructive verb the safe option is conventionally last (`yes`, `no`),
 * and a default that silently means *the first thing offered* is the wrong way
 * for this to fail. Callers in this repository always mark one; the fallback is
 * for a caller that forgets, and it should forget safely.
 */
function defaultChoice(choices: readonly Choice[]): Choice {
  // **Through `defaultStart`, because it is the same rule.** *The marked one,
  // else the last* was written twice — once for where the selection opens and
  // once for what `Esc` resolves with — and two records of one fact disagree
  // eventually. They must agree by construction: a question that opens on `no`
  // and escapes to `yes` is the worst possible pair.
  return choices[defaultStart(choices)]!;
}

/**
 * The choices, as a table rather than as written text (entry 16 A5).
 *
 * **Three columns, and the first holds nothing but the marker.** A glyph is part
 * of a cell's width rather than an addition to it (`table/cells.ts:123`), so a
 * marker sharing the key's cell would shift the selected row two columns left of
 * the others — the alignment the `raw` form got by padding with a space.
 *
 * **The marker is `bullet` and it used to be `expand`, which is a collision the
 * `raw` form concealed.** C11 renders `expand`/`collapse` for a row that can be
 * opened (`table/cells.ts:91`), so `▸` inside a table row already means
 * *expandable* to the same renderer. While the choices were text nothing could
 * notice; as blocks the two meanings arrive in one place. `bullet` is what the
 * completion menu marks a selected row with, and one marker across the popups is
 * the drift this entry exists to close.
 *
 * And the capability is gone from this file with the written character: a `raw`
 * block carries text where a cell carries a slot, so L1 substitutes and L4 never
 * spells the glyph (C09 I22, F122).
 */
function choiceBlock(choices: readonly Choice[], selected: number): Block {
  return block({
    kind: "table",
    id: "confirm-choices",
    gapBefore: true,
    columns: [
      { key: "mark", label: "", align: "left", priority: 3, minWidth: 1, sortable: false },
      { key: "key", label: "", align: "left", priority: 2, minWidth: keyWidth(choices), sortable: false },
      { key: "label", label: "", align: "left", priority: 1, minWidth: 1, flex: true, sortable: false },
    ],
    rows: choices.map((c, i) => ({
      id: `confirm-choice-${c.key}`,
      cells: {
        mark: { text: "", ...(i === selected ? { glyph: "bullet" as const } : {}) },
        key: { text: `[${c.key}]` },
        label: { text: c.label },
      },
    })),
    showHeader: false,
  });
}

/** The widest `[k]`, so the labels line up whatever the accelerators are. */
function keyWidth(choices: readonly Choice[]): number {
  let widest = 1;
  // narrow-ok — a choice's `key` is the keyboard key that selects it, so it
  // is one ASCII character by construction (C15's confirm builder refuses
  // anything a keystroke cannot produce).
  for (const c of choices) widest = Math.max(widest, cells(c.key) + 2); // narrow-ok
  return widest;
}

/**
 * Whether the placement could not hold the question (C15 I8).
 *
 * `Placed.truncated` and nothing more, which is the whole of what is portable:
 * the menu can say *how many* because it holds its own candidates, and this
 * file holds a caller's block and no registry — `CONFIRM_WIDTH` is a request
 * rather than a measurement for exactly that reason.
 */
function truncated(deps: ConfirmDeps): boolean {
  const placed = deps.overlays
    .layout(deps.overlayRegion())
    .find((p) => p.layer.id === CONFIRM_LAYER_ID);
  return placed?.truncated ?? false;
}

/**
 * The question, its payload and its choices — or the question, `…` and its
 * choices when the region cannot hold them all.
 *
 * **The payload is dropped rather than marked, and a frame is what decided
 * it.** `composite.ts` writes `lines[0 … height)`, so a box that does not fit
 * loses its *tail* — and this box's tail is the choices. Measured on an
 * ordinary 24-row terminal with a twenty-row detail: the reader was shown the
 * question and ten rows of payload, and **no `[y]`, no `[n]` and no bottom
 * border.** A question with its answers cut off, with the keys still working
 * and nothing on screen saying so.
 *
 * So an appended indicator was never the shape: an extra row at the end is the
 * first thing lost. Replacing the payload is what fits, and it costs the reader
 * only what they could not read anyway — the alternative, shrinking the detail,
 * needs a measurement this file cannot make.
 */
function render(opts: AskOptions, selected: number, cut = false): readonly Block[] {
  const children: Block[] = [
    block({ kind: "notice", id: "confirm-question", tone: "warn", glyph: "warn", text: opts.question }),
  ];
  // Ruling C's payload — what the answer will affect, shown with the question
  // rather than in the entry that follows it.
  if (opts.detail !== undefined) {
    children.push(
      cut
        ? // ASCII, because this text is authored where the capability is not
          // (C09 I22, F122) — the same reason C19 writes its indicator flat.
          block({ kind: "raw", id: "confirm-elided", text: "..." })
        : opts.detail,
    );
  }

  children.push(choiceBlock(opts.choices, selected));

  return [block({ kind: "panel", id: "confirm-panel", title: "Confirm", children })];
}

/**
 * The layer's placement and width together, because for this owner they are one
 * decision (entry 16 A3, C15 I20).
 *
 * **Centred declares `CONFIRM_WIDTH`, and C15 I20 now refuses anything else.**
 * Without it C15 gives a centred layer the region's width, so `Placed.left` is
 * always 0 and the box reads as `fill` however it was placed — which is the
 * appearance that made *the question covers its region* a tempting reading. The
 * rule used to live in a comment here; it lives in `push` now, and this is the
 * caller that stopped needing to remember it.
 *
 * **Anchored declares none, which is the menu's argument and not an omission**
 * (C19 §"the menu spans the region"): a layer narrower than the region leaves
 * whatever is behind it visible on the same rows, so a reader sees two
 * unrelated things on one line. A question anchored to the prompt is chrome for
 * the prompt, and the prompt spans the frame.
 *
 * `prefer: "above"` for C19's reason — the prompt is near the bottom by
 * definition, and C15 flips when there is no room.
 */
function placementOf(
  opts: AskOptions,
  deps: ConfirmDeps,
): Readonly<{ placement: Placement; width?: number }> {
  if (opts.placement !== "anchored") {
    return { placement: { kind: "centred" }, width: CONFIRM_WIDTH };
  }
  const at = deps.anchor();
  return { placement: { kind: "anchored", row: at.row, rows: at.rows, prefer: "above" } };
}

export function createConfirmHost(deps: ConfirmDeps): ConfirmHost {
  let handler: ((e: InputEvent) => boolean) | null = null;

  return {
    get open() {
      return handler !== null;
    },

    answerHandler() {
      // The guard is the top layer's identity rather than a stored flag: a
      // second record of "is the question on top" is one that can disagree with
      // C15's stack, and C16 asks this on every keystroke.
      return deps.overlays.top?.id === CONFIRM_LAYER_ID ? handler : null;
    },

    ask(opts) {
      if (opts.choices.length === 0) {
        // A question with nothing to answer it cannot resolve, and resolving it
        // with an invented key would put a value in the handler's hands that no
        // caller wrote. Construction error, C23 I27's standard.
        return Promise.reject(new Error("ask() needs at least one choice"));
      }

      // The shared store, with this caller's start (entry 16). The cycling is
      // the menu's; the start is what differs, and it is supplied.
      const selection = createChoiceSelection(opts.choices.length, defaultStart(opts.choices));
      const selected = (): number => selection.at ?? 0;

      const layer: Layer = {
        id: CONFIRM_LAYER_ID,
        kind: "overlay",
        ...placementOf(opts, deps),
        content: render(opts, selected()),
        dismissable: false,
        // **A question is not an advisory overlay, so the default fraction is
        // the wrong one** (C15 I18). Half the region is right for a peek, which
        // a reader dismisses; a confirm that does not fit loses its *answers*,
        // and the reader is asked something with no visible way to reply.
        //
        // It reduces the case and cannot remove it: a fraction caps a
        // proportion where this wants a minimum, and below about nine rows even
        // the collapsed form is taller than any fraction of the region. C15
        // floors at one row and draws it truncated rather than absent (I18),
        // which is the right end to fail at — see C23 T4.28's residue.
        maxHeightFraction: 0.8,
      };

      const disposable = deps.overlays.push(layer);
      // **The second pass, and it drops the payload rather than marking it**
      // (entry 16 R2). See `collapsed`.
      if (truncated(deps)) {
        deps.overlays.update(CONFIRM_LAYER_ID, { content: render(opts, selected(), true) });
      }

      return new Promise<string>((resolve) => {
        const settle = (key: string): boolean => {
          handler = null;
          disposable[Symbol.dispose]();
          deps.invalidate();
          resolve(key);
          return true;
        };

        const redraw = (): boolean => {
          deps.overlays.update(CONFIRM_LAYER_ID, { content: render(opts, selected()) });
          deps.invalidate();
          return true;
        };

        handler = (e) => {
          if (e.kind !== "key") return false;
          const { name, ctrl } = e.key;

          // Both escapes resolve with the default (C23 I36). They are routed
          // here rather than special-cased in C16 because what they mean is the
          // question's business, and a router that knew it would hold half of a
          // rule whose other half lives two layers away (C16 I25).
          if (name === "escape" || (ctrl && name === "c")) {
            return settle(defaultChoice(opts.choices).key);
          }
          if (name === "return" || name === "enter") {
            return settle(opts.choices[selected()]!.key);
          }
          if (name === "up" || name === "left") {
            selection.prev();
            return redraw();
          }
          if (name === "down" || name === "right" || name === "tab") {
            selection.next();
            return redraw();
          }

          // Accelerators, and they are checked last so a choice keyed `c` cannot
          // shadow `⌃c`. Bare only: `⌥y` is not `y`.
          if (!ctrl && !e.key.meta) {
            const hit = opts.choices.find((c) => c.key === name);
            if (hit !== undefined) return settle(hit.key);
          }

          // **Consumed, and nothing happens.** An unbound key at an open
          // question must not fall through — C16 I8 blocks the surface beneath,
          // and returning false here would send the key back up the ladder to
          // the rung that consumes `⌃c` into silence.
          return true;
        };

        deps.invalidate();
      });
    },
  };
}
