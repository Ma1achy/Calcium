// C23 §7g — a question's life at the edges: a held key across the promotion,
// the session stopping over a queue, and a withdrawal in the middle of a reply.
import { describe, expect, it } from "vitest";

import { createConfirmHost } from "../../src/shell/confirm.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import type { AskAnswer } from "../../src/shell/local/registry.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const YES_NO = [
  { key: "y", label: "yes" },
  { key: "n", label: "no", default: true as const },
];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

describe("C23 §7g — a question's life at the edges", () => {
  it("T3.81 (C23 I91, C16 I44): a held enter repeating across the first answer does not answer the second question", async () => {
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();
    const answers: AskAnswer[] = [];
    void graph.confirm.ask({ question: "First?", choices: YES_NO }).then((a) => answers.push(a));
    const second = graph.confirm.ask({ question: "Second?", choices: YES_NO });
    void second.then((a) => answers.push(a));

    // The reader pauses, then holds `⏎`: the first press answers the first.
    clock.advance(1_000);
    stdin.emit("\r");
    await flush();
    expect(answers, "the first is answered").toEqual([{ key: "n", outcome: "answered" }]);
    expect(JSON.stringify(graph.overlays.top?.content), "the second is up").toContain("Second?");

    // The repeat, 33 ms later, meets a question that has just arrived.
    for (let i = 0; i < 5; i += 1) {
      clock.advance(33);
      stdin.emit("\r");
      await flush();
    }
    expect(answers, "the repeat did not answer the second").toHaveLength(1);
    expect(graph.confirm.open).toBe(true);

    // After a pause the reader's own key answers it — the control.
    clock.advance(1_000);
    stdin.emit("y");
    await flush();
    expect(answers).toEqual([
      { key: "n", outcome: "answered" },
      { key: "y", outcome: "answered" },
    ]);
  });

  it("T3.82 (C23 I92): the session stops with one question open and one waiting, and both resolve cancelled before teardown", async () => {
    const stdin = fakeStdin();
    let asked: Promise<unknown> | null = null;
    const s = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "q", local: true, summary: "ask", args: [], flags: [] }],
        },
        localHandlers: {
          q: async (_argv: unknown, ctx: { ask: (o: unknown) => Promise<unknown> }) => {
            asked = Promise.all([
              ctx.ask({ question: "Open?", choices: YES_NO }),
              ctx.ask({ question: "Waiting?", choices: YES_NO }),
            ]);
            await asked;
            return { schema: "tui.view/1", status: "ok", blocks: [] };
          },
        },
      } as never,
      { columns: 80, rows: 30 },
    );
    for (const ch of "/q\r") {
      stdin.emit(ch);
      await flush();
    }
    expect(asked, "the verb asked").not.toBeNull();
    let resolved: unknown = null;
    void asked!.then((a) => (resolved = a));

    // `stop` returns with the session already stopped (C28 I17); the questions
    // were resolved in its synchronous prefix, before the release.
    const stopping = s.tui.stop("exit");
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved, "both resolved, each with its default").toEqual([
      { key: "n", outcome: "cancelled" },
      { key: "n", outcome: "cancelled" },
    ]);
    await stopping;
  });

  it("T3.83 (C23 I92): a question cancelled mid-reply restores the held draft before it resolves", async () => {
    const overlays = createOverlayManager({ registry: { measureSequence: (b) => b.length } }); // cells-ok — a row count
    const order: string[] = [];
    let line = "the reader's line";
    let held: string | null = null;
    const confirm = createConfirmHost({
      overlays,
      anchor: () => ({ row: 20, rows: 1 }),
      draft: () => line,
      holdDraft: () => {
        held = line;
        line = "";
      },
      restoreDraft: () => {
        order.push(`restore:${held ?? ""}`);
        line = held ?? "";
        held = null;
      },
      announce: { asked: () => undefined, answered: (label) => order.push(`answered:${label}`) },
      overlayRegion: () => ({ width: 80, height: 24 }),
      invalidate: () => undefined,
    });
    const gone = new AbortController();
    const answer = confirm.ask({
      question: "Why?",
      choices: [...YES_NO, { key: "r", label: "reply…", reply: true }],
      signal: gone.signal,
    });
    void answer.then(() => order.push("resolved"));
    confirm.answerHandler()?.({ kind: "key", key: { name: "r" } } as InputEvent);
    line = "half a reply";

    gone.abort();
    await answer;
    expect(order, "the line comes back, then the answer is said, then it resolves").toEqual([
      "restore:the reader's line",
      "answered:cancelled",
      "resolved",
    ]);
    expect(line).toBe("the reader's line");
    await expect(answer).resolves.toEqual({ key: "n", outcome: "cancelled" });
  });
});
