/**
 * The data behind every form, as a function of **phase**.
 *
 * **One generator, two consumers, and that is what makes the animated version
 * free.** A static figure is `phase 0`; an animated one is a `b.live` part
 * incrementing it. Writing the two separately is how they come to disagree —
 * and a demo whose animation shows something its static frame cannot is a demo
 * of two different systems.
 *
 * Deterministic throughout: the same phase gives the same figure, so a frame
 * can be compared with itself and the golden-frame discipline still applies to
 * anything built on this.
 */

/** A small LCG — reproducible, and no dependency for six lines of arithmetic. */
function rng(seed: number): () => number {
  let s = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** A smooth walk of `n` points, drifting with `phase`. */
export function wave(n: number, phase: number, seed = 1, amp = 1, base = 0): number[] {
  const r = rng(seed);
  const jitter = Array.from({ length: n }, () => r() - 0.5);
  return Array.from({ length: n }, (_, i) => {
    const t = (i + phase) / 6;
    return base + amp * (Math.sin(t) + 0.45 * Math.sin(t * 2.3 + seed) + 0.3 * (jitter[i] ?? 0));
  });
}

/** Non-negative, for the forms whose datum is a magnitude. */
export function magnitudes(n: number, phase: number, seed = 1, scale = 30): number[] {
  return wave(n, phase, seed, 1, 1.6).map((v) => Math.max(0.4, v) * scale);
}

/** A row-major matrix, for the nine forms whose figure is a field. */
export function field(rows: number, cols: number, phase: number, seed = 3): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const t = (c + phase) / 5;
      return (
        0.5 +
        0.45 * Math.sin(t + r * 0.7 + seed) * Math.cos((r - rows / 2) / 2.2)
      );
    }),
  );
}

/** Five-number summaries that breathe with phase. */
export type Summary = Readonly<{
  min: number; q1: number; median: number; q3: number; max: number;
  mean?: number; outliers?: readonly number[];
}>;

export function summaries(n: number, phase: number, seed = 5): Summary[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 6 + 3 * Math.sin((i + phase) / 3 + seed) + i * 1.4;
    const spread = 1.2 + 0.5 * Math.abs(Math.cos((i + phase) / 4));
    return {
      min: c - spread * 2.6, q1: c - spread, median: c,
      q3: c + spread, max: c + spread * 2.4, mean: c + 0.15,
      ...(i === 1 ? { outliers: [c + spread * 4.1] } : {}),
    };
  });
}

/** The nested budget — leaves breathe, parents stay the sum of their children. */
export type Node = Readonly<{ label: string; value: number; children?: readonly Node[] }>;

export function budget(phase: number): Node {
  const leaf = (label: string, base: number, i: number): Node => ({
    label,
    value: Math.max(4, Math.round(base + 5 * Math.sin((phase + i * 2) / 4))),
  });
  const kids = (label: string, cs: readonly Node[]): Node => ({
    label,
    value: cs.reduce((t, c) => t + c.value, 0),
    children: cs,
  });
  return kids("frame", [
    kids("paint", [leaf("raster", 21, 0), leaf("fill", 17, 1), leaf("blend", 8, 2)]),
    kids("layout", [leaf("measure", 18, 3), leaf("wrap", 13, 4)]),
    leaf("compose", 23, 5),
  ]);
}

export const STAGES = ["measure", "layout", "paint", "compose"] as const;
export const WIDTHS = ["1280w", "1600w", "1920w", "2560w"] as const;
export const CORES = ["core 0", "core 1", "core 2", "core 3", "core 4", "core 5"] as const;
