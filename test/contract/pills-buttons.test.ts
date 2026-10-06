// C04 §3 — a `pills` row of buttons (I151, C09 I139, C23 I104).
//
// What C04 owns: what the wire accepts, and that the field moves the geometry by
// the buttons' chrome and by nothing else. What C09 draws for it is C09 T1.153.
import { describe, expect, it } from "vitest";

import { validateBlock, type Pills } from "../../src/data/viewmodel/index.js";
import { measurable } from "../support/render.js";

const LABELS = ["approve", "deny", "show full diff"];
const PILLS: Pills = { kind: "pills", id: "p", chips: LABELS.map((label) => ({ label })) };

describe("C04 I151 — a pills row of buttons", () => {
  it("T2.156 (C04 I151, C09 I139): buttons is refused when not a boolean, naming the field; measure is the first-fit packing of label plus four at 20, 40 and 80, and the same chips without it are the unpadded packing", () => {
    const refused = validateBlock({ ...PILLS, buttons: "yes" } as unknown as Pills);
    expect(refused.ok, "a string is refused").toBe(false);
    expect(refused.ok ? "" : refused.error.join("\n")).toMatch(/"buttons" must be a boolean/u);
    for (const buttons of [true, false, undefined]) {
      expect(validateBlock({ ...PILLS, ...(buttons === undefined ? {} : { buttons }) }).ok, `buttons: ${String(buttons)}`).toBe(true);
    }

    // **A first-fit packing, computed here and not read back from the renderer**:
    // whole chips, two cells apart, a row breaking before a chip that would not fit.
    const rowsOf = (width: number, chrome: number): number => {
      let rows = 1;
      let used = 0;
      for (const label of LABELS) {
        const w = label.length + chrome; // cells-ok — ASCII labels written here
        const needed = used === 0 ? w : used + 2 + w;
        if (needed > width && used > 0) {
          rows += 1;
          used = w;
        } else used = needed;
      }
      return rows;
    };
    const r = measurable();
    for (const width of [20, 40, 80]) {
      expect(r.measure({ ...PILLS, buttons: true }, width), `buttons at ${String(width)}`).toBe(rowsOf(width, 4));
      expect(r.measure(PILLS, width), `chips at ${String(width)}`).toBe(rowsOf(width, 0));
    }
    // **The fixture responds to the field**: at 40 the two packings differ, so the
    // loop above is not comparing one number with itself.
    expect(rowsOf(40, 4), "the buttons wrap where the chips do not").not.toBe(rowsOf(40, 0));
  });

  it("T2.156b (C04 I151, C09 I139, C26 §5): a button's element is its whole reservation — `label + 4` cells, two apart — and a chip's is its label", () => {
    // The hit area is the chrome's maximum, as the packing is: a click on the pad
    // or the bracket is a click on the button, at every rung.
    const r = measurable();
    const def = r.registry.get("pills");
    const spans = (b: Pills): number[][] =>
      [...(def?.elements?.(b as never, 80, () => 1, () => "") ?? [])].map((e) => [e.cols.from, e.cols.to]);
    expect(spans({ ...PILLS, buttons: true }), "buttons").toEqual([[0, 11], [13, 21], [23, 41]]);
    expect(spans(PILLS), "chips").toEqual([[0, 7], [9, 13], [15, 29]]);
  });
});
