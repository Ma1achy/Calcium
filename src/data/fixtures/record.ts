/**
 * Capture. Redaction on the way in, and provenance on everything.
 *
 * C08 §2 — see spec.
 *
 * **Recording composes over the transport rather than spawning for itself**, and
 * that is the joint the whole component rests on. `record` runs the invocation
 * through a `VerbTransport` — in practice `createSubprocessTransport` — and
 * stores the `RawResult` it returns. So the recorded shape is *by construction*
 * what the subprocess transport produces at runtime, and recording cannot drift
 * from replay: there is no second implementation of "what a run looks like" to
 * disagree with the first.
 *
 * It also means recording is testable with a fake `ProcessRunner` and no CLI on
 * the machine, which is what makes T4.6 a unit-speed test rather than a
 * conformance job that only CI can run.
 *
 * **No clock** (I4). `capturedAt` is passed in, exactly as C22 injects
 * `() => number` and C06 takes a `Clock`. A recorder that read `Date.now()`
 * would be the one module in C08 that could not be tested for what it writes.
 */

import type { Fixture, Invocation, RawPatch, RawResult, VerbTransport } from "../transport/types.js";
import { redactText } from "./redact.js";

export type RecordRequest = Readonly<{
  /** Stable across re-recordings — it is what `--diff` matches on. */
  id: string;
  verb: string;
  argv: readonly string[];
  streams?: boolean;
  timeoutMs?: number;
}>;

export type RecordOptions = Readonly<{
  transport: VerbTransport;
  /** ISO 8601. Injected — nothing in C08 reads a clock (I4). */
  capturedAt: string;
  /** The far side's version at capture. `null` when the CLI does not report one. */
  cliVersion: string | null;
  signal?: AbortSignal;
}>;

function redactResult(result: RawResult): RawResult {
  const stdoutRaw = redactText(result.stdoutRaw);

  // `stdout` is re-derived from the redacted text rather than redacted
  // separately. §2 stores the text and parses at load, so anything that made the
  // two disagree here would produce a fixture that changes shape the first time
  // it survives a round trip through disk.
  let stdout: unknown = undefined;
  if (result.parseError === null && stdoutRaw !== "") {
    try {
      stdout = JSON.parse(stdoutRaw);
    } catch {
      // Redaction cannot break JSON — it replaces substrings inside string
      // literals — so this is unreachable by design. Falling back to the
      // original parse rather than throwing keeps a recording session from dying
      // on a pattern nobody anticipated; the corpus check catches the rest.
      stdout = result.stdout;
    }
  }

  return { ...result, stdout, stdoutRaw, stderr: redactText(result.stderr) };
}

function redactPatch(patch: RawPatch): RawPatch {
  switch (patch.kind) {
    case "data":
      // A data patch's value is already parsed. Round-tripping it through the
      // text redactor keeps one implementation of the rules rather than two.
      return { kind: "data", value: JSON.parse(redactText(JSON.stringify(patch.value))) };
    case "malformed":
      return { kind: "malformed", line: redactText(patch.line) };
    case "degraded":
      return patch;
    case "end":
      return { kind: "end", result: redactResult(patch.result) };
  }
}

function invocationOf(request: RecordRequest, signal: AbortSignal): Invocation {
  return {
    verb: request.verb,
    argv: request.argv,
    streams: request.streams ?? false,
    timeoutMs: request.timeoutMs ?? 0,
    signal,
  };
}

/**
 * Run one invocation and return the fixture.
 *
 * Always `provenance: "recorded"` — this function is the only thing that
 * produces that value, which is what makes the provenance model mean something.
 * A `derived` fixture comes from a world; an `authored` one is written by hand
 * and carries the note explaining why the other two were not possible.
 */
export async function record(request: RecordRequest, opts: RecordOptions): Promise<Fixture> {
  const signal = opts.signal ?? new AbortController().signal;
  const inv = invocationOf(request, signal);

  const base = {
    id: request.id,
    verb: request.verb,
    argv: request.argv,
    provenance: "recorded",
    capturedAt: opts.capturedAt,
    cliVersion: opts.cliVersion,
  } as const;

  if (request.streams === true) {
    const patches: RawPatch[] = [];
    for await (const patch of opts.transport.stream(inv)) patches.push(redactPatch(patch));
    return { ...base, result: patches };
  }

  return { ...base, result: redactResult(await opts.transport.invoke(inv)) };
}

/** Record a set, in order. Order is preserved so a corpus file diffs cleanly. */
export async function recordAll(
  requests: readonly RecordRequest[],
  opts: RecordOptions,
): Promise<readonly Fixture[]> {
  const out: Fixture[] = [];
  // Sequential rather than concurrent, deliberately: a far side under a burst of
  // parallel invocations returns different timings and sometimes different
  // content, and a corpus recorded that way is not reproducible even against an
  // unchanged CLI.
  for (const request of requests) out.push(await record(request, opts));
  return out;
}
