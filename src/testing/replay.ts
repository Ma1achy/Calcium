/**
 * Driving a recording back through a session (C28 I14, I15, I47).
 *
 * **Pieces, not a runner** — the convention every sibling here follows. Each
 * function returns one of the four things `createTui` already takes, built from
 * the recording, so the caller wires a replay the same way it wires a session
 * and nothing here needs to know how a session starts.
 *
 * **What is deliberately absent is a capability argument.** A replay re-derives
 * them from the same environment and the same replies, because the replies are
 * ordinary `input` events (I47). Handing a replay the recorded verdict is the
 * obvious saving and it takes C02 out of the gate: both runs would trust one
 * answer, so a detector returning nonsense replays byte-identically.
 */
import { EventEmitter } from "node:events";

import {
  compareFrames,
  driveRecording,
  type DriveOutcome,
  parseRecording,
  replayClocks,
  type Recording,
  CLOCK_DERIVED,
  type ReplayResult,
} from "../shell/profiling/replay.js";
import type { Invocation, RawPatch, RawResult, TransportRouter } from "../data/transport/types.js";

export { parseRecording, replayClocks, compareFrames, driveRecording, CLOCK_DERIVED };
export type { DriveOutcome, Recording, ReplayResult };

/**
 * The `stdin` a replay reads.
 *
 * **It holds no schedule.** The bytes are fed by {@link driveRecording}, which
 * is the piece that knows *when* — see that function for why a stream that
 * emits its whole recording at construction is not a replay of the session.
 */
export function replayStdin(): NodeJS.ReadStream & { feed: (chunk: Uint8Array) => void } {
  const stream = new EventEmitter() as unknown as NodeJS.ReadStream & {
    feed: (chunk: Uint8Array) => void;
  };
  Object.assign(stream, {
    isTTY: true,
    setRawMode: () => stream,
    resume: () => stream,
    pause: () => stream,
    feed: (chunk: Uint8Array): void => {
      stream.emit("data", chunk);
    },
  });
  return stream;
}

/**
 * The `stdout` a replay writes to — **and the size it answers.**
 *
 * The recorded `resize` events are applied as the drive reaches them, so a frame
 * composed after the third resize sees the third width. A replay wired to the
 * real terminal reproduces every byte except the ones the width decides, which
 * is a divergence about geometry that reads as a wrapping defect in whichever
 * block was near the edge (I46).
 */
export function replayStdout(rec: Recording): NodeJS.WriteStream & {
  frames: readonly Uint8Array[];
  setSize: (columns: number, rows: number) => void;
} {
  const frames: Uint8Array[] = [];
  const first = rec.geometry;
  const stream = new EventEmitter() as unknown as NodeJS.WriteStream & {
    frames: readonly Uint8Array[];
    setSize: (columns: number, rows: number) => void;
  };
  Object.assign(stream, {
    isTTY: true,
    columns: first?.columns ?? 80,
    rows: first?.rows ?? 24,
    frames,
    write: (chunk: string | Uint8Array): boolean => {
      frames.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
      return true;
    },
    setSize: (columns: number, rows: number): void => {
      Object.assign(stream, { columns, rows });
    },
  });
  return stream;
}

/**
 * The far side a replay sees.
 *
 * **Values are served per verb, in the order they were recorded.** A single
 * queue across verbs would hand a `run` the answer a `status` produced the
 * moment two calls interleave, which is a divergence with a plausible cause and
 * a wrong one.
 */
export function replayTransport(rec: Recording): TransportRouter {
  const byVerb = new Map<string, unknown[]>();
  for (const e of rec.drive) {
    if (e.t !== "far") continue;
    const q = byVerb.get(e.verb) ?? [];
    q.push(e.value);
    byVerb.set(e.verb, q);
  }
  const take = (verb: string): unknown => byVerb.get(verb)?.shift();
  return {
    for(verb: string) {
      return {
        invoke: (_inv: Invocation): Promise<RawResult> => Promise.resolve(take(verb) as RawResult),
        stream: (_inv: Invocation): AsyncIterable<RawPatch> => ({
          async *[Symbol.asyncIterator]() {
            for (;;) {
              const next = take(verb);
              if (next === undefined) return;
              yield next as RawPatch;
            }
          },
        }),
      };
    },
    get busy() {
      return false;
    },
    get inFlight() {
      return null;
    },
  };
}

/**
 * The verdict, and the reason it is not a boolean.
 *
 * A replay can be *identical over a truncated prefix*, which is a pass, and
 * *short of a whole recording*, which is a failure — and both have the frame
 * counts differing. Returning one flag would make the caller re-derive the
 * distinction from fields it does not have (I15).
 */
export function checkReplay(rec: Recording, frames: readonly Uint8Array[]): ReplayResult {
  return compareFrames(rec, frames);
}

/**
 * The drive's own counters, beside the comparison's.
 *
 * **Reported because four of five divergences in this harness's first week were
 * the harness's** (F912). `stalled: 0` is what proved the pacing worked — the
 * frames had come out byte-identical over six of eight while all eight waits
 * stalled, because a stall is a pause and a pause is what a sleep-driven driver
 * does anyway. A verdict that reports only the frames cannot tell a reader
 * which side of the comparison to go and look at.
 */
export function formatDrive(d: DriveOutcome): readonly string[] {
  const lines = [
    `drive · ${String(d.delivered)} event(s) delivered · ${String(d.awaited)} frame(s) awaited`,
  ];
  if (d.stalled > 0) {
    lines.push(
      `  ${String(d.stalled)} recorded frame(s) never drawn — the events after the first went ` +
        `out against a state the recording never held, so a divergence past it is this ` +
        `harness's and not the subject's`,
    );
  }
  if (d.exhaustedAt !== null) {
    lines.push(
      `  the recorded clock ran out at frame ${String(d.exhaustedAt)} — past there a replayed ` +
        `session's durations hold still, so a frame whose only delta is one of them is never ` +
        `composed (C28 I14)`,
    );
  }
  return Object.freeze(lines);
}

/** One line per fact, in `check*`/`format*`'s convention. */
export function formatReplay(r: ReplayResult): readonly string[] {
  const lines = [
    `replay · ${String(r.compared)} frame(s) compared · ${String(r.masked)} clock-derived cell(s) masked · ${r.identical ? "identical" : "DIVERGED"}`,
  ];
  if (r.truncated) {
    lines.push(
      `  truncated${r.torn ? " (the last line was torn — the recorder was killed mid-write)" : ""} — ` +
        `the recording stopped early, so the comparison is a prefix and the ` +
        `${String(Math.max(0, r.surplus))} frame(s) beyond it are not a divergence`,
    );
  }
  if (r.elided) {
    lines.push(
      `  frame ${String(r.divergence?.at ?? 0)} changes only a clock-derived cell — ` +
        `the replay's clock had stopped, so it had no delta to draw and never composed the ` +
        `frame. The mask reaches those bytes and not the decision to draw them (C28 I14, F912)`,
    );
  }
  if (r.divergence !== null) {
    lines.push(`  frame ${String(r.divergence.at)} differs`);
    lines.push(`    recorded  ${JSON.stringify(r.divergence.recorded)}`);
    lines.push(`    replayed  ${JSON.stringify(r.divergence.replayed)}`);
  }
  return Object.freeze(lines);
}
