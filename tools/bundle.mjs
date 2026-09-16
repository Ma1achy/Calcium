// A04 §5 — the second half of the build, and the half a consumer imports
// (C24 I38, F1193).
//
// **The loader's unit is the file.** `tsc` emits one per source module — 820
// of them — and resolving, reading, lexing, compiling and linking each was two
// thirds of a cold import: 207 of 310 sampled ms in `node:internal`. One chunk
// graph per entry set is a third of the import and a quarter of the heap after
// it, six of six pairs with and without the compile cache.
//
// **What is kept, and where it is checked.** `splitting` gives every entry one
// instance of every shared module (C24 T5.8's `liveParts` arm would see two);
// `packages: "external"` leaves `ink`, `react` and the rest to the consumer's
// tree, which is what keeps `prepareLaunch()`'s target at
// `node_modules/ink/build/ink.js` (C24 I37); a dynamic `import()` stays its own
// chunk, so the emulator is still off the runtime's graph (C23 I71); linked
// maps with no embedded sources compose `tsc`'s, so C28 I65 names a `src/` file
// from a chunk frame. Unminified: the compile cache holds the compiled form,
// and a minified stack is a card nobody can read.
//
// The entries are C24 §2's six, from the `tsc` tree, into `dist/bundle/`; the
// tree stays — every tier-5 child, probe and tool reads it by path.
import { existsSync, rmSync } from "node:fs";
import { build } from "esbuild";

const ENTRIES = [
  "dist/index.js",
  "dist/launch.js",
  "dist/mermaid.js",
  "dist/testing/index.js",
  "dist/fixtures/index.js",
  "dist/shell/profiling/index.js",
];

const missing = ENTRIES.filter((e) => !existsSync(e));
if (missing.length > 0) {
  console.error(`bundle: not built by tsc yet — ${missing.join(", ")}`);
  process.exit(1);
}

rmSync("dist/bundle", { recursive: true, force: true });
await build({
  entryPoints: ENTRIES,
  outdir: "dist/bundle",
  outbase: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  sourcemap: "linked",
  sourcesContent: false,
  minify: false,
  logLevel: "warning",
});
