/**
 * What the demo draws — **every command's document, built where a test can
 * reach it.**
 *
 * These lived in `main.ts`, which calls `tui.start()` at module scope: importing
 * it starts a terminal session, so nothing could build a document and look at
 * it. The suite next door tested the *pieces* instead — it counted 46 forms and
 * 53 rungs, built each one on its own, and passed while `/all` and `/form` drew
 * nothing at all, because the defect was in the **composition** and no test
 * composed anything (F400).
 *
 * So `main.ts` is the wiring and this is the content. Every function here
 * returns blocks and touches no clock, no session and no terminal, which is
 * what makes `everyDocument()` in the suite able to validate all of them.
 */
import { b, barStyleNames, halfBlockEligible, spinnerSetNames } from "@fmx/calcium";
import type { AdapterDocument, Block, TerminalCapabilities, ViewDocument } from "@fmx/calcium";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGUE, everyVariant, FORMS, refusals, rungId, variantsOf } from "./catalogue.ts";
import type { PlotForm } from "./catalogue.ts";
import { bars, barsFull, curve, distribution, heat, hierarchy, walk } from "./figures.ts";
import { faulty } from "./faulty.ts";
import { imageOf, svgOf } from "./svg.ts";


/**
 * **Named from the published type rather than re-spelled** (MG29's question,
 * answered in a consumer). `TerminalCapabilities` is exported; the member is
 * reached through it, so a rung added to the ladder is a compile error here
 * rather than a string this file no longer covers.
 */
export type ImageProtocol = TerminalCapabilities["imageProtocol"];

const caption = (text: string): Block => b.notice("muted", text);

/**
 * **What the right-hand pane actually is**, which is not always pixels (F394).
 *
 * Captioned `svg · pixels` unconditionally, a terminal with no graphics protocol
 * shows a field of braille dots under a label claiming otherwise, and the honest
 * reading of that is *the SVG renderer is broken*. It is not — but the label has
 * to say which arm, or the ladder reads as a fault.
 *
 * **It named two arms and there are four, which is F415's second half.** The
 * original said *kitty's graphics protocol, then an ordered braille dither, then
 * `alt`* and captioned everything below kitty as braille. C09 I37 put the half
 * block between them, so a frame in colour was described as a dither — a correct
 * rendering described wrongly by the demo built to describe it. It is F394
 * exactly, one rung along, and it arrived the same way: the ladder grew and the
 * label did not.
 *
 * **And the sentence this comment used to carry was F415's first half, written
 * down as an excuse.** It read *VS Code, Cursor, Terminal.app and every
 * `TERM=xterm-256color` shell take the dither, because `detectImageProtocol`
 * answers `kitty` only for `TERM=xterm-kitty`* — true, and used to explain why
 * the dither is legitimate rather than to ask whether the detection was right.
 * It was not: Ghostty speaks the protocol and was answered `none`.
 *
 * **Asked of the framework rather than re-derived**, which is why
 * `halfBlockEligible` is published: a consumer that guesses its own arm is the
 * duplication this caption exists to stop.
 */
const rungSays = (caps: TerminalCapabilities): string => {
  if (caps.imageProtocol === "kitty") return "pixels — the terminal's own decoder";
  const rung = halfBlockEligible(caps, false)
    ? "half blocks — two colours a cell"
    : caps.unicode === "ascii"
      ? "an ASCII ramp"
      : "a braille dither — one bit a dot";
  return `${rung}, because this terminal reports no graphics protocol (${caps.imageProtocol})`;
};

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
export function formIn(argv: readonly string[], fallback: PlotForm = "line"): PlotForm | null {
  const want = argv[0];
  if (want === undefined) return fallback;
  return (FORMS as readonly string[]).includes(want) ? (want as PlotForm) : null;
}

export const unknown = (name: string): Block =>
  b.notice("error", `no form named "${name}" — ${String(FORMS.length)} exist, and /all draws them`);

// --- /all -------------------------------------------------------------------

/**
 * Every form, small, in two columns — **all 46 of them, and every rung.**
 *
 * A catalogue that silently omits what it cannot construct reports 42 of 42 and
 * reads as complete, which is F313's shape in the contact sheet and F350's in
 * the corpus. So four forms were **entries naming the field `b.plot` did not
 * declare**, drawn as notices, counted in the total — and the surface has those
 * eight members now (C24 I30, §4b), so the four build and the count is 46 · 99.
 *
 * **The refusal branch stays**, because `CATALOGUE` is keyed by `PlotForm`: a
 * form added to the union is a compile error until it has an entry, and the next
 * one may land before its builder does. `T-refuse` exercises it.
 */
export function everyForm(phase: number): Block {
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
      // **The rung's own id** (F400). Sharing `f-<form>` with the default put
      // twenty `f-line` blocks in this document, and C04 I14 refused the whole
      // of it — so `/all` drew nothing and said nothing, because the refusal
      // happens at `transcript.append`, above every block that would have
      // reported it.
      const rung = entry.at(phase, v.height ?? 6, { ...v.spec, id: rungId(form, name) });
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
        // **Nothing refuses now, and the sentence says which of two things that
        // is** (C24 I30). Four forms were unbuildable because `b.plot` omitted
        // the member that is their only datum, and a caption reading `0 refused`
        // would be true of a surface that gained the members and true of a
        // catalogue that quietly stopped listing them.
        (missing.length === 0
          ? "every form the union declares builds through `b.plot` (F335 closed)"
          : `${String(missing.length)} refused by the published builder — ${missing.join(", ")} (F377)`),
    ),
    b.notice("muted", "/form <name> draws one full size with its rungs · /live <name> advances it"),
    ...pairs,
  ]);
}

// --- /form and /live --------------------------------------------------------

/**
 * One form, full size, with every rung beneath it (F396).
 *
 * **`bar` no longer leaves by a side door.** The handler used to return
 * `barsFull` and stop, from before the catalogue existed — so `/form bar` was
 * the one form whose page did not come from the catalogue, and the one whose
 * rung was unreachable while `/all`'s caption promised *`/form <name>` draws one
 * full size with its rungs*. The four-stage figure is worth showing, so it is
 * shown **after** the form's own page rather than instead of it.
 */
export function formFull(form: PlotForm): readonly Block[] {
  const entry = CATALOGUE[form];
  const drawn = entry.at(0, 16);
  const rungs = Object.entries(variantsOf(form));
  return [
    caption(`${form} · ${entry.says}`),
    "refused" in drawn ? b.notice("warn", drawn.refused) : drawn,
    // **Each rung full size beneath the default** (F396), so the thing that
    // changed is visible rather than inferred from a six-row tile.
    b.notice(
      "muted",
      rungs.length === 0
        ? `${form} has no further rungs`
        : `${String(rungs.length)} further rung${rungs.length === 1 ? "" : "s"}`,
    ),
    ...rungs.flatMap(([name, v]) => {
      // The same id ruling as `/all`'s: a page holding a form twelve times
      // holds twelve ids (F400).
      const rung = entry.at(0, v.height ?? 16, { ...v.spec, id: rungId(form, name) });
      return "refused" in rung ? [] : [caption(`${form}/${name} · ${v.says}`), rung];
    }),
    ...(form === "bar"
      ? [caption("bar · all four stages, on the arm that can name its series (F374)"), barsFull(0, 14)]
      : []),
  ];
}

/**
 * The same form, advancing — **the phase is the only difference.** One
 * generator serves both, so an animated figure cannot show something its
 * static frame does not.
 */
export function liveFor(form: PlotForm, rung?: string): readonly Block[] {
  const entry = CATALOGUE[form];
  if ("refused" in entry.at(0, 8)) {
    return [b.notice("warn", `${form} cannot be built, so it cannot be animated`)];
  }
  // **A rung can be animated too, and until now none could.** `/live` drew the
  // default entry and nothing else, so every variant in the catalogue was a
  // still — which is the wrong way round for `plot3d`, where the member being
  // demonstrated is a *surface* and the thing that shows it is the camera
  // moving. A reader could see the teapot and could not turn it.
  //
  // The name is checked against the table rather than trusted, because a typo
  // silently animating the default is the same class as a caption promising a
  // figure the spec does not draw.
  const rungs = variantsOf(form);
  const variant = rung === undefined ? undefined : rungs[rung];
  if (rung !== undefined && variant === undefined) {
    const names = Object.keys(rungs);
    return [b.notice(
      "error",
      names.length === 0
        ? `${form} has no rungs — /live ${form} draws it`
        : `no rung "${rung}" on ${form} — ${names.join(", ")}`,
    )];
  }
  let phase = 0;
  const height = variant?.height ?? 14;
  return [
    caption(
      variant === undefined
        ? `${form} · ${entry.says} · o to orbit · [ ] { } + - to steer`
        : `${form}/${String(rung)} · ${variant.says} · o to orbit · [ ] { } + - to steer`,
    ),
    b.live({
      id: `live-${form}${rung === undefined ? "" : `-${rung}`}`,
      title: rung === undefined ? form : `${form}/${rung}`,
      // **The tick drives the *data*, not the camera** (F509). The demo used to
      // advance the azimuth per tick, at a rate that was a function of how
      // expensive the frame was; the framework's own orbit is delta-timed, bound
      // to `o`, and available on every focused plot. So the phase counter
      // survives — a live part's whole point is data that changes — and the
      // rotation is the reader's.
      //
      // **A rung may name its own tick** and almost none do. The bunny is 365 ms
      // a frame against this 200, so the default would ask it for a frame it
      // cannot deliver and the figure would stutter rather than turn.
      every: variant?.every ?? 200,
      fetch: () => Promise.resolve((phase += 1)),
      render: (v) => {
        const at = typeof v === "number" ? v : 0;
        const drawn = variant === undefined
          ? entry.at(at, height)
          : entry.at(at, height, { ...variant.spec, id: `live-${form}-${String(rung)}-fig` });
        return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
      },
    }),
  ];
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
          // **`label` on the series, not `categories` on the block** (F420).
          // C12 I18 is explicit — *a heatmap's row labels **are** its ordinate* —
          // and `layoutFor` sizes the column from `series[].label`. This declared
          // eight `categories`, which no matrix form reads, so the demo shipped
          // eight unlabelled rows and a reader could not tell which core was
          // which. Nothing refused it: `categories` is legal on a `Plot` and
          // silently ignored here, and the frame that results is a perfectly
          // good heatmap of anonymous rows. **docker's `cpu-history` has always
          // done it this way** — one consumer right, one wrong, and no gate
          // between them.
          series: h.cores.map((row, i) => ({ values: [...row], label: `core ${String(i)}` })),
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

export function monitor(): Block {
  previous = null;
  return b.group("column", [
    b.notice("info", "sampling os every second — the first tick has no delta to report, so the cores start at zero"),
    b.live({
      id: "monitor",
      title: "resources",
      every: 1000,
      fetch: () => Promise.resolve(sample()),
      derive: { key: "history", compute: (d, prev) => advance(prev, d as Sample) },
      // **No `renderError`, and the reason the old one existed was half true**
      // (F399, F401). It was written because *the source is `os` and reading a
      // local file cannot fail* — true about the **fetch**, silent about the
      // **render**, which is how this part drew nothing once a second while
      // `b.plot` threw F398's refusal inside it.
      //
      // What it drew instead was a `notice`, because that was the whole of what
      // an override could reach for. The framework's default is a `status` and
      // draws the box, the countdown and the attempt, so declining to override
      // is now the way to be told rather than the way to be silent.
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
export async function compare(form: PlotForm, phase: number, caps: TerminalCapabilities): Promise<readonly Block[]> {
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
      b.group("column", [caption(`svg · ${rungSays(caps)}`), right], { id: "right" }),
    ], { flex: [1, 1], id: "compare" }),
    b.notice(
      "muted",
      svgOf(drawn, COMPARE_COLS, COMPARE_ROWS) === null
        ? "the second renderer has no arm for this family"
        : caps.imageProtocol === "kitty"
          ? "the same block, two renderers — one measured in cells, one in pixels"
          // **Not *an ordered braille dither* any more, and that was F415's other
          // half.** Below the protocol the ladder has three rungs, so the sentence
          // names what `rungSays` decided rather than assuming the bottom one.
          : "the same block, two renderers — this terminal reports no graphics protocol, "
            + "so the right pane is the picture spent on glyphs instead (C09 I36, I37)",
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

/**
 * **Failures, counted separately from fetches** (F417).
 *
 * The label read `attempts - 1` and `attempts` counts *every* fetch, so once the
 * source recovered the number kept climbing: a reader watching for a minute saw
 * *recovered after 11 failures* where there had been two. An off-by-one in a
 * label is invisible to every assertion — the document validates, the frame
 * paints, and only a person reading the sentence can see it is counting the
 * wrong thing.
 *
 * Grepped for copies: this is the only `attempts - 1` in either example, and the
 * two `length - 1` hits in docker are indices rather than counts.
 */
let failures = 0;

/** The accumulating part's readings — what the override keeps and the default drops. */
let kept: readonly number[] = [];

export function faults(): Block {
  return b.group("column", [
    b.notice(
      "info",
      "six live parts — the framework's box on five of them, and one override that keeps its history. " +
        "` ERROR ` in a gap in the rule, the message, the countdown and the attempt",
    ),

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

    // **No `renderError`, and now that means something** (F401, F406). This drew
    // the failure as `b.notice("error", …)`, and removing the override was only
    // half the fix: the default was a `status` at the two rungs *below* C09's
    // first border, so it still read as a red line of text inside the panel and a
    // reader with two screenshots said so. `framed` is the rung that was missing
    // — no second border, because the panel has one, and the rows spent on the
    // tag and the content instead.
    b.live({
      id: "fault-always",
      title: "always failing · the framework's box",
      every: 1500,
      fetch: () => Promise.reject(new Error("ECONNREFUSED 127.0.0.1:9999")),
      render: () => b.notice("ok", "unreachable — this source never resolves"),
    }),

    b.live({
      id: "fault-recovers",
      title: "fails twice, then recovers",
      every: 1200,
      fetch: () => {
        attempts += 1;
        if (attempts <= 2) {
          failures += 1;
          return Promise.reject(new Error(`the far side is starting up (${String(attempts)}/2)`));
        }
        return Promise.resolve(attempts);
      },
      render: (v) =>
        b.notice("ok", `recovered after ${String(failures)} failures — tick ${String(Number(v))}`),
    }),

    // **A one-shot, and the arm the two above cannot reach** (C23 I51, F234).
    // `retryInMs` is `null` for every part with no `every` and for every
    // deterministic `render` throw, so the box is `error` rather than `retrying`
    // — no countdown, and therefore no activity line. Mapping both arms to
    // `retrying` ships a blank row where the spinner goes, which a classification
    // table found before any of it was written.
    b.live({
      id: "fault-once",
      title: "one-shot · no retry is coming",
      fetch: () => Promise.reject(new Error("read the record: no such container")),
      render: () => b.notice("ok", "unreachable — this source never resolves"),
    }),

    // **The waiting state, given long enough to read.** `b.live`'s placeholder is
    // a `status` at `loading` and it carries the **elapsed** counter — the number
    // that says *this is wrong* at 47s. `elapsed()` shows nothing below one
    // second, deliberately: a fast load must not flash a counter.
    b.live({
      id: "fault-slow",
      title: "slow source · the counter is the point",
      // **Four seconds, not twenty-five.** `elapsed()` is silent below one, so
      // the counter needs a fetch measured in seconds to say anything at all —
      // and a demo that makes a reader wait half a minute to see one number is
      // a worse demonstration, not a better one. Four ticks the counter three
      // times and costs the suite four seconds rather than twenty-five.
      every: 30_000,
      fetch: () => new Promise((resolve) => { setTimeout(() => { resolve(1); }, 4_000); }),
      render: () => b.notice("ok", "it arrived — four seconds is long enough to watch a counter"),
    }),

    // **The override, doing what an override is for** (C24 §4b, F401).
    //
    // The framework's default **replaces** the part's block, which is right for a
    // part whose block *is* its latest fetch and wrong for one accumulating across
    // ticks: the history is what made the failure interesting, and the default
    // takes it with it. docker's `renderError` has drawn the failure *beside* its
    // ring since S3, and until `b.status` existed the only thing it could put
    // there was a notice.
    //
    // So this is the useful override rather than a restyling: the walk survives,
    // and the framework's own box sits under it.
    b.live({
      id: "fault-keeps",
      title: "an override that keeps its history",
      every: 900,
      fetch: () => {
        kept = [...kept, Math.random() * 10 + 20].slice(-40);
        return kept.length < 12
          ? Promise.resolve(kept)
          : Promise.reject(new Error("the source went away, and the last twelve readings did not"));
      },
      renderError: (err, retryInMs, attempt) =>
        b.group("column", [
          walk(kept, 6),
          b.status(err, retryInMs, attempt, { id: "fault-keeps-status" }),
        ], { id: "fault-keeps-body" }),
      render: (v) => walk(Array.isArray(v) ? (v as number[]) : [], 6),
    }),
  ], { id: "faults" });
}

// --- /image ------------------------------------------------------------------

/** Beside `src/`, written by `tools/fixtures.mjs` and committed. */
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

/**
 * The eight fixtures, and **five are about placement while three are about the
 * decoder** (C09 §4c, §8b).
 *
 * The split is why there are eight rather than one. A photograph, a screenshot,
 * a diagram, a tall portrait and a single pixel exercise the **geometry** —
 * aspect, scaling, the clamp, the degenerate case — and every one of them is a
 * question only a terminal answers. The 16-bit, palette and interlaced files
 * exercise the **decoder**, and those are answered in a container: `make` runs
 * `tools/fixtures.mjs`, which puts each through `decodePng` and fails if any
 * fixture stops doing what it is named for.
 *
 * **Two of them draw at `kitty` and refuse here** (F413). The protocol arm needs
 * the decoder for the aspect alone, and `decodePng` reads the IHDR before it
 * refuses — so an interlaced PNG places and draws on a terminal that decodes it,
 * and shows the `status` box with its reason on one that does not. That pair is
 * the demonstration; a caption saying so is not.
 *
 * **Synthetic, and said rather than implied.** None is a photograph of anything.
 * The first is *continuous tone*, which is the property under test — the
 * half-block rung exists because a gradient braille can only stipple arrives as
 * a gradient. A real photograph would test the same property and carry a licence.
 */
const FIXTURES: readonly (readonly [string, number, string])[] = [
  ["photo.png", 16, "2000x1500 continuous tone — the case the half-block rung exists for"],
  ["screenshot.png", 12, "1200x800 flat fills and hard edges — a UI, where shape wins some ground back"],
  ["diagram.png", 10, "720x480 one-pixel rules — braille resolves these and a half block averages them away"],
  ["portrait.png", 18, "600x1600, taller than wide — the aspect the column count is derived from"],
  ["pixel.png", 2, "1x1 — a cell is two pixels and this is one (C09 §8b G9)"],
  ["palette.png", 8, "colour type 3, depth 8 — a palette PNG, and the control: this one we DO read"],
  ["depth16.png", 6, "bit depth 16 — refused here by name, and drawn at kitty (F413)"],
  ["interlaced.png", 6, "Adam7 — the same pair, and the reason the box says which refusal"],
];

export function images(): Block {
  return b.group("column", [
    b.notice(
      "info",
      "eight fixtures — five about placement, three about the decoder. " +
        "The last two refuse HERE and place at kitty: the arm that rasterises needs pixels, " +
        "the protocol arm needs only the extent, and the IHDR survives the refusal",
    ),
    ...FIXTURES.flatMap(([file, h, says]) => [
      caption(`${file} · ${says}`),
      b.image({ id: `img-${file}`, path: join(ASSETS, file), height: h, alt: `${file} — ${says}` }),
    ]),
  ], { id: "images" });
}

// --- /rungs and /mosaic ------------------------------------------------------

/**
 * The `status` box at every height it has a rung for, and at four widths.
 *
 * **No `b.live` failure can show this.** The framework's two live defaults are
 * height 1 and 2 — a frame read, because both sit inside `b.live`'s own panel
 * (F234, F235) — so the border, the padding and the ` ERROR ` tag are drawn only
 * by the registry's containment boundary, at **exactly the height the failed
 * block committed** (C09 I11, I31). A block whose renderer throws is how a reader
 * gets there, and `TuiConfig.blocks` is how a consumer supplies one.
 *
 * The height rungs are four: **≥6** the full figure — two borders, two blanks and
 * the tag row; **≥4** border, no padding; **=3** border only, because below three
 * a reader cannot tell a contained failure from a block that happens to say
 * something red; **<3** bare, and no evidence the height was honoured.
 */
const RUNGS: readonly (readonly [number, string])[] = [
  [1, "one row — the message, and nothing to say the height was honoured"],
  [2, "two — still bare, and this is `retrying`'s rung"],
  [3, "three — a border, and no tag: the least that says *something failed here*"],
  [4, "four — the tag arrives, the padding does not"],
  [6, "six — the full figure: two borders, two blanks, the tag row"],
  // **Not *the message wrapped*, which is what this caption first said** — at
  // ninety-six cells it does not wrap, and the frame is what said so. What a
  // plot-sized box shows is the padding growing to fill the height it committed,
  // with the tag row and the message held in the middle of it.
  [14, "fourteen — the box a failed plot leaves, at the height it committed"],
];

export function rungs(): Block {
  return b.group("column", [
    b.notice(
      "info",
      "the containment box at each of its height rungs — a block whose renderer throws, " +
        "drawn at the height it committed (C09 I11, I31)",
    ),
    ...RUNGS.flatMap(([h, says]) => [
      caption(`${String(h)} row${h === 1 ? "" : "s"} · ${says}`),
      faulty(`rung-${String(h)}`, h, "the renderer for this block threw on purpose"),
    ]),
    // **The width ladder, which a figure indexed on height cannot reach** — two
    // rules both holding at rest, no event between them (C09 I31). ` ERROR ` is
    // seven cells and a rule needs nine, against a `row` group that hands out
    // `floor((w − gaps) / n)`: so the same box loses its rule, then its tag, then
    // its padding and its border, across one row.
    caption(
      "the same box at six rows, across four columns — the width ladder: " +
        "a rule around the tag, then a bare tag, then no tag at all",
    ),
    // **`[8, 4, 2, 1]`, tuned against the frame rather than reasoned.** At
    // `[4, 2, 1, 1]` the narrowest column came out at fourteen cells and kept its
    // tag: ` ERROR ` is seven, so padding is dropped to save it and six cells of
    // furniture still leave eight. The rung that *drops* the tag needs content
    // under seven, which is about eight cells of column — so the spread has to be
    // steeper than it looks. Measured, not derived.
    b.group("row", [1, 2, 3, 4].map((i) =>
      faulty(`wide-${String(i)}`, 6, "the renderer threw, and this box is getting narrower")),
      { flex: [8, 4, 2, 1], id: "rung-widths" }),
  ], { id: "rungs" });
}

/**
 * `b.mosaic` — **a layout named as a picture** (C04 I71).
 *
 * A `group` nests: a row of columns of rows, and the shape lives in the nesting.
 * A mosaic states the shape *as a string* — one character a cell, `/` between
 * rows, `.` for a hole — and hands the regions their children positionally. The
 * grammar is the thing to show, so each panel is captioned with the template that
 * produced it.
 *
 * **`columns` and `rows` take `Share`**, which is `number | { cells: n }`: a
 * fraction of what is left, or an exact count. The pinwheel below spends an exact
 * gutter on its left column and shares the rest.
 */
export function mosaics(phase: number): Block {
  const tile = (form: PlotForm, id: string, h: number): Block => {
    const drawn = CATALOGUE[form].at(phase, h, { id });
    return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
  };
  return b.group("column", [
    b.notice("info", "four layouts, each named as a string — one character a cell, `/` a row, `.` a hole"),

    caption('"AAB/AAB/CDB" · a wide panel, a rail, and two below it'),
    b.mosaic({
      id: "mosaic-dash", height: 14, areas: "AAB/AAB/CDB",
      children: [
        tile("line", "mo-a", 9),
        tile("sparkline", "mo-b", 1),
        tile("bar", "mo-c", 4),
        tile("boxplot", "mo-d", 4),
      ],
    }),

    caption('"AAB/DEB/DCC" · the pinwheel, with an exact 24-cell first column'),
    b.mosaic({
      id: "mosaic-pin", height: 15, areas: "AAB/DEB/DCC",
      columns: [{ cells: 24 }, 1, 1],
      children: [
        tile("heatmap", "mo-pa", 5),
        tile("ecdf", "mo-pb", 10),
        tile("histogram", "mo-pc", 5),
        tile("treemap", "mo-pd", 10),
        tile("density", "mo-pe", 5),
      ],
    }),

    caption('".A./BBB/.C." · holes, which a `group` has no way to say'),
    b.mosaic({
      id: "mosaic-holes", height: 12, areas: ".A./BBB/.C.",
      children: [tile("radar", "mo-ha", 4), tile("ridgeline", "mo-hb", 4), tile("funnel", "mo-hc", 4)],
    }),

    caption('"AB" · two cells, and `rows` unused — the degenerate case still holds'),
    b.mosaic({
      id: "mosaic-pair", height: 8, areas: "AB", columns: [2, 1],
      children: [tile("violin", "mo-2a", 8), tile("pie", "mo-2b", 8)],
    }),
  ], { id: "mosaics" });
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

export const gallery = (phase: number): Block =>
  b.group("column", [
    b.notice("muted", `${String(FORMS.length)} forms · /all · /form · /live · /compare · /faults`),
    b.group("row", [
      b.group("column", [caption("a curve · frame latency, ms"), curve(phase, 7)]),
      b.group("column", [caption("a bar · layout and paint, ms · /form bar for all four"), bars(phase, 7)]),
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

// --- the two documents that are not a local handler's ----------------------

/**
 * What the greeting serves, and what the `sample` adapter serves — **built
 * here, so there is one copy** (F400).
 *
 * These were object literals in `main.ts`, each with its own hand-written
 * `meta`. A test wanting to validate them had two choices, and both are the
 * shape this repository refuses: import the module that starts a session, or
 * write a third copy of the meta and assert against a fixture that agrees with
 * itself. `completeLocal` is published for the handler documents; a greeting's
 * is its own, so it lives beside the blocks it carries.
 */
export const greetingDocument = (): ViewDocument => ({
  schema: "tui.view/1",
  command: "",
  status: "ok",
  blocks: [gallery(0)],
  meta: {
    verb: null, adapter: "gallery", exitCode: 0, durationMs: 0,
    truncated: false, argv: [], stderr: "", transport: "local", origin: "refresh",
  },
});

/**
 * Data in, blocks out — the whole extension model, for the spawned route.
 *
 * **`AdapterDocument`, not `ViewDocument`** (F58b): the registry overwrites
 * `verb`, `exitCode`, `durationMs`, `argv`, `stderr`, `transport` and `origin`
 * from the raw result and the context on every route, so those seven are typed
 * `never` here. An adapter that supplies them computes values that are thrown
 * away — which is what the return type now says out loud.
 */
export const adaptSample = (stdoutRaw: string, command: string): AdapterDocument => {
  const sample = JSON.parse(stdoutRaw) as { phase?: number };
  return {
    schema: "tui.view/1",
    command,
    status: "ok",
    blocks: [gallery(sample.phase ?? 0)],
    meta: { adapter: "draw" },
  };
};

// --- the two catalogues, as galleries -------------------------------------------

/** `n` items into `columns` columns of equal weight, filled top to bottom. */
function columnsOf(items: readonly Block[], columns: number, id: string): Block {
  const per = Math.ceil(items.length / columns);
  return b.group(
    "row",
    Array.from({ length: columns }, (_, c) => b.group("column", items.slice(c * per, (c + 1) * per), { id: `${id}-${String(c)}` })),
    { id },
  );
}

/**
 * `/spinners` — every set `spinnerSetNames()` lists, each a one-row loading
 * status naming itself, so the frame shows the glyphs turning beside the name a
 * producer would write into `Status.spinner` (C24 §6).
 *
 * **Every set advances one frame per tick**, and the session ticks at the
 * fastest set's interval (C09 `animationIntervalOf`) — so a 120 ms set turns at
 * the 50 ms set's cadence here. The catalogue GIF (`tools/animation-proof.mjs`)
 * carries the same caveat; the per-set interval is honoured when a set is alone.
 */
export function spinners(): Block {
  const names = spinnerSetNames();
  // The loading line is `⠋ loading` whatever the message says (C09 §3a), so the
  // set's name sits beside the cell rather than in it: nine cells for the line,
  // the rest for the name.
  const items = names.map((name) =>
    b.group("row", [
      { ...b.status.loading({ id: `spinner-${name}` }), spinner: name },
      b.notice("muted", name, undefined, { id: `spinner-name-${name}` }),
    ], { id: `spinner-row-${name}`, flex: [{ cells: 9 }, 1] }),
  );
  return b.group("column", [
    caption(`${String(names.length)} spinner sets · Status.spinner names one · each carries its own ASCII fallback`),
    columnsOf(items, 3, "spinner-sets"),
  ], { id: "spinners" });
}

/**
 * `/bars` — every style `barStyleNames()` lists at four fills, so a reader sees
 * the on and off glyphs against each other rather than one bar at one fill,
 * which is where `slant` and `posts` look alike and `beads` does not.
 */
export function barStyles(): Block {
  const names = barStyleNames();
  const cells = names.map((name) =>
    // The label names the style on every row, so no caption: a caption above
    // four rows that each carry the name read as a fifth, empty bar.
    b.group("column", [0, 33, 66, 100].map((n) =>
      b.progress({ id: `bar-${name}-${String(n)}`, label: name, current: n, total: 100, style: name }),
    ), { id: `bar-style-${name}`, gapBefore: true }),
  );
  return b.group("column", [
    caption(`${String(names.length)} bar styles · Progress.style names one · ASCII under unicode: ascii, and where the style is narrow-only under ambiguousWidth: wide`),
    columnsOf(cells, 3, "bar-styles"),
  ], { id: "bars" });
}
