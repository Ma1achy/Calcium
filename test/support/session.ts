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
import { fakeStdout, type FakeStdout } from "./fake-terminal.js";

export const MANIFEST = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [],
} as unknown as TuiConfig["manifest"];

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
  };
}

export const FRAME: FrameQueries = {
  copyMode: () => false,
  exitCopyMode: () => undefined,
  entryAtRow: () => null,
  region: () => ({ top: 1, height: 20 }),
  overlayRegion: () => ({ width: 80, height: 24 }),
  mouseEnabled: () => true,
  raiseExitConfirm: () => undefined,
};

export function fakeAmbient(): Ambient {
  return { clock: () => 1_700_000_000_000, cwd: "/work", fs: fakeFs() };
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
}> {
  const stdout = fakeStdout(size);
  const tui = createTui({
    name: "prism",
    binary: "prism",
    manifest: MANIFEST,
    theme: defaultTheme,
    stateDir: "/state",
    env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
    cwd: "/work",
    clock: () => 1_700_000_000_000,
    fs: fakeFs(),
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: { isRaw: false } as unknown as NodeJS.ReadStream,
    ...overrides,
  });

  await tui.start();

  return {
    tui,
    stdout,
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
}> {
  const stdout = fakeStdout(size);
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
      stdin: { isRaw: false } as unknown as NodeJS.ReadStream,
      ...overrides,
    },
    fakeAmbient(),
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
    renders: () => renders,
    resize: (next) => {
      size.columns = next.columns;
      size.rows = next.rows;
      process.emit("SIGWINCH");
    },
  };
}
