// The three benches with no liveness guard of their own — `stress.mjs`,
// `mosaic.mjs` and `alloc3d.mjs` — asked whether they measured anything.
//
// **Not timing rows, and deliberately.** Each bench says why its numbers are
// taken by hand: a timing assertion under contention is a flake, and an
// allocation count under a test runner is the runner's. So these rows assert
// only what a reading depends on and a loaded machine cannot move — the fixture
// drew, the digest names what was timed, a sample was taken. `make instruments`
// found all three with no fixture; `bench-liveness.test.ts` covers the benches
// that import `liveness.mjs`, and these three do not.
//
// **Against `dist/`, because that is what the benches read** — tier 5, and
// `make e2e` builds first.
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * The environment a person runs a bench in. vitest sets `NODE_ENV=test`, and
 * `tools/bench/env.mjs` keeps a setting it finds — so inheriting it would run
 * React's development build, the thing F1167 found the bench profiling.
 */
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST") && k !== "NODE_ENV"),
);
const node = (args: readonly string[], extra: Readonly<Record<string, string>> = {}): string =>
  execFileSync("node", args, { encoding: "utf8", timeout: 120_000, env: { ...env, ...extra } });

describe("tools/bench/stress.mjs — a transcript full of one thing", () => {
  const STRESS = ["--expose-gc", "--experimental-strip-types", "tools/bench/stress.mjs"];

  it("BP1: a small `text` case draws its document before a number is read — the screen at the end holds the code the entries carry", () => {
    const out = node([...STRESS, "text", "80x24", "3", "0.2"], { SCREEN: "1" });
    expect(out).toContain("# stress — text (a markdown response of eight paragraphs per entry) · n 3 at 80x24");
    const screen = out.split("## screen at the end")[1] ?? "";
    // The fixture's own guard exits 1 on a refusal; this is the other half —
    // that what is on screen is the case's content and not an empty frame.
    expect(screen, "the screen section was printed").not.toBe("");
    expect(screen).toContain("export function f");
    expect(screen).not.toContain("TranscriptError");
  });

  it("BP2: `JSON=1` is one `STRESS` line naming the case and its n, with frames the profiler reported", () => {
    // The line `matrix` and every A/B script read; a run that printed a table
    // instead would read as `no STRESS line` there.
    const out = node([...STRESS, "text", "80x24", "3", "0.2"], { JSON: "1" });
    const lines = out.split("\n").filter((l) => l.startsWith("STRESS "));
    expect(lines).toHaveLength(1);
    const j = JSON.parse((lines[0] ?? "").slice("STRESS ".length)) as { case: string; n: number; size: string; frames: number };
    expect([j.case, j.n, j.size]).toEqual(["text", 3, "80x24"]);
    expect(j.frames, "`onReport` fired with frames in it").toBeGreaterThan(0);
  });
});

describe("tools/bench/mosaic.mjs — a mosaic frame, timed and digested", () => {
  const MOSAIC = "tools/bench/mosaic.mjs";
  const KINDS = ["logs", "columnGroup", "rowGroup", "panel", "scroll", "mosaic2", "pinwheel"];
  const kinds = (width: string) =>
    new Map(
      node([MOSAIC, "dist", "kinds", width])
        .trimEnd()
        .split("\n")
        .map((l) => /^(\w+)\s+([0-9a-f]{16}) rows=(\d+)$/u.exec(l))
        .map((m) => [m?.[1] ?? "?", { hex: m?.[2] ?? "", rows: Number(m?.[3]) }] as const),
    );

  it("BP3: `kinds` digests one document per container, every one drawn and no two alike", () => {
    const k = kinds("120");
    expect([...k.keys()]).toEqual(KINDS);
    for (const [name, d] of k) expect(d.rows, `${name} drew rows`).toBeGreaterThan(0);
    expect(new Set([...k.values()].map((d) => d.hex)).size, "seven documents, seven digests").toBe(KINDS.length);
    // The pinwheel is the figure the bench exists for, at its declared height.
    expect(k.get("pinwheel")?.rows).toBe(40);
  });

  it("BP4: the digest beside a timing is the pinwheel's — the reading names what was timed", () => {
    // **The digest comes first** is the bench's own rule: its first paired run
    // was fifteen times quicker and missing two of five cells. A digest taken
    // of something other than the timed frame would restore exactly that.
    const t = JSON.parse(node([MOSAIC, "dist", "3", "120"])) as { reps: number; width: number; rows: number; digest: string };
    expect([t.reps, t.width]).toEqual([3, 120]);
    expect(t.rows, "three frames of the forty-row pinwheel").toBe(120);
    expect(t.digest).toBe(kinds("120").get("pinwheel")?.hex);
  });
});

describe("tools/bench/alloc3d.mjs — the 3-D raster's allocations, sampled", () => {
  it("BP5: a sample is taken, and every site it lists is under `presentation/`", () => {
    const out = node(["--experimental-strip-types", "tools/bench/alloc3d.mjs", "bunny", "2", "4"]);
    const [head = "", ...rows] = out.trimEnd().split("\n");
    const m = /^bunny · 2 renders · ([\d.]+) MB sampled · ([\d.]+) MB a render$/u.exec(head);
    expect(m, head).not.toBeNull();
    expect(Number(m?.[1]), "the sampler saw the renders").toBeGreaterThan(0);
    expect(rows.length, "at least one allocation site").toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(4);
    for (const row of rows) expect(row, "the `presentation/` filter").toMatch(/MB\/render {2}\S+ presentation\/\S+\.js:\d+$/u);
  });
});
