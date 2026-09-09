// C28 — profiler (docs/components/C28_profiler.md §10), tier 5.
//
// Spec-first rows. C28's spec landed alone, ahead of its code, so every
// invariant it declares is named here and nowhere else yet — SP9 is what makes
// that a requirement rather than a courtesy: an invariant no row names is a
// claim nothing was written against, and it reads exactly like one that is
// satisfied.
//
// Each row carries the explicit no-blocker marker rather than a "waits on C28"
// clause, and that is TD3's ruling rather than an omission: COMPONENT_SOURCES
// may not name a path before the path exists, because a missing path reads as
// "not implemented" forever and silently exempts every deferral pointing at it.
// C28 gains its entry on the commit that makes src/shell/profiling/recorder.ts
// real, and from then on these expire the way every other deferral does.
//
// Generated from the spec's own §10 rows, so the two cannot drift apart by
// transcription; a row edited here and not there is a diff a reader can see.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { interactivePty } from "../support/pty.js";
import {
  CLOCK_DERIVED,
  type DriveOutcome,
  formatDrive,
  formatReplay,
  parseRecording,
  type Recording,
  type ReplayResult,
} from "../../src/testing/replay.js";

const FIXTURE = "node test/support/fixture.mjs";

/**
 * A recording, with what the harness measured while taking it.
 *
 * **The timings are the harness's clock and nothing in the recording carries
 * them** — a recorded event has a sequence number and no stamp, so how long the
 * far side took is unrecoverable from the file. They are here because the rows
 * below go red only inside a full tier run and green alone on the same `dist/`
 * (F929, F949), and the first question about such a run is what was slow.
 */
type Recorded = Readonly<{
  path: string;
  took: Readonly<{
    /** Spawn to the first prompt. */
    prompt: number;
    /** Submitting `/ps --limit 20` to the frame holding its last row. */
    answer: number;
    /** `^D` to the session being gone, or `null` when the harness had to kill it. */
    exit: number | null;
    /**
     * Every PTY read after the submit, as `+ms:bytes` — when the echo, the
     * frame drawn while waiting, and the answer each reached the terminal.
     */
    reads: string;
  }>;
}>;

/**
 * One recorded session: type, submit, stream, scroll, resize.
 *
 * **The recording is taken under a real PTY and nothing else**, because what
 * C28 I14 asserts is that the pipeline is a function of its inputs — and a fake
 * terminal supplies inputs the real one would not.
 */
async function record(
  opts: { readonly tier?: string; readonly pause?: number } = {},
): Promise<Recorded> {
  const tier = opts.tier ?? "spans";
  // **The pause between the answer and the resize is a knob because it is the
  // window** (F963). Every positional wall read the replay makes after the far
  // side's answer is served the value the live session read two positions
  // earlier, for as long as the replay transport reads nothing where C06 reads
  // twice; the resize repaint's header is then served the answer frame's last
  // stamp, taken `pause` ago. At 200 ms a wall-clock second boundary lands in
  // the gap one recording in thirty; at 1 000 ms it lands in every one.
  const pause = opts.pause ?? 200;
  const path = join(mkdtempSync(join(tmpdir(), "calcium-rec-")), "session.ndjson");
  const pty = interactivePty(`${FIXTURE} session subprocess`, {
    cols: 100,
    rows: 30,
    env: { CALCIUM_RECORD: path, CALCIUM_RECORD_TIER: tier },
  });
  const t0 = Date.now();
  let prompt = 0;
  let answer = 0;
  let exit: number | null = null;
  let submittedAt = t0;
  try {
    await pty.waitFor(/\u276f/u, 20_000);
    prompt = Date.now() - t0;
    pty.type("/ps --limit 20\r");
    submittedAt = Date.now();
    await pty.waitForFrame((f) => f.join("\n").includes("0000019"), 30_000);
    answer = Date.now() - submittedAt;
    await new Promise((r) => setTimeout(r, pause));
    pty.resize(90, 26);
    await new Promise((r) => setTimeout(r, 200));
    pty.type("\u0004");
    const closed = Date.now();
    await new Promise((r) => setTimeout(r, 600));
    // A one-millisecond probe: resolved if `^D` had already ended the session,
    // rejected if the kill below is what ends it. **Measured: it never has.**
    // C16 I16 makes `^D` at an empty prompt *open a confirm* rather than exit,
    // so the keystroke draws one frame and the session waits (15 s, measured)
    // for an answer nobody types; every recording ends by the kill and its
    // `end` line is the exit listener's (F912). Kept because the day the
    // harness answers the confirm the recording's shape changes, and this is
    // the field that would say so.
    exit = await pty.done(1).then(
      () => Date.now() - closed,
      () => null,
    );
  } finally {
    // **Kill, then wait for the process to be gone.** `kill()` is
    // fire-and-forget: it delivers the signal and returns, and the recording's
    // tail is written by the child's own exit listener. Reading the file the
    // moment `kill()` returns gets a recording with no `end` line — which
    // parses as truncated and, before the tail was flushed at all, put the
    // replay's clock five frames short (F912). Two ways to be truncated, one
    // of them the harness's.
    pty.kill();
    await pty.done(20_000).catch(() => 0);
  }
  const reads = pty.reads
    .filter((r) => r.at >= submittedAt)
    .map((r) => `+${String(r.at - submittedAt)}:${String(r.bytes)}`)
    .join(" ");
  return { path, took: { prompt, answer, exit, reads } };
}

/**
 * The fixture's verdict line: the comparison's fields, the drive's, and the
 * paths — `mirror` is the replay's own recording, which is the other half of
 * every comparison below.
 */
type Verdict = ReplayResult &
  DriveOutcome &
  Readonly<{
    frameHash: string;
    frames: number;
    mirror: string;
    overrun: Readonly<{ wall: number; mono: number }>;
    /** Positional clock reads the replay consumed, snapshotted when the drive finished. */
    consumed: Readonly<{ wall: number; mono: number }>;
    /** The recording's clock arrays' lengths — what `consumed` is compared with. */
    recorded: Readonly<{ wall: number; mono: number }>;
    misses: Readonly<Record<string, Readonly<Record<string, number>>>> | null;
    queries: Readonly<{ writes: number; frames: number }>;
  }>;

/**
 * Run one replay and read its verdict.
 *
 * The verdict goes to **stderr** because stdout is the replay's own captured
 * stream; a verdict written into it would be inside the thing being compared.
 */
function replay(path: string, envOverride: string | null = null): Verdict {
  const res = spawnSync("node", ["test/support/fixture.mjs", "replay", path], {
    encoding: "utf8",
    timeout: 60_000,
    env: envOverride === null ? process.env : { ...process.env, CALCIUM_REPLAY_ENV: envOverride },
  });
  const last = res.stderr.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(last) as Verdict;
  } catch {
    throw new Error(`replay produced no verdict — stderr was:\n${res.stderr}`);
  }
}

/**
 * A recording's event order, one token per event, frames by their size.
 *
 * **This is the instrument that broke F912**: four of its five divergences were
 * invisible in the frames — an extra `resize`, a missing `end` — and visible
 * the moment the two orders were read side by side. A frame whose only content
 * is a spinner glyph is a dozen bytes; a repaint is thousands; which one sits
 * between two inputs is the question, and a byte count answers it.
 */
function timeline(rec: Recording): string {
  const parts: string[] = [];
  for (const e of rec.timeline) {
    if (e.t === "frame") parts.push(`frame:${String(Buffer.from(e.b64, "base64").length)}`);
    else if (e.t === "input")
      parts.push(`input:${JSON.stringify(Buffer.from(e.b64, "base64").toString("utf8"))}`);
    else if (e.t === "resize") parts.push(`resize:${String(e.columns)}x${String(e.rows)}`);
    else parts.push(`far:${e.verb}`);
  }
  parts.push(
    rec.truncated ? `(truncated open=${String(rec.open)} torn=${String(rec.torn)})` : "end",
  );
  return parts.join(" ");
}

/**
 * Everything a red replay row can say about itself, as the assertion message.
 *
 * **The first assertion used to be `expect(out.identical).toBe(true)` and the
 * failure carried nothing** — four times the row was red only inside a full
 * `make e2e`, green alone every time, and each red run left one line: *expected
 * false to be true* (F929, F949). The verdict was printed by the fixture, to a
 * stderr the reporter dropped, and the recording sat in a temp directory nobody
 * could name. So: the paths, `formatReplay` and `formatDrive` over the verdict,
 * both event orders, the clock counts, the harness's own timings, and — only
 * when something is wrong — the machine: load, and any fixture process an
 * earlier file left behind, since the sequential run is the regime that fails.
 *
 * Every call also appends one JSON line to `CALCIUM_VERDICT_LOG` when that
 * names a file, so a green row leaves its figures too. A red row beside a
 * hundred green ones is only readable against what the green ones measured.
 */
function explain(row: string, recd: Recorded, out: Verdict): string {
  const rec = parseRecording(readFileSync(recd.path, "utf8"));
  const back = parseRecording(readFileSync(out.mirror, "utf8"));
  const wrong = !out.identical || out.stalled > 0 || out.exhaustedAt !== null;
  const machine = wrong
    ? [
        `load ${loadavg()
          .map((l) => l.toFixed(2))
          .join(" ")}`,
        `fixture processes alive: ${strays()}`,
      ]
    : [];
  const lines = [
    `${row} · recording ${recd.path}`,
    `mirror ${out.mirror}`,
    ...formatReplay(out),
    ...formatDrive(out),
    `clock reads recorded wall=${String(rec.wall.length)} mono=${String(rec.mono.length)} · ` +
      `consumed wall=${String(out.consumed.wall)} mono=${String(out.consumed.mono)} · ` +
      `mirrored wall=${String(back.wall.length)} mono=${String(back.mono.length)} · ` +
      `overrun wall=${String(out.overrun.wall)} mono=${String(out.overrun.mono)}`,
    `took prompt=${String(recd.took.prompt)}ms answer=${String(recd.took.answer)}ms ` +
      `exit=${recd.took.exit === null ? "killed" : `${String(recd.took.exit)}ms`}`,
    `reads after submit  ${recd.took.reads}`,
    `recorded  ${timeline(rec)}`,
    `replayed  ${timeline(back)}`,
    ...machine,
  ];
  const log = process.env["CALCIUM_VERDICT_LOG"];
  if (log !== undefined && log !== "") {
    const { divergence, ...rest } = out;
    appendFileSync(
      log,
      `${JSON.stringify({
        at: new Date().toISOString(),
        row,
        ...rest,
        divergenceAt: divergence?.at ?? null,
        recording: recd.path,
        took: recd.took,
        recorded: timeline(rec),
        replayed: timeline(back),
        load: loadavg(),
      })}\n`,
    );
  }
  return lines.join("\n");
}

/** Fixture or far-side processes alive right now, with their age — an earlier file's leftovers. */
function strays(): string {
  try {
    const ps = execFileSync("ps", ["-eo", "pid,etimes,pcpu,args"], { encoding: "utf8" });
    const rows = ps
      .split("\n")
      .filter((l) => /fixture\.mjs|farside\.mjs|emitter\.mjs/u.test(l))
      .map((l) => l.trim());
    return rows.length === 0 ? "none" : `\n    ${rows.join("\n    ")}`;
  } catch (e) {
    return `unreadable (${String(e)})`;
  }
}

describe("C28 — profiler, tier 5 spec-first rows", () => {
  it(
    "T5.1 (C28 I14): a recorded PTY session replays byte-identically, whole",
    async () => {
      const recd = await record();
      const rec = parseRecording(readFileSync(recd.path, "utf8"));

      // **The fixture is shown to respond before it is asserted against.** A
      // recording with no frames replays as identical to a replay with no
      // frames, and every assertion below passes on it (test/support/README.md).
      expect(rec.frames.length, "the session drew").toBeGreaterThan(3);
      expect(rec.drive.some((e) => e.t === "input"), "and was typed at").toBe(true);
      expect(rec.drive.some((e) => e.t === "resize"), "and resized").toBe(true);
      expect(rec.mono.length, "with the monotonic clock read").toBeGreaterThan(0);
      expect(rec.geometry, "and recorded the size it started at").not.toBeNull();
      // **Whole, and that is a claim about the recorder rather than the
      // replay.** C01's `signalExit` calls `process.exit` directly, so a
      // session ended by a signal never reaches `stop()` and the clock reads
      // still in the batch went with it — five frames into the replay the clock
      // stopped moving, the chrome row carrying its value had no delta, and the
      // frame was never composed. The tail is flushed from `process.on("exit")`
      // now (F912), and this row is what says so.
      expect(rec.truncated, "and ended cleanly, tail flushed").toBe(false);

      const out = replay(recd.path);
      const why = explain("T5.1", recd, out);
      expect(out.compared, `over the frames the recording holds\n${why}`).toBeGreaterThan(3);
      expect(out.compared, `all of them\n${why}`).toBe(rec.frames.length);
      // **The drive was paced by the recording, not slept through** (F912). A
      // stall means an event went out against a state the recording never held,
      // so every later frame is the harness's answer rather than the subject's
      // — and the first driver stalled all eight while still producing six
      // byte-identical frames, which is why this is asserted and not inferred.
      expect(out.stalled, `with every recorded frame drawn before the next event\n${why}`).toBe(0);
      expect(out.delivered, `and every input and resize delivered\n${why}`).toBeGreaterThan(2);
      // The clock is an input, and it lasted: a replay reading past the end of
      // the recorded stream gets the last value repeated, which stops durations
      // moving and changes which frames get drawn at all.
      expect(out.exhaustedAt, `the recorded clock outlasted the session\n${why}`).toBeNull();

      expect(out.divergence, `no frame differs\n${why}`).toBeNull();
      expect(out.identical, `so the pipeline is a function of its inputs\n${why}`).toBe(true);
      // **The mask is asserted to have fired** (F911). Byte-identity here is
      // modulo the cells drawn from a clock rather than from the inputs — C24
      // I32's `last N.Nms` — and a mask that matched nothing would make the row
      // a claim about a comparison that never happened.
      expect(out.masked, `and the clock-derived mask fired\n${why}`).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "T5.1b (C28 I14): at `counters` the same session replays identically with nothing masked",
    async () => {
      // **The control for T5.1's mask.** C24 I32's `last N.Nms` is absent below
      // `spans`, so this recording has no cell whose value comes from a clock
      // the inputs do not fix. If identity here needed the mask too, the mask
      // would be excusing something other than what it names.
      //
      // It also fixes a divergence the tier itself caused: the replay used to
      // hard-code `spans` while the regime had carried the recorded tier all
      // along, so a session recorded at `counters` was replayed by one drawing
      // a cost cell it never had — a recorded field with no reader, which is
      // how `binary` diverged at byte 43 as well (F912).
      const recd = await record({ tier: "counters" });
      const out = replay(recd.path);
      const why = explain("T5.1b", recd, out);
      expect(out.identical, `identical\n${why}`).toBe(true);
      // **What "nothing masked" meant, and what it means.** Below `spans` the
      // cost cell is absent — no recorded frame holds a `last N.Nms` — and that
      // absence is the control for T5.1's mask. The header's time-of-day is
      // drawn at every tier, so it is masked here too: `masked` is not zero, it
      // is the header's clock on both sides. The row said zero, and was green,
      // for exactly as long as that member of `CLOCK_DERIVED` was dead (F964).
      const rec = parseRecording(readFileSync(recd.path, "utf8"));
      const cost = new RegExp(CLOCK_DERIVED[0]?.source ?? "$^", "u");
      expect(
        rec.frames.some((f) => cost.test(Buffer.from(f).toString("utf8"))),
        "no cost cell in any recorded frame below spans",
      ).toBe(false);
      expect(out.masked, `and the header's clock is what was excused\n${why}`).toBeGreaterThan(0);
      expect(out.compared, `over the whole session\n${why}`).toBeGreaterThan(3);
      expect(out.stalled, `and paced, not slept\n${why}`).toBe(0);
    },
    120_000,
  );

  it(
    "T1.83 (C28 I47): the replay re-derives its capabilities from the recorded environment",
    async () => {
      // **A replay is handed the environment, not the verdict.** Handing it the
      // recorded capability record is the obvious saving and it takes C02 out
      // of the gate entirely: both runs would trust one answer, so a detector
      // returning nonsense replays byte-identically.
      const recd = await record();
      const out = replay(recd.path);
      const why = explain("T1.83", recd, out);
      expect(out.identical, `the recorded environment replays identically\n${why}`).toBe(true);

      // **The fabricated violation, run rather than described.** If the verdict
      // were replayed, changing the environment under it would change nothing.
      // `TERM=dumb` gives a stronger answer than a divergence: C02 finds no
      // alternate screen and C22 gate 3b refuses to start at all, which no
      // replayed verdict could produce.
      const dumb = spawnSync("node", ["test/support/fixture.mjs", "replay", recd.path], {
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, CALCIUM_REPLAY_ENV: JSON.stringify({ TERM: "dumb" }) },
      });
      expect(dumb.status, "a different environment is detected, not replayed").not.toBe(0);
      expect(dumb.stderr, "and the refusal names what it found").toContain("no alternate screen");

      // And a change C02 survives still reaches the frames: 16 colours where
      // the recording drew 256, so the bytes differ rather than the session
      // refusing.
      const plain = replay(recd.path, JSON.stringify({ TERM: "xterm", COLORTERM: "" }));
      expect(plain.identical, "a narrower terminal draws different bytes").toBe(false);

      // **Where the queries are, measured rather than assumed.** This fixture's
      // detector reads the environment and writes no device-attribute query at
      // all — so a row asserting query escapes among the replayed writes, which
      // is what §10 asked for, would have been asserting an empty population.
      expect(out.queries.writes, "no query among the raw writes").toBe(0);
      expect(out.queries.frames, "nor among the frames").toBe(0);
    },
    120_000,
  );

  it(
    "T6.16 (C28 I47): recording the verdict on `Recording` and handing it to the replay instead of re-deriving it → T1.83 fails, and this row names both halves",
    async () => {
      // **The revert**: a `capabilities` member on the regime line, written by
      // the recorder and passed to `createTui` by the replay in place of `env`.
      // It is the obvious saving — the detector's answer is right there — and it
      // takes C02 out of the gate: both runs trust one recorded answer, so a
      // detector returning nonsense replays byte-identically. **Here rather
      // than in test/revert/**, because the revert is only observable against a
      // detector that ran: a tier-6 row asserting the *absence* of a field on
      // `Recording` is what TypeScript already checks, and passes identically
      // with the field present under another name.
      const recd = await record();

      // **Half one — what the recording carries.** The regime line as bytes on
      // disk, not through `parseRecording`, whose type would drop a member it
      // does not declare. Compared by equality rather than by absence: a row
      // asserting `capabilities` is missing sees only the spelling it guessed,
      // and a verdict recorded as `caps` or `detected` is the same revert. The
      // six keys are the detector's input and the app's identity — nothing
      // detection answers — and a seventh is reviewed against C28 I47 by failing here.
      const lines = readFileSync(recd.path, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      const regimes = lines.filter((e) => e["t"] === "regime");
      expect(regimes, "one session, one regime line").toHaveLength(1);
      expect(Object.keys(regimes[0] ?? {}).sort(), "construction-time facts, and no verdict").toEqual([
        "binary",
        "env",
        "name",
        "node",
        "t",
        "tier",
      ]);
      const env = regimes[0]?.["env"] as Record<string, string>;
      expect(env["TERM"], "the input C02 reads — the PTY's own TERM").toBe("xterm-256color");

      // **Half two — what the replay does with it.** One recording, two
      // environments handed to the replay, two byte streams: the second run's
      // frames come from a detector that read `TERM=xterm` with no `COLORTERM`,
      // 16 colours where the recording drew 256 (T1.83 measured the
      // divergence). Under the revert both replays draw from the recorded
      // verdict and hash equal, whatever environment they are handed.
      const same = replay(recd.path);
      const fewer = replay(recd.path, JSON.stringify({ TERM: "xterm", COLORTERM: "" }));
      const why = explain("T6.16", recd, same);
      expect(same.frames, `the first replay drew the session\n${why}`).toBeGreaterThan(3);
      expect(fewer.frames, "and so did the second").toBeGreaterThan(3);
      expect(fewer.frameHash, "two environments, two byte streams").not.toBe(same.frameHash);
      // The control that gives the inequality its meaning: the recorded
      // environment still replays identically, so the difference above is the
      // environment's and not a replay disagreeing with itself. If this is the
      // only red line, it is T5.1's divergence and not this row's revert.
      expect(same.identical, `and the recorded environment still replays identically\n${why}`).toBe(
        true,
      );
    },
    120_000,
  );

  it(
    "T5.1c (C28 I14): the replay consumes exactly the recorded clock reads — a transport stand-in reads the clock where the live one does",
    async () => {
      // **Read parity, as a count, because a positional clock is only as good
      // as an alignment nothing checked.** C06's subprocess transport reads the
      // wall clock before it spawns and again for `durationMs`; the replay's
      // stand-in served the recorded value and read nothing, so every later
      // read was two places behind and the resize repaint's header was handed
      // the answer frame's last stamp. When a wall-clock second boundary fell
      // in that gap — ~30 ms on a quiet machine, wider on a busy one — the
      // header read `:13` on one side and `:14` on the other, and the mask
      // covers a value, not the decision to redraw a row (F963). Four red runs
      // inside a full tier, green alone every time, and this count is the
      // difference: 52 reads consumed against 54 recorded.
      //
      // **The window is widened to a second so the race is not a race.** With
      // a 1 000 ms pause between the answer and the resize, a wall-clock second
      // boundary always falls between the answer frame's last read and the
      // resize repaint's header read — so a replay two positions behind draws
      // the previous second in that header on every run, and one in step draws
      // the same second on every run.
      const recd = await record({ pause: 1_000 });
      const out = replay(recd.path);
      const why = explain("T5.1c", recd, out);
      expect(out.consumed.wall, `wall positions consumed equal wall reads recorded\n${why}`).toBe(
        out.recorded.wall,
      );
      // **Mono is reported and not asserted here.** The live session's `^D`
      // handling takes one mono read more than the replay's in some recordings
      // and not others — a read in the stop path that lands before or after the
      // `end` line by timing — and it is masked in effect: the only cell it
      // reaches is C24 I32's `last N.Nms`.
      expect(out.identical, `so the header's second hand agrees, deterministically\n${why}`).toBe(
        true,
      );
    },
    120_000,
  );

  it(
    "T5.2 (C28 I14): the same recording replayed twice gives the same frames",
    async () => {
      const recd = await record();
      const a = replay(recd.path);
      const b = replay(recd.path);
      const why = `${explain("T5.2", recd, a)}\n${explain("T5.2", recd, b)}`;
      // **Two replays against each other, not each against the recording.**
      // T5.1 already compares to the recording; what this adds is that the
      // replay is itself deterministic, which is what makes a timing figure
      // taken from one comparable to a figure taken from the other.
      expect(a.frameHash, `run one\n${why}`).toBe(b.frameHash);
      expect(a.compared, `over the same count\n${why}`).toBe(b.compared);
    },
    120_000,
  );
  it("T5.3 (C28 I37, A01 Appendix B): make profile fills all six appendix rows against dist/", () => {
    // **Tier 5 because the subject is `dist/`.** `checkBudget` has tier-1 rows
    // over report literals; what those cannot ask is whether a session driven
    // through the built package's public surface produces a report the table can
    // read. A probe against a stale build gives a wrong negative and nothing
    // revisits a ruled-out candidate, which is why this runs where the build is.
    //
    // Small numbers: the appendix's rows are about a frame's shape, not its
    // size, and a 300-line document crosses the same thresholds a 10,000-line
    // one does while costing the suite a second instead of a minute.
    const out = execFileSync("node", ["tools/profile.mjs", "300", "6"], {
      encoding: "utf8",
      timeout: 120_000,
    });

    // The fixture is shown to respond before anything is read from it — the
    // tool's own guard, asserted here so a dead fixture is a red row rather than
    // a plausible table (`test/support/README.md`).
    expect(out, "the document reached the transcript").toContain("fixture live:");

    // **All six of A01's labels, verbatim.** The row said *three* until the
    // appendix was filled; a table that quietly drops the rows it cannot answer
    // is the plausible-zero failure one level up from a cell.
    for (const label of [
      "Bytes written per frame",
      "Median frame construction",
      "p95 frame construction",
      "Resize corruption count",
      "10k-line Page Down latency",
      "Streaming CPU",
    ]) {
      expect(out, `the appendix's row ${label}`).toContain(label);
    }

    // Four measured, two refused — and the two refused are named, because an
    // absence that prints nothing is indistinguishable from a zero.
    const refusals = out.match(/unanswerable:/g) ?? [];
    expect(refusals, "resize corruption and Page Down, and only those").toHaveLength(2);

    // A verdict, and never `closed` while two rows are blank.
    expect(out).toMatch(/M-T6: \*\*(justified|undecided)\*\*/);
    expect(out, "six rows and four answers cannot close the experiment").not.toContain(
      "M-T6: **closed**",
    );

    // The regime travels with the figures (C28 I13), and so does the split the
    // component exists for.
    expect(out, "the table names the machine it was measured on").toContain("Regime: node ");
    expect(out, "compute against draw, from PHASE_GROUP on the published face").toContain(
      "Where the frame went",
    );
  }, 120_000);
  it(
    "T5.4 (C28 I8): a replayed input gives deterministic miss counts, and recomputes nothing it held",
    async () => {
      // **D2's regime, and the only one in which asserting this is honest.** A
      // live session's miss count depends on what the far side did and when, so
      // a row asserting zero against one is asserting the machine. Replayed,
      // the inputs are fixed, so the count is a property of the code.
      const recd = await record();
      const a = replay(recd.path);
      const b = replay(recd.path);
      const why = explain("T5.4", recd, a);

      // **`misses` is `cache → reason → count`, and the first draft read it as
      // `reason → count`** — so `misses["nothing-changed"]` was `undefined` on
      // every run and the row asserted a shape the report has never had. C28's
      // §10 carried the same reading, which is why the fix is a spec edit as
      // well (F913).
      expect(a.misses, "the replay reported its caches").not.toBeNull();
      const caches = Object.entries(a.misses ?? {});
      expect(caches.length, "and at least one of them missed").toBeGreaterThan(0);

      // **Determinism first, because it holds whatever the counts are.** D2's
      // ruling is that a live session's miss counts depend on what the far side
      // did and when; replayed, the inputs are fixed, so the whole map is a
      // property of the code.
      expect(a.misses, `two replays of one recording give the same miss counts\n${why}`).toStrictEqual(
        b.misses,
      );

      // **And the substantive claim.** `nothing-changed` means the value
      // recomputed after a miss equalled the one the miss discarded — work done
      // for nothing. The recorder omits a reason that never fired rather than
      // writing a zero for it (C28 I13), so its absence is the assertion.
      for (const [cache, reasons] of caches) {
        expect(reasons["nothing-changed"] ?? 0, `${cache} recomputed nothing it already had`).toBe(
          0,
        );
      }
    },
    120_000,
  );
});
