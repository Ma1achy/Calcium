// C04 I148, C09 I132, I133 — the hot edge's overshoot and the band by grapheme (review batch 4, M13.4, M13.5).
//
// **Each defect here draws a plausible band.** A trail without its lift is the
// gradient the tree drew for a year; a band counted in code points is right for
// every ASCII fixture; a stop allowed on a span is a colour the floor never
// proved, and nothing in a frame says so.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const RAMP = "src/presentation/theme/ramp.ts";
const TRAIL = "src/presentation/blocks/kinds/simple.ts";
const GATE = "src/data/viewmodel/validate.ts";
const TYPES = "src/data/viewmodel/types.ts";
const FILES = [
  "test/unit/stream-trail.test.ts",
  "test/contract/view-model.test.ts",
  "test/contract/spans.test.ts",
  "test/revert/view-model.test.ts",
  "test/revert/blocks.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every row here can see**: a slot pair samples black at 24-bit,
    // so the head, the knee, the band and the lift all disagree.
    file: RAMP,
    from: "  if (depth >= 24) return { colour: { kind: \"rgb\", hex: pairHex(ramp, tt, theme) } };",
    to: "  if (depth >= 24) return { colour: { kind: \"rgb\", hex: \"#000000\" } };",
    why: "every 24-bit slot-pair sample is black, so T1.82's lift and knee and T1.150's head all fail",
  },
  mutations: [
    {
      // **THE DEFECT at the sampler (C04 I148)**: the stop is carried and not
      // read, so the head is the accent exactly — the plain gradient.
      name: "THE DEFECT: the 24-bit sampler ignores overshoot",
      file: RAMP,
      from: "  if (depth >= 24) return { colour: { kind: \"rgb\", hex: pairHex(ramp, tt, theme) } };",
      to: "  if (depth >= 24) return { colour: { kind: \"rgb\", hex: mixHex(hexOf(ramp.from, theme), hexOf(ramp.to, theme), tt) } };",
      expect: "T1.82",
    },
    {
      // **The 8-bit rung quantising the plain mix** — the lift reaches the
      // truecolour frame and stops at 256 colours, where it is still drawable.
      name: "the 8-bit rung quantises the plain mix rather than the lifted sample",
      file: RAMP,
      from: "  if (depth >= 8) return { colour: { kind: \"ansi256\", index: nearestAnsi256(pairHex(ramp, tt, theme)) } };",
      to: "  if (depth >= 8) return { colour: { kind: \"ansi256\", index: nearestAnsi256(mixHex(hexOf(ramp.from, theme), hexOf(ramp.to, theme), tt)) } };",
      expect: "T1.82",
    },
    {
      // **The lift runs backwards**: brightest at the knee and ×1 at the head.
      name: "the lift rises toward the knee rather than toward t = 1",
      file: RAMP,
      from: "  return liftHex(to, 1 + ((clamped - knee) / stop.share) * (stop.lift - 1));",
      to: "  return liftHex(to, 1 + ((1 - clamped) / stop.share) * (stop.lift - 1));",
      expect: "T1.82",
    },
    {
      // **The mix below the knee not rescaled**: `to` is reached at t = 1 and
      // never at the knee, so the lift starts from a colour short of the accent.
      name: "the mix below the knee runs over [0, 1] rather than [0, 1 − share]",
      file: RAMP,
      from: "  if (clamped <= knee) return mixHex(from, to, clamped / knee);",
      to: "  if (clamped <= knee) return mixHex(from, to, clamped);",
      expect: "T1.82",
    },
    {
      // **THE DEFECT at the trail (C09 I132)**: hotEdge drawn as the plain
      // gradient, the head at the accent — what every frame showed before.
      name: "THE DEFECT: hotEdge carries no overshoot",
      file: TRAIL,
      from: "        ...(form === \"hotEdge\" ? { overshoot: TRAIL_OVERSHOOT } : {}),",
      to: "",
      expect: "T1.150",
    },
    {
      // **The lift on every colour form** — fade's head is then muted ×1.35,
      // which is not muted, and hue's is past the accent.
      name: "every colour form carries the overshoot",
      file: TRAIL,
      from: "        ...(form === \"hotEdge\" ? { overshoot: TRAIL_OVERSHOOT } : {}),",
      to: "        ...(form !== \"weight\" ? { overshoot: TRAIL_OVERSHOOT } : {}),",
      expect: "T1.150",
    },
    {
      // **THE DEFECT at the walk (C09 I133)**, by code point — which still
      // makes a combining mark a step of its own and cuts it from its base.
      name: "THE DEFECT: the band walks back by code point rather than by grapheme",
      file: TRAIL,
      from: "    const clusters = graphemes(text);",
      to: "    const clusters = [...text];",
      expect: "T3.129",
    },
    {
      // **`of` in code points**: a family is five, so its head sits short of 1.
      name: "the band's extent counts code points",
      file: TRAIL,
      from: "    (n, b) => n + b.band.reduce((m, r) => m + graphemes(r.text).length, 0),",
      to: "    (n, b) => n + b.band.reduce((m, r) => m + [...r.text].length, 0),",
      expect: "T3.129",
    },
    {
      // **A run's advance in code points** — the next run starts past where
      // `paintRuns` indexes, so a head after a combining mark falls short.
      name: "a run's advance through the band counts code points",
      file: TRAIL,
      from: "      const count = graphemes(run.text).length;",
      to: "      const count = [...run.text].length;",
      expect: "T3.129",
    },
    {
      // **The stop on a span** — a lifted `to` is no slot, and the floor is
      // proven per slot (C04 I107).
      name: "overshoot is accepted on a span",
      file: GATE,
      from: "    if (onSpan) {\n      e.push(`${where}: \"overshoot\" is refused on a span",
      to: "    if (onSpan && fill !== \"gradient\") {\n      e.push(`${where}: \"overshoot\" is refused on a span",
      expect: "T2.152",
    },
    {
      // **The fill unchecked**: a centred or stepped slot pair takes the stop.
      name: "overshoot rides any fill over a slot pair",
      file: GATE,
      from: "    if (fill !== \"gradient\" || !hasPair) {",
      to: "    if (!hasPair) {",
      expect: "T2.152",
    },
    {
      // **No ceiling on the lift** — 2.5 passes.
      name: "lift has no upper bound",
      file: GATE,
      from: "!Number.isFinite(lift) || lift <= 1 || lift > 2) {",
      to: "!Number.isFinite(lift) || lift <= 1) {",
      expect: "T2.152",
    },
    {
      // **share = 1** leaves nothing to mix and passes.
      name: "share may reach 1",
      file: GATE,
      from: "!Number.isFinite(share) || share <= 0 || share >= 1) {",
      to: "!Number.isFinite(share) || share <= 0 || share > 1) {",
      expect: "T2.152",
    },
    {
      // **The key never admitted**: every stop refused as an unknown member.
      name: "RAMP_KEYS leaves out overshoot",
      file: TYPES,
      from: "\"animate\", \"since\", \"overshoot\"]);",
      to: "\"animate\", \"since\"]);",
      expect: "T2.152",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
