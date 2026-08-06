/**
 * The mutation family — `stop` `start` `restart` `kill` `pause` `unpause`
 * `rename` `update`. The first verbs in this app that change anything.
 *
 * ## Why every one of these is a local handler
 *
 * `ctx.ask` lives on `LocalContext` (C23 I36) and an adapter is handed one
 * result with no way to suspend, so **a verb that confirms must be local**. Five
 * of these eight would otherwise be adapted verbs of about fifteen lines each.
 * That is a finding rather than a design — FINDINGS F77 — and it is the third
 * distinct reason this app has reached for `local` (the dashboard needed a ring
 * that outlives a fetch, the events window the same).
 *
 * ## Ruling B — a state change leaves the transcript alone
 *
 * A `/ps` sitting above a successful `/stop` still says `running`, and **that is
 * correct rather than tolerated**. It is a record of what was true when it was
 * drawn. Nothing here reaches back into the transcript, for three reasons and the
 * third settles it:
 *
 *   - The transcript is already a log. Entries freeze when a newer one appends;
 *     staleness is inherent to that model rather than a defect in it.
 *   - Marking prior entries would need the transcript to know what an entry is
 *     *about* — a semantic index over documents, which C13 does not have and
 *     should not grow.
 *   - **The live block already answers "what is true now."** The landing
 *     dashboard polls, so current state is always at the bottom of the session.
 *     History is history; the live block is now. A reader does not need history
 *     to lie less, they need to know where to look.
 *
 * "Mark the stale entries" is what a reader assumes, and it is much larger than
 * it looks. It is written down here because a ruling that evaporates gets
 * re-made.
 *
 * ## The far side, measured before any of this was written
 *
 * | | |
 * |---|---|
 * | `stop` on an already-stopped container | **exit 0**, echoes the name |
 * | success | the bare container name on stdout — no JSON anywhere |
 * | `rename` success | no output at all |
 * | failure | `Error response from daemon: …` on stderr, exit 1 |
 * | `unpause` when not paused | names the container by **full id**, not as typed |
 *
 * The first row is the one that shaped the design. `docker stop` cannot tell you
 * whether it stopped anything — a no-op and a real stop are the same exit code
 * and the same output — so state is read first, which a local handler can do and
 * an adapter cannot. That read serves two purposes at once: it is also what the
 * confirm shows.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { Block, LocalContext, ViewDocument } from "@fmx/calcium";

const run = promisify(execFile);

type Verb =
  | "stop"
  | "start"
  | "restart"
  | "kill"
  | "pause"
  | "unpause"
  | "rename"
  | "update";

/** What `docker inspect` says that any of these verbs cares about. */
export type State = Readonly<{
  name: string;
  image: string;
  status: string;
  running: boolean;
  paused: boolean;
}>;

export type Runner = (args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

const realRunner: Runner = async (args) =>
  await run("docker", [...args], { maxBuffer: 8 << 20 });

/** `null` when there is no such container — the one failure worth its own arm. */
export async function inspectState(runner: Runner, ref: string): Promise<State | null> {
  try {
    const { stdout } = await runner([
      "inspect",
      ref,
      "--format",
      "{{.Name}}\t{{.Config.Image}}\t{{.State.Status}}\t{{.State.Running}}\t{{.State.Paused}}",
    ]);
    const [name, image, status, running, paused] = stdout.trim().split("\t");
    return {
      // docker returns `/name`; the leading slash is an API artefact and not
      // part of what anybody typed or reads.
      name: (name ?? ref).replace(/^\//u, ""),
      image: image ?? "",
      status: status ?? "",
      running: running === "true",
      paused: paused === "true",
    };
  } catch {
    return null;
  }
}

const meta = (argv: readonly string[], exitCode: number, stderr = ""): ViewDocument["meta"] => ({
  verb: argv[0] ?? null,
  adapter: "mutation",
  exitCode,
  durationMs: 0,
  truncated: false,
  argv,
  stderr,
  transport: "local",
  origin: "user",
});

function errorDoc(command: string, argv: readonly string[], message: string): ViewDocument {
  return {
    schema: "tui.view/1",
    command,
    status: "error",
    // C04 I3 — required when the status is `error`, and its absence is silent:
    // C13 throws, C23 discards, and the reader gets no entry at all (F35).
    error: { message, stage: "local" },
    blocks: [b.notice.error(message)],
    meta: meta(argv, 1, message),
  };
}

function okDoc(command: string, argv: readonly string[], blocks: readonly Block[]): ViewDocument {
  return { schema: "tui.view/1", command, status: "ok", blocks, meta: meta(argv, 0) };
}

/**
 * What the question shows — Ruling C's `detail`, one family early.
 *
 * A confirm that says only *Stop api-gateway?* asks the user to trust that the
 * name resolved to what they meant. This is the read that already happened.
 */
const detailOf = (s: State): Block =>
  b.kv({ container: s.name, image: s.image, state: s.status });

/**
 * The verbs that ask, and **the axis is reversibility rather than danger**.
 *
 * `rename` is the interesting exclusion: docker will not undo it, but the user
 * can in one command, with information the frame is already showing. A confirm
 * on everything trains people to answer without reading, which is the failure
 * mode confirms exist to prevent.
 */
const CONFIRMS: ReadonlySet<Verb> = new Set(["stop", "restart", "kill", "pause", "update"]);

/**
 * The state each verb needs the container to already be in, and what to say when
 * it is not.
 *
 * **A no-op does not ask.** `docker stop` on a stopped container exits 0 and
 * says the name, so without this the frame reports a stop that never happened —
 * and asks a question whose answer changes nothing, which is Ruling C's zero-item
 * case arriving in the lifecycle family.
 */
const PRECONDITION: Readonly<Record<Verb, ((s: State) => string | null) | null>> = {
  stop: (s) => (s.running ? null : `${s.name} is already stopped`),
  start: (s) => (s.running ? `${s.name} is already running` : null),
  restart: null,
  kill: (s) => (s.running ? null : `${s.name} is not running`),
  pause: (s) =>
    !s.running ? `${s.name} is not running` : s.paused ? `${s.name} is already paused` : null,
  unpause: (s) => (s.paused ? null : `${s.name} is not paused`),
  rename: null,
  update: (s) => (s.running ? null : `${s.name} is not running`),
};

/** The past tense each verb reports, because "stop succeeded" reads like a log. */
const DONE: Readonly<Record<Verb, string>> = {
  stop: "stopped",
  start: "started",
  restart: "restarted",
  kill: "killed",
  pause: "paused",
  unpause: "unpaused",
  rename: "renamed",
  update: "updated",
};

/** The question, per verb — `kill` says what makes it different from `stop`. */
function questionOf(verb: Verb, s: State, args: readonly string[]): string {
  if (verb === "kill") {
    const signal = flagValue(args, "signal") ?? "KILL";
    return `Send SIG${signal.replace(/^SIG/u, "")} to ${s.name}? It will not be asked to finish.`;
  }
  if (verb === "update") return `Change ${s.name}'s resource limits while it runs?`;
  return `${verb[0]!.toUpperCase()}${verb.slice(1)} ${s.name}?`;
}

function flagValue(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

const hasFlag = (args: readonly string[], name: string): boolean =>
  args.includes(`--${name}`) || args.includes(`-${name[0]!}`);

/** The docker invocation each verb spawns, given its arguments. */
function argvFor(verb: Verb, ref: string, args: readonly string[]): readonly string[] {
  const passthrough: string[] = [];
  if (verb === "stop") {
    const t = flagValue(args, "time");
    if (t !== undefined) passthrough.push("--time", t);
  }
  if (verb === "kill") {
    const s = flagValue(args, "signal");
    if (s !== undefined) passthrough.push("--signal", s);
  }
  if (verb === "update") {
    for (const name of ["memory", "cpus"]) {
      const v = flagValue(args, name);
      if (v !== undefined) passthrough.push(`--${name}`, v);
    }
  }
  if (verb === "rename") return ["rename", ref, args[1] ?? ""];
  return [verb, ...passthrough, ref];
}

export function createMutationHandler(
  verb: Verb,
  runner: Runner = realRunner,
): (args: readonly string[], ctx: LocalContext) => Promise<ViewDocument> {
  return async (args, ctx) => {
    const ref = args[0];
    const usage = verb === "rename" ? `usage: /rename <container> <new-name>` : `usage: /${verb} <container>`;
    if (ref === undefined || ref === "") return errorDoc(ctx.command, [verb], usage);
    if (verb === "rename" && (args[1] === undefined || args[1] === "")) {
      return errorDoc(ctx.command, [verb, ref], usage);
    }

    const state = await inspectState(runner, ref);
    if (state === null) return errorDoc(ctx.command, [verb, ref], `no such container: ${ref}`);

    // The no-op arm, before the question rather than after it.
    const blocked = PRECONDITION[verb]?.(state) ?? null;
    if (blocked !== null) {
      return okDoc(ctx.command, argvFor(verb, ref, args), [b.notice.warn(blocked)]);
    }

    if (CONFIRMS.has(verb) && !hasFlag(args, "force")) {
      const answer = await ctx.ask({
        question: questionOf(verb, state, args),
        detail: detailOf(state),
        choices: [
          { key: "y", label: "yes" },
          { key: "n", label: "no", default: true },
        ],
      });
      // **Declined is `ok`, not `error`.** Nothing failed — the user was asked
      // and said no, and colouring that red would make a working confirm look
      // like a broken command.
      if (answer !== "y") {
        return okDoc(ctx.command, argvFor(verb, ref, args), [
          b.notice.warn(`not ${DONE[verb]} — ${state.name} is unchanged`),
        ]);
      }
    }

    const argv = argvFor(verb, ref, args);
    try {
      await runner(argv);
    } catch (cause) {
      // docker names the container by full id in several of these; the user
      // typed a name, so the message leads with what they wrote.
      const said = String((cause as { stderr?: string }).stderr ?? cause).trim();
      return errorDoc(ctx.command, argv, said || `could not ${verb} ${state.name}`);
    }

    const after = verb === "rename" ? (args[1] ?? state.name) : state.name;
    return okDoc(ctx.command, argv, [b.notice.ok(`${after} ${DONE[verb]}`)]);
  };
}

/** Every handler, keyed by verb — spread into `localHandlers`. */
export function mutationHandlers(
  runner: Runner = realRunner,
): Record<string, (args: readonly string[], ctx: LocalContext) => Promise<ViewDocument>> {
  const verbs: readonly Verb[] = [
    "stop",
    "start",
    "restart",
    "kill",
    "pause",
    "unpause",
    "rename",
    "update",
  ];
  return Object.fromEntries(verbs.map((v) => [v, createMutationHandler(v, runner)]));
}
