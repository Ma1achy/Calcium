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
 * **One thing a reader will look for and not find.**
 *
 *   - `b.hunk`, and any diff parser. `Patch` is exported as a block shape and
 *     nothing here turns two texts into hunks — they arrive from a diff tool or
 *     already structured from the far side, and the framework renders them.
 *
 * **`ViewRefresh` was the second and is no longer** (F164). It was withheld
 * through C22 and C23 because the mechanism beneath it had no driver, and the
 * condition named was the driver rather than a release — C23 I32 to I35 met it,
 * and it is exported below with the note that says so. This sentence stands
 * where the excusing one did, because the excusing one outlived its condition by
 * two components while sitting two hundred lines above the export that falsified
 * it. **A header is the part of a file nobody re-reads**, so a claim here that
 * names a symbol is a claim to check by grepping this file, not by reading on.
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
 * The cursor's shape, for `TuiConfig.cursor` (C22 I63, C01 I20).
 *
 * Exported because a consumer that names the type — rather than writing an
 * object literal at the call site — cannot otherwise, and a config field whose
 * type is unreachable is a field only an inline literal can fill.
 */
export type { CursorShape, CursorStyle } from "./terminal/escapes.js";

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
  Status,
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
/**
 * The one range a set of overlaid images must share (C04 I74, §3h.3).
 *
 * **On the surface because the composition that needs it is the consumer's.**
 * `b.samples` computes it for a grid; three `b.image` blocks composed by hand are
 * the case §3h.3 measured, and without this that consumer can only write the
 * pins and not derive them. The type is `yMin`/`yMax`'s, so what comes out of
 * here goes straight onto an overlay.
 */
export { sharedRange, type PinnedRange } from "./data/viewmodel/range.js";
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
  ProducerContext,
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

/**
 * The theme, and **the loader that makes `plotToSvg` callable** (C24 I29, §8c).
 *
 * `loadTheme(defaultTheme, "dark").value.current` is a `ResolvedTheme`, which is
 * `plotToSvg`'s second parameter — published by name for a year with its
 * argument type interior, so the function resolved and could not be called.
 * Third instance of I19's class after `CompletionContext` and `ProducerContext`,
 * and the one that produced a rule (MG29).
 *
 * **`loadTheme` rather than a pre-resolved constant.** A consumer supplying
 * `TuiConfig.theme` has *their* theme resolved by the session; a constant would
 * resolve the shipped one, so the second renderer would disagree with the first
 * for exactly the consumers who customised anything.
 */
export { defaultTheme, loadTheme } from "./presentation/theme/index.js";
export type {
  ColourRef,
  PaletteSpec,
  ResolvedTheme,
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
 * `registerGrammar`'s argument, re-exported from `highlight.js` (C24 I29, MG29).
 *
 * **A transitive dependency's type is not a published surface.** `highlight.js`
 * is a runtime dependency, so the type is *resolvable* from a consumer's tree —
 * and reaching it means naming a package Calcium happens to depend on, which is
 * the coupling `exports` exists to prevent. Re-exported so the argument comes
 * with the function, as I29 requires.
 */
export type { LanguageFn } from "highlight.js";

/**
 * A Mermaid diagram as a `code` block (roadmap 9).
 *
 * **Published because the app is the caller.** A diagram arrives as text from a
 * far side and becomes a block on the way in, which is an adapter's or a live
 * part's decision, not the framework's — so this is a transform an app reaches
 * for rather than a kind the vocabulary grows. It takes capabilities because
 * the renderer's ASCII switch is C02 I9's tier (box drawing is ambiguous
 * throughout), and a `ProducerContext` carries them.
 */
/**
 * A plot as SVG — **the second renderer** (C12 §3aj.2, phase 3).
 *
 * **On the surface because the consumer boundary is the point.** A reader who
 * wants a figure outside a terminal is what phase 3 exists for, and the path
 * has no other caller by design: the layout ladder is not shared, so nothing
 * inside the framework composes an SVG on a consumer's behalf.
 *
 * `sharp` or any SVG rasteriser turns the result into a PNG; `b.image` takes it
 * from there, which is how a plot becomes an image inside a transcript.
 */
export { plotToSvg, svgLayout, SVG_FONT_SIZE, type SvgLayout } from "./presentation/plot/svg.js";
export { mermaidCode } from "./presentation/mermaid.js";
/**
 * A banner, from a sparse set of variants (roadmap 22).
 *
 * **Published for the same reason and by the same argument as `mermaidCode`.**
 * Art is pre-composed text: nothing about it needs a renderer, so it is a
 * transform in front rather than a seventeenth kind in the vocabulary — which
 * is what keeps the freeze from having to carry it.
 *
 * It takes capabilities *and a width* because both decide, and the second is
 * the one the sketch did not have: a `blocks` variant this terminal can draw
 * and is too narrow for falls to the next rung rather than being truncated.
 */
export { art } from "./presentation/art.js";
export type { ArtSpec, ArtTier } from "./presentation/art.js";
/**
 * The record a `RenderContext` carries, and what `TuiConfig.capabilities`
 * overrides (C22 I49).
 *
 * Exported by name because a consumer writing an override wants to name the
 * type it is a `Partial` of; the shape was already reachable through
 * `RenderContext` and could not be spelled.
 */
export type { TerminalCapabilities } from "./terminal/capabilities.js";

/**
 * **Which glyph rung an image will take on this terminal** (C09 I37, §8b).
 *
 * Published because a consumer captioning its own figure cannot otherwise say
 * which arm drew it, and F394 is what that costs: the demo labelled a braille
 * dither `pixels` and a working ladder read as a broken renderer. F415 is the
 * same shape one rung along — the caption said *braille dither* while the half
 * block was drawing, because the ladder grew a rung and the label named two.
 *
 * The protocol arm is `capabilities.imageProtocol === "kitty"`, which a consumer
 * already has; this answers the question below it.
 */
export { halfBlockEligible } from "./presentation/image/index.js";
/**
 * The two catalogues, listable by name (C24 §6). `Status.spinner` names a
 * spinner set and `Progress.style` a bar style; a consumer drawing a gallery or
 * a picker reads these rather than copying the list, so a set added to the
 * catalogue arrives without the copy going stale. The plots demo's `/spinners`
 * and `/bars` are the first consumers.
 */
export { barStyleNames, spinnerSetNames } from "./presentation/blocks/index.js";
export type { Measure, MeasureFn } from "./data/viewmodel/index.js";
export type { BlockKeymap } from "./interaction/router/types.js";

export type {
  Fixture,
  FixtureHandler,
  Invocation,
  TransportDeps,
  TransportRouter,
  VerbTransport,
} from "./data/transport/index.js";

/**
 * C06 §2's constructors, so an app can build what `TuiConfig.transport` takes.
 *
 * **Three types and no function that produces one.** `TuiConfig.transport` is
 * a `TransportRouter`; the block above exported the interface and nothing that
 * constructs it, so a consumer could name the type and could not obtain the
 * value — C24 I2's `BlockRegistry` shape on this seam. C06 §2 publishes a
 * three-arm `TransportDeps` union and one arm had a reachable constructor: the
 * shell's own `subprocess` default in `construct.ts`, the only `createTransport`
 * caller in the tree. An app wanting the emulator — C06 §1's stated purpose for
 * that mode — had no door.
 *
 * `createTransport` is exported with the two arm constructors rather than
 * instead of them: C06 §1 says one factory taking one mode value is how a verb
 * migrates without anything else branching on mode, and an app's entry point
 * that reads its own `*_TRANSPORT` variable (C06 I18) wants the factory, while
 * a test constructing one arm wants the arm. `createSubprocessTransport` stays
 * off the entry — the shell builds it from `TuiConfig.binary`, and an app
 * building a second would be a second reader of the runner and the clock.
 * The first consumer outside `src/` is `test/contract/transport.test.ts`'s
 * public-surface row, which constructs every arm through the entry.
 *
 * **Three types came with them, and MG29 named every one.** `Fixture`,
 * `FixtureHandler` and `TransportDeps` are the parameter types of the three
 * constructors, and publishing a function whose argument type is interior is
 * C24 I29's silent failure — the rule fired on the first run with the functions
 * alone. What a `FixtureHandler` returns — `RawResult`, `RawPatch` — was
 * already on the entry through the adapters block above. `Fixture` was already
 * on `@fmx/calcium/fixtures`; it is here because the runtime entry may not
 * import that one (C24 I8), and the type is C06's.
 */
export {
  createEmulatedTransport,
  createFixtureTransport,
  createRouter,
  createTransport,
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
// **`AmbiguousWidth` comes with them** (C24 I29, MG29). Commitment 12 publishes
// these two because *a custom block kind cannot be written without them*, and
// the second parameter's type was interior — so `cells(s)` was callable and
// `cells(s, w)` was not, on the surface whose whole reason is that a consumer
// measures the way the framework measures.
export { cells, truncate } from "./presentation/text.js";
export type { AmbiguousWidth } from "./presentation/text.js";
export { planColumns } from "./presentation/table/index.js";
