/**
 * The two deep imports the app cannot avoid, resolved through the *package*
 * rather than through the repository.
 *
 * **F36 and F37 are why these exist at all**: the app needs a document validator
 * and a block measurer, Calcium has both at construction, and neither is on the
 * public surface. So two test files reach past `exports` into `dist/`. That is
 * recorded as a finding and is `docs/ROADMAP.md` entry 1's largest instance.
 *
 * **This file is about the second defect, which the first one hid.** The reach
 * was written as `../../../dist/…` — a path relative to *this checkout*. Under
 * `make proof` the example is copied into a tree that has never seen this
 * repository, so `../../../dist` resolves to nothing and both files fail at
 * import. The gate has therefore been red since the deep import landed in PR
 * #20, and nothing noticed because **`make proof` is the one target CI does not
 * run** — the roadmap already listed that as an outstanding item, and this is
 * what it cost.
 *
 * The repair keeps the finding and removes the fragility. `dist/` is inside the
 * published tarball (`files: ["dist", …]`), so the same modules are reachable
 * from the installed package — the path just has to be resolved from the package
 * root instead of by counting directories upwards. In the workspace that root is
 * the repository; under `make proof` it is `node_modules/@fmx/calcium`. One
 * expression, both worlds.
 *
 * **It is still a deep import and still a finding.** Nothing here is a
 * workaround for the missing exports; it is the same reach, aimed at something
 * that exists in both places a consumer might be.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);

/** `<package root>/…`, wherever the package really is. */
const inPackage = (path: string): string =>
  new URL(`../${path}`, pathToFileURL(require_.resolve("@fmx/calcium"))).href;

// eslint-disable-next-line no-restricted-imports -- F36: no public validator.
export const { validateDocument } = (await import(
  inPackage("dist/data/viewmodel/index.js")
)) as { validateDocument: (doc: unknown) => { ok: boolean; errors?: readonly string[] } };

// eslint-disable-next-line no-restricted-imports -- F37: no public measurer.
export const { createBlockRegistry } = (await import(
  inPackage("dist/presentation/blocks/index.js")
)) as { createBlockRegistry: (...args: readonly unknown[]) => unknown };
