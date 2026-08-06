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

function harness() {
  const transcript = createTranscriptStore();
  const commits: string[] = [];
  const views = new Map<string, Block[]>();
  let now = 0;
  const timers: { fn: () => void; at: number; live: boolean }[] = [];

  const driver = createRefreshDriver({
    transcript,
    clock: () => now,
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
const part = (
  over: Partial<Omit<ViewRefresh, "offsetMs">> & { id: string },
): Omit<ViewRefresh, "offsetMs"> => ({
  title: over.id,
  intervalMs: 30_000,
  staleAfterMs: 60_000,
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

  it("T3.32 (I21): a tick during an in-flight fetch does not start a second", async () => {
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
