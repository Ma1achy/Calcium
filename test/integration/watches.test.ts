// C22 I135–I140, C16 I76 and C05 §3 — watches through a built session
// (ruling 50, §085, C22 §6p).
//
// **Bytes in, the screen out**, as §6n's rows: the stream is a transport the
// row controls patch by patch, the keys are the terminal's own bytes, and every
// assertion reads what was painted or what reached the terminal.
import { describe, expect, it, vi } from "vitest";

import { FRAMEWORK_TOOLS } from "../../src/data/manifest/framework.js";
import type { RawPatch, RawResult, TransportRouter } from "../../src/data/transport/types.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const BEL = "\u0007";
const OUT = `${ESC}[O`;
const SHIFT_TAB = `${ESC}[Z`;

/** One stream the row drives: `push` a patch, `end` it. */
function channel() {
  const queue: RawPatch[] = [];
  let wake: (() => void) | null = null;
  const push = (p: RawPatch): void => {
    queue.push(p);
    wake?.();
    wake = null;
  };
  const iterate = async function* (): AsyncGenerator<RawPatch> {
    for (;;) {
      while (queue.length > 0) {
        const p = queue.shift()!;
        yield p;
        if (p.kind === "end") return;
      }
      await new Promise<void>((r) => (wake = r));
    }
  };
  const result: RawResult = {
    argv: ["prism", "build"],
    exitCode: 0,
    signal: null,
    stdout: undefined,
    stdoutRaw: "",
    stderr: "",
    durationMs: 0,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
  };
  return { push, iterate, end: () => push({ kind: "end", result }) };
}

const progress = (current: number) => ({
  kind: "data" as const,
  value: { op: "replace", blockId: "bar", block: { kind: "progress", id: "bar", label: "build", current, total: 100 } },
});

const pause = (ms: number) => async () => {
  await new Promise((r) => setTimeout(r, ms));
  return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "t", text: "done" }] };
};

/** A verb that holds the guard, raises a question a second later, and settles a second after the answer. */
const asksLater = async (_argv: readonly string[], ctx: { ask: (o: unknown) => Promise<unknown> }) => {
  await new Promise((r) => setTimeout(r, 1_000));
  await ctx.ask({ question: "which branch?", choices: [{ key: "a", label: "main", default: true }] });
  await new Promise((r) => setTimeout(r, 1_000));
  return { schema: "tui.view/1", status: "ok", blocks: [] };
};

async function session(notify?: string) {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const streams: ReturnType<typeof channel>[] = [];
  const transport: TransportRouter = {
    for: () => ({
      invoke: () => Promise.reject(new Error("no invoke route in this row")),
      stream: () => {
        const c = channel();
        streams.push(c);
        // The first patch opens the bar the later ones replace.
        c.push({
          kind: "data",
          value: { op: "append", block: { kind: "progress", id: "bar", label: "build", current: 10, total: 100 } },
        });
        return c.iterate();
      },
    }),
    busy: false,
    inFlight: null,
  };
  const tool = (name: string, extra: object) => ({ name, summary: name, args: [], flags: [], ...extra });
  const s = await buildSession(
    {
      stdin: stdin as never,
      env: {
        TERM: "xterm-256color",
        LANG: "en_GB.UTF-8",
        // A terminal that reports focus, for §6n's rows alone: WezTerm also
        // reports key releases, which arms a question until the key is let go
        // (C16 I44) — a boundary these rows' bytes do not send.
        ...(notify === undefined ? {} : { TERM_PROGRAM: "WezTerm", CALCIUM_NOTIFY: notify }),
      },
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [tool("build", { local: false, streams: true }), tool("slow", { local: true }), tool("quick", { local: true }), tool("later", { local: true })],
      },
      transport,
      adapters: {
        build: {
          schema: "tui.view/1",
          adapt: () => ({ schema: "tui.view/1", status: "ok", blocks: [] }) as never,
          adaptPatch: (p: RawPatch) => (p.kind === "data" ? (p.value as never) : null),
        },
      },
      localHandlers: { slow: pause(5_000), quick: pause(10), later: asksLater },
    } as never,
    { columns: 80, rows: 24 },
  );
  const step = async (ms = 0): Promise<void> => {
    s.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  const send = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await step();
  };
  const type = async (text: string): Promise<void> => {
    for (const ch of text) await send(ch);
  };
  /** `esc` alone, and the decoder's wait for what might follow it. */
  const esc = async (): Promise<void> => {
    await send(ESC);
    await step(100);
  };
  const text = (): string => s.screen().rows.join("\n");
  /** The screen's rows, bottom up, with trailing blanks gone. */
  const footerRows = (): readonly string[] => {
    const rows = s.screen().rows.map((r) => r.trimEnd());
    while (rows.length > 0 && rows.at(-1) === "") rows.pop();
    return rows;
  };
  /** The watch row, if one is drawn: the row that opens with the residue lead. */
  const watchRow = (): string | undefined => footerRows().find((r) => r.trimStart().startsWith("⋯ "));
  await step();
  return { ...s, stdin, streams, step, send, type, esc, text, footerRows, watchRow };
}

type S = Awaited<ReturnType<typeof session>>;
const ownerLine = (s: S): string => s.footerRows().at(-1) ?? "";
/** Whether a printable key reaches the editor — and if it did, taken back out. */
const promptTakes = async (s: S): Promise<boolean> => {
  await s.send("q");
  const took = s.footerRows().some((r) => r.startsWith("❯ q"));
  if (took) await s.send("\u007f");
  return took;
};

describe("C22 §6p — watches through a built session (ruling 50)", () => {
  it("T4.110 (C22 I135, I136, I137, I139, I140, C16 I76): /watch, a progress patch, ⇧⇥, ⏎ and the settle", async () => {
    try {
      const s = await session();
      expect(s.watchRow(), "the control: no watch, no row").toBeUndefined();
      expect(ownerLine(s), "and ⇧⇥ names the transcript").toMatch(/transcript/u);

      await s.type("/build\r");
      await s.step(10);
      await s.type("/watch\r");
      await s.step(10);
      expect(s.text()).toContain("watching /build");
      const row = s.watchRow();
      expect(row, "the row, once /watch has run").toBeDefined();
      expect(row).toContain("build");
      expect(row).toContain("10%");
      const rows = s.footerRows();
      expect(rows.indexOf(row!), "directly above the owner line").toBe(rows.length - 2);
      expect(ownerLine(s), "the scope line's ⇧⇥ now names the row").toMatch(/watches/u);

      // A patch, and the chip follows on the next frame.
      s.streams[0]!.push(progress(43));
      await s.step(50);
      expect(s.watchRow()).toContain("43%");
      expect(s.watchRow()).not.toContain("›");

      // ⇧⇥ puts the row's mark on the chip and the row's keys on the owner line.
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow(), "the selection mark").toContain("› /build");
      for (const word of ["move", "open", "prompt"]) expect(ownerLine(s), word).toContain(word);

      // ⏎ opens the entry; the watch stands and the mark goes with the keys.
      await s.send("\r");
      await s.step(20);
      expect(s.watchRow(), "the watch stands").toBeDefined();
      expect(s.watchRow()).not.toContain("›");
      expect(ownerLine(s)).not.toMatch(/\bopen\b/u);

      // The settle removes the row.
      s.streams[0]!.end();
      await s.step(50);
      expect(s.watchRow(), "the run ended and the watch dropped itself").toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.111 (C22 I135, C22 I126, C01 I23): a watched short settle rings while away, an unwatched one does not, and the row needs no opt-in", async () => {
    try {
      const ring = async (watch: boolean): Promise<string> => {
        const s = await session("bell");
        await s.send(OUT);
        await s.type("/build\r");
        await s.step(10);
        if (watch) await s.type("/watch\r");
        await s.step(10);
        const at = s.stdout.output.length;
        s.clock.advance(2_000);
        s.streams[0]!.end();
        await s.step(50);
        return s.stdout.output.slice(at);
      };
      expect(await ring(true), "watched: `done` whatever the duration").toContain(BEL);
      vi.useRealTimers();
      expect(await ring(false), "the control: the same short run unwatched earns nothing").not.toContain(BEL);
      vi.useRealTimers();

      // Nothing opted in: there is no notifier, and the row is still drawn.
      const q = await session();
      await q.type("/build\r");
      await q.step(10);
      await q.type("/watch\r");
      await q.step(10);
      expect(q.watchRow(), "the set is the session's").toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.112 (C22 I136, C23 I5, C22 §6p.5): /watch behind a guard-holding invoke answers nothing is running to watch", async () => {
    try {
      const s = await session();
      await s.type("/slow\r");
      await s.step(10);
      await s.type("/watch\r");
      await s.step(10);
      expect(s.text(), "the line queues behind the invoke").toContain("queued behind");
      await s.step(5_000);
      await s.step(50);
      expect(s.text(), "and answers after it").toContain("nothing is running to watch");
      expect(s.watchRow(), "the footer never drew a row").toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.113 (C22 I137, C16 I76, R-COR-002): the last watch settling leaves focus on the row, and a question over it takes the keys", async () => {
    try {
      const s = await session();
      await s.type("/build\r");
      await s.step(10);
      await s.type("/watch\r");
      await s.step(10);
      await s.type("/later\r");
      await s.step(10);
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow()).toContain("› /build");

      // A question raised over the focused row takes the keys, and the mark
      // goes with them until it is answered (C22 I139).
      await s.step(1_000);
      expect(s.text(), "the question is up").toContain("which branch?");
      expect(s.watchRow(), "no mark under a question").not.toContain("›");
      // Past the arming window (C16 I44), so the answer is not refused.
      await s.step(1_000);
      await s.send("a");
      await s.step(50);
      expect(s.watchRow(), "answered, and the row has the keys again").toContain("› /build");
      // The asking verb settles a second later, and C23's submit row returns
      // focus to the prompt — `liveBlock`'s rule, one position over (C16 I76).
      await s.step(1_000);
      expect(s.watchRow(), "the reset").not.toContain("›");
      expect(await promptTakes(s)).toBe(true);
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow()).toContain("› /build");

      s.streams[0]!.end();
      await s.step(50);
      expect(s.watchRow(), "focus stays, and the row says why it is empty").toContain("nothing watched");
      expect(ownerLine(s), "still the row's keys").toContain("prompt");

      await s.esc();
      expect(s.watchRow(), "esc returns to the prompt and the row goes").toBeUndefined();
      expect(ownerLine(s)).toMatch(/transcript/u);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C16 §6d — the row through a built session (ruling 50)", () => {
  it("T4.95 (C16 I76): ⇧⇥ from the prompt goes to the row while a watch stands, then to the transcript; ⇥ and ⌃c return", async () => {
    try {
      const s = await session();
      // No watch: ⇧⇥ is the transcript, and the row is never drawn.
      await s.type("/quick\r");
      await s.step(50);
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow()).toBeUndefined();
      // **`liveBlock` and `prompt` share `scope`**, so the owner line cannot
      // tell them apart; where a printable key lands can.
      expect(await promptTakes(s), "focus left the prompt for the transcript").toBe(false);
      await s.esc();
      await s.esc();

      await s.type("/build\r");
      await s.step(10);
      await s.type("/watch\r");
      await s.step(10);
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow(), "the first ⇧⇥: the row").toContain("› /build");
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow(), "the second: the transcript, and the mark goes").not.toContain("›");
      expect(s.watchRow(), "the row stays drawn").toBeDefined();
      expect(await promptTakes(s), "and not the prompt").toBe(false);

      // Back to the row from the prompt, then ⇥ returns.
      await s.esc();
      await s.esc();
      expect(ownerLine(s)).toMatch(/watches/u);
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow()).toContain("› /build");
      await s.send("\t");
      await s.step(20);
      expect(s.watchRow(), "⇥ returns to the prompt").not.toContain("›");
      expect(await promptTakes(s)).toBe(true);
      expect(ownerLine(s)).toMatch(/watches/u);

      // And ⌃c does too.
      await s.send(SHIFT_TAB);
      await s.step(20);
      expect(s.watchRow()).toContain("› /build");
      await s.send("\u0003");
      await s.step(20);
      expect(s.watchRow(), "⌃c's rung returns to the prompt").not.toContain("›");
      expect(await promptTakes(s)).toBe(true);
      expect(s.watchRow(), "and cancels nothing: the stream still runs").toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.10 (C05 §3, C22 I136): /watch and /unwatch are framework rows after /config", () => {
    const names = FRAMEWORK_TOOLS.map((t) => t.name);
    const at = names.indexOf("config");
    expect(names.slice(at + 1, at + 3)).toEqual(["watch", "unwatch"]);
    for (const name of ["watch", "unwatch"]) {
      const row = FRAMEWORK_TOOLS.find((t) => t.name === name)!;
      expect(row.local).toBe(true);
      expect(row.hidden ?? false).toBe(false);
      expect(row.args.map((a) => [a.name, a.type, a.required ?? false])).toEqual([["back", "int", false]]);
    }
  });
});
