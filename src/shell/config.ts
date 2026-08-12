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
import type { TerminalCapabilities } from "../terminal/capabilities.js";

/**
 * Below this the layout engine cannot produce a sane answer, so the size gate
 * defers and the fallback draws (§4, I8, I9).
 *
 * **C22's number, not C02's.** C02 §8 assigns it to L4 explicitly: a minimum
 * size is an app policy, not a terminal capability.
 */
export const MIN_COLUMNS = 60;
export const MIN_ROWS = 16;

/**
 * §6 — C22 owns the frame, so C22 passes the gutter; C17 must not assume one.
 *
 * **A pair, and both forms are `PROMPT_GUTTER.first` cells** (C22 I52, C09 I22).
 * `commandRows` draws the prompt and `construct.ts` calls the same function for
 * `chromeRows`, so a form of unequal width would leave the measurer and the
 * composer describing the same row differently — C09 I1's divergence on the one
 * row the reader types into. `promptFor` is the only reader; nothing resolves it
 * at module scope, which would read a capability before C02 has detected one.
 */
const PROMPT_FORMS: readonly [unicode: string, ascii: string] = Object.freeze(["❯ ", "> "]);

export function promptFor(caps: Pick<TerminalCapabilities, "unicode">): string {
  return caps.unicode === "ascii" ? PROMPT_FORMS[1] : PROMPT_FORMS[0];
}

/** The pair itself, for the row asserting both forms are the gutter's width. */
export const PROMPT_SUBSTITUTION: readonly [string, string] = PROMPT_FORMS;
export const PROMPT_GUTTER = Object.freeze({ first: 2, cont: 2 });

/** C13 §5a — a number rather than "all"; doubling memory is how a debug mode
 * becomes one nobody turns on. */
export const DEFAULT_RETAIN_PAYLOADS = 50;

/**
 * C22 §3 — **the framework's own name, never a consumer's**.
 *
 * It was `~/.prism`, named for one app, in a framework that claims to serve
 * others: every consumer that said nothing wrote its history and its theme
 * preference into `prism-tui`'s directory, and two apps shared one file. C22
 * §141 already refuses `PRISM_TUI_STATE_DIR` inside `src/` for exactly that
 * reason — the argument was written down, applied to the environment variable,
 * and not applied to the constant three files away.
 *
 * **The default is what an app gets when it says nothing**, which is precisely
 * when it must not name somebody else.
 *
 * **Relative, and the tilde it used to carry was never expanded.** `fs.mkdir` has
 * no shell in it, so `~/.prism` created a directory *literally named* `~` in the
 * launch directory — measured, with real history files in it. The path was
 * already relative and the tilde was decoration; dropping it makes the behaviour
 * and the documentation one statement rather than adding expansion machinery to
 * reach a home directory nothing had ever written to.
 *
 * So state belongs to the directory the shell was opened in, which is also what
 * makes C22 §3's injection argument structural: standalone development cannot
 * append to a developer's real history, because there is no single one.
 */
export const DEFAULT_STATE_DIR = ".calcium";

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
    // **Undefined, not `{}`** (C22 I49). C02 distinguishes an absent overrides
    // argument from an empty one only in that the empty one iterates no fields,
    // so the two behave alike — but defaulting here would put a producer in
    // front of C02's own `overrides !== undefined` guard and make the parameter
    // look supplied on every construction. Passing what the app passed keeps
    // "the app said nothing" expressible, which is the state that was
    // indistinguishable from "nothing can say anything" for two whole steps.
    capabilities: config.capabilities,
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
