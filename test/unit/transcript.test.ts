// C13 tier 1 — unit. Appending, freezing, patching, settling, clearing.
//
// **T1.13 is the one that would not exist without asking for it.** T1.3, T1.4 and
// T1.8–T1.10 cover the transitions between the four `(live, streaming)` states, and
// a suite covering three of the four states reads exactly like one covering all
// four. Frozen+streaming is the one that goes missing, and it is the state §2 exists
// to protect: a `--watch` that keeps updating in the scrollback after focus moved on.
import { describe, expect, it } from "vitest";
import { createTranscriptStore, TranscriptError } from "../../src/viewport/transcript/index.js";
import { INVALID_DOC, appendPatch, docOf } from "../support/transcript.js";
import { doc } from "../support/blocks.js";
import type { Change } from "../../src/viewport/transcript/index.js";

describe("C13 unit", () => {
  it("T1.1: append on an empty store → one entry, live, liveId set", () => {
    const s = createTranscriptStore();
    const id = s.append(doc());

    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]?.id).toBe(id);
    expect(s.entries[0]?.live).toBe(true);
    expect(s.liveId).toBe(id);
  });

  it("T1.2 (I3): two appends → ids differ, seq increments, order preserved", () => {
    const s = createTranscriptStore();
    const a = s.append(doc({ command: "first" }));
    const b = s.append(doc({ command: "second" }));

    expect(a).not.toBe(b);
    expect(s.entries.map((e) => e.id)).toEqual([a, b]);
    expect(s.entries[1]!.seq).toBeGreaterThan(s.entries[0]!.seq);
  });

  it("T1.3: appending over a live+settled entry → the previous becomes frozen+settled", () => {
    const s = createTranscriptStore();
    s.append(doc());
    s.append(doc());

    expect(s.entries[0]).toMatchObject({ live: false, streaming: false });
  });

  it("T1.4 (I4): appending over a live+streaming entry → frozen, and still streaming", () => {
    const s = createTranscriptStore();
    s.append(doc(), { streaming: true });
    s.append(doc());

    // The whole of §2 in one assertion. Freezing touches `live` and must not
    // touch `streaming`, or every `--watch` dies the moment the user types.
    expect(s.entries[0]).toMatchObject({ live: false, streaming: true });
  });

  it("T1.5 (I1): after ten appends, exactly one entry is live and it is the last", () => {
    const s = createTranscriptStore();
    for (let i = 0; i < 10; i += 1) s.append(doc({ command: `c${i}` }));

    expect(s.entries.filter((e) => e.live)).toHaveLength(1);
    expect(s.entries.at(-1)?.live).toBe(true);
    expect(s.liveId).toBe(s.entries.at(-1)?.id);
  });

  it("T1.6 (I10): an invalid document → TranscriptError raised, store unchanged", () => {
    const s = createTranscriptStore();
    s.append(doc());
    const before = s.entries;

    expect(() => s.append(INVALID_DOC)).toThrow(TranscriptError);
    expect(s.entries).toBe(before);
    expect(s.entries).toHaveLength(1);
  });

  it("T1.6b (I10): the error carries validateDocument's reasons, not just a name", () => {
    const s = createTranscriptStore();
    let caught: unknown;
    try {
      s.append(INVALID_DOC);
    } catch (e) {
      caught = e;
    }

    // "invalid document" with no reasons sends the reader back to a document
    // they cannot see.
    expect(caught).toBeInstanceOf(TranscriptError);
    expect((caught as TranscriptError).reasons.join(" ")).toContain("schema");
  });

  it("T1.7: patch on live+streaming → updated, rev incremented, change emitted", () => {
    const s = createTranscriptStore();
    const changes: Change[] = [];
    s.subscribe((c) => void changes.push(c));
    const id = s.append(docOf(1), { streaming: true });

    const r = s.patch(id, appendPatch("extra"));

    expect(r).toEqual({ ok: true, rev: 1 });
    expect(s.entries[0]?.rev).toBe(1);
    expect(s.entries[0]?.doc.blocks).toHaveLength(2);
    expect(changes.at(-1)).toEqual({ kind: "patch", id });
  });

  it("T1.7b (I13): a rejected patch does not bump rev; a cache keyed on it stays valid", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    s.patch(id, appendPatch("extra"));
    const rev = s.entries[0]!.rev;

    // A duplicate blockId — C04 rejects it, and the document is unchanged.
    const r = s.patch(id, appendPatch("extra"));

    expect(r.ok).toBe(false);
    expect(s.entries[0]?.rev).toBe(rev);
  });

  it("T1.7c (I8): the three PatchOutcome shapes, each from its own cause", () => {
    const s = createTranscriptStore();
    const streaming = s.append(docOf(1), { streaming: true });

    const unknown = s.patch("nosuch", appendPatch("x"));
    const bad = s.patch(streaming, { op: "merge", blockId: "b0", rows: [] });
    s.settle(streaming);
    const settled = s.patch(streaming, appendPatch("y"));

    expect(unknown).toEqual({ ok: false, reason: "unknown" });
    expect(settled).toEqual({ ok: false, reason: "settled" });
    expect(bad).toMatchObject({ ok: false, reason: "patch" });
    // Only the data problem carries a message worth putting in a notice.
    expect(bad.ok === false && bad.reason === "patch" && bad.error.message).toBeTruthy();
  });

  it("T1.8 (I4): patch on frozen+streaming → applied. The watch-keeps-running case", () => {
    const s = createTranscriptStore();
    const watch = s.append(docOf(1), { streaming: true });
    s.append(doc());

    const r = s.patch(watch, appendPatch("tick"));

    expect(r).toMatchObject({ ok: true });
    expect(s.entries[0]?.doc.blocks).toHaveLength(2);
    expect(s.entries[0]?.live).toBe(false);
  });

  it("T1.9: settle on live+streaming → live, no longer streaming", () => {
    const s = createTranscriptStore();
    const id = s.append(doc(), { streaming: true });
    s.settle(id);

    expect(s.entries[0]).toMatchObject({ live: true, streaming: false });
    expect(s.liveId).toBe(id);
  });

  it("T1.10: settle on frozen+streaming → frozen, settled", () => {
    const s = createTranscriptStore();
    const watch = s.append(doc(), { streaming: true });
    s.append(doc());
    s.settle(watch);

    expect(s.entries[0]).toMatchObject({ live: false, streaming: false });
  });

  it("T1.11: clear → empty, liveId null, droppedBlocks zero", () => {
    const s = createTranscriptStore({ cap: 2 });
    s.append(docOf(2));
    s.append(docOf(2));
    s.clear();

    expect(s.entries).toEqual([]);
    expect(s.liveId).toBeNull();
    expect(s.droppedBlocks).toBe(0);
    expect(s.blockCount).toBe(0);
  });

  it("T1.12 (I12): each operation emits exactly one Change of the right kind", () => {
    const s = createTranscriptStore();
    const changes: Change[] = [];
    s.subscribe((c) => void changes.push(c));

    const id = s.append(docOf(1), { streaming: true });
    s.patch(id, appendPatch("x"));
    s.settle(id);
    s.clear();

    expect(changes.map((c) => c.kind)).toEqual(["append", "patch", "settle", "clear"]);
  });

  it("T1.13 (I4): all four (live, streaming) states exist and are asserted by name", () => {
    const s = createTranscriptStore();

    // frozen + streaming: the watch that keeps running (§2).
    const frozenStreaming = s.append(doc(), { streaming: true });
    // frozen + settled: an ordinary finished command.
    const frozenSettled = s.append(doc(), { streaming: true });
    s.settle(frozenSettled);
    // live + streaming: a stream in flight right now.
    const liveStreaming = s.append(doc(), { streaming: true });

    const at = (id: string): { live: boolean; streaming: boolean } => {
      const e = s.entries.find((x) => x.id === id);
      return { live: e!.live, streaming: e!.streaming };
    };

    expect(at(frozenStreaming)).toEqual({ live: false, streaming: true });
    expect(at(frozenSettled)).toEqual({ live: false, streaming: false });
    expect(at(liveStreaming)).toEqual({ live: true, streaming: true });

    // live + settled: the fourth, reached by settling the live one.
    s.settle(liveStreaming);
    expect(at(liveStreaming)).toEqual({ live: true, streaming: false });

    // And all four were genuinely distinct, which is the assertion a suite
    // covering three of them would still pass without.
    const seen = new Set(
      [frozenStreaming, frozenSettled, liveStreaming].map((id) => JSON.stringify(at(id))),
    );
    expect(seen.size).toBe(3);
  });

  // --- settle carries the final document (C23 §3 step 6) -------------------
  //
  // **The operation C13 did not have, and nothing noticed for as long as nothing
  // executed a command.** C23 §3 said "patch or replace the entry" and every
  // `ViewPatch` op is block-level, so no caller could give an entry a different
  // document — or, the part that mattered, a different `meta`. C23 I7 reads
  // `$_` from the adapted document's `meta.resultId`, and `/debug` renders its
  // `argv`, `exitCode` and `durationMs`.

  it("T1.9b (I13): settle with a document replaces it and moves rev", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    const before = s.entries[0]?.rev;

    const final = doc({ command: "settled" });
    const outcome = s.settle(id, final);

    expect(outcome).toMatchObject({ ok: true });
    expect(s.entries[0]?.doc.command, "the entry became the document").toBe("settled");
    expect(outcome.ok === true && outcome.rev, "and rev moved with it").toBe((before ?? 0) + 1);
    expect(s.entries[0]).toMatchObject({ streaming: false });
  });

  it("T1.9c (I13): a bare settle moves nothing, because the document did not change", () => {
    // **The common case, and the one a careless `rev` bump would cost.** Every
    // stream that ends settles without a document; moving `rev` there would
    // invalidate a C14 height that is still correct, silently and every time.
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    const before = s.entries[0]?.rev ?? 0;

    const outcome = s.settle(id);

    expect(outcome).toEqual({ ok: true, rev: before });
    expect(s.entries[0]?.rev).toBe(before);
  });

  it("T1.9d (I8): settle reports its two conditions rather than absorbing them", () => {
    // The same two arms `patch` returns, for the same reason: an unknown id is a
    // stale reference and a settled entry is a caller bug, and C23 §8a A2 turns
    // on telling them apart — neither carries an error, and §5 read `.error` off
    // one of them until the trace was walked.
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    s.settle(id);

    expect(s.settle("nosuch"), "a stale reference").toEqual({ ok: false, reason: "unknown" });
    expect(s.settle(id), "already final").toEqual({ ok: false, reason: "settled" });
  });

  it("T1.9e (I10): settle throws on an invalid document, as append does", () => {
    // **Thrown, not returned, and the asymmetry is the point** (§3). The two
    // above are conditions a caller meets legitimately; this is a caller bug —
    // three layers had to fail for an invalid document to arrive, so there is
    // nothing to recover from and returning would invite absorbing it.
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });

    expect(() => s.settle(id, INVALID_DOC)).toThrow(TranscriptError);
    expect(s.entries[0], "and nothing was stored").toMatchObject({ streaming: true });
  });

  it("T1.9f: a settle that throws leaves the entry patchable", () => {
    // The half a throw makes easy to get wrong: rejecting the document must not
    // half-settle the entry, or a stream that emits one bad final document ends
    // up unpatchable *and* unsettled — the state C23 I9 says cannot exist.
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });

    expect(() => s.settle(id, INVALID_DOC)).toThrow();
    expect(s.patch(id, appendPatch("still going"))).toMatchObject({ ok: true });
    expect(s.settle(id, doc({ command: "ok now" }))).toMatchObject({ ok: true });
  });
});
