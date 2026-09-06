/**
 * A C23 pipeline with real collaborators, for tier 4.
 *
 * The unit harness in `test/unit/execution.test.ts` fakes everything, which is
 * what tier 1 is for. This one takes the **real** stores by default — a real
 * transcript, a real theme, a real session — because a tier-4 row's whole claim
 * is that two components agree, and a fake on either side is a test that the
 * fake agrees with itself.
 *
 * Everything is overridable, and per `test/support/README.md` **an override must
 * be shown to respond to the thing under test before it is asserted against**.
 * That rule covers fakes as well as fixtures, and it was written because
 * `editor: {} as never` cost a diagnosis: a stub satisfying a type is a stub
 * that gets called, and `as never` is the shape that makes a call site look
 * checked.
 */

import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createConfirmHost } from "../../src/shell/confirm.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { registry as overlayRegistry } from "./overlay.js";
import { createSessionStore } from "../../src/shell/state.js";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { loadTheme, defaultTheme, type ThemeStore } from "../../src/presentation/theme/index.js";
import { slashPolicy } from "../../src/interaction/parser/index.js";
import { createEditor } from "../../src/interaction/editor/index.js";
import { fixture } from "./manifest.js";
import { withThemeNames } from "../../src/data/manifest/index.js";
import { doc, localDoc } from "./blocks.js";
import { result } from "./transport.js";
import type { RefreshHost } from "../../src/shell/refresh.js";
import type { ConfirmHost } from "../../src/shell/confirm.js";
import type { Pipeline, PipelineDeps } from "../../src/shell/types.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { ViewDocument, ViewPatch } from "../../src/data/viewmodel/index.js";
import type { HistoryEntry } from "../../src/interaction/history/types.js";
import type { Exit } from "../../src/data/process/types.js";

import { FULL_CAPABILITIES } from "./producer-context.js";
export type PipelineScript = Readonly<{
  invoke?: () => Promise<RawResult>;
  stream?: () => AsyncIterable<RawPatch>;
  adapt?: () => ViewDocument;
  /** A scripted patch adapter, as the unit harness has; `null` drops the patch (C07). */
  adaptPatch?: () => ViewPatch | null;
  spawnShell?: (command: string) => {
    stdout: AsyncIterable<string>;
    exited: Promise<{ code: number | null }>;
    overflowed: boolean;
  };
  history?: readonly HistoryEntry[];
  theme?: ThemeStore;
  /** For the handoff rows: reject to reach C23 §8a A6.5's throw path. */
  handoff?: (argv: readonly string[]) => Promise<Exit>;
  /** C23 I46 — for the rows about the off-screen pause. Everything visible by default. */
  visible?: (host: RefreshHost) => boolean;
  /** C23 I60's test consumer: which calls need a decision, and what the layer says. */
  approval?: PipelineDeps["approval"];
  /**
   * The PTY arm (C21 I18, C23 I63). `hasPty` is separate from `spawnPty` on
   * purpose: the route reads the flag and never the method's absence, so a row
   * can set the flag true with a factory that throws and reach T3.63.
   */
  hasPty?: boolean;
  spawnPty?: (
    command: string,
    opts: Readonly<{ cols: number; rows: number }>,
  ) => Readonly<{
    pid: number | null;
    exited: Promise<Exit>;
    running: boolean;
    onData: (cb: (chunk: string) => void) => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    signal: (sig: string) => boolean;
  }>;
  /** The region the body is measured against, for the resize rows (C23 I65). */
  region?: () => Readonly<{ width: number; height: number }>;
}>;

export type PipelineHarness = Readonly<{
  pipeline: Pipeline;
  /** The real confirm host, so a row can answer the approval layer through its handler. */
  confirm: ConfirmHost;
  transcript: ReturnType<typeof createTranscriptStore>;
  session: ReturnType<typeof createSessionStore>;
  theme: ThemeStore;
  /** Commit reasons in order, so Seam 4's sequences are assertable. */
  commits: string[];
  /** Every `--no-bg` decision, in order — `false` included (C22 I66). */
  suppressed: boolean[];
  /** Every cross-layer call C23 made, in order. */
  calls: string[];
  /** Shell commands actually spawned, for the `cd` rows. */
  spawned: { command: string; cwd: string }[];
  /** Each argv `runner.handoff` was given, for A02 Seam 4's TTY row. */
  handed: string[][];
  /** `suspend` / `resume`, interleaved into `calls` and also counted here. */
  lifecycle: string[];
  /** C23 I64 — holds a frame open, so a row can see what coalescing suppresses. */
  setPending: (v: boolean) => void;
  /**
   * What reached C20 (C23 I29).
   *
   * It was declared, filled by the `history.append` double, and then returned
   * from **`schedule`'s disposable** instead of from the harness — a stray edit
   * that type-checks, because a `Disposable` with an extra property still is one.
   * No consumer read it, so nothing failed: the field was collected for four
   * components and reachable by nobody.
   */
  recorded: { command: string; exitCode: number }[];
  tick: (ms: number) => void;
}>;

const turn = (): Promise<void> =>
  new Promise((r) => {
    setImmediate(r);
  });

/**
 * Lets every `void`-ed async route settle before assertions.
 *
 * **Given a pipeline it waits for the route rather than for a turn.** The
 * `shell` route awaits the emulator's parser as well as the child's streams
 * (C27 I3), so how many turns it needs is a property of a dependency and not of
 * this file — and a count chosen to pass today is the shape a flake takes. The
 * guard is held for exactly the life of a route (C23 I5), so `inFlight` going
 * null is the route having finished, from the one witness that cannot be a turn
 * out of date. Capped, so a route that never releases fails as an assertion
 * rather than as a timeout with no sentence in it.
 */
export const settled = async (p?: { readonly inFlight: unknown }): Promise<void> => {
  await turn();
  if (p === undefined) return;
  // **Wait for the route to take the guard before waiting for it to let go.**
  // A poll that only watches for `null` is satisfied by the instant *before* the
  // route starts, which is the reading that made a hundred-chunk screen assert
  // against sixteen lines and pass on the count it was checking.
  //
  // **Bounded by the clock rather than by a turn count**, because the emulator's
  // parser resolves on a timer of its own: a fixed number of `setImmediate`s is
  // a guess about a dependency's scheduling, and the guess was wrong by an order
  // of magnitude. A deadline is a guess about nothing.
  const wait = (): Promise<void> => new Promise((r) => void setTimeout(r, 0));
  // Phase one is short on purpose: a route that takes the guard does so within a
  // turn or two of `submit`, and most routes here never take it at all — waiting
  // the full deadline for those would be ten seconds a call site.
  const started = Date.now() + 20;
  while (p.inFlight === null && Date.now() < started) await wait();
  const deadline = Date.now() + 10_000;
  while (p.inFlight !== null && Date.now() < deadline) await wait();
  await turn();
  await turn();
};

export function pipelineHarness(script: PipelineScript = {}): PipelineHarness {
  const transcript = createTranscriptStore();
  const session = createSessionStore({ cwd: "/work", env: {}, cluster: "c", version: "1" });
  const themed = loadTheme(defaultTheme);
  if (!themed.ok) throw new Error("the default theme must load");
  const theme = script.theme ?? themed.value;

  const commits: string[] = [];
  /** What `/theme` wrote for `--no-bg`, in order (C22 I66). */
  const suppressed: boolean[] = [];
  const calls: string[] = [];
  /** What reached C20 (C23 I29), for the tests that assert the record. */
  const recorded: { command: string; exitCode: number }[] = [];
  const spawned: { command: string; cwd: string }[] = [];
  const handed: string[][] = [];
  const lifecycleCalls: string[] = [];
  /**
   * A controllable clock and scheduler, so §3b's timers are driven not waited on.
   *
   * **Each armed callback fires once**, as `setTimeout` does — the ambient
   * `schedule` C22 supplies is a one-shot (`session.ts`), and a fake that re-fires
   * every callback on every tick makes a periodic mechanism and a one-shot one the
   * same test. Stall detection was armed once and never re-armed for the whole of
   * C22 and C23 underneath a harness shaped that way; nothing failed, because
   * nothing could (C23 T1.30, T6.30).
   *
   * A timer armed *during* a tick waits for the next one, so a self-re-arming
   * chain advances one step per call rather than running away — the same barrier
   * `fake-scheduler.ts` documents.
   */
  let now = 0;
  let schedulerPending = false;
  const timers: { fn: () => void; at: number; live: boolean }[] = [];

  const harnessOverlays = createOverlayManager({ registry: overlayRegistry });
  const harnessConfirm = createConfirmHost({ overlays: harnessOverlays, anchor: () => ({ row: 0, rows: 1 }), overlayRegion: () => ({ width: 80, height: 24 }), invalidate: () => undefined });
  const deps = {
    session: () => session.snapshot,
    writes: session.execution,
    transcript,
    scheduler: {
      commit: (r: string) => void commits.push(r),
      flush: () => undefined,
      invalidate: () => void calls.push("invalidate"),
      // **Writable, because C23 I64's coalescing reads it.** A constant `false`
      // makes the route draw on every chunk and the row that counts patches
      // agrees with a route that has no gate at all.
      get pending(): boolean {
        return schedulerPending;
      },
      contaminated: false,
    },
    transport: {
      for: () => ({
        invoke: async () => {
          calls.push("invoke");
          return script.invoke === undefined ? result({ exitCode: 0 }) : await script.invoke();
        },
        stream: () => {
          calls.push("stream");
          return script.stream === undefined ? (async function* () {})() : script.stream();
        },
      }),
      busy: false,
      inFlight: null,
    },
    adapters: {
      adapt: () => (script.adapt === undefined ? doc({ command: "adapted" }) : script.adapt()),
      adaptPatch: () => (script.adaptPatch === undefined ? null : script.adaptPatch()),
      register: () => undefined,
      seal: () => undefined,
      sealed: true,
    },
    // **`/theme`'s values from the store this harness was given** (C10 I27),
    // which is the composition root's own wiring: the manifest describes the
    // verb and the set declares the names. A fixture pinned to the shipped two
    // would make a three-theme session's third name a validation error here and
    // nowhere else, so a row about the handler would be a row about the fixture.
    manifest: {
      manifest: withThemeNames(fixture(), theme.names),
      load: () => undefined,
      seal: () => undefined,
      sealed: true,
    },
    blocks: {} as never,
    // C07 I19 / I18 — what `ProducerContext` is built from (C23 I40). Real
    // values rather than stubs: a producer told `ascii` behaves differently, and
    // a region of zero would make every view-route split agree with nothing.
    // `blocks` stays the stub above — `measure` is a closure, so a row that
    // reaches it throws loudly rather than measuring wrongly.
    capabilities: FULL_CAPABILITIES,
    region: script.region ?? (() => ({ width: 80, height: 24 })),
    // **The real editor, not a stub.** `editor: {} as never` cost a diagnosis
    // once and `{ setText, text }` cost another the day C23 gained
    // `editor.clear()` on the submit path (I28) — a two-method stub is the same
    // defect with a smaller surface. C17 has no dependencies to fake around, so
    // there is nothing bought by standing in for it.
    editor: createEditor(),
    // **Real, and the confirm host below is why.** `{} as never` stood here
    // until C23 I36 landed: `ctx.ask` pushes a layer, so a local handler that
    // asks anything reaches C15 through this field. The stub cost four suites a
    // runtime `Cannot read properties of undefined (reading 'ask')`, which the
    // compiler could not see past the cast at the bottom of this function.
    overlays: harnessOverlays,
    /**
     * C23 I46 — everything visible unless a row says otherwise.
     *
     * **A default of `true` and not a real viewport**, because this harness has
     * no frame: answering from a store nothing scrolls would make every part
     * here paused, which is a fake supplying the behaviour under test rather
     * than standing in for it. Rows about the pause hand in their own predicate,
     * and T4.26's is a real viewport in an integration test.
     *
     * The cast at the bottom of this function is why the absence of this field
     * was a runtime failure rather than a compile one — the same way `overlays`
     * cost four suites a `Cannot read properties of undefined`.
     */
    visible: script.visible ?? (() => true),
    /**
     * The real host (C23 I36), for the same reason as `editor` above.
     *
     * A stub returning a fixed key would make every confirming verb take that
     * answer, so a handler that asks and ignores the reply would pass — and the
     * one test that matters is whether declining stops the command.
     */
    confirm: harnessConfirm,
    ...(script.approval === undefined ? {} : { approval: script.approval }),
    theme,
    // `append` is real, because C23 I29 records every settled submission
    // through it — a fake without it throws inside the append funnel and the
    // failure reads as a transcript defect.
    history: {
      entries: script.history ?? [],
      append: (command: string, exitCode: number) => void recorded.push({ command, exitCode }),
    },
    runner: {
      spawnShell: (command: string, opts: { cwd: () => string }) => {
        calls.push("spawnShell");
        spawned.push({ command, cwd: opts.cwd() });
        return (
          script.spawnShell ??
          (() => ({
            stdout: (async function* () {
              yield "";
            })(),
            exited: Promise.resolve({ code: 0 }),
            overflowed: false,
          }))
        )(command);
      },
      spawnPty: (command: string, opts: { cwd: () => string; cols: number; rows: number }) => {
        calls.push("spawnPty");
        spawned.push({ command, cwd: opts.cwd() });
        if (script.spawnPty === undefined) {
          throw new Error("spawnPty() with no PTY factory injected — pass one as `TuiConfig.pty`");
        }
        return script.spawnPty(command, { cols: opts.cols, rows: opts.rows });
      },
      hasPty: script.hasPty ?? false,
      spawn: () => undefined,
      // **Recorded, not stubbed** (`test/support/README.md`: a fake is shown to
      // respond to the thing under test before it is asserted against). As a
      // no-op it satisfied the type and made every handoff assertion vacuous.
      handoff: async (argv: readonly string[]) => {
        calls.push("handoff");
        handed.push([...argv]);
        return script.handoff === undefined
          ? { code: 0, signal: null }
          : await script.handoff(argv);
      },
      live: [],
      killAll: async () => {
        calls.push("killAll");
      },
    },
    lifecycle: {
      size: () => ({ columns: 80, rows: 24 }),
      // Into `calls` as well as their own list, because the row's claim is an
      // *order* across three collaborators and one list is what can show it.
      suspend: () => {
        calls.push("suspend");
        lifecycleCalls.push("suspend");
      },
      resume: () => {
        calls.push("resume");
        lifecycleCalls.push("resume");
      },
    },
    resetInput: () => void calls.push("resetInput"),
    resetFocus: () => void calls.push("resetFocus"),
    stop: async () => {
      calls.push("stop");
      return 0;
    },
    clock: () => now,
    schedule: (fn: () => void, ms: number) => {
      const t = { fn, at: now + ms, live: true };
      timers.push(t);
      return {
        [Symbol.dispose]: () => {
          t.live = false;
        },
      };
    },
    openUrl: () => Promise.resolve(),
    bindings: () => [{ keys: "c+c", does: "global: cancel" }],
    // **Added because a row called it and the cast below could not** (C22 I66).
    // `/theme`'s handler writes this, so T4.4 failed the moment it existed —
    // which is the README's *anything added to `PipelineDeps` will be silently
    // absent here until a row calls it*, arriving as a measurement.
    setSuppressBackground: (next: boolean) => void suppressed.push(next),
    binary: "widget",
    commandPolicy: slashPolicy,
  } as unknown as PipelineDeps;

  const pipeline = createExecutionPipeline(deps);
  // The fixture manifest's own local verbs. The framework's six register
  // themselves; `seal()` reconciles both (C23 I27), so omitting either fails
  // construction rather than producing a verb nothing can route to.
  pipeline.register("guide", () => localDoc({ command: "/guide" }));
  pipeline.register("debug dump", () => localDoc({ command: "/debug dump" }));
  pipeline.seal();

  return {
    pipeline,
    confirm: harnessConfirm,
    transcript,
    session,
    theme,
    commits,
    suppressed,
    calls,
    spawned,
    handed,
    lifecycle: lifecycleCalls,
    /** What reached C20 (C23 I29), for the rows that assert the record. */
    recorded,
    /** C23 I64 — a row holds a frame open and counts what the route does not write. */
    setPending: (v: boolean) => {
      schedulerPending = v;
    },
    tick: (ms: number) => {
      now += ms;
      const due = timers.filter((t) => t.live && t.at <= now);
      for (const t of due) {
        t.live = false;
        t.fn();
      }
    },
  };
}
