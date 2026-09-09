/**
 * C28 I14, I15, I47 — driving a recording back through the same seams.
 *
 * **A frame is the answer, not one of the inputs.** The `input`, `resize` and
 * `far` events drive; the `frame` events are what the replay is compared
 * against. Confusing the two produces a replay that agrees with itself.
 *
 * **The capabilities are re-derived** (I47). Detection writes query escapes and
 * reads the replies, so the replies are ordinary `input` events and the
 * detector runs again on the same bytes. Replaying a recorded *verdict* is the
 * obvious saving and it removes C02 from the gate: both runs would trust the
 * same answer, so a detector returning nonsense would replay byte-identically.
 *
 * **Truncation is a prefix comparison** (I15). A recording that ends while a
 * stream is open, or whose last line is torn, holds fewer frames than the
 * replay produces. Comparing the two counts and calling the difference a
 * divergence indicts the framework for the recorder's death — the most
 * expensive failure this design has available.
 */
import type { RecordedEvent } from "./record.js";

export type Recording = Readonly<{
  regime: Extract<RecordedEvent, { t: "regime" }> | null;
  /** `input`, `resize` and `far`, in the order they happened. */
  drive: readonly Extract<RecordedEvent, { t: "input" | "resize" | "far" }>[];
  /**
   * The same sequence **with the frames left in**, which is the pacing.
   *
   * **A replay that fires every input at once is not a replay of the session.**
   * The first driver did exactly that and the recording's `^D` arrived before
   * the far side had answered the command typed a moment earlier, so the
   * session exited mid-request and the comparison reported a divergence at the
   * frame where the answer should have been — a real difference, caused
   * entirely by the harness. The recorded order already says when each input
   * was safe to send: after the frames that preceded it had been drawn.
   */
  timeline: readonly Extract<RecordedEvent, { t: "input" | "resize" | "far" | "frame" }>[];
  /**
   * The size the recorded session started at — the `geometry` line.
   *
   * **Not the first `resize`, and not in `drive`.** It is the regime's, so a
   * replay adopts it and never signals it; see the event's own comment.
   */
  geometry: Extract<RecordedEvent, { t: "geometry" }> | null;
  /** What the recording expects to come out. */
  frames: readonly Uint8Array[];
  wall: readonly number[];
  mono: readonly number[];
  /**
   * The recorder did not finish: no `end`, an `end` with streams open, or a
   * torn final line. **Three causes and one field**, because a replay treats
   * them identically and a consumer that had to distinguish them would be
   * distinguishing ways of dying.
   */
  truncated: boolean;
  /** The last line did not parse, and was dropped rather than raised. */
  torn: boolean;
  /** Streams still iterating when the recording stopped. */
  open: number;
}>;

/**
 * Parse an NDJSON recording.
 *
 * **A torn final line is dropped, never thrown** (I15, T1.84). A process killed
 * mid-write leaves a partial JSON object, which is the case the `truncated`
 * field exists for; a parser that throws turns the recorder's death into the
 * replayer's, and the reader is told nothing about either.
 */
export function parseRecording(text: string): Recording {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  let regime: Recording["regime"] = null;
  let geometry: Extract<RecordedEvent, { t: "geometry" }> | null = null;
  const drive: Extract<RecordedEvent, { t: "input" | "resize" | "far" }>[] = [];
  const timeline: Extract<RecordedEvent, { t: "input" | "resize" | "far" | "frame" }>[] = [];
  const frames: Uint8Array[] = [];
  const wall: number[] = [];
  const mono: number[] = [];
  let ended = false;
  let open = 0;
  let torn = false;

  for (const [i, line] of lines.entries()) {
    let e: RecordedEvent;
    try {
      e = JSON.parse(line) as RecordedEvent;
    } catch {
      // **Only the last line may be torn.** A bad line anywhere else is a
      // corrupted file rather than an interrupted write, and calling that
      // truncation would let a real corruption replay as a short session.
      if (i === lines.length - 1) {
        torn = true;
        continue;
      }
      throw new Error(`recording line ${String(i + 1)} is not JSON, and it is not the last`);
    }
    switch (e.t) {
      case "regime":
        // **A second `regime` is two sessions in one file, and it is refused.**
        // The sink appends — `FileSystem` has `appendFileSync` and no
        // synchronous truncate, and widening a published interface for this
        // would touch seven implementations. So a rerun into the same path
        // concatenates, and the parser would otherwise take the last regime and
        // merge two sessions' events into one drive sequence: a replay that is
        // wrong about everything and complains about nothing. Measured while
        // building this — seven probe runs left one file with seven regimes.
        if (regime !== null) {
          throw new Error(
            "recording holds more than one `regime` line, so it is more than one session — a " +
              "recording appends. Remove the file or record to a new path",
          );
        }
        regime = e;
        break;
      case "geometry":
        geometry = e;
        break;
      case "input":
      case "resize":
      case "far":
        drive.push(e);
        timeline.push(e);
        break;
      case "frame":
        frames.push(Buffer.from(e.b64, "base64"));
        timeline.push(e);
        break;
      case "clock":
        wall.push(...e.wall);
        mono.push(...e.mono);
        break;
      case "end":
        ended = true;
        open = e.open;
        break;
    }
  }

  return Object.freeze({
    regime,
    drive: Object.freeze(drive),
    timeline: Object.freeze(timeline),
    geometry,
    frames: Object.freeze(frames),
    wall: Object.freeze(wall),
    mono: Object.freeze(mono),
    truncated: !ended || open > 0 || torn,
    torn,
    open,
  });
}

/**
 * Clocks served by index — **`elapsed` read `n` returns what read `n` returned**
 * (I14, F908).
 *
 * The tidier-looking alternative is to pin both clocks to the event stream, so
 * a read between two events returns the earlier one's stamp. It is
 * deterministic, self-consistent and independent of how many times anything
 * reads a clock — and it flattens every duration to zero, so C24 I32's footer
 * cell reads `last <0.1ms` on every replayed frame and diverges from every
 * recording taken from a live session.
 *
 * **`overrun` is the honest half.** A replay that reads more than was recorded
 * is not a function of its inputs, which is exactly the finding the gate
 * exists to produce; the last value is repeated so the session still completes
 * and the divergence is reported rather than thrown.
 */
export function replayClocks(rec: Recording): Readonly<{
  clock: () => number;
  elapsed: () => number;
  overrun: () => Readonly<{ wall: number; mono: number }>;
}> {
  let w = 0;
  let m = 0;
  let overWall = 0;
  let overMono = 0;
  const serve = (values: readonly number[], i: number, over: () => void): number => {
    if (i < values.length) return values[i] ?? 0;
    over();
    return values.length === 0 ? 0 : (values[values.length - 1] ?? 0);
  };
  return Object.freeze({
    clock: () => serve(rec.wall, w++, () => void (overWall += 1)),
    elapsed: () => serve(rec.mono, m++, () => void (overMono += 1)),
    overrun: () => Object.freeze({ wall: overWall, mono: overMono }),
  });
}

export type Divergence = Readonly<{
  /** Index into the frame sequence. */
  at: number;
  recorded: string;
  replayed: string;
}>;

/**
 * Cells a frame draws **about the run drawing it**.
 *
 * **A frame carrying its own cost cannot be byte-identical across runs, and no
 * clock discipline fixes that** (F911). F908 ruled that pinning the replayed
 * clocks to the event stream is wrong because it flattens every duration to
 * zero; the rest of the truth is that *positional* replay does not reproduce
 * one either, because it requires the two runs to read the clock the same
 * number of times in the same order, and the read sequence is not an input. A
 * live session spawns a far side and a replay serves it from values, so the
 * counts differ by construction — measured at 159 reads over on a six-second
 * session, and the footer read `last 56.7ms` against `last 53.5ms`.
 *
 * So the gate is byte-identity **modulo this list**, which is declared here,
 * kept to what a run measures about itself, and **checked for having fired** —
 * a mask that matches nothing is a mask that hides nothing and proves nothing,
 * and one that grows quietly is how a divergence gets absorbed.
 */
/**
 * The cells a replay is not required to reproduce, and why they are one set.
 *
 * **The property is not *self-measurement* — it is *drawn from a clock*.** The
 * list began as one pattern, C24 I32's `last N.Nms`, under the name
 * `SELF_MEASURED`: the run reporting its own cost. Pacing the drive exposed the
 * second member and it is not self-measurement at all — the header's
 * time-of-day, which is ambient. What both share is that their value comes from
 * a clock rather than from the recorded inputs, so both stop moving the moment
 * the recording's clock stream runs out, and a frame whose only delta is one of
 * them is never composed (F912).
 *
 * A set explained by a sentence true of its first member absorbs the second
 * without anyone noticing; renaming it is the cheapest moment to find that out.
 */
export const CLOCK_DERIVED: readonly RegExp[] = Object.freeze([
  // C24 I32's footer cell, from `formatFrameCost`: `last 12.3ms` / `last <0.1ms`.
  //
  // **A fixed-width cell, and the mask depends on it.** The first version of
  // `formatFrameCost` produced `last 9.6ms` and `last <0.1ms` — 10 and 11 cells
  // — so masking the value left the *padding* differing by one and the frames
  // still compared unequal. The mask cannot absorb that padding, because it
  // sits after the cell's SGR reset and swallowing an escape would hide a real
  // divergence. So the chrome pads the figure instead (F911), and this pattern
  // matches a constant width by construction.
  /last (?:\s*<0\.1|\s*\d+\.\d)ms/gu,
  // The header's clock, from `formatClock`: `14:23:07`.
  //
  // **Three groups only, and the narrow form is a stated blind spot.** Under 80
  // columns `formatClock` draws `14:23`, and nothing distinguishes that from a
  // duration a document happens to contain — `took 12:30 to build` matched an
  // optional-seconds pattern, on both sides, and the row written to check the
  // widening is what found it. So the mask covers the wide form, and a
  // recording taken under 80 columns can elide a header-clock frame the way a
  // truncated one can. That is a narrower failure than masking real content:
  // a mask that swallows a document's own text hides divergences everywhere,
  // and this one only fails to excuse a frame in one regime.
  //
  // **Lookarounds rather than `\b`, because the chrome writes the digits
  // straight after an SGR's `m`** — `\x1b[38;5;241m09:39:14\x1b[39m` — and `m`
  // is a word character, so `\b` found no boundary there and this member
  // matched nothing the header ever drew: `masked` read 14 on every `spans`
  // replay, seven `last` cells on two sides, and the row that narrowed the
  // pattern fed a sentence with a space before the digits (F964). What the
  // lookarounds refuse is a digit or a colon on either side, which is what
  // kept `109:39:14` and `09:39:145` out of the `\b` form too.
  /(?<![\d:])[0-2]\d:[0-5]\d:[0-5]\d(?![\d:])/gu,
]);

export type ReplayResult = Readonly<{
  identical: boolean;
  truncated: boolean;
  /**
   * The recording's last line did not parse.
   *
   * **Carried through to the result rather than left on the `Recording`**,
   * because it is the one cause of truncation a reader can act on: a missing
   * `end` means the process did not reach `stop()`, and a torn line means it
   * was killed between two writes. The other two causes are the same event.
   */
  torn: boolean;
  /** Frames the replay produced beyond what the recording holds. */
  surplus: number;
  divergence: Divergence | null;
  compared: number;
  /**
   * How many self-measured cells were masked, over both sides.
   *
   * **Asserted rather than reported**, because a mask that never fires is
   * indistinguishable from no mask at all and would let the list grow unnoticed
   * until it covered a real divergence.
   */
  masked: number;
  /**
   * The divergence is a frame the recording drew **only to report its own
   * cost**, and the replay had no reason to draw at all.
   *
   * **The mask reaches the bytes and not the decision to draw them** — which is
   * the half of F911 that only appeared once the frames were paced (F912). A
   * recording's clock is finite; past its end a replayed session's clock-derived
   * cells stop changing, so the chrome row carrying one has no delta and the
   * frame is never composed. Measured twice on the same session: a 174-byte
   * footer redraw whose only change was `last 8.8ms`, and a 173-byte header
   * redraw whose only change was the second hand — against a 25-byte cursor
   * move on the replay's side both times.
   *
   * `false` when the frames match, and `false` for any other divergence — this
   * is a claim about the one that was found, not a licence covering the tail.
   */
  elided: boolean;
}>;

/**
 * Compare a replay's frames against the recording's — **as a prefix** (I15).
 *
 * The natural implementation asserts the two counts are equal and reports the
 * difference as a divergence, which is right for a complete recording and
 * indicts the framework for a truncated one (T6.15).
 */
/** What the drive did, and what it could not make happen. */
export interface DriveOutcome {
  /** `input` and `resize` events delivered. */
  readonly delivered: number;
  /** Recorded frames the replay produced before the next event was sent. */
  readonly awaited: number;
  /**
   * Recorded frames the replay never drew, so the drive gave up waiting.
   *
   * **Non-zero is a finding, not a timeout to raise.** Every subsequent event
   * went out against a session in a state the recording never held, so a
   * divergence after the first stall is the harness's and not the subject's.
   */
  readonly stalled: number;
  /**
   * The frame at which the recording had no clock readings left, or `null`.
   *
   * **The recording's clock is an input, and this is where it ran out.** A
   * positional replay hands back the reads in the order they were taken; when
   * the replay asks for more than were recorded it gets the last one repeated,
   * so from here on the session is running on a clock that has stopped.
   */
  readonly exhaustedAt: number | null;
}

/**
 * Feed a recording back at the pace it was taken (C28 I46).
 *
 * **A replay that fires every input at once is not a replay of the session.**
 * The first driver did exactly that: it emitted both recorded chunks in one
 * synchronous loop, so the `^D` that had ended the recorded session two seconds
 * after a command arrived *before* the far side had answered it. The session
 * exited mid-request, the answer's frame was never drawn, and the comparison
 * reported a divergence at exactly that frame — a real byte difference, caused
 * entirely by the harness, and pointing at the transport rather than at the
 * clock that was actually wrong.
 *
 * The recorded order already carries the pacing. A `frame` between two inputs
 * says the first input's frame had been drawn before the second was typed, so
 * the drive waits for the replay to produce that many frames before sending on.
 * That is the ordering guarantee I46 exists to give: one stream over the four
 * taps, so the replay can be paced by something other than a sleep.
 */
export async function driveRecording(
  rec: Recording,
  deps: {
    readonly input: (chunk: Uint8Array) => void;
    readonly resize: (columns: number, rows: number) => void;
    readonly frames: () => number;
    readonly tick: () => Promise<void>;
    /** True once the recorded clock stream has been read past its end. */
    readonly exhausted?: () => boolean;
  },
  opts: { readonly ticks?: number } = {},
): Promise<DriveOutcome> {
  // A bound in ticks rather than milliseconds: the replay's clock is the
  // recording's, so wall time here measures the host and nothing else.
  const bound = opts.ticks ?? 500;

  // **An offset, because the stream the harness holds is not the stream the
  // recording holds.** Frames are captured at `lifecycle.writer`; the harness's
  // `stdout` additionally sees C01's acquire prologue — the alternate screen,
  // the cursor, the mode sets — which is the F910 asymmetry arriving a second
  // time, in the pacing signal rather than in the comparison.
  //
  // **A bare `deps.frames()` here is wrong and looks right.** The prologue is
  // not the only thing that has happened by the time the caller drives: a
  // session draws its first frames during `start()`, and this recording has
  // three before its first keystroke. Absorbing those as well put every wait
  // three frames ahead of what would ever arrive, so all eight stalled — and
  // the replay still came out byte-identical over six frames, because a stall
  // is a 500 ms pause and a pause is what a sleep-driven harness does anyway.
  // The counter is what said so; the frames did not.
  let leading = 0;
  for (const e of rec.timeline) {
    if (e.t !== "frame") break;
    leading++;
  }
  const base = Math.max(0, deps.frames() - leading);
  let expected = 0;
  let delivered = 0;
  let awaited = 0;
  let stalled = 0;
  let exhaustedAt: number | null = null;

  for (const e of rec.timeline) {
    if (e.t === "frame") {
      expected++;
      let spun = 0;
      while (deps.frames() - base < expected && spun < bound) {
        await deps.tick();
        spun++;
      }
      if (deps.frames() - base < expected) stalled++;
      else awaited++;
      if (exhaustedAt === null && deps.exhausted?.() === true) exhaustedAt = expected - 1;
      continue;
    }
    // A `far` event is served by the transport when the session asks for it;
    // there is nothing to deliver here, and delivering would be a second copy.
    if (e.t === "far") continue;
    if (e.t === "resize") deps.resize(e.columns, e.rows);
    else deps.input(Buffer.from(e.b64, "base64"));
    delivered++;
  }
  return Object.freeze({ delivered, awaited, stalled, exhaustedAt });
}

/**
 * A write that moves or shows the cursor and paints nothing.
 *
 * Anchored whole, so a frame that repositions *and* draws is not swallowed.
 *
 * **Written out, with an SS14 allow entry, and importing was tried first.**
 * Composing it from `escapes.ts`'s `CURSOR` and `cursorTo` keeps a recogniser
 * and its writer from drifting, which is the better argument — and MG20 refuses
 * the edge: `lifecycle.ts` owns the cursor mode, and a second reader of it is
 * exactly what that rule exists to stop. Two rules each right and impossible
 * together, which is the shape SS14's own entry for `decode.ts` already
 * records; this is the same case one layer up, so it takes the same remedy.
 *
 * **This file writes nothing.** It matches bytes that have already been
 * written, from a recording, and the allow entry is not a licence to emit.
 */
const CURSOR_ONLY = /^(?:\u001b\[\?25[lh]|\u001b\[[0-9]+;[0-9]+H|\u001b\[H)+$/u;

export function compareFrames(
  rec: Recording,
  replayed: readonly Uint8Array[],
  mask: readonly RegExp[] = CLOCK_DERIVED,
): ReplayResult {
  const compared = Math.min(rec.frames.length, replayed.length);
  let masked = 0;
  const scrub = (buf: Uint8Array): string => {
    let text = Buffer.from(buf).toString("utf8");
    for (const re of mask) {
      text = text.replace(new RegExp(re.source, re.flags), () => {
        masked += 1;
        // **A constant, not a same-length filler.** A self-measured cell can
        // differ in width as well as in value, and a length-preserving mask
        // leaves that difference in the padding beside it.
        return "\u0000";
      });
    }
    return text;
  };
  for (let i = 0; i < compared; i += 1) {
    const a = rec.frames[i];
    const b = replayed[i];
    if (a === undefined || b === undefined) continue;
    const left = scrub(a);
    const right = scrub(b);
    if (left !== right) {
      const recorded = Buffer.from(a).toString("utf8");
      return Object.freeze({
        identical: false,
        truncated: rec.truncated,
        torn: rec.torn,
        surplus: replayed.length - rec.frames.length,
        compared,
        masked,
        // Both halves, because either alone is satisfied by an ordinary
        // divergence: the recorded frame carries a self-measurement, *and* the
        // replayed one paints nothing.
        elided:
          mask.some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(recorded)) &&
          CURSOR_ONLY.test(Buffer.from(b).toString("utf8")),
        divergence: Object.freeze({
          at: i,
          recorded,
          replayed: Buffer.from(b).toString("utf8"),
        }),
      });
    }
  }
  // **A count difference is a divergence only when the recording is whole.**
  const shortfall = replayed.length !== rec.frames.length;
  return Object.freeze({
    identical: !shortfall || rec.truncated,
    truncated: rec.truncated,
    torn: rec.torn,
    surplus: replayed.length - rec.frames.length,
    compared,
    masked,
    elided: false,
    divergence: null,
  });
}
