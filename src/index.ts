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

/**
 * The local-handler contract (C23 §2, I36).
 *
 * **`TuiConfig.localHandlers` has been public since C22 and its context type was
 * not**, which was invisible while `LocalContext` held one field: an app wrote
 * `(argv, ctx: { command: string })` and structural typing agreed. `ctx.ask`
 * makes that impossible — a handler that asks cannot name the type of the thing
 * it is asking through, and the workaround is to re-declare the signature by
 * hand and drift from it.
 */
export type {
  AskOptions,
  Choice,
  LocalContext,
  LocalHandler,
} from "./shell/local/registry.js";

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

/**
 * What an adapter returns, and the three `meta` keys it owns.
 *
 * **Published because an adapter cannot be written without them** (F58b).
 * `Adapter.adapt` returns an `AdapterDocument`, so an app annotating its own
 * adapter needs the name — and the seven keys the registry fills are typed
 * `never`, so writing one is a compile error rather than a value that never
 * reaches a document.
 */
export type {
  AdapterDocument,
  AdapterMeta,
  LocalDocument,
  ProducedMeta,
} from "./data/viewmodel/index.js";

/**
 * The registry, so an app can test its own adapters.
 *
 * **An adapter's return is not a document** (F58b) — `AdapterMeta` carries the
 * three keys it owns and the registry fills the seven it does not — so an app
 * asserting *"every document this app produces is valid"* has no way to obtain
 * one without opening a session. That is the gap C24 I19 already closed for
 * completion sources by exporting `contextAt`, arriving on the adapter surface:
 * a producer the framework can test and a consumer cannot is a producer whose
 * app-side tests assert against something the user never sees.
 *
 * Found by the reference app's own suite failing the moment the narrowing
 * landed, which is the second-consumer argument in one commit.
 */
export { createAdapterRegistry } from "./data/adapters/index.js";

/**
 * The local route's completion, so an app can test its own handlers.
 *
 * Symmetric with `createAdapterRegistry` above and published for the same
 * reason: after F13 a local handler returns a `LocalDocument`, and the only
 * thing that turns one into a document is `runLocal`, which an app cannot
 * reach without opening a session.
 */
export { completeLocal } from "./shell/documents.js";

// --- builders — §4 ----------------------------------------------------------

export { b } from "./shell/builders/index.js";
export type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  KeyValueRow,
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
  ManifestDocument,
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
 * The producers of the context a source is handed (C24 I19, C24 §8b).
 *
 * **Exported because the second consumer could not test the hook it wrote.**
 * `CompletionSource` invites an app to answer for a slot; the answer is a
 * function of a `CompletionContext`, and until now nothing outside this package
 * could build one — so a source's `complete()` was callable only by the shell
 * that owns it. The alternatives are worse than the export: a hand-built
 * context is a literal that agrees with the test rather than with the
 * derivation, and a deep import is F7.
 *
 * `parseManifest` comes with it because `contextAt` takes a `Manifest` and an
 * app hands `createTui` an unparsed document, so the type it needs had no
 * producer either.
 */
export { contextAt } from "./interaction/completion/index.js";
export { parseManifest } from "./data/manifest/index.js";

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
/**
 * C24 I22 — a `code` block accepts any language name, and until this existed
 * only two of them meant anything (C09 §4a, F93).
 *
 * `DEFAULT_LANGUAGES` beside it because an app cannot otherwise tell whether
 * it needs to register one: a `code` block with an unregistered language
 * renders as plain text and reports nothing, by design (C09 I8), so the set
 * has to be readable or the fallback is indistinguishable from a mistake.
 */
export { DEFAULT_LANGUAGES, registerGrammar } from "./presentation/blocks/index.js";
/**
 * The record a `RenderContext` carries, and what `TuiConfig.capabilities`
 * overrides (C22 I49).
 *
 * Exported by name because a consumer writing an override wants to name the
 * type it is a `Partial` of; the shape was already reachable through
 * `RenderContext` and could not be spelled.
 */
export type { TerminalCapabilities } from "./terminal/capabilities.js";
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
