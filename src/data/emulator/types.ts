/**
 * C27 — the terminal emulator's port (C27 §2).
 *
 * **Declaration and behaviour are separate files**, C21 §2's pattern: this file
 * is safe for anyone to import, and `emulator.ts` is the one file that touches
 * `@xterm/headless` (C27 I11).
 */
import type { Terminal } from "../viewmodel/types.js";

export type EmulatorOptions = Readonly<{
  /** The child's width, in cells. A positive integer. */
  cols: number;
  /**
   * The screen's height, in rows — the block's declared height (C04 I47).
   *
   * **Never derived from the child**: a program asking for more rows is the
   * attach case, and a block whose height moved with its content would reflow
   * the transcript on every repaint.
   */
  rows: number;
  /** Lines kept above the screen. Default 2000 (C27 §3). */
  scrollback?: number;
}>;

export interface Emulator {
  /**
   * Interpret bytes.
   *
   * **The promise is the contract, not a convenience** (C27 I3): the parser
   * yields between chunks so a flood cannot starve the loop, and a caller that
   * snapshots before it resolves reads a consistent screen that may not yet
   * hold the chunk.
   */
  write(chunk: string | Uint8Array): Promise<void>;
  /** Reflow. Rows change only when the caller's declared height does (C27 I10). */
  resize(cols: number, rows: number): void;
  /** The block, frozen. `id` is the caller's — block ids are the shell's to choose. */
  snapshot(id: string): Terminal;
  /** `"grid"` while the child holds the alternate screen (C27 I4). */
  readonly screen: "lines" | "grid";
  /** Lines lost above the cap since construction (C27 I7). */
  readonly dropped: number;
  /** Release the buffer. Idempotent; every other member throws after it (C27 I12). */
  dispose(): void;
}
