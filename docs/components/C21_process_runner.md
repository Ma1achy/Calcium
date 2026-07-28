# C21 — Process runner

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L0 data |
| **Depends on** | Nothing. Node's `child_process`, wrapped |
| **Consumed by** | C06 transport · L4 (shell delegation, handoff) |
| **Source** | A01 D18, D19 · A02 §1, §2 · C18 §5 |
| **Status** | Draft |

---

## 1. Purpose

C21 is the boundary between the application and everything it runs. It spawns, streams, signals and reaps — and it does exactly that, with no knowledge of view models, verbs or terminals.

Its position in the layering is worth restating because it constrains the design: **C21 is L0 data and cannot import C01.** The two halves of L0 do not know about each other (A02 §1). So C21 spawns a child with inherited stdio when asked, but it does not release the terminal first — L4 orchestrates `lifecycle.suspend()` → `runner.handoff()` → `lifecycle.resume()`.

---

## 2. Two spawn modes, deliberately separate

```typescript
interface ProcessRunner {
  spawn(argv: readonly string[], opts: SpawnOptions): ChildHandle;
  spawnShell(command: string, opts: SpawnOptions): ChildHandle;
  handoff(argv: readonly string[], opts: SpawnOptions): Promise<Exit>;
  readonly live: readonly ChildHandle[];
  killAll(): Promise<void>;
}

type SpawnOptions = Readonly<{
  cwd:  () => string;                 // read at spawn — pass-through `cd` moves it
  env?: Readonly<NodeJS.ProcessEnv>;
  maxBufferBytes?: number;            // default 8 MiB per stream
}>;

type Exit = Readonly<{ code: number | null; signal: string | null }>;

interface ChildHandle {
  readonly pid:     number | null;
  readonly stdout:  AsyncIterable<string>;
  readonly stderr:  AsyncIterable<string>;
  readonly exited:  Promise<Exit>;
  readonly running: boolean;
  signal(sig: string): boolean;
}
```

`spawn` and `spawnShell` are **separate methods, not a flag**, because the distinction is the security-relevant one (D18) and a boolean makes it invisible at the call site. `spawn` takes an argv array and no shell is involved. `spawnShell` takes a string the *user typed* and hands it to their shell (C18 §5) — the TUI never assembles that string from data it composed.

The shell is `$SHELL` when set and executable, otherwise `/bin/sh`.

---

## 3. Process groups

A child spawned `detached` leads its own process group, and signals are sent to the group (`kill(-pid)`), not the leader alone.

This is not an optimisation. `sh -c "prism ps --json | jq ."` is a shell that spawns two children; signalling only the shell leaves `jq` running and holding the pipe. The user presses `Ctrl-C`, the command appears not to stop, and the orphan survives the session. Group signalling is the difference between cancellation working and appearing to.

`killAll()` sends **`SIGKILL` directly** to every live group. It is deliberately not an escalation: by the time the session is exiting, C06 has already had its chance to cancel politely, and a grace period at shutdown is a policy — which I8 places in C06, not here. Nothing outlives the process, and C21 stays free of timing decisions.

---

## 4. Streams

stdout and stderr are **piped separately and never merged** (B3, and the single-owner stdout rule). A child's output must never reach the real terminal, or it corrupts the frame.

Both are exposed as `AsyncIterable<string>` over a **streaming UTF-8 decoder**. A multi-byte character split across two chunk boundaries is one character, not two replacement marks. C06 parses NDJSON line by line and would otherwise see mojibake at exactly the buffer boundaries — a bug that appears only with non-ASCII content and only at certain output sizes.

Each stream is bounded at 8 MiB by default. Beyond that, C21 stops buffering, marks the handle overflowed, and continues draining so the child is not blocked on a full pipe — a child stuck on write is worse than truncated output, because it never exits and never reports.

---

## 5. Handoff

For children that need the terminal — `vim`, `less`, `kubectl exec` — stdio is inherited and C21 awaits exit.

**C21 cannot verify the terminal was released**, since it cannot import C01. But it can check cheaply and does: if `stdin.isRaw` is still true at `handoff()`, the caller skipped `lifecycle.suspend()`, and C21 throws rather than handing a raw-mode terminal to a child that expects a cooked one. The symptom otherwise is a child with no working line editing and no obvious cause.

Handoff does not detach — the child shares the process group so `Ctrl-C` reaches it through the terminal, as it would from a normal shell.

---

## 6. Signals

`signal(sig)` delivers to the child's group and returns whether delivery succeeded. **C21 owns delivery; C06 owns the escalation policy** — the `SIGINT → SIGTERM → SIGKILL` ladder and its timings are C06 §4, so the timing policy lives with the component that knows what a verb is.

Signalling an already-exited child returns false rather than throwing. The race is normal: a child may exit between the decision to cancel and the delivery.

---

## 7. State machine

Per child handle.

| From ↓ / event → | `signal` | child writes | child exits |
|---|---|---|---|
| **running** | delivered to group (T1.8) | streamed (T1.5) | → exited, `exited` resolves (T1.3) |
| **exited** | false, no throw (T3.6) | ignored (T3.7) | — |

`spawning` is not observable: `spawn` returns a handle whose `pid` is null only if the spawn itself failed, and that failure resolves `exited` immediately with a code of null.

---

## 8. Invariants

- **I1** — `spawn` never involves a shell; `spawnShell` never receives a string the application assembled.
- **I2** — Children are spawned detached and signalled by process group.
- **I3** — stdout and stderr are separate and never reach the real terminal.
- **I4** — Decoding is streaming and multi-byte-safe across chunk boundaries.
- **I5** — Buffering is bounded; overflow drains rather than blocking the child.
- **I6** — `handoff` refuses when the terminal is still in raw mode.
- **I7** — `handoff` inherits stdio and does not detach.
- **I8** — C21 delivers signals; it defines no escalation policy.
- **I9** — Signalling an exited child returns false and never throws.
- **I10** — `cwd` is read at spawn time, never captured at construction.
- **I11** — `killAll` sends `SIGKILL` to every live group, with no grace period and no timer.
- **I12** — C21 imports nothing from `terminal/` and writes nothing to the real stdout.
- **I13** — `exited` always resolves, including on spawn failure.

---

## 9. Commitments

1. `spawn` and `spawnShell` are separate methods so the shell boundary is visible at every call site.
2. `spawnShell` is only ever given a string the user typed.
3. The shell is `$SHELL`, falling back to `/bin/sh`.
4. Children are detached and signalled by group, so pipelines die whole.
5. stdout and stderr stay separate and never reach the terminal.
6. Decoding is streaming and multi-byte-safe.
7. Buffers are bounded at 8 MiB per stream; overflow drains rather than blocking.
8. `handoff` inherits stdio, does not detach, and refuses if raw mode is still set.
9. C21 delivers signals; C06 owns the ladder.
10. Signalling an exited child is false, not a throw.
11. `cwd` is a function, read at spawn.
12. `killAll` sends `SIGKILL` with no grace period, so C21 holds no timing policy anywhere.
13. `exited` always resolves, spawn failure included.

---

## 10. Tests

Six tiers. Every cell of the §7 table is covered. Tiers 1–3 use real short-lived processes; nothing is mocked, because the value of this component is entirely in its interaction with the OS.

### Tier 1 — unit

- **T1.1**: `spawn(["echo","hi"])` → stdout yields `hi`, exit code 0.
- **T1.2** (I1): argv containing `;`, `|`, `$(…)` and backticks → passed literally; no expansion, no injection.
- **T1.3**: `exited` resolves with the child's code.
- **T1.4**: a child exiting on a signal → `code` null, `signal` set.
- **T1.5** (I3): a child writing to both streams → they arrive separately and neither contains the other.
- **T1.6**: `spawnShell("echo a | tr a b")` → yields `b`, proving the shell handled the pipe.
- **T1.7** (I10): `cwd` returning a different directory between two spawns → each runs in its own.
- **T1.8** (I2): `signal("SIGTERM")` → delivered; the child exits.
- **T1.9** (I13): spawning a non-existent binary → `exited` resolves, `pid` null, no unhandled rejection.
- **T1.10**: `env` overrides are visible to the child; the rest of the environment is inherited.

### Tier 2 — contract / interface

- **T2.1** (I4): a 2 MiB stream of mixed CJK, emoji and ASCII → decoded byte-identically, at every chunk size from 1 to 65536.
- **T2.2** (I3): a source scan finds no write to the real `process.stdout` in `process/`.
- **T2.3** (I12): the module graph shows no import from `terminal/`.
- **T2.4** (I8): a source scan finds no timer or escalation logic in `process/`.
- **T2.5** (I1): `spawn` has no parameter that could carry a shell string; `spawnShell` has no argv form. A compile-level test.
- **T2.6** (I13): across a hundred spawns including failures, `exited` resolves every time.

### Tier 3 — edge cases

- **T3.1** (I2, the important one): `spawnShell("sleep 30 | cat")` then `SIGTERM` → **both** processes die; nothing is left orphaned. Verified by checking the group after exit.
- **T3.2**: a child ignoring `SIGTERM` → still running; `SIGKILL` ends it. C21 delivers both; the sequencing is the caller's.
- **T3.3** (I5): a child emitting 100 MiB → the handle marks overflow, the child still exits, and memory stays bounded.
- **T3.4** (I5): a child writing continuously with no consumer → drained; the child is never blocked on a full pipe.
- **T3.5**: a child closing stdout but staying alive → the stream ends, `exited` does not resolve until it does.
- **T3.6** (I9): signalling after exit → false, no throw.
- **T3.7**: writes arriving after exit → ignored.
- **T3.8** (I6): `handoff` with raw mode still set → throws, naming the missing suspend.
- **T3.9** (I7): `handoff` with a child that reads stdin → receives real terminal input.
- **T3.10**: a child exiting immediately during `handoff` → resolves cleanly.
- **T3.11**: `$SHELL` unset → `/bin/sh` is used.
- **T3.12**: `$SHELL` set to a non-existent path → falls back to `/bin/sh` with a warning rather than failing every system command.
- **T3.13**: `cwd` returning a deleted directory → spawn fails with a clear error; the session survives.
- **T3.14**: 200 concurrent spawns → all tracked in `live`, all reaped, no descriptor leak.
- **T3.15** (I11): `killAll` with five live children including a pipeline → every group receives `SIGKILL`, `live` empties, and no timer is scheduled.
- **T3.16**: a child spawning its own grandchild that outlives it → group signalling reaches the grandchild.
- **T3.17**: output containing a null byte → passed through the decoder without truncating the stream.

### Tier 4 — integration

- **T4.1** (with C06): `RawResult` fields are populated from a real spawn — exit code, signal, stdout, stderr, duration.
- **T4.2** (with C06): the escalation ladder issues three signals through C21 against a child ignoring the first two.
- **T4.3** (with C06): an NDJSON stream with multi-byte content split across chunks parses cleanly — the decoder's payoff, tested at the consumer.
- **T4.4** (with C18, L4): a `shell` `ParseResult` routes to `spawnShell`; an `app` result routes to `spawn`.
- **T4.5** (with C01, L4): the documented `suspend` → `handoff` → `resume` sequence runs in order; T3.8's guard never fires on the correct path.
- **T4.6** (with C18): a `cd` built-in changes what `cwd()` returns, and the next spawn lands there.
- **T4.7** (with L4): session exit calls `killAll` before the terminal is released.

### Tier 5 — e2e

- **T5.1**: `ls *.md` through `spawnShell` → globbing works; output renders as raw.
- **T5.2**: `vi` through `handoff` → editable, and quitting returns to a repainted frame.
- **T5.3**: `Ctrl-C` during `sleep 30 | cat` → both die within the ladder's bounds, the prompt returns, nothing orphaned.
- **T5.4**: a real streaming verb at 1,000 lines/s for sixty seconds → no memory growth, no dropped output, clean exit.
- **T5.5**: quitting the session with three children running → all reaped, terminal restored.

### Tier 6 — fail-on-revert

- **T6.1** (I2): spawning without `detached`, or signalling the leader alone → T3.1 fails and pipelines orphan.
- **T6.2** (I1): merging the two spawn methods behind a flag → T2.5 fails, and the shell boundary stops being visible.
- **T6.3** (I4): decoding per chunk rather than streaming → T2.1 and T4.3 fail with mojibake at boundaries.
- **T6.4** (I3): inheriting stdout for a normal spawn → T2.2 fails and child output corrupts the frame.
- **T6.5** (I5): buffering without a bound → T3.3 exhausts memory; pausing instead of draining → T3.4 blocks the child.
- **T6.6** (I6): dropping the raw-mode guard → T3.8 fails, and a handed-off child gets a terminal it cannot use.
- **T6.7** (I8, I11): adding an escalation timer to C21 — including a grace period inside `killAll` → T2.4 and T3.15 fail, and the policy exists in two places.
- **T6.8** (I9): throwing on a signal to an exited child → T3.6 fails on a race that happens routinely.
- **T6.9** (I10): capturing `cwd` at construction → T1.7 fails.
- **T6.10** (I11): skipping `killAll` at exit → T5.5 leaves orphans.
- **T6.11** (I13): a spawn-failure path that leaves `exited` pending → T2.6 fails and a verb hangs forever.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| The escalation ladder and its timings | C06 |
| Releasing and restoring the terminal | C01, orchestrated by L4 |
| Deciding shell versus argv | C18 |
| Parsing anything the child emits | C06, C07 |
| Windows non-VT console support | Out of scope — Windows Terminal and WSL only |
| A warm process pool | Parking lot — measure first |
