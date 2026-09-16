// C09 I72 — the rows arm against the element arm: the same block both ways, byte for byte.
//
// **The element arm is the reference here**, because it is what every frame
// was made of before the rows arm existed: a block's rows lifted into a `Text`
// per row and written by Ink. The rows arm must produce those bytes without
// Ink, for every block the corpus holds, at every width and capability set,
// and a sequence that mixes the two arms — with gaps, a floor and a cap —
// must equal the sequence Ink would have written whole. The probe reads which
// arm a block took, and exactly one of them.
import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import type { Block, Probe } from "../../src/data/viewmodel/index.js";
import { DEFAULT_WIDTHS } from "../../src/testing/measurement-conformance.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { elementOf } from "../../src/presentation/blocks/paint.js";
import { renderSequenceToLines, renderToLines } from "../../src/presentation/render-lines.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS, registry } from "../support/render.js";

const CAPS = [FULL_CAPS, ASCII_CAPS, MONO_CAPS] as const;

/** The element arm, as `render-lines` ran it for every block before C09 I72: a sentinel row below, then split. */
function throughInk(element: Parameters<typeof renderToString>[0], width: number): readonly string[] {
  const painted = renderToString(
    createElement(Box, { flexDirection: "column" }, element, createElement(Text, { key: "sentinel" }, ".")),
    { columns: width },
  );
  const lines = painted.split("\n");
  return lines.slice(0, Math.max(0, lines.length - 1)); // cells-ok — rows, not columns
}

/** A probe that records the spans it is asked to open, and nothing else. */
function recording(): Readonly<{ probe: Probe; names: string[] }> {
  const names: string[] = [];
  const probe: Probe = {
    ...NO_PROBE,
    on: true,
    span: (name: string) => {
      names.push(name);
      return NO_SPAN;
    },
  };
  return { probe, names };
}

describe("C09 I72 — the two arms agree", () => {
  it("T2.143 (C09 I72): over the corpus × seven widths × three capability sets the rows arm equals the block rendered through Ink byte for byte, a mixed sequence with gaps, a floor and a cap equals the whole sequence through Ink, and the probe reads rows or react for a block, never both", () => {
    const r = registry();
    const blocks = [...Object.values(ONE_PER_KIND), ...CORPUS];
    let rowsArm = 0;
    let elementArm = 0;
    for (const b of blocks) {
      for (const width of DEFAULT_WIDTHS) {
        for (const capabilities of CAPS) {
          const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
          const expected = throughInk(elementOf(r.render(b, ctx)), width);
          const { probe, names } = recording();
          const got = renderToLines(r, b, width, { theme: DARK_THEME, capabilities, probe });
          expect(got, `${b.kind} at ${String(width)}`).toEqual(expected);
          const arms = names.filter((n) => n === "rows" || n === "react");
          expect(arms, `${b.kind} at ${String(width)} opened ${names.join(",")}`).toHaveLength(1);
          if (arms[0] === "rows") rowsArm += 1;
          else elementArm += 1;
        }
      }
    }
    // Both arms were exercised — a corpus that took one arm alone would prove
    // nothing about the seam between them.
    expect(rowsArm).toBeGreaterThan(200);
    expect(elementArm).toBeGreaterThan(20);

    // **The mixed sequence.** Rows blocks and element blocks side by side, a gap
    // before some, a floor taller than the block, and a cap with its marker —
    // composed block by block against the whole tree written once.
    const capped = registry([], undefined, 6);
    const lines = Array.from({ length: 30 }, (_, i) => ({
      ts: `12:00:${String(i).padStart(2, "0")}`,
      level: "info",
      message: `line ${String(i + 1)} of the capped logs`,
    }));
    const sequence: readonly Block[] = [
      ONE_PER_KIND.notice,
      { ...ONE_PER_KIND.logs, gapBefore: true } as Block,
      { ...ONE_PER_KIND.rule, minHeight: 4 } as unknown as Block,
      { ...ONE_PER_KIND.panel, gapBefore: true } as Block,
      { ...ONE_PER_KIND.logs, id: "capped", lines } as Block,
      { ...ONE_PER_KIND.table, gapBefore: true } as Block,
      ONE_PER_KIND.code,
      { ...ONE_PER_KIND.group, gapBefore: true } as Block,
      ONE_PER_KIND.plot,
    ];
    for (const width of [24, 60, 100]) {
      for (const capabilities of CAPS) {
        const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
        const expected = throughInk(capped.renderSequence(sequence, ctx), width);
        const got = renderSequenceToLines(capped, sequence, width, { theme: DARK_THEME, capabilities });
        expect(got, `sequence at ${String(width)}`).toEqual(expected);
        // The fixture responds: the cap's marker is in the frame, and the floor's
        // rows are, so the composition rules were exercised rather than absent.
        expect(got.some((line) => line.includes(" of 30 rows")), "the cap's marker").toBe(true);
        expect(got.length).toBeGreaterThan(sequence.length + 4); // cells-ok — rows
      }
    }
  });
});
