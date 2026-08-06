/**
 * The resource families — networks, volumes, contexts, builders, and what disk
 * is being used.
 *
 * **Adapted verbs, not local**, and that is the first family since step 8 that
 * gets to be. Nothing here asks a question and nothing needs state across calls,
 * so C07 renders them and the registry states `meta` — which is the whole of
 * F77's cost avoided. Nine verbs at roughly a third of the lines a local one
 * costs.
 *
 * **Every field name below was read off a real invocation**, not from docker's
 * documentation. `docker network ls --format json` and its siblings emit NDJSON
 * with capitalised keys, and the shim's `--json` → `--format json` translation
 * already covers them, so this family needed no shim change at all.
 */

import type { ToolDef } from "@fmx/calcium";

const QUIET = { name: "quiet", short: "q", type: "bool", summary: "Ids only" } as const;

const networkLs: ToolDef = {
  name: "network ls",
  local: false,
  summary: "List networks",
  args: [],
  flags: [QUIET],
};

const volumeLs: ToolDef = {
  name: "volume ls",
  local: false,
  summary: "List volumes",
  args: [],
  flags: [QUIET],
};

const contextLs: ToolDef = {
  name: "context ls",
  local: false,
  summary: "List docker contexts",
  args: [],
  flags: [],
};

const builderLs: ToolDef = {
  name: "builder ls",
  local: false,
  summary: "List build drivers",
  args: [],
  flags: [],
};

const systemDf: ToolDef = {
  name: "system df",
  local: false,
  summary: "Disk used by images, containers, volumes and cache",
  args: [],
  flags: [],
};

const imageHistory: ToolDef = {
  name: "image history",
  local: false,
  summary: "The layers an image is made of",
  args: [{ name: "image", type: "string", required: true, summary: "Image id or tag" }],
  flags: [],
};

const networkInspect: ToolDef = {
  name: "network inspect",
  local: false,
  summary: "Everything about a network",
  args: [{ name: "network", type: "string", required: true, summary: "Network id or name" }],
  flags: [],
};

const volumeInspect: ToolDef = {
  name: "volume inspect",
  local: false,
  summary: "Everything about a volume",
  args: [{ name: "volume", type: "string", required: true, summary: "Volume name" }],
  flags: [],
};

const imageInspect: ToolDef = {
  name: "image inspect",
  local: false,
  summary: "Everything about an image",
  args: [{ name: "image", type: "string", required: true, summary: "Image id or tag" }],
  flags: [],
};

export const RESOURCE_TOOLS: readonly ToolDef[] = [
  networkLs,
  volumeLs,
  contextLs,
  builderLs,
  systemDf,
  imageHistory,
  networkInspect,
  volumeInspect,
  imageInspect,
];
