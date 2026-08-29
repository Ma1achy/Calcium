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
import { readFileSync, readdirSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CATALOGUE, FORMS, refusals } from "../src/catalogue.ts";

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
    // **The whole point of this example** (F335, F371, F377). Every fixture in
    // the repository builds a plot with `block({ … })`, the viewmodel
    // constructor, which is transparent to any field — so the builder is the one
    // surface no artefact exercises for these forms, and the gap was invisible
    // from inside. A figure reaching past `b` here would put it back.
    //
    // **Every module, not one file.** Its first form counted `form:` in
    // `figures.ts`, and when the catalogue moved to its own module the row went
    // on asserting about a file that no longer held the subject — passing on
    // three forms while forty-six sat next door. A row aimed at a path measures
    // the path.
    //
    // **Comments are stripped first**, or the row matches the doc comment
    // explaining why it exists. A source assertion measures the prose unless it
    // is told not to; `publicSurfaceUseSignal` strips for the same reason.
    const strip = (t: string): string =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const modules = readdirSync(here("../src")).filter((f) => f.endsWith(".ts"));
    expect(modules.length, "the source modules were not found").toBeGreaterThan(2);

    const all = modules.map((f) => strip(readFileSync(here(`../src/${f}`), "utf8"))).join("\n");
    // **The subject is the builder, and the form count is asserted where it can
    // be seen** — in the table, at runtime, by the row above. A regex for
    // `form: "x"` counted three, because the catalogue passes the form as an
    // *argument* rather than a key: a source pattern measuring a shape the code
    // stopped having, which is the same defect as aiming a row at a path.
    expect(all, "the figures must go through the published builder").toMatch(/\bb\.plot\s*\(/);
    expect(Object.keys(CATALOGUE), "every form the union declares").toHaveLength(46);
    expect(all, "a figure reached past the builder to `block({ … })`").not.toMatch(
      /\bblock\s*\(\s*\{/,
    );
    expect(all, "a figure reached for the testing surface").not.toMatch(
      /from "@fmx\/calcium\/testing"/,
    );
  });

  it("every form the type declares has an entry, and four of them refuse (F377)", () => {
    // **The count is 46 and not 42**, which is the point of the entry shape. A
    // catalogue that omits what it cannot construct reports complete — F313's
    // contact sheet and F350's corpus, both. So the four are entries naming the
    // field the published builder does not declare.
    expect(FORMS).toHaveLength(46);
    expect([...refusals()].sort()).toEqual(["gantt", "pairplot", "smallmultiples", "waterfall"]);

    // **Built, not merely typed.** `b.plot` throws for a document the validator
    // would refuse, and no type reaches those rules — the calendar entry passed
    // seven series where a calendar's rows are a period, typechecked, and threw
    // on the first `/all`. Building every entry is the only thing that asks.
    const threw: string[] = [];
    let built = 0;
    for (const form of FORMS) {
      try {
        const drawn = CATALOGUE[form].at(3, 8);
        if ("refused" in drawn) continue;
        built += 1;
      } catch (err) {
        threw.push(`${form}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    expect(threw).toEqual([]);
    expect(built).toBe(42);
  });

  it("each refusal names a field `b.plot` does not declare (F335, F371, F377)", () => {
    // The reason must resolve against the builder rather than be prose: the
    // named field is absent from `b.plot`'s signature and present on `Plot`.
    const builder = readFileSync(
      here("../../../src/shell/builders/index.ts"),
      "utf8",
    );
    const sig = builder.slice(builder.indexOf("function plot("), builder.indexOf("): Plot {"));
    for (const form of refusals()) {
      const entry = CATALOGUE[form].at(0, 8);
      if (!("refused" in entry)) throw new Error(`${form} did not refuse`);
      expect(sig, `b.plot must not declare ${entry.needs}`).not.toMatch(
        new RegExp(`^\\s{4}${entry.needs}\\??:`, "mu"),
      );
    }
  });

  it("the animated figure is the static one at a later phase", () => {
    // **One generator, two consumers** — so an animated figure cannot show
    // something its static frame does not. Writing the two separately is how
    // they come to disagree, and this is the row that would fail if they were.
    const a = CATALOGUE["line"].at(0, 8);
    const b0 = CATALOGUE["line"].at(0, 8);
    const later = CATALOGUE["line"].at(9, 8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b0));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(later));
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
