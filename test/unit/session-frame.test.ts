// C22 §6 — the frame, and the two values sampled exactly once per frame.
//
// Both have a failure attached rather than a tidiness argument: two clock reads
// print two times in one frame (I13a), and two width reads compose a frame
// against two widths, which wraps — and a wrap scrolls the alternate screen,
// the one failure that corrupts state the application cannot see (C01 §5).
import { describe, expect, it } from "vitest";

import { compose, gutterMatchesPrompt } from "../../src/shell/frame.js";
import { composeFrame } from "../../src/shell/render-frame.js";
import { FrameError } from "../../src/shell/frame-error.js";
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

    // 30 − header 1 − its rule 1 (C22 I87) − rules 2 − prompt 1 − footer 0 (`[]`, C22 I82).
    expect(at(30, 1).region).toEqual({ top: 2, height: 25 });
    expect(at(30, 4).region, "a wrapped prompt takes the rows from the transcript").toEqual({
      top: 2,
      height: 22,
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

    expect(f.overlayRegion).toEqual({ width: 100, height: 25 });
    expect(f.region).toEqual({ top: 2, height: 25 });
    expect(f.overlayRegion.height, "one number, not two").toBe(f.region.height);
  });
});

describe("C22 §6 — the height the viewport is given", () => {
  it("T4.11f (C14 I22, C22 I34): the region's height reaches the viewport, not the terminal's", () => {
    // **The failure is silent in both directions**, which is why this is a row
    // rather than a comment. It was `size.rows` in the resize handler: three
    // rows too tall from the first frame, so `#maxTop()` stopped short by the
    // chrome and the last rows of a tall entry were unreachable by `End`,
    // `PageDown` or `↓` — while the surplus rows `visible()` selected were
    // discarded by the paint, so no count downstream was ever surprised.
    //
    // The fixture makes the two numbers differ by construction: a header and a
    // footer row apiece, plus the prompt, so `region.height` is strictly less
    // than `rows` and an assertion cannot pass on both readings at once.
    const frame = compose({
      chrome: {
        header: () => [{ kind: "raw", id: "h", text: "header" }],
        footer: () => [{ kind: "raw", id: "f", text: "footer" }],
      },
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
      now: () => 1000,
      size: () => ({ columns: 100, rows: 30 }),
      promptRows: () => 1,
    });

    expect(frame.region.height, "the chrome and prompt cost rows").toBeLessThan(frame.size.rows);

    // `composeFrame` hands the viewport its height before it paints, so the
    // resize is observable without a paint. The paint is not this row's
    // subject, and its failure path is C22 I56's.
    const given: { width: number; height: number }[] = [];
    composeFrame({
      composed: () => frame,
      paintDeps: () => {
        // A `FrameError` takes the documented fallback; anything else is
        // rethrown, which is the narrowing that makes this substitution honest
        // rather than a way of swallowing a real failure.
        throw new FrameError("paint is not this row's subject");
      },
      resizeViewport: (size) => given.push({ ...size }),
      cursorSequence: () => "",
      cursorShape: () => "",
      previous: () => null,
    });

    expect(given, "one resize per frame").toHaveLength(1);
    expect(given[0]!.height, "the region's, not the terminal's").toBe(frame.region.height);
    expect(given[0]!.height, "and the two are not the same number here").not.toBe(frame.size.rows);
    expect(given[0]!.width).toBe(frame.size.columns);
  });
});
