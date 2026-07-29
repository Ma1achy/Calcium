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
import { readdirSync } from "node:fs";

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
 * The pids in a process group, as the OS reports them.
 *
 * `ps -o pid= -g <pgid>` exits 0 with the members, or 1 with nothing when the
 * group holds no processes. **Any other shape is a broken harness, not an empty
 * group**, and it throws saying so — because the failure it would otherwise
 * cause is an empty array that reads as proof.
 */
export async function groupMembers(pgid: number): Promise<readonly number[]> {
  const ran = await run(["ps", "-o", "pid=", "-g", String(pgid)]);

  if (ran.code === 0) {
    return ran.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map(Number);
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
 * Wait until a group holds none of `expected`, or give up naming the survivors.
 *
 * Polled through `setImmediate` rather than a timer: tiers 1-4 run under
 * vitest's faked `setTimeout` (`vitest.config.ts`), so a sleep here would never
 * wake. Each attempt spawns a real `ps`, which is what bounds the loop in wall
 * time — roughly a millisecond apiece, so the default 400 attempts is a
 * fraction of a second and not a spin.
 *
 * A timeout is a real failure and names what survived. "Group not empty" without
 * the pids sends the reader to `ps` by hand.
 */
export async function waitForGroupEmpty(pgid: number, attempts = 400): Promise<void> {
  let last: readonly number[] = [];

  for (let i = 0; i < attempts; i += 1) {
    last = await groupMembers(pgid);
    if (last.length === 0) return;
    await new Promise<void>((resolve) => void setImmediate(resolve));
  }

  throw new HarnessError(
    `group ${pgid} still holds ${last.join(", ")} after ${attempts} checks — ` +
      `the leader was signalled and the group was not`,
  );
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

  /** `chunk` repeated until at least `bytes` have been written (T3.3, T3.4). */
  emitBytes(bytes = 1024, chunk = "x".repeat(64)): readonly string[] {
    return [
      "node",
      "-e",
      `const c=${JSON.stringify(chunk)};let n=0;` +
        `const pump=()=>{while(n<${bytes}){n+=Buffer.byteLength(c);` +
        `if(!process.stdout.write(c)){process.stdout.once("drain",pump);return}}` +
        `process.exit(0)};pump()`,
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
  ignoring(signals: readonly string[] = ["SIGHUP"]): readonly string[] {
    return [
      "node",
      "-e",
      `${JSON.stringify(signals)}.forEach(s=>process.on(s,()=>` +
        `process.stdout.write("caught:"+s+"\\n")));` +
        `process.stdout.write("ready\\n");setInterval(()=>{},1000)`,
    ];
  },

  /** Close stdout, stay alive, then exit after stdin closes (T3.5). */
  closeStdoutStayAlive(): readonly string[] {
    return [
      "node",
      "-e",
      `process.stdout.end();const t=setInterval(()=>{},1000);` +
        `process.stdin.on("end",()=>{clearInterval(t);process.exit(0)});process.stdin.resume()`,
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

  /** Spawn a detached grandchild that outlives its parent, then exit (T3.16). */
  grandchild(): readonly string[] {
    return [
      "node",
      "-e",
      `const{spawn}=require("child_process");` +
        `const g=spawn("node",["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});` +
        `process.stdout.write(String(g.pid)+"\\n");setTimeout(()=>process.exit(0),50)`,
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

/** Collect an `AsyncIterable<string>` into one string. */
export async function collect(source: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of source) text += chunk;
  return text;
}
