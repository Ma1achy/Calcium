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
import type { FocusTarget, InputEvent, Key } from "./types.js";

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
  placed: () => readonly Placed[];
  popLayer: () => void;
  copyMode: () => boolean;
  exitCopyMode: () => void;
  liveEntry: () => Readonly<{ id: string }> | null;
  entryAtRow: (row: number) => Readonly<{ id: string; rowOffset: number }> | null;
  /** C06. `busy` is rung 1; `shellChild` is rung 2 (a piped `shell` route). */
  busy: () => boolean;
  cancel: () => void;
  shellChild: () => boolean;
  signalShellChild: () => void;
  /** Where the transcript region sits, for mouse routing. */
  region: () => Readonly<{ top: number; height: number }>;
  mouseEnabled: () => boolean;
  promptHasText: () => boolean;
  clearPrompt: () => void;
  raiseExitConfirm: () => void;
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

    if (isExitKey && atEmptyPrompt && !deps.busy()) {
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
    register("liveBlock", (e) => {
      if (!isCtrlC(e)) return false;
      focus.toPrompt();
      return true;
    });
    register("prompt", (e) => {
      if (!isCtrlC(e) && !(e.kind === "key" && e.key.ctrl && e.key.name === "d")) return false;
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

    const covering = deps.placed().find(
      (p) =>
        e.row >= p.top &&
        e.row < p.top + p.height &&
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

    const region = deps.region();
    if (e.row >= region.top && e.row < region.top + region.height) {
      const hit = deps.entryAtRow(e.row - region.top);
      stages.push(hit === null ? "viewport:miss" : `viewport:${hit.id}`);
      return hit !== null && run("liveBlock", e);
    }
    stages.push("chrome");
    return run("global", e);
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
      if (deps.busy()) {
        stages.push("cancel");
        deps.cancel();
        return true;
      }
      if (deps.shellChild()) {
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
    if (top !== null && !top.dismissable) {
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
