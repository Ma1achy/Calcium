// C21 tiers 1-5 — the real-process harness.
//
// Nothing here is a fake. C21's value is entirely in its interaction with the
// OS, and a test that mocks the process has moved to tier 3 without saying so.
// What this file provides is the *observation* side: a way to see a process
// group, a descriptor count, and a set of small programs whose behaviour is the
// thing under test.
//
// **`groupMembers` is where this harness could have been vacuous.** `ps` exits 1
// for "no process in that group" and also for a bad invocation, so a helper that
// read the exit status as "empty" would return `[]` whether the group was gone
// or `ps` was missing from the image — and T3.1, whose whole assertion is that
// the group is empty, would pass having proved nothing. The two cases are
// distinguished below, and `test/unit/support-harness.test.ts` runs the positive
// control: a group known to be non-empty, seen.
//
// The rule from `test/support/README.md` applies to everything here: a default
// differs from the value a test asks for, and a parameter with no observable
// effect is a finding.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

/** A finished command: what it wrote and how it ended. */
export type Ran = Readonly<{ stdout: string; stderr: string; code: number | null }>;

/** Run a command to completion, capturing both streams. Used to observe, never to assert through. */
export function run(argv: readonly string[]): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const [command, ...rest] = argv;
    const child = spawn(command!, rest, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

export class HarnessError extends Error {
  override readonly name = "HarnessError";
}

/**
 * The **live** pids in a process group, as the OS reports them.
 *
 * `ps -o pid= -g <pgid>` exits 0 with the members, or 1 with nothing when the
 * group holds no processes. **Any other shape is a broken harness, not an empty
 * group**, and it throws saying so — because the failure it would otherwise
 * cause is an empty array that reads as proof.
 *
 * **Zombies are excluded, and that is a portability fix rather than a
 * loosening.** `sh -c "sleep 30 | cat"` signalled as a group dies whole — both
 * children take the signal — but the shell exits before reaping them, so they
 * are reparented to PID 1. On macOS that is `launchd` and they vanish at once;
 * in a container started without an init, PID 1 is the workload and reaps
 * nothing, so the two stay in the process table as `Z` for as long as the test
 * runs. `waitForGroupEmpty` then polls to its bound and reports *the leader was
 * signalled and the group was not*, which is the opposite of what happened.
 *
 * **It does not weaken the assertion.** A group signal that genuinely failed
 * leaves its children `S`, not `Z`, and they are still counted — so the row can
 * still only pass by the signal arriving. What changes is that the harness stops
 * conflating *in the process table* with *alive*, which is a distinction macOS
 * never forced it to make.
 */
export async function groupMembers(pgid: number): Promise<readonly number[]> {
  const ran = await run(["ps", "-o", "pid=,stat=", "-g", String(pgid)]);

  if (ran.code === 0) {
    return ran.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => line.split(/\s+/u))
      // `Z` is zombie on both BSD and procps, and it is the first character of
      // the state field on both.
      .filter((parts) => !(parts[1] ?? "").startsWith("Z"))
      .map((parts) => Number(parts[0]));
  }

  // The one non-zero status that means what it appears to: nothing matched.
  if (ran.code === 1 && ran.stdout.trim() === "" && ran.stderr.trim() === "") return [];

  throw new HarnessError(
    `ps exited ${String(ran.code)} for group ${pgid} — this is a harness failure, ` +
      `not an empty group. An empty array here would make a group-signalling test ` +
      `pass while proving nothing. stderr: ${JSON.stringify(ran.stderr.trim())}`,
  );
}

/**
 * Wait until a process group is empty, or give up naming the survivors.
 *
 * Bounded by elapsed time — see `until` below for why a count is not a bound.
 * Polled through `setImmediate` so it keeps working inside a test that has opted
 * into `vi.useFakeTimers()`.
 *
 * A timeout is a real failure and names what survived. "Group not empty" without
 * the pids sends the reader to `ps` by hand.
 */
export async function waitForGroupEmpty(pgid: number, withinMs = 10_000): Promise<void> {
  const started = Date.now();
  let last: readonly number[] = [];

  do {
    last = await groupMembers(pgid);
    if (last.length === 0) return;
    await new Promise<void>((resolve) => void setImmediate(resolve));
  } while (Date.now() - started < withinMs);

  throw new HarnessError(
    `group ${pgid} still holds ${last.join(", ")} after ${withinMs}ms — ` +
      `the leader was signalled and the group was not`,
  );
}

/**
 * Wait until a file contains `text`, or give up saying what it held instead.
 *
 * The companion to `scripts.ignoring`'s `logPath`. Polled through `setImmediate`
 * for the same reason as `waitForGroupEmpty` — no timer — and bounded by
 * attempts rather than by wall time, with the file's actual content in the
 * failure so a missing marker is not reported as a bare timeout.
 */
export async function waitForFileToContain(
  path: string,
  text: string,
  withinMs = 10_000,
): Promise<void> {
  let seen = "";

  await until(withinMs, `${path} never contained ${JSON.stringify(text)}`, () => {
    try {
      seen = readFileSync(path, "utf8");
    } catch {
      seen = "<not created>";
    }
    return seen.includes(text);
  });
}

/**
 * Poll `ready` until it holds, bounded by *elapsed time* rather than by a count.
 *
 * **A count is not a bound.** `waitForFileToContain` was written with 2000
 * attempts and gave up in about two milliseconds, long before a spawned process
 * could exist — the loop body is a `readFileSync`, and `setImmediate` costs
 * nothing. It read as "two thousand chances" and was "two milliseconds".
 * `waitForGroupEmpty` had the same bound and only looked reasonable because it
 * spawns a real `ps` each round, which throttled it by accident.
 *
 * `setImmediate` rather than a timer so this keeps working inside a test that
 * has opted into `vi.useFakeTimers()`; `Date.now` because measuring elapsed time
 * is what a bound means, and SS1's ban on ambient clocks scopes to `src/`.
 */
async function until(withinMs: number, what: string, ready: () => boolean): Promise<void> {
  const started = Date.now();

  do {
    if (ready()) return;
    await new Promise<void>((resolve) => void setImmediate(resolve));
  } while (Date.now() - started < withinMs);

  throw new HarnessError(`${what} within ${withinMs}ms`);
}

/**
 * Open descriptors held by this process.
 *
 * Linux only, and deliberately unguarded: the devcontainer is Linux, and a
 * fallback returning 0 would turn T3.14's leak check into an assertion that
 * `0 <= 0`. If this throws, the check is broken and should say so.
 */
export function openDescriptorCount(): number {
  try {
    return readdirSync("/proc/self/fd").length;
  } catch (error) {
    throw new HarnessError(
      `/proc/self/fd is unreadable, so a descriptor leak cannot be observed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The programs the tests run.
 *
 * Each is a `node -e` argv rather than a shell string, so the same script can be
 * given to `spawn` and to `spawnShell` and the difference under test is the
 * runner's, not the program's. Every parameter changes what the program does —
 * there is nothing here a caller can pass that the child would ignore.
 */
export const scripts = {
  /** Write `text` to stdout and exit 0. Default differs from anything a test asks for. */
  emit(text = "harness-default"): readonly string[] {
    return ["node", "-e", `process.stdout.write(${JSON.stringify(text)})`];
  },

  /** Write to both streams, distinguishably (T1.5). */
  emitBoth(out = "out-default", err = "err-default"): readonly string[] {
    return [
      "node",
      "-e",
      `process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)})`,
    ];
  },

  /**
   * `chunk` repeated until at least `bytes` have been written (T3.3, T3.4).
   *
   * **No `process.exit` at the end, and that is not tidiness.** `process.exit`
   * discards writes still queued on a pipe, so under load this program delivered
   * 828 of the 4096 bytes it was asked for and the shortfall looked like a
   * failure in whatever was reading. It returns instead, and node exits when
   * stdout has drained — which is the only way a writer can promise what it
   * wrote arrived.
   */
  emitBytes(bytes = 1024, chunk = "x".repeat(64)): readonly string[] {
    return [
      "node",
      "-e",
      `const c=${JSON.stringify(chunk)};let n=0;` +
        `const pump=()=>{while(n<${bytes}){n+=Buffer.byteLength(c);` +
        `if(!process.stdout.write(c)){process.stdout.once("drain",pump);return}}};pump()`,
    ];
  },

  /**
   * `unit` repeated `times`, built **inside** the child (T2.1, T3.17).
   *
   * Not `emit(unit.repeat(times))`: Linux caps a single argument at 128 KiB
   * (`MAX_ARG_STRLEN`, which is not `ARG_MAX` and is much smaller), so passing a
   * large payload as an argv entry fails the spawn with `E2BIG` — and the empty
   * output that follows reads like a decoder that dropped everything.
   */
  emitRepeated(unit = "harness", times = 2): readonly string[] {
    return [
      "node",
      "-e",
      `process.stdout.write(${JSON.stringify(unit)}.repeat(${times}))`,
    ];
  },

  /** Exit with `code` (T1.3). */
  exit(code = 3): readonly string[] {
    return ["node", "-e", `process.exit(${code})`];
  },

  /**
   * Ignore the named signals and stay alive; anything else ends it (T3.2).
   *
   * Each ignored signal is **announced on stdout**, and that line is the only
   * honest evidence of survival. `child.killed` says a signal was sent, not that
   * it was survived, so a test asserting on it passes whether the child ignored
   * the signal or died of it — the assertion and its negation look identical.
   * A line arriving after delivery cannot be produced by a dead process.
   */
  ignoring(signals: readonly string[] = ["SIGHUP"], logPath?: string): readonly string[] {
    // `logPath` is a second channel, and it exists because stdout is not always
    // observable: a transport that collects the stream internally hands it over
    // only after the child has exited, which is too late to drive a ladder one
    // rung at a time. A file can be watched from outside whatever is reading the
    // process.
    const log =
      logPath === undefined
        ? ""
        : `require("fs").appendFileSync(${JSON.stringify(logPath)},"caught:"+s+"\\n");`;

    // Readiness goes to the same channel, and it is not decoration. A signal
    // that arrives before node has installed its handler takes the *default*
    // action, so a test that signals too early kills the child it meant to
    // watch survive — and the result, an immediate exit on SIGINT, looks exactly
    // like a component that never installed the handler at all.
    const ready =
      logPath === undefined
        ? ""
        : `require("fs").appendFileSync(${JSON.stringify(logPath)},"ready\\n");`;

    return [
      "node",
      "-e",
      `${JSON.stringify(signals)}.forEach(s=>process.on(s,()=>{` +
        `${log}process.stdout.write("caught:"+s+"\\n")}));` +
        `${ready}process.stdout.write("ready\\n");setInterval(()=>{},1000)`,
    ];
  },

  /** Close stdout, stay alive, then exit after stdin closes (T3.5). */
  closeStdoutStayAlive(): readonly string[] {
    return [
      "node",
      "-e",
      // **One way to die inside the window under test, and a backstop far
      // outside it.** This exited 0 on stdin ending, which gave the child two
      // deaths racing: T3.5 signals `SIGKILL` and asserts the exit carries it,
      // and under load stdin reached EOF first, so the child exited cleanly and
      // the row failed as `{code: 0}` against `{signal: "SIGKILL"}` — a fixture
      // race wearing the shape of a runner defect. Once in three full runs.
      //
      // The 30 s backstop exists so a test that fails before signalling cannot
      // leave the interval holding the child open forever, and it exits 3 so
      // that a backstop firing is legible rather than looking like the clean
      // exit this used to race with.
      `process.stdout.end();setInterval(()=>{},1000);` +
        `setTimeout(()=>process.exit(3),30000);process.stdin.resume()`,
    ];
  },

  /** Print the working directory the child actually started in (T1.7, T3.13). */
  pwd(): readonly string[] {
    return ["node", "-e", `process.stdout.write(process.cwd())`];
  },

  /** Print one environment variable's value (T1.10). */
  readEnv(name = "HARNESS_DEFAULT"): readonly string[] {
    return ["node", "-e", `process.stdout.write(String(process.env[${JSON.stringify(name)}]))`];
  },

  /**
   * Spawn a grandchild in the same process group, announce its pid, stay alive
   * (T3.16).
   *
   * The grandchild is what group signalling has to reach: it is not the handle's
   * pid, nothing above knows it exists, and signalling the leader alone leaves it
   * running. `stdio: "ignore"` so it holds no pipe — the claim under test is
   * about signals, and a grandchild holding stdout open would confuse it with a
   * claim about streams.
   */
  grandchild(): readonly string[] {
    return [
      "node",
      "-e",
      `const{spawn}=require("child_process");` +
        `const g=spawn("node",["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});` +
        `process.stdout.write(String(g.pid)+"\\n");setInterval(()=>{},1000)`,
    ];
  },

  /** Emit `count` NDJSON lines, each carrying `text` (T4.3, T5.4). */
  ndjson(count = 3, text = "ascii-default"): readonly string[] {
    return [
      "node",
      "-e",
      `for(let i=0;i<${count};i++)` +
        `process.stdout.write(JSON.stringify({i,text:${JSON.stringify(text)}})+"\\n")`,
    ];
  },

  /** Write raw bytes from a hex string — null bytes and split multi-byte runes (T3.17). */
  emitHex(hex = "68690a"): readonly string[] {
    return ["node", "-e", `process.stdout.write(Buffer.from(${JSON.stringify(hex)},"hex"))`];
  },
} as const;

/**
 * The same program, as a file rather than as `node -e`.
 *
 * Needed by anything spawned *through C06*, which appends `--json` to every
 * invocation (C06 §3, D16). `node -e script --json` fails with `node: bad
 * option: --json`, because with `-e` there is no script path to end node's own
 * option parsing and the flag is read as node's. Given a path, node stops
 * parsing and hands the rest to the program.
 *
 * One source of truth: this takes a `scripts.*` argv and moves its body to disk
 * rather than restating any program.
 */
export function asScriptFile(argv: readonly string[]): readonly string[] {
  const source = argv[2];
  if (argv[0] !== "node" || argv[1] !== "-e" || source === undefined) {
    throw new HarnessError(`asScriptFile expects a \`node -e\` argv, got ${JSON.stringify(argv)}`);
  }

  const path = `${mkdtempSync(`${tmpdir()}/c21-script-`)}/program.js`;
  writeFileSync(path, source);
  return ["node", path];
}

/** Collect an `AsyncIterable<string>` into one string. */
export async function collect(source: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of source) text += chunk;
  return text;
}
