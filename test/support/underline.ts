/**
 * The SGR state each visible cell of a rendered row is painted in (C25 I10).
 *
 * **Parsed as state, not matched as bytes.** The painter coalesces adjacent
 * spans and the frame writer emits `4` / `24` and `38;2;…` / `39` as state
 * changes, so a row's underline is a property of the cells between an on and an
 * off — a test that grepped for `\x1b[4m` would pass on a row whose underline had
 * swallowed the gutter and fail on one that carried the attribute inside a
 * combined sequence. `fg` is the foreground parameter string in force (`""` when
 * default), so a row can be asked whether two pieces share a slot's colour.
 */
export type CellState = Readonly<{ ch: string; fg: string; underline: boolean }>;

export function cellStates(row: string): readonly CellState[] {
  const esc = String.fromCharCode(27);
  const out: CellState[] = [];
  let underline = false;
  let fg = "";
  let i = 0;
  while (i < row.length) { // cells-ok — a code-unit cursor over a parse
    if (row[i] === esc && row[i + 1] === "[") {
      const end = row.indexOf("m", i);
      if (end < 0) break;
      const params = row.slice(i + 2, end).split(";");
      for (let k = 0; k < params.length; k += 1) { // cells-ok — a parameter count
        const p = params[k];
        if (p === "38") {
          const n = params[k + 1] === "2" ? 4 : 2;
          fg = params.slice(k, k + n + 1).join(";");
          k += n;
        } else if (p === "48") {
          k += params[k + 1] === "2" ? 4 : 2;
        } else if (p === "39") fg = "";
        else if (p === "4") underline = true;
        else if (p === "24") underline = false;
        else if (p === "0" || p === "") {
          underline = false;
          fg = "";
        }
      }
      i = end + 1;
      continue;
    }
    const cp = row.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    out.push({ ch, fg, underline });
    i += ch.length; // cells-ok — a code-unit step
  }
  return out;
}

/** The contiguous underlined runs of a row, in order — one per half on a split row. */
export function underlinedRuns(row: string): readonly string[] {
  const out: string[] = [];
  let current = "";
  for (const cell of cellStates(row)) {
    if (cell.underline) current += cell.ch;
    else if (current !== "") {
      out.push(current);
      current = "";
    }
  }
  if (current !== "") out.push(current);
  return out;
}

/** The foreground in force at the first cell of `text` in the row, or `undefined` when absent. */
export function foregroundAt(row: string, text: string): string | undefined {
  const cells = cellStates(row);
  const plain = cells.map((c) => c.ch).join("");
  const at = plain.indexOf(text);
  if (at < 0) return undefined;
  // `plain` is a string, so `at` is a code-unit offset; map it back to a cell index.
  let units = 0;
  for (let k = 0; k < cells.length; k += 1) { // cells-ok — a cell count
    if (units === at) return cells[k]?.fg;
    units += cells[k]?.ch.length ?? 0; // cells-ok — a code-unit step
  }
  return undefined;
}
