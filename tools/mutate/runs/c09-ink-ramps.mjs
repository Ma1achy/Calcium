// C04 I106, C04 I107, C04 I108, C04 I109, C09 I50–I54, C10 I36–I37 — the ink
// ramps, mutated at the gate,
// the split, the bar, the cadence and the ladder.
//
// Every mutation is a shape the design walked past or the landing measured: the
// gate admitting two backings, `at` counted from the run so a wrapped span restarts,
// the bar over its filled length, the cadence read from `ANIMATES` alone, motion
// surviving 4-bit, the 1-bit answer being `to`, a code-unit split through a ZWJ
// family, a palette taking a name, and a millisecond literal where the lookup is.
// The control is the arity check itself — T1.29 runs its table on both carriers,
// so a green control would mean the validator is not what the rows read.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/spans.test.ts test/contract/spans.test.ts test/edge/spans.test.ts test/revert/spans.test.ts test/integration/ramps.test.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const RUNS = "src/presentation/runs.ts";
const PAINT = "src/presentation/blocks/paint.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const ANIMATION = "src/presentation/blocks/animation.ts";
const RAMP = "src/presentation/blocks/ramp.ts";
const THEME_RAMP = "src/presentation/theme/ramp.ts";

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
    file: VALIDATE,
    from: "    if (hasPair === hasMap) {",
    to: "    if (false) {",
    why: "T1.29 runs the arity table on both carriers; a gate that admits two backings or none fails its both-backings and no-backing rows on the span and on the bar",
  },
  mutations: [
    {
      // C09 I51 (T2.119, T6.95) — `at` restarts on the second row of a wrapped span.
      name: "a wrapped span restarts its ramp on the next row",
      file: RUNS,
      from: "  return { ...sliced, ramp: { ramp: ramp.ramp, at: ramp.at + before, of: ramp.of - after, ordinal: ramp.ordinal } };",
      to: "  return { ...sliced, ramp: { ramp: ramp.ramp, at: ramp.at, of: ramp.of - after, ordinal: ramp.ordinal } };",
      expect: "T2.119",
    },
    {
      // C09 I51 (T2.119) — split by code unit: an escape lands inside the ZWJ family.
      name: "the split is by code unit, not by cluster",
      file: PAINT,
      from: "    const clusters = graphemes(run.text);",
      to: "    const clusters = [...run.text];",
      expect: "T2.119",
    },
    {
      // C09 I52 (T2.119, T6.96) — the brief's other answer: the ramp compresses as the bar shortens.
      name: "the bar's extent is its filled length",
      file: SIMPLE,
      from: "            const t = animateT(block.ramp?.animate, extentT(i, barWidth), effectiveTick(ctx.tick, ctx.capabilities), barWidth, i);",
      to: "            const t = animateT(block.ramp?.animate, extentT(i, filled), effectiveTick(ctx.tick, ctx.capabilities), filled, i);",
      expect: "T2.119",
    },
    {
      // C09 I54 (T2.120, T4.8) — F227 restored by content: the cadence reads the kind alone.
      name: "tickIntervalOf reads ANIMATES alone",
      file: ANIMATION,
      from: "  return animatesByContent(block) ? rampCadenceMs() : null;",
      to: "  return null;",
      expect: "T2.120",
    },
    {
      // C10 I36 (T3.35) — motion below 8-bit: three colours moving is a flicker.
      name: "motion survives 4-bit",
      file: RAMP,
      from: "  return caps.colourDepth >= 8 ? (tick ?? 0) : 0;",
      to: "  return tick ?? 0;",
      expect: "T3.35",
    },
    {
      // C10 I36 (T1.38, C09 T3.71) — the 1-bit answer is `to`, or a midpoint nobody named.
      name: "1-bit resolves to `to`",
      file: THEME_RAMP,
      from: '  return resolveTone(ramp.from ?? "default", theme, caps);',
      to: '  return resolveTone(ramp.to ?? "default", theme, caps);',
      expect: "T1.38",
    },
    {
      // C04 I106 (T1.29) — a palette with a colormap: a second categorical vocabulary (F837).
      name: "a palette takes a colormap",
      file: VALIDATE,
      from: "    if (hasPair || hasMap) {",
      to: "    if (hasPair) {",
      expect: "T1.29",
    },
    {
      // C04 §3am.2 (T2.119) — a palette per cluster: five words, five rainbows, the first frame read.
      name: "a palette cycles per cluster",
      file: PAINT,
      from: '      const sampled = rampStyle(ramp, t, ramp.fill === "palette" ? ordinal : index, ctx.theme, ctx.capabilities);',
      to: "      const sampled = rampStyle(ramp, t, index, ctx.theme, ctx.capabilities);",
      expect: "T2.119",
    },
    {
      // C09 I53 (T1.28) — the number lives in C03; a copy here drifts the day the window moves.
      name: "the cadence is a millisecond literal",
      file: RAMP,
      from: "  return spinnerIntervalMs();",
      to: "  return 100;",
      expect: "T1.28",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
