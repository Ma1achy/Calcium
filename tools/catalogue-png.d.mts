/**
 * Types for `catalogue-png.mjs` — the catalogue's renderer and GIF assembler.
 *
 * Added when `test/unit/animation-proof.test.ts` came to consume `gifFrom` to
 * ask the one question a frame assertion cannot: whether the bytes coming out of
 * the encoder carry the colours that went in (F419).
 */
import type { Buffer } from "node:buffer";

/** ANSI, with SGR, to an SVG document at the catalogue's cell metrics. */
export declare function ansiToSvg(ansi: string): string;

/** An SVG document to PNG bytes. 144 is the still catalogue's 2×; 72 is 1:1. */
export declare function pngFromSvg(svg: string, density?: number): Promise<Buffer>;

/**
 * PNG pages to an animated GIF at a delay per frame.
 *
 * The channel count is read back from the raster rather than declared — see the
 * function's own header, and F419.
 */
export declare function gifFrom(
  pages: readonly Buffer[],
  delays: readonly number[],
  file: string,
  comment?: string,
): Promise<Readonly<{ width: number; height: number; pages: number; channels: number }>>;

/** The GIF with a Comment Extension carrying `text` ahead of its first image (F820). */
export declare function withGifComment(bytes: Buffer, text: string): Buffer;
/** The first Comment Extension's text, or `null` when there is none. */
export declare function gifComment(bytes: Buffer): string | null;

export declare function parseLine(raw: string): readonly unknown[];
export declare function unparsedSgr(raw: string): readonly number[];
export declare function colour256(n: number): string;
export declare function sheetBg(): Readonly<{ r: number; g: number; b: number; alpha: number }>;
export declare function renderCatalogueImages(): Promise<void>;
