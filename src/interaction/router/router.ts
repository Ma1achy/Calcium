/**
 * Registration, dispatch, and the Ctrl-C ladder.
 *
 * C16 §4, §5, §7 — see spec.
 *
 * **The ladder is not a list here.** Rungs 3 to 7 are handlers registered on
 * `overlay`, `nativeSelection`, `panel` and `liveBlock`, so their order *is*
 * `FOCUS_ORDER`'s and the two cannot disagree. Only rungs 1 and 2 sit outside
 * dispatch, because a verb in flight and a shell child are not focus targets and
 * have no target to register on. C16 §5's table documents what falls out of this;
 * it is not a second specification.
 */

import { NO_SPAN } from "../../data/viewmodel/index.js";
import type { Probe } from "../../data/viewmodel/index.js";
import { activeTarget, type FocusInputs, type FocusStore } from "./focus.js";
import type { Keymap } from "./keymap.js";
import {
  RUNG_OF,
  type FocusTarget,
  type InputEvent,
  type OwnerRung,
  type Verdict,
} from "./types.js";
import { interceptOf, interceptVerdict } from "./intercepts.js";

const EXIT_ARM_MS = 500;


export type Placed = Readonly<{
  layer: Readonly<{ id: string; kind: "overlay" | "panel"; blocking: boolean; dismissal: "escape" | "focus" | "answer" }>;
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
  /**
   * C28's seam (C28 I30, C28 I39). Absent is not recording, and that is the
   * usual case.
   *
   * The `handler` span is opened here rather than around `dispatch`, because
   * those are two different questions: `route` is *what did it cost to decide*
   * and this is *what did it cost to act*, and the ladder walks up to seven
   * rungs before either. Filing both under one name would put a keymap lookup
   * and an app's own key handler in the same column — C28 I36's
   * `handler`/`local` ruling, one layer up.
   */
  probe?: Probe;
  overlayTop: () => Readonly<{ id: string; kind: "overlay" | "panel"; blocking: boolean; dismissal: "escape" | "focus" | "answer" }> | null;
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
  nativeSelection: () => boolean;
  exitNativeSelection: () => void;
  /**
   * Semantic copy mode's state and its two exits (C14 §6a, C16 §5d, I51).
   *
   * **Two exits and not one, because they do different things.** `escape` clears
   * a selection if there is one and leaves only when there is none; `exit`
   * always leaves. The asymmetry is the ruling rather than an oversight — `esc`
   * is the target's own way out and a selection is state within the rung, while
   * the ladder's `⌃c` rung answers *cancel the innermost thing* and a rung that
   * also tidied up would be answering two questions.
   */
  semanticSelection: () => boolean;
  escapeSemanticSelection: () => void;
  exitSemanticSelection: () => void;
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
   * An application's child surface holds the keyboard (I49, R-BLK-711).
   *
   * The `child` rung's **second** source. Separate from `inFlight` because the
   * two are different mechanisms answering one question — a shell delegation is
   * C23's and an attachment is C22's — and one dep covering both would make a
   * component report another's state.
   */
  childAttached: () => boolean;
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
  /**
   * Does this terminal report key releases (C02 `keyboardProtocol`, C16 I44)?
   *
   * **The one thing that decides which of R-BLK-788's two boundaries applies.**
   * *Wait for the held key to lift* is only an instruction a terminal that says
   * when it lifted can be given; on one that does not, the guard has to end on
   * the refusal or it would swallow the reader's deliberate second press with
   * nothing able to tell it from the held first one.
   *
   * A pull like every other, and the same field §6a reads to choose a profile —
   * so the two answers cannot drift apart into *this terminal has the protocol*
   * and *this terminal sends releases*.
   */
  keyReleasesReported: () => boolean;
  /**
   * Would the top question **resolve** on this key, or `null` when none is open
   * (C16 I44, R-BLK-788)?
   *
   * **The guard's predicate, and it is a pull because C16 must not know the
   * answer** (I25). *The first ambiguous activation is refused* needs a way to
   * tell a key that would answer the question from one that would move its
   * selection or do nothing, and the only honest way to ask is to ask the
   * question — the alternative is calling the answer handler, which answers it.
   * A separate pull rather than a widened `overlayAnswerCallback`, because one
   * settles and one does not, and a single function that sometimes settles is
   * the shape no caller can use safely.
   */
  overlayWouldResolve: () => ((e: InputEvent) => boolean) | null;
}>;

/**
 * What a handler answers (§103, R-OWN-001, C16 §3a W6).
 *
 * **`boolean` could say two of the four things and conflated the other two.**
 * `true` is `handle`; `false` meant *pass downward* **and** *consume without
 * acting*, which are different rungs of the design's decision — and that is why
 * a blocking question could drop a key in silence and read as correct (W2).
 * `global-intercept` had no representation at all.
 *
 * Both forms are accepted because the four-verdict form is only needed where a
 * handler has something to say beyond *yes* or *not mine*, and 30-odd handlers
 * in `construct.ts` have not. `true`/`false` normalise to `handle`/`pass`, which
 * is what they have always meant; a handler that means `reject` now says so.
 */
export type Handler = (e: InputEvent) => boolean | Verdict;

/** `true` is `handle` and `false` is `pass` — what the boolean form always meant. */
const verdictOf = (answer: boolean | Verdict): Verdict =>
  answer === true ? "handle" : answer === false ? "pass" : answer;

export interface InputRouter {
  register(
    target: FocusTarget,
    handler: Handler,
    options?: Readonly<{ first?: boolean }>,
  ): { dispose(): void };
  dispatch(e: InputEvent): boolean;
  resetFocus(): void;
  readonly target: FocusTarget;
  /**
   * Who owns the keyboard, as §103's ladder names it — `null` when no rung does
   * and the global keymap is all that is left (R-OWN-001, R-KEY-004).
   *
   * Exposed because the footer's owner line has to read it: *AN OWNER YOU CANNOT
   * SEE IS AN OWNER YOU WILL FIGHT.* It is derived, not stored, for the reason
   * `target` is — a second copy is a second thing to keep in step.
   */
  readonly rung: OwnerRung | null;
  /**
   * The owner epoch, shared by the keyboard and the pointer (C16 I43,
   * R-OWN-002). It moves on every owner change, and nothing armed in one epoch
   * may be committed in another.
   */
  readonly ownerEpoch: number;
  /**
   * Is the current owner newly raised and still refusing its first activation
   * (C16 I44)? Read by the footer's owner line, which is where the refusal
   * explains itself (C22 §6, R-INT-008).
   */
  readonly ownerArmed: boolean;
  /**
   * Arm a pointer activation on a stable identity (C16 I45, R-OWN-003).
   *
   * The identity is the caller's to compose and is `(entry, blockId, elementId)`
   * in the gesture table — never a cell, because a live block re-renders under a
   * held button and a release comparing positions activates whatever slid under
   * the pointer.
   */
  armPointer(id: string): void;
  /**
   * Commit the arm if `id` is still the armed identity in the epoch it was armed
   * in (C16 I45). Clears the arm either way: a release ends it whatever became
   * of it.
   */
  commitPointer(id: string): boolean;
  /** Which stages the last dispatch consulted, in order. Diagnostics and T2.x. */
  readonly lastStages: readonly string[];
}

const isCtrlC = (e: InputEvent): boolean =>
  e.kind === "key" && e.key.ctrl && e.key.name === "c";

export function createRouter(
  opts: Readonly<{ focus: FocusStore; keymap: Keymap; now: () => number; deps: RouterDeps }>,
): InputRouter {
  const { focus, keymap, now, deps } = opts;
  const handlers = new Map<FocusTarget, Handler[]>();
  let armedAt: number | null = null;
  let stages: string[] = [];

  /**
   * M7's two fields, and they are two because one cannot hold both facts
   * (C16 I43, I44, §4a W8).
   *
   * `ownerEpoch` moves on **every** owner change — a raise, a fall, and a move
   * to or from no rung alike — because R-OWN-002's first clause is *events carry
   * the owner epoch in which they began and are never replayed against a new
   * owner*, and a question closing is an owner change like any other.
   * `guarded` is set only when a **question** arrives, because R-BLK-786's
   * clause is *a newly presented question requires a fresh, deliberate
   * activation*. Folding them into one field refuses the first keystroke after
   * every question the reader has just answered — which is exactly when they are
   * typing deliberately, and is a defect no row asserting a *state* can see.
   *
   * **There is no clock here and an earlier draft gave it one** (§4a W9).
   * R-BLK-788 makes the boundary an event — *with key-release reporting, wait
   * for the held key to lift; without it the first ambiguous activation before a
   * neutral/key-up boundary is refused* — and a held key is precisely the thing
   * that produces no event for a timer to be right about.
   *
   * **`lastRung` starts at `null`, and a lazy seed was wrong** (I43). An
   * `undefined` seed taken on the first `syncOwner` swallows the first
   * transition it ever sees — which is the arrival of the session's first
   * question, the one the guard most has to catch. Seeding eagerly at
   * construction is the other wrong answer: the deps are pulls and `inFlight`
   * reads a `pipeline` that is still in its temporal dead zone, so asking costs
   * a `ReferenceError` rather than a walk. `null` needs neither, because a
   * router is built with nothing raised — there is no stack yet to raise from.
   */
  let ownerEpoch = 0;
  let lastRung: OwnerRung | null = null;
  let guarded = false;
  let pointerArm: Readonly<{ id: string; epoch: number }> | null = null;
  /**
   * Which keys are physically down, where the terminal says so (C16 I44).
   *
   * **Empty and meaningless without release reporting**, which is the whole
   * reason R-BLK-788 splits its rule in two. *Wait for the held key to lift*
   * presupposes a held key, and a terminal that reports releases is one that can
   * say whether there is one — so where there is not, a question guards nothing
   * and the reader's first press answers it. Where the terminal is silent about
   * releases this stays empty and the conservative arm applies.
   */
  const held = new Set<string>();

  function register(
    target: FocusTarget,
    handler: Handler,
    options: Readonly<{ first?: boolean }> = {},
  ): { dispose(): void } {
    const list = handlers.get(target) ?? [];
    if (options.first === true) list.unshift(handler);
    else list.push(handler);
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
      nativeSelection: deps.nativeSelection(),
      semanticSelection: deps.semanticSelection(),
      // **Two sources, one fact** (I49, R-BLK-711). A shell delegation and an
      // attached child surface are the same claim — the terminal's keys are not
      // the host's — and the rung has to answer for both or the second has a
      // target with nothing that reaches it. `||` rather than a precedence:
      // neither can be true while the other is (a delegation suspends raw mode),
      // and a rule about which wins would be a rule about an unconstructible
      // state.
      attachedChild: deps.inFlight() === "shell" || deps.childAttached(),
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
    // "any other key" did not answer for. **A hover is not** (§4a row t): under
    // mode 1003 a hand resting on the mouse reports every cell, and a window
    // it closed would make the double-`⌃c` exit unreachable while it rests.
    if (e.kind === "mouse" && e.button === "none") return null;
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
      if (top.dismissal !== "escape") return true; // consumed, and nothing happens (I8)
      deps.popLayer();
      return true;
    });
    register("nativeSelection", (e) => {
      if (!isCtrlC(e)) return false;
      deps.exitNativeSelection();
      return true;
    });
    // **The same rung and a different verb** (I51, §5d D5). `⌃c` leaves the mode
    // and does **not** clear a selection first, where `esc` does — which is the
    // one cell the two exits differ in and therefore the only one a row can be
    // written against. Carrying `esc`'s clear step over here reads as
    // consistency and is the defect: this rung answers *cancel the innermost
    // thing you entered*, and a rung that also tidied up would be answering two
    // questions (I23).
    register("semanticSelection", (e) => {
      if (!isCtrlC(e)) return false;
      deps.exitSemanticSelection();
      return true;
    });
    // **A panel's rung is `substate`, and so is a view's** (§2c, R-BLK-109).
    // Two targets, one rung, and the registration is per target: a panel is
    // escapable by construction, so `⌃c` closes it exactly as `esc` does.
    register("panel", (e) => {
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
      // already chosen `prompt`, so an overlay, native selection, a pushed view or the
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

    // **Every direction is a wheel** (I30, §4a row j). This named two of the
    // four, so the day the decoder produced `wheelLeft` a horizontal wheel fell
    // through to the entry rung and was routed as a click on the block under
    // the pointer.
    const wheel = e.button.startsWith("wheel");
    if (covering !== undefined) {
      stages.push(`layer:${covering.layer.id}`);
      // **Two kinds, two targets** (I48, C15 I23, R-BLK-779). *The layer order
      // is the scroll order*, so a mouse event over a panel is the panel's
      // exactly as a key is — and while a panel routed to `overlay` here, the
      // handlers registered at `panel` were unreachable by the pointer while
      // reachable by the keyboard, which is one seam answering two ways. It was
      // three until `kind: "view"` retired (R-EXA-082, F1254).
      return run(covering.layer.kind === "panel" ? "panel" : "overlay", e);
    }

    // **The click that dismisses does not also act** (I47, R-BLK-854,
    // R-BLK-855). The point is not on the layer, and the topmost layer is one
    // the reader can close — so the press closes it and stops there. *The thing
    // you meant to hit was covered a moment ago*, so a press that closed the
    // panel and activated what was underneath would act on something the reader
    // could not see when they decided to press. One gesture, one effect: the
    // same shape as `esc` popping one rung, on the pointer instead.
    //
    // The **press** and not the release, because closing is not an activation
    // and nothing about it is taken back by moving the pointer; the arm a
    // release would commit is cancelled by this press as by any other (I46).
    // A wheel is carved out for I40's reason and a hover for §4a row t's: a
    // hand resting on the mouse under mode 1003 would close every panel it
    // reported over.
    const escapable = deps.overlayTop();
    if (
      escapable !== null &&
      escapable.dismissal === "escape" &&
      e.press &&
      !wheel &&
      e.button !== "none"
    ) {
      stages.push("dismiss");
      deps.popLayer();
      return true;
    }
    // **A layer that must be answered takes the mouse as it takes the keys**
    // (I8). The point is not on the layer, so nothing beneath it may act — a
    // click that moved focus under a confirm, or a wheel that scrolled the
    // transcript under one, is the exact defect I8 was widened to close, and
    // this table had no gate while the keyboard's had two. Consumed and
    // nothing happens, which is the key path's shape.
    const top = deps.overlayTop();
    // **The wheel is carved out, because it is a reserved route** (I40, I8, §103,
    // §4a row k). The gate is right about every other gesture and was wrong about
    // this one for the same reason the keyboard path was: a wheel does not move
    // focus, does not change state and does not answer anything — it moves the
    // viewport so the reader can see. Holding it under an unanswered confirm
    // produced the defect I8 exists to prevent, one layer up: the layer blocked
    // comprehension of its own question. A click beside a confirm is still
    // consumed and still does nothing, which is what row k was measured on.
    if (top !== null && top.blocking && !wheel) {
      stages.push("modal");
      return true;
    }

    const inRegion = regionRow >= 0 && regionRow < region.height;
    const hit = inRegion ? deps.entryAtRow(regionRow) : null;

    if (wheel) {
      // **The entry under the pointer first, then C14** (§4a row i). *Directional
      // rather than targeted* was true while nothing in the transcript could
      // scroll on its own; a `scroll` block is a second thing a wheel can mean,
      // and the box under the pointer outranks the transcript it sits in. An
      // entry that declines — prose, no box — leaves the wheel to the viewport.
      stages.push(hit === null ? "viewport:wheel" : `viewport:${hit.id}`);
      if (hit !== null && run("liveBlock", e)) return true;
      if (hit !== null) stages.push("viewport:wheel");
      return run("nativeSelection", e) || run("global", e);
    }

    if (inRegion) {
      stages.push(hit === null ? "viewport:miss" : `viewport:${hit.id}`);
      return hit !== null && run("liveBlock", e);
    }
    stages.push("chrome");
    return run("global", e);
  }

  /**
   * **`coversRegion` retired in M8** (C15 I26, R-QST-001, I8).
   *
   * It measured a layer's box because `dismissable` could not say *owns input*,
   * and a full-region view had to be recognised by its geometry. That was right
   * about the hazard and wrong about where the answer lives: *a question
   * declares blocking and owner explicitly*, so the field says it. A proxy for
   * a field that does not exist yet fails in both directions once the field
   * does — a large layer blocking nothing would still be modal, and a one-row
   * typed reply that blocks would not be.
   */
  /**
   * Every handler on a target, until one does not `pass` (R-OWN-001).
   *
   * **`reject` stops the walk exactly as `handle` does**, and that is the whole
   * difference the verdict buys: both mean *this rung decided*, and only the
   * effect differs. `pass` is the one answer that continues, which is what
   * `false` meant at the two sites that used it correctly and not at the one
   * that used it to drop a key.
   */
  function runRung(target: FocusTarget, e: InputEvent): Verdict {
    const list = handlers.get(target) ?? [];
    // **Nothing to run is not a span** (C28 I39). `dispatch` calls this up to
    // three times per event and most targets hold no handler, so opening one
    // here unconditionally would make `spans.handler.count` a count of *rungs
    // walked* under a name that says *handlers run*.
    if (list.length === 0) return "pass"; // graphemes-ok — a count of handlers
    using _s = deps.probe?.span("handler") ?? NO_SPAN;
    for (const h of list) {
      // Contained: a throwing handler leaves the event unconsumed and the
      // session alive (T3.15). A throw is `pass` and never `reject`: a handler
      // that fell over has not decided anything.
      try {
        const verdict = verdictOf(h(e));
        if (verdict !== "pass") return verdict;
      } catch {
        /* treated as not consumed */
      }
    }
    return "pass";
  }

  /** The boolean the ladder's own call sites still read: did this rung consume it. */
  function run(target: FocusTarget, e: InputEvent): boolean {
    return runRung(target, e) !== "pass";
  }

  function rungNow(): OwnerRung | null {
    const target = activeTarget(inputs());
    return target === "global" ? null : RUNG_OF[target];
  }

  /**
   * The rung an intercept is answered at — `rungNow`, except that a **question**
   * is an overlay *awaiting an answer* and not merely a layer.
   *
   * **§5 already drew this line and the ladder's targets do not.** `activeTarget`
   * answers `overlay` for any top layer, where §103's QUESTION rung is *choice or
   * text · resolves exactly once by answer · safe exit* — and §5's own Ctrl-C
   * branch tests `overlayAnswerCallback() !== null` for exactly that reason.
   * Without this the table rejects an interrupt under a non-dismissable layer
   * that nobody is waiting on, and a verb in flight never gets cancelled: ruled
   * behaviour overturned by a rung name being one word coarser than the rule.
   */
  function interceptRung(): OwnerRung | null {
    const rung = rungNow();
    if (rung !== "question") return rung;
    if (deps.overlayAnswerCallback() !== null) return "question";
    // A layer with nothing to answer is not a question; the work beneath it is
    // the owner, which is the rung §5's cancel branch acts for.
    return "scope";
  }

  /**
   * Bring the epoch and the owner arm up to date (C16 I43, §4a W7).
   *
   * **Written at the bottom of a dispatch and read at the top**, because the
   * raise is usually caused by the key being dispatched: a handler pushes a
   * layer, and the rung is different on the way out than it was on the way in.
   * A machine comparing the rung only before dispatch never arms for the case
   * that matters, and every row asserting a state still passes.
   *
   * Idempotent, so `commitPointer` may call it first to make sure the epoch it
   * compares against is the current one — an owner raised by output or a timer
   * has had no dispatch of its own in which to move it.
   */
  function syncOwner(): void {
    const rung = rungNow();
    if (rung === lastRung) return;
    const questionArrived = rung === "question" && lastRung !== "question";
    lastRung = rung;
    // R-BLK-786: *every owner transition increments an ownership generation*.
    ownerEpoch += 1;
    // R-BLK-786 again, and it is narrower than the transition: *a newly
    // presented QUESTION requires a fresh, deliberate activation*. No other rung
    // acts on one keystroke the way an answer does, so no other rung guards.
    //
    // **And narrower still where the terminal reports releases**: there the
    // guard is for a key that was already down when the question arrived, and
    // with nothing down there is nothing to wait for and nothing to refuse.
    if (questionArrived) guarded = !deps.keyReleasesReported() || held.size > 0;
  }

  /**
   * Is this event an activation the raised owner would act on (C16 I44)?
   *
   * **Narrower than *a key the owner handles*, and the narrowing is the rule.**
   * Refusing every key after a raise refuses the arrow that would let the reader
   * read what arrived; refusing none lets a held key answer a question that
   * appeared under it. For a raised question every key its answer callback would
   * consume is an answer — the callback is the question's whole vocabulary and
   * C16 does not know what a key means to it (I25) — and elsewhere it is the
   * chord bound to `rowActivate`, asked of the keymap rather than spelled here.
   */
  function isActivation(e: InputEvent): boolean {
    if (e.kind !== "key") return false;
    // **Ambiguous is *would resolve*, not *would be consumed*** (R-BLK-788).
    // An unbound key at an open question is consumed and does nothing, and an
    // arrow moves the selection — neither is an activation, and refusing them
    // would stop a reader looking at what arrived. Only the question knows which
    // of its keys answer it (I25), so the predicate is its own.
    const resolves = deps.overlayWouldResolve();
    if (resolves !== null) return resolves(e);
    return keymap.resolve(activeTarget(inputs()), e.key)?.action === "rowActivate";
  }

  /**
   * The question's activation guard, read at the top of a dispatch — `true`
   * means *refuse this one* (C16 I44, R-BLK-788).
   *
   * **The pointer is never guarded** (R-BLK-788's last clause): a fresh press
   * belongs to the new epoch and keeps ordinary one-click semantics, and it could
   * not be the in-flight event the guard exists to catch — a button already down
   * when the question arrived produces a release and never a press.
   *
   * **Two boundaries, and which one applies is the terminal's answer.** Where key
   * releases are reported, the guard waits for the held key to lift, so every
   * activation before the key-up is refused. Where they are not, nothing can tell
   * the deliberate second press from the held first one, so the guard ends on the
   * refusal rather than outliving a keystroke it cannot see the end of. A neutral
   * key — one the question would not take as an answer — ends it either way.
   */
  function takeGuard(e: InputEvent): boolean {
    if (!guarded || e.kind !== "key") return false;
    if (e.event === "release") {
      // The held key lifted. `held` was updated before this ran, so an empty set
      // is *nothing is down any more* and the guard has what it was waiting for.
      if (held.size === 0) guarded = false;
      return false;
    }
    if (!isActivation(e)) {
      guarded = false;
      return false;
    }
    if (!deps.keyReleasesReported()) guarded = false;
    return true;
  }

  /**
   * Three of I46's five cancellations, observed before dispatch.
   *
   * A drag and a second press both arrive as `press: true` — a motion report has
   * `press: true, motion: true` (I30) — so one line answers for both, and the
   * press that *arms* clears first and is re-armed by the effect during dispatch.
   * A hover is not a gesture and clears nothing, for §4a row t's reason.
   */
  function cancelArmOnPress(e: InputEvent): void {
    if (e.kind !== "mouse" || e.button === "none") return;
    if (e.press) pointerArm = null;
  }

  function dispatch(e: InputEvent): boolean {
    // **Read at the top as well as written at the bottom** (§4a W7). The bottom
    // call catches a raise the dispatch itself caused — a handler pushing a
    // layer. This one catches a raise nothing dispatched: `ctx.ask` is called
    // from a verb, so the question exists before the next keystroke arrives, and
    // that keystroke is precisely the one the guard exists to refuse. A machine
    // with only the bottom call lets it through and guards the one after it.
    // **`syncOwner` first, and the order is the rule** (I44). A question raised
    // out of band is observed here, and the condition is what was held *when it
    // arrived* — which is what was down before this event, not including it. A
    // key genuinely held across the arrival is already in the set, because a
    // held key repeats and its first press was an earlier dispatch; a key
    // pressed deliberately after it is not, and answers. Counting this event
    // first collapses the two and guards every question on every terminal,
    // which is the conservative arm arriving where the design asked for the
    // precise one.
    syncOwner();
    if (e.kind === "key") {
      if (e.event === "release") held.delete(e.key.name);
      else held.add(e.key.name);
    }
    cancelArmOnPress(e);
    try {
      return dispatchInner(e);
    } finally {
      syncOwner();
      // **A release ends the arm whatever became of it** (I46). The commit is
      // attempted during dispatch by the gesture table; a release over chrome,
      // over a layer or outside the region never reaches it, and an arm that
      // outlived one would be committed by the *next* release somewhere else.
      if (e.kind === "mouse" && !e.press && e.button !== "none") pointerArm = null;
    }
  }

  function dispatchInner(e: InputEvent): boolean {
    stages = [];

    stages.push("arming");
    const arming = observeArming(e);
    if (arming === "raise") {
      deps.raiseExitConfirm();
      return true;
    }

    // **A newly presented question refuses an activation already in flight, and
    // names why** (I44, R-BLK-786, R-BLK-788, R-INT-008). Below the exit arm,
    // because the exit arm must still see a refused key as input — a `⌃c` that
    // was refused is a `⌃c` that happened, and leaving it armed would raise the
    // confirm on a keystroke the reader never got an answer to.
    //
    // `reject` and not a dropped key: R-INT-008 says a rejected command
    // explains, and the explanation is the footer's owner line losing its armed
    // mark on this very keystroke — so the frame changes, which is the whole
    // difference between refused and swallowed.
    if (takeGuard(e)) {
      stages.push("question-guard");
      stages.push("reject");
      return true;
    }

    // **The three reserved routes are read before the ladder and no rung can
    // claim them** (§103, R-OWN-001, C16 §3a W4). `⌃c`, `⌥↑`/`⌥↓` and the wheel
    // are *declared overrides, not contradictions in the ladder*, and the table
    // is consulted first precisely so a rung cannot take one ahead of it — which
    // is what "unclaimable" means and what a branch further down could not give.
    //
    // A `null` verdict is *this intercept does not apply at this rung*, which is
    // not `pass`: passing is a decision an owner took, and this is the absence of
    // one. The ladder then runs normally, which is how `interrupt` still reaches
    // §5's own rungs below.
    const intercept = interceptOf(e);
    if (intercept !== null) {
      const rung = interceptRung();
      const declared = interceptVerdict(intercept, rung);
      stages.push(`intercept:${intercept}:${rung ?? "idle"}:${declared ?? "none"}`);
      // **`reject` means the owner deals with it and it never falls through** —
      // not that nothing runs. The owning rung is given its turn first, because
      // the rejection is a thing an owner *does*: a question's `⌃c` is its deny
      // path (§5 ruling A — declining and cancelling produce the same outcome, and
      // the one that leaves a record wins), and native selection's is its own refusal.
      // Short-circuiting before the rung skipped exactly that, which is a table
      // overruling the ladder rather than declaring an override for it.
      //
      // What the table *does* take away is the fall-through: after a reject the
      // event is spent, so no lower rung and no global binding can act on a route
      // it does not own. That is what "unclaimable by any rung" buys.
      if (declared === "reject") {
        const owner = activeTarget(inputs());
        if (owner !== "global") runRung(owner, e);
        stages.push("reject");
        return true;
      }

      // **`handle` is a destination for two of the three, and only dispatching
      // on `reject` was the whole defect** (I40, §103). The table said `handle`
      // at every rung and the code did nothing with it: the event fell to the
      // ladder, a question's answer handler took `⌥↑`, and **a reader could not
      // scroll to read the thing they were being asked to approve**. A route no
      // rung may claim that is nevertheless resolved by the ladder is not
      // reserved; it is documented.
      //
      // §103 names the destination for both — *the active viewport handles* for
      // page-scroll, *its pointer-hit owner* for the wheel — so each goes there
      // directly, ahead of the ladder, exactly as `reject` goes to the owner.
      // The viewport's scroller is `global`: all four paging routes register
      // there (`keymap.ts`), which is what makes this one call rather than a
      // second scroller beside the first.
      //
      // **`interrupt` is excluded and keeps falling through.** Its `handle`
      // means *this rung's own cancel* — a different verb at a child, a substate
      // and a scope — so the ladder is where it resolves, and the branch is on
      // the intercept rather than on the verdict for that reason.
      if (declared === "handle" && intercept !== "interrupt") {
        if (intercept === "wheel") {
          stages.push("intercept:wheel");
          return e.kind === "mouse" ? routeMouse(e) : false;
        }
        // **The transcript, whatever is focused** (I40, R-BLK-112,
        // binding.031/.032). `⌥↑` carries `scope: "transcript"` in the registry,
        // and R-BLK-112 says what that buys: *scroll WITHOUT moving focus — the
        // prompt keeps it and you keep typing*. So this does not ask which
        // viewport is active; asking would make the chord mean one thing at the
        // prompt and another inside a `scroll` box, which is the ambiguity the
        // reservation removes.
        //
        // **`PgUp`/`PgDn` used to arrive here and no longer do.** They are in no
        // binding and no rule in the registry — they are the repo's keys, they
        // behave like the arrows, and the ladder gives them to the box you are
        // inside. One route cannot be both, and trying made I40 say *the active
        // viewport* while meaning two different viewports.
        //
        // The transcript's scroller is `global`: all four paging routes register
        // there, and a focused box's paging is on `liveBlock`/`interaction`,
        // which is exactly the rung this steps over.
        stages.push("intercept:scroll:transcript");
        return run("global", e);
      }
    }

    if (e.kind === "mouse") return routeMouse(e);

    // Native release events exist for application surfaces. Calcium's own
    // command bindings remain edge-triggered and must never fire on release.
    if (e.kind === "key" && e.event === "release") {
      const target = activeTarget(inputs());
      stages.push(`target:${target}`);
      if (run(target, e)) return true;
      stages.push("release-dropped");
      return false;
    }

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

    // **A bare `esc` belongs to the child, and only `⌥esc` detaches** (§103,
    // R-OWN-002: *takes all but host.detach*).
    //
    // This is the row that decides whether a full-screen program inside a child
    // is usable at all. `esc` is how vi leaves insert mode, how less closes a
    // help pane, how every curses application cancels — so an `esc` the host
    // consumed to pop a rung is an `esc` that program never receives, and the
    // reader has no way to send one. The child takes **all** keys; the two that
    // leave are `⌃]` and `⌥esc`, and both are deliberately chords a full-screen
    // program does not want.
    //
    // Written here rather than as a handler on `child` because the rule is about
    // what the *host* declines to do: a handler that consumed `esc` and forwarded
    // it would be the same bytes and a second place for the exception to be
    // forgotten.
    if (target === "child" && e.kind === "key" && e.key.name === "escape" && !e.key.meta) {
      stages.push("child:esc-to-child");
      // **Consumed whether or not a handler took it.** The child owns every key
      // that is not a detach chord, so an `esc` no handler claimed must still not
      // fall to `global` — a host binding acting on it is exactly the failure this
      // row exists to stop. Delivery to the PTY is the child surface's business
      // and lands with it in M9; what the router owes is that nothing else acts.
      runRung(target, e);
      return true;
    }

    const verdict = runRung(target, e);
    if (verdict !== "pass") {
      // **`reject` consumes exactly as `handle` does** (R-OWN-001). The two
      // differ in what they did, not in whether the event is spent.
      if (verdict === "reject") stages.push("reject");
      return true;
    }

    // Step 3 is skipped when the top layer is non-dismissable: a layer that must
    // be answered is modal, and a global shortcut firing beneath one acts on a
    // surface the user cannot see (I8).
    const top = deps.overlayTop();
    if (top !== null && top.blocking) {
      // **This is a REJECT and it used to be a silent drop** (§103, R-HON-004,
      // R-INT-009, C16 §3a W2). §103: *a blocking question handles its answer
      // actions and REJECTS unrelated typing; it never passes keys into the held
      // prompt.* The row returned `false`, which told the caller *nobody wanted
      // this* — indistinguishable from an unbound key on a quiet prompt, and the
      // reason the silence was writable at all is W6: `false` meant *pass* and
      // *consume without acting* at once.
      //
      // **Help is not an exception here, and §103 is what settles it.** R-KEY-004
      // asks that the help route stay reachable at every responsive rung, which
      // reads as a conflict until §103's footer table: every rung retains *owner
      // plus its highest-ranked reachable safe action*, and **ordinary** rungs
      // *also* show primary action, safe exit and help. A question is not an
      // ordinary rung. Its footer line is `question · declared actions · esc safe
      // path`, and that line is the explanation R-INT-009 requires — the refusal
      // states its reason by the owner being visible, rather than by a notice
      // per keystroke.
      stages.push("modal-blocked");
      stages.push("reject");
      return true;
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
    get rung() {
      return rungNow();
    },
    get ownerEpoch() {
      syncOwner();
      return ownerEpoch;
    },
    get ownerArmed() {
      syncOwner();
      return guarded;
    },
    armPointer(id: string) {
      syncOwner();
      pointerArm = Object.freeze({ id, epoch: ownerEpoch });
    },
    commitPointer(id: string) {
      // **The epoch is brought current first, and that is what catches trace 16**
      // (I45, I46, R-OWN-002). An owner raised by output or by a timer between
      // the press and the release has had no dispatch of its own in which to
      // move the counter, so comparing against a stale one would commit an
      // activation armed under an owner that is gone.
      syncOwner();
      const armed = pointerArm;
      pointerArm = null;
      return armed !== null && armed.id === id && armed.epoch === ownerEpoch;
    },
    resetFocus: () => {
      // I46's fifth cancellation. A reset is L4 saying the reader is somewhere
      // else now, which is the one cancel no event carries.
      pointerArm = null;
      focus.reset();
    },
    get target() {
      return activeTarget(inputs());
    },
    get lastStages() {
      return Object.freeze([...stages]);
    },
  };
}
