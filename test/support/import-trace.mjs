// C23 I71's instrument — every module this process resolves, listed on demand.
//
// **On the main thread, so the list is readable by the script under test.**
// `module.register` runs its hooks off-thread and can share nothing with the
// program; `module.registerHooks` (Node 22.15+) runs them here, so the child
// script reads `globalThis.__importTrace()` at the moments T5.22 names.
// Loaded with `node --import ./test/support/import-trace.mjs <script>`.
import { registerHooks } from "node:module";

const loaded = [];
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    loaded.push(result.url);
    return result;
  },
});
globalThis.__importTrace = () => [...loaded];
