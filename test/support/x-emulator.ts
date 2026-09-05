/**
 * A real terminal emulator, driven under Xvfb — bytes captured from inside it.
 *
 * **The measurement F808 made by hand, as a fixture.** Every row about the
 * keyboard protocol or the mouse modes had asserted what the framework *sends*
 * (C02 T5.6, C16 T5.6); nothing asserted what a terminal *answers*, and
 * `imageProtocol` shipped once having never run against one. This spawns an X
 * server, an emulator inside it running a capture script, drives the pointer
 * and keyboard with XTEST through `xdotool`, and returns the bytes the emulator
 * wrote to its pty — the far side's own encoding, not a fake decoder's.
 *
 * **Every capture owes a control byte.** The first probe read zero bytes in
 * every case because `timeout` runs `cat` in a background process group and a
 * tty read there stops on `SIGTTIN`; *no report* and *no reader* are the same
 * zero. `timeout --foreground` is the fix, and the caller types a key into
 * every capture so a silent one is a broken instrument rather than a finding.
 *
 * Skips by name where the packages are absent: `emulatorMissing()` returns the
 * reason, and a row puts it in its title so a skip is never a silent pass. The
 * devcontainer and the `full` CI job install `xvfb xdotool xterm kitty`.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Emulator = "kitty" | "xterm";

const has = (program: string): boolean => spawnSync("which", [program], { stdio: "ignore" }).status === 0;

/** `null` when the row can run; otherwise the reason it cannot, for the row's title. */
export function emulatorMissing(program: Emulator): string | null {
  const missing = ["Xvfb", "xdotool", program].filter((p) => !has(p));
  return missing.length === 0 ? null : `${missing.join(", ")} not installed`;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type Capture = Readonly<{ a: string; b: string }>;

export type Drive = (
  xdo: (...args: readonly string[]) => void,
  window: string,
  phase: 1 | 2,
) => Promise<void>;

/**
 * Run `enter`, capture for `seconds`, run `mid`, capture for `seconds` again,
 * run `leave`. `drive` is called once per phase with the emulator's window
 * focused; the returned strings are the captured bytes as latin1.
 */
export async function captureFromEmulator(opts: {
  program: Emulator;
  enter: string;
  mid?: string;
  leave: string;
  seconds?: number;
  drive: Drive;
}): Promise<Capture> {
  const seconds = opts.seconds ?? 3;
  const display = `:${String(100 + (process.pid % 800))}`;
  const work = mkdtempSync(join(tmpdir(), "x-emulator-"));
  const env = { ...process.env, DISPLAY: display, LIBGL_ALWAYS_SOFTWARE: "1", LANG: "C.UTF-8" };
  const sh = (s: string): string => s.replace(/\x1b/gu, "\\e");
  writeFileSync(join(work, "inner.sh"), [
    "stty raw -echo",
    `printf '${sh(opts.enter)}'`,
    `timeout --foreground ${String(seconds)} cat > ${join(work, "a.bin")}`,
    `printf '${sh(opts.mid ?? "")}'`,
    `touch ${join(work, "b.started")}`,
    `timeout --foreground ${String(seconds)} cat > ${join(work, "b.bin")}`,
    `printf '${sh(opts.leave)}'`,
    "",
  ].join("\n"));

  const xvfb = spawn("Xvfb", [display, "-screen", "0", "1024x768x24"], { stdio: "ignore" });
  const xdo = (...args: readonly string[]): void => {
    spawnSync("xdotool", [...args], { env, stdio: "ignore" });
  };
  try {
    // The server is up when xdotool can ask it anything.
    for (let i = 0; i < 40; i += 1) {
      if (spawnSync("xdotool", ["getdisplaygeometry"], { env, stdio: "ignore" }).status === 0) break;
      await sleep(100);
    }
    const args = opts.program === "kitty"
      ? ["-o", "allow_remote_control=no", "bash", join(work, "inner.sh")]
      : ["-geometry", "80x24+0+0", "-e", "bash", join(work, "inner.sh")];
    const term = spawn(opts.program, args, { env, stdio: "ignore" });
    const exited = new Promise<void>((r) => term.on("exit", () => r()));
    let window = "";
    for (let i = 0; i < 80 && window === ""; i += 1) {
      const found = spawnSync("xdotool", ["search", "--onlyvisible", "--class", opts.program], { env, encoding: "utf8" });
      window = (found.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
      if (window === "") await sleep(100);
    }
    if (window === "") throw new Error(`${opts.program} opened no window on ${display}`);
    await sleep(300);
    xdo("windowfocus", window);
    await sleep(200);
    await opts.drive(xdo, window, 1);
    for (let i = 0; i < 100 && !existsSync(join(work, "b.started")); i += 1) await sleep(100);
    await sleep(200);
    await opts.drive(xdo, window, 2);
    await exited;
    const read = (name: string): string =>
      existsSync(join(work, name)) ? readFileSync(join(work, name)).toString("latin1") : "";
    return { a: read("a.bin"), b: read("b.bin") };
  } finally {
    xvfb.kill();
    rmSync(work, { recursive: true, force: true });
  }
}
