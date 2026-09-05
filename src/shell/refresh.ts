/**
 * C23 §3b — time-driven updates. Three mechanisms, two that patch and one that
 * appends.
 *
 * Adapters are pure and read no clock (C07 I1); C15's layout is pure (C15 I5).
 * **Anything periodic is therefore C23's, on C22's injected clock** (C23 I19).
 *
 * The three, and what separates them:
 *
 *   - **Stall detection** patches a streaming entry that has gone quiet.
 *   - **Part refresh** patches a layer on a declared interval.
 *   - **The identity notice** *appends*, on a signal from C22's identity loop.
 *
 * The third is the one that had to be found rather than written. C23 §3a's
 * `origin` table listed `refresh` against the first two — and neither of them
 * appends, while `meta.origin` is a field on an appended document. So the value
 * read as reserved and was unreachable: A03 §2's vacuity class in a field rather
 * than in a rule. **This is the cell it was reserved for**, which is why its test
 * asserts the origin and not merely that a notice appeared.
 *
 * All three stop once `session.stopping` is set (C23 I12, §8b B1). I12 governs
 * *submissions* and none of these is one, so without that the rule covers
 * submissions while its reason claims everything — and an identity notice lands
 * in a transcript being torn down.
 */

import { block, hasChildren } from "../data/viewmodel/index.js";
import type { Block, ErrorLike, Panel, Status } from "../data/viewmodel/index.js";
import { countdown, elapsed } from "../presentation/blocks/index.js";
import { b, framedStatus } from "./builders/index.js";
import type { ProducerContext } from "../data/adapters/types.js";
import type { EntryId, TranscriptStore } from "../viewport/transcript/index.js";

/** C23 §3b — a stream silent for this long gets a notice, never an error (C23 I25). */
export const STALL_MS = 120_000;

/** C23 §3b — a failing refresh doubles from its interval to here (C23 I21). */
export const BACKOFF_CAP_MS = 300_000;

/** The block id a stall notice always uses, so it can be found and removed. */
const STALL_BLOCK = "stall-notice";

export type ViewRefresh = Readonly<{
  /** Which part — never which host. The host is `declare`'s argument (C23 I32). */
  id: string;
  /** The panel's title, and where every state is said (C23 I34, I35). */
  title: string;
  /** `0` → one-shot: rendered once, never retried (A02 §7 rule 3). */
  intervalMs: number;
  staleAfterMs: number;
  /**
   * The declared key two parts share, or `null` for a part that is its own
   * source (C23 I42).
   *
   * **A key rather than a function, because functions cannot be compared.**
   * Sharing needs a claim of sameness and there is nothing else to make it out
   * of; the key *is* that claim, and the framework takes it. What it buys is the
   * thing F91 was filed on — two parts of one document cannot hold two samples
   * of one instant, because there is one sample (C23 I44).
   *
   * `null` is not a second case. Every part has a source; this field only says
   * when two parts' sources are the same one, so the unshared arm is the
   * degenerate one rather than a branch that could be removed.
   */
  source: string | null;
  /**
   * A fold over the source's versions, run once per version and shared by key
   * (C23 I47). Its result reaches `render` in the fetched data's place.
   *
   * **Not a convenience beside `source` — what makes `source` usable.** A ring
   * buffer maintained inside `fetch` is the shape §3c's rule forbids, and it is
   * what the reference app did: one part's fetch accumulated and its sibling's
   * did not, so sharing the fetch between them would have stopped the ring
   * silently. A source layer without this has no consumer in the app F91 names.
   */
  derive: Readonly<{ key: string; compute: (data: unknown, prev: unknown) => unknown }> | null;
  fetch: () => Promise<unknown>;
  /**
   * Separate from `fetch`, and that is A02 §7 rule 2 rather than tidiness.
   *
   * A rejecting `fetch` is transient and retries; a throwing `render` is
   * deterministic — same data, same throw — and does not. Composed into one
   * thunk the driver cannot tell which happened, and the rule stays written
   * down with nothing implementing it.
   */
  /**
   * The producer context arrives per tick (C07 §3a C, C24 §5). Built at the
   * call by C23, never captured: a live part renders repeatedly, and a context
   * held from when the document was made is stale by the first resize.
   */
  render: (data: unknown, ctx: ProducerContext) => Block;
  /**
   * The declarer's own failure render, or `null` when the framework's is in
   * place (C23 I51, I52, C24 §5).
   *
   * **`null` rather than a resolved default, and the bit is the reason** (F407).
   * `partOf` used to write `spec.renderError ?? (…)`, which is the same
   * resolution `renderLoading` deliberately does *not* do — and it consumed the
   * one thing the countdown sweep needs: **whose block is in the panel.** A part
   * that declared one owns its rendering, and this driver rewriting `retryInMs`
   * into it once a second would be *behaviour is fixed, rendering is overridable*
   * reaching past its own boundary.
   *
   * **A `status` at `retrying` is not a sufficient test**, on `renderLoading`'s
   * own argument: a consumer's override may return exactly that shape, and then
   * the two cases are identical from here.
   *
   * **It also collapses a residue C24 §5 records.** The framework's two defaults
   * lived one in `builders/index.ts` and one in `execution.ts`; the note there
   * calls moving them into this file *tidier, and not what was asked for*. The
   * countdown asked for it.
   */
  renderError: ((err: ErrorLike, retryInMs: number | null, attempt: number) => Block) | null;
  /**
   * The declarer's own loading render, or `null` when the framework's is in
   * place (C23 I52, C24 §5).
   *
   * **The driver never calls it** — `b.live` resolves the placeholder at
   * construction, because the first block exists before this driver runs, which
   * is why there is no `renderLoading` in the flow above. What it needs is the
   * one bit that resolution consumed: **whose block is in the panel.** A part
   * that declared one owns its rendering, and the elapsed counter writing
   * `elapsedMs` into it would be *behaviour is fixed, rendering is overridable*
   * reaching past its own boundary.
   *
   * **A `status` at `loading` is not a sufficient test**, which is why this is a
   * field and not an inspection: a consumer's `renderLoading` may return exactly
   * that shape, and then the two cases are identical from here.
   *
   * `null` rather than absent, on the same argument as `source` and `derive`:
   * this shape is total where the declaration's is optional.
   */
  renderLoading: (() => Block) | null;
}>;

/**
 * What a set of parts is registered against (C23 I32).
 *
 * On the registration rather than on the part: a host field per part would admit
 * one declaration spanning two hosts — a set nothing can release as a unit,
 * staggered across members with no shared lifetime — and `release(host)` is what
 * makes I33's five triggers one call rather than five sites agreeing.
 */
export type RefreshHost =
  | Readonly<{ kind: "entry"; id: EntryId }>
  | Readonly<{ kind: "view"; id: string }>;

/** The key a host is held under. Two kinds share one map; the kind disambiguates. */
const keyOf = (host: RefreshHost): string => `${host.kind}:${String(host.id)}`;

/**
 * The separator inside a composed key. Written as an escape and never as the
 * character: SS43 exists because a literal NUL is a byte a reviewer cannot see,
 * so the value is right and the spelling is invisible.
 */
const SEP = "\u0000";

/** C23 I34 — a part is one block, and the block is a `panel`. */
/**
 * How often the elapsed counter is considered, in milliseconds (C23 I52).
 *
 * **One second, and it is the figure's granularity rather than a chosen rate.**
 * `elapsed()` is a whole number of seconds, so a faster tick can only produce
 * writes the guard below discards, and a slower one makes the box lie. The
 * *cost* of the rate is not what fixes it: measured, a 1 Hz write beside its own
 * spinner is **0.4 frames a second**, because C03 folds six writes in ten into a
 * frame it had already scheduled (F234).
 */
const ELAPSED_TICK_MS = 1000;

/**
 * Whether writing this elapsed value would change what the box draws.
 *
 * **Extracted, and not because it is complicated.** Both arms are nearly
 * unreachable from the sweep that calls it — the first needs a block that is not
 * a loading `status`, which the caller has just checked, and the second needs a
 * tick landing inside the same second as the last write, which fake timers make
 * awkward to construct from outside. A guard whose arms cannot be reached from
 * its call site is a guard nothing can be wrong about (A03 §2), which is the
 * same argument `reserveNeeded` was extracted on.
 *
 * **The comparison is on the rendered figure and never on the clock.** Below one
 * second `elapsed()` draws nothing, and past ninety-nine it draws minutes — so
 * *the clock moved* and *the box would change* are different questions, and only
 * the second one justifies a `rev` bump. A write that changes nothing observable
 * still invalidates C14's height cache and tells the transcript a document
 * changed when it did not (C23 I52).
 */
export function elapsedNeeded(shown: Block | null, ms: number): boolean {
  if (shown === null || shown.kind !== "status" || shown.state !== "loading") return false;
  return elapsed(ms) !== elapsed((shown as Status).elapsedMs ?? 0);
}

/**
 * Whether rewriting this countdown would change what the box draws (F407).
 *
 * **`elapsedNeeded`'s sibling, and the defect was that it did not exist.**
 * `retryInMs` was written once, at the failure, and the box then held that number
 * for the whole backoff and jumped — measured over 26 seconds of `/faults`:
 * `retrying in 12s` for a dozen frames, then `24s`. Every ingredient was already
 * here — the driver knows `dueAt`, the sweep runs, the field is a field — and
 * nothing joined them, because the sweep's only arm asked for `loading`.
 *
 * **The comparison is on the rendered figure and never on the clock**, on the
 * same argument: `countdown` rounds, so 11 600 ms and 11 400 ms are two clocks
 * and one figure, and only a changed figure justifies a `rev` bump.
 *
 * **Negative is not clamped here.** A source overdue by a second would draw
 * `retrying in 0s` and then `-1s`; the caller stops at zero, because a countdown
 * that has run out is waiting on the fetch rather than on the clock.
 */
export function retryNeeded(shown: Block | null, remainingMs: number): boolean {
  if (shown === null || shown.kind !== "status" || shown.state !== "retrying") return false;
  const held = (shown as Status).retryInMs;
  return held !== undefined && countdown(remainingMs) !== countdown(held);
}

/**
 * The failure box the framework draws when a declarer supplied none.
 *
 * **One default, in the driver that owns the behaviour** (C24 §5, F407). It was
 * resolved in `execution.ts` at declaration, which spent the bit this file needs
 * to know whose block it may rewrite; the note in C24 §5 already called moving it
 * here the tidier shape.
 */
const defaultErrorBlock = (
  id: string,
): ((err: ErrorLike, retryInMs: number | null, attempt: number) => Block) =>
  (err, retryInMs, attempt) => framedStatus(err, retryInMs, attempt, true, { id: `${id}-error` });

export function livePanel(id: string, title: string, child: Block): Panel {
  // `live` is what makes the panel say so (C04 I39, F18). Two surfaces draw the
  // `▌` rail and the slot existed unreachable: this is the only place in the
  // tree that knows a region refreshes, so it is the only place that can name it.
  return block({ kind: "panel", id, title, live: true, children: [child] } as Panel);
}

/**
 * C23 I20 — no two things that poll fire in the same tick.
 *
 * Spread across the *smallest* interval rather than each one's own, because two
 * at 30 s and 300 s collide every tenth tick if each is staggered within its own
 * period. The smallest is the only window every one of them shares.
 *
 * Synchronised refreshes produce a periodic load spike and a whole-screen
 * flicker; staggering costs nothing.
 *
 * **What is staggered is now the source rather than the part** (C23 §3c). Two
 * things follow, and the second was a gap I20 read as covering. There are fewer
 * things to spread, and parts sharing a source are aligned by construction
 * rather than by arithmetic. And the set is session-wide: this used to be called
 * per `declare(host, parts)`, so two hosts declaring parts were not staggered
 * against each other at all — I20 was satisfied per call and read as satisfied
 * per session.
 */
export function assignOffsets<T extends { readonly intervalMs: number }>(
  items: readonly T[],
): (T & { offsetMs: number })[] {
  if (items.length === 0) return [];
  const smallest = Math.min(...items.map((p) => p.intervalMs));
  const step = Math.floor(smallest / items.length);
  return items.map((p, i) => ({ ...p, offsetMs: step * i }));
}

/**
 * The backoff of A02 §7's one rule, and C23 is its only implementation.
 *
 * Doubling from the interval to a five-minute cap; recovery resets it. Returned
 * as a function rather than held in the driver so the arithmetic is testable
 * without a clock — the thing that goes wrong here is off-by-one doubling, and
 * that is visible in a table and invisible in a running session.
 */
export function backoffOf(intervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures === 0) return intervalMs;
  return Math.min(intervalMs * 2 ** consecutiveFailures, BACKOFF_CAP_MS);
}

export type RefreshDeps = Readonly<{
  transcript: TranscriptStore;
  clock: () => number;
  schedule: (fn: () => void, ms: number) => Disposable;
  commit: (reason: "stream" | "input") => void;
  /**
   * The producer context, per tick (C07 §3a C). C23 owns the one builder; a
   * second construction here is the two-records defect the grant exists to
   * close, reproduced inside the framework.
   */
  producerContext: () => ProducerContext;
  /** Appends a document. The identity notice is the only §3b path that does. */
  append: (text: string) => void;
  stopping: () => boolean;
  /**
   * Replaces a part's block on a pushed view (C15 §2's `update`).
   *
   * A second seam because the two hosts are different components: a transcript
   * entry is patched through C13 and a layer through C15, and C23 §3b commits
   * that both are driven by *the same code*, not that they are the same store.
   * Returns whether the layer was still there.
   */
  updateView: (id: string, blockId: string, next: Block) => boolean;
  /** The block a pushed view currently shows for a part, so staleness can retitle. */
  /**
   * The part's **panel** as the view currently holds it (F22).
   *
   * It returned the panel's child, so `currentPanel` had to rebuild the panel
   * through `livePanel` — which sets no `gapBefore`, making `existing?.gapBefore
   * === true` structurally false on this arm and only this arm. The entry arm
   * reads the real block and carries the gap; C24 I12 says `b.live` behaves
   * identically in a transcript entry and in a pushed view, and here it could
   * not. Returning the panel makes both arms one code path with one answer.
   */
  viewPanel: (id: string, blockId: string) => Panel | null;
  /**
   * Whether anyone is looking at this host (C23 I46).
   *
   * **Injected rather than read, because L4 orchestrates.** The answer is C14's
   * for an entry and C15's for a layer, and a driver reaching into two stores to
   * decide when to poll is the seam C22 exists to hold. It is also what keeps
   * this file's only `viewport/` import a type.
   *
   * **Granularity is the host and that is a stated limit.** C14 answers which
   * *entries* are visible and nothing gives per-block offsets, so a part inside a
   * partly-visible entry counts as visible; a pushed view is visible while its
   * layer exists, so the pause reaches transcript-hosted parts and not a
   * drill-in. An unrecorded limit reads as strength.
   */
  visible: (host: RefreshHost) => boolean;
}>;

export interface RefreshDriver {
  /** A patch landed on `id`; any stall notice it carries is now false. */
  sawPatch(id: EntryId): void;
  /** Called when an entry starts streaming, so it can be watched for silence. */
  watch(id: EntryId): void;
  /** C23 §8a A4 — settlement removes a stall notice that is present. */
  settled(id: EntryId): void;
  /**
   * C23 I53 — a pending entry's elapsed readout rides the one-second wake.
   *
   * `render` is given the milliseconds since registration and returns the
   * block that replaces `blockId`. The driver compares `elapsed()` of that
   * figure with the one last written and patches only when the string moves
   * (I52's guard), only while someone is looking (I46), and never after
   * `settled`, `release`, `dispose` or a patch the transcript refuses. One
   * timer serves every readout — `armParts`'s — so ten cards cost what one does.
   *
   * **No producer in `src/` yet.** `toolCallDoc`'s callers are a contract test
   * and nothing else; the pending-entry route an agent harness would append
   * through (`AGENT_TUI_DESIGN.md` §9c) is the consumer named for this, and the
   * call it makes is written in C23 §3d-bis.
   */
  readout(id: EntryId, blockId: string, render: (elapsedMs: number) => Block): void;
  /** C22's identity loop signalling a transition worth saying out loud. */
  identityNotice(text: string): void;
  /**
   * Register a host's parts. Offsets are assigned here, never by the declarer
   * (C23 I20), and a second `declare` for one host replaces the first.
   */
  declare(host: RefreshHost, parts: readonly ViewRefresh[]): void;
  /**
   * Something moved on screen, so what is visible may have changed (C23 I46).
   *
   * **Heard rather than polled**, which is I33's disposition for eviction one
   * level down. The alternative is a coarse timer re-checking visibility, which
   * would make the resume latency a constant nobody chose and would keep a timer
   * alive for a session with nothing to do.
   */
  visibilityChanged(): void;
  /**
   * The **only** teardown path (C23 I32). Every one of I33's five triggers ends
   * here, so the set is one call rather than five sites agreeing by inspection.
   */
  release(host: RefreshHost): void;
  dispose(): void;
}

export function createRefreshDriver(deps: RefreshDeps): RefreshDriver {
  /**
   * Last patch time per streaming entry, whether it is currently stalled, and
   * **whether the entry has ever carried the notice block**.
   *
   * The third field is not bookkeeping. The notice is one block with a fixed id,
   * and resumption *replaces* it rather than removing it (§8a A4) — so from the
   * second silence onward the id is already taken, and an `append` is refused by
   * C04 I14's uniqueness rule. Reported as `stalled` alone, a stream that went
   * quiet, spoke, and went quiet again would be told once and then silently
   * never again. Only reachable at all once the timer re-arms, which is why it
   * arrived with T1.30 and not before.
   */
  const watched = new Map<
    EntryId,
    { last: number; stalled: boolean; stalledAt: number; hasNotice: boolean }
  >();
  const timers: Disposable[] = [];

  /**
   * **Replaced, never removed** (C23 §3b, §8a A4).
   *
   * `ViewPatch` has no delete and should not: a transcript is a record, C13's
   * only removal path is the cap and it leaves a marker, and a patch that made a
   * block vanish would leave a document whose earlier state cannot be
   * reconstructed from its own history — `rev` is a counter, not a log.
   *
   * Removal was never what this wanted anyway. The notice said *this stream has
   * gone quiet*; then the stream spoke, or ended. Either way the thing it
   * describes still exists and its state changed, which is `replace`.
   *
   * The row is spent and it says something true. A zero-height replacement is
   * not available and should not be — C09's floor is one row for any block that
   * is present, which is the constraint that keeps measurement honest.
   */
  const resolveStall = (id: EntryId): void => {
    const state = watched.get(id);
    if (state === undefined || !state.stalled) return;
    state.stalled = false;

    const gap = Math.max(1, Math.round((deps.clock() - state.stalledAt) / 60_000));
    deps.transcript.patch(
      id,
      {
        op: "replace",
        blockId: STALL_BLOCK,
        block: b.notice("muted", `resumed after ${String(gap)}m`, undefined, { id: STALL_BLOCK }),
      },
      "shell",
    );
  };


  // --- part refresh (C23 I32–I35) --------------------------------------------

  /**
   * One declared part, plus everything the driver knows about it that the
   * declaration does not.
   *
   * **What is not here any more is the schedule.** `dueAt`, `failures` and
   * `inFlight` belong to the thing that polls, and after C23 §3c that is the
   * source. What stays is what is genuinely per instance: `lastOk` is what
   * staleness is measured from, and `null` until the first success — a part that
   * has never succeeded is *loading*, not stale, and saying `· 0s ago` about data
   * that never arrived is the one reading worse than saying nothing.
   */
  type Part = {
    readonly spec: ViewRefresh;
    readonly host: RefreshHost;
    readonly source: Source;
    /**
     * When this part's box first appeared, for the elapsed counter (C23 I52).
     *
     * **The part's and not the source's.** Two parts can join one shared fetch
     * at different moments — `runSource` renders *every part referring when it
     * resolves*, including one declared while it was in flight (I44) — and the
     * reader of the second box has been waiting since the second box appeared,
     * not since the first did.
     */
    readonly startedAt: number;
    lastOk: number | null;
    stale: boolean;
  };

  /**
   * One thing that polls, and everything sharing its key polls with it (C23 §3c).
   *
   * `parts` is the referring set rather than a count, because C23 I44 renders
   * *every part referring at the moment the fetch resolves* — including one
   * declared while it was in flight, which a count could not reach.
   *
   * `folds` is I47's memo: one entry per derivation key, holding the version it
   * was computed at and the value. **`prev` is read from the same entry
   * regardless of version**, which is what makes it a fold rather than a cache —
   * a stale entry is the previous accumulation and is exactly what `compute`
   * wants as its second argument.
   *
   * `retired` exists because retirement is the sweep's rather than `release`'s
   * (C23 I45): a fetch can be in flight when the last referrer goes, and its
   * resolution has to know it has nowhere to land.
   */
  type Source = {
    readonly key: string;
    readonly intervalMs: number;
    /** The part id that fixed the cadence, so a conflict can name both (I43). */
    readonly declaredBy: string;
    readonly fetch: () => Promise<unknown>;
    readonly parts: Set<Part>;
    readonly folds: Map<string, { version: number; value: unknown }>;
    offsetMs: number;
    dueAt: number;
    failures: number;
    inFlight: boolean;
    version: number;
    data: unknown;
    /** One-shots are done after one attempt, whichever way it went (rule 3). */
    done: boolean;
    retired: boolean;
  };

  const hosts = new Map<string, { host: RefreshHost; parts: Part[] }>();
  const sources = new Map<string, Source>();

  /**
   * The two key namespaces, disjoint **by construction** (C23 I42, §8d D5).
   *
   * A part with no `source` is still a source — that is what keeps one code path
   * — so it needs a key, and the key has to be one no consumer can spell. If the
   * implicit form were `entry:e1:cpu`, a consumer whose `source` happened to be
   * that string would share a fetch with a part that never asked to: **two
   * unrelated parts polling one source, which is the inverse of the defect this
   * mechanism fixes and which would look *more* self-consistent than before.**
   *
   * The prefixes differ in the first character, so no declared key can reach the
   * implicit space whatever it contains. A rule that depends on nobody choosing a
   * particular string is not a rule.
   */
  /**
   * The source a refused part is given: `done`, referred to by nobody, and never
   * in `sources` (I43).
   *
   * A part with no source at all would need a nullable field, and every read of
   * `part.source` would grow a branch for a state one call site produces. This is
   * the same shape the unshared case takes — every part has a source, and this
   * one has already finished.
   */
  const deadSource = (key: string, spec: ViewRefresh): Omit<Source, "parts"> => ({
    key,
    intervalMs: spec.intervalMs,
    declaredBy: spec.id,
    fetch: () => Promise.resolve(null),
    folds: new Map(),
    offsetMs: 0,
    dueAt: 0,
    failures: 0,
    inFlight: false,
    version: 0,
    data: undefined,
    done: true,
    retired: true,
  });

  const declaredKey = (source: string): string => `d${SEP}${source}`;
  const implicitKey = (host: RefreshHost, partId: string): string =>
    `p${SEP}${keyOf(host)}${SEP}${partId}`;

  /**
   * Write a part's block back to whichever host holds it.
   *
   * **`gapBefore` is carried across, and losing it was visible only by looking.**
   * `b.live` builds its panel through `finish`, which defaults the gap on — so
   * the declared block has one and the replacement this makes did not. The
   * document's rhythm therefore changed on the first tick, with the part's own
   * content correct and every assertion about it passing: C04 I25 says rhythm is
   * declared by `gapBefore` and applied by the sequence, and a patch that
   * silently drops it is the renderer disagreeing with the declaration.
   *
   * Read off the block currently in place rather than remembered at declaration,
   * because the part's panel is whatever the host holds now — including one an
   * earlier patch put there.
   */
  /**
   * The arm that draws this part's failure — the declarer's, or the framework's.
   *
   * **Resolved at the call and not at the declaration** (F407), which is the whole
   * of what lets the countdown sweep know whose block it may rewrite.
   */
  const errorArm = (part: Part): ((e: ErrorLike, r: number | null, a: number) => Block) =>
    part.spec.renderError ?? defaultErrorBlock(part.spec.id);

  const put = (host: RefreshHost, part: Part, child: Block): boolean => {
    const existing = currentPanel(host, part);
    const base = livePanel(part.spec.id, titleOf(part), child);
    const panel: Block =
      existing?.gapBefore === true ? ({ ...base, gapBefore: true } as Block) : base;
    if (host.kind === "view") return deps.updateView(host.id, part.spec.id, panel);

    const outcome = deps.transcript.patch(
      host.id,
      { op: "replace", blockId: part.spec.id, block: panel },
      "shell",
    );
    // **`unknown` and `settled` are not failures** (C23 I21, §5). The host was
    // evicted or finalised between arming and firing, so the part is over —
    // backing off would be waiting to retry against something that is gone.
    return outcome.ok;
  };

  /**
   * C23 I35 — the age lives in the title, and nowhere else does it fit.
   *
   * **One guard, not two.** This read `!part.stale || part.lastOk === null`, and
   * the second arm cannot fire: `stale` is only ever set where `lastOk` is
   * already non-null. It read as care and was the vacuity class — a condition
   * with nothing to be wrong about passes exactly like one that is satisfied,
   * and the mutation pass found it by producing a mutant nothing could kill.
   */
  const titleOf = (part: Part): string => {
    if (!part.stale) return part.spec.title;
    const secs = Math.max(0, Math.round((deps.clock() - (part.lastOk ?? 0)) / 1000));
    return `${part.spec.title} · ${String(secs)}s ago`;
  };

  const settleSource = (src: Source, at: number): void => {
    const interval = backoffOf(src.intervalMs, src.failures);
    src.dueAt = at + interval;
    if (src.intervalMs === 0) src.done = true;
  };

  /**
   * C23 I47 — the fold, once per version, shared by every part reading it.
   *
   * **`prev` is read from the same entry regardless of version**, which is what
   * makes this a fold rather than a cache. A stale entry is the previous
   * accumulation and is exactly what `compute` wants; clearing it on a new
   * version would hand every fold `undefined` and turn a ring buffer into a
   * single sample, which is the defect wearing the shape of a cache invalidation.
   *
   * A throwing `compute` propagates to the caller, which renders the error arm.
   * Nothing is stored, so **the version is not consumed** — a fold that threw has
   * not advanced, and the next one starts from the same `prev`.
   */
  const derivedFor = (
    src: Source,
    derive: NonNullable<ViewRefresh["derive"]>,
  ): unknown => {
    const held = src.folds.get(derive.key);
    if (held !== undefined && held.version === src.version) return held.value;
    const value = derive.compute(src.data, held?.value);
    src.folds.set(derive.key, { version: src.version, value });
    return value;
  };

  /**
   * One part's share of a resolution: derive, render, patch.
   *
   * **A `render` throw is deterministic** (A02 §7 rule 2), so it is rendered and
   * the source's interval does not move; only the fetch's own rejection reaches
   * the backoff. `compute` throws the same way and for the same reason, which is
   * why it is inside this `try` and not beside the fetch.
   */
  const renderPart = (part: Part): boolean => {
    const src = part.source;
    let child: Block;
    try {
      const input = part.spec.derive === null ? src.data : derivedFor(src, part.spec.derive);
      child = part.spec.render(input, deps.producerContext());
    } catch (err) {
      const shown = { message: err instanceof Error ? err.message : String(err) };
      // **`null` because a render throw is deterministic** (§3d, A03 §7 rule 2)
      // — same data, same throw, so nothing is retrying and the box is `error`
      // rather than a countdown to a retry that will not happen. The attempt
      // count is still the source's: the fetch that produced this data may well
      // have failed twice on the way.
      put(part.host, part, errorArm(part)(shown, null, src.failures));
      return true;
    }
    part.lastOk = deps.clock();
    part.stale = false;
    if (put(part.host, part, child)) return true;
    release(part.host);
    return false;
  };

  /**
   * One poll, and **every part referring to the source when it resolves** renders
   * it (C23 I44) — including one declared while the fetch was in flight, which is
   * why the referring set is read here rather than captured at the call.
   *
   * **One commit for the whole set**, which is the invariant rather than an
   * optimisation: C03 already coalesces `stream` commits into one frame, so what
   * a commit-per-part costs is not frames but the appearance that N independent
   * things happened.
   */
  const runSource = (src: Source): void => {
    src.inFlight = true;
    const started = deps.clock();

    void src
      .fetch()
      .then(
        (data) => {
          // **§8c C2 — nothing failed, so nothing backs off.** A resolution whose
          // every referrer has gone has nowhere to land, and treating it as a
          // failure would make a source that lost its readers poll *more slowly*
          // when they come back.
          if (src.retired || src.parts.size === 0) return;
          src.failures = 0;
          src.version += 1;
          src.data = data;
          let any = false;
          // A snapshot, because `renderPart` can release a host and a released
          // host's parts leave this set mid-iteration.
          for (const part of [...src.parts]) if (renderPart(part)) any = true;
          if (any) deps.commit("stream");
        },
        (err: unknown) => {
          if (src.retired || src.parts.size === 0) return;
          src.failures += 1;
          const shown = { message: err instanceof Error ? err.message : String(err) };
          // A one-shot never retries, so it has no countdown to show (rule 3).
          const retryIn = src.intervalMs === 0 ? null : backoffOf(src.intervalMs, src.failures);
          // **§8d D6 — rendering is the part's and backoff is the source's.** I21
          // said *contained to its declared part* when a part and a poll were the
          // same thing; with one fetch behind two panels the word splits. Each
          // part draws its own arm at its own size, and the backoff above doubled
          // once rather than once per referrer.
          let any = false;
          for (const part of [...src.parts]) {
            if (put(part.host, part, errorArm(part)(shown, retryIn, src.failures))) any = true;
            else release(part.host);
          }
          if (any) deps.commit("stream");
        },
      )
      .finally(() => {
        src.inFlight = false;
        settleSource(src, Math.max(started, deps.clock()));
        // The next due time just moved, so the timer armed against the old one
        // is wrong in both directions — too late for a backoff that shortened,
        // too early for one that grew.
        armParts();
      });
  };

  /**
   * Whether anyone is looking at anything this source feeds (C23 I46).
   *
   * Not `watched`, which is the stall detector's map of streaming entries two
   * hundred lines above. Two mechanisms in one file both wanting the word is
   * worth a rename rather than a shadow.
   */
  const anyoneLooking = (src: Source): boolean => {
    for (const part of src.parts) if (deps.visible(part.host)) return true;
    return false;
  };

  /** One sweep of every source, called from the same timer as `tick`. */
  const sweepParts = (): void => {
    if (deps.stopping()) return;
    const now = deps.clock();

    // **Retirement is the sweep's and not `release`'s** (C23 I45, §8c C3). C23 I33a
    // settles by release-then-declare, both synchronous, so a source retired the
    // instant its last referrer went would be destroyed between those two calls
    // and rebuilt empty — the derivation's accumulation reset on every settle,
    // with the panel still drawing and the latest value still right.
    for (const [key, src] of sources) {
      if (src.parts.size === 0 && !src.inFlight) {
        src.retired = true;
        sources.delete(key);
      }
    }

    for (const src of sources.values()) {
      if (src.done || src.inFlight) continue;

      // **Staleness never stops a refresh** (C23 I35) — and it does not run for a
      // host nobody is looking at, because I46's pause is *no patch* and a
      // re-title is a patch.
      for (const part of src.parts) {
        if (!deps.visible(part.host)) continue;
        if (part.stale || part.lastOk === null) continue;
        if (now - part.lastOk < part.spec.staleAfterMs) continue;
        part.stale = true;
        const current = currentChild(part.host, part);
        if (current !== null && put(part.host, part, current)) deps.commit("stream");
      }

      if (now >= src.dueAt && anyoneLooking(src)) runSource(src);
    }

    // **The elapsed counter, and it needs its own loop over `hosts`** (C23 I52).
    //
    // The loop above walks `sources` and skips `src.inFlight` — which is exactly
    // what a part waiting on its first fetch *is*, so nothing there can ever see
    // one. A pass folded into it would have been unreachable by construction and
    // green from the day it was written.
    let ticked = false;
    for (const entry of hosts.values()) {
      for (const part of entry.parts) {
        // **A part whose declarer supplied `renderLoading` owns its own block**
        // (C24 §5). *Behaviour is fixed, rendering is overridable* — a framework
        // timer writing fields into a consumer's block is the guarantee reaching
        // past its own boundary.
        if (part.spec.renderLoading !== null) continue;
        // **`anyoneLooking`'s gate, per part** (I46). C22's spinner ticker
        // disarms when nothing on screen animates, and this driver cannot see
        // the viewport — so off screen the spinner stops while the counter would
        // go on writing, at one whole frame each rather than the 0.4 that made
        // it free (F234, §8a-bis B7).
        if (!deps.visible(part.host)) continue;
        // **The block currently in place, never one remembered at declaration**
        // — `put`'s own rule for `put`'s own reason. A fetch can fail between
        // the arm and the fire, so the box this was armed for may now be
        // `retrying`, and `elapsedNeeded` says no to anything that is not a
        // loading `status` (§8a-bis B3).
        const shown = currentChild(part.host, part);
        const since = now - part.startedAt;
        if (!elapsedNeeded(shown, since)) continue;
        if (put(part.host, part, { ...(shown as Status), elapsedMs: since })) ticked = true;
      }
    }

    // **The countdown, on the same loop and the same three rules** (C23 I52, F407).
    //
    // `retryInMs` was written once — at the failure — and the box then held that
    // number for the whole backoff and jumped: measured over 26 seconds,
    // `retrying in 12s` for a dozen frames and then `24s`. Every ingredient was
    // already here. The driver knows `dueAt`, the sweep runs, the field is a
    // field, and nothing joined them because the only arm asked for `loading`.
    //
    // **Only where the box is the framework's**, which is what `renderError:
    // null` now says: a declarer that supplied one owns its rendering, and this
    // writing into it is the guarantee reaching past its own boundary. **Only
    // while someone is looking**, I46's gate. **Only when the figure changes**,
    // because a write that draws the same second is still a `rev` bump.
    //
    // **Clamped at zero.** A source overdue by a second is waiting on the fetch
    // rather than on the clock, and `retrying in -1s` is a number about nothing.
    let counted = false;
    for (const entry of hosts.values()) {
      for (const part of entry.parts) {
        if (part.spec.renderError !== null) continue;
        if (!deps.visible(part.host)) continue;
        const src = part.source;
        if (src.done || src.inFlight) continue;
        const remaining = Math.max(0, src.dueAt - now);
        const shown = currentChild(part.host, part);
        if (!retryNeeded(shown, remaining)) continue;
        if (put(part.host, part, { ...(shown as Status), retryInMs: remaining })) counted = true;
      }
    }
    if (counted) deps.commit("stream");
    if (ticked) deps.commit("stream");

    // **The running cards, on the same wake** (C23 I53). A third loop rather than
    // a third timer: the figure moves once a second for every card at once, and
    // `armParts` already wakes at that cadence for a waiting box. A refused
    // patch — the entry evicted or cleared underneath — drops the readout, as
    // `put` tolerates a released host (I21, §5).
    let read = false;
    for (const [id, r] of [...readouts]) {
      if (!deps.visible({ kind: "entry", id })) continue;
      const since = now - r.startedAt;
      const figure = elapsed(since);
      if (figure === r.last) continue;
      const outcome = deps.transcript.patch(
        id,
        { op: "replace", blockId: r.blockId, block: r.render(since) },
        "shell",
      );
      if (!outcome.ok) {
        readouts.delete(id);
        continue;
      }
      r.last = figure;
      read = true;
    }
    if (read) deps.commit("stream");

    // **Through `release`, for the reason `/clear` was** (I32). A host whose parts
    // are all finished is dropped here, and dropping the map entry directly
    // leaves every one of its parts still in its source's referring set — so the
    // source is never retired and the map grows for the session. Nothing fails:
    // a `done` source does not poll, so the only symptom is a leak.
    //
    // Found by reading the diff rather than by a test. It is the second instance
    // in this file of the same shape — a teardown written beside the only
    // teardown path instead of through it — and I32's *five sites agreeing by
    // inspection* is exactly what that sentence is about.
    for (const entry of [...hosts.values()]) {
      if (entry.parts.every((p) => p.source.done)) release(entry.host);
    }
  };

  /** The part's panel as the host currently holds it, or `null` if it has gone. */
  /**
   * A block by id, **anywhere in the document** (F408).
   *
   * `liveDeclarations` recurses and says why in its own comment — *S13's
   * dashboard is five panels inside a `group`, so a walk over top-level blocks
   * alone finds none of them.* The **read** back never got the same treatment,
   * and the pair is one question a step apart: a part found by the declaration
   * walk and not by this one declares, renders and patches, and every sweep that
   * has to read the block in place finds nothing.
   *
   * The condition is C04's `hasChildren`, not a list of kinds, for the reason the
   * declaration walk gives: a live panel inside a `scroll` is reachable too.
   */
  const findBlock = (blocks: readonly Block[], id: string): Block | null => {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (hasChildren(b)) {
        const inside = findBlock(b.children, id);
        if (inside !== null) return inside;
      }
    }
    return null;
  };

  const currentPanel = (host: RefreshHost, part: Part): Panel | null => {
    // **The real block on both arms** (F22). This reconstructed on the view arm
    // and read on the entry arm, so every field the reconstruction did not set
    // was invisible here — `gapBefore` measurably, and anything added to `Panel`
    // later by construction.
    if (host.kind === "view") return deps.viewPanel(host.id, part.spec.id);
    const entry = deps.transcript.entries.find((e) => e.id === host.id);
    const found = entry === undefined ? null : findBlock(entry.doc.blocks, part.spec.id);
    return found !== null && found.kind === "panel" ? found : null;
  };

  /** The child a part's panel is showing, so staleness can re-title without refetching. */
  const currentChild = (host: RefreshHost, part: Part): Block | null =>
    currentPanel(host, part)?.children[0] ?? null;

  /**
   * Drop a host and detach its parts from whatever they were referring to.
   *
   * **The source is not retired here** (C23 I45, §8c C3). Detaching is immediate
   * because a released part must not be rendered into; retiring is the sweep's,
   * because settlement releases and re-declares in one synchronous pair and a
   * source destroyed between them takes its accumulated fold with it.
   */
  /**
   * The running cards (C23 I53): one entry, the block the figure lives in, how to
   * draw it for a duration, when it started, and the figure last written.
   *
   * `last` is the rendered string and not the clock, for I52's reason: below a
   * second `elapsed()` draws nothing and past ninety-nine it draws minutes, so
   * *the clock moved* and *the header would change* are different questions and
   * only the second justifies a `rev` bump.
   */
  const readouts = new Map<
    EntryId,
    { blockId: string; render: (elapsedMs: number) => Block; startedAt: number; last: string }
  >();

  const release = (host: RefreshHost): void => {
    // A released entry host takes its readout with it (I53) — the same five
    // triggers, through the same one path (I32).
    if (host.kind === "entry") readouts.delete(host.id);
    const key = keyOf(host);
    const entry = hosts.get(key);
    if (entry === undefined) return;
    for (const part of entry.parts) part.source.parts.delete(part);
    hosts.delete(key);
  };

  /**
   * **Part refresh gets its own timer, armed to the next part that is due.**
   *
   * It shared the stall check's first, which is one timer to stop and one place
   * to read `stopping` — and it silently erased C23 I20. Stall detection sweeps
   * every `STALL_MS / 4`, thirty seconds; `assignOffsets` spreads parts across
   * the *smallest declared interval*, which for S13's dashboard is five seconds.
   * Every offset therefore fell inside one sweep, all five parts came due
   * together, and the stagger was assigned, stored, asserted by its own unit
   * test — and unobservable. The load spike and the whole-screen flicker I20
   * exists to prevent were both back.
   *
   * The convenience was the invariant: a coarse shared clock supplies the
   * *behaviour* of a fine one right up until something depends on the
   * difference. Arming to `min(dueAt)` costs one more timer and makes the offset
   * mean what it says.
   */
  let partTimer: Disposable | null = null;

  const armParts = (): void => {
    partTimer?.[Symbol.dispose]();
    partTimer = null;
    if (stopped || (sources.size === 0 && readouts.size === 0)) return;

    const now = deps.clock();
    let soonest = Infinity;
    /**
     * **There is cleanup to do, so wake once even though nothing is due** (I45).
     *
     * Two states qualify and both are terminal: a source nobody refers to, which
     * the sweep retires, and a host whose parts have all finished, which the
     * sweep releases. Neither is true after the sweep that handles it, so this
     * wakes the timer once rather than spinning it.
     *
     * **Without the second clause the first is unreachable for a one-shot.** Its
     * source is `done` and still referred to, so the loop below arms nothing, no
     * sweep ever runs again, and the host is never released — which is how a leak
     * with no symptom survives a green suite: a `done` source does not poll.
     */
    const cleanup =
      [...sources.values()].some((s) => s.parts.size === 0) ||
      [...hosts.values()].some((e) => e.parts.every((p) => p.source.done));
    for (const src of sources.values()) {
      if (src.parts.size === 0) continue;
      // **A paused source is not soonest** (C23 I46). Arming to an overdue source
      // nobody is looking at spins the timer at zero; the resume comes from
      // `visibilityChanged`, which is heard rather than polled.
      if (!src.done && !src.inFlight && anyoneLooking(src)) soonest = Math.min(soonest, src.dueAt);
    }
    if (cleanup) soonest = Math.min(soonest, now);

    // **A part waiting on its first fetch wakes the sweep, and nothing else
    // would** (C23 I52). The loop above arms against `dueAt` and skips a source
    // that is `inFlight` — which is precisely the state a loading box is in — so
    // without this the counter would tick only when something *else* happened to
    // schedule a sweep, and a part with a slow first fetch and no siblings would
    // sit at `⠋ loading` with no figure for the whole wait.
    //
    // **Gated the same way the write is**, so a box nobody is looking at arms no
    // timer at all — I46's rule, and C22 I60a's for the spinner it sits beside.
    const waiting = [...hosts.values()].some((e) =>
      e.parts.some(
        (p) =>
          p.spec.renderLoading === null &&
          p.lastOk === null &&
          !p.source.done &&
          deps.visible(p.host),
      ),
    );
    if (waiting) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);

    // **A backing-off box wakes the sweep too, and for the same reason** (F407).
    // The loop above arms against `dueAt`, which for a source twenty-four seconds
    // into a backoff is twenty-four seconds away — so without this the countdown
    // would be rewritten once, when the retry fired, which is exactly the defect.
    // Gated the way the write is, so a box nobody is looking at arms no timer.
    const counting = [...hosts.values()].some((e) =>
      e.parts.some(
        (p) =>
          p.spec.renderError === null &&
          !p.source.done &&
          !p.source.inFlight &&
          p.source.failures > 0 &&
          deps.visible(p.host),
      ),
    );
    if (counting) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);

    // **A running card wakes the sweep too, once for all of them** (C23 I53).
    // Gated the way its write is: a card nobody is looking at arms no timer, and
    // `visibilityChanged` re-arms it when it is back on screen (I46).
    const reading = [...readouts.keys()].some((id) => deps.visible({ kind: "entry", id }));
    if (reading) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);

    if (!Number.isFinite(soonest)) return;

    partTimer = deps.schedule(() => {
      sweepParts();
      armParts();
    }, Math.max(0, soonest - now));
  };

  /**
   * Three of I33's five triggers, from one subscription (C23 I33).
   *
   * **Heard rather than checked**, and the difference is a tick wide. Asking
   * *does this host still exist* at the top of a sweep is correct and answers
   * one interval too late: in between, a part patches an id C13 has already
   * dropped, `patch` returns `{ok:false, reason:"unknown"}`, and a driver that
   * read that as a transport failure would back off against something gone.
   *
   * **And eviction is the one nothing decides.** Settle is a route reaching its
   * end and pop is a keystroke — each has a caller that could be told. C13's cap
   * removes entries on its own schedule, so there is no such caller, which is why
   * it was in neither §5's containment table nor I9 and why C25's pushed view
   * listens for exactly this.
   */
  const watchHosts = deps.transcript.subscribe((change) => {
    if (change.kind === "settle") release({ kind: "entry", id: change.id });
    else if (change.kind === "evict") {
      for (const id of change.ids) release({ kind: "entry", id });
    } else if (change.kind === "clear") {
      // **Through `release`, which I32 says is the only teardown path.** This
      // deleted the host from the map directly, and for as long as a part *was*
      // a poll that was the same thing — so the sentence was true of the code by
      // coincidence rather than by construction. With a source behind the part,
      // deleting the host leaves the source holding a part whose host is gone,
      // and `/clear` stopped nothing: T3.30 measured five fetches where it wanted
      // one. The rule was right and one of its call sites was not routed through
      // it, which is the state I32's own wording — *five sites agreeing by
      // inspection* — exists to prevent.
      for (const entry of [...hosts.values()]) {
        if (entry.host.kind === "entry") release(entry.host);
      }
    }
  });

  const tick = (): void => {
    // C23 I12's second clause — §3b stops once shutdown begins, or a notice
    // lands in a transcript being torn down.
    if (deps.stopping()) return;

    const now = deps.clock();
    for (const [id, state] of watched) {
      if (state.stalled || now - state.last < STALL_MS) continue;
      state.stalled = true;
      state.stalledAt = now;

      // **A notice, never an error** (C23 I25). A quiet stream is the normal
      // state of a `--watch` on an idle cluster; reporting it as a failure
      // trains the reader to ignore the one time it is one.
      const quiet = Math.round((now - state.last) / 60_000);
      // **The mark, and this is the one consumer that is not a `noticeDoc`**
      // (C09 §4). It qualifies on the same shape: the entry is streaming, so
      // its command chrome is on screen above, and the notice reports what the
      // *entry* is doing rather than anything the far side emitted. `muted`
      // obliges no glyph (C04 I6), so the slot was free.
      const notice = b.notice("muted", `no output for ${String(quiet)}m`, "continuation", { id: STALL_BLOCK });
      // Append the first time and replace after: the row is the entry's one
      // stall block for its whole life, and it says whichever thing is true now.
      deps.transcript.patch(
        id,
        state.hasNotice
          ? { op: "replace", blockId: STALL_BLOCK, block: notice }
          : { op: "append", block: notice },
        "shell",
      );
      state.hasNotice = true;
      deps.commit("stream");
    }

  };

  /**
   * **Re-armed, because `schedule` is a one-shot.** C22 supplies
   * `setTimeout` (`session.ts`), so a single `schedule(tick, …)` outside a loop
   * checks for silence exactly once — thirty seconds after construction — and
   * never again. That was this file's state for the whole of C22 and C23: a
   * `--watch` that went quiet twice was told once, and a stream that went quiet
   * after the first half-minute was never told at all.
   *
   * It survived because the harnesses re-fired every scheduled callback on every
   * `tick()`, under which a periodic mechanism and a one-shot one are the same
   * test (C23 T1.30, T6.30). `identity.ts` arms the same way and does re-arm;
   * the two were written apart and only one of them said so.
   */
  let stopped = false;
  const arm = (): void => {
    if (stopped) return;
    timers.push(
      deps.schedule(() => {
        tick();
        arm();
      }, STALL_MS / 4),
    );
  };
  arm();

  return {
    watch: (id) => void watched.set(id, { last: deps.clock(), stalled: false, stalledAt: 0, hasNotice: false }),

    sawPatch: (id) => {
      const state = watched.get(id);
      if (state === undefined) return;
      resolveStall(id);
      state.last = deps.clock();
    },

    settled: (id) => {
      // **C23 §8a A4.** Stopping the mechanism does not retract the block it
      // already injected, so an entry that goes quiet and then settles would
      // keep `no output for 2m` in its final document — where it is no longer
      // true and can never be replaced.
      resolveStall(id);
      watched.delete(id);
      // C23 I53 — a settled card keeps its final figure; the readout stops here.
      readouts.delete(id);
    },

    readout: (id, blockId, render) => {
      readouts.set(id, { blockId, render, startedAt: deps.clock(), last: elapsed(0) });
      armParts();
    },

    identityNotice: (text) => {
      if (deps.stopping()) return;
      deps.append(text);
    },

    declare: (host, parts) => {
      const at = deps.clock();

      /**
       * **The conflict check runs before anything is stored** (C23 I43, §8d D1).
       *
       * A throw part-way through a registration leaves the host holding some of
       * its parts and some of its sources — the state §8c's rejection question
       * asks about, and the one nothing downstream could describe. So the whole
       * declaration is validated first and applied second.
       */
      const wanted = parts.map((spec) => ({
        spec,
        key: spec.source === null ? implicitKey(host, spec.id) : declaredKey(spec.source),
      }));
      // **Two declarations of one key can both be in this call**, which is the
      // case a check against `sources` alone cannot see: nothing is stored until
      // the loop below, so the second part compares itself against an empty map
      // and agrees. The dashboard declares five parts at once, so the *common*
      // way to write the conflict is the one that was invisible — found by the
      // row, not by the walk, whose D1 said "one key, different intervals" and
      // did not ask where the two declarations were.
      const seen = new Map<string, { declaredBy: string; intervalMs: number }>();
      for (const [key, src] of sources) seen.set(key, src);
      const refused = new Map<string, string>();
      for (const { spec, key } of wanted) {
        const existing = seen.get(key);
        if (existing === undefined || existing.intervalMs === spec.intervalMs) {
          if (existing === undefined) seen.set(key, { declaredBy: spec.id, intervalMs: spec.intervalMs });
          continue;
        }
        // **Refused rather than arbitrated.** First-wins and shortest-wins both
        // store the loser's declaration where it reads as honoured and is not —
        // the two-records-of-one-fact class with a timing symptom. Both parts and
        // both values, because a refusal that does not say which two declarations
        // disagree is one the author has to bisect for.
        //
        // **Drawn, not thrown** (I43), and that half was measured. Thrown from
        // here it lands in `appendAndCommit`'s bare catch — C23 §5's deliberate
        // one — with the entry already appended, so the author gets two panels at
        // `◌ loading` for the session and nothing anywhere reports a fault. A
        // refusal nobody can see refuses nothing.
        refused.set(
          spec.id,
          `live source "${spec.source ?? spec.id}" is declared with two intervals: ` +
            `"${existing.declaredBy}" says ${String(existing.intervalMs)}ms and ` +
            `"${spec.id}" says ${String(spec.intervalMs)}ms. One source has one cadence.`,
        );
      }

      const made: Part[] = [];
      const drawn: { part: Part; message: string }[] = [];
      for (const { spec, key } of wanted) {
        const why = refused.get(spec.id);
        if (why !== undefined) {
          // Declared, so the host still owns it and `release` still reaches it —
          // and joined to no source, so it never polls. The panel says why.
          const part: Part = {
            spec,
            host,
            source: { ...deadSource(key, spec), parts: new Set<Part>() },
            // Never read — a refused part draws its error box once and its
            // source is `done` — but the field is `readonly` and a refused part
            // is still a `Part`. Set from the same clock as the other arm, so
            // the two are not two answers to one question (I43).
            startedAt: deps.clock(),
            lastOk: null,
            stale: false,
          };
          made.push(part);
          drawn.push({ part, message: why });
          continue;
        }
        let src = sources.get(key);
        if (src === undefined) {
          src = {
            key,
            intervalMs: spec.intervalMs,
            declaredBy: spec.id,
            // **The first declaration's closure runs, and nothing compares it to
            // the second** (C23 I43). The key *is* the claim that they are the
            // same, and stating that is what stops a later reader adding a check
            // that cannot exist.
            fetch: spec.fetch,
            parts: new Set<Part>(),
            folds: new Map(),
            offsetMs: 0,
            dueAt: at,
            failures: 0,
            inFlight: false,
            version: 0,
            data: undefined,
            done: false,
            retired: false,
          };
          sources.set(key, src);
        }
        const part: Part = {
          spec,
          host,
          source: src,
          // **When the box appeared, which is when this part was declared** —
          // not when its source was created, which a shared fetch makes a
          // different moment (C23 I52).
          startedAt: deps.clock(),
          lastOk: null,
          stale: false,
        };
        src.parts.add(part);
        made.push(part);
      }
      hosts.set(keyOf(host), { host, parts: made });

      // After the host is registered, because `put` reads the block currently in
      // place to carry `gapBefore` across — and one commit for the set, which is
      // I44's rule applied to the one path that is not a poll.
      if (drawn.length > 0) {
        let any = false;
        for (const { part, message } of drawn) {
          // A refused declaration never had a source, so there is no attempt to
          // count and `1` is the honest number: this is the first and only time
          // it will be drawn (I43 — its source is `done` and referred to by
          // nobody).
          if (put(part.host, part, errorArm(part)({ message }, null, 1))) any = true;
        }
        if (any) deps.commit("stream");
      }

      // **Staggered across the session's sources, not this call's parts** (C23
      // I20). Reassigned rather than assigned, because a source added now shifts
      // the step for every source already running — and the offset is spent once,
      // on the first tick: it exists so no two fire together, not so anything
      // waits before its first fetch.
      const live = [...sources.values()].filter((s) => !s.done);
      for (const s of assignOffsets(live)) {
        const held = sources.get(s.key);
        if (held === undefined || held.offsetMs === s.offsetMs) continue;
        held.dueAt += s.offsetMs - held.offsetMs;
        held.offsetMs = s.offsetMs;
      }
      armParts();
    },

    visibilityChanged: () => void armParts(),

    release: (host) => {
      release(host);
      armParts();
    },

    dispose: () => {
      // `stopped` first: a timer disposed while its callback is mid-flight would
      // otherwise re-arm on the way out, and the driver would outlive the call
      // that ended it.
      stopped = true;
      for (const t of timers) t[Symbol.dispose]();
      timers.length = 0;
      watched.clear();
      readouts.clear();
      hosts.clear();
      sources.clear();
      partTimer?.[Symbol.dispose]();
      partTimer = null;
      watchHosts[Symbol.dispose]();
    },
  };
}
