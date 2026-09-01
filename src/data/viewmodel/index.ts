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
  ImageOverlay,
  Mosaic,
  Scroll,
  Status,
  Valign,
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
  Steps,
  Table,
  TableRow,
  Tip,
  Tone,
  ViewDocument,
  ViewPatch,
} from "./types.js";

export { ACTION_KINDS, CAMERA_DEFAULT, COLORMAP_NAMES, GLYPH_REQUIRED_TONES, HAS_CALLOUT, HAS_DETAIL_RUNGS, HAS_X_TITLE, HAS_Y_GUTTER, HIERARCHY_MAX_DEPTH, HIERARCHY_ROLE, HONOURS_AXIS_CROSS, IS_FIELD_FORM, IS_MATRIX, ORIGIN_DEFAULT, SCHEMA, STYLE_ARMS, TONES } from "./types.js";

export { BlockShapeError, block, cell, deepFreeze, descendants, document, rebuild } from "./construct.js";

export { hierarchyFault, validateBlock, validateDocument, type Validity } from "./validate.js";

export { applyPatch } from "./patch.js";

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
