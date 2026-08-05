/**
 * Gap 1's ring buffer — the history `b.live` does not keep.
 *
 * S02 gap 1: S3's plot and S4's sparkline both want a value *across ticks*, and
 * `b.live` re-renders from the latest fetch alone. Docker emits an instant with
 * no timestamp and `AdapterContext` carries no clock (C07 I1), so the app
 * accumulates, and the only ordinate it can honestly use is **the tick index**.
 *
 * Every ruling here is S3_WALK.md's.
 *
 * **Ticks and samples are counted separately, and that is the whole design**
 * (walk A2). `Series.values` is `readonly number[]` and has no gap value, so a
 * tick that produced nothing cannot be drawn. The three candidates were: repeat
 * the last sample (a flat run that never happened), push zero (a cliff to idle,
 * when the container is not idle but absent — DASHBOARD_WALK A3), or drop it and
 * let sixty samples spanning ninety seconds render exactly like sixty spanning
 * sixty.
 *
 * The third is right, and it is only honest because the gap is *counted*.
 * `58 samples · 63 ticks` is a statement a reader can check; "the axis is
 * unreliable across a stall" is a disclaimer nobody can act on. The caption
 * reports both numbers, always, so their agreement is as visible as their
 * divergence.
 *
 * **`began` is separate from `took` for one reason** (walk A2): a fetch that
 * rejects is still a tick, and a tick counted only on success cannot see the
 * stall it exists to report. So the count is taken when the attempt starts.
 */

/** The interval, and the unit the caption is denominated in. */
export const TICK_MS = 2000;

export interface Ring {
  /**
   * An attempt began. Called at the top of `fetch`, **before it is awaited**, so
   * a rejection and a null reading are counted alike (walk A2, A8).
   */
  began(): void;
  /**
   * A reading arrived. `null` records nothing and is not an error: docker
   * reports `--` for a container that has stopped, and absent is not zero
   * (walk A8, DASHBOARD_WALK A3).
   */
  took(value: number | null): void;
  /** Oldest first, at most `cap` of them. */
  readonly values: readonly number[];
  /** Attempts, including the ones that produced nothing. */
  readonly ticks: number;
  /**
   * Attempts that produced nothing — counted, never derived.
   *
   * The first version read it off `ticks - values.length`, which is right until
   * the ring fills and then reports every dropped sample as a stall. Suppressing
   * it past `cap` was the obvious repair and it is worse: it makes a stall
   * invisible from exactly the point the view has been open long enough to have
   * one. Two correct statements — the ring drops its oldest, a missed tick
   * leaves no sample — whose overlap is a number that changes meaning partway
   * through the session.
   */
  readonly missed: number;
  readonly cap: number;
}

/**
 * The cap, from the width the document was built at.
 *
 * **A display decision, not a memory one.** `form: "line"` does no windowing —
 * the whole series spreads across the plot — so the buffer's length *is* the
 * window, and one sample per column is the density that neither downsamples nor
 * stretches. Sixty samples across 120 columns is a sparse line; two hundred
 * across 80 is noise.
 *
 * The subtraction is the frame the plot sits inside: the view's own border, the
 * panel's, and the y-axis labels. Approximate on purpose — it decides a density,
 * not a layout, and C12 owns the layout.
 *
 * **It cannot follow a resize** (FINDINGS F24). `LiveSpec.render` receives the
 * fetched data and nothing else — no width, no context — so this is fixed when
 * the view opens and a terminal resized afterwards draws the same samples at a
 * different density. Recorded rather than worked around: the app cannot reach
 * the width from inside a tick, and inventing one here would be a second place
 * the terminal's width lives, which is what C01 I13 exists to prevent.
 */
export const capFor = (width: number): number => Math.max(24, width - 12);

export function createRing(cap: number): Ring {
  const values: number[] = [];
  let ticks = 0;
  let missed = 0;
  return {
    began() {
      ticks += 1;
    },
    took(value) {
      if (value === null) {
        missed += 1;
        return;
      }
      values.push(value);
      if (values.length > cap) values.shift();
    },
    get values() {
      return values;
    },
    get ticks() {
      return ticks;
    },
    get missed() {
      return missed;
    },
    cap,
  };
}

/**
 * The axis, said in the only units that are true.
 *
 * **Not `-60s ──── now`**, which is what S02's drawing has and what a reader
 * expects. That label claims a duration, and the buffer has no clock: it has a
 * count of attempts and a count of readings. While the driver ticks on schedule
 * the two are the same statement, and across a stall they are not — which is
 * exactly the period someone opens this view to look at.
 *
 * So the caption says both counts and the interval, and lets the reader do the
 * multiplication knowing what it rests on. When they diverge it says so
 * outright, because a difference of five in two numbers on one line is easier to
 * miss than a clause naming it.
 */
export function axisCaption(ring: Ring): string {
  const base = `${String(ring.ticks)} ticks · ${String(TICK_MS / 1000)}s each`;
  // A total over the view's life, not over the window, and it says `returned
  // nothing` rather than naming a duration for the same reason the rest of the
  // caption does: what is known is how many attempts produced no reading, and
  // how long they took is not.
  return ring.missed === 0 ? base : `${base} · ${String(ring.missed)} returned nothing`;
}
