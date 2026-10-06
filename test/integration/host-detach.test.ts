// C16 I75 — the host escape is read before the ladder, through a built graph
// (review batch 3, M9 item 4).
//
// **Bytes in, and the witness is the handler that would have taken it.** A
// child's `onAction` sees only the keys it binds, so *the child never saw ⌃]*
// is true of a surface that binds nothing whether or not the escape was taken
// ahead of it. The row registers a handler at `child` that consumes every key,
// **ahead** of everything — the order that swallowed the escape while it was a
// handler (§3e H2) — and asserts on what that handler was offered.
import { describe, expect, it } from "vitest";

import type { ChildSurface } from "../../src/index.js";
import { buildGraph } from "../support/session.js";

const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** `0x1d`, the byte `ctrl` makes of `]`. */
const ESCAPE = String.fromCharCode(29);

const board: ChildSurface = {
  schema: "calcium.child-surface/1",
  id: "board",
  keymap: [{ key: { name: "a" }, action: "left" }],
  render: () => [{ kind: "raw", id: "board", text: "BOARD" }],
  onAction: () => undefined,
};

describe("C16 I75 — the host escape through the graph (review batch 3, M9 item 4)", () => {
  it("T4.94 (C16 I75, I49): a handler registered first at the child rung cannot take the escape, and a question raised over the child takes the keys at the detach", async () => {
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();
    const handle = graph.surface.open(board);
    const offered: string[] = [];
    using _ahead = asDisposable(
      graph.router.register(
        "child",
        (e) => {
          if (e.kind === "key") offered.push(e.key.name);
          return true;
        },
        { first: true },
      ),
    );
    expect(graph.router.target).toBe("child");

    // Shown to respond first: an ordinary key reaches the handler ahead.
    stdin.emit("b");
    await tick();
    expect(offered, "the handler ahead takes an ordinary key").toEqual(["b"]);

    // H8: a question raised while the child holds the keys waits beneath it.
    let answered: string | null = null;
    void graph.confirm
      .ask({
        question: "keep it?",
        choices: [
          { key: "y", label: "yes" },
          { key: "n", label: "no", default: true },
        ],
      })
      .then((a) => void (answered = a.key));
    await tick();
    expect(graph.router.target, "the child still holds the keys").toBe("child");

    stdin.emit(ESCAPE);
    await tick();
    expect(offered, "the escape was offered to no handler at the rung").toEqual(["b"]);
    expect(await handle.closed, "and the surface detached").toEqual({ reason: "detach" });
    expect(graph.router.target, "the question has the keys").toBe("overlay");

    // Guarded from the detach (C16 I69, I73): a `⏎` at once is refused, and a
    // deliberate one after the grace answers.
    stdin.emit("\r");
    await tick();
    expect(answered, "a ⏎ at the detach answers nothing").toBeNull();
    clock.advance(1_000);
    stdin.emit("\r");
    await tick();
    expect(answered, "a deliberate ⏎ takes the default").toBe("n");
    await graph.lifecycle.release();
  });
});

/** `register` answers `{ dispose() }`; `using` wants the symbol. */
function asDisposable(d: { dispose(): void }): Disposable {
  return { [Symbol.dispose]: () => d.dispose() };
}
