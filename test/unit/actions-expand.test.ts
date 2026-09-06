// C04 I98, C23 I18 — `expand` reaches a block declaring a collapsed form, from a
// live entry and from a settled one.
//
// **The reasoning-panel row** (`AGENT_TUI_DESIGN.md` §9b): a folded body over a
// one-line header, opened with `⏎`. The design said *the expand action, which
// exists* — and it existed for table rows on the live entry only. These rows
// drive it through the keyboard, because the dispatcher's frozen-entry gate is
// what a call to the arm would skip (`test/support/README.md`).
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";

const key = (k: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
  name: k.name,
  ctrl: k.ctrl ?? false,
  meta: k.meta ?? false,
  shift: k.shift ?? false,
  sequence: k.name,
});
const press = (k: Parameters<typeof key>[0]): InputEvent => ({ kind: "key", key: key(k) });

const fold = (id: string): Record<string, unknown> => ({
  kind: "scroll",
  id,
  height: 2,
  collapsed: true,
  children: [
    { kind: "raw", id: `${id}-1`, text: "The parser tracks quotes with a boolean" },
    { kind: "raw", id: `${id}-2`, text: "so a nested quote flips it back" },
    { kind: "raw", id: `${id}-3`, text: "A depth counter fixes that" },
  ],
});

const MANIFEST = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "think", local: true, summary: "a folded reasoning panel", args: [], flags: [] },
    { name: "wrapped", local: true, summary: "the same fold inside a panel", args: [], flags: [] },
    { name: "more", local: true, summary: "another entry", args: [], flags: [] },
  ],
};

async function graphWith() {
  const built = await buildGraph({
    manifest: MANIFEST,
    localHandlers: {
      think: () => ({
        schema: "tui.view/1",
        status: "ok",
        blocks: [
          { kind: "notice", id: "h", tone: "muted", glyph: "expand", text: "thinking · 4s · 312 tokens" },
          fold("body"),
        ],
      }),
      wrapped: () => ({
        schema: "tui.view/1",
        status: "ok",
        blocks: [{ kind: "panel", id: "p", title: "wrap", children: [fold("inner")] }],
      }),
      // **With elements**, or `↓` from the prompt has nowhere to land and `⇧tab`
      // never reaches the settled entry — the fixture has to be shown to respond
      // before it is asserted against (`test/support/README.md`).
      more: () => ({
        schema: "tui.view/1",
        status: "ok",
        blocks: [{ ...fold("m"), collapsed: false }],
      }),
    },
  } as never);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  return { ...built, settle };
}

const foldIn = (graph: Awaited<ReturnType<typeof graphWith>>["graph"], entryId: string, id: string) => {
  const entry = graph.transcript.entries.find((e) => e.id === entryId);
  const walk = (blocks: readonly { id: string; kind: string; children?: readonly unknown[] }[]): unknown => {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.children !== undefined) {
        const hit = walk(b.children as never);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return walk((entry?.doc.blocks ?? []) as never) as { collapsed?: boolean } | undefined;
};

describe("C04 I98 — ⏎ on a folded body toggles it", () => {
  it("T4.62 (C04 I98): the reasoning panel opens on ⏎ and folds again on the next", async () => {
    const { graph, settle } = await graphWith();
    graph.pipeline.submit("/think");
    await settle();
    const live = graph.transcript.liveId as string;
    expect(foldIn(graph, live, "body")?.collapsed).toBe(true);

    graph.router.dispatch(press({ name: "down" })); // the card's head is the first element (C09 I47)
    graph.router.dispatch(press({ name: "down" }));
    expect(graph.focus.current.at, "focus is on a child of the fold").toBe("liveBlock");
    graph.router.dispatch(press({ name: "enter" }));
    await settle();
    expect(foldIn(graph, live, "body")?.collapsed, "opened").toBe(false);
    // **The renderer agrees**: three children in a box of two now measure 2 + 1.
    const opened = foldIn(graph, live, "body");
    expect(graph.blocks.measure(opened as never, 40)).toBe(3);

    graph.router.dispatch(press({ name: "enter" }));
    await settle();
    expect(foldIn(graph, live, "body")?.collapsed, "and folded again").toBe(true);
    expect(graph.blocks.measure(foldIn(graph, live, "body") as never, 40)).toBe(1);
  });

  it("T4.63 (C04 I98, C22 I75): a fold inside a panel is reached at depth", async () => {
    const { graph, settle } = await graphWith();
    graph.pipeline.submit("/wrapped");
    await settle();
    const live = graph.transcript.liveId as string;
    graph.router.dispatch(press({ name: "down" })); // the card's head is the first element (C09 I47)
    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "enter" }));
    await settle();
    expect(foldIn(graph, live, "inner")?.collapsed).toBe(false);
  });

  it("T4.64 (C23 I18): from a settled entry `expand` is the one kind that fires, and nothing is refused", async () => {
    const { graph, settle } = await graphWith();
    graph.pipeline.submit("/think");
    await settle();
    graph.pipeline.submit("/more");
    await settle();
    const [settled] = graph.transcript.entries.map((e) => e.id);
    expect(graph.transcript.liveId).not.toBe(settled);

    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "tab", shift: true })); // lands on the card's head is the first element (C09 I47)
    graph.router.dispatch(press({ name: "down" })); // and the fold is the next
    expect(graph.focusedEntryId(), "focus is in the settled entry").toBe(settled);
    const blocksBefore = graph.transcript.entries.find((e) => e.id === settled)?.doc.blocks.length;

    graph.router.dispatch(press({ name: "enter" }));
    await settle();
    const entry = graph.transcript.entries.find((e) => e.id === settled);
    expect(foldIn(graph, settled as string, "body")?.collapsed, "the fold opened on a frozen entry").toBe(false);
    expect(
      entry?.doc.blocks.some((b) => b.kind === "notice" && /frozen entry/u.test(b.text)),
      "and no refusal was patched in",
    ).toBe(false);
    expect(entry?.doc.blocks.length).toBe(blocksBefore);
    expect(graph.transcript.entries.length, "nothing appended").toBe(2);
  });
});
