# C13 — Transcript store

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L2 viewport |
| **Depends on** | C04 (`ViewDocument`, `ViewPatch`, `applyPatch`, `validateDocument`) |
| **Consumed by** | C14 viewport · C16 (focus targets) · L4 execution pipeline |
| **Source** | A01 D3, D5, D6, D40 · A02 §2, §4 |
| **Status** | Draft |

---

## 1. Purpose

C13 is the session's record. Every command appends a document; the newest is live and navigable; everything above it is a frozen record that scrolls (D3).

It holds the ordered list, owns the live/frozen distinction, applies patches from streaming verbs, and enforces the session block cap. It does not decide what is *visible* — that is C14 — and it does not render.

The distinction it exists to get right is subtle enough to be worth stating twice: **frozen means not focusable. It does not mean not updating.**

---

## 2. Live, frozen, streaming

Two orthogonal flags, not one axis. Conflating them is the mistake this section prevents.

| | Meaning |
|---|---|
| `live` | This entry is the newest. It is focusable, its actions can fire, arrow keys navigate it (D3, D6) |
| `streaming` | This entry's verb has not finished. It still accepts patches |

A `--watch` started and then followed by another command becomes **frozen but still streaming**: it keeps updating in the scrollback, and it is no longer where the arrow keys go. Killing the stream on freeze would mean losing a watch every time the user typed anything, which defeats the point of a subscription (A01 D4).

This refines D5 rather than contradicting it. A frozen *settled* entry holds genuinely stale data, and firing `↑ promote` from it is the footgun D5 forbids. A frozen *streaming* entry holds fresh data but is still not focusable — because focus follows the prompt, and there is exactly one live entry at a time.

---

## 3. Public interface

```typescript
type EntryId = string;                // monotonic, opaque, never reused

type TranscriptEntry = Readonly<{
  id:        EntryId;
  doc:       ViewDocument;
  live:      boolean;
  streaming: boolean;
  seq:       number;                  // logical order, not wall clock
  rev:       number;                  // bumped on every patch — C14's cache key
}>;

/**
 * What a *reader* of the transcript gets. C14 and C16 take this, never the store.
 */
interface TranscriptView {
  subscribe(cb: (change: Change) => void): Disposable;
  readonly entries:    readonly TranscriptEntry[];
  readonly liveId:     EntryId | null;
  readonly blockCount: number;
  readonly overCap:    number;
}

interface TranscriptStore extends TranscriptView {
  append(doc: ViewDocument, opts?: { streaming?: boolean; payload?: unknown }): EntryId;
  patch(id: EntryId, patch: ViewPatch): PatchOutcome;
  patch(id: EntryId, p: ViewPatch, origin?: "farSide" | "shell"): PatchOutcome;
  settle(id: EntryId, doc?: ViewDocument): PatchOutcome;   // the entry is done; the doc, if there is a final one
  clear(): void;

  readonly droppedBlocks: number;
  payloadOf(id: EntryId): unknown;    // §5a; retention is off by default
}

type PatchOutcome =
  | Readonly<{ ok: true;  rev: number }>
  | Readonly<{ ok: false; reason: "unknown" | "settled" }>
  | Readonly<{ ok: false; reason: "patch"; error: ErrorLike }>;

type Change =
  | Readonly<{ kind: "append";  id: EntryId }>
  | Readonly<{ kind: "patch";   id: EntryId }>
  | Readonly<{ kind: "settle";  id: EntryId }>
  | Readonly<{ kind: "evict";   ids: readonly EntryId[] }>
  | Readonly<{ kind: "clear" }>;
```

`seq` is a logical counter, **not a timestamp**. C13 reads no clock — the same discipline as C08 — so golden frames and fixture-backed sessions are reproducible.

`subscribe` reports *what* changed, not just *that* something did. C14 caches measured heights per entry, and an `append` needs only the new entry measured while an `evict` needs the anchor rechecked. A bare "something changed" callback would force a full remeasure on every log line.

**`TranscriptView` is the surface every reader gets, and the store is what L4 holds.** C14's spec already declares it depends on "entries, `Change`, `rev`" and C16's on "the live entry"; splitting the interface is what makes those declarations structural rather than aspirational. Two things follow, and the second is the one that matters more.

The retained raw payload (§5a) is reachable only through `payloadOf` on the store. `TranscriptEntry` carries no payload field, so the retention window is already invisible to anything reading `entries` — but a reader handed the whole store could call it, and a debug-only buffer arriving in the viewport is a seam nobody specified. And a reader handed the whole store could call `append`, `patch` or `clear`, which is worse: C14 recomputing an anchor by clearing the transcript is the kind of fix that works, ships, and is discovered from a bug report about a lost session.

**`append` throws and `patch` returns, and the asymmetry is deliberate: the two failures are not the same kind.**

An invalid document reaching `append` is a defect in the caller. C23 built it, C07's `finish()` validated it, C04's constructors froze it — three layers had to fail for it to arrive, and there is no recovery a caller could sensibly perform. C23 §5 already names `transcript.append` the one stage whose failure loses the outcome, and handles it there. A `Result` would invite a caller to handle what they cannot, so an invalid document raises `TranscriptError` carrying `validateDocument`'s messages.

A failed patch is ordinary and expected: a stream outliving its entry, a late patch arriving after `settle`, an adapter emitting something that does not fit the document. C23 §5 already has behaviour for it, so a value is the shape that behaviour needs. `PatchOutcome` distinguishes the three ways it can fail, because "unknown id" is a stale reference and "settled" is a caller bug and "patch" is a data problem, and only the third carries an `ErrorLike` to put in a notice.

**`PatchOutcome` carries `rev` on success** so C14 can invalidate its height cache from the return value rather than re-reading `entries` to find the entry it just patched.

`patch` returning a value is also what keeps C13 free of a logger. Commitment 9 says a rejected patch is "logged, not absorbed" — the *reporting* is C13's and the *logging* is the caller's, which is §5's principle applied to the patch path: C13 decides what is wrong, never what to do about it.

---

## 4. Appending and freezing

```
append(doc):
  1  validate the document (C04)         → invalid raises TranscriptError, nothing is stored
  2  freeze the current live entry, if any
  3  create the new entry, live = true
  4  enforce the cap (§5)
  5  notify subscribers
```

Freezing is implicit in appending. There is no public `freeze` — an entry becomes frozen because a newer one arrived, never for any other reason, which is what makes "the last block is live" true by construction rather than by discipline.

`clear()` empties the store and resets `droppedBlocks`, `overCap` and the live id. Command history is C20's and is untouched (A01 §slash commands).

---

## 5. Caps and eviction

The session cap is **100,000 blocks** (D40); per-document capping is C07's.

**What counts as a block.** Rows do not (I17). Nested blocks do: the count recurses through `panel.children`, `group.children` and a table row's `detail`, because D40 caps what is *retained* and a `group` of five hundred children costing one makes the cap unenforceable.

**A table's rows are not blocks, but a row's `detail` is a `Block[]`** (C04 §table, C11 I2) — and since D38 makes every row expandable when a column drops, `detail` is the common case rather than the exotic one. So the walk is not shallow, and a 2,000-row table is a real tree rather than a leaf.

That is a statement about cost, not about correctness, and the cost is paid once: **each entry's block count is computed at `append` and stored on the entry**, with the store's total maintained as a running sum. Eviction subtracts a stored number. A patch recounts one entry — the same entry C14 must remeasure anyway on the `rev` bump, and counting is strictly cheaper than measuring, so the recount is dominated by work already being done on that path. Nothing walks the whole transcript, and there is no cache here to invalidate.

### The sweep

```
sweep():
  update the eviction marker, if any entries have ever been dropped
  while blockCount > cap:
    evict the oldest entry that is neither live, nor streaming, nor the marker
    if no such entry exists: stop
  overCap = max(0, blockCount − cap)
```

**It runs after `append`, `patch` and `settle`** — not after `append` alone. Each of the three can change the numbers the sweep governs: `append` adds an entry, an `op: "append"` patch adds a block to an existing one, and `settle` turns an unevictable entry into an evictable one.

`settle` is the one that would hurt most if it were left out, and it fails in the direction that matters. After a stream settles, the true overshoot is *lower* than the last reported figure, so L4 would surface "over cap by 4,000 blocks" describing a condition that no longer holds — worse than not reporting at all, given I15 exists so L4 can act on the number.

The marker is updated *before* the final count, because it carries a `notice` block of its own. Adding it afterwards would leave a store that had just evicted down to exactly the cap sitting one block above it until the next command.

Three rules make eviction safe:

**The live entry is never evicted.** Evicting what the user is looking at is never the right answer.

**Streaming entries are never evicted.** A long-running `--watch` scrolled far up is still receiving patches; dropping it would strand the stream with nowhere to write. If the cap cannot be met without evicting one, the cap is exceeded and the overshoot is reported rather than forcing the eviction.

### `settle` carries the final document, because settling *is* the replacement

`settle(id, doc?)` — and the optional argument is the whole of C23's step 6.

**On the app route steps 6 and 7 are not two things.** The adapted document arrives, the entry becomes it, and the entry is done. On the streaming route they genuinely separate: patches arrive during, and `settle` ends it with whatever accumulated. One signature covers both, and it covers all three endings the pipeline produces — a result, an error document from a failed spawn, and a stream's `end` with nothing new to say.

**Two shapes were considered and both are worse.** A fourth `ViewPatch` op is not a patch: `applyPatch(doc, { op: "document", doc })` returns its own argument, so the function has nothing to apply, and this project has just spent a session on `diff` versus `patch` naming for that exact reason. A separate `replace(id, doc)` lands **outside** the `rev` and `PatchOutcome` discipline and needs its own invalidation story — which means a second path into C14's cache, and C14's cache is one slot per entry keyed on `(entryId, rev, width)`. A second way in is a second way to get invalidation wrong.

`settle` keeps the discipline whole: same return type, the same rejections, and `rev` moving exactly when the document changed, so C14 invalidates from the returned value as it already does for a patch.

| Call | Outcome |
|---|---|
| unknown or evicted id | `{ ok: false, reason: "unknown" }`, store unchanged |
| already settled | `{ ok: false, reason: "settled" }`, store unchanged |
| `settle(id)` | `{ ok: true, rev }` — `rev` unchanged, nothing about the document did |
| `settle(id, doc)` | `{ ok: true, rev }` — `rev` incremented (I13) |
| `settle(id, invalidDoc)` | **throws**, exactly as `append` does and for its reason (§3): C23 built it, C07 validated it and C04 froze it, so three layers failed for it to arrive and there is no recovery a caller could perform |

**Eviction is reported, never silent.** `droppedBlocks` accumulates, and C13 maintains a **synthetic marker entry** at the head of the transcript carrying a single `notice` block naming the count. It is a real entry — frozen, settled, never itself evicted — so `totalRows` and every visibility query account for it with no special case downstream. A session that quietly loses its beginning is worse than one that says so.

**Cap overshoot is reported too.** When the cap cannot be met because every candidate is live or streaming, `overCap` holds the excess block count. L4 surfaces it; C13 does not decide what to do about it.

Ids are never reused after eviction, so a stale reference resolves to nothing rather than to the wrong entry.

### 5a. Raw payload retention

Off by default. When `debug.retainPayloads` is set (C22 §2), C13 retains the raw payload an adapter was given, for the **last N entries only**, evicting oldest first.

This is what answers the question a rendered block cannot: *did the far side return something unexpected, or did the adapter mishandle it?* `/debug` shows it (C23 §2).

**Retention is capped at N rather than covering every entry, and the reason is not squeamishness about memory.** Retaining every payload roughly doubles memory per entry against the 100,000-block cap, and a debug mode that makes a long session unusable is a debug mode nobody turns on — which means it is not available at the moment it is needed. Fifty covers any real debugging session, because the entry you are inspecting is almost always one you just ran.

Payload eviction is **independent of the block cap**: it runs on its own N-entry window, so retention never evicts an entry and the cap never evicts a payload early. Two eviction policies sharing one counter would make each one's behaviour depend on the other's.

The payload arrives as `append`'s `opts.payload` and is discarded unread when retention is off, so a caller need not know whether it is enabled.

---

## 6. Patching

**A settled entry accepts nothing further from the far side.** That is the claim the gate was always making, and stating it as *settled entries reject patches* was the accident: it gated the shell on whether the far side was still talking.

The reason the original is right, kept: a settled entry means the stream ended, so a further patch **from the far side** means the transport lied or a stale stream leaked. That is a real defect and rejecting it surfaces one (I8).

The shell is a different writer with a different claim. C23 telling a reader something about an entry — a refusal, an expansion — has nothing to do with whether the far side is still speaking, and gating it on that inverted the rule exactly: an app verb's result settles the moment it lands, so the entries a reader acts on are the ones the shell could not speak about, while a live `--watch` accepted everything.

```typescript
patch(id: EntryId, p: ViewPatch, origin?: "farSide" | "shell"): PatchOutcome
```

Defaulting to `"farSide"`, which is the conservative direction: an unmarked patch is gated, so the mistake a caller can make is a rejection rather than a leak.

**Three tries, and the first two were per-operation.** `settle(id, doc)` covered a result; `op: "expand"` covered view state; a refusal broke both, because a refusal notice *is* data. The distinction was never data-versus-view-state — it is **who is writing**, and that had been read off the operation because there was only ever one caller to ask.

**The forgery argument does not apply, and that is what makes this different from glyphs and from a `viewState` flag.** Adapters never call `patch`: C07 returns documents and C23 applies them. There is exactly one caller and it knows which case it is in, so `origin` describes what C23 is doing rather than asserting something about bytes the far side supplied.

**`op: "expand"` stays** and stops being the exception. It names a real operation readably at the call site; it is now an instance of a shell-origin patch rather than a carve-out in the gate.

**This is not `meta.origin`.** That is `user | action | agent | refresh` on a *document*, recording who initiated a command (C04 I13, C23 §Setting origin). This records which side of the boundary a *patch* came from. Similar word, different axis, and they are never derived from one another.

```
patch(id, p, origin = "farSide"):
  entry unknown            → { ok: false, reason: "unknown" }, store unchanged
  entry not streaming
    and origin "farSide"   → { ok: false, reason: "settled" }, store unchanged
    and origin "shell"     → applied; the shell may always speak about an entry it holds
  otherwise                → r = applyPatch(doc, p)
                             r.ok  → doc = r.doc; rev++; sweep; notify
                                     → { ok: true, rev }
                             !r.ok → doc unchanged; rev unchanged; no notify
                                     → { ok: false, reason: "patch", error: r.error }
```

Patching a settled entry is rejected rather than ignored, because it means a stream outlived its `settle` — a bug in the caller worth surfacing rather than absorbing. C13 surfaces it in the return value and does nothing else with it; C23 §5 decides what that means.

**`rev` bumps only on an applied patch.** A rejected one leaves it untouched, or C14 invalidates a height that is still correct on every malformed tick a `--watch` produces.

`applyPatch` is C04's, pure, and **fallible in its type** (C04 §4, I15). It returns a `PatchResult`, so the four ways a patch can fail to fit a document — an I3-violating status transition, a `merge` against a non-table, an unknown or a duplicate `blockId` — arrive as values rather than as throws. C13 keeps the previous document on failure and hands the error up; C23 §5 is what decides the entry's fate. No `try` around the patch path, which matters because that path runs on every stream tick.

Row-level `merge` preserves untouched rows by reference, which is what stops a `--watch` tick from collapsing an expanded row or moving the viewport (C04 I9). It also never removes a row — deletion goes through `replace` (C04 §4), so a tick that returns fewer rows leaves the transcript showing what it last knew rather than silently shedding entries.

---

## 7. State machine

Per entry, over the two orthogonal flags.

| From ↓ / call → | `append` (a newer one) | `patch` | `settle` |
|---|---|---|---|
| **live + streaming** | → frozen + streaming (T1.4) | applies (T1.7) | → live + settled, `rev` moves iff a doc is given (T1.9) |
| **live + settled** | → frozen + settled (T1.3) | rejected (T3.5) | no-op (T3.6) |
| **frozen + streaming** | — already frozen | applies (T1.8) | → frozen + settled (T1.10) |
| **frozen + settled** | — | rejected (T3.5) | no-op (T3.6) |

Store-level: at most one entry is `live` at any moment, and it is always the last.

---

## 8. Invariants

- **I1** — At most one entry is `live`, and it is always the last in order.
- **I2** — An entry becomes frozen only because a newer one was appended.
- **I3** — `EntryId`s are monotonic and never reused, including after eviction.
- **I4** — Freezing does not stop streaming.
- **I5** — The live entry is never evicted.
- **I6** — Streaming entries are never evicted; the cap is exceeded rather than violating this.
- **I7** — Eviction increments `droppedBlocks`; loss is never silent.
- **I8** — Patching a settled or unknown entry never mutates the store, and the rejection is returned as a `PatchOutcome` rather than logged here. C13 reports; the caller logs.
- **I9** — C13 reads no clock; `seq` is a logical counter.
- **I10** — Documents are validated on append; an invalid one raises `TranscriptError` and is not stored. It is a caller defect, not a recoverable condition: C23 built the document, C07 validated it and C04 froze it, so three layers failed for it to arrive, and C23 §5 already owns the containment.
- **I11** — `entries` is immutable; every mutation produces new values.
- **I12** — `Change` names what changed, so consumers can update incrementally.
- **I13** — `rev` increments on every applied patch **and on a `settle` that carries a document**, and never decreases. It is the staleness signal for C14's height cache; without it a cached height survives a change. A bare `settle` moves nothing, because nothing about the document changed — and moving it there would invalidate a height that is still correct on every stream that ends.
- **I14** — The eviction marker is a real entry, never a downstream special case, and is itself never evicted.
- **I15** — Overshoot is exposed as `overCap`; C13 does not act on it. Stated as a post-condition, because a figure that is only true after one of the four methods is a figure L4 cannot act on: **after any public call, either `blockCount ≤ cap`, or `overCap = blockCount − cap` exactly and every entry above the cap is live, streaming or the marker.** The sweep therefore runs after `append`, `patch` and `settle`, and `clear()` returns `overCap` to zero with everything else.
- **I16** — `clear()` empties the transcript and leaves command history untouched. They are separate stores with separate lifetimes: a reader clearing the screen has not asked to forget what they typed, and the two being one call away from each other is exactly why the boundary is stated.
- **I17** — The session cap is 100,000 blocks and eviction is oldest-first. The number is D40's and it is a cap on *blocks*, not entries — an entry holding nine thousand rows and one holding three cost what they cost. The count recurses through nested blocks (`panel.children`, `group.children`, a row's `detail`) and never through rows.
- **I18** — C13 imports nothing from `terminal/` or `presentation/`.
- **I19** — Readers take `TranscriptView`, never `TranscriptStore`. The mutators and the §5a payload window are reachable only from L4, so no consumer above can append, clear, or see a debug buffer it was never given.

---

## 9. Commitments

1. Every command appends an entry; the newest is live and the rest are frozen (I1).
2. Frozen means not focusable; it does not mean not updating (I4).
3. A streaming entry keeps receiving patches after it freezes (I4).
4. Freezing is implicit in appending; there is no public freeze (I2).
5. Ids are monotonic and never reused (I3).
6. The session cap is 100,000 blocks, evicting oldest-first (I17).
7. The live entry and any streaming entry are never evicted; the cap yields instead (I5, I6).
8. Eviction is counted and surfaced, never silent (I7).
9. Patching a settled or unknown entry is a no-op that is reported to the caller, not absorbed (I8).
10. `clear()` empties the transcript, resets `droppedBlocks` and `overCap`, and leaves command history alone (I15, I16).
11. `seq` is logical; C13 reads no clock (I9).
12. `Change` is granular so consumers avoid full remeasure (I12).
13. Every entry carries a monotonic `rev`, bumped on each applied patch, so downstream caches can detect staleness (I13).
14. The eviction marker is a synthetic entry, so row arithmetic needs no special case (I14).
15. Cap overshoot is exposed as `overCap` and acted on by L4, and it is true after every call rather than only after `append` (I15).
16. An invalid document raises rather than returning; a failed patch returns rather than raising (I8, I10).
17. Readers get `TranscriptView`; only L4 holds the store, so nothing above can mutate the transcript or read a retained payload (I19).

---

## 10. Tests

Six tiers. Every cell of the §7 transition table is covered.

### Tier 1 — unit

- **T1.1**: `append` on an empty store → one entry, live, `liveId` set.
- **T1.2** (I3): two appends → ids differ, `seq` increments, order preserved.
- **T1.3**: appending over a live+settled entry → the previous becomes frozen+settled.
- **T1.4** (I4): appending over a live+streaming entry → previous becomes frozen and **stays streaming**.
- **T1.5** (I1): after ten appends, exactly one entry is live and it is the last.
- **T1.6** (I10): an invalid document → `TranscriptError` raised, store unchanged.
- **T1.7**: `patch` on live+streaming → document updated, `rev` incremented, `patch` change emitted, `{ok: true, rev}` returned.
- **T1.7b** (I13): a rejected patch does **not** bump `rev`; a cache keyed on it stays valid.
- **T1.7c** (I8): the three `PatchOutcome` shapes — `unknown`, `settled`, `patch` — each arise from their own cause, and only `patch` carries an `ErrorLike`.
- **T1.8** (I4): `patch` on frozen+streaming → applied. The watch-keeps-running case.
- **T1.9**: `settle` on live+streaming → live, no longer streaming.
- **T1.10**: `settle` on frozen+streaming → frozen, settled.
- **T1.11**: `clear` → empty, `liveId` null, `droppedBlocks` zero.
- **T1.12** (I12): each operation emits exactly one `Change` of the right kind.
- **T1.13** (I4): all four `(live, streaming)` states are constructed and asserted by name in one test. The transitions are covered by T1.3, T1.4, T1.8–T1.10; this asserts the *states*, because a suite covering three of four reads exactly like one covering four, and frozen+streaming is the one that goes missing.

### Tier 2 — contract / interface

- **T2.1** (I11): `entries` is frozen; mutation attempts do not change the store.
- **T2.2** (I9): a source scan finds no `Date`, `performance` or `process.hrtime` in `transcript/`.
- **T2.3** (I3): across a thousand appends and evictions, no id repeats.
- **T2.4** (I18): the module graph shows no import from `terminal/` or `presentation/`.
- **T2.5** (I12): `subscribe` returns a disposable; disposing stops delivery mid-stream.
- **T2.6**: every `Change` variant is emitted by at least one operation — exhaustive over the union.
- **T2.7** (I19): `TranscriptView` exposes no mutator and no `payloadOf`. A compile-level assertion, so a consumer widening its parameter type back to `TranscriptStore` fails the build rather than a test.

### Tier 3 — edge cases

- **T3.1**: `patch` with an unknown id → no-op, store unchanged, no throw.
- **T3.2**: `settle` with an unknown id → no-op.
- **T3.3**: `patch` on the store's only entry while it is live+streaming → applies.
- **T3.4**: `append` while a stream is mid-flight → the stream's next patch still lands on the now-frozen entry.
- **T3.5** (I8): `patch` on a settled entry → `{ok: false, reason: "settled"}` returned; document untouched.
- **T3.6**: `settle` twice → second is a no-op.
- **T3.7** (I5): the sweep reaches the live entry as the last remaining candidate → it is skipped, the sweep stops, and the excess is reported. *Not "the live entry is oldest": I1 makes the live entry the last, so it can only be oldest when it is the only entry, and then there is no next oldest to take instead. The constructible case is the sweep walking forward until nothing but the live entry is left.*
- **T3.7b** (I15): `settle` on the entry that was blocking the sweep → the sweep runs on the `settle`, the entry is evicted, and `overCap` drops without waiting for another `append`.
- **T3.7c** (I15): an `op: "append"` patch that carries the store over the cap → the sweep runs on the `patch`, not on the next command.
- **T3.8** (I6): cap reached with every non-live entry streaming → nothing is evicted, the cap is exceeded, and the overshoot is reported.
- **T3.9** (I7): eviction of three entries totalling 400 blocks → `droppedBlocks` increases by exactly 400.
- **T3.9b** (I14): after any eviction, a marker entry exists at the head, is frozen and settled, and names the count. A second eviction updates it rather than adding another.
- **T3.9c** (I14): the marker entry is never itself evicted, even at the cap.
- **T3.8b** (I15): with every candidate streaming, `overCap` equals the excess and `droppedBlocks` is unchanged.
- **T3.10**: a single document larger than the whole session cap → stored, cap exceeded, reported. Never silently truncated by C13, which is C07's job.
- **T3.11**: `clear` while an entry is streaming → the entry is removed; subsequent patches to it return `{ok: false, reason: "unknown"}` rather than resurrecting it.
- **T3.11b** (I15): `clear` while over the cap → `overCap` and `droppedBlocks` both return to zero, and the marker goes with them.
- **T3.12**: an id referencing an evicted entry → resolves to nothing, never to a different entry.
- **T3.13**: 100,000 appends → memory bounded, and the operation stays within budget.
- **T3.14**: a `merge` patch that touches no existing row → treated as an upsert, and untouched rows keep reference identity (C04 I9).
- **T3.15**: `subscribe` callback that throws → other subscribers still receive the change; the store is unaffected.
- **T3.16** (I17): a `group` of five hundred children counts five hundred and one, and a 2,000-row table whose every row carries a two-block `detail` counts 4,001. Rows never count; nested blocks always do.
- **T3.17** (I15, the post-condition): a randomised sequence of `append`, `patch`, `settle` and `clear` against a small cap → after **every** call, `blockCount ≤ cap` or `overCap = blockCount − cap` exactly, and every entry above the cap is live, streaming or the marker.
- **T3.18** (the sequence): one walk — append, patch, append, patch the now-frozen entry, evict, settle, clear — asserting `entries`, `liveId`, `blockCount`, `droppedBlocks`, `overCap` and the emitted `Change` after **every** step. Every invariant here constrains one operation and none constrains the history, and C13 renders nothing, so there is no frame to read: this is the substitute for the reading that found five defects in C25 and three in C12.
- **T3.19** (§5a): with `retainPayloads: 3`, six appends → the last three payloads are retained and the first three are gone, while `blockCount`, `droppedBlocks` and `overCap` are identical to the same sequence with retention off. Two eviction policies, one counter each.

### Tier 4 — integration

- **T4.1** (with C04): a hundred patches applied in sequence leave a document that passes `validateDocument`.
- **T4.2** (with C06, C07): a real streamed verb's `RawPatch` sequence, adapted and applied, produces the same document as adapting the whole output at once (C07 T4.5, from this side).
- **T4.3** (with C14): `append` emits a change granular enough for C14 to measure one entry rather than remeasuring the transcript.
- **T4.4** (with C14): eviction shifts no visible content — the anchor is an id, so the viewport does not jump when the top is trimmed.
- **T4.5** (with C14, C11): a `merge` patch on an expanded table leaves the row expanded and the scroll position unmoved.
- **T4.6** (with C16): only the live entry appears in the focusable set; frozen entries never do, streaming or not.
- **T4.7** (with L4): `/clear` empties the transcript and leaves C20's history intact.

### Tier 5 — e2e

- **T5.1**: a session of 500 commands → transcript scrolls correctly, ids stay unique, no leak.
- **T5.2**: a `--watch` started, then ten more commands run → the watch keeps updating in the scrollback while focus stays on the newest block. The defining behaviour of §2.
- **T5.3**: a session exceeding the block cap → the oldest entries are trimmed, the marker names the count, and scrolling remains smooth.
- **T5.4**: two concurrent streams plus interactive commands for five minutes → both keep updating, memory flat, no cross-talk.

### Tier 6 — fail-on-revert

- **T6.1** (I4): stopping a stream on freeze → T1.8 and T5.2 fail, and a watch dies whenever the user types.
- **T6.2** (I1): allowing two live entries → T1.5 fails, and focus becomes ambiguous.
- **T6.3** (I2): adding a public `freeze` → the invariant that the last block is live stops holding by construction.
- **T6.4** (I5): evicting the live entry under pressure → T3.7 fails.
- **T6.5** (I6): evicting a streaming entry → T3.8 fails and the stream writes into nothing.
- **T6.6** (I7): silent eviction → T3.9 fails.
- **T6.7** (I3): reusing ids after eviction → T2.3 and T3.12 fail.
- **T6.8** (I9): using a timestamp for `seq` → T2.2 fails and golden frames flake.
- **T6.9** (I12): collapsing `Change` to a bare notification → T4.3 fails, and every log line triggers a full remeasure.
- **T6.10** (I8): absorbing a patch to a settled entry → T3.5 fails, hiding a caller bug.
- **T6.11** (I13): failing to bump `rev` on patch → C14's cache serves a stale height and the viewport drifts.
- **T6.12** (I15): sweeping only on `append` → T3.7b fails, and after a stream settles L4 warns about an overshoot that no longer exists.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| What is visible, scroll position, virtualisation | C14 |
| Measuring heights | C09, cached by C14 |
| Which entry has focus, arrow keys | C16 |
| Per-document block caps and truncation | C07 |
| Rendering the eviction marker | C14 |
| Command history | C20 |
| Overlays | C15 |
