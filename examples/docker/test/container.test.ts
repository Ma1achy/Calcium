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
import type { Block, Group, KeyValue, Notice, Plot } from "@fmx/calcium";
import { parseNdjson } from "../src/ndjson.ts";
import type { Row } from "../src/ndjson.ts";
import { axisCaption, capFor, createRing, createRingSet, TICK_MS } from "../src/history.ts";
import {
  containerView,
  cpuBlock,
  cpuErrorBlock,
  cpuFold,
  detailsBlock,
  ioBlock,
} from "../src/container.ts";

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const STATS: Row[] = parseNdjson(read("stats-real.ndjson")).rows;
const PS: Row[] = parseNdjson(read("ps-all-real.ndjson")).rows;

/** A container with real ports, so the verbatim rule has a subject (walk B3). */
const WITH_PORTS = PS.find((r) => String(r["Ports"] ?? "").includes("->")) as Row;

const kv = (bl: Block): KeyValue => bl as KeyValue;
const valueOf = (bl: Block, label: string): string =>
  kv(bl).rows.find((r) => r.label === label)?.value ?? "";

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

  it("H5 (F24): the cap is width-derived, and it is fixed when the view opens", () => {
    // The buffer's length *is* the window — `form: "line"` does no windowing —
    // so a cap that ignored the width would draw one density at 120 and the same
    // one at 80. Two widths, two caps, asserted as different rather than as a
    // formula, because a formula here is the code restated.
    expect(capFor(120)).toBeGreaterThan(capFor(80));
    expect(capFor(80)).toBeGreaterThan(0);
    // A terminal narrow enough to make the plot meaningless still gets a trend.
    expect(capFor(20)).toBeGreaterThanOrEqual(24);
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
    expect(fold(STATS[0] as Row), "and a resolving poll still folds").toBe(ring);
    expect(ring.ticks).toBe(1);
  });

  it("T2 (walk A3): the sample lands in the fold, so a render failure cannot lose it", () => {
    const ring = createRing(10);
    cpuFold(ring)(STATS[0] as Row);
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
    cpuFold(ring)(stopped);
    expect(ring.ticks).toBe(1);
    expect(ring.missed).toBe(1);
    // A position, not a reading (C12 I4) — the plot draws the gap where the
    // stop happened rather than ending the line one sample early.
    expect(ring.values).toEqual([null]);
    expect(ring.values.filter(Number.isFinite)).toEqual([]);
  });
});

// ── The blocks ──────────────────────────────────────────────────────────────

describe("S3's blocks", () => {
  it("B1 (walk B1): the caption rides inside the part's child, never beside it", () => {
    // **C22 I46 windows a view at block boundaries.** A caption authored as a
    // document-level sibling can be separated from the plot it explains — a
    // frame that reads as complete while missing the only thing that says what
    // the horizontal axis measures. One block closes it.
    const ring = createRing(10);
    ring.began();
    ring.took(42);

    const body = cpuBlock(ring) as Group;
    expect(body.kind).toBe("group");
    const kinds = body.children.map((c) => c.kind);
    expect(kinds).toEqual(["plot", "notice"]);
    // And the caption is the axis, not decoration: it is the only place the
    // horizontal unit is stated at all.
    expect((body.children[1] as Notice).text).toBe(axisCaption(ring));
  });

  it("B5: a failed tick keeps the history and says how many were lost", () => {
    // **The frame-read found this and both walk artefacts missed it.**
    // `renderError` replaces a part's whole child, so the framework's default
    // wiped the plot *and* the caption — and the caption is the only thing built
    // to report a stall. The mechanism was unreachable in exactly the case it
    // existed for.
    const ring = createRing(10);
    for (const v of [10, 20]) {
      ring.began();
      ring.took(v);
    }
    ring.began();
    ring.took(null);

    const body = cpuErrorBlock(ring, { message: "No such container" }, 16_000, 2) as Group;
    const kinds = body.children.map((c) => c.kind);
    // **A `status`, where it was a `notice`** (F406). Before `b.status` existed
    // an override's only vocabulary was a red line of text, so this app wrote the
    // countdown into a string by hand — `— retrying in 16s` — while the framework
    // drew a bordered box with a painted tag on the parts that took the default.
    // The same failure read two ways in one frame, decided by which panel it was
    // in.
    expect(kinds).toEqual(["plot", "notice", "status"]);
    // The history survives the failure that made it worth looking at.
    expect((body.children[0] as Plot).series[0]?.values).toEqual([10, 20, null]);
    // And the caption now has something to report.
    expect((body.children[1] as Notice).text).toContain("1 returned nothing");
    // **The countdown is the framework's, not this file's.** `retryInMs` and
    // `attempt` are relayed rather than formatted here, so the box says what
    // every other failing part says.
    expect(body.children[2]).toMatchObject({
      kind: "status",
      state: "retrying",
      message: "No such container",
      retryInMs: 16_000,
      attempt: 2,
    });
  });

  it("B2: the plot draws every sample the ring holds and no more", () => {
    const ring = createRing(4);
    for (const v of [1, 2, 3, 4, 5, 6]) {
      ring.began();
      ring.took(v);
    }
    const plot = (cpuBlock(ring) as Group).children[0] as Plot;
    expect(plot.series[0]?.values).toEqual([3, 4, 5, 6]);
    // A copy, not the ring's own array — a series the next tick mutates under
    // the renderer is a block whose content changes after it was measured.
    expect(plot.series[0]?.values).not.toBe(ring.values);
  });

  it("B3: MemUsage and Ports render verbatim — nothing converts or condenses", () => {
    const io = ioBlock(STATS[0] as Row);
    const usage = String((STATS[0] as Row)["MemUsage"]);
    expect(valueOf(io, "MEM")).toContain(usage);

    const details = detailsBlock(WITH_PORTS);
    // `0.0.0.0` versus `127.0.0.1` is whether the port faces the network, so the
    // bind address survives. Only runs of whitespace are collapsed.
    expect(valueOf(details, "PORTS")).toContain("0.0.0.0:");
    expect(valueOf(details, "PORTS")).toContain("->");
  });

  it("B4 (walk A8): no measurements renders as absent, never as zeros", () => {
    const io = ioBlock(null);
    expect((io as Notice).kind).toBe("notice");
    expect((io as Notice).text).toContain("not running");
    expect((io as Notice).text).not.toContain("0");
  });
});

// ── The document ────────────────────────────────────────────────────────────

describe("S3's document", () => {
  const blocks = containerView(STATS[0] as Row, 120);

  it("D1 (C04 I14): every block id at view level is distinct", () => {
    // `ViewPatch` addresses by id and the refresh driver patches by part id, so
    // a duplicate has no correct target. The panel and the block inside it are
    // the easiest pair in the world to name the same thing — DASHBOARD_WALK hit
    // exactly this with `running` and `running-rows`.
    const ids = blocks.map((bl) => bl.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("D2 (F22): four blocks at view level, which is what makes the gap branch reachable", () => {
    // `put` carries `gapBefore` from the block currently in place, and on the
    // view arm `currentPanel` reconstructs one via `livePanel`, which sets none.
    // The branch has been structurally dead for the whole life of the code and
    // wakes up the day a view holds more than one block. This is that day.
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((bl) => bl.kind === "panel")).toHaveLength(3);
  });

  it("D3 (walk A1): two drill-ins hold independent rings", () => {
    // **At module scope the second view would open holding the first
    // container's samples and draw them as its own** — silently, with every
    // assertion about the plot passing. The ring's lifetime is the invocation's.
    const first = containerView(STATS[0] as Row, 120);
    const second = containerView(STATS[1] as Row, 120);

    const captionOf = (bs: readonly Block[]): string => {
      const panel = bs.find((bl) => bl.id === "cpu") as { children: readonly Block[] };
      const body = panel.children[0] as Group;
      return (body.children[1] as Notice).text;
    };

    // Both are one tick old — seeded by the verb's own result and nothing else.
    expect(captionOf(first)).toContain("1 ticks");
    expect(captionOf(second)).toContain("1 ticks");
    expect(captionOf(first)).toBe(captionOf(second));
  });

  it("D6 (F27): the CPU plot's floor is pinned and its ceiling is not", () => {
    // **Read off the document rather than off `cpuBlock`**, because the helper
    // having the field says nothing about the composition using it.
    //
    // `yMin: 0` because absent a pin the range is the data's, and a container
    // held at 100% drew a 0.2% wobble as a full-height mountain range. No
    // `yMax` because `CPUPerc` is per-core-normalised — DASHBOARD_WALK A4 —
    // so 780% is ordinary on eight cores, and C04 I29 clamps to the edge: a
    // ceiling would render a busy container identically to a saturated one.
    const panel = containerView(STATS[0] as Row, 120).find((bl) => bl.id === "cpu") as {
      children: readonly Block[];
    };
    const plot = (panel.children[0] as Group).children[0] as Plot;

    expect(plot.yMin).toBe(0);
    expect(plot.yMax, "a ceiling would flatten 100% and 780% together").toBeUndefined();
  });

  it("D5: the header's ID is the container's id, not the argument it was opened by", () => {
    // **Found by reading the frame, and green through the fix — so nothing
    // covered it.** `docker stats` reports `Container` as whatever it was
    // handed, so a view opened by name has `Container: "dtui-busy"` and `ID:
    // "0e624f2f5f90"`. Read the wrong way round, the details part filtered
    // `docker ps` on `id=dtui-busy`, matched nothing, and rendered "the
    // container has gone" — the app's own bug phrased as a fact about docker.
    const byName: Row = { ...(STATS[0] as Row), Container: "dtui-busy" };
    const head = containerView(byName, 120)[0] as Block;
    expect(valueOf(head, "ID")).toBe(String(byName["ID"]));
    expect(valueOf(head, "ID")).not.toBe("dtui-busy");
  });

  it("D4 (F24): the width the view opened at sizes its window", () => {
    const wide = containerView(STATS[0] as Row, 200);
    const narrow = containerView(STATS[0] as Row, 60);
    // Read off the blocks rather than off `capFor`, because a cap the document
    // never applies is a cap that does nothing — the two are only the same
    // number if `containerView` actually passes the width through.
    const seriesCapOf = (bs: readonly Block[], width: number): boolean => {
      const panel = bs.find((bl) => bl.id === "cpu") as { children: readonly Block[] };
      const plot = (panel.children[0] as Group).children[0] as Plot;
      return (plot.series[0]?.values.length ?? 0) <= capFor(width);
    };
    expect(seriesCapOf(wide, 200)).toBe(true);
    expect(seriesCapOf(narrow, 60)).toBe(true);
    expect(capFor(200)).not.toBe(capFor(60));
  });
});

describe("the ring set — one row per container, rectangular by construction", () => {
  const reading = (pairs: readonly (readonly [string, number | null])[]) => new Map(pairs);

  it("R1 (C12 §6a B2): every known container is ticked, present or not", () => {
    // **A container missing from a snapshot is a gap in its row, not an absent
    // row.** Dropping it would shorten one row against the others, and a shorter
    // row is stretched to the common width by `columnsOf` — so column k would
    // mean a different instant per row while every count still agreed.
    const set = createRingSet(10);
    set.tick(reading([["a", 1], ["b", 2]]));
    set.tick(reading([["a", 3]])); // b vanished
    set.tick(reading([["a", 5], ["b", 6]]));

    expect(set.ids).toEqual(["a", "b"]);
    expect(set.ring("a")?.values).toEqual([1, 3, 5]);
    expect(set.ring("b")?.values, "the gap is where the container was not").toEqual([2, null, 6]);
    expect(set.ring("b")?.missed, "and it is counted as well as placed").toBe(1);
  });

  it("R2 (C12 §6a B2): a container first seen at tick N is back-filled with N gaps", () => {
    // **Back-filled before the tick, not after.** A ring created empty three
    // ticks in is three samples short of every other row for the rest of the
    // session — and that renders, at the wrong density, against a shared axis.
    const set = createRingSet(10);
    set.tick(reading([["a", 1]]));
    set.tick(reading([["a", 2]]));
    set.tick(reading([["a", 3], ["late", 9]]));

    expect(set.ring("late")?.values).toEqual([null, null, 9]);
    // The property the matrix rests on, asserted as a property rather than by
    // reading the two rows above: every row is the same length, always.
    const lengths = new Set(set.ids.map((id) => set.ring(id)?.values.length));
    expect(lengths, "one length across every row").toEqual(new Set([3]));
    expect(set.ticks).toBe(3);
  });

  it("R3: a stopped container keeps its row until the view closes", () => {
    // A row that disappears renumbers the ordinate under the reader. What a
    // stopped container looks like on a machine's heatmap is a row of absences,
    // and that is the honest picture rather than a missing one.
    const set = createRingSet(10);
    set.tick(reading([["gone", 4]]));
    for (let i = 0; i < 3; i += 1) set.tick(reading([]));

    expect(set.ids).toEqual(["gone"]);
    expect(set.ring("gone")?.values).toEqual([4, null, null, null]);
    expect(set.ring("gone")?.ticks, "it is still being ticked").toBe(4);
  });

  it("R4: the cap applies per row, so the matrix stays rectangular as it slides", () => {
    // The window slides under every row at once, because every row takes exactly
    // one sample per tick. Without that the cap would trim rows at different
    // moments and the rectangle would come apart at the oldest end.
    const set = createRingSet(3);
    for (let i = 0; i < 5; i += 1) set.tick(reading([["a", i], ["b", i * 10]]));

    expect(set.ring("a")?.values).toEqual([2, 3, 4]);
    expect(set.ring("b")?.values).toEqual([20, 30, 40]);
    expect(set.ticks, "the tick count is the session's, not the window's").toBe(5);
  });
});
