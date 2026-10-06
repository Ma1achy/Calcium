/**
 * S3 — the live single-container view. Every ruling here is S3_WALK.md's.
 *
 * The demo's headline. It was a pushed view, and then an entry of three framed
 * live parts around a boxed plot; it is **one live part of five rows** now
 * (S3_WALK §6, the design's §085: *five rows, not a dashboard*), patched in
 * place on every tick.
 *
 * **The verb is `container stats <id>`, and the name is load-bearing twice.**
 * S02 drew it as `ps <uuid> --watch`, which cannot be spawned — `docker ps`
 * takes no positional, `--watch` is not a docker flag, and C06 I4 sends argv to
 * the far side verbatim. `docker container stats` is real and takes the id. And
 * it is a sub-verb rather than plain `stats` so that `/stats` stays free for S4,
 * which S02 reserves for a **transcript entry**: a tool-level `view` on `stats`
 * would have pushed S4 as well.
 *
 * **The part fetches docker itself.** That is what `LiveSpec` is — `fetch`
 * returns data, `render` returns a block, and there is no seam between them for
 * C06 or C07 to occupy. The verb's own result seeds the document; everything
 * after the first frame comes from these closures.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "calcium-tui";
import type { AdapterDocument, Adapter, Block, ColumnDef, ErrorLike } from "calcium-tui";
import { loadTone, percent } from "./dashboard.ts";
import { axisCaption, createRing, TICK_MS } from "./history.ts";
import type { Ring } from "./history.ts";
import { parseNdjson, str } from "./ndjson.ts";
import type { Row } from "./ndjson.ts";
import type { Runner } from "./mutation.ts";

const run = promisify(execFile);

/** The far side by default; the demo world stands in through the adapter's parameter. */
const realRunner: Runner = async (args) => await run("docker", [...args], { maxBuffer: 1 << 20 });

// ── The far side ────────────────────────────────────────────────────────────

/**
 * One container's measurements, straight from docker.
 *
 * `--no-stream` is docker's opt-out of a redraw loop; the shim supplies it for
 * this verb, and the parts supply it themselves because they are not going
 * through the shim at all.
 */
async function readStats(docker: Runner, id: string): Promise<Row | null> {
  const { stdout } = await docker(["container", "stats", "--no-stream", "--format", "json", id]);
  return parseNdjson(stdout).rows[0] ?? null;
}

/**
 * The things `stats` does not carry: image, state, ports, mounts.
 *
 * Read on every tick beside the measurements (S3_WALK §6 C5). It is the part's
 * rather than adapter output because an adapter is handed a result and cannot
 * make a second call, and these four fields are not in the one it was handed.
 */
async function readDetails(docker: Runner, id: string): Promise<Row | null> {
  const { stdout } = await docker(["ps", "-a", "--no-trunc", "--filter", `id=${id}`, "--format", "json"]);
  return parseNdjson(stdout).rows[0] ?? null;
}

// ── The blocks ──────────────────────────────────────────────────────────────

/** What one tick reads: the measurements, and the record `stats` does not carry. */
export type Reading = Readonly<{ stats: Row | null; details: Row | null }>;

/**
 * The tick's two reads, together (S3_WALK §6 C5).
 *
 * The details were a one-shot part of their own — a second frame — because an
 * adapter is handed one result and cannot make a second call. One live part
 * reads both, so the image and state row ticks with the measurements and a
 * container that stops says so on the tick that reports the miss (§3 B3).
 */
async function readBoth(docker: Runner, id: string): Promise<Reading> {
  const [stats, details] = await Promise.all([readStats(docker, id), readDetails(docker, id)]);
  return { stats, details };
}

/**
 * The cells a spark draws in, and therefore the ring's cap (S3_WALK §6 C1).
 *
 * **The ring holds what the row draws.** A `spark` cell is exactly its column's
 * width and shows the last that-many positions (C12 I13), so a ring sized from
 * the terminal — F24's `capFor` — held a hundred samples for a row showing
 * twenty-four. The column does not move with the terminal, which also retires
 * F24's hazard: there is no density for a resize to get wrong.
 */
export const SPARK_CELLS = 24;

const LABEL_CELLS = 6;

/**
 * Label, figure, value — **a headerless table, because the rows are a list of
 * named readings** and §086 puts a metric in a row as a sparkline in a table
 * cell. Only the value flexes: it holds the long strings (an image reference, a
 * ports list), and the other two are their declared widths.
 */
const COLUMNS: readonly ColumnDef[] = [
  b.col("label", { label: "", minWidth: LABEL_CELLS }),
  b.col("figure", { label: "", minWidth: SPARK_CELLS }),
  b.col("value", { label: "", flex: true }),
];

/** The window's lowest and highest reading, or `null` with none. */
function rangeOf(values: readonly (number | null)[]): readonly [number, number] | null {
  const readings = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return readings.length === 0 ? null : [Math.min(...readings), Math.max(...readings)];
}

/**
 * The CPU row's value: the reading, the window's range, and the caption.
 *
 * **The range is here because the sparkline cannot pin a floor** (S3_WALK §6
 * C2, F27). A sparkline normalises over its window (C12 sparkline §2), so a
 * container held at 100% wobbling by 0.2% draws a full-height line — the
 * mountain range `yMin: 0` was pinned against on the plot. The shape stays a
 * shape and the level is said in numbers beside it.
 *
 * **The caption rides in the same row** (S3_WALK §6 C3): a spark cell draws no
 * text, and the row is one block with its figure, which is walk B1's ruling held
 * by construction rather than by a group.
 */
export function cpuValue(ring: Ring, unicode = true): string {
  const dot = unicode ? "·" : "-";
  const dash = unicode ? "–" : "-";
  const absent = unicode ? "—" : "-";
  const latest = ring.values[ring.values.length - 1] ?? null;
  const range = rangeOf(ring.values);
  return [
    latest === null ? absent : `${latest.toFixed(1)}%`,
    ...(range === null ? [] : [`${range[0].toFixed(1)}${dash}${range[1].toFixed(1)}%`]),
    axisCaption(ring, unicode),
  ].join(` ${dot} `);
}

const label = (text: string) => ({ text, tone: "muted" as const });

/**
 * The five rows (S3_WALK §6, §085): cpu, mem, io, image, ports.
 *
 * `reading` is `null` while the part waits for its first tick — the verb's own
 * `stats` row seeds the measurements, and the record is said to be on its way
 * rather than absent, because it is not absent.
 *
 * **Absent is not zero, and not blank either** (walk A8): a row with no reading
 * draws the absent mark in its value, and a spark over a ring of gaps draws
 * nothing in its figure.
 */
export function statsBlock(ring: Ring, reading: Reading, unicode = true, loading = false): Block {
  const dot = unicode ? "·" : "-";
  const absent = unicode ? "—" : "-";
  const { stats, details } = reading;
  const latest = ring.values[ring.values.length - 1] ?? null;
  const memPerc = stats === null ? null : percent(str(stats, "MemPerc"));
  const join = (...parts: readonly string[]): string => parts.join(` ${dot} `);
  const or = (v: string): string => (v.trim() === "" ? absent : v);

  const rows = [
    b.row("cpu", {
      label: label("cpu"),
      // A copy, not the ring's own array — a series the next tick mutates under
      // the renderer is a block whose content changes after it was measured.
      figure: { text: "", spark: [...ring.values], ...loadTone(latest) },
      value: { text: cpuValue(ring, unicode), ...loadTone(latest) },
    }),
    b.row("mem", {
      label: label("mem"),
      // `MemUsage` verbatim, and the bar is the framework's (C04 I51): docker's
      // string carries two values with unequal units, and converting them is the
      // parser R01 commitment 5 forbids.
      figure: { text: "", bar: { value: memPerc, max: 100, format: "percent" as const } },
      value: { text: stats === null ? absent : or(str(stats, "MemUsage")) },
    }),
    b.row("io", {
      label: label("io"),
      figure: { text: "" },
      value: {
        text:
          stats === null
            ? "no measurements — the container is not running"
            : join(`net ${or(str(stats, "NetIO"))}`, `block ${or(str(stats, "BlockIO"))}`, `${or(str(stats, "PIDs"))} pids`),
        ...(stats === null ? { tone: "muted" as const } : {}),
      },
    }),
    b.row("image", {
      label: label("image"),
      figure: { text: "" },
      value: loading
        ? { text: unicode ? "reading the container's record…" : "reading the container's record", tone: "muted" }
        : details === null
          ? { text: "no details — the container has gone", tone: "muted" }
          : { text: join(or(str(details, "Image")), or(str(details, "Status") || str(details, "State"))) },
    }),
    b.row("ports", {
      label: label("ports"),
      figure: { text: "" },
      // `Ports` and `Mounts` are docker's strings and stay docker's strings (R01
      // commitment 5). Condensing `0.0.0.0:8080->80/tcp` would lose the bind
      // address, and `0.0.0.0` versus `127.0.0.1` is whether the port faces the
      // network. Only runs of whitespace are collapsed.
      value: {
        text:
          details === null
            ? absent
            : join(or(str(details, "Ports").trim().replace(/\s+/gu, " ")), `mounts ${or(str(details, "Mounts").trim())}`),
      },
    }),
  ];
  // No gap above: the rows open the part, as a call's body opens under its head.
  return b.table({ id: "stats-rows", columns: COLUMNS, rows, showHeader: false, gapBefore: false });
}

/**
 * The failure, drawn **under** the history rather than instead of it (§5, B5,
 * S3_WALK §6 C4).
 *
 * `renderError` replaces a part's whole child, so the framework's default would
 * wipe the sparkline and its caption together — and the caption is the one
 * thing built to report a stall. So the rows are drawn from the ring, with the
 * measurements absent, and the framework's own box goes beneath them (F406).
 */
export function statsErrorBlock(
  ring: Ring,
  err: ErrorLike,
  retryInMs: number | null,
  attempt: number,
  unicode = true,
): Block {
  return b.group(
    "column",
    [
      statsBlock(ring, { stats: null, details: null }, unicode),
      b.status(err, retryInMs, attempt, { id: "stats-error" }),
    ],
    { id: "stats-body" },
  );
}

/**
 * One tick of CPU, as the driver's **derivation** (C23 I47).
 *
 * > Per-part state is view state only. Anything that accumulates belongs in a
 * > derivation.
 *
 * **`began` first, `took` after** (walk A2): the attempt is counted before
 * anything can go wrong with reading it. **And the sample lands here, not in
 * `render`** (walk A3): a derivation runs once per source version and a
 * `render` once per part.
 *
 * **What the fold cannot see** (FINDINGS F137): a fold runs on a *version*, and
 * a version exists only when the fetch resolved — so a tick that failed at the
 * transport is not counted. A container that has stopped still resolves and
 * still reaches `took(null)`, which is the common miss and is unchanged; `docker`
 * itself failing is drawn by the error arm, which says so outright.
 *
 * It returns the reading beside the ring because a derivation's result is what
 * `render` receives in the fetched data's place — the ring alone would leave the
 * other four rows nothing to draw.
 */
export function cpuFold(ring: Ring): (data: unknown) => Readonly<{ ring: Ring; reading: Reading }> {
  return (data) => {
    ring.began();
    const reading = data as Reading;
    // `--` for a container that has stopped. Absent is not zero (walk A8,
    // DASHBOARD_WALK A3): zero would draw it idling, and it is not idling.
    ring.took(reading.stats === null ? null : percent(str(reading.stats, "CPUPerc")));
    return { ring, reading };
  };
}

// ── The document ────────────────────────────────────────────────────────────

/**
 * The ring a drill-in opens with: the spark column's width, seeded by the
 * verb's own result. A function rather than two lines inside `containerView`
 * because the closure holding the ring is unreachable (F28) and a cap nobody can
 * read is a cap no row can assert (S3_WALK §6 C1).
 */
export function seedRing(row: Row): Ring {
  const ring = createRing(SPARK_CELLS);
  ring.began();
  ring.took(percent(str(row, "CPUPerc")));
  return ring;
}

/**
 * The one block a drill-in returns: a live part holding the five rows.
 *
 * **One frame, and it is the framework's** (S3_WALK §6). `b.live` is a panel by
 * construction — its border is where staleness is said (C24 §5, §047) — so the
 * three framed parts and the plot's box became this one. The title is the
 * container's name and id, which do not change; everything that does is a row.
 *
 * **The ring is built here, inside the call** (walk A1). At module scope the
 * second drill-in would open holding the first container's samples and draw them
 * as its own. The verb's own result seeds the first sample, so the opening frame
 * draws a point rather than an empty row.
 */
export function containerView(row: Row, unicode = true, docker: Runner = realRunner): readonly Block[] {
  /**
   * **`ID`, not `Container` — and the frame is what said so.**
   *
   * `docker stats` reports `Container` as *the argument it was given*, so a view
   * opened by name has `Container: "dtui-busy"` and `ID: "0e624f2f5f90"`. Read
   * the wrong way round, the details read filtered `docker ps` on
   * `id=dtui-busy`, matched nothing, and rendered its empty arm: **"no details —
   * the container has gone"**. A sentence about the far side, produced by a bug
   * on this side, in a frame where every assertion passed.
   */
  const id = str(row, "ID") || str(row, "Container");
  const name = str(row, "Name") || str(row, "Container");
  const ring = seedRing(row);

  return [
    b.live({
      id: "stats",
      title: `${name || id} ${unicode ? "·" : "-"} ${id}`,
      every: TICK_MS,
      fetch: () => readBoth(docker, id),
      // The accumulation, folded once per poll — not a side effect of the fetch.
      derive: { key: `cpu-ring:${id}`, compute: cpuFold(ring) },
      render: (data) => {
        const d = data as { ring: Ring; reading: Reading };
        return statsBlock(d.ring, d.reading, unicode);
      },
      renderLoading: () => statsBlock(ring, { stats: row, details: null }, unicode, true),
      // Overridden so the history survives the failure that made it
      // interesting (B5, S3_WALK §6 C4).
      renderError: (err, retryInMs, attempt) => statsErrorBlock(ring, err, retryInMs, attempt, unicode),
    }),
  ];
}

/**
 * The adapter.
 *
 * A failed invocation is an error document, not an empty view — walk A3's shape
 * from the `/ps` adapter, and here it matters more: the view is already on
 * screen by the time this runs (C22 I45 pushes at step 3), so returning nothing
 * useful would leave a reader looking at a spinner that stopped.
 */
/**
 * **The `unicodeText` parameter is gone** (F54, F124). It was one boolean
 * threaded through eight functions because `AdapterContext` carried `width` and
 * no capabilities; `ctx.capabilities` is the resolved record now, so the adapter
 * asks rather than being told by an app that computed it wrongly.
 */
export function createContainerAdapter(docker: Runner = realRunner): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      const failed = result.exitCode !== 0;
      const row = failed ? null : (parseNdjson(result.stdoutRaw).rows[0] ?? null);

      const failure =
        result.stderr.trim() ||
        (failed
          ? `docker exited ${String(result.exitCode)}`
          : "no such container, or it reported nothing");

      const blocks: readonly Block[] =
        row === null
          ? [b.notice.error(failure)]
          : containerView(row, ctx.capabilities.unicode !== "ascii", docker);

      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: row === null ? "error" : "ok",
        // **C04 I3, and its absence is silent** — the document is refused by
        // C13 and discarded by C23 §5, so a failing invocation would have left
        // the view holding its spinner with nothing anywhere reporting a fault.
        // FINDINGS F35.
        ...(row === null ? { error: { message: failure } } : {}),
        blocks,
        meta: { adapter: "container-stats", truncated: false },
      };
    },
  };
}
