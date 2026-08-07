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
import { doc, localDoc } from "./blocks.js";
import { result } from "./transport.js";
import type { Pipeline, PipelineDeps } from "../../src/shell/types.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";
import type { HistoryEntry } from "../../src/interaction/history/types.js";
import type { Exit } from "../../src/data/process/types.js";

export type PipelineScript = Readonly<{
  invoke?: () => Promise<RawResult>;
  stream?: () => AsyncIterable<RawPatch>;
  adapt?: () => ViewDocument;
  spawnShell?: (command: string) => {
    stdout: AsyncIterable<string>;
    exited: Promise<{ code: number | null }>;
    overflowed: boolean;
  };
  history?: readonly HistoryEntry[];
  theme?: ThemeStore;
  /** For the handoff rows: reject to reach C23 §8a A6.5's throw path. */
  handoff?: (argv: readonly string[]) => Promise<Exit>;
}>;

export type PipelineHarness = Readonly<{
  pipeline: Pipeline;
  transcript: ReturnType<typeof createTranscriptStore>;
  session: ReturnType<typeof createSessionStore>;
  theme: ThemeStore;
  /** Commit reasons in order, so Seam 4's sequences are assertable. */
  commits: string[];
  /** Every cross-layer call C23 made, in order. */
  calls: string[];
  /** Shell commands actually spawned, for the `cd` rows. */
  spawned: { command: string; cwd: string }[];
  /** Each argv `runner.handoff` was given, for A02 Seam 4's TTY row. */
  handed: string[][];
  /** `suspend` / `resume`, interleaved into `calls` and also counted here. */
  lifecycle: string[];
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

/** Lets every `void`-ed async route settle before assertions. */
export const settled = (): Promise<unknown> =>
  new Promise((r) => {
    setImmediate(r);
  });

export function pipelineHarness(script: PipelineScript = {}): PipelineHarness {
  const transcript = createTranscriptStore();
  const session = createSessionStore({ cwd: "/work", env: {}, cluster: "c", version: "1" });
  const themed = loadTheme(defaultTheme);
  if (!themed.ok) throw new Error("the default theme must load");
  const theme = script.theme ?? themed.value;

  const commits: string[] = [];
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
  const timers: { fn: () => void; at: number; live: boolean }[] = [];

  const harnessOverlays = createOverlayManager({ registry: overlayRegistry });
  const deps = {
    session: () => session.snapshot,
    writes: session.execution,
    transcript,
    scheduler: {
      commit: (r: string) => void commits.push(r),
      flush: () => undefined,
      invalidate: () => void calls.push("invalidate"),
      pending: false,
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
      adaptPatch: () => null,
      register: () => undefined,
      seal: () => undefined,
      sealed: true,
    },
    manifest: { manifest: fixture(), load: () => undefined, seal: () => undefined, sealed: true },
    blocks: {} as never,
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
     * The real host (C23 I36), for the same reason as `editor` above.
     *
     * A stub returning a fixed key would make every confirming verb take that
     * answer, so a handler that asks and ignores the reply would pass — and the
     * one test that matters is whether declining stops the command.
     */
    confirm: createConfirmHost({ capabilities: { unicode: "full" }, overlays: harnessOverlays, invalidate: () => undefined }),
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
    transcript,
    session,
    theme,
    commits,
    calls,
    spawned,
    handed,
    lifecycle: lifecycleCalls,
    /** What reached C20 (C23 I29), for the rows that assert the record. */
    recorded,
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
