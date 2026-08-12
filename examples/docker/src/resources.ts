/**
 * The resource tail — `network ls` `volume ls` `context ls` `builder ls`
 * `system df` `image history`, and the three `inspect` verbs.
 *
 * **Adapted, and the contrast with steps 9–11 is the point.** Nothing here asks
 * a question and nothing needs state across calls, so C07 renders these and the
 * registry states `meta` (C07 I13). No `metaOf` by hand, no failure arm per
 * verb, no invocation record: the ~65 lines every local family spends on
 * scaffolding are simply absent. That is F77's cost measured from the other
 * side.
 *
 * **Every field name here was read off a real invocation.** The keys are
 * capitalised and differ per verb — `network ls` has `ID`/`Name`/`Driver`/
 * `Scope`, `volume ls` has no `ID` at all and keys on `Name`, `system df`
 * reports `Type`/`TotalCount`/`Active`/`Reclaimable`. Guessing any of them from
 * the shape of another would have compiled and rendered empty cells.
 *
 * **One shared table adapter, six column sets.** The six `ls` verbs differ only
 * in their columns and their empty message, so the shape is declared once. A
 * per-verb copy is six chances for the NDJSON handling to drift, and the parse
 * is the part with the edge cases (F19's ragged-line class).
 */

import { b } from "@fmx/calcium";
import type { AdapterDocument, AdapterContext, Block, ColumnDef, RawResult, ViewDocument } from "@fmx/calcium";
import { parseNdjson, str, type Row } from "./ndjson.ts";

/** The nine `meta` fields, as F13 requires until `compose` is exported. */
const failureOf = (result: RawResult): string =>
  result.stderr.trim() || `docker exited ${String(result.exitCode)}`;

function failureDoc(result: RawResult, ctx: AdapterContext, adapter: string): AdapterDocument {
  const message = failureOf(result);
  return {
    schema: "tui.view/1",
    command: ctx.command,
    status: "error",
    // C04 I3 — required when `status` is `error`, and its absence is silent:
    // C13 throws, C23 discards, and the reader gets no entry at all (F35).
    error: { message, stage: "adapter" },
    blocks: [b.notice.error(message)],
    meta: { adapter },
  };
}

const okDoc = (
  result: RawResult,
  ctx: AdapterContext,
  adapter: string,
  blocks: readonly Block[],
): AdapterDocument => ({
  schema: "tui.view/1",
  command: ctx.command,
  status: "ok",
  blocks,
  meta: { adapter },
});

// ── the six list verbs ──────────────────────────────────────────────────────

type ListSpec = Readonly<{
  columns: readonly ColumnDef[];
  cells: (row: Row, index: number) => Record<string, string>;
  /** Frame 8: an empty result is a notice, never a table with a header and no rows. */
  empty: string;
}>;

const NETWORK_LS: ListSpec = {
  columns: [
    b.col("name", { label: "NAME", priority: 90, minWidth: 12, flex: true }),
    b.col("driver", { label: "DRIVER", priority: 70, minWidth: 8, maxWidth: 10 }),
    b.col("scope", { label: "SCOPE", priority: 50, minWidth: 6, maxWidth: 8 }),
    b.col("id", { label: "ID", priority: 30, minWidth: 12, maxWidth: 12 }),
  ],
  cells: (r) => ({
    name: str(r, "Name"),
    driver: str(r, "Driver"),
    scope: str(r, "Scope"),
    id: str(r, "ID"),
  }),
  empty: "no networks",
};

const VOLUME_LS: ListSpec = {
  // **No `ID` column, because `volume ls` has no `ID` key.** A volume is
  // identified by its name, and an anonymous volume's name is its 64-hex digest
  // — which is why NAME takes the slack here and is truncated from the start.
  columns: [
    b.col("name", { label: "NAME", priority: 90, minWidth: 14, flex: true, truncateFrom: "start" }),
    b.col("driver", { label: "DRIVER", priority: 60, minWidth: 8, maxWidth: 10 }),
    b.col("size", { label: "SIZE", priority: 40, minWidth: 6, maxWidth: 10, align: "right" }),
  ],
  cells: (r) => ({
    name: str(r, "Name"),
    driver: str(r, "Driver"),
    // `Size` is `N/A` unless `-s` was passed; docker's own word, kept.
    size: str(r, "Size") || "—",
  }),
  empty: "no volumes",
};

const CONTEXT_LS: ListSpec = {
  columns: [
    b.col("current", { label: "", priority: 95, minWidth: 1, maxWidth: 1 }),
    b.col("name", { label: "NAME", priority: 90, minWidth: 10, maxWidth: 20 }),
    b.col("endpoint", { label: "ENDPOINT", priority: 70, minWidth: 16, flex: true, truncateFrom: "start" }),
    b.col("description", { label: "DESCRIPTION", priority: 40, minWidth: 12, maxWidth: 28 }),
  ],
  cells: (r) => ({
    // `Current` is a real boolean here, unlike most of docker's JSON.
    current: r["Current"] === true ? "▸" : " ",
    name: str(r, "Name"),
    endpoint: str(r, "DockerEndpoint"),
    description: str(r, "Description"),
  }),
  empty: "no contexts",
};

const BUILDER_LS: ListSpec = {
  columns: [
    b.col("current", { label: "", priority: 95, minWidth: 1, maxWidth: 1 }),
    b.col("name", { label: "NAME", priority: 90, minWidth: 10, flex: true }),
    b.col("driver", { label: "DRIVER", priority: 60, minWidth: 8, maxWidth: 12 }),
    b.col("activity", { label: "LAST USED", priority: 40, minWidth: 10, maxWidth: 20 }),
  ],
  cells: (r) => ({
    current: r["Current"] === true ? "▸" : " ",
    name: str(r, "Name"),
    driver: str(r, "Driver"),
    // The zero time is docker's "never", and printing `0001-01-01T00:00:00Z`
    // would be the far side's placeholder rendered as data.
    activity: str(r, "LastActivity").startsWith("0001-") ? "never" : str(r, "LastActivity"),
  }),
  empty: "no builders",
};

const SYSTEM_DF: ListSpec = {
  columns: [
    b.col("type", { label: "TYPE", priority: 90, minWidth: 10, maxWidth: 14 }),
    b.col("total", { label: "TOTAL", priority: 50, minWidth: 5, maxWidth: 7, align: "right" }),
    b.col("active", { label: "ACTIVE", priority: 50, minWidth: 6, maxWidth: 7, align: "right" }),
    b.col("size", { label: "SIZE", priority: 70, minWidth: 7, maxWidth: 10, align: "right" }),
    b.col("reclaim", { label: "RECLAIMABLE", priority: 80, minWidth: 12, flex: true }),
  ],
  cells: (r) => ({
    type: str(r, "Type"),
    total: str(r, "TotalCount"),
    active: str(r, "Active"),
    size: str(r, "Size"),
    reclaim: str(r, "Reclaimable"),
  }),
  empty: "nothing on disk",
};

const IMAGE_HISTORY: ListSpec = {
  columns: [
    b.col("created", { label: "AGE", priority: 60, minWidth: 8, maxWidth: 14 }),
    b.col("size", { label: "SIZE", priority: 70, minWidth: 6, maxWidth: 10, align: "right" }),
    b.col("by", { label: "CREATED BY", priority: 90, minWidth: 20, flex: true, truncateFrom: "end" }),
  ],
  cells: (r) => ({
    created: str(r, "CreatedSince"),
    size: str(r, "Size"),
    by: str(r, "CreatedBy"),
  }),
  empty: "no layers",
};

export const LIST_SPECS: Readonly<Record<string, ListSpec>> = {
  "network ls": NETWORK_LS,
  "volume ls": VOLUME_LS,
  "context ls": CONTEXT_LS,
  "builder ls": BUILDER_LS,
  "system df": SYSTEM_DF,
  "image history": IMAGE_HISTORY,
};

export function createListAdapter(verb: string) {
  const spec = LIST_SPECS[verb]!;
  return {
    schema: "tui.view/1" as const,
    adapt(result: RawResult, ctx: AdapterContext): AdapterDocument {
      if (result.exitCode !== 0) return failureDoc(result, ctx, verb);

      const { rows, skipped } = parseNdjson(result.stdoutRaw);
      if (rows.length === 0) {
        // **Frame 8 — a notice, not an empty table.** A header with no rows
        // reads as a rendering that failed; a sentence reads as an answer.
        return okDoc(result, ctx, verb, [b.notice("dim", spec.empty)]);
      }

      const blocks: Block[] = [
        b.table({
          id: verb.replace(/\s+/gu, "-"),
          columns: spec.columns,
          rows: rows.map((r, i) => b.row(`r${String(i)}`, spec.cells(r, i))),
        }),
      ];
      if (skipped > 0) {
        blocks.push(
          b.notice.warn(`${String(skipped)} line${skipped === 1 ? "" : "s"} did not parse`),
        );
      }
      return okDoc(result, ctx, verb, blocks);
    },
  };
}

// ── the three inspect verbs ─────────────────────────────────────────────────

/**
 * `network inspect`, `volume inspect`, `image inspect`.
 *
 * **They return a JSON array, not NDJSON** — measured — which is the same shape
 * `docker inspect` returns and which `inspect.ts` already renders. This one is
 * deliberately shallow: a `code` block of the pretty JSON, because the useful
 * fields differ per resource kind and inventing a summary for each is the
 * "wrong table looks authoritative" class (C07 §5's rule for the fallback,
 * applied by hand).
 */
export function createResourceInspectAdapter(verb: string) {
  return {
    schema: "tui.view/1" as const,
    adapt(result: RawResult, ctx: AdapterContext): AdapterDocument {
      if (result.exitCode !== 0) return failureDoc(result, ctx, verb);

      const text = result.stdoutRaw.trim();
      if (text === "" || text === "[]") {
        return okDoc(result, ctx, verb, [b.notice("dim", "nothing to inspect")]);
      }

      let pretty = text;
      try {
        const parsed: unknown = JSON.parse(text);
        // The array is a container for one answer; unwrapping it is what a
        // reader expects and what `docker inspect <one>` means.
        const one = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
        pretty = JSON.stringify(one, null, 2);
      } catch {
        // Left as-is. A parse failure here is the far side changing shape, and
        // showing the bytes is more useful than a message about them.
      }

      return okDoc(result, ctx, verb, [
        b.code("json", pretty, { id: verb.replace(/\s+/gu, "-") }),
      ]);
    },
  };
}

/** Every adapter this family provides, keyed by verb — spread into `adapters`. */
export function resourceAdapters(): Record<string, ReturnType<typeof createListAdapter>> {
  const out: Record<string, ReturnType<typeof createListAdapter>> = {};
  for (const verb of Object.keys(LIST_SPECS)) out[verb] = createListAdapter(verb);
  for (const verb of ["network inspect", "volume inspect", "image inspect"]) {
    out[verb] = createResourceInspectAdapter(verb);
  }
  return out;
}
