// C12 I101 — the box-drawing arm, and whether a row can tell a wireframe with
// joins from one that comes apart at every vertex.
//
// **The first mutation is §3am's own mechanism.** That refusal's argument two —
// the only one of its four that was a mechanism rather than a reason — says a
// strictly-nearer test refuses the second edge at exactly the shared vertex a
// join needs. Reverting the tie rule is that sentence, executed: the alphabet is
// still box drawing, the corners still degrade, the markers still win their
// cells, and the figure simply loses its vertices. Only LN2 can see it, because
// a corner, a tee and a cross are the glyphs **one edge cannot produce**.
//
// **Which rows this reaches, stated.** Six mutations across LN1, LN2b, LN3,
// LN4, LN5 and LN6 — one each. **LN2 has none, and that is the point of
// having it**: it asserts the tie rule at `strokeSeg`, so every mutation
// of the *call site* leaves it green. The pair is the standing remedy for
// a row that calls the mechanism and misses the wiring.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-line-arm.test.ts";
const SCATTER = "src/presentation/plot/scatter3.ts";

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
    file: SCATTER,
    // No bits are ever set, so the mask is empty and every cell falls through to
    // the frame's channel. The arm still selects, still degrades, still refuses
    // nothing — and draws no line at all.
    // **Re-anchored when the mask writer took its target as a parameter**, so
    // the frame's own mask and the caller's are written by one function.
    from: "    target[cy * w + cx] = (target[cy * w + cx] ?? 0) | b; // cells-ok — a cell offset",
    to: "    target[cy * w + cx] = 0; // cells-ok — a cell offset",
    why: "every row reads glyphs out of the mask; a run where setting no bits at all survives is reading nothing",
  },
  mutations: [
    {
      // **The refusal's mechanism, restored — and it kills the *wiring* row.**
      // LN2 asserts the rule at `strokeSeg` itself and therefore cannot see the
      // call site passing `false`; LN2b is the row that can, and its threshold
      // sits between the two measured frames (36 corners against 29, 8 tees
      // against 5). A test that calls the mechanism misses the wiring.
      name: "the mask takes the strictly-nearer rule the colour takes",
      file: SCATTER,
      from: "    }, masked);",
      to: "    }, false);",
      expect: "LN2b",
    },
    {
      // **The member selects nothing** and `plotStyle: "line"` falls to the
      // capability switch, which at 24-bit is the half-block raster — C12 I87
      // as it read before this arc.
      name: "the named arm falls back to the capability switch",
      file: SCATTER,
      from: '  if (ps === "line") return "mask";',
      to: '  if (false) return "mask";',
      expect: "LN1",
    },
    {
      // **The diagonal links its two cells directly**, and `step` takes one
      // axis — so the vertical half of every staircase is lost and the figure
      // draws as a dashed horizontal run. **Not a crossing**, which the first
      // draft of this comment claimed and LN6's first draft was written from:
      // the row compared crossings against corners and survived, because the
      // fallback produces neither.
      name: "a diagonal claims both axes rather than routing through its corner",
      file: SCATTER,
      from: "      if (writeDepth(depth, x, fy, z) || equalDepth(depth, x, fy, z)) {",
      to: "      if (false) {",
      expect: "LN6",
    },
    {
      // **The corner style is pinned** rather than read, which is the member
      // accepted and ignored — F207's class, and invisible in a frame nobody
      // compares against its own alternative.
      name: "`plotCorners` is ignored and the alphabet is always rounded",
      file: SCATTER,
      // **Re-anchored when the reference frame took its own structure** (F500).
      // The corner style used to be threaded to `glyphRows` as an argument; it
      // is a field of the frame now, so the mutation reads at the call that
      // resolves the mask rather than at the compose's signature.
      from: "          const drawn = glyphForMask(edges, frame.corners, ctx.capabilities);",
      to: '          const drawn = glyphForMask(edges, "rounded", ctx.capabilities);',
      expect: "LN4",
    },
    {
      // **The mask outranks the data.** Removing the marker channel is the same
      // cell going the other way: a line through a cloud swallows the markers it
      // passes, which is F452's ruling inverted one carrier along.
      name: "a line through a cloud takes the marker's cell",
      file: SCATTER,
      from: "      const g = glyph[i] ?? -1;",
      to: "      const g = -1;",
      expect: "LN5",
    },
    {
      // **The alphabet is resolved at full capability** whatever the terminal
      // is, so `ascii` and `wide` both draw box drawing they cannot show — which
      // is exactly the ambiguous-width defect `glyphForMask`'s own parameter was
      // widened for (F293).
      name: "the mask alphabet ignores the terminal",
      file: SCATTER,
      // **Re-anchored with the row above**, and the two share a line because the
      // frame now carries the corner style: one mutation drops the caller's
      // choice, the other drops the terminal's.
      from: "        if (edges !== 0) {",
      to: "        if (edges !== 0 && ctx.capabilities.unicode !== \"ascii\") {",
      expect: "LN3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
