// C01 tier 4 — integration. Real components, still no real terminal.
//
// T4.1 runs: C02 exists, so a real capability record drives a real C01. The
// rest name their blocker in a greppable form — when C03 lands,
// `grep "waits on C03"` finds everything that just became unblocked.
import { afterEach, describe, expect, it } from "vitest";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { fakeStdin, fakeStdout, MODES } from "../support/fake-terminal.js";

const live: TerminalLifecycle[] = [];

afterEach(() => {
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released.
    }
  }
});

describe("C01 integration", () => {
  it("T4.1 (with C02): a real record acquires nothing beyond what it supports", () => {
    // No fabricated capabilities anywhere in this test — the detector's own
    // output drives acquisition, which is the seam C02's tier 4 could not test
    // until C01 existed.
    const tmux = detectCapabilities({ TERM: "xterm-256color", TMUX: "/tmp/s" }).capabilities;
    expect(tmux.mouse).toBe(false);
    expect(tmux.bracketedPaste).toBe(true);

    const stdout = fakeStdout();
    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin: fakeStdin(),
      capabilities: tmux,
      onFatal: ((err: unknown) => {
        throw err;
      }) as (err: unknown) => never,
    });
    live.push(lifecycle);

    lifecycle.acquire();
    lifecycle.release();

    // Mouse is off in the record, so no mouse byte in either direction (I10).
    for (const fragment of ["1002", "1006"]) {
      expect(stdout.output, fragment).not.toContain(fragment);
    }
    expect(stdout.output).toContain(MODES.pasteOn);
    expect(stdout.output).toContain(MODES.altScreenOn);
  });

  it("T4.1b (with C02): a TERM=dumb record is fatal before anything is emitted", () => {
    const dumb = detectCapabilities({ TERM: "dumb" }).capabilities;
    expect(dumb.altScreen).toBe(false);

    const stdout = fakeStdout();
    let fatal: unknown = null;
    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin: fakeStdin(),
      capabilities: dumb,
      onFatal: ((err: unknown) => {
        fatal = err;
        throw err;
      }) as (err: unknown) => never,
    });
    live.push(lifecycle);

    expect(() => lifecycle.acquire()).toThrow();
    expect(fatal).toBeInstanceOf(Error);
    expect(stdout.chunks).toEqual([]);
  });

  it.todo(
    "T4.2: the shell's resume() → scheduler.invalidate() makes the next commit() a full repaint — waits on C03",
  );
  it.todo("T4.3: C03 never writes while `acquired` is false — waits on C03");
  it.todo(
    "T4.4: the documented suspend → handoff → resume sequence runs in order, and the child receives an un-raw stdin on the primary screen — waits on C21 and the L4 shell",
  );
  it.todo(
    "T4.5: startup ordering — the composition root's steps 6, 7, 8 execute in that order, asserted by an event log — waits on C22",
  );
  it.todo(
    "T4.6: a SIGWINCH snapshot propagates to the viewport, which clamps scroll against it — waits on C14",
  );
  it.todo(
    "T4.7: SIGCONT fires onResume, the shell calls scheduler.invalidate(), and the next commit() is a full repaint — waits on C03 and the L4 shell",
  );
});
