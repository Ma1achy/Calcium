/**
 * The registry family — `pull` `push` `build`. The verbs that take time and say
 * so while they do it.
 *
 * **Local, like every other verb since step 9, and for a second reason on top of
 * F77's.** These do not ask a question, so `ctx.ask` is not what forces it —
 * what forces it is that a progress display needs state that outlives a single
 * result. A `b.live` part polls a buffer the spawned process fills, and an
 * adapter is handed one `RawResult` with nowhere to keep anything. That is gap
 * 1's ring, arriving a fourth time (F78).
 */

import type { ToolDef } from "@fmx/calcium";

const pull: ToolDef = {
  name: "pull",
  local: true,
  summary: "Download an image",
  args: [{ name: "image", type: "string", required: true, summary: "Image reference, e.g. nginx:alpine" }],
  flags: [],
};

const push: ToolDef = {
  name: "push",
  local: true,
  summary: "Upload an image to its registry",
  args: [{ name: "image", type: "string", required: true, summary: "Image reference" }],
  flags: [],
};

const build: ToolDef = {
  name: "build",
  local: true,
  summary: "Build an image from a Dockerfile",
  args: [{ name: "context", type: "string", required: true, summary: "Build context directory" }],
  flags: [
    { name: "tag", short: "t", type: "string", summary: "Name for the built image" },
    { name: "file", short: "f", type: "string", summary: "Dockerfile path" },
    { name: "no-cache", type: "bool", summary: "Rebuild every step" },
  ],
};

export const REGISTRY_TOOLS: readonly ToolDef[] = [pull, push, build];
