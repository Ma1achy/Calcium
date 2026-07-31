// C03 tier 5 — PTY harness, real processes, real timers.
//
// The only place C03 runs on the default `setTimeout` rather than an injected
// clock, and the only place the coalescing budget is a measurement rather than
// an assertion about a fake. Tiers 1-3 prove the policy; this proves the policy
// is worth having.
import { describe, expect, it } from "vitest";
import { interactivePty, runInPty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs";
const RESULT = /SCHEDULER_RESULT (\{[^\n]*\})/;

function resultOf(bytes: string): Record<string, number> {
  const m = RESULT.exec(bytes);
  expect(m, `no SCHEDULER_RESULT line in:\n${bytes.slice(-2000)}`).not.toBeNull();
  return JSON.parse(m![1]!) as Record<string, number>;
}

describe("C03 e2e", () => {
  it(
    "T5.1: a 1,000 line/s stream holds ~30 frames/s at the 33 ms default, cheaply",
    async () => {
      const run = await runInPty(`${FIXTURE} scheduler-stream 10`);
      const r = resultOf(run.bytes);

      // The premise: the stream really did ask for ~1,000 a second.
      expect(r["commits"]).toBeGreaterThan(9_000);

      // A ceiling approached from below, not a band around a cadence. The
      // window is armed after the previous frame completes, so the real gap is
      // window + frame cost + timer slop — about 39 ms measured, against the
      // 33 ms window. Exceeding the ceiling would mean the window is not being
      // honoured; collapsing below 20/s would mean it is being honoured badly.
      expect(r["framesPerSecond"], "the 33 ms ceiling must hold").toBeLessThanOrEqual(30.4);
      expect(r["framesPerSecond"], "and must not collapse").toBeGreaterThan(20);

      // Coalescing is the point: two orders of magnitude fewer frames than
      // commits, and a quarter of a core is the ceiling.
      expect(r["frames"]).toBeLessThan(r["commits"]! / 20);
      expect(r["cpuFraction"]).toBeLessThan(0.25);
    },
    60_000,
  );

  it(
    "T5.2: input-to-frame latency stays under 16 ms at p95 while that stream runs",
    async () => {
      const pty = interactivePty(`${FIXTURE} scheduler-typing`);
      await pty.waitFor(/READY/);

      const latencies: number[] = [];
      // Typed through the PTY and timed from outside it, so the measurement
      // includes everything a user's keystroke actually crosses. Timing inside
      // the fixture would measure commit() calling render() synchronously.
      // No `q` — that is the fixture's quit sentinel, and a key that doubles as
      // one ends the run 24 keystrokes early.
      const KEYS = "abcdefghijklmnop";
      for (let i = 0; i < 40; i += 1) {
        const key = KEYS[i % KEYS.length]!;
        const sent = performance.now();
        pty.type(key);
        await pty.waitFor(new RegExp(`KEYFRAME ${key}`), 5_000);
        latencies.push(performance.now() - sent);
        await new Promise((r) => setTimeout(r, 25));
      }

      pty.type("q");
      await pty.done();

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)]!;

      // The starvation property, measured: a keystroke is never queued behind a
      // stream frame, however hard the stream is committing.
      expect(p95, `latencies: ${latencies.map((n) => n.toFixed(1)).join(" ")}`).toBeLessThan(16);
    },
    60_000,
  );

  it(
    "T5.6: sixty seconds idle is zero writes and no measurable CPU",
    async () => {
      const run = await runInPty(`${FIXTURE} scheduler-idle 60`, { timeoutMs: 90_000 });
      const r = resultOf(run.bytes);

      // There is no polling render loop. A scheduler that ticked would show up
      // as frames, as writes, or as CPU — this asserts all three.
      expect(r["frames"]).toBe(0);
      expect(r["writes"]).toBe(0);
      expect(r["elapsedMs"]).toBeGreaterThan(59_000);
      expect(r["cpuFraction"]).toBeLessThan(0.01);
    },
    120_000,
  );

  it.todo(
    "T5.3: a full-screen repaint on a synchronised-update terminal shows no intermediate state, sampled mid-write — unwritable with current infrastructure, and not deferred on a component. Synchronised update (DECSET 2026) is the mechanism; observing it needs a terminal emulator that honours the markers and can be sampled mid-frame. A PTY is a kernel device and emulates nothing, so the bytes are all it can show. No planned component delivers this: M-T6's compositor is the nearest thing and is gated on a measured baseline (A01 §7). C09 was named here as the blocker and was never it — a render tree makes the frame, not the observation.",
  );
  it.todo(
    "T5.4: dragging the terminal edge continuously — every frame correct, none blank, no corruption — waits on C22 and a real render tree — the resize path is wired (C01 T4.6) and what is missing is the paint: there are no frames yet to be blank",
  );
  it.todo(
    "T5.5: suspending to a child and returning — the first frame after resume is a full repaint, verified by byte volume — waits on L4",
  );
});
