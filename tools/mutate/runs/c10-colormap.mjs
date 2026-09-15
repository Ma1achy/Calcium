// C10 I40 — the numeric colour path: `sampleRgb`, `shadeRgb` and the `toLinear`
// table, consumed by `scatter3.ts`'s surface fill. Mutated.
//
// **The shape this run exists to catch is a table that is almost right.** The
// LUT's claim is exactness over every eight-bit input, and a wrong entry — off by
// one, built over the wrong domain — shifts a channel by one at some `t` and
// nowhere else, which is a golden mover no assertion at a handful of points would
// see. T1.42 sweeps every map × 1 024 t × 64 k against `shadeColour`, which is
// **deliberately kept on `overChannels`' direct arithmetic** so the sweep compares
// two implementations rather than the table to itself — the first draft routed
// `shadeColour` through `shadeRgb`, and under that every mutation here survived.
//
// **Two mutations were checked and left out, each with its reason.** The fast
// path's `k >= 1` shortcut removed is *byte-identical*: the sRGB round-trip at
// `k = 1` is exact for all 256 channels (measured, 0 drifts), so the shortcut is
// speed and not correctness and a run cannot see it. `fastMap` forced `undefined`
// — the fast path never taken — is the c09-group-window control's shape: a
// correct, slower answer that every byte and equality row accepts. Nothing here
// asserts the fast path is *taken*; that is the bench's reading (F1150), and it
// is the run's stated blind spot. And `colourBy: "value"` collapsed to depth on
// the fast path was left out too: no mesh golden or fixture colours by value
// (grepped), so it would survive vacuously — the row to add the day one does.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-colormaps.test.ts test/golden/plot-meshes.test.ts";
const MAP = "src/presentation/theme/colormap.ts";
const S3 = "src/presentation/plot/scatter3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: MAP,
    from: "  return [ch(r), ch(g), ch(b)];",
    to: "  return [r, g, b];",
    why: "an unshaded shadeRgb differs from overChannels at every k < 1; a run where this survives is comparing the table to itself",
  },
  mutations: [
    {
      // **The table over the wrong domain.** Entry `i` built from `(i + 1) / 255`
      // shifts every channel; the sweep sees it because `shadeColour` computes
      // `toLinear` directly.
      name: "LUT-OFF-BY-ONE: LINEAR_LUT[i] is toLinear((i + 1) / 255)",
      file: MAP,
      from: "const LINEAR_LUT: readonly number[] = Array.from({ length: 256 }, (_, i) => toLinear(i / 255));",
      to: "const LINEAR_LUT: readonly number[] = Array.from({ length: 256 }, (_, i) => toLinear((i + 1) / 255));",
      expect: "T1.42",
    },
    {
      // **The table bypassed.** Reading `toLinear(c)` — the channel as an int,
      // not over 255 — is the shape a reader reaches for who forgot the domain;
      // every channel above 0 saturates.
      name: "LUT-BYPASSED-WRONG-DOMAIN: shadeRgb reads toLinear(c) instead of the table",
      file: MAP,
      from: "    const v = toSrgb((LINEAR_LUT[c] ?? toLinear(c / 255)) * kk);",
      to: "    const v = toSrgb(toLinear(c) * kk);",
      expect: "T1.42",
    },
    {
      // **No interpolation.** `sample` delegates to `sampleRgb`, so T1.42's
      // `sample === rgbHex(sampleRgb)` is the same source on both sides and
      // cannot see this; the mesh goldens at 24-bit can, because a smooth-shaded
      // surface reads the map between entries.
      name: "SAMPLE-NO-INTERPOLATION: frac is always 0",
      file: MAP,
      from: "  const frac = scaled - low;\n  const lo = data[low]!;\n  const hi = data[high]!;\n  return [",
      to: "  const frac = 0;\n  const lo = data[low]!;\n  const hi = data[high]!;\n  return [",
      expect: "24bit",
    },
    {
      // **The ramp not inverted on the fast path.** `colourOf` puts near at the
      // top of the ramp (`1 − ramped(depth)`); a fast path that forgot the `1 −`
      // colours the surface the other way while every count agrees. The anchor
      // is unique to the fast path — the scalar `z` (C12 I129), where `colourOf`
      // reads `reading.depth`.
      name: "FASTPATH-RAMP-NOT-INVERTED: depth colours run far-to-near",
      file: S3,
      from: "          : 1 - ramped(z, span.nearD, span.farD);",
      to: "          : ramped(z, span.nearD, span.farD);",
      expect: "24bit",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
