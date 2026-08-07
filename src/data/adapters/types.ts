/**
 * What an adapter is, and what it is told.
 *
 * C07 §3 — see spec. Types only; the enforcement lives beside them.
 *
 * The shape that matters here is that `adapt` returns a whole `ViewDocument`
 * while the registry owns its `meta` (I13). An adapter is free to write one and
 * three fields of it survive — `resultId`, `adapter`, `truncated`, the three the
 * registry cannot know. Everything else is overwritten from the `RawResult` and
 * the context, because `meta.origin` and `meta.transport` are required by C04
 * I13 and derivable from neither, and a provenance an app author supplies once
 * per verb is a provenance that is wrong somewhere.
 *
 * C07 imports nothing from `terminal/`, `presentation/` or above (I10, MG7).
 */

import type { ToolDef } from "../manifest/types.js";
import type { RawPatch, RawResult } from "../transport/types.js";
import type { AdapterDocument, Block, ViewDocument, ViewPatch } from "../viewmodel/types.js";
/**
 * **The one name that crosses L0's halves, and it crosses type-only** (I10,
 * MG3's `CROSS_HALF_TYPES`). The runtime edge stays forbidden, so `data/` still
 * builds as JavaScript with `terminal/` absent; what is shared is a declaration.
 *
 * The alternative is a second declaration of the resolved record inside `data/`,
 * pinned by a test that agrees with itself — two records of one fact, which is
 * F124's defect one layer in.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

export type { RawPatch, RawResult };

/**
 * What every producer is told (C07 §3, I17–I20).
 *
 * **The line is authority, not knowledge.** `width` used to carry the comment
 * *"never a layout decision — C11's"*, and it was answered for two years as
 * though it were about what a producer may *know*. It is about what a producer
 * may *own*: the frame is C22's, and a producer that positions loses on the next
 * resize. Withholding the fact never prevented the decision — it produced five
 * duplicated modules in the reference app, a capability sniff wrong on three of
 * four locale shapes, and one boolean threaded through eight functions.
 *
 * **Built at the call, never captured** (C07 §3a, C and G). A live part renders
 * repeatedly and a stream adapts per patch, so a context held from when the
 * document was made is stale by the first resize. That is the half of F24 that
 * survives.
 *
 * Four routes are told this and no more: an adapter, a local handler (C23 §2),
 * a live part's `render` (C24 §5) and the greeting (C22 I53).
 */
export type ProducerContext = Readonly<{
  /** The frame's, handed down. Knowledge, not placement (I17). */
  width: number;
  /**
   * The region, where a bound exists — and `null` where none does (I18).
   *
   * Non-null **iff** the document is bound by a region, which is a view
   * invocation and nothing else. A transcript entry is windowed by rows and has
   * no bound, so `null` is the answer rather than the terminal's height standing
   * in for a region nobody promised. C23 knows which before the producer runs.
   *
   * A live part is `null` even inside a view: the region belongs to the
   * document, and a refresh replaces one panel sharing it (C23 I34, §3a D).
   */
  height: number | null;
  /**
   * C02's **resolved** record — overrides applied, never a re-detection (I19).
   *
   * An app deriving this from the environment reads three variables where C02
   * reads seven, and never sees the overrides it supplied itself (C22 I49).
   * Measured wrong at three of the four locale shapes anyone tests, in both
   * directions, inside the fix written for the finding that asked for the fact.
   */
  capabilities: TerminalCapabilities;
  /**
   * How many rows this block occupies at this width — the frame's own measurer
   * (I20).
   *
   * Measuring is knowledge: it is a question about a document, not a decision
   * about a screen. A producer dividing content needs it, and a second
   * implementation is the drift C09 I1 exists to prevent — the same argument
   * `cells()` rests on. `BlockRegistry` itself stays unreachable (C24 §3).
   */
  measure: (block: Block, width: number) => number;
}>;

export type AdapterContext = ProducerContext & Readonly<{
  /** As typed, for `doc.command`. */
  command: string;
  verb: string | null;
  /** The user typed `--json` explicitly (I9, A01 O3). */
  userRequestedJson: boolean;
  /**
   * The invocation's validated flag values — C05's `ValidationResult.args`
   * (C05 I21, F39).
   *
   * **The half `shellOnly` needs to be usable.** A flag the shell consumes is
   * absent from `argv` by construction, so an adapter reading `raw.argv` cannot
   * see it — and `--raw` is exactly that: it selects a rendering, docker exits
   * 125 on it, and the adapter is what has to know. Without this the mechanism
   * removes the flag and gives its only consumer no way to read it.
   *
   * **`userRequestedJson` is this field, hardcoded for one flag**, and it stays
   * because `--json` is not the same case: it is transmitted, C06 appends it,
   * and the far side understands it. Two fields for two axes rather than one
   * that means both.
   *
   * Values, not tokens: `args.raw` is `true`, not `"--raw"`. What the user typed
   * is `meta.argv`; what it meant is here.
   */
  flags: Readonly<Record<string, unknown>>;
  /** Provenance, for `meta` — not derivable from a `RawResult` (C04 I13). */
  transport: "emulated" | "fixture" | "subprocess" | "local";
  origin: "user" | "action" | "agent" | "refresh";
  /**
   * From C05. The exit-2 usage block's only source: T4.4 requires it generated
   * from the manifest rather than hardcoded, and C05 is the same half of the
   * same layer, so the dependency is acyclic.
   */
  tool: ToolDef | null;
}>;

export type StreamContext = AdapterContext & Readonly<{ seq: number }>;

export type Adapter = Readonly<{
  schema: "tui.view/1";
  /**
   * **`meta` carries only the three keys the registry honours** (F58b).
   * `authoritativeMeta` overwrites `verb`, `exitCode`, `durationMs`, `argv`,
   * `stderr`, `transport` and `origin` from the raw result and the context on
   * every route, so an adapter supplying them computed seven values that were
   * discarded — and the return type required all ten, so there was no way to
   * write a correct adapter that did not. An adapter returning `exitCode: 999`
   * produced a document reading `0`.
   */
  adapt: (raw: RawResult, ctx: AdapterContext) => AdapterDocument;
  /** `null` = ignore this patch. Absent = stream through the fallback (I11, §6). */
  adaptPatch?: (patch: RawPatch, ctx: StreamContext) => ViewPatch | null;
}>;

export interface AdapterRegistry {
  register(verb: string, adapter: Adapter): void;
  seal(): void;
  adapt(raw: RawResult, ctx: AdapterContext): ViewDocument;
  adaptPatch(patch: RawPatch, ctx: StreamContext): ViewPatch | null;
  readonly sealed: boolean;
}

/** Thrown at construction, never at adaptation — I7's whole point. */
export class AdapterSchemaError extends Error {
  override readonly name = "AdapterSchemaError";
  constructor(message: string) {
    super(message);
  }
}
