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
import { DEFAULT_MAX_BLOCK_ROWS } from "../presentation/blocks/index.js";
import { slashPolicy } from "../interaction/parser/index.js";
import { createExecutionPipeline } from "./execution.js";
import { makeDefaultChrome } from "./chrome.js";
import { createRecording, recordStdin } from "./profiling/record.js";
import { DEFAULT_TIER } from "./profiling/recorder.js";
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
 * §6, §6l — the chrome's rows. The header is one row, a constant: A02 §6 adds
 * a hook when something needs it and nothing does. **Two rules bound the
 * prompt** (I81), one above and one below, at every size the gate accepts —
 * they are geometry, not configuration (§6l.4 F). The footer is as tall as
 * its blocks (I82); `DEFAULT_FOOTER_ROWS` is the one-row guess the first frame
 * opens with before any `ChromeFn` has run (§6l.2 row 8), and the default
 * footer is one `pills` row, so the guess is right for the default session.
 *
 * **They live here rather than in `frame.ts`** because the maximum below is
 * derived from the size gate, and `frame.ts` already imports this file — the
 * other direction is a cycle inside L4 (MG22).
 */
export const HEADER_ROWS = 1;
/**
 * The rule under the header (I87, §6l.7). Its own constant rather than a third
 * counted into `RULE_ROWS`: `promptTop` halves that figure to find the prompt's
 * first row, and a count that means "the prompt's pair" in one place and "every
 * rule" in another is one a reader has to divide.
 */
export const HEADER_RULE_ROWS = 1;
export const RULE_ROWS = 2;
export const DEFAULT_FOOTER_ROWS = 1;

/**
 * **Derived, not chosen** (I80, §6l.2 row 7). The tallest footer that leaves one
 * region row at the size gate with the prompt at its cap: at `MIN_ROWS` the
 * prompt may take `⌊MIN_ROWS / 2⌋` rows (S01 §3), the header takes one and its
 * rule one more (I87), the prompt's two rules take two, and the region must keep
 * one. Three today, and it moves when
 * `MIN_ROWS` moves — a hand-written `3` would still read as correct the day the
 * gate changed and the region went to zero at a size the gate accepted.
 */
export const MAX_FOOTER_ROWS =
  MIN_ROWS - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - Math.floor(MIN_ROWS / 2) - 1;

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
  // C14 I24, T2.14 — refused at the call site, before anything is built. A cap
  // of `0` marks every block and a fraction puts the marker at a row nothing
  // measured; the registry refuses the same values, and this names the field.
  const cap = config.maxBlockRows;
  if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) {
    throw new ConfigError("maxBlockRows", `must be a positive integer, got ${String(cap)}`);
  }
  // C01 I21 — a boolean or absent; a truthy string here would turn 1003 on for
  // an app that wrote `hover: "false"`, which is the wrong direction to fail in.
  if (config.hover !== undefined && typeof config.hover !== "boolean") {
    throw new ConfigError("hover", `must be a boolean, got ${String(config.hover)}`);
  }
  // C22 I94 — **the same path, not both fields.** The rule was written as *set
  // together*, and building the apparatus falsified it: a replay is compared to
  // its recording by **recording the replay**, because the two byte streams
  // have to be captured by the same code at the same point or the comparison is
  // between different populations. Replaying A while recording B is the normal
  // case. One path for both is the incoherent one, and it is the only one the
  // original argument was ever about (F910).
  //
  // **The message names both fields**, because a refusal naming one reads as
  // that field being invalid and neither is.
  const profile = config.profile;
  if (profile?.record !== undefined && profile.record === profile.replay) {
    throw new ConfigError(
      "profile.record",
      "and `profile.replay` name the same path — a session cannot be driven by a recording it " +
        "is overwriting. Record to a different path (C28 I46, C22 I94)",
    );
  }
}

export type Ambient = Readonly<{
  /** `Date.now`, from the one file SS1 allows to name it. */
  clock: () => number;
  /**
   * A monotonic, sub-millisecond clock — `performance.now`, from the same file.
   *
   * **A second clock rather than a widening of the first** (C22 §2c). `clock`
   * is wall-clock, is drawn as a time of day by the default chrome, and has
   * millisecond resolution: it cannot measure a 0.3 ms paint. Read only when a
   * profiler exists, which at tier `off` is never (C22 I92).
   */
  elapsed: () => number;
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

/**
 * The recording's sink — **buffered until the directory exists, then synchronous**
 * (C28 I46).
 *
 * `FileSystem.appendFileSync` does not create directories, and `stateDir` is
 * **It appends and does not truncate**, because `FileSystem` has no synchronous
 * write and widening a published interface for this would touch seven
 * implementations. A rerun into the same path therefore concatenates, which
 * `parseRecording` refuses by name rather than silently merging two sessions.
 *
 * created during startup (C22 I67) while the `regime` line is written at
 * construction. So a failed append keeps its line and the next one retries;
 * the window in which anything can be lost is startup, before the lifecycle is
 * acquired and therefore before any input, resize, patch or frame exists. Once
 * the first append lands, every line after it is on disk when it returns —
 * which is what makes a truncated recording detectable rather than merely
 * short (I15).
 */
function recordingSink(fs: FileSystem, path: string): (line: string) => void {
  let pending = "";
  return (line) => {
    pending += line;
    try {
      fs.appendFileSync(path, pending);
      pending = "";
    } catch {
      // Kept, and retried on the next line. Not reported: a recording is a
      // profiling artefact, and failing a session because one could not be
      // written is the instrument breaking its subject.
    }
  };
}

export function resolveConfig(config: TuiConfig, ambient: Ambient) {
  validateConfig(config);

  const retain = config.debug?.retainPayloads;

  const io = {
    stdout: config.stdout ?? process.stdout,
    stdin: config.stdin ?? process.stdin,
  };
  // **Construction-time facts only** (C28 I47): the capabilities are a verdict
  // a session computes from this environment and the replies it reads back, and
  // recording the verdict takes C02 out of the gate.
  const recordPath = config.profile?.record;
  const recording =
    recordPath === undefined ? null : createRecording(recordingSink(config.fs ?? ambient.fs, recordPath));
  if (recording !== null) {
    // **`process.on("exit")`, because a signal exit does not pass through
    // `stop()`.** C01's `signalExit` releases the terminal and calls
    // `process.exit` directly (`lifecycle.ts`), so `Session.#runStop` — where
    // `recording.end()` lives — never runs, and the clock reads still in the
    // batch are lost with it. Measured: a session ended with SIGTERM wrote no
    // `end` line, its recording parsed as truncated, and the replay's clock ran
    // out five frames in (F912).
    //
    // `exit` listeners run synchronously and the sink appends synchronously, so
    // this is the one hook that reaches every way out — signal, fault and clean
    // stop alike. `end()` is idempotent, so the ordinary path still ends where
    // it always did. The listener exists only when a recording does.
    process.on("exit", () => void recording.end());
    recording.regime({
      node: process.version,
      // **No size here** — C01 owns the terminal's dimensions and hands them
      // down (SS42), so the initial one arrives as the first `resize` event
      // from `lifecycle.onResize`, wired in the root. Reading `stdout.columns`
      // here would record a width before the session had adopted one.
      tier: config.profile?.tier ?? DEFAULT_TIER,
      name: config.name,
      binary: config.binary,
      // **Only the defined entries.** `ProcessEnv` admits `undefined` and JSON
      // drops those keys anyway, so filtering here is what makes the recording
      // and the type say the same thing.
      env: Object.fromEntries(
        Object.entries(config.env ?? {}).filter((e): e is [string, string] => e[1] !== undefined),
      ),
    });
  }

  // The one `elapsed` the session has, held before the tap so the two members
  // below are the same clock with and without a recording.
  const rawElapsed = config.elapsed ?? ambient.elapsed;

  return Object.freeze({
    name: config.name,
    binary: config.binary,
    manifest: config.manifest,
    theme: config.theme,

    // **Undefined rather than a default object** (C22 I63). An app that declares
    // no cursor styles must leave the terminal's own alone, and an empty record
    // resolving through a fallback of `null` says the same thing — but a default
    // here would be a second place the answer lives, which §2's own argument
    // against a `??` at the use site forbids.
    cursor: config.cursor,
    adapters: config.adapters ?? {},
    // I3a — registered at step 10 before `seal()`. Defaulted like every other
    // optional field, so an app with no local verbs supplies nothing.
    localHandlers: config.localHandlers ?? {},
    fallbackAdapter: createFallbackAdapter(),
    commandPolicy: config.commandPolicy ?? slashPolicy,
    completionSources: config.completionSources ?? [],
    // §6l — the chrome is two functions and nothing else: the footer's height
    // is what its blocks measure (I82), so there is no budget to resolve here.
    chrome: config.chrome ?? makeDefaultChrome(config.name, config.binary),
    blocks: config.blocks ?? [],
    // C14 I24 — the registry's default, resolved here so there is one place
    // the value lives and one constant it is read from (C09 §2b).
    maxBlockRows: config.maxBlockRows ?? DEFAULT_MAX_BLOCK_ROWS,
    transport: config.transport,

    // Absent, nothing is retained. Present without a count, 50 (§2).
    retainPayloads: config.debug === undefined ? 0 : (retain ?? DEFAULT_RETAIN_PAYLOADS),
    // C28, unresolved on purpose: every member has a default and the recorder
    // is where they are applied, so the root does not hold a second copy —
    // the two places the root needs the tier before a recorder exists (the
    // regime line above, the gate in `session.ts`) read the recorder's
    // `DEFAULT_TIER` rather than restating it (F967).
    profile: config.profile,
    // C28 I14, F908 — **wrapped, so read `n` can return what read `n` returned.**
    // The tidier-looking alternative is to pin a replayed clock to the event
    // stream; it flattens every duration to zero, and C24 I32 put a duration in
    // the default footer, so it diverges on every frame of every recording
    // taken from a live session.
    elapsed: recording === null ? rawElapsed : recording.mono(rawElapsed),
    // C28 I53, F971 — **the same function, before the tap, for the sampler's
    // stamp.** A periodic reader on the positional channel is unreplayable: its
    // tick lands between two of the session's reads at a position the replay
    // cannot reproduce, so the sampler stamps from the clock the recording never
    // sees. Threaded rather than read anew, which is what keeps SS1's allow-list
    // at one file.
    sampleClock: rawElapsed,

    env: config.env ?? {},
    // **Undefined, not `{}`** (C22 I49). C02 distinguishes an absent overrides
    // argument from an empty one only in that the empty one iterates no fields,
    // so the two behave alike — but defaulting here would put a producer in
    // front of C02's own `overrides !== undefined` guard and make the parameter
    // look supplied on every construction. Passing what the app passed keeps
    // "the app said nothing" expressible, which is the state that was
    // indistinguishable from "nothing can say anything" for two whole steps.
    capabilities: config.capabilities,
    // C01 I21 — off unless asked for; resolved here so C22 hands C01 a boolean
    // and the default lives with the other defaults.
    hover: config.hover ?? false,
    cwd: config.cwd ?? ambient.cwd,
    clock: ((c) => (recording === null ? c : recording.wall(c)))(config.clock ?? ambient.clock),
    schedule: ambient.schedule,
    platform: ambient.platform,
    fs: config.fs ?? ambient.fs,
    stateDir: config.stateDir ?? DEFAULT_STATE_DIR,
    ...(config.persist === undefined ? {} : { persist: config.persist }),
    openUrl: config.openUrl,
    // C28 I46 — the input tap, applied at the one place that resolves the
    // streams and the clocks. **Nothing below this line knows a recording
    // exists**: each tap is a decorator over the value that was going to be
    // handed down anyway, which is what keeps the shell free of a
    // recorder-shaped seam.
    //
    // **`stdout` is not tapped here, and that is F909.** C01 captures
    // `stdout.write` at construction and then replaces it with one that routes
    // to `debug` (I9); a tap on this stream is therefore *inside* that
    // redirect, so `writer.write` reaches the tap, the tap calls
    // `stdout.write`, and by then `stdout.write` is the debug sink. The session
    // drew nothing at all, silently. The frame tap is on `lifecycle.writer` in
    // `construct.ts`, which is the handle C01 says is the renderer's — the same
    // structural argument SS42 makes about the size.
    stdout: io.stdout,
    stdin: recording === null ? io.stdin : recordStdin(io.stdin, recording),
    /** The recording itself, for the taps `construct.ts` applies (I46). */
    recording,
    // C22 I91 — carried, never inspected: the root's whole job for it.
    ...(config.pty === undefined ? {} : { pty: config.pty }),

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
