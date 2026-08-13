/**
 * Registration, dispatch, and the Ctrl-C ladder.
 *
 * C16 §4, §5, §7 — see spec.
 *
 * **The ladder is not a list here.** Rungs 3 to 7 are handlers registered on
 * `overlay`, `copyMode`, `pushedView` and `liveBlock`, so their order *is*
 * `FOCUS_ORDER`'s and the two cannot disagree. Only rungs 1 and 2 sit outside
 * dispatch, because a verb in flight and a shell child are not focus targets and
 * have no target to register on. C16 §5's table documents what falls out of this;
 * it is not a second specification.
 */

import { activeTarget, type FocusInputs, type FocusStore } from "./focus.js";
import type { Keymap } from "./keymap.js";
import type { FocusTarget, InputEvent } from "./types.js";

const EXIT_ARM_MS = 500;

export type Placed = Readonly<{
  layer: Readonly<{ id: string; kind: "overlay" | "view"; dismissable: boolean }>;
  top: number;
  left: number;
  height: number;
  width: number;
}>;

/**
 * Everything router.ts reaches outside itself, as functions.
 *
 * **Every one is a pull, and that is the audit.** Nothing here is a subscription:
 * C16 reads C13, C14 and C15 at the moment it needs them and never registers a
 * callback on a change stream. `resetFocus()` is a call from L4 by ruling (I2),
 * and the reason generalises — C13 emits `append` then `evict` for one `append()`,
 * so a consumer reading deltas as descriptions of current state sees a
 * half-applied store. That cost C14 a blank screen every assertion passed, and
 * paying it twice would be a choice.
 */
export type RouterDeps = Readonly<{
  overlayTop: () => Readonly<{ kind: "overlay" | "view"; id: string; dismissable: boolean }> | null;
  /**
   * The top layer's answer handler, or null — I25.
   *
   * A pull like every other dep, and it answers for the **top layer only**. C15
   * `pop()` gives the reason: a question raised over a completion menu that
   * searched downwards would be answered by the menu.
   *
   * C16 does not know what a key means to a question. It offers the event and
   * honours the boolean, which is the same contract `register` already has — so
   * `Esc`, `⌃c`, an accelerator and an arrow are one path here and four rules
   * over in L4, where the question lives.
   */
  overlayAnswerCallback: () => ((e: InputEvent) => boolean) | null;
  placed: () => readonly Placed[];
  popLayer: () => void;
  copyMode: () => boolean;
  exitCopyMode: () => void;
  liveEntry: () => Readonly<{ id: string }> | null;
  entryAtRow: (row: number) => Readonly<{ id: string; rowOffset: number }> | null;
  /**
   * **C23, not C06 — rungs 1 and 2 both read this one pull** (C16 §5).
   *
   * It returns the route rather than a boolean, and that is the whole reason it
   * replaced `busy` and `shellChild`. C23's guard covers every foreground route
   * (C23 I5), so a boolean sourced from it would make rung 1 fire on a `shell`
   * delegation and swallow rung 2 — this table's own unconstructible-rung defect,
   * created by the fix for the one above it.
   *
   * `busy` came from `C06`/`runner.live`, which is false through the whole window
   * C23 I3 opens deliberately: the pending entry is appended *before* the
   * transport is invoked, so for the length of a process spawn a verb is in
   * flight and no process exists. Ctrl-C fell past every rung and cleared the
   * prompt (C23 §8a A1).
   */
  inFlight: () => "app" | "local" | "shell" | null;
  /**
   * C23's, for the same reason. `runner.killAll()` kills the child and leaves the
   * entry streaming forever; C23 I10 settles it `partial` with output retained,
   * and only C23 can do that.
   */
  cancel: () => void;
  /** Rung 2's action. Stays on the runner: it forwards a signal and changes no entry state. */
  signalShellChild: () => void;
  /** Where the transcript region sits, for mouse routing. */
  region: () => Readonly<{ top: number; height: number }>;
  /**
   * The region a layer is placed against (C22 `frame.overlayRegion`).
   *
   * Distinct from `region` above, which is the transcript's rows and exists for
   * mouse translation. Needed here because step 3's second clause asks whether
   * the top layer **covers** the region, and coverage is a comparison of two
   * boxes — a question no single box can answer (I8).
   */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  mouseEnabled: () => boolean;
  promptHasText: () => boolean;
  clearPrompt: () => void;
  raiseExitConfirm: () => void;
  /**
   * How many subscriptions are live, and how to stop the newest (§5).
   *
   * Separate from `inFlight` on purpose: C23 I6 releases the submission guard
   * for a `streams: true` verb so the prompt stays usable, so `inFlight` is null
   * throughout a `--watch` — and rungs 1 and 2 read it. A stream is a state the
   * ladder had no rung for, not a state rung 1 should have been widened to
   * cover; widening it would cancel a stream when the reader meant to clear a
   * half-typed line.
   */
  liveStreams: () => number;
  cancelNewestStream: () => boolean;
}>;

export type Handler = (e: InputEvent) => boolean;

export interface InputRouter {
  register(target: FocusTarget, handler: Handler): { dispose(): void };
  dispatch(e: InputEvent): boolean;
  resetFocus(): void;
  readonly target: FocusTarget;
  /** Which stages the last dispatch consulted, in order. Diagnostics and T2.x. */
  readonly lastStages: readonly string[];
}

const isCtrlC = (e: InputEvent): boolean =>
  e.kind === "key" && e.key.ctrl && e.key.name === "c";

export function createRouter(
  opts: Readonly<{ focus: FocusStore; keymap: Keymap; now: () => number; deps: RouterDeps }>,
): InputRouter {
  const { focus, now, deps } = opts;
  const handlers = new Map<FocusTarget, Handler[]>();
  let armedAt: number | null = null;
  let stages: string[] = [];

  function register(target: FocusTarget, handler: Handler): { dispose(): void } {
    const list = handlers.get(target) ?? [];
    list.push(handler);
    handlers.set(target, list);
    return {
      dispose() {
        const current = handlers.get(target) ?? [];
        const i = current.indexOf(handler);
        if (i >= 0) current.splice(i, 1);
      },
    };
  }

  function inputs(): FocusInputs {
    return {
      overlayTop: deps.overlayTop(),
      copyMode: deps.copyMode(),
      liveEntry: deps.liveEntry(),
      stored: focus.current,
    };
  }

  /**
   * §7's exit arming, observed **before** dispatch (§4 step 0).
   *
   * The disarm fires even when a handler consumes the event, which is the whole
   * reason this is not a handler: arming state is a property of the session, not
   * of whoever happened to want that keystroke. A machine living in a handler
   * fails to disarm on a *consumed* key, and the symptom is an exit confirm
   * appearing after the user typed something in between.
   */
  function observeArming(e: InputEvent): "raise" | "arm" | null {
    const t = now();
    if (armedAt !== null && t - armedAt >= EXIT_ARM_MS) armedAt = null;

    const isExitKey =
      isCtrlC(e) || (e.kind === "key" && e.key.ctrl && e.key.name === "d");
    const atEmptyPrompt =
      focus.current.at === "prompt" && !deps.promptHasText() && deps.overlayTop() === null;

    // **A live subscription blocks the arming** (§5). Otherwise the key that
    // stops a runaway `--watch` is also the key that arms the session's exit,
    // which is the wrong pair to make adjacent — two presses to stop two
    // streams would arm and then raise the confirm.
    if (isExitKey && atEmptyPrompt && deps.inFlight() === null && deps.liveStreams() === 0) {
      if (armedAt !== null) {
        armedAt = null;
        return "raise";
      }
      armedAt = t;
      return "arm";
    }
    // Any other *input* disarms — a paste is input and a click is input, which
    // "any other key" did not answer for.
    armedAt = null;
    return null;
  }

  /** Rungs 3–7, installed as handlers so the ladder has no order of its own. */
  function installLadder(): void {
    register("overlay", (e) => {
      // **I25 — a layer that must be answered gets its keys first, and the order
      // is the invariant.** The clause below answers `⌃c` at a non-dismissable
      // top with *consumed, and nothing happens*, which was the whole truth when
      // no layer could be answered. Against a question it is a hang: the key
      // vanishes and the handler awaiting it waits forever. `Esc` and `⌃c` are
      // handed over rather than decided here, because what they mean belongs to
      // the question (C23 I36) and half a rule in each place is how they drift.
      const answer = deps.overlayAnswerCallback();
      if (answer !== null && answer(e)) return true;

      if (!isCtrlC(e)) return false;
      const top = deps.overlayTop();
      if (top === null) return false;
      // `top`, never `pop()`'s return: null covers both "nothing to close" and
      // "you may not close this", and those are a fall-through and a no-op.
      if (!top.dismissable) return true; // consumed, and nothing happens (I8)
      deps.popLayer();
      return true;
    });
    register("copyMode", (e) => {
      if (!isCtrlC(e)) return false;
      deps.exitCopyMode();
      return true;
    });
    register("pushedView", (e) => {
      if (!isCtrlC(e)) return false;
      deps.popLayer();
      return true;
    });
    // **The new rung is this registration and nothing else** (C26 I2). Its
    // position in the ladder is `FOCUS_ORDER`'s, so there was no order to
    // choose and no second artefact to keep in step — which is the whole
    // argument for interaction being a target rather than a flag consulted
    // before dispatch (C26 §8a trace 5).
    //
    // ⌃c leaves interaction and stays on the row, rather than going to the
    // prompt. The ladder's shape is *undo the innermost thing you entered*, and
    // the rung below is what takes the reader out of the block — two presses,
    // matching the two-level escape (C26 I14) rather than shortcutting it.
    register("interaction", (e) => {
      if (!isCtrlC(e)) return false;
      focus.setMode("navigate");
      return true;
    });
    register("liveBlock", (e) => {
      if (!isCtrlC(e)) return false;
      focus.toPrompt();
      return true;
    });
    register("prompt", (e) => {
      if (!isCtrlC(e) && !(e.kind === "key" && e.key.ctrl && e.key.name === "d")) return false;

      // **The subscription rung, above the prompt's own and below every layer's**
      // (§5). Its position needs no ordering of its own: `activeTarget` has
      // already chosen `prompt`, so an overlay, copy mode, a pushed view or the
      // live block took the key before this ran — and it sits ahead of clearing
      // the input because a running stream outranks a half-typed line.
      //
      // Ctrl-C only. Ctrl-D on an empty prompt is the session's exit and has
      // never been a cancel.
      if (isCtrlC(e) && deps.cancelNewestStream()) return true;

      if (deps.promptHasText()) {
        // Ctrl-D with text is consumed and discarded — never EOF, never a
        // delete-forward (I16).
        if (isCtrlC(e)) deps.clearPrompt();
        return true;
      }
      return true; // empty prompt: the arming machine above already decided
    });
  }

  /** §4's mouse table: layer by `Placed`, then the viewport, then chrome. */
  function routeMouse(e: Extract<InputEvent, { kind: "mouse" }>): boolean {
    stages.push("mouse");
    if (!deps.mouseEnabled()) return false;

    // **One translation, used by both rungs** (I20). The event's row is a
    // 0-based terminal row; a layer's box and C14's entry map are both relative
    // to the viewport region. This rung compared a terminal row directly to
    // `Placed.top` while the one below subtracted `region.top` — two adjacent
    // lines in two coordinate systems, and the symptom was a click near a
    // layer's edge resolving to the row above the one it landed on, which reads
    // as a placement defect in the component that placed it correctly.
    const region = deps.region();
    const regionRow = e.row - region.top;

    const covering = deps.placed().find(
      (p) =>
        regionRow >= p.top &&
        regionRow < p.top + p.height &&
        e.col >= p.left &&
        e.col < p.left + p.width,
    );

    const wheel = e.button === "wheelUp" || e.button === "wheelDown";
    if (covering !== undefined) {
      stages.push(`layer:${covering.layer.id}`);
      return run(covering.layer.kind === "view" ? "pushedView" : "overlay", e);
    }
    // Wheel is directional rather than targeted, so with no layer under the
    // pointer it goes to C14 regardless of what the point is over.
    if (wheel) {
      stages.push("viewport:wheel");
      return run("copyMode", e) || run("global", e);
    }

    if (regionRow >= 0 && regionRow < region.height) {
      const hit = deps.entryAtRow(regionRow);
      stages.push(hit === null ? "viewport:miss" : `viewport:${hit.id}`);
      return hit !== null && run("liveBlock", e);
    }
    stages.push("chrome");
    return run("global", e);
  }

  /**
   * Does the layer `id` fill the region it was placed in?
   *
   * **The property, not a proxy for it** (I8). `kind === "view"` is the narrow
   * test and it passes every case written about views while missing any other
   * full-region layer — and a view whose box was clamped smaller would be
   * treated as covering when it does not. C15 §4 commits a view to `top: 0`,
   * `left: 0` and the region's full extent, so the box is where the answer is.
   */
  function coversRegion(id: string): boolean {
    const region = deps.overlayRegion();
    const box = deps.placed().find((p) => p.layer.id === id);
    if (box === undefined) return false;
    return box.top === 0 && box.left === 0 && box.height >= region.height && box.width >= region.width;
  }

  function run(target: FocusTarget, e: InputEvent): boolean {
    for (const h of handlers.get(target) ?? []) {
      // Contained: a throwing handler leaves the event unconsumed and the
      // session alive (T3.15).
      try {
        if (h(e)) return true;
      } catch {
        /* treated as not consumed */
      }
    }
    return false;
  }

  function dispatch(e: InputEvent): boolean {
    stages = [];

    stages.push("arming");
    const arming = observeArming(e);
    if (arming === "raise") {
      deps.raiseExitConfirm();
      return true;
    }

    if (e.kind === "mouse") return routeMouse(e);

    if (isCtrlC(e)) {
      // **A verb waiting for an answer is not a verb to cancel** (I25).
      //
      // Rungs 1 and 2 read `inFlight`, and a local verb awaiting `ctx.ask` is in
      // flight for the whole time its question is on screen — so `⌃c` was taken
      // by rung 1 and the question never saw it. The outcome looked right, which
      // is why only a frame-read found it: the container was untouched and the
      // layer was gone, and a test asserting both passes. What the frame showed
      // is that **the submitted line vanished** — cancellation discards the
      // entry, so there was no record the command had been run at all, where
      // declining settles one saying nothing changed.
      //
      // Ruling A's own argument decides it. `Esc` and `⌃c` collapse *because*
      // declining and cancelling produce the same outcome — and when they do,
      // the one that leaves a record is the one to keep. So a question outranks
      // the cancel rungs, which is the only place the ladder's newest-first
      // order is not enough on its own: both rungs have a claim, and the older
      // one is higher.
      if (deps.overlayAnswerCallback() !== null) {
        stages.push("question");
        return run("overlay", e);
      }
      // Rungs 1 and 2, discriminated by route rather than by two sources.
      const route = deps.inFlight();
      if (route === "app" || route === "local") {
        stages.push("cancel");
        deps.cancel();
        return true;
      }
      if (route === "shell") {
        stages.push("shellChild");
        deps.signalShellChild();
        return true;
      }
    }

    const target = activeTarget(inputs());
    stages.push(`target:${target}`);
    if (run(target, e)) return true;

    // Step 3 is skipped when the top layer is non-dismissable: a layer that must
    // be answered is modal, and a global shortcut firing beneath one acts on a
    // surface the user cannot see (I8).
    const top = deps.overlayTop();
    if (top !== null && (!top.dismissable || coversRegion(top.id))) {
      stages.push("modal-blocked");
      return false;
    }

    stages.push("global");
    if (run("global", e)) return true;

    stages.push("dropped");
    return false;
  }

  installLadder();

  return {
    register,
    dispatch,
    resetFocus: () => focus.reset(),
    get target() {
      return activeTarget(inputs());
    },
    get lastStages() {
      return Object.freeze([...stages]);
    },
  };
}
