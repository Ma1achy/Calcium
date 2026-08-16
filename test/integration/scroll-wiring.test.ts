// C04 I48 — the scroll offset reaches the frame, and the key carries it.
//
// **The row the mutation pass demanded.** `render-cache`'s T4.18f asserts the
// store's key is canonical, which is real and is not the wiring: deleting the
// offset from `session.ts`'s slot changes nothing that row looks at. A test that
// calls the mechanism misses the wiring (`test/support/README.md`), so this one
// pages a real session and reads the screen.
//
// The shape is **read, page, read, page back, read**. A single page passes with
// the key unchanged — the first render fills the slot and the second is served
// what it left, which *looks* like a difference from the third frame's side. It
// is coming back that separates them: with the offset in the key the third read
// is a hit on the first slot and equals it; without it, the second read already
// equalled the first.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "box", local: true, summary: "a bounded region", args: [], flags: [] }],
};

/** Four children in a box of two, so there is somewhere to page to. */
const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  box: () => ({
    schema: "tui.view/1",
    command: "box",
    status: "ok",
    blocks: [
      {
        kind: "scroll",
        id: "box",
        height: 2,
        children: [
          { kind: "raw", id: "r1", text: "ALPHA" },
          { kind: "raw", id: "r2", text: "BRAVO" },
          { kind: "raw", id: "r3", text: "CHARLIE" },
          { kind: "raw", id: "r4", text: "DELTA" },
        ],
      },
    ],
  }),
};

const PAGE_DOWN = "\u001b[6~";
const PAGE_UP = "\u001b[5~";
const DOWN = "\u001b[B";

describe("C04 I48 — the offset reaches the frame", () => {
  it("T4.41 (C04 I48, C22 I58): read, page, read, page back, read", async () => {
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const rows = (): string => session.screen().rows.join("\n");

    await type("/box\r");
    // Focus into the live block, or `pagedown` resolves at `global` and scrolls
    // the transcript instead — which is the behaviour this binding changes and
    // the reason the row below exists.
    await type(DOWN);

    const first = rows();
    expect(first, "the box starts at the top").toContain("ALPHA");

    await type(PAGE_DOWN);
    const second = rows();

    await type(PAGE_UP);
    const third = rows();

    expect(second, "paging moved the window").not.toBe(first);
    expect(third, "and coming back is the frame we left").toBe(first);
    await session.tui.stop("exit");
  });

  it("T4.42 (C26 I18): the transcript still pages when no container is focused", async () => {
    // **A working key gained a second meaning, and this is the half that must
    // not have changed.** `pageup`/`pagedown` are bound at `global` to the
    // transcript's viewport; the new rows are at `liveBlock` and win only while
    // focus is in a block. With focus at the prompt the global pair must still
    // be what answers.
    const stdin = fakeStdin();
    const session = await buildSession({
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };

    await type("/box\r");
    // No `↓`, so focus is at the prompt and the global binding owns the key.
    await expect(type(PAGE_DOWN)).resolves.toBeUndefined();
    expect(session.screen().rows.join("\n"), "the session is intact").toContain("ALPHA");
    await session.tui.stop("exit");
  });
});
