/**
 * The file-transfer tail — `cp` `commit` `export` `save` `load` `import`.
 *
 * **Local, because these are the verbs whose *absent* flag changes everything.**
 * `docker save` with no `--output` writes a tar to stdout, and the guard that
 * refuses it is the app's: only the manifest's author knows that this verb has a
 * shape where a missing flag turns silence into four megabytes.
 *
 * Named `exec.ts` because step 13's handoff verbs land here too.
 */

import type { ToolDef } from "@fmx/calcium";

const OUTPUT = {
  name: "output",
  short: "o",
  type: "path",
  summary: "Write to this file — required, or the archive lands in the transcript",
} as const;

const cp: ToolDef = {
  name: "cp",
  local: true,
  summary: "Copy files between a container and the host",
  args: [
    { name: "src", type: "string", required: true, summary: "Source, or <container>:<path>" },
    { name: "dest", type: "string", required: true, summary: "Destination, or <container>:<path>" },
  ],
  flags: [],
};

const commit: ToolDef = {
  name: "commit",
  local: true,
  summary: "Make an image from a container's current state",
  args: [
    { name: "container", type: "string", required: true, summary: "Container id or name" },
    { name: "image", type: "string", required: false, summary: "Name for the new image" },
  ],
  flags: [{ name: "message", short: "m", type: "string", summary: "Commit message" }],
};

const exportVerb: ToolDef = {
  name: "export",
  local: true,
  summary: "Write a container's filesystem to a tar archive",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [OUTPUT],
};

const save: ToolDef = {
  name: "save",
  local: true,
  summary: "Write an image to a tar archive",
  args: [{ name: "image", type: "string", required: true, summary: "Image id or tag" }],
  flags: [OUTPUT],
};

const load: ToolDef = {
  name: "load",
  local: true,
  summary: "Read an image from a tar archive",
  args: [],
  flags: [{ name: "input", short: "i", type: "path", summary: "Read from this file — required" }],
};

const importVerb: ToolDef = {
  name: "import",
  local: true,
  summary: "Make an image from a filesystem tar archive",
  args: [
    { name: "file", type: "string", required: true, summary: "Archive path or URL" },
    { name: "image", type: "string", required: false, summary: "Name for the new image" },
  ],
  flags: [],
};

export const EXEC_TOOLS: readonly ToolDef[] = [cp, commit, exportVerb, save, load, importVerb];
