/**
 * The router's vocabulary.
 *
 * C16 §2 — see spec. Types only; decoding is `decode.ts`.
 *
 * C16 imports nothing from `terminal/` (I13, MG14). Raw mode is C01's and the
 * bytes arrive as data, so nothing here names a file descriptor or a stream.
 */

export type Key = Readonly<{
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /** The raw bytes, for diagnostics. */
  sequence: string;
}>;

export type InputEvent =
  | Readonly<{ kind: "key"; key: Key }>
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{ kind: "mouse"; row: number; col: number; button: string; press: boolean }>;

/**
 * What the decoder needs to know about the terminal, as data.
 *
 * A subset of C02's record rather than the record itself: the decoder branches
 * on exactly these two, and taking the whole thing would let a later edit reach
 * for a third without anyone noticing it had grown a dependency.
 */
export type DecodeCapabilities = Readonly<{
  bracketedPaste: boolean;
  mouse: boolean;
}>;

export type DecoderOptions = Readonly<{
  capabilities: DecodeCapabilities;
  /** Injected; C16 reads no ambient clock (I9). */
  now: () => number;
}>;

/**
 * Bytes in, events out.
 *
 * `push` and `poll` both return everything that has become decidable, which is
 * why neither takes a callback: a decoder that emitted through a callback would
 * make "what did these bytes produce" a question about call order rather than
 * about a return value, and every table in §7 is written as input → output.
 *
 * `nextDeadline` exists because three of this component's rules are timeouts and
 * **the decoder owns no timer** — it reports when it would next have something to
 * say and the caller arranges the wake-up. That is what keeps I9 true of the
 * decoder rather than of a scheduler it holds.
 */
export interface Decoder {
  push(chunk: Uint8Array): readonly InputEvent[];
  poll(): readonly InputEvent[];
  /** Absolute time, on the injected clock. `null` when nothing is pending. */
  nextDeadline(): number | null;
}
