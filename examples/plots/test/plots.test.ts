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
import { completeLocal } from "@fmx/calcium";
import { expectDocument, liveParts, producerContext } from "@fmx/calcium/testing";
import type { Block, ViewDocument } from "@fmx/calcium";
import { CATALOGUE, everyVariant, FORMS, refusals, variantsOf } from "../src/catalogue.ts";
import {
  adaptSample, compare, everyForm, faults, formFull, greetingDocument, liveFor, monitor, unknown,
} from "../src/commands.ts";
import { manifest } from "../src/manifest.ts";

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

  /**
   * **A rung that draws its default is not a rung** (F396).
   *
   * `/all` drew one figure per form and captioned itself *every form the type
   * declares* — true about forms, and read as a claim about plots. A reader
   * counted: the corpus carries 188 variants and a violin alone has 19.
   *
   * Adding rungs makes the count bigger, and a bigger count is only worth
   * anything if each entry shows something. **Eight of the first sixty-four
   * drew byte-identical output to their own default** — `plotCorners: "sharp"`
   * is a no-op on five forms, `bar`'s base already sets `orientation:
   * "vertical"`, and one override was empty. This row is what found them and
   * what stops them coming back.
   *
   * **A height-only rung is compared against the gallery default**, not against
   * the default at its own height: the second is trivially identical, because
   * *the same spec at a different size* is exactly what the rung is. What the
   * reader sees is the rung beside the six-row default, so that is the
   * comparison.
   */
  it("T-rungs: every variant builds, and draws something its default does not", () => {
    const rendered = (form: (typeof FORMS)[number], height: number, spec?: object): string => {
      const bl = CATALOGUE[form].at(0, height, spec as never);
      expect("refused" in bl, `${form}: the base form builds`).toBe(false);
      return JSON.stringify(bl);
    };
    const identical: string[] = [];
    let checked = 0;
    for (const form of FORMS) {
      if ("refused" in CATALOGUE[form].at(0, 6)) continue;
      for (const [name, v] of Object.entries(variantsOf(form))) {
        checked += 1;
        const rung = rendered(form, v.height ?? 6, v.spec);
        // The gallery default is what it sits beside.
        if (rung === rendered(form, 6)) identical.push(`${form}/${name}`);
      }
    }
    expect(identical, "a rung that draws its default is a caption with no figure").toEqual([]);
    expect(checked, "and every declared rung was checked").toBe(everyVariant().length);
    // **The count, by equality** — so a rung appearing or vanishing is a failure
    // that names itself rather than a number nobody reads.
    expect(everyVariant().length, "rungs beyond the defaults").toBe(53);
    expect(FORMS.length - refusals().length + everyVariant().length, "figures /all draws").toBe(95);
  });
});

/**
 * **Every command, as a whole document** (F400).
 *
 * The rows above test the *pieces*: 46 entries, 53 rungs, each built on its own
 * and counted. They were green while `/all` and `/form` drew **nothing at all**,
 * because every figure of a form carried the same `f-<form>` id and a document
 * holding twenty of them is refused entire by C04 I14. `transcript.append`
 * rejects the document, so there is no frame in which any of the 95 correct
 * figures could appear, and no assertion about a figure could have seen it.
 *
 * **This is the fourth duplicate-id defect in this one example**, which is what
 * makes it a class rather than a bug: F372/F373 (a live part's child carrying
 * the panel's id), the monitor's rendered frame carrying its container's id, and
 * now `/all` and `/form`. Three of the four were found by looking at a terminal.
 *
 * So the check is over the *kind*: build what each handler serves, and put it
 * through the framework's own validator rather than a re-implementation of the
 * id rule — a second copy would keep its birthday clauses and drift from the one
 * the transcript actually runs.
 */
describe("every command composes a document the transcript would accept", () => {
  /**
   * A handler's blocks, as the **shell** would complete them.
   *
   * `completeLocal` is the framework's own — published at `src/index.ts:154` and
   * called by `runLocal` — so the document under test carries the `meta` the
   * transcript will actually see rather than one this file invented. A
   * hand-written `meta` here would be a fixture agreeing with itself, and the
   * first version of this row was exactly that: every document failed on
   * `meta: must be an object`, which is the fixture reporting on the fixture.
   */
  const as = (command: string, blocks: readonly Block[]): ViewDocument => {
    const [verb = "", ...argv] = command.split(" ").filter((w) => w.length > 0);
    return completeLocal(
      { schema: "tui.view/1", command, status: "ok", blocks },
      { command, verb: verb === "" ? null : verb, argv, durationMs: 0 },
    );
  };

  /**
   * What each declared command serves, keyed by its manifest name.
   *
   * `sample` is the spawned route: its adapter's whole body is `gallery(phase)`,
   * which is also the greeting's, so one entry covers both.
   */
  const DOCUMENTS: Readonly<Record<string, () => readonly ViewDocument[]>> = {
    // **The real two, not a re-spelling of them** — the adapter's own body and
    // the greeting's own document. The adapter returns an `AdapterDocument`,
    // whose `meta` the registry completes on the way through (F58b), so its
    // blocks are completed here the same way a handler's are; the greeting
    // already carries a full document and goes in as it stands.
    sample: () => [
      as("sample", adaptSample(JSON.stringify({ phase: 3 }), "sample").blocks),
      greetingDocument(),
    ],
    all: () => [as("all", [everyForm(0)])],
    form: () => FORMS.map((f) => as(`form ${f}`, formFull(f))),
    live: () => FORMS.map((f) => as(`live ${f}`, liveFor(f))),
    // The image arm is exercised in its own row — it is async and rasterises.
    compare: () => [],
    faults: () => [as("faults", [faults()])],
    monitor: () => [as("monitor", [monitor()])],
  };

  it("T-doc1: the coverage table names every command the manifest declares", () => {
    // **A command added to the manifest and to no row here is the hole this
    // closes.** Asserted by equality rather than containment, so a stale entry
    // cannot outlive its command either.
    expect(Object.keys(DOCUMENTS).sort()).toEqual(manifest.tools.map((t) => t.name).sort());
  });

  it("T-doc2 (C04 I14, C13 I10): every document validates", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const [name, build] of Object.entries(DOCUMENTS)) {
      for (const d of build()) {
        checked += 1;
        try {
          expectDocument(d).isValid();
        } catch (err) {
          bad.push(`${name}: ${d.command} — ${err instanceof Error ? err.message.split("\n")[1] ?? err.message : String(err)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // 46 forms twice, plus /all, /faults, /monitor, and sample's two.
    expect(checked, "documents built").toBe(FORMS.length * 2 + 5);
  });

  it("T-doc3: an unknown form is a document too", () => {
    expectDocument(as("form nope", [unknown("nope")])).isValid();
  });

  it("T-doc4 (F398, F399): every live part's own frame validates", async () => {
    // **The rendered frame is checked *in the document it lands in*, and the
    // first version of this row was not.** It validated `[render(...)]` on its
    // own, and the fabricated F399 — the monitor's frame carrying the live
    // panel's own id — **passed**, because a child alone collides with nothing.
    // The shell patches the child in by the panel's id, so the document that
    // has to be legal is the host's *plus* the child; C04 I14's uniqueness is
    // document-wide, not sibling-scoped, which is why appending is faithful to
    // it without needing the panel's internals. This is F372/F373's defect and
    // F399's, and neither is visible from a child held on its own.
    //
    // A part's frame is only reachable through `liveParts`, which is exactly
    // what that surface is for (C24 §7, I24).
    const ctx = producerContext();
    const bad: string[] = [];
    let rendered = 0;
    const docs = Object.values(DOCUMENTS).flatMap((build) => build());
    for (const d of docs) {
      for (const part of liveParts(d)) {
        let value: unknown;
        try {
          value = await part.spec.fetch();
        } catch {
          // The always-failing source is deliberate; its error arm is a block too.
          if (part.spec.renderError === undefined) { bad.push(`${part.spec.id}: fails and has no renderError`); continue; }
          try { expectDocument(as(d.command, [...d.blocks, part.spec.renderError(new Error("x"), 1000, 1)])).isValid(); }
          catch (err) { bad.push(`${part.spec.id} error arm: ${String(err)}`); }
          rendered += 1;
          continue;
        }
        const data = part.spec.derive === undefined ? value : part.spec.derive.compute(value, undefined);
        try {
          expectDocument(as(d.command, [...d.blocks, part.spec.render(data, ctx)])).isValid();
          rendered += 1;
        } catch (err) {
          bad.push(`${part.spec.id}: ${err instanceof Error ? err.message.split("\n")[1] ?? err.message : String(err)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // The gallery's walk (twice — sample and greeting), one per buildable
    // `/live`, the monitor, and the three faults.
    expect(rendered, "live frames rendered").toBe(2 + (FORMS.length - refusals().length) + 1 + 3);
  });

  it("T-doc6: and every one of them paints, at two widths", () => {
    // **Valid is not the same as drawn.** C04 I14 refuses a document before a
    // frame exists, which is the defect above; a document that passes the
    // validator can still throw in a renderer or lay a row wider than the
    // terminal, and the reader's complaint was *nothing happens*, not *the
    // document is illegal*. `rendersAt` runs the real registry and fails on a
    // row that overruns — the wrap that scrolls the alternate screen.
    const bad: string[] = [];
    for (const [name, build] of Object.entries(DOCUMENTS)) {
      for (const d of build()) {
        try {
          expectDocument(d).rendersAt([80, 120]);
        } catch (err) {
          bad.push(`${name}: ${d.command} — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("T-doc5: /compare validates for every form, on both arms", async () => {
    const bad: string[] = [];
    for (const form of FORMS) {
      const blocks = await compare(form, 0, "kitty");
      try {
        expectDocument(as(`compare ${form}`, blocks)).isValid();
      } catch (err) {
        bad.push(`${form}: ${err instanceof Error ? err.message.split("\n")[1] ?? err.message : String(err)}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
