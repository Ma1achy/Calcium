# C03 — Frame scheduler

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L0 terminal |
| **Depends on** | `TerminalCapabilities` (injected) · a read-only `acquired` view of C01 (injected) · C01's `writer`, bound (injected) · a render callback |
| **Consumed by** | L4 shell · C13 C14 C15 C17 (anything that changes what should be on screen) |
| **Source** | A01 D31, D33 · A02 §2, §4, §7 |
| **Status** | Draft |

---

## 1. Purpose

Terminals repaint far more slowly than an application can generate frames. A streaming log at a thousand lines per second would ask for a thousand repaints; the terminal can usefully draw perhaps thirty. C03 decides **when** the screen is written, so that no other component has to think about it.

The property it protects is that fast output never starves input. A dev typing while a log tails should feel no lag, and that is achieved by classifying commits rather than by rate-limiting uniformly — keystrokes are never delayed, stream updates always are.

C03 does not hold frame content. It schedules a render callback; what gets drawn is whatever the React tree currently says. There is no frame queue, which is why an immediate commit can simply cancel a pending one rather than jumping a queue.

---

## 2. Public interface

```typescript
type CommitReason = "input" | "completion" | "resize" | "stream" | "spinner";

interface FrameScheduler {
  commit(reason: CommitReason): void;
  flush(): void;
  invalidate(): void;
  readonly pending: boolean;
  readonly contaminated: boolean;
}

function createFrameScheduler(opts: {
  render:       () => void;                       // paint current state
  repaint:      () => void;                       // clear, then paint from blank
  capabilities: TerminalCapabilities;
  lifecycle:    { readonly acquired: boolean };
  write:        (s: string) => void;              // C01's writer, bound by L4
  schedule?:    (fn: () => void, ms: number) => Disposable;   // injected for tests
  windows?:     Partial<Record<CommitReason, number>>;
}): FrameScheduler;
```

`schedule` is injected so every timing test runs on a fake clock in microseconds rather than sleeping. A scheduler tested with real timers is a scheduler with flaky tests.

`write` exists because C03 emits the synchronised-update markers itself and A01 D32 requires every write to go through C01's `writer`. L4 supplies `lifecycle.writer.write.bind(lifecycle.writer)`; C03 never holds the stream, only a bound call. It is also the observation point for T1.12, T1.13 and T4.3 — what reached the terminal is what was passed here.

**The seam is two strings wide.** `write` carries `SYNC_UPDATE.enter` and `SYNC_UPDATE.leave` and nothing else; frame content leaves through `render()`, which C03 does not own. That narrowness is the evidence the seam is cut in the right place, so T2.7 asserts it over the whole unit and edge corpus. A third string means something has moved into C03 that belongs elsewhere.

`lifecycle` is injected as a read-only view rather than the full `TerminalLifecycle`. C03 needs to know whether writing is safe; it must not be able to acquire or release.

**The view must be live, not a snapshot.** `acquired` is read at write time, through a getter backed by C01's own state. An object literal capturing the value at construction would report `false` forever, and every frame would be silently dropped — a failure that looks like a hung UI with no error anywhere. This is L4's mistake to make, not C03's, so C03 cannot prevent it structurally; T3.24 demonstrates it instead, so the warning is known to be about something real.

---

## 3. Coalescing

| Reason | Window | Rationale |
|---|---|---|
| `input` | 0 ms | Input feedback latency is the thing users notice. Never delayed |
| `completion` | 0 ms | The user is waiting on a result they asked for |
| `resize` | 0 ms, plus implicit `invalidate()` | Dimensions changed; a diff against the old frame is meaningless |
| `stream` | 33 ms | ~30 frames/s ceiling, matching the A02 §7 budget. Configurable down to 16 ms, but terminals generally benefit from fewer, larger writes — the default is the conservative end deliberately |
| `spinner` | 100 ms | Animation only; a faster tick conveys nothing |

**Immediate reasons cannot be made coalesced.** `windows` may tune `stream` and `spinner` only; supplying a window for `input`, `completion` or `resize` is rejected at construction. A config file must not be able to introduce input lag (I2).

**Windows are throughput ceilings, not deadlines.** `stream`'s 33 ms exists to cap streaming at ~30 fps; `spinner`'s 100 ms is an animation cadence. They encode different kinds of requirement, so the shortest ceiling governs: a pending timer is re-armed when a commit arrives whose window is **strictly shorter**, and left alone otherwise.

The consequence is deliberate and asymmetric. A stream commit arriving under a pending spinner draws within its own 33 ms. A spinner tick arriving under a pending stream may land up to 33 ms past its 100 ms — a spinner briefly at 7.5 fps instead of 10, which nobody perceives. The reverse would put streaming at 10 fps, which is exactly what the window exists to prevent.

What makes this cheap is that there is no frame content. Re-arming at 33 ms does not delay the spinner; it draws it *earlier*, at 33 rather than 100, because whatever renders draws current state. Only the *following* spinner tick can slip, and only by less than one stream window.

A ceiling is also the only form of this rule C03 can implement. A deadline is *now + window*, and C03 has no clock — A03 SS1 forbids one in `src/`, and the injected timer reports that it fired, never how long it has been running. Comparing windows needs neither.

**An immediate commit cancels any pending one and renders now.** Nothing is lost — the pending frame and the immediate frame would draw the same current state, so the earlier schedule is redundant rather than skipped.

**A pending frame is always flushed before a transition the user is waiting on** (A01 §render discipline). In practice this falls out of the rule above: the completion commit is immediate, so the pending stream frame is superseded rather than dropped. Final content is never lost.

### Re-entrancy

A render callback may cause a commit — a component measuring itself during render, a resize observed mid-paint. Writing is synchronous, so this arrives while a write is already in progress.

**A commit during a write is deferred, not dropped and not written inline more than once.** C03 records that a re-entrant commit occurred, with the strictest reason seen, and acts on it once the current write returns: inline if that reason was immediate, otherwise by scheduling a fresh window from the end of the write (T3.15). Dropping would lose the final state.

**A commit arising from that second write escalates to the timer.** Inline-once bounds the chain at two writes; escalation means nothing is dropped. An immediate reason gets a zero window, so the frame lands on the next turn instead of on this stack.

**The hazard is livelock, not depth.** An earlier draft of this section argued that recursing would risk unbounded stack depth. That is the wrong failure: a render callback that commits on every invocation never recurses — each write returns before the next begins — it simply never terminates the drain. The loop is flat and infinite rather than deep and finite, so a depth bound would not have caught it and neither did the prose. It was found when T3.20 exhausted the test runner's heap. A callback like that is pathological but legal, and C03's job is to keep it rendering at timer cadence rather than hanging (I10, T3.20, T6.10).

**Strictest** means: immediate outranks coalesced, and among coalesced the shorter window wins. Order among the three immediate reasons is unobservable, and that is not an accident — `resize` sets contamination eagerly at commit time even while deferring (§5), so the only thing that could distinguish the three has already taken effect by the time the deferred reason is chosen. Do not define an order there; it would have no effect.

`flush()` during a write is a no-op — the write it would force is already happening.

### Synchronised update

Where `capabilities.synchronisedUpdate` is true, each write is wrapped:

```
CSI ? 2026 h   …frame…   CSI ? 2026 l
```

The terminal composites the whole frame before showing any of it, which is what removes tearing on large repaints — the single highest-value capability in the record.

These markers are **transactional, not stateful**: they open and close around one write and never persist. That is why C03 may emit them without conflicting with C01's ownership of terminal *mode* state. The escape literals themselves live in `terminal/escapes.ts` with every other sequence.

---

## 4. Contamination

`invalidate()` sets a flag. The next write calls `repaint()` — clear the screen, draw from blank — rather than `render()`, then clears the flag.

Callers:

| Caller | When |
|---|---|
| L4 shell | After `lifecycle.resume()`, following a child process (A02 §4) |
| C03 itself | On a `resize` commit |
| L4 shell | On any detected foreign write |

C01 does not call this and has no contamination concept — the shell orchestrates, keeping L0 terminal's two components independent of each other's state.

The recovery is always the same and always safe. A full repaint is a larger burst of output than a diff, and correctness beats byte count every time (A01 D33).

---

## 5. State machine

Three states plus an orthogonal `contaminated` flag. `writing` is transient but observable from inside the render callback, which is what makes re-entrancy well-defined.

| From ↓ / call → | `commit(input\|completion)` | `commit(resize)` | `commit(stream\|spinner)` | `flush()` | `invalidate()` |
|---|---|---|---|---|---|
| **idle** | → writing → idle (T1.1) | set flag, → writing → idle (T1.10) | → pending, timer set (T1.3) | no-op (T3.1) | flag set, idle (T1.8) |
| **pending** | cancel timer, → writing → idle (T1.5) | set flag, cancel timer, → writing → idle (T3.16) | → pending; timer unchanged unless the arriving window is strictly shorter, in which case it is re-armed (T1.4, T3.12) | cancel timer, → writing → idle (T1.6) | flag set, pending (T3.6) |
| **writing** | defer (T3.7) | defer, flag set (T3.17) | defer (T3.18) | no-op (T3.8) | flag set (T3.19) |

Orthogonal: a write while `contaminated` calls `repaint()` rather than `render()` and clears the flag once that repaint returns (T1.9, T3.5). `resize` sets that flag as part of the commit (I7).

---

## 6. Invariants

- **I1** — C03 never writes while `lifecycle.acquired` is false. A commit in that state is dropped silently.
- **I2** — `input` and `completion` commits are never delayed by any amount, and their windows are not configurable.
- **I3** — At most one timer is outstanding. A coalesced commit within an open window never extends, slides or duplicates it. It re-arms the timer only when its own window is strictly shorter than the pending one; equal windows never re-arm, which is what makes T1.4 and T6.2's sliding-window revert bite.
- **I4** — An immediate commit cancels a pending timer. A timer never fires after the frame it would have produced has already been drawn.
- **I5** — A write while `contaminated` is a full repaint, and clears the flag once the repaint returns. A repaint that throws leaves the flag set, so the next write retries it (T3.5).
- **I6** — Synchronised-update markers are emitted iff the capability is present, and are always balanced — every `2026 h` has a matching `2026 l`, including when the render callback throws.
- **I7** — `resize` implies `invalidate()`. There is no path where dimensions change and a diff is attempted.
- **I8** — C03 holds no frame content. It calls `render()` or `repaint()`; what is drawn is current state.
- **I9** — A throwing `render()` does not leave a pending timer, an unbalanced marker, or a stuck `contaminated` flag.
- **I10** — A commit during a write is deferred with the strictest reason seen and acted on once the write returns: inline **once**, then by timer. A commit arising from that second write escalates to the timer rather than writing inline again.

  Inline-once bounds the chain at two writes; escalation means nothing is dropped. A render callback that commits on every render is pathological but legal, and without the escalation it drains forever — a livelock, not a recursion, which is why the depth argument in §3 does not catch it.
- **I11** — Time enters C03 only through the injected `schedule`. No ambient timer, so a coalescing window is asserted against a counter rather than slept through — the same shape C06 I19 takes, stated here because the audit found this property committed to in one spec and made an invariant in the other.
- **I12** — `lifecycle.acquired` is read at write time through a live view, never captured at construction.

---

## 7. Commitments

1. Commits are classified by reason; `input`, `completion` and `resize` are immediate, `stream` and `spinner` are coalesced (I2, I7).
2. Windows are 33 ms for stream and 100 ms for spinner, tunable at construction. Immediate reasons have no window and cannot be given one (I2).
3. An immediate commit cancels a pending one; final content is never lost (I4).
4. At most one timer is outstanding at a time (I3).
5. Nothing is written while the terminal is not acquired (I1).
6. Synchronised update wraps every write where supported, and markers are always balanced (I6).
7. `invalidate()` makes the next write a full repaint, and clears once that repaint returns (I5).
8. `resize` implies invalidation (I7).
9. C03 holds no frame content and owns no rendering (I8).
10. The timer is injected, so no test sleeps (I11). C06 I19 states the same property for C06; the audit of 2026-07-29 found it a commitment here and an invariant there, which is what SP1 now prevents.
11. C03 receives a live read-only view of C01 and cannot acquire or release (I12).
12. A commit arriving during a write is deferred and coalesced to the strictest reason, written inline at most once, and escalated to the timer thereafter. The chain is bounded at two writes and nothing is dropped (I10).
13. C03 writes only the synchronised-update markers, through an injected bound `write`. Frame bytes leave through `render()`, which C03 does not own (I6, I8).

---

## 8. Tests

Six tiers. Every cell of the §5 transition table is covered; fake clock throughout.

### Tier 1 — unit

Fake `schedule`, spy `render`/`repaint`, fabricated capabilities.

- **T1.1** (I2): `commit("input")` from idle → `render()` called synchronously, before the fake clock advances at all.
- **T1.2** (I2): `commit("completion")` from idle → same.
- **T1.3**: `commit("stream")` from idle → `render()` not yet called; `pending` true; timer at 33 ms. Advancing 32 ms → still not called. Advancing to 33 ms → called once.
- **T1.4** (I3): three `commit("stream")` calls within one window → exactly one timer, one `render()` at 33 ms from the **first** commit. The window does not slide.
- **T1.5** (I4): `commit("stream")` then `commit("input")` at 4 ms → `render()` called once, at 4 ms. Advancing past 33 ms — the window the cancelled timer would have fired in — produces no second call.
- **T1.6**: `commit("spinner")` then `flush()` → `render()` called immediately, timer cancelled, `pending` false.
- **T1.7**: `commit("spinner")` schedules at 100 ms, not at the 33 ms stream window.
- **T1.8** (I5): `invalidate()` then `commit("input")` → `repaint()` called, `render()` not; `contaminated` false afterwards.
- **T1.9** (I5): two writes after one `invalidate()` → first is `repaint()`, second is `render()`.
- **T1.10** (I7): `commit("resize")` → `repaint()` called immediately without an explicit `invalidate()`.
- **T1.11** (I1): `commit("input")` with `acquired: false` → neither callback is called; no throw.
- **T1.12** (I6): with `synchronisedUpdate: true`, a write emits `2026 h` before and `2026 l` after the render callback.
- **T1.13** (I6): with `synchronisedUpdate: false`, no `2026` byte is emitted.
- **T1.14**: custom `windows: { stream: 16 }` → the stream timer is scheduled at 16 ms.

### Tier 2 — contract / interface

- **T2.1**: the returned object satisfies every member of `FrameScheduler`; `pending` and `contaminated` are getters.
- **T2.2** (I8): C03 exposes no method accepting or returning frame content — asserted on the interface shape.
- **T2.3** (I12): the injected `lifecycle` view has only `acquired`; passing a full lifecycle does not let C03 reach `acquire` or `release` (type-level, asserted by a compile test).
- **T2.4** (I3): `pending` is true only while a timer is outstanding, for every reason in the enum.
- **T2.5**: every `CommitReason` in the union has a window entry — asserted exhaustively over the type, so adding a reason without a window fails the build.
- **T2.6** (A02 §1): the module graph contains no import from `data/`.
- **T2.7** (C13): across the whole tier-1 and tier-3 corpus, every string passed to `write` is the synchronised-update open or close marker. Nothing else, ever — a third string means frame content has moved into C03.

### Tier 3 — edge cases

- **T3.1**: `flush()` from idle → no-op, no callback, no throw.
- **T3.2**: `invalidate()` called twice before a write → one `repaint()`, not two.
- **T3.3** (I9): `render()` throws → the error propagates, `pending` is false, no timer remains, and a subsequent commit still works.
- **T3.4** (I6, I9): `render()` throws with synchronised update on → the closing `2026 l` is still emitted. An unbalanced marker leaves the terminal in synchronised mode and frozen.
- **T3.5** (I9): `repaint()` throws while contaminated → the flag stays set, so the next write retries the repaint rather than diffing against an unknown screen.
- **T3.6**: `invalidate()` while pending → stays pending; the pending timer's write is a repaint.
- **T3.7**: a commit arrives *during* the render callback (re-entrancy) → the inner commit is deferred to after the current write, not dropped, and does not recurse.
- **T3.8**: `flush()` during the render callback → no-op rather than re-entrant write.
- **T3.9**: `acquired` flips false while a timer is pending → the timer fires and writes nothing (I1); no throw, `pending` clears.
- **T3.10**: `acquired` flips false and back to true while pending → the pending write happens once.
- **T3.11**: a hundred `commit("stream")` calls in one synchronous block → exactly one timer, one render.
- **T3.12** (I3): alternating `stream` and `spinner` commits → the shortest ceiling governs, in both orderings. Stream-then-spinner leaves the 33 ms timer alone — 100 is not shorter. Spinner-then-stream re-arms the 100 ms timer at 33 ms. A longer window never pushes the frame out.
- **T3.13** (I2): `windows: { input: 50 }` at construction → **throws**. Same for `completion` and `resize`.
- **T3.14** (I1): `flush()` from pending while `acquired` is false → the timer is cancelled, nothing is written, `pending` is false. The one path where an explicit flush discards a frame silently.
- **T3.15** (I3, I10): a coalesced commit deferred during a write schedules a **fresh** window measured from the end of the write, not from the original commit. No timer is outstanding at that moment, so I3 holds.
- **T3.16**: `commit("resize")` while pending → timer cancelled, repaint written immediately.
- **T3.17** (I10): `commit("resize")` during a write → deferred, contamination flag set, and the deferred write is a repaint.
- **T3.18** (I10): `commit("stream")` during a write → deferred and scheduled, not written immediately.
- **T3.19**: `invalidate()` during a write → the flag applies to the *next* write, not the one in progress.
- **T3.20** (I10): a render callback that commits on every invocation → exactly one deferred write follows, not an unbounded chain. The commit made during *that* write is escalated to a timer rather than dropped or written inline, so advancing the clock renders again — a render loop runs at timer cadence, and the stack stays flat.
- **T3.21** (I10): `commit("stream")` then `commit("input")` both during one write → one deferred write, immediate, at the stricter reason.
- **T3.22** (I12): `acquired` flips true after construction → the next commit writes. A snapshotted view would never write at all.
- **T3.23** (§1): the starvation property, directly. With `windows: { stream: 16 }`, a long interleaving of `stream` commits at 16 ms and `input` commits at irregular offsets → every input frame is rendered at the tick its commit arrived, none is delayed behind a pending stream frame, and stream frames remain capped at one per window. This is what T4.6 and T5.2 assert against real components and real timers; here it is deterministic.
- **T3.24** (I12): a scheduler constructed with an object literal capturing `acquired` — the mistake §2 warns L4 against — drops every frame after the first state change, silently: no throw, no output, no timer left behind. T3.22 proves the live view works; this proves the dead one fails, and fails in exactly the way described.

### Tier 4 — integration

- **T4.1** (with C01, C01's T4.3): C03 never writes while C01 reports unacquired, asserted from C01's side of the boundary too.
- **T4.2** (with C01, C02): the shell's `resume()` → `invalidate()` sequence causes the next commit to repaint.
- **T4.3** (with C02): `synchronisedUpdate: false` from a real detection run → no `2026` wrapper reaches the stream.
- **T4.4** (with C13, C14): with `windows: { stream: 16 }`, appending a transcript block issues one `commit("stream")`, and a burst of appends within one 16 ms window produces one frame.
- **T4.5** (with C17): a keystroke issues `commit("input")` and the frame is drawn before the next keystroke is processed.
- **T4.6** (with C17, C13): with `windows: { stream: 16 }`, typing while a stream commits at 16 ms intervals → every keystroke frame is immediate and none is delayed behind a stream frame. The starvation property against real components; T3.23 asserts the same property deterministically and does not wait on them.
- **T4.7** (with C01): a `SIGWINCH` snapshot produces `commit("resize")` and therefore a repaint, not a diff.

### Tier 5 — e2e

PTY harness, real timers, real terminal.

- **T5.1**: a 1,000 line/s stream for ten seconds → the frame rate sits **at or below** the 30.3/s ceiling the 33 ms default sets, does not collapse below 20/s, produces two orders of magnitude fewer frames than commits, and holds CPU under 25% of one core.

  Stated as a ceiling approached from below, not a band around a cadence, for the same reason §3 calls windows ceilings rather than deadlines. The window is armed after the previous frame completes, so the real gap is *window + frame cost + timer slop* and the achieved rate is necessarily under 1000/window. A measured run gives ~25.7/s at ~39 ms per frame; an earlier draft asked for ±10% of 30.3/s, which no correct implementation can meet without becoming a fixed-cadence rate limiter — and a fixed cadence would need the elapsed time C03 has no way to read.
- **T5.2**: typing continuously during that stream → input-to-frame latency p95 under 16 ms.
- **T5.3**: on a synchronised-update-capable terminal, a full-screen repaint shows no intermediate state — asserted by sampling the PTY mid-write and finding either the old frame or the new one, never a mixture.
- **T5.4**: dragging the terminal edge continuously → every frame is correct, none is blank, no corruption.
- **T5.5**: suspending to a child and returning → the first frame after resume is a full repaint, verified by byte volume rather than by inspection.
- **T5.6**: idle for sixty seconds → zero writes and no measurable CPU. There is no polling render loop.

### Tier 6 — fail-on-revert

- **T6.1** (I2): giving `input` a non-zero window → T1.1 and T3.13 fail.
- **T6.2** (I3): restarting the timer on each coalesced commit (a sliding window) → T1.4 fails, catching the bug where a continuous stream never renders at all.
- **T6.3** (I4): leaving the timer live after an immediate commit → T1.5 fails on the double render.
- **T6.4** (I6): emitting the closing marker inside the `try` rather than a `finally` → T3.4 fails.
- **T6.5** (I5): clearing `contaminated` before the repaint rather than after → T3.5 fails, catching the case where a failed repaint is never retried.
- **T6.6** (I1): removing the acquired check → T1.11 fails, and C01's T4.3 fails from the other side.
- **T6.7** (I7): decoupling resize from invalidation → T1.10 fails.
- **T6.8** (I8): adding a frame buffer or content parameter to `commit` → T2.2 fails.
- **T6.9** (A02 §7): adding a `CommitReason` without a window → T2.5 fails at build time.
- **T6.10** (I10): dropping a re-entrant commit → T3.21 fails on the lost frame. Draining the deferral in a loop rather than escalating the second one → T3.20 does not fail, it *hangs*: the chain is flat and infinite, so it exhausts the heap rather than the stack. That is the failure the escalation exists to prevent, and the reason I10 bounds the inline writes by count rather than by depth.
- **T6.11** (I12): snapshotting `acquired` at construction → T3.22 fails.
- **T6.12** (I2): allowing an immediate reason to be given a window → T3.13 fails. Distinct from T6.1: that reverts the behaviour, this reverts the construction-time rejection.
- **T6.13** (I3): re-arming the pending timer on every coalesced commit, or on one whose window is merely *not longer* → T1.4 fails, since 33 against 33 would slide the window. Never re-arming → T3.12 fails on the spinner-then-stream ordering. Strictly-shorter is what holds both directions; either comparison relaxed by one step breaks one of them.
- **T6.14** (C13): passing frame content to `write` rather than through `render()` → T2.7 fails on the third string.
- **T6.15** (I12): snapshotting `acquired` in the L4 wiring rather than in C03 → T3.24 fails. The failure C03 cannot prevent structurally, so it is demonstrated instead.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| What is drawn | C09 and the React tree |
| Acquiring or releasing terminal state | C01 |
| Detecting synchronised-update support | C02 |
| Virtualisation, wrap caching | C14 |
| Cell diffing, scroll-region acceleration, front/back buffers | M-T6, gated on measurement |
| Deciding *that* something changed | Callers. C03 decides only *when* it is drawn |
