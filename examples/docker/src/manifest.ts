/**
 * The far side, declared. One verb in step 1.
 *
 * Written by hand rather than generated: R01 §3's claim is that a manifest is a
 * thing an app author writes, and a generator would prove something about
 * docker's help output instead.
 *
 * **A `ManifestDocument`, not a `Manifest`** (C22 I23a). The app supplies its own
 * verbs; construction parses the document and adds the framework's six. Neither
 * arm of `TuiConfig.manifest` worked until this app tried to start — see
 * FINDINGS F7 — and the typed arm is used here deliberately, because it is the
 * one a reader reaches for first and the one that was impossible.
 *
 * **British spelling in this app's own prose; docker's field names stay exactly
 * as docker emits them.** `Names`, `Status`, `State` are the far side's
 * vocabulary and are not ours to normalise — the moment they are re-spelled the
 * mapping stops being checkable against `docker ps --format json`.
 */

import type { ManifestDocument, ToolDef } from "@fmx/calcium";

/**
 * F1's shim, not `docker`.
 *
 * Calcium appends `--json`, docker rejects it, and `bin/docker-json` translates.
 * An absolute path because it is resolved by the process spawner, not by a
 * shell. See FINDINGS F1 — this line and the shim are deleted together.
 */
export const BINARY = new URL("../bin/docker-json", import.meta.url).pathname;

const ps: ToolDef = {
  name: "ps",
  local: false,
  summary: "List containers",
  args: [],
  flags: [
    {
      name: "all",
      short: "a",
      type: "bool",
      summary: "Show stopped containers as well as running ones",
    },
  ],
};

/**
 * `engineVersion` is the daemon's, read at startup rather than written down: the
 * field exists for skew reporting, and a manifest claiming a version the daemon
 * does not have reports the wrong skew — which is worse than reporting none.
 *
 * This is also why the manifest is built here rather than shipped as JSON beside
 * this file. A document on disk is static, and the one field that must not be
 * would have had to go stale for the loader's sake.
 */
export function buildManifest(engineVersion: string): ManifestDocument {
  return {
    schema: "tui.manifest/1",
    binary: "docker",
    version: engineVersion,
    tools: [ps],
  };
}
