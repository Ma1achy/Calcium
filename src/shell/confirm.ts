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
import type { AskAnswer, AskOptions, Choice } from "./local/registry.js";
import { questionNotice } from "./documents.js";
import { questionConsumer, routingFor } from "./question-routing.js";
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
   * The prompt's line, and the clearing of it — for a typed reply (I73, §101).
   *
   * **The whole of the question's key rules stay in this file**, which is the
   * argument C16's rung 4 already makes for `answerHandler`: `⏎` under a
   * floating reply means *answer with what I typed*, and a submit path that
   * knew that would hold half a rule whose other half lives here.
   *
   * `holdDraft` and `restoreDraft` are the borrow (C17 I28, C23 I28). The
   * reader's line is taken whole on entering the reply state and given back
   * exactly on settling, whichever way the question was answered — it was
   * never submitted, so C23 I28's *the prompt clears whatever becomes of the
   * line* does not reach it. What that rule does reach is the reply's own
   * line, which **became** the line and clears like a submitted one; the
   * restore does both at once, because putting the held state back is what
   * removes the reply.
   */
  draft: () => string;
  holdDraft: () => void;
  restoreDraft: () => void;
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
  ask(opts: AskOptions): Promise<AskAnswer>;
  /**
   * C16 I25 — the top layer's answer handler, or null.
   *
   * **Read from the top only, never searched down the stack**, for the reason
   * C15 `pop()` gives: a question raised over a completion menu must not be
   * answered by the menu.
   */
  answerHandler(): ((e: InputEvent) => boolean) | null;
  /**
   * Would this key **resolve** the open question (C16 I44, R-BLK-788)?
   *
   * The activation guard's predicate, and it is here rather than in C16 for
   * I25's reason: what a key means to a question is the question's business.
   * `null` when no question is on top. Pure — it settles nothing, which is the
   * whole point of asking before answering.
   */
  resolvesHandler(): ((e: InputEvent) => boolean) | null;
  /** Whether a question is open — C22 refuses a submission while one is. */
  readonly open: boolean;
  /**
   * The open question's layer while it **replaces** the prompt, else `null`
   * (C23 I73, I74, §7f, §101).
   *
   * **A getter and not a field on `Layer`.** C15 I14 says `blocking` and
   * `dismissal` never change, for a reason that holds: a layer whose ownership
   * moved mid-life makes C16's ladder depend on when it looked. Replacing is
   * the opposite — it is exactly what changes when `reply…` is chosen, on the
   * same question with the same id and the same handler awaiting — so it is
   * derived here, per frame, from the question's state rather than declared
   * once on the layer.
   *
   * The layer stays on the stack while it replaces: C16's ownership ladder
   * reads the stack, and a question that left it to be drawn elsewhere would
   * be a question nothing routed keys to. What changes is where it is *drawn*.
   */
  readonly replacing: Layer | null;
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
    padding: { t: 1 },
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
/**
 * The question **suspended**, showing its payload bounded (I75, §051).
 *
 * **The same panel, with the evidence where the question was.** The layer
 * keeps its id and its owner keeps waiting, so what changes is only what is
 * drawn — which is what *suspends* means and why an inspection cannot be a
 * second layer: two layers would be two questions to `answerHandler`, and the
 * one underneath would be answering keys meant for the one on top.
 *
 * **A `scroll` box rather than the payload bare**, because the payload is here
 * precisely because it did not fit. The box bounds it and C04 I49 puts the
 * residue row on it, so the reader can see there is more rather than finding
 * the tail cut off — which is the failure `render`'s cut arm exists to avoid
 * one level up.
 */
function inspection(opts: AskOptions, rows: number): readonly Block[] {
  const children: Block[] = [
    questionNotice(opts.question, "confirm-question"),
    block({
      kind: "scroll",
      id: "confirm-source",
      // At least one row: a region too small to hold anything still has to
      // draw a box, and a height of 0 is a box C04 refuses.
      height: Math.max(1, rows), // cells-ok — a row count
      children: opts.detail === undefined ? [] : [opts.detail],
    }),
    block({ kind: "raw", id: "confirm-leave", text: "esc  back to the question" }),
  ];
  return [block({ kind: "panel", id: "confirm-panel", title: "Confirm", children })];
}

function render(opts: AskOptions, selected: number, cut = false): readonly Block[] {
  const children: Block[] = [
    questionNotice(opts.question, "confirm-question"),
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

/**
 * What one key means to an open question — written once and read twice
 * (C16 I44, R-BLK-788).
 *
 * **The second reader is the activation guard, and it must not answer to ask.**
 * A newly presented question refuses an *ambiguous activation* — a key that
 * would resolve it — and lets a neutral one through, so something has to say
 * which a key is without settling it. C16 cannot: what a key means to a question
 * is the question's business (I25), and a router holding half of that rule would
 * hold it two layers from the other half. So the classification is one function
 * here, and `handler` and the predicate both read it rather than each carrying a
 * copy of the same four cases.
 */
type Meaning = "resolve" | "move" | "compose" | "leave" | "none";

export function createConfirmHost(deps: ConfirmDeps): ConfirmHost {
  let handler: ((e: InputEvent) => boolean) | null = null;
  let meaning: ((e: InputEvent) => Meaning) | null = null;
  // **The question's state, which is what the routing is derived from** (I73).
  // `null` when nothing is open; the consumer otherwise, so the table is asked
  // rather than a boolean being kept beside it.
  let consumer: ReturnType<typeof questionConsumer> | null = null;
  /** The `reply…` choice the reader picked, or `null` — §101's third row. */
  let replying: Choice | null = null;
  /**
   * Whether the open question is **suspended** in an inspection (I75).
   *
   * A boolean rather than the chosen `Choice`, because nothing downstream
   * needs to know *which* inspection: `R-QST-004` gives a question one, and a
   * field holding the choice would be a record of something the design says
   * is singular.
   */
  let suspended = false;

  return {
    get open() {
      return handler !== null;
    },

    get replacing() {
      if (consumer === null || !routingFor(consumer).replaces) return null;
      return deps.overlays.stack.find((l) => l.id === CONFIRM_LAYER_ID) ?? null;
    },

    answerHandler() {
      // The guard is the top layer's identity rather than a stored flag: a
      // second record of "is the question on top" is one that can disagree with
      // C15's stack, and C16 asks this on every keystroke.
      return deps.overlays.top?.id === CONFIRM_LAYER_ID ? handler : null;
    },

    resolvesHandler() {
      const classify = meaning;
      if (classify === null || deps.overlays.top?.id !== CONFIRM_LAYER_ID) return null;
      return (e: InputEvent): boolean => classify(e) === "resolve";
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

      // **§101's table, asked rather than restated** (I73, §7f). Both fields
      // were literals here and both are the table's answer for a question that
      // is not yet taking a typed reply; writing them out again is how the two
      // records come to disagree the day the third state lands.
      consumer = questionConsumer(opts.choices, false);
      let routing = routingFor(consumer);

      const layer: Layer = {
        id: CONFIRM_LAYER_ID,
        kind: "overlay",
        ...placementOf(opts, deps),
        content: render(opts, selected()),
        blocking: routing.blocking,
        dismissal: routing.dismissal,
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

      return new Promise<AskAnswer>((resolve) => {
        const settle = (key: string, text?: string): boolean => {
          handler = null;
          meaning = null;
          consumer = null;
          replying = null;
          suspended = false;
          disposable[Symbol.dispose]();
          deps.invalidate();
          resolve(text === undefined ? { key } : { key, text });
          return true;
        };

        /**
         * Move this question to §101's third row (I73, §7f).
         *
         * **The same layer, updated** — not popped and pushed. The id is what
         * `answerHandler` and C16's rung 4 resolve against, and the promise
         * this closure resolves is the one the handler is awaiting: a second
         * layer would draw identically and leave the first one's owner waiting
         * for ever. That is why T1.69's discriminator is the identity and not
         * the picture.
         *
         * The placement moves with the state, because the question is now
         * chrome for a prompt that is live beneath it (C15 I20's argument for
         * an anchored layer declaring no width: a layer narrower than the
         * region leaves two unrelated things on one row).
         */
        const toReply = (choice: Choice): boolean => {
          replying = choice;
          consumer = questionConsumer(opts.choices, true);
          routing = routingFor(consumer);
          // **Taken before the prompt comes live**, so the reader composes
          // into an empty line rather than on top of whatever they had typed
          // when the question arrived.
          deps.holdDraft();
          const at = deps.anchor();
          deps.overlays.update(CONFIRM_LAYER_ID, {
            content: render(opts, selected()),
            placement: { kind: "anchored", row: at.row, rows: at.rows, prefer: "above" },
          });
          deps.invalidate();
          return true;
        };

        /**
         * Suspend, and come back (I75, `R-QST-002`).
         *
         * **Neither of these settles**, which is the whole invariant. The
         * promise this closure resolves is untouched by both, so the owner is
         * still awaiting and a second question behind this one still waits —
         * suspended is *unresolved*, which is what the word is for.
         */
        const suspend = (): boolean => {
          suspended = true;
          deps.overlays.update(CONFIRM_LAYER_ID, {
            // Bounded by the region rather than by a constant: the payload is
            // here because it did not fit, so the figure that matters is how
            // much room there is.
            content: inspection(opts, Math.max(1, deps.overlayRegion().height - 6)), // cells-ok — the panel's own chrome
          });
          deps.invalidate();
          return true;
        };

        const leaveInspection = (): boolean => {
          suspended = false;
          return redraw();
        };

        const redraw = (): boolean => {
          deps.overlays.update(CONFIRM_LAYER_ID, { content: render(opts, selected()) });
          deps.invalidate();
          return true;
        };

        // Both escapes resolve with the default (C23 I36). They are classified
        // here rather than special-cased in C16 because what they mean is the
        // question's business, and a router that knew it would hold half of a
        // rule whose other half lives two layers away (C16 I25).
        //
        // Accelerators are checked last so a choice keyed `c` cannot shadow
        // `⌃c`. Bare only: `⌥y` is not `y`.
        const classify = (e: InputEvent): Meaning => {
          if (e.kind !== "key") return "none";
          const { name, ctrl } = e.key;
          // **An inspection owns escape and nothing else** (I75). `Esc` inside
          // it leaves the inspection and not the request, so it cannot be a
          // `resolve` here — and no accelerator answers, because the reader is
          // reading the evidence rather than choosing between answers.
          if (suspended) return name === "escape" || (ctrl && name === "c") ? "leave" : "none";
          if (name === "escape" || (ctrl && name === "c")) return "resolve";
          if (name === "return" || name === "enter") return "resolve";
          // **A floating reply owns two keys and no others** (I73). The reader
          // is composing text, so `y` is a letter and `↓` is a motion in the
          // line — an accelerator arm here would make a question whose choices
          // spell a word unanswerable by typing it.
          if (replying !== null) return "compose";
          if (name === "up" || name === "left") return "move";
          if (name === "down" || name === "right" || name === "tab") return "move";
          if (!ctrl && !e.key.meta && opts.choices.some((c) => c.key === name)) return "resolve";
          return "none";
        };
        meaning = classify;

        const chosen = (key: string): Choice | undefined =>
          opts.choices.find((c) => c.key === key);

        handler = (e) => {
          if (e.kind !== "key") return false;
          const { name, ctrl } = e.key;
          switch (classify(e)) {
            case "resolve":
              if (name === "escape" || (ctrl && name === "c")) {
                // **The default's key and no text, on every path** (I36). An
                // escape from the reply state is still an escape: the reader
                // declined, and a `text` of `""` would say they replied with
                // nothing.
                //
                // **And the line comes back on this path too** (C17 I28). The
                // borrow is what has to be undone, not the answer — a restore
                // on the `⏎` arm alone loses the reader's draft on exactly the
                // path where they changed their mind about typing.
                if (replying !== null) deps.restoreDraft();
                return settle(defaultChoice(opts.choices).key);
              }
              if (replying !== null) {
                // **The answer carries both facts** (I36): which choice opened
                // the reply, and what was composed under it. The text is read
                // at the keystroke rather than held, because the prompt is the
                // record and a copy taken earlier is a second one.
                const text = deps.draft();
                const key = replying.key;
                deps.restoreDraft();
                return settle(key, text);
              }
              {
                const pick =
                  name === "return" || name === "enter" ? opts.choices[selected()] : chosen(name);
                // **`reply…` does not resolve; it moves the question** (I73).
                // The caller is still awaiting, the layer keeps its id, and the
                // prompt comes live beneath — §101's *the question moves UP*.
                if (pick?.reply === true && replying === null) return toReply(pick);
                // **And an inspection does not resolve either; it suspends**
                // (I75). The reader is going to look at what they are being
                // asked about, which is not an answer to it.
                if (pick?.inspect === true) return suspend();
                return settle(pick?.key ?? name);
              }
            case "leave":
              return leaveInspection();
            case "compose":
              // **Not consumed.** C16 hands a `false` back down the ladder to
              // the prompt beneath, which is what makes the layer *float*
              // rather than merely draw in a different place (router.ts:395).
              return false;
            case "move":
              if (name === "up" || name === "left") selection.prev();
              else selection.next();
              return redraw();
            default:
              // **Consumed, and nothing happens.** An unbound key at an open
              // question must not fall through — C16 I8 blocks the surface
              // beneath, and returning false here would send the key back up the
              // ladder to the rung that consumes `⌃c` into silence.
              return true;
          }
        };

        deps.invalidate();
      });
    },
  };
}
