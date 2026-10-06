// C22 §6o — one-shots, stamped by the shell and stopped when they end.
//
// **Two observables, because one of them cannot see the ticker.** The text's ink,
// read off the styled screen after every step, shows that an effect plays — and
// it is read from the frame rather than from the writes, because C22's diff
// writer emits only the cells that changed, so a wipe moving one cell per tick
// never writes the text whole. But a ticker redrawing an identical frame changes
// no ink either, so *it stopped moving* and *it stopped asking* read the same
// there. The pending-timer count is the
// second observable, read differentially against the same document with
// `animate: "none"`: a finished one-shot must leave exactly the control's timers,
// and a `shimmer` more (two more, measured — the ticker and C03's window).
//
// **Not through a live part.** A `b.live` part animates by nature — its title
// carries the poll spinner — so it held four timers under `none`, `wipe` and
// `shimmer` alike, measured. T4.107 reads re-emission there from the text
// instead, and the disarm is T4.106's.
import { afterEach, describe, expect, it, vi } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import type { Ramp, RampAnimation, ViewDocument } from "../../src/data/viewmodel/index.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { buildGraph, buildSession } from "../support/session.js";
import { SESSION_BLOCK_CAP } from "../../src/viewport/transcript/cap.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rowContaining, styledScreenFrom } from "../support/styled-screen.js";
import { hangGuard } from "../support/budget.js";

afterEach(() => {
  vi.useRealTimers();
});

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const TEXT = "ARRIVED-JUST-NOW";
const rampOf = (animate: RampAnimation, since?: number): Ramp => ({
  fill: "gradient",
  from: "muted",
  to: "accent",
  animate,
  ...(since === undefined ? {} : { since }),
});

/** Lockstep, as T4.8 does: a whole-span jump on one clock and a drain on the other leaves a reader of the injected clock a span ahead. */
const stepper = (clock: { advance: (ms: number) => void }) => async (ms: number): Promise<void> => {
  for (let i = 0; i < ms; i += 1) {
    clock.advance(1);
    await vi.advanceTimersByTimeAsync(1);
  }
  await settle();
};

type Size = Readonly<{ columns: number; rows: number }>;
/** The text's ink on screen now: each of its cells' foreground, in order. */
const inkOf = (chunks: readonly string[], size: Size): string => {
  const row = rowContaining(styledScreenFrom(chunks, size), TEXT);
  if (row === null) return "absent";
  const at = row.map((c) => c.ch).join("").indexOf(TEXT);
  return row.slice(at, at + TEXT.length).map((c) => c.style.fg).join("|");
};
/** How many steps changed the text's ink from the step before — each is a frame of the effect. */
const changes = (inks: readonly string[], from = 1, to = inks.length): number => {
  let n = 0;
  for (let i = Math.max(1, from); i < to; i += 1) if (inks[i] !== inks[i - 1]) n += 1;
  return n;
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "arrive", local: true, summary: "a notice that flashes once", args: [], flags: [] }],
};

/** A local handler is the far side's route through C04's gate, and it has no tick to stamp with. */
async function throughHandler(ramp: Ramp): Promise<{ inks: string[]; timers: number }> {
  vi.useFakeTimers();
  const size = { columns: 100, rows: 30 };
  const stdin = fakeStdin();
  const s = await buildSession(
    {
      manifest: MANIFEST,
      localHandlers: {
        arrive: () => ({
          schema: "tui.view/1",
          command: "arrive",
          status: "ok",
          blocks: [{ kind: "notice", id: "n", tone: "info", text: TEXT, spans: [{ from: 0, to: TEXT.length, ramp }] } as never],
        }),
      },
      stdin: stdin as never,
    },
    size,
  );
  await vi.advanceTimersByTimeAsync(0);
  await settle();
  stdin.emit("/arrive\r");
  await vi.advanceTimersByTimeAsync(0);
  await settle();
  const step = stepper(s.clock);
  const inks = [inkOf(s.stdout.chunks, size)];
  for (let i = 0; i < 16; i += 1) {
    await step(100);
    inks.push(inkOf(s.stdout.chunks, size));
  }
  const result = { inks, timers: vi.getTimerCount() };
  await s.tui.stop("exit");
  return result;
}

/**
 * A `b.live` part re-renders its block on every poll: the same identity,
 * re-emitted. **A counter beside the span**, so each poll is a different
 * document and cannot be deduplicated before it reaches the store.
 */
async function throughLive(rampFor: (poll: number) => Ramp, steps: number): Promise<{ inks: string[]; polls: number }> {
  vi.useFakeTimers();
  const size = { columns: 90, rows: 24 };
  let polls = 0;
  const body = (n: number) =>
    b.raw(`${TEXT} ${String(n).padStart(4, "0")}`, { id: "part-c", spans: [{ from: 0, to: TEXT.length, ramp: rampFor(n) }] });
  const greeting = (): ViewDocument => ({
    schema: "tui.view/1",
    command: "/live",
    status: "ok",
    blocks: [
      b.live({
        id: "part",
        title: "part",
        every: 500,
        fetch: () => {
          polls += 1;
          return Promise.resolve(polls);
        },
        render: (n) => body(Number(n)),
        renderLoading: () => body(0),
      }),
    ],
    meta: {
      verb: "live",
      adapter: "live",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: ["live"],
      stderr: "",
      transport: "local",
      origin: "refresh",
    },
  });
  const s = await buildSession({ stdin: fakeStdin() as never, greeting }, size);
  await vi.advanceTimersByTimeAsync(0);
  await settle();
  const step = stepper(s.clock);
  const inks = [inkOf(s.stdout.chunks, size)];
  for (let i = 0; i < steps; i += 1) {
    await step(100);
    inks.push(inkOf(s.stdout.chunks, size));
  }
  const result = { inks, polls };
  await s.tui.stop("exit");
  return result;
}

describe("C22 §6o — a one-shot from a producer that cannot stamp it", () => {
  it("T4.106 (C22 I131, C22 I132, C04 I109): a local handler's pop with no since plays, stops, and disarms, and a producer's own since is honoured", async () => {
    const none = await throughHandler(rampOf("none"));
    const pop = await throughHandler(rampOf("pop"));
    const shimmer = await throughHandler(rampOf("shimmer"));
    const future = await throughHandler(rampOf("pop", 1_000_000));

    expect(pop.inks[0], "the notice is on screen before the first step").not.toBe("absent");
    // The fixture responds: the control's ink never changes, and a periodic
    // effect on the same carrier keeps changing it to the end.
    expect(changes(none.inks), "the control is still").toBe(0);
    expect(changes(shimmer.inks, 10), "the carrier can move").toBeGreaterThan(0);

    // The flash plays — more than one frame of it, after the first draw — and
    // then rests. A pop is six ticks, 480 ms.
    expect(changes(pop.inks, 1, 9), "the pop plays").toBeGreaterThan(1);
    expect(changes(pop.inks, 10), "and settles").toBe(0);

    // And stops asking: the finished pop leaves the control's timers, the shimmer
    // more (two more, measured). Without C22 I132 the pop keeps the shimmer's count.
    expect(shimmer.timers, "the shimmer holds a ticker").toBeGreaterThan(none.timers);
    expect(pop.timers, "the finished pop holds none").toBe(none.timers);

    // A producer's own `since` is left alone: at 1 000 000 the effect has not
    // begun, so it still asks. A stamp that overwrote it would have finished.
    expect(future.timers, "a future since is honoured, not overwritten").toBe(shimmer.timers);
  }, hangGuard(60_000));

  it("T4.107 (C22 I131): a b.live poll re-emitting a wipe does not replay it, and a changed effect plays", async () => {
    // Polls at 0, 0.5, 1.0 … s. The wipe is sixteen ticks — 1.28 s from its first
    // draw — so the polls at 1.5 s and 2.0 s re-emit a finished effect; from the
    // sixth poll, at 2.5 s, the same span carries a `sweep`.
    const run = await throughLive((n) => rampOf(n >= 6 ? "sweep" : "wipe"), 40);
    const shimmer = await throughLive(() => rampOf("shimmer"), 20);

    expect(run.inks[0], "the part is on screen before the first step").not.toBe("absent");
    expect(run.polls, "the part polls all the way through").toBeGreaterThanOrEqual(8);
    // The fixture responds: a periodic effect changes the ink to the end.
    expect(changes(shimmer.inks, 14), "the carrier can move").toBeGreaterThan(0);

    // The wipe plays after its first draw — a restamp on every poll pins it at
    // frame 0 and fails here, which is the mutation that found this row's shape.
    expect(changes(run.inks, 1, 13), "the wipe plays").toBeGreaterThan(1);
    // No poll after it finished replays it: a stamp keyed on the block object or
    // on `rev` restarts it at 1.5 s and 2.0 s.
    expect(changes(run.inks, 16, 25), "and no poll replays it").toBe(0);
    // A different effect on the same span is a different event (§6o.2 row 4),
    // so the sweep starts from the inline-start edge. **Where the band starts,
    // and not whether the ink moves**: the tick advances only while something
    // animates, so at the switch it stands at 16–19 of the sweep's 19, and a
    // sweep inheriting the wipe's stamp still draws its last frames — the band at
    // the end — before holding. The accent is read off the held wipe, which is
    // `to` on every cell, so the row names no colour.
    const held = (run.inks[20] ?? "").split("|");
    expect(new Set(held).size, "the held wipe is one ink").toBe(1);
    const accent = held[0];
    const fromTheStart = run.inks.slice(26).some((ink) => {
      const cells = ink.split("|");
      return cells[0] === accent && cells[cells.length - 1] !== accent;
    });
    expect(fromTheStart, "the sweep starts from the inline-start edge").toBe(true);
  }, hangGuard(60_000));

  it("T4.108 (C22 I131): the stamps join the eviction subscription — eviction takes one entry's, clear the rest, and the memo returns the same array", async () => {
    // **`buildGraph` stubs the render**, so no frame stamps here; the row is about
    // the subscription `construct.ts` wires, which the graph has for real. The
    // stamp is taken through the graph's own store, as `visibleRows` takes it —
    // T4.106 is the row for the render path.
    const { graph } = await buildGraph();
    const blocks = [{ kind: "notice", id: "n", tone: "info", text: TEXT, spans: [{ from: 0, to: TEXT.length, ramp: rampOf("pop") }] }];
    // Two blocks in the first entry, so evicting it alone pays for C13's marker,
    // which costs a block of its own (C13 §5, T3.22).
    const first2 = [...blocks, { kind: "raw", id: "pad", text: "pad" }];
    const meta = {
      verb: "arrive",
      adapter: "local",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: ["arrive"],
      stderr: "",
      transport: "local",
      origin: "user",
    };
    const id = graph.transcript.append({ schema: "tui.view/1", command: "arrive", status: "ok", blocks: first2, meta } as never);
    const first = graph.oneShots.stamp(id, blocks as never, 7);
    expect(graph.oneShots.size, "stamped").toBe(1);
    // **The memo's claim, which no frame shows** (§6o.3 ruling 2): the same array
    // comes back, at the first stamp's tick, so the height memo stays keyed.
    expect(graph.oneShots.stamp(id, blocks as never, 9), "the same array").toBe(first);
    expect(first, "a stamped document is a new array").not.toBe(blocks);
    expect((first[0] as unknown as { spans: { ramp: Ramp }[] }).spans[0]?.ramp.since, "at the first tick").toBe(7);
    const plain = [{ kind: "notice", id: "q", tone: "info", text: TEXT }];
    expect(graph.oneShots.stamp(id, plain as never, 9), "nothing to stamp, returned as it came").toBe(plain);

    // **Eviction, one entry**: a neighbour is stamped, then an append past C13's
    // cap pushes the first entry out (158 ms, measured) — its stamps go and the
    // neighbour's stay. This was the mutation pass's last survivor.
    const next = graph.transcript.append({ schema: "tui.view/1", command: "arrive", status: "ok", blocks, meta } as never);
    graph.oneShots.stamp(next, blocks as never, 11);
    expect(graph.oneShots.size, "two entries stamped").toBe(2);
    const evicted: string[] = [];
    using _watch = graph.transcript.subscribe((c) => {
      if (c.kind === "evict") evicted.push(...c.ids);
    });
    // Over the cap by one: the first entry's two blocks leave, the marker's one arrives.
    const filler = Array.from({ length: SESSION_BLOCK_CAP - 2 }, (_, i) => ({ kind: "raw", id: `f${String(i)}`, text: "f" }));
    graph.transcript.append({ schema: "tui.view/1", command: "fill", status: "ok", blocks: filler, meta } as never);
    expect(evicted, "the cap took the first entry and not its neighbour").toContain(id);
    expect(evicted).not.toContain(next);
    expect(graph.oneShots.size, "the evicted entry's stamps went with it").toBe(1);

    graph.transcript.clear();
    expect(graph.oneShots.size, "and clear takes the rest").toBe(0);
  });
});
