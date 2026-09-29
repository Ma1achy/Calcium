/**
 * docker-tui's configuration — everything `createTui` is handed, in one place,
 * so the app's own entry and the demo recorder build the same application.
 *
 * **Why this is its own file** (2026-09-29). It was the body of `main.ts`, which
 * starts the session on import. The recorder (`tools/record.ts`) needs the same
 * adapters, handlers, greeting and completion sources wired to the demo world
 * instead of the daemon, and a second copy of this literal would be free to
 * drift from the first with nothing comparing them — the recording would then
 * be a picture of an application nobody runs. So the literal moved and both
 * entries call it; what differs between them is `AppDeps`, and only that.
 *
 * R01 §3's four omissions still hold for the app: `main.ts` supplies no
 * transport, and the demo world's is C06's fixture replay rather than an
 * emulator (`world.ts`).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultTheme } from "@fmx/calcium";
import type { TransportRouter, TuiConfig } from "@fmx/calcium";
import { BINARY, buildManifest } from "./manifest.ts";
import { createPsAdapter } from "./ps.ts";
import { createDashboardHandler, dashboardBlocks } from "./dashboard.ts";
import { createContainerAdapter } from "./container.ts";
import { createInspectAdapter } from "./inspect.ts";
import { createLogsAdapter } from "./logs.ts";
import { createCompareHandler, createDriftHandler, inspectWith } from "./drift.ts";
import { createFilediffHandler, farOf } from "./filediff.ts";
import {
  createDiffAdapter,
  createImagesAdapter,
  createPortAdapter,
  createTopAdapter,
} from "./verbs.ts";
import { argv as eventsArgv, createEventsHandler } from "./events.ts";
import { dockerSources } from "./completion.ts";
import { mutationHandlers, type Runner } from "./mutation.ts";
import { destructiveHandlers } from "./destructive.ts";
import { progressHandlers, type Spawner } from "./progress.ts";
import { resourceAdapters } from "./resources.ts";
import { transferHandlers } from "./transfer.ts";

const run = promisify(execFile);

/** The daemon, through the `docker` CLI on `PATH`. */
export const realDocker: Runner = async (args) => await run("docker", [...args], { maxBuffer: 8 << 20 });

/** What the two entries supply. Everything else is the app's and is fixed here. */
export type AppDeps = Readonly<{
  /** The daemon's version, for the manifest and the dashboard's title. */
  engine: string;
  /** The environment C02 reads, and `DOCKER_TUI_DEPTH`. */
  env: Readonly<NodeJS.ProcessEnv>;
  /** Every local handler's far side: `realDocker`, or the demo world's. */
  docker: Runner;
  /** `pull`, `push`, `build`. Absent: `progress.ts` spawns docker itself. */
  spawner?: Spawner | undefined;
  /**
   * What the header names as the far side. Absent: `BINARY`, the shim C22
   * spawns. The demo world says `docker`, since it spawns nothing and the
   * shim's path is this checkout's — which a recording must not carry.
   */
  binary?: string | undefined;
  /** The adapted verbs' far side. Absent: C22's subprocess transport over `BINARY`. */
  transport?: TransportRouter | undefined;
}>;

/**
 * S12's depth, resolved by the app because that is where an environment variable
 * named for one application belongs (C22 I20's rule, and `PRISM_TUI_STATE_DIR`'s
 * precedent).
 *
 * **Four of the five depths need nothing here** — `COLORTERM=truecolor` gives
 * 24, `xterm-256color` gives 8, `xterm` gives 4, and `LANG=C` gives ASCII, all
 * through C02's own rules. **1-bit needs this**, because the only rule producing
 * `colourDepth: 1` is the `dumb` gate and that gate also clears `altScreen`,
 * which C02 I7 makes the one refusal that stops the shell. Before C22 I49 there
 * was no way for any application to say it (FINDINGS F52).
 *
 * Nothing else is overridden: `altScreen` stays detected, so this asks for a
 * one-bit *palette* on a terminal that can still open, which is what the
 * showcase is about.
 */
export const depthOverride = (
  env: Readonly<NodeJS.ProcessEnv>,
): { colourDepth: 1 | 4 | 8 | 24 } | undefined => {
  const raw = Number(env["DOCKER_TUI_DEPTH"] ?? "");
  return raw === 1 || raw === 4 || raw === 8 || raw === 24 ? { colourDepth: raw } : undefined;
};

export function appConfig(deps: AppDeps) {
  const docker = deps.docker;
  return {
    name: "docker-tui",
    // F1's shim rather than `docker` itself.
    binary: deps.binary ?? BINARY,
    // Only the demo world supplies one (`world.ts`); the app's own mode leaves
    // C22 to build the subprocess transport from `binary`, as R01 §9 claims.
    ...(deps.transport === undefined ? {} : { transport: deps.transport }),
    manifest: buildManifest(deps.engine),
    theme: defaultTheme,
    // **The second consumer of the cursor field, and the reason it is not
    // vacuous** (C22 I63, roadmap 45). A beam where the reader types and the
    // terminal's own everywhere else — which is the entry's own example, and the
    // case a style keyed on `Layer` could not express, since the prompt has no
    // `Placed`. Declaring nothing here would leave the field published, resolved
    // and never filled in by anyone.
    cursor: { targets: { prompt: { shape: "beam", blink: false } } },
    // **Required in practice, though the type says optional** (FINDINGS F8).
    // C22 I20 has the app supply the environment and no file under `src/` reads
    // `process.env` — but omitted it defaults to `{}`, so `TERM` is absent,
    // `altScreen` is false, and `acquire()` refuses to open the shell. The spec
    // says omitting it degrades to ASCII with no colour; it does not degrade.
    env: deps.env,
    // Undefined unless S12 asked, so an ordinary run detects exactly as before.
    //
    // **That this line compiles is itself a finding.** Calcium builds with
    // `exactOptionalPropertyTypes`, under which an optional property and a
    // property that may be undefined are different types — so `capabilities?:
    // Partial<TerminalCapabilities>` could not be supplied conditionally by any
    // consumer at all: neither an assignment nor a spread type-checks, only a
    // cast. Every internal caller passes a literal, which is why no producer
    // could have met it. FINDINGS F53.
    capabilities: depthOverride(deps.env),
    // **`counters`, because it is the lowest tier at which `/profile` opens — not
    // because this app wants figures** (C28 §3, C28 T4.1, C23 I68). The verb is
    // the framework's seventh and it draws C28's view only where a recorder
    // exists: `tier: "off"` and no `profile` at all build one session and hold
    // no recorder — C28 T4.1 asserts the two write identical bytes — so the verb
    // refuses there with a notice naming this field, which is what this app did
    // before this line (FINDINGS F953, F962). `counters` is the first recording
    // tier: an integer per seam, measured at nil against `off` in C28 §3a's
    // table. Opening the view raises to `spans` only while it is up and restores
    // on close (C28 I50), and the counters survive that raise, so the overview
    // opens on this session's frames and bytes rather than on zeros that are
    // true of nothing (C28 I44). Measured on this app through a PTY, five
    // spawns each way: the greeting's wall-clock is a median of 935 ms without
    // this line and 862 ms with it, the two ranges overlapping (F962).
    profile: { tier: "counters" },
    // Keyed by the verb, and a sub-verb's key is its whole name — the space is
    // part of it, not a separator this side of C18.
    adapters: {
      ps: createPsAdapter(),
      // The same flag the banner uses, for the same reason and a second time —
      // which is what makes F43 a finding rather than a one-off inconvenience.
      "container stats": createContainerAdapter(docker),
      inspect: createInspectAdapter(),
      logs: createLogsAdapter(),
      diff: createDiffAdapter(),
      images: createImagesAdapter(),
      top: createTopAdapter(),
      port: createPortAdapter(),
      // The resource tail (step 12). **Adapted, not local** — the first family
      // since step 8 that gets to be, because nothing here asks or accumulates.
      ...resourceAdapters(),
    },
    localHandlers: {
      dashboard: createDashboardHandler(deps.engine, docker),
      drift: createDriftHandler(inspectWith(docker)),
      compare: createCompareHandler(inspectWith(docker)),
      filediff: createFilediffHandler(farOf(docker)),
      // The window, fetched against `docker` directly rather than through the
      // shim: this is a local handler, so nothing appends `--json` and there is
      // nothing to translate.
      events: createEventsHandler(async () => (await docker(eventsArgv())).stdout),
      // The mutation family (step 9). **Local because `ctx.ask` is**, not because
      // any of them needs state across calls — see `mutation.ts` and FINDINGS F67.
      ...mutationHandlers(docker),
      // The destructive family (step 10). Ruling C's weight: the question
      // carries what it will remove, and the zero case does not ask.
      ...destructiveHandlers(docker),
      // The registry family (step 11). Local because progress needs state that
      // outlives one result — gap 1's ring a fourth time (F77, F78).
      ...progressHandlers(deps.spawner),
      // The file-transfer tail (step 12). Local because the guard that refuses
      // a tar-to-stdout is the app's — only the author knows the verb's shape.
      ...transferHandlers(docker),
    },
    /**
     * S1's whole point: the dashboard is there before you type anything (C22 I44).
     *
     * The same handler, so there is one dashboard rather than a launch copy that
     * drifts from the command's. `/dashboard` stays registered because it is how
     * the frame is re-read without restarting, and it costs one line.
     *
     * **It keeps refreshing after the first command**, which is C23 I9 and not an
     * oversight — a frozen entry keeps receiving patches, because a `--watch`
     * scrolled out of view is still running. S1's drawing said it froze; the
     * drawing was wrong about Calcium's own rules (FINDINGS F17a).
     */
    greeting: async (ctx) => {
      // **The one producer that is both.** As a local handler the dashboard's
      // answer is a `LocalDocument` and `runLocal` fills its `meta` (F13); as the
      // greeting it is appended directly, so nothing fills anything and the app
      // owns the whole of it. Wrapped here rather than widening the handler,
      // because the handler's route is the one with a framework behind it.
      //
      // **The context comes from the framework now** (C22 I53). This line used to
      // read `([], { command: "" })` — an object literal that is not a
      // `LocalContext`, has no `ask`, and compiled, which is F125's sharpest
      // instance. It stopped compiling the moment the handler named its type, with
      // no rule walking call sites: the obligation reached here through the
      // declaration.
      return {
        schema: "tui.view/1",
        command: "",
        status: "ok",
        blocks: await dashboardBlocks(ctx, deps.engine, docker),
        meta: {
          verb: null,
          adapter: "dashboard",
          exitCode: 0,
          durationMs: 0,
          truncated: false,
          argv: [],
          stderr: "",
          transport: "local",
          origin: "refresh",
        },
      } as const;
    },
    /**
     * A02 §6 hook 4 — the domain half of completion, which no app had supplied.
     *
     * `TuiConfig.completionSources` has existed since C22 and this application
     * passed none, so `/logs <Tab>` offered nothing and every candidate the demo
     * ever showed was a manifest verb. That is the F10/F64 shape — a Calcium
     * surface the reference application does not exercise — and unlike those two
     * it was closeable.
     *
     * **The runner is injected and it is `docker` rather than the shim.** These
     * are not adapted views: nothing appends `--json`, so there is nothing for
     * F1's translation to do, and asking the shim would mean `--format json`
     * arriving twice.
     */
    completionSources: dockerSources(async (args) => (await docker(args)).stdout),
  } satisfies TuiConfig;
}
