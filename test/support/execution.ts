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
import { createSessionStore } from "../../src/shell/state.js";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { loadTheme, defaultTheme, type ThemeStore } from "../../src/presentation/theme/index.js";
import { slashPolicy } from "../../src/interaction/parser/index.js";
import { fixture } from "./manifest.js";
import { doc } from "./blocks.js";
import { result } from "./transport.js";
import type { Pipeline, PipelineDeps } from "../../src/shell/types.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";
import type { HistoryEntry } from "../../src/interaction/history/types.js";

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
  const spawned: { command: string; cwd: string }[] = [];
  const timers: (() => void)[] = [];
  let now = 0;

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
    editor: { setText: () => undefined, text: "" },
    overlays: {} as never,
    theme,
    history: { entries: script.history ?? [] },
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
      handoff: () => undefined,
      live: [],
      killAll: async () => {
        calls.push("killAll");
      },
    },
    lifecycle: { size: () => ({ columns: 80, rows: 24 }) },
    resetFocus: () => void calls.push("resetFocus"),
    stop: async () => {
      calls.push("stop");
      return 0;
    },
    clock: () => now,
    schedule: (fn: () => void) => {
      timers.push(fn);
      return { [Symbol.dispose]: () => undefined };
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
  pipeline.register("guide", () => doc({ command: "/guide" }));
  pipeline.register("debug dump", () => doc({ command: "/debug dump" }));
  pipeline.seal();

  return {
    pipeline,
    transcript,
    session,
    theme,
    commits,
    calls,
    spawned,
    tick: (ms) => {
      now += ms;
      for (const fn of [...timers]) fn();
    },
  };
}
