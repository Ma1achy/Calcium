// The animation catalogue's generator, mutated.
//
// **Every mutation here is a defect that has already shipped once**, which is
// what makes the run worth having rather than a formality.
//
// `FROZEN-ELAPSED` and `FROZEN-RETRY` restore `status-proof.mjs`'s two GIFs
// exactly: `elapsedMs: 4000` and `retryInMs: 8000` held constant across every
// frame, so the spinner turned and the numbers beside it stood still. That
// artefact was built to prove F227 fixed and reproduced F227's failure mode, and
// its fixture — sixteen assertions over three rows — agreed, because it covers
// `steps`, which carries no numbers.
//
// `TICK-FROZEN` is F227 itself: the counter never advancing.
//
// `CATEGORIES-BACK` is F420: the ring block declaring `categories` where a
// matrix reads `series[].label`. A heatmap of eight anonymous rows is a correct
// picture of the wrong thing, and the demo shipped it.
//
// `CHANNELS-THREE` is F419, in the assembler rather than the generator. It was
// nearly written as an expected survivor — *the kill for this one is a person
// looking at a picture* — and that was giving up one step early: the question a
// frame assertion cannot ask is whether the bytes coming **out** of the encoder
// carry the colours that went in, and nothing stopped a test from asking it.
// AP9 does, on two flat pages read back page by page. A run with a standing
// expected survivor teaches its reader to skim the survivors column.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/animation-proof.test.ts";
const GEN = "tools/animation-proof.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: GEN,
    from: "const PLOT_FRAMES = 100;",
    to: "const PLOT_FRAMES = 7;",
    why: "AP2 asserts 100 frames on all four plot subjects; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // **`status-proof.mjs`'s shipped defect, restored.** The counter stops and
      // the spinner keeps turning — which is what a reader sees as *working*.
      name: "FROZEN-ELAPSED: the loading counter stops moving",
      file: GEN,
      from: "            elapsedMs: i * interval,",
      to: "            elapsedMs: 4000,",
      expect: "AP3",
    },
    {
      name: "FROZEN-RETRY: the countdown stands at its opening value",
      file: GEN,
      from: "            retryInMs: inFirst ? FIRST_BACKOFF - t : Math.max(0, FIRST_BACKOFF * 2 - (t - FIRST_BACKOFF)),",
      to: "            retryInMs: FIRST_BACKOFF,",
      expect: "AP4",
    },
    {
      // The attempt never increments — one backoff drawn as two.
      name: "ONE-ATTEMPT: the attempt number stops at 2",
      file: GEN,
      from: "            attempt: inFirst ? 2 : 3,",
      to: "            attempt: 2,",
      expect: "AP4",
    },
    {
      // **F227 itself.** `steps-after` is the counter moving; freezing the tick
      // makes it identical to `steps-before`, which is the state the tree
      // shipped in for the life of the project.
      name: "TICK-FROZEN: steps-after stops advancing",
      file: GEN,
      from: '      frames: Array.from({ length: setFrames }, (_, tick) => ansiFor(STEPS, 34, tick)),',
      to: '      frames: Array.from({ length: setFrames }, () => ansiFor(STEPS, 34, 0)),',
      expect: "AP5",
    },
    {
      // **F420.** The row labels vanish and the heatmap stays a correct picture.
      name: "CATEGORIES-BACK: the ring declares categories a matrix does not read",
      file: GEN,
      from: "  series: rows.map((values, i) => ({ values, label: `core ${String(i)}` })),",
      to: "  categories: rows.map((_v, i) => `core ${String(i)}`),\n  series: rows.map((values) => ({ values })),",
      expect: "AP8",
    },
    {
      // The window stops sliding — every frame the same picture, which is the
      // duplicated-frame failure a GIF plays perfectly smoothly.
      name: "WINDOW-FIXED: every frame shows the same window",
      file: GEN,
      from: "    out.push(series.slice(Math.max(0, end - WINDOW), end));",
      to: "    out.push(series.slice(0, WINDOW));",
      expect: "AP2",
    },
    {
      // **A subject dropped from the builder.** AP1 compares two independent
      // records — the built map against `SUBJECT_NAMES` — so a coverage set
      // taken from the thing under test cannot shrink silently.
      name: "SUBJECT-DROPPED: the SVG heatmap stops being built",
      file: GEN,
      from: '    "ring-svg": {\n      arm: "svg",',
      to: '    "ring-svg-DROPPED": {\n      arm: "svg",',
      expect: "AP1",
    },
    {
      // **The channel count is the assembler's and its damage is entirely in
      // the encoded file**: sheared, tripled, green. Every frame this fixture
      // asserts is identical either way, which is why AP9 reads the bytes back
      // out of the GIF instead.
      //
      // **Two edits, and the pass is what said so.** Written as the one-line
      // `channels = 3` it **survived**, and the survivor was right: with
      // `flatten` in place the raster genuinely *is* three channels, so
      // hard-coding 3 is a no-op and the mutation no longer constructs the
      // defect it names. The fix has two halves and only one of them is
      // load-bearing — `flatten` composites the alpha away, and reading the
      // count back is what keeps that true if anyone removes it. So the mutation
      // has to remove both, which is the code exactly as it shipped.
      name: "CHANNELS-THREE: four-channel raster declared as three again (F419)",
      file: "tools/catalogue-png.mjs",
      from: "        .flatten({ background: BG })\n",
      to: "",
      also: [
        {
          file: "tools/catalogue-png.mjs",
          from: "  const channels = raws[0].info.channels;",
          to: "  const channels = 3;",
        },
      ],
      expect: "AP9",
    },
  ],
});

// **`report` returns a string; it does not print.** The first form of this file
// ended `report(results);` — every mutation ran, every result was computed, and
// the process printed nothing and exited 0. That is *a gate that exists and is
// not run*, in the file written to apply the discipline: an exit status is one
// bit and it is the same bit for **clean** and for **did not run**, which is
// exactly what the harness's own header warns about one directory up.
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
