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
import { describe, expect, it, vi } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import { spinnerIntervalMs } from "../../src/presentation/blocks/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { ProfileReport } from "../../src/index.js";
import { RenderCache } from "../../src/shell/render-cache.js";
import type { EntryParts } from "../../src/shell/render-cache.js";
import { entryLayout, measureEntry, renderEntryPieces, windowEntry } from "../../src/shell/entry-layout.js";
import { DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";

/**
 * A kind whose renders are counted **per block id** (C22 I101): the claim is
 * *which* children rendered on a scroll, and one total cannot say.
 */
function countingById(rows: number): { definition: BlockDefinition; rendersOf: () => ReadonlyMap<string, number> } {
  const n = new Map<string, number>();
  return {
    rendersOf: () => new Map(n),
    definition: {
      kind: "count",
      measure: () => rows,
      render: (b) => {
        n.set(b.id, (n.get(b.id) ?? 0) + 1);
        return inkRows(Array.from({ length: rows }, (_, i) => `counted ${b.id} r${String(i)}`));
      },
    },
  };
}

/**
 * A kind that **divides** — declares a `window`, as `logs` does — with its
 * renders counted (C22 I101, T4.89d). Its own kind rather than `logs` because
 * the reading is a render count per frame, and `logs` has no counter a row
 * can read without the profiler's per-node tables; what T4.89d is about is
 * the class the window slices, and this is the shipped mechanism (C09 I25)
 * with a counter on it.
 */
function tallDividing(): { definition: BlockDefinition; renders: () => number } {
  let n = 0;
  const linesOf = (b: Block): readonly string[] => (b as unknown as { lines: readonly string[] }).lines;
  return {
    renders: () => n,
    definition: {
      kind: "tall",
      measure: (b) => linesOf(b).length,
      render: (b) => {
        n += 1;
        return inkRows(linesOf(b));
      },
      window: (b, _w, from, to) => ({
        block: { ...(b as object), lines: linesOf(b).slice(from, to) } as unknown as Block,
        skipRows: 0,
        dropRows: 0,
      }),
    },
  };
}

const PAGE_UP = "\u001b[5~";
const DOWN = "\u001b[B";

/**
 * A painting session over several kinds, with the profiler's counters on and
 * the report read at stop (C28 I8): the `range` miss is the profiler's word.
 */
async function sessionOver(
  definitions: readonly BlockDefinition[],
  blocks: readonly unknown[],
  size: Readonly<{ columns: number; rows: number }>,
) {
  const stdin = fakeStdin();
  let seen: ProfileReport | null = null;
  const built = await buildSession(
    {
      stdin: stdin as never,
      blocks: definitions,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "rows", args: [], flags: [] }],
      },
      localHandlers: {
        rows: () => ({ schema: "tui.view/1", status: "ok", blocks }),
      },
      profile: { tier: "counters", onReport: (r: ProfileReport) => void (seen = r) },
    } as never,
    size,
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  await type("/rows\r");
  await Promise.resolve();
  await Promise.resolve();
  const report = async (): Promise<ProfileReport> => {
    await built.tui.stop("exit");
    if (seen === null) throw new Error("no report arrived");
    return seen;
  };
  return { ...built, type, report };
}

/** The ids whose text is on screen. */
function shown(ids: readonly string[], rows: readonly string[]): ReadonlySet<string> {
  return new Set(ids.filter((id) => rows.some((r) => r.includes(`counted ${id} `))));
}

/** The ids rendered since `before`. */
function renderedSince(before: ReadonlyMap<string, number>, now: ReadonlyMap<string, number>): readonly string[] {
  return [...now.keys()].filter((id) => (now.get(id) ?? 0) > (before.get(id) ?? 0)).sort();
}

/** A `Map`-backed parts store, the shape the render cache hands out (C22 I101). */
function partsStore(): EntryParts & { readonly reads: () => number; readonly size: () => number } {
  const m = new Map<string, readonly string[]>();
  const slices = new Map<string, Readonly<{ window: string; lines: readonly string[] }>>();
  let reads = 0;
  return {
    part: (key) => {
      const held = m.get(key);
      if (held !== undefined) reads += 1;
      return held;
    },
    hold: (key, lines) => void m.set(key, lines),
    // The shipped shape (C22 I104): one slice per id, served at its window alone.
    slice: (id, window) => {
      const held = slices.get(id);
      if (held === undefined || held.window !== window) return undefined;
      reads += 1;
      return held.lines;
    },
    holdSlice: (id, window, lines) => void slices.set(id, { window, lines }),
    reads: () => reads,
    size: () => m.size + slices.size,
  };
}

/** A `count` whose `measure` is counted too (C22 I100): what reaches the definition, never what a memo answered. */
function measuring(): { definition: BlockDefinition; measured: () => number } {
  let m = 0;
  return {
    measured: () => m,
    definition: {
      kind: "count",
      measure: () => {
        m += 1;
        return 1;
      },
      render: () => inkRows(["counted"]),
    },
  };
}

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
    await type("\u001b[B"); // the card's head is the first element (C09 I47)
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
    await type("\u001b[B"); // the card's head is the first element (C09 I47)
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
  it("T4.91 (C22 I107, I100, F1203): a card whose body opens with a gapped block measures on the first frame and not on the two after", async () => {
    // **T4.88's shape over a card.** The head is a `step` notice, so the
    // layout hands the measurer a body run — and the body's first block
    // declares `gapBefore`, so that run's first block is `cardBody`'s cleared
    // copy. Before I107 the copy was made on every call, twice a frame, and
    // the memo keyed on it missed once a frame for as long as the card stood.
    const { definition, measured } = measuring();
    const children = Array.from({ length: 40 }, (_, i) => ({ kind: "count", id: `c-${String(i)}`, ...(i === 0 ? { gapBefore: true } : {}) }));
    const { screen, type } = await session(definition, [
      { kind: "notice", id: "h", tone: "info", glyph: "step", text: "rows · ok" },
      ...children,
    ]);
    expect(screen().rows.join("\n"), "the card is on screen").toContain("counted");
    const after = measured();
    expect(after, "the first frame measured the children").toBeGreaterThanOrEqual(40);

    await type("x");
    await type("y");
    expect(measured(), "two further frames on a still card, no further measure — the cleared copy is held").toBe(after);
  });

  it("T4.88 (C22 I100, C09 I70): forty measured children drawn twice measure on the first frame and not on the second, and a patched child alone misses again", async () => {
    // **Two seams, two harnesses.** The frame half runs on a painting session,
    // because the window is `visibleRows`' and a harness that stubs `render`
    // never takes one (a test that calls the mechanism misses the wiring). The
    // patch half runs on a graph with a profiler, because a patch is not
    // reachable from a local handler (T4.17's note) and the reading is the
    // registry's own hit and miss counts.
    const { definition, measured } = measuring();
    const children = Array.from({ length: 40 }, (_, i) => ({ kind: "count", id: `c-${String(i)}` }));
    const { screen, type } = await session(definition, [
      { kind: "group", id: "g", direction: "column", children },
    ]);
    expect(screen().rows.join("\n"), "the entry is on screen").toContain("counted");
    const after = measured();
    expect(after, "the first frame measured the children").toBeGreaterThanOrEqual(40);

    // Two further frames on a still document: the window reads every height
    // back through the session's memo and nothing reaches the definition.
    // Without the memo each frame measured every child again — ~850 measure
    // misses per frame on `/all` (F1160).
    await type("x");
    await type("y");
    expect(measured(), "two further frames, no further measure").toBe(after);

    // The patch half.
    // `spans`, so the registry's instrumented arms are the ones on the path:
    // a wrapper that dropped the memo (registry-probe.ts) would leave the
    // session's memo unread on exactly the profiled runs.
    const profiler = createProfiler({ tier: "spans" }, { elapsed: () => performance.now() });
    const { graph } = await buildGraph({ blocks: [definition] } as never, undefined, profiler);
    graph.lifecycle.acquire();
    const meta = {
      verb: "rows",
      adapter: "passthrough",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [] as string[],
      stderr: "",
      transport: "local",
      origin: "user",
    };
    const doc = (blocks: readonly unknown[]) => ({ schema: "tui.view/1", command: "/rows", status: "ok", blocks, meta });
    const id = graph.transcript.append(doc([{ kind: "group", id: "g", direction: "column", children }]) as never, {
      streaming: true,
    });
    const counts = (): Readonly<{ hits: number; absent: number }> => {
      const r = profiler.report();
      return { hits: r.hits["measure"] ?? 0, absent: r.misses["measure"]?.absent ?? 0 };
    };
    const before = counts();
    expect(before.absent, "C14 measured the forty children through the memo, each absent").toBeGreaterThanOrEqual(40);

    // One child rebuilt: C14 re-measures the entry on the new `rev`, and only
    // the new object is a question.
    const rebuilt = { kind: "group", id: "g", direction: "column", children: children.map((c, i) => (i === 7 ? { ...c } : c)) };
    expect(graph.transcript.patch(id, { op: "replace", blockId: "g", block: rebuilt } as never).ok).toBe(true);
    const delta = { hits: counts().hits - before.hits, absent: counts().absent - before.absent };
    // Two new objects: the replaced group, which the sequence asks first, and
    // the child rebuilt inside it. Thirty-nine children are the same objects.
    expect(delta.absent, "the rebuilt group and the rebuilt child missed, nothing else").toBe(2);
    // A column group asks each child twice in one measure (C09 T1.44's
    // baseline): the first pass reads thirty-nine back and misses the rebuilt
    // one, and the second pass reads all forty — the miss was written.
    expect(delta.hits, "thirty-nine and then forty read back").toBe(79);
    profiler.dispose();
    graph.lifecycle.release();
  });
  it("T4.89a (C22 I101): a column group of twelve counting children scrolled twice — the first scroll holds what it kept, the second renders the entering children alone, the miss is range, and the rows are the fresh render's", async () => {
    const { definition, rendersOf } = countingById(4);
    const ids = Array.from({ length: 12 }, (_, i) => `c-${String(i)}`);
    const group = { kind: "group", id: "g", direction: "column", children: ids.map((id) => ({ kind: "count", id })) };
    const s = await sessionOver([definition], [group], { columns: 80, rows: 18 });

    // The fixture responds: the entry is taller than the region, so some of the
    // twelve are on screen and some are not, and the first frame drew what shows.
    const first = shown(ids, s.screen().text);
    expect(first.size, "some on screen").toBeGreaterThan(0);
    expect(first.size, "and not all").toBeLessThan(12);
    for (const id of first) expect(rendersOf().get(id), `${id} rendered on the first frame`).toBe(1);

    // **The first scroll is a range miss with nothing held**: the first frame
    // rendered the sequence, so every child this window keeps is rendered
    // alone now, and held.
    let drawn = rendersOf();
    await s.type(PAGE_UP);
    const before = shown(ids, s.screen().text);
    expect(before, "the window moved").not.toEqual(first);
    expect(renderedSince(drawn, rendersOf()), "every kept child rendered, and held").toEqual([...before].sort());

    // **The second scroll renders the entering children alone.** Before I101
    // every kept tile rendered on every row of scroll, which is the count this
    // row would report as the whole of `after`.
    drawn = rendersOf();
    await s.type(PAGE_UP);
    const after = shown(ids, s.screen().text);
    expect(after, "the window moved again").not.toEqual(before);
    const kept = [...after].filter((id) => before.has(id));
    expect(kept.length, "the windows overlap by a child").toBeGreaterThan(0);
    const entering = [...after].filter((id) => !before.has(id)).sort();
    expect(entering.length, "something entered").toBeGreaterThan(0);
    expect(renderedSince(drawn, rendersOf()), "the entering children alone").toEqual(entering);

    // **The rows are the fresh render's**: what is on screen is a contiguous
    // slice of the whole group rendered fresh, by visible text.
    const kit = measurable({ definitions: [definition as never] });
    const fresh = kit.renderToLines(block(group as never), 80).map((l) => visible(l).trimEnd());
    // The entry is a card (C22 I83), so each row carries the gutter in front
    // of the block's own cells; the comparison is over the cells the block drew.
    const onScreen = s.screen().text.filter((r) => r.includes("counted ")).map((r) => r.slice(r.indexOf("counted ")).trimEnd());
    expect(onScreen.length, "rows on screen").toBeGreaterThan(0);
    expect(fresh.join("\n"), "a slice of the fresh render, in order").toContain(onScreen.join("\n"));

    // And the profiler's word for it.
    const report = await s.report();
    expect(report.misses["render"]?.range ?? 0, "the scroll missed on `range`").toBeGreaterThanOrEqual(1);
  });

  it("T4.89b (C22 I101, C09 I69, C14 I25): every window position over gaps, a right-aligned child, a nested row and a sequence of whole blocks assembles the fresh full render byte for byte", () => {
    const kit = measurable();
    const registry = kit.registry;
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0 };
    const raw = (id: string, text: string, gap = false): Block =>
      block({ kind: "raw", id, text, ...(gap ? { gapBefore: true } : {}) } as never);
    const corpus: Readonly<Record<string, readonly Block[]>> = {
      "a column group": [
        block({
          kind: "group",
          id: "col",
          direction: "column",
          align: ["left", "right", "left", "right", "left"],
          children: [
            raw("a", "alpha\nsecond line of alpha"),
            raw("b", "bravo", true),
            block({ kind: "group", id: "row", direction: "row", children: [raw("d", "delta\ndelta 2"), raw("e", "echo")] } as never),
            raw("c", "charlie is right-aligned", false),
            raw("f", "foxtrot\nfoxtrot 2\nfoxtrot 3", true),
          ],
        } as never),
      ],
      "a sequence of whole blocks": [
        raw("x", "x-ray\nx-ray 2"),
        block({ kind: "notice", id: "n", tone: "info", text: "a notice that wraps at forty cells, surely, given this length", gapBefore: true } as never),
        raw("z", "zulu", true),
        block({ kind: "group", id: "g2", direction: "column", align: ["right"], children: [raw("w", "whiskey")] } as never),
      ],
    };
    const WIDTH = 40;
    const WINDOW = 3;
    for (const [name, blocks] of Object.entries(corpus)) {
      const layout = entryLayout(blocks, WIDTH);
      const height = measureEntry((b, w) => registry.measureSequence(b, w), blocks, WIDTH);
      const full = renderEntryPieces(registry, windowEntry(layout, 0, height, registry), options).rows;
      expect(full.length, `${name}: the fixture is taller than the window`).toBeGreaterThan(WINDOW + 2);
      // **One store across the sweep**, as the session holds one: what a
      // position held, the next reads.
      const held = partsStore();
      for (let from = 0; from < height; from += 1) {
        const to = Math.min(height, from + WINDOW);
        const pieces = windowEntry(layout, from, to, registry);
        const fresh = renderEntryPieces(registry, pieces, options).rows;
        const assembled = renderEntryPieces(registry, pieces, options, held).rows;
        expect(assembled, `${name}: assembled [${String(from)}, ${String(to)}) is the fresh render`).toEqual(fresh);
        expect(assembled, `${name}: and the full render's slice`).toEqual(full.slice(from, to));
      }
      expect(held.size(), `${name}: parts were held`).toBeGreaterThan(0);
      expect(held.reads(), `${name}: and read back`).toBeGreaterThan(0);
    }
  });

  it("T4.89c (C22 I101): a rev, focus or theme change drops the held parts, and a range change after them holds again", async () => {
    // **The rev arm at the cache**, where it is drivable (T4.17's note): the
    // parts a range miss opens are gone after a rev miss, and open again after
    // the next range miss.
    const cache = new RenderCache();
    cache.set("e", 1, 80, "f", "t", "0", ["a"]);
    expect(cache.get("e", 1, 80, "f", "t", "1"), "a range miss").toBeUndefined();
    expect(cache.misses.range).toBe(1);
    const open = cache.parts("e");
    if (open === undefined) throw new Error("no parts after a range miss");
    open.hold("k", ["held"]);
    cache.set("e", 1, 80, "f", "t", "1", ["b"]);
    expect(cache.get("e", 1, 80, "f", "t", "2"), "another range miss").toBeUndefined();
    expect(cache.parts("e")?.part("k"), "the part survived the range").toEqual(["held"]);
    cache.set("e", 1, 80, "f", "t", "2", ["c"]);
    expect(cache.get("e", 2, 80, "f", "t", "2"), "a rev miss").toBeUndefined();
    expect(cache.parts("e"), "no parts after it").toBeUndefined();
    cache.set("e", 2, 80, "f", "t", "2", ["d"]);
    expect(cache.get("e", 2, 80, "f", "t", "3")).toBeUndefined();
    expect(cache.parts("e")?.part("k"), "dropped with the rev, not carried").toBeUndefined();
    // Focus and theme, the same way.
    cache.set("e", 2, 80, "f", "t", "3", ["e"]);
    expect(cache.get("e", 2, 80, "other", "t", "3")).toBeUndefined();
    expect(cache.parts("e"), "focus drops them").toBeUndefined();
    cache.set("e", 2, 80, "other", "t", "3", ["e"]);
    expect(cache.get("e", 2, 80, "other", "light", "3")).toBeUndefined();
    expect(cache.parts("e"), "theme drops them").toBeUndefined();
    // And another entry's range miss opens nothing for this one.
    cache.set("e", 2, 80, "other", "light", "3", ["e"]);
    cache.set("e2", 1, 80, "", "light", "0", ["z"]);
    cache.get("e2", 1, 80, "", "light", "1");
    expect(cache.parts("e"), "another entry's miss is not this one's").toBeUndefined();

    // **Focus and theme end to end**, on a session: after a scroll the parts
    // hold; a theme switch renders every kept child again; a scroll after it
    // renders only what enters; focus entering the table does the same.
    const { definition, rendersOf } = countingById(4);
    const ids = Array.from({ length: 12 }, (_, i) => `c-${String(i)}`);
    const group = { kind: "group", id: "g", direction: "column", children: ids.map((id) => ({ kind: "count", id })) };
    const s = await sessionOver([definition], [group, ...TWO_ROWS], { columns: 80, rows: 18 });
    await s.type(PAGE_UP);
    const atFirst = shown(ids, s.screen().text);
    expect(atFirst.size, "children on screen after the scroll").toBeGreaterThan(0);

    let drawn = rendersOf();
    await s.type("/theme light\r");
    const afterTheme = shown(ids, s.screen().text);
    expect(afterTheme.size, "children still on screen").toBeGreaterThan(0);
    for (const id of afterTheme) {
      expect((rendersOf().get(id) ?? 0) > (drawn.get(id) ?? 0), `${id} rendered again after the theme switch`).toBe(true);
    }

    // The parts went with the theme: the next range miss holds what it keeps,
    // and the one after it renders the entering children alone.
    drawn = rendersOf();
    await s.type(PAGE_UP);
    const held = shown(ids, s.screen().text);
    expect(renderedSince(drawn, rendersOf()), "after the theme switch the first scroll renders every kept child").toEqual([...held].sort());
    drawn = rendersOf();
    await s.type("\u001b[6~");
    const afterScroll = shown(ids, s.screen().text);
    expect(afterScroll, "the window moved").not.toEqual(held);
    const entering = [...afterScroll].filter((id) => !held.has(id)).sort();
    expect(entering.length, "something entered").toBeGreaterThan(0);
    expect(renderedSince(drawn, rendersOf()), "and the second renders the entering children alone").toEqual(entering);

    const report = await s.report();
    expect(report.misses["render"]?.range ?? 0).toBeGreaterThanOrEqual(2);
    expect(report.misses["render"]?.theme ?? 0).toBeGreaterThanOrEqual(1);

    // **Focus, on its own session**: `↓` walks from history into the live
    // block (C16 I22), which has to be this entry — after `/theme` the live
    // entry is the notice, and the arrow never reaches the table. The focus
    // axis moved, so every child on screen renders again; a scroll after it
    // holds, and the next renders the entering children alone.
    const f = await sessionOver([definition], [group, ...TWO_ROWS], { columns: 80, rows: 18 });
    await f.type(PAGE_UP);
    drawn = rendersOf();
    await f.type(DOWN);
    const afterFocus = shown(ids, f.screen().text);
    expect(afterFocus.size, "children on screen with focus in the entry").toBeGreaterThan(0);
    for (const id of afterFocus) {
      expect((rendersOf().get(id) ?? 0) > (drawn.get(id) ?? 0), `${id} rendered again after focus moved`).toBe(true);
    }
    // Out of the block again (a second focus miss), because with focus in it
    // `PgUp` pages the block rather than the transcript. A bare escape needs
    // the router's window to close, and the clock is the harness's.
    await f.type("\u001b");
    f.clock.advance(100);
    await f.type("");
    drawn = rendersOf();
    await f.type(PAGE_UP);
    const heldF = shown(ids, f.screen().text);
    expect(heldF, "the transcript scrolled").not.toEqual(afterFocus);
    expect(renderedSince(drawn, rendersOf()), "the first scroll after focus renders every kept child").toEqual([...heldF].sort());
    drawn = rendersOf();
    await f.type(PAGE_UP);
    const afterF = shown(ids, f.screen().text);
    expect(afterF, "the window moved").not.toEqual(heldF);
    const enteringF = [...afterF].filter((id) => !heldF.has(id)).sort();
    expect(enteringF.length, "something entered").toBeGreaterThan(0);
    expect(renderedSince(drawn, rendersOf()), "and the second renders the entering children alone").toEqual(enteringF);
    const reportF = await f.report();
    expect(reportF.misses["render"]?.focus ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("T4.89d (C22 I101, I104): a top-level block that divides — taller than the window — is rendered at every new range and held under its window, and a whole block beside it is held", async () => {
    const tall = tallDividing();
    const { definition: count, rendersOf } = countingById(1);
    const lines = Array.from({ length: 40 }, (_, i) => `tall line ${String(i)}`);
    // The whole block last, so the tail window shows it beside the tall one.
    const s = await sessionOver([tall.definition, count], [{ kind: "tall", id: "big", lines }, { kind: "count", id: "whole" }], {
      columns: 80,
      rows: 18,
    });
    const text = s.screen().text;
    expect(text.some((r) => r.includes("tall line 39")), "the tall block's tail is on screen").toBe(true);
    expect(text.some((r) => r.includes("counted whole")), "and the whole block beside it").toBe(true);
    expect(tall.renders(), "the first frame rendered the tall block").toBe(1);
    expect(rendersOf().get("whole"), "and the whole one").toBe(1);

    // **A one-row scroll, twice**: the prompt wraps at 80 cells, the region
    // loses a row, and the tail window moves one row — the range and nothing
    // else. The first is a range miss with no parts to read; the second reads
    // the whole block back and renders the sliced one again.
    await s.type("x".repeat(80));
    expect(s.screen().text.some((r) => r.includes("counted whole")), "still beside it after one row").toBe(true);
    expect(tall.renders(), "rendered at the new range").toBe(2);
    expect(rendersOf().get("whole"), "rendered alone and held on the first range miss").toBe(2);
    await s.type("y".repeat(80));
    expect(s.screen().text.some((r) => r.includes("counted whole")), "still beside it after two rows").toBe(true);
    expect(tall.renders(), "rendered again: the window moved, and a slice is held under its window (C22 I104)").toBe(3);
    expect(rendersOf().get("whole"), "read back: the whole block was held").toBe(2);
    const report = await s.report();
    expect(report.misses["render"]?.range ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("C22 I103 — a tick miss keeps the parts", () => {
  it("T4.89e (C22 I103, F1189): a spinner tick beside a kept-whole block moves the frame, renders the kept block no further time, reports tick: 1 and focus: 0, and at the cache a tick-only miss keeps the parts", async () => {
    // **At the cache first**, where the axis and its order are drivable: a
    // slot differing on the tick alone misses `tick` with the parts open, and
    // one differing on the tick and the range misses `tick` — the tick is
    // compared before the range (C28 I8).
    const cache = new RenderCache();
    cache.set("e", 1, 80, "f", "t", "0", ["a"], "1");
    expect(cache.get("e", 1, 80, "f", "t", "0", "1"), "a hit at the same tick").toEqual(["a"]);
    expect(cache.get("e", 1, 80, "f", "t", "0", "2"), "a tick miss").toBeUndefined();
    expect(cache.misses.tick).toBe(1);
    expect(cache.misses.focus, "and it is not a focus miss").toBe(0);
    const open = cache.parts("e");
    if (open === undefined) throw new Error("no parts after a tick miss");
    open.hold("k", ["held"]);
    cache.set("e", 1, 80, "f", "t", "0", ["b"], "2");
    expect(cache.get("e", 1, 80, "f", "t", "1", "3"), "tick and range both moved").toBeUndefined();
    expect(cache.misses.tick, "reported as the tick, which is compared first").toBe(2);
    expect(cache.misses.range).toBe(0);
    expect(cache.parts("e")?.part("k"), "the part survived the tick").toEqual(["held"]);

    // **End to end, under fake timers** (T4.35's reason): the claim is that the
    // chain is wired, not that a machine keeps 80 ms. Thirty counted rows kept
    // whole beside a status spinner; the clock moves with the timers (I74), so
    // one step is one interval of elapsed time and the counter advances once.
    vi.useFakeTimers();
    try {
      const { definition, rendersOf } = countingById(30);
      const status = { kind: "status", id: "sp", state: "loading", message: "working", height: 1 };
      const s = await sessionOver([definition], [{ kind: "count", id: "whole" }, status], { columns: 80, rows: 40 });
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      const before = rendersOf().get("whole") ?? 0;
      expect(before, "the kept block rendered").toBeGreaterThan(0);
      const glyph = (): string => {
        const row = s.screen().text.find((r) => r.includes("loading"));
        if (row === undefined) return "<absent>";
        return /[\u2800-\u28ff]/u.exec(row)?.[0] ?? "<none>";
      };
      const frameBefore = s.screen().text.join("\n");
      expect(frameBefore, "the counted rows are on screen").toContain("counted whole r29");
      const glyphBefore = glyph();
      expect(glyphBefore, "the spinner is on screen").toMatch(/[\u2800-\u28ff]/u);

      // One interval, then C03's window: the ticker fires, `commit("spinner")`
      // reaches the scheduler, the frame follows within its coalescing window.
      const step = async (ms: number): Promise<void> => {
        s.clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
      };
      await step(spinnerIntervalMs());
      for (let i = 0; i < 6 && glyph() === glyphBefore; i += 1) await step(25);
      const glyphFirst = glyph();
      expect(glyphFirst, "the frame moved — the glyph turned").not.toBe(glyphBefore);
      // **The first tick may render the kept block once**: a whole render holds
      // no parts, and the assembly is what fills them (I101). What the axis buys
      // shows from the second tick on.
      const afterFirst = rendersOf().get("whole") ?? 0;
      expect(afterFirst, "at most one render, to fill the parts").toBeLessThanOrEqual(before + 1);

      await step(spinnerIntervalMs());
      for (let i = 0; i < 6 && glyph() === glyphFirst; i += 1) await step(25);
      const frameAfter = s.screen().text.join("\n");
      expect(glyph(), "the glyph turned again").not.toBe(glyphFirst);
      expect(frameAfter, "and the counted rows are still there").toContain("counted whole r29");
      expect(rendersOf().get("whole"), "the kept block rendered no further time").toBe(afterFirst);
      const report = await s.report();
      expect(report.misses["render"]?.tick ?? 0, "the ticks reported as ticks").toBeGreaterThanOrEqual(2);
      expect(report.misses["render"]?.focus ?? 0, "and not as focus").toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
  it("T4.89f (C22 I104, F1190): a sliced block beside a spinner renders no further time across a tick, once across a one-row scroll with the rows a fresh render lays, and the parts serve a slice at its own window alone and hold one per id", async () => {
    // **At the parts first.** A slice held for one window is not served at
    // another; holding a second window for the same id replaces the first,
    // which is what bounds the store at one slice per sliced block.
    const cache = new RenderCache();
    cache.set("e", 1, 80, "f", "t", "0", ["a"]);
    expect(cache.get("e", 1, 80, "f", "t", "1"), "a range miss opens the parts").toBeUndefined();
    const open = cache.parts("e");
    if (open === undefined) throw new Error("no parts after a range miss");
    open.holdSlice("big", "0 10", ["r0", "r1"]);
    expect(open.slice("big", "0 10"), "served at its window").toEqual(["r0", "r1"]);
    expect(open.slice("big", "1 10"), "not at another").toBeUndefined();
    expect(open.slice("other", "0 10"), "nor for another id").toBeUndefined();
    open.holdSlice("big", "1 10", ["r1", "r2"]);
    expect(open.slice("big", "1 10"), "the new window is served").toEqual(["r1", "r2"]);
    expect(open.slice("big", "0 10"), "and the old one is gone — replaced, not added").toBeUndefined();

    // **End to end, under fake timers** (T4.89e's reason). A forty-line
    // dividing block in an eighteen-row terminal beside a status spinner: the
    // tail window slices it. The first tick fills the parts (a whole render
    // holds none, I101); the second renders the dividing kind no further time.
    vi.useFakeTimers();
    try {
      const tall = tallDividing();
      const lines = Array.from({ length: 40 }, (_, i) => `tall line ${String(i)}`);
      const status = { kind: "status", id: "sp", state: "loading", message: "working", height: 1 };
      const s = await sessionOver([tall.definition], [{ kind: "tall", id: "big", lines }, status], { columns: 80, rows: 18 });
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      const glyph = (): string => {
        const row = s.screen().text.find((r) => r.includes("loading"));
        if (row === undefined) return "<absent>";
        return /[⠀-⣿]/u.exec(row)?.[0] ?? "<none>";
      };
      /** The tall rows on screen, as their line numbers, in screen order. */
      const tallRows = (): readonly number[] =>
        s.screen().text.flatMap((r) => {
          const m = /tall line (\d+)/.exec(r);
          return m === null ? [] : [Number(m[1])];
        });
      const contiguousTail = (rows: readonly number[]): boolean =>
        rows.length > 0 && rows[rows.length - 1] === 39 && rows.every((n, i) => i === 0 || n === (rows[i - 1] as number) + 1);
      expect(contiguousTail(tallRows()), `the tail window is on screen: ${tallRows().join(",")}`).toBe(true);
      const glyphBefore = glyph();
      expect(glyphBefore, "the spinner is on screen").toMatch(/[⠀-⣿]/u);
      expect(tall.renders(), "the first frame rendered the slice").toBe(1);

      const step = async (ms: number): Promise<void> => {
        s.clock.advance(ms);
        await vi.advanceTimersByTimeAsync(ms);
      };
      await step(spinnerIntervalMs());
      for (let i = 0; i < 6 && glyph() === glyphBefore; i += 1) await step(25);
      const glyphFirst = glyph();
      expect(glyphFirst, "the frame moved — the glyph turned").not.toBe(glyphBefore);
      const afterFirst = tall.renders();
      expect(afterFirst, "at most one render on the first tick, to fill the parts").toBeLessThanOrEqual(2);
      const rowsAtTick = tallRows();

      await step(spinnerIntervalMs());
      for (let i = 0; i < 6 && glyph() === glyphFirst; i += 1) await step(25);
      expect(glyph(), "the glyph turned again").not.toBe(glyphFirst);
      expect(tall.renders(), "the slice rendered no further time across the tick").toBe(afterFirst);
      expect(tallRows(), "and the same rows are on screen").toEqual(rowsAtTick);

      // **A one-row scroll**: the prompt wraps at 80 cells, the region loses a
      // row, the tail window moves one row. The slice is a new window —
      // rendered once — and the rows are the fresh render's, not the held
      // window's: still the contiguous tail, one row shorter.
      await s.type("x".repeat(80));
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      const scrolled = tallRows();
      expect(contiguousTail(scrolled), `the moved window is the fresh render's: ${scrolled.join(",")}`).toBe(true);
      expect(scrolled.length, "one row shorter").toBe(rowsAtTick.length - 1);
      expect(tall.renders(), "rendered once for the new window").toBe(afterFirst + 1);
      const report = await s.report();
      expect(report.misses["render"]?.tick ?? 0, "the ticks were ticks").toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
  it("T4.89g (C22 I100, F1191): a session over a patch taller than the region reads the scratch with a hit on every frame after the first, adds no absent miss for it, and lays the same rows a scroll would have laid before the hold", async () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({
      kind: i % 7 === 0 ? "add" : i % 11 === 0 ? "remove" : "context",
      text: `const value${String(i)} = compute(${String(i)});`,
      oldNo: i + 1,
      newNo: i + 1,
    }));
    const patch = { kind: "patch", id: "p", path: "src/deep/module.ts", language: "typescript", hunks: [{ header: "@@ -1,200 +1,200 @@", lines }] };
    const s = await sessionOver([], [patch], { columns: 80, rows: 18 });
    const tailOf = (): readonly string[] => s.screen().text.filter((r) => r.includes("compute("));
    expect(tailOf().length, "the patch's tail is on screen").toBeGreaterThan(5); // cells-ok — a row count
    expect(tailOf().some((r) => r.includes("value199")), "the last line is on screen").toBe(true);
    // **A one-row scroll, twice**: the prompt wraps, the region loses a row,
    // the window moves; each frame is a window over the same block at the same
    // width and reads the plan and the form back.
    await s.type("x".repeat(80));
    const afterOne = tailOf();
    expect(afterOne.some((r) => r.includes("value199")), "still the tail").toBe(true);
    await s.type("y".repeat(80));
    const afterTwo = tailOf();
    expect(afterTwo.length, "one row fewer per wrapped prompt row").toBe(afterOne.length - 1);
    expect(afterTwo, "the rows a fresh window lays: the tail, one shorter").toEqual(afterOne.slice(1));
    const report = await s.report();
    expect(report.hits["scratch"] ?? 0, "the window seam read the held form and plan").toBeGreaterThanOrEqual(2);
    expect(report.misses["scratch"]?.absent ?? 0, "absent once per held owner — the form and the plan — not per frame").toBeLessThanOrEqual(2);
  });
});

describe("C22 I108 — the paced schedule, wired (F1207)", () => {
  it("T4.92 (C22 I108, F1207): the window C03 opens inside a firing is dated from that slot's deadline, through the composed schedule", async () => {
    // **The wiring, not the arithmetic.** T1.63 holds the wrapper; this row
    // holds that construct step 8 hands C03 the wrapped schedule and not the
    // ambient one, which is the only thing a mutation of the wiring can move.
    // The ambient schedule reaches `setTimeout` at call time, so a spy on the
    // global reads every window C03 asks for; `elapsed` is the session's
    // injected clock, which is the untapped one when nothing records.
    const spy = vi.spyOn(globalThis, "setTimeout");
    let now = 0;
    try {
      const { tui, resize } = await buildSession({ elapsed: () => now });
      const windows = (from = 0): number[] =>
        spy.mock.calls.slice(from).map((c) => Number(c[1])).filter((ms) => ms > 0 && ms < 79);
      expect(windows().length, "the start-up write armed a paced slot").toBeGreaterThan(0);
      expect(windows()[0], "the slot is the floored window").toBeCloseTo(1000 / 60, 9);
      // A resize inside the slot is pending in it. The slot fires two
      // milliseconds late; C03 writes and opens the next window inside the
      // firing, and the composed schedule dates it from the deadline.
      const call = spy.mock.calls.find((c) => Number(c[1]) > 0 && Number(c[1]) < 79);
      if (call === undefined) throw new Error("no paced slot");
      now = 5;
      resize({ columns: 90, rows: 30 });
      const before = spy.mock.calls.length;
      now = 1000 / 60 + 2;
      (call[0] as () => void)();
      const next = windows(before);
      expect(next.length, "the write inside the firing armed the next slot").toBeGreaterThan(0);
      expect(next[0], "dated from the last deadline, two milliseconds late").toBeCloseTo(1000 / 60 - 2, 9);
      await tui.stop("exit");
    } finally {
      spy.mockRestore();
    }
  });
});
