// C21 §2b — stub clipboard tools on a temporary `PATH` (C21 I20).
//
// **No real tool is needed and none is used.** The container may hold none of
// `pbcopy`, `wl-copy`, `xclip`, `xsel` or `clip.exe`, and a row that needed one
// would be a row that skips on the machine it runs on. Every present case is a
// file this module writes, and the absent case is an empty directory — so both
// arms are constructed rather than found.
//
// The stubs are shell scripts, and that is the stub's business rather than the
// subject's: what C21 spawns is the stub's *path*, with an argv and no shell.
// A stub records what it was given beside itself — `<name>.argv` holds each
// argument bracketed, `<name>.stdin` the bytes it read, `<name>.env` its
// environment — so a row reads the tool's side of the exchange from the disk.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Records its argv, its stdin and its environment beside itself, then exits 0. */
export const RECORDS =
  "#!/bin/sh\n" +
  'd=$(dirname "$0"); n=$(basename "$0")\n' +
  'for a in "$@"; do printf "[%s]" "$a"; done > "$d/$n.argv"\n' +
  'cat > "$d/$n.stdin"\n' +
  'env > "$d/$n.env"\n';

/**
 * The `PATH` a stub *runs* under: its own directory, then the system's. The stub
 * is a shell script and needs `cat`; a lookup is asked under `{ PATH: dir }`
 * alone, which is what keeps a tool the machine happens to have out of the row.
 */
export const runPath = (dir: string): string => `${dir}:/usr/bin:/bin`;

/** A fresh directory for one row's tools. */
export function toolDir(): string {
  return mkdtempSync(join(tmpdir(), "calcium-clip-"));
}

/** Write an executable stub named `name` into `dir`; returns its path. */
export function stub(dir: string, name: string, body: string = RECORDS, mode = 0o755): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, mode);
  return path;
}

/** What the stub named `name` in `dir` recorded, or `null` for a file it never wrote. */
export function recorded(dir: string, name: string, what: "argv" | "stdin" | "env"): Buffer | null {
  const path = join(dir, `${name}.${what}`);
  return existsSync(path) ? readFileSync(path) : null;
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
