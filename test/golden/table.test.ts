// C11 T5.1 / commitment 12 — golden frames at 80 / 100 / 120 / 160 (D39).
//
// **The layouts are reviewed, not emergent.** Priority alone produces
// arrangements nobody designed, and D39's whole purpose is that a person looked
// at each one — so these snapshots exist to be read, and to fail when an
// arrangement changes without anyone deciding it should.
//
// The widths are C11's, not C09's `[40, 60, 80, 120]`. Sharing a constant would
// churn C09's goldens for a reason that has nothing to do with C09, and the four
// here are the four D39 names.
//
// Flat and expanded, both themes. ASCII is not an axis: T4.2 asserts parity of
// geometry between the two unicode modes over the same fixtures, which is the
// property that could break, and a second set of snapshots would be four more
// files to review for a difference already tested.
import { describe, expect, it } from "vitest";
import { psTable } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable } from "../support/render.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import type { Table } from "../../src/data/viewmodel/index.js";

const WIDTHS = [80, 100, 120, 160] as const;

const THEMES = [
  { name: "dark", theme: DARK_THEME },
  { name: "light", theme: LIGHT_THEME },
] as const;

/**
 * The representative table, in the three states that lay out differently: flat,
 * expanded, and sorted with a focused row.
 *
 * Sorted and focused are in here because both are things C11 draws and neither
 * changes the geometry — so a golden is the only place a reviewer sees the
 * indicator land on the right header and the focus land on the right row.
 */
const CASES: readonly Readonly<{ label: string; block: Table; focus?: string }>[] = [
  { label: "flat", block: psTable({ id: "ps", rows: 4 }) },
  { label: "expanded", block: psTable({ id: "ps", rows: 4, expanded: [1], detail: true }) },
  {
    label: "sorted-focused",
    block: psTable({ id: "ps", rows: 4, sort: { key: "age", direction: "desc" } }),
    focus: "r2",
  },
];

describe("C11 T5.1 — golden frames", () => {
  for (const variant of THEMES) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${String(width)}`, () => {
        const frame = CASES.map(({ label, block, focus }) => {
          const kit = measurable({
            definitions: [tableDefinition],
            theme: variant.theme,
            capabilities: FULL_CAPS,
            ...(focus === undefined ? {} : { focus: { blockId: block.id, rowId: focus } }),
          });
          const lines = kit.renderToLines(block, width);
          return [
            `── ${label} · measured ${String(kit.measure(block, width))} · rendered ${String(lines.length)}`, // cells-ok
            ...lines,
          ].join("\n");
        }).join("\n");

        expect(frame).toMatchSnapshot();
      });
    }
  }
});
