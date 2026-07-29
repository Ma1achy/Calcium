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
import type { ViewDocument, ViewPatch } from "../viewmodel/types.js";

export type { RawPatch, RawResult };

export type AdapterContext = Readonly<{
  /** As typed, for `doc.command`. */
  command: string;
  verb: string | null;
  /** Some adapters choose column sets by width. Never a layout decision — C11's. */
  width: number;
  /** The user typed `--json` explicitly (I9, A01 O3). */
  userRequestedJson: boolean;
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
  adapt: (raw: RawResult, ctx: AdapterContext) => ViewDocument;
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
