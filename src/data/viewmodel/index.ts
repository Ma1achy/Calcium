/**
 * ViewDocument, the block union, tones, actions, patches.
 *
 * C04 — see spec. The vocabulary the entire system speaks: a verb, a slash
 * command and `git status` all become a `ViewDocument` before anything renders,
 * and that single convergence is why there is one render path rather than three.
 *
 * C04 owns the schema. It does not own the registry — `render` needs theme (L1)
 * and capabilities (L0 terminal), so a registry here would import upward and
 * sideways. C09 owns it; C04 declares only the contract it must satisfy (§1).
 */

export type { AxisCross, Origin } from "./types.js";
export type {
  AdapterDocument,
  AdapterMeta,
  LocalDocument,
  ProducedMeta,
  Glyph,
  HeadingLevel,
  Action,
  Block,
  BlockKind,
  Cell,
  Code,
  ColumnDef,
  Comparison,
  DocumentMeta,
  DocumentStatus,
  ErrorLike,
  Events,
  Group,
  Hunk,
  KeyValue,
  Logs,
  Measure,
  MeasureFn,
  MergeRow,
  Notice,
  Panel,
  Image,
  Terminal,
  TerminalLine,
  TerminalRun,
  ColourValue,
  ImageOverlay,
  Mosaic,
  Scroll,
  Status,
  Valign,
  Halign,
  Align,
  WidthFn,
  Share,
  Patch,
  PatchResult,
  Pills,
  Plot,
  Camera,
  PlotForm,
  ColormapName,
  Annotation,
  BarSpec,
  QuartileSummary,
  Graph,
  GraphEdge,
  GraphNode,
  HierarchyNode,
  OHLC,
  Segment,
  ScaleType,
  Progress,
  Raw,
  Result,
  Rule,
  Series,
  VectorSeries,
  Light3,
  Line3,
  Surface3,
  Point3,
  Point3Series,
  AxisSpec3,
  Steps,
  Table,
  TableRow,
  TextSpan,
  Ramp,
  RampFill,
  RampAnimation,
  Tip,
  Tone,
  ViewDocument,
  ViewPatch,
} from "./types.js";

export { ACTION_KINDS, CAMERA_DEFAULT, COLORMAP_NAMES, GLYPH_REQUIRED_TONES, HAS_CALLOUT, HAS_DETAIL_RUNGS, HAS_HIDEABLE_SERIES, HAS_X_TITLE, HAS_Y_GUTTER, HIERARCHY_MAX_DEPTH, HIERARCHY_ROLE, HONOURS_AXIS_CROSS, IS_FIELD_FORM, IS_MATRIX, ORIGIN_DEFAULT, SCHEMA, STYLE_ARMS, TONES } from "./types.js";

export { BlockShapeError, block, cell, deepFreeze, descendants, document, rebuild } from "./construct.js";

export { hierarchyFault, validateBlock, validateDocument, type Validity } from "./validate.js";

export { applyPatch } from "./patch.js";

export { changedRuns, intralineLines, type ChangedRun } from "./intraline.js";

export { childBlocks, hasChildren, isContainerKind, type ContainerBlock } from "./tree.js";

export { markdownBlocks } from "./markdown.js";

export {
  BORDER_INSET,
  ROW_GUTTER,
  atLeastOne,
  childWidths,
  gapRows,
  placeable,
  sequenceHeight,
  groupChildWidths,
  insetWidth,
  normaliseWidth,
  ALIGN_ENTRIES,
  axesOf,
  groupPlacements,
  groupRows,
  offsetIn,
  type Axes,
  type Placement,
} from "./measure.js";

export {
  divideShares,
  mosaicRects,
  parseAreas,
  MOSAIC_HOLE,
  type MosaicGrid,
  type MosaicParse,
  type MosaicRect,
  type MosaicRegion,
} from "./mosaic.js";
export { overlayFault, overlayRange, DEFAULT_OVERLAY_COLORMAP } from "./overlay.js";
export { pinnedRange, sharedRange, type PinnedRange, type RangePin } from "./range.js";

export { digestOf } from "./digest.js";

/**
 * C28's instrumentation seam (I34).
 *
 * Exported from L0 so every layer can name `Probe` without importing a
 * profiler, which is the whole point of declaring it here rather than in
 * `src/shell/profiling/`.
 */
export { NO_PROBE, NO_SPAN, type MissReason, type Probe } from "./probe.js";
