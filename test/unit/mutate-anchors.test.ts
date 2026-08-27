// `tools/mutate/anchors.mjs` — the sweep's own fixture.
//
// **The instrument exists because a control anchor rotted and nothing asked.**
// `c26-address.mjs` was anchored on a line a later sweep appended a
// `// graphemes-ok:` marker to, so `runPass` threw on the control and the run
// could not start — for however long it had been since anyone ran it. The
// harness reported that correctly and only to whoever ran it, which is the gap:
// `make all` does not touch `tools/mutate/runs`, and `instruments.mjs` exempts
// the directory by name for a reason that is true.
//
// Two arms carry the weight:
//
//   MA2 — a stale anchor in a fabricated run fails. Without it the sweep passes
//         on a directory where nothing resolves, which is the shape group 9's
//         ruling is about: scanning nothing is fast and exits 0.
//   MA4 — the debt list is compared by **equality**. An entry that starts
//         resolving again fails, so a dead excuse cannot outlive its reason.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = mkdtempSync(join(tmpdir(), "mutate-anchors-"));

function run(dir?: string): { ok: boolean; out: string } {
  const args = dir === undefined ? [] : ["--dir", dir];
  try {
    return {
      ok: true,
      out: execFileSync("node", ["tools/mutate/anchors.mjs", ...args], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A runs directory holding one fabricated run. */
function runsDir(name: string, body: string): string {
  const dir = mkdtempSync(join(DIR, "runs-"));
  writeFileSync(join(dir, name), body);
  return dir;
}

const resolving = `
const SRC = "src/data/viewmodel/tree.ts";
const MUTATIONS = [
  {
    file: SRC,
    from: "export function hasChildren(block: Block): block is ContainerBlock {",
    to: "export function hasChildren(block: Block): boolean {",
  },
];
`;

describe("tools/mutate/anchors.mjs", () => {
  it("MA1: a run whose anchors all resolve passes", () => {
    const r = run(runsDir("fake.mjs", resolving));

    expect(r.ok, r.out).toBe(true);
    expect(r.out, "and it says how many it looked at").toMatch(/1 anchors|· 1 anchors/u);
  });

  it("MA2: one stale anchor fails, and the run is named", () => {
    // **The fabricated violation.** The anchor is a sentence that could plausibly
    // have been in the file and is not — which is exactly what a rotted mutation
    // looks like, rather than a syntactically impossible string.
    const stale = resolving.replace(
      "export function hasChildren(block: Block): block is ContainerBlock {",
      "export function hasChildren(b: Block): b is ContainerBlock {",
    );
    const r = run(runsDir("fake.mjs", stale));

    expect(r.ok).toBe(false);
    expect(r.out).toContain("fake.mjs");
  });

  it("MA3: the debt list does not travel to a foreign directory", () => {
    // A list naming runs in *this* repository must not excuse a fabricated one,
    // or the fixture above passes by inheriting an excuse it was never given.
    const named = resolving.replace("fake", "c23-refresh");
    const broken = named.replace("export function hasChildren", "export function noSuchThing");
    const r = run(runsDir("c23-refresh.mjs", broken));

    expect(r.ok, "a run sharing a listed name is still checked").toBe(false);
  });

  it("MA5: a run naming a test file that is not there fails, and says so", () => {
    // **The second thing that rots, and it rots silently.** A stale anchor
    // throws and stops the run; a missing *test* file changes nothing anyone
    // can see, because **vitest drops a filter that resolves to nothing
    // whenever another one does**. The pass then reports `caught` against a
    // corpus it does not have.
    //
    // Measured twice in this repository before the check existed:
    // `c12-shared-geometry.mjs` named `test/golden/plots.test.ts` (the files
    // are `plot.test.ts` and `plot-forms.test.ts`) and its header argued *from*
    // the goldens being in the corpus; `c04-weights.mjs` named a banner test
    // that had moved a directory.
    const withSuite = `const CMD = "npx vitest run test/unit/view-model.test.ts";\n${resolving}`;
    expect(run(runsDir("fake.mjs", withSuite)).ok, "a path that resolves is fine").toBe(true);

    const gone = withSuite.replace("test/unit/view-model.test.ts", "test/unit/view-models.test.ts");
    const r = run(runsDir("fake.mjs", gone));
    expect(r.ok, "one letter, and the corpus is short by a file").toBe(false);
    expect(r.out).toContain("view-models.test.ts");
    expect(r.out, "and it says why silence is the failure mode").toContain("drops it silently");
  });

  it("MA5b: the count is reported, so a scan that reads nothing cannot pass", () => {
    // A gate's exit status is one bit and it is the same bit for *clean* and
    // for *the pattern matched nothing*. Both forms are read — the inline
    // `vitest run …` and the `FILES` const eight runs use — so a widening that
    // fixed the form in front of it and stopped there would show up here as a
    // number that did not move.
    const viaConst = [
      `const FILES =\n  "test/unit/view-model.test.ts test/edge/view-model.test.ts";`,
      `const CMD = \`npx vitest run \${FILES}\`;`,
      resolving,
    ].join("\n");
    const r = run(runsDir("fake.mjs", viaConst));
    expect(r.ok, r.out).toBe(true);
    expect(r.out, "both paths were read, not zero").toMatch(/· 2 test paths ·/u);
  });

  it("MA6 (F336): an expectation naming a row the run cannot reach fails, and one it can does not", () => {
    // **A row's `expect` is a claim about which instrument caught it**, which is
    // `testPathsOf`'s own sentence one step further along: that check asks
    // whether a named test **file** exists, and this asks whether the named
    // **row** is inside a file the run invokes. From the report the two are
    // indistinguishable — a `caught` says nothing about which gate spoke.
    //
    // Measured when it was built: 927 expectations across 99 runs, and **three**
    // named a row their run could not reach. One sat in a file the command does
    // not list — `THE NULL`, which survived a whole pass while `T1.102` failed
    // by hand in a second — one had an expectation that had lost the space and the
    // brackets from a row named `F3 (b):`, and one is deliberate and on `CROSS_TIER`.
    const withRow = [
      `const CMD = "npx vitest run test/unit/view-model.test.ts";`,
      `export const M = [{ name: "x", file: "src/data/viewmodel/types.ts", from: "export", to: "", expect: "T1.1 " }];`,
      resolving,
    ].join("\n");
    expect(run(runsDir("fake.mjs", withRow)).ok, "a row the run's own corpus contains is fine").toBe(true);

    const elsewhere = withRow.replace('expect: "T1.1 "', 'expect: "T9.99 no such row"');
    const r = run(runsDir("fake.mjs", elsewhere));
    expect(r.ok, "a row nothing in the corpus contains").toBe(false);
    expect(r.out).toContain("T9.99 no such row");
    expect(r.out, "and it says what the claim was about").toContain("no test path it runs contains");
  });

  it("MA6b (F336): the whole-suite gates are not rows, and the count is reported", () => {
    // **`baseline`, `golden` and `SB` name a suite rather than a row**, so a
    // check that resolved every string would fail on the gates it exists to
    // trust. And the counter is here for MA5b's reason: an arm that reads
    // nothing passes exactly like one that is satisfied.
    const reserved = [
      `const CMD = "npx vitest run test/unit/view-model.test.ts";`,
      `export const M = [{ name: "x", file: "src/data/viewmodel/types.ts", from: "export", to: "", expect: "baseline" }];`,
      resolving,
    ].join("\n");
    const r = run(runsDir("fake.mjs", reserved));
    expect(r.ok, r.out).toBe(true);
    expect(r.out, "the expectation was counted, not skipped").toMatch(/· 1 expectations ·/u);
  });

  it("MA4 (the equality arm): the real tree matches the list exactly", () => {
    // **Both directions.** A new stale anchor fails because it is not on the
    // list; a repaired one fails because the list still claims it. The second is
    // the one a subset check would miss, and it is how an excuse outlives its
    // reason.
    const r = run();

    expect(r.ok, r.out).toBe(true);
    expect(r.out).toMatch(/known stale, and no run drifted/u);
    // **And the counter, for the reason MA5b gives.** 184 test paths across 97
    // runs; a scan reading none of them exits 0 exactly as a clean one does.
    expect(r.out, "the real sweep read its subject").toMatch(/· \d{2,} test paths ·/u);
  });
});
