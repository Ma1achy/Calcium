// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 5.
//
// **Real bytes from a real terminal**, not a string constant: a probe rebuilt
// from intent agrees with the intent, so these rows capture what a child
// actually wrote through a pty.
import * as nodePty from "node-pty";
import { spawn } from "node-pty";
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import * as fsSync from "node:fs";

import { pipelineHarness, settled } from "../support/execution.js";

import { createProcessRunner } from "../../src/data/process/runner.js";

/** Run a command under a pty, feeding every chunk into the emulator. */
const through = async (
  command: string,
  opts: Readonly<{ cols: number; rows: number; scrollback?: number }>,
): Promise<ReturnType<typeof createEmulator>> => {
  const term = createEmulator(opts);
  const child = spawn("/bin/sh", ["-c", command], {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const writes: Promise<void>[] = [];
  child.onData((chunk) => {
    writes.push(term.write(chunk));
  });
  await new Promise<void>((resolve) => {
    child.onExit(() => {
      resolve();
    });
  });
  await Promise.all(writes);
  return term;
};

describe("C27 terminal emulator — tier 5", () => {
  it("T5.1 (C27 I4, C27 I5): a real child's carriage return and SGR arrive as one screen", async () => {
    const term = await through(
      String.raw`printf 'a\r\033[Kb\n'; printf '\033[32mok\033[0m\n'`,
      { cols: 20, rows: 4 },
    );
    const lines = term.snapshot("t").lines;
    expect(lines[0]?.text).toBe("b");
    expect(lines[1]?.text).toBe("ok");
    expect(lines[1]?.runs).toEqual([{ from: 0, to: 2, fg: { kind: "ansi16", index: 2 } }]);
    term.dispose();
  }, 20_000);

  it("T5.2 (C27 I7): a real child overruns the cap by the same figure the unit row measured", async () => {
    const term = await through("seq 1 30", { cols: 20, rows: 4, scrollback: 20 });
    const snap = term.snapshot("t");
    expect(snap.lines).toHaveLength(24);
    expect(term.dropped).toBe(7);
    expect(snap.lines[0]?.text).toBe("8");
    term.dispose();
  }, 20_000);
});

describe("C21 — the PTY port, spec-first rows", () => {
  /**
   * The port with the real package in it, **unadapted** (C21 I15).
   *
   * `pty: nodePty` is the module namespace object itself, which is the whole
   * claim the port is built on and did not compile until F920 — `Readonly<>`
   * had turned `spawn` into a function-typed property and `readonly string[]`
   * refused node-pty's `string[] | string`. T2.8 holds it at compile time; this
   * is the same assignment at run time, on the one machine that has the
   * package built.
   */
  const realRunner = (): ReturnType<typeof createProcessRunner> =>
    createProcessRunner({ env: process.env, stdin: {}, pty: nodePty });

  const readAll = async (
    h: Readonly<{ onData: (cb: (c: string) => void) => void; exited: Promise<unknown> }>,
  ): Promise<string> => {
    let out = "";
    h.onData((c) => {
      out += c;
    });
    await h.exited;
    return out;
  };

  it("T5.6 (C21 I15, C21 I17): the child is on a real device, and keeps what it would drop on a pipe", async () => {
    const runner = realRunner();
    expect(runner.hasPty, "the real package satisfies the port").toBe(true);

    // **Two facts a fake cannot have**: the kernel's own name for the device,
    // and a program's `isatty` deciding to colour. A fixture supplies both, so
    // a tier-4 row asserting either is asserting the fixture (F923).
    const command = "tty; echo hello | grep --color=auto hello";
    const onPty = await readAll(
      runner.spawnPty(command, { cwd: () => process.cwd(), cols: 80, rows: 24 }),
    );
    expect(onPty, "the tty's own name").toMatch(/\/dev\/(?:pts\/\d+|ttys\d+)/u);
    expect(onPty, "and the SGR grep only emits to a terminal").toMatch(/\u001b\[[0-9;]*m/u);

    // The contrast, on the same runner and the same command.
    const piped = runner.spawnShell(command, { cwd: () => process.cwd() });
    let out = "";
    for await (const chunk of piped.stdout) out += chunk;
    await piped.exited;
    expect(out, "a pipe has no device to name").toContain("not a tty");
    expect(out, "and grep drops the colour").not.toMatch(/\u001b\[[0-9;]*m/u);
    expect(out, "with the text unchanged").toContain("hello");
  }, 20_000);

  it("T5.7 (C21 I17): a signalled PTY child takes its pipeline with it", async () => {
    // T3.1's claim on the PTY arm. A shell that signals only its own process
    // leaves the pipeline's other half running with its stdin closed — an
    // orphan holding the file descriptors, and the reason C21 I2 makes a child
    // lead its own group.
    const runner = realRunner();
    const marker = `calcium-e2e-${String(process.pid)}-${String(Date.now())}`;
    const handle = runner.spawnPty(`sleep 120 | cat > /dev/null # ${marker}`, {
      cwd: () => process.cwd(),
      cols: 80,
      rows: 24,
    });
    await new Promise((r) => void setTimeout(r, 300));
    expect(handle.running, "alive before the signal").toBe(true);

    // **The control, before the absence.** A `/proc` scan that matches nothing
    // while the child is alive would report an empty survivor list for a
    // pipeline that never died — an absence assertion over an empty corpus,
    // which passes hardest the day it becomes false.
    const matching = (): string[] => {
      const { readdirSync, readFileSync } = fsSync;
      return readdirSync("/proc")
        .filter((d) => /^\d+$/u.test(d))
        .filter((d) => {
          try {
            return readFileSync(`/proc/${d}/cmdline`, "utf8").includes(marker);
          } catch {
            return false;
          }
        });
    };
    expect(matching().length, "the scan can see the pipeline while it runs").toBeGreaterThan(0);

    expect(handle.signal("SIGKILL"), "a running child answers true").toBe(true);
    const exit = await handle.exited;
    expect(exit.signal ?? exit.code, "and settles").not.toBeUndefined();
    expect(handle.running, "the handle knows").toBe(false);
    expect(handle.signal("SIGKILL"), "and a second signal answers false").toBe(false);

    // **The pipeline, not just the shell.** Read from the OS rather than from
    // our own bookkeeping — asserting on what we sent would test the runner
    // against itself.
    await new Promise((r) => void setTimeout(r, 300));
    expect(matching(), "nothing from the pipeline outlived the signal").toEqual([]);
  }, 20_000);
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it("T5.21 (C23 I64, C23 I66): two hundred real lines arrive in a handful of frames, and a cancel keeps them", async () => {
    // **The route with a real child in it.** Every tier-4 row here drives a fake
    // that emits whole lines on demand; a pty delivers whatever the kernel had
    // buffered when the read returned, so the chunk boundaries — the thing the
    // coalescing is about — are the one property a fake decides for itself.
    const runner = createProcessRunner({ env: process.env, stdin: {}, pty: nodePty });
    const h = pipelineHarness({
      hasPty: true,
      spawnPty: (command, opts) =>
        runner.spawnPty(command, { cwd: () => process.cwd(), cols: opts.cols, rows: opts.rows }),
    });

    let patches = 0;
    h.transcript.subscribe((c) => {
      if (c.kind === "patch") patches += 1;
    });

    h.pipeline.submit("seq 200");
    await settled(h.pipeline);

    // **Far fewer than 200**, and the bound is the claim rather than the number:
    // a route that snapshotted per chunk would still be under 200 here, because
    // the kernel coalesces — so the row asserts what the *screen* holds as well.
    expect(patches, "frames arrived while it ran").toBeGreaterThan(0);
    expect(patches, "far fewer than one per line").toBeLessThan(50);

    // **Wait for the artefact, not for the route** (F812's set) — and report what
    // the wait saw, because the first version of this wait was founded on a
    // diagnosis the wait itself falsified (F1096).
    //
    // That version said *the patch carrying the child's last chunk lands a turn
    // after `settled` returns*, and waited five seconds for it. On `main` the row
    // then failed having **used the whole five seconds**, with the block holding
    // lines 1 to 34 of 200 and the JSON complete rather than truncated. A poll
    // cannot fix a feed that has stopped, so the repair was right to exist and
    // wrong about why: it turned a race-shaped guess into a measurement, which is
    // the only reason the number above is known.
    //
    // **`grew` is the figure that separates the two remaining readings**, and no
    // sample so far can answer it: a first reading of 34 and a last of 34 is a
    // feed that stopped, and 12 rising to 34 is a feed that is merely slow. They
    // want opposite repairs — the first a drain the route does not perform, the
    // second a longer wait — so the row reports it rather than choosing. It is
    // green in the devcontainer every time, including with `settled`'s phase-one
    // budget starved to zero, so this machine cannot produce either reading.
    const lines = (): number =>
      JSON.stringify(h.transcript.entries[0]?.doc.blocks).match(/\{"text":"\d+"\}/gu)?.length ?? 0;

    const tailStart = Date.now();
    const firstLines = lines();
    const tailDeadline = tailStart + 5_000;
    let tailText = JSON.stringify(h.transcript.entries[0]?.doc.blocks);
    while (!tailText.includes('"200"') && Date.now() < tailDeadline) {
      await new Promise((r) => void setTimeout(r, 25));
      tailText = JSON.stringify(h.transcript.entries[0]?.doc.blocks);
    }
    const tailWaited = Date.now() - tailStart;
    const lastLines = lines();
    const verdict =
      `${firstLines} → ${lastLines} numbered lines of 200 in ${tailWaited} ms, ${patches} patches, ` +
      `grew by ${lastLines - firstLines}`;

    expect(tailText, `and the tail is the last line the child wrote · ${verdict}`).toContain('"200"');

    // The cancel arm, on a child that will not stop on its own.
    const c = pipelineHarness({
      hasPty: true,
      spawnPty: (command, opts) =>
        runner.spawnPty(command, { cwd: () => process.cwd(), cols: opts.cols, rows: opts.rows }),
    });
    c.pipeline.submit("for i in $(seq 1 8); do echo tick $i; sleep 0.2; done");
    await new Promise((r) => void setTimeout(r, 700));
    expect(c.pipeline.inFlight, "still running at the halfway point").not.toBeNull();

    c.pipeline.cancel();

    // **`cancel()` releases the guard synchronously**, before the route's own
    // `await writes` and the child's death — so `settled()` returns while the
    // entry is still pending, and a row that waited on `inFlight` would read a
    // half-finished document. Wait for the artefact.
    const deadline = Date.now() + 10_000;
    while (
      Date.now() < deadline &&
      !JSON.stringify(c.transcript.entries[0]?.doc.blocks ?? {}).includes("Cancelled.")
    ) {
      await new Promise((r) => void setTimeout(r, 20));
    }

    const doc = c.transcript.entries[0]?.doc;
    expect(doc?.status, "the card settles failed").toBe("error");
    const kept = JSON.stringify(doc?.blocks);
    expect(kept, "naming the cancel").toContain("Cancelled.");
    // **The lines so far**, which is what makes a cancel survivable: a route
    // that settled an empty screen would satisfy every assertion above.
    expect(kept, "the first tick is still on screen").toContain("tick 1");
    expect(kept, "and the last one before the press").toContain("tick 2");
  }, 30_000);
});
