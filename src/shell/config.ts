/**
 * C22 step 1 — validation and every default.
 *
 * **This is the whole of `createTui`** (I7a). Validation needs nothing
 * constructed and a bad config should fail at the call site rather than on
 * `start()`, so it is eager; steps 2 to 11 are not, because step 3 may read a
 * manifest from a path and a constructor cannot await.
 *
 * Four required fields and no fifth (I17). The count is R01 §1's ergonomic
 * claim — a working TUI built from the README without asking a question — so a
 * new required field is a spec change rather than a convenience, and this file
 * is where that would have to be argued.
 */

import { createFallbackAdapter } from "../data/adapters/index.js";
import { slashPolicy } from "../interaction/parser/index.js";
import { createExecutionPipeline } from "./execution.js";
import { makeDefaultChrome } from "./chrome.js";
import { ConfigError, type FileSystem, type TuiConfig } from "./types.js";

/**
 * Below this the layout engine cannot produce a sane answer, so the size gate
 * defers and the fallback draws (§4, I8, I9).
 *
 * **C22's number, not C02's.** C02 §8 assigns it to L4 explicitly: a minimum
 * size is an app policy, not a terminal capability.
 */
export const MIN_COLUMNS = 60;
export const MIN_ROWS = 16;

/** §6 — C22 owns the frame, so C22 passes the gutter; C17 must not assume one. */
export const PROMPT = "❯ ";
export const PROMPT_GUTTER = Object.freeze({ first: 2, cont: 2 });

/** C13 §5a — a number rather than "all"; doubling memory is how a debug mode
 * becomes one nobody turns on. */
export const DEFAULT_RETAIN_PAYLOADS = 50;

export const DEFAULT_STATE_DIR = "~/.prism";

const REQUIRED = ["name", "binary", "manifest", "theme"] as const;

/**
 * Every field, defaulted — the shape the rest of the graph is built from.
 *
 * Resolution happens once, here, rather than at each use site: a `??` at the
 * point of use is a second place the default lives, and the two disagree the
 * first time one of them is changed.
 */
export type ResolvedConfig = ReturnType<typeof resolveConfig>;

/**
 * **Every ambient value arrives as an argument**, never as a `??` default here,
 * and that is A03 SS1 shaping the code rather than merely checking it: the
 * scan's allow-list is the single file `src/shell/session.ts`, so `Date.now`
 * may be named there and nowhere else in `src/`. `process.cwd()` and the real
 * `node:fs` follow it for consistency rather than for a scan — the value of
 * "one place performs the ambient reads" is that there is one place to look.
 *
 * Widening the allow-list to two files would have been the smaller diff and the
 * worse one: the point is that the list has one entry, and the second is always
 * easier to argue for than the first.
 */
export function validateConfig(config: TuiConfig): void {
  // `in` rather than a truthiness check: `name: ""` is a supplied field and a
  // bad value, and reporting it as missing sends the reader to the wrong line.
  for (const field of REQUIRED) {
    if (config[field] === undefined || config[field] === null) throw new ConfigError(field);
  }
}

export type Ambient = Readonly<{
  /** `Date.now`, from the one file SS1 allows to name it. */
  clock: () => number;
  /** `process.cwd()`, for the same reason: one file performs the read. */
  cwd: string;
  /** The real filesystem — `node:fs` at the boundary, which is C22 (A04 §2). */
  fs: FileSystem;
  /**
   * `setTimeout`, for the same reason the other three are here.
   *
   * Two consumers and they had a copy each: §7's identity loop inlined one, and
   * C06's `Clock` needs one for the subprocess transport's timeouts. The second
   * is what surfaced it — nothing had ever built the default transport, because
   * nothing consumed it until C23.
   */
  schedule: (fn: () => void, ms: number) => Disposable;
  /** `process.platform`, for the default opener's command. One place reads it. */
  platform: NodeJS.Platform;
}>;

export function resolveConfig(config: TuiConfig, ambient: Ambient) {
  validateConfig(config);

  const retain = config.debug?.retainPayloads;

  return Object.freeze({
    name: config.name,
    binary: config.binary,
    manifest: config.manifest,
    theme: config.theme,

    adapters: config.adapters ?? {},
    // I3a — registered at step 10 before `seal()`. Defaulted like every other
    // optional field, so an app with no local verbs supplies nothing.
    localHandlers: config.localHandlers ?? {},
    fallbackAdapter: createFallbackAdapter(),
    commandPolicy: config.commandPolicy ?? slashPolicy,
    completionSources: config.completionSources ?? [],
    chrome: config.chrome ?? makeDefaultChrome(config.name, config.binary),
    blocks: config.blocks ?? [],
    transport: config.transport,

    // Absent, nothing is retained. Present without a count, 50 (§2).
    retainPayloads: config.debug === undefined ? 0 : (retain ?? DEFAULT_RETAIN_PAYLOADS),

    env: config.env ?? {},
    cwd: config.cwd ?? ambient.cwd,
    clock: config.clock ?? ambient.clock,
    schedule: ambient.schedule,
    platform: ambient.platform,
    fs: config.fs ?? ambient.fs,
    stateDir: config.stateDir ?? DEFAULT_STATE_DIR,
    openUrl: config.openUrl,
    stdout: config.stdout ?? process.stdout,
    stdin: config.stdin ?? process.stdin,

    cluster: config.cluster ?? "",
    version: config.version ?? "",

    // **Defaulted, and it was not.** `pipeline: config.pipeline` passed through
    // undefined, so `constructGraph` returned `pipeline: null` and `submit`
    // became a no-op: a production `createTui` built a shell that could not
    // execute anything. The injected factory is C22's test seam (I17's
    // `config.pipeline`), and a test seam with no default is not a seam — it is
    // a missing wire that only the tests were holding together.
    pipeline: config.pipeline ?? createExecutionPipeline,
    // The default is a *fetcher*, not an absent loop: the cadence, the health
    // transitions and the commit all still run, and an app that supplies one
    // changes where the fact comes from and nothing else (C22 I43).
    identity: config.identity ?? ((): Promise<null> => Promise.resolve(null)),
    // **No default, and that is the difference from `identity` above.** An
    // absent identity fetcher has a working answer — nobody is logged in — and
    // an absent greeting has none: a stub returning an empty document would
    // append an empty entry at every launch. `undefined` means step 7 fires
    // nothing (I44), which is what a session without a welcome should do.
    ...(config.greeting === undefined ? {} : { greeting: config.greeting }),
  });
}
