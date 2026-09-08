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
import { execFileSync } from "node:child_process";

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { interactivePty } from "../support/pty.js";
import { parseRecording } from "../../src/testing/replay.js";

const FIXTURE = "node test/support/fixture.mjs";

/**
 * One recorded session: type, submit, stream, scroll, resize.
 *
 * **The recording is taken under a real PTY and nothing else**, because what
 * C28 I14 asserts is that the pipeline is a function of its inputs — and a fake
 * terminal supplies inputs the real one would not.
 */
async function record(tier = "spans"): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), "calcium-rec-")), "session.ndjson");
  const pty = interactivePty(`${FIXTURE} session subprocess`, {
    cols: 100,
    rows: 30,
    env: { CALCIUM_RECORD: path, CALCIUM_RECORD_TIER: tier },
  });
  try {
    await pty.waitFor(/\u276f/u, 20_000);
    pty.type("/ps --limit 20\r");
    await pty.waitForFrame((f) => f.join("\n").includes("0000019"), 30_000);
    pty.resize(90, 26);
    await new Promise((r) => setTimeout(r, 200));
    pty.type("\u0004");
    await new Promise((r) => setTimeout(r, 600));
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
  return path;
}

/**
 * Run one replay and read its verdict.
 *
 * The verdict goes to **stderr** because stdout is the replay's own captured
 * stream; a verdict written into it would be inside the thing being compared.
 */
function replay(
  path: string,
  envOverride: string | null = null,
): {
  identical: boolean;
  compared: number;
  divergence: unknown;
  frameHash: string;
  frames: number;
  masked: number;
  elided: boolean;
  stalled: number;
  delivered: number;
  exhaustedAt: number | null;
  misses: Readonly<Record<string, Readonly<Record<string, number>>>> | null;
  queries: Readonly<{ writes: number; frames: number }>;
} {
  const res = spawnSync("node", ["test/support/fixture.mjs", "replay", path], {
    encoding: "utf8",
    timeout: 60_000,
    env: envOverride === null ? process.env : { ...process.env, CALCIUM_REPLAY_ENV: envOverride },
  });
  const last = res.stderr.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(last) as ReturnType<typeof replay>;
  } catch {
    throw new Error(`replay produced no verdict — stderr was:\n${res.stderr}`);
  }
}

describe("C28 — profiler, tier 5 spec-first rows", () => {
  it(
    "T5.1 (C28 I14): a recorded PTY session replays byte-identically, whole",
    async () => {
      const path = await record();
      const rec = parseRecording(readFileSync(path, "utf8"));

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

      const out = replay(path);
      expect(out.compared, "over the frames the recording holds").toBeGreaterThan(3);
      expect(out.compared, "all of them").toBe(rec.frames.length);
      // **The drive was paced by the recording, not slept through** (F912). A
      // stall means an event went out against a state the recording never held,
      // so every later frame is the harness's answer rather than the subject's
      // — and the first driver stalled all eight while still producing six
      // byte-identical frames, which is why this is asserted and not inferred.
      expect(out.stalled, "with every recorded frame drawn before the next event").toBe(0);
      expect(out.delivered, "and every input and resize delivered").toBeGreaterThan(2);
      // The clock is an input, and it lasted: a replay reading past the end of
      // the recorded stream gets the last value repeated, which stops durations
      // moving and changes which frames get drawn at all.
      expect(out.exhaustedAt, "the recorded clock outlasted the session").toBeNull();

      expect(out.divergence, "no frame differs").toBeNull();
      expect(out.identical, "so the pipeline is a function of its inputs").toBe(true);
      // **The mask is asserted to have fired** (F911). Byte-identity here is
      // modulo the cells drawn from a clock rather than from the inputs — C24
      // I32's `last N.Nms` — and a mask that matched nothing would make the row
      // a claim about a comparison that never happened.
      expect(out.masked, "and the clock-derived mask fired").toBeGreaterThan(0);
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
      const path = await record("counters");
      const out = replay(path);
      expect(out.identical, "identical").toBe(true);
      expect(out.masked, "with nothing excused").toBe(0);
      expect(out.compared, "over the whole session").toBeGreaterThan(3);
      expect(out.stalled, "and paced, not slept").toBe(0);
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
      const path = await record();
      const out = replay(path);
      expect(out.identical, "the recorded environment replays identically").toBe(true);

      // **The fabricated violation, run rather than described.** If the verdict
      // were replayed, changing the environment under it would change nothing.
      // `TERM=dumb` gives a stronger answer than a divergence: C02 finds no
      // alternate screen and C22 gate 3b refuses to start at all, which no
      // replayed verdict could produce.
      const dumb = spawnSync("node", ["test/support/fixture.mjs", "replay", path], {
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, CALCIUM_REPLAY_ENV: JSON.stringify({ TERM: "dumb" }) },
      });
      expect(dumb.status, "a different environment is detected, not replayed").not.toBe(0);
      expect(dumb.stderr, "and the refusal names what it found").toContain("no alternate screen");

      // And a change C02 survives still reaches the frames: 16 colours where
      // the recording drew 256, so the bytes differ rather than the session
      // refusing.
      const plain = replay(path, JSON.stringify({ TERM: "xterm", COLORTERM: "" }));
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
    "T5.2 (C28 I14): the same recording replayed twice gives the same frames",
    async () => {
      const path = await record();
      const a = replay(path);
      const b = replay(path);
      // **Two replays against each other, not each against the recording.**
      // T5.1 already compares to the recording; what this adds is that the
      // replay is itself deterministic, which is what makes a timing figure
      // taken from one comparable to a figure taken from the other.
      expect(a.frameHash, "run one").toBe(b.frameHash);
      expect(a.compared, "over the same count").toBe(b.compared);
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
      const path = await record();
      const a = replay(path);
      const b = replay(path);

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
      expect(a.misses, "two replays of one recording give the same miss counts").toStrictEqual(
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
