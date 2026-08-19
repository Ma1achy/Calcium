// C04 I57 — `ohlc`, and the three refusals that keep a candle a candle.
//
// **Two gates and three rulings, so six places a half-landed change can hide.**
// The validator is where an untrusted document finds out and `b.plot` is where
// an author does, and either alone leaves the other reading as covered.
//
// **The pair worth naming is the geometry read.** `low > min(open, close)` and
// `high < max(open, close)` are two halves of one inequality, and the obvious
// fixture — a bar with everything wrong — satisfies both halves at once. A
// mutation binding `low` to `bar.open` survived sixteen assertions at each
// gate, because the only inverted bar in the suite faulted on both sides. The
// rows that see it fault on exactly one side each, which is the same shape
// T1.12b has for `yFormat`: a suite indexed by rules tests each against itself
// and agrees.
//
// **And the finite check has to fire before the geometry reads.** `Number(null)`
// is 0 and `Number(undefined)` is `NaN`; the first passes the inequalities
// outright and the second makes every comparison false, so a malformed bar is
// accepted in silence either way.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const VALIDATE = "src/data/viewmodel/validate.ts";
const BUILDERS = "src/shell/builders/index.ts";
const GEOMETRY = "if (low > Math.min(open, close) || high < Math.max(open, close)) {";
const B_GEOMETRY =
  "if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/edge/view-model.test.ts 2>&1", { cwd: ROOT, encoding: "utf8" });
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
    from: GEOMETRY,
    to: "if (false as boolean) {",
    why: "T3.25 asserts an inverted bar is refused at both gates; a geometry check that never fires cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The style with nothing to draw, accepted. `series: []` is legal, so the
      // block renders as an empty line plot and says nothing about the field
      // the caller filled in.
      name: "the validator accepts `candlestick` with no `ohlc`",
      file: VALIDATE,
      from: '      if (ohlc === undefined) {\n        e.push(\n          `${at}: "plotStyle" is "candlestick" and there is no "ohlc"',
      to: '      if (false as boolean) {\n        e.push(\n          `${at}: "plotStyle" is "candlestick" and there is no "ohlc"',
      expect: "T3.25",
    },
    {
      name: "the builder accepts `candlestick` with no `ohlc`",
      file: BUILDERS,
      from: "    if (ohlc === undefined) {\n      throw new TypeError(",
      to: "    if (false as boolean) {\n      throw new TypeError(",
      expect: "T3.25",
    },
    {
      // A curve style on a form that has no curve. The renderer's form arm
      // takes precedence, so the style is simply ignored — a member that reads
      // as one not yet implemented.
      name: "the validator accepts `candlestick` on any form",
      file: VALIDATE,
      from: '      if (form !== "line" && form !== "step") {',
      to: "      if (false as boolean) {",
      expect: "T3.25",
    },
    {
      // The **resolved** form, not the parameter: `b.plot` defaults `form` to
      // `line` in its literal, so a check on the parameter refuses the ordinary
      // call that omits it. This mutation makes the default disagree.
      name: "the builder resolves an omitted form to something it then refuses",
      file: BUILDERS,
      from: '    const drawn = form ?? "line";',
      to: '    const drawn = form ?? "pie";',
      expect: "T3.26",
    },
    {
      // **The bind, not the inequality.** Everything still compiles and an
      // all-wrong bar is still refused; only a bar whose sole fault is its low
      // can tell.
      name: "the validator reads `open` where it means `low`",
      file: VALIDATE,
      from: 'const [open, high, low, close] = [bar["open"], bar["high"], bar["low"], bar["close"]]',
      to: 'const [open, high, low, close] = [bar["open"], bar["high"], bar["open"], bar["close"]]',
      expect: "T3.25",
    },
    {
      name: "the builder reads `open` where it means `low`",
      file: BUILDERS,
      from: B_GEOMETRY,
      to: "if (bar.open > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {",
      expect: "T3.25",
    },
    {
      // One half of the inequality. Each half is a restatement of its own rule,
      // and a fixture faulting on both sides agrees with either alone.
      name: "the validator checks only the low half",
      file: VALIDATE,
      from: GEOMETRY,
      to: "if (low > Math.min(open, close)) {",
      expect: "T3.25",
    },
    {
      name: "the validator checks only the high half",
      file: VALIDATE,
      from: GEOMETRY,
      to: "if (high < Math.max(open, close)) {",
      expect: "T3.25",
    },
    {
      // Touching is legal — `low === open` and `high === close` is a marubozu,
      // not a fault. A strict inequality refuses every candle whose body
      // reaches its wick, which is most of them.
      name: "the inequality goes strict, refusing a marubozu",
      file: VALIDATE,
      from: GEOMETRY,
      to: "if (low >= Math.min(open, close) || high <= Math.max(open, close)) {",
      expect: "T3.25",
    },
    {
      // `Number(null)` is 0 and `Number(undefined)` is `NaN`. Without this
      // gate the geometry reads a bar that is not four numbers and agrees.
      name: "the four-finite-numbers gate goes away",
      file: VALIDATE,
      from: "if (!isRecord(bar) || !OHLC_KEYS.every((k) => isFiniteNumber(bar[k]))) {",
      to: "if (!isRecord(bar)) {",
      expect: "T3.25",
    },
    {
      name: "the vocabulary loses its new arm",
      file: VALIDATE,
      from: "  auto: true, braille: true, line: true, candlestick: true,",
      to: "  auto: true, braille: true, line: true,",
      expect: "T3.26",
    },
    {
      // MG27's subject, asserted from the suite as well as from the gate: a
      // parameter accepted, destructured and left out of the literal throws
      // nothing and type-checks.
      name: "b.plot drops `ohlc` from the constructed literal",
      file: BUILDERS,
      from: "      ...(ohlc === undefined ? {} : { ohlc }),\n",
      to: "",
      expect: "T3.26",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
