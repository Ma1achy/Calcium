/**
 * The development transport: a closure stands in for the far side.
 *
 * C06 §1 — see spec. `createEmulatedTransport` takes a **handler function**, not
 * a world object, and that is the whole of the coupling: Calcium references no
 * app type, and C08's world stays entirely on the app side behind a closure
 * (commitment 15).
 *
 * The world backs `npm run dev` and nothing else (C08 I14, C06 I17). Tests may
 * construct this transport to assert interface parity (I15) — over a fixed
 * handler, never over a world — which is not the thing D43 forbids. D43 forbids
 * tests *agreeing with an animated world*: asserting on values the emulator
 * invents, so that drift in the world silently becomes the expected result.
 */

import { withJson } from "./argv.js";
import type { FixtureHandler, Invocation, RawPatch, RawResult, VerbTransport } from "./types.js";

function isPatches(value: RawResult | AsyncIterable<RawPatch>): value is AsyncIterable<RawPatch> {
  return Symbol.asyncIterator in value;
}

export function createEmulatedTransport(handler: FixtureHandler): VerbTransport {
  const argvOf = (inv: Invocation): readonly string[] => withJson(inv.argv);

  const settled = (argv: readonly string[], over: Partial<RawResult> = {}): RawResult => ({
    argv,
    exitCode: null,
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
  });

  return {
    async invoke(inv) {
      const argv = argvOf(inv);
      if (inv.signal.aborted) return settled(argv, { cancelled: true });

      // Reported as the handler produced it (I20). The handler knows the
      // invocation — C08's sets `argv` for every route it answers — and a
      // transport that overwrote it would be rewriting a result it did not
      // construct, which is the same defect the fixture transport had.
      const produced = handler(inv);
      if (!isPatches(produced)) return produced;

      // A handler that answered with patches still owes `invoke` a result, and
      // the `end` patch is where it is (I9).
      let last: RawResult | null = null;
      for await (const patch of produced) {
        if (patch.kind === "end") last = patch.result;
      }
      return last === null ? settled(argv) : last;
    },

    stream(inv) {
      async function* body(): AsyncGenerator<RawPatch> {
        const argv = argvOf(inv);
        if (inv.signal.aborted) {
          yield { kind: "end", result: settled(argv, { cancelled: true }) };
          return;
        }

        let produced: RawResult | AsyncIterable<RawPatch>;
        try {
          produced = handler(inv);
        } catch (error) {
          yield {
            kind: "end",
            result: settled(argv, {
              stderr: error instanceof Error ? error.message : String(error),
            }),
          };
          return;
        }

        if (!isPatches(produced)) {
          yield { kind: "end", result: produced };
          return;
        }

        let last: RawResult | null = null;
        for await (const patch of produced) {
          if (inv.signal.aborted) {
            yield { kind: "end", result: settled(argv, { cancelled: true }) };
            return;
          }
          if (patch.kind === "end") {
            last = patch.result;
            continue;
          }
          yield patch;
        }

        yield { kind: "end", result: last ?? settled(argv) };
      }

      return { [Symbol.asyncIterator]: (): AsyncGenerator<RawPatch> => body() };
    },
  };
}
