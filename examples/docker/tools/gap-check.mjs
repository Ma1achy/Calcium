/**
 * Does the view's per-block sum agree with the sequence's real height?
 *
 * `document-view.ts` projects by summing `measure(block)` one at a time.
 * `renderSequenceToLines` is what actually draws, and a sequence can insert
 * separation between blocks that no single measurement carries. If the two
 * disagree, the window is computed against a height the frame does not have.
 */
import { appRegistry } from "./registry.mjs";
import { readFileSync } from "node:fs";
import { splitRaw } from "../src/inspect.ts";

// The application's registry, though this probe measures `code` blocks the
// defaults already carry. Using it anyway is the point: "the defaults are enough
// here" is a judgement that was true when it was made and is unchecked
// afterwards, which is how `measure-s3.mjs` came to measure a plot through the
// fallback.
const registry = appRegistry();
const doc = JSON.parse(
  readFileSync(new URL("../test/corpus/inspect-raw-probe.json", import.meta.url), "utf8"),
)[0];
for (const n of [1, 2, 5, 20]) {
  // **`splitRaw` takes the frame's own measurement now** (C07 I20), and this
  // probe was still calling the two-argument form — so it had not run since the
  // signature moved, and nothing said so. That is group 9's subject arriving in
  // group 9: an instrument nobody runs is indistinguishable from one that works.
  // FINDINGS F144.
  const blocks = splitRaw(doc, 100, (bl, w) => registry.measure(bl, w)).slice(0, n);
  const summed = blocks.reduce((a, bl) => a + registry.measure(bl, 100), 0);
  const sequence = registry.measureSequence(blocks, 100);
  console.log(
    `${String(n).padStart(2)} blocks: sum-of-measure=${String(summed).padStart(4)}  ` +
      `measureSequence=${String(sequence).padStart(4)}  delta=${sequence - summed}`,
  );
}
