// C23 I84–I86 — the away ledger through the graph (ruling 51, R-BLK-314).
//
// **The wiring, which T1.97 cannot see.** The ledger alone is stepped in
// `test/unit/away.test.ts`; these rows reach it the way a session does — a
// child attached through `surface.open`, focus reports as bytes on stdin, and
// settlements as the transcript's own changes — and read the entries it wrote.
import { describe, expect, it, vi } from "vitest";

import type { ChildSurface } from "../../src/index.js";
import { chordText, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { compose, noticeDoc } from "../../src/shell/documents.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";
const OUT = `${ESC}[O`;
const IN = `${ESC}[I`;

const child = (id = "game"): ChildSurface => ({
  schema: "calcium.child-surface/1",
  id,
  keymap: [],
  render: () => [{ kind: "raw", id: "board", text: "BOARD" }],
  onAction: () => undefined,
});

const command = (line: string, failed = false) =>
  compose({
    command: line,
    blocks: [],
    ...(failed ? { status: "error" as const, error: { message: "boom" } } : {}),
    meta: { origin: "user" },
  });

async function graph(notify = true) {
  const h = await buildGraph({
    env: {
      TERM: "xterm-256color",
      LANG: "en_GB.UTF-8",
      TERM_PROGRAM: "WezTerm",
      ...(notify ? { CALCIUM_NOTIFY: "bell" } : {}),
    },
  });
  h.graph.lifecycle.acquire();
  const t = h.graph.transcript;
  /** The notices the ledger wrote: shell-origin entries whose head is its count. */
  const said = (): string[][] =>
    t.entries
      .filter((e) => e.doc.command === "" && /settled while/.test(String((e.doc.blocks[0] as { text?: string }).text)))
      .map((e) => e.doc.blocks.map((b) => String((b as { text?: string }).text)));
  const settle = (line: string, failed = false): { id: string; seq: number } => {
    const id = t.append(command(line, failed));
    return { id, seq: t.entries.find((e) => e.id === id)?.seq ?? -1 };
  };
  return { ...h, t, said, settle };
}

describe("C23 I84–I86 — the away ledger through the graph (ruling 51, R-BLK-314)", () => {
  it("T4.83 (C23 I84, I85, R-BLK-314): a detach says what settled while attached, and nothing when nothing did", async () => {
    const h = await graph(false);

    // **L2** — attach, nothing, detach: no entry at all.
    let before = h.t.entries.length;
    await h.graph.surface.open(child()).close();
    expect(h.t.entries.length, "only the child's own entry").toBe(before + 1);
    expect(h.said()).toEqual([]);

    // **L1** — one command settles while attached: one notice, after it.
    const handle = h.graph.surface.open(child());
    const x = h.settle("/pytest");
    before = h.t.entries.length;
    await handle.close();
    expect(h.t.entries.length, "one entry more").toBe(before + 1);
    const notice = h.t.entries.at(-1);
    expect(notice?.doc.command).toBe("");
    expect((notice?.doc.blocks[0] as { glyph?: string }).glyph).toBe("work-unit");
    expect(h.said()).toEqual([["1 entry settled while attached", `entry ${String(x.seq)}: /pytest — succeeded`]]);

    // **L3** — two, one failed: the count, and the failure first.
    const again = h.graph.surface.open(child());
    const ok = h.settle("/first");
    const bad = h.settle("/second", true);
    await again.close();
    expect(h.said().at(-1)).toEqual([
      "2 entries settled while attached",
      `entry ${String(bad.seq)}: /second — failed`,
      `entry ${String(ok.seq)}: /first — succeeded`,
    ]);
    h.graph.lifecycle.release();
  });

  it("T4.84 (C23 I84, I85, C16 I58): a return of focus says what settled while away, with the chord from the keymap", async () => {
    const h = await graph();
    const row = defaultKeymap.find((b) => b.target === "global" && b.action === "scrollBottom" && b.profile !== "enhanced-terminal");
    const chord = chordText(row?.key ?? { name: "?" }, h.graph.capabilities.unicode !== "ascii");
    expect(chord, "the keymap's row, spelled at this rung — the registry's `⌃end`").toBe("⌃end");

    // Two `ESC [ O` before the return are one absence (L4).
    h.stdin.emit(OUT);
    h.stdin.emit(OUT);
    const x = h.settle("/build");
    h.stdin.emit(IN);
    expect(h.said()).toEqual([
      [`1 entry settled while you were away · ${chord} to the bottom`, `entry ${String(x.seq)}: /build — succeeded`],
    ]);
    // A second return with no absence between says nothing.
    h.stdin.emit(IN);
    expect(h.said()).toHaveLength(1);
    // An absence in which nothing settled says nothing on return (L2's form).
    h.stdin.emit(OUT);
    h.stdin.emit(IN);
    expect(h.said()).toHaveLength(1);
    h.graph.lifecycle.release();

    // **With nothing opted in** the same bytes open no mark: `?1004h` was never
    // taken, so the report is not one the session asked for.
    const off = await graph(false);
    off.stdin.emit(OUT);
    off.settle("/build");
    off.stdin.emit(IN);
    expect(off.said()).toEqual([]);
    off.graph.lifecycle.release();

    // **And the return draws it, with no key behind it.** A batch holding only
    // the report routes nothing, so the frame is the return's own commit — the
    // graph above stubs `render`, which is why this half is a real session.
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const s = await buildSession(
        {
          stdin: stdin as never,
          env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", TERM_PROGRAM: "WezTerm", CALCIUM_NOTIFY: "bell" },
          manifest: {
            schema: "tui.manifest/1",
            binary: "prism",
            version: "1.0.0",
            tools: [{ name: "now", local: true, summary: "now", args: [], flags: [] }],
          },
          localHandlers: {
            now: async () => ({ schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "t", text: "done" }] }),
          },
        } as never,
        { columns: 80, rows: 24 },
      );
      const step = async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(20);
        for (let i = 0; i < 4; i += 1) await Promise.resolve();
      };
      stdin.emit(OUT);
      for (const ch of "/now\r") {
        stdin.emit(ch);
        await step();
      }
      const before = s.screen().rows.join("\n");
      expect(before, "the control: nothing said while away").not.toContain("settled while you were away");
      stdin.emit(IN);
      await step();
      expect(s.screen().rows.join("\n")).toContain("1 entry settled while you were away · ⌃end to the bottom");
      await s.tui.stop("exit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.85 (C23 I84, I86): overlapping marks report each settlement once, by the first to close", async () => {
    const h = await graph();
    // **L5** — attach, away, X, return, Y, detach.
    const handle = h.graph.surface.open(child());
    h.stdin.emit(OUT);
    const x = h.settle("/x");
    h.stdin.emit(IN);
    const y = h.settle("/y");
    await handle.close();
    expect(h.said()).toEqual([
      [`1 entry settled while you were away · ⌃end to the bottom`, `entry ${String(x.seq)}: /x — succeeded`],
      ["1 entry settled while attached", `entry ${String(y.seq)}: /y — succeeded`],
    ]);

    // **The reverse nesting** — away, attach, X, detach, return: the detach
    // reports X and the return has nothing left to say.
    const k = await graph();
    k.stdin.emit(OUT);
    const inner = k.graph.surface.open(child());
    const z = k.settle("/z");
    await inner.close();
    k.stdin.emit(IN);
    expect(k.said()).toEqual([["1 entry settled while attached", `entry ${String(z.seq)}: /z — succeeded`]]);
    h.graph.lifecycle.release();
    k.graph.lifecycle.release();
  });

  it("T4.86 (C23 I84): the child's entry and shell-origin notices are counted by no mark", async () => {
    const h = await graph();
    // **L11** — an away mark open across the attach: the child's entry is a
    // settled append with a command line, and it is still not a settlement.
    h.stdin.emit(OUT);
    const handle = h.graph.surface.open(child());
    // **L6** — the attached mark sees nothing of its own child either.
    // A shell-origin refusal settles inside both marks and is counted by neither.
    h.t.append(noticeDoc("", "no action is named `x`", "warn", { origin: "refresh" }));
    await handle.close();
    expect(h.said(), "the detach has nothing to say").toEqual([]);
    h.stdin.emit(IN);
    expect(h.said(), "and neither has the return").toEqual([]);

    // **L7** — the attached mark's own notice, appended while an away mark is
    // open, is not counted by it.
    const again = h.graph.surface.open(child());
    h.stdin.emit(OUT);
    const x = h.settle("/x");
    // The detach reports X first (C23 I86) and appends its notice inside the absence.
    await again.close();
    h.stdin.emit(IN);
    expect(h.said()).toEqual([["1 entry settled while attached", `entry ${String(x.seq)}: /x — succeeded`]]);
    h.graph.lifecycle.release();
  });

  it("T4.87 (C23 I84, I85): a settlement gone from the transcript is still counted, and a session close says nothing", async () => {
    const h = await graph(false);
    // **L8** — X settles and is gone before the detach: `/clear`'s store call.
    // C13's cap is a hundred thousand blocks, and the ledger's answer is the
    // same for both — it read the line at the settle and holds no reference.
    const handle = h.graph.surface.open(child());
    const x = h.settle("/x");
    h.t.clear();
    expect(h.t.entries.some((e) => e.id === x.id), "the entry is gone").toBe(false);
    await handle.close();
    expect(h.said()).toEqual([["1 entry settled while attached", `entry ${String(x.seq)}: /x — succeeded`]]);

    // **L9** — a session close: the settlement is recorded and nothing is said.
    h.graph.surface.open(child());
    h.settle("/y");
    const before = h.t.entries.length;
    await h.graph.surface.close("session");
    expect(h.t.entries.length, "no notice on a session close").toBe(before);
    h.graph.lifecycle.release();
  });
});
