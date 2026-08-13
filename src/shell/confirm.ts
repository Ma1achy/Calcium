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
import type { Layer, OverlayManager } from "../viewport/overlay/index.js";
import type { AskOptions, Choice } from "./local/registry.js";
import { cells } from "../presentation/text.js";

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
  return choices.find((c) => c.default === true) ?? choices[choices.length - 1]!;
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
  for (const c of choices) widest = Math.max(widest, cells(c.key) + 2);
  return widest;
}

function render(opts: AskOptions, selected: number): readonly Block[] {
  const children: Block[] = [
    block({ kind: "notice", id: "confirm-question", tone: "warn", glyph: "warn", text: opts.question }),
  ];
  // Ruling C's payload — what the answer will affect, shown with the question
  // rather than in the entry that follows it.
  if (opts.detail !== undefined) children.push(opts.detail);

  children.push(choiceBlock(opts.choices, selected));

  return [block({ kind: "panel", id: "confirm-panel", title: "Confirm", children })];
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

      let selected = opts.choices.findIndex((c) => c.default === true);
      if (selected < 0) selected = opts.choices.length - 1;

      const layer: Layer = {
        id: CONFIRM_LAYER_ID,
        kind: "overlay",
        placement: { kind: "centred" },
        content: render(opts, selected),
        dismissable: false,
        // **Declared, and the frame-read is why.** Without it C15 gives a
        // centred layer the region's width, so `Placed.left` is always 0 and
        // the box reads as `fill` however it was placed — which is the
        // appearance the ruling was talking about when it said the question
        // covers its region, and the reason that reading was tempting. C15
        // clamps this to the region, so a narrow terminal still gets a box that
        // fits (C15 I16: width is declared because the registry answers height
        // at a width and never the reverse).
        width: CONFIRM_WIDTH,
      };

      const disposable = deps.overlays.push(layer);

      return new Promise<string>((resolve) => {
        const settle = (key: string): boolean => {
          handler = null;
          disposable[Symbol.dispose]();
          deps.invalidate();
          resolve(key);
          return true;
        };

        const redraw = (): boolean => {
          deps.overlays.update(CONFIRM_LAYER_ID, { content: render(opts, selected) });
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
            return settle(opts.choices[selected]!.key);
          }
          if (name === "up" || name === "left") {
            selected = (selected - 1 + opts.choices.length) % opts.choices.length;
            return redraw();
          }
          if (name === "down" || name === "right" || name === "tab") {
            selected = (selected + 1) % opts.choices.length;
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
