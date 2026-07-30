/**
 * The persisted format. Versioned, because it outlives the code that wrote it.
 *
 * C08 §2, I17 — see spec. The `Fixture` **type** is C06's (A02 §1); the corpus
 * **file** is this module's, and the two are not the same shape.
 *
 * Three decisions the file makes that the type does not:
 *
 *   - **`stdoutRaw` is stored; `stdout` is derived at load.** `RawResult` carries
 *     the parsed value and the string it was parsed from. Persisting both would
 *     duplicate the payload and let the two disagree — and the string is what
 *     was recorded, so the string is what is stored. This is also what keeps I2's
 *     byte-for-byte literally true rather than approximately.
 *
 *   - **`schema` is required and unrecognised values fail the load.** The corpus
 *     is the only persisted artefact besides history. It outlives its writer, and
 *     the bullet above is already a format decision taken before a single corpus
 *     exists. Unversioned, an old corpus misparses into a plausible-looking wrong
 *     shape and the failure surfaces somewhere else entirely; versioned, it fails
 *     at the door and says what it needed.
 *
 *   - **Scenario is a directory, not a field.** `createFixtureTransport` takes a
 *     flat `readonly Fixture[]`; a scenario field would be one the structural
 *     consumer must ignore, which is what A02 §1 forbids. The selection happens
 *     at load.
 */

import type { Fixture, RawPatch, RawResult } from "../transport/types.js";

export const CORPUS_SCHEMA = "tui.fixtures/1";

/**
 * A stored result: `RawResult` minus the field derived from its neighbour.
 *
 * `argv` stays, and it is load-bearing rather than convenient: it is what was
 * actually spawned, replay reports it verbatim (C06 I20), and it is the only
 * record of which binary the corpus came from. A corpus recorded against
 * `docker` says so even in an app that now spawns `podman`, which is how a stale
 * corpus announces itself.
 */
export type StoredResult = Omit<RawResult, "stdout">;

export type StoredFixture = Readonly<{
  id: string;
  verb: string;
  argv: readonly string[];
  provenance: Fixture["provenance"];
  capturedAt: string | null;
  cliVersion: string | null;
  note?: string;
  result: StoredResult | readonly StoredPatch[];
}>;

export type StoredPatch =
  | Readonly<{ kind: "data"; value: unknown }>
  | Readonly<{ kind: "malformed"; line: string }>
  | Readonly<{ kind: "degraded"; reason: string }>
  | Readonly<{ kind: "end"; result: StoredResult }>;

export type CorpusFile = Readonly<{
  schema: string;
  fixtures: readonly StoredFixture[];
}>;

/**
 * Parse, without normalising.
 *
 * `parseError` is honoured rather than recomputed: a recording of a far side
 * that emitted invalid JSON must replay as a *parse failure*, and re-parsing
 * optimistically at load would quietly turn one of the most important fixtures
 * in any corpus — the malformed one — into a well-formed document.
 */
/**
 * The value a field takes when a corpus written before it existed does not carry
 * it. **Written down rather than inherited from `undefined`.**
 *
 * `overflowed` is the first additive field since the format was fixed, and it
 * needs no schema bump: `tui.fixtures/1` refuses shapes that would *misparse*,
 * and a boolean that was absent because nothing could set it reads as `false`
 * correctly. What it must not do is arrive as `undefined` against a `boolean` —
 * which is what a bare spread gives, and which reads identically to `false` at
 * every call site and differently in the parity comparison.
 *
 * A field whose absence would mean something other than its default is a
 * different case and does need the bump.
 */
const ABSENT_FIELD_DEFAULTS = Object.freeze({ overflowed: false });

function hydrateResult(stored: StoredResult): RawResult {
  if (stored.parseError !== null) {
    return { ...ABSENT_FIELD_DEFAULTS, ...stored, stdout: undefined };
  }

  try {
    return {
      ...ABSENT_FIELD_DEFAULTS,
      ...stored,
      stdout: stored.stdoutRaw === "" ? undefined : JSON.parse(stored.stdoutRaw),
    };
  } catch (error) {
    // A stored `parseError: null` alongside unparseable bytes is a corrupt
    // corpus, not a recording of a broken far side. Say which.
    throw new CorpusError(
      `stored result claims it parsed, and its stdoutRaw does not: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function hydratePatch(stored: StoredPatch): RawPatch {
  return stored.kind === "end" ? { kind: "end", result: hydrateResult(stored.result) } : stored;
}

function dehydrateResult(result: RawResult): StoredResult {
  const { stdout: _stdout, ...rest } = result;
  return rest;
}

function dehydratePatch(patch: RawPatch): StoredPatch {
  return patch.kind === "end" ? { kind: "end", result: dehydrateResult(patch.result) } : patch;
}

export class CorpusError extends Error {
  override readonly name = "CorpusError";
}

/**
 * Text → fixtures.
 *
 * Every failure names the file's own version and the one this build understands,
 * because "unsupported schema" without both numbers sends the reader to the
 * source to find out what it wanted.
 */
export function parseCorpus(text: string, source = "corpus"): readonly Fixture[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new CorpusError(
      `${source} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CorpusError(`${source} is not a corpus object`);
  }

  const file = raw as Partial<CorpusFile>;

  if (typeof file.schema !== "string") {
    throw new CorpusError(
      `${source} declares no schema. A corpus outlives the code that wrote it, ` +
        `so its version is not optional — expected "${CORPUS_SCHEMA}" (C08 I17)`,
    );
  }
  if (file.schema !== CORPUS_SCHEMA) {
    throw new CorpusError(
      `${source} declares schema "${file.schema}"; this build reads ` +
        `"${CORPUS_SCHEMA}". Re-record it rather than editing the version — the ` +
        `field exists so an old corpus fails here instead of misparsing into a ` +
        `plausible wrong shape (C08 I17)`,
    );
  }
  if (!Array.isArray(file.fixtures)) {
    throw new CorpusError(`${source} has no fixtures array`);
  }

  return file.fixtures.map((stored) => hydrate(stored, source));
}

function hydrate(stored: StoredFixture, source: string): Fixture {
  if (typeof stored.id !== "string" || typeof stored.verb !== "string") {
    throw new CorpusError(`${source} holds a fixture with no id or verb`);
  }
  return {
    id: stored.id,
    verb: stored.verb,
    argv: stored.argv,
    provenance: stored.provenance,
    capturedAt: stored.capturedAt,
    cliVersion: stored.cliVersion,
    ...(stored.note === undefined ? {} : { note: stored.note }),
    result: Array.isArray(stored.result)
      ? stored.result.map(hydratePatch)
      : hydrateResult(stored.result as StoredResult),
  };
}

/**
 * Fixtures → text, two-space indented and newline-terminated.
 *
 * Formatted for review rather than for size. A corpus is a file people read in a
 * diff when `--diff` names it, and a single-line JSON blob is one nobody reads.
 */
export function serialiseCorpus(fixtures: readonly Fixture[]): string {
  const file: CorpusFile = {
    schema: CORPUS_SCHEMA,
    fixtures: fixtures.map(
      (f): StoredFixture => ({
        id: f.id,
        verb: f.verb,
        argv: f.argv,
        provenance: f.provenance,
        capturedAt: f.capturedAt,
        cliVersion: f.cliVersion,
        ...(f.note === undefined ? {} : { note: f.note }),
        result: Array.isArray(f.result)
          ? (f.result as readonly RawPatch[]).map(dehydratePatch)
          : dehydrateResult(f.result as RawResult),
      }),
    ),
  };
  return JSON.stringify(file, null, 2) + "\n";
}
