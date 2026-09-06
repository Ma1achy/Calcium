// C23 I18 — actions from a frozen entry, and the one thing that fires from one.
//
// **The refusal was reachable from nothing a reader could press until C26 §4g**,
// so these rows are the first that drive it through a keystroke rather than by
// calling the dispatcher. Both consumers I18 names — a notebook's *re-run this
// cell*, an agent harness's *retry that tool call* — wanted a settled entry's
// **recorded command**, and `rerunEntry` is that: not one of the five kinds, and
// not fired against the document's data.
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

const table = (suffix: string, kind: "fill" | "exec" = "fill"): Record<string, unknown> => ({
  kind: "table",
  id: `t${suffix}`,
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: false }],
  rows: [
    {
      id: `a${suffix}`,
      cells: { name: { text: `row-${suffix}` } },
      actions: [{ kind, label: `pick ${suffix}`, command: `pick ${suffix}` }],
    },
  ],
});

/** Two local verbs, so the settled entry's command and the live one's differ. */
const MANIFEST = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "rows", local: true, summary: "rows", args: [], flags: [] },
    { name: "more", local: true, summary: "more", args: [], flags: [] },
  ],
};

async function twoEntries() {
  const calls: string[] = [];
  const built = await buildGraph({
    manifest: MANIFEST,
    localHandlers: {
      rows: () => {
        calls.push("rows");
        return { schema: "tui.view/1", status: "ok", blocks: [table("1")] };
      },
      more: () => {
        calls.push("more");
        return { schema: "tui.view/1", status: "ok", blocks: [table("2", "exec")] };
      },
    },
  } as never);
  const { graph } = built;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  graph.pipeline.submit("/rows");
  await settle();
  graph.pipeline.submit("/more");
  await settle();
  const [settled, live] = graph.transcript.entries.map((e) => e.id);
  return { ...built, calls, settle, settled: settled as string, live: live as string };
}

describe("C23 I18 — refused, and the notice names the command", () => {
  it("T1.17b: ⏎ on a settled row is refused into that entry, whatever the kind", async () => {
    const { graph, settled, settle } = await twoEntries();
    expect(graph.transcript.liveId).not.toBe(settled);

    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "tab", shift: true })); // lands on the card's head is the first element (C09 I47)
    graph.router.dispatch(press({ name: "down" })); // and the row is the next
    expect(graph.focusedEntryId(), "focus is in the settled entry").toBe(settled);

    graph.router.dispatch(press({ name: "enter" }));
    await settle();
    const entry = graph.transcript.entries.find((e) => e.id === settled);
    // Past the card's header (C23 I55): the refusal is the body.
    const notice = entry?.doc.blocks.find((b) => b.kind === "notice" && b.glyph !== "step");
    expect(notice, "patched into the source entry, never appended (C23 I18)").toBeDefined();
    expect(notice?.kind === "notice" && notice.text).toMatch(/is from a frozen entry/);
    // **The recorded command, so the reader has the thing that is not stale.**
    expect(notice?.kind === "notice" && notice.text).toContain("Re-run `/rows`");
    expect(graph.editor.text, "the fill did not reach the prompt").toBe("");
    expect(graph.transcript.entries.length, "and nothing was appended").toBe(2);
  });
});

describe("C23 I18 — re-run fires the recorded command, not the document", () => {
  it("T4.61 (C16 I29, C23 I18): ⌥⏎ on a settled entry submits its command as a new live entry", async () => {
    const { graph, calls, settled, settle } = await twoEntries();
    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "tab", shift: true }));
    expect(graph.focusedEntryId()).toBe(settled);
    calls.length = 0;

    graph.router.dispatch(press({ name: "enter", meta: true }));
    await settle();

    // **`/rows`, not `/more`** — the focused entry's command and not the live
    // one's, which is what a mutation reading `liveId` here would submit.
    expect(calls, "the settled entry's verb ran again").toEqual(["rows"]);
    expect(graph.transcript.entries.length).toBe(3);
    const newest = graph.transcript.entries.at(-1);
    expect(newest?.doc.command).toBe("/rows");
    expect(graph.transcript.liveId, "the new entry is live; the old one stays as it was").toBe(newest?.id);
    // C16 I2: a command ran, so focus is at the prompt.
    expect(graph.focus.current).toEqual({ at: "prompt" });
  });

  it("T4.61b (C16 I29): ⇧⏎ is the same action, and it works on the live entry too", async () => {
    const { graph, calls, settle } = await twoEntries();
    graph.router.dispatch(press({ name: "down" }));
    calls.length = 0;
    graph.router.dispatch(press({ name: "enter", shift: true }));
    await settle();
    expect(calls).toEqual(["more"]);
    expect(graph.transcript.entries.at(-1)?.doc.command).toBe("/more");
  });

  it("T4.61c (control): at the prompt the same keys insert a newline and run nothing", async () => {
    const { graph, calls, settle } = await twoEntries();
    calls.length = 0;
    graph.router.dispatch(press({ name: "enter", meta: true }));
    await settle();
    expect(calls, "the prompt's `insertNewline`, not a re-run").toEqual([]);
    expect(graph.transcript.entries.length).toBe(2);
  });
});
