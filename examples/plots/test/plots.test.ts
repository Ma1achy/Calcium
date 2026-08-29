/**
 * The demo, run in a terminal — because the questions it exists to answer are
 * the ones every other gate in this repository is structurally blind to.
 *
 * Golden frames, the collision sweep, the pair sheet and the terminal baseline
 * all compare bytes. None of them can see a live part that has stopped, and
 * that is exactly what this example found on its first run (F372, F373): a
 * panel drawing the right value forever, with no notice and nothing red.
 *
 * **Stated limitation**: these read a byte stream, not a frame. A byte written
 * and then overwritten is still here. `examples/docker/tools/capture.py` is
 * where frames are read properly, through a screen model. What these rows
 * establish is that the chain ran end to end from the *packaged* surface and
 * that the live part is still advancing seconds later — which is a question
 * about two moments, and the reason the driver beside them captures twice.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = (p: string): string => new URL(p, import.meta.url).pathname;

describe("the plot demo", () => {
  it("the far side emits the five datasets", async () => {
    // A fixture must be shown to respond before it is asserted against.
    const { stdout } = await run(here("../bin/plots"), ["sample", "--json"]);
    const sample = JSON.parse(stdout) as Record<string, unknown>;
    expect(Object.keys(sample).sort()).toEqual(["budget", "frames", "heat", "latency", "shape"]);
    const budget = sample["budget"] as { ms: number[][] };
    expect(budget.ms).toHaveLength(4);
    expect(budget.ms[0]).toHaveLength(4);
  });

  it("every figure is built through `b.plot`, not around it", () => {
    // **The whole point of this example** (F335, F371). Every fixture in the
    // repository builds a plot with `block({ … })`, the viewmodel constructor,
    // which is transparent to any field — so the builder is the one surface no
    // artefact exercises for these forms, and the gap was invisible from
    // inside. A figure reaching past `b` here would put it back.
    //
    // **Comments are stripped first, and the row failed without it.** The
    // doc-comment above `curve` says *every fixture in the repository builds a
    // plot with `block({ … })`* — so the assertion matched the sentence
    // explaining why it exists. A source assertion measures the prose unless it
    // is told not to, and the best-documented file fails hardest;
    // `publicSurfaceUseSignal` strips for the same reason.
    const raw = readFileSync(here("../src/figures.ts"), "utf8");
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const forms = source.match(/form: "(\w+)"/g) ?? [];
    expect(forms.length, "five forms and the live one").toBeGreaterThanOrEqual(6);
    expect(source, "a figure reached past the builder to `block({ … })`").not.toMatch(
      /\bblock\s*\(\s*\{/,
    );
    expect(source, "a figure reached for the testing surface").not.toMatch(
      /from "@fmx\/calcium\/testing"/,
    );
  });

  it("it opens a shell, spawns the far side and draws all five forms", async () => {
    const { stdout } = await run("python3", [here("run-in-pty.py"), "node", here("../main.ts")], {
      cwd: here(".."),
      maxBuffer: 16 << 20,
      timeout: 90_000,
    });
    expect(stdout.length, "the terminal received nothing at all").toBeGreaterThan(1000);
    // The captions are the app's; the figures under them are the framework's.
    for (const caption of ["a curve", "a bar", "a matrix", "a distribution", "a hierarchy"]) {
      expect(stdout, `${caption} is missing`).toContain(caption);
    }
    // Framework-drawn furniture, so this is a rendered figure rather than a
    // document that merely built: a gutter label, a category, a tree node and
    // the matrix's own row labels.
    expect(stdout).toContain("p99");
    expect(stdout).toContain("1280w");
    expect(stdout).toContain("core 5");
    expect(stdout).toContain("raster");
  }, 120_000);

  it("T-live (F372, F373): the live part is still advancing three seconds on", async () => {
    // **The fail-on-revert row, and it names the change.** Give the plot inside
    // `walk()` the live panel's own id — `id: "walk"` rather than
    // `id: "queue-depth"` — and this fails: the second patch addresses an id
    // that now matches two blocks, `applyPatch` refuses, `put` returns false
    // and `renderPart` releases the host. The panel keeps drawing its last
    // child, with the right value and no notice, so **every assertion about
    // what is on screen still passes**. Only a comparison across two moments
    // sees it, which is why the driver captures twice.
    const { stdout } = await run("python3", [here("run-in-pty.py"), "node", here("../main.ts")], {
      cwd: here(".."),
      maxBuffer: 16 << 20,
      timeout: 90_000,
    });
    const [first = "", second = ""] = stdout.split("--- SECOND CAPTURE ---");
    expect(first, "the greeting never drew the live panel").toContain("queue depth");

    // **The second window holds edits, not a frame** (C22 I55 §6b, F149). Every
    // ordinary frame is a *difference* — only the changed rows, each addressed
    // with `CUP` — so `toContain("queue depth")` fails here even when the part
    // is advancing, because the title row did not change. That was this row's
    // first form and it is the proxy the comment above forbids.
    //
    // So the subject is what only the walk writes: a line plot's joining
    // glyphs. The header's clock repaints row 1 every second and draws none of
    // them, the other five figures are static, and a released part never writes
    // again. `╶` is the half-line a run starts with.
    const CURVE = /[\u256d\u2570\u2571\u2572\u2574\u2576\u2500]/u;
    expect(second.length, "nothing was written in the second window").toBeGreaterThan(200);
    expect(
      CURVE.test(second),
      "no curve was redrawn three seconds in — the live part has stopped",
    ).toBe(true);
  }, 120_000);
});
