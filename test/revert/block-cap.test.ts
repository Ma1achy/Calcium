// C14 §4b tier 6 — fail-on-revert. Each names the change that makes it fail.
//
// The cap has three halves that each read as complete on their own — a count, a
// frame, and a window — and a revert of any one leaves the other two green. T6.22
// is the row that holds them together: the count and the frame are asserted
// **against each other**, so removing the cap from `measure` alone breaks C09 I1 and
// removing it from `render` alone is the silent truncation the marker exists to
// end. T6.23 is the predicate: a kind the registry has never heard of.
import { describe, expect, it } from "vitest";

import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry, type BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Windowed } from "../../src/presentation/blocks/types.js";
import { rows as rowsOf } from "../../src/presentation/blocks/paint.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, LOUD, visible } from "../support/render.js";

const W = 80;
const ELLIPSIS = String.fromCodePoint(0x2026);

const logs = (n: number): Block =>
  ({
    kind: "logs",
    id: "l",
    lines: Array.from({ length: n }, (_, i) => ({ ts: "12:00:00", level: "info", message: `line ${String(i)}` })),
  }) as Block;

type Lane = Readonly<{ kind: "lanek-revert"; id: string; lines: readonly string[] }>;
const asLane = (b: Block): Lane => b as unknown as Lane;
const laneDefinition: BlockDefinition = {
  kind: "lanek-revert",
  measure: (b) => Math.max(1, asLane(b).lines.length), // cells-ok — a line count, not a width
  render: (b) => rowsOf(asLane(b).lines),
  window: (b: Block, _w: number, from: number, to: number): Windowed => ({
    block: { ...asLane(b), lines: asLane(b).lines.slice(from, to) } as unknown as Block,
    skipRows: 0,
    dropRows: 0,
  }),
};

describe("C14 §4b fail-on-revert", () => {
  it("T6.22 (C14 I24): removing the capped form from `measure` or from `render` alone → the count and the frame disagree", () => {
    for (const cap of [1, 10, 100]) {
      const r = createBlockRegistry({ maxBlockRows: cap, onError: LOUD });
      const b = logs(250);
      const drawn = renderToLines(r, b, W, { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0 });
      // **C09 I1 through the registry itself.** A revert on either side is a
      // height that fits a frame nobody sees, or a frame the index never counted.
      expect(r.measure(b, W), `cap ${String(cap)}: measured`).toBe(cap + 1);
      expect(drawn.length, `cap ${String(cap)}: the frame is the count`).toBe(cap + 1);
      expect(visible(drawn[cap] ?? "").trimEnd(), `cap ${String(cap)}: the last row says what was cut`).toBe(
        `${ELLIPSIS} ${cap.toLocaleString("en-GB")} of 250 rows`,
      );
    }
  });

  it("T6.22 (C14 I25): removing the `capped` re-attachment in `windowSequence` → the piece reaching the marker measures one short and its last row is content", () => {
    const r = createBlockRegistry({ maxBlockRows: 10, onError: LOUD });
    const b = logs(25);
    const win = r.windowSequence([b], W, 8, 11);
    const piece = win.blocks[0] as Block;
    const drawn = renderToLines(r, piece, W, { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0 });
    expect(r.measure(piece, W)).toBe(3);
    expect(drawn.length).toBe(3);
    expect(visible(drawn[2] ?? "").trimEnd()).toBe(`${ELLIPSIS} 10 of 25 rows`);
    // And the same window one row short of the marker carries none: a revert
    // that attaches unconditionally puts a marker in the middle of the block.
    const short = r.windowSequence([b], W, 8, 10).blocks[0] as Block;
    expect(r.measure(short, W)).toBe(2);
    expect((short as { capped?: unknown }).capped).toBeUndefined();
  });

  it("T6.23 (C14 I26): consulting a list of kinds instead of `definition.window` → a kind the list never heard of is not capped", () => {
    const r = createBlockRegistry({ maxBlockRows: 10, onError: LOUD });
    r.register(laneDefinition);
    const b = { kind: "lanek-revert", id: "x", lines: Array.from({ length: 25 }, (_, i) => `row ${String(i)}`) } as unknown as Block;
    expect(r.measure(b, W)).toBe(11);
    const drawn = renderToLines(r, b, W, { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0 });
    expect(visible(drawn[10] ?? "").trimEnd()).toBe(`${ELLIPSIS} 10 of 25 rows`);
  });
});
