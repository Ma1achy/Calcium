// The PTY runners' own parameters, asserted to take effect.
//
// The companion to `test/unit/support-harness.test.ts`, split out because
// spawning a pseudo-terminal per parameter belongs where the e2e budget already
// lives. The rule is the same and it is in `test/support/README.md`: **for each
// parameter, an assertion that fails if the parameter is ignored.**
//
// This file exists because `runInPty` failed that bar. It took an `env` record
// and passed `name: "xterm-256color"` to node-pty unconditionally — and `name`
// *is* the child's TERM — so `env: { TERM: "dumb" }` was inert. C02's tier 5
// found it by being the first caller ever to pass `env`, three years of
// `TERM`-shaped intentions after the parameter was written. `interactivePty`
// carried the identical defect and nothing had called it with `env` either.
import { describe, expect, it } from "vitest";
import { control, interactivePty, runInPty } from "../support/pty.js";

describe("runInPty parameters", () => {
  it(
    "env: an arbitrary variable reaches the child",
    async () => {
      const run = await runInPty("echo VALUE=$HARNESS_PROBE", {
        env: { HARNESS_PROBE: "reached" },
      });
      expect(run.bytes).toContain("VALUE=reached");
    },
    30_000,
  );

  it(
    "env.TERM: the child's TERM is the one asked for, not node-pty's `name`",
    async () => {
      // The found case, asserted directly rather than only through C02's
      // consequences. `name` and `env.TERM` are two ways to say the same thing
      // and node-pty resolves the conflict in favour of `name`, so this is the
      // assertion that fails if anyone hard-codes it again.
      const dumb = await runInPty("echo TERM=$TERM", { env: { TERM: "dumb" } });
      expect(dumb.bytes).toContain("TERM=dumb");

      const linux = await runInPty("echo TERM=$TERM", { env: { TERM: "linux" } });
      expect(linux.bytes).toContain("TERM=linux");

      // And the default still applies when nothing is asked for, so the fix did
      // not trade one hard-coding for an undefined.
      const fallback = await runInPty("echo TERM=$TERM");
      expect(fallback.bytes).toContain("TERM=xterm-256color");
    },
    45_000,
  );

  it(
    "jobControl: `set -m` reaches the shell, and is absent without it",
    async () => {
      // `$-` is the shell's own flag string. `m` in it means job control is on,
      // which is what the option exists to arrange — and it is the only thing
      // about the option observable from outside, since the effect it buys
      // (a non-orphaned process group) is what C01's T5.4 needs and cannot
      // assert directly.
      const on = await runInPty("echo FLAGS=$-", { jobControl: true });
      expect(on.bytes).toMatch(/FLAGS=\S*m/);

      const off = await runInPty("echo FLAGS=$-");
      expect(off.bytes).not.toMatch(/FLAGS=\S*m/);
    },
    45_000,
  );

  it(
    "timeoutMs: a program that outlives it rejects, and one that does not is unaffected",
    async () => {
      await expect(runInPty("sleep 5", { timeoutMs: 300 })).rejects.toThrow(/timed out/);
      // The other direction, so the assertion is about the deadline and not
      // about `sleep` being unreachable.
      await expect(runInPty("sleep 0.1", { timeoutMs: 10_000 })).resolves.toBeDefined();
    },
    30_000,
  );

  it(
    "control(): the baseline is a real run, not a fabricated zero state",
    async () => {
      // `control()` takes no parameters, and the thing worth asserting is that
      // it is a *measurement*: every C01 tier-5 comparison is against it, so a
      // baseline that quietly returned an empty record would make every one of
      // them pass.
      const baseline = await control();
      expect(baseline.termios, "the control run reported no termios").not.toBe("");
      expect(baseline.decset).toEqual({
        altScreen: false,
        cursorVisible: true,
        bracketedPaste: false,
        mouse1002: false,
        mouse1006: false,
        scrollRegion: false,
      });
    },
    30_000,
  );
});

describe("interactivePty parameters", () => {
  it(
    "cols and rows: the child's window is the size asked for",
    async () => {
      // `stty size` reports the kernel's idea of the window, which is what a
      // program calling `process.stdout.columns` would read. Non-default on
      // both axes, so a runner ignoring either fails.
      const pty = interactivePty("stty size; echo DONE", { cols: 132, rows: 43 });
      await pty.waitFor(/DONE/, 10_000);
      expect(pty.output).toMatch(/43\s+132/);
      pty.kill();
    },
    30_000,
  );

  it(
    "env.TERM: the interactive runner honours it too",
    async () => {
      // The second instance of the `name` defect. It had no caller passing
      // `env`, so nothing would have caught it until someone needed an
      // interactive session under a different terminal — and by then the
      // symptom would have looked like a product bug.
      const pty = interactivePty("echo TERM=$TERM; echo DONE", { env: { TERM: "vt100" } });
      await pty.waitFor(/DONE/, 10_000);
      expect(pty.output).toContain("TERM=vt100");
      pty.kill();
    },
    30_000,
  );

  it(
    "env: an arbitrary variable reaches the child",
    async () => {
      const pty = interactivePty("echo VALUE=$HARNESS_PROBE; echo DONE", {
        env: { HARNESS_PROBE: "reached" },
      });
      await pty.waitFor(/DONE/, 10_000);
      expect(pty.output).toContain("VALUE=reached");
      pty.kill();
    },
    30_000,
  );

  it(
    "type(): what is typed reaches the program's stdin",
    async () => {
      // The reason the runner exists. `runInPty` starts a program and waits;
      // this one is the only path where input crosses the PTY, and a `type`
      // that wrote nowhere would make C03's T5.2 measure an idle process.
      const pty = interactivePty("read -r LINE; echo GOT=$LINE");
      pty.type("hello\r");
      await pty.waitFor(/GOT=hello/, 10_000);
      pty.kill();
    },
    30_000,
  );
});
