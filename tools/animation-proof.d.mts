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
/** The subjects also written into `MEDIA_DIR` for the READMEs (F819). */
export declare const CITED_NAMES: readonly string[];
/** Encode one terminal-arm subject to `file`, as the media copy is written. */
export declare function encodeSubject(name: string, file: string): Promise<{ pages: number; width: number; height: number }>;

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

/** The bar-style sheet's file name under `MEDIA_DIR` (C24 §6). */
export declare const BAR_SHEET: string;
/** The sheet as one ANSI text: three capability arms, separated by a blank line. */
export declare function barSheetAnsi(): string;
/** The three arms — full, ascii, ambiguous-wide — each one ANSI text. */
export declare function barSheetArms(): readonly string[];
export declare function writeBarSheet(dir?: string): Promise<{ file: string; bytes: number; rows: number }>;
