/**
 * C27 — the emulator, and **the one file in `src/` that imports the terminal
 * emulation package** (C27 I11, MG28).
 *
 * The package is loaded through its CommonJS entry: the published `module` field
 * names `lib/xterm.mjs`, which the tarball does not contain, so a named ESM
 * import yields *Terminal is not a constructor* at the first `new` (F841).
 */
import xterm from "@xterm/headless";

import type { Terminal as TerminalBlock } from "../viewmodel/types.js";
import { lineOf, type LineLike } from "./snapshot.js";
import type { Emulator, EmulatorOptions } from "./types.js";

/** C27 §3 — the default cap, in lines above the screen. */
export const DEFAULT_SCROLLBACK = 2000;

type Buffer = Readonly<{
  readonly length: number;
  readonly baseY: number;
  readonly cursorX: number;
  readonly cursorY: number;
  getLine(y: number): LineLike | undefined;
}>;

/**
 * A child's screen, interpreted.
 *
 * **No clock, no I/O, no host terminal.** C27 subscribes to no `onData`, so a
 * child's terminal query goes unanswered (C27 §5); it subscribes to no `onBell`
 * or `onTitleChange`, which is how both are absorbed rather than by a branch
 * that discards them (C27 I8).
 */
export function createEmulator(opts: EmulatorOptions): Emulator {
  if (!Number.isInteger(opts.cols) || opts.cols < 1) {
    throw new Error(`createEmulator: "cols" must be a positive integer, got ${String(opts.cols)}`);
  }
  if (!Number.isInteger(opts.rows) || opts.rows < 1) {
    throw new Error(`createEmulator: "rows" must be a positive integer, got ${String(opts.rows)}`);
  }
  const scrollback = opts.scrollback ?? DEFAULT_SCROLLBACK;
  // `allowProposedApi` is what unlocks the buffer: without it every accessor
  // throws *you must set the allowProposedApi option*. The whole of C27 reads
  // through that surface, so the flag is not optional and the version is pinned
  // exactly because a proposed API is one the package may change (F847).
  const term = new xterm.Terminal({
    cols: opts.cols,
    rows: opts.rows,
    scrollback,
    allowProposedApi: true,
  });

  let rows = opts.rows;
  let disposed = false;
  let dropped = 0;
  let alternate = false;
  /**
   * The tally the cap needs, and it is **not** a count of line feeds.
   *
   * A feed is not a loss: a buffer under its cap grows instead. What is lost is
   * the excess of the rows a child produced over the rows the buffer kept, and
   * both are knowable — the feeds, and the normal buffer's own length. Measured
   * rather than reasoned: 30 feeds at `scrollback: 20, rows: 4` leaves 24 lines
   * whose first is *line 8*, so the relation is `feeds + 1 - length` and the
   * loss is 7. The `+ 1` is the line the buffer starts on, which no feed made.
   *
   * Feeds inside the alternate screen are not counted: that buffer has no
   * scrollback, so nothing there can be lost (C27 I7).
   */
  let feeds = 0;

  const bufferOf = (): Buffer => term.buffer.active as unknown as Buffer;

  const tally = (): void => {
    const normal = term.buffer.normal as unknown as Buffer;
    dropped = Math.max(0, feeds + 1 - normal.length);
  };

  term.buffer.onBufferChange((buffer: unknown) => {
    alternate = buffer === term.buffer.alternate;
  });

  term.onLineFeed(() => {
    if (!alternate) feeds += 1;
  });

  const refuseDisposed = (member: string): void => {
    if (disposed) {
      throw new Error(
        `Emulator.${member}: called after dispose — the screen is gone, and returning the last one would hide the bug`,
      );
    }
  };

  return {
    async write(chunk: string | Uint8Array): Promise<void> {
      refuseDisposed("write");
      await new Promise<void>((resolve) => {
        term.write(chunk, () => {
          resolve();
        });
      });
      tally();
    },

    resize(cols: number, next: number): void {
      refuseDisposed("resize");
      term.resize(cols, next);
      rows = next;
      tally();
    },

    snapshot(id: string): TerminalBlock {
      refuseDisposed("snapshot");
      const buffer = bufferOf();
      const lines: ReturnType<typeof lineOf>[] = [];
      const height = alternate ? rows : buffer.length;
      const from = alternate ? buffer.baseY : 0;
      for (let y = 0; y < height; y += 1) {
        const line = buffer.getLine(from + y);
        lines.push(line === undefined ? { text: "" } : lineOf(line));
      }
      if (!alternate) {
        // The screen is `rows` tall whether or not the child filled it, so the
        // rows below the cursor are the buffer's allocation and not output
        // (C27 I4). The cursor's own row is kept even when empty: it is where
        // the child is about to write.
        const cursorLine = buffer.baseY + buffer.cursorY;
        let last = lines.length - 1;
        while (last > cursorLine && (lines[last]?.text ?? "") === "") last -= 1;
        lines.length = last + 1;
      }
      const cursor = {
        line: alternate ? buffer.cursorY : Math.min(buffer.baseY + buffer.cursorY, Math.max(0, lines.length - 1)),
        col: buffer.cursorX,
      };
      return Object.freeze({
        kind: "terminal",
        id,
        cols: term.cols,
        screen: alternate ? "grid" : "lines",
        lines: Object.freeze(lines),
        cursor: Object.freeze(cursor),
        ...(dropped > 0 ? { dropped } : {}),
      }) as TerminalBlock;
    },

    get screen(): "lines" | "grid" {
      return alternate ? "grid" : "lines";
    },

    get dropped(): number {
      return dropped;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      term.dispose();
    },
  };
}
