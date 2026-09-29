/**
 * C22 §6p — the session's watches (ruling 50, §085, I135).
 *
 * *A watch is not a tab and not a push — it is a pointer INTO the transcript*
 * (§085). The set was the notifier's (I130), and a notifier exists only while a
 * rung is opted in — so a reader who never set `CALCIUM_NOTIFY`, which is every
 * reader by default, would have had nowhere to keep a watch the footer has to
 * show. It is the session's now, and the notifier asks it.
 *
 * **What it does not do is subscribe.** The drop at settle has to come after the
 * notifier's read — a watched short end earns `done` only if it is still
 * watched when the notifier asks — and two subscribers on one change is an
 * order nothing states. So the composition root's one subscription calls the
 * notifier and then `settled` here, in that order, and the order is a line of
 * code rather than a registration sequence (§6p.3 row 4).
 */

/** What the store needs of an entry — whether the transcript holds it, and whether it is still running. */
export type WatchEntryOf = (id: string) => Readonly<{ streaming: boolean }> | undefined;

export type WatchStore = Readonly<{
  /**
   * Watch a streaming entry the transcript holds (I130, I135). `true` for one
   * newly or already watched — a second watch changes nothing, order included
   * — and `false` for a settled entry or an id the transcript does not hold.
   */
  watch: (id: string) => boolean;
  /** Whether a watch was released. */
  unwatch: (id: string) => boolean;
  has: (id: string) => boolean;
  /** Oldest first — the order they were watched in, which is the row's. */
  ids: () => readonly string[];
  /** An entry that may have settled: dropped if it is gone or no longer streaming. */
  settled: (id: string) => void;
  /** The transcript was cleared; every subject went with it. */
  clear: () => void;
}>;

export function createWatches(entryOf: WatchEntryOf): WatchStore {
  // A `Set` keeps insertion order, and insertion order is the row's.
  const watched = new Set<string>();
  return Object.freeze({
    watch(id) {
      if (watched.has(id)) return true;
      const entry = entryOf(id);
      if (entry === undefined || !entry.streaming) return false;
      watched.add(id);
      return true;
    },
    unwatch: (id) => watched.delete(id),
    has: (id) => watched.has(id),
    ids: () => Object.freeze([...watched]),
    settled(id) {
      // **It drops itself when the run ends** (I130). Asked of the entry rather
      // than taken on the change's word, because `append` also arrives here and
      // an appended entry that is still streaming has not ended.
      const entry = entryOf(id);
      if (entry === undefined || !entry.streaming) watched.delete(id);
    },
    clear: () => watched.clear(),
  });
}

/**
 * What the row shows of one watch (I137, I139): its name, and its progress
 * where its entry has any. Built per frame from the entry as the transcript
 * holds it, so a patch is on the next frame and nothing is copied at `/watch`.
 */
export type WatchItem = Readonly<{
  id: string;
  name: string;
  progress?: Readonly<{ current: number; total: number }>;
}>;

/** An entry as the row reads it — structural, for `WatchEntryOf`'s reason. */
type WatchedEntry = Readonly<{
  id: string;
  doc: Readonly<{ command: string; meta: Readonly<{ argv: readonly string[] }>; blocks: readonly unknown[] }>;
}>;

/**
 * The entry's name, as the reader typed it (I136, I137): the command line, else
 * the argv the shell recorded, else the id — never empty, because a chip with
 * no name is a bar nobody can tell apart from the next.
 */
export function watchName(entry: WatchedEntry): string {
  const line = entry.doc.command.trim();
  if (line !== "") return line;
  const argv = entry.doc.meta.argv.join(" ").trim();
  return argv === "" ? entry.id : argv;
}

/**
 * The first `progress` block, depth first through `children` (I137).
 *
 * **The first and not a sum**: an entry with two bars is two facts, and the row
 * has room for one; the first is the one its own body leads with.
 */
export function firstProgress(blocks: readonly unknown[]): Readonly<{ current: number; total: number }> | undefined {
  for (const b of blocks) {
    if (typeof b !== "object" || b === null) continue;
    const r = b as { kind?: unknown; current?: unknown; total?: unknown; children?: unknown };
    if (r.kind === "progress" && typeof r.current === "number" && typeof r.total === "number") {
      return { current: r.current, total: r.total };
    }
    if (Array.isArray(r.children)) {
      const inner = firstProgress(r.children as readonly unknown[]);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

/** One watch as the row draws it (I137). */
export function watchItem(entry: WatchedEntry): WatchItem {
  const progress = firstProgress(entry.doc.blocks);
  return progress === undefined
    ? { id: entry.id, name: watchName(entry) }
    : { id: entry.id, name: watchName(entry), progress };
}
