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
  /**
   * This flag makes the invocation a pushed view — C22 §13a, C05 I20.
   *
   * On a flag as well as on the tool because a verb's tier can depend on how it
   * was invoked: S12's logs view is `ps <uuid> --logs`, a flag on a `ps` that
   * otherwise appends. A tool-level field alone would need `ps` split into two
   * tools to express it, putting one verb's flags in two places.
   *
   * **S3 was named here too, as `ps <uuid> --watch`, and cannot be built that
   * way.** `docker ps` takes no positional argument, `--watch` is not a docker
   * flag, and C06 I4 sends argv to the far side verbatim — so the declaration
   * would have put a flag docker rejects on a verb that rejects the id. S3 is a
   * verb-level view instead (`container stats <id>`). The arm is right and the
   * example was not, which is the distinction worth keeping: **no consumer
   * outside a test fixture reaches this arm yet**, and saying so is weaker than
   * the verb arm's claim on purpose.
   */
  view?: boolean;
  /**
   * The shell consumes this flag; it never reaches the far side (I21, F39).
   *
   * **The axis is transmission, not presentation, and the two do not coincide.**
   * `--json` selects a rendering *and* is understood by the far side — C06
   * appends it — so it stays transmitted. `--raw` selects a rendering and means
   * nothing to the binary: `/inspect <c> --raw` ran `docker inspect <c> --raw`
   * and docker exited 125. Naming the field for presentation would have put
   * `--json` on the wrong side of it.
   *
   * **This is what `view` already needed and never had.** The comment above
   * records that `ps <uuid> --watch` "cannot be built that way" because argv
   * goes over verbatim — so the `view` arm has been usable only on `local`
   * tools since it was written, and nothing said so. A `view` flag on a spawned
   * tool wants `shellOnly` too; F108 is the arm being narrower than its type.
   *
   * Validated exactly as any other flag: it is in `residual`, so `requires`,
   * `conflicts` and type-checking are unchanged. Only `argv` drops it.
   */
  shellOnly?: boolean;
  /**
   * This flag decides the invocation's terminal contract (I23, F80).
   *
   * **`interactive` on a `ToolDef` describes a verb, and some verbs do not have
   * one contract.** `docker run` attaches by default and detaches with `-d`;
   * `docker exec` needs the terminal for `-it … sh` and not for `… ls`. Same
   * verb, two contracts, chosen per invocation — and both live in one file of
   * one app, which is what makes it a defect in the type rather than a wish.
   *
   * **F80 asked for a predicate and a manifest cannot hold one.** It is JSON the
   * app ships and T2.7 round-trips it; a function does not survive that. What
   * does is this: a declaration per flag, resolved by the walk that already
   * knows which flags a token names.
   *
   * **An arm equal to the tool's default is refused at parse, and that refusal
   * is the whole design.** It means every arm on a verb reads `!default` — so
   * two flags cannot disagree, there is no dominant value, no last-wins rule and
   * nothing to remember. `docker run -dit` resolves to *not interactive* because
   * `-d` carries the only arm `run` can have, which is what docker does, and no
   * precedence policy was consulted to get there.
   *
   * **`false` and absent differ here, and on no other member of either type.**
   * Absent means *this flag does not decide*. A reader assuming the usual
   * reading writes `interactive: false` where it would be inert and gets a parse
   * error with a path, which is the only place that assumption is cheap to have.
   */
  interactive?: boolean;
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
  /**
   * The verb's result is a pushed view rather than a transcript entry —
   * C22 §13a, C05 I20.
   *
   * **Declared, because it must be known before the verb runs.** C23 I3 appends
   * the pending entry *before* the transport is invoked, and C13 has no delete
   * (C23 §8a A4 ruled it must not gain one). An adapter deciding the tier on
   * seeing its result would produce a view *and* the entry B03 §2 says a push
   * does not leave, with nothing able to withdraw it. So the decision precedes
   * step 3, and the only thing known before a verb runs is its declaration.
   *
   * The party is the one `interactive` names, for the same reason: a view is a
   * handoff of input ownership, and A01 D4 is the test — it takes letter keys
   * while the prompt would otherwise hold focus, so the prompt must go.
   *
   * `FlagDef` carries it too, and an invocation is a view if either says so.
   * Refused with `interactive` and with `oneShot`; permitted with `streams`,
   * because S12's logs view is exactly that pair.
   */
  view?: boolean;
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
  | Readonly<{
      ok: true;
      args: Readonly<Record<string, unknown>>;
      /**
       * The invocation minus the shell's own switches (I21, F39).
       *
       * Returned from here rather than derived by C18, because the walk that
       * knows where a flag ends is this one — a second copy in the parser is the
       * drift a shared implementation prevents. `args` still carries the value,
       * so a `shellOnly` flag is validated and readable and simply does not
       * travel.
       */
      transmitted: readonly string[];
      /**
       * The resolved terminal contract (I23, F80) — the tool's declaration
       * unless a flag present in this invocation carries an arm.
       *
       * Here for `transmitted`'s reason and not a new one: this is the walk that
       * knows which flags a token names, and C18 would re-derive the grammar to
       * find out. It is on the success arm only because C23 I38 gates before it
       * routes, so a failed validation has nothing to answer for.
       */
      interactive: boolean;
    }>
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
