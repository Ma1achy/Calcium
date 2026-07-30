// C13 tier 4 — integration. Against C04, and against the components above.
//
// Most of this tier waits on C14: eviction not moving the viewport, a merge not
// collapsing an expanded row, a change granular enough to measure one entry. Those
// are assertions about two components agreeing, and only one of them exists.
// `todo-expiry` fails them into existence the moment `src/viewport/viewport.ts`
// holds behaviour, which is the notification nobody would otherwise send.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { appendPatch, docOf, tableWithDetails } from "../support/transcript.js";

describe("C13 integration", () => {
  it("T4.1 (with C04): a hundred patches leave a document that still validates", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1, "seed"), { streaming: true });

    for (let i = 0; i < 100; i += 1) {
      const r = s.patch(id, appendPatch(`p${i}`));
      expect(r, `patch ${i}`).toMatchObject({ ok: true });
    }

    const entry = s.entries.find((e) => e.id === id);
    expect(entry?.doc.blocks).toHaveLength(101);
    expect(entry?.rev).toBe(100);
    // C13 never re-validates after append — `applyPatch` is total over valid
    // documents — so this is the assertion that the assumption holds.
    expect(validateDocument(entry?.doc).ok).toBe(true);
  });

  it("T4.1b (with C04): a merge stream leaves the document valid and rows identical", () => {
    const s = createTranscriptStore();
    const id = s.append(tableWithDetails(3, 1), { streaming: true });
    const first = () => {
      const b = s.entries.find((e) => e.id === id)?.doc.blocks[0];
      return b && "rows" in b ? b.rows[0] : undefined;
    };
    const before = first();

    for (let i = 0; i < 50; i += 1) {
      s.patch(id, {
        op: "merge",
        blockId: "t",
        rows: [{ id: "t-r2", cells: { name: { text: `tick ${i}` } } }],
      });
    }

    // C04 I9 — untouched rows keep reference identity, which is what stops a
    // `--watch` tick collapsing an expanded row or moving the viewport.
    expect(first()).toBe(before);
    expect(validateDocument(s.entries.find((e) => e.id === id)?.doc).ok).toBe(true);
  });

  it("T4.2 (with C04): incremental patching equals adapting the whole output at once", () => {
    // C07 T4.5 from this side: a streamed verb applied tick by tick must reach
    // the same document as one built in a single pass, or a `--watch` and a
    // one-shot of the same command disagree about what the far side said.
    const streamed = createTranscriptStore();
    const whole = createTranscriptStore();

    const id = streamed.append(docOf(1, "b"), { streaming: true });
    for (let i = 1; i <= 20; i += 1) {
      const r = streamed.patch(id, appendPatch(`b${i}`, `line ${i}`));
      expect(r, `tick ${i}`).toMatchObject({ ok: true });
    }
    streamed.settle(id);

    whole.append(docOf(21, "b"));

    expect(streamed.entries[0]?.doc.blocks).toEqual(whole.entries[0]?.doc.blocks);
    expect(streamed.blockCount).toBe(whole.blockCount);
  });

  it.todo(
    "T4.3 (with C14): append emits a change granular enough to measure one entry rather than the transcript — waits on C14",
  );
  it.todo(
    "T4.4 (with C14): eviction shifts no visible content — the anchor is an id, so the viewport does not jump when the top is trimmed — waits on C14",
  );
  it.todo(
    "T4.5 (with C14, C11): a merge patch on an expanded table leaves the row expanded and the scroll position unmoved — waits on C14",
  );
  it.todo(
    "T4.6 (with C16): only the live entry appears in the focusable set; frozen entries never do, streaming or not — waits on C16",
  );
  it.todo("T4.7 (with L4): /clear empties the transcript and leaves C20's history intact — waits on C22 and C20");
});
