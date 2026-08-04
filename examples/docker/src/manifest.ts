/**
 * The far side, declared. One verb in step 1.
 *
 * **This is a path, not a `Manifest`, and that is F7 rather than a preference.**
 * `TuiConfig.manifest` accepts `Manifest | string`, and the typed arm cannot be
 * used: `parseManifest` is the only thing that appends the framework's own six
 * verbs (`construct.ts:261`), it is not exported, and an object literal
 * satisfying `Manifest` therefore reaches construction without them and throws.
 * The error says so outright — *"pass the raw document … rather than a
 * hand-built Manifest"*.
 *
 * So the manifest is authored as JSON beside this file and loaded by path. What
 * is lost is exactly what R01 §3 wanted to demonstrate: that a manifest is a
 * thing an app author *writes*, with the compiler checking it. See FINDINGS F7.
 *
 * **British spelling in this app's own prose; docker's field names stay exactly
 * as docker emits them.** `Names`, `Status`, `State` are the far side's
 * vocabulary and are not ours to normalise — the moment they are re-spelled the
 * mapping stops being checkable against `docker ps --format json`.
 */

/**
 * F1's shim, not `docker`.
 *
 * Calcium appends `--json`, docker rejects it, and `bin/docker-json` translates.
 * An absolute path because it is resolved by the process spawner, not by a
 * shell. See FINDINGS F1 — this line and the shim are deleted together.
 */
export const BINARY = new URL("../bin/docker-json", import.meta.url).pathname;

/** Loaded by C22 through `config.fs.readFile`, then parsed by C05. */
export const MANIFEST_PATH = new URL("../manifest.json", import.meta.url).pathname;
