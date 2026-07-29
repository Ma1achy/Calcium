/**
 * Streaming UTF-8, not per-chunk (C21 I4).
 *
 * A multi-byte character split across a chunk boundary is one character. Decoded
 * per chunk it is two replacement marks, and the bug appears only with non-ASCII
 * content and only at certain output sizes — C06 parses NDJSON line by line and
 * would see mojibake at exactly the buffer boundaries, which is the hardest
 * possible place to find it from.
 *
 * Its own file rather than a helper inside the runner, because T2.1 asserts it at
 * every chunk size from 1 to 65536. Through spawns that is 65,536 processes; over
 * the decoder directly it is a loop.
 *
 * **`ignoreBOM` is on.** The default strips a leading U+FEFF, which is one byte
 * sequence the far side emitted and the consumer would never see — and T2.1's
 * claim is that decoding is byte-identical, not byte-identical apart from one
 * case nobody thought to test.
 */

export type Utf8Decoder = Readonly<{
  /** Decode a chunk, holding back any trailing bytes of an incomplete character. */
  push(chunk: Uint8Array): string;
  /** Whatever the last incomplete character decodes to. Empty when the stream ended clean. */
  flush(): string;
}>;

export function createUtf8Decoder(): Utf8Decoder {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

  return {
    push: (chunk: Uint8Array): string => decoder.decode(chunk, { stream: true }),
    flush: (): string => decoder.decode(),
  };
}
