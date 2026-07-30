// C13 tier 5 — e2e. Sessions rather than operations.
//
// **T5.2 is the defining behaviour of §2** and the one thing in this file that
// would be caught by nothing else: a `--watch` started, then ten more commands
// run, and the watch is still updating in the scrollback while focus stays on the
// newest block. Every unit test here passes with a store that kills streams on
// freeze; a session does not.
//
// C13 spawns nothing and touches no terminal, so this tier is a long run rather
// than a PTY. The e2e-ness is the duration and the mixture, which is where a leak
// or a drifting counter shows and a six-line test does not.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { appendPatch, docOf } from "../support/transcript.js";
import { doc } from "../support/blocks.js";

describe("C13 e2e", () => {
  it("T5.1: a session of 500 commands → order holds, ids stay unique, nothing leaks", () => {
    const s = createTranscriptStore({ cap: 2_000 });
    const ids: string[] = [];

    for (let i = 0; i < 500; i += 1) ids.push(s.append(docOf(3, `c${i}`), {}));

    expect(new Set(ids).size).toBe(500);
    expect(s.entries.filter((e) => e.live)).toHaveLength(1);
    expect(s.liveId).toBe(ids.at(-1));
    // Order is arrival order among survivors, and seq is strictly increasing.
    const seqs = s.entries.filter((e) => e.id !== "transcript:evicted").map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(s.blockCount).toBeLessThanOrEqual(2_000);
  });

  it("T5.2: a --watch, then ten commands → the watch keeps updating, focus stays newest", () => {
    const s = createTranscriptStore({ cap: 10_000 });
    const watch = s.append(docOf(1, "w"), { streaming: true });

    for (let i = 0; i < 10; i += 1) {
      s.append(docOf(2, `c${i}`));
      // A tick arrives between commands, as it would from a subscription that
      // nobody asked to stop.
      const r = s.patch(watch, appendPatch(`w-tick${i}`));
      expect(r, `tick ${i}`).toMatchObject({ ok: true, rev: i + 1 });
    }

    const entry = s.entries.find((e) => e.id === watch);
    // Frozen, still streaming, and eleven blocks richer than it started (§2, I4).
    expect(entry).toMatchObject({ live: false, streaming: true, rev: 10 });
    expect(entry?.doc.blocks).toHaveLength(11);
    // Focus follows the prompt: exactly one live entry, and it is the newest.
    expect(s.liveId).toBe(s.entries.at(-1)?.id);
    expect(s.entries.filter((e) => e.live)).toHaveLength(1);
  });

  it("T5.3: a session exceeding the cap → oldest trimmed, marker names the count", () => {
    const cap = 500;
    const s = createTranscriptStore({ cap });

    for (let i = 0; i < 400; i += 1) s.append(docOf(4, `c${i}`));

    expect(s.blockCount).toBeLessThanOrEqual(cap);
    expect(s.droppedBlocks).toBeGreaterThan(0);

    const m = s.entries[0];
    expect(m?.id).toBe("transcript:evicted");
    const notice = m?.doc.blocks[0];
    const text = notice && "text" in notice ? notice.text : "";
    // The count in the marker is the count the store reports — a marker naming a
    // different number is worse than no marker.
    expect(text).toContain(s.droppedBlocks.toLocaleString("en-GB"));
    // Conservation across the whole session: 400 × 4 blocks appended.
    expect(s.droppedBlocks + (s.blockCount - 1)).toBe(1_600);
  });

  it("T5.4: two concurrent streams plus interactive commands → both live, no cross-talk", () => {
    const s = createTranscriptStore({ cap: 50_000 });
    const a = s.append(docOf(1, "a"), { streaming: true });
    const b = s.append(docOf(1, "b"), { streaming: true });

    for (let i = 0; i < 300; i += 1) {
      // `a-${i}` rather than `a${i}`: the seed document already holds `a0`, and a
      // duplicate blockId is a patch C04 rejects — which would leave `rev` one
      // short and read as a store defect rather than a fixture collision.
      expect(s.patch(a, appendPatch(`a-${i}`)), `a tick ${i}`).toMatchObject({ ok: true });
      expect(s.patch(b, appendPatch(`b-${i}`)), `b tick ${i}`).toMatchObject({ ok: true });
      if (i % 10 === 0) s.append(docOf(2, `cmd${i}`));
    }

    const ea = s.entries.find((e) => e.id === a);
    const eb = s.entries.find((e) => e.id === b);

    expect(ea).toMatchObject({ streaming: true, rev: 300 });
    expect(eb).toMatchObject({ streaming: true, rev: 300 });
    // No cross-talk: each stream's blocks carry only its own ids.
    const idsOf = (d: typeof ea): string[] => (d?.doc.blocks ?? []).map((x) => x.id);
    expect(idsOf(ea).every((id) => id.startsWith("a"))).toBe(true);
    expect(idsOf(eb).every((id) => id.startsWith("b"))).toBe(true);
    expect(s.overCap).toBe(0);

    // Settling one leaves the other running — the failure a shared flag produces.
    s.settle(a);
    expect(s.entries.find((e) => e.id === a)).toMatchObject({ streaming: false });
    expect(s.patch(b, appendPatch("b-after"))).toMatchObject({ ok: true });
  });

  it("T5.5: an invalid document mid-session loses that command and nothing else", () => {
    // C23 §5 calls `transcript.append` the one stage whose failure loses the
    // outcome. This is what "and nothing else" has to mean for that to be safe.
    const s = createTranscriptStore();
    const before = s.append(doc({ command: "before" }));
    const watch = s.append(docOf(1, "w"), { streaming: true });

    expect(() => s.append({ ...doc(), schema: "tui.view/9" } as never)).toThrow();

    expect(s.entries.map((e) => e.id)).toEqual([before, watch]);
    expect(s.liveId).toBe(watch);
    expect(s.patch(watch, appendPatch("still-running"))).toMatchObject({ ok: true });
  });
});
