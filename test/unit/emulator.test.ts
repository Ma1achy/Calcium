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
  it.todo("T1.31 (C04 I110): a terminal whose line text contains an escape, a bell or a C1 is refused by validateDocument naming the line; the same text with U+FFFD in their place is admitted — not deferred on a component: lands with the Terminal type");
  it.todo("T1.32 (C04 I111): overlapping, out-of-range, out-of-order and adjacent-equal runs are each refused; a maximal ordered set is admitted — not deferred on a component: lands with the Terminal type");
  it.todo("T1.33 (C04 I113): grid mode with dropped is refused; dropped: 0 is refused in both modes; a positive dropped in lines mode is admitted — not deferred on a component: lands with the Terminal type");
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
  it.todo("T1.11 (C21 I15, C21 I16): spawnPty with no pty in the deps throws naming pty; with a fake factory it calls spawn once with the given cols, rows, cwd and env — not deferred on a component: lands with spawnPty");
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
  it.todo("T1.12 (C21 I17): a fake PTY child that has exited returns false from signal, ignores write, and has resolved exited — not deferred on a component: lands with spawnPty");
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
