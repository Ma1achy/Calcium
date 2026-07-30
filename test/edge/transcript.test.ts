// C13 tier 3 — edge. The cap, the sweep, the marker, and the sequence.
//
// **T3.18 is the reason this file is worth reading rather than scanning.** Every
// invariant in C13 constrains one operation and none of them constrains the
// history, and C13 renders nothing — so there is no frame to read, which is the
// lever that found five defects in C25 and three in C12. Stepping a sequence and
// asserting the whole state after each step is the substitute, and it is what
// turned up the sweep-on-settle defect that R2 fixed.
import { describe, expect, it } from "vitest";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { countBlocks } from "../../src/viewport/transcript/cap.js";
import { appendPatch, docOf, groupOf, tableWithDetails } from "../support/transcript.js";
import { doc } from "../support/blocks.js";
import type { Change, TranscriptStore } from "../../src/viewport/transcript/index.js";

/** The marker sits at the head and is the only entry with an empty command. */
const marker = (s: TranscriptStore): (typeof s.entries)[number] | undefined =>
  s.entries.find((e) => e.id === "transcript:evicted");

describe("C13 edge — patching and settling", () => {
  it("T3.1: patch with an unknown id → no-op, store unchanged, no throw", () => {
    const s = createTranscriptStore();
    s.append(docOf(1), { streaming: true });
    const before = s.entries;

    expect(s.patch("nosuch", appendPatch("x"))).toEqual({ ok: false, reason: "unknown" });
    expect(s.entries).toBe(before);
  });

  it("T3.2: settle with an unknown id → no-op", () => {
    const s = createTranscriptStore();
    s.append(doc());
    const before = s.entries;

    s.settle("nosuch");
    expect(s.entries).toBe(before);
  });

  it("T3.3: patch on the store's only entry while it is live+streaming → applies", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });

    expect(s.patch(id, appendPatch("x"))).toMatchObject({ ok: true });
    expect(s.entries[0]?.doc.blocks).toHaveLength(2);
  });

  it("T3.4: append mid-flight → the stream's next patch still lands on the frozen entry", () => {
    const s = createTranscriptStore();
    const watch = s.append(docOf(1), { streaming: true });
    s.append(doc());

    expect(s.patch(watch, appendPatch("tick"))).toMatchObject({ ok: true });
    expect(s.entries[0]?.doc.blocks).toHaveLength(2);
  });

  it("T3.5 (I8): patch on a settled entry → reason 'settled'; document untouched", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    s.settle(id);
    const before = s.entries[0]?.doc;

    expect(s.patch(id, appendPatch("x"))).toEqual({ ok: false, reason: "settled" });
    expect(s.entries[0]?.doc).toBe(before);
  });

  it("T3.6: settle twice → the second is a no-op", () => {
    const s = createTranscriptStore();
    const id = s.append(doc(), { streaming: true });
    s.settle(id);
    const changes: Change[] = [];
    s.subscribe((c) => void changes.push(c));

    s.settle(id);
    expect(changes).toEqual([]);
  });
});

describe("C13 edge — the cap and the sweep", () => {
  it("T3.7 (I5): the live entry as the last remaining candidate → skipped, excess reported", () => {
    // Not "the live entry is oldest": I1 makes it last, so it can only be oldest
    // when it is alone, and then there is no next oldest to take instead. The
    // constructible case is the sweep walking forward until only live is left.
    const s = createTranscriptStore({ cap: 3 });
    s.append(docOf(2));
    s.append(docOf(2));
    s.append(docOf(4)); // live, four blocks, alone above the cap

    expect(s.liveId).toBe(s.entries.at(-1)?.id);
    expect(s.entries.at(-1)?.live).toBe(true);
    // Live survived; everything evictable went; the remainder is reported.
    expect(s.entries.filter((e) => e.id !== "transcript:evicted")).toHaveLength(1);
    expect(s.overCap).toBe(s.blockCount - 3);
    expect(s.overCap).toBeGreaterThan(0);
  });

  it("T3.7b (I15): settle on the blocking entry → swept on the settle, not on the next append", () => {
    const s = createTranscriptStore({ cap: 2 });
    const watch = s.append(docOf(3), { streaming: true });
    s.append(docOf(1));

    // Streaming, so it may not be evicted (I6): the cap yields and says so.
    expect(s.overCap).toBeGreaterThan(0);
    expect(s.droppedBlocks).toBe(0);
    const over = s.overCap;

    s.settle(watch);

    // The defect R2 fixed: without a sweep here, `overCap` would still be `over`
    // and L4 would warn about an overshoot that no longer exists.
    expect(s.overCap).toBeLessThan(over);
    expect(s.droppedBlocks).toBe(3);
  });

  it("T3.7c (I15): an op:'append' patch crossing the cap → swept on the patch", () => {
    const s = createTranscriptStore({ cap: 3 });
    s.append(docOf(2));
    const live = s.append(docOf(1), { streaming: true });
    expect(s.overCap).toBe(0);

    s.patch(live, appendPatch("x"));

    // The cap was crossed by a stream tick, not by a command, and the sweep ran
    // on the tick: `droppedBlocks` moved with no `append` between.
    expect(s.droppedBlocks).toBe(2);
    expect(s.blockCount).toBeLessThanOrEqual(3);

    // A second tick has nothing left to evict — the live entry is live and
    // streaming both — so the cap yields and the overshoot is reported instead.
    s.patch(live, appendPatch("y"));
    expect(s.droppedBlocks).toBe(2);
    expect(s.overCap).toBe(s.blockCount - 3);
  });

  it("T3.8 (I6): every non-live entry streaming → nothing evicted, cap exceeded, reported", () => {
    const s = createTranscriptStore({ cap: 2 });
    s.append(docOf(3), { streaming: true });
    s.append(docOf(3), { streaming: true });
    s.append(docOf(3));

    expect(s.droppedBlocks).toBe(0);
    expect(s.entries).toHaveLength(3);
    expect(s.overCap).toBe(9 - 2);
  });

  it("T3.8b (I15): with every candidate streaming, overCap is the excess and dropped is 0", () => {
    const s = createTranscriptStore({ cap: 4 });
    s.append(docOf(5), { streaming: true });
    s.append(docOf(2));

    expect(s.blockCount).toBe(7);
    expect(s.overCap).toBe(3);
    expect(s.droppedBlocks).toBe(0);
  });

  it("T3.9 (I7): evicting three entries totalling 400 blocks → droppedBlocks +400", () => {
    // The cap holds all three first, so the eviction is one event of exactly
    // three entries rather than a trickle — which is what the assertion is about.
    const s = createTranscriptStore({ cap: 500 });
    s.append(docOf(100, "a"));
    s.append(docOf(150, "b"));
    s.append(docOf(150, "c"));
    expect(s.droppedBlocks).toBe(0);

    s.append(docOf(480, "d")); // 880 blocks against a 500 cap: all three go

    expect(s.droppedBlocks).toBe(400);
    expect(s.entries.map((e) => e.id)).toEqual(["transcript:evicted", s.liveId]);
  });

  it("T3.9b (I14): a marker exists at the head, frozen and settled, naming the count", () => {
    const s = createTranscriptStore({ cap: 3 });
    s.append(docOf(4));
    s.append(docOf(2));

    const m = marker(s);
    expect(s.entries[0]?.id).toBe("transcript:evicted");
    expect(m).toMatchObject({ live: false, streaming: false });
    const notice = m?.doc.blocks[0];
    expect(notice?.kind).toBe("notice");
    expect(notice && "text" in notice ? notice.text : "").toContain("4");

    // A second eviction updates it rather than adding another.
    s.append(docOf(3));
    expect(s.entries.filter((e) => e.id === "transcript:evicted")).toHaveLength(1);
    const after = marker(s)?.doc.blocks[0];
    expect(after && "text" in after ? after.text : "").toContain("6");
  });

  it("T3.9c (I14): the marker is never itself evicted, even at the cap", () => {
    const s = createTranscriptStore({ cap: 1 });
    for (let i = 0; i < 20; i += 1) s.append(docOf(2, `d${i}`));

    expect(marker(s)).toBeDefined();
    expect(s.entries[0]?.id).toBe("transcript:evicted");
  });

  it("T3.10: a document larger than the whole cap → stored, exceeded, reported", () => {
    const s = createTranscriptStore({ cap: 5 });
    s.append(docOf(40));

    // Never silently truncated by C13 — that is C07's job.
    expect(s.entries.at(-1)?.doc.blocks).toHaveLength(40);
    expect(s.overCap).toBe(35);
  });

  it("T3.11: clear while streaming → removed; later patches are 'unknown', not resurrection", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    s.clear();

    expect(s.entries).toEqual([]);
    expect(s.patch(id, appendPatch("x"))).toEqual({ ok: false, reason: "unknown" });
    expect(s.entries).toEqual([]);
  });

  it("T3.11b (I15): clear while over the cap → overCap, droppedBlocks and marker all go", () => {
    const s = createTranscriptStore({ cap: 2 });
    s.append(docOf(5));
    s.append(docOf(5));
    expect(s.droppedBlocks).toBeGreaterThan(0);
    expect(s.overCap).toBeGreaterThan(0);

    s.clear();

    expect(s.overCap).toBe(0);
    expect(s.droppedBlocks).toBe(0);
    expect(marker(s)).toBeUndefined();
  });

  it("T3.12 (I3): an id referencing an evicted entry resolves to nothing, never elsewhere", () => {
    const s = createTranscriptStore({ cap: 2 });
    const first = s.append(docOf(2));
    s.append(docOf(2));

    expect(s.entries.some((e) => e.id === first)).toBe(false);
    expect(s.patch(first, appendPatch("x"))).toEqual({ ok: false, reason: "unknown" });
  });

  it("T3.12b (I3): ids are not reused across clear() either", () => {
    const s = createTranscriptStore();
    const before = s.append(doc());
    s.clear();
    const after = s.append(doc());

    // Resetting the counter on clear is the one-line change that makes a stale
    // reference resolve to a *different* entry, which is worse than resolving
    // to nothing.
    expect(after).not.toBe(before);
  });

  it("T3.13: 100,000 appends → bounded, and the sweep does not go quadratic", () => {
    const s = createTranscriptStore({ cap: 1_000 });
    for (let i = 0; i < 100_000; i += 1) s.append(docOf(1, `d${i}`));

    expect(s.blockCount).toBeLessThanOrEqual(1_000);
    expect(s.entries.length).toBeLessThanOrEqual(1_001);
    // Conservation, stated as a law rather than as a magic number: every block
    // appended is either still held or counted as dropped, and the marker's own
    // block is the one thing in `blockCount` that was never appended.
    expect(s.droppedBlocks + (s.blockCount - 1)).toBe(100_000);
  }, 30_000);

  it("T3.14: a merge touching no existing row is an upsert; untouched rows keep identity", () => {
    const s = createTranscriptStore();
    const id = s.append(tableWithDetails(2, 0), { streaming: true });
    const before = s.entries[0]!.doc.blocks[0];
    const kept = before && "rows" in before ? before.rows[0] : undefined;

    s.patch(id, { op: "merge", blockId: "t", rows: [{ id: "t-r9", cells: { name: { text: "new" } } }] });

    const after = s.entries[0]!.doc.blocks[0];
    const rows = after && "rows" in after ? after.rows : [];
    expect(rows).toHaveLength(3);
    // C04 I9 — reference identity is what stops a tick collapsing an expanded row.
    expect(rows[0]).toBe(kept);
  });

  it("T3.15: a throwing subscriber → others still receive the change; the store is fine", () => {
    const s = createTranscriptStore();
    const seen: Change[] = [];
    s.subscribe(() => {
      throw new Error("consumer fault");
    });
    s.subscribe((c) => void seen.push(c));

    expect(() => s.append(doc())).not.toThrow();
    expect(seen.map((c) => c.kind)).toEqual(["append"]);
    expect(s.entries).toHaveLength(1);
  });

  it("T3.16 (I17): nested blocks count and rows never do", () => {
    // A group of 500 children is 501 blocks, not 1 — the count that makes the
    // cap enforceable rather than nominal.
    expect(countBlocks(groupOf(500))).toBe(501);

    // And the walk is not shallow: a row's `detail` is a Block[] (C11 I2), so a
    // 2,000-row table with a two-block detail on every row is a tree.
    expect(countBlocks(tableWithDetails(2_000, 2))).toBe(4_001);

    // Rows alone are not blocks. Nine thousand rows cost one.
    expect(countBlocks(tableWithDetails(9_000, 0))).toBe(1);
  });

  it("T3.17 (I15): the post-condition holds after every call, not only after append", () => {
    // The three claims of §5 — the cap, the never-evict rule, `overCap` — are one
    // situation. This is what makes one implementation satisfy all three at once
    // rather than each in turn, which is how the interaction went unstated.
    const cap = 12;
    const s = createTranscriptStore({ cap });
    const streaming: string[] = [];
    let seed = 7;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    const check = (after: string): void => {
      const ok = s.blockCount <= cap || s.overCap === s.blockCount - cap;
      expect(ok, `${after}: blockCount ${s.blockCount}, overCap ${s.overCap}`).toBe(true);
      if (s.blockCount > cap) {
        const evictable = s.entries.filter(
          (e) => !e.live && !e.streaming && e.id !== "transcript:evicted",
        );
        expect(evictable, `${after}: an evictable entry survived above the cap`).toEqual([]);
      }
    };

    for (let i = 0; i < 400; i += 1) {
      const roll = next(10);
      if (roll < 5) {
        const isStream = next(2) === 0;
        const id = s.append(docOf(1 + next(4), `d${i}`), { streaming: isStream });
        if (isStream) streaming.push(id);
        check(`append ${i}`);
      } else if (roll < 8 && streaming.length > 0) {
        const id = streaming[next(streaming.length)]!;
        s.patch(id, appendPatch(`p${i}`));
        check(`patch ${i}`);
      } else if (roll < 9 && streaming.length > 0) {
        s.settle(streaming.shift()!);
        check(`settle ${i}`);
      } else {
        s.clear();
        streaming.length = 0;
        check(`clear ${i}`);
        expect(s.overCap).toBe(0);
      }
    }
  });

  it("T3.18 (the sequence): append, patch, append, patch the frozen one, evict, settle, clear", () => {
    const cap = 6;
    const s = createTranscriptStore({ cap });
    const changes: Change[] = [];
    s.subscribe((c) => void changes.push(c));

    // 1 — append a streaming watch of two blocks.
    const watch = s.append(docOf(2, "w"), { streaming: true });
    expect(s.entries.map((e) => [e.id, e.live, e.streaming])).toEqual([[watch, true, true]]);
    expect([s.blockCount, s.droppedBlocks, s.overCap]).toEqual([2, 0, 0]);
    expect(changes.at(-1)).toEqual({ kind: "append", id: watch });

    // 2 — a tick lands on it while it is live.
    expect(s.patch(watch, appendPatch("w-t1"))).toEqual({ ok: true, rev: 1 });
    expect([s.blockCount, s.droppedBlocks, s.overCap]).toEqual([3, 0, 0]);
    expect(changes.at(-1)).toEqual({ kind: "patch", id: watch });

    // 3 — the user types. The watch freezes and keeps streaming (§2).
    const cmd = s.append(docOf(2, "c"));
    expect(s.entries.map((e) => [e.id, e.live, e.streaming])).toEqual([
      [watch, false, true],
      [cmd, true, false],
    ]);
    expect(s.liveId).toBe(cmd);
    expect([s.blockCount, s.droppedBlocks, s.overCap]).toEqual([5, 0, 0]);

    // 4 — a tick lands on the *frozen* entry. The defining behaviour of §2.
    expect(s.patch(watch, appendPatch("w-t2"))).toEqual({ ok: true, rev: 2 });
    expect(s.entries[0]?.doc.blocks).toHaveLength(4);
    expect([s.blockCount, s.droppedBlocks, s.overCap]).toEqual([6, 0, 0]);

    // 5 — another command crosses the cap: 4 + 2 + 3 against a cap of 6.
    //
    // **`cmd` goes, not `watch`, and that is the step the walk exists to show.**
    // Eviction is oldest-*evictable*-first, not oldest-first: `watch` is older
    // but streaming, so I6 exempts it and the sweep steps over it to the newer
    // entry. Reading the rules gives "oldest-first"; only stepping the sequence
    // shows that the surviving order is not the arrival order.
    const second = s.append(docOf(3, "x"));
    expect(s.droppedBlocks).toBe(2);
    expect(s.entries.map((e) => e.id)).toEqual(["transcript:evicted", watch, second]);
    // 4 + 3 + the marker's own block = 8, and nothing evictable is left, so the
    // cap yields and says by how much (I6, I15).
    expect(s.blockCount).toBe(8);
    expect(s.overCap).toBe(2);
    expect(changes.at(-1)).toEqual({ kind: "evict", ids: [cmd] });
    expect(changes.at(-2)).toEqual({ kind: "append", id: second });

    // 6 — the watch settles. Now it is evictable, and the sweep runs *here*
    // rather than waiting for a command that may never come. This is the defect
    // R2 fixed: without a sweep on `settle`, `overCap` stays at 2 and L4 warns
    // about a condition that no longer holds.
    s.settle(watch);
    expect(s.droppedBlocks).toBe(6);
    expect(s.overCap).toBe(0);
    expect(marker(s)).toBeDefined();
    expect(s.entries.map((e) => e.id)).toEqual(["transcript:evicted", second]);
    // 3 + the marker's own block. It is a real entry and it costs one (I14).
    expect(s.blockCount).toBe(4);
    expect(changes.at(-1)).toEqual({ kind: "evict", ids: [watch] });
    expect(changes.at(-2)).toEqual({ kind: "settle", id: watch });

    // 7 — clear. Everything goes, including the marker and both counters.
    s.clear();
    expect(s.entries).toEqual([]);
    expect([s.blockCount, s.droppedBlocks, s.overCap]).toEqual([0, 0, 0]);
    expect(s.liveId).toBeNull();
    expect(changes.at(-1)).toEqual({ kind: "clear" });
  });

  it("T3.19 (§5a): the retention window is separate from the block cap", () => {
    const withRetention = createTranscriptStore({ cap: 100, retainPayloads: 3 });
    const without = createTranscriptStore({ cap: 100 });
    const ids: string[] = [];

    for (let i = 0; i < 6; i += 1) {
      ids.push(withRetention.append(docOf(2, `d${i}`), { payload: { raw: i } }));
      without.append(docOf(2, `d${i}`), { payload: { raw: i } });
    }

    // Last three retained, first three gone — its own window, oldest first.
    expect(ids.slice(0, 3).map((id) => withRetention.payloadOf(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(ids.slice(3).map((id) => withRetention.payloadOf(id))).toEqual([
      { raw: 3 },
      { raw: 4 },
      { raw: 5 },
    ]);

    // And retention changed nothing about the cap's arithmetic. Two eviction
    // policies sharing one counter would make each depend on the other.
    expect([withRetention.blockCount, withRetention.droppedBlocks, withRetention.overCap]).toEqual([
      without.blockCount,
      without.droppedBlocks,
      without.overCap,
    ]);
    expect(without.payloadOf(ids[5]!)).toBeUndefined();
  });
});
