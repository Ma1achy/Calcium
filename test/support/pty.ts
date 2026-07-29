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
  opts: { env?: Record<string, string>; jobControl?: boolean; timeoutMs?: number } = {},
): Promise<PtyRun> {
  return new Promise((resolve, reject) => {
    // `set -m` gives the program its own foreground process group. Without it
    // the group is orphaned, and POSIX discards a stop signal sent to an
    // orphaned process group — so a SIGTSTP test would pass in 36ms having
    // never stopped anything. Only T5.4 needs it; the rest run in the simpler
    // shape deliberately.
    const prefix = opts.jobControl === true ? "set -m; " : "";
    const term = spawn("/bin/sh", ["-c", `${prefix}${program}; echo ${MARKER}; stty -a`], {
      // `name` **is** the child's TERM as far as node-pty is concerned, and it
      // wins over the env record. Hard-coded, `env: { TERM: … }` was silently
      // inert: C02's tier 5 set `TERM=dumb` and got `xterm-256color`, and the
      // test read as covering a dumb terminal while never having seen one.
      //
      // Nothing had noticed because C02's are the first tests to pass `env` at
      // all — which is the shape of every vacuity failure in this repo, one
      // layer out from the rules that look for them.
      name: opts.env?.["TERM"] ?? "xterm-256color",
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
    }, opts.timeoutMs ?? 20_000);

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

/**
 * Type something into `vi` and quit without saving.
 *
 * **ESC has to arrive alone.** A terminal cannot tell the ESC key from the first
 * byte of an escape sequence except by what follows it, and neither can vi: send
 * `\x1b:q!\r` in one write and the whole thing is read as a key sequence, so
 * `:q!` lands in the buffer and the editor never exits. Written as two writes it
 * works only while the reads happen to split there — which is how this passed in
 * one file and hung in another, under nothing more than different load.
 *
 * So the text is confirmed on screen first, ESC is sent by itself, and the pause
 * is what makes it unambiguous. A real timer, deliberately: the ambiguity being
 * resolved is a timing property of terminals, and there is nothing to inject.
 */
export async function quitVi(pty: InteractivePty, text = "hello"): Promise<void> {
  pty.type(`i${text}`);
  await pty.waitFor(new RegExp(text), 20_000);

  pty.type("\x1b");
  await new Promise<void>((resolve) => void setTimeout(resolve, 250));

  pty.type(":q!\r");
}

/** The control: a program that takes nothing and gives nothing back. */
export function control(): Promise<PtyRun> {
  return runInPty("true");
}

export type InteractivePty = {
  /** Send bytes as a user would — through the PTY, not through a back channel. */
  type(bytes: string): void;
  /** Everything received so far. */
  readonly output: string;
  /** Resolve once `pattern` appears, or reject after `ms`. */
  waitFor(pattern: RegExp, ms?: number): Promise<RegExpExecArray>;
  done(): Promise<number>;
  kill(): void;
};

/**
 * A PTY the test can type into while the program runs.
 *
 * `runInPty` starts a program and waits, which cannot express C03's T5.2: the
 * only honest input-to-frame latency is measured from the moment a keystroke
 * enters the PTY to the moment the frame it caused leaves it. Timing inside the
 * fixture would measure `commit()` calling `render()` synchronously, which is
 * zero by construction and proves nothing.
 */
export function interactivePty(
  program: string,
  opts: { env?: Record<string, string>; cols?: number; rows?: number } = {},
): InteractivePty {
  const term = spawn("/bin/sh", ["-c", program], {
    // Same as `runInPty`: `name` is the child's TERM and wins over the env
    // record, so hard-coding it makes `env: { TERM: … }` inert. The second
    // instance of one defect in one file — worth stating, because a fix applied
    // to the caller that found it would have left this one live for whoever
    // needed an interactive session under a different terminal.
    name: opts.env?.["TERM"] ?? "xterm-256color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    env: { TERM: "xterm-256color", PATH: process.env["PATH"] ?? "", ...opts.env },
  });

  let output = "";
  let exited: number | null = null;
  const waiters: { re: RegExp; resolve: (m: RegExpExecArray) => void }[] = [];
  const exitWaiters: ((code: number) => void)[] = [];

  term.onData((d) => {
    output += d;
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const m = waiters[i]!.re.exec(output);
      if (m !== null) {
        waiters[i]!.resolve(m);
        waiters.splice(i, 1);
      }
    }
  });
  term.onExit(({ exitCode }) => {
    exited = exitCode;
    for (const w of exitWaiters.splice(0)) w(exitCode);
  });

  return {
    type: (bytes) => term.write(bytes),
    get output() {
      return output;
    },
    waitFor(re, ms = 15_000) {
      const existing = re.exec(output);
      if (existing !== null) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`never saw ${String(re)} in:\n${output.slice(-2000)}`)),
          ms,
        );
        waiters.push({
          re,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      });
    },
    done() {
      if (exited !== null) return Promise.resolve(exited);
      return new Promise((resolve) => exitWaiters.push(resolve));
    },
    kill: () => term.kill(),
  };
}
