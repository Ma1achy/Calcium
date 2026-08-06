/**
 * S3 — the live single-container view. Every ruling here is S3_WALK.md's.
 *
 * The demo's headline and the surface C22 §13a was ruled for: a verb whose
 * result is a **pushed view** rather than a transcript entry, holding live parts
 * that the refresh driver ticks against a `{ kind: "view" }` host. Gap 7's
 * three questions all land here at once.
 *
 * **The verb is `container stats <id>`, and the name is load-bearing twice.**
 * S02 drew it as `ps <uuid> --watch`, which cannot be spawned — `docker ps`
 * takes no positional, `--watch` is not a docker flag, and C06 I4 sends argv to
 * the far side verbatim. `docker container stats` is real and takes the id. And
 * it is a sub-verb rather than plain `stats` so that `/stats` stays free for S4,
 * which S02 reserves for a **transcript entry**: a tool-level `view` on `stats`
 * would have pushed S4 as well.
 *
 * **The parts fetch docker themselves, as the dashboard's do.** That is what
 * `LiveSpec` is — `fetch` returns data, `render` returns a block, and there is no
 * seam between them for C06 or C07 to occupy. The verb's own result seeds the
 * document; everything after the first frame comes from these closures.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { AdapterDocument, Adapter, Block, ViewDocument } from "@fmx/calcium";
import { bar, percent } from "./dashboard.ts";
import { axisCaption, capFor, createRing, TICK_MS } from "./history.ts";
import type { Ring } from "./history.ts";
import { parseNdjson, str } from "./ndjson.ts";
import type { Row } from "./ndjson.ts";

const run = promisify(execFile);

/** The plot's body. Eight rows of curve, plus C12's axes. */
const PLOT_HEIGHT = 8;

// ── The far side ────────────────────────────────────────────────────────────

/**
 * One container's measurements, straight from docker.
 *
 * `--no-stream` is docker's opt-out of a redraw loop; the shim supplies it for
 * this verb, and the parts supply it themselves because they are not going
 * through the shim at all.
 */
async function readStats(id: string): Promise<Row | null> {
  const { stdout } = await run(
    "docker",
    ["container", "stats", "--no-stream", "--format", "json", id],
    { maxBuffer: 1 << 20 },
  );
  return parseNdjson(stdout).rows[0] ?? null;
}

/**
 * The things `stats` does not carry: image, state, ports, mounts.
 *
 * Fetched once, through a **one-shot** live part (`every` omitted). The drawing
 * calls this block static and it behaves that way — a one-shot renders once and
 * is marked done, so staleness never re-titles it and it costs no further
 * frames. It is a part rather than adapter output because an adapter is handed a
 * result and cannot make a second call, and these four fields are not in the
 * one it was handed.
 */
async function readDetails(id: string): Promise<Row | null> {
  const { stdout } = await run(
    "docker",
    ["ps", "-a", "--no-trunc", "--filter", `id=${id}`, "--format", "json"],
    { maxBuffer: 1 << 20 },
  );
  return parseNdjson(stdout).rows[0] ?? null;
}

// ── The blocks ──────────────────────────────────────────────────────────────

/**
 * The CPU plot and the caption that says what its horizontal axis is.
 *
 * **One block, not two, and walk B1 is why.** C22 I46 windows a view at block
 * boundaries, so a caption authored as a document-level sibling can be separated
 * from the plot it explains — a frame that looks complete while missing the only
 * thing that says what the axis measures. `render` returns one block (C23 I34),
 * so the group is free here; a surface that puts the caption at document level
 * instead inherits the hazard rather than rediscovering it.
 *
 * **It draws from the ring, not from `data`.** The part's subject is the
 * history, and the history is the thing `b.live` does not keep (gap 1). The
 * fetch's return value is what put the newest sample *into* the ring, and by the
 * time this runs the ring is the whole answer.
 */
export function cpuBlock(ring: Ring, trouble?: Block, unicode = true): Block {
  return b.group(
    "column",
    [
      b.plot({
        id: "cpu-plot",
        series: [{ values: [...ring.values], label: "CPU %", tone: "ok" }],
        height: PLOT_HEIGHT,
        axes: true,
        /**
         * **The floor is pinned and the ceiling is not** (F27, C04 I29).
         *
         * Without `yMin` the range is the data's, and a container pinned at 100%
         * drew a 0.2% wobble as a full-height mountain range — the plot at its
         * least trustworthy in exactly the case a reader most wants to trust it.
         *
         * **And `yMax: 100` would be the opposite error.** DASHBOARD_WALK A4:
         * `CPUPerc` is per-core-normalised, so `780%` is an ordinary reading on
         * an eight-core host, and I29 clamps to the edge rather than dropping —
         * a ceiling would render a busy container identically to a saturated
         * one, which is the finding walk A4 already ruled against for the bar.
         */
        yMin: 0,
      }),
      b.notice("muted", axisCaption(ring, unicode), undefined, { id: "cpu-axis" }),
      ...(trouble === undefined ? [] : [trouble]),
    ],
    { id: "cpu-body" },
  );
}

/**
 * The failure, drawn **beside** the history rather than instead of it.
 *
 * **The frame-read is what forced this, and the walk had ruled the opposite
 * without noticing.** A03 §2's shape: `renderError` replaces a part's whole
 * child, so a stall wiped the plot and the caption together — and the caption is
 * the one thing built to report a stall. Trace row A2 named the effect ("the
 * caption reports the misses") and assumed a mechanism that would still be on
 * screen when it mattered. It was not; the ruling was right about the
 * interaction and wrong about a mechanism it assumed existed, which is C23
 * §8a A4's lesson arriving in this app.
 *
 * Nothing in either artefact could have caught it. A trace indexes what happens
 * *between* rules and this is a rule about what a frame contains — and the
 * containment only becomes visible when something replaces the container.
 */
export function cpuErrorBlock(ring: Ring, message: string, retryInMs: number | null): Block {
  const retry = retryInMs === null ? "" : ` — retrying in ${String(Math.round(retryInMs / 1000))}s`;
  return cpuBlock(ring, b.notice.error(`${message}${retry}`, { id: "cpu-error" }));
}

/**
 * MEM, NET, BLK and PIDS.
 *
 * **The bar carries no tone, and that is not an omission.** C04 I6 wants a
 * non-colour channel on anything severe, and a `keyValue` row has no glyph field
 * to put one in — the framework offers `label`, `value` and `tone` and nothing
 * else. Rather than colour a row that cannot carry the mark beside it, the bar's
 * own run is the channel: it survives 1-bit and it survives a colour-blind
 * reader, which is the whole of what the rule is protecting.
 *
 * **S12 measured the sentence above and found half of it.** The run does survive
 * one bit — the frame at `colourDepth: 1` still shows it and the meaning moves
 * to bold and dim. It does **not** survive `unicode: ascii`: `█` and `░` are
 * adapter text, and capability substitution covers the glyphs C09 picks. At
 * `LANG=C` the frame kept `░░░░░░░░` beside a plot that had correctly become
 * `.::-==++**##@@`. So the alphabet is chosen by the caller, from a flag the app
 * computes itself because `AdapterContext` carries no capabilities (F43, F54).
 */
export function ioBlock(row: Row | null, unicode = true): Block {
  if (row === null) {
    return b.notice("muted", "no measurements — the container is not running", undefined, {
      id: "io-body",
    });
  }
  const memPerc = percent(str(row, "MemPerc"));
  const absent = unicode ? "—" : "-";
  return b.kv(
    {
      MEM: `${bar(memPerc, unicode).text}  ${str(row, "MemUsage")}`,
      NET: str(row, "NetIO") || absent,
      BLK: str(row, "BlockIO") || absent,
      PIDS: str(row, "PIDs") || absent,
    },
    { id: "io-body" },
  );
}

/**
 * Image, state, ports and mounts — verbatim.
 *
 * `Ports` and `Mounts` are docker's strings and stay docker's strings (R01
 * commitment 5). Condensing `0.0.0.0:8080->80/tcp` would lose the bind address,
 * and `0.0.0.0` versus `127.0.0.1` is whether the port faces the network.
 */
export function detailsBlock(row: Row | null): Block {
  if (row === null) {
    return b.notice("muted", "no details — the container has gone", undefined, {
      id: "details-body",
    });
  }
  const ports = str(row, "Ports").trim().replace(/\s+/gu, " ");
  const mounts = str(row, "Mounts").trim();
  return b.kv(
    {
      IMAGE: str(row, "Image") || "—",
      STATE: str(row, "Status") || str(row, "State") || "—",
      PORTS: ports === "" ? "—" : ports,
      MOUNTS: mounts === "" ? "—" : mounts,
    },
    { id: "details-body" },
  );
}

/**
 * One tick of CPU, as the driver's `fetch`.
 *
 * **Extracted, and the reason is a finding.** `b.live` holds its declaration in
 * a `WeakMap` beside the document and exports neither the map nor
 * `liveDeclarations`, so an app cannot reach the `fetch` and `render` it just
 * declared. Without this seam walk A2, A3 and A8 would be assertable only
 * through the whole driver — which is the shape that made every one of this
 * branch's four wiring defects invisible. FINDINGS F28.
 *
 * **`began` first, `took` after** (walk A2). A rejection is still a tick, and a
 * count taken only on success cannot see the stall it exists to report — so the
 * attempt is counted before anything can go wrong with it, and the catch records
 * the miss before rethrowing so the driver still renders its error.
 *
 * **And the sample lands here, not in `render`** (walk A3). `render` runs once
 * per successful fetch and can throw; a sample recorded there would be lost by a
 * render failure while the tick count stayed right — a hole in the data with no
 * evidence of one. Here the ring is already true and the next good tick draws it.
 */
export function createCpuTick(ring: Ring, read: () => Promise<Row | null>): () => Promise<unknown> {
  return async () => {
    ring.began();
    let measured: Row | null;
    try {
      measured = await read();
    } catch (err) {
      ring.took(null);
      throw err;
    }
    // `--` for a container that has stopped. Absent is not zero (walk A8,
    // DASHBOARD_WALK A3): zero would draw it idling, and it is not idling.
    ring.took(measured === null ? null : percent(str(measured, "CPUPerc")));
    return measured;
  };
}

// ── The document ────────────────────────────────────────────────────────────

/**
 * The four blocks a drill-in pushes.
 *
 * **The ring is built here, inside the call** (walk A1). At module scope the
 * second drill-in would open holding the first container's samples and draw them
 * as its own — silently, with every assertion about the plot passing. Its
 * lifetime is the invocation's, and the pop drops it with the closures that hold
 * it.
 *
 * The verb's own result seeds the first sample, so the opening frame draws a
 * point rather than an empty axis.
 */
export function containerView(row: Row, width: number, unicode = true): readonly Block[] {
  /**
   * **`ID`, not `Container` — and the frame is what said so.**
   *
   * `docker stats` reports `Container` as *the argument it was given*, so a view
   * opened by name has `Container: "dtui-busy"` and `ID: "0e624f2f5f90"`. Read
   * the wrong way round the header showed the name twice and, worse, the details
   * part filtered `docker ps` on `id=dtui-busy`, matched nothing, and rendered
   * its empty arm: **"no details — the container has gone"**. A sentence about
   * the far side, produced by a bug on this side, in a frame where every
   * assertion passed.
   *
   * The lesson is about the empty arm rather than the field: a block whose
   * absent state is phrased as a fact about the world will misattribute this
   * app's own faults to it, and nothing in the frame separates the two.
   */
  const id = str(row, "ID") || str(row, "Container");
  const name = str(row, "Name") || str(row, "Container");
  const ring = createRing(capFor(width));
  ring.began();
  ring.took(percent(str(row, "CPUPerc")));

  const tickCpu = createCpuTick(ring, () => readStats(id));

  return [
    b.kv({ CONTAINER: name || id, ID: id }, { id: "container-head" }),
    b.live({
      id: "cpu",
      title: "CPU",
      every: TICK_MS,
      fetch: tickCpu,
      render: () => cpuBlock(ring, undefined, unicode),
      renderLoading: () => cpuBlock(ring, undefined, unicode),
      // Overridden so the history survives the failure that made it
      // interesting. The framework's default replaces the child outright, which
      // is right for a part whose block *is* its latest fetch and wrong for one
      // accumulating across ticks.
      renderError: (err, retryInMs) => cpuErrorBlock(ring, err.message, retryInMs),
    }),
    b.live({
      id: "io",
      title: unicode ? "MEMORY · NETWORK · BLOCK" : "MEMORY - NETWORK - BLOCK",
      every: TICK_MS,
      fetch: () => readStats(id),
      render: (data) => ioBlock(data as Row | null, unicode),
      renderLoading: () => ioBlock(row, unicode),
    }),
    b.live({
      // No `every` — one-shot. Rendered once, never retried, never re-titled.
      id: "details",
      title: "DETAILS",
      fetch: () => readDetails(id),
      render: (data) => detailsBlock(data as Row | null),
      // **Supplied, and the reason is an ellipsis.** Left out, C24's default
      // renders `loading…` — U+2026, a framework string constant with no
      // capability substitution behind it, which reaches an ASCII terminal
      // whole. The app can replace its own; it cannot replace the prompt, which
      // is the other instance and the one that made this a finding (F55).
      //
      // It also says something truer: this part is one-shot, so what is
      // happening is a single `docker ps` filtered by id, and naming it beats
      // a participle.
      renderLoading: () =>
        b.notice("muted", unicode ? "reading the container's record…" : "reading the container's record", undefined, {
          id: "details-loading",
        }),
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
export function createContainerAdapter(unicodeText: () => boolean = () => true): Adapter {
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
          : containerView(row, ctx.width, unicodeText());

      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: row === null ? "error" : "ok",
        // **C04 I3, and its absence is silent** — the document is refused by
        // C13 and discarded by C23 §5, so a failing invocation would have left
        // the view holding its spinner with nothing anywhere reporting a fault.
        // FINDINGS F35.
        ...(row === null ? { error: { message: failure, stage: "adapter" as const } } : {}),
        blocks,
        meta: { adapter: "container-stats", truncated: false },
      };
    },
  };
}
