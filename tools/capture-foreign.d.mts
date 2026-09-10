/**
 * The three pure exports `capture-foreign.mjs` shares with its drivers.
 *
 * **Only the three.** The rest of the file is a driver — `node-pty`, `sharp`,
 * argument parsing — and declaring it here would invite a test to import the
 * driver, which is the shape *an entry that starts on import is untestable*
 * warns about. These three take a string and return a value; they are the whole
 * of what a fixture can honestly hold.
 */

/** Where a chunk may be cut without splitting an escape sequence. */
export declare function atCsiBoundary(
  buf: string,
): Readonly<{ ready: string; partial: string }>;

/**
 * Strip every CSI form `painter` cannot read plus the bare C0 bytes, and say by
 * final byte — or by `\xNN` for a bare control — how many of each went.
 */
export declare function sanitizeForPainter(
  text: string,
): Readonly<{ clean: string; stripped: Record<string, number> }>;

/**
 * Rewrite the relative cursor moves `painter` has no arm for into absolute
 * `CUP`, advancing the caller's state — which is the caller's because a chunk
 * boundary falls anywhere.
 */
export declare function trackAndTranslateCursor(
  text: string,
  state: { row: number; col: number },
): string;
