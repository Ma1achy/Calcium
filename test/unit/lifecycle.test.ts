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

describe("C01 — the cursor's shape is a setting (I20)", () => {
  const BEAM = { shape: "beam", blink: false } as const;
  const BLOCK = { shape: "block", blink: true } as const;

  it("T1.25 (I20): the same shape is emitted once, and a different one emits again", () => {
    // **The defect this row exists for cannot be seen by looking at a cursor.**
    // The shape rides the frame's write, and the frame's write happens sixty
    // times a second — so a style emitted per frame is correct on every frame
    // and wrong as a stream. The row counts rather than compares.
    const { lifecycle } = harness();
    lifecycle.acquire();

    expect(lifecycle.cursorShapeSequence(BEAM), "the first is bytes").not.toBe("");
    expect(lifecycle.cursorShapeSequence(BEAM), "the second is nothing").toBe("");
    expect(lifecycle.cursorShapeSequence(BEAM), "and so is the third").toBe("");
    expect(lifecycle.cursorShapeSequence(BLOCK), "a change emits again").not.toBe("");
    expect(lifecycle.cursorShapeSequence(BLOCK)).toBe("");
  });

  it("T1.25b (I20): blink is part of the value, because it is part of the parameter", () => {
    // Shape and blink are one wire parameter, so *the same shape, blinking* is
    // a different value and not a modifier of the previous one.
    const { lifecycle } = harness();
    lifecycle.acquire();

    expect(lifecycle.cursorShapeSequence({ shape: "beam", blink: false })).not.toBe("");
    expect(
      lifecycle.cursorShapeSequence({ shape: "beam", blink: true }),
      "same shape, other blink — a different value",
    ).not.toBe("");
  });

  it("T1.26 (I20): nothing emitted means nothing emitted, before and at release", () => {
    // **The fabricated boundary case** (C22 §6f table row 3). A target that
    // declares no style resolves to `null`, and asking for `null` before
    // anything has been put on the wire must write nothing at all — otherwise
    // an application that never asked to touch the cursor resets a terminal
    // whose own setting was already what the user wanted.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();

    expect(lifecycle.cursorShapeSequence(null), "before anything, nothing").toBe("");
    const before = stdout.output;
    lifecycle.release();
    expect(stdout.output.slice(before.length), "and nothing at release either").not.toContain(
      " q",
    );
  });

  it("T1.26b (I20): a shape that was set is reset at release", () => {
    // The other arm, and both are needed: a reset written unconditionally
    // satisfies this one and fails T1.26, and writing none satisfies T1.26 and
    // leaves a bar behind on exit.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.cursorShapeSequence(BEAM);

    const before = stdout.output;
    lifecycle.release();
    expect(stdout.output.slice(before.length), "the reset, and it is `0`").toContain("[0 q");
  });

  it("T1.27 (I20): after a handoff the next resolution is emitted, the reset included", () => {
    // **The state emit-on-change created**, and it is reachable only through a
    // handoff: the child owned the terminal and may have set a shape of its own
    // — `vim` leaves a bar behind — so the record describes a screen that no
    // longer exists.
    //
    // **The `null` arm is the one that matters and the first draft of this row
    // could not construct it.** With a real style, `suspend()`'s reset already
    // forces a re-emission, so the row passed with the resume handling removed
    // entirely — the mutation pass is what said so. Asking for *the terminal's
    // own* is the only request the two dispositions answer differently.
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.cursorShapeSequence(BEAM);
    expect(lifecycle.cursorShapeSequence(BEAM), "held, before the handoff").toBe("");

    lifecycle.suspend();
    lifecycle.resume();

    expect(
      lifecycle.cursorShapeSequence(null),
      "the reset, because the child's shape is on the screen and the record cannot say",
    ).toBe("\u001b[0 q");
    expect(lifecycle.cursorShapeSequence(null), "and then it holds again").toBe("");
  });

  it("T1.27c (I20): a real style after a handoff is emitted too", () => {
    // The other arm, and it is the one that passes under both dispositions —
    // kept because dropping it would leave the resume path asserted only by a
    // request for `null`, which is the rarer resolution.
    const { lifecycle } = harness();
    lifecycle.acquire();
    lifecycle.cursorShapeSequence(BEAM);
    lifecycle.suspend();
    lifecycle.resume();

    expect(lifecycle.cursorShapeSequence(BEAM), "re-emitted, although unchanged").not.toBe("");
  });

  it("T1.27b (I20): suspend gives the shape back before the child takes the terminal", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.cursorShapeSequence(BEAM);

    const before = stdout.output;
    lifecycle.suspend();
    expect(stdout.output.slice(before.length), "reset on the way out").toContain("[0 q");
  });
});

describe("C01 acquisition and release", () => {
  it("T1.1 (I6, C5): full acquisition emits the sequences in documented order", () => {
    const { lifecycle, stdout, stdin } = harness();
    lifecycle.acquire();

    const out = stdout.output;
    for (const m of [
      MODES.altScreenOn,
      MODES.cursorHide,
      MODES.pasteOn,
      MODES.mouseOn,
      MODES.mouseSgrOn,
      MODES.keyboardOn,
    ]) {
      expect(out.split(m).length - 1, m).toBe(1); // exactly once
    }
    // Step 7 is last: the protocol is pushed after the mouse pair, so it is the
    // first thing popped at release (C01 §5).
    expect(out.indexOf(MODES.keyboardOn)).toBeGreaterThan(out.indexOf(MODES.mouseSgrOn));

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
      MODES.keyboardOff,
      MODES.mouseOff,
      MODES.mouseSgrOff,
      MODES.pasteOff,
      MODES.cursorShow,
      MODES.altScreenOff,
    ];
    // Mouse leaves as 1006l then 1002l inside one key; the key itself is last
    // in, first out. Assert positions rather than a joined string so the
    // within-key order is checked too. The keyboard pop is first of all.
    const positions = [
      released.indexOf(MODES.keyboardOff),
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

  it("T1.28 (I10, C02 I12): the keyboard protocol is pushed only when the record says so, and popped rather than reset", () => {
    // The off arm: not a byte of it in either direction. `>` and `<` finals with
    // `u` are the whole family, so the assertion is on the family rather than on
    // the two members C01 writes — a reset written as `CSI = 0 u` would pass a
    // check for the two known strings.
    const off = harness({ keyboardProtocol: "none" });
    off.lifecycle.acquire();
    off.lifecycle.release();
    expect(off.stdout.output).not.toMatch(/\x1b\[[<>=][0-9;]*u/);

    // The on arm, on the exact bytes: `ESC [ > 3 u` and `ESC [ < u`. The pop
    // form is asserted by equality because a reset — `ESC [ = 0 u` — passes
    // every position and count assertion T1.2 makes and is the wrong claim
    // about the terminal's prior state (C02 §3).
    const on = harness({ keyboardProtocol: "kitty" });
    on.lifecycle.acquire();
    const pushed = on.stdout.output.match(/\x1b\[[<>=][0-9;]*u/g);
    expect(pushed).toEqual(["\x1b[>3u"]);
    const before = on.stdout.output.length;
    on.lifecycle.release();
    const popped = on.stdout.output.slice(before).match(/\x1b\[[<>=][0-9;]*u/g);
    expect(popped).toEqual(["\x1b[<u"]);
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

describe("C01 the frame's cursor (I19)", () => {
  it("T1.17 (I19): hide, then move, then show — in that order within the one string", () => {
    // **The order is the assertion, not the members.** All three present in any
    // order passes a set comparison and still drags a visible cursor across the
    // frame on a terminal without synchronised update — which is a capability,
    // so that path is real rather than hypothetical.
    const { lifecycle } = harness();
    const shown = lifecycle.cursorSequence({ row: 4, col: 9 });

    const hide = shown.indexOf("[?25l");
    const move = shown.indexOf("[5;10H");
    const show = shown.indexOf("[?25h");

    expect(hide, "all three are present").toBeGreaterThanOrEqual(0);
    expect(move, "and the move is 1-based on the wire").toBeGreaterThan(hide);
    expect(show, "the show closes it").toBeGreaterThan(move);

    // Hidden has nowhere to move to, so it does not move.
    expect(lifecycle.cursorSequence(null)).toBe("[?25l");
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

describe("C01 mouse tracking, toggled (copy mode)", () => {
  it("T1.20 (I6): setMouseTracking(false) emits the leave pair; (true) emits it back", () => {
    // **Here because nowhere else may write an escape sequence.** The mode is
    // C01's from `acquire()` to `release()`, and a second writer of it is the
    // class this component exists to prevent.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    const before = stdout.output;

    lifecycle.setMouseTracking(false);
    const off = stdout.output.slice(before.length);
    expect(off, "1006l then 1002l — the leave pair, in order").toContain(MODES.mouseSgrOff);
    expect(off).toContain(MODES.mouseOff);
    expect(off.indexOf(MODES.mouseSgrOff)).toBeLessThan(off.indexOf(MODES.mouseOff));

    const mid = stdout.output;
    lifecycle.setMouseTracking(true);
    const on = stdout.output.slice(mid.length);
    expect(on).toContain(MODES.mouseOn);
    expect(on).toContain(MODES.mouseSgrOn);
  });

  it("T1.21: the toggle is idempotent, so a caller never has to ask twice", () => {
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();

    lifecycle.setMouseTracking(false);
    const after = stdout.output;
    lifecycle.setMouseTracking(false);

    expect(stdout.output, "the second call emits nothing").toBe(after);
  });

  it("T1.22 (I10): without the capability the mode was never taken, so nothing toggles", () => {
    // A no-op rather than an emission, and `held` stays truthful — which is
    // what keeps the release unwind correct with no second flag beside it.
    const { lifecycle, stdout } = harness({ mouse: false });
    lifecycle.acquire();
    const before = stdout.output;

    lifecycle.setMouseTracking(false);
    lifecycle.setMouseTracking(true);

    expect(stdout.output).toBe(before);
  });

  it("T1.23: tracking left off is not left off at release — `held` is the record", () => {
    // The control for the line above. If `held` were not updated, release would
    // emit a second leave for a mode already left; if a separate flag tracked
    // it, the two could disagree. One record, and this row is what says so.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.setMouseTracking(false);
    const before = stdout.output;

    lifecycle.release();
    const out = stdout.output.slice(before.length);

    expect(out, "release does not re-leave a mode already left").not.toContain(MODES.mouseOff);
    expect(out, "and the alternate screen still goes back").toContain(MODES.altScreenOff);
  });

  it("T1.24: a no-op while suspended — a child owns the terminal's modes there", () => {
    // **`true`, not `false`, and the mutation pass is what found that.** The
    // first version of this row turned tracking *off* while suspended and
    // passed with the state guard removed — because `suspend()` has already
    // unwound every held mode, so `held.has("mouse")` is false and the
    // idempotence check returns first. The row proved nothing, and it read
    // exactly like one that proved the guard.
    //
    // Turning it *on* is the arm the guard is actually load-bearing for: with
    // the guard gone it emits `1002h` into a terminal a child owns.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();
    lifecycle.suspend();
    const before = stdout.output;

    lifecycle.setMouseTracking(true);

    expect(stdout.output, "nothing is written into a child's terminal").toBe(before);
  });
});
