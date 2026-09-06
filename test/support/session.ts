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
import { fakeStdin, fakeStdout, type FakeStdin, type FakeStdout } from "./fake-terminal.js";
import { screenFrom, type Screen } from "./screen.js";
import type { Profiler } from "../../src/shell/profiling/types.js";

/**
 * **What an author writes, and nothing more** (C22 I23a).
 *
 * This used to call `parseManifest` — imported through a deep path — and hand
 * construction the result. That is what made both arms of `config.manifest`
 * broken while the suite stayed green: every harness tested a route no consumer
 * has, and a package cannot reach through its own boundary and notice. The
 * reference app found it on its first start (R01, FINDINGS F7).
 *
 * So this is a `ManifestDocument`: the app's own verbs, which is all an author
 * knows. Construction parses it. **The deep import is gone, and its absence is
 * the point** — the harness now exercises the same path a consumer does.
 */
export const MANIFEST: TuiConfig["manifest"] = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [],
};

export function fakeFs(): FileSystem {
  const files = new Map<string, string>();
  /**
   * **Directories, because `mkdir: () => Promise.resolve()` is a fake that
   * supplies the behaviour.** F96 was a missing `mkdir` call that no test could
   * see: every write here succeeded whether or not anything had created the
   * directory, so the one precondition the real filesystem imposes was the one
   * the double removed. The suite was correct about the interface and silent
   * about the world.
   *
   * A write to a path whose parent was never created now rejects ENOENT, as
   * `node:fs` does. That is `test/support/README.md`'s rule — *a fixture must be
   * shown to respond to the thing under test* — applied to the filesystem.
   */
  const dirs = new Set<string>();
  const parentOf = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
  const ensure = (p: string) => {
    const dir = parentOf(p);
    if (dir !== "" && !dirs.has(dir)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), {
        code: "ENOENT",
      });
    }
  };
  return {
    // **Throws when absent, as `node:fs` does.** It used to answer `""`, which
    // collapses *no file* into *an empty file* — and C22 I40 is the one caller
    // that depends on the difference: an absent preference is every first run,
    // and a corrupt one commits a notice. A fake narrower than the interface it
    // stands for cannot fail on the difference, and this is where that would
    // have bitten next.
    readFile: (p) => {
      const held = files.get(p);
      if (held === undefined) {
        return Promise.reject(
          Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), {
            code: "ENOENT",
          }),
        );
      }
      return Promise.resolve(held);
    },
    writeFile: (p, d) => {
      try {
        ensure(p);
      } catch (err) {
        return Promise.reject(err);
      }
      files.set(p, d);
      return Promise.resolve();
    },
    appendFile: (p, d) => {
      try {
        ensure(p);
      } catch (err) {
        return Promise.reject(err);
      }
      files.set(p, (files.get(p) ?? "") + d);
      return Promise.resolve();
    },
    appendFileSync: (p, d) => {
      ensure(p);
      files.set(p, (files.get(p) ?? "") + d);
    },
    mkdir: (p) => {
      dirs.add(p);
      return Promise.resolve();
    },
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
    enterCopyMode: () => undefined,
  exitCopyMode: () => undefined,
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
    elapsed: () => 0,   // profiling is off in this fixture; never read
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
  /**
   * **What is on the screen**, folded from every write at this session's size.
   *
   * Bound here rather than offered as a free function so it cannot be called
   * with a size the session was not built at. Three test files each took the
   * last chunk containing `HOME` and split it on CRLF, which stopped being a
   * frame when C22 I55 made the write a difference — the question they ask is
   * unchanged and only the answer's source moved.
   */
  screen: () => Screen;
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
    elapsed: () => 0,   // profiling is off in this fixture; never read
    fs: fakeFs(),
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: fakeStdin(),
    ...overrides,
  });

  await tui.start();

  return {
    screen: () => screenFrom(stdout.chunks, size),
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
  /**
   * C28's recorder, injected as the root's own caller does (C22 I93).
   *
   * **Here rather than through `overrides.profile`**, because that field makes
   * `Session` build one and keep it private — there is no public accessor yet —
   * and a row that cannot read the report cannot assert the wiring. Passing the
   * object is the same edge `session.ts` uses, and the row then reads what the
   * root actually handed down rather than what it could have.
   */
  profiler?: Profiler,
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
  /**
   * **What is on the screen**, folded from every write at this session's size.
   *
   * Bound here rather than offered as a free function so it cannot be called
   * with a size the session was not built at. Three test files each took the
   * last chunk containing `HOME` and split it on CRLF, which stopped being a
   * frame when C22 I55 made the write a difference — the question they ask is
   * unchanged and only the answer's source moved.
   */
  screen: () => Screen;
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
    ...(profiler === undefined ? {} : { profiler }),
  });

  return {
    graph,
    stdout,
    stdin,
    clock,
    screen: () => screenFrom(stdout.chunks, size),
    renders: () => renders,
    resize: (next) => {
      size.columns = next.columns;
      size.rows = next.rows;
      process.emit("SIGWINCH");
    },
  };
}
