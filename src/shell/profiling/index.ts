/**
 * C28 — the profiler's **published** face. See `docs/components/C28_profiler.md`.
 *
 * **Types, the tier ordering, and nothing that runs** (C24 I31). This module is
 * what `@fmx/calcium/profiling` resolves to, and a consumer imports it to
 * *read* a report: everything that produces one is reached through `createTui`'s
 * `profile` field, so an entry point shipping a recorder would be a second way
 * in (→ C22 I93).
 *
 * **It exported five runtime values until this commit** — `createProfiler`,
 * `createResourceProbe`, `Hist`, `Ring` and `profilePane` — and nothing under
 * `src/` imported it, so the violation was invisible in both directions: no
 * consumer to be wrong, and no subpath in `package.json` for the rule to apply
 * to. It became live the moment the subpath was added, which is the shape of an
 * invariant that is vacuous until its subject exists.
 *
 * Every internal caller imports the concrete file — `session.ts` takes
 * `createProfiler` from `./profiling/recorder.js` — so nothing moved to trim
 * this.
 *
 * `TIER_RANK` stays because it is the tier *names*, ordered. Comparing two
 * tiers is the one operation a report's reader has that a type cannot give
 * them, and a frozen lookup table starts nothing.
 */
export {
  TIER_RANK,
  type CaptureKind,
  type CaptureResult,
  type CommitReason,
  type FrameOutcome,
  type FrameRecord,
  type GcKind,
  type HeapSpace,
  type Histogram,
  type MissReason,
  type NodeStat,
  type Overhead,
  type ProfileOptions,
  type ProfileReport,
  type Profiler,
  type ResourceProbe,
  type ResourceSample,
  type SpanName,
  type Tier,
  type TreeNode,
} from "./types.js";
