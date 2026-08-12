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
 * **The declaration is the whole of it.** C23 §4 already implements
 * `lifecycle.suspend` → `runner.handoff` → `lifecycle.resume` →
 * `scheduler.invalidate`; nothing here writes any of it. These verbs are
 * `local: false` because C05 I19 refuses `interactive` with `local` — a local
 * verb is never spawned, so there is no child to hand the terminal to.
 *
 * ## `run` and `exec` decide per invocation, and now the type says so
 *
 * F80, ruled as C05 I23. `interactive` is on `FlagDef` as well as on `ToolDef`,
 * and an arm equal to the tool's default is refused at parse — so every arm on a
 * verb reads the opposite of its default and two flags cannot disagree.
 *
 * `run` attaches by default, so `--detach` carries `false`. `exec` does not, so
 * `-i` and `-t` carry `true`. **`/run -dit` resolves to not-interactive without
 * any precedence rule**, because `-i` and `-t` could only carry `run`'s default
 * and therefore carry nothing.
 *
 * **The old declaration was `interactive: true` whole, chosen as the safe
 * direction, and the measurement inverted it.** `/run -d nginx` suspended, docker
 * wrote the container id to the real terminal, and `resume()` repainted over it —
 * the invocation's only output, gone, with the transcript reading `run finished`.
 * The direction called catastrophic turned out to be `docker run -it` exiting 1
 * at once against a non-terminal stdin. See F80's amendment.
 */
const runVerb: ToolDef = {
  name: "run",
  local: false,
  interactive: true,
  summary: "Create a container and start it",
  args: [{ name: "image", type: "string", required: true, summary: "Image reference" }],
  flags: [
    // The arm. `run` is interactive; `-d` is the invocation that is not.
    { name: "detach", short: "d", type: "bool", interactive: false, summary: "Run in the background" },
    { name: "rm", type: "bool", summary: "Remove it when it exits" },
    { name: "name", type: "string", summary: "Name for the container" },
    { name: "interactive", short: "i", type: "bool", summary: "Keep stdin open" },
    { name: "tty", short: "t", type: "bool", summary: "Allocate a terminal" },
  ],
};

const exec: ToolDef = {
  name: "exec",
  local: false,
  // **Not interactive by default, which is the other direction of the same
  // ruling.** `docker exec c ls` runs and returns; only `-i`/`-t` want the
  // terminal. Declared whole, `/exec c ls` suspended the screen to print one
  // line of output that the resume then discarded.
  summary: "Run a command inside a running container",
  args: [
    { name: "container", type: "string", required: true, summary: "Container id or name" },
    { name: "command", type: "string", required: false, summary: "What to run — defaults to the image's shell" },
  ],
  flags: [
    { name: "interactive", short: "i", type: "bool", interactive: true, summary: "Keep stdin open" },
    { name: "tty", short: "t", type: "bool", interactive: true, summary: "Allocate a terminal" },
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
