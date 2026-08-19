/**
 * Our half of the comparison, plus the grid the other half must use.
 *
 * **The real fixtures or nothing.** A comparison against hand-written sample
 * data is a comparison of two drawings: it can show that both look like a bar
 * chart and cannot show that our bars are in the wrong place. Every number the
 * reference container plots comes through here.
 *
 * **And the grid is ours to declare, which `sparkline` is why.** The first
 * version fixed both sides at 16 rows. `sparkline` is a fixed-height form — it
 * renders one row whatever height it is handed — so the reference was drawing
 * sixteen rows against our one and the comparison padded the difference with
 * blanks. It scored 10%, which is neither the truth nor obviously wrong. So
 * this renders our side first and writes the row count each form actually
 * produced; `reference.py` draws into that.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../plot-catalogue.mjs";
import { CATALOGUE_FORMS, type PlotSpec } from "../catalogue-forms.js";

/** Forms whose plot area cannot be isolated, and the condition that lifts it. */
export const UNISOLABLE: ReadonlyMap<string, string> = new Map([
  ["heatmap", "C04 I50b — no `axes: false`; lifts with furniture.ts `AreaContent`"],
  ["calendar", "C04 I50b — as heatmap"],
  ["correlation", "C04 I50b — as heatmap"],
  ["confusion", "C04 I50b — as heatmap"],
  ["spectrogram", "C04 I50b — as heatmap"],
  ["latency", "C04 I50b — as heatmap"],
  ["density2d", "C04 I50b — as heatmap"],
  ["utilisation", "C04 I50b — as heatmap; the refusal reaches it now"],
]);

export const COLS = 64;
export const ROWS = 16;

const caps = (CAPS as readonly { name: string; caps: unknown }[])
  .find((c) => c.name === "24bit")!.caps;
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;

/** A rendered row as a coverage mask: which cells carry ink. */
export function inkMask(row: string): string {
  return [...strip(row)].map((ch) => (ch === " " || ch === "⠀" ? "." : "#")).join("");
}

/**
 * Our half — the plot area alone.
 *
 * `axes: false` is doing real work: it is the only way to get the data area
 * without knowing the gutter width, and the gutter width moves as the furniture
 * work lands. A comparison that had to be re-taught the layout every commit
 * would not survive the rebuild it exists to check.
 */
export function calciumMask(spec: PlotSpec): readonly string[] {
  return frame({ ...spec, height: ROWS, axes: false }, caps, COLS).map((l) => inkMask(l));
}

// The exclusion map and the mask helpers are imported by `pair.mjs`, so the
// writing half is guarded: importing a module must not make it run.
const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const out = process.argv[2];
  if (out === undefined) throw new Error("usage: export-fixtures.ts <dir>");

  const ours: Record<string, readonly string[]> = {};
  const grid: Record<string, number> = {};
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    if (UNISOLABLE.has(form)) continue;
    const rows = calciumMask(Object.values(variants)[0]!);
    ours[form] = rows;
    grid[form] = rows.length;
  }

  writeFileSync(join(out, "fixtures.json"), `${JSON.stringify(CATALOGUE_FORMS, null, 1)}\n`);
  writeFileSync(join(out, "ours.json"), `${JSON.stringify({ cols: COLS, ours, grid })}\n`);
  const variants = Object.values(CATALOGUE_FORMS).reduce((n, v) => n + Object.keys(v).length, 0);
  process.stdout.write(
    `refdiff/export — ${String(Object.keys(CATALOGUE_FORMS).length)} forms, ${String(variants)} variants, `
    + `${String(Object.keys(ours).length)} isolable -> ${out}\n`,
  );
}
