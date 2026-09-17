import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import type { Block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS, registry } from "../support/render.js";
import { elementOf } from "../../src/presentation/blocks/paint.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { mosaicRects, parseAreas } from "../../src/data/viewmodel/mosaic.js";

function throughInk(el: Parameters<typeof renderToString>[0], width: number): readonly string[] {
  const painted = renderToString(
    createElement(Box, { flexDirection: "column" }, el, createElement(Text, { key: "s" }, ".")),
    { columns: width },
  );
  const lines = painted.split("\n");
  return lines.slice(0, lines.length - 1);
}

describe("probe", () => {
  it("reads the frame", () => {
    const r = registry();
    const width = 30;
    const block = {
      kind: "mosaic", id: "m1", height: 4, areas: "ab",
      children: [
        { kind: "raw", id: "a", text: "a1\na2\na3\na4\na5\na6" },
        { kind: "raw", id: "b", text: "b1\nb2\nb3\nb4\nb5\nb6" },
      ],
    } as unknown as Block;
    const ctx = { width, theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 };
    const parsed = parseAreas((block as unknown as { areas: string }).areas);
    const rects = parsed.ok ? mosaicRects(parsed.grid, width, 4, undefined, undefined) : [];
    const ink = throughInk(elementOf(r.render(block, ctx as never)), width);
    const arm = renderToLines(r, block, width, { theme: DARK_THEME, capabilities: FULL_CAPS });
    console.log("RECTS " + JSON.stringify(rects));
    console.log("INK   " + JSON.stringify(ink));
    console.log("ARM   " + JSON.stringify(arm));
    expect(true).toBe(true);
  });
});
