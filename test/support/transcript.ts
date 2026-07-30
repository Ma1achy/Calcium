/**
 * C13 fixtures.
 *
 * Deliberately thin: C13 is pure data over C04's, so the corpus that matters is
 * `test/support/blocks.ts`'s and this only shapes it into documents of a known
 * block count. A helper that invented its own blocks would be asserting against
 * a vocabulary nothing else in the suite uses.
 */

import { block, document } from "../../src/data/viewmodel/index.js";
import { doc } from "./blocks.js";
import type { Block, TableRow, ViewDocument } from "../../src/data/viewmodel/index.js";

/** A document of exactly `n` top-level blocks, none of them nested. */
export function docOf(n: number, id = "b"): ViewDocument {
  const blocks: Block[] = [];
  for (let i = 0; i < n; i += 1) {
    blocks.push(block({ kind: "raw", id: `${id}${i}`, text: `line ${i}` }));
  }
  return doc({ blocks });
}

/** A `group` of `n` children — one block by `.length`, `n + 1` by C13's count. */
export function groupOf(n: number, id = "g"): ViewDocument {
  const children: Block[] = [];
  for (let i = 0; i < n; i += 1) {
    children.push(block({ kind: "raw", id: `${id}-c${i}`, text: `child ${i}` }));
  }
  return doc({
    blocks: [block({ kind: "group", id, direction: "column", children })],
  });
}

/**
 * A table of `n` rows, each carrying `detailBlocks` blocks of `detail`.
 *
 * This is the shape that makes C13's count a tree walk rather than a leaf count:
 * rows are not blocks, but a row's `detail` is a `Block[]` (C11 I2), and D38
 * makes every row expandable when a column drops.
 */
export function tableWithDetails(n: number, detailBlocks: number, id = "t"): ViewDocument {
  const rows: TableRow[] = [];
  for (let i = 0; i < n; i += 1) {
    const detail: Block[] = [];
    for (let d = 0; d < detailBlocks; d += 1) {
      detail.push(block({ kind: "raw", id: `${id}-r${i}-d${d}`, text: `detail ${d}` }));
    }
    rows.push({
      id: `${id}-r${i}`,
      cells: { name: { text: `row ${i}` } },
      ...(detailBlocks > 0 ? { detail } : {}),
    });
  }

  return doc({
    blocks: [
      block({
        kind: "table",
        id,
        columns: [
          { key: "name", label: "Name", align: "left", priority: 1, minWidth: 4, sortable: true },
        ],
        rows,
      }),
    ],
  });
}

/**
 * A patch that appends one block, so a stream tick can cross the cap (T3.7c).
 *
 * `text` is a parameter because T4.2 compares a streamed document against a
 * one-shot one built by `docOf`, and a fixture that always writes the same text
 * makes that comparison assert less than it appears to.
 */
export function appendPatch(id: string, text = "appended"): { op: "append"; block: Block } {
  return { op: "append", block: block({ kind: "raw", id, text }) };
}

/** A document C04 refuses: an unrecognised schema is refused at the boundary (C04 I2). */
export const INVALID_DOC = Object.freeze({
  schema: "tui.view/99",
  command: "status",
  status: "ok",
  blocks: [],
  meta: {
    verb: "status",
    adapter: "passthrough",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [],
    stderr: "",
    transport: "local",
    origin: "user",
  },
}) as unknown as ViewDocument;

/** Collects changes in order, for the assertions that are about the sequence. */
export function recorder(): { changes: unknown[]; cb: (c: unknown) => void } {
  const changes: unknown[] = [];
  return { changes, cb: (c: unknown) => void changes.push(c) };
}

export { document };
