// C22 §6u.2 — the new-messages button through a built session (I154, I155, §067).
//
// **Two halves, because the arrival and the frame are not reachable from one
// harness.** A far-side arrival is `transcript.append` on a built graph, which a
// painted `Session` does not expose; the reader's own submit is a painted
// session's. The count and the press are read on the graph, where an arrival
// that is not the reader's can be made, and the own-message exemption is read
// on a painted session, where a submit is real.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = String.fromCharCode(27);
const press = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;
const META = { exitCode: 0, durationMs: 1, argv: [], stderr: "", transport: "local", origin: "agent", verb: null, adapter: "none", truncated: false };
const note = (id: number): never =>
  ({
    schema: "tui.view/1",
    command: `/n${String(id)}`,
    status: "ok",
    blocks: [{ kind: "raw", id: `r${String(id)}`, text: `message ${String(id)}` }],
    meta: META,
  }) as never;

describe("C22 I154, I155 — the new-messages button", () => {
  it("T4.123 (C22 I154, I155): arrivals while scrolled up are counted, and a press on the button goes to the tail", async () => {
    const built = await buildGraph({}, { columns: 80, rows: 24 });
    built.graph.lifecycle.acquire();
    const { transcript, viewport, newBelow } = built.graph;
    // What `composeFrame` does each frame: the viewport is as tall as the region (I34).
    viewport.resize({ width: 80, height: 20 });
    for (let i = 0; i < 40; i += 1) transcript.append(note(i));
    expect(viewport.scroll.followTail, "at the tail after the appends").toBe(true);
    expect(newBelow.count(), "following: nothing is new").toBe(0);

    viewport.scrollBy(-15);
    expect(viewport.scroll.followTail, "scrolled up").toBe(false);
    expect(newBelow.count(), "scrolled up and nothing arrived").toBe(0);

    // A streaming entry has not arrived; its settle has.
    const running = transcript.append(note(100), { streaming: true });
    expect(newBelow.count(), "the running entry").toBe(0);
    transcript.settle(running);
    expect(newBelow.count(), "settled").toBe(1);
    transcript.append(note(101));
    expect(newBelow.count(), "a born-settled arrival").toBe(2);
    expect(viewport.scroll.followTail, "the anchor held: a new entry moved nobody").toBe(false);

    // The press: the region's last row (FRAME's region: top 1, height 20, so row 20), inside the button.
    // 1-based on the wire, and the button starts at column 2.
    built.stdin.emit(press(4, 21));
    built.stdin.emit(release(4, 21));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(viewport.scroll.followTail, "the press reached the tail").toBe(true);
    expect(newBelow.count(), "and the count went with it").toBe(0);
  });

  it("T4.123 (C22 I155): a press beside the button, or on another row, goes nowhere", async () => {
    const built = await buildGraph({}, { columns: 80, rows: 24 });
    built.graph.lifecycle.acquire();
    const { transcript, viewport, newBelow } = built.graph;
    // What `composeFrame` does each frame: the viewport is as tall as the region (I34).
    viewport.resize({ width: 80, height: 20 });
    for (let i = 0; i < 40; i += 1) transcript.append(note(i));
    viewport.scrollBy(-15);
    transcript.append(note(100));
    expect(newBelow.count()).toBe(1);

    for (const [col, row] of [[60, 21], [4, 10], [1, 21]] as const) {
      built.stdin.emit(press(col, row));
      built.stdin.emit(release(col, row));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    }
    expect(viewport.scroll.followTail, "no press off the button moved the reader").toBe(false);
    expect(newBelow.count(), "and the count stands").toBe(1);
  });

  it("T4.123 (C22 I154, ruling c): the reader's own submit while scrolled up is not new to them", async () => {
    const stdin = fakeStdin();
    const manifest: NonNullable<TuiConfig["manifest"]> = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [{ name: "say", local: true, summary: "one line", args: [], flags: [] }],
    };
    const lines = Array.from({ length: 60 }, (_, i) => ({ kind: "raw", id: `l${String(i)}`, text: `line ${String(i)}` }));
    const session = await buildSession(
      {
        manifest,
        stdin: stdin as never,
        localHandlers: {
          say: () => ({ schema: "tui.view/1", command: "say", status: "ok", blocks: lines }) as never,
        },
      },
      { columns: 80, rows: 24 },
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    await type("/say\r");
    await type(`${ESC}[5~`);
    await type(`${ESC}[5~`);
    expect(session.screen().rows.join("\n"), "scrolled away from the tail").not.toContain("line 59");
    await type("/say\r");
    expect(session.screen().rows.join("\n"), "no button for a message the reader sent").not.toMatch(/new message/u);
  });
});
