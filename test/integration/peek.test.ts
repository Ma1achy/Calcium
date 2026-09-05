// C15 §2a — the peek: the focused element's detail, drawn as a layer that takes
// no keys. T4.10 is the measured cell — with a plain overlay standing in for the
// peek, `↓`, `⏎` and `Esc` were all taken by the layer — and T4.11 is §2a's
// trace driven through a painting session and read off the frame.
//
// **Two harnesses, for `session-navigation.test.ts`'s reason.** `buildGraph`
// stubs `render`, so it is where the stack is asserted; `buildSession` paints,
// so it is where the peek's row is read against the element's.
//
// **Bytes, not events.** The peek is reconciled in the read loop after the keys
// (`deliver`), so a row that called `router.dispatch` directly would be testing
// the mechanism and missing the wiring. Every key here goes in through stdin.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { OverlayChange } from "../../src/viewport/overlay/index.js";

const ESC = "";
const DOWN = `${ESC}[B`;
const ENTER = "\r";

const META = {
  verb: "rows",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

const LONG_A = "alpha-with-a-name-longer-than-its-column";
const LONG_C = "charlie-also-longer-than-twelve-cells";

/**
 * Three rows in a twelve-cell, non-flex column: `a` and `c` are cut and declare
 * a detail, `b` fits and declares none (C26 §5). `c` carries a fill action so
 * `⏎` has something observable to do.
 */
const table = (aText = LONG_A) => ({
  kind: "table",
  id: "t",
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
  rows: [
    { id: "a", cells: { name: { text: aText } } },
    { id: "b", cells: { name: { text: "bravo" } } },
    { id: "c", cells: { name: { text: LONG_C } }, actions: [{ kind: "fill", label: "pick c", command: "pick c" }] },
  ],
});

const doc = (blocks: readonly unknown[]) => ({ schema: "tui.view/1", command: "/rows", status: "ok", blocks, meta: META });

/** A graph with the table live, focus at the prompt, and a keyboard. */
async function seeded(blocks: readonly unknown[] = [table()]) {
  const built = await buildGraph();
  // Bytes reach the decoder only while acquired (C01 I18) — `completion-as-you-type`'s idiom.
  built.graph.lifecycle.acquire();
  built.graph.transcript.append(doc(blocks) as never, { streaming: true });
  built.graph.editor.clear();
  const type = (bytes: string): void => void built.stdin.emit(bytes);
  /** A lone `Esc` is delivered when its window closes (C16 §5b): advance the clock and let the wake fire. */
  const escape = async (): Promise<void> => {
    built.stdin.emit(ESC);
    built.clock.advance(100);
    await new Promise((r) => setTimeout(r, 80));
  };
  const peek = () => built.graph.overlays.stack.find((l) => l.id === "peek") ?? null;
  const focused = () => {
    const at = built.graph.focus.current;
    return at.at === "liveBlock" ? at.element?.elementId ?? null : "prompt";
  };
  return { ...built, type, escape, peek, focused };
}

describe("C15 §2a — the peek beside the focused element", () => {
  it("T4.10 (C15 I21, C16): with a peek on the stack the keys reach the element — the cell a plain overlay was measured to steal", async () => {
    const s = await seeded();

    s.type(DOWN);
    expect(s.focused(), "↓ from the prompt lands on a").toBe("a");
    const up = s.peek();
    expect(up, "a is cut, so its detail is up").not.toBeNull();
    expect(up?.kind).toBe("peek");
    expect(s.graph.router.target, "and the target is the block, not the layer").toBe("liveBlock");
    expect(s.graph.overlays.top, "a peek is never top").toBeNull();

    s.type(DOWN);
    expect(s.focused(), "↓ moved focus through the peek").toBe("b");
    expect(s.peek(), "b fits, so no peek").toBeNull();

    s.type(DOWN);
    expect(s.focused()).toBe("c");
    expect(s.peek(), "c is cut").not.toBeNull();

    s.type(ENTER);
    expect(s.graph.editor.text, "⏎ activated the row — the fill landed in the prompt").toBe("pick c");

    // **The control — the measured cell, reproduced.** A plain overlay in the
    // peek's place takes `↓`: focus does not move. Without this the rows above
    // would pass against a router that never routed to a layer at all.
    s.graph.overlays.dismiss("peek");
    s.graph.overlays.push({
      id: "plain",
      kind: "overlay",
      placement: { kind: "anchored", row: 3, prefer: "below" },
      content: [],
      dismissable: true,
    });
    expect(s.graph.router.target).toBe("overlay");
    s.type(`${ESC}[A`); // ↑
    expect(s.focused(), "the overlay took the arrow and focus stayed on c").toBe("c");
  });

  it("T4.11 (C15 §2a trace, C26 §5): ↓ opens, ↓ closes, ↓ opens again, Esc leaves — on the stack", async () => {
    const s = await seeded();
    const changes: OverlayChange[] = [];
    s.graph.overlays.subscribe((c) => changes.push(c));

    s.type(DOWN); // a — cut
    expect(s.peek()?.placement).toMatchObject({ kind: "anchored", prefer: "below" });
    s.type(DOWN); // b — fits
    expect(s.peek()).toBeNull();
    s.type(DOWN); // c — cut
    expect(s.peek()).not.toBeNull();
    await s.escape();
    expect(s.focused(), "Esc at liveBlock is focusPrompt, as before").toBe("prompt");
    expect(s.peek(), "and the peek followed focus out").toBeNull();
    expect(s.graph.overlays.stack, "nothing left behind").toEqual([]);

    // The change log is push / dismiss / push / dismiss — the peek is never
    // popped (C15 I21) and a move between two cut rows would be a `content`, not a pair.
    expect(changes.map((c) => `${c.kind}:${c.id}`)).toEqual(["push:peek", "dismiss:peek", "push:peek", "dismiss:peek"]);
  });

  it("T4.13 (C15 §2a walk, C26 §4b cell 3): no element inside a scroll box can want a peek — the premise `SCROLL_PEEK` closed on, pinned", async () => {
    // **Measured before the guard came out.** A scroll owns its elements: one per
    // child, block-level, and none with a `detail` — only a table *row* declares
    // one. So the cut row the brief names is not a focus target inside a box,
    // and the content-row → region-row translation has nothing to translate.
    // This row goes red the day a scroll's element gains a `detail`, which is
    // the day the translation is owed (C15's walk table names it).
    const box = { kind: "scroll", id: "s", height: 6, children: [table()] };
    const s = await seeded([box]);
    const entry = s.graph.transcript.entries.find((e) => e.id === s.graph.transcript.liveId);
    if (entry === undefined) throw new Error("no live entry");
    const inside = s.graph.blocks.elementsIn(entry.doc.blocks, 100);
    expect(inside.map((p) => `${p.blockId}/${p.element.id}/${p.element.level}`), "the box's one child, as the box's element").toEqual(["s/t/block"]);
    expect(inside.filter((p) => p.element.detail !== undefined), "and no detail on any of them — asserted as a count").toHaveLength(0);
    // **The control**: the same table outside the box declares row `a`'s detail,
    // so the fixture is shown to carry the thing the box is shown not to.
    const outside = s.graph.blocks.elementsIn([table()] as never, 100);
    expect(outside.filter((p) => p.element.detail !== undefined).map((p) => p.element.id)).toEqual(["a", "c"]);

    s.type(DOWN);
    expect(s.focused(), "↓ lands on the box's element for the table, not on a row").toBe("t");
    expect(s.peek(), "and there is no peek, because there is no detail").toBeNull();
    expect(s.graph.overlays.stack).toEqual([]);
  });

  it("T4.12 (C15 I14, C23): patching the focused entry changes the peek through one content change", async () => {
    const s = await seeded();
    s.type(DOWN); // a — cut
    const changes: OverlayChange[] = [];
    s.graph.overlays.subscribe((c) => changes.push(c));

    const id = s.graph.transcript.liveId;
    if (id === null) throw new Error("no live entry");
    const changed = "alpha-renamed-and-still-longer-than-twelve";
    s.graph.transcript.patch(id, { op: "replace", blockId: "t", block: table(changed) } as never);

    expect(changes, "one content change, no pop and no push").toEqual([{ kind: "content", id: "peek" }]);
    const content = JSON.stringify(s.peek()?.content);
    expect(content).toContain(changed);
    expect(content).not.toContain(LONG_A);

    // The control: a patch that leaves the cut cell alone changes nothing.
    s.graph.transcript.patch(id, { op: "replace", blockId: "t", block: table(changed) } as never);
    expect(changes).toHaveLength(1);
  });
});

/** The wire forms and a painting session, as `session-navigation.test.ts` builds one. */
async function painting() {
  const stdin = fakeStdin();
  const built = await buildSession(
    {
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "three rows", args: [], flags: [] }],
      },
      localHandlers: {
        rows: () => ({ schema: "tui.view/1", status: "ok", blocks: [table()] }),
      },
    } as never,
    { columns: 80, rows: 24 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  await type("/rows\r");
  await Promise.resolve();
  return { ...built, type };
}

describe("C15 §2a — the frame", () => {
  it("T4.11b (C15 §2a, I17): the peek's first row is the element's row plus one, and the rows it does not cover are unchanged", async () => {
    const s = await painting();
    const rowOf = (rows: readonly string[], needle: string): number => {
      const i = rows.findIndex((r) => r.includes(needle));
      if (i === -1) throw new Error(`no row holds ${needle}\n${rows.join("\n")}`);
      return i;
    };

    // Before any key: the table is on screen, the cut cell ends in an ellipsis, no peek.
    const bare = s.screen().rows;
    expect(bare.join("\n")).not.toContain("Detail");
    expect(bare.join("\n"), "the cell is cut on screen").not.toContain(LONG_A);
    const rowA = rowOf(bare, "alpha-with-");

    await s.type(DOWN); // a
    const withPeek = s.screen().rows;
    const text = withPeek.join("\n");
    expect(text, "the peek shows the whole cell").toContain(LONG_A);
    // **The peek's row against the element's row** — containment is not correctness.
    expect(rowOf(withPeek, "Detail"), "the panel's top border is directly below row a").toBe(rowA + 1);
    expect(withPeek[rowA]?.includes("alpha-with-"), "row a itself is not covered").toBe(true);
    // Every row above the element is byte-identical to the frame without the peek.
    expect(withPeek.slice(0, rowA)).toEqual(bare.slice(0, rowA));

    await s.type(DOWN); // b — fits, no peek
    const gone = s.screen().rows;
    expect(gone.join("\n")).not.toContain("Detail");
    expect(gone.join("\n")).not.toContain(LONG_A);
    // The rows the peek covered are the transcript's again.
    expect(gone.slice(0, rowA)).toEqual(bare.slice(0, rowA));

    await s.type(DOWN); // c — cut again
    const again = s.screen().rows;
    expect(again.join("\n")).toContain(LONG_C);
    // **Read off the frame, not assumed**: below row c are the gap and the
    // action bar — two rows, and the panel is three — so C15 flips it above
    // (I17): the bottom rail sits directly above row c and the title three
    // rows up. The frame's row 15 is the command line, 16–18 the peek, 19 row c.
    // The cut cell, ellipsis included — the peek's own row holds the full text
    // and would match a shorter needle first.
    const rowC = rowOf(again, "charlie-als…");
    expect(again[rowC - 1]?.startsWith("└"), "the bottom rail is directly above row c").toBe(true);
    expect(rowOf(again, "Detail")).toBe(rowC - 3);
    expect(again[rowC]?.includes("charlie-als…"), "row c itself is not covered").toBe(true);
  });
});
