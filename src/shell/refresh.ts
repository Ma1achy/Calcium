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

import { block } from "../data/viewmodel/index.js";
import type { Block, ErrorLike, Panel } from "../data/viewmodel/index.js";
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
  /** Stagger, assigned by `assignOffsets` — never chosen by the declarer. */
  offsetMs: number;
  staleAfterMs: number;
  fetch: () => Promise<unknown>;
  /**
   * Separate from `fetch`, and that is A02 §7 rule 2 rather than tidiness.
   *
   * A rejecting `fetch` is transient and retries; a throwing `render` is
   * deterministic — same data, same throw — and does not. Composed into one
   * thunk the driver cannot tell which happened, and the rule stays written
   * down with nothing implementing it.
   */
  render: (data: unknown) => Block;
  renderError: (err: ErrorLike, retryInMs: number | null) => Block;
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

/** C23 I34 — a part is one block, and the block is a `panel`. */
export function livePanel(id: string, title: string, child: Block): Panel {
  // `live` is what makes the panel say so (C04 I39, F18). Two surfaces draw the
  // `▌` rail and the slot existed unreachable: this is the only place in the
  // tree that knows a region refreshes, so it is the only place that can name it.
  return block({ kind: "panel", id, title, live: true, children: [child] } as Panel);
}

/**
 * C23 I20 — no two declared parts fire in the same tick.
 *
 * Spread across the *smallest* interval rather than each part's own, because two
 * parts at 30 s and 300 s collide every tenth tick if each is staggered within
 * its own period. The smallest is the only window every part shares.
 *
 * Synchronised refreshes produce a periodic load spike and a whole-screen
 * flicker; staggering costs nothing.
 */
export function assignOffsets(parts: readonly Omit<ViewRefresh, "offsetMs">[]): ViewRefresh[] {
  if (parts.length === 0) return [];
  const smallest = Math.min(...parts.map((p) => p.intervalMs));
  const step = Math.floor(smallest / parts.length);
  return parts.map((p, i) => ({ ...p, offsetMs: step * i }));
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
  viewBlock: (id: string, blockId: string) => Block | null;
}>;

export interface RefreshDriver {
  /** A patch landed on `id`; any stall notice it carries is now false. */
  sawPatch(id: EntryId): void;
  /** Called when an entry starts streaming, so it can be watched for silence. */
  watch(id: EntryId): void;
  /** C23 §8a A4 — settlement removes a stall notice that is present. */
  settled(id: EntryId): void;
  /** C22's identity loop signalling a transition worth saying out loud. */
  identityNotice(text: string): void;
  /**
   * Register a host's parts. Offsets are assigned here, never by the declarer
   * (C23 I20), and a second `declare` for one host replaces the first.
   */
  declare(host: RefreshHost, parts: readonly Omit<ViewRefresh, "offsetMs">[]): void;
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
        block: block({
          kind: "notice",
          id: STALL_BLOCK,
          tone: "muted",
          text: `resumed after ${String(gap)}m`,
        }),
      },
      "shell",
    );
  };


  // --- part refresh (C23 I32–I35) --------------------------------------------

  /**
   * One declared part, plus everything the driver knows about it that the
   * declaration does not.
   *
   * `failures` drives `backoffOf`; `inFlight` stops a slow source stacking ticks
   * until the interval means nothing; `lastOk` is what staleness is measured
   * from, and `null` until the first success — a part that has never succeeded
   * is *loading*, not stale, and saying `· 0s ago` about data that never arrived
   * is the one reading worse than saying nothing.
   */
  type Part = {
    readonly spec: ViewRefresh;
    dueAt: number;
    failures: number;
    inFlight: boolean;
    lastOk: number | null;
    stale: boolean;
    /** One-shots are done after one attempt, whichever way it went (rule 3). */
    done: boolean;
  };

  const hosts = new Map<string, { host: RefreshHost; parts: Part[] }>();

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

  const settleOne = (host: RefreshHost, part: Part, at: number): void => {
    const interval = backoffOf(part.spec.intervalMs, part.failures);
    part.dueAt = at + interval;
    if (part.spec.intervalMs === 0) part.done = true;
  };

  const runPart = (host: RefreshHost, part: Part): void => {
    part.inFlight = true;
    const started = deps.clock();

    void part.spec
      .fetch()
      .then(
        (data) => {
          // **Rule 2 lives here.** A `render` throw is deterministic, so it is
          // rendered and the interval does not move; only the fetch's own
          // rejection reaches the backoff below.
          let child: Block;
          try {
            child = part.spec.render(data);
          } catch (err) {
            const shown = { message: err instanceof Error ? err.message : String(err) };
            put(host, part, part.spec.renderError(shown, null));
            deps.commit("stream");
            return;
          }
          part.failures = 0;
          part.lastOk = deps.clock();
          part.stale = false;
          if (put(host, part, child)) deps.commit("stream");
          else release(host);
        },
        (err: unknown) => {
          part.failures += 1;
          const shown = { message: err instanceof Error ? err.message : String(err) };
          // A one-shot never retries, so it has no countdown to show (rule 3).
          const retryIn =
            part.spec.intervalMs === 0 ? null : backoffOf(part.spec.intervalMs, part.failures);
          if (put(host, part, part.spec.renderError(shown, retryIn))) deps.commit("stream");
          else release(host);
        },
      )
      .finally(() => {
        part.inFlight = false;
        settleOne(host, part, Math.max(started, deps.clock()));
        // The next due time just moved, so the timer armed against the old one
        // is wrong in both directions — too late for a backoff that shortened,
        // too early for one that grew.
        armParts();
      });
  };

  /** One sweep of every declared part, called from the same timer as `tick`. */
  const sweepParts = (): void => {
    if (deps.stopping()) return;
    const now = deps.clock();

    for (const [key, entry] of hosts) {
      for (const part of entry.parts) {
        if (part.done || part.inFlight) continue;

        // **Staleness never stops a refresh** (C23 I35). It is reported and the
        // part keeps its cadence; a stale part is one still trying.
        if (
          !part.stale &&
          part.lastOk !== null &&
          now - part.lastOk >= part.spec.staleAfterMs
        ) {
          part.stale = true;
          const current = currentChild(entry.host, part);
          if (current !== null && put(entry.host, part, current)) deps.commit("stream");
        }

        if (now >= part.dueAt) runPart(entry.host, part);
      }
      if (entry.parts.every((p) => p.done)) hosts.delete(key);
    }
  };

  /** The part's panel as the host currently holds it, or `null` if it has gone. */
  const currentPanel = (host: RefreshHost, part: Part): Panel | null => {
    if (host.kind === "view") {
      const child = deps.viewBlock(host.id, part.spec.id);
      return child === null ? null : livePanel(part.spec.id, titleOf(part), child);
    }
    const entry = deps.transcript.entries.find((e) => e.id === host.id);
    const found = entry?.doc.blocks.find((b) => b.id === part.spec.id);
    return found !== undefined && found.kind === "panel" ? found : null;
  };

  /** The child a part's panel is showing, so staleness can re-title without refetching. */
  const currentChild = (host: RefreshHost, part: Part): Block | null =>
    currentPanel(host, part)?.children[0] ?? null;

  const release = (host: RefreshHost): void => void hosts.delete(keyOf(host));

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
    if (stopped || hosts.size === 0) return;

    const now = deps.clock();
    let soonest = Infinity;
    for (const entry of hosts.values()) {
      for (const p of entry.parts) {
        if (!p.done && !p.inFlight) soonest = Math.min(soonest, p.dueAt);
      }
    }
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
      for (const key of [...hosts.keys()]) {
        if (key.startsWith("entry:")) hosts.delete(key);
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
      const notice = block({
        kind: "notice",
        id: STALL_BLOCK,
        tone: "muted",
        text: `no output for ${String(quiet)}m`,
      });
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
    },

    identityNotice: (text) => {
      if (deps.stopping()) return;
      deps.append(text);
    },

    declare: (host, parts) => {
      const assigned = assignOffsets(parts);
      const at = deps.clock();
      hosts.set(keyOf(host), {
        host,
        parts: assigned.map((spec) => ({
          spec,
          // The stagger is spent once, on the first tick: it exists so no two
          // parts fire together, not so a part waits before its first fetch.
          dueAt: at + spec.offsetMs,
          failures: 0,
          inFlight: false,
          lastOk: null,
          stale: false,
          done: false,
        })),
      });
      armParts();
    },

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
      hosts.clear();
      partTimer?.[Symbol.dispose]();
      partTimer = null;
      watchHosts[Symbol.dispose]();
    },
  };
}
