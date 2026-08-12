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

import { cells } from "../../src/presentation/text.js";

const MARKER = "__TERMIOS__";

/**
 * A complete escape sequence at position 0 — the boundary test for `feed`.
 *
 * The same alternatives the walk matches, anchored. Kept beside them because
 * two lists that must agree and are written apart is the drift a shared
 * implementation prevents; if the walk learns a sequence, this must too.
 */
const COMPLETE_ESCAPE =
  /^\u001b(?:\[[0-9;?]*[a-zA-Z]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[()][0-9A-Za-z]|[0-9A-Za-z])/u;

/**
 * The screen the program is painting, as the rows a user would see (F149).
 *
 * **This replaces a slice, and the difference is the whole finding.** `frame`
 * used to return everything after the last `CSI H`, on a stated shape: *one
 * write per frame, beginning with a hide and `CSI H`*, cited to S01 §3 and
 * C22 §6. Measured on a live session at 100×24: **one home, ever.** C22 I55
 * §6b makes the whole-frame form the *fallback* — the first frame, a
 * contaminated one, a resize, a refusal — and every ordinary frame a
 * **difference**, each changed row addressed with `cursorTo(i, 0)`. Stripping
 * escapes then throws those addresses away, so rows written to line 4 and line
 * 19 arrived adjacent in one string, and a 400-row transcript read as one line.
 *
 * A stream of edits cannot be sliced back into a screen; it has to be
 * **applied**, which is what the terminal on the other end is doing. So this is
 * the smallest emulator that makes the getter's own doc-comment true: a row
 * buffer, a write head, and the four things the shell actually emits.
 *
 * **`cells()` is imported from `src/`, deliberately and with the cost stated.**
 * The instrument now shares a measurer with the thing under test, so a width
 * defect in `cells()` would move the model and the app together and hide itself
 * — the shape `test/support/README.md` forbids. A second implementation is the
 * worse trade: it would drift from the measurer the whole framework uses, and
 * disagree about exactly the characters that are hard. What makes it safe to
 * take is that the coupling is **checked rather than assumed** — every row the
 * shell writes is `exact()`-padded to the frame's width, so a row whose
 * measured width overruns the frame's is a real defect, not a modelling choice.
 * `overrun` reports it rather than absorbing it.
 */
export function screen(bytes: string, cols: number, rows: number): string[] {
  const paint = painter(cols, rows);
  paint.apply(bytes);
  return paint.rows();
}

/**
 * Split a buffer at the last point a complete escape sequence ends (F149).
 *
 * **A read can end anywhere, including inside `CSI 12;1H`.** The walk skips what
 * it cannot match, so feeding `\u001b[12` and then `;1Hrow` would drop the
 * address entirely and paint `;1Hrow` as text at wherever the head happened to
 * be — a plausible screen, wrong, with nothing to notice. Held back instead,
 * and applied when the rest arrives.
 *
 * The same class as the multi-byte character split across two reads that
 * `interactivePty`'s decoder already holds, one layer up: **a chunk boundary is
 * not a delimiter**, and every reader of a stream has to say so somewhere.
 *
 * A trailing `ESC` with nothing after it is itself partial, which the anchored
 * test gives for free.
 */
export function atEscapeBoundary(buf: string): Readonly<{ ready: string; partial: string }> {
  const last = buf.lastIndexOf("\u001b");
  if (last === -1 || COMPLETE_ESCAPE.test(buf.slice(last))) {
    return { ready: buf, partial: "" };
  }
  return { ready: buf.slice(0, last), partial: buf.slice(last) };
}

/** A screen that can be fed the stream in pieces — see `painter` below. */
export type Painter = Readonly<{
  /** Apply a chunk. Escape sequences must not be split across calls. */
  apply: (chunk: string) => void;
  /** The rows a user would see, padded to the screen's width. */
  rows: () => string[];
}>;

/**
 * The screen model, as state rather than as a function (F149).
 *
 * **This exists because the one-shot form is quadratic in a poll loop.**
 * `waitForFrame` asks for the frame every 20 ms, and a frame derived by
 * replaying the whole stream costs more every time it is asked. Measured: a
 * 2.1 MB session parses in 127 ms, so a twenty-second wait over a busy session
 * spends more than a hundred seconds of CPU deriving the same screen — which is
 * how `transport` T5.6 went from 3 s to a 75 s timeout with nothing but the
 * frame reader changed under it. The terminal on the other end does not replay
 * either; it applies what arrives and keeps the screen.
 */
function painter(cols: number, rows: number): Painter {
  /**
   * **A row is cells, not a string** — and this is the second thing the
   * mutation pass found rather than the first thing written.
   *
   * The model began with `head + text`, which indexes a *cell* cursor into a
   * *string*. Two consequences, and both are the conflation `cells()` exists to
   * stop: a write truncated everything to its right, so clearing the screen and
   * not clearing it produced identical output and the alternate-screen mutation
   * survived; and a column past a wide glyph was off by one per glyph, which is
   * invisible until C17's CJK rows run.
   *
   * So a row is an array of cells. `null` is a cell nothing has written, and
   * renders as a space; `""` is the continuation half of a wide glyph, and
   * renders as nothing, because the glyph before it already occupies both.
   */
  const blank = (): (string | null)[][] => Array.from({ length: rows }, () => []);
  let grid = blank();
  let row = 0;
  let col = 0;

  /** Overwrite `text` into `line` from cell `at`, and answer where the head is. */
  function place(line: (string | null)[], at: number, text: string): number {
    let x = at;
    for (const ch of text) {
      const w = cells(ch);
      while (line.length < x) line.push(null);
      line[x] = ch;
      // The continuation cells of a wide glyph. Written explicitly rather than
      // left as holes: a later narrow write landing on the second half must
      // replace it, and a hole would render as a space beside a glyph that is
      // still two cells wide.
      for (let k = 1; k < w; k += 1) line[x + k] = "";
      x += w;
    }
    return x;
  }

  // One pass, one token at a time. Anything not named here is a presentation
  // escape — SGR, DECSET, the synchronised-update window — and moves no write
  // head, so it is skipped rather than rendered.
  const token =
    /\u001b\[(\d*)(?:;(\d*))?([Hf])|\u001b\[(\d*)J|\u001b\[\?1049([hl])|\u001b(?:\[[0-9;?]*[a-zA-Z]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[()][0-9A-Za-z]|[0-9A-Za-z])|(\r)|(\n)|([^\r\n\u001b]+)/g;

  function apply(chunk: string): void {
  for (const m of chunk.matchAll(token)) {
    const [, r, c, cup, erase, alt, cr, lf, text] = m;

    if (cup !== undefined) {
      // **CUP is 1-based on the wire and 0-based here**, which is `cursorTo`'s
      // own note one layer down: *one place to be off by one, and it is the
      // place with the test*. A model that converted twice would produce a
      // screen that is self-consistent and one row low — the exact defect
      // C22's T4.12 caught in the renderer, arriving in the instrument that
      // would have to find it.
      row = Math.max(0, (r === undefined || r === "" ? 1 : Number(r)) - 1);
      col = Math.max(0, (c === undefined || c === "" ? 1 : Number(c)) - 1);
      continue;
    }

    // `CSI 2J` and the alternate screen both mean *nothing on this screen is
    // yours any more*. Modelled, because entering the alt screen is the first
    // thing the shell does and a model that kept the login shell's rows would
    // show them underneath the application for the life of the session.
    if (erase !== undefined || alt !== undefined) {
      grid = blank();
      if (alt !== undefined) {
        row = 0;
        col = 0;
      }
      continue;
    }

    if (cr !== undefined) {
      col = 0;
      continue;
    }
    if (lf !== undefined) {
      row += 1;
      continue;
    }
    if (text === undefined) continue;

    // **The head advances whether or not the row exists.** A write below the
    // last row is dropped — a screen has a height — but the cursor still moved,
    // and a model that only advanced on rows it kept would put the next write
    // in the wrong column.
    const line = row >= 0 && row < rows ? grid[row] : undefined;
    col = line === undefined ? col + cells(text) : place(line, col, text);
  }
  }

  // **Padded to the screen's width, not trimmed** — and the difference is a row
  // that failed when this trimmed. C03's T5.5 asserts
  // `new Set(frame.map((r) => r.length)).size === 1`, which is how *the resume
  // path repainted everything rather than nothing* is observable from outside:
  // every row painted to one width. Trailing space is invisible to a reader and
  // load-bearing to that assertion, so the model keeps the width the program
  // painted, exactly as the slice it replaces did.
  return {
    apply,
    rows: () =>
      grid.map((line) => {
        const text = line.map((cell) => cell ?? " ").join("");
        const width = cells(text);
        return width >= cols ? text : text + " ".repeat(cols - width);
      }),
  };
}

/**
 * Rows whose painted width exceeds the screen's, as `row: width` (F149).
 *
 * Empty on every healthy frame, and it is the check that makes importing
 * `cells()` honest: the shell pads every row to exactly the frame's width, so
 * anything over `cols` is a row that wrapped — and a wrapped line scrolls the
 * alternate screen, which is the one failure that corrupts state the
 * application can no longer see. A model that silently truncated would be
 * absorbing precisely the defect it exists to show.
 */
export function overrun(rows: readonly string[], cols: number): string[] {
  return rows
    .map((line, i) => ({ i, width: cells(line) }))
    .filter(({ width }) => width > cols)
    .map(({ i, width }) => `${String(i)}: ${String(width)}`);
}

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
   * **It is applied, not sliced** (F149). This used to return everything after
   * the last `CSI H`, on a stated shape — *one write per frame, beginning with a
   * hide and `CSI H`* — cited to S01 §3 and C22 §6. The citation was the reason
   * nobody checked it, and C22 **I55 §6b** says the opposite in a numbered
   * invariant: the whole-frame form is the *fallback*, and every ordinary frame
   * is a **difference** with each changed row addressed by `cursorTo(i, 0)`.
   * Measured on a live session: one home, ever. So the slice returned the first
   * paint plus every edit since, addresses stripped and rows run together, and a
   * 400-row transcript read as a single line.
   *
   * `screen` applies the stream the way the terminal does. A "contains"
   * assertion used to pass by accident on a blob that only accumulates; this is
   * what makes an assertion about a row's position, or about text being *gone*,
   * mean what it says.
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
   * The screen's height, live (F149). `screen` applies a stream of edits into a
   * buffer of this many rows, and a row asserting across a resize would read the
   * spawn-time option and model a screen the program stopped painting.
   */
  let height = opts.rows ?? 24;
  let width = opts.cols ?? 80;
  /**
   * The screen, kept rather than re-derived (F149).
   *
   * `paint` is fed each chunk as it arrives; `frame` renders it. Deriving the
   * frame from the whole stream on every poll is quadratic and measurably so —
   * a 2.1 MB session parses in 127 ms, and `waitForFrame` asks 50 times a
   * second.
   *
   * **`held` is the half of an escape sequence that has not arrived yet.** A
   * read can end anywhere, including inside `CSI 12;1H`, and the walk skips what
   * it cannot match — so feeding `\u001b[12` and then `;1Hrow` would drop the
   * address and paint `;1Hrow` as text, at whatever position the head happened
   * to be. The same class as the split multi-byte character two fields down, one
   * layer up: a boundary is not a delimiter.
   */
  let paint = painter(width, height);
  let held = "";
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
    const text = bytes.decode(d as unknown as Uint8Array, { stream: true });
    output += text;
    feed(text);
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

  /**
   * Apply what has arrived, holding back a trailing partial escape.
   *
   * The boundary is found by looking at the last `ESC` in the buffer and asking
   * whether a complete sequence starts there. If it does not, the sequence is
   * still arriving and everything from it is held for the next chunk.
   */
  function feed(chunk: string): void {
    const { ready, partial } = atEscapeBoundary(held + chunk);
    held = partial;
    paint.apply(ready);
  }

  return {
    type: (bytes) => term.write(bytes),
    resize: (cols, rows) => {
      width = cols;
      height = rows;
      // **Rebuilt, not resized.** A screen of a different shape is a different
      // screen, and the shell agrees: C22 I55 sends a frame whose predecessor
      // was a different size down the whole-frame path. Replaying once is
      // bounded and rare, and it keeps the model's answer identical to the
      // one-shot `screen()` the fixture asserts against.
      paint = painter(width, height);
      held = "";
      paint.apply(output);
      term.resize(cols, rows);
    },
    get output() {
      return output;
    },
    get frame() {
      // Applied as it arrived, not re-derived — see `paint` and F149.
      return paint.rows();
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
