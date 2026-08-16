// C23 §3b — the part-refresh driver.
//
// **Every row here is a sequence, and that is the artefact rather than a
// preference.** The defects this mechanism can have are all *between* two
// events: a tick that fires while the previous fetch is in flight, a host that
// went away between arming and firing, a backoff that doubles and never resets.
// A test that drives one tick and asserts one patch passes for a driver with any
// of them.
//
// The clock fires each armed callback **once**, like `setTimeout`. A harness that
// re-fires unconditionally cannot tell a periodic mechanism from a one-shot one,
// which is how the stall timer beside this one went two components unnoticed
// (`test/support/README.md`).
import { describe, expect, it } from "vitest";

import { createRefreshDriver, STALL_MS } from "../../src/shell/refresh.js";
import type { RefreshHost, ViewRefresh } from "../../src/shell/refresh.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { SESSION_BLOCK_CAP } from "../../src/viewport/transcript/cap.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block, ViewDocument } from "../../src/data/viewmodel/index.js";

import { producerContext } from "../support/producer-context.js";
const SWEEP = STALL_MS / 4;

const raw = (id: string, text: string): Block => block({ kind: "raw", id, text });

const panel = (id: string, title: string, child: Block): Block =>
  block({ kind: "panel", id, title, children: [child] } as never);

const docWith = (blocks: readonly Block[]): ViewDocument => ({
  schema: "tui.view/1",
  command: "/dash",
  status: "ok",
  blocks,
  meta: {
    verb: "dash",
    adapter: "local",
    exitCode: 0,
    durationMs: 1,
    truncated: false,
    argv: ["dash"],
    stderr: "",
    transport: "local",
    origin: "user",
  },
});

/** The driver's own host key, so a test can hide one (C23 I46). */
const keyOfHost = (host: { kind: string; id: string }): string => `${host.kind}:${host.id}`;

function harness() {
  const transcript = createTranscriptStore();
  const commits: string[] = [];
  const views = new Map<string, Block[]>();
  let now = 0;
  const timers: { fn: () => void; at: number; live: boolean }[] = [];
  const hidden = new Set<string>();

  const driver = createRefreshDriver({
    transcript,
    clock: () => now,
    producerContext: () => producerContext(),
    schedule: (fn, ms) => {
      const t = { fn, at: now + ms, live: true };
      timers.push(t);
      return {
        [Symbol.dispose]: () => {
          t.live = false;
        },
      };
    },
    commit: (r) => void commits.push(r),
    // Every host visible by default (C23 I46). Rows about the pause set this
    // themselves; a fake that answered `false` would pause the whole file.
    visible: (host) => !hidden.has(keyOfHost(host)),
    append: () => undefined,
    stopping: () => false,
    updateView: (id, blockId, next) => {
      const content = views.get(id);
      if (content === undefined) return false;
      views.set(
        id,
        content.map((b) => (b.id === blockId ? next : b)),
      );
      return true;
    },
    // **This double reproduced the defect it was standing in for** (F22). It
    // returned the panel's child, exactly as production did, so no row here
    // could have seen that the view arm was rebuilding the panel and losing
    // `gapBefore` — a fake narrower than the interface cannot fail on the
    // difference, and this one was not narrower, it was wrong in the same way.
    viewPanel: (id, blockId) => {
      const found = views.get(id)?.find((b) => b.id === blockId);
      return found !== undefined && found.kind === "panel" ? found : null;
    },
  });

  return {
    driver,
    transcript,
    commits,
    views,
    hidden,
    /** Advance and fire what is due, once each — one turn. */
    async tick(ms = SWEEP): Promise<void> {
      now += ms;
      for (const t of timers.filter((x) => x.live && x.at <= now)) {
        t.live = false;
        t.fn();
      }
      // Two turns: the fetch resolves on a microtask and its `.finally` reschedules.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
    at: () => now,
  };
}

/** A part, with the fields the driver needs and nothing a row does not use. */
const part = (over: Partial<ViewRefresh> & { id: string }): ViewRefresh => ({
  title: over.id,
  intervalMs: 30_000,
  staleAfterMs: 60_000,
  source: null,
  derive: null,
  fetch: () => Promise.resolve("ok"),
  render: (data) => raw(`${over.id}-c`, String(data)),
  renderError: (err, retryInMs) =>
    raw(`${over.id}-c`, `err:${err.message}:${retryInMs === null ? "none" : String(retryInMs)}`),
  ...over,
});

/** The text of a part's rendered child, as the host currently holds it. */
const shown = (h: ReturnType<typeof harness>, entry: string, id: string): string | null => {
  const e = h.transcript.entries.find((x) => x.id === entry);
  const p = e?.doc.blocks.find((b) => b.id === id);
  if (p === undefined || p.kind !== "panel") return null;
  const child = p.children[0];
  return child !== undefined && child.kind === "raw" ? child.text : null;
};

const titleOf = (h: ReturnType<typeof harness>, entry: string, id: string): string | null => {
  const e = h.transcript.entries.find((x) => x.id === entry);
  const p = e?.doc.blocks.find((b) => b.id === id);
  return p !== undefined && p.kind === "panel" ? p.title : null;
};

describe("C23 §3b — part refresh", () => {
  it("T1.35 (I34): one tick is one replace, one rev, and the block is a panel", async () => {
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "cluster", raw("a-c", "loading"))]), {
      streaming: true,
    });
    const before = h.transcript.entries[0]?.rev ?? 0;

    h.driver.declare({ kind: "entry", id }, [part({ id: "a" })]);
    await h.tick();

    expect(shown(h, id, "a"), "the fetched data replaced the placeholder").toBe("ok");
    // **One rev, not one per rendered block.** A driver applying a patch per
    // block would land here with the same content and a different count, and
    // C14 would invalidate once per block for one logical refresh.
    expect((h.transcript.entries[0]?.rev ?? 0) - before, "exactly one rev").toBe(1);
    const p = h.transcript.entries[0]?.doc.blocks.find((b) => b.id === "a");
    expect(p?.kind, "still a panel").toBe("panel");
    // **And it says it is live** (C04 I39, F18). Added because the mutation
    // pass found nothing to kill: `livePanel` could stop setting the flag and
    // unit, contract and integration all stayed green, because the renderer's
    // row tests the *mechanism* and this seam is the only thing that tests the
    // *wiring*. The local `panel()` fixture above builds one without the flag,
    // so nothing here could ever have caught it by accident either.
    expect(p?.kind === "panel" && p.live, "the only place that knows names it").toBe(true);
  });

  it("T1.35b (C04 I25): the refresh keeps the declared block's gapBefore", async () => {
    // **Found by looking at the frame, not by an assertion.** `b.live` builds its
    // panel through `finish`, which defaults the gap on; the replacement the
    // driver made did not carry it, so the document gained a blank row before the
    // first tick and lost it after. Every assertion about the part's *content*
    // passed throughout — rhythm is declared by `gapBefore` and applied by the
    // sequence (C04 I25), so a patch that drops it makes the renderer disagree
    // with the declaration while the block itself stays correct.
    const h = harness();
    const declared = { ...panel("a", "a", raw("a-c", "…")), gapBefore: true } as Block;
    const id = h.transcript.append(docWith([declared]), { streaming: true });

    h.driver.declare({ kind: "entry", id }, [part({ id: "a" })]);
    await h.tick();

    const after = h.transcript.entries[0]?.doc.blocks.find((x) => x.id === "a");
    expect(shown(h, id, "a"), "the control: it really did refresh").toBe("ok");
    expect(after?.gapBefore, "and the rhythm survived it").toBe(true);
  });

  it("T1.32 (I21): backoff doubles and resets, and a sibling is untouched", async () => {
    // **Two parts, because containment is the invariant.** One failing part
    // asserted alone cannot distinguish "contained" from "the only thing there".
    let fail = true;
    const h = harness();
    const id = h.transcript.append(
      docWith([
        panel("a", "flaky", raw("a-c", "…")),
        panel("b", "steady", raw("b-c", "…")),
      ]),
      { streaming: true },
    );

    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        fetch: () => (fail ? Promise.reject(new Error("down")) : Promise.resolve("back")),
      }),
      part({ id: "b" }),
    ]);

    await h.tick();
    expect(shown(h, id, "a"), "the failure renders in place, with its countdown").toBe(
      "err:down:60000",
    );
    expect(shown(h, id, "b"), "and the sibling is unaffected").toBe("ok");

    // Doubling: the next attempt is due at 60s, so a 30s turn is too early.
    await h.tick(30_000);
    expect(shown(h, id, "a"), "still backing off at 30s").toBe("err:down:60000");
    await h.tick(60_000);
    expect(shown(h, id, "a"), "and doubles again on the second failure").toBe("err:down:120000");

    fail = false;
    await h.tick(180_000);
    expect(shown(h, id, "a"), "recovery").toBe("back");

    // **Reset, asserted through behaviour rather than through a field.** The next
    // failure must show the *first* interval again; a driver that never reset
    // would show 240000 here and pass every assertion above.
    fail = true;
    await h.tick(60_000);
    expect(shown(h, id, "a"), "the backoff reset on success").toBe("err:down:60000");
  });

  it("T1.33 (I21, A02 §7 rule 2): a render throw does not retry; a fetch rejection does", async () => {
    // **The control is the whole row.** "The interval did not move" passes for a
    // driver that never backs off at all, so the same harness runs both failures
    // and the assertion is that they differ.
    const h = harness();
    const id = h.transcript.append(
      docWith([panel("r", "render", raw("r-c", "…")), panel("f", "fetch", raw("f-c", "…"))]),
      { streaming: true },
    );

    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "r",
        render: () => {
          throw new Error("bad shape");
        },
      }),
      part({ id: "f", fetch: () => Promise.reject(new Error("down")) }),
    ]);

    await h.tick();
    // A deterministic failure has no countdown, because there is no retry.
    expect(shown(h, id, "r"), "rendered in place, no retry offered").toBe("err:bad shape:none");
    expect(shown(h, id, "f"), "and a transient one is retrying").toBe("err:down:60000");

    // One interval on: the fetch part has attempted again, the render part has
    // attempted at its own unchanged cadence and thrown the same way.
    await h.tick(60_000);
    expect(shown(h, id, "f"), "the fetch part doubled").toBe("err:down:120000");
    expect(shown(h, id, "r"), "the render part still says the same thing").toBe(
      "err:bad shape:none",
    );
  });

  it("T1.34 (I21, rule 3): a one-shot part is rendered once and never retried", async () => {
    let calls = 0;
    const h = harness();
    const id = h.transcript.append(docWith([panel("o", "once", raw("o-c", "…"))]), {
      streaming: true,
    });

    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "o",
        intervalMs: 0,
        fetch: () => {
          calls += 1;
          return Promise.reject(new Error("down"));
        },
      }),
    ]);

    await h.tick();
    expect(shown(h, id, "o"), "no countdown — it is not coming back").toBe("err:down:none");
    for (let i = 0; i < 5; i += 1) await h.tick(120_000);
    expect(calls, "fetched exactly once across five intervals").toBe(1);
  });

  it("T3.40 (I21): a tick during an in-flight fetch does not start a second", async () => {
    // A source slower than its interval otherwise stacks attempts until the
    // cadence means nothing — and each one lands a patch, so the screen churns.
    // **Two parts, and the second is what makes the row possible.** `armParts`
    // skips a part that is in flight when it picks the next due time, so a lone
    // slow part arms nothing and no sweep can overlap it — every assertion below
    // would pass against a driver with no guard at all. The fast part keeps
    // sweeps arriving while the slow one is outstanding, which is the only
    // arrangement in which an overlapping tick exists to be refused.
    let started = 0;
    let release: (() => void) | undefined;
    const h = harness();
    const id = h.transcript.append(
      docWith([panel("s", "slow", raw("s-c", "…")), panel("f", "fast", raw("f-c", "…"))]),
      { streaming: true },
    );

    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "s",
        intervalMs: 1_000,
        fetch: () => {
          started += 1;
          return new Promise<string>((r) => {
            release = () => r("done");
          });
        },
      }),
      part({ id: "f", intervalMs: 1_000 }),
    ]);

    await h.tick();
    expect(started).toBe(1);
    for (let i = 0; i < 4; i += 1) await h.tick(10_000);
    expect(started, "four intervals passed and nothing overlapped").toBe(1);

    release?.();
    await h.tick(10_000);
    expect(shown(h, id, "s")).toBe("done");
  });

  it("T3.30b (I33): a host dropped by C13's cap is released", async () => {
    // **Eviction proper, not `clear`.** `clear` is a command someone issued;
    // the cap removes on its own schedule with no caller to be told, which is
    // why it was in neither §5's containment table nor I9. A row that only
    // drives `clear` leaves the `evict` arm asserted by nothing.
    // **Neither live nor streaming, and that is the whole shape of the case.**
    // C13's sweep skips the live entry (I5) and any streaming one (I6), so those
    // two can never be evicted — a host that is streaming is unreachable here,
    // and a row that made one would assert against a state the cap refuses to
    // produce. What is left is exactly the interesting host: an ordinary settled-
    // looking entry, scrolled back, still holding a part that ticks.
    let calls = 0;
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]));
    h.transcript.append(docWith([raw("next", "…")]));
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        fetch: () => {
          calls += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);

    await h.tick();
    expect(calls, "the control: it was running").toBe(1);

    // Push past C13's block cap so the entry that owns the part is evicted.
    // A hundred thousand blocks, in entries wide enough that the loop is short:
    // the cap counts blocks rather than entries, which is the arithmetic a row
    // driving four hundred one-block appends gets wrong silently.
    const wide = (n: number) =>
      docWith(Array.from({ length: 1_000 }, (_, k) => raw(`f${String(n)}-${String(k)}`, "x")));
    for (let i = 0; i < SESSION_BLOCK_CAP / 1_000 + 2; i += 1) h.transcript.append(wide(i));
    expect(
      h.transcript.entries.some((e) => e.id === id),
      "the control: the cap really did drop it",
    ).toBe(false);

    const at = calls;
    for (let i = 0; i < 4; i += 1) await h.tick(60_000);
    expect(calls, "and the part stopped with it").toBe(at);
  });

  it("T3.30 (I32, I33): a host cleared mid-flight is released, not backed off", async () => {
    // `patch` answers `{ok: false, reason: "unknown"}` for an entry C13 has
    // dropped. Read as a transport failure it becomes a backoff against
    // something gone — a part retrying, slower and slower, forever.
    let calls = 0;
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]), {
      streaming: true,
    });
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        fetch: () => {
          calls += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);

    await h.tick();
    expect(calls, "the control: it was running").toBe(1);

    h.transcript.clear();
    for (let i = 0; i < 4; i += 1) await h.tick(60_000);
    expect(calls, "and stopped when the host went").toBe(1);
  });

  it("T2.21 (I33): a frozen host keeps refreshing; a settled one does not", async () => {
    // **Both halves.** I9 is that a frozen entry keeps receiving patches until
    // settled, and *frozen ≠ not updating* is the whole of what it protects: a
    // `--watch` scrolled out of view is still running. C24 §5's table said
    // teardown on freeze, and this is the row that decides between them.
    let frozen = 0;
    let settled = 0;
    const h = harness();
    const a = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]), { streaming: true });
    const bId = h.transcript.append(docWith([panel("b", "b", raw("b-c", "…"))]), {
      streaming: true,
    });

    h.driver.declare({ kind: "entry", id: a }, [
      part({
        id: "a",
        fetch: () => {
          frozen += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);
    h.driver.declare({ kind: "entry", id: bId }, [
      part({
        id: "b",
        fetch: () => {
          settled += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);

    await h.tick();
    expect([frozen, settled], "both ran once").toEqual([1, 1]);

    // `a` is frozen by the arrival of a newer entry; `b` settles.
    h.transcript.settle(bId);
    await h.tick(60_000);
    await h.tick(60_000);

    expect(frozen, "the frozen host is still refreshing").toBeGreaterThan(1);
    expect(settled, "the settled one stopped").toBe(1);
  });

  it("T1.36 (I35): staleness shows in the title and never stops the refresh", async () => {
    let ok = true;
    let calls = 0;
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "activity", raw("a-c", "…"))]), {
      streaming: true,
    });
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        title: "activity",
        intervalMs: 30_000,
        staleAfterMs: 60_000,
        fetch: () => {
          calls += 1;
          return ok ? Promise.resolve("live") : Promise.reject(new Error("down"));
        },
      }),
    ]);

    await h.tick();
    expect(titleOf(h, id, "a"), "fresh data says nothing about age").toBe("activity");

    ok = false;
    const callsAtFailure = calls;
    // Past twice the interval with nothing succeeding.
    await h.tick(60_000);
    await h.tick(60_000);
    expect(titleOf(h, id, "a"), "the age is in the title").toMatch(/^activity · \d+s ago$/u);
    expect(calls, "and it never stopped trying").toBeGreaterThan(callsAtFailure);

    ok = true;
    await h.tick(300_000);
    expect(titleOf(h, id, "a"), "success clears it").toBe("activity");
  });

  it("T1.36b (I35): a part that has never succeeded is loading, not stale", async () => {
    // `· 0s ago` about data that never arrived is the one reading worse than
    // saying nothing — it asserts a freshness that has no subject.
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "activity", raw("a-c", "…"))]), {
      streaming: true,
    });
    h.driver.declare({ kind: "entry", id }, [
      part({ id: "a", title: "activity", fetch: () => Promise.reject(new Error("down")) }),
    ]);

    for (let i = 0; i < 5; i += 1) await h.tick(60_000);
    expect(titleOf(h, id, "a"), "no age, because there is no last-good").toBe("activity");
  });

  it("T1.31 (I20): declared parts are staggered, and the first tick spends the stagger", async () => {
    const order: string[] = [];
    const h = harness();
    const id = h.transcript.append(
      docWith([
        panel("a", "a", raw("a-c", "…")),
        panel("b", "b", raw("b-c", "…")),
        panel("c", "c", raw("c-c", "…")),
      ]),
      { streaming: true },
    );

    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        intervalMs: 30_000,
        fetch: () => {
          order.push("a");
          return Promise.resolve("ok");
        },
      }),
      part({
        id: "b",
        intervalMs: 30_000,
        fetch: () => {
          order.push("b");
          return Promise.resolve("ok");
        },
      }),
      part({
        id: "c",
        intervalMs: 30_000,
        fetch: () => {
          order.push("c");
          return Promise.resolve("ok");
        },
      }),
    ]);

    // A sweep at the stagger's own granularity: `a` is due immediately, `b` and
    // `c` at 10s and 20s. All three fire eventually and not in one instant.
    await h.tick(1);
    expect(order, "only the unstaggered part is due").toEqual(["a"]);
    await h.tick(10_000);
    expect(order).toEqual(["a", "b"]);
    await h.tick(10_000);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("T4.21b (C24 I12, F22): the view arm carries gapBefore, as the entry arm does", async () => {
    // **T1.35b's property, on the arm that could not hold it.** That row asserts
    // a refresh keeps the declared block's `gapBefore` and it drives a
    // *transcript entry*, where `currentPanel` reads the real block. The view
    // arm reconstructed the panel through `livePanel`, which sets no gap — so
    // `existing?.gapBefore === true` was structurally false here and only here,
    // and C24 I12 says `b.live` behaves identically in both.
    //
    // **Neither half of the suite could see it**: this file's `viewPanel` double
    // and `document-view.test.ts`'s both returned the panel's child, reproducing
    // the production defect rather than standing in for the interface. A fake
    // that is wrong in the same way as the code cannot fail on the difference.
    const h = harness();
    const declared = { ...panel("p", "panel", raw("p-c", "…")), gapBefore: true } as Block;
    h.views.set("dash", [declared]);

    h.driver.declare({ kind: "view", id: "dash" }, [part({ id: "p" })]);
    await h.tick();

    const after = h.views.get("dash")?.find((b) => b.id === "p");
    // The control first: a refresh that did not happen satisfies the claim below
    // by leaving the declared block in place, gap and all.
    expect(
      after?.kind === "panel" && after.children[0]?.kind === "raw" && after.children[0].text,
      "the control: it really did refresh",
    ).toBe("ok");
    expect(after?.gapBefore, "and the rhythm survived the replacement").toBe(true);
  });

  it("T4.21 (C24 I12): a pushed view is driven by the same loop, and release stops it", async () => {
    // **The host arm with no shell-level producer.** Nothing in the tree pushes
    // an app-supplied view yet — that is C22 §13's undecided ruling, which C25
    // narrowed and did not close — so this drives the seam directly rather than
    // through a route that does not exist. What it proves is C24 I12's half that
    // is provable today: one loop, two hosts, no second code path.
    let calls = 0;
    const h = harness();
    h.views.set("dash", [panel("p", "panel", raw("p-c", "…"))]);
    const host: RefreshHost = { kind: "view", id: "dash" };

    h.driver.declare(host, [
      part({
        id: "p",
        fetch: () => {
          calls += 1;
          return Promise.resolve("live");
        },
      }),
    ]);

    await h.tick();
    const shownInView = h.views.get("dash")?.[0];
    expect(
      shownInView?.kind === "panel" && shownInView.children[0]?.kind === "raw"
        ? shownInView.children[0].text
        : null,
      "the view's part was patched through C15's seam",
    ).toBe("live");

    h.driver.release(host);
    const at = calls;
    for (let i = 0; i < 3; i += 1) await h.tick(60_000);
    expect(calls, "and the pop stopped it").toBe(at);
  });

  it("T2.20 (I32): dispose stops every host, whatever state it was in", async () => {
    let calls = 0;
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]), {
      streaming: true,
    });
    h.views.set("v", [panel("p", "p", raw("p-c", "…"))]);

    const counting = (pid: string) =>
      part({
        id: pid,
        fetch: () => {
          calls += 1;
          return Promise.resolve("ok");
        },
      });
    h.driver.declare({ kind: "entry", id }, [counting("a")]);
    h.driver.declare({ kind: "view", id: "v" }, [counting("p")]);

    await h.tick();
    expect(calls, "the control: both ran").toBe(2);

    h.driver.dispose();
    for (let i = 0; i < 3; i += 1) await h.tick(60_000);
    expect(calls, "and neither ran again").toBe(2);
  });
});

// C23 §3c/§3d — sources, derivations and the off-screen pause.
//
// **Two artefacts produced these rows and they are indexed differently.** §8c is
// a sequence trace and §8d a classification table: the first finds interactions
// that need an event in between, the second finds rules that both hold at rest.
// A row governed by one rule restates that rule and finds nothing, so every row
// here is a cell where two correct statements overlap.
describe("C23 §3c — one source behind several parts", () => {
  it("T1.39 (I42, I44): two parts naming one key fetch once and read one sample", async () => {
    // **The control is the same pair without the key**, and it must show two
    // calls and two values. Without it this row passes against a driver that
    // fetches nothing at all — and the two-values half *is* the defect F91 was
    // filed on, measured at 19 against 20 before any of this existed.
    const unshared = harness();
    let un = 0;
    const uid = unshared.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    const bump = () => {
      un += 1;
      return Promise.resolve(un);
    };
    unshared.driver.declare({ kind: "entry", id: uid }, [
      part({ id: "a", fetch: bump }),
      part({ id: "b", fetch: bump }),
    ]);
    await unshared.tick();
    expect(un, "the control: two parts, two polls").toBe(2);
    expect(
      [shown(unshared, uid, "a"), shown(unshared, uid, "b")],
      "the control: and two samples of one instant, which is the defect",
    ).toEqual(["1", "2"]);

    const h = harness();
    let calls = 0;
    const id = h.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    const one = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    h.driver.declare({ kind: "entry", id }, [
      part({ id: "a", source: "stats", fetch: one }),
      part({ id: "b", source: "stats", fetch: one }),
    ]);

    await h.tick();
    expect(calls, "one key, one poll").toBe(1);
    expect([shown(h, id, "a"), shown(h, id, "b")], "and one sample in both").toEqual(["1", "1"]);
  });

  it("T1.40 (I43, §8d D1): one key with two intervals is refused in the losing panel", async () => {
    // **Asserted on the rendered block, not on a throw**, and the difference was
    // measured rather than argued. Thrown from `declare` the refusal lands in
    // `appendAndCommit`'s bare catch with the entry already appended, so the
    // author gets two panels at `◌ loading` for the session and nothing anywhere
    // says why — which a `toThrow()` row would have passed against happily.
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    const counting = () => {
      calls += 1;
      return Promise.resolve("ok");
    };
    h.driver.declare({ kind: "entry", id }, [
      part({ id: "a", source: "stats", intervalMs: 2_000, fetch: counting }),
      part({ id: "b", source: "stats", intervalMs: 10_000, fetch: counting }),
    ]);

    expect(shown(h, id, "b"), "both parts and both values, where the author is looking").toBe(
      'err:live source "stats" is declared with two intervals: ' +
        '"a" says 2000ms and "b" says 10000ms. One source has one cadence.:none',
    );
    // **The second half: a refusal that still polls is not one.** Only "a" runs.
    for (let i = 0; i < 3; i += 1) await h.tick(60_000);
    expect(calls, "the winner polls and the refused part does not").toBeGreaterThan(0);
    expect(shown(h, id, "b"), "and the refused panel still says why").toContain("two intervals");

    // §8d D3 — a one-shot sharing with a periodic part is this rule and not a
    // second case. `0 !== N`, so it takes the same message. T3.31.
    const g = harness();
    const gid = g.transcript.append(
      docWith([panel("c", "c", raw("c-c", "…")), panel("d", "d", raw("d-c", "…"))]),
    );
    g.driver.declare({ kind: "entry", id: gid }, [
      part({ id: "c", source: "shots", intervalMs: 0 }),
      part({ id: "d", source: "shots", intervalMs: 2_000 }),
    ]);
    expect(shown(g, gid, "d")).toContain('"c" says 0ms and "d" says 2000ms');
  });

  it("T1.41 (I47): a derivation folds once per version, not once per part", async () => {
    const h = harness();
    let computes = 0;
    let calls = 0;
    const id = h.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    // A fold: `prev` carries the accumulation. **Three versions, because two pass
    // against an implementation that recomputes from scratch each time** — the
    // first is indistinguishable either way and the second only differs by one.
    const ring = {
      key: "ring",
      compute: (data: unknown, prev: unknown): unknown => {
        computes += 1;
        return [...((prev as number[] | undefined) ?? []), data as number];
      },
    };
    const one = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        source: "stats",
        derive: ring,
        fetch: one,
        render: (d) => raw("a-c", (d as number[]).join(",")),
      }),
      part({
        id: "b",
        source: "stats",
        derive: ring,
        fetch: one,
        render: (d) => raw("b-c", (d as number[]).join(",")),
      }),
    ]);

    for (let i = 0; i < 3; i += 1) await h.tick(60_000);
    expect(calls, "three polls").toBe(3);
    expect(computes, "and three folds, not six").toBe(3);
    expect(shown(h, id, "a"), "the accumulation, not the latest sample").toBe("1,2,3");
    expect(shown(h, id, "b"), "and both parts read the same one").toBe("1,2,3");
  });

  it("T1.42 (I45, §8c C3): release-then-declare at settlement keeps the fold", async () => {
    // **The assertion is the history and not the current value.** A source
    // destroyed between the release and the declare renders a perfectly correct
    // latest sample, so a row reading the newest number passes against the defect.
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]), {
      streaming: true,
    });
    const ring = {
      key: "ring",
      compute: (data: unknown, prev: unknown): unknown => [
        ...((prev as number[] | undefined) ?? []),
        data as number,
      ],
    };
    const declare = (): void =>
      h.driver.declare({ kind: "entry", id }, [
        part({
          id: "a",
          source: "stats",
          derive: ring,
          fetch: () => {
            calls += 1;
            return Promise.resolve(calls);
          },
          render: (d) => raw("a-c", (d as number[]).join(",")),
        }),
      ]);

    declare();
    for (let i = 0; i < 2; i += 1) await h.tick(60_000);
    expect(shown(h, id, "a"), "the control: it accumulated").toBe("1,2");

    // I33a's ordering: C13 emits `settle` synchronously, so the driver's teardown
    // runs inside this call and the re-declaration follows it.
    h.transcript.settle(id, docWith([panel("a", "a", raw("a-c", "1,2"))]));
    declare();
    await h.tick(60_000);
    expect(shown(h, id, "a"), "and the fold survived the settle").toBe("1,2,3");
  });

  it("T1.44 (I42, §8d D5): a declared key cannot spell an implicit one", async () => {
    // A fabricated violation. The namespaces are disjoint by construction, so
    // without a row that tries to forge one this invariant has nothing to be
    // wrong about — and the failure it prevents is two unrelated parts sharing a
    // fetch while looking *more* self-consistent than the defect being fixed.
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    const one = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    h.driver.declare({ kind: "entry", id }, [
      // "a" declares nothing, so its key is the implicit one for this host.
      part({ id: "a", fetch: one }),
      // "b" spells that key as literally as a consumer could.
      part({ id: "b", source: `entry:${id}:a`, fetch: one }),
    ]);

    await h.tick();
    expect(calls, "two sources, because the namespaces do not meet").toBe(2);
  });

  it("T3.33 (I21, §8d D6): each part renders its own error; the source backs off once", async () => {
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(
      docWith([panel("a", "a", raw("a-c", "…")), panel("b", "b", raw("b-c", "…"))]),
    );
    const failing = () => {
      calls += 1;
      return Promise.reject(new Error("far side"));
    };
    h.driver.declare({ kind: "entry", id }, [
      part({ id: "a", source: "stats", intervalMs: 1_000, fetch: failing }),
      part({
        id: "b",
        source: "stats",
        intervalMs: 1_000,
        fetch: failing,
        renderError: (err) => raw("b-c", `mine:${err.message}`),
      }),
    ]);

    await h.tick();
    // **Rendering is the part's**: the override is honoured beside the default.
    expect(shown(h, id, "a"), "the framework's arm").toBe("err:far side:2000");
    expect(shown(h, id, "b"), "and the overridden one, side by side").toBe("mine:far side");
    // **Backoff is the source's**, counted once. Doubling per referrer would put
    // the retry at 4000 after one failure rather than 2000.
    expect(calls, "one poll, one failure").toBe(1);
  });

  it("T2.25 (I32, I45): a host whose parts are all finished releases its sources", async () => {
    // **A leak with no symptom, found by reading the diff.** A one-shot host was
    // dropped from the map directly rather than through `release`, so its parts
    // stayed in the source's referring set, the source was never retired, and the
    // map grew for the session. Nothing fails: a `done` source does not poll.
    //
    // Asserted on the driver being able to re-declare the same key at a *different*
    // interval, which a surviving source refuses (I43) and a retired one accepts.
    const h = harness();
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]));
    h.driver.declare({ kind: "entry", id }, [
      part({ id: "a", source: "shots", intervalMs: 0 }),
    ]);
    await h.tick();
    // Two sweeps: the first finishes the one-shot and releases the host, the
    // second retires the source now that nobody refers to it (I45).
    await h.tick(60_000);
    await h.tick(60_000);

    const g = h.transcript.append(docWith([panel("b", "b", raw("b-c", "…"))]));
    h.driver.declare({ kind: "entry", id: g }, [
      part({ id: "b", source: "shots", intervalMs: 2_000 }),
    ]);
    expect(shown(h, g, "b"), "the key was free, so no refusal was drawn").not.toContain(
      "two intervals",
    );
  });

  it("T2.23 (I44): one commit per source tick, whatever the number of parts", async () => {
    // The frame count cannot see this — C03 coalesces `stream` into one frame
    // either way (33 ms window) — so the assertion is on the commits, which is
    // what `rev` bumps and C14 invalidations follow.
    const counts: number[] = [];
    for (const n of [1, 2, 5]) {
      const h = harness();
      const ids = Array.from({ length: n }, (_, i) => `p${String(i)}`);
      const id = h.transcript.append(docWith(ids.map((p) => panel(p, p, raw(`${p}-c`, "…")))));
      h.driver.declare(
        { kind: "entry", id },
        ids.map((p) => part({ id: p, source: "stats" })),
      );
      await h.tick();
      counts.push(h.commits.filter((c) => c === "stream").length);
    }
    expect(counts, "one, three times").toEqual([1, 1, 1]);
  });
});

describe("C23 §3d — a source does not poll while nothing is looking", () => {
  it("T1.43 (I46): off screen stops the fetch; back on screen resumes it at once", async () => {
    // **Both halves in one row**, because a driver that pauses and never resumes
    // satisfies the first — and the resume is *immediately*, not on the next
    // interval, which is the half a coarse re-check would fail.
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]));
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        intervalMs: 1_000,
        fetch: () => {
          calls += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);

    await h.tick(2_000);
    expect(calls, "the control: it was polling").toBe(1);

    h.hidden.add(`entry:${id}`);
    for (let i = 0; i < 4; i += 1) await h.tick(60_000);
    expect(calls, "and stopped while nobody was looking").toBe(1);

    h.hidden.delete(`entry:${id}`);
    h.driver.visibilityChanged();
    await h.tick(0);
    expect(calls, "and was due the moment it came back").toBe(2);
  });

  it("T2.24 (I46, I33): pausing releases nothing", async () => {
    // A paused part is still declared, which is the difference between I46 and
    // I33's five triggers — and the one the ruling turns on. If the pause were a
    // release, coming back would find nothing to resume and the panel would sit
    // at whatever it last held for the life of the session.
    const h = harness();
    let calls = 0;
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]));
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        intervalMs: 1_000,
        fetch: () => {
          calls += 1;
          return Promise.resolve(String(calls));
        },
      }),
    ]);

    h.hidden.add(`entry:${id}`);
    for (let i = 0; i < 3; i += 1) await h.tick(60_000);
    expect(calls, "paused before it ever ran").toBe(0);
    expect(shown(h, id, "a"), "and the loading state is untouched, not torn down").toBe("…");

    h.hidden.delete(`entry:${id}`);
    h.driver.visibilityChanged();
    await h.tick(0);
    expect(shown(h, id, "a"), "the declaration survived the pause").toBe("1");
  });

  it("T3.32 (I45, §8c C2): a resolution with no referrers is dropped, not a failure", async () => {
    // Nothing failed, so nothing backs off. Backing off here would make a source
    // that lost its readers poll *more slowly* when they come back, which is the
    // opposite of what the pause promises.
    const h = harness();
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const id = h.transcript.append(docWith([panel("a", "a", raw("a-c", "…"))]));
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        intervalMs: 1_000,
        fetch: () => {
          calls += 1;
          return new Promise<string>((r) => {
            release = r;
          });
        },
      }),
    ]);

    await h.tick(2_000);
    expect(calls, "the control: one fetch is in flight").toBe(1);

    h.driver.release({ kind: "entry", id });
    release("ok");
    await h.tick(0);

    // Re-declared: if the resolution above had been read as a failure the source
    // would now be waiting out a doubled interval rather than polling.
    h.driver.declare({ kind: "entry", id }, [
      part({
        id: "a",
        intervalMs: 1_000,
        fetch: () => {
          calls += 1;
          return Promise.resolve("ok");
        },
      }),
    ]);
    await h.tick(1_000);
    expect(calls, "and the next declaration polls on its own interval").toBe(2);
  });
});
