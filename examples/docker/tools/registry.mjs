// The registry the probes measure through — the application's, not a subset.
//
// **The measured defect, and it is written in `measure-s3.mjs`'s own header.**
// `createBlockRegistry({ defaults: true })` alone carries no `plot`, so a probe
// built on it measures S3's plot through the *fallback* and answers 5 rows for a
// panel that draws 13. The probe is then a correct measurement of a different
// application, and nothing in its output says which one.
//
// Three probes each built their own registry, so the omission had three places
// to happen and one of them was enough. Here it happens once, `probes_test.mjs`
// compares the kinds against `src/shell/construct.ts` by equality, and a fourth
// definition registered by the shell fails the fixture rather than quietly
// shrinking every probe.
import { createBlockRegistry } from "../../../dist/presentation/blocks/index.js";
import { tableDefinition } from "../../../dist/presentation/table/index.js";
import { plotDefinition } from "../../../dist/presentation/plot/index.js";
import { patchDefinition } from "../../../dist/presentation/patch/index.js";

/** The three the defaults do not carry; the shell registers them at
 * `construct.ts:337`. Exported so the fixture can compare the list rather than
 * re-deriving it from a second reading of the same file. */
export const EXTRA = [tableDefinition, plotDefinition, patchDefinition];

export function appRegistry() {
  const registry = createBlockRegistry({ defaults: true });
  for (const definition of EXTRA) registry.register(definition);
  return registry;
}
