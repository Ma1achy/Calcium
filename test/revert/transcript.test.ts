// C13 tier 6 — fail-on-revert. Each names the change that makes it fail.
//
// The form is "removing X → T-something fails", not "assert X". A tier-6 test that
// only restates an assertion tells a later reader nothing about what they are
// about to break, and the whole value of this tier is being the note left for the
// person holding the knife.
import { describe, expect, it } from "vitest";
import { createTranscriptStore, TranscriptError } from "../../src/viewport/transcript/index.js";
import { markerEntry, sweep } from "../../src/viewport/transcript/cap.js";
import { appendPatch, docOf } from "../support/transcript.js";
import { doc } from "../support/blocks.js";
import type { Change } from "../../src/viewport/transcript/index.js";

describe("C13 fail-on-revert", () => {
  it("T6.1 (I4): stopping a stream on freeze → T1.8 and T5.2 fail, and a watch dies on every keystroke", () => {
    const s = createTranscriptStore();
    const watch = s.append(docOf(1, "w"), { streaming: true });
    s.append(doc());

    // Clearing `streaming` inside the freeze in `append` is a one-word change and
    // it reads as tidy: the entry is no longer current, so why would it stream?
    // Because a subscription the user started is not the user's attention.
    expect(s.entries[0]?.streaming).toBe(true);
    expect(s.patch(watch, appendPatch("tick"))).toMatchObject({ ok: true });
  });

  it("T6.2 (I1): allowing two live entries → T1.5 fails and focus becomes ambiguous", () => {
    const s = createTranscriptStore();
    for (let i = 0; i < 5; i += 1) s.append(doc({ command: `c${i}` }));

    // Not clearing `live` on the previous entry during `append`.
    expect(s.entries.filter((e) => e.live)).toHaveLength(1);
    expect(s.entries.at(-1)?.live).toBe(true);
  });

  it("T6.3 (I2): adding a public freeze → 'the last entry is live' stops holding by construction", () => {
    const s = createTranscriptStore();
    s.append(doc());

    // A03 §2's shape: this is not an assertion about behaviour but about the
    // *surface*. `freeze` was declared in A02 §2 and struck, and it would arrive
    // next as a convenience for a caller who wants to stop accepting input.
    expect("freeze" in s).toBe(false);
    expect(Object.keys(s)).not.toContain("freeze");
  });

  it("T6.4 (I5): evicting the live entry under pressure → T3.7 fails", () => {
    const s = createTranscriptStore({ cap: 1 });
    const id = s.append(docOf(50));

    // Dropping `!e.live` from the sweep's candidate predicate. The store would
    // meet its cap perfectly and the user would watch what they just ran vanish.
    expect(s.liveId).toBe(id);
    expect(s.entries.some((e) => e.id === id)).toBe(true);
    expect(s.overCap).toBeGreaterThan(0);
  });

  it("T6.5 (I6): evicting a streaming entry → T3.8 fails and the stream writes into nothing", () => {
    const s = createTranscriptStore({ cap: 1 });
    const watch = s.append(docOf(20, "w"), { streaming: true });
    s.append(docOf(1, "c"));

    // Dropping `!e.streaming`. The cap would be met and the next tick would
    // return `unknown` for an entry the caller has every reason to think exists.
    expect(s.entries.some((e) => e.id === watch)).toBe(true);
    expect(s.patch(watch, appendPatch("tick"))).toMatchObject({ ok: true });
  });

  it("T6.6 (I7): silent eviction → T3.9 fails", () => {
    const s = createTranscriptStore({ cap: 2 });
    s.append(docOf(5, "a"));
    s.append(docOf(2, "b"));

    // Evicting without adding to `droppedBlocks`, or without the marker. A
    // session that quietly loses its beginning is worse than one that says so.
    expect(s.droppedBlocks).toBe(5);
    expect(s.entries[0]?.id).toBe("transcript:evicted");
  });

  it("T6.7 (I3): reusing ids after eviction → T2.3 and T3.12 fail", () => {
    const s = createTranscriptStore({ cap: 2 });
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(s.append(docOf(2, `d${i}`)));

    // Deriving the id from the array index, or resetting `#seq` on eviction.
    // A stale reference would then resolve to a *different* entry, which is
    // worse than resolving to nothing.
    expect(seen.size).toBe(200);
  });

  it("T6.8 (I9): using a timestamp for seq → T2.2 fails and golden frames flake", () => {
    const s = createTranscriptStore();
    const a = s.append(doc());
    const b = s.append(doc());

    const seqs = s.entries.map((e) => e.seq);
    // Logical: 1, 2, and small. `Date.now()` would pass "increasing" and fail
    // every reproducibility claim built on top of it.
    expect(seqs).toEqual([1, 2]);
    expect(a).not.toBe(b);
  });

  it("T6.9 (I12): collapsing Change to a bare notification → T4.3 fails and every log line remeasures", () => {
    const s = createTranscriptStore({ cap: 2 });
    const changes: Change[] = [];
    s.subscribe((c) => void changes.push(c));

    const id = s.append(docOf(1, "a"), { streaming: true });
    s.patch(id, appendPatch("x"));
    s.settle(id);
    s.append(docOf(3, "b"));
    s.clear();

    // Every variant carries its subject. An `evict` that did not name its ids
    // would force C14 to diff `entries` to find out what left.
    const kinds = changes.map((c) => c.kind);
    expect(new Set(kinds)).toEqual(new Set(["append", "patch", "settle", "evict", "clear"]));
    const evict = changes.find((c) => c.kind === "evict");
    expect(evict && "ids" in evict ? evict.ids.length : 0).toBeGreaterThan(0);
  });

  it("T6.10 (I8): absorbing a patch to a settled entry → T3.5 fails, hiding a caller bug", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    s.settle(id);

    // Returning `{ok: true}` — or `void` — for a patch that did not apply. The
    // stream outliving its `settle` is the bug; absorbing it is how it survives.
    expect(s.patch(id, appendPatch("x"))).toEqual({ ok: false, reason: "settled" });
  });

  it("T6.11 (I13): failing to bump rev on patch → C14's cache serves a stale height", () => {
    const s = createTranscriptStore();
    const id = s.append(docOf(1), { streaming: true });
    const before = s.entries[0]!.rev;

    s.patch(id, appendPatch("x"));

    // The patch changed the block count, so it changed the height. Without the
    // bump the cache key is unchanged and the viewport drifts — three components
    // away from the line that caused it.
    expect(s.entries[0]?.rev).toBe(before + 1);
    expect(s.entries[0]?.doc.blocks.length).toBeGreaterThan(1);
  });

  it("T6.12 (I15): sweeping only on append → T3.7b fails and L4 warns about a dead condition", () => {
    const s = createTranscriptStore({ cap: 2 });
    const watch = s.append(docOf(4, "w"), { streaming: true });
    s.append(docOf(1, "c"));
    const over = s.overCap;
    expect(over).toBeGreaterThan(0);

    s.settle(watch);

    // This is the defect the spec commit fixed. Moving the sweep back inside
    // `append` leaves `overCap` at `over` until a command that may never come.
    expect(s.overCap).toBeLessThan(over);
  });

  it("T6.13 (I14): making the marker a downstream special case → C14 grows arithmetic for it", () => {
    const m = markerEntry(42);

    // The marker is a real entry: a real document, a real block, real flags.
    // Representing it as a `droppedBlocks` number for C14 to render specially is
    // the change, and it puts one `if` in every row calculation above here.
    expect(m.doc.blocks).toHaveLength(1);
    expect(m.blocks).toBe(1);
    expect(m).toMatchObject({ live: false, streaming: false });
    // And it is excluded from the sweep by not being a candidate at all, rather
    // than by a guard someone could drop.
    const r = sweep([m], 0, 42);
    expect(r.evicted).toEqual([]);
    expect(r.entries.map((e) => e.id)).toEqual(["transcript:evicted"]);
  });

  it("T6.14 (I10): returning a Result from append instead of throwing → C23 §5's row goes dead", () => {
    const s = createTranscriptStore();

    // The asymmetry is the decision: an invalid document is a caller defect with
    // no recovery, and C23 §5 already names `transcript.append` the one stage
    // whose failure loses the outcome. A `Result` invites handling that cannot help.
    expect(() => s.append({ ...doc(), schema: "nope" } as never)).toThrow(TranscriptError);
    expect(s.entries).toEqual([]);
  });
});
