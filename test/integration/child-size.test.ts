// C24 I41, C22 I110, C14 I56 — the child is told the room inside its entry, and
// the entry stays whole while it is attached (review batch 3, M9 items 2 and 3).
//
// **Read from the frame.** The defect these rows were written against was
// arithmetically self-consistent — the context, the entry's measure and the
// viewport all agreed — and the frame showed rows 2–12 of 13 with every one
// cut short. So each row reads the screen, and finds its rows by content.
import { describe, expect, it, vi } from "vitest";

import type { ChildSurface } from "../../src/index.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const ESC = "\u001b";

/** A child that fills exactly what it is told: numbered rows, each `width` cells. */
function filling(id: string, seen: Array<{ width: number; height: number }>): ChildSurface {
  return {
    schema: "calcium.child-surface/1",
    id,
    keymap: [],
    render: (ctx) => {
      seen.push({ width: ctx.width, height: ctx.height });
      const rows = Array.from({ length: ctx.height }, (_, i) => {
        const label = `R${String(i).padStart(2, "0")}`;
        return label + "x".repeat(Math.max(0, ctx.width - label.length - 1)) + "|";
      });
      return [{ kind: "raw", id: "board", text: rows.join("\n") }];
    },
    onAction: () => undefined,
  };
}

const wait = (ms: number) => async () => {
  await new Promise((r) => setTimeout(r, ms));
  return { schema: "tui.view/1", status: "ok", blocks: [{ kind: "tip", id: "t", text: "done" }] };
};

async function session(size: { columns: number; rows: number }, notify = false) {
  vi.useFakeTimers();
  const stdin = fakeStdin();
  const s = await buildSession(
    {
      stdin: stdin as never,
      env: {
        TERM: "xterm-256color",
        LANG: "en_GB.UTF-8",
        TERM_PROGRAM: "WezTerm",
        ...(notify ? { CALCIUM_NOTIFY: "bell" } : {}),
      },
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "slow", local: true, summary: "slow", args: [], flags: [] }],
      },
      localHandlers: { slow: wait(5_000) },
    } as never,
    size,
  );
  const step = async (ms = 0): Promise<void> => {
    s.clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const send = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await step();
  };
  await step();
  return { ...s, step, send };
}

/** The screen's rows, for a failure message a reader can see the frame in. */
const shown = (rows: readonly string[]): string => rows.map((r, i) => `${String(i).padStart(2)}|${r}|`).join("\n");

describe("C24 I41 — the child is told the room inside its entry (M9 item 2)", () => {
  it("T4.94c (C22 I110, C24 I41, C14 I56): a full-size child's frame shows both borders and every body row", async () => {
    const s = await session({ columns: 60, rows: 20 });
    const seen: Array<{ width: number; height: number }> = [];
    const handle = s.tui.openSurface(filling("game", seen));
    await s.step(20);
    const rows = s.screen().rows;
    const frame = shown(rows);
    const { width, height } = seen.at(-1) ?? { width: 0, height: 0 };

    // The entry, top to bottom, and each row found by what it holds.
    const command = rows.findIndex((r) => r.includes("child game"));
    const top = rows.findIndex((r) => r.trimStart().startsWith("┌"));
    const bottom = rows.findIndex((r) => r.includes("host escape"));
    expect(command, `the command row is on screen\n${frame}`).toBeGreaterThanOrEqual(0);
    expect(top, `the top border follows it\n${frame}`).toBe(command + 1);
    for (let i = 0; i < height; i += 1) {
      const label = `R${String(i).padStart(2, "0")}`;
      const row = rows[top + 1 + i] ?? "";
      // **Untruncated**: the row's own last cell, `|`, is drawn — a row cut to
      // the rails ends in `…` instead.
      expect(row, `body row ${label} whole, in place\n${frame}`).toContain(`${label}${"x".repeat(width - label.length - 1)}|`);
    }
    expect(bottom, `the bottom border closes the body\n${frame}`).toBe(top + 1 + height);
    expect(rows[bottom + 1]?.trim(), "and the entry's closing blank is drawn").toBe("");
    // The region: the header and its rule above, the prompt's upper rule below.
    // The entry — command, borders, body and blank — is the region exactly.
    const regionTop = 2;
    const regionRows = rows.findIndex((r, i) => i > bottom && r.startsWith("─")) - regionTop;
    expect(command, "the entry starts on the region's first row").toBe(regionTop);
    expect(bottom + 2 - command, "measure == rows drawn == the region").toBe(regionRows);

    // **The detach's frame** (C22 I110): an application's own close has no
    // key behind it, so the frame the close commits is the one the reader sees.
    await handle.close();
    await s.step(20);
    const after = s.screen().rows;
    expect(after.join("\n"), `the owner line stops saying attached\n${shown(after)}`).not.toContain("keys → child");
    await s.tui.stop("exit");
    vi.useRealTimers();
  });

  it("T4.22 (C24 I41, C22 I110): SurfaceContext is the panel interior less the entry's chrome, re-read on resize", async () => {
    const s = await session({ columns: 60, rows: 20 });
    const seen: Array<{ width: number; height: number }> = [];
    const handle = s.tui.openSurface(filling("game", seen));
    await s.step(20);
    // 60 columns less the content margin is a 59-cell region; 20 rows less the
    // header, two rules, the prompt and the two-row footer is 13. Inside: the
    // panel's rails take 2 cells, and the command row, two borders and the
    // closing blank take 4 rows.
    expect(seen.at(-1)).toEqual({ width: 57, height: 9 });

    s.resize({ columns: 80, rows: 24 });
    await s.step(20);
    expect(seen.at(-1), "re-rendered at the new interior").toEqual({ width: 77, height: 13 });
    await handle.close();
    await s.tui.stop("exit");

    // **A command row that wraps takes a row more**: the id is part of what the
    // room is less, because the entry's command line is `child <id>`.
    const w = await session({ columns: 60, rows: 20 });
    const long: Array<{ width: number; height: number }> = [];
    const id = "a-surface-id-long-enough-that-its-command-row-must-wrap";
    const other = w.tui.openSurface(filling(id, long));
    await w.step(20);
    expect(long.at(-1)).toEqual({ width: 57, height: 8 });
    const rows = w.screen().rows;
    expect(rows.findIndex((r) => r.includes("R07")), `the last body row is on screen\n${shown(rows)}`).toBeGreaterThan(0);
    expect(rows.some((r) => r.trimStart().startsWith("┌")), "and so is the top border").toBe(true);
    await other.close();
    await w.tui.stop("exit");
    vi.useRealTimers();
  });

  it("T4.38 (C14 I56, C22 I110, C24 I41): an entry appended under a full-size child leaves it whole, and the detach gives back the tail", async () => {
    const s = await session({ columns: 60, rows: 20 }, true);
    // A command running before the attach, so it settles while the child holds
    // the keyboard — and the reader away, so the return appends under it.
    for (const ch of "/slow\r") await s.send(ch);
    const seen: Array<{ width: number; height: number }> = [];
    const handle = s.tui.openSurface(filling("game", seen));
    await s.step(20);
    await s.send(`${ESC}[O`);
    await s.step(5_000);
    await s.send(`${ESC}[I`);
    await s.step(20);

    const rows = s.screen().rows;
    const frame = shown(rows);
    expect(rows.some((r) => r.includes("child game")), `the command row stays\n${frame}`).toBe(true);
    expect(rows.some((r) => r.trimStart().startsWith("┌")), `the top border stays\n${frame}`).toBe(true);
    const { height } = seen.at(-1) ?? { height: 0 };
    for (let i = 0; i < height; i += 1) {
      const label = `R${String(i).padStart(2, "0")}`;
      expect(rows.some((r) => r.includes(label)), `body row ${label} stays\n${frame}`).toBe(true);
    }
    expect(rows.some((r) => r.includes("host escape")), `the bottom border stays\n${frame}`).toBe(true);
    // **The control**: something was appended under it, or the row above is
    // satisfied by a transcript that never grew.
    expect(frame, "the return's notice is below, off the screen").not.toContain("while you were away");

    await handle.close();
    await s.step(20);
    const after = shown(s.screen().rows);
    expect(after, `the release reaches the tail\n${after}`).toContain("1 entry settled while you were away");
    await s.tui.stop("exit");
    vi.useRealTimers();
  });
});
