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
type LocalHandler = (args: readonly string[], ctx: LocalContext) =>
  ViewDocument | Promise<ViewDocument>;
  // `args` is what follows the verb, not `ParseResult.argv`

interface LocalRegistry {
  register(verb: string, handler: LocalHandler): void;
  seal(): void;
}
```

`tui-kit` ships handlers for the concerns it owns — `/help` renders from the manifest (C16 §6, so documentation cannot drift), `/clear` empties C13, `/theme` switches C10, `/history` reads C20, `/debug` reads an entry's invocation record, `/exit` calls `C22.stop`. An app registers its own alongside them.

**The six are rows in every manifest (C05 §3), and that is what makes them reachable.** C18 classifies `local` from the manifest, so a handler for a verb the manifest does not declare is one nothing can ever route to — which is exactly what I27's reconciliation reports. Registering the handlers without the rows was tried and failed construction on all six, correctly.

**A handler receives the arguments, not the whole `argv`.** `ParseResult.argv` begins with the verb — `["theme", "light"]` — and a handler knows its own name, so handing it back means every handler indexes from 1 and the one that forgets reads its own verb as an argument. A multi-token verb like `debug dump` turns that off-by-one into an off-by-two, which is the version that survives review. Found by `/theme light` switching to nothing.

A local handler is the only place a component above L0 may reach several stores at once, and it does so through C23 rather than laterally.

**`seal()` reconciles the registry against the manifest, and fails construction on a mismatch** (I27, §8b B3). C18 classifies a verb as `local` from the **manifest**; the handler lives **here**. Two records of one fact with nothing comparing them is how a manifest verb reaches §2's "run an in-process handler" with nothing to run, and how a registered handler for no manifest verb sits unreachable while looking installed. `seal()` is the moment both sides are complete and input has not been accepted (C22 I3), which makes it the only place the check is both possible and cheap.

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
1  check validation            C05 — done by C18; the result is read, never recomputed (I4).
                              Not ok → the `error` route; nothing is spawned (§8b B2)
2  refuse if busy              C06 — surface the refusal, do not queue
3  append a pending entry      C13 — the user sees the command immediately
4  invoke or stream            C06
5  adapt                       C07
6  settle with the document    C13 — steps 6 and 7 are one call on this route
7  (streaming only) settle     C13 — with whatever accumulated
8  commit                      C03
```

**Steps 6 and 7 collapse on this route, and the step list says so rather than leaving two steps where one runs.** `settle(id, doc)` is the replacement: the adapted document arrives, the entry becomes it, and the entry is done (C13 §`settle`). They separate only for a stream, where patches arrive during and `settle` ends it with what accumulated. This matters beyond tidiness — §8a's trace is indexed against these steps, and a step nothing executes is a row that can never be walked.

### The submission guard

**C23 owns the submission guard and it covers every foreground route** — `app`, `shell`, `local` and `builtinThenShell`. A `sleep 30` delegated to the shell is a foreground command, and no shell lets you type another one over it.

C06's concurrency check (C06 §6) is a **backstop** for direct transport misuse, not the authoritative guard. Two guards with different scopes would be a defect; one authoritative and one defensive is the ordinary arrangement.

Streaming subscriptions are exempt (C06 §6, I6): a `--watch` is a subscription, and holding the prompt for it would make live views unusable.

The guard is checked **before the pending entry is appended**, so a refused submission leaves no orphan entry.

**Step 3 before step 4** is what makes a slow verb feel responsive. The command appears in the transcript with a running indicator before the subprocess has started; without it, three hundred milliseconds of interpreter startup look like a dropped keystroke.

**Validation is not recomputed.** C18 already ran it (C18 I6) and the result travels on the `ParseResult`. Running it twice would let the two disagree.

### Streaming

For `streams: true` tools, step 4 yields `RawPatch`es. Each is adapted (C07 §6) and applied to the entry, which stays `streaming` until `end`.

**C23 counts the patches, and the count is not decoration** (I30, C07 I15). `StreamContext.seq` is the patch's position within *this* invocation, from `0`, and it is the only thing the §3 interface carries about stream identity. C07 spends it twice — as the namespace for generated block ids, and as the per-stream reset, since one `PatchAdapter` outlives many streams. A constant here is therefore two defects at once and neither is visible from this file: the second patch of every stream collides with the first under C04 I14 and C13 refuses it, and C06 I12's sticky degradation is un-stuck before the remainder can be composed. The sentence above said *each is adapted* and named no counter, which is how a literal `0` sat in the one call site that supplies it.

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
| `expand` | An `op: "expand"` patch toggling the row's flag (C04 §4), at `"shell"` origin. The op names the operation readably; the origin is what gets it past a settled entry (C13 §6) |
| `view` | `target` resolved against the **source entry's own blocks**, then pushed as a C15 `kind: "view"` layer whose owner is C22. An unresolved target, or a stack that already holds a layer, is a refusal |

`fill` populating the prompt rather than running is A01 D8's default, and it is why `production cancel <uuid>` is readable before it happens. Only filter pills use `exec`, because a filter is reversible.

**`open` never goes through a shell.** A URL arriving from a far-side envelope is untrusted data, and `spawnShell("open " + url)` would be an injection through the one path that otherwise has none (D18). The opener takes a parsed URL and rejects any scheme outside `http` and `https`.

**A refusal patches a notice into the entry that was acted upon. It never appends.** This is C23 §4's pop row one section over, and the reasoning transfers whole: an append freezes the block the action came from, so a second action on it is refused as *frozen* rather than for its own reason, and the selection A01 D7 preserves is cleared. A refusal that changes the thing it declined to act on is worse than the refusal.

The mechanism differs from the pop's, because a pop has nothing to say and a refusal does: `patch(id, notice, "shell")` on the source entry. The `origin` argument is what makes it possible — a refusal notice *is* data, so gating on the operation refused it on every settled entry, which is most of the ones a reader acts on. C13 §6 records the three tries and why the distinction is **who is writing** rather than what is written. No append, no freeze, no selection loss, and the message appears where the reader was looking rather than at the bottom of a transcript they have scrolled away from.

#### `view` resolves its target, and refuses two things rather than one

**The target is resolved against the source entry's blocks and nowhere wider** (C04 I34). `expand` needed no resolution — it names a row on the entry it came from, which the dispatcher already holds — and `view` is the first kind whose `target` names something the dispatcher has to *find*. A free string an adapter supplies, resolved against the whole transcript, would let one entry's action fill the screen with another entry's data; resolved against nothing at all, a stale block id becomes a key that does nothing and reports nothing.

**The second refusal is the one the walk found, and it is a throw C15 already owns.** `OverlayManager.push` throws when a view is raised onto a non-empty stack — views do not nest (C15 I1) and there is no legitimate path to accommodate. That throw is correct where it lives and is reached from a *renderer's* callback here, so letting it escape would put an `OverlayError` inside a React event handler with no frame to report it in. The dispatcher checks the stack and refuses through §3a's notice path instead. This is the case a table indexed by accepted paths does not reach: neither rule is wrong, and the interaction is between a ruling that throws and a caller that cannot catch usefully.

Both refusals patch the source entry, exactly as every other refusal here does.

An action from a **frozen** entry is refused (A01 D5, C13 §2): frozen entries hold stale data and firing `↑ promote` from one is the footgun that rule exists to prevent. Actions from a frozen-but-streaming entry are refused for the same reason — it is not focusable, so an action on it can only have arrived by mistake.

---

### Setting `origin`

C23 is the only component that appends documents, so it is the only one that can set provenance. It sets `meta.origin` on **every** document it appends, with no default and no path that omits it (C04 I13):

| Value | Set when |
|---|---|
| `user` | A typed submission from the prompt |
| `action` | An `exec` action dispatched from a block (§3a) |
| `refresh` | An identity transition signalled by C22, appended here (§3b). **The only path that sets it** — the stall notice and a part refresh both *patch*, and a patch carries no `meta` |
| `agent` | Reserved. Nothing produces it in v1 |

`origin` is not a debugging field. It is what makes a transcript legible once more than one thing is putting entries into it, and a provenance field that can be absent is one nobody trusts.

---

## 3b. Time-driven updates

Adapters are pure and read no clock (C07 I1); C15's layout is pure (C15 I5). **Anything periodic is therefore C23's, using C22's injected clock.**

Three cases. **Two patch an existing host and one appends**, and that distinction
is what §3b was missing rather than a detail of it.

**Stall detection.** A streaming entry that has received no patch for **120 s** gets a synthetic notice patch — `no output for 2m` in muted tone — **replaced, on resumption, by a record of the gap**. The earlier wording said *replaced on the next real patch and removed if output resumes*, which is one event described twice and only the first half is expressible: `ViewPatch` has no delete, and it should not. **A transcript is a record.** C13 has exactly one path that removes anything — the cap — and it leaves a marker so the removal is visible (C13 §5). A patch that made a block vanish would leave a document whose earlier state cannot be reconstructed from its own history, and `rev` is a counter rather than a log, so nothing would say a block had ever been there. What resumption wants is not removal anyway: the notice said *this stream has gone quiet*, and then the stream spoke. That is a state change on a thing that still exists. **So the row is spent, and it says something true** — `resumed after 2m` rather than a blank. The entry did go quiet, and that is part of its record. A zero-height replacement is not available and should not be: C09's floor is one row for any block that is present, which is the constraint that makes measurement honest. It is not an error: a build pulling a large base layer is silent for minutes, and the honest reading of a motionless block is usually "working". Saying how long it has been quiet is better than implying a fault or saying nothing.

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

**Identity notice.** C22's identity loop (C22 §7) reaches a transition worth
saying out loud — a token inside one day of expiry, or one that has expired — and
**signals C23, which appends the notice.** C22 produces the fact; C23 sequences
the entry, which is every other Seam 4 row's shape and keeps C23 the only
component that appends (§1). The alternative reading, letting the identity loop
reach the transcript itself, makes C22 an appender and undoes the single-appender
rule for one notice: a large concession for a small case.

**This is the sole producer of `origin: "refresh"`** (§3a), and until it was
written that value had none. Both mechanisms above *patch* — the stall notice
patches its streaming entry, a part refresh patches its layer — and `meta.origin`
is a field on an appended document. So the origin table named two mechanisms
neither of which could set it: a value that reads as reserved and was
unreachable, which is A03 §2's vacuity class in a field rather than in a rule.

**It is the one case with no host to stop with.** The first two stop when the
entry settles or the view pops; an identity notice is a standalone entry that
scrolls like any other, and nothing ends it because nothing is holding it. That
asymmetry is the reason it is a third case and not a third instance of the
second.

The first two mechanisms stop when the entry settles or the view pops, and
**settlement replaces a stall notice that is present with a record of the gap**
(§8a A4). Stopping the mechanism does not retract the block it already injected,
so an entry that goes quiet and then settles would otherwise keep `no output for
2m` in its final document, where it is no longer true. The replacement is part of
settling because by then the mechanism has stopped and cannot do it.

**All three stop once `session.stopping` is set** (§8b B1). I12 refuses
*submissions*, and none of these is one — so without this line an identity notice,
a stall patch or a refresh tick lands in a transcript that is being torn down,
which is precisely what I12's own sentence promises does not happen.

---

## 4. Orchestration

The sequences A02 Seam 4 lists, owned here rather than by the components that would otherwise reach for each other.

| Trigger | Sequence |
|---|---|
| Command submit | `parse` → `editor.clear` → route → … → `transcript.append` → `router.resetFocus` → `scheduler.commit`, **then at settlement** `history.append(line, exitCode)` (I28, I29) |
| Child process needing a TTY | `lifecycle.suspend` → `runner.handoff` → `lifecycle.resume` → `scheduler.invalidate` |
| Pop a pushed view | `overlays.pop` → `commit`. **No append** — a trace would freeze the block the pop returns to and clear the selection A01 D7 preserves (C13 §4 step 2) |
| History recall | `history.previous` → `editor.setText` → `commit("input")` |
| Stall detected | inject notice patch → `commit("stream")` |
| View refresh tick | `fetch()` → patch the layer → `commit("stream")` |
| Theme switch | `theme.setVariant` → `scheduler.invalidate` |
| Completion menu | `engine.menuLayer()` → `overlays.push()`, then `overlays.update(id, …)` per keystroke — **never pop-and-repush** (C19, C15 §2) |
| History search | `history.searchLayer()` → `overlays.push()` → `update` per keystroke → `searchEnd(action)` → `editor.setText()` |
| Patch fullscreen | the block's action → `overlays.push()` a view (C25 §3b) |
| Identity notice | C22's identity loop signals → compose the notice → `transcript.append` with `origin: "refresh"` → `commit` |
| `cd` / `export` | apply to `session` → `commit` |

Every one of these crosses a layer boundary that the components deliberately do not cross themselves. Four were caught as attempted violations during specification; this table is where they resolved.

**The Trigger column uses A02 Seam 4's Effect names exactly**, and that is a
requirement rather than a courtesy. Two names for one row — "Submit" here and
"Command submit" there — is the drift SP4 exists to catch, and it makes the two
tables uncomparable by the only cheap means there is. Four of these rows had no
Seam 4 entry at all until SP4 was written: `Pop a pushed view`, `Stall detected`,
`View refresh tick` and `cd` / `export`, each a cross-layer effect this section
already declared and the architecture's table did not.

**The `Child process needing a TTY` row takes an explicit opt-in, and it is two mechanisms because the two routes have different knowledge.** C21 §5 builds `handoff` for children that need the terminal — `vim`, `less`, `kubectl exec` — and this table sequences it. **Nothing decides which commands take it.** The manifest has no field, C18's `ParseResult` carries no signal, and `shell` results are arbitrary text; so the row is specified, agreed by two components, and unreachable — the shape the default transport, `origin: "refresh"` and `settle(id, doc)` each had.

**App verbs: `interactive: true` on the `ToolDef`.** The app author knows `prism shell` drops into a REPL and nobody else can. Declarative, in the single source C18 already reads, and it costs one field on the verbs that need it.

**The `shell` route: `/tty <command>`, stripped by C18** (C18 §5a). The user is typing the command, so the user is the only party with the knowledge — and C05 cannot help here, which the check settles rather than assumes. C05 describes *tools*; §5 hands anything with a shell operator to `sh -c` **whole**, and a shell line has no flags C05 could describe, because `sh` is what parses it. The marker is read through the command policy, so a consumer using `prefixPolicy(":")` writes `:tty`.

**That places the shell half in C18 rather than here.** A marker left on the line would be passed to `sh` as an argument, so it has to be removed before delegation — and C18 already rewrites `/verb` tokens into `<binary> verb` before handing the line over (§5). Stripping a marker is the same operation on the same string, done by the component that already owns it. C23 reads the flag off the `ParseResult` and sequences the handoff; it never parses the line.

So two mechanisms, and honestly two: the routes differ in who knows.

**The list was the obvious answer and is disqualified.** A maintained set of TTY program names is exactly the shape I26 forbids, wrong for every wrapper and alias, and it fails **silently** — a program not on it gets a raw-mode terminal and no line editing, which C21 §5 names as the symptom with no obvious cause. Detection is not available either: whether a child wants a TTY is not knowable before running it.

**What makes the opt-in cost less than it looks is the asymmetry.** A user who forgets the marker gets a broken-looking `vim`, presses Ctrl-C and adds it — annoying and obvious. A user who gets an unexpected handoff loses nothing. There is no false-positive case at all, which is why an opt-in beats a heuristic here and would not elsewhere.

**Discoverability covers one of the two halves, and the sentence used to claim both.** `/help` renders from the manifest, so an `interactive` app verb is discoverable without being remembered — that half holds. The marker is not a manifest tool and cannot be (C18 §5a), so it is exactly as discoverable as `cd`, which is to say not from `/help` at all. Stated rather than left implied: the shell half is documentation and habit, and if that turns out to cost more than it looks, the remedy is a section in `/help` for the things C18 recognises structurally, not a field on a `ToolDef` that would have nowhere to live.

**And C05 refuses two combinations rather than C23 arbitrating them** (C05 I19). `interactive` with `streams` is a verb whose child owns the terminal and whose stdout is being read into the transcript at the same time; `interactive` with `local: true` is a handoff to a child that is never spawned. Neither has an arbitration that is not a guess, and refusing at parse puts the report in front of the author who wrote the manifest rather than the user watching a terminal misbehave.

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
| Patch application fails | C13's `patch` returns one of three `{ok: false}` arms and never throws (C04 §4, I15), so the response is per arm (§8a A2). `"patch"` — settle with what it had, a notice carrying the `ErrorLike`'s message, **and cancel the subscription** (§8a A3): the entry is final, so a child still streaming into it spends a process on output nothing can consume. `"settled"` and `"unknown"` — drop it, no notice. Both mean the entry is already in its final state, and a notice would describe the transcript rather than the command |
| A local handler throws | Error document naming the verb |
| `transcript.append` throws | The only stage whose failure loses the outcome. Logged as a defect, the frame still commits, and I1's second exception names it rather than leaving the invariant false. **The machine still returns to `idle`** (§8a A5) — I1's exception is about the entry, not a licence to keep the guard, and a stranded guard refuses every submission for the life of the session |
| Commit throws | C03 contains it; contamination is flagged for the next frame |

**Cancellation is not a failure.** Ctrl-C routes through C16 to C06's ladder; whatever the child produced is retained and the document settles as `partial` (C07 §4). The transcript keeps forty log lines rather than discarding them because the user stopped watching.

---

## 6. State machine

Per submission.

| From ↓ / event → | `submit` | patch arrives | `end` / resolve | cancel |
|---|---|---|---|---|
| **idle** | → running (T1.1) | — | — | — |
| **running** | refused, notice (T1.6) | applied, entry streams (T1.8) | → idle, entry settles (T1.9) | → idle, `partial` (T1.10) |

**Every exit from `running` returns to `idle`, including a stage failure** (§8a A5). The guard is released by whatever ends the submission, and there is no path that ends one without ending the other.

`running` covers every foreground route from guard check to settle — `app`, `shell`, `local` and `builtinThenShell` alike. Streaming subscriptions are exempt and do not hold this machine: a `--watch` returns to `idle` once its entry is appended, and patching continues in the background.

---

## 7. Invariants

- **I1** — Every submission produces exactly one transcript entry, with two named exceptions: `empty` produces none, and a failure of `transcript.append` itself produces none and is logged as a defect. No other path may produce zero or two.
- **I2** — No stage failure escapes; every one produces a document. For patch application the mechanism is C04's `PatchResult` (C04 I15) rather than a caught throw: the failure is a value on the return path, so "settled with what it had" is something C23 *does* with a result, not something it recovers from.
- **I3** — The pending entry is appended before the transport is invoked.
- **I4** — Validation is carried from C18, never recomputed.
- **I5** — A second submission on any foreground route while one is in flight is refused with a notice, never queued. C23's guard is authoritative; C06's is a backstop. **Refusal is whole-line and unconditional**: no part of a refused submission takes effect, including a `builtin` that needs nothing C23 is holding. Stated because the sympathetic reading — a `cd` is instantaneous, let it through — is what someone re-derives, and a refused line that silently moved the working directory is a lie about what the tool did, discoverable only when the *next* command runs somewhere unexpected (§8b B4).
- **I6** — Streaming subscriptions do not hold the submission guard.
- **I7** — `session.lastUuid` is set only from `meta.resultId`; a verb declaring none leaves it unchanged.
- **I8** — Patches commit `"stream"`; settlement commits `"completion"`.
- **I9** — A frozen entry keeps receiving patches until settled.
- **I10** — Cancellation settles as `partial` with output retained.
- **I11** — Built-ins apply to session state before any delegation.
- **I12** — A submission is refused once `session.stopping` is set, **and §3b's three mechanisms stop**, so nothing is appended or patched after shutdown begins. The second clause is not a widening: without it the rule covers submissions while its reason claims everything, and an identity notice or a stall patch lands in a transcript being torn down (§8b B1).
- **I13** — Every cross-layer effect in §4 is sequenced here; no component causes its own.
- **I14** — Local handlers are the only place several stores are reached at once, and only through C23.
- **I15** — The displayed command and the spawned argv correspond exactly (D24). **The displayed command is now displayed** — C22 I33 draws it above each entry — which is what makes this invariant constrain anything: it was written about a `doc.command` no render path read, so it forbade nothing while reading as though it forbade the drift it names. The two forms stay distinct on purpose: the transcript shows `/ps --search=… --open-mr` as typed, and `meta.argv` carries `widget ps --search=… --open-mr --json` for `/debug`. D24's one-token mapping is the correspondence between them. **One entry carries one displayed command, from the first patch to the settle** — the streaming route passed the raw typed line while step 5 passed the resolved argv, so the transcript changed what it said a command was mid-stream, with no event to explain it. `$_` is resolved in both, because the resolved form is what ran.
- **I16** — C23 is the sole supplier of `onAction`.
- **I17** — `open` actions go through the injected opener with an `http`/`https` scheme check, never through a shell.
- **I18** — Actions originating from a frozen entry are refused, and **the refusal patches the source entry rather than appending**. An append would freeze the block the action came from, refusing the next action for a different reason and clearing the selection A01 D7 preserves — C23 §4's pop row, one section over.
- **I19** — Stall detection, part refresh and the identity notice are C23's — the first two on C22's injected clock, the third on C22's signal. No adapter, view, layer or entry reads a clock, and no component but C23 appends.
- **I20** — Refresh offsets are assigned so no two declared parts fire in the same tick.
- **I21** — A failing refresh is contained to its declared part, backs off to a 5-minute cap, and resets on success.
- **I22** — Every appended document carries `meta.origin`. No path omits it, and no default supplies it silently.
- **I23** — `/debug` never re-runs anything. It reads an entry's `meta` and appends a document; it reaches no transport.
- **I24** — C23 inserts no vertical spacing of its own — not between top-level blocks, not before them, not after them. Rhythm is declared by `gapBefore` (C04 I25) and applied by the sequence (C09 I17). The rule has teeth in one direction only: C23 may not *add* rhythm.
- **I25** — A stream producing nothing for 120 s is **patched** with a muted stall notice, and never an error. A patch rather than an append, so it never becomes a second entry — and so it carries no `meta.origin`, which is why it is not I22's business. On resumption the notice is **replaced by a record of the gap, never removed**: `ViewPatch` has no delete and a transcript is a record (§3b). A quiet stream is the normal state of a `--watch` on an idle cluster; reporting it as a failure trains the reader to ignore the one time it is one. The notice clears on the next patch and the subscription is untouched.
- **I26** — `/help` is rendered from the manifest and C16's keymap, never from a maintained list. Every verb it names is one C05 will accept and every binding it shows is one C16 will dispatch, so help cannot drift from behaviour — the drift being what a hand-written help text guarantees eventually.
- **I27** — `seal()` reconciles the local registry against the manifest and fails construction on a mismatch in either direction: a manifest verb marked `local` with no handler, or a handler for no manifest verb. Two records of one fact and no comparison is what lets a `local` route arrive with nothing to run (§8b B3).
- **I28** — A submission clears the prompt, whatever becomes of it. The clear sits between the parse and the route, so a refusal, a parse error and a successful verb all leave the same empty prompt — bash's behaviour, and the only one that does not require the user to work out whether their line survived. Restoring it on refusal was the alternative and it is worse: the notice says what happened, and a line that sometimes stays is a prompt whose contents depend on a decision made after the keystroke.
- **I29** — Every submitted line is recorded in C20 **at settlement, with the code the entry settled with**, on every terminal path — app, local, shell, handoff, refusal and parse error. At settlement because `append(command, exitCode)` requires a code and settlement is the only moment one exists; recording at acceptance would satisfy the signature by inventing a value, which is what a required field exists to prevent. **A refusal is a submission**: the user typed it and pressed Enter, and `↑` must recall it — history is not a log of successes. Five call sites is five chances to miss one, so the test is derived from `ParseResult`'s arms rather than from a list.
- **I30** — C23 supplies `StreamContext.seq` as the patch's position within its invocation, counted from `0`. C07 I15 spends it as both the block-id namespace and the per-stream reset, so a constant value is an id collision *and* a reset that fires on every patch — two invariants in two other components, broken from one literal here.
- **I31** — A `view` action's `target` is resolved against the blocks of the entry it fired from, and a target that does not resolve there is refused rather than ignored. A view raised onto a non-empty layer stack is refused for the same reason and by the same path: C15 throws on it (C15 I1), and a throw crossing a renderer's callback has nowhere to be reported (→ C04 I34).

---

## 8. Commitments

1. Seven routes, one per `ParseResult` kind; `empty` produces no entry (I1).
2. The pending entry is appended before the subprocess starts (I3).
3. Validation travels from C18 and is never recomputed (I4).
4. The submission guard covers every foreground route, is checked before the pending entry is appended, and refuses whole lines unconditionally; streams are exempt (I5, I6).
5. `$_` comes from `meta.resultId` alone; nothing is inferred (I7).
6. Patches coalesce at `"stream"`; settlement flushes at `"completion"` (I8).
7. Frozen entries keep streaming until settled (I9).
8. Cancellation settles as `partial` and retains output (I10).
9. Every stage failure produces a document; none kills the session (I2).
10. Built-ins apply before delegation (I11).
11. All cross-layer sequences live in §4 (I13).
12. Local handlers ship for framework concerns; apps register their own (I14).
12a. A submission clears the prompt whatever becomes of it, and every submitted line is recorded in C20 at settlement with the code it settled with — refusals and parse errors included, because `↑` recalls what was typed rather than what succeeded (I28, I29).
13. `/help` renders from the manifest and C16's keymap, so help cannot drift from behaviour (I26).
14. The displayed command equals the spawned command (I15).
15. Submissions are refused once C22 sets `session.stopping` (I12).
16. C23 supplies `onAction`; `exec` re-enters the normal submission path (I16).
17. `open` is scheme-checked and never shelled (I17).
18. Actions from frozen entries are refused, by a patch to the source entry rather than an append (I18).
19. Anything periodic is C23's, on the injected clock, and so is the identity notice C22 signals; nothing below L4 reads time and nothing but C23 appends (I19).
20. A stream silent for 120 s gets a muted stall notice, never an error (I25).
21. View refreshes are staggered by offset and fail in isolation (I20, I21).
22. C23 sets `meta.origin` on every append; provenance is never absent (I22).
23. `/debug` is a local command, not an action, because an action cannot reach a frozen entry and inspecting an older entry is the point (I23).
24. `/debug` never re-runs; `{ } json` always does, and each surface says so (I23).
25. Composition inserts no spacing of its own, so a document's height is knowable from the document (I24, §2).
26. `seal()` reconciles the local registry against the manifest, both directions, and fails construction on a mismatch (I27).
27. C23 counts stream patches and supplies `seq`; C07 spends it as an id namespace and a reset, so a constant breaks both (I30, C07 I15).
28. A `view` action resolves its target within the source entry and refuses two things — an unresolvable target, and a view raised onto a non-empty stack — rather than ignoring the first or letting C15's throw cross a renderer's callback (I31).

---

## 8a. The sequence trace

The eight steps of §3 against one `--watch` that patches, fails and settles.
**Indexed by rule interaction, not by step** — a row governed by one rule
restates that rule and finds nothing. Every row below is a cell where two correct
statements overlap.

| # | Sequence | Rules meeting | Outcome |
|---|---|---|---|
| 1 | submit → guard → append → **Ctrl-C** → invoke | I3 × I5 × C16 rung 1 | **Defect A1.** Unreachable |
| 2 | patch → **`applyPatch` fails** → settle | I2 × C04 I15 × C13 I13 | `rev` unmoved — correct |
| 3 | patch → fails → settle → **stream yields again** | §5 × `PatchOutcome` arms | **Defect A2.** Reads `.error` off an arm without one |
| 4 | patch → fails → settle → **child still running** | I2 × I10 | **Defect A3.** Orphan |
| 5 | 120 s silent → stall patch → **settle** | I25 × §3b | **Defect A4.** A false notice, frozen in |
| 6 | guard → **`append` throws** | I1 exception 2 × §6 | **Defect A5.** Guard stranded |
| 7 | cancel → settle `partial` → **`end` arrives** | I10 × I8 | `settle` is a no-op on a settled id — correct |

### A1 — the cancellation window, and the ladder that cannot see it

**Ctrl-C between step 3 and step 4 does nothing, and the session is then stuck.**

I3 puts the pending entry in the transcript *before* the transport is invoked —
the immediate-feedback rule, and the whole reason a slow verb feels responsive.
That deliberately creates a window in which C23 holds its guard and no child
exists.

C16's rung 1 is *In-flight verb*, and its constructor is **`C06.busy`** (C16 §8a),
supplied as `runner.live.length > 0` (`src/shell/construct.ts`). During the window
that is false, so Ctrl-C falls past every rung to *prompt with text* or *prompt
empty* and clears the input. Meanwhile:

- the pending entry stays `streaming` forever;
- the guard stays held, so every later submission is refused (I5);
- nothing can release either, because release is `settle`'s job and only
  cancellation or the transport would call it.

**C23 T3.4 asserts this case works** — "cancel before the subprocess starts → the
pending entry settles as `partial` with a cancelled notice" — and nothing in the
tree can produce that behaviour.

The two statements are each correct. **I5 says C23's guard is authoritative and
C06's is a backstop**; C16's rung 1 is wired to the backstop. That is the whole
defect, and it is invisible to a reader checking either spec alone.

**Ruled: `RouterDeps.busy` becomes `inFlight`, supplied by C23, returning the
route** — `null | "app" | "local" | "shell"`. Rung 1 takes `app` and `local`; rung
2 takes `shell`.

A boolean was the answer that could not be right, and finding out why is the
second half of this row. C23's guard covers **every** foreground route (I5), so a
boolean sourced from it makes rung 1 fire on a `shell` delegation and swallows
rung 2 — C16's own unconstructible-rung defect, created by the fix for the one
above it. Two rungs with two behaviours (C23 T4.7: cancel a verb, forward `SIGINT`
to a shell child) need the kind, not the fact.

It also vindicates C16's rejected alternative rather than reversing it. Making
`spawnShell` set `C06.busy` was refused because two guards over one condition
drift. Correct — and the conclusion is not that C06 should answer differently but
that C06 should not be asked.

This is C16's own rung-7 lesson arriving through the other door. There the ladder
had no rung for a constructible state and answered confidently with the next one
down; here it has the rung and asks the wrong component whether the state holds.
A ladder always returns something.

### A2 — `PatchOutcome` has three arms and §5 named one

§5's containment row reads: *`applyPatch` returns `{ok: false}` … a notice records
the truncation, carrying the returned `ErrorLike`'s message.* C13's `patch` returns
three shapes, and only one carries an error:

```
{ ok: false, reason: "unknown" }              evicted or cleared — no error
{ ok: false, reason: "settled" }              the stream outlived its settle — no error
{ ok: false, reason: "patch", error }         malformed — the only arm §5 describes
```

A patch arriving after cancellation settled the entry returns `"settled"`, and the
row applied literally puts `undefined` in the notice. `"unknown"` is ordinary
rather than exceptional — C13 says so — and deserves silence, not a notice.

**Ruled**, and §5 now says so per arm: `"patch"` settles with a notice carrying the
message; `"settled"` and `"unknown"` are dropped without a notice, because both
mean the entry is already in its final state and a second notice would describe
the transcript rather than the command.

### A3 — a bad patch settles the entry and leaves the child running

§5 settles on patch failure. Nothing stops the subscription or the process. A
`--watch` whose adapter emits one malformed patch therefore settles its entry,
releases the guard, and leaves a subprocess streaming into a store that will
reject every subsequent patch with `"settled"` forever.

**Ruled: settling on patch failure cancels the subscription**, through the same
path I10 uses. The entry is final, so nothing downstream can consume what the
child produces; keeping it alive spends a process on output nobody will read.

### A4 — a stall notice outlives the condition it describes

§3b said the notice was "removed if output resumes", and that the first two
mechanisms "stop when the entry settles or the view pops". **Stopping a mechanism
does not retract the block it already injected.** An entry that goes quiet at
120 s and then settles keeps `no output for 2m` in its final document, where it is
no longer true.

**Ruled: settlement replaces it with a record of the gap. Nothing is removed.**

The first ruling here said *removes*, and writing the driver found that
`ViewPatch` has no delete — which is correct and stays. A transcript is a record:
C13 has exactly one path that removes anything, the cap, and it leaves a marker so
the removal is visible. A patch that made a block vanish would leave a document
whose earlier state cannot be reconstructed from its own history, and `rev` is a
counter rather than a log.

**And removal was never what this wanted.** The notice said *this stream has gone
quiet*; the stream then stopped, or spoke. Either way the thing it describes still
exists and its state changed — which is `replace`, not delete. The row is spent
and it says something true, because the entry did go quiet and that belongs in its
record.

### A5 — the guard outlives the submission that took it

§5 names `transcript.append` as the one stage whose failure loses the outcome: no
entry, logged as a defect, the frame still commits. It says nothing about the
state machine. §6 transitions **idle → running** on submit, and the guard is taken
before the append (§3). If the append throws, C23 stays `running` with no entry
and no child, and every subsequent submission is refused for the life of the
session.

**Ruled: the machine returns to `idle` on any stage failure, including this one.**
I1's second exception is about the *entry*; it is not a licence to keep the guard.

### A6 — the handoff's four calls, and what arrives during them

Added when the handoff was built. §4's row is `lifecycle.suspend` →
`runner.handoff` → `lifecycle.resume` → `scheduler.invalidate`, and the trace's
question is not whether those four run in order — T4.3 asserts that — but what
else can happen while they are running.

| Sequence | Interaction | Ruling |
|---|---|---|
| submit `/tty vim`, then a second submit while suspended | handoff × the guard | The guard is taken for the whole sequence, as it is for any submission. §6's machine is `running` from `submit` to `invalidate`, so the second submission is refused by the ordinary rule and no new case is needed. Recorded because "the terminal is gone" looks like it needs one |
| `stop("eof")` while the child holds the terminal | handoff × I12 | `beginStopping` sets the flag, and the flag refuses *submissions*. It cannot interrupt a child that owns the terminal, and it must not: `lifecycle.release()` while suspended would restore a screen the child is drawing on. Shutdown waits for `resume`, which the guard already serialises |
| SIGWINCH during the suspend | handoff × C01 | Nothing. While suspended the dimensions belong to the child (C01 §3), and the terminating `invalidate` is a full repaint at whatever size the terminal now is. The resize path's `commit("resize")` would paint onto the child's screen |
| an entry still streaming when `suspend()` is called | handoff × §3's stream path | Cannot arise on the accepted path — the guard is held, so no stream is in flight when a submission begins. But §3b's stall detection is **not** a submission and does patch on a timer, so it fires onto a suspended terminal. Ruled: `commit` during a suspend is dropped, and the trailing `invalidate` is what makes that safe. The patch still lands in the store; only the paint waits |
| `runner.handoff` rejects | **the throw path** | See below |
| an app verb declaring `interactive` and `streams` | structural, not sequential | Refused at parse (C05 I19). It is in this table only to record that it was asked and answered somewhere else — the interaction is between two manifest fields with no event between them, so it is C05's classification rule and not a row of this trace |

**A6.5 — the rejected handoff leaves a suspended terminal, and nothing resumes
it.** This is the row worth the whole subsection, and it is the second instance of
the shape T1.9f named: *when a ruling chooses to throw, ask what the throw leaves
behind.*

C21 §5 rejects `handoff()` when `stdin.isRaw` is still true, on the grounds that
the caller skipped `lifecycle.suspend()`. It is a good guard and it is checking a
*precondition of the caller's sequence from inside the second step of it*. So the
one case it fires on the handoff path is the case where `suspend()` ran and did
not un-raw stdin — and the rejection then unwinds out of a sequence that has
already suspended the terminal. `resume` never runs. The session is left on the
primary screen with no frame, no prompt and no error visible, because the
diagnostics path writes to a screen that was released.

Predicted rather than discovered, which is the difference from T1.9f — so it is
asserted rather than found. **Ruled: the sequence resumes on any failure of the
middle two steps, and the resume is not conditional on the handoff having
started.** A `resume()` that was never suspended throws in C01's own transition
table ("nothing was suspended"), so the ordering is: suspend, then everything
after it inside a scope whose exit resumes, and the failure is reported as an
ordinary execution error into the transcript that survives.

### What the trace confirmed rather than found

**Row 2 is a checked negative and worth recording as one.** I13 says the entry
settles with what it had, which requires `rev` to stay put on a rejected patch, or
C14 invalidates a cached height for a change that did not happen. C13's `patch`
returns before `entry.rev + 1` and cites I13 at the line. C23 is the first caller
that can produce the case and the two had never met; they agree.

**And it settles whether C04's shape change earned itself.** It did. Had
`applyPatch` thrown, the throw would unwind out of the stream loop with no way to
distinguish *this patch was malformed* from *the transport died* — the first wants
settlement with what was kept, the second wants C07's error mapping. The entry
would have been left `streaming` with no owner. Returning a value is what lets A2
and A3 be decided at all, and both of those defects are about what C23 does with
the value rather than about getting one.

---

## 8b. The classification table

`ParseResult` kind × session state, and what the pipeline does. **The rows that
matter are the cells two route rules could both claim**; the rest restate §2.

`stopping` is C22's flag (I12); `running` is §6's machine; *sealed* is C23's local
registry after step 10.

| `ParseResult` | idle | running | `stopping` | Notes |
|---|---|---|---|---|
| `empty` | nothing (I1) | nothing | nothing | **B5.** Two rules, one outcome |
| `error` | entry | refused? | refused | An error document spawns nothing — see B5 |
| `builtin` | apply, notice | refused (B4) | refused | |
| `builtinThenShell` | apply, delegate | refused whole (B4) | refused | |
| `local` | run handler | refused | **B1** | **B3** if unregistered |
| `app` | §3 | refused (I5) | refused | **B2** if `validation.ok === false` |
| `shell` | `spawnShell` | refused (I5, T3.16) | refused | |
| — | — | — | **B1** | Non-submission appends are not covered by I12 |

### B1 — I12 governs submissions, and three things that append are not submissions

I12: *a submission is refused once `session.stopping` is set, so nothing is
appended after shutdown begins.* The rule is about submissions; **the rationale
claims more than the rule delivers.** Three paths append or patch without being
submissions: the identity notice (§3b), a stall patch, and a refresh tick. Each
can land after `stop()` has begun tearing the transcript down.

This is the vacuity class inverted — not a rule with nothing to be wrong about,
but a *rationale* wider than its rule, which reads as covering the case and does
not. **Ruled: `stopping` halts §3b's three mechanisms as well**, which is one line
in §3b and is what I12's own sentence already promises.

### B2 — an `app` result carrying a failed validation has two routes

C18 classifies by *shape*, not by validity: a verb that exists with a bad flag is
`kind: "app"` with `validation: {ok: false, errors}`. §2's route table sends `app`
to *Transport → adapt → append*. §5's containment table says *Validation fails →
Error document; nothing spawned.*

Both are correct and they name different destinations for one value. Step 1 of §3
says validation is "already done by C18; the result is carried, not recomputed"
(I4) — carried, and then nothing in §3 says to *look* at it. A reader implementing
§2's table spawns a command C18 already knows is invalid.

**Ruled: step 1 checks the carried result and diverts to the `error` route.** I4 is
untouched — the point of I4 is that the answer is not recomputed, not that it is
not read.

### B3 — `local` names a handler the registry may not have

C18 classifies `local` from the **manifest** (the `ParseResult` carries a
`ToolDef`). The handler lives in C23's **`LocalRegistry`**. Two sources, and
nothing reconciles them — so a verb declared `local` in the manifest with no
registered handler reaches §2's *Run an in-process handler* with nothing to run.

It is SP4's class at runtime: two records of one fact, no comparison. And the
moment to compare already exists — **`seal()`**, which is exactly when both sides
are complete and before any input is accepted (C22 I3).

**Ruled: `seal()` reconciles the two and fails construction on a mismatch.** A
manifest verb marked local with no handler is a configuration error the app can
fix, and startup is where it is cheap. The reverse — a registered handler for no
manifest verb — is also an error, and it is the one that would otherwise sit
unreachable and look installed.

### B4 — a refused `builtinThenShell` and the built-in it was carrying

`cd /tmp && sleep 30` submitted while a verb is running. I5 refuses the
submission; I11 says built-ins apply **before** any delegation. Read in either
order both are satisfied, and the outcomes differ: the `cd` persists and the
delegation is refused, or the whole line is refused and the `cd` is lost.

**Ruled: refuse the whole line. Nothing half-happens.**

The decisive argument is what the user watched. They typed one line and saw it
refused; a refused command that silently changed the working directory is a lie
about what the tool did, and it is discoverable only when their *next* command
runs somewhere unexpected. Losing the `cd` costs four characters of retyping. A
hidden partial effect costs a command running in the wrong place with no visible
cause.

It is also what the rest of the design already says. `builtinThenShell` splits so
that `cd /tmp && make` runs `make` in `/tmp` (C18 §4 rule 2b) — **the built-in
exists to serve the delegation**, so refusing the delegation makes it
purposeless. And I11's *built-ins apply before any delegation* is an ordering rule
*within an accepted line*, not a claim that a built-in survives the line's
rejection. Reading it as the latter is what makes this cell look open.

**`builtin` alone while running is refused for the same reason**, and that is the
half worth stating: the guard is about the session's foreground being occupied,
not about what a command touches. A rule that admits some commands while a verb
runs is a rule whose shape someone has to remember, and the shape is what gets
misremembered. I5 now says refusal is whole-line and unconditional.

### B5 — `empty` while `stopping`, and the refusal that is itself an entry

Two small cells, both of which read as settled and are not quite.

**`empty` while `stopping`** is claimed by I1's first exception (`empty` produces
no entry) and by I12 (refused once stopping). One outcome — nothing happens — from
two rules, which is why it looks safe. It matters because I22 requires every
appended document to carry an origin and a refusal *is* an append: the `stopping`
refusal must not fire for `empty`, or a blank Enter during shutdown puts a notice
in a transcript being torn down.

**A refusal produces an entry**, and I1 counts it. §3's "a refused submission
leaves no orphan entry" and T3.17's "no pending entry is created" are both about
the *pending* entry specifically. The notice is an ordinary append with
`origin: "user"`, and that is what keeps I1 true rather than making the refusal
its exception.

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
- **T1.7b** (I30, C07 I15): three patches of one stream carry `seq` 0, 1, 2, **and all three blocks reach the entry** — the consequence, not only the counter. Three and not two, because two pass against an alternation. *Its inventory row was missing while the row existed and T6.13 cited it; a test with no row and a row with no test are the same absence to a reader (A03 SP1's shape, one level down).*
- **T1.7c** (I15): a streaming verb typed with runs of whitespace → **every hand-off carries the same displayed command**, patches and settle alike, and it is the resolved argv. Typed unnormalised on purpose: with a line the argv rejoins identically, both readings agree and the row passes against either.
- **T1.20** (I28): every route — app, local, shell, handoff, refusal, parse error — leaves the prompt empty. Enumerated over `ParseResult`'s arms, not listed: a route added later gets the clear or fails here.
- **T1.21** (I29): each of those routes produces exactly one history entry, carrying the line as typed and the code the entry settled with. Also enumerated from the type, for the reason the invariant gives — five call sites is five chances to miss one, and the one missed would be silent.
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

- **T3.20** (I31): a `view` action whose `target` names a block in a *different* entry → refused, patched into the source entry, and nothing is pushed. The control is the same action naming a block in its own entry, which pushes — without it the assertion passes for a dispatcher that refuses every view.
- **T3.21** (I31): a `view` action dispatched while a layer is already open → refused through §3a's notice path, and **no `OverlayError` escapes**. Asserted as a `.not.toThrow()` around the dispatch *and* a refusal notice, because a dispatcher that swallowed the throw silently would pass the first half alone.
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

- **T6.20** (I31): resolving a `view` target against the whole transcript instead of the source entry → T3.20 fails. The revert that looks like a generalisation, and it is the one a reader reaches for when a target legitimately names a block they can see on screen.
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
- **T6.20** (I15): passing the raw typed line to `streamInto` instead of the resolved argv → T1.7c fails. The entry then says one thing while it streams and another once it settles, and C22 I33 draws that value — the transcript changing what it says a command was, mid-stream, with no event to explain it. Nothing failed when this was fixed, which is what said the row was owed.
- **T6.13** (I30, C07 I15): pinning `seq` to a constant in `streamInto` → T1.7b fails on both halves. This was the tree's state: the second `data` patch of every stream collided with the first under C04 I14, so a streaming verb could render exactly one block, and the per-stream reset fired on every patch. Found by the first tier-5 row to drive a `streams: true` verb through a real session; the unit suite passed throughout, because its `adaptPatch` double took no arguments and so could not see the one that was wrong.

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
