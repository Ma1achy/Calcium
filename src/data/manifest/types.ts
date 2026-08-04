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
  /**
   * The verb takes the terminal — C23 §4's handoff row (C05 I19).
   *
   * **The app author is the only party who can know this.** Detection is not
   * available: whether a child wants a TTY is not knowable before running it.
   * A maintained list of TTY program names is wrong for every wrapper and
   * alias and fails silently when it is wrong, which is the shape C23 I26
   * forbids. So the declaration lives beside the other things only the author
   * knows, and `parseTool` refuses it with `streams` and with `local`.
   *
   * C18 carries the whole `ToolDef` on an `app` result, so this reaches C23
   * with no parser change — one fact with one home rather than a copy on the
   * result and nothing reconciling the two.
   */
  interactive?: boolean;
}>;

export type Manifest = Readonly<{
  schema: typeof MANIFEST_SCHEMA;
  binary: string;
  version: string; // the far side's version, for skew reporting
  /** Every tool, the app's and the framework's — what `findTool` reads. */
  tools: readonly ToolDef[];
  /**
   * What the app wrote (§3).
   *
   * **The partition is here rather than a `source` field on `ToolDef`**, which
   * would be settable by an app writing a manifest by hand — meaningless from
   * its side and a lie if set wrongly — and readable by every consumer, so one
   * eventually branches on it. This makes the two legitimate uses available and
   * the illegitimate ones awkward.
   *
   * Two consumers: `serialise` emits it, because what round-trips is what the
   * app wrote; and `/help` groups by it, because `/clear` and `/exit` are
   * different in kind from `/ps` and a flat list hides that.
   */
  appTools: readonly ToolDef[];
}>;

/**
 * What an app author writes, as against what `parseManifest` returns (C22 I23a).
 *
 * A `Manifest` carries `appTools`, and the parser *derives* it — along with the
 * framework's own six verbs (§3). Requiring one of those from an author was
 * requiring the result before the call, and it made `TuiConfig.manifest`'s
 * object arm impossible to satisfy: the only way to obtain a `Manifest` is to
 * call a function that is exported from no entry point.
 *
 * So this is the input shape: the app's own verbs, which is all an author knows.
 *
 * **`appTools?: never` is the whole enforcement, and `Omit` alone was not**
 * (C22 I23b). A `Manifest` has every member of `Omit<Manifest, "appTools">` and
 * one more, so it is structurally assignable to it — the type accepted exactly
 * the value construction throws on, and this comment described a distinction it
 * did not impose. `test/support/fixture.mjs` made that call, forty-four tier-5
 * rows failed, and the branch merged green.
 *
 * The optional `never` refuses it at the call site: a hand-written document
 * omits the member and satisfies this unchanged, while a parsed `Manifest`
 * carries `readonly ToolDef[]` where `undefined` is required and does not
 * compile.
 *
 * **The general form, because this is not the only such pair.** A derived type
 * related to its source by *one field fewer* is assignable from that source, so
 * `Omit` never expresses *input, not output* on its own.
 */
export type ManifestDocument = Omit<Manifest, "appTools"> & {
  readonly appTools?: never;
};

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
