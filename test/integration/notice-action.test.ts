// C04 §3 / C09 / C26 §5 — a notice with an `action` is a button (arc 6 §5).
//
// **Bytes, not events**, for `peek.test.ts`'s reason: the element list is
// resolved in the read loop after a key lands, and a row calling
// `router.dispatch` directly would test the mechanism and miss the wiring.
//
// **Three things a notice's action has to do, and one it must not**: `↓` stops
// on it, `⏎` fires it through `rowActivate`, a settled entry refuses it through
// C23 I18 with the refusal patched beside the notice that offered it — and a
// notice *without* an action declares nothing, so `↓` from the prompt over a
// transcript of plain notices enters none of them. The last is the row that
// dies when the element is declared unconditionally.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";

const ESC = "";
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const SHIFT_TAB = `${ESC}[Z`;
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

const RETRY = { kind: "fill", label: "retry", command: "rows --retry" } as const;
const plain = (id: string) => ({ kind: "notice", id, tone: "info", text: `${id}: nothing to do` });
const retry = (id: string) => ({ kind: "notice", id, tone: "error", glyph: "error", text: `${id}: pull failed`, action: RETRY });

const doc = (blocks: readonly unknown[]) => ({ schema: "tui.view/1", command: "/rows", status: "ok", blocks, meta: META });

async function seeded(live: readonly unknown[], settled: readonly unknown[] | null = null) {
  const built = await buildGraph();
  built.graph.lifecycle.acquire();
  if (settled !== null) {
    built.graph.transcript.append(doc(settled) as never, { streaming: true });
    const id = built.graph.transcript.liveId;
    if (id === null) throw new Error("no live entry to settle");
    built.graph.transcript.settle(id);
  }
  built.graph.transcript.append(doc(live) as never, { streaming: true });
  built.graph.editor.clear();
  const type = (bytes: string): void => void built.stdin.emit(bytes);
  const focused = () => {
    const at = built.graph.focus.current;
    return at.at === "liveBlock" ? at.element?.elementId ?? null : "prompt";
  };
  return { ...built, type, focused };
}

describe("C04 §3 · C26 §5 — a notice with an action is one block-level element", () => {
  it("T4.14 (C09, C26 §5): ↓ from the prompt skips the plain notice and stops on the one with an action; ↑ leaves", async () => {
    const s = await seeded([plain("n1"), retry("n2"), plain("n3")]);
    // **The count, not a find**: the live entry declares exactly one element.
    const entry = s.graph.transcript.entries.find((e) => e.id === s.graph.transcript.liveId);
    if (entry === undefined) throw new Error("no live entry");
    const elements = s.graph.blocks.elementsIn(entry.doc.blocks, 100);
    expect(elements.map((p) => `${p.blockId}/${p.element.id}/${p.element.level}`)).toEqual(["n2/n2/block"]);
    expect(elements[0]?.element.activate).toEqual(RETRY);
    expect(elements[0]?.element.copy, "copy is the text from the data (C26 I17)").toBe("n2: pull failed");

    s.type(DOWN);
    expect(s.focused(), "↓ lands on the notice with the action, past the plain one above it").toBe("n2");
    s.type(DOWN);
    expect(s.focused(), "↓ again: nothing below to step to").toBe("n2");
    s.type(UP);
    expect(s.focused(), "↑ at the first element leaves to the prompt (C26 §4a row 1)").toBe("prompt");
  });

  it("T4.15 (C23 §4, C16 I29): ⏎ on the focused notice fires its `fill` — the command lands in the prompt", async () => {
    const s = await seeded([retry("n2")]);
    s.type(DOWN);
    expect(s.focused()).toBe("n2");
    s.type(ENTER);
    expect(s.graph.editor.text).toBe("rows --retry");
  });

  it("T4.16 (C23 I18): on a settled entry the same ⏎ is refused, and the refusal is patched beside the notice", async () => {
    const s = await seeded([retry("live")], [retry("old")]);
    s.type(DOWN);
    expect(s.focused(), "↓ enters the live entry").toBe("live");
    s.type(SHIFT_TAB);
    expect(s.focused(), "⇧tab moves to the older, settled entry's element (C26 §4g)").toBe("old");
    const settledId = s.graph.transcript.entries[0]?.id;
    if (settledId === undefined) throw new Error("no settled entry");
    const before = s.graph.transcript.entries[0]!.doc.blocks.length;

    s.type(ENTER);
    expect(s.graph.editor.text, "the fill did not land").toBe("");
    const after = s.graph.transcript.entries.find((e) => e.id === settledId)!.doc.blocks;
    expect(after.length, "one block appended to the settled entry — the refusal").toBe(before + 1);
    const refusal = after[after.length - 1]!;
    expect(refusal.kind).toBe("notice");
    expect(refusal.kind === "notice" ? refusal.tone : null).toBe("warn");
    expect(refusal.id.startsWith("refused")).toBe(true);
    expect(s.graph.transcript.entries.length, "patched, never appended as an entry").toBe(2);
  });

  it("T4.17 (C09): a transcript of notices without actions has nothing for ↓ to enter", async () => {
    const s = await seeded([plain("n1"), plain("n2")]);
    const entry = s.graph.transcript.entries.find((e) => e.id === s.graph.transcript.liveId);
    if (entry === undefined) throw new Error("no live entry");
    expect(s.graph.blocks.elementsIn(entry.doc.blocks, 100), "the element list is empty — asserted as a count").toHaveLength(0);
    s.type(DOWN);
    expect(s.focused(), "↓ from the prompt over plain notices stays at the prompt").toBe("prompt");
  });
});
