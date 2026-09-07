/**
 * `applyPatch` — pure, fallible in its type, never throwing.
 *
 * C04 §4 — see spec. Four ways a well-typed patch meets a document it does not
 * fit, each returning `{ok: false}` rather than throwing (I15):
 *
 *   - a `status` transition that would violate I3
 *   - a `merge` against a block that is not a `table`
 *   - an unknown `blockId`
 *   - a duplicate `blockId`
 *
 * It returns rather than throws because it runs on every stream tick, in the
 * render path, from a function I4 calls total. C23 §5 must handle the failure
 * either way, and only this form can be handled without a `try` around the hot
 * loop. C13 §6 keeps the previous document; C23 settles the entry with what it
 * had.
 */

import { deepFreeze } from "./construct.js";
import type {
  Block,
  ErrorLike,
  MergeRow,
  PatchResult,
  Table,
  TableRow,
  ViewDocument,
  ViewPatch,
} from "./types.js";
import { childBlocks, hasChildren } from "./tree.js";

function fail(message: string, stage: string): PatchResult {
  return { ok: false, error: Object.freeze({ message, stage, code: "patch" }) satisfies ErrorLike };
}

/**
 * Every block carrying `id`, including nested children — the same walk
 * `validateDocument` does, because `replace` and `merge` must find a block
 * wherever it lives and must see a duplicate wherever it is.
 */
function countId(blocks: readonly Block[], id: string, seen: Set<Block> = new Set()): number {
  let n = 0;
  for (const b of blocks) {
    if (seen.has(b)) continue;
    seen.add(b);
    if (b.id === id) n += 1;
    n += countId(childBlocks(b), id, seen);
  }
  return n;
}



/**
 * Rewrite one block by id, anywhere in the tree, preserving reference identity
 * everywhere the rewrite does not reach. That last part is not incidental: C14
 * caches measurement per block, so a rebuilt-but-equal subtree invalidates a
 * cache that did not need invalidating, and the viewport does work proportional
 * to the document rather than to the change.
 */
/**
 * The same block without its floor (I68).
 *
 * **Four operations produce a new block from an old one and none carries it.**
 * `replace` is wholesale and needs no help; `merge` and `expand` rebuild in
 * place, so they call this; C09's `windowSequence` drops it for the third
 * reason, that a slice is not the block. A floor is something the shell did
 * about content that has now changed, and one kept past its content is a block
 * padded under rows that are no longer the ones that failed.
 */
function withoutFloor<B extends Block>(block: B): B {
  if (block.minHeight === undefined) return block;
  const { minHeight: _dropped, ...rest } = block;
  return rest as B;
}

function rewrite(blocks: readonly Block[], id: string, f: (b: Block) => Block): readonly Block[] {
  let changed = false;
  const out = blocks.map((b) => {
    if (b.id === id) {
      changed = true;
      return f(b);
    }

    // **A `scroll` was not descended into and the patch answered `ok`** — the
    // same defect this file's next comment records against `table`, arriving a
    // second time through the kind added after it was fixed. The condition is
    // `tree.ts`'s now, so the third container kind cannot repeat it.
    if (hasChildren(b)) {
      const next = rewrite(b.children, id, f);
      if (next === b.children) return b;
      changed = true;
      return { ...b, children: next };
    }

    // A table's detail blocks are reachable too. Expanding a row reveals blocks
    // that can themselves be patched, so `replace` must descend here — an
    // earlier version returned the table unchanged while reporting a change,
    // which made a patch to a nested block a silent no-op that answered `ok`.
    if (b.kind === "table") {
      let rowsChanged = false;
      const rows = b.rows.map((row) => {
        if (row.detail === undefined) return row;
        const next = rewrite(row.detail, id, f);
        if (next === row.detail) return row;
        rowsChanged = true;
        return { ...row, detail: next };
      });
      if (!rowsChanged) return b;
      changed = true;
      return { ...b, rows };
    }

    return b;
  });
  return changed ? out : blocks;
}

/**
 * I9, I16 — view state is taken from the existing row, never from the incoming
 * one, whether or not the row is touched. `MergeRow` makes the incoming half
 * unconstructible, so this is belt to that brace: the spread cannot carry
 * `expanded` because the type has no such field, and the explicit re-attachment
 * says what the reader needs to know at the site.
 */
/**
 * `MergeRow` has no `expanded`, so this is unreachable through the type. It is
 * reached through a cast, a JSON payload, or an adapter written in JavaScript —
 * and I9 says view state is taken from the existing row *always*, not merely
 * where the compiler was watching. The type is the guard for authors; this is
 * the guard for data.
 */
function stripViewState(row: MergeRow): MergeRow {
  if (!("expanded" in row)) return row;
  const { expanded: _discarded, ...rest } = row as MergeRow & { expanded?: boolean };
  return rest;
}

function mergeRows(existing: readonly TableRow[], incoming: readonly MergeRow[]): readonly TableRow[] {
  if (incoming.length === 0) return existing;

  // Indexed both ways rather than scanned. A `--watch` tick against a large
  // table is the hot path this operation exists for, and a nested scan would
  // make it quadratic in exactly the case it was meant to make cheap (T3.14).
  const updates = new Map(incoming.map((r) => [r.id, r]));
  const present = new Set(existing.map((r) => r.id));

  const out = existing.map((row) => {
    const update = updates.get(row.id);
    if (update === undefined) return row; // untouched: reference-identical (T1.6)
    return deepFreeze({
      ...stripViewState(update),
      ...(row.expanded === undefined ? {} : { expanded: row.expanded }),
    }) as TableRow;
  });

  // New rows append in payload order, after the existing ones. Two merges in
  // sequence therefore accumulate predictably (§4, T1.13).
  const added = incoming
    .filter((r) => !present.has(r.id))
    .map((r) => deepFreeze(stripViewState(r)) as TableRow);

  return added.length === 0 ? out : [...out, ...added];
}

/**
 * §4 — `merge` never deletes. A row absent from the payload is untouched, not
 * removed: absence from one tick is not evidence of absence, and a watch tick
 * returning fewer rows because a query timed out must not silently drop them.
 * Deletion goes through `replace`, and the adapter is the layer that knows
 * which it means.
 */
export function applyPatch(doc: ViewDocument, patch: ViewPatch): PatchResult {
  switch (patch.op) {
    case "append": {
      if (countId(doc.blocks, patch.block.id) > 0) {
        return fail(
          `append: id "${patch.block.id}" is already in the document (C04 I14) — ` +
            `ViewPatch addresses blocks by id, so a duplicate has no correct target`,
          "append",
        );
      }
      return { ok: true, doc: deepFreeze({ ...doc, blocks: [...doc.blocks, patch.block] }) };
    }

    case "replace": {
      const n = countId(doc.blocks, patch.blockId);
      if (n === 0) return fail(unknownId(patch.blockId, "replace"), "replace");
      if (n > 1) return fail(duplicateId(patch.blockId), "replace");

      // Wholesale (§4). View state in the outgoing block is not carried over —
      // the block is now a different block. Carrying it would leave `replace`
      // and `merge` differing only in deletion semantics, and would let an
      // expansion survive onto a row that happens to share an id with
      // something semantically different.
      const blocks = rewrite(doc.blocks, patch.blockId, () => patch.block);
      return { ok: true, doc: deepFreeze({ ...doc, blocks }) };
    }

    case "merge": {
      const n = countId(doc.blocks, patch.blockId);
      if (n === 0) return fail(unknownId(patch.blockId, "merge"), "merge");
      if (n > 1) return fail(duplicateId(patch.blockId), "merge");

      let wrongKind: string | null = null;
      const blocks = rewrite(doc.blocks, patch.blockId, (b) => {
        if (b.kind !== "table") {
          wrongKind = b.kind;
          return b;
        }
        const table = b satisfies Table;
        // I68 — the rows are not the rows the floor was raised for.
        return withoutFloor({ ...table, rows: mergeRows(table.rows, patch.rows) });
      });

      if (wrongKind !== null) {
        return fail(
          `merge: block "${patch.blockId}" is a "${String(wrongKind)}", not a table — ` +
            `the rows have nowhere to go, and discarding them loses a --watch tick`,
          "merge",
        );
      }
      return { ok: true, doc: deepFreeze({ ...doc, blocks }) };
    }

    case "expand": {
      // View state, so it neither validates against I3 nor touches `error`. It
      // fails only when it names nothing: a target that does not exist is a
      // caller bug, and silently succeeding is what makes an action that did
      // nothing indistinguishable from one that worked.
      const target = doc.blocks.find((b) => b.id === patch.blockId);
      if (target === undefined) {
        return fail(`expand: no block "${patch.blockId}" in the document`, "expand");
      }
      if (target.kind !== "table") {
        return fail(`expand: block "${patch.blockId}" is a ${target.kind}, which has no rows`, "expand");
      }
      if (!target.rows.some((r) => r.id === patch.rowId)) {
        return fail(`expand: no row "${patch.rowId}" in block "${patch.blockId}"`, "expand");
      }

      return {
        ok: true,
        doc: deepFreeze({
          ...doc,
          blocks: doc.blocks.map((b) =>
            b.id === patch.blockId && b.kind === "table"
              ? // I68 — an expansion changes the rows, so the height that failed
                // is not the height now.
                withoutFloor({
                  ...b,
                  rows: b.rows.map((r) =>
                    r.id === patch.rowId ? { ...r, expanded: patch.expanded } : r,
                  ),
                })
              : b,
          ),
        }),
      };
    }

    case "reserve": {
      // View state, like `expand` beside it, so it neither validates against I3
      // nor touches `error`. Through `rewrite` rather than a top-level scan, so
      // a block inside a `panel` or a `scroll` can be floored — the containment
      // that raised it descends, and a request that could not reach half the
      // tree would fail exactly where a container is what broke.
      const n = countId(doc.blocks, patch.blockId);
      if (n === 0) return fail(unknownId(patch.blockId, "reserve"), "reserve");
      if (n > 1) return fail(duplicateId(patch.blockId), "reserve");

      // **A floor is rows, so it is a non-negative integer**, and a caller
      // asking for a fractional or negative one is stating something the
      // measurer cannot honour. Refused rather than clamped: clamping makes a
      // caller's mistake indistinguishable from a caller's intent.
      if (!Number.isInteger(patch.rows) || patch.rows < 0) {
        return fail(
          `reserve: "rows" must be a non-negative integer (C04 I67) — got ${String(patch.rows)}`,
          "reserve",
        );
      }

      // **The maximum, never the assignment.** Two blocks can be floored on one
      // frame and the second must not lower the first, and a caller re-stating a
      // floor it already holds must produce the same document — which is what
      // makes the shell's guard a guard rather than a race.
      const blocks = rewrite(doc.blocks, patch.blockId, (b) =>
        Math.max(b.minHeight ?? 0, patch.rows) === (b.minHeight ?? 0)
          ? b
          : { ...b, minHeight: patch.rows },
      );
      return { ok: true, doc: deepFreeze({ ...doc, blocks }) };
    }

    case "status": {
      // I3 — `error` is present iff status is "error". A status patch is the
      // one operation that can construct an I3-violating document out of two
      // individually valid values, which is why applyPatch is fallible at all.
      if (patch.status === "error" && doc.error === undefined) {
        return fail(
          `status: cannot move to "error" — the document carries no \`error\` (C04 I3). ` +
            `Replace the document, or patch it with one.`,
          "status",
        );
      }
      if (patch.status !== "error" && doc.error !== undefined) {
        return fail(
          `status: cannot move to "${patch.status}" while an \`error\` is present (C04 I3)`,
          "status",
        );
      }
      return { ok: true, doc: deepFreeze({ ...doc, status: patch.status }) };
    }
  }
}

function unknownId(id: string, op: string): string {
  return (
    `${op}: no block with id "${id}" — the caller is addressing something that is not ` +
    `there, which is a bug worth surfacing rather than absorbing`
  );
}

function duplicateId(id: string): string {
  return (
    `id "${id}" appears more than once in the document (C04 I14) — ` +
    `there is no correct block to act on`
  );
}
