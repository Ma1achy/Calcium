/**
 * C24 — the public API. The runtime entry point.
 *
 * Every export here is a compatibility obligation, which is why this file is a
 * component with a spec rather than whatever happens to be reachable. A surface
 * that accretes by accident cannot be kept.
 *
 * **Eleven of the twenty-three components are deliberately absent**:
 * `TerminalLifecycle`, `FrameScheduler`, `TranscriptStore`, `Viewport`,
 * `OverlayManager`, `InputRouter`, `LineEditor`, `HistoryStore`,
 * `ProcessRunner`, `AdapterRegistry`, `BlockRegistry`. A consumer never
 * constructs, inspects or drives any of them, and that ratio is the measure of
 * whether the layering worked (I2). If one is ever needed, that is a signal the
 * layering has a gap — not a request to widen this list.
 *
 * The list is also the **instrument**: an export whose owner is one of the
 * eleven is interior by construction, and *available* is not an argument for
 * *exported*. Three published-and-unconsumed members were ruled against it and
 * all three dropped (§3) — `Keymap.mergeBlock`, `ThemeStore.applyOverrides` and
 * `ExecutionWrites.setRetained`. They remain in MG24's `UNCONSUMED_MEMBERS`
 * naming their owners: the ruling says they are not public, not that they are
 * finished.
 *
 * **Two things a reader will look for and not find.**
 *
 *   - `ViewRefresh`, and with it `b.live`. It is the declaration type for C23
 *     §3b's part refresh, and §3b has drivers for two of its three mechanisms.
 *     Exporting the declaration type of a mechanism nothing runs is A03 §2's
 *     vacuity class arriving as an export: a consumer would declare a refreshing
 *     part, type-check, and never be called. It returns with `b.live` (§5) and
 *     not before.
 *   - `b.hunk`, and any diff parser. `Patch` is exported as a block shape and
 *     nothing here turns two texts into hunks — they arrive from a diff tool or
 *     already structured from the far side, and the framework renders them.
 *
 * Two sibling entry points carry what must never reach production (I8):
 * `@fmx/calcium/testing` and `@fmx/calcium/fixtures`.
 */

// --- entry ------------------------------------------------------------------

export { createTui } from "./shell/session.js";
export type {
  ChromeFn,
  Identity,
  SessionSnapshot,
  StopReason,
  TuiConfig,
  TuiInstance,
} from "./shell/types.js";

// --- blocks — the type a consumer returns -----------------------------------

export type {
  Action,
  Block,
  Cell,
  Code,
  Comparison,
  ErrorLike,
  Events,
  Glyph,
  Group,
  Hunk,
  KeyValue,
  Logs,
  Notice,
  Panel,
  Patch,
  Pills,
  Plot,
  Progress,
  Raw,
  Rule,
  Series,
  Steps,
  Table,
  TableRow,
  Tip,
  Tone,
  ViewDocument,
  ViewPatch,
} from "./data/viewmodel/index.js";

// --- builders — §4 ----------------------------------------------------------

export { b } from "./shell/builders/index.js";
export type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  LiveSpec,
  LogLine,
  StepInput,
} from "./shell/builders/index.js";
/** `ColumnDef` is C04's: it is a field of `Table`, so `Table` needs it declared. */
export type { ColumnDef } from "./data/viewmodel/index.js";

// --- adapters — the extension point they use most ---------------------------

export type {
  Adapter,
  AdapterContext,
  RawPatch,
  RawResult,
  StreamContext,
} from "./data/adapters/index.js";

// --- manifest — written by hand ---------------------------------------------

export type {
  ArgDef,
  ArgType,
  FlagDef,
  Manifest,
  ToolDef,
  ValidationResult,
} from "./data/manifest/index.js";

// --- theming ----------------------------------------------------------------

export { defaultTheme } from "./presentation/theme/index.js";
export type {
  ColourRef,
  PaletteSpec,
  Style,
  ThemeSet,
  ThemeTokens,
} from "./presentation/theme/index.js";

// --- hooks ------------------------------------------------------------------

export type {
  Candidate,
  CompletionContext,
  CompletionSource,
  Slot,
} from "./interaction/completion/index.js";

/**
 * C23 §3b's declaration type, back on the list (C24 §3, I16).
 *
 * It was withheld for the whole of C22 and C23 because the mechanism beneath it
 * had no driver: a consumer could declare a refreshing part, type-check, and
 * never be called — A03 §2's vacuity class reached through the export list. The
 * condition named was *the driver*, not a release, and C23 I32 to I35 met it.
 *
 * **What the wait produced is worth keeping.** Held back, the type sat where
 * MG25 could find it, and the two functions under it became that rule's founding
 * case. Shipped on the first pass it would have been a published surface with a
 * consumer's suite compiled against something that never fired.
 */
export type { ViewRefresh, RefreshHost } from "./shell/refresh.js";

export type {
  Classification,
  CommandPolicy,
  ParseResult,
} from "./interaction/parser/index.js";

export type { BlockDefinition, RenderContext } from "./presentation/blocks/index.js";
export type { Measure, MeasureFn } from "./data/viewmodel/index.js";
export type { BlockKeymap } from "./interaction/router/types.js";

export type {
  Invocation,
  TransportRouter,
  VerbTransport,
} from "./data/transport/index.js";

/**
 * C08's, not the `@fmx/calcium/fixtures` entry point's.
 *
 * `WorldDriver` is declared in `data/fixtures/world.ts` — L0 data — and the
 * dev-only entry re-exports it alongside the recording tooling. Taking it from
 * the component barrel is what keeps I8 untouched: this is a type-only export
 * either way, but importing it through the dev entry would put that module in
 * the runtime entry's declaration graph for nothing.
 */
export type { WorldDriver } from "./data/fixtures/index.js";

// --- utilities a custom block kind needs ------------------------------------

/**
 * Public because a custom block kind cannot satisfy C09 I1 without them (I14).
 *
 * A consumer measuring width with `.length` disagrees with the measurer, and the
 * disagreement is silent — the viewport drifts, scroll positions land wrong, and
 * content jumps. `planColumns` is the same argument for a table-like kind, and
 * all three are pure.
 */
export { cells, truncate } from "./presentation/text.js";
export { planColumns } from "./presentation/table/index.js";
