/**
 * The plot system in a real terminal.
 *
 * **Every instrument this repository has compares bytes** — golden frames, the
 * collision sweep, the pair sheet, the arm-disagreement record, the terminal
 * baseline. None can see a flicker, a jump, or a colour that reads badly on a
 * real emulator, and until this existed nothing had looked.
 *
 * Six commands, and each answers something the gates cannot:
 *
 *     /all              every form the type declares — 46, four of them refusing
 *     /form <name>      one form, full size
 *     /live <name>      the same form, advancing
 *     /compare <name>   the two renderers side by side, as pixels
 *     /faults           what a failing source looks like, and the way back
 *     /sample           the far side, adapted
 *
 *     node main.ts
 */
import { b, createTui, defaultTheme } from "@fmx/calcium";
import type { Adapter, Block, LocalHandler, TerminalCapabilities } from "@fmx/calcium";

/**
 * **Named from the published type rather than re-spelled** (MG29's question,
 * answered in a consumer). `TerminalCapabilities` is exported; the member is
 * reached through it, so a rung added to the ladder is a compile error here
 * rather than a string this file no longer covers.
 */
type ImageProtocol = TerminalCapabilities["imageProtocol"];
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { CATALOGUE, everyVariant, FORMS, refusals, variantsOf } from "./src/catalogue.ts";
import type { PlotForm } from "./src/catalogue.ts";
import { bars, barsFull, curve, distribution, heat, hierarchy, walk } from "./src/figures.ts";
import { imageOf, svgOf } from "./src/svg.ts";

const run = promisify(execFile);
const BINARY = new URL("bin/plots", import.meta.url).pathname;

const manifest = {
  schema: "tui.manifest/1",
  binary: "plots",
  version: "1.0.0",
  tools: [
    { name: "sample", local: false, summary: "Fetch the profile and draw the glance", args: [], flags: [] },
    { name: "all", local: true, summary: "Every form the type declares", args: [], flags: [] },
    { name: "form", local: true, summary: "One form, full size", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "live", local: true, summary: "One form, advancing", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "compare", local: true, summary: "Terminal beside SVG, as pixels", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "faults", local: true, summary: "A failing source, and the way back", args: [], flags: [] },
    { name: "monitor", local: true, summary: "This machine, live", args: [], flags: [] },
  ],
} as const;

const doc = (command: string, blocks: readonly Block[]): ReturnType<LocalHandler> => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
});

const caption = (text: string): Block => b.notice("muted", text);

/**
 * **What the right-hand pane actually is**, which is not always pixels (F394).
 *
 * `b.image` descends a ladder — kitty's graphics protocol, then an ordered
 * braille dither, then `alt` — and only the first is pixels. Captioned `svg ·
 * pixels` unconditionally, a terminal with no graphics protocol shows a field of
 * braille dots under a label claiming otherwise, and the honest reading of that
 * is *the SVG renderer is broken*. It is not: **VS Code, Cursor, Terminal.app
 * and every `TERM=xterm-256color` shell take the dither**, because
 * `detectImageProtocol` answers `kitty` only for `TERM=xterm-kitty` and
 * `iterm2` for iTerm.
 *
 * The dither being the **first** arm rather than the last is C09 I36's ruling
 * and the reason this is worth looking at anywhere — but the label has to say
 * which arm, or the ladder reads as a fault.
 */
const rungSays = (protocol: ImageProtocol): string =>
  protocol === "kitty" ? "pixels" : `braille dither — this terminal has no graphics protocol (${protocol})`;

/**
 * The SVG image's cell box, **tuned against a measurement rather than reasoned**.
 *
 * A screenshot of a real kitty, with each panel's ink bounding box found from
 * the image itself:
 *
 *     asked      terminal panel        svg panel             match
 *     64 x 17    690 x 388  (1.78)     489 x 311  (1.57)    71% / 80%
 *     80 x 28    679 x 398  (1.71)     585 x 356  (1.64)    86% / 89%
 *     80 x 23    690 x 398  (1.73)     585 x 350  (1.67)    85% / 88%
 *     80 x 20    690 x 388  (1.78)     618 x 337  (1.83)    90% / 87%
 *
 * **The aspect is what a reader sees, not the absolute size**, and 28 rows made
 * the figure read *too tall* — its viewBox is `cols / (2 * rows)`, so 80x28 is
 * 1.43 against the terminal block's 1.78 and the interior comes out squarer even
 * where the outer box is close.
 *
 * **And asking for more columns than the group has cuts the bottom off**, which
 * is the thing to get right before any of the above. `imageCells` scales to the
 * available width and *recomputes the rows* — so `80 x 20` in a 65-cell column
 * becomes `65 x 16`, and the fifth of the picture that goes missing is the
 * x-axis: its labels are emitted at `y = 537` of a 560-unit viewBox, inside the
 * document and outside the placement. A figure with no abscissa, from asking for
 * a box that does not fit.
 *
 * So the rule is **ask within the column and let the aspect follow**:
 *
 *     asked      returns    intact
 *     80 x 20    65 x 16    no — the bottom fifth is cut
 *     65 x 18    65 x 18    yes
 *
 * **They cannot be made identical in this layout, and the reason is worth
 * stating rather than tuning against.** The two panels are a `flex: [1, 1]` row,
 * and the columns do not come out the same width: the left is 690px and the
 * right caps at 644px, because the group spends furniture between them. Asking
 * for more columns than that clamps — `imageCells` scales to the width and
 * recomputes the rows, so the figure gets *shorter* as it is asked to be wider.
 * At `cols: 100` the width caps at 644 and the height falls from 347 to 331.
 *
 * So this pair is the best fit available side by side. **An exact overlay wants
 * a different layout** — the two stacked, where they share one width — and that
 * is a demo decision rather than a framework one.
 *
 * **And the deeper residue is the same one the height had**: these are constants
 * where they should be `measure`'s answer for the sibling block. A local handler
 * is handed a `LocalContext`, which has no measurer, so the number that would
 * make this exact is not reachable from here.
 */
const COMPARE_COLS = 65;
const COMPARE_PLOT_ROWS = 14;
const COMPARE_ROWS = COMPARE_PLOT_ROWS + 4;

/** A form name from argv, defaulting to one that draws. */
function formIn(argv: readonly string[], fallback: PlotForm = "line"): PlotForm | null {
  const want = argv[0];
  if (want === undefined) return fallback;
  return (FORMS as readonly string[]).includes(want) ? (want as PlotForm) : null;
}

const unknown = (name: string): Block =>
  b.notice("error", `no form named "${name}" — ${String(FORMS.length)} exist, and /all draws them`);

// --- /all -------------------------------------------------------------------

/**
 * Every form, small, in two columns — **including the four that refuse.**
 *
 * A catalogue that silently omits what it cannot construct reports 42 of 42 and
 * reads as complete, which is F313's shape in the contact sheet and F350's in
 * the corpus. The refusals are drawn as notices naming the missing field, so the
 * count on screen is 46 and the gap is visible rather than inferred.
 */
function everyForm(phase: number): Block {
  // **Every form *and every rung*, which is what `/all` used to only claim**
  // (F396). It drew one figure per form under the caption *every form the type
  // declares* — true about forms, and read as a claim about plots. A violin has
  // nineteen presentations in the corpus and this showed one of them.
  const tiles: Block[] = [];
  for (const form of FORMS) {
    const entry = CATALOGUE[form];
    const drawn = entry.at(phase, 6);
    tiles.push(b.group("column", [
      caption(`${form} · ${entry.says}`),
      "refused" in drawn ? b.notice("warn", drawn.refused) : drawn,
    ], { id: `tile-${form}` }));
    for (const [name, v] of Object.entries(variantsOf(form))) {
      const rung = entry.at(phase, v.height ?? 6, v.spec);
      if ("refused" in rung) continue;
      tiles.push(b.group("column", [
        caption(`${form}/${name} · ${v.says}`),
        rung,
      ], { id: `tile-${form}-${name}` }));
    }
  }
  const pairs: Block[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    const left = tiles[i];
    const right = tiles[i + 1];
    if (left === undefined) continue;
    pairs.push(
      right === undefined
        ? left
        : b.group("row", [left, right], { flex: [1, 1], id: `row-${String(i)}` }),
    );
  }
  const missing = refusals();
  const rungs = everyVariant().length;
  return b.group("column", [
    b.notice(
      "info",
      `${String(FORMS.length)} forms · ${String(FORMS.length - missing.length)} drawn · ` +
        `${String(rungs)} further rungs · ${String(FORMS.length - missing.length + rungs)} figures · ` +
        `${String(missing.length)} refused by the published builder — ${missing.join(", ")} (F377)`,
    ),
    b.notice("muted", "/form <name> draws one full size with its rungs · /live <name> advances it"),
    ...pairs,
  ]);
}

// --- /monitor ---------------------------------------------------------------

/**
 * A resource monitor, live — **the machine this is running on** (F398).
 *
 * The other commands draw generated data at a phase, which is right for a
 * catalogue and says nothing about whether the plots hold up against readings
 * nobody chose. This samples `os` every second and draws four forms from it.
 *
 * **`fetch` reads the machine rather than the far side, and that is idiomatic
 * rather than a shortcut.** A `b.live` part's `fetch` is the *application's* —
 * docker-tui's polls the daemon — and `bin/plots` prints one static object by
 * design, because the demo's subject is the drawing. A monitor needs a reading
 * per tick, which is what `fetch` is for.
 *
 * **CPU is a delta, not a level.** `os.cpus()` returns cumulative jiffies since
 * boot, so a single sample is *utilisation since the machine started* — a flat
 * line at whatever the long-run average is, which looks plausible and is not
 * what a monitor shows. The busy fraction is `Δbusy / Δtotal` between ticks, so
 * the first tick has nothing to compare against and reports zeros.
 */
type Sample = Readonly<{ perCore: readonly number[]; usedGiB: number; load: readonly number[]; heapMiB: number }>;

let previous: readonly os.CpuInfo[] | null = null;

function sample(): Sample {
  const now = os.cpus();
  const perCore = now.map((c, i) => {
    const was = previous?.[i];
    if (was === undefined) return 0;
    const busy = (n: os.CpuInfo): number => n.times.user + n.times.nice + n.times.sys + n.times.irq;
    const all = (n: os.CpuInfo): number => busy(n) + n.times.idle;
    const dBusy = busy(c) - busy(was);
    const dAll = all(c) - all(was);
    return dAll <= 0 ? 0 : Math.max(0, Math.min(1, dBusy / dAll));
  });
  previous = now;
  const total = os.totalmem();
  return {
    perCore,
    usedGiB: (total - os.freemem()) / 1024 ** 3,
    load: os.loadavg(),
    heapMiB: process.memoryUsage().heapUsed / 1024 ** 2,
  };
}

/** The window each series keeps — one minute at a tick a second. */
const MONITOR_WINDOW = 60;

type History = Readonly<{ cores: readonly (readonly number[])[]; used: readonly number[]; heap: readonly number[]; last: Sample }>;

function advance(prev: unknown, next: Sample): History {
  const before = prev as History | undefined;
  const keep = <T>(xs: readonly T[], x: T): readonly T[] => [...xs, x].slice(-MONITOR_WINDOW);
  return {
    // **A row per core, each its own history** — a heatmap wants the matrix, and
    // building it here rather than in `render` keeps the accumulation in one
    // place where the window is applied once.
    cores: next.perCore.map((v, i) => keep(before?.cores[i] ?? [], v)),
    used: keep(before?.used ?? [], next.usedGiB),
    heap: keep(before?.heap ?? [], next.heapMiB),
    last: next,
  };
}

function monitorFrame(h: History): Block {
  const cores = h.cores.length;
  const total = os.totalmem() / 1024 ** 3;
  return b.group("column", [
    caption(`${os.type()} ${os.release()} · ${String(cores)} cores · ${total.toFixed(1)} GiB · up ${(os.uptime() / 3600).toFixed(1)}h`),
    b.group("row", [
      b.group("column", [
        caption("per-core utilisation · a minute, newest right"),
        b.plot({
          id: "mon-cores", form: "heatmap", height: Math.min(cores, 8), axes: true,
          colormap: "inferno", yMin: 0, yMax: 1,
          categories: h.cores.map((_c, i) => `core ${String(i)}`),
          series: h.cores.map((row) => ({ values: [...row] })),
        }),
      ], { id: "mon-left" }),
      b.group("column", [
        caption("memory · GiB resident"),
        b.plot({
          id: "mon-mem", form: "line", height: 8, axes: true, yAxis: "right", yCallout: "last",
          yMin: 0, yMax: Math.max(1, total),
          series: [{ values: [...h.used], label: "used" }],
        }),
      ], { id: "mon-right" }),
    ], { flex: [1, 1], id: "mon-top" }),
    b.group("row", [
      b.group("column", [
        caption("load average"),
        b.plot({
          id: "mon-load", form: "bar", height: 5, axes: true, orientation: "horizontal",
          categories: ["1 min", "5 min", "15 min"],
          series: [{ values: h.last.load.map((v) => Number(v.toFixed(2))), label: "load" }],
        }),
      ], { id: "mon-load-col" }),
      b.group("column", [
        caption("this process · heap MiB"),
        b.plot({
          id: "mon-heap", form: "sparkline", height: 1,
          series: [{ values: [...h.heap], label: "heap" }],
        }),
        caption(`${h.last.heapMiB.toFixed(1)} MiB · ${h.used.length < MONITOR_WINDOW ? `filling (${String(h.used.length)}/${String(MONITOR_WINDOW)})` : "full window"}`),
      ], { id: "mon-heap-col" }),
    ], { flex: [1, 1], id: "mon-bottom" }),
  // **`mon-frame`, not `monitor`** — the live part owns that id, and a rendered
  // frame carrying its container's id is two blocks with one name, which C04 I14
  // refuses. The whole command drew nothing and said nothing: the document was
  // rejected before a frame existed. Second instance in this example.
  ], { id: "mon-frame" });
}

function monitor(): Block {
  previous = null;
  return b.group("column", [
    b.notice("info", "sampling os every second — the first tick has no delta to report, so the cores start at zero"),
    b.live({
      id: "monitor",
      title: "resources",
      every: 1000,
      fetch: () => Promise.resolve(sample()),
      derive: { key: "history", compute: (d, prev) => advance(prev, d as Sample) },
      // **A live part with no `renderError` fails silently**, which is how this
      // one hid: the wrapper notice drew, the part drew nothing, and there was
      // no text anywhere saying why. The framework hands the error, the retry
      // countdown and the attempt number to the app; declining to render them
      // is declining to be told.
      renderError: (err, retryInMs, attempt) =>
        b.notice("error", `${err.message} · attempt ${String(attempt)}` +
          (retryInMs === null ? " · not retrying" : ` · retrying in ${String(Math.round(retryInMs / 100) / 10)}s`)),
      render: (v) => monitorFrame(v as History),
    }),
  ], { id: "monitor-wrap" });
}

// --- /compare ---------------------------------------------------------------

/**
 * The two renderers, side by side (F376).
 *
 * The terminal's figure is cells; the SVG's is pixels, rasterised and handed to
 * `b.image`, which degrades on its own ladder — kitty's graphics protocol where
 * the terminal has it, an ordered braille dither where it does not, `alt` where
 * there are no pixels at all. **The dither is the first arm rather than the
 * last** (C09 I36), so this is worth looking at in an ordinary terminal.
 *
 * The SVG arm refuses six families outright, and a refusal is said rather than
 * left as an empty column.
 */
async function compare(form: PlotForm, phase: number, protocol: ImageProtocol): Promise<readonly Block[]> {
  const entry = CATALOGUE[form];
  const drawn = entry.at(phase, COMPARE_PLOT_ROWS);
  if ("refused" in drawn) {
    return [b.notice("warn", `${form}: ${drawn.refused}`)];
  }
  //
  // **The same cell box the terminal figure gets, so the two correspond.**
  // The row is `flex: [1, 1]`, so each panel is half the terminal less the
  // group's own furniture — and the SVG chain honours this exactly: the emitter
  // takes the viewBox from the `SvgLayout` (measured: asked 644x392, emitted
  // 644x392), and `imageCells` returns the box back unchanged at every width.
  //
  // **The residue, and the reason given for it was false** (F394). This is a
  // constant where it should be the frame's width, and the comment here said *a
  // local handler is not handed one — the parallel fact for a handler is not on
  // `LocalContext`*. It is: `LocalContext = ProducerContext & {…}` and
  // `ProducerContext.width` is `number`, non-optional, on the same `ctx` this
  // function's caller already holds and already reads for `capabilities`.
  //
  // **A deferral naming a condition that was already met** — the class CLAUDE.md
  // records, and another instance of it. The blocker was written where the
  // deferral is and the thing satisfying it in a type two packages away, so
  // neither half was wrong and nobody holding either was looking at the other.
  //
  // **Still a constant, and now for the real reason**: `COMPARE_COLS`,
  // `COMPARE_PLOT_ROWS` and `COMPARE_ROWS` were tuned against a *measured*
  // screenshot — asked 644x392, emitted 644x392, ink boxes compared panel to
  // panel — so deriving them from `ctx.width` means re-running that measurement,
  // not substituting an expression. The plumbing exists; the arithmetic is owed.
  const image = await imageOf(
    drawn,
    COMPARE_COLS,
    // **The terminal figure's *total* height, not its plot area's** — measured:
    // at `height: 14` the terminal block's ink is 402px tall and a 14-row image
    // is 279px, because the block spends 14 rows on the area and further rows on
    // the x-labels and title beneath it. The image's `height` is the whole box,
    // so it has to carry the furniture too or the two bottom edges do not line
    // up. `COMPARE_ROWS` is that total.
    COMPARE_ROWS,
    `${form}, drawn by the SVG renderer`,
  );
  const right =
    image ??
    b.notice("warn", `the SVG arm refuses ${form} — its family has no emitter (C12 §3aj)`);
  return [
    caption(`${form} · ${entry.says}`),
    b.group("row", [
      b.group("column", [caption("terminal · cells"), drawn], { id: "left" }),
      b.group("column", [caption(`svg · ${rungSays(protocol)}`), right], { id: "right" }),
    ], { flex: [1, 1], id: "compare" }),
    b.notice(
      "muted",
      svgOf(drawn, COMPARE_COLS, COMPARE_ROWS) === null
        ? "the second renderer has no arm for this family"
        : protocol === "kitty"
          ? "the same block, two renderers — one measured in cells, one in pixels"
          : "the same block, two renderers — and this terminal cannot show the pixels, "
            + "so the right pane is an ordered braille dither of them (C09 I36)",
    ),
  ];
}

// --- /faults ----------------------------------------------------------------

/**
 * What a failing source looks like, and the way back (C23 §3d, C24 §5).
 *
 * **Three live parts, one of which is meant to break.** The framework owns the
 * behaviour and the app owns the drawing: `renderError` receives the error, the
 * time until the next attempt, and the **attempt count** — which is the
 * source's, shared by every part behind it, so a part does not keep its own
 * count against a backoff it does not own.
 *
 * The interesting one is the third. It fails twice and then succeeds, so a
 * reader watches the countdown grow — the backoff doubling — and then the
 * figure come back. A retry that always fails shows the error arm; only one
 * that recovers shows that the part is still alive underneath it.
 */
let attempts = 0;

function faults(): Block {
  return b.group("column", [
    b.notice("info", "three live parts — one steady, one always failing, one that recovers"),

    b.live({
      id: "fault-ok",
      title: "steady",
      every: 400,
      fetch: () => Promise.resolve(Date.now()),
      derive: {
        key: "ok",
        compute: (_d, prev) => [...(Array.isArray(prev) ? (prev as number[]) : []), Math.random() * 10 + 20].slice(-40),
      },
      render: (v) => walk(Array.isArray(v) ? (v as number[]) : [], 6),
    }),

    b.live({
      id: "fault-always",
      title: "always failing",
      every: 1500,
      fetch: () => Promise.reject(new Error("ECONNREFUSED 127.0.0.1:9999")),
      // **The app draws it, the framework decides when.** `retryInMs` is null
      // for a one-shot and a countdown otherwise; `attempt` is the source's.
      renderError: (err, retryInMs, attempt) =>
        b.notice(
          "error",
          `${err.message} · attempt ${String(attempt)}` +
            (retryInMs === null ? " · not retrying" : ` · retrying in ${String(Math.round(retryInMs / 100) / 10)}s`),
        ),
      render: () => b.notice("ok", "unreachable — this source never resolves"),
    }),

    b.live({
      id: "fault-recovers",
      title: "fails twice, then recovers",
      every: 1200,
      fetch: () => {
        attempts += 1;
        return attempts <= 2
          ? Promise.reject(new Error(`the far side is starting up (${String(attempts)}/2)`))
          : Promise.resolve(attempts);
      },
      renderError: (err, retryInMs, attempt) =>
        b.notice(
          "warn",
          `${err.message} · attempt ${String(attempt)}` +
            (retryInMs === null ? "" : ` · retrying in ${String(Math.round(retryInMs / 100) / 10)}s`),
        ),
      render: (v) =>
        b.notice("ok", `recovered after ${String(attempts - 1)} failures — tick ${String(Number(v))}`),
    }),
  ], { id: "faults" });
}

// --- the glance and the far side -------------------------------------------

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

const gallery = (phase: number): Block =>
  b.group("column", [
    b.notice("muted", `${String(FORMS.length)} forms · /all · /form · /live · /compare · /faults`),
    b.group("row", [
      b.group("column", [caption("a curve · frame latency, ms"), curve(phase, 7)]),
      b.group("column", [caption("a bar · layout and paint, ms · /form bars for all four"), bars(phase, 7)]),
    ], { flex: [1, 1], id: "top" }),
    b.group("row", [
      b.group("column", [caption("a matrix · per-core load"), heat(phase, 6)]),
      b.group("column", [caption("a distribution · stage timings, ms"), distribution(phase, 8)]),
    ], { flex: [1, 1], id: "middle" }),
    b.group("row", [
      b.group("column", [caption("a hierarchy · the budget, nested"), hierarchy(phase, 10)]),
      b.group("column", [caption("and one that moves"), live()]),
    ], { flex: [1, 1], id: "bottom" }),
  ]);

/** Data in, blocks out — the whole extension model, for the spawned route. */
const draw: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => {
    const sample = JSON.parse(raw.stdoutRaw) as { phase?: number };
    return {
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [gallery(sample.phase ?? 0)],
      meta: { adapter: "draw" },
    };
  },
};

const tui = createTui({
  name: "plots-tui",
  binary: BINARY,
  manifest,
  theme: defaultTheme,
  env: process.env,
  adapters: { sample: draw },
  // **Each handler names `LocalHandler`**, which is C24 §8b's finding applied
  // rather than restated: a handler written with inferred parameters is legal
  // TypeScript that compiles, registers, runs, and can never see a field the
  // framework adds (F125). Four of the reference app's eight handler families
  // were in that state.
  localHandlers: {
    all: ((_argv, ctx) => doc(ctx.command, [everyForm(0)])) satisfies LocalHandler,

    form: ((argv, ctx) => {
      const form = formIn(argv);
      if (form === null) return doc(ctx.command, [unknown(argv[0] ?? "")]);
      if (form === "bar") return doc(ctx.command, [caption("bar · all four stages"), barsFull(0, 14)]);
      const entry = CATALOGUE[form];
      const drawn = entry.at(0, 16);
      const rungs = Object.entries(variantsOf(form));
      return doc(ctx.command, [
        caption(`${form} · ${entry.says}`),
        "refused" in drawn ? b.notice("warn", drawn.refused) : drawn,
        // **Each rung full size beneath the default** (F396), so the thing that
        // changed is visible rather than inferred from a six-row tile.
        ...(rungs.length === 0
          ? [b.notice("muted", `${form} has no further rungs`)]
          : [b.notice("muted", `${String(rungs.length)} further rung${rungs.length === 1 ? "" : "s"}`)]),
        ...rungs.flatMap(([name, v]) => {
          const rung = entry.at(0, v.height ?? 16, v.spec);
          return "refused" in rung ? [] : [caption(`${form}/${name} · ${v.says}`), rung];
        }),
      ]);
    }) satisfies LocalHandler,

    /**
     * The same form, advancing — **the phase is the only difference.** One
     * generator serves both, so an animated figure cannot show something its
     * static frame does not.
     */
    live: ((argv, ctx) => {
      const form = formIn(argv);
      if (form === null) return doc(ctx.command, [unknown(argv[0] ?? "")]);
      const entry = CATALOGUE[form];
      if ("refused" in entry.at(0, 8)) {
        return doc(ctx.command, [b.notice("warn", `${form} cannot be built, so it cannot be animated`)]);
      }
      let phase = 0;
      return doc(ctx.command, [
        caption(`${form} · ${entry.says} · advancing`),
        b.live({
          id: `live-${form}`,
          title: form,
          every: 200,
          fetch: () => Promise.resolve((phase += 1)),
          render: (v) => {
            const drawn = entry.at(typeof v === "number" ? v : 0, 14);
            return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
          },
        }),
      ]);
    }) satisfies LocalHandler,

    compare: (async (argv, ctx) => {
      const form = formIn(argv);
      if (form === null) return doc(ctx.command, [unknown(argv[0] ?? "")]);
      return doc(ctx.command, await compare(form, 0, ctx.capabilities.imageProtocol));
    }) satisfies LocalHandler,

    faults: ((_argv, ctx) => doc(ctx.command, [faults()])) satisfies LocalHandler,

    monitor: ((_argv, ctx) => doc(ctx.command, [monitor()])) satisfies LocalHandler,
  },
  greeting: () => ({
    schema: "tui.view/1",
    command: "",
    status: "ok",
    blocks: [gallery(0)],
    meta: {
      verb: null, adapter: "gallery", exitCode: 0, durationMs: 0,
      truncated: false, argv: [], stderr: "", transport: "local", origin: "refresh",
    },
  }),
});

await tui.start();
