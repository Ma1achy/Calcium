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

/**
 * The handoff verbs — the first consumers of `/tty`'s route since it was built.
 *
 * **`interactive: true` is the whole declaration.** C23 §4 already implements
 * `lifecycle.suspend` → `runner.handoff` → `lifecycle.resume` →
 * `scheduler.invalidate`; nothing here writes any of it. These verbs are
 * `local: false` because C05 I19 refuses `interactive` with `local` — a local
 * verb is never spawned, so there is no child to hand the terminal to.
 *
 * ## `run` is interactive or not depending on its flags, and the type cannot say so
 *
 * `interactive` is on `ToolDef` and not on `FlagDef`, so a verb is interactive
 * whole. `docker run` attaches by default and detaches with `-d` — the same verb,
 * two terminal contracts, chosen per invocation. C05's comment says the app
 * author is the only party who can know; for this verb the author cannot know
 * either, because it is not a property of the verb. FINDINGS F80.
 *
 * **Declared interactive, which is the safe direction of a choice with no right
 * answer.** Wrong that way, `/run -d nginx` suspends and resumes around a call
 * that returns at once — a flicker. Wrong the other way, `/run -it alpine sh`
 * spawns a shell with no terminal and the session waits on a child that will
 * never be answered.
 */
const runVerb: ToolDef = {
  name: "run",
  local: false,
  interactive: true,
  summary: "Create a container and start it",
  args: [{ name: "image", type: "string", required: true, summary: "Image reference" }],
  flags: [
    { name: "detach", short: "d", type: "bool", summary: "Run in the background" },
    { name: "rm", type: "bool", summary: "Remove it when it exits" },
    { name: "name", type: "string", summary: "Name for the container" },
    { name: "interactive", short: "i", type: "bool", summary: "Keep stdin open" },
    { name: "tty", short: "t", type: "bool", summary: "Allocate a terminal" },
  ],
};

const exec: ToolDef = {
  name: "exec",
  local: false,
  interactive: true,
  summary: "Run a command inside a running container",
  args: [
    { name: "container", type: "string", required: true, summary: "Container id or name" },
    { name: "command", type: "string", required: false, summary: "What to run — defaults to the image's shell" },
  ],
  flags: [
    { name: "interactive", short: "i", type: "bool", summary: "Keep stdin open" },
    { name: "tty", short: "t", type: "bool", summary: "Allocate a terminal" },
    { name: "user", short: "u", type: "string", summary: "Run as this user" },
  ],
};

const attach: ToolDef = {
  name: "attach",
  local: false,
  interactive: true,
  summary: "Attach to a running container's terminal",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
};

const create: ToolDef = {
  name: "create",
  local: false,
  summary: "Create a container without starting it",
  args: [{ name: "image", type: "string", required: true, summary: "Image reference" }],
  flags: [{ name: "name", type: "string", summary: "Name for the container" }],
};

export const EXEC_TOOLS: readonly ToolDef[] = [
  cp,
  commit,
  exportVerb,
  save,
  load,
  importVerb,
  runVerb,
  exec,
  attach,
  create,
];
