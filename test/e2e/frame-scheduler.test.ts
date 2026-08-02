// C03 tier 5 — PTY harness, real processes, real timers.
//
// The only place C03 runs on the default `setTimeout` rather than an injected
// clock, and the only place the coalescing budget is a measurement rather than
// an assertion about a fake. Tiers 1-3 prove the policy; this proves the policy
// is worth having.
// **This file measures wall-clock and must not share the machine.** T5.2 is a
// p95 input-to-frame latency and T5.6 is sixty seconds of idle CPU; run
// alongside fifteen other PTY files they measure the contention rather than
// the scheduler, and T5.2 failed once in a full-directory run and passed alone.
// `npm run e2e` therefore passes `--no-file-parallelism`: tier 5 is PTY-bound
// and already serial in wall-clock terms, so the cost is small and it removes
// a whole class of failure that reads as a defect in the component under test.

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
  it(
    "T5.4 (C22 §6, C14 I8): dragging the terminal edge continuously — every frame whole, none blank",
    async () => {
      // **Its blocker was false.** It said `createTui` is not exported until
      // C24; `session.ts` exports it and `fixture.mjs` has imported it since the
      // session mode existed. A deferral naming something that shipped is
      // mislabelled rather than deferred, and the label is what someone greps —
      // so the correction lands with the row.
      const pty = interactivePty(`${FIXTURE} session subprocess`, { cols: 100, rows: 30 });
      try {
        await pty.waitFor(/❯/, 20_000);
        pty.type("/ps --limit 60\r");
        await pty.waitForFrame((f) => f.join("\n").includes("0000059"), 30_000);

        // A drag is many sizes in quick succession, not one resize. The failure
        // this is about is a frame composed at one size and written at another
        // (C01 T5.8's hazard, from the shell's side), and it needs the sizes to
        // keep arriving while frames are being written.
        const sizes: readonly (readonly [number, number])[] = [
          [96, 28], [88, 26], [72, 24], [64, 22], [70, 25], [84, 27], [100, 30],
        ];
        for (const [cols, rows] of sizes) {
          pty.resize(cols, rows);
          // Short, deliberately: long enough for a frame, short enough that the
          // next size arrives while the last one is still being drawn.
          await new Promise((r) => setTimeout(r, 120));
        }

        // Settle at the final size, then read every frame written during the
        // drag. `pty.frame` is the last one; the drag needs all of them.
        await pty.waitForFrame((f) => f.length === 30 && (f[0] ?? "").length === 100, 20_000);

        const HOME_SEQ = "\u001b[H";
        const HIDE_SEQ = "\u001b[?25l";
        const frames = pty.output
          .split(HOME_SEQ)
          .slice(1)
          .map((c) => {
            const end = c.indexOf(HIDE_SEQ);
            return (end === -1 ? c : c.slice(0, end))
              .replaceAll(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
              .split(/\r*\n/);
          });

        // **The subject before the claim** — a drag that produced no frames
        // satisfies "every frame is whole" perfectly.
        expect(frames.length, "the drag produced frames").toBeGreaterThan(sizes.length);

        // **Every frame is a rectangle**: one width across all its rows, and a
        // height that is one of the sizes requested. The last is allowed to be
        // mid-flight. A frame mixing two widths is the wrap that scrolls the
        // alternate screen — the one failure the application cannot see or
        // correct (C01 §5).
        const heights = new Set(sizes.map(([, r]) => r));
        for (const [i, rows] of frames.entries()) {
          if (i === frames.length - 1) continue;
          const widths = new Set(rows.map((r) => r.length));
          expect(widths.size, `frame ${String(i)}: composed at ${[...widths].join(", ")}`).toBe(1);
          expect(heights.has(rows.length), `frame ${String(i)}: ${String(rows.length)} rows`).toBe(
            true,
          );

          // And none is blank: a resize that raced the compose used to produce
          // the fallback, which is a frame of the right shape saying nothing.
          expect(rows.join("").trim(), `frame ${String(i)} is not empty`).not.toBe("");
          expect(rows.join("\n"), `frame ${String(i)} is not the fallback`).not.toContain(
            "Terminal too small",
          );
        }

        // **A mutation that failed nothing, recorded rather than repaired.**
        // Re-reading the width at paint time — `graph.lifecycle.size().columns`
        // in `#paintDeps` instead of `frame.size.columns` — is the two-width
        // frame C01 T5.8 documents, and it fails no assertion here. It cannot:
        // `#render` composes and paints in one synchronous turn, and `SIGWINCH`
        // arrives as an event, so nothing can interleave between the two reads.
        //
        // That is a fact about the shell rather than a hole in this row. The
        // hazard C01 T5.8 asserts is a *consumer* reading `writer.columns` at
        // write time, which is a different seam and is documented there. The
        // mutation this row does fail is dropping `commit("resize")` — a drag
        // that draws no frames.
        //
        // Written down because the two readings are indistinguishable from a
        // green run, and the next person to mutate this will reach for the same
        // edit (A03 §2, and C19 §7's spinner stamp).

        // And the session still takes input, which a frame snapshot cannot say.
        pty.type("still-here");
        await pty.waitForFrame((f) => f.join("\n").includes("still-here"), 20_000);
      } finally {
        pty.kill();
      }
    },
    120_000,
  );
  it(
    "T5.5 (C22 §4, C23 §4): suspending to a child and returning — the terminal goes down and comes back",
    async () => {
      // **"Verified by byte volume" is gone, and its absence is the finding.**
      // C22 wires `render` and `repaint` to the same function, because a frame
      // here is always the whole screen — there is no partial-update path for a
      // repaint to be larger than. A row asserting the difference would pass
      // whatever C03 did (A03 §2). What is observable is the sequence.
      const pty = interactivePty(`${FIXTURE} session`, { cols: 100, rows: 24 });
      try {
        await pty.waitFor(/❯/, 20_000);
        const before = pty.output.length;

        // `/tty` is C18 §5a's marker: the line is delegated with the terminal
        // asked for, which is the `suspend → handoff → resume → invalidate`
        // sequence C23 §4 owns. A child that writes and exits on its own, so the
        // row does not depend on driving an interactive program.
        pty.type("/tty printf handed-over\r");

        // The child's own output arrives on the *primary* screen, which is what
        // says the alternate screen was given up before it ran.
        await pty.waitFor(/handed-over/, 20_000);

        const during = pty.output.slice(before);
        const down = during.indexOf("\u001b[?1049l");
        const child = during.indexOf("handed-over");
        expect(down, "the alternate screen was released").toBeGreaterThan(-1);
        expect(child, "and the child wrote after it").toBeGreaterThan(down);

        // **And it comes back — waited on the thing that changed, not on a
        // predicate that was already true.** `f.length === 24 && f.some(r =>
        // r.startsWith("❯"))` is satisfied by the frame still on the screen from
        // *before* the suspend, so it resolves instantly and the assertions
        // below run against a session that has not resumed. That is the harness
        // note in `pty.ts` arriving through a frame predicate rather than a
        // stream one: "the screen has changed" is not what either expresses.
        //
        // The re-acquire is the event, so it is what the poll watches.
        const reacquired = async (): Promise<number> => {
          const deadline = Date.now() + 20_000;
          for (;;) {
            const at = pty.output.slice(before).indexOf("\u001b[?1049h", down);
            if (at !== -1) return at;
            if (Date.now() > deadline) throw new Error("the alternate screen never came back");
            await new Promise((r) => setTimeout(r, 20));
          }
        };
        expect(await reacquired(), "re-acquired after the child wrote").toBeGreaterThan(child);

        // Then a whole frame, drawn on the far side of the resume. The result
        // notice is what identifies it: it cannot have been on the screen before
        // the child ran.
        await pty.waitForFrame((f) => f.join("\n").includes("printf finished"), 20_000);

        // The frame is whole — the resume path's `invalidate` is what makes the
        // next commit draw everything rather than nothing (C03 §2).
        const frame = pty.frame;
        expect(frame, "a full frame after resume").toHaveLength(24);
        expect(new Set(frame.map((r) => r.length)).size, "one width").toBe(1);

        // **The keyboard does not come back, and that is the sixteenth gap.**
        // See the deferral below this row: the screen half is asserted here and
        // the input half is a defect, not a missing assertion.
      } finally {
        pty.kill();
      }
    },
    90_000,
  );

  // **Sixteenth structural gap — a session that survives a handoff visually and
  // not actually.** After `/tty <cmd>` the terminal is released, the child runs,
  // the alternate screen is re-acquired and frames keep being drawn — T5.5 above
  // asserts all of it — and **no keystroke reaches the session again**. Typing
  // before the handoff works; the identical typing after it leaves the prompt
  // empty, with or without a newline, and after an `Esc` to reset focus.
  //
  // Ruled out, each by experiment rather than by reading:
  //   - C01's input subscribers: `resume()` calls `acquire()` calls
  //     `attachInput()`, and `onInput` subscribers live in a set that `suspend`
  //     never clears.
  //   - a paused stdin: adding `stdin.resume()` to `attachInput` changes nothing.
  //   - raw mode: `suspend` → `unwind` → `setRawMode(false)` and `resume` →
  //     `take("rawMode")` → `setRawMode(true)`, so the mode is cycled.
  //   - the submission guard: `runHandoff` releases it in a `finally`.
  //   - focus: an `Esc` before typing makes no difference.
  //
  // What has not been checked is what `stdio: "inherit"` does to the parent's
  // tty read handle in Node once the child exits (C21 §handoff), which is the
  // remaining candidate and the one that needs a reduction below the shell.
  //
  // Not folded into T5.5: that row asserts a real property that holds, and a row
  // failing for a second reason is one nobody can read.
  it.todo(
    "T5.5b (C22 §4 step 12, C16 I18): the session takes input again after a handoff — a *defect*, reproduced and not yet diagnosed. Typing before `/tty printf …` reaches the prompt and the identical typing after it does not, while frames continue to be drawn. Five causes ruled out by experiment (see the comment above); the open candidate is the parent's tty read handle after a `stdio: \"inherit\"` child exits, which needs a reduction below the shell to confirm",
  );
});
