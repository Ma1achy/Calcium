/**
 * The local clipboard tool — found without a shell, fed on stdin (C21 §2b, I20).
 *
 * Ruling 72 is the person's: **OSC 52 first**, then a platform tool if one is
 * present, then a file offered to the reader. The order is L4's to apply,
 * because L4 is the only layer that sees both halves of L0 — C01 builds the
 * sequence and C02 says the terminal takes it, and this file answers the two
 * questions only a process can: *which tool is here*, and *did it take the text*.
 *
 * Three joints, and each is a place where the obvious version is wrong:
 *
 *   - **Found is not reachable.** A display-bound tool with no display fails, and
 *     `pbcopy` over SSH *succeeds* — on the far host, filling a pasteboard the
 *     reader never sees. So a candidate is offered only where it writes the
 *     reader's clipboard (the walk's W6–W8).
 *   - **A relative `PATH` entry is never searched** (W13). POSIX reads the empty
 *     entry as the working directory, so searching it would execute a `pbcopy`
 *     planted wherever the app happened to be launched.
 *   - **The tool's output is ignored, not piped** (W16). `xclip`, `xsel` and
 *     `wl-copy` fork a server that holds the parent's descriptors for as long as
 *     it serves the selection; a piped stderr read for a reason would never end.
 *     The parent's exit is the whole answer.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export type ClipboardToolName = "pbcopy" | "wl-copy" | "xclip" | "xsel" | "clip.exe";

/** A tool found on `PATH`, with the argv and encoding it is written with (I20). */
export type ClipboardTool = Readonly<{
  name: ClipboardToolName;
  /** Absolute — resolved against `PATH` in code, never through a shell. */
  path: string;
  /** The table's literal. Nothing the reader or the far side wrote reaches it. */
  args: readonly string[];
  /** What the tool reads on stdin. */
  encoding: "utf-8" | "utf-16le";
}>;

/**
 * The tool's answer. `ok: true` is a process on the reader's machine saying it
 * took the text, which is why it may be called *copied* where OSC 52's may not
 * (ruling 72).
 */
export type ClipboardWrite =
  | Readonly<{ ok: true; tool: ClipboardToolName }>
  | Readonly<{ ok: false; tool: ClipboardToolName; reason: string }>;

/**
 * **Where a candidate's clipboard is.** `local` is this host's own, which is the
 * reader's only outside SSH; a variable name is the display that variable names,
 * which `ssh -X` forwards to the reader and which the tool cannot open without.
 */
type Reach = "local" | "WAYLAND_DISPLAY" | "DISPLAY";

type Candidate = Readonly<{
  name: ClipboardToolName;
  args: readonly string[];
  encoding: ClipboardTool["encoding"];
  reach: Reach;
}>;

const candidate = (
  name: ClipboardToolName,
  args: readonly string[],
  encoding: ClipboardTool["encoding"],
  reach: Reach,
): Candidate => Object.freeze({ name, args: Object.freeze([...args]), encoding, reach });

/**
 * C21 §2b's table, in its order — **the one list** the argv comes from (T2.11).
 *
 * `xclip` and `xsel` are named for the clipboard selection explicitly: both
 * default to the primary selection, which is the middle-click buffer and not
 * what a reader means by *copy*. `clip.exe` reads the console's code page unless
 * the bytes open with a UTF-16LE byte-order mark — by its documented behaviour,
 * unmeasured here (W17).
 */
const CANDIDATES: readonly Candidate[] = Object.freeze([
  candidate("pbcopy", [], "utf-8", "local"),
  candidate("wl-copy", [], "utf-8", "WAYLAND_DISPLAY"),
  candidate("xclip", ["-selection", "clipboard"], "utf-8", "DISPLAY"),
  candidate("xsel", ["--clipboard", "--input"], "utf-8", "DISPLAY"),
  candidate("clip.exe", [], "utf-16le", "local"),
]);

/** Own-property, non-empty — the same reading C02's `read` gives a variable. */
function isSet(env: Readonly<NodeJS.ProcessEnv>, key: string): boolean {
  if (!Object.hasOwn(env, key)) return false;
  const value = env[key];
  return typeof value === "string" && value !== "";
}

/** W6–W8: whether the candidate's clipboard is the reader's. */
function reachesReader(reach: Reach, env: Readonly<NodeJS.ProcessEnv>): boolean {
  if (reach === "local") return !isSet(env, "SSH_CONNECTION") && !isSet(env, "SSH_TTY");
  return isSet(env, reach);
}

/** A regular file this process may execute. A directory named `pbcopy` is not one. */
function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first candidate, in the table's order, that is on `PATH` and reaches the
 * reader — or `null` (C21 I20).
 *
 * **Spawns nothing**: no `which`, no `command -v`, both of which are a shell or a
 * subprocess. Only absolute entries are searched (W13).
 */
export function findClipboardTool(env: Readonly<NodeJS.ProcessEnv>): ClipboardTool | null {
  const path = isSet(env, "PATH") ? String(env["PATH"]) : "";
  const dirs = path.split(delimiter).filter((dir) => dir !== "" && isAbsolute(dir));

  for (const c of CANDIDATES) {
    if (!reachesReader(c.reach, env)) continue;
    for (const dir of dirs) {
      const found = join(dir, c.name);
      if (isExecutableFile(found)) {
        return Object.freeze({ name: c.name, path: found, args: c.args, encoding: c.encoding });
      }
    }
  }
  return null;
}

/** `FF FE` — the mark that makes `clip.exe` read UTF-16LE rather than its code page. */
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);

function encode(text: string, encoding: ClipboardTool["encoding"]): Buffer {
  return encoding === "utf-16le"
    ? Buffer.concat([UTF16LE_BOM, Buffer.from(text, "utf16le")])
    : Buffer.from(text, "utf8");
}

/**
 * Write `text` to `tool` — the path, the table's argv, the text on stdin, no
 * shell (C21 I20, I1).
 *
 * **Resolves on the tool's own exit and never throws** (I13's rule, carried
 * over): `0` is `ok`, and a non-zero code, a signal or a spawn error is
 * `ok: false` with a reason naming which. **The empty text spawns nothing** —
 * `pbcopy` given nothing empties the pasteboard, a destructive answer to a copy
 * of nothing (W1).
 *
 * **No timer** (I8): a tool that never exits leaves this pending, and the
 * deadline that says so is L4's, which holds the only scheduler (W18).
 */
export function writeClipboard(
  tool: ClipboardTool,
  text: string,
  deps: Readonly<{ env: Readonly<NodeJS.ProcessEnv>; cwd: () => string }>,
): Promise<ClipboardWrite> {
  const failed = (reason: string): ClipboardWrite => Object.freeze({ ok: false, tool: tool.name, reason });
  if (text === "") return Promise.resolve(failed("the text is empty, and nothing was sent"));

  return new Promise<ClipboardWrite>((resolve) => {
    let settled = false;
    const settle = (write: ClipboardWrite): void => {
      if (settled) return;
      settled = true;
      resolve(write);
    };

    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = nodeSpawn(tool.path, [...tool.args], {
        // Read at spawn (I10), and a deleted directory is a spawn error below.
        cwd: deps.cwd(),
        env: { ...deps.env },
        // Its own group, as every spawn here is (I2) — so a server the tool forks
        // keeps serving the selection after the session exits.
        detached: true,
        // W16: stdin carries the text, and nothing of ours is held by a server
        // the tool forks.
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
    } catch (error) {
      settle(failed(messageOf(error)));
      return;
    }

    child.on("error", (error) => settle(failed(messageOf(error))));
    child.on("exit", (code, signal) => {
      if (code === 0) settle(Object.freeze({ ok: true, tool: tool.name }));
      else settle(failed(signal !== null ? `killed by ${signal}` : `exited with code ${String(code)}`));
    });

    // W12: a tool that exits before reading closes the pipe under us. The
    // `EPIPE` is not the answer — the exit status is — and unhandled it would
    // take the session down.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(encode(text, tool.encoding));
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
