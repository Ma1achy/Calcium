/**
 * §6 — `RawPatch` to `ViewPatch`, and the one line that nearly went missing.
 *
 * **`malformed` is read twice.** Before `degraded`, a stray unparseable line
 * among good ones is noise and is dropped. After it, the `malformed` patches
 * *are* the remainder — C06 stops parsing once degradation trips (C06 §5), so
 * they are what carries the rest of the stream as text and there is no other
 * carrier. The same patch kind, read the opposite way, with only the §6 table
 * saying which reading applies.
 *
 * **The line that trips degradation arrives before the notice.** C06 classifies
 * a line and *then* tests the ratio, so the patch that pushed the stream over
 * the threshold is emitted as `malformed` immediately before `degraded`. Read by
 * arrival order alone it falls on the "dropped" side — while being the first
 * line of the remainder. One patch of lookbehind is what keeps it, and without
 * it I12 is false by exactly one line, silently, in every degraded stream.
 *
 * The fix is here rather than in C06 because reordering a landed component's
 * observable stream is the more expensive of two ways to keep the same line.
 *
 * C06's degradation is sticky (C06 I12), so a `data` patch never follows a
 * `degraded` one. This still handles the combination rather than asserting
 * against it: the mapping is total over the patch type, and a total function
 * needs no invariant to hold.
 */

import { block } from "../viewmodel/construct.js";
import { stripControl } from "../text.js";
import { fallbackBlocks } from "./fallback.js";
import { mapResult } from "./mapping.js";
import type { ViewPatch } from "../viewmodel/types.js";
import type { Adapter, RawPatch, StreamContext } from "./types.js";

/** The one raw block a degraded stream's remainder accumulates into. */
const REMAINDER_ID = "degraded-remainder";

export interface PatchAdapter {
  adapt(patch: RawPatch, ctx: StreamContext, adapter: Adapter | undefined): ViewPatch | null;
}

/**
 * Stateful, and it has to be: the §6 table is a function of the patch *and* of
 * whether `degraded` has arrived, which is history. One instance per stream.
 */
export function createPatchAdapter(): PatchAdapter {
  let degraded = false;
  /** The remainder so far, so each `malformed` line extends one block. */
  let remainder: string[] = [];
  /** The lookbehind: the last `malformed` line, held in case `degraded` is next. */
  let pending: string | null = null;

  return {
    adapt(patch, ctx, adapter) {
      // One registry outlives many streams, and degradation is per-stream: a
      // verb that degraded once must not open its next invocation already
      // degraded. `seq` is the stream's own counter, so its first patch is the
      // reset — the only signal the §3 interface carries, and enough.
      if (ctx.seq === 0) {
        degraded = false;
        remainder = [];
        pending = null;
      }

      // An adapter with `adaptPatch` owns the `data` row and nothing else. The
      // degradation rows are about the transport's own reporting, and an adapter
      // has no more to say about a stream that stopped being NDJSON than the
      // framework does.
      if (patch.kind === "data") {
        pending = null;
        if (adapter?.adaptPatch !== undefined) return adapter.adaptPatch(patch, ctx);

        // I11 — streaming works before anyone writes a stream adapter. One
        // value renders as it would in a batch, which is what makes T4.5's
        // convergence hold rather than approximately hold.
        const { blocks } = fallbackBlocks(patch.value, {
          heading: null,
          prefix: `s${String(ctx.seq)}`,
        });
        const only = blocks[0];
        if (only === undefined) return null;
        if (blocks.length === 1) return { op: "append", block: only };

        // More than one block for one patch: a `ViewPatch` appends one, so they
        // travel as a column group rather than being dropped or flattened.
        return {
          op: "append",
          block: block({
            kind: "group",
            id: `s${String(ctx.seq)}-group`,
            direction: "column",
            children: blocks,
          }),
        };
      }

      if (patch.kind === "malformed") {
        if (!degraded) {
          // Dropped — but held, because the very next patch may be `degraded`
          // and this may be the first line of the remainder.
          pending = patch.line;
          return null;
        }
        remainder.push(patch.line);
        return {
          op: "replace",
          blockId: REMAINDER_ID,
          block: block({
            kind: "raw",
            id: REMAINDER_ID,
            text: stripControl(remainder.join("\n")),
          }),
        };
      }

      if (patch.kind === "degraded") {
        degraded = true;
        // The lookbehind, spent. If the preceding patch was not `malformed` the
        // block opens empty, which is the reachable case only when degradation
        // trips on something other than the line just classified — it does not
        // today, and the mapping does not depend on that staying true.
        remainder = pending === null ? [] : [pending];
        pending = null;
        return {
          op: "append",
          block: block({
            kind: "raw",
            id: REMAINDER_ID,
            text: stripControl(remainder.join("\n")),
          }),
        };
      }

      // `end` — the status patch. The terminal blocks a document needs are the
      // one-shot path's, and C23 appends the settled document; what a stream
      // needs from here is the status it settles at (T3.18).
      pending = null;
      return { op: "status", status: mapResult(patch.result, ctx).status };
    },
  };
}

export { REMAINDER_ID };
