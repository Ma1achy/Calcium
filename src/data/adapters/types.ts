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
import type { AdapterDocument, ViewDocument, ViewPatch } from "../viewmodel/types.js";

export type { RawPatch, RawResult };

export type AdapterContext = Readonly<{
  /** As typed, for `doc.command`. */
  command: string;
  verb: string | null;
  /** Some adapters choose column sets by width. Never a layout decision — C11's. */
  width: number;
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
