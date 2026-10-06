/**
 * `⌥o` on a chip preview — the chip in the reader's editor (C22 I144, §6q.4
 * ruling 6, ruling 53).
 *
 * **Two arms, because a chip has two shapes.** One carrying a `target` names
 * what the preview opens when that is not the content (`Chip.target`), so the
 * editor opens the target and nothing comes back — a file changed there does
 * not change what was attached (§6q.5). Any other chip is its content: written
 * to a file in a fresh private directory, handed to the editor, and read back.
 *
 * **The terminal is lent through C23's sequence** (`Pipeline.borrowTerminal`,
 * C23 §4) — suspend, C21 `handoff`, resume, reset the decoder, invalidate — so
 * the editor gets the terminal the way a `/tty` line does, and the guard is
 * what refuses it while a verb runs: a suspended terminal would take that
 * verb's frames.
 *
 * **The path is an argument, never text in the command**: `sh -c '<editor>
 * "$1"' sh <path>`. The editor is a command line the reader wrote (`$VISUAL`,
 * `code -w`), so it goes to a shell whole; the path is ours, and quoting it
 * into the string would be a second parser of it.
 *
 * Pure of the frame and the stores: the caller says what a result means on
 * screen, which is why this answers a value and never appends or re-mints.
 */

import { join } from "node:path";
import type { Chip } from "../interaction/editor/index.js";
import type { FileSystem, Pipeline } from "./types.js";

/** The refusal with no editor to run (C22 I144, C02 §4). */
export const NO_EDITOR = "no editor — set $VISUAL or $EDITOR";

export type ChipEditorDeps = Readonly<{
  /** C02's `editor` (I19) — `null` refuses. */
  editor: string | null;
  fs: Pick<FileSystem, "readFile" | "writeFile" | "makeTempDir" | "removeDir">;
  borrow: Pipeline["borrowTerminal"];
  /** The open chord, spelled at the terminal's rung, for the busy refusal (C16 I58). */
  chord: string;
}>;

export type ChipEdit =
  /** Nothing ran; the text says why, and it is drawn `warn`. */
  | Readonly<{ kind: "refused"; text: string }>
  /** A target was opened; nothing comes back. */
  | Readonly<{ kind: "opened" }>
  /** The content came back as it went. */
  | Readonly<{ kind: "unchanged" }>
  /** The content came back changed — re-mint the chip with it (C17 I35). */
  | Readonly<{ kind: "changed"; content: string; lines: number }>;

/** The command, with the path as `$1` (C22 I144). */
export function editorArgv(editor: string, path: string): readonly string[] {
  return ["sh", "-c", `${editor} "$1"`, "sh", path];
}

/** A label for the guard while the editor runs — its first word, as `headOf` names a verb. */
const labelOf = (editor: string): string => editor.trim().split(/\s+/u)[0] ?? "editor";

const busy = (verb: string | null, chord: string): ChipEdit => ({
  kind: "refused",
  text: `${verb ?? "a command"} is still running, and ${chord} waits for it`,
});

export async function openChipInEditor(chip: Chip, deps: ChipEditorDeps): Promise<ChipEdit> {
  const editor = deps.editor;
  if (editor === null || editor.trim() === "") return { kind: "refused", text: NO_EDITOR };
  const borrow = deps.borrow;
  if (borrow === undefined) return { kind: "refused", text: "the terminal cannot be lent from here" };

  if (chip.target !== undefined) {
    const ran = await borrow(editorArgv(editor, chip.target), labelOf(editor));
    return ran.kind === "busy" ? busy(ran.verb, deps.chord) : { kind: "opened" };
  }

  if (deps.fs.makeTempDir === undefined || deps.fs.removeDir === undefined) {
    return { kind: "refused", text: "no private temporary directory to edit the chip in" };
  }
  // **A fresh private directory, removed on every path** (C22 I144):
  // `mkdtemp` makes it the reader's alone, and the `finally` is the one exit.
  const dir = await deps.fs.makeTempDir("calcium-chip-");
  try {
    const path = join(dir, "chip.txt");
    await deps.fs.writeFile(path, chip.content);
    const ran = await borrow(editorArgv(editor, path), labelOf(editor));
    if (ran.kind === "busy") return busy(ran.verb, deps.chord);
    // **An editor's final newline is the file's, not the paste's.** `vi` and
    // most others end a file with one, so a paste with none would come back
    // one line longer and never `unchanged`; one added newline is dropped.
    const read = await deps.fs.readFile(path);
    const back = !chip.content.endsWith("\n") && read.endsWith("\n") ? read.slice(0, -1) : read;
    if (back === chip.content) return { kind: "unchanged" };
    return { kind: "changed", content: back, lines: back.split("\n").length };
  } finally {
    await deps.fs.removeDir(dir);
  }
}
