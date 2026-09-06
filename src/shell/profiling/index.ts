/**
 * C28 — the profiler. See `docs/components/C28_profiler.md`.
 */
export { createProfiler } from "./recorder.js";
export { createResourceProbe } from "./node.js";
export { Hist, HISTOGRAM_ERROR } from "./histogram.js";
export { Ring } from "./ring.js";
export { profilePane, paneTitle, PANES, type PaneName } from "./panes.js";
export {
  TIER_RANK,
  type CaptureResult,
  type FrameOutcome,
  type FrameRecord,
  type GcKind,
  type Histogram,
  type MissReason,
  type ProfileOptions,
  type ProfileReport,
  type Profiler,
  type ResourceProbe,
  type ResourceSample,
  type SpanName,
  type Tier,
} from "./types.js";
