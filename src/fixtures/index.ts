/**
 * `calcium-tui/fixtures` — the recording tooling and the fixture model. Dev-only.
 *
 * C24 §2 — see spec. One of three entry points, split by what ships to
 * production: this one and `calcium-tui/testing` never reach a production install,
 * because a golden-frame differ and a corpus differ have no business in one.
 *
 * A re-export and nothing else. The modules are C08's, under `src/data/`, where
 * the layer rules reach them; this file is the public shape of them.
 */

export {
  CORPUS_SCHEMA,
  CorpusError,
  MANIFEST_VERB,
  REDACTED,
  authoredRatio,
  checkProvenance,
  createFixtureHandler,
  createRng,
  diffCorpus,
  findSecrets,
  formatDiff,
  formatRatio,
  parseCorpus,
  record,
  recordAll,
  redactText,
  serialiseCorpus,
  type CorpusDiff,
  type CorpusFile,
  type Delta,
  type DeltaKind,
  type EmulatedHandler,
  type FixtureDiff,
  type FixtureHandlerOptions,
  type HandlerMode,
  type ProvenanceProblem,
  type RecordOptions,
  type RecordRequest,
  type Redaction,
  type Rng,
  type StoredFixture,
  type StoredPatch,
  type StoredResult,
  type VerbRatio,
  type WorldDriver,
} from "../data/fixtures/index.js";

/**
 * **C06's reader itself, not a copy** (C08 I19, F1432). A fixture describing what
 * a far side writes feeds its lines through this and replays what it emits, so
 * when degradation trips stays C06's rule: the docker example once placed
 * `degraded` by hand after the ninth line, and the copy hid C07 dropping them.
 */
export { createNdjsonReader } from "../data/transport/index.js";

/** C06 declares it, C08 owns every rule about it (A02 §1). */
export type { Fixture } from "../data/transport/types.js";
