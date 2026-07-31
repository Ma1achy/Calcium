/**
 * C22 §7 — identity and health, on the injected clock.
 *
 * **This loop covers identity alone** (I19). Every other periodic thing —
 * banner sections, dashboard panels, a block's `live` interval — is C23 §3b's,
 * so there is one refresh mechanism rather than two (C24 §5). An earlier split
 * had this one refreshing banner sections too, and two mechanisms for one
 * concern is how a backoff gets implemented twice and diverges once.
 *
 * **Non-blocking, and that is an invariant rather than an optimisation** (I18).
 * Input is accepted before the first fetch resolves, and neither the first
 * frame nor a keystroke waits on it. A shell that will not take a keystroke
 * until a network call returns is a shell that hangs on a bad DNS entry — and
 * the DNS entry is exactly what is wrong when the platform is unreachable.
 *
 * **It never auto-logins** (I14). Expiry warns and offers; opening a browser
 * without being asked is the thing `t01` rules out by name.
 */

import type { RefreshWrites } from "./state.js";
import type { Identity } from "./types.js";

/** §7. Five minutes on C22's clock, never a wall-clock timer. */
export const REFRESH_MS = 5 * 60 * 1000;

/** §7's first transition — a token with less than this left warns once. */
export const EXPIRY_WARN_MS = 24 * 60 * 60 * 1000;

export type Fetcher = () => Promise<Identity | null>;

export type IdentityDeps = Readonly<{
  fetch: Fetcher;
  writes: RefreshWrites;
  now: () => number;
  /** C13's append, through C22 — §7's two transitions commit a notice. */
  notify: (text: string) => void;
  /** Injected so the loop runs on a fake in tiers 1–4 (I10). */
  schedule: (fn: () => void, ms: number) => Disposable;
}>;

export interface IdentityLoop {
  /** Fires the first fetch. Returns immediately — it never awaits one (I18). */
  start(): void;
  stop(): void;
  /** Diagnostics, and what T3.12 reads. */
  readonly warned: boolean;
}

/**
 * The notice text for a token about to expire.
 *
 * Hours rather than a timestamp, because the question is "do I need to act
 * now", and a formatted absolute time makes the reader do the subtraction.
 */
export function expiryNotice(remainingMs: number): string {
  const hours = Math.max(0, Math.floor(remainingMs / (60 * 60 * 1000)));
  return `Token expires in ${String(hours)}h — run /login to refresh`;
}

export function createIdentityLoop(deps: IdentityDeps): IdentityLoop {
  let timer: Disposable | null = null;
  let stopped = false;
  let warned = false;

  /**
   * One refresh. **Failure sets `offline` and nothing else** (I15).
   *
   * An unreachable cluster degrades the session rather than ending it: verbs
   * fail with their own transport envelopes and system commands keep working,
   * because a dev on a train still wants `git log`. Throwing here would take
   * the session down for the one condition it is most likely to meet.
   */
  async function refresh(): Promise<void> {
    let identity: Identity | null;
    try {
      identity = await deps.fetch();
    } catch {
      deps.writes.setHealth("offline");
      return;
    }
    if (stopped) return;

    deps.writes.setIdentity(identity);

    if (identity === null || identity.expiresAt === null) {
      deps.writes.setHealth("live");
      return;
    }

    const remaining = identity.expiresAt - deps.now();
    if (remaining <= 0) {
      // **Expired is C23's to report, not this loop's.** The failure arrives as
      // an auth envelope on the next verb and C23 appends the notice, because
      // it is an execution outcome and C23 owns the transcript (§7). C22 holds
      // the state; announcing it here as well would say it twice.
      deps.writes.setHealth("expiring");
      return;
    }

    if (remaining < EXPIRY_WARN_MS) {
      deps.writes.setHealth("expiring");
      // **Once per session, not once per refresh.** Five minutes apart for the
      // last day of a token is 288 identical notices, and a transcript that
      // repeats itself is one people stop reading — which loses the notice that
      // matters along with the noise.
      if (!warned) {
        warned = true;
        deps.notify(expiryNotice(remaining));
      }
      return;
    }

    deps.writes.setHealth("live");
    // Re-arm: a token refreshed by `/login` should be able to warn again.
    warned = false;
  }

  function arm(): void {
    if (stopped) return;
    timer = deps.schedule(() => {
      void refresh().finally(arm);
    }, REFRESH_MS);
  }

  return {
    start() {
      // `void`, deliberately: I18 is that this returns before the fetch does.
      // Awaiting here is the edit that makes the prompt wait on the network.
      void refresh();
      arm();
    },
    stop() {
      stopped = true;
      timer?.[Symbol.dispose]();
      timer = null;
    },
    get warned() {
      return warned;
    },
  };
}
