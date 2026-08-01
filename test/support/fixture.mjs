// The program C01's tier 5 runs inside a real PTY.
//
// It imports `dist/`, not `src/`: tier 5 exercises the built artefact, and a
// spawned child importing TypeScript would need loader flags that make the run
// less like production rather than more.
//
// Each mode is one of the exit paths C01 owns. The two shell-driven paths —
// `/exit` and Ctrl-D confirm — are B01 B1.6's, because they are C22 and C16
// driving the same `release()`.
import { detectCapabilities, isUsable } from "../../dist/terminal/capabilities.js";
import { createBlockRegistry } from "../../dist/presentation/blocks/index.js";
import { defaultTheme, loadTheme } from "../../dist/presentation/theme/index.js";
import { renderSequenceToLines } from "../../dist/testing/index.js";
import { createTerminalLifecycle } from "../../dist/terminal/lifecycle.js";
import { createFrameScheduler } from "../../dist/terminal/frame-scheduler.js";
import { createProcessRunner } from "../../dist/data/process/runner.js";
import { createSubprocessTransport } from "../../dist/data/transport/index.js";

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

  // --- C02 tier 5 ----------------------------------------------------------
  //
  // The capability record, driving a real acquisition and a real frame in a
  // real PTY. The environment is the input: each test sets TERM, LANG or TMUX
  // and asserts on what reached the terminal.
  //
  // The frame is composed here rather than by the shell, because C22 does not
  // exist. That is a real limitation and it bounds what these tests prove: they
  // assert that a detected record reaches the renderer and changes its output,
  // not that the application wires it that way. The wiring is C22's own T4.5.

  case "caps": {
    const { capabilities } = detectCapabilities(
      process.env,
      process.env["FORCE_DEPTH"] === undefined
        ? undefined
        : { colourDepth: Number(process.env["FORCE_DEPTH"]) },
    );

    // C02 I7 — `altScreen` alone decides whether a shell can open. A terminal
    // that cannot take the alternate screen gets help on the primary screen and
    // a clean exit, and **nothing is constructed**: C01 I14 makes acquisition
    // fatal, so the refusal has to happen before it, which is what a caller
    // reading `isUsable` is for.
    if (!isUsable(capabilities)) {
      process.stdout.write("tui-kit: this terminal cannot open an alternate screen.\n");
      process.stdout.write("Run it under a terminal that supports it, or use --json.\n");
      process.exit(0);
    }

    const lifecycle = make();
    lifecycle.acquire();

    const registry = createBlockRegistry();
    const loaded = loadTheme(defaultTheme, "dark");
    if (!loaded.ok) {
      process.stderr.write("theme failed to load\n");
      process.exit(4);
    }

    // Three blocks chosen for what they exercise: a tone that resolves to a
    // colour at every depth above 1, a glyph that has an ASCII substitute, and
    // a rule whose fill character is Unicode.
    const blocks = [
      { kind: "rule", id: "r", label: "capabilities", gapBefore: false },
      { kind: "notice", id: "n1", tone: "error", glyph: "error", text: "a failure", gapBefore: false },
      { kind: "notice", id: "n2", tone: "ok", glyph: "ok", text: "a success", gapBefore: false },
    ];

    const lines = renderSequenceToLines(registry, blocks, 60, {
      theme: loaded.value.current,
      capabilities,
    });

    lifecycle.writer.write(`\nFRAME-START\n${lines.join("\n")}\nFRAME-END\n`);
    lifecycle.release();
    process.stdout.write(`\nCAPS ${JSON.stringify(capabilities)}\n`);
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

  // --- C21, tier 5 ---------------------------------------------------------
  //
  // The runner driven inside a real PTY. What these modes prove is the runner's
  // behaviour against a real terminal and real process groups; what they do
  // *not* prove is that an application wires suspend to handoff or killAll to
  // exit, because C22 does not exist and this fixture is standing where it will.
  // Stated here rather than left for a reader to infer.

  case "process-glob": {
    // T5.1 — `ls *.md` through the user's shell. The glob is the assertion: an
    // argv spawn passes `*.md` to `ls` literally and it finds nothing.
    const runner = createProcessRunner({ env: process.env, stdin: process.stdin });
    const child = runner.spawnShell("ls *.md", { cwd: () => process.cwd() });

    let out = "";
    for await (const chunk of child.stdout) out += chunk;
    await child.exited;

    process.stdout.write(`GLOB ${JSON.stringify(out.split("\n").filter(Boolean))}\n`);
    process.exit(0);
    break;
  }

  case "process-cancel": {
    // T5.3 — Ctrl-C during `sleep 30 | cat`. The terminal's SIGINT reaches this
    // process, not the children: they are detached and lead their own group,
    // which is the point. So the handler asks the runner, and the runner
    // signals the group.
    const runner = createProcessRunner({ env: process.env, stdin: process.stdin });
    const child = runner.spawnShell("sleep 30 | cat", { cwd: () => process.cwd() });
    const pgid = child.pid;

    process.on("SIGINT", () => {
      void (async () => {
        await runner.killAll();
        const { execFileSync } = await import("node:child_process");
        let survivors = "";
        try {
          survivors = execFileSync("ps", ["-o", "pid=", "-g", String(pgid)], {
            encoding: "utf8",
          }).trim();
        } catch (err) {
          // `ps` exits 1 when the group holds nothing, which is the answer we
          // want. Any other failure would report an empty group it never saw.
          survivors = err.status === 1 && String(err.stdout ?? "") === "" ? "" : `PS-FAILED ${err}`;
        }
        process.stdout.write(`SURVIVORS ${JSON.stringify(survivors)}\n`);
        process.stdout.write("PROMPT\n");
        process.exit(0);
      })();
    });

    process.stdout.write(`PGID ${pgid}\nREADY\n`);
    setInterval(() => {}, 1000);
    break;
  }

  case "process-handoff": {
    // T5.2 — `vi` through handoff, and the sequence L4 will own: suspend the
    // lifecycle, hand the terminal over, resume. Two nested alternate-screen
    // users, and the assertion is made from outside by the PTY.
    const lifecycle = make();
    const runner = createProcessRunner({ env: process.env, stdin: process.stdin });

    lifecycle.acquire();
    paint(lifecycle);
    lifecycle.suspend();

    const exit = await runner.handoff(["vi"], { cwd: () => process.cwd() });

    lifecycle.resume();
    paint(lifecycle);
    lifecycle.release();

    process.stdout.write(`HANDOFF ${JSON.stringify(exit)}\n`);
    process.exit(0);
    break;
  }

  case "process-handoff-raw": {
    // The guard, end to end. Acquiring puts stdin in raw mode; handing off
    // without suspending first is the mistake I6 exists to catch, and the
    // symptom otherwise is a child with no working line editing.
    const lifecycle = make();
    const runner = createProcessRunner({ env: process.env, stdin: process.stdin });

    lifecycle.acquire();
    try {
      await runner.handoff(["true"], { cwd: () => process.cwd() });
      lifecycle.release();
      process.stdout.write("REFUSED no\n");
    } catch (err) {
      lifecycle.release();
      process.stdout.write(`REFUSED ${JSON.stringify(String(err.message))}\n`);
    }
    process.exit(0);
    break;
  }

  case "process-stream": {
    // T5.4 — a real streaming far side at 1,000 lines/s. Counted rather than
    // sampled: "no dropped output" is a claim about every line, and RSS is read
    // before and after because a stream that accumulates is the failure this
    // looks for.
    const seconds = Number(process.argv[3] ?? 60);
    const lines = seconds * 1000;
    const emitter = `${process.cwd()}/test/support/emitter.mjs`;

    const transport = createSubprocessTransport({
      binary: "node",
      clock: { now: () => performance.now(), schedule: () => ({ [Symbol.dispose]: () => {} }) },
      runner: createProcessRunner({ env: process.env, stdin: process.stdin }),
    });

    const rssBefore = process.memoryUsage().rss;
    let data = 0;
    let end = null;

    for await (const patch of transport.stream({
      verb: "tail",
      argv: [emitter, String(lines)],
      streams: true,
      timeoutMs: 0,
      signal: new AbortController().signal,
    })) {
      if (patch.kind === "data") data += 1;
      if (patch.kind === "end") end = patch.result;
    }

    report({
      data,
      expected: lines,
      ended: end !== null,
      exitCode: end?.exitCode ?? null,
      overflowed: end?.overflowed ?? null,
      rssGrowthMb: (process.memoryUsage().rss - rssBefore) / 1024 / 1024,
    });
    process.exit(0);
    break;
  }

  // C01 T5.8 — the width hazard, forced rather than raced.
  //
  // The sequence is the one the hazard *is*: read the width, then have the terminal
  // change, then write a frame composed against the width that was read. Forced with
  // a handshake instead of a sleep, because a race that reproduces sometimes is a
  // test that fails sometimes for a reason nobody trusts.
  //
  // **This composes against `writer.columns`**, which is the only route to a width
  // there is: C01 exposes no initial size, and `onResize` fires on a signal rather
  // than on demand. That is the finding, not a shortcut for the fixture — see C01 §5.
  case "width-hazard": {
    const lifecycle = make();
    lifecycle.acquire();

    const registry = createBlockRegistry();
    const loadedTheme = loadTheme(defaultTheme, "dark");
    if (!loadedTheme.ok) {
      process.stderr.write("theme failed to load\n");
      process.exit(4);
    }

    // Read once, and say what was read, so the test can resize *after* this point
    // and know which width the frame was composed against.
    const composedAt = lifecycle.writer.columns;
    // **Through `writer`, not `process.stdout`.** C01 redirects `stdout.write` to the
    // debug sink at construction (I9), so a marker written the ordinary way never
    // leaves the process — which is the redirection working, and cost one probe run
    // to remember.
    lifecycle.writer.write(`\nCOMPOSED_AT ${String(composedAt)}\n`);

    let go = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      go += chunk;
      if (!go.includes("GO")) return;

      // A block whose rendered rows are exactly `composedAt` cells wide. `rule` fills
      // its width, which is what makes the too-long line unambiguous.
      const lines = renderSequenceToLines(
        registry,
        [{ kind: "rule", id: "r", label: "width hazard", gapBefore: false }],
        composedAt,
        { theme: loadedTheme.value.current, capabilities: detectCapabilities(process.env).capabilities },
      );

      // The width the handle reports *now*, after the resize the test performed.
      // If it differs from `composedAt`, the handle is live — which is the finding.
      const atWriteTime = lifecycle.writer.columns;
      for (const line of lines) lifecycle.writer.write(`${line}\n`);
      lifecycle.release();
      process.stdout.write(`\nWROTE ${String(lines.length)} ${String(atWriteTime)}\n`);
      process.exit(0);
    });
    break;
  }

  // The whole stack, for the tier-5 rows that need a real session (C22 §4).
  //
  // **One mode with variants rather than one per row.** Every mode above
  // hand-composes from primitives; none built a session, because until steps 11
  // and 12 landed there was nothing to drive one with. The variants arrive
  // through `argv[3]` and the environment, so a row that needs `TERM=dumb` or a
  // real far side changes what it launches rather than what runs.
  //
  // **Readiness is the first frame, not a sentinel.** C01 replaces
  // `stdout.write` at construction (I9), so a `process.stdout.write("READY")`
  // after `start()` goes to the debug sink and never leaves the process — which
  // is the redirection working. The prompt glyph reaching the PTY is the honest
  // signal that the shell painted, and it is what the test waits for.
  case "session": {
    const { createTui } = await import("../../dist/shell/session.js");
    const { noticeDoc } = await import("../../dist/shell/documents.js");
    const { parseManifest } = await import("../../dist/data/manifest/index.js");
    const { createFixtureTransport, createRouter } = await import(
      "../../dist/data/transport/index.js"
    );
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    // **Parsed, never hand-built** (C22 I23). `parseManifest` is the only thing
    // that appends the framework's own six verbs, so an object satisfying the
    // type is one nobody parsed and construction refuses it.
    //
    // **The same JSON `test/support/manifest.ts` reads**, rather than a second
    // manifest written here. Two copies drift, and the drift shows up as a
    // tier-5 row asserting against a tool the rest of the suite does not have.
    const { readFileSync } = await import("node:fs");
    const document = JSON.parse(
      readFileSync(new URL("./manifest.fixture.json", import.meta.url), "utf8"),
    );

    // **A variant, not a second manifest** (C05 T5.4). "A manifest omitting a
    // tool the app previously had" is this document with one tool removed —
    // written as a filter so the two manifests cannot differ in any other way,
    // which is what makes the row about the omission.
    if (process.argv[3] === "no-ps") {
      document.tools = document.tools.filter((t) => t.name !== "ps");
    }

    const parsed = parseManifest(document);
    if (!parsed.ok) {
      process.stderr.write(`manifest: ${JSON.stringify(parsed.error)}\n`);
      process.exit(5);
    }

    const transport = createRouter({
      default: createFixtureTransport([
        {
          // C05 T5.1's "validates" half needs a *positive* answer: a line that
          // cleared validation and reached the far side. Asserting the absence
          // of a refusal would pass against a session that did nothing at all.
          id: "promote-one",
          verb: "promote",
          argv: ["app.web:main"],
          provenance: "authored",
          capturedAt: null,
          cliVersion: null,
          note: "the far side is not the subject of these rows",
          result: {
            stdout: JSON.stringify({
              schema: "tui.view/1",
              blocks: [{ kind: "notice", id: "n1", tone: "info", text: "promoted app.web:main" }],
            }),
            stderr: "",
            code: 0,
            signal: null,
            durationMs: 1,
          },
        },
        {
          id: "ps-empty",
          verb: "ps",
          argv: [],
          provenance: "authored",
          capturedAt: null,
          cliVersion: null,
          note: "the far side is not the subject of these rows",
          result: {
            // **A block, not an empty document.** The first version had
            // `blocks: []`, which settles an entry that renders as nothing — a
            // fixture indistinguishable from a route that never ran, which is
            // the inert-subject class in the corpus rather than in the harness.
            stdout: JSON.stringify({
              schema: "tui.view/1",
              blocks: [{ kind: "notice", id: "ps1", tone: "info", text: "no processes" }],
            }),
            stderr: "",
            code: 0,
            signal: null,
            durationMs: 1,
          },
        },
      ]),
    });

    /** A local handler's answer: one notice, carrying the command it ran. */
    const sessionNotice = (ctx, text) => noticeDoc(ctx.command, text, "info", { origin: "user" });

    const tui = createTui({
      name: "prism",
      binary: "widget",
      manifest: parsed.value,
      theme: defaultTheme,
      transport,
      env: process.env,
      stateDir: mkdtempSync(join(tmpdir(), "tui-kit-session-")),
      // **The manifest's two app-local verbs** (C22 I3a). C23 I27 refuses a
      // manifest verb marked `local` with no handler, and this is the route
      // that did not exist until the first session ran against this manifest.
      localHandlers: {
        guide: (_argv, ctx) => Promise.resolve(sessionNotice(ctx, "the app's own local verb")),
        "debug dump": (_argv, ctx) => Promise.resolve(sessionNotice(ctx, "internal state")),
      },
    });

    await tui.start();
    break;
  }

  default:
    process.stderr.write(`unknown mode: ${String(mode)}\n`);
    process.exit(1);
}
