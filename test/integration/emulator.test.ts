// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 4.
//
// **Every figure here was measured before it was written.** The deferrals these
// replace named a residue row reading `⋯ N above` and a count of 34; the frame
// says `⋯ 35 above, 0 below`, and the glyph and its colour both move with the
// arm. A deferred row's text is never executed, so its numbers drift for as long
// as the deferral lasts (F923) — these are read off the renderer.
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { BODY_INDENT } from "../../src/shell/entry-layout.js";
import {
  ASCII_CAPS,
  FULL_CAPS,
  MONO_CAPS,
  MONO_UNICODE_CAPS,
  measurable,
} from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

/** The ladder's own rungs, built by depth so the set *is* an ordering (F—capability sets are not). */
const AT = (depth: 1 | 4 | 8 | 24): typeof FULL_CAPS => ({ ...FULL_CAPS, colourDepth: depth });

/** A screen with `n` lines written to it, plus whatever the script adds. */
async function screenOf(lines: number, script = ""): Promise<Block> {
  const em = createEmulator({ cols: 40, rows: 24 });
  for (let i = 0; i < lines; i += 1) await em.write(`line ${String(i)}\r\n`);
  if (script !== "") await em.write(script);
  const snapshot = em.snapshot("t1");
  em.dispose();
  return snapshot;
}

const inScroll = (term: Block, height = 6): Block =>
  b.scroll(height, [term], { follow: true, id: "s1" });

const render = (block: Block, caps: typeof FULL_CAPS, width = 60): readonly string[] =>
  measurable({ capabilities: caps }).renderToLines(block, width);

const strip = (s: string): string => s.replace(/\u001b\[[0-9;]*m/gu, "");

const wrapped = (doc: unknown): { ok: boolean; error?: readonly string[] } =>
  validateDocument({
    schema: "tui.view/1",
    command: "!pytest",
    status: "ok",
    meta: {
      verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 12,
      truncated: false, argv: ["pytest"], transport: "subprocess", origin: "user",
    },
    blocks: [doc],
  } as never);

describe("C27 terminal emulator — tier 4", () => {
  it("T4.1 (with C04, C09): the tail is six rows at 24-bit with the child's own colours, and the residue counts what is above", async () => {
    const term = await screenOf(40, "\u001b[38;2;220;50;47mFAILED\u001b[0m tests/test_x.py\r\n");
    const rows = render(inScroll(term), FULL_CAPS);

    // **Seven, not six**: C04 I47/I49 put the residue row on top of the box, so
    // a scroll of height 6 whose content overflows is seven rows and the content
    // area is still six. A row asserting `toHaveLength(6)` would be asserting
    // that the residue is missing.
    expect(rows, "six content rows and the residue").toHaveLength(7);
    expect(rows.slice(0, 6).map(strip), "the tail, not the head").toEqual([
      "line 36", "line 37", "line 38", "line 39", "FAILED tests/test_x.py", " ",
    ]);
    expect(rows[4], "the child's colour reaches the frame unchanged at 24-bit").toContain(
      "\u001b[38;2;220;50;47m",
    );
    // The cursor's own row is the sixth — an inverse cell on the line the child
    // stopped on, which is content and counts against the box.
    expect(rows[5], "the cursor is drawn, and it is one of the six").toContain("\u001b[7m");
    expect(strip(rows[6] ?? ""), "and the residue counts both directions").toBe("⋯ 36 above, 0 below");
  });

  it("T4.2 (with C09): the same document degrades by the ladder and by nothing else", async () => {
    const term = await screenOf(2, "\u001b[38;2;220;50;47m\u001b[1m\u001b[7mFAILED\u001b[0m ok\r\n");
    const doc = inScroll(term);
    // **Found by content, not by index.** The row a short script lands on moves
    // with the number of lines, and an index that happens to be right today is
    // the shape a fixture change silently breaks.
    const at = (d: 1 | 4 | 8 | 24): string =>
      render(doc, AT(d)).find((r) => strip(r).includes("FAILED")) ?? "";

    // Measured, rung by rung — a row that only compared each arm against
    // `degradeColour` would agree with a wrong ladder.
    expect(at(24), "truecolour, verbatim").toContain("\u001b[38;2;220;50;47m");
    expect(at(8), "the 256-cube's nearest").toContain("\u001b[38;5;166m");
    expect(at(4), "and the sixteen's").toContain("\u001b[91m");

    // **1-bit keeps the attributes**, which is the half a colour assertion
    // misses: dropping the colour and the emphasis together loses the only
    // channel left. C10 I38.
    const mono = at(1);
    expect(mono, "no colour survives").not.toMatch(/38;[25]|\u001b\[9[0-7]m/u);
    expect(mono, "the emphasis does").toContain("\u001b[1m");
    expect(mono, "and so does the inverse").toContain("\u001b[7m");
    expect(strip(mono), "with the text untouched at every rung").toBe("FAILED ok");
  });

  it("T4.3 (with C04): a hand-built terminal carrying an escape is refused, naming the line", async () => {
    // **The second gate, and it exists because the first is not on this path.**
    // C27 I2 replaces control characters at the cell walk, so a terminal this
    // framework built cannot carry one — and a `terminal` arriving from a far
    // side that never ran C27 reaches the renderer unstripped, where the escape
    // leaves the block and colours the rest of the session's screen.
    const hand = { kind: "terminal", id: "t1", cols: 40, screen: "lines", lines: [
      { text: "ok" },
      { text: "\u001b[31mred" },
    ] };
    const v = wrapped(hand);
    expect(v.ok, "refused").toBe(false);
    const said = (v.error ?? []).join(" ");
    expect(said, "naming the line rather than the block").toContain("lines[1]");
    expect(said, "and what is wrong with it").toContain("control character");

    // The control: the same document without the escape is admitted, so the
    // refusal is about the byte and not about the shape.
    expect(wrapped({ ...hand, lines: [{ text: "ok" }, { text: "red" }] }).ok).toBe(true);
  });
});

describe("C04 · C09 · C10 — the terminal block in a scroll, spec-first rows", () => {
  it("T4.56 (C04 I110, C09, C10): the tail and the residue count what is hidden; a dropped marker is content, not chrome", async () => {
    const term = await screenOf(40);
    const rows = render(inScroll(term), FULL_CAPS);
    expect(rows, "six rows and the residue").toHaveLength(7);
    // 40 writes leave 41 lines — the last is the empty one the cursor sits on —
    // so six shown leaves 35. The deferral said 34, from a count that never ran.
    expect(strip(rows[6] ?? ""), "the residue's own count").toBe("⋯ 35 above, 0 below");

    // **Two counts, asserted separately**, because one number cannot say which
    // mechanism produced it: `dropped` is the emulator's cap and the residue is
    // the viewport's fold, and a row that checked only their sum would pass with
    // either attributed to the other.
    const capped = b.terminal(40, [{ text: "a" }, { text: "bb" }], { dropped: 12 });
    const withCap = render(inScroll(capped), FULL_CAPS);
    expect(strip(withCap[0] ?? ""), "the marker is content row 0, above the first kept line").toBe(
      "⋯ 12 lines dropped at the cap",
    );
    expect(strip(withCap[1] ?? ""), "and the kept lines follow it").toBe("a");
    expect(withCap, "three content rows fit in a box of six, so there is no residue").toHaveLength(6);
    expect(withCap.map(strip).join("|"), "and no fold count is drawn").not.toContain("above");
  });
});

describe("C09 · C10 — the terminal block at the arms, spec-first rows", () => {
  const ARMS = [
    ["24-bit, unicode", FULL_CAPS],
    ["8-bit", AT(8)],
    ["4-bit", AT(4)],
    ["1-bit, unicode", MONO_UNICODE_CAPS],
    ["1-bit, ascii", MONO_CAPS],
  ] as const;

  it("T4.57 (C09 I55, with C04, C27): a pytest-shaped script draws the same picture at five arms", async () => {
    // A byte script shaped like the thing this is for: a progress line rewritten
    // in place with a carriage return, a coloured verdict, and a summary rule.
    const term = await screenOf(
      38,
      "collecting ...\rcollected 128 items\r\n" +
        "\u001b[32m.........\u001b[0m\r\n" +
        "\u001b[1m\u001b[31mFAILED\u001b[0m tests/test_api.py::test_auth\r\n",
    );
    const doc = inScroll(term);

    const pictures = ARMS.map(([, caps]) => render(doc, caps).map(strip));
    // **Read as pictures.** Every arm draws the same characters in the same
    // places; only the SGR and the residue glyph move. A row comparing bytes
    // would fail on the arm axis it is meant to be indifferent to.
    for (const [i, [name]] of ARMS.entries()) {
      expect(pictures[i]?.slice(0, 6), `${name}: the tail`).toEqual(pictures[0]?.slice(0, 6));
    }
    expect(pictures[0]?.[2], "the rewritten progress line, not both halves").toContain("collected 128 items");
    expect(pictures[0]?.[4], "and the verdict").toContain("FAILED tests/test_api.py::test_auth");

    // The residue glyph is the one thing that *should* move, and it moves with
    // `unicode` rather than with `colourDepth` — the two are separate rungs and
    // a fixture that changes both cannot say which.
    expect(strip(render(doc, MONO_UNICODE_CAPS)[6] ?? ""), "unicode keeps the ellipsis").toContain("⋯");
    expect(strip(render(doc, ASCII_CAPS)[6] ?? ""), "ascii takes the tilde").toContain("~");
  });

  it("T4.37 (C10 I38, with C04, C09): the arms differ by the ladder alone, and the document does not move", async () => {
    const term = await screenOf(3, "\u001b[38;2;220;50;47mFAILED\u001b[0m ok\r\n");
    const doc = inScroll(term);
    const before = JSON.stringify(doc);

    const frames = ARMS.map(([, caps]) => render(doc, caps));
    for (const [i, [name]] of ARMS.entries()) {
      expect(frames[i]?.map(strip), `${name}: identical text`).toEqual(frames[0]?.map(strip));
    }

    // The SGR differs, and differs by the ladder: each rung's own encoding.
    expect(frames[0]?.join(""), "24-bit").toContain("38;2;220;50;47");
    expect(frames[1]?.join(""), "8-bit").toContain("38;5;166");
    expect(frames[2]?.join(""), "4-bit").toContain("\u001b[91m");
    expect(frames[3]?.join(""), "1-bit carries no colour").not.toMatch(/38;[25]/u);

    // **The block is byte-identical across them**, which is the invariant under
    // all of it: appearance degrades and geometry never does, so a renderer that
    // rewrote the document to suit an arm would make `measure` depend on
    // capabilities two components away.
    expect(JSON.stringify(doc), "no arm rewrote the document").toBe(before);
  });
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it("T4.64 (C23 I65, with C27): the frame after a width change is drawn from the reflowed grid", async () => {
    // **The residue of the deferral, and not what it asked for.** It asked for
    // the child to be resized *before* the emulator; C23 I65 rules that vacuous
    // — the child's repaint arrives on the write queue, which resolves after
    // both calls return — and three ordering mutations survived the row written
    // to catch it (F852). T6.94 holds the figure. What was genuinely uncovered
    // is the **picture**: a grid told a new width and drawn at the old one.
    let emit: ((c: string) => void) | null = null;
    let done: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    let width = 100;
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
        resize: () => undefined,
        signal: () => true,
      }),
    });
    h.pipeline.submit("top");
    await settled();
    const send = async (text: string): Promise<void> => {
      (emit as unknown as (c: string) => void)(text);
      for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));
    };

    const long = "x".repeat(70);
    await send(`${long}\r\n`);
    const wide = JSON.stringify(h.transcript.entries[0]?.doc.blocks);
    expect(wide, "seventy columns fit in ninety-six").toContain(long);

    width = 44;
    h.pipeline.resized();
    await send("after\r\n");

    (done as unknown as (e: { code: number | null; signal: string | null }) => void)({ code: 0, signal: null });
    await settled(h.pipeline);

    const doc = h.transcript.entries[0]?.doc;
    const found: Record<string, unknown>[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return void v.forEach(walk);
      if (v === null || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (o["kind"] === "terminal") found.push(o);
      Object.values(o).forEach(walk);
    };
    walk(doc?.blocks);
    const screen = found[0] as { cols: number; lines: readonly { text: string }[] };

    expect(screen.cols, "the grid holds the body's inner width").toBe(44 - BODY_INDENT);
    // **The picture, not the number.** A grid told 40 and still holding a
    // seventy-column line agrees on `cols` and is wrong about every row.
    expect(
      screen.lines.every((l) => l.text.length <= screen.cols),
      "no line outruns the grid it is in",
    ).toBe(true);
    expect(
      screen.lines.filter((l) => l.text.startsWith("x")).length,
      "the long line reflowed into two rows",
    ).toBe(2);
  });

  it("T4.65 (C23 I63, C23 I67, with C21, C27): one byte script on both arms settles with the same screen", async () => {
    // **What the deferral asked for cannot be asserted here, and the reason is
    // the fixture.** It said *the PTY arm carries the child's colours and the
    // pipe arm does not*. Nothing in the route treats the two arms differently
    // about colour — `env` is computed once, above the arm choice, and the same
    // emulator parses both — so the difference is the **child's**: a real one
    // calls `isatty` and decides. With a fake on both sides, the fixture would
    // be supplying exactly the behaviour under test, which is why the colour
    // claim is T5.6's and needs a real `node-pty` to mean anything (F923).
    //
    // What this row can say is the half that *is* the framework's: the same
    // bytes settle to the same screen whichever arm carried them.
    const script = "\u001b[32mPASSED\u001b[0m 128 tests\r\nin 4.21s\r\n";

    const pty = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 1,
        exited: Promise.resolve({ code: 0, signal: null }),
        running: false,
        onData: (cb) => cb(script),
        write: () => undefined,
        resize: () => undefined,
        signal: () => true,
      }),
    });
    pty.pipeline.submit("pytest");
    await settled(pty.pipeline);

    const pipe = pipelineHarness({
      spawnShell: () => ({
        stdout: (async function* () {
          yield script;
        })(),
        stderr: (async function* () {})(),
        exited: Promise.resolve({ code: 0, signal: null }),
        overflowed: false,
      }) as never,
    });
    pipe.pipeline.submit("pytest");
    await settled(pipe.pipeline);

    const screenOfEntry = (h: typeof pty): Record<string, unknown> => {
      const found: Record<string, unknown>[] = [];
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) return void v.forEach(walk);
        if (v === null || typeof v !== "object") return;
        const o = v as Record<string, unknown>;
        if (o["kind"] === "terminal") found.push(o);
        Object.values(o).forEach(walk);
      };
      walk(h.transcript.entries[0]?.doc.blocks);
      return found[0] ?? {};
    };

    const a = screenOfEntry(pty);
    const c = screenOfEntry(pipe);
    expect(pty.calls, "the PTY arm").toContain("spawnPty");
    expect(pipe.calls, "and the pipe arm").toContain("spawnShell");
    // Ids differ by construction, so the comparison is on what the screen holds.
    expect(a["lines"], "the same lines").toEqual(c["lines"]);
    expect(a["screen"], "in the same mode").toBe(c["screen"]);
    expect(JSON.stringify(a), "with the colour the bytes carried").toContain('"fg"');
    // C23 I67's other half: neither settles with a cursor.
    expect(Object.keys(a), "the PTY arm settles without one").not.toContain("cursor");
    expect(Object.keys(c), "and so does the pipe arm").not.toContain("cursor");
  });
});
