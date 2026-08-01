# C23 — Execution pipeline

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L4 shell |
| **Depends on** | C18 · C05 · C06 · C07 · C13 · C03 · C21 · C22 (session) · C10 C14 C15 C17 C20 (local handlers) |
| **Consumed by** | C16 (submit) · C22 (constructs it) |
| **Source** | A02 §4, §5, Seam 4 · A01 D3, D7, D8 |
| **Status** | Draft. The contract. **B02 does not exist** — it was dropped during the drift B01 §1 records, and this line cited it until C23 |

---

## 1. Purpose

C23 turns a submitted line into a transcript entry. It is where the seven-stage path in A02 §5 actually runs, and where the orchestration sequences A02 Seam 4 lists are sequenced.

Its discipline is narrow and absolute: **every submission produces exactly one outcome, and no stage failure escapes.** A parse error, an adapter throw, a spawn failure and a successful verb all end the same way — a document appended to the transcript and one frame committed. There is no path where the user submits something and nothing visible happens.

---

## 2. Routes

C18 classifies; C23 routes. Seven kinds, seven paths.

| `ParseResult` | Path |
|---|---|
| `empty` | Nothing. No entry, no commit |
| `error` | Render the `ErrorLike` as a document, append |
| `builtin` | Apply to session state, append a notice |
| `builtinThenShell` | Apply, **then** delegate the remainder (C18 §4 rule 2b) |
| `local` | Run an in-process handler, append its document |
| `app` | Transport → adapt → append (§3) |
| `shell` | `spawnShell` → `raw` document (C18 §5) |

### Composition inserts no spacing of its own

**A document's vertical rhythm is declared by its blocks** — `gapBefore` (C04
§3a) — and C23 adds nothing between them, before them or after them.

The alternative is what this rules out: a composition root that put a blank row
between top-level blocks would make a document's height depend on where it was
rendered, so the height C14 virtualises against and the height the frame draws
would be computed by different code with no reason to agree. It would also be
invisible to `measure`, which is the one place the system checks anything about
height at all.

The rule has teeth in one direction only: C23 may not *add* rhythm. An adapter
that produces a document with no gaps gets a dense one, and that is the adapter's
choice to make — `b.*` supplies the defaults (C24 §4) so that choice is rarely
made by accident.

`empty` producing no entry is deliberate: pressing Enter on a blank prompt in a shell does nothing, and appending an empty block would fill the transcript with them.

### Local handlers

```typescript
type LocalHandler = (argv: readonly string[], ctx: LocalContext) =>
  ViewDocument | Promise<ViewDocument>;

interface LocalRegistry {
  register(verb: string, handler: LocalHandler): void;
  seal(): void;
}
```

`tui-kit` ships handlers for the concerns it owns — `/help` renders from the manifest (C16 §6, so documentation cannot drift), `/clear` empties C13, `/theme` switches C10, `/history` reads C20, `/debug` reads an entry's invocation record, `/exit` calls `C22.stop`. An app registers its own alongside them.

A local handler is the only place a component above L0 may reach several stores at once, and it does so through C23 rather than laterally.

#### `/debug` — inspecting what actually ran

```
/debug        the previous entry's invocation
/debug <n>    n entries back
```

Renders a `keyValue` of `argv`, `transport`, `origin`, `exitCode`, `durationMs` and `adapter`, plus `stderr` as a `raw` block when non-empty, plus the retained raw payload as a `code` block when `--debug` is on (C13 §retention). It appends as an ordinary entry, so it scrolls and is itself inspectable.

**It is a local command and not an action, and that is the whole design.** An action originating from a frozen entry is refused (I18), and inspecting an *older* entry is the entire point — an inspect action would be refused on every entry worth inspecting. Reading an entry's `meta` is not firing an action: nothing re-runs, nothing reaches the far side, and the stale-data footgun I18 exists to prevent does not arise. D5 is untouched.

This is also what distinguishes `/debug` from `{ } json`, which several surfaces offer. `{ } json` **re-runs** the command with `--json` — honest, and what the command says, but on a `--watch` or a changing cluster it returns different data than the block it was opened from. `/debug` describes the entry in front of you.

---

## 3. The app path

```
1  validate                    C05 — already done by C18; the result is carried, not recomputed
2  refuse if busy              C06 — surface the refusal, do not queue
3  append a pending entry      C13 — the user sees the command immediately
4  invoke or stream            C06
5  adapt                       C07
6  patch or replace the entry  C13
7  settle                      C13
8  commit                      C03
```

### The submission guard

**C23 owns the submission guard and it covers every foreground route** — `app`, `shell`, `local` and `builtinThenShell`. A `sleep 30` delegated to the shell is a foreground command, and no shell lets you type another one over it.

C06's concurrency check (C06 §6) is a **backstop** for direct transport misuse, not the authoritative guard. Two guards with different scopes would be a defect; one authoritative and one defensive is the ordinary arrangement.

Streaming subscriptions are exempt (C06 §6, I6): a `--watch` is a subscription, and holding the prompt for it would make live views unusable.

The guard is checked **before the pending entry is appended**, so a refused submission leaves no orphan entry.

**Step 3 before step 4** is what makes a slow verb feel responsive. The command appears in the transcript with a running indicator before the subprocess has started; without it, three hundred milliseconds of interpreter startup look like a dropped keystroke.

**Validation is not recomputed.** C18 already ran it (C18 I6) and the result travels on the `ParseResult`. Running it twice would let the two disagree.

### Streaming

For `streams: true` tools, step 4 yields `RawPatch`es. Each is adapted (C07 §6) and applied to the entry, which stays `streaming` until `end`.

Commits follow C03's classes: patches commit `"stream"` and coalesce at 33 ms; `end` commits `"completion"` and flushes immediately. A thousand log lines a second produce roughly thirty frames, and the final state is never lost behind a pending one.

The entry may be **frozen while still streaming** (C13 §2) — a `--watch` followed by another command keeps updating in the scrollback. C23 keeps patching a frozen entry; only `settle` ends that.

### `$_`

After an `app` or `local` result, C23 sets `session.lastUuid` from `document.meta.resultId` — the adapter's **declaration** of what identifier the command produced (C04). A verb that declares none leaves the previous value untouched, so `/promote $_` after a `/ps` listing still refers to the submit before it.

Guessing which field of an arbitrary envelope is "the" identifier is not knowable generically, which is why it is declared rather than inferred.

---

## 3a. Action dispatch

C09's `RenderContext.onAction` is supplied by C23. Nothing else may supply it — an action is a submission by another route, and routing submissions is what this component does.

| Action | Effect |
|---|---|
| `fill` | `editor.setText(command)`, cursor at end, one undo unit, then `commit("input")` and a fill-flash tick |
| `exec` | Submitted through §2 exactly as if typed — same guard, same routes, same entry |
| `open` | Handed to the injected `openUrl` (C22 §2); never spawned through a shell |
| `expand` | A `replace` patch toggling the row's `expanded` flag (C04 §3) |

`fill` populating the prompt rather than running is A01 D8's default, and it is why `production cancel <uuid>` is readable before it happens. Only filter pills use `exec`, because a filter is reversible.

**`open` never goes through a shell.** A URL arriving from a far-side envelope is untrusted data, and `spawnShell("open " + url)` would be an injection through the one path that otherwise has none (D18). The opener takes a parsed URL and rejects any scheme outside `http` and `https`.

An action from a **frozen** entry is refused (A01 D5, C13 §2): frozen entries hold stale data and firing `↑ promote` from one is the footgun that rule exists to prevent. Actions from a frozen-but-streaming entry are refused for the same reason — it is not focusable, so an action on it can only have arrived by mistake.

---

### Setting `origin`

C23 is the only component that appends documents, so it is the only one that can set provenance. It sets `meta.origin` on **every** document it appends, with no default and no path that omits it (C04 I13):

| Value | Set when |
|---|---|
| `user` | A typed submission from the prompt |
| `action` | An `exec` action dispatched from a block (§3a) |
| `refresh` | A time-driven tick — stall notice or part refresh (§3b) |
| `agent` | Reserved. Nothing produces it in v1 |

`origin` is not a debugging field. It is what makes a transcript legible once more than one thing is putting entries into it, and a provenance field that can be absent is one nobody trusts.

---

## 3b. Time-driven updates

Adapters are pure and read no clock (C07 I1); C15's layout is pure (C15 I5). **Anything periodic is therefore C23's, using C22's injected clock.**

Two cases, one mechanism.

**Stall detection.** A streaming entry that has received no patch for **120 s** gets a synthetic notice patch — `no output for 2m` in muted tone — replaced on the next real patch and removed if output resumes. It is not an error: a build pulling a large base layer is silent for minutes, and the honest reading of a motionless block is usually "working". Saying how long it has been quiet is better than implying a fault or saying nothing.

**Part refresh.** A **transcript entry or a pushed view** may declare intervals — `b.live` (C24 §5) is the consumer-facing form, and both are driven by the same code here. An earlier split had C22's identity loop refreshing banner sections while C23 refreshed view panels; one mechanism replaces two, and C22's loop is now about identity alone.

```typescript
type ViewRefresh = readonly Readonly<{
  id:         string;              // which part of the view
  intervalMs: number;
  offsetMs:   number;              // stagger; see below
  fetch:      () => Promise<ViewPatch>;
}>[];
```

C23 drives each on the injected clock and applies the result as a patch to the layer. **Offsets are assigned so no two fire in the same tick** — synchronised refreshes produce a periodic load spike and a whole-screen flicker, and staggering costs nothing.

A refresh that throws is contained to its own declared part: the rest of the view is untouched, and backoff doubles from the interval to a 5-minute cap. Recovery resets it. This is A02 §7's one backoff rule, and C23 is its only implementation — no part rolls its own.

Both mechanisms stop when the entry settles or the view pops.

---

## 4. Orchestration

The sequences A02 Seam 4 lists, owned here rather than by the components that would otherwise reach for each other.

| Trigger | Sequence |
|---|---|
| Submit | `parse` → route → … → `transcript.append` → `router.resetFocus` → `scheduler.commit` |
| A TTY child | `lifecycle.suspend` → `runner.handoff` → `lifecycle.resume` → `scheduler.invalidate` |
| Pop a pushed view | `overlays.pop` → `commit`. **No append** — a trace would freeze the block the pop returns to and clear the selection A01 D7 preserves (C13 §4 step 2) |
| History recall | `history.previous` → `editor.setText` → `commit("input")` |
| Stall detected | inject notice patch → `commit("stream")` |
| View refresh tick | `fetch()` → patch the layer → `commit("stream")` |
| Theme switch | `theme.setVariant` → `scheduler.invalidate` |
| Completion menu | `engine.menuLayer()` → `overlays.push()`, then `overlays.update(id, …)` per keystroke — **never pop-and-repush** (C19, C15 §2) |
| History search | `history.searchLayer()` → `overlays.push()` → `update` per keystroke → `searchEnd(action)` → `editor.setText()` |
| Patch fullscreen | the block's action → `overlays.push()` a view (C25 §3b) |
| `cd` / `export` | apply to `session` → `commit` |

Every one of these crosses a layer boundary that the components deliberately do not cross themselves. Four were caught as attempted violations during specification; this table is where they resolved.

**`Scroll` is not here, and it was.** A02 Seam 4 assigns it to C22 with C14 I12 cited — C14 moves and C22 commits — and `src/shell/construct.ts` step 11 implements it there. A row listed in both places is a row with two owners, which is the condition the owner column was added to remove.

**The three overlay rows above were absent, and C23 I13 is what makes that a defect rather than an omission.** I13 and commitment 11 both say every cross-layer sequence lives in this table; while Seam 4 listed three C23-owned rows that this section did not, the invariant was false rather than merely incomplete. A02 §Seam-4 records why that kept happening and what mechanism closes it.

---

## 5. Containment

Every stage can fail, and none may kill the session (A02 §7).

| Failure | Outcome |
|---|---|
| Parse throws | Impossible by C18 I1; if it happens, an error document and a logged defect |
| Validation fails | Error document; nothing spawned |
| Transport fails or times out | Error document from C07's mapping |
| Adapter throws | C07 contains it; fallback rendering plus a muted notice |
| Patch application fails | `applyPatch` returns `{ok: false}` (C04 §4, I15) — it does not throw. The entry is settled with what it had; a notice records the truncation, carrying the returned `ErrorLike`'s message |
| A local handler throws | Error document naming the verb |
| `transcript.append` throws | The only stage whose failure loses the outcome. Logged as a defect, the frame still commits, and I1's second exception names it rather than leaving the invariant false |
| Commit throws | C03 contains it; contamination is flagged for the next frame |

**Cancellation is not a failure.** Ctrl-C routes through C16 to C06's ladder; whatever the child produced is retained and the document settles as `partial` (C07 §4). The transcript keeps forty log lines rather than discarding them because the user stopped watching.

---

## 6. State machine

Per submission.

| From ↓ / event → | `submit` | patch arrives | `end` / resolve | cancel |
|---|---|---|---|---|
| **idle** | → running (T1.1) | — | — | — |
| **running** | refused, notice (T1.6) | applied, entry streams (T1.8) | → idle, entry settles (T1.9) | → idle, `partial` (T1.10) |

`running` covers every foreground route from guard check to settle — `app`, `shell`, `local` and `builtinThenShell` alike. Streaming subscriptions are exempt and do not hold this machine: a `--watch` returns to `idle` once its entry is appended, and patching continues in the background.

---

## 7. Invariants

- **I1** — Every submission produces exactly one transcript entry, with two named exceptions: `empty` produces none, and a failure of `transcript.append` itself produces none and is logged as a defect. No other path may produce zero or two.
- **I2** — No stage failure escapes; every one produces a document. For patch application the mechanism is C04's `PatchResult` (C04 I15) rather than a caught throw: the failure is a value on the return path, so "settled with what it had" is something C23 *does* with a result, not something it recovers from.
- **I3** — The pending entry is appended before the transport is invoked.
- **I4** — Validation is carried from C18, never recomputed.
- **I5** — A second submission on any foreground route while one is in flight is refused with a notice, never queued. C23's guard is authoritative; C06's is a backstop.
- **I6** — Streaming subscriptions do not hold the submission guard.
- **I7** — `session.lastUuid` is set only from `meta.resultId`; a verb declaring none leaves it unchanged.
- **I8** — Patches commit `"stream"`; settlement commits `"completion"`.
- **I9** — A frozen entry keeps receiving patches until settled.
- **I10** — Cancellation settles as `partial` with output retained.
- **I11** — Built-ins apply to session state before any delegation.
- **I12** — A submission is refused once `session.stopping` is set, so nothing is appended after shutdown begins.
- **I13** — Every cross-layer effect in §4 is sequenced here; no component causes its own.
- **I14** — Local handlers are the only place several stores are reached at once, and only through C23.
- **I15** — The displayed command and the spawned argv correspond exactly (D24).
- **I16** — C23 is the sole supplier of `onAction`.
- **I17** — `open` actions go through the injected opener with an `http`/`https` scheme check, never through a shell.
- **I18** — Actions originating from a frozen entry are refused.
- **I19** — Stall detection and part refresh are C23's, on C22's injected clock. No adapter, view, layer or entry reads a clock.
- **I20** — Refresh offsets are assigned so no two declared parts fire in the same tick.
- **I21** — A failing refresh is contained to its declared part, backs off to a 5-minute cap, and resets on success.
- **I22** — Every appended document carries `meta.origin`. No path omits it, and no default supplies it silently.
- **I23** — `/debug` never re-runs anything. It reads an entry's `meta` and appends a document; it reaches no transport.
- **I24** — C23 inserts no vertical spacing of its own — not between top-level blocks, not before them, not after them. Rhythm is declared by `gapBefore` (C04 I25) and applied by the sequence (C09 I17). The rule has teeth in one direction only: C23 may not *add* rhythm.
- **I25** — A stream producing nothing for 120 s appends a muted stall notice, and never an error. A quiet stream is the normal state of a `--watch` on an idle cluster; reporting it as a failure trains the reader to ignore the one time it is one. The notice clears on the next patch and the subscription is untouched.
- **I26** — `/help` is rendered from the manifest and C16's keymap, never from a maintained list. Every verb it names is one C05 will accept and every binding it shows is one C16 will dispatch, so help cannot drift from behaviour — the drift being what a hand-written help text guarantees eventually.

---

## 8. Commitments

1. Seven routes, one per `ParseResult` kind; `empty` produces no entry (I1).
2. The pending entry is appended before the subprocess starts (I3).
3. Validation travels from C18 and is never recomputed (I4).
4. The submission guard covers every foreground route and is checked before the pending entry is appended; streams are exempt (I5, I6).
5. `$_` comes from `meta.resultId` alone; nothing is inferred (I7).
6. Patches coalesce at `"stream"`; settlement flushes at `"completion"` (I8).
7. Frozen entries keep streaming until settled (I9).
8. Cancellation settles as `partial` and retains output (I10).
9. Every stage failure produces a document; none kills the session (I2).
10. Built-ins apply before delegation (I11).
11. All cross-layer sequences live in §4 (I13).
12. Local handlers ship for framework concerns; apps register their own (I14).
13. `/help` renders from the manifest and C16's keymap, so help cannot drift from behaviour (I26).
14. The displayed command equals the spawned command (I15).
15. Submissions are refused once C22 sets `session.stopping` (I12).
16. C23 supplies `onAction`; `exec` re-enters the normal submission path (I16).
17. `open` is scheme-checked and never shelled (I17).
18. Actions from frozen entries are refused (I18).
19. Anything periodic is C23's, on the injected clock; nothing below L4 reads time (I19).
20. A stream silent for 120 s gets a muted stall notice, never an error (I25).
21. View refreshes are staggered by offset and fail in isolation (I20, I21).
22. C23 sets `meta.origin` on every append; provenance is never absent (I22).
23. `/debug` is a local command, not an action, because an action cannot reach a frozen entry and inspecting an older entry is the point (I23).
24. `/debug` never re-runs; `{ } json` always does, and each surface says so (I23).
25. Composition inserts no spacing of its own, so a document's height is knowable from the document (I24, §2).

---

## 9. Tests

Six tiers. Every cell of the §6 table is covered.

### Tier 1 — unit

Fake transport, fake stores.

- **T1.1**: an `app` submission → running; a pending entry exists before the transport is called.
- **T1.2** (I1): each of the seven routes produces the documented outcome — seven cases.
- **T1.3** (I1): `empty` → no entry, no commit.
- **T1.4** (I3): a spy proves `transcript.append` precedes `transport.invoke`.
- **T1.5** (I4): a spy proves `validateInvocation` is not called during execution.
- **T1.6** (I5): a second `submit` while running → refused with a notice naming the running verb.
- **T1.7** (I6): a `--watch` submission returns to idle; a subsequent verb is not refused.
- **T1.8**: a patch arrives → applied, entry still streaming, `"stream"` commit issued.
- **T1.9**: `end` → entry settled, `"completion"` commit issued.
- **T1.10** (I10): cancel mid-stream → `partial`, prior output retained.
- **T1.11** (I7): a document with `meta.resultId` → `lastUuid` updated; without → unchanged.
- **T1.12** (I11): `builtinThenShell` → session `cwd` changes, then the remainder is delegated.
- **T1.13**: each shipped local handler returns a valid document — five cases.
- **T1.14** (I16): each `Action` kind produces its documented effect — four cases.
- **T1.15** (I17): an `open` with a `file://` or `javascript:` URL → refused; `https://` → passed to the opener.
- **T1.16** (I17): a spy proves no `Action` path reaches `spawnShell`.
- **T1.17** (I18): an action fired from a frozen entry → refused with a notice; from the live entry → executed.
- **T1.18**: an `exec` action → enters §2's guard and produces an ordinary entry, indistinguishable from typing it.

### Tier 2 — contract / interface

- **T2.1** (I2): a fault injected at each of the eight stages in §5 → a document is appended and the session survives, eight times.
- **T2.11** (I24): the composed height of an appended entry equals `measureSequence` over its blocks (C09 I17), for a document with gaps and one without. C23 contributing a single row of its own fails both.
- **T2.2** (I1): across a thousand random submissions, entry count equals submission count minus empties.
- **T2.3** (I13): a spy on every component proves no cross-layer effect originates outside C23.
- **T2.4** (I8): commit reasons match the documented class for every route.
- **T2.5** (I15): for a corpus of inputs, the entry's `command` and the spawned argv correspond under D24's one-token mapping.
- **T2.6**: every `ParseResult` variant has a route — exhaustive over the union.
- **T2.7** (I14): a source scan finds no multi-store access outside local handlers.

### Tier 3 — edge cases

- **T3.1**: submitting whitespace only → `empty`.
- **T3.2**: a verb that exits immediately → the pending entry is replaced, never orphaned.
- **T3.3**: a verb that produces no output and exits 0 → a notice, not a blank entry.
- **T3.4**: cancel before the subprocess starts → the pending entry settles as `partial` with a cancelled notice.
- **T3.5**: cancel between adapt and append → no half-written entry.
- **T3.6** (I9): a `--watch` frozen by a later command → patches still land; `settle` still ends it.
- **T3.7**: two concurrent streams plus an app verb → the verb is refused only if another *app verb* is running.
- **T3.8**: a stream that never settles → the entry stays `streaming` indefinitely; nothing leaks and the guard is not held.
- **T3.9**: an adapter throwing on the first patch of a stream → contained; subsequent patches still apply.
- **T3.10**: `/exit` submitted while a verb is running → children killed, history flushed, clean exit.
- **T3.11**: a local handler that never resolves → a timeout settles the entry with a notice.
- **T3.12**: a `shell` route whose child writes 100 MiB → C21's overflow marking surfaces as a truncation notice.
- **T3.13**: `builtinThenShell` where the built-in fails (`cd` to a missing directory) → the remainder is **not** delegated, and an error is appended.
- **T3.14**: an app verb declaring `resultId` on a `partial` document → `lastUuid` is still set; a cancelled submit that produced an id is usable.
- **T3.15** (I12): a submission after C22 sets `session.stopping` → refused; nothing is appended.
- **T3.16** (I5): `sleep 30` on the `shell` route → a second submission is refused, exactly as an app verb would be.
- **T3.17** (I5): a refused submission → no pending entry is created and none is orphaned.
- **T3.18**: an auth-envelope failure → the notice is appended **here**, and `session.retained` holds the failed command (C22 §7 from this side).

### Tier 4 — integration

- **T4.1** (with C18, C05, C06, C07, C13): a real fixture-backed submission end to end produces a valid document and one entry.
- **T4.2** (with C06, C07): a streamed verb's patches produce the same final document as adapting its whole output at once (C07 T4.5, from this side).
- **T4.3** (with C01, C21, C03): the handoff sequence runs in documented order and ends with an invalidate.
- **T4.4** (with C15, C13): popping a view appends **nothing** — the transcript's entry count and live id are unchanged across the pop, so the block beneath stays live and focusable (A01 D7). C15 writes nothing either.
- **T4.5** (with C10, C03): a `/theme` local handler switches the theme and C23 invalidates.
- **T4.6** (with C20, C17): `/history 4` re-runs entry 4 through the full pipeline.
- **T4.7** (with C16): Ctrl-C during a verb cancels; during a piped shell child forwards `SIGINT`.
- **T4.7b** (with C16, C13): a submission made while focus is in the live block calls `router.resetFocus` after `transcript.append` and before `commit` — asserted on the call order, since a reset issued before the append would be undone by nothing and a reset issued after the commit paints one frame with focus in a frozen block.
- **T4.8** (with C22): `cd` updates session state and the next spawn lands there.
- **T4.9** (with C14): appending while the viewport is detached does not move it (C14 I4, from this side).

### Tier 5 — e2e

- **T5.1**: a session of fifty mixed submissions — app, shell, built-in, local, error — every one produces exactly one visible outcome.
- **T5.2**: a slow verb → the command appears immediately with a running indicator, then completes.
- **T5.3**: `/ps --watch`, then five more commands → the watch keeps updating while focus stays on the newest block.
- **T5.4**: Ctrl-C during a real streaming verb → partial output retained, prompt returns, no orphan.
- **T5.5**: an app verb piped to `jq` → delegated whole, raw output rendered.
- **T5.6**: `cd` into a directory, run a verb, `cd -`, run it again → each lands in the right place.

### Tier 6 — fail-on-revert

- **T6.1** (I3): invoking the transport before appending → T1.4 fails, and slow verbs look like dropped keystrokes.
- **T6.14** (I24): inserting a blank row between top-level blocks → T2.11 fails. Without it the change is invisible: the height C14 virtualises against and the height the frame draws are computed by different code, and nothing compares them.
- **T6.2** (I4): recomputing validation → T1.5 fails, and two answers can disagree.
- **T6.3** (I5): queueing a second verb → T1.6 fails, and `$_` becomes ambiguous.
- **T6.13** (I5): scoping the guard to app verbs only → T3.16 fails, and the prompt accepts submissions over a running `sleep`.
- **T6.15** (I12): ignoring `session.stopping` → T3.15 fails, and an entry lands after the transcript is being torn down.
- **T6.4** (I6): holding the guard for streams → T1.7 fails, and one `--watch` blocks the session.
- **T6.5** (I7): inferring `$_` from an envelope field → T1.11 fails on any verb whose shape differs.
- **T6.6** (I2): letting an adapter throw escape → T2.1 fails and the session dies.
- **T6.7** (I9): stopping patches on freeze → T3.6 fails (C13 T6.1, from this side).
- **T6.8** (I10): discarding output on cancel → T1.10 fails.
- **T6.9** (I11): delegating before applying a built-in → T1.12 and T3.13 fail.
- **T6.10** (I13): letting a component issue its own cross-layer effect → T2.3 fails.
- **T6.11** (I1): appending twice for one submission → T2.2 fails.
- **T6.12** (I15): rewriting the command shown after submission → T2.5 fails, and history stops reproducing what ran.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Building the graph, session lifecycle, shutdown | C22 |
| The narrative of a command's journey | Nowhere — B02 was dropped, and §1 and §3 are the account |
| Classification and validation | C18, C05 |
| Spawning, signalling | C06, C21 |
| Adapting | C07 |
| Prism's local handlers | `prism-tui` |
| Concurrent app verbs | Phase 2 |
