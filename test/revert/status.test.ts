// C09 tier 6 — the `status` box's two ladders and its animation.
//
// **Two of these three restore defects that happened during the build**, and
// neither was found by an assertion — both by reading a frame, before either
// could ship. The width ladder
// decided the tag and nothing else, so a bordered padded row was five cells of
// furniture inside a three-cell frame — Ink wrapped it and the block drew ten
// rows against a measured six. Fixing that drew four at width 9, because the
// rows the furniture gave up went nowhere. Reading the frame found both; every
// count in the renderer agreed the whole time.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const status = (over: Readonly<Record<string, unknown>> = {}): never =>
  block({
    kind: "status",
    id: "s",
    state: "error",
    message: "connection refused by the upstream host",
    height: 6,
    ...over,
  } as never) as never;

describe("C09 tier 6 — the status box", () => {
  it("T6.24 (C09 I31): the row count survives every width, which is what the ladders owe", () => {
    // **The revert this stands against is the width ladder deciding only the
    // tag.** Its subject is not the figure but the count: a narrow box that
    // loses its border must hand those rows to the content, or the block is
    // shorter than the number `measure` committed and C14 scrolls a document
    // nobody holds. I1's divergence, reintroduced through the path built to
    // prevent it.
    const kit = measurable({ capabilities: FULL_CAPS });
    for (const width of [1, 2, 3, 5, 8, 9, 11, 12, 13, 30, 200]) {
      const b = status({ height: 6 });
      expect(kit.measure(b, width), `measure at ${String(width)}`).toBe(6);
      expect(kit.renderToLines(b, width).length, `render at ${String(width)}`).toBe(6);
    }
  });

  it("T6.25 (C09 I31): the full figure needs six rows and the ladder was written for five", () => {
    // **The rung as it was first specified.** Two borders, two blanks and a tag
    // row is six; `≥ 5` was on paper for as long as the figure was, and nothing
    // but drawing it would have said so — which is why this row exists rather
    // than a wider assertion about heights.
    const kit = measurable({ capabilities: FULL_CAPS });
    const rows = kit.renderToLines(status({ height: 5 }), 50);
    expect(rows, "five rows").toHaveLength(5);

    // At five the blanks are gone, together, and the tag sits directly under the
    // border. A rung that still believed it could afford the padding would draw
    // a blank here.
    const second = rows[1] ?? "";
    expect(second.includes("[ERROR]"), "the tag is on the second row").toBe(true);
  });

  it("T6.26 (C09 I32): `error` animates when it has something to animate", () => {
    // **Excluding `error` from animating breaks the state composed out of it.**
    // `retrying` is the error box plus a spinner line, so a per-state branch
    // needs an exception the moment the composition is drawn. The proof is that
    // the same box, in the state that reads as terminal, moves when it is given
    // an activity line to move.
    const frames = new Set(
      Array.from({ length: 10 }, (_, tick) =>
        measurable({ capabilities: FULL_CAPS, tick })
          .renderToLines(status({ height: 7, state: "retrying", retryInMs: 8000 }), 46)
          .join("\n")
          .replace(/[^⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/gu, ""),
      ),
    );
    expect(frames.size, "ten ticks, ten frames").toBe(10);
  });
});
