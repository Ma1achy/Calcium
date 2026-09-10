// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9).
// Tier 1 drives the real dependency with byte strings: nothing is mocked, because
// the value of this component is entirely in what the dependency does with them.
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { cells } from "../../src/presentation/text.js";
import { terminalDefinition } from "../../src/presentation/blocks/kinds/terminal.js";
import type { MeasureFn } from "../../src/data/viewmodel/index.js";
import { degradeColour } from "../../src/presentation/theme/colormap.js";
import { b } from "../../src/shell/builders/index.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import type { Block } from "../../src/data/viewmodel/index.js";

/** The child measurer a container would use; this kind never calls it. */
const noChildren: MeasureFn = () => 0;

/**
 * A PTY child the runner can drive, and **nothing more than the port declares**.
 *
 * A fake that answered `running` itself would supply the behaviour under test —
 * the runner derives it from `onExit`, and that derivation is what T1.12 is
 * about. So this holds the callback and the caller fires it.
 */
function fakePtyChild(): {
  child: unknown;
  exit: (code: number, signal: number | undefined) => void;
  writes: string[];
  resizes: [number, number][];
  killed: string[];
} {
  const writes: string[] = [];
  const resizes: [number, number][] = [];
  const killed: string[] = [];
  let onExit: ((e: { exitCode: number; signal?: number }) => void) | null = null;
  return {
    child: {
      pid: 4242,
      onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
        onExit = cb;
      },
      onData: () => {},
      write: (d: string) => {
        writes.push(d);
      },
      resize: (c: number, r: number) => {
        resizes.push([c, r]);
      },
      kill: (sig: string) => {
        killed.push(sig);
      },
    },
    exit: (code, signal) => onExit?.({ exitCode: code, ...(signal === undefined ? {} : { signal }) }),
    writes,
    resizes,
    killed,
  };
}

/** A minimal well-formed document around one block, for the gate's own rows. */
const documentWith = (block: unknown): unknown => ({
  schema: "tui.view/1",
  command: "!pytest",
  status: "ok",
  meta: {
    verb: null,
    adapter: "shell",
    stderr: "",
    exitCode: 0,
    durationMs: 12,
    truncated: false,
    argv: ["pytest"],
    transport: "subprocess",
    origin: "user",
  },
  blocks: [block],
});

const feed = async (
  term: ReturnType<typeof createEmulator>,
  ...chunks: readonly (string | Uint8Array)[]
): Promise<void> => {
  for (const chunk of chunks) await term.write(chunk);
};

describe("C27 terminal emulator — tier 1", () => {
  it("T1.1 (C27 I3): a resolved write is visible in the next snapshot", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    const before = term.snapshot("t");
    expect(before.lines.map((l) => l.text)).toEqual([""]);
    await term.write("hi");
    expect(term.snapshot("t").lines.map((l) => l.text)).toEqual(["hi"]);
    term.dispose();
  });

  it("T1.2 (C27 I5): three colour modes become three runs", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    await feed(term, "\u001b[38;2;10;200;30mrgb\u001b[38;5;208m256\u001b[31m16\u001b[0m");
    const line = term.snapshot("t").lines[0];
    expect(line?.text).toBe("rgb25616");
    expect(line?.runs).toEqual([
      { from: 0, to: 3, fg: { kind: "rgb", hex: "#0ac81e" } },
      { from: 3, to: 6, fg: { kind: "ansi256", index: 208 } },
      { from: 6, to: 8, fg: { kind: "ansi16", index: 1 } },
    ]);
    term.dispose();
  });

  it("T1.3 (C27 I5): six attributes are carried and two are dropped", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    await feed(term, "\u001b[1;2;3;4;7;9mall\u001b[0m \u001b[5;8mnone\u001b[0m");
    const line = term.snapshot("t").lines[0];
    const [first, ...rest] = line?.runs ?? [];
    expect(first).toEqual({
      from: 0,
      to: 3,
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      inverse: true,
      strike: true,
    });
    // Blink and invisible produce no run: C09 has no blink, and a cell the child
    // hid is a cell the reader should not see.
    expect(rest).toEqual([]);
    term.dispose();
  });

  it("T1.4 (C27 I6): a wide cluster is one sequence and cells() agrees", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    await feed(term, "wide 漢字 x");
    const line = term.snapshot("t").lines[0];
    expect(line?.text).toBe("wide 漢字 x");
    expect(cells(line?.text ?? "")).toBe(11);
    // The filler cell contributes nothing — an empty character in the text is
    // the defect this asserts against, and cells() alone cannot see it.
    expect([...(line?.text ?? "")].every((ch) => ch !== "")).toBe(true);
    term.dispose();
  });

  it("T1.5 (C27 I4): the alternate screen flips the mode and the normal buffer survives", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "log line\r\n");
    expect(term.screen).toBe("lines");
    await feed(term, "\u001b[?1049h\u001b[Hvim-ish");
    expect(term.screen).toBe("grid");
    const grid = term.snapshot("t");
    expect(grid.screen).toBe("grid");
    expect(grid.lines).toHaveLength(4);
    await feed(term, "\u001b[?1049l");
    expect(term.screen).toBe("lines");
    expect(term.snapshot("t").lines[0]?.text).toBe("log line");
    term.dispose();
  });

  it("T1.6 (C27 I7): the cap keeps a bounded buffer and counts the loss separately", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 20 });
    for (let i = 1; i <= 30; i += 1) await term.write(`line ${String(i)}\r\n`);
    const snap = term.snapshot("t");
    // Two figures, asserted separately: an exact total constrains one number
    // while looking like it constrains two.
    // Measured, not reasoned: 30 feeds at this cap leaves 24 lines whose first
    // is "line 8", so seven are gone. Two figures asserted separately — an exact
    // total constrains one number while looking like it constrains two.
    expect(snap.lines).toHaveLength(24);
    expect(term.dropped).toBe(7);
    expect(snap.dropped).toBe(7);
    expect(snap.lines[0]?.text).toBe("line 8");
    term.dispose();
  });

  it("T1.7 (C27 I10): a resize reflows and loses no characters", async () => {
    const term = createEmulator({ cols: 40, rows: 4, scrollback: 100 });
    await feed(term, `${"x".repeat(60)}\r\nshort\r\n`);
    const before = term.snapshot("t").lines.map((l) => l.text).join("");
    term.resize(20, 4);
    const after = term.snapshot("t");
    expect(after.lines.length).toBeGreaterThan(3);
    expect(after.lines.map((l) => l.text).join("")).toBe(before);
    expect(after.cols).toBe(20);
    term.dispose();
  });

  it("T1.8 (C27 I4): a carriage return overwrites rather than appending", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    await feed(term, "...\r\u001b[K.....");
    expect(term.snapshot("t").lines.map((l) => l.text)).toEqual([".....",]);
    term.dispose();
  });

  it("T1.9 (C27 I3): a snapshot is frozen and unaffected by later writes", async () => {
    const term = createEmulator({ cols: 40, rows: 4 });
    await feed(term, "first\r\n");
    const first = term.snapshot("t");
    await feed(term, "more\r\n");
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.lines.map((l) => l.text)).toEqual(["first", ""]);
    expect(term.snapshot("t").lines.map((l) => l.text)).toEqual(["first", "more", ""]);
    term.dispose();
  });

  it("T1.10 (C27 I12): dispose is idempotent", () => {
    const term = createEmulator({ cols: 10, rows: 2 });
    term.dispose();
    expect(() => {
      term.dispose();
    }).not.toThrow();
  });

  it("T1.11 (C27 I4): the cursor tracks the child, in both modes", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "abc");
    expect(term.snapshot("t").cursor).toEqual({ line: 0, col: 3 });
    await feed(term, "\r\n");
    expect(term.snapshot("t").cursor).toEqual({ line: 1, col: 0 });
    await feed(term, "\u001b[?1049h\u001b[3;5H");
    expect(term.snapshot("t").cursor).toEqual({ line: 2, col: 4 });
    term.dispose();
  });

  it("T1.12 (C27 I6): a styled trailing blank is kept and a plain one is trimmed", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "a\u001b[41m   \u001b[0m\r\nb   \r\n");
    const [styled, plain] = term.snapshot("t").lines;
    expect(styled?.text).toBe("a   ");
    expect(styled?.runs).toEqual([{ from: 1, to: 4, bg: { kind: "ansi16", index: 1 } }]);
    expect(plain?.text).toBe("b");
    term.dispose();
  });

  it("T2.5 (C27 I5, C04 §5a): a snapshot round-trips and validates as a document", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await feed(term, "\u001b[1;38;5;208mstyled\u001b[0m plain\r\n");
    const block = term.snapshot("term-1");
    expect(JSON.parse(JSON.stringify(block))).toEqual(block);
    expect(validateDocument(documentWith(block)).ok).toBe(true);
    term.dispose();
  });
});

describe("C04 — the terminal kind, spec-first rows", () => {
  /** A well-formed terminal, with one field replaced per row. */
  const term = (over: Record<string, unknown> = {}): unknown => ({
    kind: "terminal",
    id: "t1",
    cols: 80,
    screen: "lines",
    lines: [{ text: "ok" }],
    ...over,
  });
  /** The errors, or an empty list — so a row reads the same on either arm. */
  const errs = (block: unknown): readonly string[] => {
    const v = validateDocument(documentWith(block));
    return v.ok ? [] : v.error;
  };

  it("T1.31 (C04 I110): a control in a terminal line is refused and the line is named; U+FFFD in its place is admitted", () => {
    // **The second of two gates.** C27 I2 replaces controls at the cell walk, so
    // a terminal this framework built cannot carry one — and a `terminal` can
    // arrive from a far side that never ran C27, which is the case this gate is
    // for. An escape reaching here is not a rendering defect: the line is
    // emitted without stripping, so it would reach the *outer* terminal.
    for (const [name, ch] of [
      ["an escape", "\u001b"],
      ["a bell", "\u0007"],
      ["a C1", "\u0085"],
    ] as const) {
      const e = errs(term({ lines: [{ text: "fine" }, { text: `bad${ch}here` }] }));
      expect(e.join(" "), `${name} is refused`).toContain("control character");
      // **Named, not merely refused.** A document with forty lines and one bad
      // one is a producer's bug to find, and `lines[1]` is the whole of the
      // finding — which is why the index is asserted and not just the message.
      expect(e.join(" "), `${name} names its line`).toContain("lines[1]");
    }

    // **The control that says the rule is about controls, not about oddness.**
    // U+FFFD is what C27 I2 substitutes, so the admitted arm is the exact text
    // the emulator would have produced from the refused one.
    expect(errs(term({ lines: [{ text: "bad\ufffdhere" }] })), "the replacement is ordinary text").toEqual([]);
  });

  it("T1.32 (C04 I111): overlapping, out-of-range, out-of-order and adjacent-equal runs are each refused; a maximal ordered set is admitted", () => {
    const withRuns = (runs: readonly unknown[]): readonly string[] =>
      errs(term({ lines: [{ text: "abcdef", runs }] }));

    expect(withRuns([{ from: 0, to: 4, bold: true }, { from: 2, to: 6 }]).join(" "), "overlapping").toContain(
      "overlap or are out of order",
    );
    expect(withRuns([{ from: 0, to: 7 }]).join(" "), "past the end of the text").toContain("outside the text");
    expect(withRuns([{ from: 4, to: 6 }, { from: 0, to: 2 }]).join(" "), "out of order").toContain(
      "overlap or are out of order",
    );

    // **The addition to C04 I111's bounds gate, and the reason it is not tidiness.**
    // Two adjacent runs with equal styles measure the same as one and diff
    // differently on every frame — so a snapshot of an unchanged screen stops
    // comparing equal to itself. Merging is the producer's job.
    expect(
      withRuns([{ from: 0, to: 3, bold: true }, { from: 3, to: 6, bold: true }]).join(" "),
      "adjacent and equal",
    ).toContain("adjacent runs share a style");

    // The same offsets with *different* styles are maximal, which is the
    // control: without it the row above would pass on a rule that refused every
    // adjacency.
    expect(
      withRuns([{ from: 0, to: 3, bold: true }, { from: 3, to: 6, italic: true }]),
      "adjacent and different is a maximal pair",
    ).toEqual([]);
    expect(
      withRuns([{ from: 0, to: 2, bold: true }, { from: 3, to: 6, bold: true }]),
      "equal styles with a default cell between them",
    ).toEqual([]);
  });

  it("T1.33 (C04 I113): grid refuses dropped, zero is refused in both modes, and a positive dropped in lines is admitted", () => {
    // **Exclusive by meaning rather than by convention**: the alternate screen
    // has nothing above it to lose lines from.
    expect(errs(term({ screen: "grid", dropped: 3 })).join(" "), "a grid has no scrollback").toContain(
      "refused on a grid screen",
    );

    // **Declared by presence**, so a zero is not "none" — it is a marker row
    // reading `0 lines dropped at the cap`. Both modes, because the check that
    // rejects it is the field's own and not the grid rule: a row asserting only
    // the grid arm would pass with the positivity check deleted.
    for (const screen of ["lines", "grid"] as const) {
      expect(errs(term({ screen, dropped: 0 })).join(" "), `dropped: 0 on ${screen}`).toContain(
        "positive integer",
      );
    }

    expect(errs(term({ screen: "lines", dropped: 34 })), "the case the marker row is drawn from").toEqual([]);
    expect(errs(term({ screen: "grid" })), "and a grid with no dropped at all").toEqual([]);
  });
});

describe("C09 · C10 — the terminal block and a literal colour", () => {
  it("T1.29 (C09 I55): one row per line, plus the marker, and no wrapping", () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ text: `line ${String(i)}` }));
    expect(terminalDefinition.measure(b.terminal(80, lines), 80, noChildren)).toBe(40);
    expect(terminalDefinition.measure(b.terminal(80, lines, { dropped: 12 }), 80, noChildren)).toBe(41);
    expect(
      terminalDefinition.measure(b.terminal(80, [{ text: "x".repeat(200) }]), 80, noChildren),
    ).toBe(1);
  });

  it("T1.39 (C10 I38): the ladder steps rgb down and leaves ansi16 alone", () => {
    const rgb = { kind: "rgb", hex: "#0ac81e" } as const;
    expect(degradeColour(rgb, { colourDepth: 24 })).toEqual(rgb);
    expect(degradeColour(rgb, { colourDepth: 8 })).toEqual({ kind: "ansi256", index: 40 });
    expect(degradeColour(rgb, { colourDepth: 4 })).toEqual({ kind: "ansi16", index: 10 });
    expect(degradeColour(rgb, { colourDepth: 1 })).toBeUndefined();

    // The child named the user's red: it passes through at every arm above
    // 1-bit, and resolving it to a hex and back would substitute ours.
    const red = { kind: "ansi16", index: 1 } as const;
    for (const colourDepth of [24, 8, 4] as const) {
      expect(degradeColour(red, { colourDepth })).toEqual(red);
    }
    expect(degradeColour(red, { colourDepth: 1 })).toBeUndefined();
  });
});

describe("C21 · C22 — the PTY port, spec-first rows", () => {
  it("T1.11 (C21 I15, C21 I16): with no factory it throws naming the field, and with one it spawns once with what it was given", () => {
    // **No fallback, and the message names the field a consumer sets** (I16).
    // The state a bare message would describe — *no PTY factory* — is one the
    // reader cannot act on; `TuiConfig.pty` is.
    const bare = createProcessRunner({ env: {}, stdin: {} });
    let thrown = "";
    try {
      bare.spawnPty("echo hi", { cwd: () => "/w", cols: 80, rows: 6 });
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    expect(thrown, "the field a consumer sets").toContain("TuiConfig.pty");
    expect(thrown, "and that the framework depends on no PTY package").toContain("depends on no PTY package");

    // **What reaches the factory, asserted rather than that it was reached.**
    // A spy counting calls passes with every argument wrong, and the geometry is
    // the half a child cannot recover from: a shell told the wrong `cols` wraps
    // its own output and no later resize un-wraps what it already printed.
    const calls: unknown[][] = [];
    const runner = createProcessRunner({
      env: { PATH: "/usr/bin", TERM: "dumb" },
      stdin: {},
      pty: {
        spawn: (...args: unknown[]) => {
          calls.push(args);
          return fakePtyChild().child;
        },
      } as never,
    });
    runner.spawnPty("pytest -q", { cwd: () => "/work", cols: 120, rows: 30, env: { TERM: "xterm-256color" } });

    expect(calls, "spawned once, not per read").toHaveLength(1);
    const [file, argv, opts] = calls[0] as [string, readonly string[], Record<string, unknown>];
    expect(typeof file, "a shell path").toBe("string");
    // **`-c` and the user's string, unassembled.** C18 §5: nothing in the
    // framework builds this command, and the distinction is visible here.
    expect(argv, "the user's string under -c").toEqual(["-c", "pytest -q"]);
    expect(opts["cols"], "the width it was given").toBe(120);
    expect(opts["rows"], "and the height").toBe(30);
    expect(opts["cwd"], "the cwd, resolved at spawn rather than captured").toBe("/work");
    // The merge, and the direction: the call's own env wins over the runner's.
    expect(opts["env"], "the runner's env under the call's").toEqual({
      PATH: "/usr/bin",
      TERM: "xterm-256color",
    });
  });
  it("T1.13 (C21 I18): hasPty reports the injected factory, and the throw agrees with it", () => {
    // **The flag and the throw against the same runner.** A flag answered from
    // anywhere but the deps passes a row that builds two runners and asks each
    // one question — which is the shape that lets a constant `true` through.
    const bare = createProcessRunner({ env: {}, stdin: {} });
    expect(bare.hasPty, "no factory injected").toBe(false);
    expect(() => bare.spawnPty("echo hi", { cwd: () => "/w", cols: 80, rows: 6 })).toThrow(/pty/u);

    const spawn = (): never => {
      throw new Error("the factory is never called by this row");
    };
    const withFactory = createProcessRunner({ env: {}, stdin: {}, pty: { spawn } as never });
    expect(withFactory.hasPty, "a factory was injected").toBe(true);
  });
  it("T1.12 (C21 I17): once the child has exited, signal answers false, write is ignored, and exited has resolved", async () => {
    // **The race is normal, not exceptional.** A child may exit between the
    // keystroke and its delivery, so a write after exit throwing would surface
    // as an error in the user's face for something they did nothing wrong to
    // cause. Ignored is the ruling; `signal` is the one that must *answer*,
    // because a caller cancelling wants to know whether anything was cancelled.
    const fake = fakePtyChild();
    const runner = createProcessRunner({
      env: {},
      stdin: {},
      pty: { spawn: () => fake.child } as never,
    });
    const handle = runner.spawnPty("sleep 5", { cwd: () => "/w", cols: 80, rows: 6 });

    // The state the row is about, asserted before it is changed.
    expect(handle.running, "alive to begin with").toBe(true);
    expect(handle.signal("SIGINT"), "and a signal reaches it").toBe(true);
    expect(fake.killed, "which is the child being killed, not a bookkeeping flag").toEqual(["SIGINT"]);

    fake.exit(0, undefined);

    expect(handle.running, "the exit was observed").toBe(false);
    expect(await handle.exited, "and reported as one Exit").toEqual({ code: 0, signal: null });

    const writesBefore = fake.writes.length;
    handle.write("x");
    expect(fake.writes.length, "a write after exit reaches nothing").toBe(writesBefore);
    handle.resize(40, 10);
    expect(fake.resizes, "and neither does a resize").toEqual([]);
    expect(handle.signal("SIGKILL"), "and signalling answers false rather than throwing").toBe(false);
    expect(fake.killed, "with nothing sent").toEqual(["SIGINT"]);
  });
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it("T1.51 (C23 I64): a hundred chunks inside one frame window are one patch", async () => {
    // The cost C03 exists to prevent, asserted as a count: a snapshot per chunk
    // writes a two-thousand-line value into C13 a hundred times for one screen.
    let emit: ((c: string) => void) | null = null;
    let done: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    const h = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 1,
        exited: new Promise((r) => {
          done = r as (e: { code: number | null; signal: string | null }) => void;
        }),
        running: true,
        onData: (cb) => {
          emit = cb;
        },
        write: () => undefined,
        resize: () => undefined,
        signal: () => true,
      }),
    });
    let patches = 0;
    h.transcript.subscribe((c) => {
      if (c.kind === "patch") patches += 1;
    });
    h.pipeline.submit("seq 100");
    await settled();

    const send = async (text: string): Promise<void> => {
      (emit as unknown as (c: string) => void)(text);
      for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    };

    // One frame window: pending from the first chunk to the hundredth.
    h.setPending(true);
    const before = patches;
    for (let i = 0; i < 100; i += 1) await send(`line ${String(i)}\r\n`);
    expect(patches - before, "a hundred chunks in one window").toBe(0);

    h.setPending(false);
    await send("line 100\r\n");
    expect(patches - before, "one replace for the window").toBe(1);
    const text = JSON.stringify(h.transcript.entries[0]?.doc.blocks);
    expect(text, "the patch holds what the window accumulated").toContain("line 0");
    expect(text, "and the last of them").toContain("line 100");

    (done as unknown as (e: { code: number | null; signal: string | null }) => void)({ code: 0, signal: null });
    await settled(h.pipeline);
  });

  it("T1.52 (C23 I63): the arm is chosen from hasPty, and the other is never called", async () => {
    const chunks = (cb: (c: string) => void): void => {
      cb("on a terminal\r\n");
    };
    const pty = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 1,
        exited: Promise.resolve({ code: 0, signal: null }),
        running: false,
        onData: chunks,
        write: () => undefined,
        resize: () => undefined,
        signal: () => true,
      }),
    });
    pty.pipeline.submit("pytest");
    await settled(pty.pipeline);
    expect(pty.calls, "the PTY arm").toContain("spawnPty");
    expect(pty.calls, "and never the pipe arm").not.toContain("spawnShell");
    expect(JSON.stringify(pty.transcript.entries[0]?.doc.blocks)).toContain("on a terminal");

    const pipe = pipelineHarness();
    pipe.pipeline.submit("pytest");
    await settled(pipe.pipeline);
    expect(pipe.calls, "the pipe arm").toContain("spawnShell");
    expect(pipe.calls, "and never the PTY arm").not.toContain("spawnPty");
  });

  it("T1.53 (C23 I64): a chunk against a pending frame writes nothing, and the tail is the readout's", async () => {
    let emit: ((c: string) => void) | null = null;
    let done: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    const h = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 1,
        exited: new Promise((r) => {
          done = r as (e: { code: number | null; signal: string | null }) => void;
        }),
        running: true,
        onData: (cb) => {
          emit = cb;
        },
        write: () => undefined,
        resize: () => undefined,
        signal: () => true,
      }),
    });
    let patches = 0;
    h.transcript.subscribe((c) => {
      if (c.kind === "patch") patches += 1;
    });
    h.pipeline.submit("make");
    await settled();

    const send = async (text: string): Promise<void> => {
      (emit as unknown as (c: string) => void)(text);
      for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    };

    h.setPending(true);
    const before = patches;
    await send("first\r\n");
    expect(patches, "a chunk drew against a frame that had not landed").toBe(before);

    h.setPending(false);
    await send("second\r\n");
    expect(patches, "the chunk after the frame carries the accumulation").toBe(before + 1);
    const held = JSON.stringify(h.transcript.entries[0]?.doc.blocks);
    expect(held, "the suppressed chunk was kept").toContain("first");
    expect(held).toContain("second");

    // **The tail.** A child that writes into a pending frame and goes quiet has
    // nothing left to trigger the catch-up; the 1 Hz readout is what renders it.
    h.setPending(true);
    await send("last\r\n");
    h.setPending(false);
    h.tick(1000);
    for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    expect(
      JSON.stringify(h.transcript.entries[0]?.doc.blocks),
      "the quiet tail waited for a chunk that never came",
    ).toContain("last");

    (done as unknown as (e: { code: number | null; signal: string | null }) => void)({ code: 0, signal: null });
    await settled(h.pipeline);
  });

  it("T2.47 (C23 I67): a settled screen carries no cursor, and the dispose follows the snapshot", async () => {
    const h = pipelineHarness({
      spawnShell: () => ({
        stdout: (async function* () {
          yield "prompt> ";
        })(),
        stderr: (async function* () {})(),
        exited: Promise.resolve({ code: 0, signal: null }),
        overflowed: false,
      }) as never,
    });
    h.pipeline.submit("sh");
    await settled(h.pipeline);
    const doc = h.transcript.entries[0]?.doc;
    const scroll = doc?.blocks[0] as { children: readonly Block[] };
    const screen = scroll.children[0] as { kind: string; cursor?: unknown };
    expect(screen.kind).toBe("terminal");
    expect(screen.cursor, "a settled screen has nobody writing at it").toBeUndefined();
    // The ordering half: a dispose before the snapshot throws C27's refusal,
    // which would surface as the route's spawn-stage error document.
    expect(doc?.status, "the snapshot was taken after the dispose").toBe("ok");
  });

  it("T3.63 (C23 I63): a spawnPty that throws settles failed, and the pipe arm is never tried", async () => {
    const h = pipelineHarness({ hasPty: true });
    h.pipeline.submit("pytest");
    await settled(h.pipeline);
    const doc = h.transcript.entries[0]?.doc;
    expect(doc?.status, "a configuration error is reported").toBe("error");
    expect(doc?.error?.message ?? "").toContain("pty");
    expect(h.calls, "falling back would hide it behind a duller child").not.toContain("spawnShell");
  });

  it("T3.64 (C23 I67, C27 I11): a chunk arriving as the child exits is dropped, not written to a disposed screen", async () => {
    // **The window CI opened and this machine did not** (F850's second
    // instance). `finished` is set *after* the drain, so a chunk accepted while
    // `writes` is being awaited chains onto it past the await and runs against
    // a disposed emulator — C27's refusal, thrown out of a floating promise,
    // which vitest reports as an unhandled error against whichever test was
    // running. One scheduler turn wide, and a loaded runner is what opens it.
    let emit: ((c: string) => void) | null = null;
    let done: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    const h = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 1,
        exited: new Promise((r) => {
          done = r as (e: { code: number | null; signal: string | null }) => void;
        }),
        running: true,
        onData: (cb) => {
          emit = cb;
        },
        write: () => undefined,
        resize: () => undefined,
        signal: () => true,
      }),
    });
    const errors: unknown[] = [];
    const onRejection = (e: unknown): void => void errors.push(e);
    process.on("unhandledRejection", onRejection);

    h.pipeline.submit("make");
    await settled();
    (emit as unknown as (c: string) => void)("before the exit\r\n");
    for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));

    // **Emitted across the turns that follow the exit, not only on it.** A chunk
    // sent in the same turn is drained normally and proves nothing; the window
    // is the one turn where the route has resumed from `await child.exited` and
    // is awaiting the chain. Which turn that is depends on the emulator's own
    // scheduling, so the fixture covers several rather than guessing one.
    (done as unknown as (e: { code: number | null; signal: string | null }) => void)({ code: 0, signal: null });
    for (let i = 0; i < 8; i += 1) {
      (emit as unknown as (c: string) => void)(`after the exit ${String(i)}\r\n`);
      await new Promise((r) => void setTimeout(r, 0));
    }
    await settled(h.pipeline);
    for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    process.off("unhandledRejection", onRejection);

    expect(errors, "a write reached a disposed emulator").toEqual([]);
    const doc = h.transcript.entries[0]?.doc;
    expect(doc?.status, "the route settled").toBe("ok");
    expect(JSON.stringify(doc?.blocks), "what the child wrote before it exited").toContain("before the exit");
  });

  it("T4.64 (C23 I65): the child and the emulator are told the same width", async () => {
    // **Two spies, because one cannot see an agreement.** The first version of
    // this row watched only the child's call and asserted its position in a
    // list; every ordering mutation survived it, and chasing that survivor is
    // what showed the ordering itself to be unfalsifiable here — a repaint
    // reaches the emulator through the write queue, which resolves after both
    // calls have returned (F852).
    //
    // What is left is the figure, and it is the one that can be wrong: the
    // region is 60 and the body's inner width is 56.
    let width = 80;
    const told: number[] = [];
    let emit: ((c: string) => void) | null = null;
    let done: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    const h = pipelineHarness({
      hasPty: true,
      region: () => ({ width, height: 24 }),
      spawnPty: () => ({
        pid: 1,
        exited: new Promise((r) => {
          done = r as (e: { code: number | null; signal: string | null }) => void;
        }),
        running: true,
        onData: (cb) => {
          emit = cb;
        },
        write: () => undefined,
        resize: (c: number) => void told.push(c),
        signal: () => true,
      }),
    });
    h.pipeline.submit("top");
    await settled();

    const quiet = async (): Promise<void> => {
      for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    };
    (emit as unknown as (c: string) => void)("first\r\n");
    await quiet();

    width = 60;
    h.pipeline.resized();
    await quiet();

    (done as unknown as (e: { code: number | null; signal: string | null }) => void)({ code: 0, signal: null });
    await settled(h.pipeline);

    const scroll = h.transcript.entries[0]?.doc.blocks[0] as { children: readonly Block[] };
    const screen = scroll.children[0] as { cols: number };
    expect(told, "the child was told once").toEqual([56]);
    expect(screen.cols, "and the emulator holds the same number").toBe(56);
    expect(screen.cols, "which is the body's inner width, not the region's").toBe(60 - 4);
  });
});
