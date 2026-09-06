/**
 * The six figures the gallery shows, and the one that moves.
 *
 * The full catalogue is `catalogue.ts` — all 46 forms, with the four the
 * published builder cannot construct declared as refusals (F377). This file is
 * the *glance*: enough forms to judge the system at once, at the sizes a
 * two-column layout gives them.
 */
import { b } from "@fmx/calcium";
import type { Block } from "@fmx/calcium";
import { CATALOGUE } from "./catalogue.ts";
import { WIDTHS, budget, magnitudes, wave } from "./data.ts";

const at = (form: keyof typeof CATALOGUE, phase: number, height: number): Block => {
  const drawn = CATALOGUE[form].at(phase, height);
  if ("refused" in drawn) throw new Error(`${form}: ${drawn.refused}`);
  return drawn;
};

export const curve = (p: number, h = 7): Block => at("line", p, h);
export const heat = (p: number, h = 6): Block => at("heatmap", p, h);
export const distribution = (p: number, h = 8): Block => at("boxplot", p, h);
export const hierarchy = (p: number, h = 10): Block => at("treemap", p, h);

/**
 * The bar, on the arm that can name its series.
 *
 * **`vertical` shows two stages and `horizontal` shows four**, and that is not
 * a taste (F374): the vertical arm reserves a `legend`'s width and draws
 * nothing in it, and drops a category label whose name would overlap its
 * neighbour without saying so. The horizontal arm of the same form does both
 * correctly and names what it dropped.
 */
export function bars(p: number, h = 7): Block {
  return b.plot({
    id: "budget-by-width", form: "bar", height: h, axes: true, orientation: "vertical",
    categories: [...WIDTHS], yFormat: "number",
    series: [
      { values: magnitudes(4, p, 13, 6), label: "layout", tone: "info" },
      { values: magnitudes(4, p, 14, 9), label: "paint", tone: "ok" },
    ],
  });
}

export function barsFull(p: number, h = 14): Block {
  return b.plot({
    id: "budget-by-width", form: "bar", height: h, axes: true, orientation: "horizontal",
    legend: "right", categories: [...WIDTHS], yFormat: "number",
    series: ["measure", "layout", "paint", "compose"].map((label, i) => ({
      values: magnitudes(4, p, 13 + i, 5 + i * 2), label,
    })),
  });
}

/** The live one — a walk, redrawn every tick. */
export function walk(values: readonly number[], height = 8): Block {
  return b.plot({
    // **Not the live panel's own id** (F372, F373). A `b.live` part renders a
    // child, the shell patches it in by the panel's id, and a child carrying
    // that id makes the id ambiguous — after which every later patch is
    // rejected and the part is torn down in silence, still drawing.
    id: "queue-depth", form: "line", height, axes: true, yFormat: "number",
    plotFill: "solid", yAxis: "right", yCallout: "last",
    series: [{ values: [...values], label: "queue depth", tone: "info" }],
  });
}

export { budget, wave };
