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
import { b, completeLocal } from "@fmx/calcium";
import { expectDocument, liveParts, producerContext } from "@fmx/calcium/testing";
import type { Block, ViewDocument, TerminalCapabilities } from "@fmx/calcium";
import { CATALOGUE, everyVariant, FORMS, refusals, variantsOf } from "../src/catalogue.ts";
import type { Entry } from "../src/catalogue.ts";
import {
  adaptSample, compare, everyForm, faults, formFull, greetingDocument, images, liveFor, monitor, mosaics, rungs, unknown,
} from "../src/commands.ts";
import { manifest } from "../src/manifest.ts";

const run = promisify(execFile);
const here = (p: string): string => new URL(p, import.meta.url).pathname;

/** What `T-doc8` reads off a live part — `LivePart.spec`'s three relevant members. */
type LiveSpec = Readonly<{
  every: number;
  fetch: () => Promise<unknown>;
  render: (v: unknown, ctx: ReturnType<typeof producerContext>) => Block;
}>;

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
    // 48 since `sankey` (C12 §3ap, 2026-09-04).
    expect(Object.keys(CATALOGUE), "every form the union declares").toHaveLength(48);
    expect(all, "a figure reached past the builder to `block({ … })`").not.toMatch(
      /\bblock\s*\(\s*\{/,
    );
    expect(all, "a figure reached for the testing surface").not.toMatch(
      /from "@fmx\/calcium\/testing"/,
    );
  });

  it("every form the type declares has an entry, and all 47 now build (C24 I30)", () => {
    // **The count is 46 and not 42**, which is the point of the entry shape. A
    // catalogue that omits what it cannot construct reports complete — F313's
    // contact sheet and F350's corpus, both. Four were entries naming the field
    // the published builder did not declare, and `b.plot` declares all eight now
    // (F335, C24 §4b) — so the honest assertion flipped rather than went away.
    // 48 since `sankey` (C12 §3ap, 2026-09-04).
    expect(FORMS).toHaveLength(48);
    expect([...refusals()].sort(), "nothing the union declares is unbuildable").toEqual([]);

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
    expect(built, "48 since `sankey` (C12 §3ap)").toBe(48);
  });

  it("T-eight (C24 I30, F335): the eight `b.plot` omitted are all on it now", () => {
    // **This row used to assert the opposite, over the four refusals**, and with
    // the refusals gone it would have iterated an empty set and passed — a claim
    // that reads as coverage and checks nothing. So it is inverted rather than
    // deleted: the same source, the same signature slice, the true statement.
    //
    // Four of the eight were a form's **only** datum, which is why four forms
    // could not be built at all: `offsets` for `gantt`, `totals` for `waterfall`,
    // `facets` for both delegating forms. Two are defaulted choices and two
    // became readable in both arms this arc.
    const builder = readFileSync(here("../../../src/shell/builders/index.ts"), "utf8");
    const sig = builder.slice(builder.indexOf("function plot("), builder.indexOf("): Plot {"));
    const EIGHT = [
      "layout", "binning", "offsets", "totals",
      "facets", "emptyMessage", "xScale", "yScale",
    ];
    const absent = EIGHT.filter((m) => !new RegExp(`^\\s{4}${m}\\??:`, "mu").test(sig));
    expect(absent, "every member F335 measured is declared by the published builder").toEqual([]);
  });

  it("T-refuse: the refusal shape still works, for the form that lands before its builder", () => {
    // **A mechanism with no instance, kept and exercised rather than assumed.**
    // `CATALOGUE` is `Record<PlotForm, Entry>`, so a form added to the union is a
    // compile error until it has an entry — and the union has grown several times
    // in this project. The next one may arrive before `b.plot` can build it, and
    // this is the shape that entry takes: a reason naming the missing field, drawn
    // as a notice, counted in the total rather than omitted from it.
    //
    // Exercised through the same branch `/all` and `/form` take, so it is live
    // code with a caller rather than an affordance nobody has run.
    const entry: Entry = {
      says: "a form with no builder",
      at: () => ({ refused: "`nothing` is not declared on `b.plot`", needs: "nothing" }),
    };
    const drawn = entry.at(0, 8);
    expect("refused" in drawn, "the branch every composer takes").toBe(true);
    if (!("refused" in drawn)) throw new Error("unreachable");
    expect(drawn.needs).toBe("nothing");
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
    // **76, where it was 65** — eleven rungs for the half of `plot3d` the
    // catalogue had no entry for at all. Five style arms were reachable and the
    // *surface* was not: `surfaces3`, `wireframe`, `shading`, `closed`, `box3`,
    // `axes3`, `axisStyle3` and `camera.projection` are members `b.plot` takes
    // and no consumer named, which is exactly the count
    // `publicSurfaceUseSignal` reports. Three of them draw real meshes —
    // Suzanne, the teapot and the Stanford bunny — parsed by the example's own
    // OBJ reader, because a second consumer written from the published surface
    // is an instrument and the framework's fixtures are not one.
    expect(everyVariant().length, "rungs beyond the defaults").toBe(76);
    // **47 + 65, where it was 47 + 60** — `plot3d` is the forty-seventh form
    // and it arrives buildable, which is what a builder gaining the members with
    // the form looks like from here.
    //
    // **It added no rung and now adds five**, which is the sentence this comment
    // used to end on and the reason to correct it rather than only the number:
    // `plotStyle` selected nothing on this form, so its variants were the
    // reference frame's and `everyVariant` counted members `b.plot` gained that
    // the forms do not exercise. Three arms later the member selects three
    // things, and a caller naming one is exactly the second claim this count is
    // about (C24 I30, C12 I99 · I100 · I101).
    // 124 since `sankey`'s entry joined `/all` (C12 §3ap, 2026-09-04).
    expect(FORMS.length - refusals().length + everyVariant().length, "figures /all draws").toBe(124);
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
    // **`rungs` holds blocks of a kind the app registered**, which `expectDocument`
    // validates because C04's union is open — *an unknown kind is not an error: the
    // union is open and an app registers kinds through C09.* Its renderer throws by
    // design, so `T-doc6` is where it is exercised as a *frame*.
    rungs: () => [as("rungs", [rungs()])],
    mosaic: () => [as("mosaic", [mosaics(0)])],
    // **The two refusing fixtures are the reason this row is here** (F413).
    // `depth16.png` and `interlaced.png` are PNGs `decodePng` will not read, and
    // the document must still validate and compose: the block carries its bytes
    // and its extent, and it is the *arm* that refuses, at render, not the
    // document. A row that only held readable images would pass on the day the
    // refusal moved back onto the block.
    image: () => [as("image", [images()])],
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
    // 46 forms twice, plus /all, /faults, /monitor, /rungs, /mosaic, /image
    // and sample's two — eight singletons. The count is asserted so a document
    // appearing or vanishing has to be attributed rather than noticed: `/image`
    // is what moved this from seven.
    expect(checked, "documents built").toBe(FORMS.length * 2 + 8);
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
          // **The default is the framework's and it is now `b.status`** (C24 I30).
          // This row used to require the *app* to supply a `renderError`, which was
          // right when a notice was the only thing an override could return and is
          // wrong now: declining to override is how a part gets the real box. So
          // the arm under test is the declarer's where there is one and the
          // framework's where there is not — the same construction either way,
          // which is the anti-drift claim T1.6b makes on the other side.
          const arm = part.spec.renderError ?? ((e, r, a) => b.status(e, r, a));
          try { expectDocument(as(d.command, [...d.blocks, arm(new Error("x"), 1000, 1)])).isValid(); }
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
    // The gallery's walk (twice — sample and greeting), one per `/live`, the
    // monitor, and the six faults.
    expect(rendered, "live frames rendered").toBe(2 + (FORMS.length - refusals().length) + 1 + 6);
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

  /**
   * A full-capability record, written here because the demo's suite has none.
   *
   * `expectDocument` and the framework's own `FULL_CAPS` are `src/testing`'s and
   * `test/support`'s; an example is a consumer and reaches neither, which is the
   * same gap `TuiConfig.capabilities` fills for `--ambiguous-wide`.
   */
  const FULL = {
    colourDepth: 24, unicode: "full", ambiguousWidth: "narrow",
    backgroundPolarity: "dark", synchronisedUpdate: true, bracketedPaste: true,
    mouse: true, imageProtocol: "none", keyboardProtocol: "none", altScreen: true,
  } as const satisfies TerminalCapabilities;

  // **The row was named for coverage it did not have** (F415). It said *on both
  // arms* and passed `"kitty"` — one arm, and the name is what a reader checks.
  // There are now four rungs below the caption's decision, so the set is named
  // rather than counted, and each is a capability record `rungSays` must answer
  // differently.
  const ARMS = [
    ["protocol", { ...FULL, imageProtocol: "kitty" as const }],
    ["half block", { ...FULL, imageProtocol: "none" as const }],
    ["braille", { ...FULL, imageProtocol: "none" as const, ambiguousWidth: "wide" as const }],
    ["ascii ramp", { ...FULL, imageProtocol: "none" as const, unicode: "ascii" as const }],
  ] as const;

  it("T-doc5: /compare validates for every form, on every arm of the ladder", async () => {
    const bad: string[] = [];
    for (const [name, caps] of ARMS) {
      for (const form of FORMS) {
        const blocks = await compare(form, 0, caps);
        try {
          expectDocument(as(`compare ${form}`, blocks)).isValid();
        } catch (err) {
          bad.push(`${name}/${form}: ${err instanceof Error ? err.message.split("\n")[1] ?? err.message : String(err)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 240_000);

  it("T-doc7 (C09 I37, F415): the caption names the arm that actually drew", async () => {
    // **F394 and F415 are one defect twice**: a caption that names an arm the
    // renderer did not take reads as a broken renderer. The ladder grew a rung
    // and the label kept its two, so a frame in colour was captioned *braille*.
    const said = new Map<string, string>();
    for (const [name, caps] of ARMS) {
      const blocks = await compare("bar", 0, caps);
      const text = JSON.stringify(blocks);
      said.set(name, text);
    }
    expect(said.get("protocol")).toContain("pixels");
    expect(said.get("half block")).toContain("half blocks");
    expect(said.get("braille")).toContain("braille");
    expect(said.get("ascii ramp")).toContain("ASCII ramp");
    // **Four captions, four strings.** A ladder whose label collapses two rungs
    // is exactly what shipped, and a set compared by size is what notices.
    const captions = new Set(
      [...said.values()].map((t) => /svg · ([^"]+)/u.exec(t)?.[1] ?? ""),
    );
    expect(captions.size, "each arm must caption itself differently").toBe(ARMS.length);
  }, 120_000);

  it("T-doc8 (F504, F509): the data-dependent rungs advance and the static ones are still", async () => {
    // **F504 was that every rung drew stills because the camera phase was
    // discarded. F509 removes the camera phase entirely**: the framework's own
    // orbit is delta-timed and bound to `o`, so the demo should not reimplment
    // it. Only the base entry's helix passes the phase into its data — every
    // rung whose `spec` overrides carry static geometry (meshes, height fields,
    // furniture) is correctly still between ticks, and the orbit is the reader's.
    //
    // **Driven through `liveParts` rather than by calling `entry.at` twice**,
    // because the phase reaching the figure is the wiring and not the
    // mechanism: a row that calls the generator directly passes on the day
    // nothing calls it that way.
    const ctx = producerContext();
    const advancing: string[] = [];
    const still: string[] = [];
    const names = Object.keys(variantsOf("plot3d"));
    expect(names.length, "the form has rungs to animate").toBeGreaterThan(10);
    for (const rung of [undefined, ...names]) {
      const doc = as(`live plot3d ${rung ?? ""}`, liveFor("plot3d", rung));
      const parts = liveParts(doc);
      expect(parts, `${String(rung)} declares one live part`).toHaveLength(1);
      const spec = (parts[0] as { spec: LiveSpec }).spec;
      const frames: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        frames.push(JSON.stringify(spec.render(await spec.fetch(), ctx)));
      }
      if (frames[0] !== frames[1] && frames[1] !== frames[2]) advancing.push(rung ?? "(default)");
      else still.push(rung ?? "(default)");
    }
    // **Every rung is correctly still between ticks** (F509). The data is
    // static — the helix is constant, the meshes are vendored, the height
    // fields are generated at phase 0 — and the camera is the reader's. A rung
    // that advances between ticks would be reimplmenting the orbit the
    // framework delta-times and binds to `o`.
    expect(advancing, "all plot3d rungs are still between data ticks — the orbit is the reader's").toEqual([]);

    // **The bunny is 365 ms a frame against a 200 ms default**, so it names its
    // own tick rather than being asked for a frame it cannot deliver. Asserted
    // as an inequality against the default, because the number is a measurement
    // and the ruling is that it must exceed the tick it would otherwise get.
    const tickOf = (rung?: string): number => {
      const parts = liveParts(as("live", liveFor("plot3d", rung)));
      return (parts[0] as { spec: LiveSpec }).spec.every;
    };
    expect(tickOf(), "the default rung takes the default tick").toBe(200);
    expect(tickOf("bunny"), "and the bunny asks for longer").toBeGreaterThan(tickOf());
  }, 120_000);
});
