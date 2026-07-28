// C01 tier 3 — edge cases. Every invalid cell of §5's transition table, every
// fault path, and the four whose mechanism is not obvious.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTerminalLifecycle,
  TerminalStateError,
  type TerminalLifecycle,
} from "../../src/terminal/lifecycle.js";
import {
  capabilities,
  fakeDebug,
  fakeStdin,
  fakeStdout,
  MODES,
  type FakeStdout,
} from "../support/fake-terminal.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

type Harness = {
  lifecycle: TerminalLifecycle;
  stdout: FakeStdout;
  stdin: ReturnType<typeof fakeStdin>;
  debug: ReturnType<typeof fakeDebug>;
  fatal: ReturnType<typeof vi.fn>;
};

const live: TerminalLifecycle[] = [];

function harness(
  over: {
    caps?: Partial<TerminalCapabilities>;
    stdout?: FakeStdout;
    stdin?: ReturnType<typeof fakeStdin>;
    beforeRelease?: () => void;
  } = {},
): Harness {
  const stdout = over.stdout ?? fakeStdout();
  const stdin = over.stdin ?? fakeStdin();
  const debug = fakeDebug();
  const fatal = vi.fn((err: unknown) => {
    throw err;
  });

  const lifecycle = createTerminalLifecycle({
    stdout,
    stdin,
    capabilities: capabilities(over.caps ?? {}),
    onFatal: fatal as unknown as (err: unknown) => never,
    debug,
    ...(over.beforeRelease === undefined ? {} : { beforeRelease: over.beforeRelease }),
  });
  live.push(lifecycle);
  return { lifecycle, stdout, stdin, debug, fatal };
}

afterEach(() => {
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released.
    }
  }
  vi.restoreAllMocks();
});

describe("C01 transition table — the nine cells that throw", () => {
  it("T3.2: suspend() without acquire() throws a named error", () => {
    const { lifecycle } = harness();
    expect(() => lifecycle.suspend()).toThrow(TerminalStateError);
    expect(() => lifecycle.suspend()).toThrow(/constructed/);
  });

  it("T3.3: nested suspend() throws", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.suspend();
    expect(() => lifecycle.suspend()).toThrow(TerminalStateError);
    expect(() => lifecycle.suspend()).toThrow(/orchestration bug/);
  });

  it("T3.4: resume() without a prior suspend() throws, from both states", () => {
    const { lifecycle } = harness();
    expect(() => lifecycle.resume()).toThrow(TerminalStateError);

    lifecycle.acquire();
    expect(() => lifecycle.resume()).toThrow(TerminalStateError);
  });

  it("T3.20: acquire() while suspended throws and names resume()", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.suspend();

    // The ambiguity is not tolerated: resume() is what the caller meant, and
    // silently doing it would mask an orchestration bug in the L4 shell.
    expect(() => lifecycle.acquire()).toThrow(/resume\(\) is the call you meant/);
  });

  it("T3.21: acquire() after release() throws — released is terminal", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.release();
    expect(() => lifecycle.acquire()).toThrow(/construct a new instance/);
  });

  it("T3.22: suspend() or resume() after release() throws", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.release();
    expect(() => lifecycle.suspend()).toThrow(TerminalStateError);
    expect(() => lifecycle.resume()).toThrow(TerminalStateError);
  });
});

describe("C01 transition table — the tolerant cells", () => {
  it("T3.1: release() without acquire() emits nothing and is terminal", () => {
    const { lifecycle, stdout } = harness();
    expect(() => lifecycle.release()).not.toThrow();
    expect(stdout.chunks).toEqual([]);

    // §5 — a defensive release before acquire has destroyed the instance. This
    // is deliberate: I11 depends on `released` being absolute.
    expect(() => lifecycle.acquire()).toThrow(/construct a new instance/);
  });

  it("T3.5: acquire() twice emits the sequence once", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    const after = stdout.chunks.length;

    lifecycle.acquire();

    expect(stdout.chunks.length).toBe(after);
    expect(stdout.output.split(MODES.altScreenOn).length - 1).toBe(1);
  });
});

describe("C01 acquisition faults", () => {
  it("T3.6 (I13, C9): the alternate-screen write throws → onFatal, nothing held", () => {
    const stdout = fakeStdout();
    stdout.throwOn(0, new Error("write failed"));
    const { lifecycle, fatal } = harness({ stdout });

    expect(() => lifecycle.acquire()).toThrow("write failed");
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(lifecycle.acquired).toBe(false);
    expect(stdout.chunks).toEqual([]);
  });

  it("T3.7: a write throws midway → everything held is released in reverse", () => {
    const stdout = fakeStdout();
    // altScreen (0), cursor (1), then bracketed paste (2) fails. rawMode emits
    // nothing, so it does not consume a chunk index.
    stdout.throwOn(2, new Error("paste failed"));
    const { lifecycle, stdin } = harness({ stdout });

    expect(() => lifecycle.acquire()).toThrow("paste failed");

    // Partial acquisition never leaves partial state.
    expect(lifecycle.acquired).toBe(false);
    const out = stdout.output;
    expect(out).toContain(MODES.cursorShow);
    expect(out).toContain(MODES.altScreenOff);
    expect(out).not.toContain(MODES.pasteOn);
    expect(stdin.rawModeCalls).toEqual([true, false]);
  });

  it("T3.15: altScreen:false in the record → onFatal, nothing emitted", () => {
    const { lifecycle, stdout, fatal } = harness({ caps: { altScreen: false } });

    expect(() => lifecycle.acquire()).toThrow(/alternate screen/i);
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(stdout.chunks).toEqual([]);
    expect(lifecycle.acquired).toBe(false);
  });

  it("T3.9: setRawMode absent (stdin not a TTY) → skipped, no throw", () => {
    const { lifecycle, stdout } = harness({ stdin: fakeStdin({ tty: false }) });

    expect(() => lifecycle.acquire()).not.toThrow();
    expect(lifecycle.acquired).toBe(true);
    expect(stdout.output).toContain(MODES.altScreenOn);
  });
});

describe("C01 release faults", () => {
  it("T3.8: a write throws during release → the rest are still attempted", () => {
    const { lifecycle, stdout, debug } = harness();
    lifecycle.acquire();

    // Fail on the first release write. One failing sequence must not strand
    // the other five.
    stdout.throwOn(stdout.chunks.length, new Error("release failed"));
    lifecycle.release();

    const released = stdout.output;
    expect(released).toContain(MODES.pasteOff);
    expect(released).toContain(MODES.cursorShow);
    expect(released).toContain(MODES.altScreenOff);

    // Reported once, at the end, rather than thrown.
    expect(debug.lines.join("\n")).toContain("release failed");
  });
});

describe("C01 beforeRelease", () => {
  it("T3.23 (I5): runs once per exit path, before any escape sequence", () => {
    const order: string[] = [];
    const stdout = fakeStdout();
    const { lifecycle } = harness({
      stdout,
      beforeRelease: () => order.push(`hook@${stdout.chunks.length}`),
    });

    lifecycle.acquire();
    const acquired = stdout.chunks.length;
    lifecycle.release();

    expect(order).toEqual([`hook@${acquired}`]);
  });

  it("T3.24 (I5): a throwing beforeRelease → recorded, release completes", () => {
    const { lifecycle, stdout, debug } = harness({
      beforeRelease: () => {
        throw new Error("cleanup blew up");
      },
    });
    lifecycle.acquire();

    expect(() => lifecycle.release()).not.toThrow();
    expect(stdout.output).toContain(MODES.altScreenOff);
    expect(debug.lines.join("\n")).toContain("cleanup blew up");
  });

  it("T3.25 (I5): two releases run it once, not twice", () => {
    const hook = vi.fn();
    const { lifecycle } = harness({ beforeRelease: hook });
    lifecycle.acquire();

    lifecycle.release();
    lifecycle.release();

    expect(hook).toHaveBeenCalledTimes(1);
  });
});

describe("C01 signals", () => {
  it("T3.10 (I4, C5): uncaughtException releases before writing the stack", () => {
    const order: string[] = [];
    const stdout = fakeStdout();
    const { lifecycle } = harness({ stdout });
    lifecycle.acquire();

    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => {
      order.push("stderr");
      return true;
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      order.push("exit");
    }) as never);

    const before = stdout.chunks.length;
    process.emit("uncaughtException", new Error("boom"));

    // The last release byte precedes the first stderr byte. A stack written
    // onto the alternate screen is discarded the moment the screen is released.
    expect(stdout.chunks.length).toBeGreaterThan(before);
    expect(order).toEqual(["stderr", "exit"]);
    expect(err.mock.calls[0]?.[0]).toContain("boom");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("T3.11: SIGINT arriving during acquire() does not interleave sequences", () => {
    const stdout = fakeStdout();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    // Deliver the signal synchronously from inside the third write, which is
    // mid-acquisition. Deterministic — no timing involved.
    stdout.duringWrite(2, () => process.emit("SIGINT"));
    const { lifecycle } = harness({ stdout });

    lifecycle.acquire();

    // Every acquisition byte precedes every release byte: the enter sequences
    // are a prefix, and no leave sequence appears among them.
    const enters = [MODES.altScreenOn, MODES.cursorHide];
    const lastEnter = Math.max(...enters.map((e) => stdout.output.lastIndexOf(e)));
    const firstLeave = stdout.output.indexOf(MODES.altScreenOff);
    expect(firstLeave, "release happened").toBeGreaterThan(-1);
    expect(lastEnter).toBeLessThan(firstLeave);
    expect(exit).toHaveBeenCalledWith(130);
  });

  it("T3.12 (C10): SIGTSTP releases, removes its handler, re-raises", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();

    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const before = process.listenerCount("SIGTSTP");

    process.emit("SIGTSTP");

    expect(stdout.output).toContain(MODES.altScreenOff);
    expect(process.listenerCount("SIGTSTP")).toBe(before - 1);
    expect(kill).toHaveBeenCalledWith(process.pid, "SIGTSTP");
    expect(lifecycle.suspended).toBe(true);
  });

  it("T3.13: SIGCONT re-acquires, reinstalls SIGTSTP, notifies onResume once", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    const resumed = vi.fn();
    lifecycle.onResume(resumed);

    vi.spyOn(process, "kill").mockImplementation(() => true);
    process.emit("SIGTSTP");
    const stopped = stdout.chunks.length;
    const tstpHandlers = process.listenerCount("SIGTSTP");

    process.emit("SIGCONT");

    expect(stdout.chunks.slice(stopped).join("")).toContain(MODES.altScreenOn);
    expect(process.listenerCount("SIGTSTP")).toBe(tstpHandlers + 1);
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(lifecycle.acquired).toBe(true);

    // No flag: C03 owns contamination (T6.7).
    expect(Object.hasOwn(lifecycle, "contaminated")).toBe(false);
  });

  it("T3.14: two signals in the same tick release once (I2 under concurrency)", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    const acquired = stdout.chunks.length;
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    process.emit("SIGTERM");
    process.emit("SIGINT");

    const released = stdout.chunks.slice(acquired).join("");
    expect(released.split(MODES.altScreenOff).length - 1).toBe(1);
  });

  it("T3.16 (I8, C15): SIGTERM while suspended emits nothing and exits 143", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.suspend();
    const suspended = stdout.chunks.length;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    process.emit("SIGTERM");

    // The child owns the screen; a reset written into it would corrupt whatever
    // the child is drawing. The child gets the signal from the process group.
    expect(stdout.chunks.length).toBe(suspended);
    expect(exit).toHaveBeenCalledWith(143);
  });

  it("T3.17 (I12): SIGWINCH reads each dimension once and freezes the pair", () => {
    const stdout = fakeStdout();
    const { lifecycle } = harness({ stdout });
    lifecycle.acquire();

    const seen: unknown[] = [];
    lifecycle.onResize((s) => seen.push(s));
    lifecycle.onResize((s) => seen.push(s));

    const before = { ...stdout.reads };
    process.emit("SIGWINCH");

    // Read once each, whatever the subscriber count. Two reads per subscriber
    // is where a mismatched pair would come from.
    expect(stdout.reads.columns - before.columns).toBe(1);
    expect(stdout.reads.rows - before.rows).toBe(1);

    // Same object to everyone, and frozen — "never sees a mismatched pair" is
    // not directly observable; read-once-and-freeze is, and it is what makes
    // the claim true.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(seen[0]).toEqual({ columns: 80, rows: 24 });
  });

  it("T3.18: SIGWINCH while suspended notifies nobody", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    const resized = vi.fn();
    lifecycle.onResize(resized);

    lifecycle.suspend();
    process.emit("SIGWINCH");

    expect(resized).not.toHaveBeenCalled();
  });

  it("T3.19: three SIGWINCH in one tick give three notifications", () => {
    const { lifecycle } = harness();
    lifecycle.acquire();
    const resized = vi.fn();
    lifecycle.onResize(resized);

    process.emit("SIGWINCH");
    process.emit("SIGWINCH");
    process.emit("SIGWINCH");

    // C01 does not coalesce; that is C03's job (D31 — resize is not debounced).
    expect(resized).toHaveBeenCalledTimes(3);
  });
});
