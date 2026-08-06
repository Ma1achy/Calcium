/**
 * Identity → registered → fallback. Adapters are disposable.
 *
 * C07 — see spec. The barrel exports what something actually consumes and
 * nothing else: C22 builds the registry, C23 calls it, an app writes an adapter
 * against the types. `fallbackBlocks`, `mapResult` and the patch adapter are
 * imported directly by the modules beside them, and an export nothing consumes
 * is one more thing that cannot be changed later.
 */

export type {
  Adapter,
  AdapterContext,
  AdapterRegistry,
  RawPatch,
  RawResult,
  StreamContext,
} from "./types.js";
export { AdapterSchemaError } from "./types.js";

export { createFallbackAdapter } from "./fallback.js";
export { exitCodeOf, usageBlocks } from "./mapping.js";
export { RegistrySealedError, createAdapterRegistry } from "./registry.js";
