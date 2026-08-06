/**
 * The far side, declared — composed from one file per family under `manifest/`.
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

import type { ManifestDocument } from "@fmx/calcium";
import { READ_TOOLS } from "./manifest/read.ts";
import { LIFECYCLE_TOOLS } from "./manifest/lifecycle.ts";
import { DESTRUCTIVE_TOOLS } from "./manifest/destructive.ts";
import { REGISTRY_TOOLS } from "./manifest/registry.ts";

/**
 * F1's shim, not `docker`.
 *
 * Calcium appends `--json`, docker rejects it, and `bin/docker-json` translates.
 * An absolute path because it is resolved by the process spawner, not by a
 * shell. See FINDINGS F1 — this line and the shim are deleted together.
 */
export const BINARY = new URL("../bin/docker-json", import.meta.url).pathname;

/**
 * The whole far side, composed from one file per family.
 *
 * **This is the only exporter**, so a family is added by writing its file and
 * spreading it here — one line, in one place, and the seal (C23 I27) checks the
 * result against the registered handlers.
 */
export function buildManifest(engineVersion: string): ManifestDocument {
  return {
    schema: "tui.manifest/1",
    binary: "docker",
    version: engineVersion,
    tools: [...READ_TOOLS, ...LIFECYCLE_TOOLS, ...DESTRUCTIVE_TOOLS, ...REGISTRY_TOOLS],
  };
}
