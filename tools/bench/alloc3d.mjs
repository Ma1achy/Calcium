// The 3-D raster's allocations, sampled — **the observable C12 I129 names**.
//
// **Why a bench and not a test row.** An allocation count under a test runner
// is the runner's: vitest's worker, its reporter and the transform all
// allocate on the same heap, and a row that asserts a number of bytes asserts
// the harness. So the invariant's number lives here, taken by hand and
// recorded in FINDINGS (F1157) with the build it was taken on.
//
// **Why this sampler and not `--heap-prof`.** Node's flag reports what is
// retained when the profile is written — the cached geometry, the meshes —
// and none of the per-render garbage, which is the whole question. The
// inspector's sampler takes the two `includeObjectsCollectedBy…GC` flags and
// reports every sampled allocation whether or not it survived.
//
// **Against `dist/`, on the example's own meshes**, as `plots.mjs` is. Run
// inside the devcontainer after `npm run build`:
//
//     node --experimental-strip-types tools/bench/alloc3d.mjs [bunny|teapot|suzanne] [renders] [top]
//
// Prints the sampled bytes by allocation site, `presentation/` only, largest
// first, with the share of everything sampled and the bytes a render.
import { Session } from "node:inspector";
import { mesh } from "../../examples/plots/src/meshes.ts";
import { renderToLines } from "../../dist/presentation/render-lines.js";
import { createBlockRegistry } from "../../dist/presentation/blocks/registry.js";
import { plotDefinition } from "../../dist/presentation/plot/definition.js";
import { RenderScratchStore } from "../../dist/shell/render-scratch.js";
import { defaultTheme, loadTheme } from "../../dist/presentation/theme/index.js";
import { block } from "../../dist/data/viewmodel/index.js";

const RUNG = process.argv[2] ?? "bunny";
const N = Number(process.argv[3] ?? 30);
const TOP = Number(process.argv[4] ?? 12);
const theme = loadTheme(defaultTheme, "dark").value.current;
const capabilities = {
  colourDepth: 24, unicode: "full", ambiguousWidth: "narrow", backgroundPolarity: "unknown",
  synchronisedUpdate: true, bracketedPaste: true, mouse: true, imageProtocol: "none", keyboardProtocol: "none", altScreen: true,
};
const registry = createBlockRegistry({ onError: (f) => { throw new Error(JSON.stringify(f)); } });
registry.register(plotDefinition);
const m = mesh(RUNG);
const plot = block({
  kind: "plot", id: "alloc", form: "plot3d", height: 22, series: [], points3: [], lines3: [], colourBy: "depth", colormap: "coolwarm",
  camera: { azimuth: 2.2, elevation: 0.25, distance: 5 },
  surfaces3: [{ label: RUNG, vertices: m.vertices, faces: m.faces, closed: true, shading: "smooth" }],
});
const scratch = new RenderScratchStore();
const render = (i) => renderToLines(registry, plot, 80, {
  theme, capabilities, tick: 0, cameras: { alloc: { azimuth: 2.2 + i * 0.05, elevation: 0.25, distance: 5 } }, scratch,
});
// The geometry builds and the JIT settles before anything is sampled.
for (let i = 0; i < 5; i += 1) render(i);

const session = new Session();
session.connect();
const post = (method, params) => new Promise((resolve, reject) => {
  session.post(method, params, (err, result) => (err ? reject(err) : resolve(result)));
});
await post("HeapProfiler.enable");
await post("HeapProfiler.startSampling", {
  samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true,
});
for (let i = 0; i < N; i += 1) render(i);
const { profile } = await post("HeapProfiler.stopSampling");

const bySite = new Map();
let total = 0;
const walk = (node) => {
  const f = node.callFrame;
  const site = `${f.functionName || "(anon)"} ${f.url.replace(/^.*\/dist\//, "")}:${f.lineNumber + 1}`;
  bySite.set(site, (bySite.get(site) ?? 0) + node.selfSize);
  total += node.selfSize;
  for (const child of node.children ?? []) walk(child);
};
walk(profile.head);
const mb = (bytes) => (bytes / 1e6).toFixed(1);
console.log(`${RUNG} · ${N} renders · ${mb(total)} MB sampled · ${mb(total / N)} MB a render`);
const rows = [...bySite].filter(([site]) => site.includes("presentation/")).sort((a, b) => b[1] - a[1]).slice(0, TOP);
for (const [site, bytes] of rows) {
  console.log(`${mb(bytes).padStart(8)} MB ${(100 * bytes / total).toFixed(1).padStart(5)} % ${mb(bytes / N).padStart(6)} MB/render  ${site}`);
}
