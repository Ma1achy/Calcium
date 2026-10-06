// A spinner steps at its own set's interval (C09 I112, C22 I74) — and at the
// ASCII rung, at the rung's one cadence (question 40).
//
// **Each mutation leaves every spinner turning.** What moves is the rate: the
// counter counted in the fastest interval on screen, or a set's frame read off
// the counter directly, which is the state before I112 — every set at the
// fastest set's rate, and a speed decided by what else is on screen.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/spinners.test.ts test/integration/orbit-wiring.test.ts " +
  "test/unit/stream-trail.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const SESSION = "src/shell/session.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **As it shipped**: the counter in the fastest interval on screen, so an
    // `agent`-only screen counts ten in 1200 ms and not fifteen.
    name: "the session counts in the wake's interval",
    file: SESSION,
    from: "      const steps = Math.floor((now - (this.#tickAt ?? now)) / TICK_MS);",
    to: "      const steps = Math.floor((now - (this.#tickAt ?? now)) / spinnerMs);",
    expect: "T4.17v",
  },
  {
    // **As it shipped, one layer up**: the frame is the counter, so `agent`
    // changes on every tick.
    name: "the frame ignores the set's interval",
    file: GLYPHS,
    from: "  const step = Math.floor((tick * TICK_MS) / spinnerIntervalMs(name, caps));",
    to: "  const step = tick;",
    expect: "T1.78",
  },
  {
    // **A renderer reading the counter directly** — the helper bypassed at the
    // one site `agent` draws in a transcript.
    name: "the agent mark indexes the counter itself",
    file: SIMPLE,
    from: '  const frame = spinnerFrameAt(ctx.capabilities, glyphTick(ctx.tick, ctx.motion), "agent");',
    to: '  const frame = spinnerFrameAt(ctx.capabilities, Math.floor((glyphTick(ctx.tick, ctx.motion) * 120) / 80), "agent");',
    // **Survived its first run against T1.63 and T1.78**: the one checks the
    // mark moves and the other checks the helper, and neither reads the frame a
    // kind draws. T1.79 was written from the survivor.
    expect: "T1.79",
  },
  {
    // The same bypass at `status`, which draws the set the block declares.
    name: "a status indexes its set by the counter",
    file: "src/presentation/blocks/kinds/status.ts",
    from: "spinnerFrameAt(ctx.capabilities, glyphTick(ctx.tick, ctx.motion), block.spinner)",
    to: "spinnerFrameAt(ctx.capabilities, Math.floor((glyphTick(ctx.tick, ctx.motion) * spinnerIntervalMs(block.spinner)) / 80), block.spinner)",
    expect: "T1.79",
  },
  {
    // **Question 40, the lookup**: the rung ignored, so every ASCII rung turns
    // at its set's own interval — nine rates for one `|/-\` alphabet.
    name: "the ASCII rung takes the set's own interval",
    file: GLYPHS,
    from: "  return caps !== undefined && atAsciiRung(caps, set) ? ASCII_INTERVAL_MS : set.intervalMs;",
    to: "  return set.intervalMs;",
    expect: "T2.73",
  },
  {
    // The frame stepped at the Unicode rung's interval while the ASCII frames
    // are drawn: the helper asked without the capabilities it was handed.
    name: "the frame steps at the set's own interval at ASCII",
    file: GLYPHS,
    from: "/ spinnerIntervalMs(name, caps));",
    to: "/ spinnerIntervalMs(name));",
    expect: "T2.73",
  },
  {
    name: "the ASCII cadence is 110 ms, not the registry's 120",
    file: GLYPHS,
    from: "const ASCII_INTERVAL_MS = 120;",
    to: "const ASCII_INTERVAL_MS = 110;",
    expect: "T2.73",
  },
  {
    // `narrowOnly` at `wide` draws the ASCII frames; the cadence forgot it.
    name: "the cadence's rung ignores a narrow-only set at wide",
    file: GLYPHS,
    from: '  return caps.unicode === "ascii" || (set.narrowOnly === true && caps.ambiguousWidth === "wide");',
    to: '  return caps.unicode === "ascii";',
    expect: "T2.73",
  },
  {
    // **The wake**: a status asks for its set's own cadence whatever the rung.
    name: "a status's wake ignores the capabilities",
    file: "src/presentation/blocks/animation.ts",
    from: "spinnerIntervalMs(status.spinner, caps)",
    to: "spinnerIntervalMs(status.spinner)",
    expect: "T2.73",
  },
  {
    // **The wiring**: the session asks for the cadence without handing down
    // the capabilities, so the function is right and its caller is not.
    name: "the session's wake is asked without the capabilities",
    file: SESSION,
    from: "animationIntervalOf(windowed.blocks, { tick, width }, graph.capabilities)",
    to: "animationIntervalOf(windowed.blocks, { tick, width })",
    expect: "T4.17v",
  },
  {
    // And at `tape`, whose running member draws `agent`.
    name: "a tape's running member indexes the counter",
    file: "src/presentation/blocks/kinds/tape.ts",
    from: "spinnerFrameAt(ctx.capabilities, glyphTick(ctx.tick, ctx.motion), TAPE_SPINNER)",
    to: "spinnerFrameAt(ctx.capabilities, Math.floor((glyphTick(ctx.tick, ctx.motion) * 120) / 80), TAPE_SPINNER)",
    expect: "T1.79",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): the unit halved, so every set
    // turns twice as fast and the counter doubles.
    file: GLYPHS,
    from: "export const TICK_MS = 80;",
    to: "export const TICK_MS = 40;",
    why: "the tick's unit halved — if this survives, nothing reads the unit",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
