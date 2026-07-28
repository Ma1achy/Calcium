# C01 — Terminal lifecycle

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L0 terminal |
| **Depends on** | Nothing. Receives a `TerminalCapabilities` record by injection — it does **not** import C02 |
| **Consumed by** | C03 frame scheduler · L4 composition root · L4 shell (for suspend/resume around C21) |
| **Source** | A01 D26–D28, D32–D33 · A02 §2, §3, §4 |
| **Status** | Draft |

---

## 1. Purpose

C01 owns every piece of terminal state the application takes from the user's shell, and guarantees it is given back. It is the only module in `tui-kit` permitted to write an escape sequence.

The failure it exists to prevent is not a bad render. It is a dev whose terminal is silently in raw mode with a hidden cursor after the process died — a terminal that appears hung, recoverable only by typing `reset` blind. Every other component can fail and be contained (A02 §7). C01 failing corrupts something outside the process that the process can no longer fix.

The observable contract, and the thing the e2e tier tests: **`prism` followed by any exit leaves the terminal byte-identical to `true` followed by the same exit.**

---

## 2. Public interface

```typescript
interface TerminalLifecycle {
  acquire(): void;
  release(): void;
  suspend(): void;
  resume(): void;
  onResize(cb: (size: TerminalSize) => void): Disposable;
  readonly acquired: boolean;
  readonly suspended: boolean;
}

function createTerminalLifecycle(opts: {
  stdout: NodeJS.WriteStream;
  stdin:  NodeJS.ReadStream;
  capabilities: TerminalCapabilities;
  onFatal: (err: unknown) => never;      // required — see I13
  beforeRelease?: () => void;            // synchronous; runs before every release
}): TerminalLifecycle;
```

`acquired` and `suspended` are getter-only in the implementation. `readonly` is a compile-time annotation and does not prevent runtime assignment.

**C01 does not own contamination.** C03 owns the flag; the L4 shell calls `scheduler.invalidate()` after `lifecycle.resume()`, the same orchestration pattern used for suspend. C01 knows nothing about frames or repaints.

**C01 owns `SIGWINCH`** because it already owns process-level terminal signals. It reads `columns` and `rows` as one snapshot and hands it to subscribers. It does not interpret the snapshot — clamping, anchoring and the too-small threshold belong upstream (D31).

`createTerminalLifecycle` also installs the process-level handlers. Construction has side effects, deliberately: the handlers must exist before `acquire()` is reachable, and a two-call API invites the ordering bug it exists to prevent.

**Capabilities are injected, not imported.** C01 and C02 are the same layer; injection keeps the edge acyclic and lets C01 be unit-tested against a fabricated capability record with no environment probing.

**C21 never calls C01.** L0 data does not import L0 terminal (A02 §1). Suspend-and-handoff is orchestrated by the L4 shell:

```
shell:  lifecycle.suspend() → runner.handoff(argv) → lifecycle.resume()
```

---

## 3. State owned

| State | Type | Mutated by |
|---|---|---|
| `acquired` | boolean | `acquire`, `release` |
| `suspended` | boolean | `suspend`, `resume` |
| `held` | set of the six state keys actually acquired | `acquire`, `release` |
| Handler registrations | disposables | constructor, `release` |
| Resize subscribers | callback set | `onResize`, disposal |
| Saved stdout writer | function | constructor |

`held` is the reason release is correct rather than hopeful: it releases what was taken, in reverse, rather than emitting a fixed sequence and assuming.

Nothing else in the process may write `acquired` or `contaminated`.

---

## 4. Invariants

- **I1** — Escape-sequence **literals** live only in `terminal/escapes.ts`. Enforced by lint: no `\x1b` or `\u001b` literal anywhere else. C01 is the only owner of terminal **mode state** — the six things in §5. C03 may emit synchronised-update markers because they are transactional (opened and closed around a single write, never persistent), not mode state.
- **I2** — `release()` is idempotent. Calling it twice is a no-op the second time.
- **I3** — Handlers are registered before any state is acquired. The constructor registers and `acquire()` is a separate call, but nothing structurally prevents a later change from calling `acquire()` from the constructor — so this is asserted by test, not assumed.
- **I4** — On a fault path, release completes before any diagnostic is written.
- **I5** — `beforeRelease` runs exactly once, before the first release, on every path. A throw from it is caught and the release proceeds.
- **I6** — Release emits the inverse of `held`, in reverse acquisition order.
- **I7** — `suspend()` leaves the alternate screen entirely. It does not retain it while a child draws.
- **I8** — `release()` while suspended releases the handler registrations and the stdout redirection, and does **not** emit terminal sequences — the child owns the terminal and writing into it would corrupt the child's screen.
- **I9** — stdout is redirected at construction; writes not originating from the renderer go to the debug log (D32).
- **I10** — A capability absent from the record is never acquired. No mouse in the record means no mouse sequence, ever.
- **I11** — `released` is a terminal state. Every operation on a released instance throws except `release()` itself, which is a no-op (I2).
- **I12** — `SIGWINCH` produces one coherent `{columns, rows}` snapshot per event (D31). Subscribers never see a mismatched pair.
- **I13** — Failure to acquire the alternate screen is fatal and aborts before first paint. It is the only fatal case in the system (A02 §7).

---

## 5. Behaviour

### Ink must not own the alternate screen

Ink 7 accepts `render({ alternateScreen })` and will enter and leave it itself.
**Do not pass it.**

Two owners of one piece of terminal state is the failure this component exists to
prevent: `held` would no longer describe what was taken, release would emit
sequences for state something else already released, and the ordering guarantees
in §Signals would hold for only half of it. Ink's version also has no
`beforeRelease`, so cleanup above L0 would stop running on signal paths.

The rule generalises to every capability in §3 that Ink may later offer: **if C01
holds it, Ink does not.** The framework's own option is the tempting shortcut
precisely because it looks simpler at the call site.

### Acquisition order

```
1  redirect stdout / console
2  alternate screen        CSI ? 1049 h     ← fatal if it fails
3  hide cursor             CSI ? 25 l
4  raw mode                setRawMode(true)
5  bracketed paste         CSI ? 2004 h     if capability
6  mouse tracking          CSI ? 1002 h, CSI ? 1006 h    if capability
```

The scroll region is not acquired at startup. It is taken and released transactionally by C03 only if scroll-region acceleration is ever built (M-T6), and `held` tracks it the same way.

Release is steps 6 → 1, emitting only what `held` contains.


### State machine

Four states. `released` is **terminal** — the handlers are gone and the instance cannot be revived. Repeated sessions construct a new instance, which is what T5.7's fifty cycles exercise.

| From ↓ / call → | `acquire()` | `release()` | `suspend()` | `resume()` |
|---|---|---|---|---|
| **constructed** | → acquired (T1.1) | → released, no bytes (T3.1) | throw (T3.2) | throw (T3.4) |
| **acquired** | no-op (T3.5) | → released (T1.2) | → suspended (T1.6) | throw (T3.4) |
| **suspended** | throw (T3.20) | → released, no bytes (T1.5) | throw (T3.3) | → acquired (T4.2) |
| **released** | throw (T3.21) | no-op (T1.4) | throw (T3.22) | throw (T3.22) |

Three of the throws exist because the intent is ambiguous rather than because the operation is impossible: `acquire()` while suspended means `resume()`, and any call on a released instance means "construct a new one". Silently tolerating either would mask an orchestration bug in the L4 shell.

### Signals

| Signal | Behaviour |
|---|---|
| `SIGINT` | Release, exit 130. The shell's own hierarchical Ctrl-C (C16) intercepts first; this is the escape path when it does not |
| `SIGTERM`, `SIGHUP` | Release, exit 130 |
| `SIGWINCH` | Read `columns` and `rows` as one snapshot, notify subscribers. No interpretation, no clamping |
| `SIGTSTP` | Release, remove the handler, re-raise `SIGTSTP` so the process actually stops |
| `SIGCONT` | Re-acquire, set `contaminated`, reinstall the `SIGTSTP` handler |
| `uncaughtException` | Release, write the stack to stderr, exit 1 |
| `unhandledRejection` | Release, write the reason to stderr, exit 1 |
| `SIGKILL` | Untrappable. The terminal is left corrupt; documented recovery is `reset` |

`SIGTSTP` re-raising is the subtle one. Handling it without re-raising means Ctrl-Z appears to do nothing; releasing without re-raising means the terminal is restored while the process keeps running.

### Suspend and resume

```
suspend:  release everything in `held`, leave the alternate screen, show the cursor
resume:   re-acquire from the same capability record
```

`resume()` does not repaint and does not set a contamination flag — it has none. The L4 shell calls `scheduler.invalidate()` after `resume()` returns. C01 knows nothing about frames.

**Release while suspended** (I8) is the case a signal creates: `SIGTERM` arrives while a child owns the terminal. C01 tears down its handlers and restores stdout, but emits no terminal sequence — the child owns the screen, and writing a reset into it would corrupt whatever the child is drawing. The child receives the signal from the process group independently.

Nested suspend is refused — `suspend()` while already suspended throws. There is no legitimate caller, and silently tolerating it would mask an orchestration bug in the shell.

---

## 6. Commitments

1. Escape-sequence **literals** live only in `terminal/escapes.ts`.
   Ink's `alternateScreen` option is never passed — two owners of one piece
   of terminal state is the failure this component prevents.
2. Capabilities are injected. C01 does not import C02.
3. Construction installs handlers; `acquire()` is unreachable before that.
4. `release()` is idempotent and emits the inverse of what was actually acquired, in reverse order.
5. Release precedes diagnostics on every fault path.
6. `suspend()` fully leaves the alternate screen.
7. `resume()` neither repaints nor tracks contamination — C03 owns the flag, the L4 shell calls `invalidate()`.
8. A capability absent from the record is never acquired.
9. Alternate-screen acquisition failure is fatal and is the only fatal case in the system.
10. `SIGTSTP` releases, removes its handler, and re-raises with default disposition.
11. C21 never calls C01; the L4 shell orchestrates suspend and handoff.
12. stdout is redirected at construction and restored at release.
13. `onFatal` is required, not optional — the only fatal case in the system cannot have undefined handling.
14. C01 owns `SIGWINCH` and emits one coherent dimension snapshot per event; it does not interpret it.
15. `release()` while suspended tears down handlers and stdout redirection but emits no terminal sequence.
16. `beforeRelease` gives layers above L0 a synchronous hook before the process exits; a throw from it never blocks the release.
17. `released` is terminal — a new instance is constructed per session; the transition table in §5 is exhaustive and every cell is tested.

---

## 7. Tests

Six tiers. Behaviour is not a seventh — it cross-cuts scope and is carried by tiers 1, 4 and 5 (A02 §7). Every cell of the §5 transition table is covered: valid transitions in tiers 1 and 4, invalid in tier 3.

### Tier 1 — unit

Fabricated `TerminalCapabilities`, a fake `WriteStream` capturing bytes. No real terminal.

- **T1.1** (I6, C5): full acquisition emits the six sequences in documented order.
  *Given* a record with every capability true. *When* `acquire()`. *Then* all six acquisitions occur exactly once; `1049h` is **first**; `setRawMode(true)` precedes any mouse or paste sequence. Relative order of `2004h`, `1002h` and `1006h` is unasserted — it is arbitrary, and pinning it would break on a harmless refactor.

- **T1.2** (I6): release emits the exact inverse in reverse order.
  *Given* an acquired instance. *When* `release()`. *Then* captured bytes are `1006l · 1002l · 2004l · 25h · 1049l` and `setRawMode(false)` was called once.

- **T1.3** (I10, C8): absent capabilities emit nothing.
  *Given* a record with `mouse: false, bracketedPaste: false`. *When* `acquire()` then `release()`. *Then* no `2004`, `1002` or `1006` byte appears in either direction.

- **T1.4** (I2, C4): release is idempotent.
  *Given* an acquired instance. *When* `release()` twice. *Then* the second call emits zero bytes and `acquired` is false.

- **T1.5** (I8, C15): release while suspended emits no terminal sequence.
  *Given* a suspended instance. *When* `release()`. *Then* zero bytes reach the terminal stream, handlers are disposed, and stdout redirection is undone.

- **T1.6** (I7): suspend leaves the alternate screen.
  *Given* an acquired instance. *When* `suspend()`. *Then* the emitted bytes include `1049l` and `25h`.

- **T1.7** (I9): stdout redirection captures foreign writes.
  *Given* a constructed instance. *When* `console.log("x")` is called. *Then* nothing reaches the captured terminal stream and the debug sink received `"x"`.

- **T1.8** (I9): redirection is undone at release.
  *Given* a released instance. *When* `console.log("x")`. *Then* it reaches the original stdout.

### Tier 2 — contract / interface

Proves the interface A02 §2 promises, so C03 and the shell can be written against it.

- **T2.1**: `createTerminalLifecycle` returns an object satisfying every member of `TerminalLifecycle`. `acquired` and `suspended` are implemented as getters — assignment does not mutate internal state. (`readonly` is compile-time only and guarantees nothing at runtime.)
- **T2.2**: `acquired` is false before `acquire()`, true after, false after `release()`. `suspended` tracks `suspend()`/`resume()` independently.
- **T2.6** (C13): omitting `onFatal` is a compile error, and the fatal path invokes it rather than throwing.
- **T2.7** (C14): `onResize` returns a disposable; disposing stops delivery.
- **T2.3**: the constructor registers handlers for all six process events before returning.
- **T2.4** (C11): C01's module graph contains no import from `data/` — asserted by a dependency test over the compiled module graph, not by inspection.
- **T2.5** (I1): no `\x1b` or `\u001b` literal exists anywhere in `tui-kit` outside `terminal/escapes.ts` — a source scan over the built output.
- **T2.9** (I1): `render()` is never called with `alternateScreen`; a source scan
  asserts it.
- **T2.8** (I1): the six mode-setting sequences (`1049`, `25`, `2004`, `1002`, `1006`, scroll region) are referenced only from C01. `2026` is referenced only from C03. Asserted per-sequence, so the exception cannot widen silently.

### Tier 3 — edge cases

Where the real defects live.

- **T3.1**: `release()` without a prior `acquire()` emits nothing and does not throw.
- **T3.23** (I5): `beforeRelease` runs once on each of the five exit paths, before any escape sequence is emitted.
- **T3.24** (I5): a throwing `beforeRelease` → logged, release completes, terminal restored.
- **T3.25** (I5): two releases → `beforeRelease` runs once, not twice.
- **T3.2**: `suspend()` without `acquire()` throws a named error.
- **T3.3**: nested `suspend()` throws.
- **T3.4**: `resume()` without a prior `suspend()` throws.
- **T3.5**: `acquire()` twice emits the sequence once; the second call is a no-op.
- **T3.6** (I13, C9): alternate-screen write throws → `onFatal` is invoked, `acquired` stays false, and nothing further is emitted.
- **T3.7**: a write throws *midway* through acquisition (at bracketed paste) → everything acquired so far is released in reverse, and `acquired` is false. Partial acquisition never leaves partial state.
- **T3.8**: a write throws during release → remaining releases are still attempted, and the error is reported once at the end. One failing sequence does not strand the other five.
- **T3.9**: `setRawMode` is absent (stdin is not a TTY) → treated as unsupported, skipped, no throw.
- **T3.10** (I4, C5): `uncaughtException` fires → assert ordering, that the last release byte precedes the first stderr byte.
- **T3.11**: `SIGINT` arrives *during* `acquire()` → the handler waits for acquisition to settle, then releases. No interleaved sequences.
- **T3.12** (C10): `SIGTSTP` → release, handler removed, signal re-raised. Asserted with a spy on `process.kill(process.pid, "SIGTSTP")`.
- **T3.13**: `SIGCONT` after `SIGTSTP` → re-acquired, `contaminated` true, `SIGTSTP` handler reinstalled.
- **T3.14**: two signals arrive in the same tick → release runs once (I2 under concurrency).
- **T3.15**: capability record claims `altScreen: false` → `acquire()` invokes `onFatal` without emitting anything.
- **T3.16** (I8, C15): `SIGTERM` while suspended → handlers disposed, stdout restored, zero terminal bytes emitted, exit 130. The child is untouched.
- **T3.17** (I12): `SIGWINCH` fires → subscribers receive one `{columns, rows}` object read in a single access. A stream reporting mismatched dimensions mid-read never reaches a subscriber.
- **T3.18**: `SIGWINCH` arrives while suspended → no subscriber is notified; the dimensions belong to the child.
- **T3.20**: `acquire()` while suspended → throws a named error. `resume()` is the intended call and the ambiguity is not tolerated.
- **T3.21**: `acquire()` after `release()` → throws. `released` is terminal; the handlers are gone and a revived instance would hold state nothing releases.
- **T3.22**: `suspend()` or `resume()` after `release()` → throws.
- **T3.19**: `SIGWINCH` fires three times in one tick → three notifications, not one. C01 does not coalesce; that is C03's job (D31 — resize is not debounced).

### Tier 4 — integration

Real components, still no real terminal.

- **T4.1** (with C02): a capability record produced by the real detector against a fabricated `TERM=dumb` environment drives C01 to acquire nothing beyond what is supported.
- **T4.2** (with C03, C7): the shell's `resume()` → `scheduler.invalidate()` sequence causes C03's next `commit()` to issue a full repaint. Asserted on the shell orchestration, since C01 has no contamination concept.
- **T4.3** (with C03): C03 never writes while `acquired` is false.
- **T4.4** (with the L4 shell): the documented `suspend → handoff → resume` sequence runs in order, and the child receives an un-raw stdin on the primary screen.
- **T4.6** (with C14): a `SIGWINCH` snapshot propagates to the viewport, which clamps scroll against it. C01 supplies the pair; it does not clamp.
- **T4.5**: startup ordering — the composition root's steps 6, 7, 8 execute in that order, asserted by an event log rather than by reading the code.

### Tier 5 — e2e

PTY harness. A real pseudo-terminal, a real process, byte-level comparison.

- **T5.1** (C1, the headline): for each of the five exit paths — `/exit`, Ctrl-D confirm, double Ctrl-C, `SIGTERM`, thrown exception — the PTY's final state matches a control run of `true`, compared on named state rather than "bytes": termios `ECHO`/`ICANON`/`ISIG` flags, DECSET modes 1049 / 25 / 2004 / 1002 / 1006, the active screen buffer, and the absence of a scroll region.
- **T5.2**: the pre-launch scrollback is intact after exit; the frame left no trace on the primary screen.
- **T5.3**: a thrown exception leaves its stack readable in the PTY's primary-screen scrollback.
- **T5.4**: `SIGTSTP` then `SIGCONT` — the terminal is usable while stopped, and the frame is repainted on resume.
- **T5.5**: launching `vi` through pass-through, quitting it, and exiting Prism leaves the terminal clean. Two nested alternate-screen users, correctly unwound.
- **T5.6**: `prism | cat` emits no escape sequence at all.
- **T5.7**: repeated mount/unmount, fifty cycles, leaves the PTY uncorrupted and shows no handler leak.

### Tier 6 — fail-on-revert

Tests whose only job is to fail loudly if a specific invariant is quietly undone. Each names the invariant and the failure it prevents.

- **T6.1** (I3): moving `acquire()` into the constructor, or registering handlers after acquisition → fails. Asserted on the event log, not the source. I3 is a tested property, not a structural guarantee — nothing prevents a later change from making that call.
- **T6.2** (I4): moving the stderr write before release in the fault handler → T6.1's ordering assertion fails and T6.2 reports the specific regression.
- **T6.3** (I1): adding an escape-sequence literal to any other module → the source scan fails, naming the file.
- **T6.12** (I1): emitting a mode-setting sequence from C03, or a `2026` marker from C01 → T2.8 fails. The transactional exception stays exactly one sequence wide.
- **T6.4** (I6): changing release to emit a fixed sequence rather than the inverse of `held` → T1.3 fails, because an unacquired capability would then be released.
- **T6.5** (A02 §1): adding an import from `data/` to `terminal/` → the module-graph test fails.
- **T6.6** (C11): making C21 import C01 → the same module-graph test fails from the other direction.
- **T6.7** (C7): adding a `contaminated` field back to C01, or making `resume()` repaint → the interface-conformance test fails on the extra member, and T4.2 fails because the shell no longer drives invalidation.
- **T6.9** (I8): making `release()` emit sequences unconditionally → T1.5 and T3.16 fail, catching the regression that would corrupt a running child's screen.
- **T6.10** (I12): coalescing `SIGWINCH` inside C01 → T3.19 fails.
- **T6.11** (I11): making `released` re-acquirable → T3.21 fails. A revived instance holds terminal state with no handler registered to release it — precisely the window I3 exists to close.
- **T6.8** (I2): removing the idempotency guard → T3.14 fails under the same-tick double signal.

---

## 8. Out of scope

| Not here | Where |
|---|---|
| Capability detection | C02 |
| When to repaint, coalescing, synchronised update | C03 |
| Spawning the child during handoff | C21, orchestrated by L4 |
| The too-small fallback render | C02 owns the threshold; L4 renders it |
| Cell buffers, diffing, scroll-region acceleration | M-T6, gated |
| Windows non-VT console API | Out of scope — Windows Terminal and WSL only |
