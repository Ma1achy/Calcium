/**
 * Types for `animation-proof.mjs`, so its fixture can hold its output.
 *
 * **The `.mjs` files under `tools/` are untyped by construction** — they run
 * under `tsx` against `src/` and are not part of the package build — so a test
 * importing one gets `unknown` and `make check` refuses it. Every tool a test
 * consumes carries one of these beside it; this is the pattern, not an exception.
 */

/** One subject's frames, in the units its arm renders. */
export type Subject = Readonly<{
  /** `terminal` frames are ANSI strings; `svg` frames are whole documents. */
  arm: "terminal" | "svg";
  /** Milliseconds between frames — the set's own cadence, or 10 fps for a plot. */
  delay: number;
  frames: readonly string[];
}>;

/**
 * Every subject's frames, keyed by name — pure, no rasterising, no filesystem.
 *
 * Called twice by `AP7` and compared, which is the determinism the two committed
 * GIFs rest on.
 */
export declare function animationFrames(): Record<string, Subject>;

/** The subjects in catalogue order, stated once and compared against the builder. */
export declare const SUBJECT_NAMES: readonly string[];

export declare const ANIMATION_DIR: string;
export declare const MEDIA_DIR: string;

/** Writes every GIF, the first-frame sources, and the README. */
export declare function writeAnimationProof(dir?: string): Promise<{
  made: readonly Readonly<{
    name: string;
    arm: string;
    pages: number;
    delayMs: number;
    distinct: number;
    width: number;
    height: number;
  }>[];
  cost: Record<string, unknown>;
  stale: number;
}>;
