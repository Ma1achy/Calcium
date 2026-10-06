// C16 I38 superseded by §6c — a reserved row passes through, and the borrowed
// editors read the same effective action (→ C22 I134, C24 I39). Through a built
// graph, because every claim here is about which owner a key reaches.
//
// **Bytes into stdin.** `⌥⌫` is `ESC DEL`; a row built from a `Key` would skip
// the decoder, and the reservation is a claim about a key a terminal sends.
//
// Fail-on-revert, each naming the change:
//
//   - `bound()` running `keys.table[binding.action]` for a reserved row again —
//     the no-op, handler or not (T6.45) → T1.38 fails: `git status` survives
//     `⌥⌫`, and the registered handler is never called.
//   - The typed reply's check reading `binding.action` instead of the effective
//     action (T6.49) → T4.88 fails on the reply: `queueDrop` is not in
//     `REPLY_ACTIONS`, so I8 rejects the key and the word stays.
//   - The `try` around the handler removed → T1.38c fails: the throw reaches
//     the read loop, which has no `catch`.
//   - The notice put back to `warn` on an `ok` document (ruling 93) → T1.38c
//     fails on its tone, mark and status.
import { describe, expect, it, vi } from "vitest";

import { buildGraph } from "../support/session.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = "\u001b";
const ALT_BACKSPACE = `${ESC}\u007f`;
const ALT_1 = `${ESC}1`;
const DOWN = `${ESC}[B`;
const F1 = `${ESC}OP`;

/** The last `/help keys` entry's rows, across its scopes. */
const helpRows = (graph: Awaited<ReturnType<typeof buildGraph>>["graph"]) =>
  (graph.transcript.entries.filter((e) => e.doc.command === "/help keys").at(-1)?.doc.blocks ?? [])
    .flatMap((b) => (b.kind === "keyValue" ? (b as { rows: readonly { label: string; value: string }[] }).rows : []))
    .map((r) => ({ label: r.label, value: r.value }));

const REPLYABLE = [
  { key: "n", label: "no", default: true as const },
  { key: "r", label: "reply…", reply: true as const },
];

const FORM = {
  kind: "form",
  id: "f",
  fields: [
    { id: "name", label: "name", value: "prism-serve" },
    { id: "port", label: "port", value: "80" },
  ],
  buttons: [{ id: "cancel", label: "cancel" }],
};

async function world(keyActions?: TuiConfig["keyActions"]) {
  const built = await buildGraph(keyActions === undefined ? {} : { keyActions });
  built.graph.lifecycle.acquire();
  const type = async (bytes: string): Promise<void> => {
    built.stdin.emit(bytes);
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  return { ...built, type };
}

describe("C16 §6c — reserved actions pass through (review batch 2, M6 item 1)", () => {
  it("T1.38 (C16 I38, C22 I134, C24 I39): ⌥⌫ kills a word with no handler, calls a registered handler once, and falls back when it returns false; ⌥1 with no handler is dropped", async () => {
    {
      const w = await world();
      await w.type("git status");
      await w.type(ALT_BACKSPACE);
      expect(w.graph.editor.text, "no handler: the row's fallback, `killWordLeft`").toBe("git ");
      // **`/help keys` lists what the key does, not what the row is named**
      // (C22 I134): the fallback where there is one, and nothing where there
      // is none.
      await w.type(F1);
      const listed = helpRows(w.graph);
      expect(listed, "⌥⌫ is listed as the word kill it is").toContainEqual({ label: "⌥⌫", value: "killWordLeft" });
      expect(listed.map((r) => r.value), "no reserved action is listed without a handler").not.toContain("queueDrop");
      expect(listed.map((r) => r.value)).not.toContain("agent1");
    }
    {
      const drop = vi.fn(() => undefined);
      const w = await world({ "queue.drop": drop });
      await w.type("git status");
      await w.type(ALT_BACKSPACE);
      expect(drop, "the handler, once").toHaveBeenCalledTimes(1);
      expect(w.graph.editor.text, "and the key is spent: the line is unchanged").toBe("git status");
      await w.type(F1);
      expect(helpRows(w.graph), "with a handler, `/help keys` lists the reserved action").toContainEqual({
        label: "⌥⌫",
        value: "queueDrop",
      });
    }
    {
      const declined = vi.fn(() => false);
      const w = await world({ "queue.drop": declined });
      await w.type("git status");
      await w.type(ALT_BACKSPACE);
      expect(declined, "asked").toHaveBeenCalledTimes(1);
      expect(w.graph.editor.text, "`false` is not handled: the fallback runs").toBe("git ");
    }
    {
      const w = await world();
      await w.type(ALT_1);
      expect(w.graph.router.lastStages.at(-1), "`⌥1` with no handler reaches no owner").toBe("dropped");
      expect(w.graph.editor.text, "and types nothing").toBe("");
    }
    {
      const jump = vi.fn(() => undefined);
      const w = await world({ "agent.1": jump });
      await w.type(ALT_1);
      expect(jump, "with one, the handler").toHaveBeenCalledTimes(1);
    }
  });

  it("T1.38b (C24 I39): a keyActions id outside the reserved set throws at construction and names the reserved ids", async () => {
    await expect(buildGraph({ keyActions: { copy: () => undefined } as never })).rejects.toThrow(
      /keyActions.*copy.*queue\.drop/su,
    );
    // The control: a reserved id constructs.
    await expect(buildGraph({ keyActions: { "queue.drop": () => undefined } })).resolves.toBeDefined();
  });

  it("T1.38c (C22 I134, ruling 93): a handler that throws leaves the session running, spends the key and appends one error notice", async () => {
    const w = await world({
      "queue.drop": () => {
        throw new Error("the queue is on fire");
      },
    });
    await w.type("git status");
    const before = w.graph.transcript.entries.length;
    await w.type(ALT_BACKSPACE);
    expect(w.graph.editor.text, "the key is spent: no fallback ran").toBe("git status");
    const added = w.graph.transcript.entries.slice(before);
    expect(added, "one notice").toHaveLength(1);
    const said = JSON.stringify(added[0]?.doc.blocks ?? []);
    expect(said, "naming the action").toContain("queue.drop");
    expect(said, "and the cause").toContain("the queue is on fire");
    // **A notice that reports a failure is a failure** (ruling 93, F1481): tone,
    // mark and status read together, because it was a warning with ▲ on an `ok`
    // document — consistent with itself and not with the word *failed*.
    const notice = added[0]?.doc.blocks[0] as { tone?: string; glyph?: string } | undefined;
    expect(
      `${String(notice?.tone)} ${String(notice?.glyph)} ${String(added[0]?.doc.status)}`,
      "as a failure: error tone, the error mark, an error document",
    ).toBe("error error error");
    // Still running: the next key is typed.
    await w.type("!");
    expect(w.graph.editor.text).toBe("git status!");
  });

  it("T4.88 (C16 I38): with no handler ⌥⌫ deletes a word in a typed reply and in a form field", async () => {
    {
      const w = await world();
      void w.graph.confirm.ask({ question: "why?", choices: REPLYABLE });
      await new Promise((r) => setTimeout(r, 0));
      // A neutral `→` ends the arrival guard (C16 I44, I69), so `r` answers.
      await w.type("\u001b[C");
      await w.type("r");
      expect(w.graph.confirm.replacing, "reply… chosen").toBeNull();
      await w.type("fix the bug");
      await w.type(ALT_BACKSPACE);
      expect(w.graph.editor.text, "the reply's last word goes").toBe("fix the ");
      expect(w.graph.confirm.open, "and the question is still open").toBe(true);
    }
    {
      const w = await world();
      w.graph.transcript.append(
        {
          schema: "tui.view/1", command: "/form", status: "ok", blocks: [FORM],
          meta: {
            verb: "form", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false,
            argv: [], stderr: "", transport: "local", origin: "user",
          },
        } as never,
        { streaming: true },
      );
      await w.type(DOWN);
      await w.type(DOWN);
      await w.type("\r");
      expect(w.graph.editor.text, "editing `port`").toBe("80");
      await w.type(" 90");
      await w.type(ALT_BACKSPACE);
      expect(w.graph.editor.text, "the field's last word goes").toBe("80 ");
    }
  });
});
