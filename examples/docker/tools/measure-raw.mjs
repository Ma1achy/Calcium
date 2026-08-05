/**
 * S5's raw mode against the view's block-boundary ceiling.
 *
 * The question is not how tall the JSON is — it is whether `n`/`p` can reach
 * the bottom of it. `createDocumentView` is driven directly rather than
 * reimplemented, because the ceiling is a property of `project` and `lastOffset`
 * together and a reimplementation would agree with whichever one I read.
 */
import { createBlockRegistry } from "../../../dist/presentation/blocks/index.js";
import { tableDefinition } from "../../../dist/presentation/table/index.js";
import { plotDefinition } from "../../../dist/presentation/plot/index.js";
import { patchDefinition } from "../../../dist/presentation/patch/index.js";
import { createDocumentView } from "../../../dist/shell/document-view.js";
import { b } from "../../../dist/shell/builders/index.js";
import { readFileSync } from "node:fs";

const registry = createBlockRegistry({ defaults: true });
registry.register(tableDefinition);
registry.register(plotDefinition);
registry.register(patchDefinition);

const doc = JSON.parse(
  readFileSync(new URL("../test/corpus/inspect-raw-probe.json", import.meta.url), "utf8"),
)[0];
const text = JSON.stringify(doc, null, 2);

/** A 40-row terminal: rows - header - footer - prompt. */
const REGION = { width: 120, height: 37 };

const overlays = { layers: new Map(), top: null,
  push(l) { this.layers.set(l.id, l); this.top = l; },
  update(id, patch) { const l = this.layers.get(id); if (!l) return false; Object.assign(l, patch); return true; },
  dismiss(id) { this.layers.delete(id); this.top = null; return true; } };

const drive = (label, blocks) => {
  const view = createDocumentView({
    overlays, measure: (bl, w) => registry.measure(bl, w),
    region: () => REGION, redraw: () => {},
  });
  view.open("/inspect x");
  view.fill({ schema: "tui.view/1", command: "/inspect x", status: "ok", blocks, meta: {} });
  const shown = () => overlays.layers.get("document-view").content;
  const total = blocks.reduce((n, bl) => n + registry.measure(bl, REGION.width), 0);
  const first = shown().reduce((n, bl) => n + registry.measure(bl, REGION.width), 0);
  // Walk to the bottom the only way a reader can.
  let steps = 0;
  while (view.move("down") && steps < 999) steps += 1;
  const reachedFrom = shown().reduce((n, bl) => n + registry.measure(bl, REGION.width), 0);
  const lastId = blocks.at(-1).id;
  const bottomVisible = shown().some((bl) => bl.id === lastId);
  // **The honest figure is the tallest single block, not whether the last one
  // appears.** `project` always pushes one block, so a 245-row block "appears"
  // and C15 truncates 208 rows of it — reachable by no motion. A block taller
  // than the region is rows a reader cannot get to, however many there are.
  const tallest = Math.max(...blocks.map((bl) => registry.measure(bl, REGION.width)));
  const stranded = blocks.reduce(
    (n, bl) => n + Math.max(0, registry.measure(bl, REGION.width) - REGION.height), 0);
  console.log(
    `${label.padEnd(30)} blocks=${String(blocks.length).padStart(3)} rows=${String(total).padStart(4)} ` +
    `tallestBlock=${String(tallest).padStart(3)} downSteps=${String(steps).padStart(3)} ` +
    `unreachableRows=${String(stranded).padStart(3)}`,
  );
  view.pop();
};

drive("one block, whole JSON", [b.code("json", text, { id: "raw" })]);

const perKey = Object.entries(doc).map(([k, v]) =>
  b.code("json", `"${k}": ${JSON.stringify(v, null, 2)}`, { id: `raw-${k}` }),
);
drive("one block per top-level key", perKey);

/**
 * The same split, but any key whose subtree still overflows the region is split
 * once more by *its* keys. Two levels, not recursion to the leaves — a block per
 * scalar would be 245 blocks and the structure would be gone.
 */
const split = [];
for (const [k, v] of Object.entries(doc)) {
  const whole = b.code("json", `"${k}": ${JSON.stringify(v, null, 2)}`, { id: `raw-${k}` });
  if (registry.measure(whole, REGION.width) <= REGION.height || v === null || typeof v !== "object") {
    split.push(whole);
    continue;
  }
  for (const [k2, v2] of Object.entries(v)) {
    split.push(b.code("json", `"${k}.${k2}": ${JSON.stringify(v2, null, 2)}`, { id: `raw-${k}-${k2}` }));
  }
}
drive("two levels where it overflows", split);

// ── The two walk rows that turn on a number ─────────────────────────────────

/**
 * **The page unit is blocks, not rows** (`document-view.ts:214` — `page =
 * max(1, height - 1)` applied to `offset`, an index into `blocks`). So the
 * split that buys reachability changes what one `PgDn` traverses, and the two
 * rules meet: *split until nothing overflows* × *a page is region-height
 * blocks*.
 */
const pageProbe = (label, blocks) => {
  const view = createDocumentView({
    overlays, measure: (bl, w) => registry.measure(bl, w),
    region: () => REGION, redraw: () => {},
  });
  view.open("/inspect x");
  view.fill({ schema: "tui.view/1", command: "/inspect x", status: "ok", blocks, meta: {} });
  const rowsFrom = (o) => blocks.slice(0, o).reduce((n, bl) => n + registry.measure(bl, REGION.width), 0);
  const before = 0;
  view.move("pageDown");
  // The offset is not exposed, so it is recovered from what is on screen.
  const firstShown = overlays.layers.get("document-view").content[0];
  const offset = blocks.findIndex((bl) => bl.id === firstShown.id);
  let pages = 1;
  while (view.move("pageDown") && pages < 999) pages += 1;
  console.log(
    `${label.padEnd(30)} onePgDn: block ${before}→${offset} = ${rowsFrom(offset)} rows skipped ` +
    `(screen holds ${REGION.height}) · pagesToBottom=${pages}`,
  );
  view.pop();
};
pageProbe("two levels where it overflows", split);

/**
 * **Does the measured rule terminate?** A leaf that overflows on its own —
 * `Env` with 300 variables — has no keys to split by. The rule has to answer
 * this rather than assume the recursion bottoms out.
 */
const bigEnv = { Config: { Env: Array.from({ length: 300 }, (_, i) => `VAR_${i}=value-${i}`) } };
const leaf = b.code("json", `"Config.Env": ${JSON.stringify(bigEnv.Config.Env, null, 2)}`, { id: "leaf" });
console.log(`\nleaf that cannot be split: rows=${registry.measure(leaf, REGION.width)} region=${REGION.height} ` +
  `→ overflows by ${registry.measure(leaf, REGION.width) - REGION.height}`);

/**
 * **`wrap` decides whether `--raw` keeps its data.** `b.code` defaults to
 * `wrap: false`, which cuts at the width — and "raw when you want to grep it"
 * is a promise about *having* the bytes. Measured, because the cost of wrapping
 * is the argument against it.
 */
for (const wrap of [false, true]) {
  const one = b.code("json", text, { id: `w-${wrap}`, wrap });
  const perKeyW = Object.entries(doc).map(([k, v]) =>
    b.code("json", `"${k}": ${JSON.stringify(v, null, 2)}`, { id: `wk-${wrap}-${k}`, wrap }));
  const total = perKeyW.reduce((n, bl) => n + registry.measure(bl, REGION.width), 0);
  console.log(`wrap=${String(wrap).padEnd(5)} whole=${registry.measure(one, REGION.width)} rows · perKey total=${total} rows`);
}
