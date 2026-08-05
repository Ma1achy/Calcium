# S9 `/logs <c>` — the walk, and the route that does not exist

`/logs` is the consumer C22 §13a named and deferred: **a verb that is both a view and a
stream.** `docker logs -f` has no natural end, and A01 D4's test makes it a view — it takes
the whole screen and binds letter keys. So `/logs` runs into the loud refusal at
`execution.ts:503` on its first invocation, which is the step's work rather than an obstacle
in front of it.

Walked before any code, and the artefact is **the route-obligation table run against the
streaming branch**. §13a ran it against the *non-streaming* view route and found three
obligations that had been missed one at a time — `declareLive`, `release`, `cancelInFlight`
— which is why it exists: *"the view route does not need that"* is the assumption that
produced all three.

Both shapes, because both kinds of interaction are here. The table finds what the streaming
route does that the view has no equivalent for; the trace finds what happens when something
arrives mid-stream.

---

## §1 The rules in play

| | rule | source |
|---|---|---|
| R1 | A streaming verb **releases the guard before the loop**, not after | C23 I6, `execution.ts:678` |
| R2 | Its canceller is registered **before** the loop is awaited, and forgotten in `finally` | `execution.ts:683` |
| R3 | `seq` is per stream and counts patches **adapted**, not applied | C07 I15, I30 |
| R4 | A stream's patches reach a transcript **entry** via `transcript.patch(id, view)` | `execution.ts:796` |
| R5 | `ViewPatch` has `append`, `replace`, `document` — and **no delete** | C04, C23 §8a A4 |
| R6 | `applyPatch` is pure and is what C13 itself uses | C04 I8, `transcript/store.ts:139` |
| R7 | The document view holds blocks and an offset; `putBlock` **replaces by id** | C22 I46, I47 |
| R8 | One view at a time; `Esc` pops and appends nothing | C15 I1, B03 §2 |
| R9 | Ctrl-C cancels the **newest** live subscription, counted from `liveStreams` | C16 §5 |
| R10 | A patch that fails to apply has three arms: `patch`, `settled`, `unknown` | C23 §8a A2 |

---

## §2 The route-obligation table

Every obligation the **streaming entry** route carries, against the view. The `n/a` rows
carry reasons, because §13a's three misses were each an unexamined `n/a`.

| # | the entry route does | the view route | ruling |
|---|---|---|---|
| 1 | `guard.release()` **before** the loop | **the same, and it is the whole reason the refusal exists** | R1. The current fallthrough holds the guard for the life of the process, which is what C23 I6 forbids |
| 2 | `liveStreams.push({id, cancel})` before awaiting | **the same** | R9. This is what gives `/logs` the Ctrl-C rung, and **nothing has ever exercised it** |
| 3 | `forgetStream(id)` in `finally` | **the same** | a stream that ended on its own must not leave a canceller |
| 4 | `id` is the pending entry's | **`DOCUMENT_VIEW_ID`** | B1 below — there is no entry, and the id has to be something `refresh` and `liveStreams` agree on |
| 5 | `transcript.patch(id, view)` | **`documentView.patch(view)`, via `applyPatch`** | B2 — the seam that does not exist |
| 6 | `refresh.sawPatch(id)` on success | **the same, keyed by the view host** | the stall notice is as meaningful here |
| 7 | `scheduler.commit("stream")` on success | **the same** | C23 I8 — patches coalesce at `"stream"` |
| 8 | `patch.kind === "end"` → `transcript.settle(id)` | **no settle exists** | B3 — the sharpest row |
| 9 | malformed → append a `truncated` notice, settle | **append, then B3's answer** | needs R5's `append`, which `putBlock` cannot do |
| 10 | catch → append a `stream-error` notice, settle | **the same** | |
| 11 | `resetFocus` | **not called** | §13a's ruling, unchanged: nothing appends, nothing freezes |
| 12 | `declareLive(doc.blocks)` | **n/a — and checked rather than assumed** | a stream produces patches, not a document with `b.live` parts. The non-streaming view route needs it because its adapter may return one; this route never has a document to declare from |
| 13 | `history.append(line, 130)` on cancel | **the same** | already in `runIntoView`'s canceller |
| 14 | the pending entry is appended before the transport | **`open()` pushes a waiting view** | C23 I3's ordering, already held by the view route |

### B1 · what the stream is keyed by — #4 × R9

The entry route's id is the pending entry's, and **there is no entry**: B03 §2 says a push
leaves the transcript untouched, and §13a took that in the strong sense.

**Ruled: `DOCUMENT_VIEW_ID`.** It is the id `refresh` already uses for the view host
(`{ kind: "view", id: DOCUMENT_VIEW_ID }`, `runIntoView`'s canceller), so the three
registries — `liveStreams`, `refresh`, the overlay — agree without a fourth name. And C15 I1
guarantees it is unique while it exists: one view at a time means one view stream at a time.

### B2 · the patch has nowhere to go — #5 × R7 × R6 **(the seam)**

`transcript.patch` takes a `ViewPatch` and the view has **`putBlock(id, block)`**, which
replaces an existing block by id and returns `false` for one it does not hold. A stream's
first patch is an `append`, so every `/logs` patch would be refused.

**Ruled: `DocumentView.patch(view: ViewPatch)`, applying through C04's `applyPatch`.** Not a
second patch model — `applyPatch` is pure (R6) and is the same function C13 calls at
`store.ts:139`, so the view and the transcript cannot disagree about what a patch means.
This is I46's *"no second height codepath"* argument pointed at patching, and it is the same
argument: a view that re-implemented `append` would be a second answer to a settled
question.

`putBlock` stays, because the refresh driver holds it and it is a different contract — a
driver replacing a live part's rendering knows the id exists. **The two are not merged**:
`putBlock` is total and returns `false`; `patch` reports C13's three-armed outcome, because
R10's arms are what `streamInto` branches on.

### B3 · a view cannot settle — #8 × R8 **(the row with no equivalent)**

`transcript.settle(id)` marks an entry final. **A view has no such state**, and adding one
would be inventing a lifecycle for something whose lifecycle is *the reader presses Esc*.

The temptation is to pop the view when the stream ends. **Ruled: it must not.** `docker logs`
without `-f` ends immediately, and a view that popped on `end` would flash and vanish before
anything could be read — the reader asked to see the logs, and the stream ending is not the
reader having finished with them. B03 §2 already says the pop is the reader's.

**Ruled: `end` appends a terminal notice and leaves the view open.** *"the stream ended"*, in
the frame, above the prompt hint. The three settling arms (#8, #9, #10) all collapse to the
same shape: **append a notice, stop consuming, leave the view.** What differs is only what
the notice says.

**And this is where the walk nearly wrote a verb the layer does not have** — C23 §8a A4's
lesson, which cost a ruling once already. `refresh.settled(id)` *does* exist and is called,
because the stall machinery is per-host and a stream that ended is no longer expected to
produce; only `transcript.settle` has no counterpart, and only because there is no
transcript in this route.

### B4 · the first patch, and what it lands on — #14 × R5

`open()` pushes a **spinner** with id `document-view-waiting`. The entry route's first patch
lands on a pending entry whose document the adapter produced; here the first patch lands on
a document holding one block nobody wants.

**Ruled: the first patch replaces the waiting block rather than appending beside it.** Not a
special case in `streamInto` — `fill()` with an empty-blocks document is what clears it, and
the route calls `fill` once before the loop. So the view holds an empty document and the
stream's appends are ordinary.

**The alternative was to leave the spinner and append below it**, and it is wrong in a way
worth recording: R5 has no delete, so the spinner would still be on screen when the stream
ended, spinning under a notice saying it had stopped.

### B5 · `--tail` and what the reader sees first — R5

`docker logs -f` replays the whole log before following. A container running for a day is
tens of thousands of lines, and every one is a `ViewPatch` append into a document the view
re-measures on each.

**Ruled: `--tail 200` on the invocation**, and named in the surfaces doc rather than left as
a default nobody chose. This is not a framework limit — it is that *the whole log* and *what
is on screen* are different requests, and S9 asks for the second. The app decides, which is
the same shape as `/inspect`'s split floor.

---

## §3 The sequence trace

### A1 · `Esc` while the stream is following — R8 × #2

The reader pops the view and the subprocess is still producing. **Ruled: the pop cancels the
stream**, and the ordering matters: release the refresh host, cancel the subscription, then
pop — or a patch resolves into a layer that has gone. `runIntoView`'s canceller already does
the first and third; the second is new and is `forgetStream` plus the abort.

**This is C22 §13a's own last row arriving as code**: *"a pop while parts are in flight is
the one real hazard, and release must happen at the pop and not one tick later."* Written for
`b.live` parts, and it is the same hazard with a different producer.

### A2 · Ctrl-C while the stream is following — R9 **(the rung nothing has exercised)**

C16 §5's ladder cancels the **newest live subscription**, counted from `liveStreams`. A view
stream registered at #2 is that subscription, so the rung fires with no change — *if* the
registration happens.

**Ruled: registered before the loop is awaited**, exactly as R2 says, and the reason is
sharper here than for an entry: the view route's loop is the only thing on screen, so a
missing registration means Ctrl-C falls through to the next rung and **quits the shell**
instead of stopping the follow. The entry route's equivalent failure loses a cancellation;
this one loses the session.

**The rung's own question, asked because nothing has run it:** does cancelling the newest
subscription leave the view open? **Ruled: no — a cancelled view pops**, which is §13a's
existing ruling for the non-streaming route and must not differ here. Ctrl-C is the reader
saying *stop this*, and stopping the stream while leaving its window open would answer half.

### A3 · the container stops while following — B3

`docker logs -f` exits when the container does. So this is `end` arriving without the reader
asking, and B3's ruling covers it: a notice, and the view stays. **The notice must not claim
the stream ended normally**, because the reader will want to know whether the container died
— but the exit code is not available on a `RawPatch` `end`, so the honest wording names what
is known: *the log stream ended*, not *the container stopped*.

Recorded because the first draft said "the container stopped", which is a fact this route
does not have.

### A4 · a patch arrives after the pop — A1 × R7

The abort is cooperative: `transport.stream` is an async iterable and a patch may already be
in flight when `pop()` runs. **Ruled: `documentView.patch` returns `false` when nothing is
open**, and the loop treats `false` as *stop consuming* — the same shape as the driver's
`false → release(host)`.

A throw here would be the worse answer for C13's `settle(id, doc)` reason: it would abandon
the loop mid-iteration with the subscription still registered.

### A5 · a second command while the view stream runs — R1 × R8

The guard is released (#1), so the prompt accepts input — which is the point of I6. But C15
I1 forbids a second view.

**Ruled: nothing new.** `open()` already returns a refusal string naming the command, and
C23 reports it. Checked rather than assumed, because "the guard is released" and "a view is
open" are two rules that look like they conflict and do not: the guard is about *submission*,
the view is about *the screen*, and a non-view verb submitted during a follow is a
transcript entry the reader cannot currently see. That is B03 §2's cost, already named.

### A6 · the stream fails mid-follow — #10

Same as the entry route: a notice, and stop. The one difference is that the notice is
appended to a document the reader is looking at rather than to an entry scrolled up, so it
is the thing they see rather than a thing they find.

---

## §4 What this walk settled before any code

1. **The view gets `patch(view: ViewPatch)` through C04's `applyPatch`** (B2) — the same
   function C13 calls, so there is no second patch model.
2. **A view cannot settle, and must not pop on `end`** (B3) — the three settling arms all
   become *append a notice and leave the view*, because the stream ending is not the reader
   having finished.
3. **`refresh.settled` still fires** (B3) — only `transcript.settle` has no counterpart, and
   the walk nearly ruled a verb the layer does not have for the second time.
4. **The stream is keyed by `DOCUMENT_VIEW_ID`** (B1) — the name `refresh` already uses, so
   three registries agree without a fourth.
5. **`fill` with an empty document precedes the loop** (B4), because there is no delete and
   the spinner would otherwise outlive the stream that replaced it.
6. **A missing `liveStreams` registration loses the session, not a cancellation** (A2) — the
   entry route's same omission is one severity lower.
7. **A cancelled view pops; a finished one does not** (A2, B3), and the asymmetry is the
   ruling: Ctrl-C is the reader saying stop, and `end` is the far side saying it.
8. **`--tail 200`** (B5) — the whole log and what is on screen are different requests.
