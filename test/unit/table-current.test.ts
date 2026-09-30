// C11 §5d — the current row (I33, ruling 89, F1474).
//
// §097's registry projection draws the current candidate as ` › /colour ` in
// `c-pickInk bold bg-pick` and its hint in `c-pickInk bg-pick`, with the other
// rows keeping the mark's cells blank. The row is read here in bytes, run by
// run, because every one of its three carriers is invisible to a stripped
// string but the mark.
import { describe, expect, it } from "vitest";

import { background, slot } from "../../src/presentation/blocks/paint.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import type { Table } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";

/** Built from a code point, so no control byte is in the file (SS69). */
const ESC = String.fromCharCode(27);

const TABLE: Table = {
  kind: "table",
  id: "t",
  columns: [
    { key: "value", label: "", align: "left", priority: 2, minWidth: 10, flex: true, sortable: false },
    { key: "detail", label: "", align: "right", priority: 1, minWidth: 5, sortable: false },
  ],
  rows: [
    { id: "r0", cells: { value: { text: "alpha" }, detail: { text: "one" } } },
    { id: "r1", cells: { value: { text: "beta" }, detail: { text: "two" } } },
    { id: "r2", cells: { value: { text: "gamma" }, detail: { text: "three" } } },
  ],
  showHeader: false,
};

type Run = Readonly<{ fg: string; bg: string; bold: boolean; text: string }>;

/**
 * One painted row as runs of text under the **state** the escapes left.
 *
 * The frame writes differences — `38;…` then `48;…`, a lone `1`, `22` to end
 * the weight, `49`/`39` to end the colours — so a run is read against every
 * sequence before it, not against the last one alone.
 */
const runsOf = (line: string): readonly Run[] => {
  const out: Run[] = [];
  let state = { fg: "", bg: "", bold: false };
  let last = 0;
  for (const m of line.matchAll(new RegExp(`${ESC}\\[([0-9;]*)m`, "gu"))) {
    const text = line.slice(last, m.index);
    if (text !== "") out.push({ ...state, text });
    const p = (m[1] ?? "").split(";").map((x) => (x === "" ? 0 : Number(x)));
    for (let i = 0; i < p.length; i += 1) {
      const n = p[i] ?? 0;
      if (n === 0) state = { fg: "", bg: "", bold: false };
      else if (n === 1) state = { ...state, bold: true };
      else if (n === 22) state = { ...state, bold: false };
      else if (n === 39) state = { ...state, fg: "" };
      else if (n === 49) state = { ...state, bg: "" };
      else if (n === 38 || n === 48) {
        const len = p[i + 1] === 2 ? 5 : 3;
        const value = p.slice(i, i + len).join(";");
        state = n === 38 ? { ...state, fg: value } : { ...state, bg: value };
        i += len - 1;
      }
    }
    last = m.index + m[0].length;
  }
  const tail = line.slice(last);
  if (tail !== "") out.push({ ...state, text: tail });
  return out;
};

/** A style's parameters as `sgr` writes them, without the introducer. */
const paramsOf = (style: Parameters<typeof sgr>[0]): string => sgr(style).slice(2, -1);

const PICK = paramsOf({ ...background("surface.pick", DARK_THEME, FULL_CAPS) });
const INK = paramsOf({ ...slot("surface.pickInk", DARK_THEME, FULL_CAPS) });

const rowsAt = (block: Table, capabilities = FULL_CAPS, width = 40): readonly string[] =>
  measurable({ definitions: [tableDefinition], capabilities }).renderToLines(block, width);

describe("C11 §5d — the current row", () => {
  it("T1.43 (C11 I33, §5d): the current row takes the mark, the pick ground and pickInk to the block's edge and bold on its first cell, the other rows reserve the mark's cells, and the 1-bit, ASCII, no-row and absent arms", () => {
    expect(PICK, "the theme declares a pick ground, or this row reads nothing").toMatch(/^48;2;/u);

    const painted = rowsAt({ ...TABLE, current: "r0" });
    const plain = painted.map(visible);
    // The gutter is two cells (C11 I15); the lead is the next two.
    expect(plain[0]?.startsWith("  › alpha"), plain[0]).toBe(true);
    expect(plain[1]?.startsWith("    beta"), plain[1]).toBe(true);
    expect(plain[2]?.startsWith("    gamma"), plain[2]).toBe(true);
    const starts = plain.map((l, i) => l.indexOf(["alpha", "beta", "gamma"][i] ?? "?"));
    expect(new Set(starts).size, `every label in one column: ${JSON.stringify(starts)}`).toBe(1);

    // **The ground runs the row, gutter to edge, and every run is inked for it.**
    const current = runsOf(painted[0] ?? "");
    expect(current.reduce((n, r) => n + cells(r.text), 0), "to the block's edge").toBe(40);
    for (const run of current) {
      expect(run.bg, `on pick: ${JSON.stringify(run.text)}`).toBe(PICK);
      expect(run.fg, `in pickInk: ${JSON.stringify(run.text)}`).toBe(INK);
    }
    // **Bold on the first cell, not the second** — §097's `bold` is on
    // ` › /colour ` and not on the hint.
    const bold = (needle: string): boolean => current.filter((r) => r.text.includes(needle)).every((r) => r.bold);
    expect(current.some((r) => r.text.includes("alpha")), "the label is read").toBe(true);
    expect(bold("›") && bold("alpha"), "the mark and the label are bold").toBe(true);
    expect(current.some((r) => r.text.includes("one") && !r.bold), "the hint is not").toBe(true);
    for (const other of painted.slice(1)) {
      expect(runsOf(other).some((r) => r.bg !== ""), "no other row takes a ground").toBe(false);
    }

    // **1 bit**: no ground and no padding; the mark and the weight carry it.
    const mono = rowsAt({ ...TABLE, current: "r0" }, MONO_UNICODE_CAPS);
    expect(mono.join("").includes("48;"), "no row sets a background at one bit").toBe(false);
    expect(visible(mono[0] ?? "").startsWith("  › alpha")).toBe(true);
    const monoRuns = runsOf(mono[0] ?? "").filter((r) => r.text.includes("alpha"));
    expect(monoRuns.length > 0 && monoRuns.every((r) => r.bold), "and the label is bold").toBe(true);

    // **ASCII**: the registry's `*`.
    expect(visible(rowsAt({ ...TABLE, current: "r0" }, ASCII_CAPS)[0] ?? "").startsWith("  * alpha")).toBe(true);

    // **An id naming no row**: no mark, and the reservation stays.
    const none = rowsAt({ ...TABLE, current: "gone" }).map(visible);
    expect(none.join("\n").includes("›"), "no mark").toBe(false);
    expect(none.map((l) => l.slice(0, 8)), "the slot is kept").toEqual(["    alph", "    beta", "    gamm"]);

    // **Absent**: no reservation, so every other table draws what it drew.
    const bare = rowsAt(TABLE).map(visible);
    expect(bare.map((l) => l.slice(0, 7))).toEqual(["  alpha", "  beta ", "  gamma"]);
  });
});
