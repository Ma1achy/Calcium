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

const mode = process.argv[2];

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

  default:
    process.stderr.write(`unknown mode: ${String(mode)}\n`);
    process.exit(1);
}
