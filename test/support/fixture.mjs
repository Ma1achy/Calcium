// The program C01's tier 5 runs inside a real PTY.
//
// It imports `dist/`, not `src/`: tier 5 exercises the built artefact, and a
// spawned child importing TypeScript would need loader flags that make the run
// less like production rather than more.
//
// Each mode is one of the exit paths C01 owns. The two shell-driven paths —
// `/exit` and Ctrl-D confirm — are B01 B1.6's, because they are C22 and C16
// driving the same `release()`.
import { detectCapabilities } from "../../dist/terminal/capabilities.js";
import { createTerminalLifecycle } from "../../dist/terminal/lifecycle.js";
import { createFrameScheduler } from "../../dist/terminal/frame-scheduler.js";

const mode = process.argv[2];

/** Writes C03 caused, counted for T5.6 — a polling loop shows up here. */
let writes = 0;

/**
 * C03 on the default timer. No `schedule` is injected: tier 5 is the one place
 * the real `setTimeout` path runs, and it is the path production takes.
 */
const makeScheduler = (lifecycle, render) =>
  createFrameScheduler({
    render,
    repaint: render,
    capabilities: detectCapabilities(process.env).capabilities,
    lifecycle,
    write: (s) => {
      writes += 1;
      lifecycle.writer.write(s);
    },
  });

/** One JSON line, after release, so it never lands in the frame stream. */
const report = (data) => process.stdout.write(`\nSCHEDULER_RESULT ${JSON.stringify(data)}\n`);

const make = () =>
  createTerminalLifecycle({
    stdout: process.stdout,
    stdin: process.stdin,
    capabilities: detectCapabilities(process.env).capabilities,
    onFatal: (err) => {
      process.stderr.write(`fatal: ${String(err)}\n`);
      process.exit(2);
    },
    debug: () => {},
  });

/** Paint something, so a frame that left a trace would be visible (T5.2). */
const paint = (lifecycle) => lifecycle.writer.write("FRAME-CONTENT");

switch (mode) {
  case "release": {
    const lifecycle = make();
    lifecycle.acquire();
    paint(lifecycle);
    lifecycle.release();
    break;
  }

  case "sigterm": {
    const lifecycle = make();
    lifecycle.acquire();
    paint(lifecycle);
    // A real signal through a real handler; sending it to ourselves only
    // removes the race on readiness, not the delivery path.
    process.kill(process.pid, "SIGTERM");
    // Keep the loop alive so the handler runs before the process would exit
    // on its own.
    setTimeout(() => process.exit(99), 5000);
    break;
  }

  case "throw": {
    const lifecycle = make();
    lifecycle.acquire();
    paint(lifecycle);
    setTimeout(() => {
      throw new Error("DELIBERATE-CRASH");
    }, 0);
    break;
  }

  case "tstp": {
    const lifecycle = make();
    lifecycle.acquire();
    paint(lifecycle);

    // Only the release half runs here. The process does not actually stop: a
    // PTY-spawned non-interactive shell leaves the process group orphaned, and
    // POSIX discards a stop signal sent to an orphaned process group — true of
    // `sh -c`, `sh -c "set -m; …"` and `bash -mc` alike. The SIGCONT
    // re-acquisition is covered at tier 3 (T3.13); see C01 §7.
    process.kill(process.pid, "SIGTSTP");
    setTimeout(() => {
      // stderr, not stdout: the lifecycle is suspended rather than released, so
      // the redirection is still in place and a stdout write would land in the
      // debug sink. That is I9 working, not a workaround.
      process.stderr.write(`TSTP-HANDLERS=${process.listenerCount("SIGTSTP")}\n`);
      process.exit(0);
    }, 200);
    break;
  }

  case "cycles": {
    // Fifty construct/acquire/release cycles. `released` is terminal, so each
    // cycle is a new instance — which is the property T5.7 exists to check.
    for (let i = 0; i < 50; i += 1) {
      const lifecycle = make();
      lifecycle.acquire();
      lifecycle.writer.write(`cycle-${i}`);
      lifecycle.release();
    }
    // A handler leak across fifty cycles is what this reports.
    process.stdout.write(`\nSIGINT-LISTENERS=${process.listenerCount("SIGINT")}\n`);
    break;
  }

  // --- C03 tier 5 ----------------------------------------------------------
  //
  // Real timers, a real terminal and the default `schedule` — the one place
  // C03 runs without an injected clock. Each mode reports a JSON line after
  // release, so the assertions are measurements rather than byte inspection.

  case "scheduler-stream": {
    // T5.1 — a stream at 1,000 lines/s, coalesced at the 33 ms default.
    const seconds = Number(process.argv[3] ?? 10);
    const lifecycle = make();
    lifecycle.acquire();

    let frames = 0;
    let commits = 0;
    const scheduler = makeScheduler(lifecycle, () => {
      frames += 1;
      lifecycle.writer.write(".");
    });

    const cpu0 = process.cpuUsage();
    const t0 = performance.now();
    // One commit per elapsed millisecond — 1,000 a second, the rate a busy log
    // tails at and roughly thirty times what the terminal can draw. Driven off
    // the clock rather than off the tick: `setInterval(10)` drifts to about 12
    // ms under load, which quietly makes the stream 840 lines/s and the test a
    // measurement of something easier than the one specified.
    const tick = setInterval(() => {
      const owed = Math.floor(performance.now() - t0) - commits;
      for (let i = 0; i < owed; i += 1) {
        scheduler.commit("stream");
        commits += 1;
      }
    }, 5);

    setTimeout(() => {
      clearInterval(tick);
      const elapsed = performance.now() - t0;
      const cpu = process.cpuUsage(cpu0);
      lifecycle.release();
      report({
        frames,
        commits,
        elapsedMs: elapsed,
        framesPerSecond: frames / (elapsed / 1000),
        cpuFraction: (cpu.user + cpu.system) / 1000 / elapsed,
      });
      process.exit(0);
    }, seconds * 1000);
    break;
  }

  case "scheduler-typing": {
    // T5.2 — the same stream, with keystrokes arriving through the PTY. The
    // frame a keystroke causes carries a marker, so the *test* can time it from
    // the outside; timing it here would measure a synchronous call.
    const lifecycle = make();
    lifecycle.acquire();

    let pendingKey = null;
    const scheduler = makeScheduler(lifecycle, () => {
      if (pendingKey !== null) {
        lifecycle.writer.write(`\nKEYFRAME ${pendingKey}\n`);
        pendingKey = null;
        return;
      }
      lifecycle.writer.write(".");
    });

    // The same 1,000/s stream T5.1 measures, driven off the clock for the same
    // reason: a drifting tick makes the load lighter than the one specified,
    // and this test is only meaningful under the specified load.
    const t0 = performance.now();
    let commits = 0;
    const tick = setInterval(() => {
      const owed = Math.floor(performance.now() - t0) - commits;
      for (let i = 0; i < owed; i += 1) {
        scheduler.commit("stream");
        commits += 1;
      }
    }, 5);

    process.stdin.on("data", (chunk) => {
      for (const ch of chunk.toString()) {
        if (ch === "q") {
          clearInterval(tick);
          lifecycle.release();
          report({ done: true });
          process.exit(0);
        }
        pendingKey = ch;
        scheduler.commit("input");
      }
    });

    lifecycle.writer.write("\nREADY\n");
    setTimeout(() => {
      clearInterval(tick);
      lifecycle.release();
      report({ timeout: true });
      process.exit(3);
    }, 20_000);
    break;
  }

  case "scheduler-idle": {
    // T5.6 — no polling render loop. Acquire, commit nothing, and report what
    // was written and what it cost.
    const seconds = Number(process.argv[3] ?? 60);
    const lifecycle = make();
    lifecycle.acquire();

    let frames = 0;
    makeScheduler(lifecycle, () => {
      frames += 1;
    });

    const before = writes;
    const cpu0 = process.cpuUsage();
    const t0 = performance.now();

    setTimeout(() => {
      const elapsed = performance.now() - t0;
      const cpu = process.cpuUsage(cpu0);
      const written = writes - before;
      lifecycle.release();
      report({
        frames,
        writes: written,
        elapsedMs: elapsed,
        cpuFraction: (cpu.user + cpu.system) / 1000 / elapsed,
      });
      process.exit(0);
    }, seconds * 1000);
    break;
  }

  default:
    process.stderr.write(`unknown mode: ${String(mode)}\n`);
    process.exit(1);
}
