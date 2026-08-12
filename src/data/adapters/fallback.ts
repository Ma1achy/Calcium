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
 * The floor below which a column is dropped rather than squeezed.
 *
 * A column narrower than this shows nothing a reader can use, so it is the width
 * even an empty column asks for.
 */
const MIN_COLUMN_WIDTH = 3;

/**
 * The ceiling on a measured `minWidth` (§5).
 *
 * The one judgement in this file. Without it a single 200-character field forces
 * every other column out by priority, which is the failure mode of asking for
 * what you need. 24 cells holds a URL fragment, a timestamp or an image tag;
 * beyond that, truncation is the honest answer and C11 marks it.
 */
const MAX_COLUMN_WIDTH = 24;

/**
 * The width a column asks for: its widest value, or its label, whichever is
 * longer.
 *
 * **Measured rather than defaulted** (§5). A uniform minimum was not a
 * conservative default but a discarding of information already in hand — every
 * row is here — and the cost was a dead mechanism rather than narrow columns:
 * nothing dropped, so no row was expandable, so D38's guarantee that a shed
 * column stays reachable held only because nothing was ever shed.
 *
 * The label counts, because a column narrower than its own header is unreadable
 * whatever its values.
 *
 * **This is a code-unit count and not a display width.** `cells()` is L1 and C09
 * I6 says display width has exactly one implementation; a second one here would
 * be that rule broken in the component least able to notice. So this is an ask,
 * not a measurement of the frame: C11 plans the real widths from the content, and
 * for the CJK and emoji cases this under-asks, which truncates a cell rather than
 * misplacing a column.
 */
function askedWidth(key: string, rows: readonly Json[]): number {
  let widest = stripControl(key).length;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const text = textOf(row[key]);
    if (text.length > widest) widest = text.length;
  }
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, widest));
}

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

/**
 * The marker column, declared unconditionally (§5).
 *
 * C11 draws the expand marker only into a column that declares the rôle and will
 * not synthesise one (C11 I15), so for a generated table the producer has to —
 * otherwise the fields that drop at a narrow width are reachable with nothing on
 * screen saying so.
 *
 * **Outside `MAX_COLUMNS`.** The cap bounds fields; a marker is not a field, and
 * charging the affordance a field would hide data to reveal that data is hidden.
 *
 * Unconditional, because a column set is built once and the width is not known
 * here. Per-row blankness is C11's — a row that cannot be opened draws nothing.
 */
const EXPAND_COLUMN: ColumnDef = Object.freeze({
  key: "",
  label: "",
  align: "left" as const,
  priority: Number.MAX_SAFE_INTEGER,
  minWidth: 1,
  sortable: false,
  role: "expand" as const,
});

function columnsFor(keys: readonly string[], rows: readonly Json[]): readonly ColumnDef[] {
  // Priority descends with position so C11 drops the last-appearing column
  // first (D38). The far side's ordering is the only signal available about
  // which column matters, and discarding it would be inventing a judgement.
  //
  // No column is `flex`, and that is a decision rather than an omission (§5):
  // with widths measured from the content, a table narrower than the terminal is
  // correct, because every column already has what it asked for. C11 §3 step 8
  // leaves the residual unused for the same reason.
  const fields = keys.slice(0, MAX_COLUMNS).map((key, i) => ({
    key,
    label: stripControl(key),
    align: "left" as const,
    priority: MAX_COLUMNS - i,
    minWidth: askedWidth(key, rows),
    sortable: true,
  }));

  // The marker leads, and its priority is the highest there is: C11 never drops
  // the highest-priority column (I3), so the affordance survives every width at
  // which the table renders at all.
  return [EXPAND_COLUMN, ...fields];
}

function tableBlocks(
  rows: readonly Json[],
  keys: readonly string[],
  id: string,
  nextId: () => string,
): { blocks: readonly Block[]; truncated: boolean } {
  const kept = rows.slice(0, MAX_ROWS);
  // Measured over the rows that are *kept*, so a column's width is the width of
  // what the table actually shows. Measuring the truncated tail would size a
  // column for a value no reader ever sees.
  const columns = columnsFor(keys, kept);
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
        // **Two of nine survive F58b's narrowing.** The registry fills `verb`,
        // `exitCode`, `durationMs`, `argv`, `stderr`, `transport` and `origin`
        // from the raw result and the context on every route — so the seven this
        // used to compute were discarded, including an `exitCode: raw.exitCode
        // ?? 0` that never reached a document. The framework's own fallback was
        // writing them, which is why every adapter written against it did too.
        meta: { adapter: "fallback", truncated },
      };
    },
  };
}
