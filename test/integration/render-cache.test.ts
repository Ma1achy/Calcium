// C22 §6c — an entry's rendered lines are cached, and on which axes.
//
// **Counted, never timed.** The claim is *it did not render again*, not *it was
// faster*; a timing assertion under contention is a flake (group 12) and would
// pass on a slow machine that rendered every frame.
//
// The counter is a **registered block kind**, which is the public extension
// point an app uses — so the count is taken from inside the production render
// path rather than from a spy wrapped round it. `renderSequenceToLines` renders
// a whole sequence, so one call is one increment however many blocks an entry
// holds.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

/** How many times the transcript's entry has been rendered. */
function counting(): { definition: BlockDefinition; count: () => number } {
  let n = 0;
  return {
    count: () => n,
    definition: {
      kind: "count",
      measure: () => 1,
      render: () => {
        n += 1;
        return inkRows(["counted"]);
      },
    },
  };
}

/**
 * A counter, and a plot that can be focused (C12 I85).
 *
 * **The plot declares a `camera`, which is what makes it focusable at all** —
 * elements are what a reader can act on, and a plot with no view to turn declares
 * none. Without this member `↓` walks past it and `orbitBlock` returns early on
 * `at.element === null`, which is the state that made the writer unreachable
 * before C12 I85.
 *
 * The counter is first so `↓` from the prompt lands on the plot: `count`
 * declares no elements either.
 */
const PLOT_DOC = [
  { kind: "count", id: "c" },
  {
    kind: "plot",
    id: "p",
    form: "line",
    height: 3,
    camera: { azimuth: 0 },
    series: [{ label: "s", values: [1, 2, 3] }],
  },
];

const TWO_ROWS = [
  {
    kind: "count",
    id: "c",
  },
  {
    kind: "table",
    id: "t",
    columns: [{ key: "name", label: "NAME", align: "left", priority: 1, minWidth: 6 }],
    rows: [
      { id: "r1", cells: { name: { text: "alpha" } }, actions: [{ kind: "fill", label: "a", command: "/a" }] },
      { id: "r2", cells: { name: { text: "bravo" } }, actions: [{ kind: "fill", label: "b", command: "/b" }] },
    ],
  },
];

async function session(definition: BlockDefinition, blocks: readonly unknown[] = TWO_ROWS) {
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
      localHandlers: {
        rows: () => ({ schema: "tui.view/1", status: "ok", blocks }),
      },
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
  return { ...built, type };
}

describe("C22 §6c — the render cache", () => {
  it("T4.16 (I58): one entry drawn twice with nothing changed renders once", async () => {
    const { definition, count } = counting();
    const { screen, type } = await session(definition);

    // **The subject before the claim.** A cache that served nothing and an entry
    // that never rendered are indistinguishable by a count alone.
    expect(screen().rows.join("\n"), "the entry is on screen").toContain("alpha");
    const after = count();
    expect(after, "it rendered at all").toBeGreaterThan(0);

    // A printable key: a new frame, a new prompt row, the same transcript.
    await type("x");
    await type("y");

    expect(count(), "two further frames, no further render").toBe(after);
  });

  it("T4.17 (I58): width and focus are each a miss on their own", async () => {
    const { definition, count } = counting();
    const { screen, type, resize } = await session(definition);
    expect(screen().rows.join("\n"), "the entry is on screen").toContain("alpha");

    // **Three sub-cases and not one.** A key missing any single axis passes
    // every assertion about the others.
    //
    // **`rev` is not driven here and the row does not claim it.** Moving a
    // revision needs a stream or a `settle(id, doc)`, and neither is reachable
    // from a local handler; a second `/rows` makes a *new entry* with a new id,
    // which tests nothing about the axis. It is C14's own axis and the one this
    // cache did not have to decide. Naming the gap rather than letting the row's
    // title imply coverage — a citation reads as coverage, and that is how a
    // thing gets tested once and never.
    const at = { start: count() };

    // 1 — width. C14's own third axis.
    resize({ columns: 100, rows: 20 });
    await type("x");
    const afterWidth = count();
    expect(afterWidth, "a width change re-renders").toBeGreaterThan(at.start);

    // 2 — focus. `↓` from the bottom of history enters the live block (C16 I22)
    // and C11 draws the focused row in another tone (C11 I14). No `rev` moves,
    // no width moves: this is the axis nothing else can see.
    await type("\u001b[B");
    const afterFocus = count();
    expect(afterFocus, "focus entering the block re-renders").toBeGreaterThan(afterWidth);

    // 3 — focus again, to the second row. **Two rows, because with one the
    // focused and unfocused renderings are the only two states and a key that
    // merely knew *whether* anything is focused would pass.**
    await type("\u001b[B");
    const afterSecond = count();
    expect(afterSecond, "moving focus between rows re-renders").toBeGreaterThan(afterFocus);

  });

  it("T4.17d (I58): a theme switch is a miss, with no hook anywhere", async () => {
    // **Its own session, because focus is stateful.** Written as a fourth step
    // of the row above it failed against working code: after two `↓` the keys
    // are going to the live block (C16 §3), so `/theme light` never reached the
    // prompt. The fixture was not responding to the thing under test, and the
    // number it produced — 4 against 4 — was indistinguishable from a key that
    // omits the theme.
    const { definition, count } = counting();
    const { screen, type } = await session(definition);
    expect(screen().rows.join("\n"), "the entry is on screen").toContain("alpha");
    const before = count();

    // `light`, because the session starts `dark` (`store.ts`) and `setTheme`
    // is correctly a no-op for the variant already active (C10 T3.6).
    await type("/theme light\r");
    await Promise.resolve();
    await Promise.resolve();

    // `ResolvedTheme.name` moves on the switch (C10 I11) and the key carries it,
    // so this is the whole of the invalidation: no hook, no clear.
    expect(count(), "a theme switch re-renders").toBeGreaterThan(before);
  });


  it("T4.17h (C12 I83): the context field is populated, by block id", async () => {
    // **The row `cursorPositions` never had.** That field is declared, threaded
    // and read in one place, and written by nothing in `src/` — so every
    // reference exists and the seam is broken (C12 §3s). This asserts the half
    // that counting references cannot see: something put a value in it, and put
    // it under the right key.
    //
    // The reader is a **registered kind**, which is the public extension point
    // an app uses, so the value is observed from inside the production render
    // path rather than from a spy around it.
    const seen: (Readonly<Record<string, unknown>> | undefined)[] = [];
    const watcher: BlockDefinition = {
      kind: "count",
      measure: () => 1,
      render: (_b, ctx) => {
        seen.push(ctx.cameras);
        return inkRows(["counted"]);
      },
    };
    const { type } = await session(watcher, PLOT_DOC);
    await type("\u001b[B");
    seen.length = 0;

    await type("[");
    const last = seen.at(-1);
    expect(last, "the renderer received the record").toBeDefined();
    // **Keyed by block id and not by entry**, which is the whole reason it is a
    // record: two 3D plots in one document must not turn together, and a scalar
    // threaded down the tree would give them one view.
    expect(Object.keys(last ?? {}), "under the plot's own id").toEqual(["p"]);
  });

  it("T4.17g (C22 I71): the pair, end to end — and it isolates nothing", async () => {
    // **The row that matches what a reader does, and the one named for what it
    // cannot do.** It dies to every part — the key, the element, the binding,
    // the context and the slot — so a suite holding only this row would report
    // *the camera is wired* and never say which part is not.
    //
    // **Measured rather than asserted**, because the first draft of this comment
    // claimed the slot had no second witness and that is false:
    //
    //     mutation                     rows that fail
    //     the key goes quiet           T4.17e · T4.17g · T4.17h
    //     the binding is removed       T4.17f · T4.17g · T4.17h
    //     a plot declares no element   T4.17f · T4.17g · T4.17h
    //     the context is unpopulated   T4.17h
    //     the slot drops the axis      T4.17g · T4.17h
    //     control, unmutated           (none)
    //
    // So T4.17e, T4.17f and T4.17h each isolate one part, and **the slot
    // isolates against nothing**: dropping it, emptying the key and removing the
    // binding all produce the same observable — no re-render. Distinguishing
    // them needs a second writer, which auto-orbit is (step 8).
    //
    // **The probe that produced this table read vitest's LISTING as its
    // failures on the first run** and reported fifteen rows dying to every
    // mutation, including rows in a file that passed. Its control — the
    // unmutated set, which must be empty — is what a reader should look at
    // first.
    const { definition, count } = counting();
    const { type } = await session(definition, PLOT_DOC);
    await type("\u001b[B");

    const before = count();
    await type("[");
    const once = count();
    expect(once, "a keystroke turned the camera and the frame followed").toBeGreaterThan(before);

    await type("[");
    expect(count(), "and again").toBeGreaterThan(once);
  });

  it("T4.19 (I59): the first frame renders everything and the second renders none", async () => {
    // **The stall, as an executable statement.** This stage makes the second
    // frame free and the first no cheaper, and a reader who lands here and stops
    // is the failure mode the ordering exists to prevent (F90).
    const { definition, count } = counting();
    const { type } = await session(definition);

    const first = count();
    expect(first, "the first frame rendered the entry").toBeGreaterThan(0);

    await type("x");
    expect(count(), "and the second rendered none of it").toBe(first);
  });
});
