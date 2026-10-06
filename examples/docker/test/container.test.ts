/**
 * S3 — the drill-in view, and gap 1's ring. Every test names the walk row it holds.
 *
 * The corpora are **real daemon output**: `stats-real.ndjson` for the
 * measurements and `ps-all-real.ndjson` for the ports and mounts. A hand-written
 * fixture encodes the same assumptions the drawing did, and it was the drawing
 * that was wrong (F4).
 *
 * **What these rows can and cannot see, said out loud.** They drive the ring and
 * the block builders directly. They do *not* drive the refresh driver, because
 * `b.live` keeps its declaration in a `WeakMap` an app cannot reach (F28) — so
 * the fact that the driver calls these closures at all is verified by T1.39 and
 * by the frame-read, not here. A suite of only these rows would pass on the day
 * nothing called them.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Block, Group, Panel, Table } from "calcium-tui";
import { parseNdjson } from "../src/ndjson.ts";
import type { Row } from "../src/ndjson.ts";
import { axisCaption, createRing, TICK_MS } from "../src/history.ts";
import { containerView, cpuFold, seedRing, SPARK_CELLS, statsBlock, statsErrorBlock } from "../src/container.ts";
import type { Reading } from "../src/container.ts";

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const STATS: Row[] = parseNdjson(read("stats-real.ndjson")).rows;
const PS: Row[] = parseNdjson(read("ps-all-real.ndjson")).rows;

/** A container with real ports, so the verbatim rule has a subject (walk B3). */
const WITH_PORTS = PS.find((r) => String(r["Ports"] ?? "").includes("->")) as Row;

// ── The ring ────────────────────────────────────────────────────────────────

describe("gap 1: the ring keeps the history b.live does not", () => {
  it("H1 (walk A2, C12 I4): a tick that produced nothing keeps its POSITION, and is never a reading", () => {
    const ring = createRing(10);
    ring.began();
    ring.took(12);
    ring.began();
    ring.took(null);
    ring.began();
    ring.took(14);

    expect(ring.ticks).toBe(3);
    // **Was `[12, 14]`, and that was walk A2's expired premise written down as
    // an assertion.** The walk read `Series.values` as having no gap value and
    // ruled the sample dropped; the type carried absence the whole time — a
    // non-finite entry is a position with no reading, `finiteSamples` keeps its
    // index, and C12 I4 breaks the line across it. Dropping it made ninety
    // seconds of ticks render exactly like sixty.
    expect(ring.values).toEqual([12, null, 14]);
    expect(ring.missed).toBe(1);
    // The whole point of counting both: the compression is stated, not warned
    // about. A reader can check this sentence against the plot.
    expect(axisCaption(ring)).toBe("3 ticks · 2s each · 1 returned nothing");
  });

  it("H2 (walk A2): the miss count stays exact once the ring is full", () => {
    // **The regression this rules out was in the first version of the code.**
    // `missed` was read off `ticks - values.length`, which is right until the
    // ring drops its oldest and then reports every dropped sample as a stall.
    // Suppressing it past `cap` was the obvious repair and it is worse: it makes
    // a stall invisible from exactly the point the view has been open long
    // enough to have one.
    const ring = createRing(3);
    ring.began();
    ring.took(null);
    for (const v of [1, 2, 3, 4, 5]) {
      ring.began();
      ring.took(v);
    }

    expect(ring.values).toEqual([3, 4, 5]);
    expect(ring.ticks).toBe(6);
    expect(ring.missed).toBe(1);
    expect(axisCaption(ring)).toContain("1 returned nothing");
  });

  it("H3 (walk A8, C12 I4): absent is not zero — and it is not nothing either", () => {
    const ring = createRing(10);
    ring.began();
    ring.took(null);
    // **Walk A8's ruling is unchanged and its assertion is not.** Zero would
    // draw the container idling and it is not idling, it has stopped. But
    // *nothing* was the other error: it made the absence unrepresentable, so a
    // stopped container's stall was a shorter series rather than a visible gap.
    // `null` is the third answer and it is neither (C04 I46a).
    expect(ring.values).not.toContain(0);
    expect(ring.values).toEqual([null]);
    expect(ring.values.filter(Number.isFinite), "and still no reading").toEqual([]);
  });

  it("H4: a healthy run says so, and says nothing else", () => {
    const ring = createRing(10);
    for (const v of [1, 2, 3]) {
      ring.began();
      ring.took(v);
    }
    expect(axisCaption(ring)).toBe(`3 ticks · ${String(TICK_MS / 1000)}s each`);
    expect(axisCaption(ring)).not.toContain("returned nothing");
  });

  it("H6 (walk A2): a tick in flight is already counted", () => {
    const ring = createRing(10);
    ring.began();
    // `began` before the await is what makes a rejection a tick. Counted only on
    // success, the stall the caption exists to report would be invisible.
    expect(ring.ticks).toBe(1);
    expect(ring.values).toEqual([]);
  });
});

// ── The tick ────────────────────────────────────────────────────────────────

describe("the CPU fold, driven directly", () => {
  it("T1 (walk A2, F137): a transport failure is no longer counted as an attempt", async () => {
    // **The row that changed, and it is the migration's stated loss.** The tick
    // used to be the `fetch`, so a rejection ran `began()` on the way past. A
    // fold runs on a *version* and a version exists only when the fetch
    // resolved, so `docker` failing is now invisible to the ring.
    //
    // Kept as a row rather than deleted, because the old behaviour is what a
    // reader of `axisCaption` would assume: it says N attempts and M readings,
    // and after this only the successful attempts are counted. What replaced the
    // signal is the driver's own error arm, which says `unavailable` in the
    // panel title — louder than a caption divergence and about the same event.
    const ring = createRing(10);
    const fold = cpuFold(ring);

    // Nothing calls the fold at all on this path; the assertion is the absence.
    expect(ring.ticks, "no version, so no fold, so no attempt").toBe(0);
    expect(ring.missed).toBe(0);
    expect(fold({ stats: STATS[0] as Row, details: null }).ring, "and a resolving poll still folds").toBe(ring);
    expect(ring.ticks).toBe(1);
  });

  it("T2 (walk A3): the sample lands in the fold, so a render failure cannot lose it", () => {
    const ring = createRing(10);
    cpuFold(ring)({ stats: STATS[0] as Row, details: null });
    // `render` runs after this and may throw. The ring is already true, and the
    // next good tick draws the sample whose render failed. **Structural now
    // rather than a discipline**: a fold runs once per source version and a
    // render runs once per part, so a sample recorded in `render` would be
    // pushed twice the moment a second part read the same source (C23 I47).
    expect(ring.values).toHaveLength(1);
    expect(ring.ticks).toBe(1);
  });

  it("T3 (walk A8): a stopped container samples nothing and is not drawn as idle", () => {
    const ring = createRing(10);
    // Docker reports `--` for every measurement once a container has stopped.
    // **This is the miss that survives the migration** — the poll resolved, so
    // there is a version and the fold runs. It is also the common one.
    const stopped: Row = { ...(STATS[0] as Row), CPUPerc: "--" };
    cpuFold(ring)({ stats: stopped, details: null });
    expect(ring.ticks).toBe(1);
    expect(ring.missed).toBe(1);
    // A position, not a reading (C12 I4) — the plot draws the gap where the
    // stop happened rather than ending the line one sample early.
    expect(ring.values).toEqual([null]);
    expect(ring.values.filter(Number.isFinite)).toEqual([]);
  });
});

// ── The blocks ──────────────────────────────────────────────────────────────

/** A row of the stats table, by key. */
const rowOf = (bl: Block, key: string) => (bl as Table).rows.find((r) => r.id === key)!;
const cellOf = (bl: Block, key: string, col: string) => rowOf(bl, key).cells[col]!;
const READING: Reading = { stats: STATS[0] as Row, details: WITH_PORTS };

describe("S3's rows (S3_WALK §6)", () => {
  it("B1 (walk B1, §6 C3): the caption rides in the CPU row, beside the figure it explains", () => {
    // **C22 I46 windows a view at block boundaries**, so a caption authored as a
    // separate block can be separated from the figure. A spark cell draws no
    // text, so the caption is the same row's value — one block, by construction.
    const ring = createRing(10);
    ring.began();
    ring.took(42);
    const table = statsBlock(ring, READING);
    expect(table.kind).toBe("table");
    expect(cellOf(table, "cpu", "figure").spark).toEqual([42]);
    expect(cellOf(table, "cpu", "value").text).toContain(axisCaption(ring));
  });

  it("B5 (§6 C4): a failed tick keeps the history and says how many were lost", () => {
    // `renderError` replaces a part's whole child, so the framework's default
    // wiped the history *and* the caption — the one thing built to report a
    // stall. The override draws the rows from the ring and the box beneath.
    const ring = createRing(10);
    for (const v of [10, 20]) {
      ring.began();
      ring.took(v);
    }
    ring.began();
    ring.took(null);

    const body = statsErrorBlock(ring, { message: "No such container" }, 16_000, 2) as Group;
    expect(body.children.map((c) => c.kind)).toEqual(["table", "status"]);
    const table = body.children[0] as Table;
    expect(cellOf(table, "cpu", "figure").spark, "the history survives").toEqual([10, 20, null]);
    expect(cellOf(table, "cpu", "value").text).toContain("1 returned nothing");
    // **The countdown is the framework's, not this file's** (F406).
    expect(body.children[1]).toMatchObject({
      kind: "status",
      state: "retrying",
      message: "No such container",
      retryInMs: 16_000,
      attempt: 2,
    });
  });

  it("B2 (§6 C1): the spark draws every sample the ring holds, and the ring holds what the column draws", () => {
    const ring = createRing(4);
    for (const v of [1, 2, 3, 4, 5, 6]) {
      ring.began();
      ring.took(v);
    }
    const spark = cellOf(statsBlock(ring, READING), "cpu", "figure").spark;
    expect(spark).toEqual([3, 4, 5, 6]);
    // A copy, not the ring's own array — a series the next tick mutates under
    // the renderer is a block whose content changes after it was measured.
    expect(spark).not.toBe(ring.values);
    // The view's ring is the spark column's width, read off the column the
    // table declares rather than off the constant alone.
    expect(seedRing(STATS[0] as Row).cap, "the ring a view opens with").toBe(SPARK_CELLS);
    const view = containerView(STATS[0] as Row);
    const figure = ((view[0] as Panel).children[0] as Table).columns.find((c) => c.key === "figure");
    expect(figure?.minWidth).toBe(SPARK_CELLS);
  });

  it("B6 (§6 C2, F27): the level is said in numbers, because a sparkline normalises its window", () => {
    // A container held near 100% wobbling by a fraction draws a full-height
    // spark — the mountain range `yMin: 0` was pinned against on the plot. The
    // value carries the reading and the window's range, so the shape is not
    // read as a level.
    const ring = createRing(10);
    for (const v of [99.8, 100, 99.9]) {
      ring.began();
      ring.took(v);
    }
    const value = cellOf(statsBlock(ring, READING), "cpu", "value").text;
    expect(value).toContain("99.9%");
    expect(value).toContain("99.8–100.0%");
  });

  it("B3: MemUsage and Ports render verbatim — nothing converts or condenses", () => {
    const table = statsBlock(createRing(4), READING);
    expect(cellOf(table, "mem", "value").text).toBe(String((STATS[0] as Row)["MemUsage"]));
    // `0.0.0.0` versus `127.0.0.1` is whether the port faces the network, so the
    // bind address survives. Only runs of whitespace are collapsed.
    expect(cellOf(table, "ports", "value").text).toContain("0.0.0.0:");
    expect(cellOf(table, "ports", "value").text).toContain("->");
  });

  it("B4 (walk A8): no measurements renders as absent, never as zeros", () => {
    const table = statsBlock(createRing(4), { stats: null, details: null });
    const io = cellOf(table, "io", "value").text;
    expect(io).toContain("not running");
    expect(io).not.toMatch(/\d/u);
    expect(cellOf(table, "mem", "figure").bar?.value, "a bar of nothing, not of zero").toBeNull();
  });
});

// ── The document ────────────────────────────────────────────────────────────

describe("S3's document", () => {
  const blocks = containerView(STATS[0] as Row);
  const part = blocks[0] as Panel;
  const tableIn = (bs: readonly Block[]): Table => (bs[0] as Panel).children[0] as Table;

  it("D1 (C04 I14, §6 C7): every block id is distinct, the part's and the table's inside it", () => {
    // `ViewPatch` addresses by id and the refresh driver patches by part id, so
    // a duplicate has no correct target.
    expect(part.id).toBe("stats");
    expect(tableIn(blocks).id).not.toBe(part.id);
  });

  it("D2 (§6, E14): one framed part and no other frame — the three panels and the plot's box are gone", () => {
    // The design's §085, *five rows, not a dashboard*. The one frame is the
    // framework's: `b.live` is a panel by construction. Restoring a second part
    // or a plot fails here.
    expect(blocks).toHaveLength(1);
    expect(part.kind).toBe("panel");
    const kinds = new Set<string>();
    const walk = (bl: Block): void => {
      kinds.add(bl.kind);
      if (bl.kind === "panel" || bl.kind === "group") bl.children.forEach(walk);
    };
    part.children.forEach(walk);
    expect([...kinds]).toEqual(["table"]);
    expect(tableIn(blocks).rows.map((r) => r.id)).toEqual(["cpu", "mem", "io", "image", "ports"]);
  });

  it("D3 (walk A1): two drill-ins hold independent rings", () => {
    // **At module scope the second view would open holding the first
    // container's samples and draw them as its own.**
    const first = containerView(STATS[0] as Row);
    const second = containerView(STATS[1] as Row);
    const captionOf = (bs: readonly Block[]): string => cellOf(tableIn(bs), "cpu", "value").text;
    expect(captionOf(first)).toContain("1 ticks");
    expect(captionOf(second)).toContain("1 ticks");
  });

  it("D5: the title's id is the container's id, not the argument it was opened by", () => {
    // `docker stats` reports `Container` as whatever it was handed, so a view
    // opened by name has `Container: "dtui-busy"`. Read the wrong way round, the
    // details read filtered `docker ps` on `id=dtui-busy`, matched nothing, and
    // rendered "the container has gone" — the app's own bug phrased as a fact.
    const byName: Row = { ...(STATS[0] as Row), Container: "dtui-busy" };
    const title = (containerView(byName)[0] as Panel).title;
    // The name half may be the argument — it is what the reader typed — and
    // the id half must be the container's.
    expect(title.split(" · ").at(-1)).toBe(String(byName["ID"]));
  });

  it("D6 (§6 C5): the record is waited for, not reported absent, before the first tick", () => {
    // The loading render is the document's first frame; the details have not
    // been read yet, and *the container has gone* there would be a lie.
    const image = cellOf(tableIn(blocks), "image", "value").text;
    expect(image).toContain("reading the container's record");
    expect(image).not.toContain("gone");
  });
});
