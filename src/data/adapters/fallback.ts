/**
 * The fallback adapter. Total over any JSON, and the primary case.
 *
 * C07 §5 — see spec. This is not the degraded path; it is what makes
 * commitment 3 and I11 true. A verb that ships on the far side tomorrow is
 * usable tomorrow because this file already renders it — unstyled, but legible
 * — and an adapter is the refinement that follows. Built first for that reason:
 * if this is not legible, "no adapter is required for a verb to be usable" is a
 * claim with nothing behind it.
 *
 * Three rules earn their place, and each is a thing the fallback deliberately
 * does *not* do:
 *
 *   - **It never invents structure.** A ragged array becomes a `code` block
 *     rather than a table with holes in it (T3.11), and a nested object renders
 *     as its JSON text inside a cell rather than being flattened into columns
 *     (T3.12). A wrong table is worse than an honest blob, because a table
 *     looks authoritative.
 *   - **It never throws** (I3). Every branch ends in a block, including the
 *     branches for `null`, a bare scalar, an empty array and stdout that never
 *     parsed.
 *   - **It bounds what it emits.** D40 caps blocks per document, and a 50 MB
 *     payload is *one* enormous table that the block cap never touches — so the
 *     row cap is here, where the block is made, and the truncation is stated in
 *     a notice rather than being silent (§5, T3.13).
 */

import { stripControl } from "../text.js";
import { block } from "../viewmodel/construct.js";
import type { Block, Cell, ColumnDef, TableRow } from "../viewmodel/types.js";
import type { Adapter, AdapterContext, RawResult } from "./types.js";

/**
 * §5. The column cap is by first appearance, not by frequency: first
 * appearance is the far side's own ordering, and a tool that puts its
 * identifier first is telling us something a frequency count would discard.
 */
export const MAX_COLUMNS = 8;
export const MAX_ROWS = 2_000;

/**
 * Every fallback column gets the same one, and it is deliberately not measured.
 * C07 is L0 and `cells()` is L1 — a width computed here would be a second
 * implementation of the thing C09 I6 says has exactly one (CLAUDE.md). C11
 * plans real widths from the content; this is only the floor below which a
 * column is dropped rather than squeezed.
 */
const MIN_COLUMN_WIDTH = 3;

type Json = unknown;

function isPlainObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isScalar(v: Json): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

/** A scalar as text; anything else as its JSON, which is the honest rendering. */
function textOf(v: Json): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return stripControl(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return stripControl(safeJson(v, 0));
}

/**
 * `JSON.stringify` throws on a cycle and returns `undefined` for a function or
 * a bare `undefined`. Both are reachable from a fixture or a hand-built test
 * value, and I3 says this file has no branch that throws.
 */
function safeJson(v: Json, indent: number): string {
  try {
    return JSON.stringify(v, null, indent) ?? String(v);
  } catch {
    return "[unserialisable]";
  }
}

/**
 * Uniform means *the same shape*, not merely "all objects" — T3.11 is explicit
 * that a ragged array is a `code` block. The union of keys is therefore the key
 * set, and taking it as a union rather than as the first element's is what makes
 * the check order-insensitive: `{a,b}` then `{b,a}` is one shape written twice.
 */
function uniformKeys(value: readonly Json[]): readonly string[] | null {
  if (!value.every(isPlainObject)) return null;
  if (value.length === 0) return [];

  const first = Object.keys(value[0] as Record<string, Json>);
  const expected = new Set(first);
  for (const row of value) {
    const keys = Object.keys(row as Record<string, Json>);
    if (keys.length !== expected.size) return null;
    if (!keys.every((k) => expected.has(k))) return null;
  }
  return first;
}

/** Ids are deterministic, because I1 says two identical inputs produce deeply equal documents. */
function ids(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n)}`;
  };
}

// --- the shapes -----------------------------------------------------------

function keyValueBlock(obj: Record<string, Json>, id: string): Block {
  return block({
    kind: "keyValue",
    id,
    rows: Object.entries(obj).map(([label, value]) => ({
      label: stripControl(label),
      value: textOf(value),
    })),
  });
}

function columnsFor(keys: readonly string[]): readonly ColumnDef[] {
  // Priority descends with position so C11 drops the last-appearing column
  // first (D38). The far side's ordering is the only signal available about
  // which column matters, and discarding it would be inventing a judgement.
  return keys.slice(0, MAX_COLUMNS).map((key, i) => ({
    key,
    label: stripControl(key),
    align: "left" as const,
    priority: MAX_COLUMNS - i,
    minWidth: MIN_COLUMN_WIDTH,
    sortable: true,
  }));
}

function tableBlocks(
  rows: readonly Json[],
  keys: readonly string[],
  id: string,
  nextId: () => string,
): { blocks: readonly Block[]; truncated: boolean } {
  const columns = columnsFor(keys);
  const kept = rows.slice(0, MAX_ROWS);
  const dropped = rows.length - kept.length;

  const tableRows: readonly TableRow[] = kept.map((row, i) => {
    const record = row as Record<string, Json>;
    const cells: Record<string, Cell> = {};
    for (const column of columns) cells[column.key] = { text: textOf(record[column.key]) };
    return { id: `${id}-r${String(i)}`, cells };
  });

  const table = block({
    kind: "table",
    id,
    columns,
    rows: tableRows,
    showHeader: true,
    emptyMessage: "No rows.",
  });

  if (dropped === 0) return { blocks: [table], truncated: false };

  // Named, never silent (§5). The count is what makes it actionable: a user who
  // sees 2,000 of 100,000 rows needs to know to narrow the query, and a table
  // that simply stops says nothing.
  return {
    blocks: [
      table,
      block({
        kind: "notice",
        id: nextId(),
        tone: "muted",
        text: `Showing the first ${String(MAX_ROWS)} rows; ${String(dropped)} more were not rendered.`,
      }),
    ],
    truncated: true,
  };
}

function codeBlock(value: Json, id: string): Block {
  return block({ kind: "code", id, language: "json", text: stripControl(safeJson(value, 2)) });
}

/**
 * The §5 dispatch, over a parsed value. Returns blocks rather than a document
 * so streaming can use the same table (§6): one `data` patch is one value, and
 * it must render the same way there as it does here or T4.5's convergence fails.
 *
 * `heading` is the `rule` the one-shot path wants and a stream patch does not —
 * a rule per streamed line would be a header every row.
 */
export function fallbackBlocks(
  value: Json,
  options: Readonly<{ heading: string | null; prefix: string }>,
): { blocks: readonly Block[]; truncated: boolean } {
  const nextId = ids(options.prefix);
  const head: readonly Block[] =
    options.heading === null
      ? []
      : [block({ kind: "rule", id: nextId(), label: stripControl(options.heading) })];

  // Array of uniform objects → a table. An empty array is uniform vacuously and
  // renders as an empty table rather than as nothing (T3.10): "no rows" is a
  // result, and a blank document reads as a failure.
  if (Array.isArray(value)) {
    const keys = uniformKeys(value);
    if (keys === null) return { blocks: [...head, codeBlock(value, nextId())], truncated: false };
    const table = tableBlocks(value, keys, nextId(), nextId);
    return { blocks: [...head, ...table.blocks], truncated: table.truncated };
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const tables = entries.filter(([, v]) => Array.isArray(v) && uniformKeys(v) !== null);

    // "Object containing *one* array of uniform objects" (§5). Two of them is a
    // shape with no obvious ordering, and guessing which is the subject is
    // exactly the invention this adapter does not do.
    if (tables.length === 1) {
      const [key, rows] = tables[0] as [string, readonly Json[]];
      const scalars = Object.fromEntries(entries.filter(([k]) => k !== key));
      const table = tableBlocks(rows, uniformKeys(rows) ?? [], nextId(), nextId);
      return {
        blocks: [
          ...head,
          ...(Object.keys(scalars).length > 0 ? [keyValueBlock(scalars, nextId())] : []),
          ...table.blocks,
        ],
        truncated: table.truncated,
      };
    }

    if (entries.length > 0 && entries.every(([, v]) => isScalar(v))) {
      return { blocks: [...head, keyValueBlock(value, nextId())], truncated: false };
    }
  }

  // Anything else: a bare scalar, `null`, a nested object, a ragged array
  // (T3.8, T3.9, T3.11). Pretty-printed, and honest about being unstructured.
  return { blocks: [...head, codeBlock(value, nextId())], truncated: false };
}

/**
 * The blocks for a whole result, including the two cases that are about the
 * *stream* rather than about a value: stdout that never parsed, and no stdout
 * at all.
 */
export function fallbackResultBlocks(
  raw: RawResult,
  ctx: AdapterContext,
): { blocks: readonly Block[]; truncated: boolean } {
  const nextId = ids("fb");
  const heading = ctx.verb ?? ctx.command;

  if (raw.stdout === undefined) {
    // Unparseable, and the raw text is retained by C06 precisely so this branch
    // has something to show (C06 I6). An empty one still gets a block: the
    // difference between "produced nothing" and "produced something we could
    // not read" is the whole content of this case.
    if (raw.stdoutRaw.trim() === "") {
      return {
        blocks: [
          block({
            kind: "notice",
            id: nextId(),
            tone: "muted",
            text: "Completed with no output.",
          }),
        ],
        truncated: false,
      };
    }
    return {
      blocks: [block({ kind: "raw", id: nextId(), text: stripControl(raw.stdoutRaw) })],
      truncated: false,
    };
  }

  return fallbackBlocks(raw.stdout, { heading, prefix: "fb" });
}

/**
 * I3 — total. Every call returns a valid non-empty document's worth of blocks,
 * and `meta` beyond `truncated` is the registry's (I13), so what is set here is
 * the minimum the type requires.
 */
export function createFallbackAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(raw, ctx) {
      const { blocks, truncated } = fallbackResultBlocks(raw, ctx);
      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: "ok",
        blocks,
        meta: {
          verb: ctx.verb,
          adapter: "fallback",
          exitCode: raw.exitCode ?? 0,
          durationMs: raw.durationMs,
          truncated,
          argv: raw.argv,
          stderr: raw.stderr,
          transport: ctx.transport,
          origin: ctx.origin,
        },
      };
    },
  };
}
