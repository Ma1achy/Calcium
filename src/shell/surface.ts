import type { ProducerContext } from "../data/adapters/index.js";
import type { Block } from "../data/viewmodel/index.js";
import { keyText } from "../interaction/router/keymap.js";
import type { InputRouter } from "../interaction/router/router.js";
import type { InputEvent, Key } from "../interaction/router/types.js";
import type { TerminalLifecycle } from "../terminal/lifecycle.js";

export type SurfaceInputPhase = "press" | "repeat" | "release";
export type SurfaceInputFidelity = "native_enhanced_terminal" | "legacy_terminal";

export type SurfaceKeyChord = Readonly<{
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}>;

export type SurfaceKeyBinding = Readonly<{
  key: SurfaceKeyChord;
  action: string;
}>;

export type SurfaceActionEvent = Readonly<{
  action: string;
  key: Readonly<{
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
  }>;
  phase: SurfaceInputPhase;
  fidelity: SurfaceInputFidelity;
  elapsedMs: number;
  ordinal: number;
}>;

export type SurfaceContext = Omit<ProducerContext, "width" | "height"> &
  Readonly<{
    width: number;
    height: number;
    inputFidelity: SurfaceInputFidelity;
  }>;

export type SurfaceFault = Readonly<{
  stage: "render" | "action" | "close";
  message: string;
}>;

export type SurfaceCloseOutcome =
  // **`detach` is the reader's, and it is a third reason rather than a second
  // spelling of one** (C16 I49, R-BLK-908). `application` is the app closing its
  // own child and `session` is the shell coming down; a host escape is neither,
  // and an application that cannot tell them apart cannot know whether its work
  // was finished or walked away from.
  | Readonly<{ reason: "application" | "session" | "detach" }>
  | Readonly<{ reason: "fault"; fault: SurfaceFault }>;

export type ChildSurface = Readonly<{
  schema: "calcium.child-surface/1";
  id: string;
  keymap: readonly SurfaceKeyBinding[];
  render: (context: SurfaceContext) => readonly Block[];
  onAction: (event: SurfaceActionEvent) => void | Promise<void>;
  onClose?: (outcome: SurfaceCloseOutcome) => void | Promise<void>;
}>;

export interface ChildSurfaceHandle {
  readonly id: string;
  readonly inputFidelity: SurfaceInputFidelity;
  /** Monotonic milliseconds since this surface opened, from the host clock. */
  readonly elapsedMs: number;
  readonly closed: Promise<SurfaceCloseOutcome>;
  invalidate(): void;
  close(): Promise<SurfaceCloseOutcome>;
}

export class SurfaceError extends Error {
  override readonly name = "SurfaceError";

  constructor(
    readonly code: "already_open" | "invalid_surface" | "render_failed" | "reserved_chord",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type Schedule = (fn: () => void, ms: number) => Disposable;

export type SurfaceHost = Readonly<{
  open(surface: ChildSurface): ChildSurfaceHandle;
  close(reason: "session" | "detach"): Promise<SurfaceCloseOutcome | null>;
  /** Whether a child holds the keyboard — C16's second source for `attachedChild` (I49). */
  readonly attached: boolean;
}>;

export type SurfaceHostOptions = Readonly<{
  /**
   * Where the child's blocks go — **the transcript, as an entry** (C22 I110,
   * R-BLK-645, R-BLK-314).
   *
   * Not a layer, and the three things a pushed view cost are returned by this
   * one seam: the reader can scroll, what settled while the child was attached
   * is in the record, and the entry survives the detach rather than leaving a
   * hole where the work was. `replace` is called on every invalidation and every
   * resize; nothing removes the entry, because there is nothing to remove.
   *
   * Handed in rather than taken as a store, because *where the blocks go* and
   * *who has the keyboard* are two halves and this file owns only the second
   * (C22 I110's own paragraph).
   */
  entry: Readonly<{
    append(id: string, blocks: readonly Block[]): string;
    replace(entryId: string, id: string, blocks: readonly Block[]): void;
  }>;
  router: InputRouter;
  lifecycle: TerminalLifecycle;
  context: () => Omit<ProducerContext, "width" | "height"> &
    Readonly<{ width: number; height: number }>;
  now: () => number;
  schedule: Schedule;
  invalidate: () => void;
  /**
   * The chords a captured child may not bind (C16 I49, R-BLK-908).
   *
   * *A captured child reserves one `host.detach` action… Resolution
   * collision-tests and may rebind the base candidate, but may never leave
   * capture without a visible, reachable host escape.* This is that collision
   * test, and it is handed in rather than written here so the reservation has
   * one source: the rows the keymap carries at the `child` target, which are
   * also the rows `/help` renders and the rows the border's legend names.
   */
  reservedChords: () => readonly SurfaceKeyChord[];
}>;

const LEGACY_RELEASE_MS = 50;

function chordKey(key: SurfaceKeyChord): string {
  return `${key.ctrl === true ? "c" : "-"}${key.meta === true ? "m" : "-"}${
    key.shift === true ? "s" : "-"
  }:${key.name}`;
}

function publicKey(key: Key): SurfaceActionEvent["key"] {
  return Object.freeze({
    name: key.name,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
  });
}

function fault(stage: SurfaceFault["stage"], cause: unknown): SurfaceFault {
  return Object.freeze({
    stage,
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

export function createSurfaceHost(options: SurfaceHostOptions): SurfaceHost {
  let current: ChildSurfaceHandle | null = null;
  let closeCurrent: ((outcome: SurfaceCloseOutcome) => Promise<SurfaceCloseOutcome>) | null = null;

  function open(surface: ChildSurface): ChildSurfaceHandle {
    if (current !== null) {
      throw new SurfaceError("already_open", `surface ${current.id} is already open`);
    }
    if (surface.schema !== "calcium.child-surface/1" || surface.id.length === 0) {
      throw new SurfaceError("invalid_surface", "surface schema and non-empty id are required");
    }

    const bindings = new Map<string, string>();
    for (const binding of surface.keymap) {
      if (binding.key.name.length === 0 || binding.action.length === 0) {
        throw new SurfaceError("invalid_surface", "surface key names and actions must be non-empty");
      }
      const key = chordKey(binding.key);
      if (bindings.has(key)) {
        throw new SurfaceError("invalid_surface", `duplicate surface key binding ${key}`);
      }
      bindings.set(key, binding.action);
    }

    // **The reservation is refusable or it is a sentence** (C16 I49,
    // R-BLK-908). The failure this catches is the one the handler order cannot:
    // the host's `host.detach` handler runs in front of the child's, so an
    // application binding `⌃]` is not shadowing the escape — it is declaring a
    // key it will never be given, and silently never receiving one is worse
    // than being told at the attach. Refused with the chord named, because the
    // application's own remedy is to choose another and it cannot without it.
    for (const chord of options.reservedChords()) {
      if (!bindings.has(chordKey(chord))) continue;
      // **Named in the reader's spelling, not the join key's.** `chordKey` is an
      // index — `c--:]` — and the application's remedy is to choose another
      // chord, which it takes from `/help` and the border's legend. Those are
      // written by `keyText`, so the refusal says `c+]` and the three agree.
      throw new SurfaceError(
        "reserved_chord",
        `surface ${surface.id} binds ${keyText(chord)}, which is the host escape and is never ` +
          `delivered to a child`,
      );
    }

    let fidelity: SurfaceInputFidelity = "legacy_terminal";
    const openedAt = options.now();
    let ordinal = 0;
    let closing = false;
    let closeResult: SurfaceCloseOutcome | null = null;
    let resolveClosed: (outcome: SurfaceCloseOutcome) => void = () => undefined;
    const closed = new Promise<SurfaceCloseOutcome>((resolve) => {
      resolveClosed = resolve;
    });
    let actionQueue = Promise.resolve();
    const held = new Map<
      string,
      Readonly<{
        action: string;
        key: SurfaceActionEvent["key"];
        release: Disposable;
      }>
    >();

    const context = (): SurfaceContext =>
      Object.freeze({ ...options.context(), inputFidelity: fidelity });

    const render = (): readonly Block[] => {
      try {
        const blocks = surface.render(context());
        if (!Array.isArray(blocks)) throw new TypeError("surface render must return a block array");
        return blocks;
      } catch (cause) {
        throw new SurfaceError("render_failed", `surface ${surface.id} render failed`, { cause });
      }
    };

    // **Appended, not pushed** (C22 I110). The entry is written once and
    // rewritten in place for as long as the child holds the keyboard, and it is
    // still there afterwards — a captured child is a thing that happened in this
    // session, and a layer is a thing that was covering it.
    const entryId = options.entry.append(surface.id, render());

    const emit = (
      action: string,
      key: SurfaceActionEvent["key"],
      phase: SurfaceInputPhase,
      eventFidelity: SurfaceInputFidelity,
      elapsedMs: number,
    ): void => {
      ordinal += 1;
      const event = Object.freeze({
        action,
        key,
        phase,
        fidelity: eventFidelity,
        elapsedMs,
        ordinal,
      });
      actionQueue = actionQueue.then(async () => {
        if (closeResult?.reason === "fault") return;
        await surface.onAction(event);
      });
      void actionQueue.catch((cause: unknown) => {
        beginClose({ reason: "fault", fault: fault("action", cause) });
      });
    };

    const releaseLegacy = (keyId: string, elapsedMs: number): void => {
      const active = held.get(keyId);
      if (active === undefined) return;
      active.release[Symbol.dispose]();
      held.delete(keyId);
      emit(active.action, active.key, "release", "legacy_terminal", elapsedMs);
    };

    const onInput = (event: InputEvent): boolean => {
      if (closing || event.kind !== "key") return false;
      const keyId = chordKey(event.key);
      const action = bindings.get(keyId);
      if (action === undefined) return false;
      const key = publicKey(event.key);
      const elapsedMs = Math.max(0, options.now() - openedAt);

      if (event.key.encoding === "csi-u" && event.event !== undefined) {
        releaseLegacy(keyId, elapsedMs);
        if (fidelity !== "native_enhanced_terminal") {
          fidelity = "native_enhanced_terminal";
          invalidate();
        }
        emit(
          action,
          key,
          event.event,
          fidelity,
          elapsedMs,
        );
        return true;
      }

      if (fidelity !== "legacy_terminal") {
        fidelity = "legacy_terminal";
        invalidate();
      }

      const active = held.get(keyId);
      active?.release[Symbol.dispose]();
      emit(action, key, active === undefined ? "press" : "repeat", "legacy_terminal", elapsedMs);
      const deadline = elapsedMs + LEGACY_RELEASE_MS;
      held.set(
        keyId,
        Object.freeze({
          action,
          key,
          release: options.schedule(() => releaseLegacy(keyId, deadline), LEGACY_RELEASE_MS),
        }),
      );
      return true;
    };

    // **The `child` rung, and the handler consumes what it does not bind** (C16
    // I49, R-BLK-838: *takes all but host.detach*). `onInput` answers `false`
    // for an unbound key, and at `pushedView` that was right — a view is a
    // substate and a key it does not want belongs to the rung below. A captured
    // child is not a substate: a key that fell through would be the host typing
    // into a prompt the reader cannot see while a PTY holds the terminal. So the
    // fall-through is closed here rather than inside `onInput`, which keeps
    // `onInput` a statement about the child's own bindings.
    // **Registered ordinarily, and `first: true` is what had to go** (C16 I49,
    // R-BLK-908). At `pushedView` it was right: the target carried eleven view
    // rows and a surface had to beat them. At `child` the target carries two,
    // both `host.detach`, and the composition root registers their handler when
    // the graph is built — so an ordinary registration puts this **behind** it,
    // which is exactly the order *takes all but host.detach* asks for. With
    // `first: true` the consuming wrapper below swallowed the host escape and
    // the one key out of capture did nothing; T1.4h is what found it.
    //
    // The wrapper is why the order matters at all: `onInput` answers `false`
    // for an unbound key and this turns that into `true`, because a key that
    // fell past a captured child would be the host typing into a line the
    // reader cannot see.
    const routerDisposable = options.router.register("child", (event) =>
      onInput(event) ? true : event.kind === "key",
    );
    const resizeDisposable = options.lifecycle.onResize(() => invalidate());

    function invalidate(): void {
      if (closing) return;
      let blocks: readonly Block[];
      try {
        blocks = render();
      } catch (cause) {
        beginClose({ reason: "fault", fault: fault("render", cause) });
        return;
      }
      options.entry.replace(entryId, surface.id, blocks);
      options.invalidate();
    }

    function beginClose(outcome: SurfaceCloseOutcome): Promise<SurfaceCloseOutcome> {
      if (closing) return closed;
      closing = true;
      closeResult = outcome;
      const at = Math.max(0, options.now() - openedAt);
      for (const keyId of [...held.keys()]) releaseLegacy(keyId, at);
      routerDisposable.dispose();
      resizeDisposable[Symbol.dispose]();
      // **The entry stays** (C22 I110). It holds the last blocks the child
      // rendered, which is the record of what was on screen when ownership came
      // back — and a detach that swept it would be the pushed view's hole
      // arriving by another name.
      options.invalidate();
      current = null;
      closeCurrent = null;

      void actionQueue
        .catch(() => undefined)
        .then(async () => {
          let result = outcome;
          try {
            await surface.onClose?.(result);
          } catch (cause) {
            result = { reason: "fault", fault: fault("close", cause) };
          }
          closeResult = Object.freeze(result);
          resolveClosed(closeResult);
        });
      return closed;
    }

    const handle: ChildSurfaceHandle = Object.freeze({
      id: surface.id,
      get inputFidelity() {
        return fidelity;
      },
      get elapsedMs() {
        return Math.max(0, options.now() - openedAt);
      },
      closed,
      invalidate,
      close: () => beginClose({ reason: "application" }),
    });
    current = handle;
    closeCurrent = beginClose;
    options.invalidate();
    return handle;
  }

  return Object.freeze({
    open,
    close: (reason) =>
      closeCurrent === null ? Promise.resolve(null) : closeCurrent({ reason }),
    // **Read rather than held**, so there is one answer to *is a child
    // attached* (C16 I49). `current` is nulled in `beginClose` before the
    // asynchronous half of the teardown runs, which is the moment ownership
    // returns to the host — a second flag set beside it would be a second
    // answer able to disagree with this one for the length of a promise.
    get attached() {
      return current !== null;
    },
  });
}
