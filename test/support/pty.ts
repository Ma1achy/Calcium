// C01 tier 5 — the PTY harness.
//
// A PTY is a kernel device, not a terminal emulator: it has no notion of an
// alternate screen being active, so there is nothing to interrogate after the
// program exits. The harness therefore reduces, in two independent ways.
//
// Termios comes from `stty -a` run in the same PTY afterwards — the terminal's
// own report, not our bookkeeping. Asserting on flags we set would test the
// implementation against itself.
//
// DECSET state comes from a tracker over the captured byte stream, folded into
// a final state. That is what "byte-identical to `true`" actually means, and it
// is *stronger* than a byte diff: it survives a harmless reordering of the
// release sequence and still fails on a mode left set. Anyone tempted to
// simplify this to a diff should read that sentence first.
import { spawn } from "node-pty";

const MARKER = "__TERMIOS__";

export type DecsetState = {
  altScreen: boolean;
  cursorVisible: boolean;
  bracketedPaste: boolean;
  mouse1002: boolean;
  mouse1006: boolean;
  scrollRegion: boolean;
};

export type PtyRun = {
  /** Everything the program wrote, before the marker. */
  readonly bytes: string;
  /** `stty -a`'s report, after the marker. */
  readonly termios: string;
  readonly decset: DecsetState;
  readonly exitCode: number;
};

const DECSET = /\x1b\[\?([0-9;]+)([hl])/g;
const SCROLL_REGION = /\x1b\[(\d*);?(\d*)r/g;

/**
 * Fold the stream into a final state. The cursor starts visible and every mode
 * starts off, which is what a terminal looks like before anything runs — so a
 * program that sets and unsets returns to the control run's state exactly.
 */
export function trackDecset(bytes: string): DecsetState {
  const state: DecsetState = {
    altScreen: false,
    cursorVisible: true,
    bracketedPaste: false,
    mouse1002: false,
    mouse1006: false,
    scrollRegion: false,
  };

  DECSET.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECSET.exec(bytes)) !== null) {
    const on = m[2] === "h";
    for (const mode of m[1]!.split(";")) {
      switch (mode) {
        case "1049":
          state.altScreen = on;
          break;
        case "25":
          state.cursorVisible = on;
          break;
        case "2004":
          state.bracketedPaste = on;
          break;
        case "1002":
          state.mouse1002 = on;
          break;
        case "1006":
          state.mouse1006 = on;
          break;
        default:
          break;
      }
    }
  }

  SCROLL_REGION.lastIndex = 0;
  while ((m = SCROLL_REGION.exec(bytes)) !== null) {
    // `CSI r` with no parameters resets the region to the full screen.
    state.scrollRegion = m[1] !== "" || m[2] !== "";
  }

  return state;
}

/** Termios flags compared against the control run. Negated form means off. */
export function termiosFlags(report: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const name of ["echo", "icanon", "isig"]) {
    flags[name] = !new RegExp(`(^|\\s)-${name}(\\s|$)`).test(report);
  }
  return flags;
}

/**
 * Run `program` in a real PTY, then ask the terminal what state it is in.
 *
 * The marker splits the program's own output from `stty`'s report. `sh -c`
 * rather than spawning the program directly, because `stty` has to run in the
 * same PTY after the program exits — that is the only way to observe termios
 * from outside.
 */
export function runInPty(
  program: string,
  opts: { env?: Record<string, string>; jobControl?: boolean } = {},
): Promise<PtyRun> {
  return new Promise((resolve, reject) => {
    // `set -m` gives the program its own foreground process group. Without it
    // the group is orphaned, and POSIX discards a stop signal sent to an
    // orphaned process group — so a SIGTSTP test would pass in 36ms having
    // never stopped anything. Only T5.4 needs it; the rest run in the simpler
    // shape deliberately.
    const prefix = opts.jobControl === true ? "set -m; " : "";
    const term = spawn("/bin/sh", ["-c", `${prefix}${program}; echo ${MARKER}; stty -a`], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      env: { TERM: "xterm-256color", PATH: process.env["PATH"] ?? "", ...opts.env },
    });

    let output = "";
    term.onData((d) => {
      output += d;
    });

    const timer = setTimeout(() => {
      term.kill();
      reject(new Error(`PTY run timed out: ${program}\n${output}`));
    }, 20_000);

    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      const at = output.indexOf(MARKER);
      if (at === -1) {
        reject(new Error(`marker never appeared: ${program}\n${JSON.stringify(output)}`));
        return;
      }
      const bytes = output.slice(0, at);
      resolve({
        bytes,
        termios: output.slice(at + MARKER.length),
        decset: trackDecset(bytes),
        exitCode,
      });
    });
  });
}

/** The control: a program that takes nothing and gives nothing back. */
export function control(): Promise<PtyRun> {
  return runInPty("true");
}
