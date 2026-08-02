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
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { control, interactivePty, PROMPT, runInPty } from "../support/pty.js";

const FAR_SIDE = "./test/support/farside.mjs";

const session = (variant: string): ReturnType<typeof interactivePty> =>
  interactivePty(`node test/support/fixture.mjs session ${variant}`, { cols: 100, rows: 24 });

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
    "frame: the current screen, and not what was on it three frames ago",
    async () => {
      // **The parameter is shown to respond before anything asserts against
      // it** (`test/support/README.md`). `output` is cumulative, and that is
      // the whole reason this exists: a shell repaints the screen on every
      // keystroke, so text deleted three frames ago stays in `output` forever
      // and an assertion that it is *gone* passes by accident.
      //
      // Driven by a real session rather than by `echo`, because the
      // reconstruction is the frame's own shape and an `echo` that never wrote
      // a `CSI H` would leave `frame` empty and this row green.
      const pty = interactivePty("node test/support/fixture.mjs session", {
        cols: 80,
        rows: 20,
      });
      try {
        await pty.waitFor(/\u276f/, 15_000);

        pty.type("first-text");
        await pty.waitFor(/first-text/, 15_000);
        expect(pty.frame.join("\n"), "the current frame carries it").toContain("first-text");
        expect(pty.frame, "and it is the terminal's height, not every frame ever").toHaveLength(20);

        // Clear the prompt and type something else. The old text is gone from
        // the screen and still in `output` — which is the distinction.
        //
        // `Ctrl-C` on a prompt with text clears it (C16 §5's ladder), which is
        // a binding that exists; `Ctrl-U` is not one, and the first draft of
        // this row used it and produced `first-textsecond-text`.
        pty.type("\u0003second-text");
        await pty.waitFor(/second-text/, 15_000);
        expect(pty.frame.join("\n")).toContain("second-text");
        expect(pty.frame.join("\n"), "gone from the screen").not.toContain("first-text");
        expect(pty.output, "still in the stream").toContain("first-text");
      } finally {
        pty.kill();
      }
    },
    40_000,
  );

  it(
    "waitForFrame: resolves on the present screen, where waitFor cannot",
    async () => {
      // **The distinction this exists for.** `waitFor` matches the accumulated
      // stream, so a pattern already in it resolves synchronously — right for
      // "this appeared" and silently wrong for anything about the *present*
      // state. An editor row asserting text had been deleted waited on a
      // pattern that had been there since it was typed, so the assertion ran
      // before the frame it was about had been written and `⌃w` looked broken
      // when it was not.
      const pty = interactivePty("node test/support/fixture.mjs session", {
        cols: 80,
        rows: 20,
      });
      try {
        await pty.waitFor(/\u276f/, 15_000);
        pty.type("alpha beta");
        await pty.waitForFrame((f) => f.join("").includes("alpha beta"), 15_000);

        // `⌃w` removes the last word. The old text is still in the stream, so
        // `waitFor` could never see it go.
        pty.type("\u0017");
        await pty.waitForFrame((f) => !f.join("").includes("beta"), 15_000);
        expect(pty.frame.join("\n")).toContain("alpha");
        expect(pty.output, "and the stream still holds it").toContain("alpha beta");

        // The control: a predicate that cannot hold rejects rather than hanging
        // or passing, so a row built on this fails when its screen never
        // arrives.
        await expect(pty.waitForFrame(() => false, 300)).rejects.toThrow(/never satisfied/);
      } finally {
        pty.kill();
      }
    },
    40_000,
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

// The session fixture's far-side variants (C06 I15, I17).
//
// **`fixture.mjs session` grew three arms and they must be shown to differ.** A
// variant that silently fell back to the fixture corpus would make every
// transport row below pass while asserting nothing about a transport — the inert
// class in its most consequential form, since it is a whole arm agreeing with
// emptiness rather than one row.
//
// `runInPty` hard-codes 80 × 24 and takes no size option, unlike `interactivePty`.
// No row needs it; recorded in `test/support/README.md` rather than widening an
// interface nothing calls.
describe("session far-side variants", () => {
  it(
    "subprocess: the frame carries a value only a spawned far side could produce",
    async () => {
      // **Not "a frame appeared".** Every arm produces a frame, including the one
      // that failed to spawn, so the assertion has to name something the fixture
      // corpus cannot say: the far side's own pid and the directory it was
      // spawned in, read at answer time.
      const pty = session("subprocess");
      try {
        await pty.waitFor(PROMPT, 15_000);
        pty.type("/ps\r");
        await pty.waitForFrame((f) => f.join("").includes("far side pid="), 15_000);

        const frame = pty.frame.join("\n");
        expect(frame).toMatch(/far side pid=\d+/);
        expect(frame, "spawned where the session is").toContain(`cwd=${process.cwd()}`);

        // **And it said something.** The table's rows are the half a reached-but-
        // empty far side would omit: `--limit`'s default once resolved to 0
        // through `Number(null)`, and the frame showed a column header over
        // "Nothing to show." — reached, correct, and describing nothing.
        expect(frame, "the table has rows, not just a header").toContain("0000000");
      } finally {
        pty.kill();
      }
    },
    45_000,
  );

  it(
    "no-farside: the same keystrokes against both arms, and they differ",
    async () => {
      // **The matched pair.** This is the control for C06 T5.6: "the suite passes
      // with no far side installed" is satisfied perfectly by a suite that does
      // nothing, so the claim has to be that the *same* input produces a
      // different, stated outcome — the table one way, a spawn failure the other.
      const absent = session("no-farside");
      try {
        await absent.waitFor(PROMPT, 15_000);
        absent.type("/ps\r");
        await absent.waitForFrame((f) => f.join("").includes("did not start"), 15_000);

        const frame = absent.frame.join("\n");
        // C06 T3.17 from the session's side: a spawn failure is a result, so the
        // shell reports it rather than dying with it.
        expect(frame).toContain("ENOENT");
        expect(frame, "and it says which binary").toContain("tui-kit-no-such-far-side");
        expect(frame, "no far side, so nothing it could have said").not.toContain("far side pid=");

        // The session survives it, which is the difference between a control and
        // a crash that happens to leave the right text on the screen.
        absent.type("/guide\r");
        await absent.waitForFrame((f) => f.join("").includes("own local verb"), 15_000);
      } finally {
        absent.kill();
      }
    },
    45_000,
  );

  it(
    "emulated: a closure answers through the same session, over a fixed envelope",
    async () => {
      // **Fixed is the whole of what C06 I17 permits.** The handler ignores the
      // invocation and returns one envelope, so this arm cannot become a source
      // of expected values about a far side — which is the distinction D43 is
      // about, and the reason the arm is here rather than narrowed away.
      const pty = session("emulated");
      try {
        await pty.waitFor(PROMPT, 15_000);
        pty.type("/promote app.web:main\r");
        await pty.waitForFrame((f) => f.join("").includes("promoted app.web:main"), 15_000);

        // Nothing was spawned, so the far side's own marker cannot appear.
        expect(pty.frame.join("\n")).not.toContain("far side pid=");
      } finally {
        pty.kill();
      }
    },
    45_000,
  );

  it("farside.mjs: --json in any position leaves every verb answering", () => {
    // C06 appends `--json` to every invocation (D16) and the far side cannot
    // refuse it. `emitter.mjs`'s header records what happened the one time a
    // positional argument was read by index with it present: `NaN` lines, no
    // interval cleared, and a PTY that timed out looking like a product hang.
    //
    // Asserted rather than assumed, because the failure is silent in the
    // direction that matters — a far side answering *something* still renders.
    const run = (args: readonly string[]): Record<string, never> =>
      JSON.parse(execFileSync(FAR_SIDE, [...args], { encoding: "utf8" })) as Record<string, never>;

    for (const args of [
      ["ps", "--json"],
      ["ps", "--json", "--limit", "3"],
      ["ps", "--limit", "3", "--json"],
      ["ps", "--limit=3", "--json"],
    ]) {
      const doc = run(args) as unknown as { blocks: { kind: string; rows?: unknown[] }[] };
      const table = doc.blocks.find((b) => b.kind === "table");
      const expected = args.some((a) => a.startsWith("--limit") || a === "-n") ? 3 : 2;
      expect(table?.rows, `${args.join(" ")} → ${String(expected)} rows`).toHaveLength(expected);
    }

    // **The position that eats an argument.** A rule where every `--flag`
    // consumes the next token reads this as promoting nothing at all, and the
    // flag it swallows is one this program never asked for.
    for (const args of [
      ["promote", "app.web:main", "--json"],
      ["promote", "--json", "app.web:main"],
    ]) {
      const doc = run(args) as unknown as { blocks: { text?: string }[] };
      expect(doc.blocks[0]?.text, args.join(" ")).toBe("promoted app.web:main");
    }
  }, 30_000);
});
