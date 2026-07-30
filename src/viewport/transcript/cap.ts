/**
 * The block cap, the sweep, and the marker that keeps eviction honest.
 *
 * C13 §5 — see spec.
 *
 * The three claims here are one situation, and A03 §2 records what happens when
 * that is not noticed: the cap bounds blocks, live and streaming entries are
 * exempt, and the excess is reported. Each is correct alone. What was missing
 * was *when* the figure is computed — hence `sweep` being a function called from
 * four places rather than three lines inside `append`.
 */

import { SCHEMA, block, descendants, document } from "../../data/viewmodel/index.js";
import type { Block, ViewDocument } from "../../data/viewmodel/index.js";
import type { EntryId, TranscriptEntry } from "./types.js";

/** D40. A cap on blocks, not entries (I17). */
export const SESSION_BLOCK_CAP = 100_000;

/** The marker's id, fixed: there is at most one, and it is replaced rather than added to. */
export const MARKER_ID = "transcript:evicted";

/**
 * Blocks in a document, counted the way I17 says: nested blocks count, rows do not.
 *
 * The walk is C04's `descendants` rather than a copy. A second copy would miss
 * the next container kind added to the vocabulary — silently, in the component
 * that decides what to evict (C04 §5).
 *
 * **The walk is not shallow**, and the spec says so where the rule is stated: a
 * row's `detail` is a `Block[]` (C11 I2), and D38 makes every row expandable
 * when a column drops, so a 2,000-row table is a tree rather than a leaf. That
 * is why this is called once per document at `append` and once per applied patch
 * on the one entry affected — never over the transcript.
 */
export function countBlocks(doc: ViewDocument): number {
  let n = 0;
  for (const b of doc.blocks) {
    n += 1;
    for (const _ of descendants(b)) n += 1;
  }
  return n;
}

/**
 * The marker entry: a real entry, never a downstream special case (I14).
 *
 * Being real is what keeps `totalRows` correct in C14 with no arithmetic for it
 * anywhere. It is frozen, settled, and never itself evicted.
 *
 * `tone: "muted"` rather than `warn`: reaching the cap in a long session is
 * expected behaviour that must be *stated*, not an alarm. A `warn` would also
 * oblige a glyph (C04 I6), which is a rendering decision C13 has no business
 * making.
 */
export function markerEntry(droppedBlocks: number): TranscriptEntry {
  const notice: Block = block({
    kind: "notice",
    id: `${MARKER_ID}:notice`,
    tone: "muted",
    text:
      `${droppedBlocks.toLocaleString("en-GB")} earlier ` +
      `${droppedBlocks === 1 ? "block" : "blocks"} dropped at the session cap`,
  });

  const doc: ViewDocument = document({
    schema: SCHEMA,
    command: "",
    status: "ok",
    blocks: [notice],
    meta: {
      verb: null,
      adapter: "transcript",
      exitCode: 0,
      durationMs: 0,
      truncated: true,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "refresh",
    },
  });

  return Object.freeze({
    id: MARKER_ID,
    doc,
    live: false,
    streaming: false,
    // Seq 0, and real entries start at 1, so the marker sorts to the head by the
    // same ordering as everything else rather than by a placement rule someone
    // has to remember.
    seq: 0,
    rev: 0,
    blocks: 1,
  });
}

export const isMarker = (e: TranscriptEntry): boolean => e.id === MARKER_ID;

/** What the sweep did, so the caller can emit the right `Change` and update its totals. */
export type SweepResult = Readonly<{
  entries: readonly TranscriptEntry[];
  evicted: readonly EntryId[];
  droppedBlocks: number;
  blockCount: number;
  overCap: number;
}>;

/**
 * §5's sweep. Runs after `append`, `patch` and `settle` — never after only one
 * of them, which was the defect: after a `settle` relieved the pressure the
 * reported overshoot described a condition that no longer held, and I15 exists
 * so L4 can act on the number.
 *
 * The marker is rebuilt *before* the final count because it carries a block of
 * its own. Adding it afterwards leaves a store that evicted down to exactly the
 * cap sitting one block above it until the next command.
 */
export function sweep(
  input: readonly TranscriptEntry[],
  cap: number,
  droppedBlocksSoFar: number,
): SweepResult {
  const survivors = input.filter((e) => !isMarker(e));
  const evicted: EntryId[] = [];
  let dropped = droppedBlocksSoFar;

  // A running sum, not a fold per iteration. T3.13 evicts at a hundred thousand
  // entries, and recomputing the total inside the loop is the O(n²) that turns
  // a bounded-memory test into a timeout.
  let live = survivors.reduce((n, e) => n + e.blocks, 0);
  const marker = (): number => (dropped > 0 ? 1 : 0);

  // Oldest-first (I17), skipping what may never go: the live entry (I5) and any
  // streaming one (I6). The marker is never a candidate — it is not in
  // `survivors` at all, which is how I14 holds without a guard inside the loop.
  let from = 0;
  while (live + marker() > cap) {
    const i = survivors.findIndex((e, k) => k >= from && !e.live && !e.streaming);
    if (i === -1) break; // The cap yields rather than the rule (I6).

    const [gone] = survivors.splice(i, 1);
    if (gone === undefined) break;
    live -= gone.blocks;
    dropped += gone.blocks; // Never silent (I7).
    evicted.push(gone.id);
    from = i; // Everything before `i` was skipped and will be skipped again.
  }

  const blockCount = live + marker();
  const entries = dropped > 0 ? [markerEntry(dropped), ...survivors] : [...survivors];

  return Object.freeze({
    entries: Object.freeze(entries),
    evicted: Object.freeze(evicted),
    droppedBlocks: dropped,
    blockCount,
    overCap: Math.max(0, blockCount - cap),
  });
}
