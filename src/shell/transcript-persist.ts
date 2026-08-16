/**
 * Session resume — writing settled entries and reading them back (C13 I20,
 * C05 I25, roadmap 44).
 *
 * **C20's policy, one level up, and only the policy.** `interaction/history/
 * persist.ts` is the model and three of its rules carry unchanged: one chain, so
 * two writes cannot reach the file in either order; a failed write **rewinds
 * rather than drops**, so the next successful write catches up; and `drain`
 * writes from the last *confirmed* write rather than the last issued one.
 *
 * **What does not carry is the sidecar, and the reason is why this exists at
 * all.** C20 writes two index-aligned files because a history entry is a command
 * *and* its metadata. A document is self-describing — C04 I46 makes it JSON by
 * construction — so one line is one entry and there is nothing to align. And a
 * history entry is immutable once appended where a transcript entry is not:
 * `settle` replaces the document C13 already holds. **Only settled entries are
 * written**, which makes the file append-only in fact rather than by assumption
 * (C13 §5b.3).
 *
 * **Nothing here redacts, and that is a ruling rather than an omission** (C13
 * §5b.4). C20's redactor works on a tokenised command line; a rendered document
 * has eighteen kinds and no tokens, and a redactor wrong about one kind is
 * worse than none because it is switched on. The verb declares instead — C05
 * I25 — and a verb that declares nothing is not written.
 */

import { validateDocument, type ViewDocument } from "../data/viewmodel/index.js";
import type { Manifest } from "../data/manifest/index.js";

/**
 * The filesystem this needs, declared here for `HistoryFs`'s reason: a wider
 * type would let a later edit reach for something the module never needed. C22's
 * `FileSystem` is a superset and satisfies it structurally.
 */
export interface PersistFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;
}

/**
 * How many documents the file keeps.
 *
 * **Unmeasured, and recorded as unmeasured** — `CURSOR_BLINK_MS`'s precedent,
 * because a number whose justification a reader cannot reproduce is a number
 * they delete. The reasoning a measurement would test: a resumed session opens
 * at the bottom (roadmap 44) and a reader scrolls back through tens of entries,
 * not thousands, so this is chosen to be far past use and still small enough
 * that a pathological session cannot quietly fill a disk. It is a **document**
 * count rather than a byte budget because that is the unit the file is written
 * in, and a byte cap would have to cut a line in half to be exact.
 */
export const PERSIST_DOC_CAP = 1_000;

/**
 * Which verbs may be written, resolved once from the manifest and the config.
 *
 * **`declared` rather than `verbs`, and that is a measurement rather than a
 * preference.** Written as `verbs` it made MG24 report `LocalRegistry.verbs`'s
 * exemption stale — a member in a different component that nothing has started
 * consuming — because the rule keys by **name** and not by owner. F160's blind
 * spot, created by a field added the same day, which is exactly the arrival its
 * finding predicts. Renaming keeps the other exemption honest; the rule cannot
 * tell the two apart and no tightening measured so far can.
 */
export type PersistPolicy = Readonly<{ all: boolean; declared: ReadonlySet<string> }>;

/**
 * **An app that declares nothing persists nothing**, and that is what switches
 * the feature on rather than a flag that turns it off (C13 §5b.4). Silence is
 * safe; an app with nothing to hide writes `persist: "all"` on one line.
 */
export function persistPolicy(
  manifest: Manifest | null,
  config: Readonly<{ persist?: "all" }>,
): PersistPolicy {
  const declared = new Set<string>();
  for (const tool of manifest?.tools ?? []) {
    if (tool.persist === true) declared.add(tool.name);
  }
  return { all: config.persist === "all", declared };
}

/**
 * **The verb is read off the document rather than passed alongside it**, because
 * the document is what reaches disk and a decision taken from anything else can
 * disagree with what it decided about. `meta.verb` is `null` for the framework's
 * own notices — a fault, a stall, `/help` — and those are never written: they
 * describe a session that is over, and no verb declared them.
 */
export function persists(policy: PersistPolicy, doc: ViewDocument): boolean {
  const verb = doc.meta.verb;
  if (verb === null || verb === "") return false;
  return policy.all || policy.declared.has(verb);
}

export interface TranscriptWriter {
  /** A settled entry's final document. Called once per entry, never per patch. */
  write(doc: ViewDocument): void;
  /** What was loaded at open, held as written so compaction rewrites the whole file. */
  seed(rows: readonly PersistedRow[]): void;
  flush(): Promise<void>;
  /** The exit path — synchronous, from the last confirmed write. */
  drain(): void;
  readonly warnings: readonly string[];
  readonly rows: number;
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createTranscriptWriter(
  fs: PersistFs,
  path: string,
  cap: number = PERSIST_DOC_CAP,
): TranscriptWriter {
  const rows: string[] = [];
  let issued = 0;
  let confirmed = 0;
  let compactFrom: number | null = null;
  let seq = 0;
  const warnings: string[] = [];
  const seen = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  /** Once per cause, not once per entry — an unwritable directory fails on every one. */
  function warn(cause: string, err: unknown): void {
    const key = `${cause}:${reason(err)}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(`${cause}: ${reason(err)}`);
  }

  function pump(): void {
    chain = chain.then(async () => {
      if (compactFrom !== null) {
        const kept = rows.slice(compactFrom);
        compactFrom = null;
        rows.splice(0, rows.length, ...kept);
        issued = 0;
        confirmed = 0;
        try {
          await fs.writeFile(path, kept.join(""));
          issued = kept.length;
          confirmed = kept.length;
        } catch (err) {
          warn("the transcript could not be compacted", err);
          return;
        }
      }

      if (issued >= rows.length) return;
      const from = issued;
      const slice = rows.slice(from);
      issued = rows.length;
      try {
        await fs.appendFile(path, slice.join(""));
        confirmed = issued;
      } catch (err) {
        // Rewound, not dropped: the next write re-issues this row and every one
        // behind it, which is what *the next successful write catches up* means.
        issued = from;
        warn("the transcript could not be written", err);
      }
    });
  }

  return {
    write(doc) {
      // One line per entry, always: `JSON.stringify` escapes every control
      // character, so a newline inside a block's text cannot end a row. That is
      // what makes an index-aligned sidecar unnecessary (C04 I46).
      //
      // **The envelope carries a sequence number, and it is not decoration.**
      // `drain` writes rows the chain had already issued, because
      // issued-but-unconfirmed is exactly the entry the user just ran — so a
      // row can reach disk twice, once synchronously and once when the held
      // append lands. C20 tolerates the same duplicate and collapses it on load
      // by entry identity; a bare document has no identity to collapse by, so
      // this supplies one. **Found by a test that could construct
      // `issued > confirmed`**, which the obvious fixture could not.
      seq += 1;
      rows.push(`${JSON.stringify({ seq, doc })}\n`);
      if (rows.length > cap) compactFrom = rows.length - cap;
      pump();
    },

    seed(loaded) {
      // **Held rather than counted, and the difference is data loss.**
      // Compaction rewrites the file from `rows`, so a writer seeded with a
      // count would replace a thousand documents with this session's handful —
      // C20 records the same defect in the same words, and the reason it is
      // worth restating is that a count is what the field looks like it wants.
      // **The file's own sequence numbers are kept, not reassigned**, and the
      // defect the other way is an ordering one rather than a duplicate: a
      // session that renumbered from 1 would append `seq` 3 to a file whose
      // rows are 5 and 6, and the next load would sort the newest entry to the
      // top. `seq` continues from the highest seen so the counter is monotone
      // across sessions, which is the only thing the key has to be.
      for (const row of loaded) {
        seq = Math.max(seq, row.seq);
        rows.push(`${JSON.stringify(row)}\n`);
      }
      issued = rows.length;
      confirmed = rows.length;
    },

    async flush() {
      await chain;
    },

    drain() {
      if (confirmed >= rows.length) return;
      const slice = rows.slice(confirmed);
      try {
        fs.appendFileSync(path, slice.join(""));
        confirmed = rows.length;
        if (issued < confirmed) issued = confirmed;
      } catch (err) {
        warn("the transcript could not be written on exit", err);
      }
    },

    get warnings() {
      return warnings;
    },

    get rows() {
      return rows.length;
    },
  };
}

/** A row as it sits on disk: the document, and the key the loader collapses by. */
export type PersistedRow = Readonly<{ seq: number; doc: ViewDocument }>;

export type LoadedTranscript = Readonly<{
  rows: readonly PersistedRow[];
  docs: readonly ViewDocument[];
  /** How many lines were unreadable — a count, because the file is the record. */
  discarded: number;
}>;

/**
 * **A damaged line is dropped and the rest are kept**, which is C20's repair
 * policy rather than its own: a session that refuses to start because one line
 * of a resume file has a stray byte in it has made a convenience into a
 * dependency.
 *
 * Every line goes through `validateDocument` — this is untrusted input in the
 * strongest sense, a file on disk that anything could have written, and C04 I46
 * is what makes the round trip a document rather than a shape that looks like
 * one.
 */
export async function loadTranscript(fs: PersistFs, path: string): Promise<LoadedTranscript> {
  let text: string;
  try {
    text = await fs.readFile(path);
  } catch {
    return { rows: [], docs: [], discarded: 0 };
  }

  // **Keyed by `seq`, last wins, and the order is the file's.** `drain` can put
  // a row on disk that the held append then writes again, so the reader is what
  // makes the exit path safe — the same division C20 uses, where the writer
  // tolerates a duplicate and the load collapses it.
  const bySeq = new Map<number, ViewDocument>();
  let discarded = 0;
  for (const line of text.split("\n")) {
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      discarded += 1;
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) {
      discarded += 1;
      continue;
    }
    const row = parsed as Readonly<{ seq?: unknown; doc?: unknown }>;
    if (typeof row.seq !== "number" || !Number.isFinite(row.seq)) {
      discarded += 1;
      continue;
    }
    const valid = validateDocument(row.doc);
    if (valid.ok) bySeq.set(row.seq, valid.value);
    else discarded += 1;
  }
  const ordered = [...bySeq.entries()].sort((a, b) => a[0] - b[0]);
  return {
    rows: ordered.map(([seq, doc]) => ({ seq, doc })),
    docs: ordered.map(([, doc]) => doc),
    discarded,
  };
}
