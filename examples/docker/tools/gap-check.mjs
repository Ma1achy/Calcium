/**
 * Does the view's per-block sum agree with the sequence's real height?
 *
 * `document-view.ts` projects by summing `measure(block)` one at a time.
 * `renderSequenceToLines` is what actually draws, and a sequence can insert
 * separation between blocks that no single measurement carries. If the two
 * disagree, the window is computed against a height the frame does not have.
 */
import { createBlockRegistry } from "../../../dist/presentation/blocks/index.js";
import { readFileSync } from "node:fs";
import { splitRaw } from "../src/inspect.ts";

const registry = createBlockRegistry({ defaults: true });
const doc = JSON.parse(
  readFileSync(new URL("../test/corpus/inspect-raw-probe.json", import.meta.url), "utf8"),
)[0];
for (const n of [1, 2, 5, 20]) {
  const blocks = splitRaw(doc, 100).slice(0, n);
  const summed = blocks.reduce((a, bl) => a + registry.measure(bl, 100), 0);
  const sequence = registry.measureSequence(blocks, 100);
  console.log(
    `${String(n).padStart(2)} blocks: sum-of-measure=${String(summed).padStart(4)}  ` +
      `measureSequence=${String(sequence).padStart(4)}  delta=${sequence - summed}`,
  );
}
