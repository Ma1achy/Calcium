// A mosaic frame, timed and digested, against **one tree per process** (F1213).
//
// **Written because the ceiling could not be checked.** The plan for F1209
// carried *~87 ms of 145 on the mosaic scroll frame*, a figure in no file:
// `stress.mjs` had twenty-seven cases and none drew a mosaic, and neither
// example ships a surface with one. A figure about a frame nothing measures can
// be repeated and never confirmed. `stress.mjs` now has a `mosaic` case for the
// session-level reading; this is the A/B one, because a before-and-after needs
// two builds and `stress.mjs` imports its own.
//
// **The digest is printed beside every reading and it comes first.** A faster
// frame that draws something else is not a win, and that is not hypothetical:
// the first paired run here was fifteen times quicker and **missing two of its
// five cells** — `parseAreas` orders regions by first appearance, `composeRow`
// walks a cursor left to right, and `placeRows` was handing them over unsorted.
// Every gate agreed; the digest is what did not.
//
// Usage, inside the devcontainer, after `make load-down` in `examples/docker`
// and a build of each tree:
//
//     node tools/bench/mosaic.mjs <dist-root> [reps] [width]
//     node tools/bench/mosaic.mjs <dist-root> kinds [width]
//
// `kinds` digests one document per container kind instead of timing, which is
// how the difference above was narrowed from *the frames differ* to *the
// pinwheel differs and nothing else does*. Read the paired per-round difference
// and report the host's load beside it: this is a probe, never a gate.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const [ROOT, ARG = "200", WIDTH = "200"] = process.argv.slice(2);
if (ROOT === undefined) {
  console.error("usage: node tools/bench/mosaic.mjs <dist-root> [reps|kinds] [width]");
  process.exit(2);
}
// **Resolved against the working directory, not this file.** A relative
// specifier in a dynamic import resolves against the module, which put both
// trees' `dist/` under `tools/bench/` and found neither.
const base = pathToFileURL(resolve(ROOT) + "/").href;
const { b } = await import(`${base}index.js`);
const { expectDocument } = await import(`${base}testing/index.js`);

const logs = (n, tag) => b.logs(Array.from({ length: n }, (_, i) => ({
  ts: `12:00:${String(i % 60).padStart(2, "0")}`,
  level: ["info", "warn", "error", "debug"][i % 4],
  message: `${tag} const value${String(i)} = compute(${String(i)});`,
})), { id: `lg-${tag}` });

const doc = (blocks) => ({ schema: "tui.view/1", id: "d", command: "c", status: "ok", meta: {}, blocks });

/** The pinwheel (C04 §3f), filled — the figure nested rows and columns cannot draw. */
const pinwheel = () => b.mosaic({
  id: "m", height: 40, areas: "AAB/DEB/DCC", columns: [2, 1, 1], rows: [1, 2, 1],
  children: ["a", "b", "d", "e", "c"].map((t) => logs(60, t)),
});

const digest = (blocks, w) => {
  const lines = expectDocument(doc(blocks)).lines(w);
  return { hex: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16), rows: lines.length };
};

const width = Number(WIDTH);

if (ARG === "kinds") {
  // One document per container, so a divergence names the kind that moved
  // rather than *the frame*. `mosaic2` is a plain two-cell grid and `pinwheel`
  // the one whose regions are not in column order; the pair is what separated
  // the composer's ordering from everything else.
  const cases = {
    logs: [logs(20, "a")],
    columnGroup: [b.group("column", [logs(10, "a"), logs(10, "b")])],
    rowGroup: [b.group("row", [logs(10, "a"), logs(10, "b")], { flex: [1, 1] })],
    panel: [b.panel("t", [logs(10, "a")])],
    scroll: [b.scroll(10, [logs(40, "a")])],
    mosaic2: [b.mosaic({ id: "m", height: 12, areas: "AB", columns: [1, 1], rows: [1], children: [logs(20, "a"), logs(20, "b")] })],
    pinwheel: [pinwheel()],
  };
  for (const [name, blocks] of Object.entries(cases)) {
    const d = digest(blocks, width);
    console.log(`${name.padEnd(12)} ${d.hex} rows=${String(d.rows)}`);
  }
} else {
  const reps = Number(ARG);
  const blocks = [pinwheel()];
  // Warm: the first renders compile and fill caches, and a cold one in the
  // sample measures the JIT rather than the composition.
  for (let i = 0; i < 20; i += 1) expectDocument(doc(blocks)).lines(width);
  const t0 = performance.now();
  let rows = 0;
  for (let i = 0; i < reps; i += 1) rows += expectDocument(doc(blocks)).lines(width).length;
  const ms = performance.now() - t0;
  console.log(JSON.stringify({
    root: ROOT, reps, width,
    ms: Number(ms.toFixed(2)),
    perFrame: Number((ms / reps).toFixed(3)),
    rows,
    digest: digest(blocks, width).hex,
  }));
}
