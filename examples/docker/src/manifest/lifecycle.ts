/**
 * The mutation family — the first verbs in this app that change anything.
 *
 * **Every one is `local: true`, and that is the whole reason this family exists
 * as local handlers rather than adapted verbs.** An adapter is handed one result
 * and renders it; it cannot ask a question and wait. `ctx.ask` is on
 * `LocalContext` (C23 I36) and nowhere else, so a verb that confirms must be
 * local — which is the same argument that made the dashboard and the events
 * window local, arriving for a third reason.
 *
 * That is a finding rather than a design: an adapted verb is the cheaper thing to
 * write and five of these eight would otherwise be one. See FINDINGS F77.
 *
 * **Which verbs confirm** is a judgement about reversibility, not about danger:
 *
 * | confirms | why |
 * |---|---|
 * | `stop` `restart` `pause` | interrupts something that is serving |
 * | `kill` | interrupts it without asking it to finish (SIGKILL) |
 * | `update` | changes limits under a running process |
 * | `start` `unpause` `rename` | reversible by doing the opposite |
 *
 * `rename` is the interesting exclusion: it is not reversible by *docker*, but it
 * is reversible by the user in one command with information the frame is already
 * showing. A confirm that fires on everything trains people to answer without
 * reading, which is the failure mode confirms exist to prevent (Ruling C's
 * reasoning, applied one family earlier).
 */

import type { ToolDef } from "@fmx/calcium";

/** `container` is the one argument every verb here takes. */
const CONTAINER = {
  name: "container",
  type: "string",
  required: true,
  summary: "Container id or name",
} as const;

/**
 * Declared once and spread, so the eight cannot disagree about what `--force`
 * means. A per-verb copy is how `--all` came to have two summaries in step 4.
 */
const FORCE = {
  name: "force",
  short: "f",
  type: "bool",
  summary: "Skip the confirmation",
} as const;

const stop: ToolDef = {
  name: "stop",
  local: true,
  summary: "Stop a running container",
  args: [CONTAINER],
  flags: [
    FORCE,
    {
      name: "time",
      short: "t",
      type: "string",
      summary: "Seconds to wait before killing it (default 10)",
    },
  ],
};

const start: ToolDef = {
  name: "start",
  local: true,
  summary: "Start a stopped container",
  args: [CONTAINER],
  flags: [],
};

const restart: ToolDef = {
  name: "restart",
  local: true,
  summary: "Stop a container and start it again",
  args: [CONTAINER],
  flags: [FORCE],
};

const kill: ToolDef = {
  name: "kill",
  local: true,
  summary: "Kill a running container immediately",
  args: [CONTAINER],
  flags: [
    FORCE,
    { name: "signal", short: "s", type: "string", summary: "Signal to send (default KILL)" },
  ],
};

const pause: ToolDef = {
  name: "pause",
  local: true,
  summary: "Suspend every process in a container",
  args: [CONTAINER],
  flags: [FORCE],
};

const unpause: ToolDef = {
  name: "unpause",
  local: true,
  summary: "Resume a paused container",
  args: [CONTAINER],
  flags: [],
};

const rename: ToolDef = {
  name: "rename",
  local: true,
  summary: "Give a container a new name",
  args: [CONTAINER, { name: "newName", type: "string", required: true, summary: "The new name" }],
  flags: [],
};

const update: ToolDef = {
  name: "update",
  local: true,
  summary: "Change a running container's resource limits",
  args: [CONTAINER],
  flags: [
    FORCE,
    { name: "memory", short: "m", type: "string", summary: "Memory limit, e.g. 512m" },
    { name: "cpus", type: "string", summary: "CPU quota, e.g. 1.5" },
  ],
};

export const LIFECYCLE_TOOLS: readonly ToolDef[] = [
  stop,
  start,
  restart,
  kill,
  pause,
  unpause,
  rename,
  update,
];
