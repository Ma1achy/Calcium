/**
 * Whether a series is drawn (C04 I99, C12 I116, C22 I78).
 *
 * **One question, two sources, one order.** The reader's override in
 * `RenderContext.seriesVisibility` is read first; the block's own `hidden` is
 * the default beneath it; absent both, a series is shown. Both `overlaidRows`
 * and `legendEntries` ask, and a second copy of the order is how a legend comes
 * to mark a series the area is still drawing.
 *
 * **Takes only the field it reads**, so the SVG arm — which has no context —
 * can pass `undefined` and get the member's answer alone (`curveFigure`).
 */
import type { Plot, Series } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";

export function seriesHidden(
  block: Pick<Plot, "id" | "series">,
  index: number,
  ctx: Pick<RenderContext, "seriesVisibility"> | undefined,
): boolean {
  const override = ctx?.seriesVisibility?.[block.id]?.[index];
  if (override !== undefined) return override;
  const s: Series | undefined = block.series[index];
  return s?.hidden === true;
}
