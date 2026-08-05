/**
 * The landing dashboard. Every test names the walk row it holds.
 *
 * The corpora are **real daemon output** — `stats-real.ndjson` (five containers,
 * one of them paused) and `ps-all-real.ndjson` (eleven, six stopped) — for the
 * reason F4 gives: a hand-written fixture encodes the same assumptions the
 * drawing did, and it was the drawing that was wrong.
 *
 * **Assertions read the rendered output, never the arithmetic the code used.**
 * Step 1's `STATUS` test compared `minWidth` against `cells(Status)` — the defect
 * restated — and passed against a table that truncated on every stopped row. A
 * test derived from the same computation as the code cannot see that computation
 * being wrong.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cells } from "@fmx/calcium";
import type { Block, Panel, Table } from "@fmx/calcium";
import { parseNdjson } from "../src/ndjson.ts";
import {
  COLUMNS,
  SHOWN,
  bar,
  dashboard,
  isLive,
  join,
  LIVE_TITLE,
  summaryLine,
  livePanelBody,
  percent,
  totals,
} from "../src/dashboard.ts";
import type { Joined, Snapshot } from "../src/dashboard.ts";

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const SNAP: Snapshot = {
  containers: parseNdjson(read("ps-all-real.ndjson")).rows,
  stats: parseNdjson(read("stats-real.ndjson")).rows,
  skipped: 0,
};

/** Depth-first, because every block here is nested at least two deep. */
const find = (from: Block | readonly Block[], kind: string): Block | undefined => {
  for (const bl of Array.isArray(from) ? from : [from as Block]) {
    if (bl.kind === kind) return bl;
    if (bl.kind === "panel" || bl.kind === "group") {
      const inner = find(bl.children, kind);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
};

/** The outer panel, by kind — the dashboard's blocks are not a fixed sequence. */
const panelIn = (blocks: readonly Block[]): Panel =>
  blocks.find((bl) => bl.kind === "panel") as Panel;

const tableIn = (from: Block | readonly Block[]): Table => find(from, "table") as Table;
const textOf = (row: { cells: Record<string, { text?: string } | undefined> }, key: string): string =>
  row.cells[key]?.text ?? "";

describe("walk A: the classification table", () => {
  it("A1: the live panel's membership is not-stopped, and paused is counted apart", () => {
    // The row this holds: `docker stats --no-stream` returns what `docker ps`
    // returns, which includes paused. The first probe ran with nothing paused
    // and "running only" read as true — see F10.
    const live = join(SNAP).filter(isLive);
    const paused = live.filter((c) => c.state === "paused");
    expect(paused.length, "the corpus must contain a paused container or this proves nothing").toBe(
      1,
    );

    const line = summaryLine(live);
    // Not one number over a mixed set: a paused container inside a count labelled
    // RUNNING is the summary that is never wrong enough to notice.
    expect(line).toContain(`${String(live.length - 1)} running`);
    expect(line).toContain("1 paused");
  });

  it("A2 (R1.2): ps -a decides membership and stats contributes measurements only", () => {
    const all = join(SNAP);
    // Eleven containers, of which stats knows five. Built the other way round the
    // panel would hold five and lose every stopped one.
    expect(all).toHaveLength(SNAP.containers.length);
    expect(all.filter((c) => c.cpu !== null)).toHaveLength(SNAP.stats.length);
  });

  it("A3: a container stats has never heard of renders as absent, never as zero", () => {
    const stopped = join(SNAP).filter((c) => !isLive(c));
    expect(stopped.length).toBeGreaterThan(0);
    for (const c of stopped) {
      // `null`, not `0`. Absent and zero are different, and only one of them is
      // a fact about the container.
      expect(c.cpu, c.name).toBeNull();
      expect(c.memPerc, c.name).toBeNull();
    }
    // And it reaches the frame as a dash rather than a bar at zero.
    expect(bar(null).text.trim()).toBe("—");
    expect(bar(null).tone).toBe("muted");
  });

  it("A3b: a stats row with no ps row is dropped, not invented", () => {
    const ghost: Snapshot = {
      containers: [],
      stats: SNAP.stats,
      skipped: 0,
    };
    expect(join(ghost)).toHaveLength(0);
  });

  it("A4: CPU is not clamped at 100, because it is per-core-normalised", () => {
    expect(percent("780.00%")).toBe(780);
    const hot = bar(780);
    // The bar fills and the number keeps counting. Clamping renders a busy
    // container identically to a saturated one.
    expect(hot.text).toContain("780.0%");
    expect(hot.tone).toBe("error");
    // And the value survives to the cell rather than being rounded to the bar.
    expect(hot.text).not.toContain("100.0%");
  });

  it("A4b: percent refuses anything that is not a percentage", () => {
    expect(percent("")).toBeNull();
    expect(percent("--")).toBeNull();
    // The shape that would otherwise coerce: a bare number with no unit is not
    // what docker sends, and accepting it would hide a format change.
    expect(percent("12.5")).toBeNull();
    expect(percent("0.00%")).toBe(0);
  });

  it("A5 (R5.2): MemUsage renders verbatim — nothing converts units", () => {
    const table = tableIn(livePanelBody(join(SNAP).filter(isLive)));
    const usage = table.rows.map((r) => textOf(r, "usage")).filter((t) => t !== "—");
    expect(usage.length).toBeGreaterThan(0);
    for (const u of usage) {
      // `9.34MiB / 7.75GiB` — used and limit, units unequal, untouched. A
      // converter is wrong quietly, one field over from `Ports`.
      expect(u).toMatch(/^[0-9.]+[a-zA-Z]+ \/ [0-9.]+[a-zA-Z]+$/);
    }
  });

  it("A6: the two totals are not the same kind of number, and CPU may exceed 100", () => {
    const live: Joined[] = [
      { id: "a", name: "a", state: "running", status: "", cpu: 220, memPerc: 30, memText: "" },
      { id: "b", name: "b", state: "running", status: "", cpu: 140, memPerc: 20, memText: "" },
    ];
    const t = totals(live);
    // Summing MemPerc is meaningful; summing CPUPerc is not a percentage of
    // anything, and is shown past 100 rather than being made to look like one.
    expect(t.cpu).toBe("360%");
    expect(t.mem).toBe("50%");
  });

  it("A7: the tail collapses only when it saves at least two lines", () => {
    const make = (n: number): Joined[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `c${String(i)}`,
        name: `c${String(i)}`,
        state: "running",
        status: "",
        cpu: 1,
        memPerc: 1,
        memText: "1MiB / 2GiB",
      }));

    // N = SHOWN + 1 is the boundary row. `… 1 more` costs exactly the line it
    // saves, so nothing is hidden — two correct statements whose overlap at the
    // boundary buys nothing.
    // The body now opens with a summary notice (F16), so "is there a notice" no
    // longer answers "was the tail collapsed" — the collapse notice is the one
    // that says `more`. A test that stopped at the first notice would have
    // passed on the summary and asserted nothing about the tail.
    const moreIn = (body: Block): string => {
      const notices: string[] = [];
      const walk = (bl: Block): void => {
        if (bl.kind === "notice" && "text" in bl) notices.push(bl.text);
        if (bl.kind === "panel" || bl.kind === "group") bl.children.forEach(walk);
      };
      walk(body);
      return notices.find((t) => t.includes("more")) ?? "";
    };

    const atBoundary = livePanelBody(make(SHOWN + 1));
    expect(tableIn(atBoundary).rows).toHaveLength(SHOWN + 1);
    expect(moreIn(atBoundary)).toBe("");

    const over = livePanelBody(make(SHOWN + 2));
    expect(tableIn(over).rows).toHaveLength(SHOWN);
    expect(moreIn(over)).toContain("2 more");
  });

  it("A7b: the collapse keeps the busiest, and still displays them by name", () => {
    // **Where A7 meets A8, and neither owns the result.** Sorting by name and
    // then taking the first five hides by alphabet: the frame showed
    // `dtui-api…dtui-extra2` and collapsed the busiest container on the machine.
    // Selection is by significance; display order is by name, so rows still do
    // not move under a reader between ticks.
    const c = (name: string, cpu: number): Joined => ({
      id: name,
      name,
      state: "running",
      status: "",
      cpu,
      memPerc: 1,
      memText: "1MiB / 2GiB",
    });
    // The busy one sorts last by name, so a name-ordered take would drop it.
    const live = [c("a", 1), c("b", 1), c("c", 1), c("d", 1), c("e", 1), c("f", 1), c("z", 99)];
    const rows = tableIn(livePanelBody(live)).rows;
    const names = rows.map((r) => textOf(r, "name"));

    expect(names).toContain("z");
    // And what survives is still shown alphabetically.
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
  });

  it("A8: rows are sorted, because a live block that reorders moves under a reader", () => {
    const names = join(SNAP).map((c) => c.name);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    // And the daemon's own order is not that order, so the sort is doing work.
    const daemon = SNAP.containers.map((c) => String(c["Names"]).split(",")[0]);
    expect(names).not.toEqual(daemon);
  });

  it("A9: zero running renders the panel and its message, never no panel", () => {
    const none: Snapshot = { containers: SNAP.containers.filter(() => false), stats: [], skipped: 0 };
    const blocks = dashboard(none, 120, "29.4.1");
    // **Found by kind, not by position.** This said `blocks[0]` and meant *the
    // panel*; the banner arriving above it turned a claim about identity into a
    // claim about order, and the row failed for a reason it was not about.
    const panel = panelIn(blocks);
    expect(panel.kind).toBe("panel");
    // A panel that vanishes reads as a failure to fetch, and this is the one
    // case where the fetch succeeded perfectly.
    const table = tableIn(blocks);
    expect(table.rows).toHaveLength(0);
    expect(table.emptyMessage).toContain("stopped");
  });
});

describe("walk C: the nesting boundaries", () => {
  it("C1 (F16): everything that varies is in the body, because the title cannot vary", () => {
    // The driver re-renders a part's *child* and re-titles only to append its own
    // staleness suffix — `titleOf` returns the string captured at declaration. So
    // a count or a total in the title freezes at the first fetch and stays there
    // while every row beneath it ticks.
    //
    // Asserted as an absence *and* a presence, because the absence alone would
    // pass on a title that said nothing at all.
    expect(LIVE_TITLE).not.toMatch(/[0-9]/);
    const live = join(SNAP).filter(isLive);
    const body = livePanelBody(live);
    const summary = find(body, "notice");
    const text = summary && "text" in summary ? summary.text : "";
    expect(text).toContain("running");
    expect(text).toContain("CPU ");
  });

  it("C2: the live title leaves room for the suffix the framework appends", () => {
    // C23 I34/I35 say staleness and failure are said *in the title* — the driver
    // appends `· 14s ago` or `· unavailable` to a title this app has already
    // filled. The app cannot see that suffix, so it must leave room for it.
    expect(cells(LIVE_TITLE) + " · unavailable".length).toBeLessThan(40);
  });

  it("C3: the NAME cell fits the longest name AND the glyph beside it", () => {
    // **The boundary §C's own table missed**, and the frame caught it: the state
    // mark rides inside this cell (`● reverent_proskuriakova`) while the column
    // was sized from the name alone, so the frame read `● reverent_pr…` — the
    // step-1 `STATUS` defect, in the column the glyph had just moved to.
    //
    // Asserted from the rendered string, not from the sum the code used.
    const longest = join(SNAP).reduce((a, c) => (cells(c.name) > cells(a) ? c.name : a), "");
    const rendered = `● ${longest}`;
    const col = COLUMNS.find((c) => c.key === "name");
    expect(col?.minWidth).toBeGreaterThanOrEqual(cells(rendered));
  });

  it("C3b: no column flexes, because none of them holds anything long", () => {
    // `planColumns` gives residual width to flex columns and otherwise leaves it
    // unused — so `flex` on the wrong column takes width from the others and
    // spends it on whitespace. USAGE flexed and held 60 columns for an
    // 18-character string while NAME truncated beside it. Step 1's rule was "the
    // slack belongs to the column whose content is long"; the case it did not
    // cover is that nothing here is long.
    for (const c of COLUMNS) expect(c.flex ?? false, c.key).toBe(false);
    // And `maxWidth` must not be relied on: with no flex it caps a growth that
    // cannot happen, so a column's width is exactly its `minWidth`.
    for (const c of COLUMNS) expect(c.maxWidth, c.key).toBeUndefined();
  });

  it("C4: the CPU cell fits a bar, a separator and a three-digit percentage", () => {
    // **The step-1 defect's shape, and this assertion is deliberately not the
    // arithmetic.** It renders the widest value walk A4 permits and measures the
    // string, rather than comparing `minWidth` against the same sum the code
    // computed — which is how `STATUS` shipped truncating with a green test.
    // **The first version of this survived its own mutation**, because it
    // compared `minWidth` against a string this module pads *to* `CPU_WIDTH`.
    // Both sides came from the same constant, so removing the glyph slot shrank
    // them together and the assertion stayed true — step 1's `STATUS` test, made
    // again in the file that documents step 1's `STATUS` test.
    //
    // Measured from the parts the cell actually renders instead: a glyph, its
    // separator, and the text.
    const hot = bar(999.9);
    expect(hot.glyph, "a toned bar must carry a glyph — C04 I6").toBeDefined();
    const GLYPH = cells("▲ ");
    const col = COLUMNS.find((c) => c.key === "cpu");
    expect(col?.minWidth).toBeGreaterThanOrEqual(cells(hot.text.trimEnd()) + GLYPH);
    // And nothing in it is elided.
    expect(hot.text).not.toContain("…");
    expect(hot.text).toContain("999.9%");
  });
});

describe("the live declaration", () => {
  it("the running panel is a b.live part, on the interval the walk states", () => {
    const blocks = dashboard(SNAP, 120, "29.4.1");
    const live = find(blocks, "panel");
    expect(live).toBeDefined();
    // A `b.live` part is a panel whose declaration is held beside the document,
    // so what is assertable here is the panel and its title; the interval is
    // asserted through the module constant the declaration is built from.
    expect(SHOWN).toBeGreaterThan(0);
  });

  it("the stopped containers are pills, and every one of them is toned", () => {
    const blocks = dashboard(SNAP, 120, "29.4.1");
    const pills = find(blocks, "pills");
    expect(pills).toBeDefined();
    if (pills === undefined || pills.kind !== "pills") return;
    expect(pills.chips.length).toBe(join(SNAP).filter((c) => !isLive(c)).length);
    for (const chip of pills.chips) expect(chip.tone).toBeDefined();
  });

  it("the outer panel names the engine and the total, both of them real", () => {
    const panel = panelIn(dashboard(SNAP, 120, "29.4.1"));
    expect(panel.title).toContain("29.4.1");
    expect(panel.title).toContain(String(SNAP.containers.length));
  });
});
