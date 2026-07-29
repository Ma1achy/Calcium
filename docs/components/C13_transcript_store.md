# C13 — Transcript store

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
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

interface TranscriptStore {
  append(doc: ViewDocument, opts?: { streaming?: boolean }): EntryId;
  patch(id: EntryId, patch: ViewPatch): void;
  settle(id: EntryId): void;          // stream ended; entry stops accepting patches
  clear(): void;
  subscribe(cb: (change: Change) => void): Disposable;

  readonly entries:       readonly TranscriptEntry[];
  readonly liveId:        EntryId | null;
  readonly blockCount:    number;
  readonly droppedBlocks: number;
  readonly overCap:       number;     // blocks above the cap that could not be evicted
}

type Change =
  | Readonly<{ kind: "append";  id: EntryId }>
  | Readonly<{ kind: "patch";   id: EntryId }>
  | Readonly<{ kind: "settle";  id: EntryId }>
  | Readonly<{ kind: "evict";   ids: readonly EntryId[] }>
  | Readonly<{ kind: "clear" }>;
```

`seq` is a logical counter, **not a timestamp**. C13 reads no clock — the same discipline as C08 — so golden frames and fixture-backed sessions are reproducible.

`subscribe` reports *what* changed, not just *that* something did. C14 caches measured heights per entry, and an `append` needs only the new entry measured while an `evict` needs the anchor rechecked. A bare "something changed" callback would force a full remeasure on every log line.

---

## 4. Appending and freezing

```
append(doc):
  1  validate the document (C04)         → invalid is rejected, not stored
  2  freeze the current live entry, if any
  3  create the new entry, live = true
  4  enforce the cap (§5)
  5  notify subscribers
```

Freezing is implicit in appending. There is no public `freeze` — an entry becomes frozen because a newer one arrived, never for any other reason, which is what makes "the last block is live" true by construction rather than by discipline.

`clear()` empties the store, resets `droppedBlocks`, and clears the live id. Command history is C20's and is untouched (A01 §slash commands).

---

## 5. Caps and eviction

The session cap is **100,000 blocks** (D40); per-document capping is C07's.

```
while blockCount > cap:
  evict the oldest entry that is neither live nor streaming
  if no such entry exists: stop
```

Three rules make this safe:

**The live entry is never evicted.** Evicting what the user is looking at is never the right answer.

**Streaming entries are never evicted.** A long-running `--watch` scrolled far up is still receiving patches; dropping it would strand the stream with nowhere to write. If the cap cannot be met without evicting one, the cap is exceeded and the overshoot is reported rather than forcing the eviction.

### 5a. Raw payload retention

Off by default. When `debug.retainPayloads` is set (C22 §2), C13 retains the raw payload an adapter was given, for the **last N entries only**, evicting oldest first.

This is what answers the question a rendered block cannot: *did the far side return something unexpected, or did the adapter mishandle it?* `/debug` shows it (C23 §2).

**Retention is capped at N rather than covering every entry, and the reason is not squeamishness about memory.** Retaining every payload roughly doubles memory per entry against the 100,000-block cap, and a debug mode that makes a long session unusable is a debug mode nobody turns on — which means it is not available at the moment it is needed. Fifty covers any real debugging session, because the entry you are inspecting is almost always one you just ran.

Payload eviction is **independent of the block cap**: it runs on its own N-entry window, so retention never evicts an entry and the cap never evicts a payload early. Two eviction policies sharing one counter would make each one's behaviour depend on the other's.

**Eviction is reported, never silent.** `droppedBlocks` accumulates, and C13 maintains a **synthetic marker entry** at the head of the transcript carrying a single `notice` block naming the count. It is a real entry — frozen, settled, never itself evicted — so `totalRows` and every visibility query account for it with no special case downstream. A session that quietly loses its beginning is worse than one that says so.

**Cap overshoot is reported too.** When the cap cannot be met because every candidate is live or streaming, `overCap` holds the excess block count. L4 surfaces it; C13 does not decide what to do about it.

Ids are never reused after eviction, so a stale reference resolves to nothing rather than to the wrong entry.

---

## 6. Patching

```
patch(id, p):
  entry unknown            → no-op
  entry not streaming      → rejected, logged
  otherwise                → r = applyPatch(doc, p)
                             r.ok  → doc = r.doc; notify
                             !r.ok → doc unchanged; report r.error to the caller
```

Patching a settled entry is rejected rather than ignored, because it means a stream outlived its `settle` — a bug in the caller worth surfacing rather than absorbing.

`applyPatch` is C04's, pure, and **fallible in its type** (C04 §4, I15). It returns a `PatchResult`, so the four ways a patch can fail to fit a document — an I3-violating status transition, a `merge` against a non-table, an unknown or a duplicate `blockId` — arrive as values rather than as throws. C13 keeps the previous document on failure and hands the error up; C23 §5 is what decides the entry's fate. No `try` around the patch path, which matters because that path runs on every stream tick.

Row-level `merge` preserves untouched rows by reference, which is what stops a `--watch` tick from collapsing an expanded row or moving the viewport (C04 I9). It also never removes a row — deletion goes through `replace` (C04 §4), so a tick that returns fewer rows leaves the transcript showing what it last knew rather than silently shedding entries.

---

## 7. State machine

Per entry, over the two orthogonal flags.

| From ↓ / call → | `append` (a newer one) | `patch` | `settle` |
|---|---|---|---|
| **live + streaming** | → frozen + streaming (T1.4) | applies (T1.7) | → live + settled (T1.9) |
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
- **I8** — Patching a settled or unknown entry never mutates the store.
- **I9** — C13 reads no clock; `seq` is a logical counter.
- **I10** — Documents are validated on append; an invalid one is rejected, not stored.
- **I11** — `entries` is immutable; every mutation produces new values.
- **I12** — `Change` names what changed, so consumers can update incrementally.
- **I13** — `rev` increments on every applied patch and never decreases. It is the staleness signal for C14's height cache; without it a cached height survives a patch that changed it.
- **I14** — The eviction marker is a real entry, never a downstream special case, and is itself never evicted.
- **I15** — Overshoot is exposed as `overCap`; C13 does not act on it.
- **I16** — C13 imports nothing from `terminal/` or `presentation/`.

---

## 9. Commitments

1. Every command appends an entry; the newest is live and the rest are frozen.
2. Frozen means not focusable; it does not mean not updating.
3. A streaming entry keeps receiving patches after it freezes.
4. Freezing is implicit in appending; there is no public freeze.
5. Ids are monotonic and never reused.
6. The session cap is 100,000 blocks, evicting oldest-first.
7. The live entry and any streaming entry are never evicted; the cap yields instead.
8. Eviction is counted and surfaced, never silent.
9. Patching a settled or unknown entry is a no-op that is logged, not absorbed.
10. `clear()` empties the transcript and leaves command history alone.
11. `seq` is logical; C13 reads no clock.
12. `Change` is granular so consumers avoid full remeasure.
13. Every entry carries a monotonic `rev`, bumped on each applied patch, so downstream caches can detect staleness.
14. The eviction marker is a synthetic entry, so row arithmetic needs no special case.
15. Cap overshoot is exposed as `overCap` and acted on by L4.

---

## 10. Tests

Six tiers. Every cell of the §7 transition table is covered.

### Tier 1 — unit

- **T1.1**: `append` on an empty store → one entry, live, `liveId` set.
- **T1.2** (I3): two appends → ids differ, `seq` increments, order preserved.
- **T1.3**: appending over a live+settled entry → the previous becomes frozen+settled.
- **T1.4** (I4): appending over a live+streaming entry → previous becomes frozen and **stays streaming**.
- **T1.5** (I1): after ten appends, exactly one entry is live and it is the last.
- **T1.6** (I10): an invalid document → rejected, store unchanged, error returned.
- **T1.7**: `patch` on live+streaming → document updated, `rev` incremented, `patch` change emitted.
- **T1.7b** (I14): a rejected patch does **not** bump `rev`; a cache keyed on it stays valid.
- **T1.8** (I4): `patch` on frozen+streaming → applied. The watch-keeps-running case.
- **T1.9**: `settle` on live+streaming → live, no longer streaming.
- **T1.10**: `settle` on frozen+streaming → frozen, settled.
- **T1.11**: `clear` → empty, `liveId` null, `droppedBlocks` zero.
- **T1.12** (I12): each operation emits exactly one `Change` of the right kind.

### Tier 2 — contract / interface

- **T2.1** (I11): `entries` is frozen; mutation attempts do not change the store.
- **T2.2** (I9): a source scan finds no `Date`, `performance` or `process.hrtime` in `transcript/`.
- **T2.3** (I3): across a thousand appends and evictions, no id repeats.
- **T2.4** (I13): the module graph shows no import from `terminal/` or `presentation/`.
- **T2.5** (I12): `subscribe` returns a disposable; disposing stops delivery mid-stream.
- **T2.6**: every `Change` variant is emitted by at least one operation — exhaustive over the union.

### Tier 3 — edge cases

- **T3.1**: `patch` with an unknown id → no-op, store unchanged, no throw.
- **T3.2**: `settle` with an unknown id → no-op.
- **T3.3**: `patch` on the store's only entry while it is live+streaming → applies.
- **T3.4**: `append` while a stream is mid-flight → the stream's next patch still lands on the now-frozen entry.
- **T3.5** (I8): `patch` on a settled entry → rejected and logged; document untouched.
- **T3.6**: `settle` twice → second is a no-op.
- **T3.7** (I5): cap reached with the live entry oldest → live is not evicted; the next oldest goes.
- **T3.8** (I6): cap reached with every non-live entry streaming → nothing is evicted, the cap is exceeded, and the overshoot is reported.
- **T3.9** (I7): eviction of three entries totalling 400 blocks → `droppedBlocks` increases by exactly 400.
- **T3.9b** (I14): after any eviction, a marker entry exists at the head, is frozen and settled, and names the count. A second eviction updates it rather than adding another.
- **T3.9c** (I14): the marker entry is never itself evicted, even at the cap.
- **T3.8b** (I15): with every candidate streaming, `overCap` equals the excess and `droppedBlocks` is unchanged.
- **T3.10**: a single document larger than the whole session cap → stored, cap exceeded, reported. Never silently truncated by C13, which is C07's job.
- **T3.11**: `clear` while an entry is streaming → the entry is removed; subsequent patches to it are no-ops rather than resurrecting it.
- **T3.12**: an id referencing an evicted entry → resolves to nothing, never to a different entry.
- **T3.13**: 100,000 appends → memory bounded, and the operation stays within budget.
- **T3.14**: a `merge` patch that touches no existing row → treated as an upsert, and untouched rows keep reference identity (C04 I9).
- **T3.15**: `subscribe` callback that throws → other subscribers still receive the change; the store is unaffected.

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
- **T6.11** (I14): failing to bump `rev` on patch → C14's cache serves a stale height and the viewport drifts.

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
