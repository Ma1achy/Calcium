/**
 * The file format, and what a damaged one yields (§2, I7, I9, I10).
 *
 * One command per line with a sidecar of `ts exitCode` per line, index-aligned.
 * The format is only viable because newlines are escaped: C17 §4 shipped three
 * newline bindings, so multi-line commands are real and a one-command-per-line
 * file that ignores them corrupts on the first `Alt-Enter`.
 *
 * **This file works in code-unit space and is allowed to** (SS40): it is a lexer
 * over a line, where a unit count is the correct measure. Nothing here measures
 * display width.
 */

import { DEFAULT_CAP, type HistoryEntry } from "./types.js";

/** `\` first, or the escape of a newline is itself escaped on the next pass. */
export function escape(command: string): string {
  return command.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

/** `null` for an invalid escape — a file no writer of ours produced (§2 Corruption). */
export function unescape(line: string): string | null {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }
    const next = line[i + 1];
    if (next === "\\") out += "\\";
    else if (next === "n") out += "\n";
    else return null;
    i += 2;
  }
  return out;
}

export function commandLine(command: string): string {
  return `${escape(command)}\n`;
}

export function metaLine(entry: HistoryEntry): string {
  return `${String(entry.ts)} ${String(entry.exitCode)}\n`;
}

export type Load = Readonly<{ entries: readonly HistoryEntry[]; warnings: readonly string[] }>;

/**
 * Lines, and whether the file ended mid-entry.
 *
 * Every entry is written with its terminator, so a last line without one is an
 * interrupted append — one entry, caught mid-flight by a crash. Dropping it
 * alone is the whole of the remedy; discarding the other 9,999 would be the
 * corruption rule doing more damage than the corruption.
 */
function linesOf(text: string): Readonly<{ lines: readonly string[]; partial: boolean }> {
  if (text === "") return { lines: [], partial: false };
  const parts = text.split("\n");
  const last = parts[parts.length - 1];
  if (last === "") return { lines: parts.slice(0, -1), partial: false };
  return { lines: parts.slice(0, -1), partial: true };
}

const META = /^(\d+) (-?\d+)$/;

/**
 * A load, which never fails.
 *
 * Refusing to start because history is unreadable would be a worse failure than
 * losing it (I9), so every path here ends in entries and warnings. The sidecar
 * going missing while the commands survive is common enough — a partial copy, an
 * interrupted rotation — that the commands are kept and the metadata reset.
 */
export function load(commandsText: string, metaText: string, cap = DEFAULT_CAP): Load {
  const warnings: string[] = [];

  if (commandsText.includes("\0")) {
    return { entries: [], warnings: ["history file is malformed (null byte); starting empty"] };
  }

  const commands = linesOf(commandsText);
  if (commands.partial) warnings.push("history file ended mid-entry; the last command was dropped");

  const decoded: string[] = [];
  for (const line of commands.lines) {
    const command = unescape(line);
    if (command === null) {
      return { entries: [], warnings: ["history file is malformed (bad escape); starting empty"] };
    }
    decoded.push(command);
  }

  const meta = linesOf(metaText);
  const stamps: Readonly<{ ts: number; exitCode: number }>[] = [];
  let metaOk = meta.lines.length === decoded.length && !meta.partial;
  if (metaOk) {
    for (const line of meta.lines) {
      const m = META.exec(line);
      if (m === null) {
        metaOk = false;
        break;
      }
      stamps.push({ ts: Number(m[1]), exitCode: Number(m[2]) });
    }
  }
  if (!metaOk && decoded.length > 0) {
    warnings.push("history metadata is unusable; commands kept, timestamps reset");
  }

  const entries: HistoryEntry[] = decoded.map((command, i) => {
    const stamp = metaOk ? stamps[i] : undefined;
    return Object.freeze({
      command,
      ts: stamp?.ts ?? 0,
      exitCode: stamp?.exitCode ?? 0,
    });
  });

  return { entries: Object.freeze(trim(collapse(entries), cap)), warnings };
}

/**
 * I4, at load time as well as at append time.
 *
 * The widening §7a Trace 6 forced: the exit drain writes from the last
 * *confirmed* write, so an in-flight append can reach the file twice, and this
 * is what makes that overlap invisible rather than a bug people report.
 */
export function collapse(entries: readonly HistoryEntry[]): readonly HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const entry of entries) {
    if (out[out.length - 1]?.command === entry.command) {
      out[out.length - 1] = entry;
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function trim<T>(items: readonly T[], cap: number): readonly T[] {
  return items.length <= cap ? items : items.slice(items.length - cap);
}
