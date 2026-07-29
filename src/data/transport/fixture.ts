/**
 * Replay, and nothing else.
 *
 * C06 §1 — see spec. The fixture transport reads no clock, holds no world state
 * and generates nothing (I16). Replaying the same corpus twice yields deep-equal
 * results, which is the property that makes it fit to run tests against where the
 * emulator is not (A01 D43): an animated world serving tests becomes the thing
 * the tests agree with, and then drift in it silently masks a regression.
 *
 * It resolves C08 §4 route 1 only — exact `verb` + `argv` match. Routes 2 and 3,
 * the world and the generic failure, belong to the handler and therefore to the
 * emulated transport.
 *
 * **A miss throws** (T3.23). The alternative — a plausible failure — lets a test
 * assert against a fixture that is not in the corpus and pass, which is the same
 * failure D43 describes arriving through a much smaller door.
 */

import { withJson } from "./argv.js";
import type { Fixture, Invocation, RawPatch, RawResult, VerbTransport } from "./types.js";

function sameArgv(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function describe(inv: Invocation): string {
  return `${inv.verb} ${JSON.stringify(inv.argv)}`;
}

export function createFixtureTransport(corpus: readonly Fixture[]): VerbTransport {
  // Matched against the *invocation's* argv, not the spawned form: a fixture is
  // recorded from what the user ran, and a corpus whose every entry had to carry
  // `--json` would make the recordings harder to read for no gain.
  const find = (inv: Invocation): Fixture => {
    const hit = corpus.find((f) => f.verb === inv.verb && sameArgv(f.argv, inv.argv));
    if (hit === undefined) {
      throw new Error(
        `no fixture for ${describe(inv)} — the corpus has ` +
          `${String(corpus.length)} entries and none matches. A miss is not a ` +
          `plausible failure: it would let this assertion pass against a fixture ` +
          `that is not there (C06 T3.23).`,
      );
    }
    return hit;
  };

  // What *would* have been spawned, so a fixture-backed document reports the
  // same reproducible command a real one does (§3).
  const argvOf = (inv: Invocation): readonly string[] => withJson(inv.argv);

  const resultOf = (fixture: Fixture, inv: Invocation): RawResult => {
    const { result } = fixture;
    if (Array.isArray(result)) {
      const end = (result as readonly RawPatch[]).find((p) => p.kind === "end");
      if (end !== undefined && end.kind === "end") return { ...end.result, argv: argvOf(inv) };
      throw new Error(
        `fixture ${fixture.id} is a patch sequence with no \`end\`, and \`invoke\` ` +
          `has nothing to return. A streaming fixture always carries one (C06 I9).`,
      );
    }
    return { ...(result as RawResult), argv: argvOf(inv) };
  };

  return {
    // `async`, not a `Promise.resolve` over a synchronous body: `find` throws on
    // a miss, and a synchronous throw from a method typed `Promise<RawResult>`
    // reaches a caller that wrote `.catch(…)` as an uncaught exception. The
    // shared suite is what found it — the subprocess transport rejects, this one
    // threw, and I15 says a caller cannot tell them apart.
    async invoke(inv) {
      if (inv.signal.aborted) return cancelled(argvOf(inv));
      return resultOf(find(inv), inv);
    },

    stream(inv) {
      async function* body(): AsyncGenerator<RawPatch> {
        const argv = argvOf(inv);
        if (inv.signal.aborted) {
          yield { kind: "end", result: cancelled(argv) };
          return;
        }

        const fixture = find(inv);
        const { result } = fixture;

        if (!Array.isArray(result)) {
          yield { kind: "end", result: { ...(result as RawResult), argv } };
          return;
        }

        const patches = result as readonly RawPatch[];
        let last: RawResult | null = null;
        const seen: RawPatch[] = [];

        for (const patch of patches) {
          // Honouring `signal` mid-replay is what keeps T3.4 in the shared
          // suite. Without it, "cancel after forty lines retains forty" becomes
          // a subprocess-only assertion and I15 narrows to whatever fixtures
          // happen to satisfy — the silent narrowing, one case at a time.
          if (inv.signal.aborted) {
            yield {
              kind: "end",
              result: { ...partial(argv, seen), cancelled: true },
            };
            return;
          }
          if (patch.kind === "end") {
            last = { ...patch.result, argv };
            continue;
          }
          seen.push(patch);
          yield patch;
        }

        yield { kind: "end", result: last ?? partial(argv, seen) };
      }

      return { [Symbol.asyncIterator]: (): AsyncGenerator<RawPatch> => body() };
    },
  };
}

/** Retained output, not discarded, on every abnormal end (I7). */
function partial(argv: readonly string[], seen: readonly RawPatch[]): RawResult {
  const stdoutRaw = seen
    .map((p) => (p.kind === "data" ? JSON.stringify(p.value) : p.kind === "malformed" ? p.line : ""))
    .filter((s) => s !== "")
    .join("\n");
  return {
    argv,
    exitCode: null,
    signal: null,
    stdout: undefined,
    stdoutRaw,
    stderr: "",
    durationMs: 0,
    parseError: null,
    cancelled: false,
    timedOut: false,
  };
}

function cancelled(argv: readonly string[]): RawResult {
  return { ...partial(argv, []), cancelled: true };
}
