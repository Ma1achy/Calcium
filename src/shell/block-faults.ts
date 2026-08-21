/**
 * What C09's containments swallowed, and what the shell owes because of it
 * (C22 I69, I70 · C09 I29 · C04 I67).
 *
 * **Two jobs, and they are one object because they share the same event.** The
 * diagnostic half is what `diagnostics()` already read: a deduplicated line per
 * distinct fault, pulled rather than emitted, so C22 §8 step 3 decides when the
 * reader is told. The acting half is new — a renderer that gave way needs more
 * rows than the block measured, and the only thing that knows *which* block is
 * the sink the fault arrives at.
 *
 * **A fault names a block and the caller names the entry.** Ids are unique
 * within a document (C04 I14) and not across entries, so neither half can
 * address a block on its own. `within` is where the second half comes from, and
 * it is a scope rather than a field because the render that produces the fault
 * is one call: whoever is drawing an entry knows which one, and `BlockFault`
 * does not.
 *
 * **`rev` rides on the scope, and the sequence trace is why.** A far-side patch
 * can replace the block between the frame that observed the fault and the moment
 * the request is issued — the request is drained *after* the frame, deliberately
 * (I69) — and by then the id may address a block the far side has just built.
 * Carrying the `rev` the fault was seen at makes that case droppable instead of
 * wrong. Nothing else needs it, and termination in particular does not: a floor
 * is a field, and a field cannot repeat.
 */
import { ERROR_MIN_ROWS } from "../presentation/blocks/index.js";
import type { BlockFault } from "../presentation/blocks/index.js";

/** One block, one entry, one floor — everything `op: "reserve"` needs. */
export type ReserveRequest = Readonly<{
  entryId: string;
  /** The entry's `rev` when the fault was seen. Stale means drop it. */
  rev: number;
  blockId: string;
  rows: number;
}>;

/**
 * Which halves of a definition giving way cost rows.
 *
 * `elements` does not: it makes a block atomic for keyboard and pointer (C09
 * I30) and changes nothing about the frame, so a fault there is a diagnostic and
 * no more. The other two both end at the error box, which needs
 * `ERROR_MIN_ROWS` to say anything a reader can tell from an ordinary red line.
 */
const COSTS_ROWS: ReadonlySet<BlockFault["member"]> = new Set(["measure", "render"]);

export class BlockFaultLog {
  readonly #messages: string[] = [];
  #scope: Readonly<{ entryId: string; rev: number }> | null = null;
  /** Keyed `entryId\0blockId`, so two faults on one block are one request. */
  readonly #pending = new Map<string, ReserveRequest>();

  /** What `diagnostics()` reads (C09 I29). Deduplicated, order of first sight. */
  get messages(): readonly string[] {
    return this.#messages;
  }

  /**
   * The registry's sink. **Bound, because it is handed to `createBlockRegistry`
   * as a value** and a method reference would lose `this` at the call site —
   * which is a silent failure here, since a sink that throws is how a hidden
   * containment is caught and one that cannot be called is not.
   */
  report = (fault: BlockFault): void => {
    const text = `block ${fault.kind}.${fault.member}: ${String(fault.error)}`;
    if (!this.#messages.includes(text)) this.#messages.push(text);

    const scope = this.#scope;
    if (scope === null || !COSTS_ROWS.has(fault.member)) return;
    // Last write wins on the same block, and there is nothing to choose between:
    // the floor is a constant. What matters is that two faults on one block do
    // not become two patches and two `rev` bumps.
    this.#pending.set(`${scope.entryId}\u0000${fault.id}`, {
      entryId: scope.entryId,
      rev: scope.rev,
      blockId: fault.id,
      rows: ERROR_MIN_ROWS,
    });
  };

  /** A note that is not a block's fault — F230's trim is the first (I70). */
  note(text: string): void {
    if (!this.#messages.includes(text)) this.#messages.push(text);
  }

  /**
   * Run `fn` with faults attributed to this entry.
   *
   * **`finally`, because the render inside can throw.** A scope left set would
   * attribute the next entry's faults to this one, and the address would be
   * wrong rather than missing — which is the failure that survives a test,
   * because the request still applies and applies to something.
   */
  within<T>(entryId: string, rev: number, fn: () => T): T {
    const held = this.#scope;
    this.#scope = { entryId, rev };
    try {
      return fn();
    } finally {
      this.#scope = held;
    }
  }

  /** Everything owed since the last drain, and the log is empty after. */
  drain(): readonly ReserveRequest[] {
    if (this.#pending.size === 0) return EMPTY;
    const out = [...this.#pending.values()];
    this.#pending.clear();
    return out;
  }
}

const EMPTY: readonly ReserveRequest[] = Object.freeze([]);

/**
 * Should this request become a patch (C22 I69)?
 *
 * **A function rather than three lines inside `#render`, because one of its
 * guards is nearly unreachable from there and would otherwise be a rule with
 * nothing to be wrong about** (A03 §2). The drain happens in the same
 * synchronous block as the frame that filled it, so the far side cannot
 * ordinarily interleave — the path that reaches the stale-`rev` arm is a frame
 * that returned early, which leaves requests pending into a later frame with a
 * real window in front of it. That is a genuine path and a narrow one, so the
 * arm is asserted here where it can be constructed rather than left to a session
 * row that would pass without ever entering it.
 *
 * @param entry the entry as it is **now**, or `undefined` if it has gone
 * @param block the addressed block as it is now, or `undefined`
 */
export function reserveNeeded(
  entry: Readonly<{ rev: number }> | undefined,
  block: Readonly<{ minHeight?: number }> | undefined,
  req: ReserveRequest,
): boolean {
  // Evicted or cleared between the frame and here. C13 calls a patch for an
  // entry that has gone *ordinary, not a bug*, so this is silent.
  if (entry === undefined) return false;
  // **The far side replaced the block, and the id may now address a different
  // one.** The request was recorded against the entry as it stood; a moved `rev`
  // means the document it was about is not the document in hand.
  if (entry.rev !== req.rev) return false;
  if (block === undefined) return false;
  // **Termination, and it is the whole of it.** A floor is idempotent state, so
  // the second frame finds it set and asks for nothing. The guard is here rather
  // than in `applyPatch` because C13 bumps `rev` on any applied patch — a no-op
  // reserve reaching the store would re-render at frame rate for ever, working,
  // and looking like nothing was wrong.
  return (block.minHeight ?? 0) < req.rows;
}
