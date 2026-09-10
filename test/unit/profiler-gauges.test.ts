// C28 I45 — a block kind's own data as a measured input.
//
// **The gauge names what the render walks in full, before the clamp.** `measure`
// returns rows, rows are clamped to the viewport, and every downstream figure is
// therefore a constant in the one variable a caller controls. A `rule` with a
// four-thousand-character label and a `rule` with a two-character one measure 1
// apiece, cost different amounts, and are one row in `nodes`.
//
// The coverage row is the one that found something. It is written as a
// comparison of two sets — the kinds from `DEFAULT_DEFINITIONS`, the gauge names
// from the source — rather than as a list, because **a hand-written list of
// kinds is written by the same reading that missed one**: `image` was called
// covered twice by scans keyed on the file and on a gauge's prefix, and its
// gauge is of the decoder's cache (F906).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { DEFAULT_DEFINITIONS } from "../../src/presentation/blocks/index.js";
import { fullRegistry } from "../../src/testing/expect-document.js";
import { instrumentRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { ProbeableRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { BlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { rgbPng64 } from "../support/png.js";
import { createRecording, recordWriter } from "../../src/shell/profiling/record.js";
import {
  compareFrames,
  driveRecording,
  parseRecording,
  replayClocks,
} from "../../src/shell/profiling/replay.js";
import { farGate, replayStdout, replayTransport } from "../../src/testing/replay.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { ProfileReport } from "../../src/shell/profiling/types.js";

/**
 * One document rendered through the real registry with a real probe.
 *
 * `spans` rather than `counters` only because `report()` is read whole; the
 * gauges themselves are recorded wherever counting is on (C28 I44).
 */
/**
 * One document rendered the way `construct.ts` renders one.
 *
 * **The registry is instrumented as well as the context given a probe**, and the
 * first draft did only the second. `RenderContext.probe` reaches `render`; a
 * definition's `measure` takes its probe from the registry's own slot, which is
 * L4's seam and not L1's. So the draft recorded every render-path gauge and no
 * measure-path one — and `image` decodes in `measure`, so the row read two cache
 * hits, no miss, and no `decode.entries` at all. Nothing about the figures said
 * so: they were all correct, and the one that was missing looks the same as a
 * gauge nobody wrote.
 */
function gaugesOf(doc: readonly Block[], width = 80): ProfileReport["gauges"] {
  const prof = createProfiler({ tier: "spans" }, { elapsed: () => 0, node: "v22.0.0", cpus: 4 });
  const registry = fullRegistry();
  instrumentRegistry(registry as unknown as ProbeableRegistry, prof);
  renderSequenceToLines(registry as BlockRegistry, doc, width, {
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    probe: prof.asProbe(),
  });
  return prof.report().gauges;
}

/** Every `.ts` under a directory, read whole. */
function sourceUnder(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceUnder(p, out);
    else if (p.endsWith(".ts")) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

describe("per-kind input gauges", () => {
  it("T1.77 (C28 I45): every default kind names a gauge, measured against the definitions", () => {
    const kinds = DEFAULT_DEFINITIONS.map((d) => d.kind).sort();
    const source = sourceUnder("src/presentation").join("\n");
    const prefixes = new Set(
      [...source.matchAll(/\bgauge\(\s*"([A-Za-z0-9]+)\./gu)].map((m) => m[1] ?? ""),
    );

    // **The count is asserted as well as the difference.** A scan whose pattern
    // matched nothing finds no disagreement either, and reports a clean sweep —
    // which is the shape F906's second reading had, with `[a-z.]+` unable to
    // match `keyValue`.
    expect(kinds.length, "the fixture is the whole default set").toBeGreaterThanOrEqual(19);
    expect(prefixes.size, "and the scan found gauges to compare them against").toBeGreaterThan(15);
    expect(kinds.filter((k) => !prefixes.has(k)), "every kind gauges its own input").toEqual([]);
  });

  it("T1.78 (C28 I45): the label is gauged before the truncate, not after", () => {
    const label = "x".repeat(4000);
    const g = gaugesOf(
      [
        b.rule(label, undefined, { id: "r" }),
        b.progress({ id: "p", label, current: 1, total: 2 }),
      ],
      80,
    );

    // **Both halves.** The second is the argument: a gauge taken after the clamp
    // reports the width at every label, which is indistinguishable from a kind
    // nobody instrumented.
    expect(g["rule.label"]?.max, "the whole label stripControl walks").toBe(4000);
    expect(g["progress.label"]?.max, "and the same clamp on progress").toBe(4000);
    expect(
      fullRegistry().measure(b.rule(label, undefined, { id: "r" }), 80),
      "while the row count is 1",
    ).toBe(1);
  });

  it("T1.79 (C28 I45): two independent inputs need two gauges", () => {
    const wide = gaugesOf([
      b.notice("info", "z".repeat(220), undefined, {
        id: "n",
        spans: Array.from({ length: 200 }, (_, i) => ({ from: i, to: i + 1, tone: "muted" as const })),
      }),
    ]);
    // 200 rows of content at width 80, wrapped rather than declared — the rows
    // gauge is taken from what `noticeRows` produced, so the fixture has to
    // actually wrap.
    const tall = gaugesOf([b.notice("info", "y".repeat(80 * 200), undefined, { id: "n" })]);

    // **Written as a pair, because a single gauge passes either arm alone.** The
    // rule under test is that a kind with two growable inputs gets two, and only
    // the case where one of them is flat can show it.
    expect(wide["notice.spans"]?.max, "the spans arm").toBe(200);
    expect(tall["notice.spans"]?.max ?? 0, "which the tall document does not have").toBeLessThan(200);
    expect(tall["notice.rows"]?.max ?? 0, "the rows arm").toBeGreaterThan(100);
    expect(wide["notice.rows"]?.max ?? 0, "which the wide document does not have").toBeLessThan(100);
  });

  it("T1.80 (C28 I45): an image gauges its payload and its pixels, and decode.entries is the control", () => {
    // A real 6×4 PNG from the suite's own encoder, so the row measures the
    // decode rather than a base64 string someone typed.
    const png = rgbPng64(6, 4, (x, y) => [x * 40, y * 60, 10]);
    const g = gaugesOf([b.image({ id: "i", data: png, height: 4, alt: "a" })]);

    expect(g["image.bytes"]?.max, "the payload the decode walks").toBe(png.length);
    expect(g["image.pixels"]?.max, "and the source extent the dither walks").toBe(24);
    // **The control**: this is the gauge that was already there, it is the
    // occupancy of a digest-keyed map, and it reads 1 for a file of any size —
    // which is how the kind read as covered (F906).
    expect(g["decode.entries"]?.max, "unmoved by either").toBe(1);
  });
});

// Record and replay. The invariants are named only inside the row titles, so
// the coverage signal reports them honestly (F907).
describe("record and replay", () => {
  /** A sink that keeps the lines, so a row reads the stream rather than a file. */
  function sink(): { lines: string[]; append: (line: string) => void } {
    const lines: string[] = [];
    return { lines, append: (line) => void lines.push(...line.split("\n").filter((l) => l !== "")) };
  }

  /** The narrowest thing `recordWriter` needs, with a settable size. */
  function fakeOut(columns = 80, rows = 24): NodeJS.WriteStream & { written: string[] } {
    const written: string[] = [];
    return {
      columns,
      rows,
      written,
      write(chunk: string | Uint8Array): boolean {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      },
    } as unknown as NodeJS.WriteStream & { written: string[] };
  }

  it("T1.81 (C28 I46): four taps, one order, and the frames are the answer rather than an input", () => {
    const s = sink();
    const rec = createRecording(s.append);
    const out = fakeOut();
    const tapped = recordWriter(out, rec);

    rec.input("a");
    tapped.write("frame-1");
    // **The resize comes from `lifecycle.onResize`, not from the stream.** C01
    // owns when a size becomes true (SS42), so the root subscribes and the tap
    // records frames only — see F909 for the other half of why this stream is
    // not where a recorder listens.
    rec.resize({ columns: 100, rows: 24 });
    tapped.write("frame-2");
    rec.far("run", { kind: "end" });
    tapped.write("frame-3");
    rec.end();

    const kinds = s.lines.map((l) => (JSON.parse(l) as { t: string }).t);
    // **Asserted as one sequence and not four**, because four correctly ordered
    // logs merge to any order at all — and the frame a resize produces depends
    // on which patches preceded it.
    expect(kinds, "the order events happened in").toEqual([
      "input",
      "frame",
      "resize",
      "frame",
      "far",
      "frame",
      "end",
    ]);

    const parsed = parseRecording(`${s.lines.join("\n")}\n`);
    expect(parsed.drive.map((e) => e.t), "what a replay drives").toEqual(["input", "resize", "far"]);
    expect(parsed.frames.map((f) => Buffer.from(f).toString("utf8")), "and what it is compared against").toEqual([
      "frame-1",
      "frame-2",
      "frame-3",
    ]);
  });

  it("T1.82 (C28 I46): the stdout tap answers columns as well as recording writes", () => {
    const s = sink();
    const rec = createRecording(s.append);
    const out = fakeOut(80, 24);
    const tapped = recordWriter(out, rec);

    // **The resize is recorded before the frame that follows it**, which is the
    // only ordering a replay can use: the size is read when a frame is composed.
    rec.resize({ columns: 120, rows: 26 });
    tapped.write("after");
    const kinds = s.lines.map((l) => (JSON.parse(l) as { t: string }).t);
    expect(kinds, "resize first, then the frame it changed").toEqual(["resize", "frame"]);

    // **The size still reads through the tap**, which is what lets the replay's
    // own stdout answer `columns` from the recording rather than from the
    // terminal it happens to be running in.
    expect(tapped.columns, "and the size still reads through").toBe(80);
    // **The replay's starting width is the `geometry` line, not the first
    // `resize`.** A resize is a signal a replay delivers; delivering one for the
    // size the session already has contaminates a frame the recording drew as a
    // difference, and the whole repaint that came back was byte-different,
    // correct on both sides, and entirely the harness's (F912).
    rec.geometry({ columns: 132, rows: 40 });
    const replayed = replayStdout(parseRecording(`${s.lines.join("\n")}\n`));
    expect(replayed.columns, "the replay starts at the recorded geometry").toBe(132);
    expect(
      parseRecording(`${s.lines.join("\n")}\n`).drive.filter((e) => e.t === "resize").length,
      "and the geometry is not among the events it delivers",
    ).toBe(1);
  });

  it("T1.84 (C28 I15): a torn final line is dropped and the recording reports truncated", () => {
    const whole = ['{"t":"input","n":0,"b64":"YQ=="}', '{"t":"end","n":1,"open":0}'].join("\n");
    expect(parseRecording(`${whole}\n`).truncated, "a recording that finished").toBe(false);

    // A process killed mid-write leaves a partial object. **Not an error**: a
    // parser that throws turns the recorder's death into the replayer's, and
    // the reader is told nothing about either.
    const torn = `{"t":"input","n":0,"b64":"YQ=="}\n{"t":"fra`;
    const parsed = parseRecording(torn);
    expect(parsed.torn, "the last line did not parse").toBe(true);
    expect(parsed.truncated, "which is one of the three ways to be truncated").toBe(true);
    expect(parsed.drive, "and what did parse is kept").toHaveLength(1);

    // The control: a bad line that is *not* last is a corrupted file, and
    // calling that truncation lets a real corruption replay as a short session.
    expect(() => parseRecording(`{"t":"fra\n{"t":"end","n":1,"open":0}\n`)).toThrow(/not the last/u);

    // The third cause, with nothing torn and an `end` present.
    expect(parseRecording(`{"t":"end","n":0,"open":2}\n`).truncated, "a stream still open").toBe(true);

    // **Two sessions in one file are refused by name.** The sink appends, so a
    // rerun into the same path concatenates; taking the last regime and merging
    // the events would give a replay that is wrong about everything and
    // complains about nothing. Seven probe runs produced exactly this while the
    // apparatus was being built.
    const twice = [
      '{"t":"regime","node":"v22","tier":"spans","env":{}}',
      '{"t":"end","n":0,"open":0}',
      '{"t":"regime","node":"v22","tier":"spans","env":{}}',
      '{"t":"end","n":0,"open":0}',
      "",
    ].join("\n");
    expect(() => parseRecording(twice)).toThrow(/more than one session/u);
  });

  it("T1.85 (C28 I14): the clocks are served by index, and a pinned clock is the control", () => {
    const s = sink();
    const rec = createRecording(s.append);
    let real = 0;
    const elapsed = rec.mono(() => (real += 1.5));
    // Two reads a frame — the bracket's open and close, which is how a duration
    // is taken.
    for (let i = 0; i < 6; i += 1) void elapsed();
    rec.end();

    const parsed = parseRecording(`${s.lines.join("\n")}\n`);
    expect(parsed.mono, "every read, in order").toEqual([1.5, 3, 4.5, 6, 7.5, 9]);

    const clocks = replayClocks(parsed);
    const replayed = [clocks.elapsed(), clocks.elapsed(), clocks.elapsed()];
    expect(replayed, "read n returns what read n returned").toEqual([1.5, 3, 4.5]);
    // **A frame's cost survives.** The tidier alternative — pin the replayed
    // clock to the event stream, so a read between two events returns the
    // earlier one's stamp — makes every one of these differences zero, so C24
    // I32's footer reads `last <0.1ms` on every frame (F908).
    expect(replayed[1]! - replayed[0]!, "so a duration is a duration").toBe(1.5);

    // **`overrun` is the honest half**: a replay reading more than was recorded
    // is not a function of its inputs, which is the finding the gate exists for.
    expect(clocks.overrun().mono, "nothing over yet").toBe(0);
    for (let i = 0; i < 5; i += 1) void clocks.elapsed();
    expect(clocks.overrun().mono, "two reads past the end of the recording").toBe(2);
  });

  /** A whole recording of the given frames — an `end` line, so no truncation. */
  const recording = (frames: readonly string[]): ReturnType<typeof parseRecording> =>
    parseRecording(
      [
        ...frames.map((f, i) =>
          JSON.stringify({ t: "frame", n: i, b64: Buffer.from(f, "utf8").toString("base64") }),
        ),
        JSON.stringify({ t: "end", n: frames.length, open: 0 }),
        "",
      ].join("\n"),
    );

  it("T3.6 (C28 I15): a truncated recording compares as a prefix, and raises no divergence", () => {
    const frames = ["a", "b"].map((f) => Buffer.from(f, "utf8"));
    const cut = parseRecording(
      `${frames.map((f, i) => JSON.stringify({ t: "frame", n: i, b64: f.toString("base64") })).join("\n")}\n`,
    );
    expect(cut.truncated, "no end line at all").toBe(true);

    // The replay ran on and produced two more frames the recorder never saw.
    const replayed = ["a", "b", "c", "d"].map((f) => Buffer.from(f, "utf8"));
    const r = compareFrames(cut, replayed);
    expect(r.divergence, "the frames it holds all agree").toBeNull();
    expect(r.identical, "so the gate passes").toBe(true);
    expect(r.truncated, "and says why the counts differ").toBe(true);
    expect(r.surplus, "with the shortfall reported as a number").toBe(2);
    expect(r.compared, "over the prefix the recording holds").toBe(2);
  });

  it("T3.6b (C28 I14): a whole recording that comes up short is a divergence", () => {
    // **The other arm, and the one T3.6 would otherwise delete.** A prefix
    // comparison that never fails on a count is a comparison that cannot see a
    // frame the framework failed to produce.
    const whole = parseRecording(
      [
        JSON.stringify({ t: "frame", n: 0, b64: Buffer.from("a").toString("base64") }),
        JSON.stringify({ t: "frame", n: 1, b64: Buffer.from("b").toString("base64") }),
        JSON.stringify({ t: "end", n: 2, open: 0 }),
        "",
      ].join("\n"),
    );
    expect(whole.truncated, "this one finished").toBe(false);
    expect(compareFrames(whole, [Buffer.from("a")]).identical, "one frame short").toBe(false);
    expect(compareFrames(whole, [Buffer.from("a"), Buffer.from("b")]).identical, "and whole").toBe(true);

    const differs = compareFrames(whole, [Buffer.from("a"), Buffer.from("x")]);
    expect(differs.divergence?.at, "a byte difference names its index").toBe(1);
    expect(differs.divergence?.recorded, "with both sides").toBe("b");
    expect(differs.divergence?.replayed).toBe("x");
  });

  it("T1.90 (C01 I1, SS14): the replay comparison recognises escapes and writes none", () => {
    // **The row the allow entry is paired with.** SS14 lets this module hold
    // escape literals because it *recognises* bytes a recording already holds
    // — and an allow entry is precisely what would hide it if the module ever
    // wrote one. C16's decoder carries the same assertion (C16 T2.9); A03 §
    // says every allowed file does.
    const src = readFileSync(
      new URL("../../src/shell/profiling/replay.ts", import.meta.url),
      "utf8",
    );
    // Comments first: prose about writing is not writing, and the
    // best-documented file fails a source assertion hardest.
    const code = src.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    for (const sink of [".write(", "process.stdout", "process.stderr", "writeFileSync"]) {
      expect(code, `no ${sink} on the recognising side`).not.toContain(sink);
    }
    // And the control: the pattern the rule is about is really here, so the
    // assertion above is over a file that could have failed it.
    expect(src, "the escapes it recognises are in the file").toMatch(/\\u001b/u);
  });

  it("T1.89 (C28 I46): the drive waits for each recorded frame, and its baseline is the prologue only", async () => {
    // A recording with two frames drawn before the first keystroke, then an
    // input, then a third — the shape every session has, because a session
    // draws while it starts.
    const rec = parseRecording(
      [
        JSON.stringify({ t: "geometry", n: 0, columns: 80, rows: 24 }),
        JSON.stringify({ t: "frame", n: 1, b64: "YQ==" }),
        JSON.stringify({ t: "frame", n: 2, b64: "Yg==" }),
        JSON.stringify({ t: "input", n: 3, b64: "eA==" }),
        JSON.stringify({ t: "frame", n: 4, b64: "Yw==" }),
        JSON.stringify({ t: "end", n: 5, open: 0 }),
        "",
      ].join("\n"),
    );

    // The harness's stream sees more than the recording's: C01's acquire
    // prologue is written before the writer the frames are tapped at exists.
    // Here that is three extra writes, plus the two startup frames.
    // **The frame arrives after a tick, not inside the call that caused it.**
    // A session that answers synchronously is a session the drive never has to
    // wait for, so a row built on one passes with the wait loop deleted — which
    // is what the mutation pass said when `PACE-BY-NOTHING` survived. A real
    // session draws on a scheduler, and the whole point of the pacing is that
    // the drive holds the next event until that happens.
    let writes = 5;
    let owed = 0;
    const sent: string[] = [];
    const out = await driveRecording(
      rec,
      {
        input: (chunk) => {
          sent.push(Buffer.from(chunk).toString("utf8"));
          owed += 1;
        },
        resize: () => undefined,
        frames: () => writes,
        // The frame the keystroke earned lands one tick later.
        tick: () => {
          if (owed > 0) {
            owed -= 1;
            writes += 1;
          }
          return Promise.resolve();
        },
      },
      { ticks: 20 },
    );

    expect(sent, "the input went out").toEqual(["x"]);
    expect(out.stalled, "and every recorded frame was matched").toBe(0);
    expect(out.awaited, "all three of them").toBe(3);

    // **The control, and the defect it names.** A baseline of `deps.frames()`
    // absorbs the two startup frames as well as the prologue, so every wait
    // sits two frames ahead of anything that will arrive — and the replay still
    // produced byte-identical frames while all eight waits stalled, because a
    // stall is a pause and a pause is what a sleep-driven driver does anyway
    // (F912). The counter is what says so; the frames do not.
    let starved = 5;
    const stalledRun = await driveRecording(
      rec,
      {
        input: () => undefined,
        resize: () => undefined,
        frames: () => starved,
        tick: () => {
          starved += 0;
          return Promise.resolve();
        },
      },
      { ticks: 3 },
    );
    // **Exactly one, and the number is the whole assertion.** The recording's
    // two startup frames were already drawn when the drive began, so the
    // baseline credits them and only the third — the answer to the keystroke
    // this session never gives — is missing. A baseline of `deps.frames()`
    // absorbs those two as well and reports three, which is the defect: every
    // wait sits two frames ahead of anything that will arrive, and the replay
    // still produced byte-identical frames while all eight waits stalled,
    // because a stall is a pause and a pause is what a sleep-driven driver
    // does anyway (F912). The counter is what says so; the frames do not.
    expect(stalledRun.stalled, "only the frame the session never drew").toBe(1);
  });

  it("T1.103 (C28 I14, I46): a far value recorded after a frame is served only once that frame is drawn, and the stand-in reads the mono clock twice per answer", async () => {
    // **The recording has the answer's position and the first stand-in ignored
    // it** (F974). A far side slower than the readout's one-second wake leaves a
    // frame in the recording *before* the `far` line — `⏺︎ ps(--limit 20) · ⠙ 1s`
    // — and a stand-in serving the answer the moment the session asked settled
    // the card before that wake could fire, so the replay never drew the frame
    // and diverged at it. The drive already paces inputs on the frames before
    // them; it releases each far event when it reaches it, and the stand-in
    // waits for its turn.
    const rec = parseRecording(
      [
        JSON.stringify({ t: "geometry", n: 0, columns: 80, rows: 24 }),
        JSON.stringify({ t: "frame", n: 1, b64: "YQ==" }),
        JSON.stringify({ t: "input", n: 2, b64: "eA==" }),
        JSON.stringify({ t: "frame", n: 3, b64: "Yg==" }),
        JSON.stringify({ t: "far", n: 4, verb: "ps", value: { answer: 1 } }),
        JSON.stringify({ t: "frame", n: 5, b64: "Yw==" }),
        JSON.stringify({ t: "end", n: 6, open: 0 }),
        "",
      ].join("\n"),
    );

    const gate = farGate();
    let reads = 0;
    const transport = replayTransport(rec, () => (reads += 1), gate.wait);
    // The session asks at once, as it does live; the harness's stream has the
    // prologue (three writes) and the one startup frame by then.
    let writes = 4;
    let owed = 0;
    let servedAt: number | null = null;
    let answered: unknown = null;
    void transport
      .for("ps")
      .invoke({} as never)
      .then((v) => {
        answered = v;
        servedAt = writes;
        owed += 1;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(answered, "not served before its turn").toBeNull();
    expect(reads, "the start read is taken at the call, where C06 takes it").toBe(1);

    const out = await driveRecording(
      rec,
      {
        input: () => void (owed += 1),
        resize: () => undefined,
        frames: () => writes,
        tick: () => {
          if (owed > 0) {
            owed -= 1;
            writes += 1;
          }
          return Promise.resolve();
        },
        far: (n) => gate.release(n),
      },
      { ticks: 20 },
    );
    expect(out.stalled, "every frame arrived in turn").toBe(0);
    expect(answered, "the recorded value was served").toEqual({ answer: 1 });
    // The prologue's three plus the two frames recorded before the `far` line:
    // the answer waited for the frame the keystroke earned.
    expect(servedAt, "served after the frame recorded ahead of it, and not before").toBe(5);
    expect(reads, "and the end read followed it — two per answer, as C06's pair").toBe(2);

    // **The control: the stand-in without a turn to wait for** — the state the
    // tree was in — serves after one turn with nothing drawn.
    let early: unknown = null;
    void replayTransport(rec, () => 0)
      .for("ps")
      .invoke({} as never)
      .then((v) => void (early = v));
    await Promise.resolve();
    await Promise.resolve();
    expect(early, "the control: served at once").toEqual({ answer: 1 });
  });

  it("T1.86 (C28 I14, I15): an elision is a clock-derived redraw against a write that paints nothing", () => {
    // **The condition the e2e can no longer construct.** With the recording's
    // tail flushed the clock outlasts the session, so nothing is elided — and a
    // truncated recording, which I15 exists for, still can be: past the end of
    // the clock stream a replayed session's cost and time-of-day hold still,
    // the chrome row carrying one has no delta, and the frame is never
    // composed. Both halves are asserted, because either alone is satisfied by
    // an ordinary divergence.
    const rec = recording(["\u001b[?25l\u001b[H\u001b[0mready", "\u001b[26;1Hlast   8.8ms"]);
    const cursorOnly = [Buffer.from("\u001b[?25l\u001b[H\u001b[0mready"), Buffer.from("\u001b[?25l\u001b[24;3H\u001b[?25h")];
    const elided = compareFrames(rec, cursorOnly);
    expect(elided.divergence?.at, "the divergence is named").toBe(1);
    expect(elided.elided, "and read as an elision").toBe(true);

    // **Two controls, one per half of the predicate.** The mutation pass found
    // that one is not enough: dropping the clock-derived half and keeping only
    // the cursor-only test survived a suite that had only ever contrasted a
    // cursor-only replay with a painting one.
    //
    // A — the replay painted something. Not cursor-only, so not an elision
    // whichever half is asked.
    const painted = [
      Buffer.from("\u001b[?25l\u001b[H\u001b[0mready"),
      Buffer.from("\u001b[26;1Hlast   8.8mX"),
    ];
    const real = compareFrames(rec, painted);
    expect(real.divergence?.at, "still a divergence").toBe(1);
    expect(real.elided, "and not an elision").toBe(false);

    // B — the replay is cursor-only and the **recorded** frame carries no cell
    // drawn from a clock. A frame the recording drew for a real reason and the
    // replay did not draw at all is a divergence, not something to excuse, and
    // only the clock-derived half of the predicate can say so.
    const content = recording([
      "\u001b[?25l\u001b[H\u001b[0mready",
      "\u001b[26;1H12 containers running",
    ]);
    const missed = compareFrames(content, cursorOnly);
    expect(missed.divergence?.at, "the replay missed a frame").toBe(1);
    expect(missed.elided, "and no clock-derived cell excuses it").toBe(false);
  });

  it("T1.87 (C28 I14): the header's clock is masked, and a duration elsewhere is not", () => {
    // **The set is `CLOCK_DERIVED`, not self-measurement.** It began as one
    // pattern — the run reporting its own cost — and the second member is
    // ambient: `formatClock`'s time of day. A sentence true of the first
    // absorbs the second without anyone noticing, so both are asserted here,
    // together with the thing the widened pattern must not swallow.
    const rec = recording(["at 23:27:10", "took 12:30 to build"]);
    const same = compareFrames(rec, [Buffer.from("at 09:04:55"), Buffer.from("took 12:30 to build")]);
    expect(same.identical, "two times of day compare equal").toBe(true);
    expect(same.masked, "with both sides masked, and nothing else").toBe(2);

    // **The blind spot, asserted rather than left to be discovered.** The
    // narrow `HH:MM` form `formatClock` draws under 80 columns is
    // indistinguishable from a duration in a document, so the mask does not
    // cover it — and the first draft, which did, swallowed this line on both
    // sides. A mask that eats a document's own text hides divergences
    // everywhere; this one only fails to excuse a frame in one regime.
    const differs = compareFrames(rec, [
      Buffer.from("at 23:27:10"),
      Buffer.from("took 19:45 to build"),
    ]);
    expect(differs.identical, "a duration is content, and content is compared").toBe(false);
    expect(differs.divergence?.at, "named at its frame").toBe(1);
  });

  it("T1.101 (C28 I14): the header's clock is masked on the chrome's own bytes, where an SGR's `m` precedes the digits", () => {
    // **`CLOCK_DERIVED`'s header member never fired.** It was
    // `\b[0-2]\d:[0-5]\d:[0-5]\d\b`, and the chrome writes the clock as
    // `\x1b[38;5;241m09:39:14\x1b[39m` — `m` is a word character, so there is
    // no boundary before the first digit. `masked` read 14 on every `spans`
    // replay, which is seven `last` cells on two sides and nothing else, and 0
    // at `counters`, which T5.1b asserted as *nothing masked* and which was
    // true only because the member was dead (F964). T1.87 above fed
    // `at 23:27:10`, a sentence with a space before the digits, which `\b`
    // accepts; this row feeds the bytes the chrome writes.
    const frame = (clock: string): string =>
      `\u001b[?25l\u001b[H\u001b[38;5;241mprism\u001b[39m  \u001b[38;5;241m${clock}\u001b[39m`;
    const out = compareFrames(recording([frame("09:39:14")]), [Buffer.from(frame("09:39:15"))]);
    expect(out.masked, "one clock cell on each side").toBe(2);
    expect(out.identical, "so a second hand is not a divergence").toBe(true);

    // The control: digits that are part of something longer stay unmasked on
    // the chrome's bytes as well as in prose — a four-digit head and a trailing
    // digit, which the lookarounds refuse where `\b` also did.
    for (const longer of ["109:39:14", "09:39:145"]) {
      const kept = compareFrames(recording([frame(longer)]), [
        Buffer.from(frame(longer.replace("14", "15"))),
      ]);
      expect(kept.masked, `${longer} is not a clock`).toBe(0);
      expect(kept.identical, `${longer} diverges`).toBe(false);
    }
  });
});
