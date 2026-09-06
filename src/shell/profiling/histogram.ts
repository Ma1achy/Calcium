/**
 * A log-linear histogram — HdrHistogram's bucketing, in about sixty lines.
 *
 * **The relative error is a property of the shape and is carried on every
 * value** (C28 I10). Thirty-two sub-buckets per octave bound the error at
 * `1 / (2 × 32)` = **1.5625 %**, reported as `0.016`. A percentile printed
 * without its bound gets compared across runs by a reader who does not know it
 * cannot be, which is the other half of the same mistake as a window presented
 * as a session.
 *
 * Counts live in a `Map`, so an empty histogram costs one object rather than a
 * pre-sized array of every bucket the range allows.
 */
import type { Histogram } from "./types.js";

const SUB_BITS = 5;
const SUB = 1 << SUB_BITS;

/** Relative error of the bucketing: half a sub-bucket at the widest. */
export const HISTOGRAM_ERROR = 1 / (2 * SUB);

/** ms → bucket index. Microsecond resolution in the linear region. */
function indexOf(ms: number): number {
  const u = Math.max(0, Math.round(ms * 1000));
  if (u < SUB) return u;
  const e = 31 - Math.clz32(u);
  const shift = e - SUB_BITS;
  return ((e - SUB_BITS + 1) << SUB_BITS) + ((u >>> shift) - SUB);
}

/** bucket index → the ms value at the bucket's lower edge. */
function valueOf(i: number): number {
  if (i < SUB) return i / 1000;
  const bucket = i >>> SUB_BITS;
  const sub = (i & (SUB - 1)) + SUB;
  const shift = bucket - 1;
  return (sub * Math.pow(2, shift)) / 1000;
}

export class Hist {
  readonly #counts = new Map<number, number>();
  #n = 0;
  #sum = 0;
  #min = Number.POSITIVE_INFINITY;
  #max = 0;

  get count(): number {
    return this.#n;
  }

  add(ms: number): void {
    const i = indexOf(ms);
    this.#counts.set(i, (this.#counts.get(i) ?? 0) + 1);
    this.#n += 1;
    this.#sum += ms;
    if (ms < this.#min) this.#min = ms;
    if (ms > this.#max) this.#max = ms;
  }

  /**
   * `min` and `max` are the true observed values, not bucket edges — they cost
   * two numbers and they are the two a reader checks a bound against.
   */
  snapshot(): Histogram {
    if (this.#n === 0) {
      return Object.freeze({
        count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, sum: 0, mean: 0,
        error: HISTOGRAM_ERROR,
      });
    }
    const keys = [...this.#counts.keys()].sort((a, b) => a - b);
    const at = (q: number): number => {
      const target = Math.max(1, Math.ceil(q * this.#n));
      let seen = 0;
      for (const k of keys) {
        seen += this.#counts.get(k) ?? 0;
        if (seen >= target) return valueOf(k);
      }
      return this.#max;
    };
    return Object.freeze({
      count: this.#n,
      min: this.#min,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: this.#max,
      sum: this.#sum,
      mean: this.#sum / this.#n,
      error: HISTOGRAM_ERROR,
    });
  }
}
