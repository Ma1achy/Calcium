// A `WorldDriver` double, and the reason it is not "the world".
//
// C08 I14 says the world backs `EmulatedTransport` only and no test path reaches
// it. C06 I17 carries the qualifier that makes that statement testable: what D43
// forbids is a test *agreeing with an animated world* — asserting on values the
// emulator invented, so that drift in the world silently becomes the expected
// result.
//
// This double invents nothing. It answers from a table the test wrote, and it
// counts calls. It cannot drift, so it cannot mask anything, and the harness
// tests need something behind §4 route 2 or route 2 is untested. The distinction
// is exactly the one `transportCases()` already draws for `createEmulatedTransport`.
//
// A real world — Prism's runs, docker's containers — lives in another repo, and
// C08 §7's **W** rows are that repo's to run.
import type { Invocation, RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { WorldDriver } from "../../src/data/fixtures/index.js";
import { result } from "./transport.js";

export type FakeWorld = WorldDriver & {
  /** Every `advance` delta, in order. Empty means the harness never called. */
  readonly deltas: readonly number[];
  readonly resets: readonly number[];
  readonly queried: readonly string[];
};

export function fakeWorld(
  answers: Readonly<Record<string, RawResult | AsyncIterable<RawPatch> | null>> = {},
): FakeWorld {
  const deltas: number[] = [];
  const resets: number[] = [];
  const queried: string[] = [];

  return {
    deltas,
    resets,
    queried,

    query(inv: Invocation): RawResult | AsyncIterable<RawPatch> | null {
      queried.push(inv.verb);
      // `undefined` and `null` both mean "cannot answer". The interface says
      // `null`; a table with no row for a verb is the same statement.
      return answers[inv.verb] ?? null;
    },

    advance(deltaMs: number): void {
      deltas.push(deltaMs);
    },

    reset(seed: number): void {
      resets.push(seed);
      deltas.length = 0;
    },
  };
}

/** A fixed envelope, so a route-2 assertion is about routing and not content. */
export function worldResult(over: Partial<RawResult> = {}): RawResult {
  return result({ stdout: { from: "world" }, stdoutRaw: '{"from":"world"}', ...over });
}

/** A hand-driven clock. `live` mode reads this and nothing else (I17). */
export function steppableClock(start = 1_000): { now: () => number; set(ms: number): void } {
  let value = start;
  return {
    now: () => value,
    set(ms: number): void {
      value = ms;
    },
  };
}
