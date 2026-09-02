// C22 §6i — auto-orbit, the camera's second writer, and the two animations that
// must not corrupt each other.
//
// **The rows are indexed by §6i's two artefacts.** The table's rows 3, 4 and 5
// are the ones with no counterpart in the trace — one timer cannot be a cadence
// for two animations, and the commit reason rather than the interval is what
// caps the frame rate — so they are where the assertions are.
//
// **Frames are counted, never timed** (`render-cache.test.ts`'s rule). The claim
// is *this many frames landed in this much of the clock's time*, on a fake clock
// and fake timers; a wall-clock assertion here would be group 12's flake.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Camera } from "../../src/data/viewmodel/index.js";
import { Cameras } from "../../src/shell/cameras.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor } from "../../tools/plot-catalogue.mjs";
import { parseLine } from "../../tools/catalogue-png.mjs";

const CAP = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const caps24 = (CAP.find((c) => c.name === "24bit")?.caps ?? {}) as Record<string, unknown>;
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const runsOf = parseLine as (l: string) => readonly { text: string; colour: string | null }[];

/** `Down` on the wire, in both the forms a terminal sends. */
const DOWN = "\u001b[B";

/** One revolution in twelve seconds, in radians per millisecond — session.ts's ORBIT_RATE. */
const RATE = (2 * Math.PI) / 12_000;

/**
 * A watcher that records what the render context carried, per frame.
 *
 * **A registered kind rather than a spy**, which is `render-cache.test.ts`'s
 * rule: the value is observed from inside the production render path, through
 * the public extension point an app uses.
 */
function watching(): {
  definition: BlockDefinition;
  cameras: () => readonly Readonly<Record<string, Camera>>[];
  ticks: () => readonly number[];
} {
  const cams: Readonly<Record<string, Camera>>[] = [];
  const ticks: number[] = [];
  return {
    cameras: () => cams,
    ticks: () => ticks,
    definition: {
      kind: "count",
      measure: () => 1,
      render: (_b, ctx) => {
        cams.push(ctx.cameras ?? {});
        ticks.push(ctx.tick);
        return inkRows(["counted"]);
      },
    },
  };
}

/** A focusable 3D plot — `camera` is what declares the element (C12 I85). */
const plot = (id = "p"): Record<string, unknown> => ({
  kind: "plot",
  id,
  form: "line",
  height: 3,
  camera: { azimuth: 0 },
  series: [{ label: "s", values: [1, 2, 3] }],
});

const SPINNER = {
  kind: "panel",
  id: "pan",
  title: "build",
  children: [{ kind: "steps", id: "s", steps: [{ label: "building", state: "active" }] }],
};

async function session(
  definition: BlockDefinition,
  blocks: readonly unknown[],
  overrides: Record<string, unknown> = {},
) {
  const stdin = fakeStdin();
  const built = await buildSession(
    {
      stdin: stdin as never,
      blocks: [definition],
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "two rows", args: [], flags: [] }],
      },
      localHandlers: { rows: () => ({ schema: "tui.view/1", status: "ok", blocks }) },
      ...overrides,
    } as never,
    { columns: 80, rows: 20 },
  );

  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };

  await type("/rows\r");
  await Promise.resolve();
  await Promise.resolve();
  // `Down` from the prompt lands on the first focusable element, which is the
  // plot: the counter declares none, and a plot declares one exactly when it
  // declares a camera (C12 I85).
  await type(DOWN);
  return { ...built, type };
}

/**
 * Advance the injected clock and the timers together — a wake with time in it.
 *
 * **For the rate rows.** How many frames land in this much of the clock's time
 * is the whole claim, so the two have to move at the same speed.
 */
const wake = async (
  built: { clock: { advance: (ms: number) => void } },
  ms: number,
): Promise<void> => {
  built.clock.advance(ms);
  await vi.advanceTimersByTimeAsync(ms);
};

/**
 * Let `ms` of the clock pass, then run the timers out without adding more.
 *
 * **For the angle rows, and the difference is what makes them exact.** An
 * animation reads `now - lastAt`, so the whole of an interval is captured by
 * whichever wake happens after it; running the timers with the clock held still
 * guarantees one such wake and leaves the later ones with nothing to advance. So
 * the angle after `pass(a)` and `pass(b)` is exactly the angle after
 * `pass(a + b)` — which is the property, rather than an artefact of when the
 * timer happened to fire.
 */
const pass = async (
  built: { clock: { advance: (ms: number) => void } },
  ms: number,
): Promise<void> => {
  built.clock.advance(ms);
  await vi.advanceTimersByTimeAsync(400);
};

describe("C22 §6i — the store's flag", () => {
  it("T1.28 (C22 I72): the flag is recorded, and it is not in the key", () => {
    const c = new Cameras();
    const declared = { azimuth: 0 };

    // **Off is the default and nothing declares otherwise** (C04 I75).
    expect(c.orbiting("e", "p"), "off before anything touches it").toBe(false);

    c.setOrbit("e", "p", declared, true);
    expect(c.orbiting("e", "p"), "on after the toggle").toBe(true);
    expect(c.key("e"), "and the key says nothing moved").toBe("");

    // **The control, and it is what makes the assertion above mean anything**: a
    // key function returning "" unconditionally would pass every line so far.
    c.nudge("e", "p", declared, { azimuth: 0.5 });
    const moved = c.key("e");
    expect(moved, "a nudge does move the key").not.toBe("");

    // **And the toggle is still not in it**, with the camera off its baseline —
    // which is the frame a reader stops the rotation to look at.
    c.setOrbit("e", "p", declared, false);
    expect(c.orbiting("e", "p"), "off again").toBe(false);
    expect(c.key("e"), "and the key is untouched by the toggle").toBe(moved);
  });

  it("T3.34 (C22 I73, §6i trace row 5): eviction takes the flag and the camera together", () => {
    const c = new Cameras();
    const declared = { azimuth: 0 };
    c.nudge("e", "p", declared, { azimuth: 0.5 });
    c.setOrbit("e", "p", declared, true);
    expect(c.size, "the entry is held").toBe(1);

    c.delete("e");
    expect(c.orbiting("e", "p"), "the flag went with the camera").toBe(false);
    expect(c.key("e"), "and so did the key").toBe("");
    expect(c.size, "one store, one eviction").toBe(0);
  });

  it("T1.30b (C22 I75): reset restores the view and leaves the orbit alone", () => {
    const c = new Cameras();
    const declared = { azimuth: 0 };
    c.setOrbit("e", "p", declared, true);
    c.nudge("e", "p", declared, { azimuth: 0.5, distance: -2 });
    expect(c.key("e")).not.toBe("");

    c.reset("e", "p", declared);
    expect(c.key("e"), "back to the declared view").toBe("");
    expect(c.cameraFor("e", "p", declared).azimuth, "exactly the baseline").toBe(0);
    // **`r` is about where the camera is and `o` about whether it moves.** One
    // key answering both questions is the fold this row refuses.
    expect(c.orbiting("e", "p"), "and it is still turning").toBe(true);
  });
});

describe("C22 §6i — the ticker is the second writer", () => {
  it("T1.29 (C22 I74): the angle depends on the total elapsed time and nothing else", async () => {
    vi.useFakeTimers();
    try {
      const w = watching();
      const built = await session(w.definition, [{ kind: "count", id: "c" }, plot()]);
      await built.type("o");

      // Four passes of 33 ms.
      for (let i = 0; i < 4; i += 1) await pass(built, 33);
      const short = w.cameras().at(-1)?.p?.azimuth ?? 0;

      // The same total in one wake, from a second session — a fresh store rather
      // than a continuation, so the two runs are comparable rather than
      // cumulative.
      const w2 = watching();
      const b2 = await session(w2.definition, [{ kind: "count", id: "c" }, plot()]);
      await b2.type("o");
      await pass(b2, 132);
      const long = w2.cameras().at(-1)?.p?.azimuth ?? 0;

      expect(short, "the run moved at all").toBeGreaterThan(0);
      expect(short, "132 ms is 132 ms, however it is cut up").toBeCloseTo(long, 9);
      expect(short, "and it is one revolution in twelve seconds").toBeCloseTo(RATE * 132, 9);

      // **The control**: a different total must differ. Without it the row
      // passes against an implementation that advances by a constant.
      const w3 = watching();
      const b3 = await session(w3.definition, [{ kind: "count", id: "c" }, plot()]);
      await b3.type("o");
      await pass(b3, 264);
      expect(w3.cameras().at(-1)?.p?.azimuth ?? 0, "twice the time, twice the turn").toBeCloseTo(
        RATE * 264,
        9,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.17l (C22 I74): an orbit and a spinner do not take each other's cadence", async () => {
    vi.useFakeTimers();
    try {
      // **The plot alone**, at 33 ms with nothing else on screen.
      const SPAN = 400;

      // **The plot alone**, with nothing else asking for a wake.
      const a = watching();
      const ba = await session(a.definition, [{ kind: "count", id: "c" }, plot()]);
      await ba.type("o");
      await pass(ba, SPAN);
      const aloneAz = a.cameras().at(-1)?.p?.azimuth ?? 0;

      // **The spinner alone**, so the counter has a figure to be compared with.
      const s = watching();
      const bs = await session(s.definition, [{ kind: "count", id: "c" }, SPINNER, plot()]);
      const sBefore = s.ticks().at(-1) ?? 0;
      await pass(bs, SPAN);
      const aloneTick = (s.ticks().at(-1) ?? 0) - sBefore;

      // **Both together, over the same elapsed time and at the capped cadence**,
      // which is the arrangement §6i table row 3 describes: the timer is armed at
      // the faster of 100 ms and the spinner's 80, so a step-per-wake orbit turns
      // 25% fast and a step-per-wake counter spins at the orbit's rate.
      const t = watching();
      const bt = await session(t.definition, [{ kind: "count", id: "c" }, SPINNER, plot()], {
        capabilities: { synchronisedUpdate: false },
      });
      await bt.type("o");
      const tick0 = t.ticks().at(-1) ?? 0;
      await pass(bt, SPAN);

      expect(aloneAz, "the orbit turned at all").toBeGreaterThan(0);
      expect(aloneAz, "by exactly the elapsed time").toBeCloseTo(RATE * SPAN, 9);
      expect(t.cameras().at(-1)?.p?.azimuth ?? 0, "the angle is the plot's own").toBeCloseTo(
        aloneAz,
        9,
      );
      expect(aloneTick, "the spinner counted at all").toBeGreaterThan(0);
      expect((t.ticks().at(-1) ?? 0) - tick0, "and the counter is the spinner's own").toBe(
        aloneTick,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.17j (C22 I73): a live orbit draws at the stream rate and a spinner at the spinner's", async () => {
    vi.useFakeTimers();
    try {
      // **Frames rather than the reason string.** The reason is not observable
      // from outside `session.ts`, and what it does is the whole claim: an orbit
      // committing `spinner` draws at 10fps however fast the timer fires,
      // because C03's 100 ms window is a floor (C22 I60a, F466).
      // **The capability is pinned on both arms**, so the only difference is
      // whether an orbit is live. The harness's default env resolves
      // `synchronisedUpdate` to `false` — `TERM` alone identifies no terminal —
      // which is T4.17k's arm and would make this row measure the capability
      // instead of the reason.
      const SYNC = { capabilities: { synchronisedUpdate: true } };
      const s = watching();
      const bs = await session(s.definition, [{ kind: "count", id: "c" }, SPINNER, plot()], SYNC);
      const spinnerBefore = s.cameras().length;
      for (let i = 0; i < 30; i += 1) await wake(bs, 33);
      const spinnerFrames = s.cameras().length - spinnerBefore;

      const o = watching();
      const bo = await session(o.definition, [{ kind: "count", id: "c" }, SPINNER, plot()], SYNC);
      await bo.type("o");
      const orbitBefore = o.cameras().length;
      for (let i = 0; i < 30; i += 1) await wake(bo, 33);
      const orbitFrames = o.cameras().length - orbitBefore;

      // **Renders, not writes** — and the first draft counted `stdout.chunks`,
      // which reported the two arms as equal at 45 apiece. C03 wraps a frame in
      // DECSET 2026 when the capability is present, so a chunk count is three
      // per frame there and one without it: the metric was measuring the
      // capability it had just pinned. The watcher's push is one per render of
      // the entry, and an animating entry misses the cache on every frame.
      //
      // Measured over 990 ms of the clock: 5 for the spinner alone, 15 with the
      // orbit live. The bound is a third of that ratio — wide enough to survive
      // a scheduler tweak, narrow enough to fail the mutation that commits
      // `spinner`.
      expect(spinnerFrames, "the spinner drew at all").toBeGreaterThan(0);
      expect(orbitFrames, "and the orbit draws far more often over the same 990 ms").toBeGreaterThan(
        spinnerFrames * 2,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.17k (C22 I73, AN5): without synchronised update the rate is capped, and with it it is not", async () => {
    vi.useFakeTimers();
    try {
      const withIt = watching();
      const a = await session(withIt.definition, [{ kind: "count", id: "c" }, plot()], {
        capabilities: { synchronisedUpdate: true },
      });
      await a.type("o");
      const aBefore = withIt.cameras().length;
      for (let i = 0; i < 30; i += 1) await wake(a, 33);
      const fast = withIt.cameras().length - aBefore;

      const without = watching();
      const b = await session(without.definition, [{ kind: "count", id: "c" }, plot()], {
        capabilities: { synchronisedUpdate: false },
      });
      await b.type("o");
      const bBefore = without.cameras().length;
      for (let i = 0; i < 30; i += 1) await wake(b, 33);
      const capped = without.cameras().length - bBefore;

      // **Both arms, because a cap that always applies and one that never does
      // read the same from a passing suite.** Counted as renders rather than as
      // writes, for T4.17j's reason: a chunk count is three per frame with the
      // capability and one without, so it would compare the wrapper and not the
      // rate.
      expect(fast, "with the capability, the stream rate").toBeGreaterThan(capped * 2);
      expect(capped, "and without it, still turning").toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C22 §6i — the cache, and the manual family", () => {
  it("T4.17i (C22 I72): a static 3D plot hits, a nudge misses, and a toggle hits", async () => {
    let renders = 0;
    const definition: BlockDefinition = {
      kind: "count",
      measure: () => 1,
      render: () => {
        renders += 1;
        return inkRows(["counted"]);
      },
    };
    const built = await session(definition, [{ kind: "count", id: "c" }, plot()]);

    const settled = renders;
    expect(settled, "it rendered at all").toBeGreaterThan(0);
    await built.type("x");
    expect(renders, "a frame with nothing moved is served from the cache").toBe(settled);

    await built.type("[");
    const afterNudge = renders;
    expect(afterNudge, "a camera that moved is a miss").toBeGreaterThan(settled);

    // **The flag is not in the key** (C22 I72). A toggle that moves no camera moves
    // no cell, and this is the row that says so.
    await built.type("o");
    expect(renders, "and the toggle is not a miss").toBe(afterNudge);
    await built.type("o");
    expect(renders, "in either direction").toBe(afterNudge);
  });

  it("T1.30 (C22 I75): the dolly scales, so it never reaches the degenerate distance", async () => {
    const w = watching();
    const built = await session(w.definition, [{ kind: "count", id: "c" }, plot()]);

    const seen: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      await built.type("+");
      seen.push(w.cameras().at(-1)?.p?.distance ?? Number.NaN);
    }
    // **The hazard is passing through a blank frame, not landing on a wrong
    // one**: `distance: 0` inks nothing and is the only degenerate value, and an
    // additive control of the same magnitude reaches it in twelve presses.
    expect(Math.min(...seen), "never at or below zero").toBeGreaterThan(0);
    expect(seen.at(-1), "twelve presses in").toBeCloseTo(6 / 1.25 ** 12, 9);

    for (let i = 0; i < 12; i += 1) await built.type("-");
    expect(w.cameras().at(-1)?.p?.distance ?? Number.NaN, "and back where it started").toBeCloseTo(
      6,
      9,
    );
  });

  it("T4.17n (F470): a plot inside a panel can be focused, so it must be reachable", async () => {
    // **`elementsIn` walks into `panel` and `group`**, so focus lands on a
    // nested block — and every effect resolved the block with a top-level
    // `find`. `b.live` builds a panel, which is how a defect this shape stays
    // invisible: the arrangement the framework itself produces is the one that
    // fails.
    const w = watching();
    const built = await session(w.definition, [
      { kind: "count", id: "c" },
      { kind: "panel", id: "pan", title: "inside", children: [plot("deep")] },
    ]);

    await built.type("[");
    const cam = w.cameras().at(-1)?.deep;
    expect(cam, "the nested plot's camera reached the renderer").toBeDefined();
    expect(cam?.azimuth ?? 0, "and the key turned it").toBeCloseTo(-Math.PI / 8, 9);
  });
});

describe("C22 §6i — what the frame does under an orbit", () => {
  const cellsOf = (rowsIn: readonly string[]): { text: string; colour: string | null }[][] =>
    rowsIn.map((line) => {
      const out: { text: string; colour: string | null }[] = [];
      for (const run of runsOf(line))
        for (const ch of [...run.text]) out.push({ text: ch, colour: run.colour });
      return out;
    });

  const bowl = Array.from({ length: 41 }, (_, i) =>
    Array.from({ length: 41 }, (_, j) => {
      const x = (i / 40) * 4 - 2;
      const y = (j / 40) * 4 - 2;
      return Math.sin(x * 1.5) * Math.cos(y * 1.5) * Math.exp(-(x * x + y * y) / 6);
    }),
  );
  const at = (az: number): readonly string[] =>
    frame(
      {
        form: "scatter3d",
        height: 24,
        surfaces3: [{ heights: bowl, tone: "accent" }],
        camera: { azimuth: az },
      },
      caps24,
      80,
    );

  it("T4.17m (C22 I72, F468): an orbit step changes a fraction of the frame, not all of it", () => {
    // **Row against row and index against index** — never by string position,
    // which reported 71% where the cell-wise figure is a third of that: one
    // changed cell shifts every escape sequence after it.
    const base = cellsOf(at(0));
    const total = base.reduce((n, r) => n + r.length, 0);
    const inked = base.flat().filter((c) => c.text !== " ").length;

    const share = (step: number): number => {
      const other = cellsOf(at(step));
      let diff = 0;
      for (let r = 0; r < base.length; r += 1) {
        const a = base[r] ?? [];
        const b = other[r] ?? [];
        for (let c = 0; c < Math.max(a.length, b.length); c += 1) {
          if (a[c]?.text !== b[c]?.text || a[c]?.colour !== b[c]?.colour) diff += 1;
        }
      }
      return diff / total;
    };

    expect(inked, "most of the frame is blank, which is half the reason").toBeLessThan(total / 2);
    const small = share(Math.PI / 256);
    const big = share(Math.PI / 8);
    // Measured 22.0% and 53.2%; the bounds are wide enough to survive a palette
    // change and narrow enough to fail *every cell changes*.
    expect(small, "a step at the rate an orbit turns").toBeGreaterThan(0.05);
    expect(small, "is nowhere near every cell").toBeLessThan(0.35);
    expect(big, "and a jump changes more, but still not all of it").toBeGreaterThan(small);
    expect(big, "under three quarters even at pi/8").toBeLessThan(0.75);
  });

  it("T3.33 (C22 I75): the pole draws, and it is a plan view rather than a line", () => {
    const view = (elevation: number): readonly string[] =>
      frame(
        {
          form: "scatter3d",
          height: 24,
          surfaces3: [{ heights: bowl, tone: "accent" }],
          camera: { elevation },
        },
        caps24,
        80,
      );
    const inkOf = (f: readonly string[]): number =>
      cellsOf(f)
        .flat()
        .filter((c) => c.text !== " ").length;
    const colsUsed = (f: readonly string[]): number => {
      const used = new Set<number>();
      for (const row of cellsOf(f)) row.forEach((c, i) => void (c.text === " " ? null : used.add(i)));
      return used.size;
    };

    const near = view(Math.PI / 2 - 0.01);
    const pole = view(Math.PI / 2);
    const past = view(Math.PI / 2 + 0.2);

    expect(inkOf(pole), "the pole draws").toBeGreaterThan(0);
    // **The claim it replaces**: `basisOf`'s comment said the figure collapses
    // to a line. `cos(pi/2)` is 6.123e-17, so it cannot (F467).
    expect(colsUsed(pole), "and it is a picture rather than a column").toBeGreaterThan(10);
    expect(inkOf(pole)).toBeGreaterThan(inkOf(near) * 0.5);
    expect(inkOf(past), "and past the pole is a view, not a corruption").toBeGreaterThan(0);
  });
});
