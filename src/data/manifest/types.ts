/**
 * The manifest vocabulary. C05 §2 — see spec.
 *
 * The whole of C05 exists so that nothing above it has to know what a verb is.
 * These types are that knowledge, held in one place and written by the app.
 *
 * `Result` and `ErrorLike` come from C04. C05's first draft declared its own
 * `Result` with `errors` plural where C04's has `error` singular — two shapes
 * under one name, in one half of one layer, both of which compile. SS35 now
 * forbids the second declaration.
 */

import type { ErrorLike, Result } from "../viewmodel/index.js";

export type { ErrorLike, Result };

export const MANIFEST_SCHEMA = "tui.manifest/1" as const;

/**
 * The closed union, as a runtime list so it can be enumerated (T1.7c) and
 * exhaustively dispatched (T2.4).
 *
 * **The rule, because "no domain concepts" is not checkable by a future
 * reader:** an `ArgType` describes a *shape the framework can validate without
 * knowing what it means*. `enum`, `duration` and `pattern` qualify. `uuid` and
 * `target` do not — a UUID is a `pattern` and a target is a `string`, and
 * adding either means the framework has begun to know Prism's nouns. This is
 * the union EX5 asserts stays empty.
 */
export const ARG_TYPES = [
  "string",
  "int",
  "bool",
  "path",
  "enum",
  "duration",
  "pattern",
] as const;

export type ArgType = (typeof ARG_TYPES)[number];

export type FlagDef = Readonly<{
  name: string; // long form, without "--"
  short?: string; // single char, without "-"
  type: ArgType;
  values?: readonly string[]; // required iff type === "enum"
  pattern?: string; // required iff type === "pattern"; anchored regex
  repeatable?: boolean;
  requires?: readonly string[]; // other flags that must accompany it
  conflicts?: readonly string[];
  summary: string;
}>;

export type ArgDef = Readonly<{
  name: string;
  type: ArgType;
  required: boolean;
  variadic?: boolean;
  values?: readonly string[];
  pattern?: string;
  summary: string;
}>;

export type ToolDef = Readonly<{
  name: string; // "ps", "serving scale" — spaces mean sub-verbs
  local: boolean; // true = handled in-process, never spawned
  summary: string;
  args: readonly ArgDef[];
  flags: readonly FlagDef[];
  streams?: boolean; // emits NDJSON patches rather than one document
  oneShot?: boolean; // writes one frame to stdout and exits; bypasses the TTY gate
  /**
   * Omitted from help and completion, still invocable — `visibleTools` drops it
   * and `findTool` still resolves it. That pair *is* the meaning of the field:
   * it is how a verb is deprecated or kept as an internal escape hatch, working
   * for whoever knows its name while it leaves the help. A `hidden` that also
   * stopped resolving would be a weak form of deleting the entry, and deleting
   * the entry is how a verb is deleted.
   */
  hidden?: boolean;
}>;

export type Manifest = Readonly<{
  schema: typeof MANIFEST_SCHEMA;
  binary: string;
  version: string; // the far side's version, for skew reporting
  tools: readonly ToolDef[];
}>;

export type ToolMatch = Readonly<{
  tool: ToolDef;
  consumed: number; // tokens the tool name consumed
  residual: readonly string[]; // the rest, to be validated as args
}>;

export type ValidationResult =
  | Readonly<{ ok: true; args: Readonly<Record<string, unknown>> }>
  | Readonly<{ ok: false; errors: readonly ErrorLike[] }>;

/** A parse failure, addressed by JSON path: `tools[3].flags[1].values`. */
export type ManifestError = Readonly<{ path: string; message: string }>;

/**
 * The loader (§4). Three states — unloaded → loaded → sealed — because a
 * manifest replaced mid-session would leave completion offering flags the
 * parser rejects. C22 seals at the end of composition, before input.
 */
export interface ManifestStore {
  load(m: Manifest): void;
  seal(): void;
  readonly manifest: Manifest | null;
  readonly sealed: boolean;
}
