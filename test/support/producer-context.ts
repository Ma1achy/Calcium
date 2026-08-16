// The producer context, for tests that call a producer directly (C07 §3).
//
// **`measure` is the real measurer and that is not a convenience.** A fixture
// supplying an arithmetic of its own would let every row pass against a producer
// that divides content wrongly — the fake supplying the behaviour under test,
// which is the class `test/support/README.md` records. So the registry here is
// the one C09 builds, with its default kinds, and a caller measuring through
// this context gets the same answer the frame does (C09 I1, C07 I20).
//
// `capabilities` defaults to the full record rather than the degraded one: a
// producer told `ascii` behaves differently, and a default that quietly degrades
// would make the ASCII rows agree with everything.
import { createBlockRegistry, type BlockDefinition } from "../../src/presentation/blocks/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import type { ProducerContext } from "../../src/data/adapters/types.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

export const FULL_CAPABILITIES: TerminalCapabilities = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  ambiguousWidth: "narrow",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
});

// The same three `expect-document.ts` registers, and for its reason: a registry
// missing a kind measures it as zero rather than refusing, so a producer
// splitting on a table would divide against nothing.
const registry = createBlockRegistry({ defaults: true });
for (const definition of [tableDefinition, plotDefinition, patchDefinition]) {
  registry.register(definition as unknown as BlockDefinition);
}

/**
 * A context for a producer under test.
 *
 * `height` defaults to `null`, which is the transcript-entry answer and the one
 * most callers want (C07 I18); a view's producer passes the region's.
 */
export function producerContext(over: Partial<ProducerContext> = {}): ProducerContext {
  return Object.freeze({
    width: 100,
    height: null,
    capabilities: FULL_CAPABILITIES,
    measure: (block, width) => registry.measure(block, width),
    ...over,
  });
}
