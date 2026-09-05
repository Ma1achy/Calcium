/**
 * The animation catalogue — the subjects `SUBJECT_NAMES` lists (five at first, the
 * spinner gallery since 2026-09-05), two arms, and the asymmetry between them
 * (C09 §4, C12 §3ak, C22 I60/I60a, F227, C24 §6).
 *
 *     npx tsx tools/animation-proof.mjs
 *
 * **A GIF is the one artefact where *looks fine* and *is correct* diverge**, so
 * everything here is arranged around being able to tell the difference. A
 * dropped frame plays smoothly; a duplicated one plays smoothly; a frozen
 * counter beside a turning spinner plays smoothly and is the exact failure F227
 * named. None of that is visible in the file, so the properties are asserted on
 * the *frames* before they are encoded — `test/unit/animation-proof.test.ts` —
 * and the figures each animation reaches are printed into the README as it runs.
 *
 * ---
 *
 * **Re-emitted per frame, never SMIL, and the ruling is taken rather than open.**
 * `plotToSvg` is `(Plot, theme) → string`: pure, one block in and one document
 * out. **The terminal does not animate either** — `plotDefinition` is equally
 * pure and the animation lives in L4, which composes a frame per tick. Putting
 * time inside the SVG would mean the renderer takes a *sequence* instead of a
 * block, which is a different seam; and a document whose appearance changes
 * without its block changing is invisible to every gate in this repository —
 * the golden corpus, the SVG baseline and the terminal baseline all compare
 * bytes, and animated bytes are stable while the picture moves.
 *
 * **Deterministic by construction.** Every frame is a pure function of
 * `(block, width, ctx)` with `tick` in `ctx`, and the data comes from a seeded
 * generator rather than a clock or `Math.random()` — so the frames generate with
 * no session running and the same input gives the same bytes. **A GIF whose
 * bytes move between runs is the `Math.random()` finding in a new file**, and
 * `test/unit/animation-proof.test.ts` is what asks.
 *
 * **Determinism was taken to buy committability and it buys reproducibility,
 * which is not the same thing and is the better one.** `docs/catalogue/` is
 * ignored in its entirety — 560 frames, the contact sheets, the status ladder,
 * none of it tracked — and measuring said why that is right here too: this
 * directory is **19 MiB at the still catalogue's density and 7 at its own**,
 * against a `docs/media/` holding thirty committed GIFs in 1.3 MiB with the
 * largest at 279 KiB. A binary that one command reproduces byte-for-byte does
 * not need to be in the history.
 *
 * **The exception is evidence, and it is two files.** `steps-before` and
 * `steps-after` are cited *by a finding* as F227's regression proof, and a
 * finding citing a picture no reader can see is a claim carried without a record
 * — which is what they were: `docs/catalogue/status/` is ignored, so the paths
 * F227 names have never been in the repository. Those two are written to
 * `docs/media/` as well, where the tracked images live, at 50 KiB each. The rule
 * that falls out is the one `docs/media/` already follows without saying so:
 * **what a command reproduces is generated; what is cited as evidence is
 * committed.**
 *
 * **And the numbers are fields, not `tick`.** `elapsedMs`, `retryInMs` and
 * `attempt` are written by L4, which holds the clock (C09 I32) — `tick` cannot
 * carry a duration, because C03 coalesces and drops commits under load. So the
 * harness supplies what the driver would, which is what makes the counter's
 * `1s → 2s` match a real session's rather than drifting with the frame index.
 *
 * ---
 *
 * **The two arms are not one mechanism and the README says so.** The terminal
 * arm animates through `tick` *and* the render cache: C22 I60's key carries a
 * tick axis per kind, C22 I60a arms the ticker from what the frame drew, and
 * C03's 100 ms window floors the set's own 80. **The SVG arm has no ladder, no
 * tick and no cache** — its GIF is N documents rasterised and assembled, a
 * different pipeline producing a comparable artefact. A reader shown the pair
 * without that sentence takes it as evidence of a shared mechanism that does not
 * exist.
 *
 * **A plot animates because its data changes; a spinner because `tick` does.**
 * That is why the two plot subjects rebuild their block every frame and the
 * three status subjects rebuild only the context — and it is the difference the
 * cache measurement below is about.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gifFrom, ansiToSvg, pngFromSvg } from "./catalogue-png.mjs";
import { barStyleNames, createBlockRegistry, spinnerFrames, spinnerIntervalMs, spinnerSetNames } from "../src/presentation/blocks/index.js";
import { plotDefinition } from "../src/presentation/plot/index.js";
import { plotToSvg } from "../src/presentation/plot/svg.js";
import { renderSequenceToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";
import { SGR_RESET, cursorTo } from "../src/terminal/escapes.js";

export const ANIMATION_DIR = join(import.meta.dirname, "..", "docs", "catalogue", "animation");

/**
 * Where the *cited* animations go — the tracked half (F227).
 *
 * Two files, and the header says why they are the only two. Written by this
 * generator rather than copied by hand, because a hand-copied evidence file is
 * one regeneration away from disagreeing with the finding that cites it while
 * both still read as current.
 */
export const MEDIA_DIR = join(import.meta.dirname, "..", "docs", "media");

/** The subjects a finding cites, so they are tracked as well as generated. */
/**
 * The subjects the READMEs cite, written into `docs/media/` as well as the
 * catalogue. **AP12 compares the committed file to a fresh encode**, because the
 * encoder is deterministic and the committed `steps-*.gif` were a week stale
 * against the tree before anything looked (F819).
 */
export const CITED_NAMES = Object.freeze(["steps-before", "steps-after", "spinner-sets"]);
const CITED = new Set(CITED_NAMES);

/** One terminal-arm subject encoded to `file`, exactly as `writeAnimationProof` writes it. */
export async function encodeSubject(name, file) {
  const s = animationFrames()[name];
  if (s === undefined || s.arm !== "terminal") throw new Error(`${name} is not a terminal-arm subject`);
  const pages = await Promise.all(s.frames.map((ansi) => pngFromSvg(ansiToSvg(ansi), DENSITY)));
  return await gifFrom(pages, s.frames.map(() => s.delay), file);
}
/** The bar-style sheet — a still, so not a subject; written beside the GIFs and cited from the notes. */
export const BAR_SHEET = "bar-styles.png";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("the shipped theme does not load");
const THEME = loaded.value.current;

/**
 * The one capability set, and the single arm is the reason.
 *
 * The SVG arm is always 24-bit and always `unicode: "full"` (C12 §3aj hazard 5),
 * so a capability axis here would write five identical copies of half the
 * corpus and report five times the coverage it has — `svg-baseline.mjs`'s
 * ruling, and the same argument applies to the terminal half of a *pair*.
 */
const FULL = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  ambiguousWidth: "narrow",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
  hyperlinks: false,
  cursorShape: true,
});

const registry = createBlockRegistry();
registry.register(plotDefinition);

const ansiFor = (block, width, tick = 0) =>
  renderSequenceToLines(registry, [block], width, { theme: THEME, capabilities: FULL, tick }).join("\n");

// --- the data, seeded ------------------------------------------------------

/**
 * A linear congruential generator, because `Math.random()` is forbidden here for
 * the reason the header gives and `Date.now()` for the reason every workflow
 * script carries: an artefact that is regenerated must come out byte-identical
 * or nothing downstream can tell a real change from a re-run.
 *
 * Numerical Recipes' constants. The quality of the noise is irrelevant — what is
 * needed is that the same seed gives the same walk on every machine, and an LCG
 * over a `>>> 0` accumulator is exactly reproducible in JavaScript's integer
 * semantics.
 */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 0x1_00_00_00_00;
  };
}

/** The window a live part keeps — the monitor's own, one minute at a tick a second. */
const WINDOW = 60;

/** 10 fps for 10 seconds, which is what a plot's GIF was asked to be. */
const PLOT_FRAMES = 100;
const PLOT_DELAY = 100;

/**
 * A bounded random walk, `n` samples, clamped into `[0, 100]`.
 *
 * **Clamped rather than free**, because a free walk drifts out of any fixed
 * range and a plot that rescales its ordinate every frame is a picture where
 * *everything* moves for a reason that is not the data. The range is fixed on
 * the block, as `monitorFrame` fixes memory's, so what the reader sees moving is
 * the series.
 */
function walk(n, seed) {
  const rand = prng(seed);
  const out = [];
  let v = 50;
  for (let i = 0; i < n; i += 1) {
    v = Math.max(0, Math.min(100, v + (rand() - 0.5) * 14));
    out.push(Number(v.toFixed(2)));
  }
  return out;
}

/**
 * The frames a live part's window shows: **filling, then sliding.**
 *
 * Not always-full, because the monitor's real load starts empty and a corpus of
 * the steady state alone would be a corpus of half of it.
 *
 * **What this was built to show, it disproved.** The expectation written here
 * first was that the two regimes cost differently — that while the window fills,
 * the columns left of the newest sample stand still and the row diff has
 * something to skip, and that only the slide changes every row. **Measured, the
 * changed-row fraction is flat across the boundary**: 48% then 46% for the line,
 * 80% then 80% for the heatmap. A growing window rescales the abscissa exactly
 * as a sliding one shifts it, so every sample moves in both, and *filling* was
 * never the cheap half.
 *
 * The regimes stay in the table because the **bytes** do move — the heatmap's
 * frame nearly doubles as the window fills with data to colour — and because a
 * claim this file made and then measured is worth more standing beside the
 * number than deleted.
 */
function windows(series, frames) {
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    const end = i + 1;
    out.push(series.slice(Math.max(0, end - WINDOW), end));
  }
  return out;
}

// --- the subjects ----------------------------------------------------------

const WALK = walk(PLOT_FRAMES, 0x0c_a1_c1_00);

const lineBlock = (values) => ({
  kind: "plot",
  id: "walk",
  form: "line",
  height: 12,
  axes: true,
  yAxis: "right",
  yCallout: "last",
  yMin: 0,
  yMax: 100,
  series: [{ values, label: "signal" }],
});

const CORES = 8;

/**
 * The monitor's ring, per core — **the case with the most cells changing.**
 *
 * Eight independent walks over `[0, 1]`, which is what `advance()` accumulates
 * from `os.cpus()`: a row per core, each its own history, all sliding together.
 * A heatmap spends its `[0, 1]` on a colour rather than a position (C12 §3ak),
 * so every one of the 480 cells is repainted on every slide — the worst case for
 * the frame diff and the one the monitor actually runs.
 */
const RINGS = Array.from({ length: CORES }, (_, i) =>
  walk(PLOT_FRAMES, 0x00_c0_de_00 + i).map((v) => Number((v / 100).toFixed(3))),
);

const ringBlock = (rows) => ({
  kind: "plot",
  id: "ring",
  form: "heatmap",
  height: CORES,
  axes: true,
  colormap: "inferno",
  yMin: 0,
  yMax: 1,
  // **`label` per series, and the monitor's own declaration was wrong** (F420).
  // This was `categories`, copied from `/monitor` — and reading the first frame
  // showed eight rows with no ordinate at all. C12 I18: *a heatmap's row labels
  // **are** its ordinate*, sized by `layoutFor` from `series[].label`.
  // `categories` is legal on a `Plot`, ignored by every matrix form, and the
  // result is a correct heatmap of anonymous rows — which is why nothing said
  // so. Fixed in both places; docker's `cpu-history` never had it.
  series: rows.map((values, i) => ({ values, label: `core ${String(i)}` })),
});

const STEPS = {
  kind: "steps",
  id: "s",
  steps: [
    { label: "resolving", state: "done" },
    { label: "building", state: "active" },
    { label: "publishing", state: "pending" },
  ],
};

// --- the assembly ----------------------------------------------------------

/**
 * **72, and it is 1:1 for both arms rather than a compromise.**
 *
 * The still catalogue rasterises at 144, which is 2× — a still is a thing you
 * zoom into to check a glyph, and one frame's cost is the whole cost. An
 * animation is watched at size and multiplies that cost by its frame count.
 *
 * The number is not a taste. `SVG_DEFAULT_LAYOUT` is 640×320 and 72 renders it
 * at exactly 640×320; `ansiToSvg`'s cell box is 8.41×16 px and 72 renders a cell
 * at exactly that. **At 144 both arms are being rasterised at double their
 * natural size and the second copy of every pixel is paid for in every frame.**
 *
 * Measured on the worst subject — the heatmap's SVG arm, 100 frames:
 *
 *     density 144   1280×640   8.44 MiB
 *     density  96    853×427   5.05 MiB
 *     density  72    640×320   3.22 MiB
 *     density  48    427×213   2.04 MiB
 *
 * The knee is the content and not the sampling: a continuous colormap over 480
 * cells changing every frame defeats a 256-colour palette, so halving again buys
 * a third and costs legibility. 72 is where the picture is exactly itself.
 */
const DENSITY = 72;

const PLOT_WIDTH = 76;
const STATUS_WIDTH = 52;

/**
 * One subject, as a GIF, from ANSI frames — **and the distinctness is counted
 * here, not asserted.**
 *
 * A dropped frame and a duplicated one both play smoothly, so the number that
 * says whether an animation animates is *how many of its frames differ*. It is
 * returned rather than checked, because what counts as enough differs by subject
 * — a spinner over a ten-frame set repeats by construction, a sliding window
 * should not repeat at all — and a threshold buried here would be a rule with
 * one caller pretending to be a law.
 */
async function fromAnsi(name, frames, delayMs) {
  const pages = await Promise.all(frames.map((ansi) => pngFromSvg(ansiToSvg(ansi), DENSITY)));
  const box = await gifFrom(pages, frames.map(() => delayMs), join(ANIMATION_DIR, `${name}.gif`));
  writeFileSync(join(ANIMATION_DIR, `${name}.txt`), `${frames[0]}\n`);
  // **The cited pair lands in the tracked directory too**, from the same pages,
  // so the committed file and the catalogue's cannot drift apart.
  if (CITED.has(name)) await gifFrom(pages, frames.map(() => delayMs), join(MEDIA_DIR, `${name}.gif`));
  return { name, ...box, delayMs, distinct: new Set(frames).size, arm: "terminal" };
}

/**
 * The same, for the SVG arm — **N documents rasterised, which is the asymmetry.**
 *
 * There is no `tick`, no capability set and no cache in this path. `plotToSvg`
 * takes the block and returns a document; the animation is entirely in the
 * caller handing it a different block each time.
 */
async function fromSvg(name, docs, delayMs) {
  const pages = await Promise.all(docs.map((svg) => pngFromSvg(svg, DENSITY)));
  const box = await gifFrom(pages, docs.map(() => delayMs), join(ANIMATION_DIR, `${name}.gif`));
  writeFileSync(join(ANIMATION_DIR, `${name}.svg`), `${docs[0]}\n`);
  return { name, ...box, delayMs, distinct: new Set(docs).size, arm: "svg" };
}

// --- the frame cost --------------------------------------------------------

/**
 * What an animating entry costs per tick, and what the row diff saves on it
 * (C22 I55, §6b).
 *
 * **Measured over the entry's own rows, and the boundary is stated.** The frame
 * the session writes also carries the header, the footer and the prompt, and
 * those are recomposed every frame whatever the transcript holds — including
 * them would put a fixed cost into a number about a moving one. So this counts
 * the rows the block occupies.
 *
 * **The diff's rule is a per-row string comparison** — `render-frame.ts`'s
 * `body()` skips a row when `row === held[i]` and otherwise writes
 * `cursorTo(i, 0)` + `SGR_RESET` + the row. Both sequences come from
 * `terminal/escapes.ts` here rather than being spelled out, so the overhead
 * counted is the overhead emitted.
 *
 * **A row that changes is not a row that *looks* changed.** A frame carrying
 * colour re-emits its SGR runs whether or not a glyph moved, so a picture that
 * appears static to a reader can still be a full rewrite — which is why the
 * table reports changed rows rather than an impression.
 */
function frameCost(frames) {
  const bytes = (s) => Buffer.byteLength(s, "utf8");
  const rows = frames.map((f) => f.split("\n"));
  const whole = [];
  const diffed = [];
  const changed = [];
  for (let i = 1; i < rows.length; i += 1) {
    const now = rows[i];
    const held = rows[i - 1];
    whole.push(now.reduce((n, r) => n + bytes(r) + 2, 0));
    let d = 0;
    let c = 0;
    for (let r = 0; r < now.length; r += 1) {
      if (now[r] === held[r]) continue;
      c += 1;
      d += bytes(`${cursorTo(r, 0)}${SGR_RESET}${now[r]}`);
    }
    diffed.push(d);
    changed.push({ changed: c, of: now.length });
  }
  const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
  return { whole: mean(whole), diffed: mean(diffed), changed, rows: rows[0].length };
}

/**
 * The two regimes, separately — **a mean over both describes neither.**
 *
 * The split is at `WINDOW`: before it the window is filling and the columns to
 * the left of the newest sample do not move; after it every column shifts.
 */
function byRegime(frames) {
  const filling = frameCost(frames.slice(0, WINDOW));
  const sliding = frameCost(frames.slice(WINDOW - 1));
  const frac = (c) => {
    const t = c.changed.reduce((a, x) => a + x.changed, 0);
    const n = c.changed.reduce((a, x) => a + x.of, 0);
    return n === 0 ? 0 : t / n;
  };
  return {
    rows: sliding.rows,
    filling: { ...filling, fraction: frac(filling) },
    sliding: { ...sliding, fraction: frac(sliding) },
  };
}

// --- the run ---------------------------------------------------------------

/**
 * **Cleared before writing**, for `clearGenerated`'s reason one directory over: a
 * generator that only ever writes cannot say what it did not write, and a
 * renamed subject leaves its GIF behind to be read as current.
 */
function clear(dir) {
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (/\.(gif|txt|svg|md)$/.test(f)) {
      rmSync(join(dir, f));
      removed += 1;
    }
  }
  return removed;
}

/**
 * Every subject's frames, as strings — **the unit the fixture asserts against.**
 *
 * Split out of the writer for the reason `status-proof.test.ts` demonstrates by
 * omission: its rows rebuild the frames from the generator's *intent* and check
 * those are distinct, which is a property of `renderSequenceToLines` and would
 * pass unchanged against a generator passing a constant tick. It did — the two
 * status GIFs it covered held `elapsedMs` and `retryInMs` frozen for every
 * frame, and sixteen green assertions said nothing. A probe rebuilt from intent
 * agrees with the intent.
 *
 * So the frames are returned rather than built inside the writer, and the test
 * asks *these* strings whether the counter moves. Pure and cheap — no
 * rasterising, no filesystem — which is what lets a test call it twice and
 * compare, and that comparison is the determinism the committed pair rests on.
 */
export function animationFrames() {
  const interval = spinnerIntervalMs();

  // --- 1 · a live line plot, both arms -------------------------------------
  const lineWindows = windows(WALK, PLOT_FRAMES);

  // --- 2 · a live heatmap, both arms ---------------------------------------
  const ringWindows = Array.from({ length: PLOT_FRAMES }, (_, i) =>
    RINGS.map((row) => row.slice(Math.max(0, i + 1 - WINDOW), i + 1)),
  );

  /**
   * **A refusal is a defect here and not a frame.** `svg-baseline.mjs` writes
   * `REFUSED` as its own frame because a form that stops drawing must show as a
   * diff; an *animation* of a refusal is nothing at all, so this throws rather
   * than assembling a GIF of blanks.
   */
  const svgOf = (block, what) => {
    const svg = plotToSvg(block, THEME);
    if (svg === null) throw new Error(`plotToSvg refused the ${what} block — the SVG arm has no frame`);
    return svg;
  };

  // --- 3 · the spinner, and the elapsed counter crossing one second --------
  //
  // **The crossing is the subject, not the number.** `elapsed` returns the empty
  // string below one second — *a fast load must not flash a counter* — so the
  // line goes from `loading` to `loading (1s)` to `loading (2s)`. That is a rung
  // rather than an increment, and it is the one thing a still frame of this
  // block cannot show.
  const LOADING_FRAMES = Math.ceil(3200 / interval);

  // --- 4 · retrying, the countdown falling and the attempt incrementing ----
  //
  // **Two backoffs, because one shows a number falling and two show the
  // mechanism.** `countdown` rounds rather than floors — *a number a reader is
  // waiting on should not sit at zero for a second before firing* — so the
  // handover is `1s → attempt 3` with no zero in between, which is the frame a
  // reader would otherwise report as a dropped one.
  //
  // **3600 rather than 2400, because two figures is not a countdown.** At 2400
  // the first backoff shows `2s` then `1s` and hands over — a fall of one step,
  // which reads as a rounding artefact rather than as a counter. Four steps is
  // the shortest run where a reader can see it counting.
  const FIRST_BACKOFF = 3600;
  const RETRY_FRAMES = Math.ceil(6400 / interval);

  // --- 5 · steps, before and after F227 ------------------------------------
  //
  // **The regression proof, and the *before* is reachable without a checkout.**
  // F227's whole subject is that `tick` never advanced, so every frame at tick 0
  // *is* what a session drew — measured at one distinct glyph across ten real
  // frames against the same block through the harness giving ten. Nothing is
  // reconstructed and nothing is drawn from a belief about old code: the same
  // renderer produces both, and only the counter differs.
  const setFrames = spinnerFrames(FULL).length;

  return {
    "line-cells": {
      arm: "terminal",
      delay: PLOT_DELAY,
      frames: lineWindows.map((v) => ansiFor(lineBlock(v), PLOT_WIDTH)),
    },
    "line-svg": {
      arm: "svg",
      delay: PLOT_DELAY,
      frames: lineWindows.map((v) => svgOf(lineBlock(v), "line")),
    },
    "ring-cells": {
      arm: "terminal",
      delay: PLOT_DELAY,
      frames: ringWindows.map((rows) => ansiFor(ringBlock(rows), PLOT_WIDTH)),
    },
    "ring-svg": {
      arm: "svg",
      delay: PLOT_DELAY,
      frames: ringWindows.map((rows) => svgOf(ringBlock(rows), "heatmap")),
    },
    loading: {
      arm: "terminal",
      delay: interval,
      frames: Array.from({ length: LOADING_FRAMES }, (_, i) =>
        ansiFor(
          {
            kind: "status",
            id: "s",
            state: "loading",
            message: "fetching container stats",
            height: 7,
            elapsedMs: i * interval,
          },
          STATUS_WIDTH,
          i,
        ),
      ),
    },
    retrying: {
      arm: "terminal",
      delay: interval,
      frames: Array.from({ length: RETRY_FRAMES }, (_, i) => {
        const t = i * interval;
        const inFirst = t < FIRST_BACKOFF;
        return ansiFor(
          {
            kind: "status",
            id: "s",
            state: "retrying",
            message: "connection refused",
            height: 7,
            retryInMs: inFirst ? FIRST_BACKOFF - t : Math.max(0, FIRST_BACKOFF * 2 - (t - FIRST_BACKOFF)),
            attempt: inFirst ? 2 : 3,
          },
          STATUS_WIDTH,
          i,
        );
      }),
    },
    "steps-before": {
      arm: "terminal",
      delay: interval,
      frames: Array.from({ length: setFrames }, () => ansiFor(STEPS, 34, 0)),
    },
    "steps-after": {
      arm: "terminal",
      delay: interval,
      frames: Array.from({ length: setFrames }, (_, tick) => ansiFor(STEPS, 34, tick)),
    },
    // **Every set the catalogue names, turning at once** (C24 §6). One frame per
    // tick for every set — `activityLine` indexes by `tick % frames.length` — at
    // the C03 tick, so this is the cadence a session with several sets on screen
    // shows and not each set's own interval; the notes carry the intervals. Forty
    // ticks covers every set's cycle at least once (the longest is `decimal` at 10)
    // and the `distinct` column says whether the picture moved.
    "spinner-sets": {
      arm: "terminal",
      delay: 100,
      frames: Array.from({ length: 40 }, (_, tick) => ansiFor(spinnerGallery(), 78, tick)),
    },
  };
}

/** The `/spinners` gallery's shape, built here so the GIF needs no session (C24 §6). */
function spinnerGallery() {
  const names = spinnerSetNames();
  const per = Math.ceil(names.length / 3);
  // `⠋ loading` whatever the message says, so the name sits beside the cell.
  const cell = (name) => ({
    kind: "group",
    id: `sp-row-${name}`,
    direction: "row",
    flex: [{ cells: 9 }, 1],
    children: [
      { kind: "status", id: `sp-${name}`, state: "loading", message: name, height: 1, spinner: name },
      { kind: "notice", id: `sp-name-${name}`, tone: "muted", text: name },
    ],
  });
  return {
    kind: "group",
    id: "spinner-sets",
    direction: "row",
    children: Array.from({ length: 3 }, (_, c) => ({
      kind: "group",
      id: `spinner-sets-${String(c)}`,
      direction: "column",
      children: names.slice(c * per, (c + 1) * per).map(cell),
    })),
  };
}

/**
 * The bar-style sheet: every style at four fills, on three capability arms —
 * full, `unicode: "ascii"`, and `ambiguousWidth: "wide"` (where every narrow-only
 * style falls to ASCII and `braille`, being Neutral, does not). One ANSI text,
 * captioned per arm, so one PNG shows the ladder rather than three files a
 * reader has to hold side by side (C09 §4, CALCIUM_BARS.md §Degradation).
 */
export function barSheetArms() {
  const names = barStyleNames();
  const arms = [
    ["full · colourDepth 24 · unicode full · ambiguousWidth narrow", FULL],
    ["unicode: ascii — every style is # and .", { ...FULL, unicode: "ascii" }],
    ["ambiguousWidth: wide — narrow-only styles fall to ASCII; braille stays", { ...FULL, ambiguousWidth: "wide" }],
  ];
  const per = Math.ceil(names.length / 3);
  const cell = (name) => ({
    kind: "group",
    id: `bar-style-${name}`,
    direction: "column",
    gapBefore: true,
    children: [0, 33, 66, 100].map((n) => ({ kind: "progress", id: `bar-${name}-${String(n)}`, label: name, current: n, total: 100, style: name })),
  });
  const grid = {
    kind: "group",
    id: "bar-styles",
    direction: "row",
    children: Array.from({ length: 3 }, (_, c) => ({
      kind: "group",
      id: `bar-styles-${String(c)}`,
      direction: "column",
      children: names.slice(c * per, (c + 1) * per).map(cell),
    })),
  };
  return arms
    .map(([label, caps]) =>
      renderSequenceToLines(
        registry,
        [{ kind: "notice", id: `arm-${label}`, tone: "info", text: label }, grid],
        96,
        { theme: THEME, capabilities: caps, tick: 0 },
      ).join("\n"),
    );
}

/** The three arms as one ANSI text, a blank row between them. */
export function barSheetAnsi() {
  return barSheetArms().join("\n\n");
}

export async function writeBarSheet(dir = MEDIA_DIR) {
  const ansi = barSheetAnsi();
  const png = await pngFromSvg(ansiToSvg(ansi), DENSITY);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, BAR_SHEET), png);
  return { file: join(dir, BAR_SHEET), bytes: png.length, rows: ansi.split("\n").length };
}

/**
 * The subjects, in catalogue order — **derived from nothing and stated once.**
 *
 * A literal rather than `Object.keys(animationFrames())`, so the fixture's
 * coverage check compares two independent records: a subject dropped from the
 * builder fails against this list instead of quietly shrinking the set the test
 * ranges over. A coverage set taken from the thing under test covers nothing.
 */
export const SUBJECT_NAMES = Object.freeze([
  "line-cells",
  "line-svg",
  "ring-cells",
  "ring-svg",
  "loading",
  "retrying",
  "steps-before",
  "steps-after",
  "spinner-sets",
]);

export async function writeAnimationProof(dir = ANIMATION_DIR) {
  mkdirSync(dir, { recursive: true });
  const stale = clear(dir);
  const built = animationFrames();
  const made = [];
  for (const name of SUBJECT_NAMES) {
    const s = built[name];
    made.push(
      s.arm === "svg"
        ? await fromSvg(name, s.frames, s.delay)
        : await fromAnsi(name, s.frames, s.delay),
    );
  }

  const cost = { line: byRegime(built["line-cells"].frames), ring: byRegime(built["ring-cells"].frames) };
  writeFileSync(join(dir, "README.md"), readme(made, cost));
  return { made, cost, stale };
}

// --- the record ------------------------------------------------------------

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;

function sizeOf(name) {
  return statSync(join(ANIMATION_DIR, `${name}.gif`)).size;
}

function costRow(label, c) {
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  return (
    `| ${label} | ${String(c.rows)} | ${pct(c.filling.fraction)} | ${String(c.filling.whole)} | ${String(c.filling.diffed)} | ` +
    `${pct(c.sliding.fraction)} | ${String(c.sliding.whole)} | ${String(c.sliding.diffed)} |`
  );
}

function readme(made, cost) {
  const row = (m) =>
    `| \`${m.name}.gif\` | ${m.arm} | ${String(m.pages)} | ${String(m.delayMs)} ms | ` +
    `${String(m.distinct)} | ${String(m.width)}×${String(m.height)} | ${kb(sizeOf(m.name))} |`;
  return `# The animation catalogue

Generated by \`tools/animation-proof.mjs\`. **Do not edit — it is rewritten on every run**,
and every figure below is measured during that run rather than transcribed.

> **Read them.** A GIF is the one artefact where *looks fine* and *is correct* diverge: a
> dropped frame plays smoothly, a duplicated frame plays smoothly, and a frozen counter
> beside a turning spinner plays smoothly and is exactly the failure F227 named. The
> \`distinct\` column is the number that says an animation animates; the frames themselves are
> asserted in \`test/unit/animation-proof.test.ts\`.

## What is here

| file | arm | frames | delay | distinct | pixels | bytes |
|---|---|---|---|---|---|---|
${made.map(row).join("\n")}

## The two arms are not one mechanism

**The terminal arm animates through \`tick\` and the render cache.** C22 I60 puts a tick axis
in the line cache, per kind; C22 I60a arms the ticker from what the frame actually drew, so a
spinner scrolled off the screen stops the timer; and C03's 100 ms window is a floor under the
set's own ${String(spinnerIntervalMs())} ms.

**The SVG arm has no ladder, no tick and no cache.** \`plotToSvg\` is \`(Plot, theme) → string\`
— one block in, one document out — so its GIF is N documents rasterised and assembled. That is
a *different pipeline producing a comparable artefact*, and a reader shown the pair without
this paragraph takes it as evidence of a shared mechanism that does not exist.

**Neither arm animates.** Both are pure functions of a block; the animation lives in L4, which
composes a frame per tick. That is why the ruling is **re-emit per frame, never SMIL**: time
inside the document would mean the renderer takes a sequence instead of a block — a different
seam — and **a document whose appearance changes without its block changing is invisible to
every gate in this repository**, all of which compare bytes.

**A plot animates because its data changes; a spinner because \`tick\` does.** The two plot
subjects rebuild their block every frame. The three status subjects rebuild only the context,
and their numbers — \`elapsedMs\`, \`retryInMs\`, \`attempt\` — are *fields written by L4*, never
derived from \`tick\` (C09 I32). The harness supplies what the driver would, which is what makes
\`1s → 2s\` match a real session's rather than drifting with the frame index.

## What each one is for

- **\`line-*\`** — a bounded random walk over a 60-sample window, seeded, 10 fps for 10 s. The
  window fills for the first ${String(WINDOW)} frames and slides for the rest, which is two cost regimes
  and the reason the table below has two halves.
- **\`ring-*\`** — the monitor's per-core ring: ${String(CORES)} independent histories over \`[0, 1]\` with an
  \`inferno\` colormap. **The case with the most cells changing** — a heatmap spends its \`[0, 1]\`
  on a colour rather than a position, so every cell repaints on every slide.
- **\`loading\`** — the elapsed counter **crossing one second**. \`elapsed\` returns nothing below
  1000 ms, so the line goes \`loading\` → \`loading (1s)\` → \`loading (2s)\`: a rung rather than an
  increment, and the one thing a still frame of this block cannot show.
- **\`retrying\`** — the countdown falling and the attempt incrementing, across two backoffs.
  \`countdown\` rounds rather than floors, so the handover reads \`1s\` → \`attempt 3\` with no zero
  between them. That is deliberate and not a dropped frame.
- **\`steps-before\` / \`steps-after\`** — F227's regression proof. *Before* is every frame at
  tick 0, which is what a real session drew for the life of the project, measured at one
  distinct glyph across ten frames. Nothing is reconstructed: the same renderer draws both and
  only the counter differs.

## What a frame costs, and what the row diff saves

Measured over the entry's own rows during this run. The frame a session writes also carries
header, footer and prompt — recomposed every frame whatever the transcript holds — so
including them would put a fixed cost inside a number about a moving one.

The diff's rule is \`render-frame.ts\`'s: skip a row when it equals the row already on screen,
otherwise write \`cursorTo(i, 0)\` + \`SGR_RESET\` + the row. Both sequences are imported from
\`terminal/escapes.ts\`, so the overhead counted is the overhead emitted.

| subject | rows | filling: rows changed | whole | diffed | sliding: rows changed | whole | diffed |
|---|---|---|---|---|---|---|---|
${costRow("line", cost.line)}
${costRow("ring", cost.ring)}

Bytes are means per frame, in bytes.

**The heatmap is the worst case and it is the monitor's real load** — and the measurement moved
the reason. The expectation was that filling is the cheap regime and sliding the dear one. It is
not: the changed-row fraction is *flat* across the boundary in both subjects, because a growing
window rescales the abscissa exactly as a sliding one shifts it. Every sample moves either way.

**What the row diff actually saves is the rows the figure does not occupy, and nothing else.** A
heatmap's cells fill eight of its ten rows, so the diff skips two and pays ten bytes of
addressing for each of the eight it keeps — a net saving of about 1.5%, which is *an animating
entry misses the cache on every tick and the row diff saves nothing when every row changes*,
arriving through the figure's shape rather than through the window's. A line's curve touches
about half of its fifteen rows and the diff halves the frame.

So the rule to carry is **the saving is set by the figure's aspect, not by the animation's
phase** — a tall sparse plot diffs well and a dense one does not, at any tick.
`;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { made, cost, stale } = await writeAnimationProof();
  const sheet = await writeBarSheet();
  console.log(`${BAR_SHEET.padEnd(14)} still     ${String(sheet.rows).padStart(4)} rows    ${String(Math.round(sheet.bytes / 1024))} KB`);
  for (const m of made) {
    console.log(
      `${m.name.padEnd(14)} ${m.arm.padEnd(9)} ${String(m.pages).padStart(4)} frames  ` +
        `${String(m.distinct).padStart(4)} distinct  ${String(m.delayMs).padStart(4)} ms  ` +
        `${m.width}×${m.height}  ${kb(sizeOf(m.name)).padStart(10)}`,
    );
  }
  for (const [k, c] of Object.entries(cost)) {
    console.log(
      `\n${k}: ${String(c.rows)} rows\n` +
        `  filling  ${(c.filling.fraction * 100).toFixed(0)}% of rows change  ` +
        `${String(c.filling.whole)} B whole  ${String(c.filling.diffed)} B diffed\n` +
        `  sliding  ${(c.sliding.fraction * 100).toFixed(0)}% of rows change  ` +
        `${String(c.sliding.whole)} B whole  ${String(c.sliding.diffed)} B diffed`,
    );
  }
  console.log(`\nanimation proof — ${ANIMATION_DIR} (${String(stale)} stale cleared first)`);
}
