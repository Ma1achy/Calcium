// C22 §6 — the frame, and the two values sampled exactly once per frame.
//
// Both have a failure attached rather than a tidiness argument: two clock reads
// print two times in one frame (I13a), and two width reads compose a frame
// against two widths, which wraps — and a wrap scrolls the alternate screen,
// the one failure that corrupts state the application cannot see (C01 §5).
import { describe, expect, it } from "vitest";

import { compose, gutterMatchesPrompt } from "../../src/shell/frame.js";
import { PROMPT_GUTTER } from "../../src/shell/config.js";
import type { ChromeContext, SessionSnapshot } from "../../src/shell/types.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";

/** C09's measurer, for the footer's height (C22 I82). */
const MEASURE = createBlockRegistry({ defaults: true }).measureSequence;

const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});

/**
 * **A clock that advances on every read**, not a monotonic fake.
 *
 * A stable clock passes whether the value is sampled once or twice, which is
 * the setup where both readings agree — so it could not distinguish the code
 * from the defect it is written against (A03 §2).
 */
function tickingClock() {
  let n = 0;
  return () => {
    n += 1;
    return n * 1000;
  };
}

function countingSize(columns = 100, rows = 30) {
  let reads = 0;
  return {
    read: () => {
      reads += 1;
      return { columns, rows };
    },
    get reads() {
      return reads;
    },
  };
}

describe("C22 §6 — the frame", () => {
  it("T4.11 (I13a): header and footer receive the same `now`", () => {
    const seen: number[] = [];
    const record = (ctx: ChromeContext): [] => {
      seen.push(ctx.now);
      return [];
    };

    compose({
      chrome: { header: record, footer: record },
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
      now: tickingClock(),
      size: () => ({ columns: 100, rows: 30 }),
      promptRows: () => 1,
    });

    expect(seen).toHaveLength(2);
    expect(seen[0], "one sample, two consumers").toBe(seen[1]);
  });

  it("T4.11b (C01 §5): the width is read once per frame", () => {
    // The per-frame snapshot C01 §5 says belongs with whoever writes the frame
    // path. `size()` is the accessor it asked for; reading it twice is the
    // thing the accessor cannot prevent, so the assertion is on the count.
    const size = countingSize();

    compose({
      chrome: { header: () => [], footer: () => [] },
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
      now: () => 1000,
      size: size.read,
      promptRows: () => 1,
    });

    expect(size.reads).toBe(1);
  });

  it("T4.11c: chrome sees the width, so S01 §4's elisions are reachable", () => {
    // A function given only the session cannot drop version below 90 or the
    // clock below 80. The context carrying `columns` is what makes the table
    // implementable at all.
    let columns = 0;
    compose({
      chrome: {
        header: (ctx) => {
          columns = ctx.columns;
          return [];
        },
        footer: () => [],
      },
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
      now: () => 1000,
      size: () => ({ columns: 72, rows: 30 }),
      promptRows: () => 1,
    });

    expect(columns).toBe(72);
  });

  it("T4.9 (I13): the gutter C22 passes matches the prompt it draws", () => {
    // `displayRows` is computed against the gutter and the prompt is drawn from
    // the glyph; if they disagree the prompt is one row off, and the two are
    // declared in one file and read in two.
    expect(gutterMatchesPrompt()).toBe(true);
    expect(PROMPT_GUTTER).toEqual({ first: 2, cont: 2 });
  });

  it("T4.9b: the region is rows minus chrome minus the prompt, clamped", () => {
    const at = (rows: number, promptRows: number) =>
      compose({
        chrome: { header: () => [], footer: () => [] },
        measureSequence: MEASURE,
        session: () => SESSION,
        copyMode: () => false,
        now: () => 1000,
        size: () => ({ columns: 100, rows }),
        promptRows: () => promptRows,
      });

    // 30 − header 1 − rules 2 − prompt 1 − footer 0 (`[]`, C22 I82).
    expect(at(30, 1).region).toEqual({ top: 1, height: 26 });
    expect(at(30, 4).region, "a wrapped prompt takes the rows from the transcript").toEqual({
      top: 1,
      height: 23,
    });

    // Clamped, not negative. The size gate normally prevents this and normally
    // is not a guarantee: a resize can arrive between the gate and the frame,
    // and a negative height reads as an enormous one after a subtraction.
    expect(at(2, 4).region.height).toBe(0);
  });

  it("T4.9c (C22 I28): the two regions are different shapes and the same height", () => {
    // Both are called a region and they are `{width,height}` and `{top,height}`.
    // Passing either to the other's consumer compiles, because `height` is in
    // both.
    //
    // **The height is one number, and this row used to assert it was two.** The
    // reasoning was that the two are built independently so neither can drift
    // into the other — and what it actually held was the whole terminal against
    // the viewport, which puts a pushed view over the header, the prompt and
    // the footer (C15 T4.4). Nothing could see it: a layer takes no rows, so
    // the sum holds at every width with every layer misplaced, and no component
    // drew a `Placed` at all. The shapes differ; the heights must not.
    const f = compose({
      chrome: { header: () => [], footer: () => [] },
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
      now: () => 1000,
      size: () => ({ columns: 100, rows: 30 }),
      promptRows: () => 1,
    });

    expect(f.overlayRegion).toEqual({ width: 100, height: 26 });
    expect(f.region).toEqual({ top: 1, height: 26 });
    expect(f.overlayRegion.height, "one number, not two").toBe(f.region.height);
  });
});
