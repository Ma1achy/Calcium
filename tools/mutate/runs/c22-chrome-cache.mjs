// C22 I102 — the chrome cache: header, footer and layer lines held per
// content, the footer's height beside them, misses by axis. Mutated.
//
// **The shape this run exists to catch is a key with an axis missing.** A
// cache that ignores the width paints the old lines after a resize; one that
// ignores the theme paints the old colours after a switch; one keyed by
// identity renders every frame and reads as correct. Each is a frame a reader
// sees and a count the rows read.
//
// **Left out, with its reason.** The footer's measure runs before the render
// and reports nothing (the render is the reported step); a mutation making it
// measure every frame is on the list because T4.90a counts measures, and a
// mutation making it report would double the `chrome` counts — a reading, not
// a defect a reader sees.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/chrome-cache.test.ts test/integration/render-cache.test.ts";
const CACHE = "src/shell/chrome-cache.ts";
const PAINT = "src/shell/paint.ts";
const COMPOSITE = "src/shell/composite.ts";

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
    file: CACHE,
    from: '      this.#probe.hit("chrome");\n      return held.lines;\n    }\n    const lines = render(blocks, width);',
    to: '      this.#probe.hit("chrome");\n      return held.lines.slice(1);\n    }\n    const lines = render(blocks, width);',
    why: "a hit hands back one row too few — the frame is short by a row on every hit, which the frame's own height check throws on and every painting row sees",
  },
  mutations: [
    {
      // **The key is identity.** Every frame's chrome is a new document to the
      // cache: a `rev` miss and a render every frame, correct and uncached.
      name: "KEY-IS-IDENTITY: the structural key is unique per call",
      file: CACHE,
      from: "    return JSON.stringify(blocks);",
      to: "    return `${JSON.stringify(blocks)}:${String(Math.random())}`;",
      expect: "T4.90a",
    },
    {
      // **The width dropped from the chrome's key.** A resize paints the lines
      // rendered at the old width.
      name: "WIDTH-DROPPED: the chrome slot ignores the width",
      file: CACHE,
      from: '    else if (held.key !== key) this.#probe.miss("chrome", "rev");\n    else if (held.width !== width) this.#probe.miss("chrome", "width");',
      to: '    else if (held.key !== key) this.#probe.miss("chrome", "rev");',
      expect: "T4.90b",
    },
    {
      // **The theme dropped from the chrome's key.** A switch paints the old
      // colours in the header and the footer.
      name: "THEME-DROPPED: the chrome slot ignores the theme",
      file: CACHE,
      from: '    else if (held.key !== key) this.#probe.miss("chrome", "rev");\n    else if (held.width !== width) this.#probe.miss("chrome", "width");\n    else if (held.theme !== theme) this.#probe.miss("chrome", "theme");',
      to: '    else if (held.key !== key) this.#probe.miss("chrome", "rev");\n    else if (held.width !== width) this.#probe.miss("chrome", "width");',
      expect: "T4.90b",
    },
    {
      // **The footer measured every frame.** The lines are cached and the
      // height is not: correct, and the measure count T4.90a reads moves.
      name: "MEASURE-EVERY-FRAME: the footer's height is never read back",
      file: CACHE,
      from: "    if (held !== undefined && held.key === key && held.width === width) return held.rows;",
      to: "    if (held !== undefined && held.key === key && held.width === width && width < 0) return held.rows;",
      expect: "T4.90a",
    },
    {
      // **A layer keyed by nothing.** Every layer reads the last one held:
      // a re-rendered surface paints its previous content, and a second
      // surface paints the first's.
      name: "LAYER-BY-ANY: a layer's lines are read back whatever the content",
      file: CACHE,
      from: "    const held = this.#layers.get(content);",
      to: "    const held = this.#layers.get(content) ?? this.#layers.get(LAYER_ANY);",
      also: [
        {
          file: CACHE,
          from: "    this.#layers.set(content, Object.freeze({ width, theme, lines }));",
          to: "    this.#layers.set(content, Object.freeze({ width, theme, lines }));\n    this.#layers.set(LAYER_ANY, Object.freeze({ width, theme, lines }));",
        },
        {
          file: CACHE,
          from: 'export type ChromeRole = "header" | "footer";',
          to: 'export type ChromeRole = "header" | "footer";\nconst LAYER_ANY: readonly Block[] = [];',
        },
      ],
      expect: "T4.90c",
    },
    {
      // **The paint path never asks the cache.** Wired everywhere and used
      // nowhere: the chrome renders every frame as before.
      name: "PAINT-BYPASSES: region renders the chrome whatever the cache holds",
      file: PAINT,
      from: "      : deps.chrome === undefined\n        ? render(blocks, width)\n        : deps.chrome.lines(role, blocks, width, deps.theme.name, render);",
      to: "      : render(blocks, width);",
      expect: "T4.90a",
    },
    {
      // **The composite path never asks the cache.** Layers render every frame.
      name: "LAYERS-BYPASS: layerRows renders the layer whatever the cache holds",
      file: COMPOSITE,
      from: "      : deps.chrome === undefined\n        ? render(p.layer.content, p.width)\n        : deps.chrome.layer(p.layer.content, p.width, deps.theme.name, render);",
      to: "      : render(p.layer.content, p.width);",
      expect: "T4.90c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
