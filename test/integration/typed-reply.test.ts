// C16 I54, C17 I29, C23 I77 — the typed reply, driven through a built session
// (§052, R-QST-003).
//
// **Every key goes through `graph.router.dispatch`.** C23 T1.69 asserts the
// same transitions against a world that hands each key to the editor itself,
// and it stayed green for the whole time a built session rejected every letter
// typed into a reply — `lastStages` reading `target:overlay, modal-blocked,
// reject` — because the route it assumed was never the router's to have. A row
// that calls the mechanism verifies the mechanism; these verify the wiring.
//
// Fail-on-revert, each naming the change:
//
//   - Deleting the question rung's forward in `construct.ts` → T4.80 fails on
//     its first letter, and T4.71 on the line it types.
//   - `hold` written as `snapshot` + `setText("")` (C17 I29) → T4.71's `⌃z`
//     inside the reply produces `mine`.
//   - `historyPrev` reading the prompt's history while composing → T4.71's `↑`
//     shows `npm test`.
//   - `historyNext`'s floor entering the live block while composing → T4.71's
//     focus assertion, and the control above it still passes.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { MENU_ID } from "../../src/interaction/completion/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import type { Graph } from "../../src/shell/construct.js";

const press = (name: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}): InputEvent => ({
  kind: "key",
  key: {
    name,
    ctrl: mods.ctrl ?? false,
    meta: mods.meta ?? false,
    shift: mods.shift ?? false,
    // The decoder's sequence for a space is the character, not its name.
    sequence: name === "space" ? " " : name,
  },
});

const REPLYABLE = [
  { key: "n", label: "no", default: true as const },
  { key: "r", label: "reply…", reply: true as const },
];

/** A streaming entry with a focusable table, so `↓` at the prompt has somewhere to go. */
function withLiveTable(graph: Graph): void {
  graph.transcript.append(
    {
      schema: "tui.view/1",
      command: "/ps",
      status: "ok",
      blocks: [
        {
          kind: "table",
          id: "t",
          columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 4, sortable: false }],
          rows: [
            { id: "r1", cells: { name: { text: "api" } } },
            { id: "r2", cells: { name: { text: "worker" } } },
          ],
        },
      ],
      meta: {
        verb: "ps", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false,
        argv: [], stderr: "", transport: "local", origin: "user",
      },
    } as never,
    { streaming: true },
  );
}

async function session(): Promise<{ graph: Graph; send: (e: InputEvent) => boolean; type: (s: string) => void }> {
  const { graph } = await buildGraph();
  graph.lifecycle.acquire();
  const send = (e: InputEvent): boolean => graph.router.dispatch(e);
  const type = (s: string): void => {
    for (const ch of s) send(press(ch === " " ? "space" : ch));
  };
  return { graph, send, type };
}

/**
 * Raise a question and choose `reply…`.
 *
 * **Until it floats, and at most twice, because the first may be the arm's**
 * (C16 I44, R-OWN-002): a newly raised owner refuses its first activation. A
 * probe that pressed once spent that press on the arm, read the line
 * unchanged, and looked like a reply that never opened; one that pressed
 * twice unconditionally would type the second `r` into the reply.
 */
async function reply(
  graph: Graph,
  send: (e: InputEvent) => boolean,
): Promise<Readonly<{ answer: Promise<unknown> }>> {
  const answer = graph.confirm.ask({ question: "what should the commit message say?", choices: REPLYABLE });
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 2 && graph.confirm.replacing !== null; i += 1) send(press("r"));
  expect(graph.confirm.replacing, "reply… chosen: the question floats").toBeNull();
  expect(graph.confirm.open, "and it is still open").toBe(true);
  // **Wrapped, because an `async` function returning a promise adopts it**:
  // `await reply()` would wait for the question to be answered, which is what
  // the caller has not done yet.
  return { answer };
}

describe("§052 — a question that wants a sentence, through the router", () => {
  it("T4.80 (C16 I54, I8, §052): letters typed into a reply reach the line through the prompt rung, and the answer carries them", async () => {
    const { graph, send, type } = await session();

    // **The control first: before `reply…`, typing is unrelated** (§103). The
    // question replaces the prompt and a letter is refused out loud.
    const answer = graph.confirm.ask({ question: "what should the commit message say?", choices: REPLYABLE });
    await new Promise((r) => setTimeout(r, 0));
    // Consumed by the question's own arm — *consumed, and nothing happens* —
    // so the claim is about the line, not about which stage said no.
    send(press("x"));
    send(press("q"));
    expect(graph.editor.text, "a letter at a replacing question reaches no line").toBe("");

    // The arm may or may not still be set after two unrelated letters, so
    // `reply…` is pressed until the question floats — at most twice.
    for (let i = 0; i < 2 && graph.confirm.replacing !== null; i += 1) send(press("r"));
    expect(graph.confirm.replacing, "reply… chosen").toBeNull();
    expect(graph.editor.text, "and the borrow starts empty").toBe("");

    // **Completion is the prompt's, not the borrowed editor's** (C16 I54). A
    // token C19 *does* complete, because `fix` completes to nothing and a row
    // typing it cannot see a menu or a ghost appear: `/` opens the menu at the
    // prompt, and `/hel` ghosts to `/help` — both shown at the prompt below.
    type("/");
    expect(graph.overlays.stack.map((l) => l.id), "typing `/` into a reply opens no menu").not.toContain(MENU_ID);
    type("hel");
    send(press("right"));
    expect(graph.editor.text, "`→` in a reply is a motion, and accepts no command ghost").toBe("/hel");
    for (let i = 0; i < 4; i += 1) send(press("backspace"));
    expect(graph.editor.text).toBe("");

    type("fix the parser");
    expect(graph.router.lastStages, "a letter in a reply is never refused").not.toContain("modal-blocked");
    expect(graph.editor.text, "the line holds what was typed").toBe("fix the parser");

    // **The editor's keys come with it** (§052: *⌥← word move are shared*).
    send(press("backspace"));
    send(press("left", { meta: true }));
    type("really ");
    expect(graph.editor.text).toBe("fix the really parse");

    // **And what is not the editor's does not** (C16 I54): typing opens no
    // completion menu, and `⇥` raises none either.
    send(press("tab"));
    const ids = graph.overlays.stack.map((l) => l.id);
    expect(ids, "no menu over the question").not.toContain(MENU_ID);

    // **`⇧⏎` and `⌥⏎` are the line's, not the question's** — §052's footer is
    // `⏎ submit   ⇧⏎ newline`. A reply that read any `enter` as the answer
    // would submit half a message on the key that asks for a second line.
    send(press("end"));
    send(press("enter", { meta: true }));
    expect(graph.confirm.open, "⌥⏎ does not answer").toBe(true);
    type("x");
    expect(graph.editor.text, "it breaks the line").toBe("fix the really parse\nx");
    send(press("backspace"));
    send(press("backspace"));

    send(press("enter"));
    await expect(answer, "the answer carries the line").resolves.toEqual({ key: "r", text: "fix the really parse" });

    // **The control: the same keys at the prompt do complete**, so the two
    // assertions above are about the owner and not about a fixture C19 has
    // nothing to say about.
    graph.editor.clear();
    type("/");
    expect(graph.overlays.stack.map((l) => l.id), "`/` at the prompt opens the menu").toContain(MENU_ID);
    while (graph.overlays.top !== null) graph.overlays.dismiss(graph.overlays.top.id);
    graph.editor.clear();
    type("/hel");
    send(press("right"));
    expect(graph.editor.text, "and `→` accepts the ghost there").toBe("/help");
  });

  it("T4.71 (C23 I77, C16 I54, C17 I29, §052): the reply's history and undo are its own, and ↓ never leaves the question", async () => {
    const { graph, send, type } = await session();
    graph.history.append("git push", 0);
    graph.history.append("npm test", 0);
    withLiveTable(graph);
    type("mine");
    const promptDepth = graph.editor.undoDepth;

    const { answer } = await reply(graph, send);
    expect(graph.editor.text, "the borrow starts empty").toBe("");

    // ---- undo is the reply's (C17 I29) ------------------------------------
    type("the");
    send(press("left"));
    send(press("right"));
    type("irs");
    const inReply: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      send(press("z", { ctrl: true }));
      inReply.push(graph.editor.text);
    }
    expect(inReply, `⌃z inside the reply walked ${inReply.join(" → ")}`).not.toContain("mine");
    expect(graph.confirm.open, "and the question is still up").toBe(true);

    // ---- history is the reply's (C23 I77) ---------------------------------
    type("theirs");
    send(press("up"));
    send(press("up"));
    expect(graph.editor.text, "↑ walks none of the prompt's commands").toBe("theirs");
    const before = graph.focus.current;
    send(press("down"));
    send(press("down"));
    expect(graph.focus.current, "↓ past the end leaves focus where it was").toEqual(before);
    expect(graph.confirm.open, "and the question is still the owner").toBe(true);
    send(press("r", { ctrl: true }));
    expect(graph.overlays.stack.map((l) => l.id), "⌃R opens no search over the question").not.toContain(SEARCH_ID);

    send(press("enter"));
    await expect(answer).resolves.toEqual({ key: "r", text: "theirs" });

    // ---- given back, stack and all ----------------------------------------
    expect(graph.editor.text, "the reader's line").toBe("mine");
    expect(graph.editor.undoDepth, "and the reader's own undo depth").toBe(promptDepth);
    const after: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      send(press("z", { ctrl: true }));
      after.push(graph.editor.text);
    }
    expect(after.filter((t) => t.startsWith("the")), `⌃z at the prompt walked ${after.join(" → ")}`).toEqual([]);

    // **The control: the same `↑` at the prompt does reach the commands**, so
    // the assertion above is about the owner and not about a dead binding.
    graph.editor.clear();
    send(press("up"));
    expect(graph.editor.text, "↑ at the prompt shows the newest command").toBe("npm test");
  });
});
