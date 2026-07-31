/**
 * Getting entries onto disk without losing one and without blocking a keystroke
 * (§2, I8, I16, I18, I27).
 *
 * Three rules hold this together and each was a defect first:
 *
 *   - **One chain.** Two appends in flight can reach the two files in either
 *     order, and index alignment is the only thing the sidecar promises.
 *   - **Failure rewinds rather than drops.** A failed write leaves its rows
 *     unissued so the next successful write catches up (T3.8), and the cause is
 *     recorded once rather than per command (T3.7).
 *   - **`drain` writes from the last *confirmed* write**, not the last issued
 *     one. Issued-but-unconfirmed is exactly the command the user just typed;
 *     the duplicate this may produce is collapsed on load by I4 (§7a Trace 6).
 */

import { commandLine, metaLine } from "./codec.js";
import { COMPACT_SLACK, type HistoryEntry, type HistoryFs } from "./types.js";

export type Paths = Readonly<{ commands: string; meta: string }>;

export interface Writer {
  /**
   * What was already on disk when the session opened, counted as written —
   * unless the load was damaged, in which case the first write rewrites the
   * file rather than appending to it.
   */
  seed(entries: readonly HistoryEntry[], damaged?: boolean): void;
  append(entry: HistoryEntry, redacted: string): void;
  compact(cap: number): void;
  /** `/history clear` — both files emptied together. */
  reset(): void;
  flush(): Promise<void>;
  drain(): void;
  readonly warnings: readonly string[];
  readonly rows: number;
}

type Row = Readonly<{ command: string; meta: string }>;

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createWriter(fs: HistoryFs, paths: Paths): Writer {
  /**
   * The **redacted** form of every entry, which is what makes I6 hold without a
   * second rule: the store keeps the session's real values and this list never
   * sees them, so compaction cannot rewrite a redacted file with plain text.
   */
  const rows: Row[] = [];
  let issued = 0;
  let confirmed = 0;
  let compactFrom: number | null = null;
  const warnings: string[] = [];
  const seen = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  /** Once per cause, not once per command — a read-only home fails on every append (T3.7). */
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
          await fs.writeFile(paths.commands, kept.map((r) => r.command).join(""));
          await fs.writeFile(paths.meta, kept.map((r) => r.meta).join(""));
          issued = kept.length;
          confirmed = kept.length;
        } catch (err) {
          warn("history could not be compacted", err);
          return;
        }
      }

      if (issued >= rows.length) return;
      const from = issued;
      const slice = rows.slice(from);
      issued = rows.length;
      try {
        await fs.appendFile(paths.commands, slice.map((r) => r.command).join(""));
        await fs.appendFile(paths.meta, slice.map((r) => r.meta).join(""));
        confirmed = issued;
      } catch (err) {
        // Rewound, not dropped: the next append re-issues this row and every one
        // behind it, which is what "the next successful write catches up" means.
        issued = from;
        warn("history could not be written", err);
      }
    });
  }

  return {
    /**
     * Seeded rather than started empty, and the alternative is a data-loss bug
     * rather than an inefficiency: compaction rewrites both files from `rows`,
     * so a writer that had never seen the loaded entries would replace ten
     * thousand commands with this session's handful.
     *
     * The loaded commands are already redacted — they came off disk — so seeding
     * cannot smuggle a session value into the file either.
     */
    seed(entries, damaged = false) {
      for (const entry of entries) rows.push({ command: commandLine(entry.command), meta: metaLine(entry) });
      issued = rows.length;
      confirmed = rows.length;
      // **A damaged file is repaired at open, not appended to.**
      //
      // Without the repair the corruption is permanent: T5.6's session opens,
      // warns, works — and every session after it opens on the same broken file
      // and loses everything again, silently, because appending to a file we
      // have already declared unreadable changes nothing about it.
      //
      // At open rather than on the first write, because `drain` has no
      // synchronous rewrite — only `appendFileSync` — so a session that
      // recorded a command and then exited would have appended it to a file the
      // next load discards. Repairing here means the exit path always appends
      // to a file worth appending to.
      if (damaged) {
        compactFrom = 0;
        pump();
      }
    },

    append(entry, redacted) {
      rows.push({ command: commandLine(redacted), meta: metaLine(entry) });
      pump();
    },

    /**
     * Queued rather than immediate, so compaction cannot interleave with a write
     * already in flight — the same chain that keeps the two files aligned.
     */
    compact(cap) {
      if (rows.length <= cap + COMPACT_SLACK) return;
      compactFrom = rows.length - cap;
      pump();
    },

    reset() {
      rows.length = 0;
      issued = 0;
      confirmed = 0;
      compactFrom = null;
      chain = chain.then(async () => {
        try {
          await fs.writeFile(paths.commands, "");
          await fs.writeFile(paths.meta, "");
        } catch (err) {
          warn("history could not be cleared", err);
        }
      });
    },

    async flush() {
      await chain;
    },

    drain() {
      if (confirmed >= rows.length) return;
      const slice = rows.slice(confirmed);
      try {
        fs.appendFileSync(paths.commands, slice.map((r) => r.command).join(""));
        fs.appendFileSync(paths.meta, slice.map((r) => r.meta).join(""));
        confirmed = rows.length;
        if (issued < confirmed) issued = confirmed;
      } catch (err) {
        warn("history could not be written on exit", err);
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
