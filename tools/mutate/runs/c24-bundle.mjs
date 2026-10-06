// C24 I38 — every entry resolves into one bundled graph that keeps one
// instance, the same names, the emulator and the renderer off the graph, and
// a named frame. Mutated (T6.21, F1193).
//
// **The pass rebuilds `dist/` before each run**: the subject is the build step
// and the export map, and a mutation that never reaches `dist/bundle/` is a
// mutation of nothing.
//
// **The control is a bundle per entry** (`splitting: false`). Every entry then
// carries its own copy of `shell/builders/live.js`, `b.live` through the
// runtime records where `liveParts` through the testing entry cannot see, and
// T5.8's one-instance arm reads an empty list.
//
// **Blind spot, stated.** `format`, `platform` and `target` are not mutated:
// a CommonJS or browser bundle fails to import at all, which every row sees
// and none needs a mutation to show.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npm run build >/dev/null 2>&1; npx vitest run test/e2e/public-api.test.ts test/e2e/profiling-locate.test.ts examples/docker/test/bin.test.ts examples/docker/test/seal.test.ts";
const B = "tools/bundle.mjs";
const P = "package.json";

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
    file: B,
    from: "  splitting: true,",
    to: "  splitting: false,",
    why: "a bundle per entry: two copies of the live declarations, and T5.8's liveParts arm reads nothing",
  },
  mutations: [
    {
      // **The runtime points back at the tree.** Names and instance hold; the
      // module count and the exports arm do not, and the seal's R2.3b reads the
      // old path.
      name: "POINT-AT-TREE: the runtime's default target is the tsc file",
      file: P,
      from: '      "default": "./dist/bundle/index.js"',
      to: '      "default": "./dist/index.js"',
      expect: "T5.8",
    },
    {
      // **Packages bundled in.** A consumer's `node_modules` copy of a runtime
      // dependency is never a module of its own, so the tree the child traces
      // holds the bundle's own copy instead — T5.8 reads the entries' names
      // against the `tsc` tree's and sees the divergence.
      //
      // **The expectation was `R4.7`, a row deleted with Ink** (F1209) leaving
      // only the tombstone comment at `examples/docker/test/bin.test.ts:109`. The
      // mutation was caught the whole time, by the row the paragraph above names
      // and by nothing else — measured: `FAIL test/e2e/public-api.test.ts > C24
      // I38 … > T5.8`, 1 failed of 13. So the row said `CAUGHT ELSEWHERE` while
      // being caught exactly where its own comment said it would be, which is
      // what an expectation naming a row that no longer exists reads like.
      name: "PACKAGES-BUNDLED: node_modules are bundled rather than external",
      file: B,
      from: '  packages: "external",',
      to: '  packages: "bundle",',
      expect: "T5.8",
    },
    {
      // **No maps.** A chunk frame has nothing beside it and T5.5 draws the
      // chunk's URL where the source's was expected.
      name: "NO-MAPS: the bundle is written without source maps",
      file: B,
      from: '  sourcemap: "linked",',
      to: "  sourcemap: false,",
      expect: "T5.5",
    },
    {
      // **An entry dropped.** `exports["./mermaid"]` names a file that is not
      // written, and the child cannot import it. It was `./launch`, whose entry
      // went with Ink (F1209, C24 I37 retired); any entry serves, because what
      // the row watches is that the bundler's list and the export map are one
      // fact.
      name: "DROP-ENTRY: an entry is not bundled",
      file: B,
      from: '  "dist/mermaid.js",\n',
      to: "",
      expect: "T5.8",
    },
  ],
});

console.log(report(results));
execSync("npm run build >/dev/null 2>&1", { cwd: ROOT });
process.exit(results.some((r) => !r.killed) ? 1 : 0);
