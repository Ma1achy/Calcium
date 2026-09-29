// C09 I132 — a chosen option's weight, tier 6.
//
// The row names the change that makes it fail. It restates the behaviour
// `test/unit/focus-shapes.test.ts`'s T1.90 holds, so a reader can see which
// row dies for which defect; the mutation pass checks it mechanically.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, measurable, MONO_UNICODE_CAPS } from "../support/render.js";
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
