/**
 * C22 §3 — steps 2 to 11, in order, with an event log.
 *
 * Step 1 is `createTui`'s (I7a). Everything here runs inside `start()`, because
 * step 3 may read a manifest from a path and a constructor cannot await.
 *
 * **The log is not diagnostics.** T1.2, T1.3 and T1.4b assert the order against
 * it, and three of the orderings are load-bearing in a way that fails silently:
 * cleanup wired after the handlers that would call it still works on every
 * explicit path and stops working on signal paths only (I1). An ordering whose
 * violation passes the suite needs the suite to be about the ordering.
 *
 * §3a walks every pair. The three that matter:
 *
 *   - **5, 6 before 7** (I1) — `beforeRelease` closes over the history store
 *     and the runner.
 *   - **7 before any acquire** (I2) — C01 registers its handlers at
 *     construction, which is what closes its crash window.
 *   - **4 before 11** (I3) — a registry sealed after input is accepted can
 *     answer differently at two points in one session.
 *
 * And the one §3a found: **10 before 11**. The submit handler closes over the
 * pipeline and the pipeline closes over the router, so registration cannot sit
 * with the router's construction. It is its own step.
 */

import { createAdapterRegistry } from "../data/adapters/index.js";
import { createManifestStore, parseManifest } from "../data/manifest/index.js";
import { createProcessRunner } from "../data/process/runner.js";
import type { ProcessRunner } from "../data/process/types.js";
import { createBlockRegistry } from "../presentation/blocks/index.js";
import { loadTheme, type ThemeStore } from "../presentation/theme/index.js";
import { createTranscriptStore } from "../viewport/transcript/index.js";
import { createViewport } from "../viewport/viewport/index.js";
import { createOverlayManager } from "../viewport/overlay/index.js";
import { createEditor } from "../interaction/editor/index.js";
import { createEngine } from "../interaction/completion/index.js";
import { createFocusStore } from "../interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../interaction/router/router.js";
import { openHistory } from "../interaction/history/index.js";
import { detectCapabilities, type TerminalCapabilities } from "../terminal/capabilities.js";
import { createFrameScheduler } from "../terminal/frame-scheduler.js";
import {
  createTerminalLifecycle,
  terminalSize,
  type TerminalLifecycle,
} from "../terminal/lifecycle.js";
import { makeBeforeRelease } from "./shutdown.js";
import type { ResolvedConfig } from "./config.js";
import { createSessionStore, type SessionStore } from "./state.js";
import type { Pipeline, StopReason } from "./types.js";

/**
 * Every step, named. The log is compared against this rather than against a
 * list written inside the test — a test carrying its own copy of the order
 * agrees with itself under any permutation of the thing it is checking.
 */
export const STEPS = Object.freeze([
  "capabilities",
  "registries",
  "seal",
  "stores",
  "runner",
  "lifecycle",
  "scheduler",
  "router",
  "pipeline",
  "register",
] as const);

export type Step = (typeof STEPS)[number];

/**
 * The five router pulls that are the **frame's** and not any store's.
 *
 * C16 asks where the transcript region sits, which entry is at a screen row,
 * and whether copy mode is on — and none of those is on `Viewport`, because
 * none is a property of the scrolled document. They are properties of the
 * composed frame, which is C22's and lives in `frame.ts`.
 *
 * Declared here as a seam for the same reason `Pipeline` is: a narrow interface
 * named by the consumer cannot grow a member the consumer never needed. It is
 * also what stops the alternative, which is inventing these on `Viewport` and
 * giving C14 a dependency on where things are drawn.
 */
export type FrameQueries = Readonly<{
  copyMode: () => boolean;
  exitCopyMode: () => void;
  entryAtRow: (row: number) => Readonly<{ id: string; rowOffset: number }> | null;
  /**
   * Where the transcript sits, for mouse routing (C16 `RouterDeps.region`).
   *
   * **Not the same region as `overlayRegion`**, despite both being called one.
   * C16 asks *where* — `{ top, height }` — and C15 asks *how big* —
   * `{ width, height }` (C15 `Region`). Two shapes, one word, and passing
   * either to the other's consumer compiles for `height` alone.
   */
  region: () => Readonly<{ top: number; height: number }>;
  /** The area layers are placed within (C15 `Region`). */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  mouseEnabled: () => boolean;
  /** Raises the Ctrl-C / Ctrl-D confirm — a layer over C15, composed by C22. */
  raiseExitConfirm: () => void;
}>;

export type ConstructDeps = Readonly<{
  /** C22's own `stop`, for `/exit` and the confirm rungs. */
  stop: (reason: StopReason) => Promise<number>;
  /** The frame. C03 takes both; `frame.ts` supplies them. */
  render: () => void;
  repaint: () => void;
  frame: FrameQueries;
  onFatal: (err: unknown) => never;
  /** Diagnostics sink — C01 owns the redirection, this is where lines land. */
  debug?: (line: string) => void;
}>;

export type Graph = Readonly<{
  capabilities: TerminalCapabilities;
  capabilityWarnings: readonly string[];
  blocks: ReturnType<typeof createBlockRegistry>;
  adapters: ReturnType<typeof createAdapterRegistry>;
  manifest: ReturnType<typeof createManifestStore>;
  completion: ReturnType<typeof createEngine>;
  transcript: ReturnType<typeof createTranscriptStore>;
  viewport: ReturnType<typeof createViewport>;
  overlays: ReturnType<typeof createOverlayManager>;
  history: Awaited<ReturnType<typeof openHistory>>;
  editor: ReturnType<typeof createEditor>;
  theme: ThemeStore;
  runner: ProcessRunner;
  lifecycle: TerminalLifecycle;
  scheduler: ReturnType<typeof createFrameScheduler>;
  router: ReturnType<typeof createRouter>;
  pipeline: Pipeline | null;
  session: SessionStore;
  log: readonly Step[];
}>;

export class ConstructionError extends Error {
  constructor(
    readonly step: Step,
    cause: unknown,
  ) {
    super(`construction failed at step \`${step}\`: ${String(cause)}`, { cause });
    this.name = "ConstructionError";
  }
}

export async function constructGraph(
  config: ResolvedConfig,
  deps: ConstructDeps,
): Promise<Graph> {
  const log: Step[] = [];
  const at = <T>(step: Step, fn: () => T): T => {
    let value: T;
    try {
      value = fn();
    } catch (cause) {
      throw new ConstructionError(step, cause);
    }
    log.push(step);
    return value;
  };

  // --- 2. capabilities ------------------------------------------------------
  // Before the registries, because a block definition may vary by capability
  // (A02 §3) — and a record built after them would give a table in ASCII beside
  // a sparkline that is not, which is the thing C02 exists to prevent.
  const detection = at("capabilities", () => detectCapabilities(config.env));

  // --- 3. registries: blocks, adapters, manifest, completion sources --------
  // **Manifest before completion sources**, within the step: the default
  // sources are manifest-derived (§2), so built first they would answer over an
  // empty tool list and never refill.
  const built = await (async () => {
    const blocks = createBlockRegistry({ defaults: true });
    for (const definition of config.blocks) blocks.register(definition);

    const adapters = createAdapterRegistry(config.adapters);

    const manifest = createManifestStore();
    const parsed =
      typeof config.manifest === "string"
        ? parseManifest(await config.fs.readFile(config.manifest))
        : { ok: true as const, value: config.manifest };
    if (!parsed.ok) throw new ConstructionError("registries", parsed.error);
    manifest.load(parsed.value);

    const completion = createEngine({ now: config.clock });
    for (const source of config.completionSources) completion.register(source);

    return { blocks, adapters, manifest, completion };
  })().catch((cause: unknown) => {
    throw cause instanceof ConstructionError ? cause : new ConstructionError("registries", cause);
  });
  log.push("registries");

  // --- 4. seal the three registries that have a seal ------------------------
  // **Three, not four.** C19's engine has no `seal` and never had one:
  // `register` returns a `Disposable` because a dynamic source is meant to come
  // and go within a session (C19 §2). The step list said "all four" against a
  // line naming three components, and what made the disagreement visible was
  // writing `completion.seal()` and watching it not compile. C23's registry is
  // the fourth seal, at step 10.
  at("seal", () => {
    built.blocks.seal();
    built.adapters.seal();
    built.manifest.seal();
  });

  // --- 5. stores ------------------------------------------------------------
  //
  // **The viewport's dimensions come from `terminalSize`, not from a
  // lifecycle**, and that is the pair §3a could not see because it lives in
  // another component. The viewport takes `width` and `height` here (C14 §2);
  // only `terminal/lifecycle.ts` may read them (C01 I13, SS42); and the
  // lifecycle is step 7 and cannot move earlier, because C01 takes
  // `beforeRelease` at construction and it closes over the history store and
  // the runner (I1).
  //
  // Written the obvious way — construct the lifecycle first and call `size()` —
  // this silently inverts I1, and nothing fails: every explicit exit path still
  // cleans up, and only a signal arriving during construction finds a
  // `beforeRelease` closed over `undefined`. C01 I13 is a rule about a **file**
  // rather than about an object, so the read moved to a free function in that
  // file and neither invariant has to give.
  const size = terminalSize(config.stdout);
  const stores = await (async () => {
    const transcript = createTranscriptStore(
      config.retainPayloads > 0 ? { retainPayloads: config.retainPayloads } : {},
    );
    // The store *is* the view (C13 §2, `TranscriptStore extends TranscriptView`)
    // — C14 takes the reader half, and passing the store satisfies it.
    const viewport = createViewport(transcript, {
      width: size.columns,
      height: size.rows,
      measureSequence: (blocks, width) => built.blocks.measureSequence(blocks, width),
    });
    const overlays = createOverlayManager({ registry: built.blocks });
    const history = await openHistory({
      fs: config.fs,
      clock: config.clock,
      stateDir: config.stateDir,
    });
    const editor = createEditor();
    const themed = loadTheme(config.theme);
    if (!themed.ok) throw new ConstructionError("stores", themed.error);

    return { transcript, viewport, overlays, history, editor, theme: themed.value };
  })().catch((cause: unknown) => {
    throw cause instanceof ConstructionError ? cause : new ConstructionError("stores", cause);
  });
  log.push("stores");

  // --- 6. the process runner ------------------------------------------------
  const runner = at("runner", () =>
    createProcessRunner({
      env: config.env,
      stdin: config.stdin,
      ...(deps.debug === undefined ? {} : { debug: deps.debug }),
    }),
  );

  const session = createSessionStore({
    cwd: config.cwd,
    env: {},
    cluster: config.cluster,
    version: config.version,
  });

  // --- 7. the lifecycle, and the handlers it registers ----------------------
  // After 5 and 6 (I1): `beforeRelease` closes over the history store and the
  // runner, and C01's signal handlers exit the process after releasing — so
  // cleanup not wired by now never runs on a signal path at all.
  const lifecycle = at("lifecycle", () =>
    createTerminalLifecycle({
      stdout: config.stdout,
      stdin: config.stdin,
      capabilities: detection.capabilities,
      onFatal: deps.onFatal,
      beforeRelease: makeBeforeRelease(runner, stores.history),
      ...(deps.debug === undefined ? {} : { debug: deps.debug }),
    }),
  );

  // --- 8. the frame scheduler -----------------------------------------------
  // After the lifecycle: C03 takes `lifecycle` and `write`, so there is nothing
  // to construct before it exists.
  const scheduler = at("scheduler", () =>
    createFrameScheduler({
      render: deps.render,
      repaint: deps.repaint,
      capabilities: detection.capabilities,
      lifecycle,
      write: (s) => void lifecycle.writer.write(s),
    }),
  );

  // --- 9. the input router --------------------------------------------------
  const router = at("router", () =>
    createRouter({
      focus: createFocusStore(),
      keymap: createKeymap(defaultKeymap),
      now: config.clock,
      deps: routerDeps(stores, runner, scheduler, deps.frame),
    }),
  );

  // --- 10. the execution pipeline -------------------------------------------
  // Takes the router, because C23's submit row ends `resetFocus()` (Seam 4).
  // Seals its own registry here, which is I3's fifth.
  const pipeline = at("pipeline", () => {
    if (config.pipeline === undefined) return null;
    const p = config.pipeline({
      session: session.snapshot,
      resetFocus: () => router.resetFocus(),
      stop: deps.stop,
    });
    p.seal();
    return p;
  });

  // --- 11. register every handler -------------------------------------------
  // **Its own step, and that is §3a's finding.** The submit handler closes over
  // the pipeline built at 10, and the pipeline closes over the router built at
  // 9. Registering with the router would require one of the two to exist before
  // it does.
  at("register", () => {
    router.register("prompt", (e) => {
      if (!(e.kind === "key" && e.key.name === "return")) return false;
      pipeline?.submit(stores.editor.text);
      return true;
    });
  });

  return Object.freeze({
    capabilities: detection.capabilities,
    capabilityWarnings: detection.warnings,
    blocks: built.blocks,
    adapters: built.adapters,
    manifest: built.manifest,
    completion: built.completion,
    ...stores,
    runner,
    lifecycle,
    scheduler,
    router,
    pipeline,
    session,
    log: Object.freeze([...log]),
  });
}

/**
 * C16's seventeen pulls, every one supplied here.
 *
 * **Every one is a pull and none is a subscription** (C16 §2). C13 emits
 * `append` then `evict` for one call, so a consumer reading deltas as current
 * state sees a half-applied store — which cost C14 a blank screen that every
 * assertion passed.
 */
function routerDeps(
  stores: {
    transcript: ReturnType<typeof createTranscriptStore>;
    overlays: ReturnType<typeof createOverlayManager>;
    editor: ReturnType<typeof createEditor>;
  },
  runner: ProcessRunner,
  scheduler: ReturnType<typeof createFrameScheduler>,
  frame: FrameQueries,
): RouterDeps {
  const top = (): Readonly<{ kind: "overlay" | "view"; id: string; dismissable: boolean }> | null => {
    const layer = stores.overlays.top;
    return layer === null
      ? null
      : { kind: layer.kind, id: layer.id, dismissable: layer.dismissable };
  };

  return {
    overlayTop: top,
    placed: () => stores.overlays.layout(frame.overlayRegion()),
    popLayer: () => void stores.overlays.pop(),
    copyMode: frame.copyMode,
    exitCopyMode: frame.exitCopyMode,
    // `liveId`, not a `live` entry: C13 exposes the id and C16 only compares it.
    liveEntry: () => {
      const id = stores.transcript.liveId;
      return id === null ? null : { id };
    },
    entryAtRow: frame.entryAtRow,
    busy: () => runner.live.length > 0,
    // Not awaited, and for `beforeRelease`'s reason one layer over: the signals
    // go out synchronously and the reaping is what the promise is for. A
    // keystroke handler is not a place to await a child's exit.
    cancel: () => void runner.killAll(),
    shellChild: () => runner.live.some((h) => h.running),
    signalShellChild: () => {
      for (const handle of runner.live) handle.signal("SIGINT");
    },
    region: frame.region,
    mouseEnabled: frame.mouseEnabled,
    promptHasText: () => stores.editor.text.length > 0,
    clearPrompt: () => {
      stores.editor.setText("");
      scheduler.commit("input");
    },
    raiseExitConfirm: frame.raiseExitConfirm,
  };
}
