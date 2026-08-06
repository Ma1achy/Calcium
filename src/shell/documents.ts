/**
 * Composing the documents C23 appends.
 *
 * **Every route ends in a `ViewDocument` and there is no path that ends in
 * nothing** (C23 §1, C23 I1). So the interesting thing here is not the blocks — it is
 * `meta`, which C04 I13 makes non-optional in every field that matters and which
 * C23 is the only component able to fill: it is the only one that appends, so it
 * is the only one that knows the provenance (C23 §Setting origin, C23 I22).
 *
 * `origin` has **no default in this file on purpose.** Every caller passes one.
 * A default here would be the "provenance that can be absent" C23 §3a rejects —
 * it would compile, it would be right most of the time, and the one path that
 * forgot would be indistinguishable from the ones that meant it.
 */

import { block, document } from "../data/viewmodel/index.js";
import type {
  LocalDocument,
  Block,
  DocumentMeta,
  DocumentStatus,
  ErrorLike,
  ViewDocument,
} from "../data/viewmodel/index.js";

/** C04 names these inline on `DocumentMeta`; C23 needs them by name. */
type Origin = DocumentMeta["origin"];
type Transport = DocumentMeta["transport"];

let n = 0;
/** Block ids are addressed by `ViewPatch` (C04 I14), so they must be unique. */
export function blockId(prefix: string): string {
  n += 1;
  return `${prefix}-${String(n)}`;
}

export type MetaSpec = Readonly<{
  origin: Origin;
  verb?: string | null;
  adapter?: string;
  exitCode?: number;
  durationMs?: number;
  truncated?: boolean;
  resultId?: string;
  argv?: readonly string[];
  stderr?: string;
  transport?: Transport;
}>;

/**
 * Defaults for everything except `origin`, which is the field this exists to
 * make unforgettable.
 */
export function meta(spec: MetaSpec): ViewDocument["meta"] {
  return {
    verb: spec.verb ?? null,
    adapter: spec.adapter ?? "none",
    exitCode: spec.exitCode ?? 0,
    durationMs: spec.durationMs ?? 0,
    truncated: spec.truncated ?? false,
    ...(spec.resultId === undefined ? {} : { resultId: spec.resultId }),
    argv: spec.argv ?? [],
    stderr: spec.stderr ?? "",
    transport: spec.transport ?? "local",
    origin: spec.origin,
  };
}

export type DocSpec = Readonly<{
  command: string;
  blocks: readonly Block[];
  status?: DocumentStatus;
  error?: ErrorLike;
  /**
   * **Optional since F13**, because the local route no longer supplies one:
   * `runLocal` fills every field of a local document's `meta` itself, so a
   * handler passing `origin` and `transport` here was inventing two values the
   * shell already holds. Callers that append directly — the refusal notice, the
   * error arms — still pass one, and the default below is what an empty spec
   * means rather than a value anyone chose.
   */
  meta?: MetaSpec;
}>;

export function compose(spec: DocSpec): ViewDocument {
  return document({
    schema: "tui.view/1",
    command: spec.command,
    status: spec.status ?? "ok",
    blocks: spec.blocks,
    ...(spec.error === undefined ? {} : { error: spec.error }),
    meta: meta(spec.meta ?? { origin: "user" }),
  });
}

/**
 * A local handler's answer, completed — which is what makes it a document.
 *
 * **The local route's `authoritativeMeta`** (F13). C07's registry fills seven
 * `meta` fields on the adapter route; nothing filled them here, so four handlers
 * in the reference app each carried an eleven-line helper inventing them. This
 * is that fill, named and exported for the same reason `createAdapterRegistry`
 * is: an app asserting *"every document this app produces is valid"* has no
 * other way to obtain one, and a producer the framework can test and a consumer
 * cannot is a producer whose app-side tests assert against something the user
 * never sees (C24 I19's `contextAt` argument, third instance).
 *
 * `exitCode` is derived from `status` rather than taken — the two agreed at
 * every one of the reference app's eight sites, so carrying both was two records
 * of one fact. `stderr` is empty because a local route has no far side; the
 * failure message belongs in `error.message`, where it already is. F101.
 */
export function completeLocal(
  produced: LocalDocument,
  where: Readonly<{ command: string; verb: string | null; argv: readonly string[]; durationMs: number }>,
): ViewDocument {
  return {
    ...produced,
    command: where.command,
    meta: {
      verb: where.verb,
      adapter: produced.meta?.adapter ?? "local",
      exitCode: produced.status === "error" ? 1 : 0,
      durationMs: where.durationMs,
      truncated: produced.meta?.truncated ?? false,
      ...(produced.meta?.resultId === undefined ? {} : { resultId: produced.meta.resultId }),
      argv: where.argv,
      stderr: "",
      transport: "local",
      origin: "user",
    },
  };
}

/**
 * The glyph each toned notice carries.
 *
 * **C04 I6 requires one for `warn` and `error`** — colour alone survives neither
 * 1-bit nor a colour-blind reader (A01 D29) — and `block()` throws without it. A
 * table rather than a per-call argument, because every call site would otherwise
 * choose, and the one that forgot would throw at *construction*: not a wrong
 * glyph, no document at all.
 *
 * That is how this was found. Every containment path in C23 built a `warn` or
 * `error` notice with no glyph, so every one threw inside `appendAndCommit` and
 * produced no entry — C23 I1 says every submission produces exactly one outcome,
 * and the paths that exist to guarantee it produced none.
 */
const GLYPH_OF = Object.freeze({
  muted: undefined,
  info: "info",
  warn: "warn",
  error: "error",
} as const);

/** A single-block notice. The shape most containment paths end in. */
export function noticeDoc(
  command: string,
  text: string,
  tone: "muted" | "warn" | "error" | "info",
  metaSpec: MetaSpec,
  status: DocumentStatus = "ok",
): ViewDocument {
  const glyph = GLYPH_OF[tone];
  return compose({
    command,
    status,
    blocks: [
      block({
        kind: "notice",
        id: blockId("notice"),
        tone,
        text,
        ...(glyph === undefined ? {} : { glyph }),
      }),
    ],
    meta: metaSpec,
  });
}

/**
 * An `ErrorLike` rendered as a document (§2's `error` route, §5 throughout).
 *
 * `remediation` becomes a second notice rather than being folded into the first:
 * it is the actionable half, and a reader scanning for what to do next should not
 * have to parse one sentence out of two.
 */
export function errorDoc(
  command: string,
  error: ErrorLike,
  metaSpec: MetaSpec,
): ViewDocument {
  const blocks: Block[] = [
    block({
      kind: "notice",
      id: blockId("error"),
      tone: "error",
      glyph: "error",
      text: error.message,
    }),
  ];
  if (error.remediation !== undefined) {
    blocks.push(
      block({
        kind: "notice",
        id: blockId("remediation"),
        tone: "info",
        glyph: "info",
        text: error.remediation,
      }),
    );
  }

  return compose({
    command,
    status: "error",
    blocks,
    error,
    meta: { exitCode: 1, ...metaSpec },
  });
}
