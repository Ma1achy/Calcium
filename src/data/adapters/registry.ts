/**
 * Identity → registered → fallback, and the containment around all three.
 *
 * C07 §2, §7, §8 — see spec. Two properties live here and both are about what
 * happens when something is wrong.
 *
 * **Resolution order is what makes disposability mechanical** (I2). The identity
 * path is checked first, so a far side that converges on `tui.view/1` needs no
 * code change at all: delete the adapter and the next run picks it up. Checking
 * registered adapters first would work identically until the day someone deleted
 * one, which is the day it must not surprise anyone.
 *
 * **An adapter is app code and may throw** (I4, A02 §7). It is contained, the
 * data is re-adapted through the fallback, and a *muted* notice records it —
 * muted rather than error because the command may have succeeded perfectly and
 * it is the presentation that failed. A user who still sees their data has lost
 * styling; a user who sees an error has lost the result.
 */

import { validateDocument } from "../viewmodel/validate.js";
import { block } from "../viewmodel/construct.js";
import type { Block, DocumentMeta, ViewDocument, ViewPatch } from "../viewmodel/types.js";
import { createFallbackAdapter } from "./fallback.js";
import { exitCodeOf, mapResult } from "./mapping.js";
import { createPatchAdapter } from "./stream.js";
import {
  AdapterSchemaError,
  type Adapter,
  type AdapterContext,
  type AdapterRegistry,
  type RawPatch,
  type RawResult,
  type StreamContext,
} from "./types.js";

const SCHEMA = "tui.view/1";

/** Thrown by `register` after `seal` (I8). */
export class RegistrySealedError extends Error {
  override readonly name = "RegistrySealedError";
  constructor(verb: string) {
    super(
      `cannot register an adapter for "${verb}": the registry is sealed (C07 I8) — ` +
        `late registration lets one session render the same document two ways`,
    );
  }
}

/**
 * I7 — a **startup** failure, never a runtime surprise. It is the one severity
 * in C24 §8's table that is an error rather than a warning, and deliberately:
 * every other mismatch there degrades to something renderable, while an adapter
 * built against a schema the renderer does not know produces documents that fail
 * at the moment a user runs the verb. A build that refuses is cheaper than a
 * session that breaks on the tenth command.
 */
function checkSchema(verb: string, adapter: Adapter): void {
  if (adapter.schema !== SCHEMA) {
    throw new AdapterSchemaError(
      `adapter for "${verb}" declares schema ${JSON.stringify(adapter.schema)}, ` +
        `and the renderer supports ${JSON.stringify(SCHEMA)} (C07 I7, C24 §8) — ` +
        `this fails at startup rather than on the first invocation of that verb`,
    );
  }
}

/**
 * Route 1 — stdout that is already a document. Validated rather than sniffed:
 * a payload with a `schema` field and nothing else would otherwise take the
 * identity path and render as an invalid document (I5).
 */
function identityDocument(stdout: unknown): ViewDocument | null {
  if (typeof stdout !== "object" || stdout === null) return null;
  if ((stdout as Record<string, unknown>)["schema"] !== SCHEMA) return null;
  const validity = validateDocument(stdout);
  return validity.ok ? validity.value : null;
}

/**
 * I13 — the registry owns `meta`. `resultId`, `adapter` and `truncated` are the
 * three the registry cannot know, so they are the three carried across; the rest
 * is stated from what actually ran.
 */
function authoritativeMeta(
  supplied: Partial<DocumentMeta> | undefined,
  raw: RawResult,
  ctx: AdapterContext,
  adapterName: string,
): DocumentMeta {
  const resultId = supplied?.resultId;
  return {
    verb: ctx.verb,
    adapter: supplied?.adapter ?? adapterName,
    exitCode: exitCodeOf(raw),
    durationMs: raw.durationMs,
    truncated: supplied?.truncated ?? false,
    ...(resultId === undefined ? {} : { resultId }),
    argv: raw.argv,
    stderr: raw.stderr,
    transport: ctx.transport,
    origin: ctx.origin,
  };
}

/**
 * The last resort (T3.7): the adapter threw *and* the fallback threw. Built by
 * hand from nothing but the context, because at this point nothing else in the
 * component can be trusted to produce a block.
 */
function lastResortDocument(raw: RawResult, ctx: AdapterContext, detail: string): ViewDocument {
  return {
    schema: SCHEMA,
    command: ctx.command,
    status: "error",
    error: { message: `Could not render this result: ${detail}`, code: "ADAPT_FAILED" },
    blocks: [
      {
        kind: "notice",
        id: "adapt-failed",
        tone: "error",
        glyph: "error",
        text: "Could not render this result.",
      },
    ],
    meta: authoritativeMeta(undefined, raw, ctx, "last-resort"),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A muted notice recording that an adapter failed. Muted, not error: the
 * *command* may have succeeded, and what failed is the presentation.
 */
function adapterFailureNotice(verb: string, detail: string): Block {
  return block({
    kind: "notice",
    id: "adapter-failed",
    tone: "muted",
    text: `The adapter for "${verb}" failed (${detail}); showing the default rendering.`,
  });
}

export function createAdapterRegistry(
  adapters: Readonly<Record<string, Adapter>> = {},
): AdapterRegistry {
  const registered = new Map<string, Adapter>();
  const fallback = createFallbackAdapter();
  const patches = createPatchAdapter(fallback);
  let sealed = false;

  // I7 — every adapter supplied at construction is checked now, before a
  // session exists to be surprised by one.
  for (const [verb, adapter] of Object.entries(adapters)) {
    checkSchema(verb, adapter);
    registered.set(verb, adapter);
  }

  /** I5 — the single funnel. Nothing returns a document without passing here. */
  function finish(candidate: ViewDocument, raw: RawResult, ctx: AdapterContext): ViewDocument {
    const validity = validateDocument(candidate);
    if (validity.ok) return validity.value;
    return lastResortDocument(raw, ctx, validity.error.join("; "));
  }

  /**
   * The fallback, plus the §4 mapping applied over it. Used for an unadapted
   * verb and as the recovery when a registered adapter throws — the same path
   * both times, so the recovery is not a second, less-tested rendering.
   */
  function adaptThroughFallback(
    raw: RawResult,
    ctx: AdapterContext,
    extra: readonly Block[],
    adapterName: string,
  ): ViewDocument {
    const outcome = mapResult(raw, ctx);
    const base = fallback.adapt(raw, ctx);
    const blocks = outcome.blocks ?? base.blocks;

    return finish(
      {
        schema: SCHEMA,
        command: ctx.command,
        status: outcome.status,
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
        blocks: [...blocks, ...outcome.appended, ...extra],
        meta: authoritativeMeta(base.meta, raw, ctx, adapterName),
      },
      raw,
      ctx,
    );
  }

  /**
   * §4's `--json` row (I9). Before resolution, and with no per-verb exception:
   * the user is inspecting the contract, and rendering it — however well — is
   * the one thing they asked us not to do.
   */
  function jsonDocument(raw: RawResult, ctx: AdapterContext): ViewDocument {
    const text = raw.stdout === undefined ? raw.stdoutRaw : safeStringify(raw.stdout);
    const outcome = mapResult(raw, ctx);
    return finish(
      {
        schema: SCHEMA,
        command: ctx.command,
        status: outcome.status,
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
        blocks: [block({ kind: "code", id: "json", language: "json", text })],
        meta: authoritativeMeta(undefined, raw, ctx, "json"),
      },
      raw,
      ctx,
    );
  }

  return {
    register(verb, adapter) {
      if (sealed) throw new RegistrySealedError(verb);
      checkSchema(verb, adapter);
      registered.set(verb, adapter);
    },

    seal() {
      sealed = true;
    },

    get sealed() {
      return sealed;
    },

    /** I4 — never throws. Every path below ends in `finish`. */
    adapt(raw, ctx) {
      if (ctx.userRequestedJson) return jsonDocument(raw, ctx);

      // Route 1. Identity wins even where an adapter is registered (T1.4), and
      // only on the success path: a document on stdout beside exit 1 is a far
      // side reporting a failure, and §4 decides what that means.
      if (raw.exitCode === 0 && !raw.cancelled && !raw.timedOut) {
        const identity = identityDocument(raw.stdout);
        if (identity !== null) {
          return finish(
            { ...identity, meta: authoritativeMeta(identity.meta, raw, ctx, "identity") },
            raw,
            ctx,
          );
        }
      }

      // Route 2.
      const adapter = ctx.verb === null ? undefined : registered.get(ctx.verb);
      if (adapter !== undefined) {
        try {
          const outcome = mapResult(raw, ctx);
          const produced = adapter.adapt(raw, ctx);
          // T3.5 — `undefined` is a throw. An adapter that forgot to return is
          // not a different failure from one that threw, and treating it as an
          // empty document would render a blank entry.
          if (produced === undefined || produced === null) {
            throw new TypeError("the adapter returned nothing");
          }

          const candidate: ViewDocument = {
            schema: SCHEMA,
            command: ctx.command,
            status: outcome.status === "ok" ? produced.status : outcome.status,
            ...(outcome.error === undefined ? {} : { error: outcome.error }),
            blocks: [...(outcome.blocks ?? produced.blocks), ...outcome.appended],
            meta: authoritativeMeta(produced.meta, raw, ctx, ctx.verb ?? "adapter"),
          };

          // T3.6 — a structurally invalid document is contained as a throw
          // rather than shipped. Validating here as well as in `finish` is what
          // makes the difference between "the adapter's output was rejected"
          // and "the last-resort document", and the user should see the former.
          const validity = validateDocument(candidate);
          if (!validity.ok) throw new TypeError(validity.error.join("; "));
          return validity.value;
        } catch (error) {
          return adaptThroughFallback(
            raw,
            ctx,
            [adapterFailureNotice(ctx.verb ?? "?", messageOf(error))],
            "fallback",
          );
        }
      }

      // Route 3.
      return adaptThroughFallback(raw, ctx, [], "fallback");
    },

    adaptPatch(patch: RawPatch, ctx: StreamContext): ViewPatch | null {
      const adapter = ctx.verb === null ? undefined : registered.get(ctx.verb);
      return patches.adapt(patch, ctx, adapter);
    },
  };
}

/** I3's discipline applied to the `--json` path: a cycle must not throw here either. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return "[unserialisable]";
  }
}
