// C09 I132 — a chosen option's weight, tier 6.
//
// The row names the change that makes it fail. It restates the behaviour
// `test/unit/focus-shapes.test.ts`'s T1.90 holds, so a reader can see which
// row dies for which defect; the mutation pass checks it mechanically.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS, measurable, MONO_UNICODE_CAPS } from "../support/render.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { plotDefinition } from "../../src/presentation/plot/definition.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { focusStyle } from "../../src/presentation/blocks/paint.js";
import { sgr } from "../../src/terminal/escapes.js";
import { styledScreenFrom } from "../support/styled-screen.js";

describe("C09 I132 — tier 6", () => {
  it("T6.154 (C09 I132): the chosen option's style without bold → T1.90 fails at every rung", () => {
    // **The cell the ruling is about**: at 1-bit, at rest, a chosen and an
    // unchosen option. Without the weight they differ by the mark alone.
    const b = block({
      kind: "choice",
      id: "c",
      exclusive: true,
      options: [{ id: "a", label: "alpha" }, { id: "b", label: "beta", chosen: true }],
    }) as unknown as Block;
    const line = measurable({ theme: DARK_THEME, capabilities: MONO_UNICODE_CAPS }).renderToLines(b, 40)[0] ?? "";
    const row = styledScreenFrom([line], { columns: 40, rows: 1 })[0]!;
    const text = row.map((c) => c.ch).join("");
    const unchosen = row[text.indexOf("○")]!;
    const chosen = row[text.indexOf("●")]!;
    expect(unchosen.style.attrs, "the unchosen mark carries no attribute").toEqual([]);
    expect(chosen.style.attrs, "the chosen mark carries the weight as well").toEqual([1]);
  });
});

describe("C09 I137 — tier 6", () => {
  const kv = block({
    kind: "keyValue",
    id: "k",
    rows: [
      { label: "endpoint", value: "https://api.internal.example/v2" },
      { label: "region", value: "eu-west-1" },
    ],
  }) as unknown as Block;
  const draw = (b: Block, width: number, focus: unknown, caps = FULL_CAPS): readonly string[] =>
    measurable({ theme: DARK_THEME, capabilities: caps, focus: focus as never }).renderToLines(b, width);

  it("T6.189 (C09 I137): the shed rows' focus gate or treatment removed → T1.151 and T2.229 fail", () => {
    // The treatment: at 9 columns the row sheds and a focused shed-0 is lit.
    expect(draw(kv, 9, { blockId: "k", rowId: "shed-0" })[0], "the head row is lit").not.toBe(draw(kv, 9, null)[0]);
    // The gate: at 60 nothing sheds, so the same focus paints nothing.
    expect(draw(kv, 60, { blockId: "k", rowId: "shed-0" }), "a stale shed-0 paints nothing").toEqual(draw(kv, 60, null));
  });

  it("T6.190 (C09 I137, I100): the ground behind a frame child restored, or the focus not forwarded → T1.152 fails", () => {
    const plot = ONE_PER_KIND.plot as Block;
    const fig5 = block({
      kind: "mosaic",
      id: "fig5",
      height: 8,
      areas: "AB",
      children: [{ ...(plot as object), id: "fig5-a" }, { ...(plot as object), id: "fig5-b" }],
    } as never) as unknown as Block;
    const kit = (focus: unknown) =>
      measurable({ theme: DARK_THEME, capabilities: FULL_CAPS, focus: focus as never, definitions: [plotDefinition as unknown as BlockDefinition<never>] });
    const lit = kit({ blockId: "fig5", rowId: "fig5-a" }).renderToLines(fig5, 60).join("\n");
    const ground = sgr(focusStyle(DARK_THEME, FULL_CAPS));
    expect(ground.length, "the ground resolves").toBeGreaterThan(0);
    expect(lit.includes(ground), "no ground across the figure").toBe(false);
    expect(lit, "the pane is lit through the plot").not.toBe(kit(null).renderToLines(fig5, 60).join("\n"));
  });

  it("T6.191 (C09 I137, I119): form reading focusStyle again → T2.229 and T3.131 fail; its focusShape removed → T2.228 fails", () => {
    const form = ONE_PER_KIND.form as Block;
    const focused = draw(form, 60, { blockId: form.id, rowId: "cancel" }, MONO_UNICODE_CAPS).join("\n");
    expect(focused.includes("\u001b[7m"), "a focused button inverts at 1-bit").toBe(true);
  });
});
