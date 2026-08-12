// C24 §5 / C23 §3c — sharing, and the pause, from the public entry.
//
// **These three rows exist because the unit suite cannot see what a consumer
// sees.** The first implementation of the cadence refusal *threw*, which every
// driver-level row could assert and no app author would ever meet: the throw
// lands in `appendAndCommit`'s deliberate bare catch with the entry already
// appended, so the frame shows two panels at `◌ loading` for the life of the
// session. A row here is what said so.
import { describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";

const settle = async (turns = 4): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};

const greetingOf = (blocks: ViewDocument["blocks"]): ViewDocument => ({
  schema: "tui.view/1",
  command: "/live",
  status: "ok",
  blocks,
  // All ten fields. Six is a document C04 refuses, and the refusal is swallowed
  // twice on the way out — the session then starts, draws its prompt and shows
  // nothing (F135). A fixture that fails this way reports every claim below as
  // satisfied.
  meta: {
    verb: "live",
    adapter: "live",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: ["live"],
    stderr: "",
    transport: "local",
    origin: "refresh",
  },
});

describe("C24 §5 — one poll behind several parts, from the public entry", () => {
  it("T4.4a (C24 I27, C23 I44): two parts naming one key read one sample", async () => {
    const build = async (share: boolean) => {
      let polls = 0;
      const part = (id: string) =>
        b.live({
          id,
          title: id,
          every: 20,
          ...(share ? { source: "stats" } : {}),
          fetch: () => {
            polls += 1;
            return Promise.resolve(polls);
          },
          render: (data) => b.raw(`sample ${String(data)}`, { id: `${id}-c` }),
          renderLoading: () => b.raw("sample -", { id: `${id}-c` }),
        });
      const s = await buildSession(
        {
          stdin: fakeStdin() as never,
          greeting: () => greetingOf([part("alpha"), part("beta")]),
        },
        { columns: 90, rows: 24 },
      );
      await settle();
      // **Two clocks, and both have to move.** `buildSession` injects a frozen
      // clock and a real `schedule`, so a timer fires on wall time and `dueAt` is
      // compared against a number that never advances — one poll, and then
      // nothing. A first draft waited 120 ms of real time and reported the
      // control as having polled once, which is the fixture not responding to the
      // thing under test.
      for (let i = 0; i < 4; i += 1) {
        s.clock.advance(50);
        await new Promise((r) => setTimeout(r, 30));
        await settle();
      }
      const samples = s.screen()
        .rows.flatMap((r) => {
          const m = /sample (\S+)/.exec(r);
          return m === null ? [] : [m[1]];
        });
      await s.tui.stop("exit");
      return { samples, polls };
    };

    // **The control is the same pair without the key.** Two polls, two values —
    // and the two values *are* the defect F91 was filed on, so a fixture that
    // cannot produce them asserts nothing about the fixture that does not.
    const own = await build(false);
    expect(own.samples, "the control: two panels, two samples of one instant").toHaveLength(2);
    expect(own.samples[0], "and they disagree").not.toBe(own.samples[1]);

    const shared = await build(true);
    expect(shared.samples, "two panels").toHaveLength(2);
    expect(shared.samples[0], "one sample").toBe(shared.samples[1]);
    expect(shared.polls, "and half the polls").toBeLessThan(own.polls);
  });

  it("T3.13 (C24 I27): a conflicting cadence is said in the losing panel", async () => {
    const part = (id: string, every: number) =>
      b.live({
        id,
        title: id,
        every,
        source: "same",
        fetch: () => Promise.resolve(1),
        render: () => b.raw(id, { id: `${id}-c` }),
        renderLoading: () => b.raw("loading", { id: `${id}-c` }),
      });
    const s = await buildSession(
      {
        stdin: fakeStdin() as never,
        greeting: () => greetingOf([part("a", 20), part("b", 200)]),
      },
      { columns: 110, rows: 24 },
    );
    await settle();
    for (let i = 0; i < 3; i += 1) {
      s.clock.advance(50);
      await new Promise((r) => setTimeout(r, 30));
      await settle();
    }

    const text = s.screen().rows.join(" ");
    // Both ids and both values, on the screen. **Not an exception** — the row
    // that asserted one passed against a session showing nothing at all.
    expect(text, "the losing part names both declarations").toMatch(
      /"a" says 20ms and "b" says 200ms/,
    );
    // And the winner is running rather than stuck beside it, which is what
    // separates a refusal from a construction failure.
    expect(text, "the part that kept its cadence ticks").toContain("a");
    expect(text, "and nothing is left at the loading placeholder").not.toContain("loading");
    await s.tui.stop("exit");
  });
});
