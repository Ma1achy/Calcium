/**
 * C22 fixtures — a constructed graph against fakes.
 *
 * Every ambient value is injected here rather than defaulted, because a suite
 * that reaches the real clock or the real home directory passes on the author's
 * machine (C22 I10). The one thing deliberately *not* faked is the block
 * registry: heights come from C09's real measurer, so a width that reaches the
 * viewport wrong is visible rather than absorbed.
 */

import { resolveConfig, type Ambient } from "../../src/shell/config.js";
import { constructGraph, type FrameQueries, type Graph } from "../../src/shell/construct.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { createTui } from "../../src/shell/session.js";
import type { FileSystem, TuiConfig, TuiInstance } from "../../src/shell/types.js";
import { parseManifest } from "../../src/data/manifest/index.js";
import { fakeStdin, fakeStdout, type FakeStdin, type FakeStdout } from "./fake-terminal.js";

/**
 * **Parsed, not hand-built.** `parseManifest` is the only thing that appends
 * `tui-kit`'s own six verbs (C05 §3), so an object literal satisfying the
 * `Manifest` type reaches construction without them — and C23 registers their
 * handlers regardless, so `/help` and `/clear` end up installed and
 * unclassifiable. Construction now refuses that manifest; this is what a
 * consumer is supposed to pass.
 */
export const MANIFEST: TuiConfig["manifest"] = (() => {
  const parsed = parseManifest({
    schema: "tui.manifest/1",
    binary: "prism",
    version: "1.0.0",
    tools: [],
  });
  if (!parsed.ok) throw new Error("the test manifest must parse");
  return parsed.value;
})();

export function fakeFs(): FileSystem {
  const files = new Map<string, string>();
  return {
    readFile: (p) => Promise.resolve(files.get(p) ?? ""),
    writeFile: (p, d) => {
      files.set(p, d);
      return Promise.resolve();
    },
    appendFile: (p, d) => {
      files.set(p, (files.get(p) ?? "") + d);
      return Promise.resolve();
    },
    appendFileSync: (p, d) => void files.set(p, (files.get(p) ?? "") + d),
    mkdir: () => Promise.resolve(),
    exists: (p) => Promise.resolve(files.has(p)),
    // A real answer, not an empty list: C19's path and executable sources take
    // this, and a fake returning nothing makes a completion assertion pass for
    // the wrong reason (`test/support/README.md`).
    readDir: () =>
      Promise.resolve([
        { name: "src", directory: true },
        { name: "notes.md", directory: false },
      ]),
  };
}

export const FRAME: FrameQueries = {
  copyMode: () => false,
  exitCopyMode: () => undefined,
  entryAtRow: () => null,
  region: () => ({ top: 1, height: 20 }),
  overlayRegion: () => ({ width: 80, height: 24 }),
  promptAnchor: () => ({ row: 21, rows: 1 }),
  mouseEnabled: () => true,
  raiseExitConfirm: () => undefined,
};

/**
 * The injected clock, advanceable.
 *
 * **A frozen clock cannot exercise a deadline.** C16 reports its own — the
 * escape window, the paste heuristic, the exit arming — and the read loop polls
 * them on a wake; with `now()` fixed, the wake fires and `poll()` correctly
 * decides nothing is due. So the harness owns a number rather than a constant,
 * and a test that needs a window to close says so.
 */
export function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_700_000_000_000;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

export function fakeAmbient(clock = fakeClock()): Ambient {
  return {
    clock: clock.now,
    cwd: "/work",
    fs: fakeFs(),
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms);
      return { [Symbol.dispose]: () => void clearTimeout(t) };
    },
    platform: "linux",
  };
}

export type Harness = Readonly<{
  graph: Graph;
  stdout: FakeStdout;
  rendered: number;
}>;

/**
 * A real `Session`, with every ambient value injected.
 *
 * **Distinct from `buildGraph`, and the difference matters.** `buildGraph`
 * stubs `render` with a counter, so nothing it returns ever paints — which is
 * right for asserting construction order and wrong for asserting a frame. Any
 * test about what reaches the terminal has to go through `createTui`, or it
 * measures the harness.
 */
export async function buildSession(
  overrides: Partial<TuiConfig> = {},
  size = { columns: 100, rows: 30 },
): Promise<{
  tui: TuiInstance;
  stdout: FakeStdout;
  resize: (next: { columns: number; rows: number }) => void;
  /** The injected clock — advance it to close one of C16's windows. */
  clock: ReturnType<typeof fakeClock>;
}> {
  const clock = fakeClock();
  const stdout = fakeStdout(size);
  const tui = createTui({
    name: "prism",
    binary: "prism",
    manifest: MANIFEST,
    theme: defaultTheme,
    stateDir: "/state",
    env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
    cwd: "/work",
    clock: clock.now,
    fs: fakeFs(),
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: fakeStdin(),
    ...overrides,
  });

  await tui.start();

  return {
    tui,
    stdout,
    clock,
    resize: (next) => {
      size.columns = next.columns;
      size.rows = next.rows;
      process.emit("SIGWINCH");
    },
  };
}

export async function buildGraph(
  overrides: Partial<TuiConfig> = {},
  size = { columns: 100, rows: 30 },
): Promise<{
  graph: Graph;
  stdout: FakeStdout;
  /** The keyboard. Bytes go in here, not events into the router (C22 I24). */
  stdin: FakeStdin;
  renders: () => number;
  /**
   * Resize the terminal and deliver the signal, as the OS would.
   *
   * The fake reads `columns` through a getter over this object, so mutating it
   * is what a real resize looks like from C01's side — and the `SIGWINCH` is
   * what makes C01 snapshot it. Setting the size without the signal would test
   * a path nothing takes.
   */
  resize: (next: { columns: number; rows: number }) => void;
  /** The injected clock — advance it to close one of C16's windows. */
  clock: ReturnType<typeof fakeClock>;
}> {
  const clock = fakeClock();
  const stdout = fakeStdout(size);
  const stdin = fakeStdin();
  let renders = 0;

  const config = resolveConfig(
    {
      name: "prism",
      binary: "prism",
      manifest: MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      // **A real `TERM`, because `{}` reaches "cannot open".** An absent `TERM`
      // is dumb throughout (C02 §3), `altScreen` follows it, and a failed
      // alternate screen is the only fatal case in the system (A02 §7). That is
      // the documented degradation working — and it means a harness that
      // omitted `env` would be testing a session that refuses to start.
      env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin,
      ...overrides,
    },
    fakeAmbient(clock),
  );

  const graph = await constructGraph(config, {
    stop: () => Promise.resolve(0),
    render: () => void (renders += 1),
    repaint: () => void (renders += 1),
    frame: FRAME,
    onFatal: (err) => {
      throw err;
    },
  });

  return {
    graph,
    stdout,
    stdin,
    clock,
    renders: () => renders,
    resize: (next) => {
      size.columns = next.columns;
      size.rows = next.rows;
      process.emit("SIGWINCH");
    },
  };
}
