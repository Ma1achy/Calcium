/**
 * NDJSON: one patch per line, buffered across chunk boundaries, bounded.
 *
 * C06 §5 — see spec. Three rules live here and each has a failure that is only
 * visible under load:
 *
 *   - **Lines, not chunks** (I10). A JSON object split across two reads is one
 *     patch, not two malformed ones. Parsing per chunk works on every small
 *     fixture and fails on the first real stream, which is why T3.10 splits one
 *     object across three chunks deliberately.
 *   - **A 10-line floor under the 10% rule** (I12). Without it, one malformed
 *     line in the first three trips degradation on a healthy stream.
 *
 *     The ratio is running, so **degradation depends on arrival order rather
 *     than on content**, by design: a far side emitting a banner, an HTML error
 *     page or a stack trace front-loads its garbage, and nine bad lines at the
 *     start is evidence the stream is not NDJSON at all, while nine scattered
 *     through a hundred is a far side with a few odd rows. Stopping early is the
 *     job; characterising the whole stream is not.
 *
 *     And it is **sticky**. Once tripped, a well-formed line does not un-trip
 *     it — raw text has already gone out, and resuming would interleave two
 *     renderings of one stream. T3.14 ("fires once") does not catch a revert
 *     here; T3.14b does.
 *   - **A 1 MB cap** (I11). A far side emitting an unterminated stream must not
 *     be able to exhaust memory, and the bound has to release the buffer rather
 *     than merely stop growing it.
 *
 * Byte-level decoding is not here. C21 yields `AsyncIterable<string>` over a
 * streaming UTF-8 decoder (C21 I4), so a multi-byte character split across a
 * read is already one character by the time C06 sees it. What C06 buffers is
 * strings across chunk boundaries, which is a different bug with the same shape.
 */

import type { RawPatch } from "./types.js";

/** Everything but `end`, which the stream wrapper owns (I9). */
export type LinePatch = Exclude<RawPatch, { kind: "end" }>;

export const MAX_LINE_BYTES = 1_000_000;
const DEGRADE_RATIO = 0.1;
const DEGRADE_FLOOR = 10;

export interface NdjsonReader {
  /** Patches for every complete line in `chunk`, plus whatever the buffer completed. */
  push(chunk: string): LinePatch[];
  /** The final line when it arrived without a trailing newline (T3.19). */
  flush(): LinePatch[];
}

export function createNdjsonReader(): NdjsonReader {
  let buffer = "";
  let lines = 0;
  let malformed = 0;
  let degraded = false;
  /** Set when the cap trips mid-line: everything up to the next newline is one line, already reported. */
  let skipping = false;

  function classify(line: string): LinePatch {
    lines += 1;
    // Once degraded, parsing stops. The remainder is raw text as far as C07 is
    // concerned, and re-parsing it would produce a `data` patch in the middle of
    // a stream the consumer has already been told to treat as text.
    if (degraded) {
      malformed += 1;
      return { kind: "malformed", line };
    }
    try {
      return { kind: "data", value: JSON.parse(line) as unknown };
    } catch {
      malformed += 1;
      return { kind: "malformed", line };
    }
  }

  /**
   * Fires once (T3.14), and only with both conditions met (I12).
   *
   * The patch carries a reason and nothing else. C07 composes the remainder from
   * the `malformed` patches that follow this one, which is what actually
   * arrives — a `remaining` field would have to be either an empty partial line
   * or the whole rest of the stream, buffered.
   */
  function degradeIfDue(): LinePatch | null {
    if (degraded) return null;
    if (lines < DEGRADE_FLOOR) return null;
    if (malformed / lines <= DEGRADE_RATIO) return null;
    degraded = true;
    return {
      kind: "degraded",
      reason: `${String(malformed)} of ${String(lines)} lines did not parse as JSON`,
    };
  }

  function take(line: string, out: LinePatch[]): void {
    out.push(classify(line));
    const notice = degradeIfDue();
    if (notice !== null) out.push(notice);
  }

  return {
    push(chunk) {
      const out: LinePatch[] = [];
      let rest = chunk;

      for (;;) {
        const nl = rest.indexOf("\n");

        if (nl === -1) {
          if (skipping) return out;
          buffer += rest;
          // The cap: report the line, release the buffer, and discard the rest
          // of it. Keeping the buffer at the cap and continuing to append would
          // stay bounded and still be wrong — every subsequent chunk would emit
          // another malformed patch for the same line (T3.16b).
          if (buffer.length > MAX_LINE_BYTES) {
            const line = buffer.slice(0, MAX_LINE_BYTES);
            buffer = "";
            skipping = true;
            take(line, out);
          }
          return out;
        }

        const line = buffer + rest.slice(0, nl);
        rest = rest.slice(nl + 1);
        buffer = "";

        if (skipping) {
          // The tail of an over-long line, already counted when the cap tripped.
          skipping = false;
          continue;
        }
        take(line, out);
      }
    },

    flush() {
      const out: LinePatch[] = [];
      if (skipping) {
        skipping = false;
        buffer = "";
        return out;
      }
      if (buffer.length === 0) return out;
      const line = buffer;
      buffer = "";
      take(line, out);
      return out;
    },
  };
}
