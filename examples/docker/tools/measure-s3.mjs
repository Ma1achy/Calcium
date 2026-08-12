/**
 * S3's height, per block, through the same registry C15 measures with.
 *
 * Counting rows off a replayed capture gives the total and not the split, and
 * the split is what C22 §13a's deferral rests on: a block taller than the region
 * is the one case block-boundary windowing and the region can disagree.
 */
import { appRegistry } from "./registry.mjs";
import { parseNdjson } from "../src/ndjson.ts";
import { containerView } from "../src/container.ts";
import { readFileSync } from "node:fs";

const row = parseNdjson(
  readFileSync(new URL("../test/corpus/stats-real.ndjson", import.meta.url), "utf8"),
).rows[0];
/**
 * **The registry is the application's, and it is shared.** A defaults-only
 * registry has no `plot`, so a probe built on one measures S3's plot through the
 * fallback and answers 5 rows for a panel that draws 13 — a correct measurement
 * of a different application. All three probes now go through `registry.mjs`,
 * and `probes_test.mjs` compares its kinds against `src/shell/construct.ts` by
 * equality.
 */
const registry = appRegistry();

for (const width of [120, 80]) {
  const blocks = containerView(row, width);
  const parts = blocks.map((b) => `${b.kind}#${b.id}=${registry.measure(b, width)}`);
  const total = blocks.reduce((n, b) => n + registry.measure(b, width), 0);
  console.log(`width ${String(width).padStart(3)}: TOTAL ${total}  [${parts.join("  ")}]`);
}
