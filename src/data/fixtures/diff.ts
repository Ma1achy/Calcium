/**
 * `record --diff` — structure only, and the count before the work.
 *
 * C08 §2, I15, A01 D46 — see spec. This is the last unbuilt half of A01 §5's
 * wiring checklist, and what it is for is stated there better than here: **every
 * structural delta is one adapter line**, and printing the count first turns
 * integration from an unbounded archaeology exercise into a job with a visible
 * finish line.
 *
 * **Values are never reported.** A timestamp that moved, a UUID that changed, a
 * loss that is 0.31 instead of 0.34 — all expected, all noise, and a diff that
 * reported them would be one nobody reads. What matters is a field that appeared,
 * a field that vanished, and a field whose type changed, because those three are
 * the ones an adapter has to be told about.
 *
 * The name: an earlier draft also called this `--verify`. It was the same
 * operation under a second name, not a third operation, and the second name is
 * gone (C08 commitment 3).
 */

import type { Fixture, RawPatch, RawResult } from "../transport/types.js";
import { authoredRatio, formatRatio } from "./provenance.js";

export type DeltaKind = "added" | "removed" | "type-changed";

export type Delta = Readonly<{
  /** `data[].loss_history`, `count`. Array indices collapse to `[]`. */
  path: string;
  kind: DeltaKind;
  /** The committed corpus's type, or null when the field is new. */
  before: string | null;
  /** The freshly recorded type, or null when the field is gone. */
  after: string | null;
}>;

export type FixtureDiff = Readonly<{
  id: string;
  verb: string;
  deltas: readonly Delta[];
}>;

export type CorpusDiff = Readonly<{
  /** Present in both, structurally identical. */
  matched: readonly string[];
  /** Present in both, structurally different. */
  changed: readonly FixtureDiff[];
  /** In the fresh recording, absent from the committed corpus. */
  added: readonly string[];
  /** In the committed corpus, absent from the fresh recording. */
  removed: readonly string[];
  /** The number `--diff` prints before any of the work (I15). */
  deltaCount: number;
}>;

/**
 * The type name a delta reports.
 *
 * `null` is its own type rather than "object". A field that goes from `null` to
 * an object is exactly the case an adapter must handle and a merged reading
 * would hide.
 */
function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Flatten a value to `path → type`.
 *
 * **Array indices collapse to `[]` and the elements' shapes merge.** A recording
 * with three runs and one with four are the same structure, and reporting
 * `data[3].status` as an added field would bury the real deltas under the
 * corpus's row count. The merge means a heterogeneous array — one element with
 * an extra field — reports that field as present, which is the safe direction:
 * an adapter that handles a field some elements lack is correct, one that
 * assumes a field no element has is not.
 */
function shapeOf(value: unknown, path = "", into = new Map<string, string>()): Map<string, string> {
  const type = typeOf(value);
  if (path !== "") into.set(path, type);

  if (Array.isArray(value)) {
    for (const item of value) shapeOf(item, `${path}[]`, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      shapeOf(child, path === "" ? key : `${path}.${key}`, into);
    }
  }

  return into;
}

function compareShapes(before: unknown, after: unknown): readonly Delta[] {
  const a = shapeOf(before);
  const b = shapeOf(after);
  const deltas: Delta[] = [];

  for (const [path, beforeType] of a) {
    const afterType = b.get(path);
    if (afterType === undefined) {
      deltas.push({ path, kind: "removed", before: beforeType, after: null });
    } else if (afterType !== beforeType) {
      deltas.push({ path, kind: "type-changed", before: beforeType, after: afterType });
    }
  }
  for (const [path, afterType] of b) {
    if (!a.has(path)) deltas.push({ path, kind: "added", before: null, after: afterType });
  }

  // Sorted by path so the same pair of corpora always produces the same report.
  // A diff whose line order depends on iteration order is one that shows up as
  // changed in review when nothing changed.
  return deltas.sort((x, y) => x.path.localeCompare(y.path) || x.kind.localeCompare(y.kind));
}

/**
 * The payload a fixture's structure is read from.
 *
 * `stdout` for a settled result; for a stream, the data patches merged with the
 * terminal result, because a streaming verb's structure lives in its patches and
 * a diff that only looked at `end` would be blind to the shape of everything
 * that arrived before it.
 */
function payloadOf(fixture: Fixture): unknown {
  if (!Array.isArray(fixture.result)) return (fixture.result as RawResult).stdout;

  const patches = fixture.result as readonly RawPatch[];
  const data = patches.filter((p) => p.kind === "data").map((p) => p.value);
  const end = patches.find((p) => p.kind === "end");
  return { patches: data, ...(end?.kind === "end" ? { result: end.result.stdout } : {}) };
}

/**
 * Committed corpus against a fresh recording.
 *
 * Matched on `id`, not on verb + argv: an id is what a recording session carries
 * forward, and matching on the invocation would report a fixture whose argv was
 * intentionally changed as one removed and one added rather than as one changed.
 */
export function diffCorpus(
  committed: readonly Fixture[],
  fresh: readonly Fixture[],
): CorpusDiff {
  const byId = new Map(fresh.map((f) => [f.id, f]));
  const matched: string[] = [];
  const changed: FixtureDiff[] = [];
  const removed: string[] = [];

  for (const before of committed) {
    const after = byId.get(before.id);
    if (after === undefined) {
      removed.push(before.id);
      continue;
    }
    const deltas = compareShapes(payloadOf(before), payloadOf(after));
    if (deltas.length === 0) matched.push(before.id);
    else changed.push({ id: before.id, verb: before.verb, deltas });
  }

  const committedIds = new Set(committed.map((f) => f.id));
  const added = fresh.filter((f) => !committedIds.has(f.id)).map((f) => f.id);

  return {
    matched,
    changed,
    added,
    removed,
    deltaCount: changed.reduce((n, c) => n + c.deltas.length, 0),
  };
}

function arrow(delta: Delta): string {
  switch (delta.kind) {
    case "removed":
      return `missing in actual  →  was ${delta.before ?? "?"}`;
    case "added":
      return `new in actual  →  ${delta.after ?? "?"}`;
    case "type-changed":
      return `present in both, differs in type  →  ${delta.before ?? "?"} → ${delta.after ?? "?"}`;
  }
}

/**
 * The report of §2, count first.
 *
 * The ordering is the commitment, not a formatting preference: someone runs this
 * to find out how big the job is, and a header that arrives after the detail
 * answers the question only for people who scroll.
 *
 * The header also carries the authored ratio (I15). This is the command run by
 * whoever cares about corpus health, and a ratio nothing prints is a field
 * rather than a report.
 */
export function formatDiff(diff: CorpusDiff, corpus: readonly Fixture[] = []): readonly string[] {
  const total = diff.matched.length + diff.changed.length;
  const lines: string[] = [];

  lines.push(
    `${String(total)} fixtures · ${String(diff.matched.length)} match · ` +
      `${String(diff.changed.length)} with deltas · ` +
      `${String(diff.deltaCount)} structural ${diff.deltaCount === 1 ? "delta" : "deltas"}`,
  );
  if (diff.added.length > 0) lines.push(`${String(diff.added.length)} new, not in the corpus`);
  if (diff.removed.length > 0) lines.push(`${String(diff.removed.length)} gone from the far side`);
  if (corpus.length > 0) lines.push(...formatRatio(authoredRatio(corpus)));

  lines.push("");

  for (const entry of diff.changed) {
    const n = entry.deltas.length;
    lines.push(`  ${entry.id}  ✗  ${String(n)} field ${n === 1 ? "mismatch" : "mismatches"}`);
    for (const delta of entry.deltas) lines.push(`      ${delta.path}      ${arrow(delta)}`);
    lines.push("");
  }
  for (const id of diff.matched) lines.push(`  ${id}  ✓  matches`);

  return lines;
}
