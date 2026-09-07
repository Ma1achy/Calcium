import type { ProducerContext } from "../data/adapters/index.js";
import type { Block } from "../data/viewmodel/index.js";
import type { InputRouter } from "../interaction/router/router.js";
import type { InputEvent, Key } from "../interaction/router/types.js";
import type { TerminalLifecycle } from "../terminal/lifecycle.js";
import type { OverlayManager } from "../viewport/overlay/index.js";

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
  | Readonly<{ reason: "application" | "session" }>
  | Readonly<{ reason: "fault"; fault: SurfaceFault }>;

export type PushedSurface = Readonly<{
  schema: "calcium.pushed-surface/1";
  id: string;
  keymap: readonly SurfaceKeyBinding[];
  render: (context: SurfaceContext) => readonly Block[];
  onAction: (event: SurfaceActionEvent) => void | Promise<void>;
  onClose?: (outcome: SurfaceCloseOutcome) => void | Promise<void>;
}>;

export interface PushedSurfaceHandle {
  readonly id: string;
  readonly inputFidelity: SurfaceInputFidelity;
  readonly closed: Promise<SurfaceCloseOutcome>;
  invalidate(): void;
  close(): Promise<SurfaceCloseOutcome>;
}

export class SurfaceError extends Error {
  override readonly name = "SurfaceError";

  constructor(
    readonly code: "already_open" | "invalid_surface" | "render_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type Schedule = (fn: () => void, ms: number) => Disposable;

export type SurfaceHost = Readonly<{
  open(surface: PushedSurface): PushedSurfaceHandle;
  close(reason: "session"): Promise<SurfaceCloseOutcome | null>;
}>;

export type SurfaceHostOptions = Readonly<{
  overlays: OverlayManager;
  router: InputRouter;
  lifecycle: TerminalLifecycle;
  context: () => Omit<ProducerContext, "width" | "height"> &
    Readonly<{ width: number; height: number }>;
  now: () => number;
  schedule: Schedule;
  invalidate: () => void;
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
  let current: PushedSurfaceHandle | null = null;
  let closeCurrent: ((outcome: SurfaceCloseOutcome) => Promise<SurfaceCloseOutcome>) | null = null;

  function open(surface: PushedSurface): PushedSurfaceHandle {
    if (current !== null) {
      throw new SurfaceError("already_open", `surface ${current.id} is already open`);
    }
    if (surface.schema !== "calcium.pushed-surface/1" || surface.id.length === 0) {
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

    const layerDisposable = options.overlays.push({
      id: surface.id,
      kind: "view",
      placement: { kind: "fill" },
      content: render(),
      dismissable: false,
    });

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

      if (event.key.encoding === "csi-u") {
        releaseLegacy(keyId, elapsedMs);
        if (fidelity !== "native_enhanced_terminal") {
          fidelity = "native_enhanced_terminal";
          invalidate();
        }
        emit(
          action,
          key,
          event.event === "repeat" || event.event === "release" ? event.event : "press",
          fidelity,
          elapsedMs,
        );
        return true;
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

    const routerDisposable = options.router.register("pushedView", onInput, { first: true });
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
      if (!options.overlays.update(surface.id, { content: blocks })) return;
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
      layerDisposable[Symbol.dispose]();
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

    const handle: PushedSurfaceHandle = Object.freeze({
      id: surface.id,
      get inputFidelity() {
        return fidelity;
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
  });
}
