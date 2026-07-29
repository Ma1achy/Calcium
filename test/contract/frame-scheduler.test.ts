// C03 tier 2 — contract. The interface A02 §2 promises, so C13, C14, C17 and
// the shell can be written against it.
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { CommitReason } from "../../src/terminal/frame-scheduler.js";
import { capabilities } from "../support/fake-terminal.js";
import { assertSeamNarrow, harness } from "../support/fake-scheduler.js";
import { MODES } from "../support/fake-terminal.js";

/**
 * Every member of the union, listed. The annotation is the assertion: adding a
 * `CommitReason` without adding it here stops compiling, and adding one without
 * a window stops compiling in `WINDOWS` (T2.5, T6.9).
 */
const ALL_REASONS = ["input", "completion", "resize", "stream", "spinner"] as const;
const _exhaustive: readonly CommitReason[] & { length: 5 } = ALL_REASONS;
void _exhaustive;

const IMMEDIATE_REASONS = ["input", "completion", "resize"] as const;

describe("C03 contract", () => {
  it("T2.1: every member of FrameScheduler is present; the flags are getters", () => {
    const { scheduler } = harness();

    for (const member of ["commit", "flush", "invalidate"]) {
      expect(typeof (scheduler as unknown as Record<string, unknown>)[member], member).toBe(
        "function",
      );
    }

    // `readonly` is compile-time only. Assignment must not move internal state,
    // which is what implementing them as getters guarantees.
    for (const flag of ["pending", "contaminated"] as const) {
      expect(() => {
        (scheduler as unknown as Record<string, boolean>)[flag] = true;
      }, flag).toThrow();
      expect(scheduler[flag], flag).toBe(false);
    }
  });

  it("T2.2 (I8): no member accepts or returns frame content", () => {
    const { scheduler } = harness();

    // The whole surface, exactly. A frame buffer, a content parameter or a
    // `getFrame` would all show up here first (T6.8).
    expect(new Set(Object.keys(scheduler))).toEqual(
      new Set(["commit", "flush", "invalidate", "pending", "contaminated"]),
    );

    // Arity: `commit` takes a reason and nothing else; the rest take nothing.
    expect(scheduler.commit.length).toBe(1);
    expect(scheduler.flush.length).toBe(0);
    expect(scheduler.invalidate.length).toBe(0);

    // And nothing is handed back to a caller that could carry a frame.
    expect(scheduler.commit("input")).toBeUndefined();
    expect(scheduler.flush()).toBeUndefined();
    expect(scheduler.invalidate()).toBeUndefined();
  });

  it("T2.3 (I11): the injected view is `acquired` only, and C03 cannot reach C01", () => {
    const reached: string[] = [];
    // A full lifecycle, proxied. C03 must touch `acquired` and nothing else —
    // the view's *type* forbids more, and this asserts the runtime agrees.
    const view = new Proxy(
      { acquired: true, acquire: () => {}, release: () => {}, suspend: () => {} },
      {
        get(target, prop, receiver) {
          reached.push(String(prop));
          return Reflect.get(target, prop, receiver) as unknown;
        },
      },
    );

    const scheduler = createFrameScheduler({
      render: () => {},
      repaint: () => {},
      capabilities: capabilities(),
      lifecycle: view as unknown as { readonly acquired: boolean },
      write: () => {},
      schedule: () => ({ [Symbol.dispose]: () => {} }),
    });
    scheduler.commit("input");
    scheduler.commit("resize");

    expect(new Set(reached)).toEqual(new Set(["acquired"]));
  });

  it("T2.4 (I3): `pending` is true exactly while a timer is outstanding, for every reason", () => {
    for (const reason of ALL_REASONS) {
      const { scheduler, clock } = harness();
      expect(scheduler.pending, `${reason}: before`).toBe(false);

      scheduler.commit(reason);

      const immediate = (IMMEDIATE_REASONS as readonly string[]).includes(reason);
      expect(scheduler.pending, `${reason}: after commit`).toBe(!immediate);
      expect(clock.outstanding, `${reason}: timers`).toBe(immediate ? 0 : 1);

      clock.advance(200);
      expect(scheduler.pending, `${reason}: after the window`).toBe(false);
      expect(clock.outstanding, `${reason}: timers after`).toBe(0);
    }
  });

  it("T2.5: every CommitReason has a window, and only coalesced ones are configurable", () => {
    for (const reason of ALL_REASONS) {
      const configure = (): void => void harness({ windows: { [reason]: 5 } });

      // A reason whose window is configurable when it should not be lets a
      // config file introduce input lag (I2, T6.12); a reason with no window
      // entry at all would default to 0 and silently become immediate (T6.9,
      // caught at compile time by `WINDOWS` being a total Record).
      if ((IMMEDIATE_REASONS as readonly string[]).includes(reason)) {
        expect(configure, `${reason} must not be configurable`).toThrow(RangeError);
      } else {
        expect(configure, `${reason} must be configurable`).not.toThrow();
      }

      // And every reason resolves to *some* window — an unlisted one would
      // throw on the lookup rather than coalesce.
      const { scheduler, clock } = harness();
      expect(() => scheduler.commit(reason), reason).not.toThrow();
      clock.advance(200);
    }
  });

  it("T2.6 (A02 §1): C03 imports nothing from data/, and only its own mode from escapes", () => {
    expect(checkModuleGraph(["src/terminal/frame-scheduler.ts"])).toEqual([]);

    // And the rule that permits it is not vacuous: C03 reaching for one of
    // C01's modes fires MG20, while its own does not (C01 T2.8, T6.12).
    const offender = 'import { ALT_SCREEN } from "./escapes.js";';
    const violations = checkModuleGraph(
      ["src/terminal/frame-scheduler.ts"],
      () => offender,
    ).filter((v: { rule: string }) => v.rule === "MG20");
    expect(violations, "C03 importing C01's mode must fail MG20").toHaveLength(1);

    const own = 'import { SYNC_UPDATE } from "./escapes.js";';
    expect(checkModuleGraph(["src/terminal/frame-scheduler.ts"], () => own)).toEqual([]);
  });

  it("T2.7 (C13): the write seam is two strings wide, and the check that says so fires", () => {
    // The markers pass.
    expect(() => assertSeamNarrow([`${MODES.syncOn}`, `${MODES.syncOff}`])).not.toThrow();
    expect(() => assertSeamNarrow([])).not.toThrow();

    // A third string does not. Fabricated rather than trusted: a checker that
    // matches nothing looks exactly like a checker that is satisfied
    // (A03 §2, commitment 14).
    expect(() => assertSeamNarrow([`${MODES.syncOn}`, "hello world"])).toThrow(
      /not a synchronised-update marker/,
    );
  });

  it("T2.8: the timer is optional — the default needs no injection", () => {
    // `schedule` is injected so tests need not sleep, not because C03 depends
    // on being given one. Asserted without firing it: nothing here sleeps.
    const scheduler = createFrameScheduler({
      render: () => {},
      repaint: () => {},
      capabilities: capabilities(),
      lifecycle: { acquired: false },
      write: () => {},
    });

    expect(scheduler.pending).toBe(false);
    scheduler.commit("stream");
    expect(scheduler.pending).toBe(true);
    // Cancellable, so the real timer cannot outlive the test.
    scheduler.commit("input");
    expect(scheduler.pending).toBe(false);
  });
});
