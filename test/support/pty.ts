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

/** The frame's prefix, and the anchor `frame` slices from (C22 §6). */
const HOME = "\u001b[H";

/** Every escape, for reading a frame as the rows a user would see. */
const CSI_ANY = /\u001b(?:\[[0-9;?]*[a-zA-Z]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[()][0-9A-Za-z]|[0-9A-Za-z])/g;

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

/**
 * Where the cursor ends up, and whether anything wrapped.
 *
 * **A PTY is a kernel device with no emulator behind it**, which this file's opening
 * paragraph says and which is why every other assertion here is a fold over the byte
 * stream. The same applies to the width hazard, and it is worse: the thing that
 * matters is not the too-long line but the *scroll* the emulator performs when it
 * wraps one, and there is nothing to interrogate afterwards.
 *
 * So this models exactly enough of a terminal to see it: printable runs advance a
 * column, a newline resets it, and a run that crosses `cols` wraps — which costs a
 * row the writer never asked for. `wrapped` is the unrecoverable event, because a
 * wrap inside the alternate screen scrolls content the application has no record of.
 *
 * Escape sequences are skipped rather than interpreted. That makes `rows` a lower
 * bound rather than a position, which is enough: the comparison is against a control
 * run through the same tracker, so an unmodelled cursor move is a constant on both
 * sides.
 */
export type WrapState = {
  /** Rows advanced, counting wraps. */
  rows: number;
  /** The widest printable run between newlines, in columns. */
  widest: number;
  /** Whether any run crossed the width in effect. */
  wrapped: boolean;
};

const CSI = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|[0-9A-Za-z])/g;

export function trackWrap(bytes: string, cols: number): WrapState {
  const plain = bytes.replace(CSI, "");
  const state: WrapState = { rows: 0, widest: 0, wrapped: false };

  for (const line of plain.split("\n")) {
    // `\r` returns to column zero, so only the longest segment after the last one
    // is what the terminal is left holding.
    const segments = line.split("\r");
    const run = Math.max(...segments.map((s) => s.length)); // cells-ok — ASCII fixtures
    if (run > state.widest) state.widest = run;
    if (run > cols) {
      state.wrapped = true;
      state.rows += Math.ceil(run / cols);
      continue;
    }
    state.rows += 1;
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
      // **`LANG` is part of the default because the default is a capable
      // terminal** (F147). It was absent — not as a decision that tier 5 tests a
      // degraded one, but because an environment built by listing two variables
      // has whatever you did not list. C02 then resolved the ASCII pair, the
      // prompt rendered `>`, and 44 rows across 13 files waited fifteen seconds
      // each for a `❯` the app was right not to draw.
      //
      // Tier 5's job is the whole stack as a user meets it, and a user has a
      // `LANG`. A degraded terminal is what a row **asks** for — `opts.env`
      // spreads last, so `capabilities.test.ts` setting `LANG: "C"` still wins,
      // which is how the one file that is about degradation keeps its subject.
      env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: process.env["PATH"] ?? "", ...opts.env },
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

/** The glyph the prompt wears, and the one every e2e file waits on first. */
export const PROMPT = /❯/;

/**
 * The prompt's row in a frame — the **last** one wearing the glyph.
 *
 * **It was `find`, and that was unambiguous only while nothing else drew a `❯`.**
 * C22 I33 draws each entry with the command that produced it, above the entry and
 * therefore above the prompt, so the *first* such row is a transcript echo. A row
 * asserting the prompt holds some text then matched an echo that holds it forever,
 * and the assertion could never fail again — which is A03 §2's vacuity class
 * arriving in a predicate.
 *
 * It is here rather than in one test file because it went wrong twice: editor
 * T5.4 found it, was fixed locally, and theme T5.4 kept its own copy of the
 * defect for a further commit. The prompt is the bottom-most `❯` by construction
 * (S01 §3 — the prompt region is the last thing above the footer).
 */
export function promptRow(frame: readonly string[]): string {
  return [...frame].reverse().find((r) => r.trimStart().startsWith("❯")) ?? "";
}

export type InteractivePty = {
  /** Send bytes as a user would — through the PTY, not through a back channel. */
  type(bytes: string): void;
  /**
   * Resize the PTY, which is what a user dragging a window does.
   *
   * `node-pty` has had this all along and the harness never exposed it, so nothing
   * in the suite had ever changed a terminal's size mid-run — the parameter class
   * `runInPty`'s `env` fell into, one function over.
   */
  resize(cols: number, rows: number): void;
  /** Everything received so far. */
  readonly output: string;
  /**
   * The most recently written frame, as rows, with escapes removed.
   *
   * **`output` is cumulative and almost never what a row wants to assert
   * against.** A shell repaints the whole screen on every keystroke, so text
   * deleted three frames ago is still in `output` forever — an assertion that
   * something is *gone* passes only by accident, and one about the frame's
   * height counts every frame ever written. Four editor rows were written
   * against `output` and three of them failed on exactly that.
   *
   * The reconstruction is the frame's own shape (S01 §3, C22 §6): one write per
   * frame, beginning with a hide and `CSI H` and ending with the cursor's
   * position. So the current frame is everything after the last `CSI H`, and
   * this is the same slice C03's T4.9 takes in-process.
   */
  readonly frame: readonly string[];
  /** Resolve once `pattern` appears, or reject after `ms`. */
  waitFor(pattern: RegExp, ms?: number): Promise<RegExpExecArray>;
  /**
   * Resolve once the current frame satisfies `ok`, or reject after `ms`.
   *
   * **`waitFor` cannot express "the screen has changed".** It matches the
   * accumulated stream, so a pattern already in it resolves synchronously —
   * which is right for "this appeared" and silently wrong for anything about
   * the *present* state. A row asserting text was deleted waited on a pattern
   * that had been there since it was typed, so the assertion ran before the
   * frame it was about had been written, and the key under test looked broken
   * when it was not.
   */
  waitForFrame(ok: (frame: readonly string[]) => boolean, ms?: number): Promise<void>;
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
    // The same default, and for the same reason (F147). Both spawners, because
    // the defect was in what an unlisted variable does rather than in either
    // function — fixing the one that surfaced it would leave the other live,
    // which is the mistake the `name`-wins-over-`env` note above records twice.
    env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: process.env["PATH"] ?? "", ...opts.env },
    // Raw bytes rather than per-chunk strings — see `bytes` below.
    encoding: null,
  });

  let output = "";
  let exited: number | null = null;
  /**
   * **A multi-byte character split across two reads is one character, not two
   * replacements.** `node-pty` decodes each chunk it delivers independently, so
   * a CJK glyph or an emoji straddling a read boundary arrives as `\uFFFD`
   * twice — and the transcript then disagrees with the screen about content
   * that is on it. C17 T5.3 saw `日本` followed by two replacement characters
   * and the defect was here rather than in the decoder, which has held a
   * partial sequence across chunks since it landed (C16 T3.14).
   *
   * `encoding: null` is what makes the fix possible: it stops node-pty decoding
   * at all and hands over `Buffer`s, which one streaming decoder then turns
   * into text for the life of the terminal. Taking the mangled string back
   * apart would not work — by then the two halves are both `\uFFFD` and the
   * original bytes are gone.
   */
  const bytes = new TextDecoder("utf-8");
  const waiters: { re: RegExp; resolve: (m: RegExpExecArray) => void }[] = [];
  const exitWaiters: ((code: number) => void)[] = [];

  term.onData((d) => {
    // Through the one streaming decoder — see `bytes`.
    output += bytes.decode(d as unknown as Uint8Array, { stream: true });
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
    resize: (cols, rows) => term.resize(cols, rows),
    get output() {
      return output;
    },
    get frame() {
      const at = output.lastIndexOf(HOME);
      if (at === -1) return [];
      return output
        .slice(at + HOME.length)
        .replaceAll(CSI_ANY, "")
        // **`\r*\n`, not `\r\n`.** The frame joins its rows with `\r\n` and the
        // PTY's ONLCR translates the `\n` again, so what arrives is `\r\r\n` —
        // and splitting on the written separator leaves a stray `\r` on the end
        // of every row, which breaks any assertion that touches a row's edge.
        .split(/\r*\n/);
    },
    waitForFrame(ok, ms = 15_000) {
      // Polled rather than driven by the data event: the frame is a derived
      // view of everything received so far, and a predicate over it is not a
      // function of any single chunk.
      const deadline = Date.now() + ms;
      const self = this as InteractivePty;
      return new Promise<void>((resolve, reject) => {
        const tick = (): void => {
          if (ok(self.frame)) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error(`the frame never satisfied it:\n${self.frame.join("\n")}`));
            return;
          }
          setTimeout(tick, 20);
        };
        tick();
      });
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
