/**
 * C20 — the history store.
 *
 * History is what makes a shell feel like a shell: `↑↑ Enter` instead of
 * retyping, `⌃r` instead of remembering. This file owns the entries and hands
 * out strings; **it never writes to C17** (I1, MG18). L4 applies what comes back,
 * as it applies `lifecycle.resume()` and a theme switch, and the reason is the
 * same each time — an L3 component that reached into the editor would have to
 * know where the cursor should land, which is the prompt's business.
 *
 * Construction is asynchronous and everything after it is not: the load is
 * awaited once here so that `previous()` can answer a keystroke without
 * returning a promise for a value it already holds.
 */

import { load } from "./codec.js";
import { clearConfirmLayer, listBlocks, searchLayer, type Listed } from "./layers.js";
import { createNavigator } from "./navigate.js";
import { createWriter } from "./persist.js";
import { redact } from "./redact.js";
import { createSearch } from "./search.js";
import {
  DEFAULT_CAP,
  type Anchor,
  type HistoryDeps,
  type HistoryEntry,
  type HistoryStore,
  type SearchState,
} from "./types.js";

const EMPTY_SEARCH: SearchState = Object.freeze({ query: "", hit: null, failed: false });

/** A missing file is a first run, not a fault; anything else is worth a warning. */
async function readOrEmpty(
  read: (path: string) => Promise<string>,
  path: string,
): Promise<string> {
  try {
    return await read(path);
  } catch {
    return "";
  }
}

/**
 * Null bytes stripped, whitespace-only rejected (I20).
 *
 * Both would otherwise reach the file: a null byte from a paste out of a binary
 * buffer, and an empty submit from `Enter` on an untouched prompt.
 */
function normalise(command: string): string {
  return command.replace(/\0/g, "");
}

export async function openHistory(deps: HistoryDeps): Promise<HistoryStore> {
  const cap = deps.cap ?? DEFAULT_CAP;
  const paths = {
    commands: `${deps.stateDir}/history`,
    meta: `${deps.stateDir}/history.meta`,
  };

  const [commandsText, metaText] = await Promise.all([
    readOrEmpty((p) => deps.fs.readFile(p), paths.commands),
    readOrEmpty((p) => deps.fs.readFile(p), paths.meta),
  ]);

  const loaded = load(commandsText, metaText, cap);
  const entries: HistoryEntry[] = [...loaded.entries];

  const writer = createWriter(deps.fs, paths);
  writer.seed(entries, loaded.warnings.length > 0);

  const nav = createNavigator(() => entries);
  const search = createSearch(() => entries, nav);

  function indexed(filter?: string): readonly Listed[] {
    const needle = filter?.toLowerCase();
    const rows: Listed[] = [];
    entries.forEach((entry, index) => {
      if (needle === undefined || entry.command.toLowerCase().includes(needle)) {
        rows.push({ index, entry });
      }
    });
    return rows;
  }

  return {
    append(command, exitCode) {
      const text = normalise(command);
      if (text.trim() === "") return;

      const entry = Object.freeze({ command: text, ts: deps.clock(), exitCode });

      // I4 at append time. The row is still written and the load-time collapse
      // keeps the newest, so disk and memory do not drift apart on the
      // timestamp — the alternative leaves the file describing an older run of
      // a command the session has since repeated.
      if (entries[entries.length - 1]?.command === text) entries[entries.length - 1] = entry;
      else entries.push(entry);

      if (entries.length > cap) entries.splice(0, entries.length - cap);

      // **Redacted here and nowhere else** (I6): `entry` keeps the session's real
      // value so `↑` still works after pasting a token, and only the string
      // handed to the writer is stripped.
      writer.append(entry, redact(text).text);
      writer.compact(cap);

      nav.reset();
    },

    previous(current) {
      return nav.previous(current);
    },

    next() {
      return nav.next();
    },

    resetNavigation() {
      nav.reset();
    },

    search(query, from) {
      return search.find(query, from);
    },

    list(filter) {
      return Object.freeze(indexed(filter).map((row) => row.entry));
    },

    listBlocks(filter) {
      return listBlocks(indexed(filter));
    },

    rerun(index) {
      return entries[index]?.command ?? null;
    },

    clear() {
      entries.length = 0;
      // Unreachable through the real path — `/history clear` is itself a submit,
      // and the submit resets navigation before the confirm is even raised, which
      // C16 will not fire a global shortcut beneath. Total anyway, for a line
      // (§7a Trace 5).
      nav.reset();
      search.cancel();
      writer.reset();
    },

    searchOpen(current) {
      search.open(current);
    },

    searchType(text) {
      search.type(text);
    },

    searchBackspace() {
      search.backspace();
    },

    searchOlder() {
      search.older();
    },

    searchEnd(action) {
      return search.end(action);
    },

    searchLayer(anchor: Anchor) {
      return searchLayer(search.state ?? EMPTY_SEARCH, anchor);
    },

    clearConfirmLayer() {
      return clearConfirmLayer(entries.length);
    },

    async flush() {
      await writer.flush();
    },

    drain() {
      writer.drain();
    },

    get entries() {
      return Object.freeze([...entries]);
    },

    get navigating() {
      return nav.navigating;
    },

    get searchState() {
      return search.state;
    },

    /**
     * Returned, never emitted (I17).
     *
     * C02's ruling, and it transfers whole: C20 decides what is wrong, never
     * when the user is told. C22 §8 restores the screen before printing
     * diagnostics, so a component that chose the moment would be choosing it
     * for a screen that is about to be discarded.
     */
    get warnings() {
      return Object.freeze([...loaded.warnings, ...writer.warnings]);
    },
  };
}
