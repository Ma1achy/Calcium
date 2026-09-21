// C04 I109 / C09 I53 — the ink ramps, held to the design registry rather than to
// a list this file keeps.
//
// **The first test in the tree that reads `calcium-registry.json`, and that is
// the point.** `docs/design/language/` is normative for appearance (CLAUDE.md,
// `AUTHORITY.md`), so a union of effect names is a *projection* of the registry
// and not a second record of it. T2.117 writes the twenty-four out as a literal,
// because a literal is what a reader checks; this file is what catches the
// rename, the addition and the quiet drop, none of which a literal can see —
// it agrees with itself for ever.
//
// **Read as data, compared by equality.** A subset check would let an effect the
// design retired outlive its reason unread, which is the shape
// `compare-exemption-lists-by-equality` was written for. Both directions: a ramp
// added to the registry and not built fails here, and one built and not
// registered fails here too.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { RAMP_ANIMATIONS, RAMP_FILLS, RAMP_ONE_SHOTS } from "../../src/data/viewmodel/types.js";
import type { RampAnimation } from "../../src/data/viewmodel/types.js";
import { animateT } from "../../src/presentation/blocks/ramp.js";

type RampRecord = Readonly<{ id: string; kind: string; direction?: string; semantic?: string }>;

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(
  readFileSync(resolve(here, "../../docs/design/language/calcium-registry.json"), "utf8"),
) as Readonly<{ ramps: readonly RampRecord[] }>;

const current = registry.ramps.filter((r) => (r as { status?: string }).status === "current");
const animated = current.filter((r) => r.kind === "animated-tone").map((r) => r.id);
const statics = current.filter((r) => r.kind === "static-tone").map((r) => r.id);

describe("C04 §3am — the ink ramps are the registry's", () => {
  it("T2.117a (C04 I109, R-MOT-012): every animated ramp the registry declares is a member, and every member but `none` is one", () => {
    // **Sorted, because the union's order is a reading convenience and the
    // registry's is a gallery order.** Neither is a claim, so comparing them
    // unsorted would make this row fail on a re-ordering that changes nothing —
    // and T2.117's literal is what pins the order the union actually ships.
    const members = RAMP_ANIMATIONS.filter((a) => a !== "none");
    expect([...members].sort(), "the union is the registry's animated ramps").toEqual([...animated].sort());
    expect(animated.length, "twenty-three, which is what §037 counts").toBe(23);
  });

  it("T2.117b (C04 I106, R-MOT-012): the five static ramps are `RampFill` and not animations", () => {
    // **The other five of the twenty-eight, and they are a different axis.** A
    // `gradient-*` says what the ink *is* across an extent; an animation says
    // what it does over time. Asserting the split here is what stops the next
    // reader adding `gradient-centre` to the union because the fixture lists all
    // twenty-eight under one heading.
    expect([...statics].sort()).toEqual([
      "gradient-centre", "gradient-linear", "gradient-map", "gradient-palette", "gradient-step",
    ]);
    for (const id of statics) {
      expect(RAMP_ANIMATIONS as readonly string[], `${id} is a fill, not an animation`).not.toContain(id);
    }
    // And the fills they project onto are the three the type carries: `centre`
    // and `linear` are both `gradient`, `map` is `gradient` with a colormap.
    expect([...RAMP_FILLS].sort()).toEqual(["gradient", "palette", "step"]);
    expect(current.length, "twenty-eight registered effects").toBe(28);
  });

  it("T2.117c (C04 I109): every effect is a value in [0, 1], at every tick, for every cell", () => {
    // **The property that makes R-MOT-005 hold structurally.** An animation may
    // change a cell's colour, opacity or brightness and nothing else — so every
    // effect has to be a number the fill is sampled at, and one outside `[0, 1]`
    // would be a sample off the end of the ramp rather than a brighter cell.
    //
    // Swept over an extent of one as well, because `extentT` returns the
    // midpoint for a single cell and several of these divide by `n − 1`.
    for (const effect of RAMP_ANIMATIONS) {
      for (const n of [1, 2, 3, 10, 40]) {
        for (let k = 0; k < 130; k += 1) {
          for (let i = 0; i < n; i += 1) {
            const t = animateT(effect, n <= 1 ? 0.5 : i / (n - 1), k, n, i, 0);
            expect(Number.isFinite(t), `${effect} n=${String(n)} k=${String(k)} i=${String(i)}`).toBe(true);
            expect(t, `${effect} n=${String(n)} k=${String(k)} i=${String(i)}`).toBeGreaterThanOrEqual(0);
            expect(t, `${effect} n=${String(n)} k=${String(k)} i=${String(i)}`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("T2.117d (C04 I109): a one-shot with no stamp holds its first frame, and a started one ends and stays ended", () => {
    // **Three facts a one-shot has that a loop does not**, and the first is the
    // one that would otherwise be a defect nobody sees: with no `since` the
    // effect must draw frame 0 and hold, because *unstarted* and *finished* are
    // different facts and replaying on every render is neither.
    const n = 8;
    for (const effect of RAMP_ONE_SHOTS) {
      const unstarted = (k: number): number[] =>
        Array.from({ length: n }, (_v, i) => animateT(effect, i / (n - 1), k, n, i));
      expect(unstarted(40), `${effect}: unstarted holds frame 0`).toEqual(unstarted(0));

      // Started, it moves — or the stamp is a field nothing reads.
      const at = (k: number): number[] =>
        Array.from({ length: n }, (_v, i) => animateT(effect, i / (n - 1), k, n, i, 0));
      expect(at(2), `${effect}: a started one-shot moves`).not.toEqual(at(0));

      // And it settles: two ticks far past any duration are the same frame.
      expect(at(400), `${effect}: it ends`).toEqual(at(300));
    }

    // **The eighteen periodic effects do not read the stamp**, which is the
    // other half and is why `since` is refused on them at the gate. `drift` is
    // excluded by construction: it takes a position phase, and its two periods
    // are 37 and 53, so it is the one effect whose repeat is longer than any
    // window this row could sweep.
    const periodic = RAMP_ANIMATIONS.filter((a) => a !== "none" && !RAMP_ONE_SHOTS.has(a));
    for (const effect of periodic) {
      for (let k = 0; k < 60; k += 1) {
        for (let i = 0; i < n; i += 1) {
          const t = i / (n - 1);
          expect(animateT(effect, t, k, n, i, 5), `${effect} ignores since`).toBe(animateT(effect, t, k, n, i));
        }
      }
    }
  });

  it("T2.117e (C04 I109, R-MOT-005): each effect's defining property, one row per claim the registry makes", () => {
    const n = 12;
    const row = (effect: RampAnimation, k: number, since?: number): number[] =>
      Array.from({ length: n }, (_v, i) => animateT(effect, i / (n - 1), k, n, i, since));
    const flat = (r: readonly number[]): boolean => new Set(r.map((v) => v.toFixed(6))).size === 1;

    // **Position or not**, which is `direction` in the registry. An effect with
    // `direction: "none"` moves the whole extent together and one with a
    // direction does not — and getting these the wrong way round is the defect
    // that reads as correct, because both animate.
    for (const effect of ["breathe", "pulse", "heartbeat", "flicker", "neon"] as const) {
      expect(flat(row(effect, 3)), `${effect} has no position`).toBe(true);
    }
    for (const effect of ["shimmer", "sweepbar", "pendulum", "chase", "marquee", "twinkle", "scatter"] as const) {
      const moves = [0, 1, 2, 3, 4, 5, 6].some((k) => !flat(row(effect, k)));
      expect(moves, `${effect} varies across the extent`).toBe(true);
    }

    // `glint` rests: §037's *seconds apart* is the dead interval, and an effect
    // that never rests is `shimmer` under another name.
    expect(flat(row("glint", n + 20)) && row("glint", n + 20)[0] === 0, "glint rests between passes").toBe(true);

    // `converge` is symmetric about the centre and `bookend` is its reverse —
    // both `edges-to-centre`, differing in which end of the motion you watch.
    for (const effect of ["converge", "bookend"] as const) {
      for (const k of [0, 1, 2, 3]) {
        const r = row(effect, k);
        expect(r.map((v) => v.toFixed(4)), `${effect} at ${String(k)} is symmetric`).toEqual(
          [...r].reverse().map((v) => v.toFixed(4)),
        );
      }
    }
    expect(row("converge", 0), "and they are not the same effect").not.toEqual(row("bookend", 0));

    // `pendulum` reverses rather than wrapping — *searching*, and a search that
    // wrapped would be a scan. The band's centre goes up then comes back.
    const peak = (k: number): number => row("pendulum", k).indexOf(Math.max(...row("pendulum", k)));
    expect(peak(2), "out").toBeGreaterThan(peak(0));
    expect(peak(2 * (n - 1) - 2), "and back").toBeLessThan(peak(n - 1));

    // `marquee` wraps, which is why it is periodic and not a one-shot: the frame
    // at one full extent later is the frame you started with.
    expect(row("marquee", n), "marquee wraps").toEqual(row("marquee", 0));

    // `drift` does not repeat inside any window a session will show. 37 · 53 is
    // its true period; asserted as *not equal* across the shorter one, which is
    // the claim §037 actually makes.
    expect(row("drift", 37), "drift does not repeat at 37").not.toEqual(row("drift", 0));
    expect(row("drift", 53), "nor at 53").not.toEqual(row("drift", 0));

    // `flicker` is *low*: the amplitude is part of the meaning, not a detail.
    for (let k = 0; k < 200; k += 1) expect(row("flicker", k)[0]!).toBeLessThanOrEqual(0.35);

    // `wipe` is a hard edge and `sweep` is a band — *cleanly* against *one pass*.
    // Asserted on the values a cell can take, which is where the difference is.
    const wipeValues = new Set([0, 1, 2, 3, 4].flatMap((k) => row("wipe", k, 0).map((v) => v.toFixed(3))));
    expect([...wipeValues].sort(), "wipe has two states and no fade").toEqual(["0.000", "1.000"]);
    expect(
      [0, 1, 2, 3, 4].flatMap((k) => row("sweep", k, 0)).some((v) => v > 0 && v < 1),
      "sweep fades",
    ).toBe(true);

    // The two that end at opposite frames, because *done* and *arrived once* are
    // different states. `sweep` finishes full; `pop` finishes at rest.
    expect(row("sweep", 500, 0).every((v) => v === 1), "sweep ends done").toBe(true);
    expect(row("pop", 500, 0).every((v) => v === 0), "pop ends settled").toBe(true);

    // `typewriter` reveals inline-start first, and it reveals by *brightening* —
    // which is what keeps it inside R-MOT-005 and out of `measure`'s way. The
    // count of lit cells only ever grows.
    const lit = (k: number): number => row("typewriter", k, 0).filter((v) => v > 0).length;
    for (let k = 1; k < n; k += 1) expect(lit(k), `typewriter at ${String(k)}`).toBeGreaterThanOrEqual(lit(k - 1));
    expect(row("typewriter", 1, 0)[0], "inline-start first").toBe(1);
    expect(row("typewriter", 1, 0)[n - 1], "and the far end last").toBe(0);

    // `ripple` leaves the centre: at an early tick the middle is brighter than
    // the ends, and later the ends are brighter than the middle.
    const early = row("ripple", 1, 0);
    const late = row("ripple", 9, 0);
    expect(early[n / 2]!, "ripple starts in the middle").toBeGreaterThan(early[0]!);
    expect(late[0]!, "and reaches the ends").toBeGreaterThan(late[n / 2]!);
  });

  it("T2.117g (C04 I109): two one-shots in one frame time independently", () => {
    // **The half the deferral got wrong, asserted rather than argued.** §3am
    // named the missing symbol as `RenderContext.since` — one value for a whole
    // frame — and a frame-wide stamp makes every one-shot in a document start at
    // the same moment. That is not a smaller version of the right mechanism; it
    // is a different one, and it is wrong for the first document that carries
    // two, which is the ordinary case: a call settles, then a second settles
    // four ticks later, and both draw a `sweep`.
    //
    // The stamp is on the effect, so this is a construction and not a claim: two
    // ramps, two stamps, one tick, and the frames differ. Nothing in `src/`
    // holds a frame-wide stamp, and the assertion below is what would fail if
    // one were introduced and read in preference.
    const n = 10;
    const frame = (since: number, k: number): number[] =>
      Array.from({ length: n }, (_v, i) => animateT("sweep", i / (n - 1), k, n, i, since));

    const early = frame(0, 6);
    const late = frame(4, 6);
    expect(late, "started four ticks apart, they are four ticks apart").not.toEqual(early);
    expect(late, "and the later one is where the earlier one was").toEqual(frame(0, 2));

    // And they converge only by both finishing, which is the one moment a
    // frame-wide stamp would also produce — so the row asserts the difference at
    // a tick where both are still running, not merely somewhere.
    expect(early.some((v) => v > 0 && v < 1) || late.some((v) => v > 0 && v < 1), "both still running").toBe(true);
    expect(frame(0, 500), "and at rest they agree").toEqual(frame(4, 500));

    // **All five, because `sweep` could be the only one wired.** A stamp read by
    // one arm of a switch and ignored by the other four is exactly the shape a
    // single-effect row cannot see.
    for (const effect of RAMP_ONE_SHOTS) {
      const a = Array.from({ length: n }, (_v, i) => animateT(effect, i / (n - 1), 6, n, i, 0));
      const b = Array.from({ length: n }, (_v, i) => animateT(effect, i / (n - 1), 6, n, i, 4));
      expect(b, `${effect}: its stamp moves its frame`).not.toEqual(a);
    }
  });

  it("T2.117f (C04 I109): the same cell at the same tick is the same value, on every run", () => {
    // **The four irregular effects use a hash and not an RNG**, and this is the
    // row that says why it matters: a golden frame has to be the same frame
    // twice. `flicker`, `twinkle`, `scatter` and `neon`'s jitter are *irregular*
    // by the registry's own words, and irregular is not the same as random.
    for (const effect of ["flicker", "twinkle", "scatter", "neon", "drift"] as const) {
      for (let k = 0; k < 50; k += 1) {
        for (let i = 0; i < 9; i += 1) {
          expect(animateT(effect, i / 8, k, 9, i), `${effect} ${String(k)},${String(i)}`)
            .toBe(animateT(effect, i / 8, k, 9, i));
        }
      }
    }
    // And they are not constant, or the determinism is a tautology.
    for (const effect of ["flicker", "twinkle", "scatter"] as const) {
      const seen = new Set(Array.from({ length: 60 }, (_v, k) => animateT(effect, 0.5, k, 9, 4)));
      expect(seen.size, `${effect} varies`).toBeGreaterThan(1);
    }
  });
});
