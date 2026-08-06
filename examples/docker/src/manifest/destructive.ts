/**
 * The destructive family — `rm` `rmi` `prune` `volume prune` `network prune`
 * `system prune`.
 *
 * Step 9's confirm, plus one concept it did not need: **weight**. `docker stop`
 * is reversible and `docker system prune` is not, and a confirm identical for
 * both is wrong. Ruling C: a destructive question carries a `detail` block
 * naming what it will destroy.
 *
 * **There is no `--dry-run`.** Measured before any of this was designed:
 * `docker container prune` offers `--filter` and `--force` and nothing else, so
 * the detail comes from the corresponding `ls` — the same list docker itself
 * walks, run first and shown. That is why every prune verb here is two calls.
 *
 * **And the zero case does not ask at all** (Ruling C's second half). A confirm
 * for an operation with no effect trains people to answer without reading, which
 * is the failure mode confirms exist to prevent.
 */

import type { ToolDef } from "@fmx/calcium";

const FORCE = {
  name: "force",
  short: "f",
  type: "bool",
  summary: "Skip the confirmation",
} as const;

/**
 * `--filter` is declared on every prune verb, and it is the flag this
 * repository's own tests are required to pass.
 *
 * A bare prune in a working tree removes whatever else the reader happens to
 * have running. `examples/docker/Makefile` documents the two-prefix rule and
 * `throwaway-sweep` matches on the prefix for the same reason.
 */
const FILTER = {
  name: "filter",
  type: "string",
  summary: "Restrict to matching resources, e.g. label=dtui-test",
} as const;

const rm: ToolDef = {
  name: "rm",
  local: true,
  summary: "Remove a container",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [FORCE],
};

const rmi: ToolDef = {
  name: "rmi",
  local: true,
  summary: "Remove an image",
  args: [{ name: "image", type: "string", required: true, summary: "Image id or tag" }],
  flags: [FORCE],
};

const prune: ToolDef = {
  name: "prune",
  local: true,
  summary: "Remove stopped containers",
  args: [],
  flags: [FORCE, FILTER],
};

const volumePrune: ToolDef = {
  name: "volume prune",
  local: true,
  summary: "Remove volumes nothing is using",
  args: [],
  flags: [FORCE, FILTER],
};

const networkPrune: ToolDef = {
  name: "network prune",
  local: true,
  summary: "Remove networks nothing is attached to",
  args: [],
  flags: [FORCE, FILTER],
};

const systemPrune: ToolDef = {
  name: "system prune",
  local: true,
  summary: "Remove stopped containers, unused networks and dangling images",
  args: [],
  flags: [FORCE, FILTER],
};

export const DESTRUCTIVE_TOOLS: readonly ToolDef[] = [
  rm,
  rmi,
  prune,
  volumePrune,
  networkPrune,
  systemPrune,
];
