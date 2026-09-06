/**
 * The screen a sequence of writes leaves behind, **with its styles** (C22 I55).
 *
 * `screen.ts` strips every SGR, which is right for a row that asks *what is on
 * screen* and blind to one that asks *in which tone* — and C11 I14 is a claim
 * about tone alone. This is the same fold with the escapes kept as state: each
 * cell carries the SGR channels in force when it was written, so a row can be
 * asked which of its cells are washed, which are accented, and where each run
 * begins and ends. It handles exactly what `screen.ts` handles — `ESC[H`,
 * `ESC[r;cH`, `\r\n` — plus `ESC[…m`, and strips the rest.
 *
 * **Deliberately a model of the channels and not of a terminal**: `38;2`, `38;5`
 * and the sixteen all land in `fg`; `48…` in `bg`; `1 2 3 4 7` are attributes;
 * `0` clears all, `39`/`49` one channel, and `22 23 24 27` one attribute each.
 * An assertion reads a cell's `fg`/`bg`/`attrs` and compares it with what the
 * theme resolves, so a theme change moves both sides together.
 */

const ESC = "\u001b";
const HOME = `${ESC}[H`;
const CUP = /^\u001b\[(\d+);(\d+)H/u;
const SGR = /^\u001b\[([0-9;]*)m/u;
const OTHER_ESCAPE = /^\u001b\[[0-9;?]*[A-Za-z]/u;

export type CellStyle = Readonly<{ fg: string; bg: string; attrs: readonly number[] }>;
export type StyledCell = Readonly<{ ch: string; style: CellStyle }>;

const PLAIN: CellStyle = Object.freeze({ fg: "", bg: "", attrs: Object.freeze([]) });

/** The SGR channels after `params` are applied to `cur`. */
export function applySgr(cur: CellStyle, params: readonly number[]): CellStyle {
  let { fg, bg } = cur;
  let attrs = [...cur.attrs];
  for (let i = 0; i < params.length; i += 1) {
    const p = params[i]!;
    if (p === 0) {
      fg = "";
      bg = "";
      attrs = [];
    } else if (p === 38 || p === 48) {
      const mode = params[i + 1];
      const take = mode === 2 ? 5 : mode === 5 ? 3 : 1;
      const value = params.slice(i, i + take).join(";");
      if (p === 38) fg = value;
      else bg = value;
      i += take - 1;
    } else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) fg = String(p);
    else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) bg = String(p);
    else if (p === 39) fg = "";
    else if (p === 49) bg = "";
    else if (p === 22) attrs = attrs.filter((a) => a !== 1 && a !== 2);
    else if (p === 23) attrs = attrs.filter((a) => a !== 3);
    else if (p === 24) attrs = attrs.filter((a) => a !== 4);
    else if (p === 27) attrs = attrs.filter((a) => a !== 7);
    else if ([1, 2, 3, 4, 7].includes(p) && !attrs.includes(p)) attrs.push(p);
  }
  return Object.freeze({ fg, bg, attrs: Object.freeze([...attrs].sort((a, b) => a - b)) });
}

/**
 * Fold `chunks` onto a `rows`×`columns` grid of styled cells.
 *
 * One JavaScript string index per cell, as `screen.ts` — a model, not a
 * measurement; the frames these tests read are ASCII.
 */
export function styledScreenFrom(
  chunks: readonly string[],
  size: Readonly<{ columns: number; rows: number }>,
): readonly (readonly StyledCell[])[] {
  const grid: StyledCell[][] = Array.from({ length: size.rows }, () =>
    Array.from({ length: size.columns }, () => ({ ch: " ", style: PLAIN })),
  );
  let row = 0;
  let col = 0;
  let cur = PLAIN;

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
      const rest = chunk.slice(i);
      const cup = CUP.exec(rest);
      if (cup !== null) {
        row = Number(cup[1]) - 1;
        col = Number(cup[2]) - 1;
        i += cup[0].length;
        continue;
      }
      const sgr = SGR.exec(rest);
      if (sgr !== null) {
        cur = applySgr(cur, sgr[1] === "" ? [0] : sgr[1]!.split(";").map(Number));
        i += sgr[0].length;
        continue;
      }
      const other = OTHER_ESCAPE.exec(rest);
      if (other !== null) {
        i += other[0].length;
        continue;
      }
      if (chunk.startsWith("\r\n", i)) {
        row += 1;
        col = 0;
        i += 2;
        continue;
      }
      const ch = chunk[i]!;
      if (ch === "\n") {
        row += 1;
        col = 0;
      } else if (ch !== "\r" && row >= 0 && row < size.rows && col >= 0 && col < size.columns) {
        grid[row]![col] = { ch, style: cur };
        col += 1;
      }
      i += 1;
    }
  }
  return grid;
}

/** A row's text, with trailing blanks dropped. */
export const textOf = (row: readonly StyledCell[]): string => row.map((c) => c.ch).join("").trimEnd();

/** The row whose text contains `needle`, or `null`. */
export function rowContaining(
  grid: readonly (readonly StyledCell[])[],
  needle: string,
): readonly StyledCell[] | null {
  return grid.find((r) => textOf(r).includes(needle)) ?? null;
}

/** The style of the first cell of `needle` in `row`, or `null` if absent. */
export function styleAt(row: readonly StyledCell[], needle: string): CellStyle | null {
  const at = row.map((c) => c.ch).join("").indexOf(needle);
  return at === -1 ? null : row[at]!.style;
}
