/**
 * Three transports behind one interface. Reports; never interprets.
 *
 * C06 — see spec. This is the boundary: everything below it is data structures,
 * everything through it is a real process, a real cluster or a recorded corpus.
 * It is the first component that does I/O and the first whose failures are other
 * people's — a far side that hangs, a stream that dies mid-flight, output that is
 * not JSON.
 *
 * The discipline that makes it work is one sentence: **C06 reports, C07
 * interprets.** No `ViewDocument`, no exit-code mapping, no envelope synthesis
 * (I1, I2, MG6, SS25). That split is what lets transport be tested with no view
 * model in sight, and adapters with no process in sight.
 */

export {
  type Clock,
  type Fixture,
  type FixtureHandler,
  type Invocation,
  type RawPatch,
  type RawResult,
  type TransportDeps,
  type TransportMode,
  type TransportRouter,
  type VerbTransport,
} from "./types.js";

export { withJson } from "./argv.js";

export { MAX_LINE_BYTES, createNdjsonReader, type NdjsonReader } from "./ndjson.js";

export { RUNGS, RUNG_MS, escalate, type Signalable } from "./ladder.js";

export { createSubprocessTransport } from "./subprocess.js";

export { createFixtureTransport } from "./fixture.js";

export { createEmulatedTransport } from "./emulated.js";

export { TransportBusyError, createRouter } from "./router.js";

export { createTransport } from "./factory.js";
