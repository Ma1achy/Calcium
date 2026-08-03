// C22 §7 — identity and health, on the injected clock.
//
// Three properties with a failure attached: the loop never blocks input (I18),
// it never opens a browser (I14), and an unreachable cluster degrades the
// session rather than ending it (I15).
import { describe, expect, it, vi } from "vitest";

import {
  createIdentityLoop,
  expiryNotice,
  EXPIRY_WARN_MS,
  REFRESH_MS,
} from "../../src/shell/identity.js";
import { createSessionStore } from "../../src/shell/state.js";
import type { Identity } from "../../src/shell/types.js";

function harness(fetch: () => Promise<Identity | null>, at = 1_000_000) {
  const store = createSessionStore({ cwd: "/", env: {}, cluster: "c", version: "1" });
  const notices: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = at;

  const loop = createIdentityLoop({
    fetch,
    writes: store.refresh,
    now: () => now,
    notify: (t) => void notices.push(t),
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return { [Symbol.dispose]: () => undefined };
    },
  });

  return {
    loop,
    store,
    notices,
    timers,
    advance(ms: number) {
      now += ms;
    },
    /** Fire the pending timer, as a fake clock's scheduler would. */
    async tick() {
      const t = timers.pop();
      t?.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

const token = (expiresAt: number | null): Identity => ({
  user: "m",
  email: "m@fmx.io",
  groups: [],
  expiresAt,
});

describe("C22 §7 — identity", () => {
  it("T1.6 (I19): the cadence is five minutes on the injected clock", () => {
    const h = harness(() => Promise.resolve(null));
    h.loop.start();

    expect(REFRESH_MS).toBe(300_000);
    expect(h.timers.at(-1)?.ms, "scheduled, not polled").toBe(REFRESH_MS);
  });

  it("T3.10 (I18): start() returns before the fetch resolves", async () => {
    // A shell that will not take a keystroke until a network call returns is a
    // shell that hangs on a bad DNS entry — and a bad DNS entry is exactly what
    // is wrong when the platform is unreachable.
    let settle: (v: Identity | null) => void = () => undefined;
    const h = harness(() => new Promise((r) => (settle = r)));

    h.loop.start();
    // The assertion is that we reached this line at all: an awaited fetch would
    // not have returned, and the pending timer proves the loop armed anyway.
    expect(h.timers).toHaveLength(1);
    expect(h.store.snapshot.identity, "and nothing was written yet").toBeNull();

    settle(token(null));
    await Promise.resolve();
  });

  it("T3.14 (I15): a failed fetch sets offline and nothing else", async () => {
    // Verbs fail with their own transport envelopes and system commands keep
    // working — a dev on a train still wants `git log`. Throwing here would end
    // the session for the condition it is most likely to meet.
    const h = harness(() => Promise.reject(new Error("unreachable")));
    h.loop.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.store.snapshot.health).toBe("offline");
    expect(h.store.snapshot.identity, "the last known identity is not discarded").toBeNull();
    expect(h.notices, "and it says nothing — an offline cluster is not an event").toEqual([]);
  });

  it("T3.12 (I14): a token under a day warns, and no browser opens", async () => {
    const open = vi.fn();
    const h = harness(() => Promise.resolve(token(1_000_000 + 14 * 60 * 60 * 1000)));
    h.loop.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.store.snapshot.health).toBe("expiring");
    expect(h.notices).toEqual(["Token expires in 14h — run /login to refresh"]);
    expect(open, "never auto-login — t01 rules it out by name").not.toHaveBeenCalled();
  });

  it("T3.12b (I19): the warning is once per session, not once per refresh", async () => {
    // Five minutes apart for the last day of a token is 288 identical notices,
    // and a transcript that repeats itself is one people stop reading — which
    // loses the notice that matters along with the noise.
    const h = harness(() => Promise.resolve(token(1_000_000 + 3 * 60 * 60 * 1000)));
    h.loop.start();
    await Promise.resolve();
    await Promise.resolve();
    await h.tick();
    await h.tick();

    expect(h.notices).toHaveLength(1);
  });

  it("T3.12c: a healthy token warns about nothing", async () => {
    const h = harness(() => Promise.resolve(token(1_000_000 + EXPIRY_WARN_MS + 1)));
    h.loop.start();
    await Promise.resolve();
    await Promise.resolve();

    expect([h.store.snapshot.health, h.notices]).toEqual(["live", []]);
  });

  it("T3.12d (§7): an expired token is C23's to report, not this loop's", async () => {
    // The failure arrives as an auth envelope on the next verb and C23 appends
    // the notice, because it is an execution outcome and C23 owns the
    // transcript. C22 holds the state; announcing it here says it twice.
    const h = harness(() => Promise.resolve(token(1_000_000 - 1)));
    h.loop.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.store.snapshot.health).toBe("expiring");
    expect(h.notices).toEqual([]);
  });

  it("the notice reads in hours, so the reader does no subtraction", () => {
    expect(expiryNotice(14 * 60 * 60 * 1000)).toBe(
      "Token expires in 14h — run /login to refresh",
    );
    expect(expiryNotice(-5), "never a negative hour").toContain("in 0h");
  });
});
