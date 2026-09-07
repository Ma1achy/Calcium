// C12 I54, §3af — the alphabet is the terminal's and the style is the caller's.
//
// **Four of these are the four sites, restored.** Each was a different mechanism
// — a table chosen from `corners`, a branch on the wrong capability, and two
// arms read off `plotStyle` — and all four produced the same output, which is
// why AA1 is one row over the whole corpus rather than a row per form.
//
// **The last two are about the *shape* of the fix rather than its presence.**
// Degrading `lineDrawRows` to `curveRows` keeps every frame ASCII and passes
// AA1, and loses the connectivity that is the whole content of
// `plotStyle: "line"` — so it is AA2 that has to catch it. And returning the
// catalogue's arm to the conflated `ascii-wide` is an **expected survivor**: the
// corpus is not the gate, and a fixture that varies two capabilities together
// cannot be made into one by adding frames.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LINEDRAW = "src/presentation/plot/linedraw.ts";
const DEF = "src/presentation/plot/definition.ts";
const HEAT = "src/presentation/plot/heatmap.ts";
const MARKS = "src/presentation/plot/marks.ts";
const CAT = "tools/plot-catalogue.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-catalogue.test.ts test/contract/expect-document.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const MUTATIONS = [
  {
    // **Site 1, as it shipped.** Twelve lines above an `ASCII` table whose
    // comment says every caller was emitting box-drawing regardless of
    // capability — the fix was made for the exported helper and never reached
    // the function above it.
    name: "`lineDrawRows` picks its table from `corners` alone",
    file: LINEDRAW,
    from: "  return mask.map((row) => row.map((m) => glyphForMask(m, corners, caps)).join(\"\"));",
    to: "  const t = corners === \"sharp\" ? SHARP : ROUNDED;\n  return mask.map((row) => row.map((m) => t[m] ?? \" \").join(\"\"));",
    expect: "AA1",
  },
  {
    // **Site 2.** The capability reaches the rasteriser and is dropped on the
    // way into it, which is the state `_caps` named.
    name: "the rasteriser discards its capability again",
    file: DEF,
    from: "    lineDrawRows(series, range, areaWidth, areaRows, corners, facing, interpolation, rasterCaps);",
    to: "    lineDrawRows(series, range, areaWidth, areaRows, corners, facing, interpolation);",
    expect: "AA1",
  },
  {
    // **Site 3.** Visible in the arm the corpus does render, and never read.
    name: "the contour's alphabet comes from `plotStyle` alone",
    file: HEAT,
    from: "    (block.plotStyle ?? \"auto\") !== \"line\" && ctx.capabilities.unicode !== \"ascii\";",
    to: "    (block.plotStyle ?? \"auto\") !== \"line\";",
    expect: "AA1",
  },
  {
    // **Site 4**, four call sites through one predicate.
    name: "the violin's alphabet comes from `plotStyle` alone",
    file: DEF,
    from: "    const brailleArm = block.plotStyle === \"braille\" && ctx.capabilities.unicode !== \"ascii\";",
    to: "    const brailleArm = block.plotStyle === \"braille\";",
    expect: "AA1",
  },
  {
    // **The separator**, which passes `checkMarks` correctly and fails the
    // contract — two instruments, two subjects.
    name: "the legend separator is `·` on every terminal",
    file: MARKS,
    // Re-anchored 2026-09-04: the wide arm takes the ASCII form too, because
    // `·` is two cells under that convention (F665, U6f).
    from: "  return caps.unicode === \"ascii\" || caps.ambiguousWidth === \"wide\" ? \" - \" : \" \\u00b7 \";",
    to: "  return \" \\u00b7 \";",
    expect: "AA1",
  },
  {
    // **The shape of the fix, not its presence.** Yielding to `curveRows` at
    // ASCII keeps every frame ASCII — AA1 passes — and draws a value ramp where
    // a connected line was asked for.
    name: "a line at ASCII falls back to the density ramp",
    file: DEF,
    from: "  const useLineDraw = ps === \"line\" || (auto && caps.ambiguousWidth !== \"wide\");",
    to: "  const useLineDraw = caps.unicode !== \"ascii\" && (ps === \"line\" || (auto && caps.ambiguousWidth !== \"wide\"));",
    expect: "AA2",
  },
  {
    // **Expected survivor**, and the row exists to say why. The corpus is a
    // fixture, not a gate: conflating the two capabilities again hides nothing
    // from AA1, which renders its own frames from `FORMS` and does not read
    // `CAPS` at all. It is what a reader *looking* at the catalogue would lose.
    name: "the catalogue's ASCII arm is wide again",
    file: CAT,
    from: '  { name: "ascii", caps: ASCII },\n  { name: "wide", caps: WIDE },',
    to: '  { name: "ascii-wide", caps: { ...ASCII, ambiguousWidth: "wide" } },',
    expect: "AA1",
  },
];

/**
 * Survivors with a reason. **The catalogue's arm is a fixture and AA1 is the
 * gate** — the assertion builds its own capability records, so no arrangement of
 * `CAPS` can hide anything from it. That is the point of C12 T6.58 and it is
 * only demonstrable as a survivor.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "the catalogue's ASCII arm is wide again",
    "AA1 renders from `FORMS` with its own capability records and never reads `CAPS`, so the " +
      "corpus's arrangement is what a reader loses and not what the suite loses (C12 T6.58)",
  ],
]);

const results = runPass({
  read,
  write,
  run,
  control: {
    file: MARKS,
    // Re-anchored 2026-09-04: the parameter is the whole alphabet now, because
    // `\u00b7` is Ambiguous and the separator depends on `ambiguousWidth` (F665, U6f).
    from: "export function partSeparator(caps: Alphabet): string {",
    to: "export function partSeparator(_caps: Alphabet): string {\n  return \"\\u00b7\\u00b7\";\n  // eslint-disable-next-line no-unreachable",
    why:
      "every legend, level list and overflow clause in the corpus takes this string, so a run " +
      "that cannot see a separator changed cannot see any row below it",
  },
  mutations: MUTATIONS,
});

console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length > 0 || stale.length > 0 ? 1 : 0);
