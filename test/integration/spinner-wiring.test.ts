// C22 §6c, C09 I32 — the three wirings that make `RenderContext.tick` advance.
//
// **F227's subject, and its measurement is the spec for these rows.** The
// counter is documented as advanced by C03's spinner commit; nothing raised one,
// `visibleRows` supplied none, and the line cache had no axis for it. Measured
// before the fix, a `steps` block drew `⠋⠋⠋⠋⠋⠋⠋⠋⠋⠋` across ten real frames while
// the same block through `measurable({ tick })` drew all ten.
//
// **The first two are a pair and the third fails differently.** Supplying the
// counter with no producer leaves the frame exactly as frozen — measured, and it
// is why the obvious repair was indistinguishable from doing nothing — so the
// revert that stands against them removes both. The cache axis is separate:
// with the pair wired and the axis missing, a block animates on a cache miss and
// freezes on a hit, which is intermittent rather than frozen.
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { ANIMATES } from "../../src/presentation/blocks/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import type { BlockKind } from "../../src/data/viewmodel/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

/**
 * The three that register from their own components, so every fixture is
 * measured through its real definition rather than through `raw` (C09 I10).
 * Without them `table`, `plot` and `patch` render as their own JSON — which does
 * not animate, so the row would reach the right answer by the wrong route.
 */
const REGISTERED_ELSEWHERE: readonly BlockDefinition<never>[] = [
  tableDefinition as unknown as BlockDefinition<never>,
  plotDefinition as unknown as BlockDefinition<never>,
  patchDefinition as unknown as BlockDefinition<never>,
];

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "work", local: true, summary: "a running step", args: [], flags: [] }],
};

/**
 * **The spinner is inside a `panel`, and the mutation pass is why.**
 *
 * With the block at the top level, removing the container walk from
 * `animationIntervalOf` survived every row here — the scan found it without ever
 * descending. A `steps` inside a `panel` is not a contrived arrangement: it is
 * precisely what `b.live` builds, because `Panel` is the only kind with a title
 * and the title is where a live part says what state it is in. So the fixture is
 * the shape the framework itself produces, and the top-level case is covered by
 * the same walk on its way in.
 */
const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  work: () => ({
    schema: "tui.view/1",
    command: "work",
    status: "ok",
    blocks: [
      {
        kind: "panel",
        id: "p",
        title: "build",
        children: [
          { kind: "steps", id: "s", steps: [{ label: "building", state: "active" }] },
        ],
      } as never,
    ],
  }),
};

describe("C22 §6c — the counter advances in a real session", () => {
  it("T4.35 (C09 I32, C22 I60, F227): ten frames, ten spinner cells", async () => {
    // **Fake timers rather than real ones**, because the claim is that the chain
    // is wired and not that a machine can keep 80 ms. The harness's `schedule`
    // is `setTimeout`, so advancing them drives exactly the production path:
    // the ticker fires, `commit("spinner")` reaches C03, C03's window elapses,
    // `#render` runs, `visibleRows` supplies the counter and the cache misses on
    // the entry that animates.
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock } = await buildSession({
        manifest: MANIFEST,
        localHandlers: HANDLERS,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/work\r");
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      // **The clock moves with the timers, and it has to** (C22 I74). The
      // counter advances by whole intervals of *elapsed* time rather than once
      // per firing, so one timer cannot be a cadence for two animations — and a
      // harness whose timers run while its clock stands still is asserting a
      // world where a wake is not time passing.
      const step = async (ms: number): Promise<void> => {
        clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
      };

      // **The spinner cell, not the row's first character.** With the block
      // inside a panel the first character is the border, and reading it gave
      // thirty identical `│` — a measurement of the furniture rather than of the
      // thing under test.
      const cell = (): string => {
        const row = screen().rows.find((r) => r.includes("building"));
        if (row === undefined) return "<absent>";
        return /[\u2800-\u28ff]/u.exec(row)?.[0] ?? "<none>";
      };

      const seen = [cell()];
      // **Thirty samples for a ten-frame set, and the surplus is deliberate.**
      // The ticker arms at the set's 80 ms and C03 coalesces at 100 ms, so a
      // fixed sampling interval aliases against the two and a ten-sample run
      // sees eight. Sampling past the set rather than tuning the interval keeps
      // the row about the chain being wired rather than about the arithmetic of
      // two cadences.
      for (let i = 0; i < 29; i += 1) {
        await step(150);
        await settle();
        seen.push(cell());
      }

      expect(seen.join(""), "the cell is on the screen at all").not.toContain("<absent>");
      // **The whole set, not merely *some* movement.** A chain that advanced
      // once and stopped would pass a `size > 1` assertion, and the defect this
      // stands against produced exactly one distinct glyph.
      expect(new Set(seen).size, `the frames drawn were ${seen.join("")}`).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.36 (C22 I60, F227): the cache misses when only the counter moved", async () => {
    // **The third wiring, and it fails differently from the other two.** With the
    // counter supplied and this axis missing the entry is served its first frame
    // on every cache *hit* — so the spinner turns whenever something else
    // invalidated the slot and freezes when nothing did. Intermittent is worse
    // than frozen, which is why it has its own row.
    //
    // Asserted on two renders where nothing but the tick moved: same rev, same
    // width, same focus, same theme, same window.
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen, clock } = await buildSession({
        manifest: MANIFEST,
        localHandlers: HANDLERS,
        stdin: stdin as never,
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/work\r");
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      const rowOf = (): string =>
        screen().rows.find((r) => r.includes("building")) ?? "<absent>";
      const before = rowOf();
      // Past the ticker's 80 ms *and* C03's 100 ms window, so one tick has
      // certainly landed — 150 ms lands inside the first window and is where
      // this row first read as a cache hit rather than as a timing artefact.
      // The injected clock moves with them (C22 I74) — see T4.35's `step`.
      clock.advance(250);
      await vi.advanceTimersByTimeAsync(250);
      await settle();
      expect(rowOf(), "the held lines were not reused").not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C09 I32 — the animating record", () => {
  it("T4.37 (C09 I32, F228): ANIMATES is measured against behaviour, not a second list", () => {
    // **A behavioural equality rather than two lists compared.** F228's class is
    // a hand-maintained list beside a generated one, and comparing `ANIMATES` to
    // another literal would be exactly that — a coverage set drawn from the
    // test's own table, agreeing with itself. So the right-hand side is measured:
    // render every corpus fixture at two ticks and see which ones move.
    //
    // A `Record<BlockKind, boolean>` and not a `Set` for the other direction: a
    // kind joining the union with no entry is a type error, and an entry naming
    // a kind that has gone is one too. A `Set` of two strings compiles with
    // either missing.
    const moves = new Set<BlockKind>();

    for (const [kind, fixture] of Object.entries(ONE_PER_KIND)) {
      const at = (tick: number): string =>
        measurable({ capabilities: FULL_CAPS, tick, definitions: REGISTERED_ELSEWHERE })
          .renderToLines(fixture, 60)
          .join("\n");
      if (at(0) !== at(5)) moves.add(kind as BlockKind);
    }

    const declared = new Set(
      (Object.entries(ANIMATES) as readonly (readonly [BlockKind, boolean])[])
        .filter(([, yes]) => yes)
        .map(([kind]) => kind),
    );

    // Both directions, by equality. A kind that animates and is not declared
    // arms no ticker and freezes; one declared that does not animate arms a
    // timer forever for a frame that never changes.
    expect([...moves].sort(), "what actually moves between two ticks").toEqual(
      [...declared].sort(),
    );
    expect(declared.size, "and the population is not empty, so this is not vacuous").toBeGreaterThan(
      0,
    );
  });
});
