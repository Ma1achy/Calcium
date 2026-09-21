// C22 I108 — the schedule C22 hands C03 dates a window from the last slot's own
// firing, floored at one sixtieth of a second (F1207).
//
// The timer is a recorder and the clock is a variable: a row states where the
// clock is when an arm lands and reads the delay the timer was handed. Each
// slot's callback arms the next inside itself, which is what C03's write does
// (C03 I17) and the only path the chain runs through.
import { describe, expect, it } from "vitest";
import { FRAME_PERIOD_MS, pacedSchedule } from "../../src/shell/paced-schedule.js";

type Armed = { ms: number; fn: () => void; disposed: boolean };

function recorder(): {
  arms: Armed[];
  schedule: (fn: () => void, ms: number) => Disposable;
  fire: () => void;
} {
  const arms: Armed[] = [];
  return {
    arms,
    schedule: (fn, ms) => {
      const entry: Armed = { ms, fn, disposed: false };
      arms.push(entry);
      return {
        [Symbol.dispose]: () => {
          entry.disposed = true;
        },
      };
    },
    fire: () => arms[arms.length - 1]?.fn(),
  };
}

describe("C22 I108 — the paced schedule (F1207)", () => {
  it("T1.63 (I108, F1207): an arm inside a late firing is shortened by the lateness, the chain holds over ten, and a lapsed, disposed, outside or fresh arm starts from now", () => {
    let now = 0;
    const timer = recorder();
    const schedule = pacedSchedule(() => now, timer.schedule);
    const last = (): number => timer.arms[timer.arms.length - 1]?.ms ?? Number.NaN;

    // **C03's write, modelled**: each slot's callback arms the next inside
    // itself while `chain` holds, and arms nothing — lapses — once it is off.
    let chain = true;
    const next = (): void => {
      if (chain) schedule(next, 16);
    };

    // **The floor.** A 16 ms window is armed at one sixtieth of a second.
    now = 100;
    schedule(next, 16);
    expect(last(), "16 is floored at 1000/60").toBeCloseTo(FRAME_PERIOD_MS, 9);

    // **A late firing.** The slot was due at 100 + 16.67; the timer fires 3 ms
    // late and the arm made inside the firing is dated from the deadline.
    now = 100 + FRAME_PERIOD_MS + 3;
    timer.fire();
    expect(last(), "the lateness is taken off the next delay").toBeCloseTo(FRAME_PERIOD_MS - 3, 9);

    // **Ten in a row**, each 1 to 3 ms late, each arming the next inside
    // itself: the tenth deadline is exactly ten sixtieths after the first.
    const first = 100 + FRAME_PERIOD_MS;
    let deadline = first + FRAME_PERIOD_MS;
    for (let k = 2; k <= 10; k += 1) {
      now = deadline + 1 + (k % 3);
      timer.fire();
      expect(last(), `arm ${String(k)} recovers its lateness`).toBeCloseTo(FRAME_PERIOD_MS - 1 - (k % 3), 9);
      deadline += FRAME_PERIOD_MS;
    }
    expect(deadline - first, "ten windows end to end").toBeCloseTo(10 * FRAME_PERIOD_MS, 9);

    // **A lapsed slot.** The last slot fires with nothing in it, and an arm
    // 2 ms later is a fresh window from now — not a window after a deadline
    // nothing drew at.
    chain = false;
    now = deadline + 1;
    const before = timer.arms.length;
    timer.fire();
    expect(timer.arms.length, "the lapsed slot armed nothing").toBe(before);
    now = deadline + 2;
    schedule(() => {}, 16);
    expect(last(), "after a lapsed slot the window is from now").toBeCloseTo(FRAME_PERIOD_MS, 9);

    // **Outside any firing** — a lone commit — is a fresh window.
    now = deadline + 40;
    schedule(() => {}, 16);
    expect(last(), "outside a firing is a fresh window").toBeCloseTo(FRAME_PERIOD_MS, 9);

    // **A disposed slot seeds nothing.**
    const slot = schedule(() => {}, 16);
    slot[Symbol.dispose]();
    expect(timer.arms[timer.arms.length - 1]?.disposed, "the underlying timer is cancelled").toBe(true);
    now = now + FRAME_PERIOD_MS + 2;
    schedule(() => {}, 16);
    expect(last(), "a cancelled window is not a deadline anything waited for").toBeCloseTo(FRAME_PERIOD_MS, 9);

    // **A longer window chains from its own deadline** and is not floored.
    now = 1000;
    schedule(() => schedule(() => {}, 80), 80);
    expect(last(), "80 is 80").toBe(80);
    now = 1000 + 80 + 2;
    timer.fire();
    expect(last(), "the spinner's cadence chains too").toBeCloseTo(78, 9);
    now = 2000;
    schedule(() => {}, 100);
    expect(last(), "100 is not floored").toBe(100);

    // **Two cadences do not chain into one another.** A session runs the
    // stream window, the spinner window and the ticker's interval at once, and
    // an arm of one length dated from another's deadline is a frame on a
    // cadence it does not belong to.
    now = 1500;
    schedule(() => schedule(() => {}, 16), 80);
    now = 1500 + 80 + 2;
    timer.fire();
    expect(last(), "a frame window inside a spinner firing is a fresh window").toBeCloseTo(
      FRAME_PERIOD_MS,
      9,
    );

    // **A zero window is the next turn**: armed at 0, and an arm inside its
    // firing chains from nothing.
    now = 3000;
    schedule(() => schedule(() => {}, 16), 0);
    expect(last(), "zero is zero").toBe(0);
    now = 3000 + 5;
    timer.fire();
    expect(last(), "the zero window seeded no deadline").toBeCloseTo(FRAME_PERIOD_MS, 9);
  });
});
