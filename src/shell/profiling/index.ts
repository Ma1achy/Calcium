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
 *
 * **`PHASE_GROUP` is the second, and it is the question the component exists
 * for.** *Was this frame computing or drawing* is unanswerable from `spans`
 * alone: a `Record<SpanName, Histogram>` carries no grouping, and the mapping
 * that supplies one lived in a module no consumer can import. Same shape, same
 * argument — names, grouped, frozen.
 *
 * **`SPAN_SITE` is the third, and it is the one a denominator needs** (I41).
 * `latency.work` sums the frames' work, so a share taken over every span
 * divides one population by another's total — measured at a residue of
 * -460.5 ms once a session opened `local` (F888). The kind column cannot
 * answer it: `compose` is compute inside a frame and `local` is compute
 * outside one.
 */
export {
  PHASE_GROUP,
  SPAN_SITE,
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
  type PhaseGroup,
  type ProfileOptions,
  type ProfileReport,
  type Profiler,
  type ResourceProbe,
  type ResourceSample,
  type SpanName,
  type SpanSite,
  type Tier,
  type TreeNode,
} from "./types.js";
