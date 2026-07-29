/**
 * Recording harness. Provenance, redaction, seeded RNG.
 *
 * C08 — see spec. **This is the harness half only.** The world is the app's
 * (§1a, I9): `prism-tui` and `docker-tui` each implement `WorldDriver` and get
 * recording, determinism and redaction from here rather than reimplementing the
 * machinery most likely to be got wrong.
 *
 * The trap the component exists to avoid is worth restating at the entry point.
 * A hand-authored fixture is written against a schema, so it agrees with that
 * schema by construction, and keeps agreeing after the far side has diverged —
 * the adapter passes green against a fiction while the live system is broken.
 * The defence is that fixtures are **recordings**: provenance is a field,
 * authoring is marked and counted, and `record --diff` says what moved.
 */

export { createRng, type Rng } from "./rng.js";

export type { WorldDriver } from "./world.js";

export {
  authoredRatio,
  checkProvenance,
  formatRatio,
  type ProvenanceProblem,
  type VerbRatio,
} from "./provenance.js";

export { REDACTED, findSecrets, redactText, type Redaction } from "./redact.js";

export {
  CORPUS_SCHEMA,
  CorpusError,
  parseCorpus,
  serialiseCorpus,
  type CorpusFile,
  type StoredFixture,
  type StoredPatch,
  type StoredResult,
} from "./corpus.js";

export {
  MANIFEST_VERB,
  createFixtureHandler,
  type EmulatedHandler,
  type FixtureHandlerOptions,
  type HandlerMode,
} from "./handler.js";

export { record, recordAll, type RecordOptions, type RecordRequest } from "./record.js";

export {
  diffCorpus,
  formatDiff,
  type CorpusDiff,
  type Delta,
  type DeltaKind,
  type FixtureDiff,
} from "./diff.js";
