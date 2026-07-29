/**
 * A child's output as `AsyncIterable<string>`, bounded and never blocking it.
 *
 * C21 §4, I5 — see spec.
 *
 * **The bound is on bytes delivered, not on bytes queued.** A queue-depth bound
 * sounds like the same thing and is not: a consumer reading promptly keeps the
 * queue near empty, so the bound never trips and 100 MiB travels through to a
 * consumer that accumulates it — C06's `collect` builds one string and has no
 * bound of its own. Bounding delivery is what actually keeps memory bounded on
 * the path this component exists to serve.
 *
 * **Past the bound it drops and keeps draining.** Pausing the stream is the
 * obvious alternative and it is the one that hangs: a child blocked writing to a
 * full pipe never exits, never reports, and cannot be told anything. Truncated
 * output that arrives beats complete output that does not.
 */

import { createUtf8Decoder } from "./decode.js";

export type BoundedStream = Readonly<{
  iterable: AsyncIterable<string>;
  /** Feed raw bytes from the child. */
  push(chunk: Uint8Array): void;
  /** Feed text the runner produced itself — a spawn failure's message. */
  pushText(text: string): void;
  end(): void;
  /** True once the bound was crossed and output was dropped. */
  readonly overflowed: boolean;
}>;

export function createBoundedStream(maxBytes: number): BoundedStream {
  const decoder = createUtf8Decoder();
  const queue: string[] = [];
  const waiting: ((result: IteratorResult<string>) => void)[] = [];

  let delivered = 0;
  let overflowed = false;
  let ended = false;

  const pump = (): void => {
    while (waiting.length > 0 && (queue.length > 0 || ended)) {
      const resolve = waiting.shift()!;
      const value = queue.shift();
      resolve(value === undefined ? { value: undefined, done: true } : { value, done: false });
    }
  };

  const enqueue = (text: string): void => {
    if (text === "") return;
    queue.push(text);
    pump();
  };

  return {
    push(chunk: Uint8Array): void {
      if (overflowed) return; // draining: read, decoded by nobody, dropped

      const room = maxBytes - delivered;

      if (chunk.byteLength <= room) {
        delivered += chunk.byteLength;
        enqueue(decoder.push(chunk));
        return;
      }

      // The chunk that crosses the line is delivered up to it, so the bound is
      // the number it claims to be rather than that number plus one chunk. The
      // tail is dropped undecoded — its trailing bytes may be half a character,
      // and there is no next chunk to complete it now.
      if (room > 0) {
        delivered += room;
        enqueue(decoder.push(chunk.subarray(0, room)));
      }
      overflowed = true;
    },

    pushText(text: string): void {
      enqueue(text);
    },

    end(): void {
      if (ended) return;
      // No flush once overflowed: the decoder is holding the first bytes of a
      // character whose remainder was deliberately dropped, and flushing it
      // would append a replacement mark that nothing in the child produced.
      if (!overflowed) enqueue(decoder.flush());
      ended = true;
      pump();
    },

    get overflowed(): boolean {
      return overflowed;
    },

    iterable: {
      [Symbol.asyncIterator]: (): AsyncIterator<string> => ({
        next: (): Promise<IteratorResult<string>> => {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
          if (ended) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => void waiting.push(resolve));
        },
      }),
    },
  };
}
