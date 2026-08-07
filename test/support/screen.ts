/**
 * The screen a sequence of writes leaves behind (C22 §6b, I55).
 *
 * **A write stopped being a frame, and three test files were reading it as
 * one.** Each hand-rolled the same slice — take the last chunk containing
 * `HOME`, cut at the hide, strip escapes, split on `\r\n` — which is correct
 * exactly while every frame is written whole. Stage 1 of the render chain writes
 * only the rows that changed, addressed with CUP, so that slice reconstructs one
 * or two rows and calls them the frame.
 *
 * The reading was never wrong about what it wanted; it was wrong about where to
 * get it. A terminal is not a log of writes, it is what they accumulated to, and
 * this is the smallest model of that: rows of text, a cursor, and the four
 * sequences the frame path emits.
 *
 * **Deliberately small.** It handles `ESC[H`, `ESC[r;cH`, `\r\n`, and strips
 * everything else — no scroll region, no insert mode, no wrapping. That is the
 * whole of what `composeFrame` writes, and a screen model that handled more
 * would be a second terminal to be wrong in. `tools/screen.py` is the PTY-side
 * equivalent and answers the same question about a real capture.
 */

const ESC = "\u001b";
const HOME = `${ESC}[H`;
/** Anything that is not a cursor move: SGR, modes, hide/show. */
const OTHER_ESCAPE = /\u001b\[[0-9;?]*[A-Za-z]/g;
const CUP = /^\u001b\[(\d+);(\d+)H/;

export type Screen = Readonly<{
  /** Every row, padded to `columns`, with escapes removed. */
  rows: readonly string[];
  /** The rows with trailing blanks dropped, which is what an assertion wants. */
  readonly text: readonly string[];
  /**
   * Whether anything was ever drawn — **the subject, and it has to be asked
   * separately now.**
   *
   * `rows` is always exactly `size.rows` long, because a screen has that many
   * rows whether or not anything was written to them. So the guard those tests
   * used — *a frame was written*, asserted as `toHaveLength(24)` — is inert
   * against this model, where it was load-bearing against a slice of the last
   * write. A mutation painting one row short survived it, which is how this was
   * found: the assertion was still true, about a different thing.
   *
   * This is the *assert the artefact, not a proxy* class arriving through a
   * change of what the proxy measures, rather than through the assertion being
   * written badly in the first place.
   */
  readonly drawn: boolean;
}>;

/**
 * Fold `chunks` onto a `rows`×`columns` screen.
 *
 * The starting screen is blank, which models the alternate screen the session
 * acquires — not the terminal the user had before it, whose contents C01 saved
 * and will restore.
 */
export function screenFrom(
  chunks: readonly string[],
  size: Readonly<{ columns: number; rows: number }>,
): Screen {
  const grid: string[] = Array.from({ length: size.rows }, () => " ".repeat(size.columns));
  let row = 0;
  let col = 0;

  const put = (text: string): void => {
    if (text === "" || row < 0 || row >= size.rows) return;
    const line = grid[row] ?? "";
    const head = line.slice(0, col); // cells-ok — a model, not a measurement
    const tail = line.slice(col + text.length); // cells-ok — a model, not a measurement
    grid[row] = (head + text + tail).slice(0, size.columns).padEnd(size.columns, " "); // cells-ok
    col += text.length; // cells-ok — a model, not a measurement
  };

  for (const chunk of chunks) {
    let i = 0;
    while (i < chunk.length) {
      // cells-ok — a cursor, not a width
      if (chunk.startsWith(HOME, i)) {
        row = 0;
        col = 0;
        i += HOME.length;
        continue;
      }
      const cup = CUP.exec(chunk.slice(i));
      if (cup !== null) {
        row = Number(cup[1]) - 1;
        col = Number(cup[2]) - 1;
        i += cup[0].length;
        continue;
      }
      if (chunk.startsWith(ESC, i)) {
        OTHER_ESCAPE.lastIndex = i;
        const m = OTHER_ESCAPE.exec(chunk);
        if (m !== null && m.index === i) {
          i += m[0].length;
          continue;
        }
        i += 1; // A lone ESC: consumed, so the loop cannot stall.
        continue;
      }
      if (chunk.startsWith("\r\n", i)) {
        row += 1;
        col = 0;
        i += 2;
        continue;
      }
      // A run of ordinary text, up to the next escape or newline.
      let j = i;
      while (j < chunk.length && chunk[j] !== ESC && !chunk.startsWith("\r\n", j)) j += 1; // cells-ok
      put(chunk.slice(i, j));
      i = j;
    }
  }

  const rows = Object.freeze([...grid]);
  return Object.freeze({
    rows,
    get text() {
      return rows.map((r) => r.replace(/\s+$/, ""));
    },
    get drawn() {
      return rows.some((r) => r.trim() !== "");
    },
  });
}
