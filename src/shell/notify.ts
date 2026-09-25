/**
 * C22 §6n — notifications: reaching a reader who left (ruling 27, `R-NTF-001`).
 *
 * *A four-minute turn means you left. Something has to reach you* (§014). Three
 * rungs — the bell, a system notification, the title — each opted into by the
 * reader (C02 I17) and each fired only while the terminal last said it had lost
 * focus (I127). **Nothing here moves the reader** (I129): no entry, no focus, no
 * scroll and no frame; the rungs' bytes are the whole of the output.
 *
 * Two halves, as §6m's: `earns` is §6n.2's table as a function of three facts,
 * and `createNotifier` is the one place that remembers — what has been said,
 * what is watched, and whether the reader is here.
 */
import type { NotifyRung } from "../terminal/capabilities.js";
import { completionLine, failed, type LinearEntry } from "./linear.js";

/** §014's *~30s*, read as the design's (§6n.4 ruling 1). */
export const LONG_TURN_MS = 30_000;

/** The word a fact carries into the title (§6n.2's last column). */
export type NotifyWord = "done" | "failed" | "waiting";

/**
 * §6n.2's table (I126): **one settle, at most one notification**, and the
 * failure is the more specific row whenever it applies. A watched end earns
 * always; any other end only past 30 s. `null` is the short end — §014's *a
 * tool call ended, never*.
 */
export function earns(fact: Readonly<{ failed: boolean; watched: boolean; durationMs: number }>): NotifyWord | null {
  if (fact.failed) return "failed";
  if (fact.watched || fact.durationMs >= LONG_TURN_MS) return "done";
  return null;
}

export type NotifierDeps = Readonly<{
  /** The rungs opted into, canonical (C02 I17). */
  rungs: readonly NotifyRung[];
  /** Whether the terminal takes OSC 9 (C02 I16). */
  system: boolean;
  binary: string;
  /** The title's lead mark, resolved against the capability (C09 I22): `•`, or `-` in ASCII. */
  mark: string;
  /** The call grammar's separator slot (C09 I49), never a literal `·` (F828). */
  separator: string;
  /** The entry by id, as the transcript now holds it. */
  entryOf: (id: string) => LinearEntry | undefined;
  bell: () => void;
  notify: (text: string) => void;
  title: (text: string) => void;
  restoreTitle: () => void;
}>;

export type Notifier = Readonly<{
  /** A focus report (C16 I61): `false` is the reader leaving, `true` returning. */
  focus: (focused: boolean) => void;
  /** An entry that may have settled (C13's `append` or `settle`). */
  settled: (id: string) => void;
  /** A question arrived; `line` is §6m's question line (I122). */
  asked: (line: string) => void;
  /** Watch a streaming entry (I130); `false` for anything else. */
  watch: (id: string) => boolean;
}>;

export function createNotifier(deps: NotifierDeps): Notifier {
  /**
   * **Never reported is focused** (I127, §014 *detected, not assumed*): a
   * terminal that has not said it lost focus is one the reader may be looking
   * at, and a bell there is the beep §014 says gets a tool muted.
   */
  let away = false;
  /** Facts already reported, by id — a second settle says nothing (I126). */
  const said = new Set<string>();
  const watched = new Set<string>();
  const opted = new Set(deps.rungs);

  /** Every opted rung, in the order bell, system, title (I128). */
  const fire = (word: NotifyWord, line: string): void => {
    if (opted.has("bell")) deps.bell();
    if (opted.has("system") && deps.system) deps.notify(`${deps.binary}: ${line}`);
    if (opted.has("title")) deps.title(`${deps.mark} ${deps.binary} ${deps.separator} ${word}`);
  };

  return Object.freeze({
    focus(focused) {
      away = !focused;
      // The title comes back with the reader (C01 I24); the pop is a no-op
      // when nothing was pushed.
      if (focused) deps.restoreTitle();
    },
    settled(id) {
      const entry = deps.entryOf(id);
      // Gone, or still running: nothing to say yet (§6n.3 row 10).
      if (entry === undefined || entry.streaming || said.has(id)) return;
      said.add(id);
      // **The watch drops at settle** (I130), whether or not this earns — a
      // declaration about a run that has ended has nothing left to watch.
      const isWatched = watched.delete(id);
      if (!away) return;
      const word = earns({ failed: failed(entry.doc), watched: isWatched, durationMs: entry.doc.meta.durationMs });
      if (word !== null) fire(word, completionLine(entry));
    },
    asked(line) {
      if (away) fire("waiting", line);
    },
    watch(id) {
      const entry = deps.entryOf(id);
      if (entry === undefined || !entry.streaming) return false;
      watched.add(id);
      return true;
    },
  });
}
