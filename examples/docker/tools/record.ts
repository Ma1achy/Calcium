/**
 * Record docker-tui against the demo world, under virtual time.
 *
 *     node tools/record.ts <cols> <rows> <hold-seconds> <frames.json> < script.json
 *
 * `script.json` is `{"script": [[seconds, base64-bytes], …], "env": {…}}` and
 * the answer is `[[seconds, base64-bytes], …]` — every write the application
 * made, stamped with the virtual moment it made it. `capture.py`'s
 * `run_world` is the caller and turns it into the same raw / teardown / cast
 * triple `run` writes, so `media.py`, `screencast.py` and `beats.py` read a
 * recording made here exactly as they read one made through a PTY.
 *
 * **Why not the PTY** (2026-09-29, the person's ruling that recordings never
 * show the real docker host). The world replaced the daemon; that made the
 * *content* invented. It did not make the recording repeatable, because a PTY
 * capture is stamped by the wall clock: when the greeting lands, which of the
 * dashboard's two-second ticks a still falls in, how many samples the plot has
 * by the time it is read, and what the chrome's clock says are all properties
 * of the host's load on the day. F813's greeting race was that, and so was the
 * `TYPE_AT` table it produced. Here nothing advances until this file advances
 * it: `setTimeout`, `setInterval`, `Date` and `performance.now` are replaced by
 * one virtual clock, input is fed at its scripted instant, and between
 * instants the process is left to run until it is idle. Two runs are the same
 * bytes, which is what `media.py --check` asserts by hashing them.
 *
 * **The same application.** `appConfig` is what `main.ts` starts; this file
 * changes the deps (the world instead of the daemon) and the terminal (memory
 * streams instead of a TTY), and nothing about the app. The chrome's working
 * directory and the state directory are the world's too — `/srv/shop`, on an
 * in-memory filesystem — because both are drawn or written, and a recording
 * must hold nothing of the machine it was made on.
 *
 * **What this cannot see**, stated so it is not mistaken for a PTY: C01's
 * signal paths, a real terminal's replies to a query, and a bin launcher that
 * does not start. `capture.py` still drives `bin/docker-tui.js` for those.
 */

import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The world's own directory, drawn by the chrome's footer. */
export const DEMO_CWD = "/srv/shop";
/** 2026-09-29 09:41:00 UTC — the moment every recording claims to be. */
export const DEMO_EPOCH = Date.UTC(2026, 8, 29, 9, 41, 0);

type Beat = readonly [seconds: number, bytes: Uint8Array];
export type Frame = readonly [seconds: number, bytes: Uint8Array];

// ── Virtual time ────────────────────────────────────────────────────────────

type Timer = {
  id: number;
  due: number;
  seq: number;
  ms: number;
  fn: (...args: unknown[]) => void;
  args: unknown[];
  repeat: boolean;
};

/**
 * One clock for everything that reads time, advanced only by `advanceTo`.
 *
 * Installed over the globals and removed afterwards, so a test can record and
 * then carry on. `setImmediate` is left real on purpose: it is how `idle()`
 * lets promise chains and stream callbacks run to completion between instants,
 * and nothing in the app schedules with it.
 */
function installVirtualTime(): { advanceTo: (ms: number) => Promise<void>; now: () => number; restore: () => void } {
  const real = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    Date: globalThis.Date,
    setImmediate: globalThis.setImmediate,
  };
  let now = 0;
  let seq = 0;
  let nextId = 1;
  const timers = new Map<number, Timer>();

  class Handle {
    readonly id: number;
    constructor(id: number) {
      this.id = id;
    }
    ref(): this {
      return this;
    }
    unref(): this {
      return this;
    }
    hasRef(): boolean {
      return true;
    }
    refresh(): this {
      const t = timers.get(this.id);
      if (t !== undefined) {
        t.due = now + t.ms;
        t.seq = seq++;
      }
      return this;
    }
    close(): this {
      timers.delete(this.id);
      return this;
    }
    [Symbol.toPrimitive](): number {
      return this.id;
    }
    [Symbol.dispose](): void {
      timers.delete(this.id);
    }
  }

  const add = (fn: unknown, ms: unknown, args: unknown[], repeat: boolean): Handle => {
    // Node's own rule: under 1 ms, or not a number, is 1 ms.
    const delay = typeof ms === "number" && ms >= 1 ? Math.floor(ms) : 1;
    const id = nextId++;
    timers.set(id, { id, due: now + delay, seq: seq++, ms: delay, fn: fn as Timer["fn"], args, repeat });
    return new Handle(id);
  };
  const clear = (h: unknown): void => {
    if (h instanceof Handle) timers.delete(h.id);
    else if (typeof h === "number") timers.delete(h);
  };

  class VirtualDate extends real.Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(DEMO_EPOCH + now);
      else super(...(args as [number]));
    }
    static override now(): number {
      return DEMO_EPOCH + now;
    }
  }

  Object.assign(globalThis, {
    setTimeout: (fn: unknown, ms?: unknown, ...args: unknown[]) => add(fn, ms, args, false),
    clearTimeout: clear,
    setInterval: (fn: unknown, ms?: unknown, ...args: unknown[]) => add(fn, ms, args, true),
    clearInterval: clear,
    Date: VirtualDate,
  });
  Object.defineProperty(performance, "now", { value: () => now, configurable: true, writable: true });

  /** Let everything already due finish: promise chains, stream callbacks. */
  const idle = async (): Promise<void> => {
    for (let i = 0; i < 12; i += 1) await new Promise<void>((r) => real.setImmediate(r));
  };

  const earliest = (): Timer | undefined => {
    let best: Timer | undefined;
    for (const t of timers.values()) {
      if (best === undefined || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    }
    return best;
  };

  const advanceTo = async (target: number): Promise<void> => {
    for (;;) {
      await idle();
      const next = earliest();
      if (next === undefined || next.due > target) break;
      now = next.due;
      if (next.repeat) {
        next.due = now + next.ms;
        next.seq = seq++;
      } else timers.delete(next.id);
      next.fn(...next.args);
    }
    now = target;
    await idle();
  };

  const restore = (): void => {
    Object.assign(globalThis, {
      setTimeout: real.setTimeout,
      clearTimeout: real.clearTimeout,
      setInterval: real.setInterval,
      clearInterval: real.clearInterval,
      Date: real.Date,
    });
    // The own property shadowed the prototype's method; removing it restores it.
    delete (performance as { now?: unknown }).now;
  };

  return { advanceTo, now: () => now, restore };
}

// ── The terminal ────────────────────────────────────────────────────────────

function memoryStreams(cols: number, rows: number, at: () => number) {
  const frames: Frame[] = [];
  const stdout = Object.assign(new EventEmitter(), {
    isTTY: true,
    columns: cols,
    rows,
    write(chunk: string | Uint8Array, ...rest: unknown[]): boolean {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
      frames.push([at() / 1000, bytes]);
      const cb = rest.find((r) => typeof r === "function") as (() => void) | undefined;
      if (cb !== undefined) queueMicrotask(cb);
      return true;
    },
  });
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: () => stdin,
    resume: () => stdin,
    pause: () => stdin,
    setEncoding: () => stdin,
    ref: () => stdin,
    unref: () => stdin,
  });
  return { frames, stdout, stdin };
}

/** The state directory, in memory: nothing a recording does lands on disk. */
function memoryFs() {
  const files = new Map<string, string>();
  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: "ENOENT" });
  return {
    readFile: async (path: string): Promise<string> => {
      const text = files.get(path);
      if (text === undefined) throw missing(path);
      return text;
    },
    writeFile: async (path: string, data: string): Promise<void> => void files.set(path, data),
    appendFile: async (path: string, data: string): Promise<void> => void files.set(path, (files.get(path) ?? "") + data),
    appendFileSync: (path: string, data: string): void => void files.set(path, (files.get(path) ?? "") + data),
    mkdir: async (): Promise<void> => undefined,
    readDir: async (path: string): Promise<readonly Readonly<{ name: string; directory: boolean }>[]> => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0] ?? "");
      }
      if (names.size === 0) throw missing(path);
      return [...names].sort().map((name) => ({ name, directory: !files.has(`${prefix}${name}`) }));
    },
  };
}

// ── The recording ───────────────────────────────────────────────────────────

/**
 * The environment a shot runs under, and nothing inherited.
 *
 * `capture.py` starts from the Python process's own environment and has had to
 * learn, one finding at a time, which of its variables leak into a shot (F157's
 * `LC_CTYPE`). Starting from nothing makes the list the whole list: `TERM` as
 * the PTY sets it, the size, and what the shot names. `""` unsets, as there.
 */
export function shotEnv(cols: number, rows: number, env: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { TERM: "xterm-256color", COLUMNS: String(cols), LINES: String(rows) };
  for (const [key, value] of Object.entries(env)) {
    if (value === "") delete out[key];
    else out[key] = value;
  }
  return out;
}

/**
 * One session against the demo world: feed `script`, run until `hold` seconds
 * after its last beat, and return every write with its virtual time.
 */
export async function recordSession(
  cols: number,
  rows: number,
  script: readonly Beat[],
  hold: number,
  env: Readonly<Record<string, string>>,
): Promise<readonly Frame[]> {
  // Before any `Date` is formatted: the chrome draws a time of day.
  process.env["TZ"] = "UTC";
  const clock = installVirtualTime();
  try {
    const { createTui } = await import("calcium-tui");
    const { appConfig } = await import("../src/app.ts");
    const { demoDeps } = await import("../src/world.ts");

    const { frames, stdout, stdin } = memoryStreams(cols, rows, clock.now);
    const tui = createTui({
      ...appConfig({ ...demoDeps(() => performance.now()), env: shotEnv(cols, rows, env) }),
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      fs: memoryFs(),
      cwd: DEMO_CWD,
    });

    let failure: unknown = null;
    const started = tui.start().catch((error: unknown) => {
      failure = error;
    });
    const ms = (s: number): number => Math.round(s * 1000);
    const ordered = [...script].sort((a, b) => a[0] - b[0]);
    for (const [at, bytes] of ordered) {
      await clock.advanceTo(ms(at));
      stdin.emit("data", Buffer.from(bytes));
    }
    const last = ordered.length === 0 ? 0 : (ordered[ordered.length - 1]?.[0] ?? 0);
    await clock.advanceTo(ms(last + hold));
    if (failure !== null) throw failure;
    void started;
    return frames;
  } finally {
    clock.restore();
  }
}

// ── The command ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [cols, rows, hold] = process.argv.slice(2, 5).map(Number);
  const out = process.argv[5];
  if (cols === undefined || rows === undefined || hold === undefined || out === undefined || [cols, rows, hold].some(Number.isNaN)) {
    throw new Error("usage: node tools/record.ts <cols> <rows> <hold-seconds> <frames.json> < script.json");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    script: [number, string][];
    env: Record<string, string>;
  };
  const script: Beat[] = input.script.map(([t, b64]) => [t, Buffer.from(b64, "base64")]);
  const frames = await recordSession(cols, rows, script, hold, input.env);
  writeFileSync(out, JSON.stringify(frames.map(([t, bytes]) => [t, Buffer.from(bytes).toString("base64")])));
  // The session is still running — its timers are virtual and will never fire
  // again — so the process is ended rather than drained.
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
