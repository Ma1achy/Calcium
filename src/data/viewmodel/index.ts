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
  Scroll,
  Valign,
  Share,
  Patch,
  PatchResult,
  Pills,
  Plot,
  PlotForm,
  ColormapName,
  Annotation,
  BarSpec,
  QuartileSummary,
  HierarchyNode,
  OHLC,
  Segment,
  ScaleType,
  Progress,
  Raw,
  Result,
  Rule,
  Series,
  Steps,
  Table,
  TableRow,
  Tip,
  Tone,
  ViewDocument,
  ViewPatch,
} from "./types.js";

export { ACTION_KINDS, COLORMAP_NAMES, GLYPH_REQUIRED_TONES, HAS_CALLOUT, HAS_Y_GUTTER, SCHEMA, STYLE_ARMS, TONES } from "./types.js";

export { BlockShapeError, block, cell, deepFreeze, descendants, document, rebuild } from "./construct.js";

export { validateBlock, validateDocument, type Validity } from "./validate.js";

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
