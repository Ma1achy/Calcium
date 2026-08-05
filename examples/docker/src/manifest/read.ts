/**
 * The read-only families — the thirteen verbs steps 1–8 built, declared.
 *
 * Split out of `manifest.ts` when the mutation family arrived and one file
 * stopped being readable. **The split is by family rather than by size**: a
 * reader asking "what can this app do to a container" should find one file, and
 * the families are the same ones `/help` groups by, so the grouping has one
 * source rather than two that drift.
 *
 * `manifest.ts` composes; nothing imports this directly.
 *
 * **British spelling in this app's own prose; docker's field names stay exactly
 * as docker emits them.** `Names`, `Status`, `State` are the far side's
 * vocabulary and are not ours to normalise — the moment they are re-spelled the
 * mapping stops being checkable against `docker ps --format json`.
 */

import type { ToolDef } from "@fmx/calcium";

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
 * The landing dashboard, as a **local** verb (S1, behind `/dashboard` — F9).
 *
 * `local: true` is what makes C23's `seal()` accept the handler: the registry and
 * the manifest are two records of the same fact and the seal compares them, so a
 * handler with no row here is unreachable while looking installed, and a row here
 * with no handler refuses construction outright (C23 I27).
 */
const dashboard: ToolDef = {
  name: "dashboard",
  local: true,
  summary: "The running containers, refreshing in place",
  args: [],
  flags: [],
};

/**
 * S3's drill-in — the surface C22 §13a was ruled for.
 *
 * **`view: true` on the tool, and the name is the ruling twice over.** S02 drew
 * this as `ps <uuid> --watch` and it cannot be spawned: `docker ps` takes no
 * positional, `--watch` is not a docker flag, and C06 I4 sends argv to the far
 * side verbatim. `docker container stats` is real and takes the id.
 *
 * And it is a **sub-verb** rather than plain `stats` so that `/stats` stays free
 * for S4, which S02 reserves for a transcript entry — a tool-level `view` on
 * `stats` would have pushed S4 as well. C05 supports the space (`findTool`
 * matches longest-first) and C18 splits it back into argv.
 *
 * `local: false`, so this is the app route: transport, adapter, and
 * `AdapterContext.width` — which the plot's window is sized from and which a
 * local handler would not have had (FINDINGS F14).
 */
const containerStats: ToolDef = {
  name: "container stats",
  local: false,
  view: true,
  summary: "One container, live — CPU over time, memory, network",
  args: [
    {
      name: "container",
      type: "string",
      required: true,
      summary: "Container id or name",
    },
  ],
  flags: [],
};

/**
 * S5's fullscreen view — the first surface with more content than region.
 *
 * **`view: true` and `local: false`.** One call, so an adapter fits, and the
 * adapter route is the only one that carries `width` (FINDINGS F14) — which
 * `--raw` needs, because a wrapped code block's height depends on it.
 *
 * `--raw` is a **flag, not the `r` toggle S5's footer draws.** There is no plain
 * `r` binding at the `pushedView` target — `keymap.ts` has `Ctrl-R` at `prompt`
 * and `overlay` and nothing else — so the toggle is a C16 keymap change plus a
 * mode the view does not hold. Filed as F38; the flag is what exists today.
 */
const inspect: ToolDef = {
  name: "inspect",
  local: false,
  view: true,
  summary: "One container in full — structured, or the raw JSON",
  args: [
    { name: "container", type: "string", required: true, summary: "Container id or name" },
  ],
  flags: [
    {
      name: "raw",
      type: "bool",
      summary: "The literal docker inspect JSON, syntax-highlighted",
    },
  ],
};

/**
 * S7 and S6 — the comparison block's two surfaces.
 *
 * **Local, and forced rather than chosen.** `/drift` runs `docker inspect <c>`
 * and *then* `docker image inspect` on the image that reports: two calls where
 * the second depends on the first, and an adapter is handed one result. A01 D4
 * makes them transcript entries rather than views — no letter keys, no claim on
 * the whole screen.
 */
const drift: ToolDef = {
  name: "drift",
  local: true,
  summary: "What a running container has changed from its image",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
};

const compare: ToolDef = {
  name: "compare",
  local: true,
  summary: "Two containers, side by side",
  args: [
    { name: "a", type: "string", required: true, summary: "First container" },
    { name: "b", type: "string", required: true, summary: "Second container" },
  ],
  flags: [],
};

/**
 * S8 — the patch block's own surface.
 *
 * **Local, and forced for `/drift`'s reason twice over**: two calls where the
 * second depends on the first (`docker exec` for the running file, then
 * `docker run --rm <image> cat` for the baseline), and an adapter is handed one
 * result. A transcript entry rather than a view — no letter keys, no claim on
 * the screen (A01 D4).
 *
 * **`path` is required and the bare form is not an error to be tidied away.**
 * `.Mounts` gives `Type: "bind"` for a file and for a directory with no
 * distinguishing field, so discovery cannot be ruled in; given no path the verb
 * offers the bind destinations as candidates. Declared `required: false` so C05
 * lets the verb run and answer, rather than refusing before it can say what it
 * would have needed.
 */
const config: ToolDef = {
  name: "config",
  local: true,
  summary: "A config file as the container has it, against the image's original",
  args: [
    { name: "container", type: "string", required: true, summary: "Container id or name" },
    { name: "path", type: "string", required: false, summary: "Path to the file inside the container" },
  ],
  flags: [],
};

/**
 * S9's pushed streaming view — **the surface that forced C22 I48**.
 *
 * `view: true` **and** `streams: true`, which C05 I20 has permitted since it was
 * written and no route could run until now: the pair fell to the non-streaming
 * path, blocked until the process exited and held the submission guard for the
 * whole of it, so C23 refused it loudly instead. `docker logs -f` has no natural
 * end and A01 D4's test makes it a view, so this is the declaration that had to
 * exist before the route could.
 *
 * `-f` and `--tail 200` are the shim's, for F39's reason: an app cannot add a
 * flag to a spawn.
 */
const logs: ToolDef = {
  name: "logs",
  local: false,
  view: true,
  streams: true,
  summary: "Follow a container's output",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
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
/**
 * S10 and S11's four one-call verbs.
 *
 * **All four `local: false`, and three of the four far sides do not emit
 * JSON.** That is not a reason to make them local: an adapter is handed a whole
 * `RawResult` and parses whatever arrived, which is what `/ps` already does with
 * NDJSON. Making them local would give up the transport, the real `meta`, and
 * `AdapterContext.width` (F14) in exchange for nothing.
 *
 * `bin/docker-json` drops Calcium's `--json` for `diff`, `port` and `top`
 * (S11_WALK.md A1). None of them is a view: one call, one document, no claim on
 * the whole screen (A01 D4).
 */
const diff: ToolDef = {
  name: "diff",
  local: false,
  summary: "What a container has changed on its own filesystem",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
};

/**
 * S9 — the image list, and the argument that gave completion a subject.
 *
 * **`repository` exists because the completion source had nothing to serve.**
 * Building the app's sources (C19 §3 hook 4) turned up that no argument in this
 * manifest takes an image: `/inspect` is one container in full, `/drift` takes a
 * container, and this took nothing — so an image source would have been
 * registered, correct, and unreachable, which is an invariant vacuous until its
 * subject exists.
 *
 * The argument is docker's own and was measured before it was declared:
 * `docker images nginx --format json` filters server-side and exits 0, and the
 * shim passes positionals through untouched, so the adapter needs no change.
 */
const images: ToolDef = {
  name: "images",
  local: false,
  summary: "The images on this daemon",
  args: [
    {
      name: "repository",
      type: "string",
      required: false,
      summary: "Only images in this repository",
    },
  ],
  flags: [
    {
      name: "all",
      short: "a",
      type: "bool",
      summary: "Include intermediate images as well as tagged ones",
    },
  ],
};

const top: ToolDef = {
  name: "top",
  local: false,
  summary: "The processes running inside a container",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
};

const port: ToolDef = {
  name: "port",
  local: false,
  summary: "A container's published port mappings",
  args: [{ name: "container", type: "string", required: true, summary: "Container id or name" }],
  flags: [],
};

/**
 * S11's live one — **and `local: true`, which is the ruling rather than the
 * convenience.**
 *
 * `docker events` is asked for a *window* rather than followed as a stream
 * (`events.ts`), so this could be an adapter — one call, one document. It is a
 * local handler because the window is re-fetched every tick and the ring that
 * accumulates it has to outlive the fetch, and an adapter is handed one result
 * with nowhere to keep anything. That is the same reason the dashboard is
 * local, and gap 1's ring is the precedent.
 */
const events: ToolDef = {
  name: "events",
  local: true,
  summary: "Container lifecycle events, newest first",
  args: [],
  flags: [],
};

export const READ_TOOLS: readonly ToolDef[] = [ps, dashboard, containerStats, inspect, logs, drift, compare, config, diff, images, top, port, events];
