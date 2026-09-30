// C21 tier 4 — integration. The runner under its actual consumer.
//
// **This tier is the point of the branch.** `fakeRunner` has stood in for C21
// since C06 was written, and C08's recording composes over
// `createSubprocessTransport` — so a divergence between the fake and the real
// thing has been invisible until now. What moves here is a finding about the
// interface, not a licence to widen it.
//
// T4.2 — the escalation ladder issuing real signals — lives in
// `test/integration/transport.test.ts` as C06's own T4.1, because it is C06's
// ladder being asserted and the deferral that expired was C06's. Not duplicated
// here.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { buildGraph } from "../support/session.js";
import { MODES } from "../support/fake-terminal.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { createSubprocessTransport } from "../../src/data/transport/index.js";
import { fakeClock } from "../support/fake-scheduler.js";
import { asScriptFile, collect, scripts } from "../support/process.js";
import { clockOf, drain, invocation } from "../support/transport.js";

function realTransport(over: { cwd?: () => string } = {}) {
  return createSubprocessTransport({
    binary: "node",
    clock: clockOf(fakeClock()),
    runner: createProcessRunner({ env: process.env, stdin: {} }),
    ...(over.cwd === undefined ? {} : { cwd: over.cwd }),
  });
}

/** The argv C06 will spawn, minus the binary it prepends. */
function program(argv: readonly string[]): readonly string[] {
  const [, ...rest] = asScriptFile(argv);
  return rest;
}

describe("C21 with C06", () => {
  it("T4.1: every RawResult field is populated from a real spawn", async () => {
    const result = await realTransport().invoke(
      invocation({
        argv: program([
          "node",
          "-e",
          `process.stdout.write('{"rows":[1,2]}');process.stderr.write("a warning");process.exit(0)`,
        ]),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toEqual({ rows: [1, 2] });
    expect(result.stdoutRaw).toBe('{"rows":[1,2]}');
    expect(result.stderr).toBe("a warning");
    expect(result.parseError).toBeNull();
    expect(result.cancelled).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.overflowed).toBe(false);
    // `argv` is what was actually spawned, `--json` included (C06 I20).
    expect(result.argv.at(-1)).toBe("--json");
  });

  it("T4.1: a non-zero exit and a signal are reported, not interpreted", async () => {
    const failed = await realTransport().invoke(
      invocation({ argv: program(scripts.exit(2)) }),
    );

    expect(failed.exitCode).toBe(2);
    // No status, no envelope. C06 reports and C07 decides (C06 I2), and the
    // whole of that discipline holds against a real process exactly as it did
    // against the fake.
    expect(failed.stderr).toBe("");
  });

  it("T4.3: NDJSON with multi-byte content split across chunk boundaries parses cleanly", async () => {
    // The decoder's payoff, tested at the consumer. C06 reads NDJSON line by
    // line, so a rune split across a pipe chunk would arrive as two replacement
    // marks inside a JSON string — and the failure appears only with non-ASCII
    // content and only at certain output sizes.
    const patches = await drain(
      realTransport().stream(
        invocation({ argv: program(scripts.ndjson(500, "日本語🚀ünïcode")), streams: true }),
      ),
    );

    const data = patches.filter((p) => p.kind === "data");
    expect(data).toHaveLength(500);
    for (const patch of data) {
      expect((patch as { value: { text: string } }).value.text).toBe("日本語🚀ünïcode");
    }
    expect(patches.at(-1)?.kind).toBe("end");
  });

  it("T4.6: cwd is read per spawn, so a cd between verbs moves where the next one lands", async () => {
    // C18's `cd` built-in is a variable this side of the seam. C06 holds a
    // `() => string` and C21 reads it at spawn; between them, nothing captures.
    const first = mkdtempSync(`${tmpdir()}/c21-cd-a-`);
    const second = mkdtempSync(`${tmpdir()}/c21-cd-b-`);
    let cwd = first;

    const transport = realTransport({ cwd: () => cwd });
    const argv = program(["node", "-e", `process.stdout.write(JSON.stringify(process.cwd()))`]);

    expect((await transport.invoke(invocation({ argv }))).stdout).toBe(first);
    cwd = second;
    expect((await transport.invoke(invocation({ argv }))).stdout).toBe(second);

    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  });

  it("T4.1: a far side that cannot be spawned is a result, not a throw", async () => {
    // The path `fakeRunner` could never exercise: it throws on demand or does
    // not, and the real runner does neither — it resolves `exited` with a null
    // code and puts the message on stderr. C06 handles both, and this is the
    // half that had never run.
    // The *binary* is what has to be missing. `node missing.js` spawns
    // perfectly and exits 1 — a far side that ran and failed, which is a
    // different report and C07 maps it differently.
    const missing = await createSubprocessTransport({
      binary: "definitely-not-a-binary-xyzzy",
      clock: clockOf(fakeClock()),
      runner: createProcessRunner({ env: process.env, stdin: {} }),
    }).invoke(invocation({ argv: ["ps"] }));

    expect(missing.exitCode).toBeNull();
    expect(missing.stderr).not.toBe("");
    expect(missing.stdoutRaw).toBe("");
    expect(missing.parseError).not.toBeNull();
  });

  it("T4.1: a deleted cwd surfaces as a result the session survives", async () => {
    const doomed = mkdtempSync(`${tmpdir()}/c21-gone-`);
    mkdirSync(`${doomed}/inner`);
    rmSync(doomed, { recursive: true });

    const transport = realTransport({ cwd: () => `${doomed}/inner` });
    const result = await transport.invoke(invocation({ argv: program(scripts.emit("hi")) }));

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toMatch(/ENOENT|no such file/i);
  });

  it("T4.1 (I5): an overflowing child reports overflowed through the transport", async () => {
    // C21's bound, C06's field, one real process. The value is carried rather
    // than reconstructed, so `stdoutRaw` being a prefix is something a consumer
    // can know about instead of a silent truncation.
    const result = await createSubprocessTransport({
      binary: "node",
      clock: clockOf(fakeClock()),
      runner: createProcessRunner({ env: process.env, stdin: {} }),
    }).invoke(invocation({ argv: program(scripts.emitBytes(32 * 1024 * 1024)) }));

    expect(result.overflowed).toBe(true);
    expect(result.stdoutRaw.length).toBe(8 * 1024 * 1024);
    expect(result.exitCode).toBe(0);
  }, 60_000);

  it("T4.4 (with C23, C18): a shell result routes to spawnShell and an app result does not", async () => {
    // **C18 classifies, C23 routes** — and the pair is the assertion. A test
    // that only checks the shell half passes on a pipeline that shells
    // *everything*, which is D18's injection path opened for every verb.
    const shell = pipelineHarness();
    shell.pipeline.submit("echo hi");
    await settled(shell.pipeline);
    expect(shell.calls, "a shell command is delegated").toContain("spawnShell");
    expect(shell.calls, "and never invoked as a verb").not.toContain("invoke");

    const app = pipelineHarness();
    app.pipeline.submit("/ps");
    await settled(app.pipeline);
    expect(app.calls, "an app verb goes through the transport").toContain("invoke");
    expect(app.calls, "and never through a shell — D18's whole claim").not.toContain("spawnShell");
  });
  it("T4.5 (with C01): the handoff sequence runs in order, on both opt-ins", async () => {
    // A02 Seam 4's `Child process needing a TTY` row, from C21's side. The
    // trigger it waited on is C05 I19's field and C18 §5a's marker, and the
    // claim here is that C23 sequences all four calls around them.
    const shell = pipelineHarness();
    shell.pipeline.submit("/tty vim notes.md");
    await settled(shell.pipeline);

    expect(shell.calls.filter((c) => c !== "resetFocus")).toEqual([
      "suspend",
      "handoff",
      "resume",
      // **Between the resume and the repaint** (C22 I25). Whatever the decoder
      // was holding belongs to a sequence the child interrupted; kept, the
      // first keystroke back completes it wrongly.
      "resetInput",
      "invalidate",
    ]);
    // The marker is C18's and never reaches the child (C18 I26).
    expect(shell.handed).toEqual([["sh", "-c", "vim notes.md"]]);
    expect(shell.calls, "a handoff is not a spawn").not.toContain("spawnShell");

    // The app opt-in reaches the same sequence by a different route, and
    // **bypasses the transport**: the child owns the terminal, so there is no
    // stdout to invoke for.
    const app = pipelineHarness();
    app.pipeline.submit("/edit config.yaml");
    await settled(app.pipeline);

    expect(app.calls.filter((c) => c !== "resetFocus")).toEqual([
      "suspend",
      "handoff",
      "resume",
      // **Between the resume and the repaint** (C22 I25). Whatever the decoder
      // was holding belongs to a sequence the child interrupted; kept, the
      // first keystroke back completes it wrongly.
      "resetInput",
      "invalidate",
    ]);
    expect(app.handed).toEqual([["widget", "edit", "config.yaml"]]);
    expect(app.calls, "an interactive verb never goes through the transport").not.toContain("invoke");

    // **T4.23 (C23 I38, C05 I23) — the contract is the invocation's.** `edit` is
    // declared interactive and `--background` carries the arm, so one verb takes
    // both routes. Both halves in one row: a route that always hands off
    // satisfies the handoff assertion, and one that never does satisfies the
    // transport assertion.
    const armed = pipelineHarness();
    armed.pipeline.submit("/edit -b config.yaml");
    await settled(armed.pipeline);
    expect(armed.calls, "the arm sends it through the transport").toContain("invoke");
    expect(armed.calls, "and nowhere near the terminal").not.toContain("handoff");
    expect(armed.lifecycle).toEqual([]);
    // The flag is the app's own and still travels: the axis here is the terminal
    // contract, not transmission (C05 I21 is the other one).
    expect(armed.handed).toEqual([]);

    // **T4.24 (C23 I38) — the gate is above the split.** An invalid invocation of
    // an interactive verb produced an error and no spawn. `handed` is the
    // assertion; a row checking only the document passes on the ordering that
    // spawns first and reports afterwards, which is the ordering this replaces
    // (F119).
    const invalid = pipelineHarness();
    invalid.pipeline.submit("/edit --nonsense");
    await settled(invalid.pipeline);
    expect(invalid.handed, "nothing was spawned").toEqual([]);
    expect(invalid.calls, "and the terminal was never taken").not.toContain("suspend");
    expect(invalid.calls).not.toContain("invoke");

    // The control: an ordinary app verb still does, so the branch is reading
    // `interactive` rather than having replaced the app route.
    const ordinary = pipelineHarness();
    ordinary.pipeline.submit("/ps");
    await settled(ordinary.pipeline);
    expect(ordinary.calls).toContain("invoke");
    expect(ordinary.lifecycle, "and never touches the terminal").toEqual([]);
  });

  it("T4.5b (C23 §8a A6.5): a rejected handoff still resumes the terminal", async () => {
    // **C21 T3.8's guard, from the caller's side.** It rejects on a raw stdin —
    // a precondition of *this* sequence, checked from inside its second step —
    // so the rejection unwinds out of a sequence that has already suspended.
    // Without the inner `finally` the session sits on the primary screen with
    // no frame and no visible error, because diagnostics write to a released
    // screen. Predicted by the walk rather than found, so it is asserted.
    const h = pipelineHarness({
      handoff: () =>
        Promise.reject(
          new Error("handoff() with stdin still in raw mode — the caller skipped lifecycle.suspend()"),
        ),
    });
    h.pipeline.submit("/tty vim");
    await settled(h.pipeline);

    expect(h.lifecycle, "suspended and resumed, in that order").toEqual(["suspend", "resume"]);
    expect(h.pipeline.inFlight, "and the guard is not stranded").toBeNull();
    // The reset is in the same `finally`, so the rejection path clears the
    // decoder too. A reset placed after the `try` would leave a half-decoded
    // sequence alive on exactly the path nobody drives by hand (C22 I25).
    expect(h.calls, "and the decoder is cleared on the throw path as well").toContain("resetInput");

    const entry = h.transcript.entries.at(-1);
    expect(entry?.doc.status, "the failure is reported rather than swallowed").toBe("error");
    expect(JSON.stringify(entry?.doc)).toMatch(/raw mode/);
  });
  it("T4.93 (C23 I95, ruling 91, F1476): a handoff's notice takes the tone and mark of the status it sits on — finished, failed or cancelled", async () => {
    // **A classification table, asserted whole** (C23 §8a A6.6). The defect was
    // a tone and a status that disagreed — `warn` and ▲ on an `error` document —
    // so a row per field would pass a build that moved one and not the other.
    // Each cell is its own harness: one `Exit` per submission, read once.
    const endings: readonly (readonly [string, { code: number | null; signal: string | null }])[] = [
      ["exit 0", { code: 0, signal: null }],
      ["exited 1", { code: 1, signal: null }],
      // A child that never started (C21 I13): still a failure, and it names no
      // exit it never returned (ruling 94, F1482).
      ["never started", { code: null, signal: null }],
      // A grandchild's SIGINT under `sh -c` arrives as 128+n with no signal, and
      // ruling 91 says a non-zero exit is a failure (A6.6 row 4).
      ["exited 130", { code: 130, signal: null }],
      ["SIGKILL", { code: null, signal: "SIGKILL" }],
      // A terminal sends it too; the ruling's set is three (A6.6 row 6).
      ["SIGQUIT", { code: null, signal: "SIGQUIT" }],
      ["SIGINT", { code: null, signal: "SIGINT" }],
      ["SIGTERM", { code: null, signal: "SIGTERM" }],
      ["SIGHUP", { code: null, signal: "SIGHUP" }],
    ];
    const seen: string[] = [];
    for (const [name, exit] of endings) {
      const h = pipelineHarness({ handoff: () => Promise.resolve(exit) });
      h.pipeline.submit("/tty vim");
      await settled(h.pipeline);
      const doc = h.transcript.entries.at(-1)?.doc;
      const notice = doc?.blocks[0] as { kind?: string; tone?: string; glyph?: string; text?: string } | undefined;
      expect(doc?.blocks, `${name}: one block`).toHaveLength(1);
      expect(notice?.kind, `${name}: a notice`).toBe("notice");
      seen.push(`${name}: ${String(notice?.tone)} ${String(notice?.glyph)} ${String(doc?.status)} · ${String(notice?.text)}`);
    }
    expect(seen).toEqual([
      "exit 0: muted continuation ok · vim finished",
      "exited 1: error error error · vim exited 1",
      "never started: error error error · vim did not start",
      "exited 130: error error error · vim exited 130",
      "SIGKILL: error error error · vim ended on SIGKILL",
      "SIGQUIT: error error error · vim ended on SIGQUIT",
      "SIGINT: muted cancelled partial · vim ended on SIGINT",
      "SIGTERM: muted cancelled partial · vim ended on SIGTERM",
      "SIGHUP: muted cancelled partial · vim ended on SIGHUP",
    ]);
  });
  it("T4.94 (C23 I96, C23 I66, ruling 92): the shell route's cancel settles partial, muted, with the cancelled mark above the kept screen", async () => {
    // **The status and the mark together**, because the defect was an `error`
    // box on an `error` document: a row reading the status alone passes a build
    // that moves it and keeps the box, and one reading the notice alone passes
    // the reverse. A real child dies *of* the signal, so the fake settles from
    // `signal` — one that resolved on its own would settle cancelled unsignalled.
    let emit: ((c: string) => void) | null = null;
    let settleChild: ((e: { code: number | null; signal: string | null }) => void) | null = null;
    const h = pipelineHarness({
      hasPty: true,
      spawnPty: () => ({
        pid: 4242,
        exited: new Promise((r) => {
          settleChild = r as (e: { code: number | null; signal: string | null }) => void;
        }),
        running: true,
        onData: (cb) => {
          emit = cb;
        },
        write: () => undefined,
        resize: () => undefined,
        signal: (sig) => {
          settleChild?.({ code: null, signal: sig });
          return true;
        },
      }),
    });
    h.pipeline.submit("!sleep 100");
    // The route imports the emulator before it spawns (C23 I71), so the child
    // exists a few turns after the submit rather than one.
    for (let i = 0; i < 40 && emit === null; i += 1) await new Promise((r) => void setTimeout(r, 0));
    (emit as unknown as (c: string) => void)("still working\r\n");
    for (let i = 0; i < 40; i += 1) await new Promise((r) => void setTimeout(r, 0));

    h.pipeline.cancel();
    await settled(h.pipeline);
    for (let i = 0; i < 40 && h.recorded.length === 0; i += 1) await new Promise((r) => void setTimeout(r, 0));

    const doc = h.transcript.entries[0]?.doc;
    const first = doc?.blocks[0] as { kind?: string; tone?: string; glyph?: string; text?: string } | undefined;
    const kinds = (doc?.blocks ?? []).map((b) => b.kind);
    expect(
      [
        `status ${String(doc?.status)} · error ${JSON.stringify(doc?.error ?? null)}`,
        `first ${String(first?.kind)} ${String(first?.tone)} ${String(first?.glyph)} · ${String(first?.text)}`,
        `kinds ${kinds.join(" ")}`,
        `code ${String(doc?.meta.exitCode)} · recorded ${h.recorded.map((r) => r.exitCode).join(" ")}`,
      ],
    ).toEqual([
      "status partial · error null",
      "first notice muted cancelled · Cancelled.",
      "kinds notice scroll",
      "code 130 · recorded 130",
    ]);
    // **The screen survives it** (C23 I66): the kept block still holds the line.
    expect(JSON.stringify(doc?.blocks[1]), "the line written before the press").toContain("still working");
  });
  it("T4.95 (C23 I96, C23 I5, ruling 92): a cleared queue's entries settle partial, muted, with the cancelled mark", async () => {
    // Two behind a held one, because the defect a single queued item cannot
    // show is one entry cleared and the next left saying it waits.
    const h = pipelineHarness({ invoke: () => new Promise<never>(() => undefined) });
    h.pipeline.submit("/ps");
    await new Promise((r) => void setTimeout(r, 0));
    h.pipeline.submit("/ps --all");
    h.pipeline.submit("/ps -q");
    // Not `settled(h.pipeline)`: it waits for the guard, and the held `/ps` never
    // releases it until the cancel below.
    await settled();

    h.pipeline.cancel();
    await settled(h.pipeline);
    await settled(h.pipeline);

    const cleared = h.transcript.entries
      .filter((e) => e.doc.command !== "/ps")
      .map((e) => {
        const n = e.doc.blocks[0] as { tone?: string; glyph?: string; text?: string } | undefined;
        return `${e.doc.command}: ${String(n?.tone)} ${String(n?.glyph)} ${e.doc.status} · ${String(n?.text)} · ${String(e.doc.blocks.length)}`;
      });
    expect(cleared).toEqual([
      "/ps --all: muted cancelled partial · cancelled before it ran · 1",
      "/ps -q: muted cancelled partial · cancelled before it ran · 1",
    ]);
    expect(
      h.transcript.entries.some((e) => /queued behind/.test(JSON.stringify(e.doc))),
      "and nothing is left saying it is still waiting",
    ).toBe(false);
  });
  it("T4.96 (C23 I97, C23 I29, F1480): a handoff's code reaches meta and C20, 128+n for a signal and -1 for neither", async () => {
    // **Both records are read**, because the defect was the record disagreeing
    // with the notice above it: `vim` exiting 1 said failed and was kept as 0.
    // 128+n is C07 I14's arithmetic, not C21's — C21's `Exit` carries the
    // signal's name beside a null code.
    const endings: readonly (readonly [string, { code: number | null; signal: string | null }])[] = [
      ["exit 0", { code: 0, signal: null }],
      ["exit 1", { code: 1, signal: null }],
      ["exit 2", { code: 2, signal: null }],
      ["exit 130", { code: 130, signal: null }],
      ["neither", { code: null, signal: null }],
      ["SIGINT", { code: null, signal: "SIGINT" }],
      ["SIGTERM", { code: null, signal: "SIGTERM" }],
      ["SIGKILL", { code: null, signal: "SIGKILL" }],
    ];
    const seen: string[] = [];
    for (const [name, exit] of endings) {
      const h = pipelineHarness({ handoff: () => Promise.resolve(exit) });
      h.pipeline.submit("/tty vim");
      await settled(h.pipeline);
      const doc = h.transcript.entries.at(-1)?.doc;
      seen.push(`${name}: meta ${String(doc?.meta.exitCode)} · recorded ${h.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", ")}`);
    }
    expect(seen).toEqual([
      "exit 0: meta 0 · recorded /tty vim 0",
      "exit 1: meta 1 · recorded /tty vim 1",
      "exit 2: meta 2 · recorded /tty vim 2",
      "exit 130: meta 130 · recorded /tty vim 130",
      "neither: meta -1 · recorded /tty vim -1",
      "SIGINT: meta 130 · recorded /tty vim 130",
      "SIGTERM: meta 143 · recorded /tty vim 143",
      "SIGKILL: meta 137 · recorded /tty vim 137",
    ]);
  });
  it("T4.100 (C23 I100, C21 I19, ruling 98, F1491): the shell route's code is C07 I14's — 137 for SIGKILL on both arms, -1 and `did not start` for a spawn failure", async () => {
    // **The box, the code and the record, as one table**: the defect was the
    // record disagreeing with the ending — 1 for a signal and for a child that
    // never started, and 0 for a signal on the PTY arm.
    const read = (h: ReturnType<typeof pipelineHarness>): string => {
      const doc = h.transcript.entries.at(-1)?.doc;
      const box = doc?.blocks[0] as { kind?: string; message?: string } | undefined;
      return `${String(box?.message)} · meta ${String(doc?.meta.exitCode)} · recorded ${h.recorded.map((r) => String(r.exitCode)).join(" ")}`;
    };
    const piped = (exit: { code: number | null; signal: string | null }) =>
      pipelineHarness({
        spawnShell: () =>
          ({
            stdout: (async function* () {})(),
            stderr: (async function* () {})(),
            exited: Promise.resolve(exit),
            overflowed: false,
            signal: () => false,
          }) as never,
      });
    const seen: string[] = [];
    for (const [name, exit] of [
      ["exit 3", { code: 3, signal: null }],
      ["SIGKILL", { code: null, signal: "SIGKILL" }],
      ["never started", { code: null, signal: null }],
    ] as const) {
      const h = piped(exit);
      h.pipeline.submit("!x");
      for (let i = 0; i < 40 && h.recorded.length === 0; i += 1) await new Promise((r) => void setTimeout(r, 0));
      seen.push(`pipe ${name}: ${read(h)}`);
    }

    // **The PTY arm through C21's own normalisation**, not a fake `Exit`: the
    // port answers as `node-pty` 1.1.0 does for `kill -9 $$` (C21 I19), and the
    // runner is the real one. A fake handing `{code: null, signal}` would
    // assert the fix to C21 from inside C23 and see nothing of it.
    const runner = createProcessRunner({
      env: {},
      stdin: {},
      pty: {
        spawn: () => ({
          pid: 1,
          onData: () => undefined,
          onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
            setTimeout(() => cb({ exitCode: 0, signal: 9 }), 0);
          },
          write: () => undefined,
          resize: () => undefined,
          kill: () => undefined,
        }),
      } as never,
    });
    const pty = pipelineHarness({
      hasPty: true,
      spawnPty: (command, size) => runner.spawnPty(command, { cwd: () => "/w", ...size }) as never,
    });
    pty.pipeline.submit("!x");
    for (let i = 0; i < 80 && pty.recorded.length === 0; i += 1) await new Promise((r) => void setTimeout(r, 0));
    seen.push(`pty SIGKILL: ${read(pty)}`);

    expect(seen).toEqual([
      "pipe exit 3: The command exited with code 3. · meta 3 · recorded 3",
      "pipe SIGKILL: Killed by SIGKILL. · meta 137 · recorded 137",
      "pipe never started: The command did not start. · meta -1 · recorded -1",
      "pty SIGKILL: Killed by SIGKILL. · meta 137 · recorded 137",
    ]);
  });
  it("T4.101 (C23 I29, C23 I5, F1492): a line a ⌃c cleared from the queue is recorded in C20 at settlement, as -1", async () => {
    // **The record and the documents together**, because C23 I29 records *the code
    // the entry settled with*: a row reading C20 alone passes a build that
    // records -1 beside documents saying 0. Two queued, as T4.95 has, so the
    // order is visible and one cleared line cannot stand for both.
    const h = pipelineHarness({ invoke: () => new Promise<never>(() => undefined) });
    h.pipeline.submit("/ps");
    await new Promise((r) => void setTimeout(r, 0));
    h.pipeline.submit("/ps --quiet");
    h.pipeline.submit("/ps");
    await settled();

    h.pipeline.cancel();
    await settled(h.pipeline);

    expect([
      h.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", "),
      h.transcript.entries.map((e) => `${e.doc.command} ${e.doc.status} ${String(e.doc.meta.exitCode)}`).join(", "),
    ]).toEqual([
      "/ps 130, /ps --quiet -1, /ps -1",
      "/ps partial 130, /ps --quiet partial -1, /ps partial -1",
    ]);
  });
  it("T4.7 (with C22): session exit signals every child before the terminal is released", async () => {
    // A02 Seam 4's `Shutdown` row, and the whole claim is the **order**: a
    // child still running when the alternate screen is released writes onto the
    // restored primary one, over whatever the user is looking at.
    //
    // `killAll` is not called from `stop` — it runs inside `beforeRelease`
    // (C22 §8 step a), which C01 invokes once before the *first* release. That
    // parenthesis in Seam 4's row is the step, and reading the row without
    // reading `shutdown.ts` reads as a missing one.
    const { graph, stdout } = await buildGraph();
    graph.lifecycle.acquire();

    // A real child, through the graph's own runner. `beforeRelease` looks
    // `killAll` up on the runner at call time, so recording over it is seen —
    // and the child is real, so `live` emptying is a fact about processes
    // rather than about a counter.
    const child = graph.runner.spawnShell("sleep 30", { cwd: () => process.cwd() });
    expect(graph.runner.live, "a child is running").toHaveLength(1);

    let killedAt = -1;
    const killAll = graph.runner.killAll.bind(graph.runner);
    Object.defineProperty(graph.runner, "killAll", {
      configurable: true,
      value: () => {
        killedAt = stdout.output.length;
        return killAll();
      },
    });

    expect(stdout.output.indexOf(MODES.altScreenOff), "the screen is still held").toBe(-1);
    graph.lifecycle.release();

    expect(killedAt, "killAll ran at all").toBeGreaterThanOrEqual(0);
    expect(
      killedAt,
      "signalled before the first release byte — a child outliving the alternate " +
        "screen writes over whatever the user is looking at",
    ).toBeLessThanOrEqual(stdout.output.indexOf(MODES.altScreenOff));

    await child.exited;
    expect(graph.runner.live, "and nothing survives it").toHaveLength(0);
  });
});

describe("C21 against the fake it replaced", () => {
  it("the interface `fakeRunner` was written to is the one the runner implements", async () => {
    // `fakeRunner` has stood in for C21 since C06, and C08's recording composes
    // over the same transport — so a drift between fake and real would have been
    // invisible until now. This asserts the shape at the seam rather than
    // trusting that C06's suite passing means anything about C21.
    const real = createProcessRunner({ env: process.env, stdin: {} });
    const child = real.spawn(scripts.emit("x"), { cwd: () => process.cwd() });

    expect(Object.keys(child).sort()).toEqual(
      ["exited", "overflowed", "pid", "running", "signal", "stderr", "stdout"].sort(),
    );
    expect(typeof child.signal).toBe("function");
    expect(child.exited).toBeInstanceOf(Promise);

    await collect(child.stdout);
    await child.exited;

    // And the one asymmetry, stated: the fake throws on `spawnShell` because C06
    // uses `spawn` and only `spawn`. The real runner implements both, so the
    // fake is narrower than the interface *on purpose* — which is a fact about
    // C06's usage, not a drift.
    expect(typeof real.spawnShell).toBe("function");
  });
});
