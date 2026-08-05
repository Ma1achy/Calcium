/**
 * The resolver: fixture, then world, then a plausible failure.
 *
 * C08 §4, §1a — see spec. This is the half `createEmulatedTransport` calls
 * through (C06 §1), and the whole coupling between Calcium and an app's world
 * is the `WorldDriver` interface it takes.
 *
 * **Route 3 returns a failure where the fixture transport throws, and the
 * asymmetry is deliberate.** `createFixtureTransport` serves tests, where a miss
 * that degraded into a plausible failure would let an assertion pass against a
 * fixture that is not in the corpus (C06 T3.23). This serves a demo, where a
 * verb nobody recorded should degrade rather than break mid-presentation (I7).
 * Same event, opposite correct answers, because the consequences are opposite.
 */

import { withJson } from "../transport/argv.js";
import type {
  Clock,
  FixtureHandler,
  Fixture,
  Invocation,
  RawPatch,
  RawResult,
} from "../transport/types.js";
import type { Manifest } from "../manifest/types.js";
import type { WorldDriver } from "./world.js";

export type HandlerMode = "frozen" | "stepped" | "live";

/** The B6 endpoint's verb (A01 B6). */
export const MANIFEST_VERB = "__manifest__";

export type FixtureHandlerOptions = Readonly<{
  fixtures: readonly Fixture[];
  world?: WorldDriver;
  /** `frozen` by default (I6). A caller that wants motion asks for it. */
  mode?: HandlerMode;
  /** Required iff `mode === "live"` (I4). */
  clock?: Clock["now"];
  /** Answers the B6 endpoint (I11). */
  manifest: Manifest;
}>;

export type EmulatedHandler = FixtureHandler & {
  /**
   * Advance the world. Rejected in `frozen`; the only motion in `stepped`; in
   * `live` the clock drives it and an explicit call is refused, because two
   * sources of elapsed time is the state-with-two-owners failure applied to a
   * clock.
   */
  advance(deltaMs: number): void;
};

function sameArgv(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function settled(argv: readonly string[], over: Partial<RawResult> = {}): RawResult {
  return {
    argv,
    exitCode: 0,
    signal: null,
    stdout: undefined,
    stdoutRaw: "",
    stderr: "",
    durationMs: 0,
    parseError: null,
    cancelled: false,
    timedOut: false,
    // A replay never crosses a buffer bound: nothing was spawned. Stated rather
    // than defaulted, because the parity suite compares the complete result and
    // an absent field reads identically to a false one at a call site.
    overflowed: false,
    ...over,
  };
}

/**
 * Route 3. A refusal shaped like the far side's, not like an exception.
 *
 * `ErrorLike` with a `message` is B5's floor, exit code 1 is B4's "operation
 * failed" — so this degrades through C07's normal failure path and renders as a
 * notice rather than as a crash. A demo that hits an unfixtured verb shows
 * something honest and keeps going.
 */
function unfixtured(verb: string, argv: readonly string[]): RawResult {
  const body = JSON.stringify({
    error: {
      message: `no fixture for \`${verb}\``,
      code: "NO_FIXTURE",
      remediation: `record one: \`record --against <cli> --verb=${verb}\``,
    },
  });
  return settled(argv, { exitCode: 1, stdout: JSON.parse(body), stdoutRaw: body });
}

export function createFixtureHandler(opts: FixtureHandlerOptions): EmulatedHandler {
  const mode: HandlerMode = opts.mode ?? "frozen";

  if (mode === "live" && opts.clock === undefined) {
    throw new Error(
      `mode "live" requires a clock. Nothing in C08 reads ambient time (I4), ` +
        `and a live world with no injected clock has nothing to advance by.`,
    );
  }
  if (mode !== "live" && opts.clock !== undefined) {
    // Refused rather than ignored. A clock passed to a frozen handler means the
    // caller believes it will be used, and silently discarding it produces a
    // demo that does not move for reasons nothing reports.
    throw new Error(
      `mode "${mode}" takes no clock — only "live" has elapsed time to read (I18).`,
    );
  }

  const { world, manifest, fixtures } = opts;
  const clock = opts.clock;

  // `live` reads the clock per query and advances by the delta since the last
  // one. **Pull, never push** (I18). A timer would advance the world without
  // anyone asking, so two runs of the same sequence with different real elapsed
  // time produce different worlds — reading here makes the world a pure function
  // of (seed, elapsed), and elapsed is what `frozen` and `stepped` control.
  let lastTick: number | null = null;

  const pump = (): void => {
    if (clock === undefined || world === undefined) return;
    const now = clock();
    if (lastTick === null) {
      lastTick = now;
      return;
    }
    const delta = now - lastTick;
    lastTick = now;
    // A clock that went backwards — a system time adjustment under a long demo.
    // Ignored rather than passed on: `advance` refuses negatives (T3.3), and the
    // right response to a clock that jumped is to carry on from where it landed.
    if (delta > 0) world.advance(delta);
  };

  const manifestResult = (argv: readonly string[]): RawResult => {
    const body = JSON.stringify(manifest);
    return settled(argv, { stdout: JSON.parse(body), stdoutRaw: body });
  };

  const findFixture = (inv: Invocation): Fixture | undefined =>
    fixtures.find((f) => f.verb === inv.verb && sameArgv(f.argv, inv.argv));

  // Verbatim, exactly as `createFixtureTransport` replays (C06 I20). Route 1 is
  // the same operation reached through a different door, and a handler that
  // rewrote what the transport does not would make a fixture answer differently
  // depending on which one asked.
  const replay = (fixture: Fixture): RawResult | AsyncIterable<RawPatch> => {
    const { result } = fixture;
    if (!Array.isArray(result)) return result as RawResult;

    const patches = result as readonly RawPatch[];
    return {
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<RawPatch> {
        for (const patch of patches) yield patch;
      },
    };
  };

  const handler: FixtureHandler = (inv) => {
    const argv = withJson(inv.argv);

    // Before the routes, not inside them: B6 is a property of any far side, and
    // a fixture-backed session satisfies it like any other (I11). Answering it
    // from route 1 would mean every app had to record its own manifest endpoint.
    if (inv.verb === MANIFEST_VERB) return manifestResult(argv);

    pump();

    // 1 — an exact fixture matches verb + argv.
    const fixture = findFixture(inv);
    if (fixture !== undefined) return replay(fixture);

    // 2 — the world can answer. `null` is "cannot", not "nothing".
    const answered = world?.query(inv) ?? null;
    if (answered !== null) {
      return Symbol.asyncIterator in answered ? answered : { ...answered, argv };
    }

    // 3 — a plausible failure. Every query returns something (I7).
    return unfixtured(inv.verb, argv);
  };

  return Object.assign(handler, {
    advance(deltaMs: number): void {
      if (deltaMs < 0) {
        throw new Error(
          `advance(${String(deltaMs)}) — time does not run backwards here. ` +
            `A negative delta is rejected rather than silently reversed (T3.3).`,
        );
      }
      if (mode === "frozen") {
        throw new Error(
          `advance() in "frozen" mode. Frozen is the default (I6) precisely so ` +
            `that motion is asked for; construct with mode "stepped" or "live".`,
        );
      }
      if (mode === "live") {
        throw new Error(
          `advance() in "live" mode — the injected clock is what drives it, and ` +
            `by nothing else (I18). Two sources of elapsed time is one piece of ` +
            `state with two owners.`,
        );
      }
      // Delta 0 never reaches the driver: it cannot change anything, and a
      // driver counting calls would see motion where there was none (T3.1).
      if (deltaMs > 0) world?.advance(deltaMs);
    },
  });
}
