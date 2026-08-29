/**
 * The plot system in a real terminal.
 *
 * **Every instrument this repository has compares bytes** — golden frames, the
 * collision sweep, the pair sheet, the arm-disagreement record, the terminal
 * baseline. None of them can see a flicker, a jump, or a colour that reads badly
 * on a real emulator, and until this existed nothing had.
 *
 * So it is a whole application rather than a fixture: `createTui`, a far side
 * that prints JSON, an adapter, five figures and one of them live. The figures
 * are built by `src/figures.ts` through `b.plot`, which is the surface a
 * consumer touches and the one no other artefact here exercises for these forms.
 *
 *     node main.ts
 */
import { b, createTui, defaultTheme } from "@fmx/calcium";
import type { Adapter, Block, LocalHandler } from "@fmx/calcium";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bars, barsFull, curve, distribution, heat, hierarchy, walk, type Sample } from "./src/figures.ts";

const run = promisify(execFile);
const BINARY = new URL("bin/plots", import.meta.url).pathname;

const manifest = {
  schema: "tui.manifest/1",
  binary: "plots",
  version: "1.0.0",
  tools: [
    { name: "sample", local: false, summary: "Fetch the profile and draw all five", args: [], flags: [] },
    { name: "curve", local: true, summary: "The latency curve, full size", args: [], flags: [] },
    { name: "bars", local: true, summary: "The frame budget by width, full size", args: [], flags: [] },
    { name: "heat", local: true, summary: "Per-core utilisation, full size", args: [], flags: [] },
    { name: "dist", local: true, summary: "Stage timings as distributions, full size", args: [], flags: [] },
    { name: "tree", local: true, summary: "The frame budget nested, full size", args: [], flags: [] },
  ],
} as const;

/** The far side, read directly — the greeting and the local verbs both want it. */
const sample = async (): Promise<Sample> => {
  const { stdout } = await run(BINARY, ["sample", "--json"], { maxBuffer: 8 << 20 });
  return JSON.parse(stdout) as Sample;
};

/**
 * The gallery — five forms in one screen, which is what *judge it at a glance*
 * needs. Two rows of two columns; `b.group("row", …, { flex })` is what makes
 * side-by-side expressible at all.
 */
const gallery = (s: Sample): Block =>
  b.group("column", [
    b.group(
      "row",
      [
        b.group("column", [b.notice("muted", "a curve · frame latency, ms"), curve(s, 7)]),
        b.group("column", [b.notice("muted", "a bar · layout and paint, ms · /bars for all four"), bars(s, 7)]),
      ],
      { flex: [1, 1], id: "top" },
    ),
    b.group(
      "row",
      [
        b.group("column", [b.notice("muted", "a matrix · per-core load"), heat(s, 6)]),
        b.group("column", [b.notice("muted", "a distribution · stage timings, ms"), distribution(s, 8)]),
      ],
      { flex: [1, 1], id: "middle" },
    ),
    b.group(
      "row",
      [
        b.group("column", [b.notice("muted", "a hierarchy · the budget, nested"), hierarchy(s, 10)]),
        b.group("column", [b.notice("muted", "and one that moves"), live()]),
      ],
      { flex: [1, 1], id: "bottom" },
    ),
  ]);

/**
 * The live one (C24 §5).
 *
 * **The walk is accumulated in `derive`, not in `fetch`** — C24's rule is that
 * per-part state is view state only and anything that accumulates belongs in a
 * derivation, which is also what makes the off-screen pause safe: a paused part
 * holds nothing that could fall behind. So `fetch` returns one step and the fold
 * keeps the window.
 */
const WINDOW = 48;
const live = (): Block =>
  b.live({
    id: "walk",
    title: "queue depth",
    every: 120,
    fetch: () => Promise.resolve(Math.round((Math.random() - 0.45) * 8)),
    derive: {
      key: "walk",
      compute: (step, prev) => {
        const seen = Array.isArray(prev) ? (prev as number[]) : [24];
        const next = Math.max(0, (seen.at(-1) ?? 24) + (typeof step === "number" ? step : 0));
        return [...seen, next].slice(-WINDOW);
      },
    },
    render: (values) => walk(Array.isArray(values) ? (values as number[]) : [], 8),
  });

/** Data in, blocks out — the whole extension model, for the spawned route. */
const draw: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => {
    const s = JSON.parse(raw.stdoutRaw) as Sample;
    return {
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [gallery(s)],
      meta: { adapter: "draw" },
    };
  },
};

/** One figure, full size, so a reader can look closely at what the glance showed. */
const full =
  (of: (s: Sample, height?: number) => Block, height: number): LocalHandler =>
  async (_argv, ctx) => ({
    schema: "tui.view/1",
    command: ctx.command,
    status: "ok",
    blocks: [of(await sample(), height)],
  });

const tui = createTui({
  name: "plots-tui",
  binary: BINARY,
  manifest,
  theme: defaultTheme,
  env: process.env,
  adapters: { sample: draw },
  localHandlers: {
    curve: full(curve, 14),
    bars: full(barsFull, 14),
    heat: full(heat, 10),
    dist: full(distribution, 14),
    tree: full(hierarchy, 16),
  },
  /**
   * The session's first entry, so the gallery is on screen before anyone types
   * — and the `b.live` part inside it ticks until the entry is evicted, which is
   * C23 I9 and the reason the demo moves without a command.
   */
  greeting: async () => ({
    schema: "tui.view/1",
    command: "",
    status: "ok",
    blocks: [gallery(await sample())],
    meta: {
      verb: null,
      adapter: "gallery",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "refresh",
    },
  }),
});

await tui.start();
