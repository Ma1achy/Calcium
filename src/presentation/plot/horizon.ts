/**
 * Horizon chart — bands folded and stacked, colour by depth.
 *
 * The only form designed for limited vertical space. A series that would
 * need twelve rows fits in two.
 */
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { ladderFor } from "./ramp.js";
import type { Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * Render a horizon chart: split the value range into N bands, fold and stack.
 *
 * Each row represents one band depth. Values in band 0 (lowest) get the
 * lightest density; values in the deepest band get the heaviest.
 */
export function horizonRows(
  series: Series,
  range: Range,
  bands: number,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const nBands = Math.max(1, Math.floor(bands));
  const ramp = ladderFor("density", caps).steps;
  const rampLen = ramp.length; // cells-ok — a ramp step count

  const span = range.max - range.min;
  const values = series.values;
  const n = values.length; // cells-ok — a sample count

  const rows: string[] = [];
  const usedRows = Math.min(areaRows, nBands);

  for (let band = usedRows - 1; band >= 0; band--) {
    let row = "";
    for (let col = 0; col < w; col++) {
      const idx = n <= w ? col : Math.floor((col / w) * n);
      const v = values[idx];
      if (v === null || v === undefined || !Number.isFinite(v)) {
        row += " ";
        continue;
      }

      const normalised = span > 0 ? (v - range.min) / span : 0.5;
      const bandValue = normalised * nBands - band;
      if (bandValue <= 0) {
        row += " ";
      } else {
        const intensity = Math.min(1, bandValue);
        const step = Math.min(rampLen - 1, Math.floor(intensity * rampLen));
        row += [...ramp][step] ?? [...ramp][rampLen - 1] ?? " ";
      }
    }
    rows.push(row);
  }

  while (rows.length < areaRows) rows.push(" ".repeat(w)); // cells-ok — a row count
  return rows;
}
