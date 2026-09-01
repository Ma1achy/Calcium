# C03 — Frame scheduler

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
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
| `resize` | **16 ms, fixed**, plus implicit `invalidate()` | Dimensions changed; a diff against the old frame is meaningless — hence the invalidate, which is set **eagerly at commit** and not at flush (I7, I15). The window is not tunable: unlike `stream` and `spinner`, whose window makes a frame *stale*, this one makes it *wrong*, so a config may not lengthen it (I15) |
| `stream` | 33 ms | ~30 frames/s ceiling, matching the A02 §7 budget. Configurable down to 16 ms, but terminals generally benefit from fewer, larger writes — the default is the conservative end deliberately |
| `spinner` | 100 ms | Animation only; a faster tick conveys nothing |

**And for the life of the project no producer raised it.** `commit("spinner")` appeared in six
of this component's own test files and nowhere in `src/` — the reason declared, the window
tuned, the interaction with `stream` specified in three paragraphs below, and nothing in the
product ever supplying one. So `RenderContext.tick` was `0` for the life of a session and
`steps` could not animate: measured at **one distinct spinner glyph across ten real frames**,
against ten through the test harness (F227). Two of the three links were elsewhere — C22
omitted `tick` from the render options and its line cache had no tick axis — which is why
patching either one alone left the frame unchanged.

**The producer is C22's spinner ticker** (C22 I60a), armed from what the frame drew and disposed
when nothing on screen animates — so a `spinner` commit is raised only while something is
waiting on one, and this component's window is a floor under the block's own interval rather
than a heartbeat. **This paragraph described the break for one commit after it was repaired**,
because the fix was C22's and so was the prose that got rewritten (F233).

**This was the link recorded nowhere, and that is why the other two read as dormant.** C22 I60
and its §6c row 10 both stated their halves correctly and called them *not reachable*, which was
true only while nothing here raised a commit. **A missing producer makes every consumer
downstream of it look like a decision deferred rather than a chain broken** — which is the part
worth keeping now that the chain is joined, because it is a fact about reading a spec and not
about this defect.

**Immediate reasons cannot be made coalesced.** `windows` may tune `stream` and `spinner` only; supplying a window for `input` or `completion` is rejected at construction, because a config file must not be able to introduce input lag (I2) — and for `resize`, because its window is fixed for a different reason (I15).

**Both rejections used to cite I2 and I2 names two reasons.** Its text is *`input` and `completion` commits are never delayed by any amount*; three places in this document cited it for `resize` as well, and the roadmap quoted it back as *"input, completion and resize are never delayed"* — a quotation of a sentence that does not exist. `make enforce` resolves 12 742 invariant references and cannot see it: it checks that a citation names an invariant which exists, never that the invariant says the cited thing (SP9's stated blind spot). The two reasons are genuinely different — input lag is about *latency the user causes*, a resize window is about *a frame that is wrong rather than stale* — so they are two invariants and not one widened (F423).

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

## 4a. Suspension — the screen held still on purpose

**Ruled before the code that needs it** (entry 15's copy mode, `CALCIUM_SELECTION_DESIGN.md` §3). A reader taking the terminal's own selection needs the screen to stop moving under it, and every path to the terminal goes through this component — which is why suspension is here rather than at one of L4's fifteen `commit` call sites.

`suspend()` and `resume()` are **new members on a published L0 interface and are freeze-relevant**, and the row says so rather than leaving it to be found.

### The seam is a property, not a proxy

The alternative was a `render` callback that returns without composing — zero new surface, since L4 injects `render` already. **Refused, because it lies to the scheduler**: `pending` would clear and `contaminated` would clear on a frame that was never written, so C03's own state would stop describing the terminal. A property the scheduler can reason about beats one it cannot see, which is C16 I8's argument one layer down.

### Suspension gates `render`, never `repaint`

**This is the whole rule, and it falls on a branch `writeFrame` already has.**

- **Suspension is about staleness**, which the reader has asked for. The screen is old and that is the point.
- **Contamination is about a screen whose contents nobody knows.** Suspension may not produce that state, and it does not get to hold one that already exists.

So a contaminated write goes through while suspended, and an ordinary render does not. **`resize` therefore overrides suspension**, via I7 — and the reason is the one failure the application can no longer see: width is the axis that wraps, and a wrapped line scrolls the alternate screen. A native selection over a corrupted screen is worthless, so deferring protects nothing and costs the state.

### `flush()` is a no-op while suspended, and introduces no queue

**The sharper of the two questions, because both obvious answers are wrong.** If `flush()` composes, suspension is advisory and the caller decides whether it applies. If it queues, the queue is state nobody has bounded.

Neither happens, because **there is no queue to bound**. `commit` already collapses everything into one `state` and one `deferred` reason — O(1), and bounded by construction long before suspension existed. A suspended `flush()` forces nothing and returns; a contaminated one repaints, by the rule above.

### `resume()` commits an ordinary frame, not a repaint

**And the reason is the property that made `suspend()` the right seam.** Suspension writes nothing, so what is on the terminal is still the last frame written and C25's model of the screen still agrees with it. The diff is valid — larger than usual, and correct. A repaint here would be a burst of output bought with no correctness at all.

`suspend()` during a write applies to the *next* frame, exactly as `invalidate()` does and for the same reason: `writeFrame` read its flags before calling out.

---

## 5. State machine

Three states plus an orthogonal `contaminated` flag. `writing` is transient but observable from inside the render callback, which is what makes re-entrancy well-defined.

| From ↓ / call → | `commit(input\|completion)` | `commit(resize)` | `commit(stream\|spinner)` | `flush()` | `invalidate()` |
|---|---|---|---|---|---|
| **idle** | → writing → idle (T1.1) | set flag, → pending, timer set at 16 ms (T1.10, T1.21) | → pending, timer set (T1.3) | no-op (T3.1) | flag set, idle (T1.8) |
| **pending** | cancel timer, → writing → idle (T1.5) | set flag; timer re-armed only if 16 ms is strictly shorter than the one standing (T3.16, T1.22) | → pending; timer unchanged unless the arriving window is strictly shorter, in which case it is re-armed (T1.4, T3.12) | cancel timer, → writing → idle (T1.6) | flag set, pending (T3.6) |
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
- **I13** — **Suspension gates `render` and never `repaint`.** While suspended an ordinary frame is not written and a contaminated one is, so `resize` — which implies contamination (I7) — reaches the terminal regardless of suspension. Suspension may make the screen *stale*, which is what it is for; it may not make the screen *unknown*, and it may not hold a screen that already is. `suspend()` during a write applies to the next frame, as `invalidate()` does.
- **I14** — **Suspension introduces no queue.** `flush()` while suspended forces nothing beyond what I13 already allows, and `resume()` writes an ordinary frame rather than a repaint: suspension writes nothing, so the terminal still holds the last frame written and the diff's model of it is still true. C03's memory of deferred work stays one `state` and one `deferred` reason under suspension, exactly as without it.

- **I15** — **`resize` is coalesced on a fixed 16 ms window, and the window is not configurable.** It is not immediate and it is not tunable, and those are two rulings with two reasons. *Not immediate*, because the cost of a resize is not the frame: the width is what invalidates every cached height (C14 I8), so a drag of thirty `SIGWINCH`es was thirty re-measures of the whole transcript — **544 ms at a thousand entries, of which the index rebuild everyone named was 0.07%** (F423). *Not tunable*, because `stream` and `spinner` windows make a frame **stale** where this one makes it **wrong**, and I2's reasoning — a config may not introduce lag — reaches the second case for a different reason than the first. **Contamination is set eagerly at commit and never at flush** (I7, §5), which is what lets an `input` commit arriving inside the window write a correct frame rather than a diff against dimensions that no longer exist.

---

## 7. Commitments

1. Commits are classified by reason; `input` and `completion` are immediate, `resize`, `stream` and `spinner` are coalesced (I2, I7, I15).
2. Windows are 16 ms for resize, 33 ms for stream and 100 ms for spinner; the last two are tunable at construction and resize's is not (I15). Immediate reasons have no window and cannot be given one (I2).
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
14. `suspend()` holds the screen still without letting it become unknown: ordinary frames wait, contaminated ones are written, and **suspension therefore never holds a resize back** (I13). *Never deferred* is what this said, and the walk falsified it: a resize is deferred by its own window (I15), and by a write in progress (I10), and neither is suspension. The claim is about which mechanism may hold it, not about whether anything can — C03 §8a A4.
15. Suspension is bounded state, not a buffer: `flush()` forces nothing while suspended and `resume()` writes an ordinary diffed frame, not a repaint (I14). **`suspend()` and `resume()` are new members on a published L0 interface and are freeze-relevant.**
16. **A resize is coalesced on a fixed, non-configurable 16 ms window, and the frame is where the viewport learns its size** (I15). L4 composes from `lifecycle.size()` read fresh and resizes the viewport from the composed frame before any row is read, so a commit of any reason arriving inside the window writes a frame at the *current* width — the wrong-frame hazard is closed by that ordering rather than by immediacy. C22 I34 owns that ordering and §8a A2 is the row that checked it.

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
- **T1.21** (I15): `commit("resize")` from `idle` → **`pending` with a 16 ms timer, and nothing written** until the injected counter advances past it. The contamination flag is set at the commit, not at the flush — asserted here rather than in T1.10, because *set eagerly* and *set at all* are different claims and only the first survives the window.
- **T1.22** (I15): two `commit("resize")` calls inside one window → **one write**, and the timer is not re-armed by the second. A window re-armed per event never fires during a continuous drag, which is the starvation case §8a A1 names and the one a per-event `setTimeout` produces.
- **T1.23** (I15): `commit("input")` while a resize is pending → the timer is cancelled and the frame is written immediately, **and it is a `repaint`** — because the resize set contamination at commit time. This is the row that shows the coalescing costs no correctness: a keystroke mid-drag draws at the current dimensions, not a diff against the old ones.
- **T1.8** (I5): `invalidate()` then `commit("input")` → `repaint()` called, `render()` not; `contaminated` false afterwards.
- **T1.9** (I5): two writes after one `invalidate()` → first is `repaint()`, second is `render()`.
- **T1.10** (I7): `commit("resize")` → `repaint()` called immediately without an explicit `invalidate()`.
- **T1.11** (I1): `commit("input")` with `acquired: false` → neither callback is called; no throw.
- **T1.12** (I6): with `synchronisedUpdate: true`, a write emits `2026 h` before and `2026 l` after the render callback.
- **T1.13** (I6): with `synchronisedUpdate: false`, no `2026` byte is emitted.
- **T1.14**: custom `windows: { stream: 16 }` → the stream timer is scheduled at 16 ms.
- **T1.15** (I13): `suspend()` then `commit("input")` → neither callback is called. Then `resume()` → `render()` once. The pair is the assertion: a suspension that never lifts is indistinguishable from a scheduler that stopped working.
- **T1.16** (I13): `suspend()` then `commit("resize")` → `repaint()` is called **while suspended**. Contamination overrides, because suspension may make the screen stale and may not leave it unknown — and a resize is the case where deferring costs the state the application can no longer see.
- **T1.17** (I13): `suspend()`, `invalidate()`, `commit("input")` → `repaint()`. The same rule reached without a resize, so the row is about contamination rather than about `resize` in particular.
- **T1.18** (I14): `commit("spinner")` then `suspend()` then `flush()` → nothing is written, and no work is held: `resume()` produces exactly **one** `render()`. A queue would produce two.
- **T1.19** (I14): `resume()` calls `render()` and not `repaint()`, with `contaminated` false throughout. The diff's model of the screen survives suspension because suspension writes nothing — which is the property that made this the right seam rather than a `render` callback that returns early.

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
- **T3.13** (I2, I15): `windows: { input: 50 }` at construction → **throws**. Same for `completion` — those two by I2 — and for `resize`, **by I15 and for a different reason**, which is why the row names both. A single citation here read as one rule covering three reasons and I2 covers two (F423). **The two messages are asserted separately in T2.5**, which is where the partition lives: a shared message would restate the conflation this replaces, and a reader told *never delayed* about a reason that is delayed by 16 ms has a sentence they cannot check against the behaviour.
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
- **T5.5**: suspending to a child and returning → the terminal is handed over and taken back, and the session draws a whole frame on the far side of it. **Not "verified by byte volume"**, which is what this row said and which names a distinction the shell does not have: C22 wires `render` and `repaint` to the same function (`session.ts`), because a frame here is always the whole screen — there is no partial-update path for a repaint to be larger than. So a full repaint and an ordinary frame are byte-identical by construction, and a row asserting the difference would pass whatever C03 did. What is observable from outside is the sequence: the alternate screen goes down before the child and comes back up after it, a complete frame follows, and the session still takes input. A02 §7's per-frame budget covers the volume claim where it is meaningful.
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
- **T6.16** (I15): making `resize` immediate again → **T1.21 and T1.22 fail, and T1.23 does not** — a frame written per `SIGWINCH` is still correct, just thirty times over. That asymmetry is the row's content: the defect this window exists for is invisible to every assertion about what a frame contains, which is why it survived to be measured rather than reviewed (F423).
- **T6.12** (I2): allowing an immediate reason to be given a window → T3.13 fails. Distinct from T6.1: that reverts the behaviour, this reverts the construction-time rejection.
- **T6.13** (I3): re-arming the pending timer on every coalesced commit, or on one whose window is merely *not longer* → T1.4 fails, since 33 against 33 would slide the window. Never re-arming → T3.12 fails on the spinner-then-stream ordering. Strictly-shorter is what holds both directions; either comparison relaxed by one step breaks one of them.
- **T6.14** (C13): passing frame content to `write` rather than through `render()` → T2.7 fails on the third string.
- **T6.15** (I12): snapshotting `acquired` in the L4 wiring rather than in C03 → T3.24 fails. The failure C03 cannot prevent structurally, so it is demonstrated instead.

---

## 8a. The walk — resize as a coalesced reason

**Two artefacts, because this reason has state and structure.** The state is C03's own machine
plus a window in flight; the structure is *who owns the terminal's width at rest*, which no
sequence of events produces and no trace row can reach. Taking the trace alone because the state
machine is the obvious thing is how the structural half goes unexamined.

**Written before the code, against the measurement in F423**: a 30-event drag costs 544 ms at
1 000 entries, of which the Fenwick rebuild the roadmap named is 0.07%. The cost is a re-measure
of every entry, and the walk's job was to find where it can be made to happen once.

### The trace — a resize is in flight and something else happens

| # | in flight | event | rules that meet | ruling |
|---|---|---|---|---|
| A1 | resize pending | another `SIGWINCH` | §5's window rule | **The deadline is the first event's.** A window re-armed per event never fires during a continuous drag — the starvation case, and the one a naive `setTimeout` per event produces. §5 already says the timer is unchanged unless the arriving window is *strictly shorter*; resize's window is a constant, so the existing rule gives this and no new clause is needed |
| A2 | resize pending | `commit("input")` — a keystroke mid-drag | I2 · §5 strictness · **C22's compose order** | **This row decides the design.** The frame an input commit writes is at the *current* terminal width whether or not the resize's own frame has been written — because `render-frame.ts` sets the viewport's size from `frame.size` before any row is read, and `frame.size` is `lifecycle.size()` read fresh. The wrong-frame hazard I2's reasoning names for `resize` is closed **structurally, in another component**, not by immediacy |
| A3 | resize pending | `commit("stream")` | §5 strictness | 16 ms is strictly shorter than stream's 33 ms, so the resize's timer stands. Existing rule |
| A4 | resize pending | `suspend()` | I13 · I14 · **commitment 14** | I13 is about *whether* a contaminated frame is written and the window is about *when*; they do not conflict. **But commitment 14's wording does** — *"a resize is therefore never deferred (I13)"* is true of suspension and becomes false in a second sense the moment a window exists. **Found here, and it is the reason a walk is scheduled rather than diligent**: nothing about writing the window would have re-read that sentence |
| A5 | resize pending | the terminal is released | C01 I12b · I1 | The timer fires and the write is dropped silently by I1. **No cancel**, because adding one is a second expression of an invariant that already holds — the reimplemented-rule shape |
| A6 | startup deferred on a failed size gate | `SIGWINCH` | C22 I8 | **No effect.** That continuation is a second `onResize` subscriber (`session.ts:323`), not a commit, so C03's window is not in its path. Checked rather than assumed, because a 16 ms delay to a deferral that once *deferred for ever* is the kind of thing that reads as harmless |
| A7 | resize pending | `flush()` | §5 | Cancel timer, write now. Existing rule |
| A8 | `writing` | `SIGWINCH` | I10 · §5's eager contamination | **The walk said *unchanged* and the implementation disproved it.** The flag is still set at commit time, which is the half that was right. But `runWrite` gives a deferred *coalesced* reason a fresh window from the end of the write (T3.15), and `resize` is one now — so it no longer writes inline, it waits 16 ms like a stream. Safe for the same reason as A2: the flag is already set, so whenever the write lands it is a repaint at whatever width the terminal then has. **Recorded rather than smoothed over: this is the row the code got to disprove, and a walk that is never disproved is one nobody checked** |

### The classification table — who owns the width, at rest

No event between these; two statements that are simultaneously true.

| at rest | `lifecycle.size().columns` | the viewport's width | what a reader sees |
|---|---|---|---|
| steady | W | W | W |
| today, between `SIGWINCH` and its frame | W′ | W′ — the handler wrote it | W′ |
| **with the handler's write removed** | W′ | **W — stale** | **W′** |
| a reader of viewport rows outside a frame | W′ | W | — |

**The third row is the one that looks like a defect and is not**, and only a table asks it: the
viewport genuinely holds a stale width between the signal and the frame. It is unobservable
because `composeFrame` orders itself `composed()` → `resizeViewport()` → `paint(…, paintDeps(…))`,
and `paintDeps` — the only thing that reads viewport rows — has exactly two call sites, both
after the resize. The fourth row is therefore empty: **there is no reader outside a frame.**

**So the handler's `viewport.resize` is a second writer of the width whose only effect is to do
the re-measure early**, and C22 I34 already named that shape for the *height*: *two writers with
different ideas of one quantity*. The same sentence, one field over, and the field it was written
about is the one that got fixed.

### What the walk changed before any code

1. **The window is C03's, and the handler's write is deleted** — not a coalescing timer in C22,
   which was the shape before the walk. The re-measure moves onto the frame path, where C03's
   window already coalesces it.
2. **A2**: nothing needs to flush a pending resize. Ten `commit("input")` call sites would each
   have had to, which is the reimplemented-rule hazard avoided by finding the ordering instead.
3. **A4**: commitment 14's wording is falsified by the change and is corrected with it.
4. **A5**: no cancel-on-release, on the grounds that I1 already says it.

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
