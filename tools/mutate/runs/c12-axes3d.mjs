// C12 I90, I91 and I92 — the 3D reference frame. Mutated.
//
// **The mutation worth the pass is the one the frame found** (F448): anchoring
// the axes at the far corner, which is the design note's literal rule and draws
// them across the data. It was the shipped behaviour until something was
// rendered and looked at.
//
// **Two mutations are not here and both absences are findings** (F450).
//
// *The label gap* — reserving a label's own cells and no blank either side, the
// defect that made the frame read `10.5`. It kills **nothing now**: swept over
// 24 azimuths with the gap removed, no two labels abut, because three unrelated
// changes on the same commit — the name clearance, the frame-edge clamp and the
// near-plane clip — moved the labels apart. The guard stays on the asymmetry
// rather than the odds: two cells of reservation against a frame that reads one
// number where there are two, observed on 2026-09-02 and not reproducible after.
//
// *The anchor depth test* — labels drawn without testing what covers them. It
// fires on **no fixture measured**, and the reason is a property rather than an
// accident: the anchors are pushed *outward* from the axis, toward the reader,
// so nothing is in front of them by construction. A first draft of `AX8`
// asserted it by comparing against an empty cloud and was measuring **tick
// clamping** — `extentOf([])` is the unit cube where the helix reaches ±0.9995,
// so the two get different `niceAxis` ticks.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-axes3d.test.ts";
const A = "src/presentation/plot/axes3.ts";
const S = "src/presentation/plot/scatter3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: A,
    // The box, emptied. Half these rows read a frame and the other half read a
    // corner, so a pass in which the frame cannot be removed sees neither.
    from: "  if (mode === \"none\") return [];",
    to: "  if (true) return [];",
    why: "most rows read a rendered frame; a pass where the box cannot be emptied cannot observe a kill",
  },
  mutations: [
    {
      // **F448, as the mutation.** The design note's literal rule: draw from the
      // corner furthest from the camera. It projects to the centre of the
      // figure, so the axes run across the data — a legal frame, and the reason
      // the note gives forbids it.
      name: "the axes anchor at the far corner, as the design note says",
      file: A,
      from: "  return { x: s3.x, y: s3.y, z: -s3.z };",
      to: "  return { x: -s3.x, y: -s3.y, z: -s3.z };",
      expect: "AX1",
    },
    {
      // **The near-plane clip gone** (C12 I91) — a segment with one endpoint
      // behind the eye is dropped rather than clipped. `AX6` asserts the
      // mechanism directly, because the clipped remainder reaches the frame at
      // one of six distances swept and a frame comparison agrees at the other
      // five (F450).
      name: "a segment with an endpoint behind the eye is dropped",
      file: A,
      from: "  if (za <= NEAR && zb <= NEAR) return null;",
      to: "  if (za <= NEAR || zb <= NEAR) return null;",
      expect: "AX6",
    },
    {
      // **`Math.sign` rather than the tie** (C12 I90). At azimuth 0 the eye's
      // `y` is exactly zero, `sign(0)` is 0, and the corner it names is on
      // neither side — so a camera crossing the plane visits a third state.
      name: "the sign is not tied at zero",
      file: A,
      from: "const sgn = (v: number): number => (v < 0 ? -1 : 1);",
      to: "const sgn = (v: number): number => Math.sign(v);",
      expect: "AX4",
    },
    {
      // **The back faces derived again** rather than read from the same signs —
      // F444's shape, and the entry AX3 exists for. Inverting the membership
      // test keeps nine edges and picks the wrong nine.
      name: "the box takes the near faces",
      file: A,
      from: "    return fixed.some((k) => at3(e.a, k) === at3(corner, k));",
      to: "    return fixed.some((k) => at3(e.a, k) !== at3(corner, k));",
      expect: "AX2",
    },
    {
      // **The edge-on rule gone** (C12 I91): an axis with no projected extent
      // keeps its labels, which stack into one unreadable point.
      name: "an edge-on axis keeps its labels",
      file: S,
      from: "    if (extent < EDGE_ON) continue;",
      to: "    if (false as boolean) continue;",
      expect: "AX5",
    },
    {
      // **`show: false` takes the box with the axis** (C12 I92) — the half AX11
      // exists to separate, and a row asserting only the removal agrees with it.
      name: "`show: false` does not hide the axis",
      file: S,
      from: "    if (spec?.show === false) continue;",
      to: "    if (false as boolean) continue;",
      expect: "AX11",
    },
    {
      // **The frame moves the data** (C12 I92): normalising to the niced range
      // instead of the data's extent rescales the picture when a reader only
      // asked for a reference frame.
      name: "an axis name is placed at its positive end again",  // AX12 reads the strings on both arms
      file: S,
      from: "    put(along(mid, line.outward, NAME_OUT), name, ink);",
      to: "    put(along(line.seg.b, line.outward, NAME_OUT), name);",
      expect: "AX12",
    },
    {
      // **The arrowhead ignores the screen direction** and always points right,
      // so an axis running left is labelled as running right — the one thing
      // the member exists to say (C04 I77).
      name: "the arrowhead is always the same glyph",
      file: S,
      from: "      const head = Math.abs(dy) > Math.abs(dx)\n        ? (dy < 0 ? a3.up : a3.down)\n        : (dx < 0 ? a3.left : a3.right);",
      to: "      const head = a3.right;",
      expect: "AX13",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
