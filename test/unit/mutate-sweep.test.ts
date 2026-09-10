/**
 * MS1–MS6: the mutation sweep's own fixture (A03 §9a; F952, F990).
 *
 * The sweep runs every mutation run on a schedule so a vacuous mutation is
 * dated by a machine. Its executing half is exercised by the CI job that runs
 * it; what this file owes is the planner and the reader — that the plan is
 * the directory, that the shards partition it, that the debt list it reads
 * off `anchors.mjs` is the one `anchors.mjs` enforces, and that the verdict
 * tolerates exactly the known anchor misses and nothing else.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SWEEP_BUDGET_MS } from "../support/budget.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { ANCHORS, RUNS_DIR, discoverRuns, knownStale, parseArgs, plan, redTails, shardOf, summarise, verdict } from "../../tools/mutate/sweep.mjs";

type Summary = Readonly<{ caught: number; elsewhere: number; survived: number; anchorMissed: number; unbuilt: number; noSummary: number; expected: number; staleExemption: number }>;
type Args = { shard: { k: number; n: number } | null; only: string | null; list: boolean; out: string; skipAnchors: boolean };
const discover = discoverRuns as (dir?: string) => readonly string[];
const shard = shardOf as (runs: readonly string[], k: number, n: number) => readonly string[];
const stale = knownStale as (src: string) => Readonly<Record<string, number>>;
const summary = summarise as (output: string) => Summary;
const judge = verdict as (run: string, exit: number, s: Summary, stale: Readonly<Record<string, number>>) => "green" | "known-stale" | "red";
const args = parseArgs as (argv: readonly string[]) => Args;
const planOf = plan as (a: Args, all: readonly string[]) => readonly string[];
const ESC = String.fromCharCode(27);

describe("MS1: the plan is the directory, by equality", () => {
  it("every `.mjs` under the runs directory, sorted, and nothing else", () => {
    const listed = readdirSync(RUNS_DIR as string).filter((f) => f.endsWith(".mjs")).sort();
    expect(discover()).toEqual(listed);
    expect(listed.length).toBeGreaterThan(100); // cells-ok — a run count
  });
});

describe("MS2: shards partition the plan", () => {
  it("union is the whole, pairwise disjoint, sizes differ by at most one — at 1 and at 6", () => {
    const all = discover();
    for (const n of [1, 6]) {
      const parts = Array.from({ length: n }, (_v, i) => shard(all, i + 1, n));
      expect(parts.flat().sort()).toEqual([...all].sort());
      const seen = new Set<string>();
      for (const p of parts) for (const r of p) { expect(seen.has(r), r).toBe(false); seen.add(r); }
      const sizes = parts.map((p) => p.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1); // cells-ok — a count difference
    }
    expect(() => shard(all, 0, 6)).toThrow();
    expect(() => shard(all, 7, 6)).toThrow();
  });

  it("`--only` filters before sharding, so a filtered sweep is still a partition", () => {
    const all = discover();
    const a = args(["--shard", "2/3", "--only", "c12-"]);
    const mine = planOf(a, all);
    for (const r of mine) expect(r).toContain("c12-");
    expect(mine).toEqual(shard(all.filter((r) => r.includes("c12-")), 2, 3));
    expect(() => args(["--shard", "2"])).toThrow();
    expect(() => args(["--bogus"])).toThrow();
  });
});

describe("MS3: the debt list the sweep tolerates is the one `anchors.mjs` enforces", () => {
  // The same sweep MA4 runs, paid a second time (F1088).
  it("every entry names a run that exists, and the total is the total the anchors sweep prints", { timeout: SWEEP_BUDGET_MS }, () => {
    const list = stale(readFileSync(ANCHORS as string, "utf8"));
    const runs = new Set(discover());
    expect(Object.keys(list).length).toBeGreaterThan(0); // cells-ok — an entry count
    for (const run of Object.keys(list)) expect(runs.has(run), run).toBe(true);
    const total = Object.values(list).reduce((a, b) => a + b, 0);
    // The cross-check: the sweep's own summary line carries the same number,
    // computed from the runs and not from the list.
    const r = spawnSync("node", [ANCHORS as string], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    expect(r.status, r.stdout).toBe(0);
    const m = /(\d+) known stale, and no run drifted/u.exec(r.stdout);
    expect(m, "the anchors sweep's summary line").not.toBeNull();
    expect(Number(m![1])).toBe(total);
  });

  it("a source with no list is refused rather than read as an empty one", () => {
    expect(() => stale("const NOTHING = {};")).toThrow();
  });
});

describe("MS4: the reader counts the report's own state column", () => {
  const REPORT = [
    `${ESC}[32mcaught          ${ESC}[39m T1.139   the radar's category labels are written one code point per slot`,
    "caught           T1.140   the line arm reads its label row by code point",
    "CAUGHT ELSEWHERE 'SS61' fires on a fabricated violation RULE-BLIND: SS61 asks only for the first element",
    "SURVIVED         T1.141   the tick labels are written one code point per cell",
    "ANCHOR MISSED    XA8      the x axis forgets its ticks",
    "DID NOT BUILD    T1.1     a `to` that does not parse",
    "NO SUMMARY       T2.2     the harness reached no summary",
    "",
    "EXPECTED SURVIVOR   the tick labels are written one code point per cell",
    "  F985 — a formatted number is ASCII",
    "EXEMPTION IS STALE  the deduplication runs on the un-reversed edge",
  ].join("\n");
  it("one count per state, colour codes stripped, reasons not counted", () => {
    expect(summary(REPORT)).toEqual({ caught: 2, elsewhere: 1, survived: 1, anchorMissed: 1, unbuilt: 1, noSummary: 1, expected: 1, staleExemption: 1 });
  });
});

describe("MS5: the verdict tolerates exactly the known anchor misses", () => {
  const base: Summary = { caught: 3, elsewhere: 0, survived: 0, anchorMissed: 0, unbuilt: 0, noSummary: 0, expected: 0, staleExemption: 0 };
  const list = { "c12-x-axis.mjs": 1 };
  it("green on exit 0, known-stale on the listed misses alone, red on anything else", () => {
    expect(judge("c12-x-axis.mjs", 0, base, list)).toBe("green");
    expect(judge("c12-x-axis.mjs", 1, { ...base, anchorMissed: 1 }, list)).toBe("known-stale");
    expect(judge("c12-x-axis.mjs", 1, { ...base, anchorMissed: 2 }, list), "one more miss than the list").toBe("red");
    expect(judge("c12-x-axis.mjs", 1, { ...base, anchorMissed: 1, survived: 1 }, list), "a survivor beside the known miss").toBe("red");
    expect(judge("c12-sankey.mjs", 1, { ...base, anchorMissed: 1 }, list), "a miss on a run the list does not name").toBe("red");
    expect(judge("c12-x-axis.mjs", 1, { ...base, anchorMissed: 1, staleExemption: 1 }, list), "an exemption that is now caught").toBe("red");
  });

  it("the stated blind spot: a survivor printed by a run that exits 0 is green, because the run's exit is the authority", () => {
    // Every run either exits 1 on a survivor or carries an EXPECTED_SURVIVORS
    // tail that decides for itself. A run that did neither would pass here;
    // the harness's `report()` and the anchors sweep are what watch that
    // shape, and this row records the limit rather than implying the sweep
    // reaches it.
    expect(judge("c12-graph.mjs", 0, { ...base, survived: 1 }, list)).toBe("green");
  });
});

describe("MS6: `--list` plans and runs nothing", () => {
  it("prints the shard's runs and writes no log", () => {
    const out = mkdtempSync(join(tmpdir(), "mutate-sweep-"));
    try {
      const r = spawnSync("node", ["tools/mutate/sweep.mjs", "--list", "--shard", "1/6", "--out", out], { encoding: "utf8" });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const listed = r.stdout.split("\n").filter((l) => l.startsWith("  ") && l.trim().endsWith(".mjs")).map((l) => l.trim());
      expect(listed).toEqual(shard(discover(), 1, 6));
      expect(existsSync(join(out, "anchors.log")), "the anchors sweep did not run").toBe(false);
      expect(readdirSync(out)).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("MS7: a red run prints the tail of its own log (F1097)", () => {
  // The logs were written beside `summary.json` and nothing read them back, so
  // the two reds of the first sweep this repository ever ran each produced one
  // summary line and no reason — and both diagnoses came from reproducing them
  // on a machine that keeps the file. The disk is injected because a row cannot
  // manufacture a red run of the real sweep, which is this row's stated limit:
  // it drives the formatter and the path, and the wiring into `main` is proven
  // by running the sweep with the catalogue moved aside.
  const log = ["one", "two", "three", "four", "EXIT=1 SECONDS=9"].join("\n");

  it("MS7a: the header names the run and both counts, and every body line is prefixed", () => {
    const lines = redTails([{ run: "c12-x.mjs" }], "out/mutate-sweep", () => log, 3);
    expect(lines[0], "the run and the arithmetic of what was cut").toContain(
      "c12-x.mjs, last 3 of 5 lines",
    );
    expect(lines.slice(1), "the last three, each prefixed").toEqual([
      "  │ three",
      "  │ four",
      "  │ EXIT=1 SECONDS=9",
    ]);
  });

  it("MS7b: the tail is a cap rather than a count — a short log prints whole", () => {
    const lines = redTails([{ run: "c12-x.mjs" }], "out", () => "only", 30);
    expect(lines[0], "and says so").toContain("last 1 of 1 lines");
    expect(lines.slice(1)).toEqual(["  │ only"]);
  });

  it("MS7c: it reads each run's own log, at the path the sweep wrote it to", () => {
    const seen: string[] = [];
    redTails([{ run: "a.mjs" }, { run: "b.mjs" }], "somewhere", (f) => {
      seen.push(f);
      return "x";
    });
    expect(seen, "one read per red run, under `--out`").toEqual([
      "somewhere/a.mjs.log",
      "somewhere/b.mjs.log",
    ]);
  });

  it("MS7d: a log that cannot be read is skipped, not reported as empty", () => {
    // `--list` leaves an empty directory behind, and the run's own row is
    // already printed above this. An unreadable log producing a header with no
    // body would read as a run that said nothing, which is the opposite of what
    // the whole repair is for.
    expect(
      redTails([{ run: "gone.mjs" }], "out", () => {
        throw new Error("ENOENT");
      }),
    ).toEqual([]);
  });

  it("MS7e: no red runs, no output — the green path is unchanged", () => {
    expect(redTails([], "out", () => "x")).toEqual([]);
  });
});
