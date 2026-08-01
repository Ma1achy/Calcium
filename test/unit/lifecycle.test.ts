// C01 tier 1 — unit. Fabricated capabilities, a fake stream recording bytes.
// No real terminal, no PTY.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTerminalLifecycle,
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
  caps: Partial<TerminalCapabilities> = {},
  over: { stdin?: ReturnType<typeof fakeStdin>; beforeRelease?: () => void } = {},
): Harness {
  const stdout = fakeStdout();
  const stdin = over.stdin ?? fakeStdin();
  const debug = fakeDebug();
  const fatal = vi.fn((err: unknown) => {
    throw err;
  });

  const lifecycle = createTerminalLifecycle({
    stdout,
    stdin,
    capabilities: capabilities(caps),
    onFatal: fatal as unknown as (err: unknown) => never,
    debug,
    ...(over.beforeRelease === undefined ? {} : { beforeRelease: over.beforeRelease }),
  });
  live.push(lifecycle);
  return { lifecycle, stdout, stdin, debug, fatal };
}

afterEach(() => {
  // Handlers are process-global; an un-released instance leaks into the next
  // test and T2.3's count stops meaning anything.
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released, or released while suspended. Either is fine here.
    }
  }
});

describe("C01 acquisition and release", () => {
  it("T1.1 (I6, C5): full acquisition emits the sequences in documented order", () => {
    const { lifecycle, stdout, stdin } = harness();
    lifecycle.acquire();

    const out = stdout.output;
    for (const m of [MODES.altScreenOn, MODES.cursorHide, MODES.pasteOn, MODES.mouseOn, MODES.mouseSgrOn]) {
      expect(out.split(m).length - 1, m).toBe(1); // exactly once
    }

    // 1049h is first — asserted on the first chunk rather than on byte 0, since
    // MODES carries the mode without its ESC prefix on purpose.
    expect(stdout.chunks[0]).toContain(MODES.altScreenOn);
    expect(stdin.rawModeCalls).toEqual([true]);

    // setRawMode precedes any mouse or paste sequence. Asserted through the
    // chunk index at which rawMode was called rather than by byte position,
    // because rawMode emits nothing.
    const rawModeAt = 2; // altScreen, cursor, then rawMode
    expect(stdout.chunks.slice(0, rawModeAt).join("")).not.toContain(MODES.pasteOn);
    expect(stdout.chunks.slice(0, rawModeAt).join("")).not.toContain(MODES.mouseOn);

    // The relative order of 2004h, 1002h and 1006h is deliberately unasserted:
    // it is arbitrary, and pinning it breaks on a harmless refactor.
  });

  it("T1.2 (I6): release emits the exact inverse in reverse order", () => {
    const { lifecycle, stdout, stdin } = harness();
    lifecycle.acquire();
    const acquired = stdout.chunks.length;

    lifecycle.release();

    const released = stdout.chunks.slice(acquired).join("");
    const order = [
      MODES.mouseOff,
      MODES.mouseSgrOff,
      MODES.pasteOff,
      MODES.cursorShow,
      MODES.altScreenOff,
    ];
    // Mouse leaves as 1006l then 1002l inside one key; the key itself is last
    // in, first out. Assert positions rather than a joined string so the
    // within-key order is checked too.
    const positions = [
      released.indexOf(MODES.mouseSgrOff),
      released.indexOf(MODES.mouseOff),
      released.indexOf(MODES.pasteOff),
      released.indexOf(MODES.cursorShow),
      released.indexOf(MODES.altScreenOff),
    ];
    expect(positions.every((p) => p >= 0), `all present in ${JSON.stringify(released)}`).toBe(true);
    expect([...positions].sort((a, b) => a - b), order.join(" ")).toEqual(positions);

    expect(stdin.rawModeCalls).toEqual([true, false]);
    expect(lifecycle.acquired).toBe(false);
  });

  it("T1.3 (I10, C8): absent capabilities emit nothing, in either direction", () => {
    const { lifecycle, stdout } = harness({ mouse: false, bracketedPaste: false });
    lifecycle.acquire();
    lifecycle.release();

    // The test T6.4 leans on: a release that emitted a fixed sequence rather
    // than the inverse of `held` would release something never acquired.
    for (const fragment of ["2004", "1002", "1006"]) {
      expect(stdout.output, fragment).not.toContain(fragment);
    }
  });

  it("T1.4 (I2, C4): release is idempotent", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.release();
    const after = stdout.chunks.length;

    lifecycle.release();

    expect(stdout.chunks.length - after).toBe(0);
    expect(lifecycle.acquired).toBe(false);
  });

  it("T1.5 (I8, C15): release while suspended emits no terminal sequence", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.suspend();
    const suspended = stdout.chunks.length;

    lifecycle.release();

    expect(stdout.chunks.length - suspended).toBe(0);
    expect(lifecycle.acquired).toBe(false);
    expect(lifecycle.suspended).toBe(false);
  });

  it("T1.6 (I7): suspend leaves the alternate screen entirely", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    const acquired = stdout.chunks.length;

    lifecycle.suspend();

    const emitted = stdout.chunks.slice(acquired).join("");
    expect(emitted).toContain(MODES.altScreenOff);
    expect(emitted).toContain(MODES.cursorShow);
    expect(lifecycle.suspended).toBe(true);

    // And the round trip re-takes it — the suspended → acquired cell of §5.
    lifecycle.resume();
    expect(stdout.chunks.slice(acquired).join("")).toContain(MODES.altScreenOn);
    expect(lifecycle.acquired).toBe(true);
  });
});

describe("C01 stdout redirection", () => {
  it("T1.7 (I9, C12): only writes through `writer` reach the real stream", () => {
    const { lifecycle, stdout, debug } = harness();

    // A foreign write — the shape console.log takes, and anything else that
    // reaches for the stream directly.
    stdout.write("foreign");
    expect(stdout.output).not.toContain("foreign");
    expect(debug.lines).toContain("foreign");

    // The same string through the privileged handle goes the other way. This
    // is what makes "originating from the renderer" structural: the renderer is
    // whoever holds `writer`.
    lifecycle.writer.write("renderer");
    expect(stdout.output).toContain("renderer");
    expect(debug.lines).not.toContain("renderer");
  });

  it("T1.8 (I9): redirection is undone at release, restored rather than wrapped", () => {
    const stdout = fakeStdout();
    const before = stdout.write;

    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin: fakeStdin(),
      capabilities: capabilities(),
      onFatal: (() => {
        throw new Error("unexpected");
      }) as unknown as (err: unknown) => never,
    });
    expect(stdout.write).not.toBe(before);

    lifecycle.acquire();
    lifecycle.release();

    stdout.write("after");
    expect(stdout.output).toContain("after");

    // Identity, not merely behaviour: a pass-through left in place is a leak
    // that survives release and would pass a behavioural assertion.
    expect(stdout.write).toBe(before);
  });
});

describe("C01 writer", () => {
  it("T1.9: `writer` delegates everything but `write` to the real stream", () => {
    const { lifecycle, stdout } = harness();

    // Ink reads these; a hand-built stream would have to enumerate them, and
    // the enumeration is what goes stale.
    expect(lifecycle.writer.columns).toBe(stdout.columns);
    expect(lifecycle.writer.rows).toBe(stdout.rows);
    expect(lifecycle.writer.isTTY).toBe(true);
  });
});

describe("C01 raw input delivery", () => {
  it("T1.16 (I18, C20): bytes reach a subscriber only while acquired", () => {
    // **Written across the whole transition, not as four cases.** The subject
    // *is* the transition: a per-state test passes against an implementation
    // that queues while suspended and delivers on resume, which is a `vim`
    // session replayed into the prompt.
    const { lifecycle, stdin } = harness();
    const seen: string[] = [];
    lifecycle.onInput((chunk) => void seen.push(Buffer.from(chunk).toString("utf8")));

    // **The fixture responds before anything is asserted against it.** An
    // `on` that discarded its callback would report "nothing arrived" for
    // every state below, and the test would pass having tested nothing.
    stdin.emit("before");
    expect(seen, "nothing is attached before acquire()").toEqual([]);
    expect(stdin.listeners, "and the fake would have delivered it").toBe(0);

    lifecycle.acquire();
    stdin.emit("a");
    expect(seen).toEqual(["a"]);

    lifecycle.suspend();
    stdin.emit("typed at the child");
    expect(seen, "dropped, and not queued — those bytes were the child's").toEqual(["a"]);

    lifecycle.resume();
    stdin.emit("b");
    expect(seen, "the suspended chunk never arrives, then or later").toEqual(["a", "b"]);

    lifecycle.release();
    stdin.emit("after");
    expect(seen).toEqual(["a", "b"]);
    expect(stdin.listeners, "released is terminal, and so is the detachment").toBe(0);
  });

  it("T1.16b (I18): the listener is gone before the terminal is handed over", () => {
    // The ordering, not the outcome (T4.4b, C22 I25). Under `stdio: inherit`
    // the child reads the same descriptor, so "the child got its keystrokes"
    // passes wherever the parent happens to lose the race.
    const { lifecycle, stdin } = harness();
    lifecycle.onInput(() => undefined);
    lifecycle.acquire();

    expect(stdin.listeners, "attached by acquire()").toBe(1);
    lifecycle.suspend();
    expect(stdin.listeners, "and gone by the time suspend() returns").toBe(0);
    expect(stdin.rawModeCalls.at(-1), "raw mode off, as C21 I6 requires").toBe(false);
  });
});
