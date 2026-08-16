/**
 * The landing dashboard (S1). Every ruling here is DASHBOARD_WALK.md's.
 *
 * **Behind `/dashboard` rather than on launch, and that is deliberate.** S1's
 * claim is *live block on launch, frozen into the transcript by the first
 * command*, and Calcium has no seam for a first entry at all — FINDINGS F9. The
 * body is built here first so the seam can be designed against a dashboard that
 * works rather than against S02's drawing, which is F4's lesson pointed at the
 * most expensive place to be wrong.
 *
 * **It polls; it does not stream.** `docker stats --format json` interleaves
 * cursor control with the JSON and redraws a region — consuming it would put a
 * terminal emulator on the far-side boundary (F10). `b.live`'s `fetch` arm on an
 * interval, against `--no-stream`.
 *
 * **The fetch runs docker directly, with no adapter and no transport.** That is
 * what `LiveSpec` is: `fetch` returns data and `render` returns a block, and
 * there is no seam between them for C06 or C07 to occupy. Worth noticing rather
 * than working around — a live part is the one route in the framework where the
 * app talks to the far side itself.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import { bannerRow } from "./banner.ts";
import type { LocalDocument, Block, ColumnDef, Glyph, TableRow, Tone, ViewDocument } from "@fmx/calcium";
import { parseNdjson, str } from "./ndjson.ts";
import type { Row } from "./ndjson.ts";
import { stateOf } from "./ps.ts";
import { capFor, createRingSet } from "./history.ts";

import type { LocalContext, ProducerContext } from "@fmx/calcium";
const run = promisify(execFile);

/** How often the panel re-reads. */
export const EVERY_MS = 2000;

/** Walk A7 — five rows, then a count of what is not shown. */
export const SHOWN = 5;

// ── The far side ────────────────────────────────────────────────────────────

/**
 * One tick's data: both calls, in parallel.
 *
 * **Not atomic, and walk A3 is about the gap.** A container can start or stop
 * between them, so the two lists disagree — which is a fact about docker, not a
 * race to be closed. The join rules below decide who wins, per direction.
 */
export type Snapshot = Readonly<{ containers: Row[]; stats: Row[]; skipped: number }>;

export async function fetchSnapshot(): Promise<Snapshot> {
  const [ps, stats] = await Promise.all([
    run("docker", ["ps", "-a", "--format", "json"], { maxBuffer: 8 << 20 }),
    run("docker", ["stats", "--no-stream", "--format", "json"], { maxBuffer: 8 << 20 }),
  ]);
  const a = parseNdjson(ps.stdout);
  const c = parseNdjson(stats.stdout);
  return { containers: a.rows, stats: c.rows, skipped: a.skipped + c.skipped };
}

// ── The join ────────────────────────────────────────────────────────────────

/** A container, with its measurements if it had any this tick. */
export type Joined = Readonly<{
  id: string;
  name: string;
  state: string;
  status: string;
  cpu: number | null;
  memPerc: number | null;
  memText: string;
}>;

/**
 * `"12.34%"` → `12.34`, and anything else → `null`.
 *
 * **`null`, never `0`** (walk A3). Absent and zero are different, and only one of
 * them is a fact about the container — the sentence the stopped-container probe
 * produced, arriving here as arithmetic.
 *
 * **Not clamped to 100** (walk A4). `CPUPerc` is per-core-normalised, so `780%`
 * is an ordinary reading on an eight-core host; a scale that stops at 100 renders
 * a busy container identically to a saturated one.
 */
export const percent = (raw: string): number | null => {
  const m = /^([0-9]+(?:\.[0-9]+)?)%$/.exec(raw.trim());
  return m === null ? null : Number(m[1]);
};

/**
 * Walk A2 and A3 — `ps -a` decides membership, `stats` contributes measurements.
 *
 * The reverse assignment is the tempting one, because `stats` is the thing that
 * ticks. It is wrong: `stats` cannot see a stopped container at all, so a panel
 * built from it would lose every row the moment the container it describes
 * stopped, rather than showing it as stopped.
 *
 * **Sorted by name** (walk A8). Five consecutive probes returned `docker ps`
 * order and nothing documents that. A static table that reorders is a curiosity;
 * a *live* one moves a row out from under a reader mid-glance, and the fault
 * would be invisible in every test because the observed order is stable.
 */
export function join(snap: Snapshot): Joined[] {
  const byId = new Map(snap.stats.map((s) => [str(s, "Container"), s] as const));
  return snap.containers
    .map((c): Joined => {
      const id = str(c, "ID");
      // `ps` reports a short id and `stats` a long one — matched by prefix, in
      // that direction only, because a short id is a prefix of exactly one long.
      const measured =
        byId.get(id) ?? snap.stats.find((s) => str(s, "Container").startsWith(id));
      return {
        id,
        name: str(c, "Names").split(",")[0] ?? "",
        state: str(c, "State"),
        status: str(c, "Status"),
        cpu: measured === undefined ? null : percent(str(measured, "CPUPerc")),
        memPerc: measured === undefined ? null : percent(str(measured, "MemPerc")),
        memText: measured === undefined ? "" : str(measured, "MemUsage"),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * Walk A1 — the panel's membership is *not-stopped*, not *running*.
 *
 * `docker stats --no-stream` returns what `docker ps` returns, which **includes
 * paused**. The first probe ran on a machine with nothing paused and "running
 * only" was a perfectly good reading of it; the moment there was a paused
 * container the panel headed `RUNNING` had one in it. See F10.
 */
export const LIVE_STATES = new Set(["running", "paused", "restarting"]);
export const isLive = (c: Joined): boolean => LIVE_STATES.has(c.state);

// ── The rendering ───────────────────────────────────────────────────────────

/**
 * Walk C's fourth boundary: this cell holds a bar, a space and a percentage, and
 * the column has to be wide enough for all three.
 *
 * **The step-1 defect's exact shape, one component over.** There, walk B1 sized
 * `STATUS` from its text and walk C2 put a glyph inside the same cell; the two
 * extra cells belonged to no row of the walk and every stopped container
 * truncated. So the width here is bar + separator + `100.0%` — six characters,
 * because walk A4 permits values over 100 — and the test asserts the **rendered**
 * cell rather than this arithmetic.
 */
const BAR_CELLS = 8;
/**
 * The glyph slot, **reserved whether or not a glyph is drawn**.
 *
 * C04 I6 requires a glyph on any `warn` or `error` cell, so a bar only carries
 * one once the container is busy — and a column that grows two cells the moment
 * load crosses 60% is a table that reflows because a container got hot. The
 * width is constant and the slot is sometimes blank.
 */
const GLYPH_SLOT = 2;
const CPU_WIDTH = GLYPH_SLOT + BAR_CELLS + 1 + 6;

/**
 * A bar, drawn from block glyphs rather than from a palette ramp.
 *
 * **Gap 3, absorbed rather than solved.** Load is a continuum and Calcium's
 * palette is tone slots, so the tone is chosen at thresholds — and the thresholds
 * are arbitrary. That is the finding: not that 60 and 85 are wrong numbers, but
 * that the app had to invent numbers at all to express a quantity.
 *
 * Overflows visibly past 100 rather than clamping (walk A4): the bar fills and
 * the number keeps counting, which is the honest rendering of a figure whose
 * ceiling is the core count and is not knowable here.
 */
/**
 * The bar's two alphabets, and **the choice is the app's because nothing else
 * can make it** (F43, F54).
 *
 * `█ ░ —` are block elements and an em-dash. Capability substitution covers the
 * glyphs C09 picks, **not text an adapter supplies** — so on a terminal
 * declaring `unicode: ascii` these pass through untouched and draw as garbage.
 * S12 measured it: at `LANG=C` the frame kept `░░░░░░░░` beside a plot that had
 * correctly become `.::-==++**##@@` and borders that had correctly become `+--+`.
 *
 * The framework was right about all of that and cannot help here: an adapter is
 * handed `AdapterContext`, which carries `width` and no capabilities, so the
 * flag is computed in `main.ts` from the environment and threaded in by hand.
 * That thread is the price of F43 and it is what makes F43 a finding rather
 * than a preference.
 */
/**
 * The separator, on the same axis as the alphabet.
 *
 * `·` is U+00B7 — not a block element, and not ASCII either. It was the fourth
 * character S12's frame scan found and the first the *list* of characters
 * missed, which is why the test asserts a codepoint range now: a coverage set
 * drawn from the defects already found covers exactly those.
 */
export const dot = (unicode: boolean): string => (unicode ? "·" : "-");

const ALPHABET = {
  full: { filled: "█", empty: "░", absent: "—" },
  ascii: { filled: "#", empty: ".", absent: "-" },
} as const;

export function bar(
  value: number | null,
  unicode = true,
): { text: string; tone: Tone; glyph?: Glyph } {
  const mark = unicode ? ALPHABET.full : ALPHABET.ascii;
  if (value === null) return { text: mark.absent.padEnd(CPU_WIDTH - GLYPH_SLOT), tone: "muted" };
  const filled = Math.min(BAR_CELLS, Math.round((value / 100) * BAR_CELLS));
  const glyphs = mark.filled.repeat(filled) + mark.empty.repeat(BAR_CELLS - filled);
  const text = `${glyphs} ${value.toFixed(1)}%`.padEnd(CPU_WIDTH - GLYPH_SLOT);

  // **A toned cell must carry a glyph, and finding that out cost nothing only
  // because a test constructed a busy container.**
  //
  // C04 I6: `warn` and `error` require a non-empty glyph, because colour alone
  // survives neither 1-bit nor a colour-blind reader. `block()` throws without
  // one — and the throw lands inside C23's `appendAndCommit`, which catches it,
  // discards it and commits the frame anyway. So **every container above 60%
  // CPU would have produced no entry at all**, silently, on exactly the machine
  // someone opens a dashboard to look at. This machine is idle, so no frame
  // could ever have shown it.
  //
  // This is gap 3 arriving concretely. The app wants colour to encode a
  // *quantity* and Calcium's tones encode *severity* — which is a coherent
  // design, and it means a value-coloured bar has to borrow severity marks it
  // does not quite mean. `▲` at 60% is an overstatement; it is also the only
  // vocabulary there is.
  // **`warn` at both levels, and the frame is why.** The first version used the
  // `error` glyph above 85 and rendered `✗ ████████ 101.2%` — which reads as a
  // container that has *failed*, when the truth is that it is working as hard as
  // it can. The vocabulary is severity all the way down (`ok` `warn` `error`
  // `pending` `working` `cancelled` …) and has no mark for *hot*, so the
  // quantity has to borrow the nearest severity and `▲` is as close as it gets.
  //
  // The tone still carries two levels, so amber and red separate the bands
  // without the mark claiming a failure that has not happened.
  if (value >= 85) return { text, tone: "error", glyph: "warn" };
  if (value >= 60) return { text, tone: "warn", glyph: "warn" };
  return { text, tone: "ok" };
}

/** The longest container name seen on this machine, and the glyph beside it. */
const NAME_CELLS = 22;
const GLYPH_CELLS = 2;

export const COLUMNS: readonly ColumnDef[] = [
  // **24 = the name plus the glyph, and this is step 1's defect made twice.**
  //
  // It was `minWidth: 14, maxWidth: 24`, and the frame showed
  // `● reverent_pr…` — the state mark riding inside the same cell that walk A
  // sized from the *name*, which is precisely the `STATUS` failure `/ps` shipped
  // with. The walk has a whole section for this class (§C) and it still happened,
  // because §C's table listed four boundaries and named the CPU cell as the one
  // where a glyph meets a width. The NAME cell was not on the list.
  //
  // **And `maxWidth` was doing nothing.** `planColumns` distributes residual
  // width to flex columns only and otherwise leaves it unused — a stated
  // decision, not an omission — so a column that does not flex renders at
  // exactly `minWidth`, and `maxWidth` caps a growth that never happens. Two
  // wrong beliefs, one frame: the glyph was uncounted *and* the cap was inert.
  b.col("name", { label: "NAME", priority: 95, minWidth: NAME_CELLS + GLYPH_CELLS }),
  b.col("cpu", { label: "CPU", priority: 80, minWidth: CPU_WIDTH }),
  b.col("mem", { label: "MEM", priority: 70, minWidth: CPU_WIDTH }),
  // Verbatim, and last to be admitted: `9.34MiB / 7.75GiB` is used and limit in
  // one string with unequal units, and converting it to bytes is the parser R01
  // commitment 5 forbids — one field over from `Ports`, and the place a unit
  // converter is wrong quietly.
  //
  // **No `flex`, and this is step 1's defect with the columns swapped.** There,
  // NAME flexed and ate the width PORTS needed. Here USAGE flexed and took 60
  // columns to hold an 18-character string, while NAME — capped at 24 — was
  // given its *minimum* of 14 and rendered `reverent_pr…` beside a field of
  // whitespace. The rule step 1 produced was "the slack belongs to the column
  // whose content is long"; the case it did not cover is **no column's content
  // is long**, and then nothing should flex at all. Read off the frame again,
  // because every width assertion passed again.
  b.col("usage", { label: "USAGE", priority: 40, minWidth: 18 }),
];

/**
 * The tone a load takes, and **it stays here on purpose** (C04 I50c, C12 §3b).
 *
 * `Cell.bar` draws the run and this decides what the colour means. A framework
 * that shipped thresholds would ship arbitrary numbers for everyone, and gap 3's
 * own statement is that the app should not have to *invent numbers to express a
 * quantity* — not that 60 and 85 are wrong. So the drawing moved and the numbers
 * did not.
 *
 * **`warn` at both levels, and the frame is why.** The first version used the
 * `error` glyph above 85 and rendered `✗ ████████ 101.2%`, which reads as a
 * container that has *failed* when the truth is that it is working as hard as it
 * can. The tone still carries two levels, so amber and red separate the bands
 * without the mark claiming a failure that has not happened.
 *
 * C04 I6 obliges a glyph on `warn` and `error`, and the throw lands inside C23's
 * `appendAndCommit`, which catches and commits anyway — so a missing glyph here
 * is every busy container producing no entry at all, silently.
 */
const BUSY = 60;
const HOT = 85;

function loadTone(value: number | null): { tone: Tone; glyph?: Glyph } {
  if (value === null) return { tone: "muted" };
  if (value >= HOT) return { tone: "error", glyph: "warn" };
  if (value >= BUSY) return { tone: "warn", glyph: "warn" };
  return { tone: "default" };
}

function rowOf(c: Joined, unicode: boolean): TableRow {
  const { glyph, tone } = stateOf(c.state);
  const absent = unicode ? ALPHABET.full.absent : ALPHABET.ascii.absent;
  return b.row(c.id, {
    name: { text: c.name, glyph, tone },
    // **`Cell.bar` draws it now** (C04 I50c). Nine lines of hand-drawn run,
    // `unicode` threaded from `main.ts` because an adapter has no capabilities
    // (F43), and a `padEnd` to a width the column already plans — all of it the
    // framework's, and the app keeps the one decision it is entitled to make.
    // `text: ""` because a cell's `text` is required and a bar's value is its
    // quantity — the same shape a `spark` cell has, and the same small friction.
    cpu: { text: "", bar: { value: c.cpu, max: 100, format: "percent" }, ...loadTone(c.cpu) },
    mem: { text: "", bar: { value: c.memPerc, max: 100, format: "percent" }, ...loadTone(c.memPerc) },
    usage: c.memText === "" ? { text: absent, tone: "muted" } : { text: c.memText },
  });
}

/**
 * The live panel's body: the table, plus the collapsed tail.
 *
 * **Walk A7's boundary is `N = 1`.** `… 1 more running` costs exactly the line it
 * saves, so the rule is *collapse when it saves at least two lines*, not
 * *collapse when there are more than five*. Two correct statements — show five,
 * say how many are hidden — whose overlap at the boundary is a line that buys
 * nothing.
 */
export function livePanelBody(live: readonly Joined[], unicode = true): Block {
  // **Selection and display order are different jobs, and conflating them hid
  // the wrong containers.**
  //
  // Walk A8 sorts by name so a live block does not move rows under a reader.
  // Walk A7 shows the first five. Both correct; the cell where they meet is
  // *which* five, and neither row owns it — so the frame showed `dtui-api`
  // through `dtui-extra2` and collapsed the rest, including the busiest
  // container on the machine. A dashboard that hides by alphabet is showing an
  // arbitrary five and looking authoritative about it.
  //
  // So: choose by significance, display by name. The chosen set is stable
  // because CPU is stable-ish and the tie-break is the name; the *order* within
  // it never depends on the measurements at all.
  const collapse = live.length > SHOWN + 1;
  const chosen = collapse
    ? [...live].sort((x, y) => (y.cpu ?? -1) - (x.cpu ?? -1) || x.name.localeCompare(y.name)).slice(0, SHOWN)
    : live;
  const shown = [...chosen].sort((x, y) => x.name.localeCompare(y.name));
  const hidden = live.length - shown.length;

  return b.group("column", [
    // **The summary is in the body because the title cannot hold it** (F16).
    //
    // It was in the title, where S1 draws it and where it obviously belongs. The
    // driver re-renders only the part's *child*: `titleOf` returns the string
    // captured at declaration, plus the framework's own staleness suffix. So the
    // counts and totals froze at the first fetch and stayed there while every row
    // beneath them ticked — a panel whose header describes a moment that has
    // passed, which is worse than no header at all.
    //
    // Invisible in a single frame, and invisible in the tests: it was found by
    // replaying prefixes of one capture and noticing the one line that never
    // moved.
    b.notice("muted", summaryLine(live, unicode)),
    b.table({
      // **Not `running`.** That is the live panel's id, and C04 I14 refuses a
      // document with two blocks sharing one — `ViewPatch` addresses by id, so a
      // duplicate has no correct target. The panel and the table it contains are
      // the easiest pair in the world to name the same thing.
      id: "running-rows",
      columns: COLUMNS,
      // **Not `shown.map(rowOf)`** — the point-free form silently handed the
      // array index in as `blocks`, so every row but the first would have drawn
      // its full alphabet on an ASCII terminal. TypeScript caught it; a
      // JavaScript port of this line would not have.
      rows: shown.map((c) => rowOf(c, unicode)),
      emptyMessage: `nothing running ${dot(unicode)} every container is stopped`,
    }),
    ...(hidden === 0 ? [] : [b.notice("muted", `… ${String(hidden)} more`)]),
  ]);
}

/**
 * Walk A6 — two totals that are not the same kind of number.
 *
 * `MemPerc` is a fraction of host memory and sums to something meaningful.
 * `CPUPerc` is per-core-normalised and does not: the sum has no ceiling, so it
 * is shown **past 100** and labelled as a sum by being allowed to. A figure
 * rendered as `34%` beside a real percentage would be read as a utilisation, and
 * docker cannot supply one.
 */
export function totals(live: readonly Joined[]): { cpu: string; mem: string } {
  const sum = (pick: (c: Joined) => number | null): number =>
    live.reduce((acc, c) => acc + (pick(c) ?? 0), 0);
  return {
    cpu: `${sum((c) => c.cpu).toFixed(0)}%`,
    mem: `${sum((c) => c.memPerc).toFixed(0)}%`,
  };
}

/**
 * The counts and the totals, recomputed every tick.
 *
 * Separate counts for running and paused, because one number over a mixed set is
 * the kind of summary that is never wrong enough to notice (walk A1) — and
 * `stats` includes paused containers, so a panel headed `RUNNING (5)` would be
 * describing five containers of which one is not running.
 */
export function summaryLine(live: readonly Joined[], unicode = true): string {
  const running = live.filter((c) => c.state === "running").length;
  const paused = live.length - running;
  const counts =
    paused === 0
      ? `${String(running)} running`
      : `${String(running)} running ${dot(unicode)} ${String(paused)} paused`;
  const t = totals(live);
  return `${counts}   CPU ${t.cpu} ${dot(unicode)} MEM ${t.mem}`;
}

/**
 * The live panel's title — **static, and it has to be** (F16).
 *
 * Everything that varies moved to `summaryLine`. What is left is a label and the
 * room C23 needs: the driver appends `· 14s ago` when the part goes stale and
 * `· unavailable` when it fails (C23 I34, I35), onto a title this app cannot see
 * the rendered length of. Short is the only way to guarantee the suffix fits.
 */
export const LIVE_TITLE = "RUNNING";

// ── The document ────────────────────────────────────────────────────────────

/**
 * Walk A9 — a panel that vanishes reads as a failure to fetch, and this is the
 * one case where the fetch succeeded perfectly. So zero running renders the
 * panel with its empty message, never no panel.
 */
export function dashboard(
  snap: Snapshot,
  width: number,
  engine: string,
  unicode = true,
): readonly Block[] {
  const all = join(snap);
  const live = all.filter(isLive);
  const stopped = all.filter((c) => !isLive(c));

  /**
   * **The history the panel does not keep** — gap 1, on the surface that sees
   * every container rather than the one that sees a single one.
   *
   * Built **inside this call** for `container.ts`'s reason (walk A1): at module
   * scope the buffer outlives the view, and a second `/dashboard` would inherit
   * the first's history as its own — silently, with every assertion passing.
   *
   * Fed from `render`, which is the only place a tick is observable. `fetch`
   * returns data and `render` turns it into a block; there is no seam between
   * them, so the fold lives in the one that runs per tick.
   */
  const rings = createRingSet(capFor(width));
  const takeTick = (s: Snapshot): void => {
    // **Every joined container, not every measured one.** `stats` cannot see a
    // stopped container at all, so keying off it would drop a row the moment its
    // container stopped — walk A3's ruling, and the reason a row of absences is
    // the honest picture rather than a missing row (C12 §6a B1).
    rings.tick(new Map(join(s).map((c) => [c.id, c.cpu] as const)));
  };
  takeTick(snap);

  /**
   * **The banner is chrome and is chosen here**, at document-build time, from a
   * width the app had to read itself and a capability the app had to decide
   * itself (F14, F43).
   *
   * It is above the panel rather than inside it: inside, its 103 cells would
   * set the panel's minimum width and a narrow terminal would get a bordered
   * box sized for art it is not showing.
   */
  // **A row container, since the framework has one** (C04 I44, roadmap 38).
  // `bannerRow` declares the whale's cells and lets the wordmark take what is
  // left; `banner` is the hand-composition it replaces, kept in the module
  // because the golden in `DOCKER_TUI_BANNER.md` is asserted against both — one
  // as the source of the art, the other as the frame the container must draw.
  const art = bannerRow(width, unicode);

  return [
    ...(art === null ? [] : [art]),
    b.panel(
      `docker-tui ${dot(unicode)} engine ${engine} ${dot(unicode)} ${String(all.length)} containers`,
      [
      b.live({
        id: "running",
        title: LIVE_TITLE,
        every: EVERY_MS,
        fetch: fetchSnapshot,
        render: (data) => {
          const s = data as Snapshot;
          // **The side effect is here and it is deliberate.** A tick is only
          // observable at the moment the part re-renders, so the accumulation
          // hangs off the one function that runs per tick — the same shape
          // `cpuFold` has, and the same reason: one shared `fetch` between two
          // parts would stop the ring silently.
          takeTick(s);
          return livePanelBody(join(s).filter(isLive), unicode);
        },
        // **Without this the first frame says `loading…` for two seconds**, and
        // the handler is holding a snapshot the whole time. `b.live` returns its
        // loading state — that is the documented shape, and C23 has no
        // `renderLoading` of its own precisely because the block exists before
        // the driver runs — so a part whose data is already in hand must say so
        // or the opening shot of the application is a placeholder.
        //
        // It also makes the panel honest across the gap: the driver's first tick
        // is one interval away, so between them the only truthful thing to show
        // is the data the document was built from.
        renderLoading: () => livePanelBody(live, unicode),
      }),
      b.pills(
        stopped.map((c) => ({ label: c.name, tone: "muted" as Tone })),
        { gapBefore: true },
      ),
      ...(snap.skipped === 0
        ? []
        : [b.notice.warn(`${String(snap.skipped)} unreadable line${snap.skipped === 1 ? "" : "s"}`)]),
    ]),
  ];
}

/**
 * The handler.
 *
 * **`meta` is written out by hand, all nine fields.** `compose` fills them and is
 * not exported (FINDINGS F13); seven of the nine describe a subprocess that never
 * ran, so they are ceremony rather than provenance on this route — and the
 * framework overwrites only `command`.
 */
/**
 * The dashboard's blocks, from a producer context — **the unit both callers
 * share** (C22 I53, C07 §3).
 *
 * It exists because the obligation made the old shape impossible to write. The
 * greeting used to call the *local handler* with `{ command: "" }` — an object
 * literal that is not a `LocalContext`, has no `ask`, and compiled (F125). Once
 * the handler named its type that stopped compiling, and the greeting is handed
 * a `ProducerContext`, which has no `ask` and should not: it is a producer, not
 * a route that can ask a question.
 *
 * So the shared thing is named instead of one caller pretending to be the other.
 * Two callers, one producer, and neither wraps the other.
 */
export async function dashboardBlocks(
  ctx: ProducerContext,
  engine: string,
): Promise<readonly Block[]> {
  return dashboard(await fetchSnapshot(), ctx.width, engine, ctx.capabilities.unicode !== "ascii");
}

export function createDashboardHandler(
  engine: string,
): (argv: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  /**
   * **Two injected parameters gone, and both were findings** (F14, F43).
   *
   * `width` was `() => process.stdout.columns`, which is C01's job done a second
   * time and wrong across a resize because it was read once per command. It is
   * `ctx.width` now, handed down per call.
   *
   * `blocks` was the app deciding whether the terminal can draw `▄ ▀ █`, from
   * three environment variables where C02 reads seven — and it disagreed with
   * the framework on three of four locale shapes (F124). It is
   * `ctx.capabilities.unicode` now, which is the record C22 resolved, overrides
   * included.
   */
  return async (_argv, ctx) => ({
    schema: "tui.view/1",
    meta: { adapter: "dashboard" },
    command: ctx.command,
    status: "ok",
    blocks: await dashboardBlocks(ctx, engine),
  });
}
