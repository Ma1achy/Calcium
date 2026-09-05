# C23 — Execution pipeline

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
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
| `shell` | `spawnShell` → `raw` document (C18 §5); **on a non-zero exit, an error document carrying the shell's own stderr** (I50) |

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
  LocalDocument | Promise<LocalDocument>;
  // `args` is what follows the verb, not `ParseResult.argv`
  // `LocalDocument`, not `ViewDocument` — `runLocal` fills `meta` (I15, F13)

interface LocalContext extends ProducerContext {   // C07 §3 — the four facts
  readonly command: string;          // as typed, for `doc.command`
  ask(opts: AskOptions): Promise<string>;
}

type AskOptions = Readonly<{
  question: string;
  detail?: Block;                    // what the answer will affect
  choices: readonly Readonly<{ key: string; label: string; default?: true }>[];
}>;

interface LocalContext {
  readonly command: string;          // as typed, for `doc.command`
  ask(opts: AskOptions): Promise<string>;
}

type AskOptions = Readonly<{
  question: string;
  detail?: Block;                    // what the answer will affect
  choices: readonly Readonly<{ key: string; label: string; default?: true }>[];
}>;

interface LocalRegistry {
  register(verb: string, handler: LocalHandler): void;
  seal(): void;
}
```

#### The context is obligatory, and a wider parameter is refused (I39)

**A grant a consumer may decline to name is a grant that reaches nobody.** `LocalContext` gained `ask` and was published for exactly this reason, and the sentence that justified it — *"a handler that asks cannot name the type of the thing it is asking through"* — is **true about the handlers that ask and silent about the rest**. Measured across the reference app's eight local-handler families: four name `LocalContext`, four declare `ctx: { command: string }` by hand, and **the split is exact — the four that name it are the four that call `ask`** (F125).

A parameter type may always be **wider** than what is passed. That is not a gap in the declaration; it is how function assignability works and it always will be. So a field added here arrives at the four families that had no complaint and does not arrive at the four that filed the findings, and nothing about granting fixes it.

So `TuiConfig.localHandlers` **reads the handler's declared parameter type and compares it to `LocalContext` in both directions.** A handler declaring one field stops compiling at the registration boundary rather than compiling and receiving a context it cannot see, and so does one declaring the context *optional* — `ctx?: …` says the handler may run without one, which is the direct-call shape.

**It is a check on the declaration, not on assignability, and that distinction is the mechanism.** Saying *the parameter is invariant* would be the wrong claim: variance governs whether a function is assignable to `LocalHandler`, and this never asks that question — it recovers the declared type through `infer` and tests it directly. Which is why the shape variance would have let through is refused too: an **object method**, whose parameters are bivariant, is rejected exactly as an arrow is. Probed across four declaration positions before this was written down — a named const, an inline arrow in the config literal, an object method, and a pre-typed record — and all four are refused. `NoInfer` has nothing to move: there is no inference site to shift.

**Only one direction is new, and the mutation pass is what said so.** A handler declaring `LocalContext & { extra }` is *already* refused by assignability alone — a parameter wider than what is passed has never been legal. What the boundary adds is the **narrower** arm and the **optional** one; the mutual form is how the check is written, not the work it does. Measured by removing it: the wider row still fails, the other three stop.

**This is C07 I13's mechanism in reverse.** There the seven registry-owned `meta` keys are typed `never`, so supplying a discarded value fails to compile rather than failing to matter. Here the refusal is on the parameter rather than the return, and it is the direction that has something to bite on: F13's narrowing landed correctly and changed nothing at four call sites, because a hand-written shape was structurally assignable.

**Its first catch was a direct call.** The reference app invokes a handler outside the shell for its greeting, with an object literal that is not a `LocalContext`, has no `ask`, and compiled. Once the handler names the type the literal is a compile error — the obligation reaches the call site through the declaration, without a rule that walks call sites.

#### `ctx.ask` — a question the handler awaits

**A choice list rather than a yes/no box**, because the two-choice case is the
degenerate one and a second consumer needs single-select and free text. One
mechanism, ruled once.

`ask` resolves with a chosen `key` and **never with null**. Declining is a choice
— it is the one marked `default` — so there is no second way to say *nothing
happened* and no caller that has to handle both. `Esc` and `⌃c` resolve with the
default for the same reason: cancelling the question and declining it produce the
same outcome, so a distinction between them would be one nothing downstream could
act on.

**The prompt is unavailable while a question is open, and that is C15's modality
rather than a second mechanism here.** The layer is pushed with
`dismissable: false`, which is what C16 I8's first clause reads, so nothing beneath
it takes a key. See I36 for why that flag is `false` on a layer the user can
plainly escape.

Calcium ships handlers for the concerns it owns — `/help` renders from the manifest (C16 §6, so documentation cannot drift), `/clear` empties C13, `/theme` switches C10, `/history` reads C20, `/debug` reads an entry's invocation record, `/exit` calls `C22.stop`. An app registers its own alongside them.

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

### The pending entry is the running card

**Step 3's document is `toolCallDoc`** (I54; `AGENT_TUI_DESIGN.md` §9c). One block — a `step`
notice reading `⏺ verb(args)`, the tool being the manifest verb and the args the rest of the
resolved argv (§18 of the design: *the tools are the manifest*), **or the bare `⏺ verb` when the
argv has nothing after the tool** (F795, ruled 2026-09-05: a parenthesis says *these are the
arguments*, and empty it says so about nothing; `⏺ ps · 2s`, never `⏺ ps()`) — so the header is the far side's
call where the command row above it is the user's line, and the two agree here by construction
where in an agent transcript they would not. **Measured 2026-09-05, and the sentence above was
false until this ruling**: the pending document was `compose({ blocks: [] })`, nothing outside
C13 reads `streaming`, and the *running indicator* was a row nothing drew — a slow verb was the
command row and silence, which is the dropped-keystroke reading with a different cause. The
figure is I53's readout, registered at step 3 with the header's id and stopped by `settled`
(§3d-bis); below one second `elapsed()` draws nothing, so the card reads `⏺ ps(--all)` at dispatch
and gains `· 1s` on the first wake.

**The body is the entry's own blocks.** Step 4's patches append after the header (C13 `patch`,
`op: "append"`) and §3b's stall notice appends after them, so `⎿ no output for 2m` lands as the
card's last row and `resumed after 2m` replaces it in place (§8a A4). **Not `ToolCallSpec.output`'s
follow scroll**: a `ViewPatch` addresses the document's top level and `scroll.children` is not a
patch target, so the streamed body on this route is what it always was, one row under the header
— and `ToolCallSpec.output` keeps its consumer where it was, in the agent example.

**The outcome goes into the header on every settlement, and every settlement keeps the card**
(I55, ruled 2026-09-05). Two settlements exist (C13 §5), and until this ruling only one kept the
card. `settle(id)` — step 7, the stream route's `end`, its two error arms, and Ctrl-C — keeps what
accumulated, so the header is patched **before** the settle with its final figure and a one-word
verdict: `exit N` from `end`'s `RawResult.exitCode`, `cancelled`, `truncated`, `failed`. `settle(id,
doc)` — step 6, the invoke route and its error arm, and the local route — *replaces* the document,
and **the replacement is composed with the card**: `{ ...doc, blocks: [header(elapsed, outcome),
...doc.blocks] }`, where `outcome` is `exit N` when the adapted result's exit code is **non-zero**, `ok`
for a document whose status is `ok`, and `failed` for one whose status is `error` with no such code.
(The first draft said *when the adapted result carries an exit code* — every adapted document does,
the registry writes `meta.exitCode` on every route (F58), so that clause made row 10's `ok`
unreachable. A zero exit is not a fact worth a word beside `ok`; a non-zero one is the fact.) The result's
blocks become the card's body and hang under the hook two cells in (C22 I83). So `⏺ tail(web.log)
· 2m 31s · exit 0` is what a finished follow reads **and `⏺ ps(--all) · 0.4s · ok` over an
indented table is what a finished listing reads** — §9c's settled state, on every route.

**Before and not after, and the reason is not refusal.** The first draft of this paragraph said a
settled entry refuses the patch; measured, it does not — C13 §6's gate reads *who is writing*, and
the header is the shell's (`origin: "shell"`), so the patch would land either way. What forces the
order is the record: persistence writes the document **on the `settle` change and on nothing after
it** (C13 §5b.2, `construct.ts`), so a verdict written after the settle is on screen and absent from
the file. §8g row 6 is the cell, and T4.40's fourth assertion reads the document *at* the settle
change. On the `settle(id, doc)` routes the same rule is met by construction: the header is inside
the document the settle writes.

**What this reverses, and why it is written down.** This paragraph ruled the other way the day it
was written: *`❯ /ps --all` over a table is what a finished listing reads: the card was the waiting
and the document is the answer.* That reading treated the card as a running indicator and §9c as
the agent surface's grammar. The reader's ruling is that §9c is Calcium's grammar — a call reads
the same whether the far side is a model or `docker ps` — and the card is the record of the call,
not of the wait. The earlier sentence survives here as the thing this replaces, so that a reader
who finds `❯ /ps` over a table in an old frame knows which of the two it is.

**A queued entry is waiting, not running** (roadmap 33, I53). Its `queued behind …` notice is
`streaming: true` so the queue is visible, and the readout's clock starts at registration — so
registering at enqueue would count the wait as the run. The header *replaces* the queued notice
when the route takes the entry (`Settle.into`) and the clock starts there. **Found by §8f's P2
and measured before the fix**: nothing replaced the notice, so a deferred submission on the
stream route ran to completion and settled reading *queued behind /logs* — the invoke route's
wholesale replacement is what hid it.

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

The action dispatcher — `pipeline.onAction`, the function C16's `rowActivate` reaches through `KeyDeps.onAction` (I37) — is supplied by C23. Nothing else may supply it — an action is a submission by another route, and routing submissions is what this component does. **It is not a member of C09's `RenderContext`**: that listing carried an `onAction` for the life of the project that no renderer read and no product call site supplied (C09 §2, F85's shape), and this clause used to name it as the thing C23 supplies. A block library dispatching its own actions would be L1 causing effects in L2 and L4 at once, which is the reason the clause exists; the field it named was never the mechanism, and the mechanism is the one named here.

| Action | Effect |
|---|---|
| `fill` | `editor.setText(command)`, cursor at end, one undo unit, then `commit("input")` and a fill-flash tick |
| `exec` | Submitted through §2 exactly as if typed — same guard, same routes, same entry |
| `open` | Handed to the injected `openUrl` (C22 §2); never spawned through a shell |
| `expand` | An `op: "expand"` patch toggling the row's flag (C04 §4), at `"shell"` origin. The op names the operation readably; the origin is what gets it past a settled entry (C13 §6) |
| `view` | `target` resolved against the **source entry's own blocks, at any depth**, then pushed as a C15 `kind: "view"` layer whose owner is C22. An unresolved target, or a stack that already holds a layer, is a refusal |

`fill` populating the prompt rather than running is A01 D8's default, and it is why `production cancel <uuid>` is readable before it happens. Only filter pills use `exec`, because a filter is reversible.

**`open` never goes through a shell.** A URL arriving from a far-side envelope is untrusted data, and `spawnShell("open " + url)` would be an injection through the one path that otherwise has none (D18). The opener takes a parsed URL and rejects any scheme outside `http` and `https`.

**A refusal patches a notice into the entry that was acted upon. It never appends.** This is C23 §4's pop row one section over, and the reasoning transfers whole: an append freezes the block the action came from, so a second action on it is refused as *frozen* rather than for its own reason, and the selection A01 D7 preserves is cleared. A refusal that changes the thing it declined to act on is worse than the refusal.

The mechanism differs from the pop's, because a pop has nothing to say and a refusal does: `patch(id, notice, "shell")` on the source entry. The `origin` argument is what makes it possible — a refusal notice *is* data, so gating on the operation refused it on every settled entry, which is most of the ones a reader acts on. C13 §6 records the three tries and why the distinction is **who is writing** rather than what is written. No append, no freeze, no selection loss, and the message appears where the reader was looking rather than at the bottom of a transcript they have scrolled away from.

#### `view` resolves its target, and refuses two things rather than one

**The target is resolved against the source entry's blocks and nowhere wider** (C04 I34). `expand` needed no resolution — it names a row on the entry it came from, which the dispatcher already holds — and `view` is the first kind whose `target` names something the dispatcher has to *find*. A free string an adapter supplies, resolved against the whole transcript, would let one entry's action fill the screen with another entry's data; resolved against nothing at all, a stale block id becomes a key that does nothing and reports nothing. **Within the entry it resolves at any depth**, which is the opposite direction and carries none of that risk: a container is part of the entry that declared it, and a `panel` is what `b.live` and I34 both produce, so a top-level `find` refuses the arrangement the framework itself builds (I31).

**The second refusal is the one the walk found, and it is a throw C15 already owns.** `OverlayManager.push` throws when a view is raised onto a non-empty stack — views do not nest (C15 I1) and there is no legitimate path to accommodate. That throw is correct where it lives and is reached from a *renderer's* callback here, so letting it escape would put an `OverlayError` inside a React event handler with no frame to report it in. The dispatcher checks the stack and refuses through §3a's notice path instead. This is the case a table indexed by accepted paths does not reach: neither rule is wrong, and the interaction is between a ruling that throws and a caller that cannot catch usefully.

Both refusals patch the source entry, exactly as every other refusal here does.

An action from a **frozen** entry is refused (A01 D5, C13 §2): frozen entries hold stale data and firing `↑ promote` from one is the footgun that rule exists to prevent. Actions from a frozen-but-streaming entry are refused for the same reason.

**Reachable from a keyboard since C26 §4g, which is when the ruling was first pressed and had to be finished.** A settled row can be focused, `⏎` arrives here with the settled entry as its origin, and two planned surfaces want something from exactly this path: a notebook's *re-run this cell* (`docs/notes/PRISM_NOTEBOOKS_IDEA.md` — *C23's route, triggered from a settled entry*) and an agent harness's *retry that tool call*. **Neither wants an action.** Both want the entry's **recorded command** re-submitted, and that is the distinction the ruling turns on:

- **All five kinds stay refused, `fill` included.** `exec` and `expand` act on rows that may no longer exist; `open` and `view` name targets the settled document chose; and `fill`'s command was composed against those same rows — a reader reading a stale identifier before running it is not the protection A01 D8 was for. D5 stands whole rather than gaining a per-kind exception, because the thing the consumers need is not one of the five.
- **What fires from a frozen entry is `rerunEntry`** (→ C16 I29): `⇧⏎`/`⌥⏎` on the focused entry submits `doc.command` through §2's normal path, indistinguishable from typing it — the guard applies, history records it, a new entry is live and the old one stays as it was. It fires against the **command text and never the document's data**, which is the one thing a settled entry holds that is not stale. It works on the live entry too, where it is *run the latest again*.
- **The refusal names the command.** *`promote` is from a frozen entry — its data is stale. Re-run `/ps` for a live copy.* Named by command rather than by key, because a key spelt in a notice is a second keymap that drifts under rebinding (C16 I19); the reader can type it, and the binding does the same. An entry with no command gets the first sentence alone.

---

### Setting `origin`

C23 is the only component that appends documents, so it is the only one that can set provenance. It sets `meta.origin` on **every** document it appends, with no default and no path that omits it (C04 I13):

| Value | Set when |
|---|---|
| `user` | A typed submission from the prompt |
| `action` | An `exec` action dispatched from a block (§3a) |
| `refresh` | **A system notice with no user behind it**: an identity transition signalled by C22 (§3b), C13's cap marker, and the two startup warnings C22 composes. Not the mechanism, the *provenance* — nothing the user typed produced it, so `↑` recalls nothing and `/debug` has no argv to show. It was written as *the identity notice is the only path that sets it*, and three others already did; the stall notice and a part refresh set it neither, because both *patch* and a patch carries no `meta` |
| `defect` | **The framework contained a failure and is saying so** — §5a's fault notice, and nothing else. Not `refresh`, which is a system notice about the *session*, and not `action`, which names a mechanism that did not produce this. The distinction has a reader: `/debug` renders `origin` as a row, which was checked before the arm was added rather than assumed — a fifth arm nothing displays would be a field with no consumer, which is the class this whole row is about |
| `agent` | Reserved. Nothing produces it in v1 |

`origin` is not a debugging field. It is what makes a transcript legible once more than one thing is putting entries into it, and a provenance field that can be absent is one nobody trusts.

---

## 3b. Time-driven updates

Adapters are pure and read no clock (C07 I1); C15's layout is pure (C15 I5). **Anything periodic is therefore C23's, using C22's injected clock.**

Three cases. **Two patch an existing host and one appends**, and that distinction
is what §3b was missing rather than a detail of it.

**Stall detection.** A streaming entry that has received no patch for **120 s** gets a synthetic notice patch — `no output for 2m` in muted tone — **replaced, on resumption, by a record of the gap**. The earlier wording said *replaced on the next real patch and removed if output resumes*, which is one event described twice and only the first half is expressible: `ViewPatch` has no delete, and it should not. **A transcript is a record.** C13 has exactly one path that removes anything — the cap — and it leaves a marker so the removal is visible (C13 §5). A patch that made a block vanish would leave a document whose earlier state cannot be reconstructed from its own history, and `rev` is a counter rather than a log, so nothing would say a block had ever been there. What resumption wants is not removal anyway: the notice said *this stream has gone quiet*, and then the stream spoke. That is a state change on a thing that still exists. **So the row is spent, and it says something true** — `resumed after 2m` rather than a blank. **And the figure is the silence, measured from the last patch** — not from the notice, which is posted two minutes into it. Measured 2026-09-05 (T4.44): the record read *resumed after 1m* under a notice that had said *no output for 2m*, two figures in one entry about one gap, and every row before it matched `/resumed after/` without the number. The entry did go quiet, and that is part of its record. A zero-height replacement is not available and should not be: C09's floor is one row for any block that is present, which is the constraint that makes measurement honest. It is not an error: a build pulling a large base layer is silent for minutes, and the honest reading of a motionless block is usually "working". Saying how long it has been quiet is better than implying a fault or saying nothing.

**A part is declared wherever a document reaches the transcript, which is two
calls and not one** (I33a). A document arrives by `append(doc)` on the local and
notice routes, and by `settle(id, doc)` on the app route — where §3's steps 6 and
7 are one call, so the entry is appended *pending* and the document that carries
the blocks arrives only at settlement. Registration hung off `append` alone, so
**an adapter returning a `b.live` block was never driven at all**: it rendered its
loading state and stayed there for the life of the session.

Nothing said so, which is why it survived. I32 and I33 are about *hosts* and
*triggers* and neither mentions a route; the code carried the guarantee in a
comment — *"called from the one place a document reaches the transcript, so a
part declared on any route is driven and no route has to remember to"* — and
there are two such places. A sentence claiming total coverage of a set it had
miscounted, which is A03 §2's class in a comment rather than in a rule.

It was found by a consumer building the part on each route and looking at the
frames: the adapter's read `tick 0` for twelve seconds at a one-second interval.
No assertion in this repository could have failed, because none of them declared
a live part from an adapter.

**Declaration is release-then-declare at settlement**, in that order, and C13
emits its `settle` change synchronously — so the driver's I33 teardown runs
inside the `settle()` call and the declaration follows it. The order is a
consequence of the call rather than of subscriber registration, which is what
makes it safe to state.

**Part refresh.** A **transcript entry or a pushed view** may declare intervals — `b.live` (C24 §5) is the consumer-facing form, and both are driven by the same code here. An earlier split had C22's identity loop refreshing banner sections while C23 refreshed view panels; one mechanism replaces two, and C22's loop is now about identity alone.

```typescript
type ViewRefresh = Readonly<{
  id:           string;            // which part — never which host
  title:        string;            // the panel's; where state is said
  intervalMs:   number;            // 0 → one-shot, no retry
  staleAfterMs: number;
  source:       string | null;     // the declared key, or null → its own (§3c)
  fetch:        () => Promise<unknown>;
  derive:       { key: string; compute: (data: unknown, prev: unknown) => unknown } | null;
  render:       (data: unknown) => Block;
  renderError:  (err: ErrorLike, retryInMs: number | null) => Block;
}>;

// `offsetMs` left `ViewRefresh` with §3c: the stagger belongs to the thing that
// polls, and after §3c that is the source rather than the part.
type Source = Readonly<{
  key:          string;
  intervalMs:   number;
  offsetMs:     number;            // stagger, assigned across the session
  fetch:        () => Promise<unknown>;
}>;

type RefreshHost =
  | { kind: "entry"; id: EntryId }
  | { kind: "view";  id: string };

declare(host: RefreshHost, parts: readonly Omit<ViewRefresh, "offsetMs">[]): void;
release(host: RefreshHost): void;
```

**`fetch` and `render` are separate fields and must be.** Composing them into one
thunk is the obvious simplification and it erases A02 §7 rule 2: a `fetch` that
rejects is transient and retries, a `render` that throws is deterministic and does
not, and once they are one function C23 cannot tell which happened. The rule would
still be written down and nothing would implement it.

**`renderLoading` is not here, and its absence is the division working.** The first
state is a block that already exists when the entry is appended — `b.live` builds
the panel with the placeholder inside it — so C23 never renders it. C23 renders
exactly the two states only C23 knows about: the result of a fetch it drove, and
the failure of one, with the `retryInMs` only the backoff can supply.

**The declaration says which part; the registration says which host, and the split
is not cosmetic.** `id` is the block a part patches, and the first sentence above
says an entry *or* a pushed view may declare — so the host is a second coordinate
the part cannot carry. Putting it on `ViewRefresh` would permit one declaration
whose parts point at different hosts: a set no host can release as a unit, and a
stagger computed across members that do not share a lifetime. On the registration
it is one map key, and `release(host)` becomes **the single path every teardown
trigger routes through**, which is what makes the list below checkable rather than
five call sites agreeing by inspection.

C23 drives each on the injected clock and patches its host. **Offsets are assigned so no two fire in the same tick** — synchronised refreshes produce a periodic load spike and a whole-screen flicker, and staggering costs nothing. After §3c the thing staggered is the **source**, because the source is what polls.

---

## 3c. Sources, derivations and parts

**The correctness half is the argument, and the saving is a consequence.** Every part owning
its own `fetch` means two parts reading one source poll it at different moments and **hold
different data** — one plot and one sparkline diverge on screen, and two renderings of one
fact showing different numbers is a defect rather than a cost. Measured before anything was
built: two parts, one logical source, read from **one composed frame**, showing `19` and
`20` (`docs/notes/TUI_NOTE_shared_pollers_baseline.md` §2).

Three layers, and **two levels rather than a reactive graph**:

```
SOURCE       fetch, shared, versioned            one poll per key per tick
DERIVATION   a fold over versions, shared        the ring · the parse · averages
PART         render, per instance                one expanded, one collapsed
```

> **Per-part state is view state only. Anything that accumulates belongs in a derivation.**

That rule is what makes the rest safe, and §3d's pause rests on it entirely: expanded /
collapsed / which-tab do not need updating while nobody is looking, and a ring buffer does —
so **a paused part cannot fall behind, because it holds nothing that could.**

**`source → derivation → part` is where this stops.** Arbitrary depth is a different and
much larger thing, and the shallow answer is the same call as `b.row` being a container
rather than a layout engine and windowing being block-boundary rather than mid-row — three
rulings with one shape, which is the evidence it is the right one.

### The key declares sameness, because functions cannot be compared

`LiveSpec.source` is a string (C24 §5). Two parts naming one key share the fetch **and** the
derivation; only the render is per instance.

**Every part has a source; `source` only says when two of them are the same one** (I42). A
part omitting it is its own source, so the driver has **one code path** and the unshared case
is the degenerate one rather than a branch that could be removed — which is C09's
atomicity-by-absence applied to a seam instead of a block kind. The implicit key is derived
from the host and the part id and lives in a namespace **no declared string can spell**;
without that, a consumer's key could collide with another part's private one and two
unrelated parts would silently share a fetch (§8d D5).

**A conflicting cadence is refused at declaration, not arbitrated** (I43). Two parts naming
one key with different `every` is a programming error, and refusing is available here, so
first-wins and shortest-wins are both wrong: whichever loses is stored, reads as honoured,
and silently is not — the two-records-of-one-fact class with a timing symptom. The refusal
names both parts and both values, which is C05's duplicate-tool precedent.

**The refusal is drawn in the losing part's panel and is not thrown, and that ruling was
made by measuring the throw.** The first implementation threw from `declare`, which is where
the argument for refusing points — and `declareLive` runs inside `appendAndCommit`, whose
bare `catch` is C23 §5's deliberate one (F15). Measured from the public entry: **two panels
sitting at `◌ loading` for the life of the session, no notice, no exception, nothing on
stderr.** That is strictly worse than the arbitration it was chosen over, which at least
ticks — a refusal nobody can see refuses nothing and reports nothing.

So the losing part is declared, does not join the source, does not tick, and its panel
carries the message. Visible where the author is already looking, contained by the panel
border the way every other part failure is (A02 §7 rule 1), and one behaviour on every route
rather than a throw the transcript route swallows and the view route does not.

**This is §8a A4's lesson a third time**: a ruling correct about the interaction, assuming a
mechanism the layer below does not have. The walk asked what a throw *leaves behind* — a
half-registered host — and answered it by validating before applying. It did not ask **who
sees the throw**, and no row of either artefact covers that, because the reader is not a rule.

**`fetch` cannot be compared, so it is not checked, and this sentence is the ruling rather
than a gap in one.** The key **is** the claim that these fetches are the same, and the
framework takes it; the first declaration's closure runs. That is exactly the standing of
`source` being a string at all, and stating it is what stops a later reader adding a check
that cannot exist.

### A derivation is a fold, and it is why the source can be shared at all

`derive` is `{ key, compute(data, prev) }`, run **once per source version** and shared by
key; its result reaches `render` in the fetched data's place. A pure map ignores `prev`; a
ring buffer uses it. One shape covers both, and a part with no `derive` receives the source
data exactly as it does today.

**The layer is not optional and the reference app is why** (F91). `createCpuTick`
(`examples/docker/src/container.ts:227`) pushes its sample into the ring **inside the
fetch**, with its own comment recording why the sample must not land in `render` — a render
failure would lose it. So one part's fetch has a side effect and its sibling's does not, and
**sharing one fetch between them silently stops the ring.** A source layer without a
derivation layer therefore has no consumer in the app it was filed against.

`compute` is deterministic in the sense A02 §7 rule 2 means: **it throws like a `render` and
not like a `fetch`**, so it does not retry, and the parts reading it render their error arm.
The version is not consumed, because a fold that threw has not advanced.

### What a shared source does at each moment

**One fetch per source per tick**, and **every part referring to the source when it resolves
renders that one result** (I44) — including a part declared while the fetch was in flight, so
a part joining a shared source draws on the next resolution rather than waiting a full
interval of its own. The whole set is applied, and **then** one commit.

**A source with no referring parts is retired on the next sweep, not at release** (I45), and
that ruling exists because of one sequence rather than for tidiness. I33a's declaration at
settlement is **release-then-declare**: retiring at `release` drops the refcount to zero
between two synchronous calls, destroys the source and its derivation, and rebuilds them
empty — **so the ring would reset on every settle, with the panel still drawing and every
assertion about it passing.** Retiring on the next sweep is the same *heard rather than
checked* disposition I33 already takes for eviction, one level down.

---

## 3d. Off screen, a source does not poll

**A source polls iff some part referring to it belongs to a visible host** (I46). Paused
means no fetch, no derivation, no render and no patch; on return the source is due
immediately and the part renders the result. Unlike the render cost, this one **spawns
processes and reaches the far side** — measured at 20 fetches a second for two parts reading
one source, unchanged by scrolling, because `refresh.ts` consulted no viewport at all.

**I9 is not violated, and the distinction is the ruling.** I9 protects a *frozen* entry — a
newer entry appeared, the thing is still running, patches keep arriving — and the table above
strikes *freeze* out for exactly that reason. **Scrolled-off is a different state**: nobody
is looking now, and the data must be fresh the moment they look. With a shared source one
visible part keeps it polling for everything sharing it, so returning is frequently free.

**It applies to every part, not only the ones that declared a `source`**, and the asymmetry
is what decides it. A part accumulating inside its `fetch` is **already broken by the rule
above**, so pausing does not create that defect — it surfaces one that was already there.
Pausing only the parts that opted into sharing would make the framework's off-screen
semantics depend on an unrelated declaration: an app adds a key to share a fetch and finds
its polling behaviour changed, two features entangled by an implementation detail.

**Granularity is the host, and the limits are recorded rather than left to be discovered.**
C14 answers which *entries* are visible (`VisibleRange.entries`) and nothing gives per-block
offsets, so a part inside a partly-visible entry counts as visible. And a `view` host is
visible while its layer exists, so the pause reaches transcript-hosted parts and does not
reach a pushed view at all. An unrecorded limit reads as strength.

**Two things this does not do.** A fetch already in flight when the host leaves the screen is
applied rather than discarded — the cost has been spent and throwing the answer away buys
nothing. And staleness is still measured per part from its own `lastOk`, so two parts on one
`sourceVersion` can disagree in their titles; that is named in §8d D10 and left owed rather
than decided from inside a sharing change.

### A part is one block, and the block is a `panel`

`ViewPatch`'s only replacing arm is `{op: "replace", blockId, block}` — one id, one
block. **So a part is one block**, and the ruling is the one `settle(id, doc)` took
over inventing a fourth op: name the operation for the shape that exists. One
`replace`, one `rev`, atomic. The alternative — a patch per rendered block — lands
several revs for one logical refresh, makes C14 invalidate N times for one change,
and leaves a frame composable between any two of them, which is C14's half-applied
store arriving by design rather than by accident.

**That ruling was under-determined, and staleness is what determined it.** It said a
part is one block and not *which*; `Panel` is the only kind carrying a `title`
(C04 §3), and every state a live part must announce is announced there —
S13 §3's `· 14s ago`, S13 §4's `┌ activity · unavailable ─┐`. A part rendering a
bare `table` has nowhere to put either. So a part is a **`panel`**, its `children`
are what the consumer rendered, and the framework owns the title. A part wanting
several blocks returns a `group`, which is one block with children — the same
answer, one level down.

This is also what makes A02 §7 rule 1 structural rather than aspirational: the
panel border *is* the part's own size, so a failure rendered inside it cannot
disturb a neighbour.

### Staleness

**Specified since S13 and never built, which is why C24 §5's table cited a
mechanism this section did not have.** S13 commitment 4 is that a panel older than
twice its interval shows its age, and S13 T6.3 is a fail-on-revert row against
dropping it: *silent staleness is the failure this prevents — a frozen dashboard
looks identical to a quiet cluster.* The citation was not a leftover; the feature
was, and it lands here because this section owns the mechanism.

Past `staleAfter` — default twice the interval — the driver **replaces the part's
panel with the same panel, its title suffixed `· 14s ago`.** No new operation and
no new field: `replace` exists, `Panel.title` exists, and the last successful
render is already held for the backoff. It is a `replace` rather than a removal for
§3b's standing reason — `ViewPatch` has no delete, and a transcript is a record.

**Nothing about staleness stops a refresh.** A stale part is one still trying; it
says so and keeps its interval, and the marker clears on the next success.

### Failure, and what does not retry

A refresh that throws is contained to its own declared part: the rest of the view is untouched, and backoff doubles from the interval to a 5-minute cap. Recovery resets it. This is A02 §7's one backoff rule, and C23 is its only implementation — no part rolls its own.

**A03 §7 rule 2 draws the line and it is a line through this driver, not around
it.** A failing `fetch` is transient and retries; a failing `render` is
deterministic — same data, same throw — so it renders its error and does not. And
rule 3: a part declaring no interval is one-shot, and **a one-shot failure never
retries**, because silently re-attempting something the user asked for once is a
surprise. Both distinctions live in the declaration rather than in the failure,
which is what keeps them decidable at the moment the failure arrives.

### 3d-bis. The two framework defaults, and the counter that ticks one of them

**`b.live`'s loading placeholder and `renderError`'s fallback construct a `status`**, not a
`notice`. The kind exists for exactly these three facts — a thrown renderer, a first fetch in
flight, a backoff counting down — and C09 §3a's argument for it is that a consumer holds none of
the three, so a box asserting one it has not observed is a lie the framework wrote the type for.
Two of the three had no producer until now: `elapsedMs` and `attempt` were fields nothing in
`src/` wrote, so two of `activityLine`'s three arms could not be reached from any session.

**Three arms, and the height of each is a frame read** (F234). Both defaults land inside
`livePanel`, which already draws a border and carries the title:

| when | state | height | what it draws |
|---|---|---|---|
| the first fetch is in flight | `loading` | **2** | the message, then `⠸ loading (4s)` |
| a fetch failed and a retry is coming | `retrying` | **2** | `▲ message`, then `⠸ retrying in 8s (attempt 2)` |
| a fetch failed and **`retryInMs` is `null`** | `error` | **1** | `▲ message` alone |

**H=2 and not 3, because the panel already has the border.** At 3 the box draws a second border
inside the panel's and spends a row on it; at 4 it buys the ERROR tag at two nested borders. Only
the figure says so — every rung is arithmetically self-consistent.

**And the third arm is the one the classification table produced.** A `retrying` box **without**
`retryInMs` draws no activity line and therefore **no spinner** — and §3d's rule 3 says a one-shot
never retries, so `retryIn` is `null` for every one of them. Mapping the fallback to `retrying`
unconditionally would give every one-shot failure a blank row where the spinner goes. The state
union already carries the distinction: **`retryInMs === null` means no retry is coming**, and that
is `error`.

**`attempt` is `src.failures` and therefore consecutive**, reset to 0 by any success (§8d D6 — the
backoff is the source's, so two parts behind one source show the same number, which is the same
reason they back off together). Worth stating because *attempt 1* immediately after a long outage
reads like a defect and is the count doing its job.

#### The elapsed counter

**Owned here, because this is where the clock is.** C04 I66 and C09 I32 rule that `retryInMs`,
`attempt` and `elapsedMs` are supplied and never derived — `tick` cannot carry a duration, since
C03 coalesces and drops commits under load, and L1 may not read a clock at all. `resolveStall`
above is the precedent: a duration computed from `deps.clock()`, patched in at `origin: "shell"`.

Four rules, and each one exists because the walk found something:

- **It writes only when the figure changes.** `elapsed()` renders `4s`, `99s`, `1m 40s` — so the
  guard asks whether the *rendered string* moved, not whether the clock did. **Not a throughput
  argument**: measured, the counter beside its own spinner costs 0.4 frames a second, because
  C03 coalesces six writes in ten into a frame already scheduled (F234). It is a hygiene one — a
  write changing nothing observable is still a `rev` bump, and it invalidates C14's height cache
  and tells the transcript a document changed when it did not.
- **It is gated by `anyoneLooking`, the same gate the poller uses** (I46). The trace's sharpest
  row: C22's spinner ticker disarms when nothing on screen animates, and this driver cannot see
  the viewport — so off screen the spinner stops and the counter would keep writing, at **one
  full frame each** rather than 0.4, which is exactly F234's *patch alone* arm. The gate already
  exists for the poll and is heard through `visibilityChanged` rather than polled.
- **It reads the block currently in place**, never one remembered at declaration — `put`'s own
  rule, for `put`'s own reason. A fetch can fail between the arm and the fire, so the box the tick
  was armed for may now be `retrying`; if what is there is not a `loading` status, nothing is
  written.
- **It never touches a consumer's block.** A part declaring `renderLoading` or `renderError` owns
  its own rendering — C24 §5's *behaviour is fixed, rendering is overridable* — so the counter
  fires only where the spec left the default in place.

**A patch landing on a released host is tolerated silently**, as everywhere else here: `put`
already returns `outcome.ok` and `unknown` is not a failure (I21, §5).

#### The running card's readout

**A pending entry's elapsed figure rides the same one-second wake, and nothing else could carry
it** (I53, F771). `toolCallDoc`'s header consumes `elapsed()` once at composition, so a running
card's `· 4s` is stale the moment it is drawn. Measured 2026-09-05: the stall detector re-arms at
`STALL_MS / 4` — thirty seconds, thirty times too coarse for a figure that moves every second —
and the part sweep already arms itself to `now + ELAPSED_TICK_MS` while a loading box is waiting
(I52) or a backoff is counting down (F407). The readout is a third condition on that arming and a
third loop in that sweep: `readout(id, blockId, render)` records the clock at registration, and
every sweep compares `elapsed(now − startedAt)` with the figure last written and, only when they
differ and only while `visible` says someone is looking, replaces the block through
`transcript.patch(…, "shell")` with `render(since)`. **One wake for every running card, not one
per card** — the timer is `armParts`'s, so ten cards cost the same timer as one. Time is C22's:
`deps.clock` and `deps.schedule` come from `session.ts`, and C03's coalescing is why the figure is
never derived from `tick` (C04 I66, C09 I32). It stops on `settled(id)`, on `release` of the entry
host, on `dispose`, and on a patch the transcript refuses — an entry evicted or cleared underneath
it. Below one second `elapsed()` draws nothing (T2.46), so the card reads *name(args)* at dispatch
and gains `· 1s` on the first wake — the row's first assertion is the bare header, not `0s`.

**Its producer is step 3** (I54, §3). `execution.ts` composes the pending entry through
`toolCallDoc` and registers `readout(pendingId, stepId, (ms) => b.notice("info",
toolCallHeader({ …call, elapsedMs: ms }), "step", { id: stepId }))` before the transport is
invoked; the stream route's `end`, its two error arms and the canceller write the final header
themselves, before `settle` — not because the transcript would refuse it afterwards (a `"shell"`
patch on a settled entry is accepted, C13 §6) but because the `settle` change is what persistence
writes and nothing after it is (C13 §5b.2). Until 2026-09-05
this paragraph read *it has no producer in `src/`* and named the agent example as the owed
consumer — while the pending entry was that producer in everything but its drawing: appended
`streaming` at step 3, patched through step 4, settled at 6 or 7, which is `start / delta / end`
under other names. T2.6a's count over `src/` went from zero to one on this ruling.

#### The shape this was chosen over

**Moving both defaults into this file**, so the framework's fallbacks live in one place rather
than one in `builders/index.ts` and one in `execution.ts`, and `attempt` reaches the box without
widening anything. It is tidier and it is **not** what was asked for, so it was not taken —
recorded because the alternative is invisible from the result: a third parameter on
`renderError` is a public widening (C24), and someone later collapsing it back has to be able to
see what it was chosen over rather than reading it as incidental wiring.

### What stops a refresh

Five triggers, all through `release(host)`, and one that is deliberately absent:

| trigger | why |
|---|---|
| the entry **settles** | the document is final; a patch to it would be a record of nothing |
| the view **pops** | the host is gone |
| the entry is **evicted**, or the transcript **cleared** | C13's cap removes on its own schedule and says so; a refresh that outlived it patches an id that no longer resolves, and `{ok:false, reason:"unknown"}` would read as a failure worth backing off. C25's pushed view listens for exactly this |
| `session.stopping` | below |
| ~~the entry **freezes**~~ | **no.** I9 is that a frozen entry keeps receiving patches until settled, and *frozen ≠ not updating* is the whole of what I9 protects: a `--watch` scrolled out of view is still running. C24 §5's table said *teardown on freeze, settle or pop* and is corrected — an invariant with a stated reason outranks a row inside a section marked not-shipped |
| ~~the host **scrolls off screen**~~ | **no, and it is not the same *no* as freeze.** Freeze changes nothing at all; scrolling off **pauses the source** (§3d, I46). Nothing is released, nothing is torn down, the parts stay declared, and the source is due the moment a referring host is visible again. The two are one row apart and one is a teardown question while the other is a scheduling one — which is why *"a `--watch` scrolled out of view is still running"* was the right sentence for I9 and is **not** an argument for polling it |

**Eviction was in neither document.** §5's containment table had no refresh row and
I9 speaks only of freezing, so the one trigger that removes a host without any
component deciding to was covered by nothing. It is the same shape as C15's
`anchorEvicted`, and it closes the same way — by listening rather than by checking
on the next tick.

**Identity notice.** C22's identity loop (C22 §7) reaches a transition worth
saying out loud — a token inside one day of expiry, or one that has expired — and
**signals C23, which appends the notice.** C22 produces the fact; C23 sequences
the entry, which is every other Seam 4 row's shape and keeps C23 the only
component that appends (§1). The alternative reading, letting the identity loop
reach the transcript itself, makes C22 an appender and undoes the single-appender
rule for one notice: a large concession for a small case.

**It was written here as the sole producer of `origin: "refresh"`, and it is not**
(§3a). The correct half stands: both mechanisms above *patch* — the stall notice
patches its streaming entry, a part refresh patches its host — and `meta.origin` is
a field on an appended document, so the origin table once named two mechanisms
neither of which could set it. What was wrong is the claim that fixing it left one
path. **Three others already set it**, and each is a real append:

| site | what it appends |
|---|---|
| `transcript/cap.ts` | C13's cap marker, when eviction drops entries |
| `shell/construct.ts` | a persisted theme preference that is neither dark nor light |
| `shell/construct.ts` | adapters registered for verbs the manifest does not declare |

So the sentence read as a guarantee and constrained nothing — the same class as
C19 §7's stamp, where a distinction that does not exist forbids nothing while
reading as though it forbids the defect. §3a's row is rewritten to say what the
value actually means: **provenance, not mechanism** — a system notice with no user
behind it. All four qualify under that reading.

**A separate finding, filed rather than fixed.** If `refresh` means provenance the
four are right; if it means *this document is a refreshed view of something* then a
cap marker and two startup warnings are mislabelled, and the value they want does
not exist. That is a C04 question about the origin vocabulary rather than a C23
one, and it is recorded because the false sentence is the only thread that reaches
it. A claim of sole production also wants a check, or it is re-added by the next
reader who greps one site: **SS46**.

**It is the one case with no host to stop with.** The first two stop when the
entry settles or the view pops; an identity notice is a standalone entry that
scrolls like any other, and nothing ends it because nothing is holding it. That
asymmetry is the reason it is a third case and not a third instance of the
second.

The first two mechanisms stop when the entry settles or the view pops — for part
refresh that list is the table above, and eviction is on it — and
**settlement replaces a stall notice that is present with a record of the gap**
(§8a A4). Stopping the mechanism does not retract the block it already injected,
so an entry that goes quiet and then settles would otherwise keep `no output for
2m` in its final document, where it is no longer true. The replacement is part of
settling because by then the mechanism has stopped and cannot do it.

**All three stop once `session.stopping` is set** (§8b B1). I12 refuses
*submissions*, and none of these is one — so without this line an identity notice,
a stall patch or a refresh tick lands in a transcript that is being torn down,
which is precisely what I12's own sentence promises does not happen.

**And stopping them is an ordered step, not a flag the ticks read.** A guard inside
`tick` is checked when a tick begins; a `fetch` already in flight resolves *after*
it and patches an entry mid-teardown. So the driver is released where `stopping` is
set — C22 §8 step 1 — and not inside `beforeRelease`, which runs after it. C22 §8
already orders `killAll()` ahead of `history.drain()` for the same reason: the
signal that stops new work has to precede the work that assumes none is arriving.

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
| View refresh tick | `fetch()` → `render` → `replace` the part's panel on its host → `commit("stream")` |
| Refresh teardown | entry settles, view pops, entry evicted, transcript cleared, or `stopping` set → `release(host)` |
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

**App verbs: the contract C05 resolves for the invocation.** The app author knows `prism shell` drops into a REPL and nobody else can — but not always about the *verb*: `docker run` attaches by default and detaches with `-d` (F80). So C05 I23 resolves it per invocation from the tool's declaration and the flags present, C18 carries the answer on its `app` arm, and C23 reads `result.interactive` on both routes. **One field name, two arms, no branch that knows which kind it is looking at.**

**And the gate is above the interactive split, never inside one arm of it (I38).** The `validation.ok` check lived in `runApp` — the *non-interactive* arm — while the split itself read `tool.interactive`, so a malformed invocation of an interactive verb was handed the terminal and spawned unvalidated. D17's argument is that a malformed invocation costs nothing rather than an interpreter's startup, and the route stepping over it was the one whose failure takes the screen. F119.

**One check, held by a type rather than repeated.** `runApp`'s parameter demands the narrowed `ValidationResult`, so the gate cannot drift back into it; two runtime guards of one condition are indistinguishable from one in every test, since each defeats the other's mutation.

**The `shell` route: `/tty <command>`, stripped by C18** (C18 §5a). The user is typing the command, so the user is the only party with the knowledge — and C05 cannot help here, which the check settles rather than assumes. C05 describes *tools*; §5 hands anything with a shell operator to `sh -c` **whole**, and a shell line has no flags C05 could describe, because `sh` is what parses it. The marker is read through the command policy, so a consumer using `prefixPolicy(":")` writes `:tty`.

**That places the shell half in C18 rather than here.** A marker left on the line would be passed to `sh` as an argument, so it has to be removed before delegation — and C18 already rewrites `/verb` tokens into `<binary> verb` before handing the line over (§5). Stripping a marker is the same operation on the same string, done by the component that already owns it. C23 reads the flag off the `ParseResult` and sequences the handoff; it never parses the line.

So two mechanisms, and honestly two: the routes differ in who knows.

**The list was the obvious answer and is disqualified.** A maintained set of TTY program names is exactly the shape I26 forbids, wrong for every wrapper and alias, and it fails **silently** — a program not on it gets a raw-mode terminal and no line editing, which C21 §5 names as the symptom with no obvious cause. Detection is not available either: whether a child wants a TTY is not knowable before running it.

**What makes the opt-in cost less than it looks is the asymmetry.** A user who forgets the marker gets a broken-looking `vim`, presses Ctrl-C and adds it — annoying and obvious. A user who gets an unexpected handoff loses nothing. There is no false-positive case at all, which is why an opt-in beats a heuristic here and would not elsewhere.

**Discoverability covers one of the two halves, and the sentence used to claim both.** `/help` renders from the manifest, so an `interactive` app verb is discoverable without being remembered — that half holds. The marker is not a manifest tool and cannot be (C18 §5a), so it is exactly as discoverable as `cd`, which is to say not from `/help` at all. Stated rather than left implied: the shell half is documentation and habit, and if that turns out to cost more than it looks, the remedy is a section in `/help` for the things C18 recognises structurally, not a field on a `ToolDef` that would have nowhere to live.

**And C05 refuses the impossible combinations rather than C23 arbitrating them** (C05 I19, I24), wherever they are declared — on the tool or on a flag, since an arm re-creates the same impossible verb. `interactive` with `streams` is a verb whose child owns the terminal and whose stdout is being read into the transcript at the same time; `interactive` with `local: true` is a handoff to a child that is never spawned. Neither has an arbitration that is not a guess, and refusing at parse puts the report in front of the author who wrote the manifest rather than the user watching a terminal misbehave.

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
| A refresh part's `fetch` rejects | Contained to that part (I21): its panel renders the error at its own size, backoff doubles to the five-minute cap, siblings and the rest of the host are untouched. **A `render` that throws does not retry** — A02 §7 rule 2, and a one-shot part does not retry either, rule 3 |
| A refresh patch returns `{ok:false}` | Not a failure and never a backoff. `"unknown"` means the host was evicted and `"settled"` that it finalised between arming and firing; both mean the part is over, so it is released. Treating either as a transport failure would back off against a host that is gone |
| A local handler throws | Error document naming the verb |
| `transcript.append` throws | The only stage whose failure loses the *entry*. **Recorded as a fault and reported** (I48), the frame still commits, and I1's second exception names it rather than leaving the invariant false. **The machine still returns to `idle`** (§8a A5) — I1's exception is about the entry, not a licence to keep the guard, and a stranded guard refuses every submission for the life of the session |
| The append succeeded and a later statement threw | **Not this row, and §5 read as though it were** — the catch covers five statements and only the first is `append` (§8e). The entry exists; what is lost is the rest of the sequence. **The catch finishes what the try did not** (I49) |
| Commit throws | C03 contains it; contamination is flagged for the next frame |

**Cancellation is not a failure.** Ctrl-C routes through C16 to C06's ladder; whatever the child produced is retained and the document settles as `partial` (C07 §4). The transcript keeps forty log lines rather than discarding them because the user stopped watching.

---

## 5a. A swallowed failure is reported, on two channels

**The reporting path is the path that failed**, so there is no single channel that works.
§8e's table is what forces two: in the row where `transcript.append` throws, appending is
precisely what cannot be relied on.

### The correction this section is

Until now §5's row, I1's second exception and §8a A5 all said the failure was *"logged as a
defect"*. **Nothing anywhere logged anything**, in any component — there was no sink to log
to. One unmeasured claim, restated in three places, reading as a mechanism because three
documents agreed; the instrument is *ask where a settled claim is written down*, pointed at
this spec. F15 is the cost: an invalid document produced no entry, no error and nothing on
stderr, with the precise violation in hand and discarded, and the route to it was four wrong
turns against a framework that had the answer in one sentence.

### The moment was already chosen, twice

C02 rules that a component *decides what is wrong, never when the user is told* — detection
runs before the terminal is acquired, and C22 §8 restores the screen before printing because
a diagnostic painted onto the alternate screen is discarded with it. C20 §Warnings says that
ruling "transfers whole". **C23 is the third instance and it takes the same shape**: C23 has
no logger, `console.*` is banned outright (SS33), and the moment belongs to C22 §8 step 3.

So the two channels are:

- **An entry, at the moment** — a fault notice carrying the caught reason, which is the thing
  F15 says was in hand and destroyed. It is **not the submission's entry** (§8b B1), so I1's
  count is untouched, and `stopping` halts it exactly as B1 ruled for B1's own three.
  Deduplicated by message: a source failing every tick would otherwise fill the transcript
  with one sentence, and *logged once* is what C20 already means by it. **One swallow is one
  notice**: a containment that fails a second way — the catch's own `resetFocus` throwing —
  records the second cause and does not draw it, because the reader already has the first and
  two sentences for one event describes the machinery rather than the fault.
- **An accumulation, at shutdown** — `faults`, drained by C22 §8 step 3 onto the restored
  primary screen with the capability warnings and the history warnings. **This is the channel
  that survives §8e's first row**, where nothing can be appended at all.

### The ladder ends, and where it ends is stated

If the fault notice itself throws, only the accumulation survives. That is the end of the
ladder and there is no third channel — a framework whose transcript store is refusing every
document has nothing left to say through it. **It is fabricated rather than asserted in
prose** (T3.38): a construction path claimed to be safe is a claim, and the glyph defect is
how F15 was found in the first place.

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

- **I1** — Every submission produces exactly one transcript entry, with two named exceptions: `empty` produces none, and a failure of `transcript.append` itself produces none — **and a fault notice in its place**, which is not the submission's entry (§5a, §8b B1) and so does not make the count two. The exception is about the entry the submission asked for, not about the session going silent. No other path may produce zero or two.
- **I2** — No stage failure escapes; every one produces a document. For patch application the mechanism is C04's `PatchResult` (C04 I15) rather than a caught throw: the failure is a value on the return path, so "settled with what it had" is something C23 *does* with a result, not something it recovers from.
- **I3** — The pending entry is appended before the transport is invoked.
- **I4** — Validation is carried from C18, never recomputed.
- **I5** — A second submission on any foreground route while one is in flight **takes effect in no part now**. C23's guard is authoritative; C06's is a backstop. **The deferral is whole-line and unconditional**: no part of a deferred submission takes effect while something is in flight, including a `builtin` that needs nothing C23 is holding. Stated because the sympathetic reading — a `cd` is instantaneous, let it through — is what someone re-derives, and a line that silently moved the working directory before its predecessor finished is a lie about what the tool did, discoverable only when the *next* command runs somewhere unexpected (§8b B4).

  **RULED 2026-08-15 — the mechanism moved and the property did not.** This invariant read *is refused with a notice, never queued*, which stated a **disposition** and a **property** in one sentence and made the disposition sound load-bearing. Roadmap 33 changes the disposition: a second submission is **queued**, strictly sequentially, and runs when its predecessor settles. **Every word of the property survives it** — the whole line waits, no part of it takes effect early, and the `cd` the paragraph is written about still cannot move the working directory out from under the command that is running. A queue is the *stronger* satisfier of the same rule than a refusal was, because the reader's line is neither lost nor applied out of order.

  **What the old wording was protecting is now protected by ordering rather than by discarding.** *Never queued* was not an argument; it was the absence of a queue, written as though it were a decision. The argument is §8b B4's, and B4 is untouched.

  Two things carry the change and are named here so the invariant is checkable: the deferred submission's entry exists from the moment it is typed (roadmap 33 §8a row 7 — appended `streaming: true`, settled by the route that eventually runs it, **one entry with two states and never two entries**), and `Ctrl-C` while something is in flight cancels the running invocation **and** clears the queue, each queued entry settling in place as cancelled (§8a row 8, ruled two-rung and reversed by building it — see the roadmap entry).
- **I6** — Streaming subscriptions do not hold the submission guard.
- **I7** — `session.lastUuid` is set only from `meta.resultId`; a verb declaring none leaves it unchanged.
- **I8** — Patches commit `"stream"`; settlement commits `"completion"`.
- **I9** — A frozen entry keeps receiving patches until settled.
- **I10** — Cancellation settles as `partial` with output retained.
- **I11** — Built-ins apply to session state before any delegation.
- **I12** — A submission is refused once `session.stopping` is set, **and §3b's three mechanisms stop**, so nothing is appended or patched after shutdown begins. The second clause is not a widening: without it the rule covers submissions while its reason claims everything, and an identity notice or a stall patch lands in a transcript being torn down (§8b B1). **And they are stopped where `stopping` is set — C22 §8 step 1 — not inside `beforeRelease`**: a guard read at the top of a tick cannot see a `fetch` that is already in flight, and that one resolves into a transcript mid-teardown.
- **I13** — Every cross-layer effect in §4 is sequenced here; no component causes its own.
- **I14** — Local handlers are the only place several stores are reached at once, and only through C23.
- **I15** — The displayed command and the spawned argv correspond exactly (D24). **The displayed command is now displayed** — C22 I33 draws it above each entry — which is what makes this invariant constrain anything: it was written about a `doc.command` no render path read, so it forbade nothing while reading as though it forbade the drift it names. The two forms stay distinct on purpose: the transcript shows `/ps --search=… --open-mr` as typed, and `meta.argv` carries `widget ps --search=… --open-mr --json` for `/debug`. D24's one-token mapping is the correspondence between them. **One entry carries one displayed command, from the first patch to the settle** — the streaming route passed the raw typed line while step 5 passed the resolved argv, so the transcript changed what it said a command was mid-stream, with no event to explain it. `$_` is resolved in both, because the resolved form is what ran.
- **I16** — C23 is the sole supplier of the action dispatcher: `pipeline.onAction`, reached by C16 through `KeyDeps.onAction` (I37), is constructed here and nowhere else, and no component below L4 dispatches an action. **The member this used to name — C09's `RenderContext.onAction` — no longer exists** (C09 §2): every real frame rendered against a no-op default, so the clause was exclusive about a field nothing read while the working route ran beside it.
- **I17** — `open` actions go through the injected opener with an `http`/`https` scheme check, never through a shell.
- **I18** — Actions originating from a frozen entry are refused, and **the refusal patches the source entry rather than appending**. An append would freeze the block the action came from, refusing the next action for a different reason and clearing the selection A01 D7 preserves — C23 §4's pop row, one section over. **All five kinds, and the notice names the entry's recorded command; the one thing that fires from a frozen entry is a re-run of that command through §2's submit** (`rerunEntry`, → C16 I29) — which is not an action, fires against the command text and never the document's data, and is what both named consumers (a notebook's re-run, an agent harness's retry) actually need. Reachable from a keyboard since C26 §4g, which is when the ruling had to be finished. **`expand` is the one exception, and it was found by walking the design against this rule** (C04 §3c S4): it reveals data the entry already holds, fills nothing and runs nothing, so A01 D8's staleness argument has no purchase on it — and the surfaces it exists for (a folded reasoning panel, a tool call's folded body; `AGENT_TUI_DESIGN.md` §9b–c) are settled entries by the time anyone reads them. *Five kinds refused* is therefore four: `fill`, `exec`, `open` and `view` stay refused; `expand` toggles a fold on a frozen entry through a shell-origin patch, which C13 §2 admits. **A `notice`'s `action` (C04, arc 6) arrives at the same dispatcher and takes the same refusal**, and the notice that names it is patched beside the notice that offered it — T4.16 measures both, the entry count unchanged.
- **I19** — Stall detection, part refresh and the identity notice are C23's — the first two on C22's injected clock, the third on C22's signal. No adapter, view, layer or entry reads a clock, and no component but C23 appends.
- **I20** — Refresh offsets are assigned so no two declared parts fire in the same tick.
- **I21** — A failing refresh is contained to its declared part, backs off to a 5-minute cap, and resets on success. **Two failures do not retry at all**: a `render` that throws is deterministic, so retrying burns cycles and flickers (A02 §7 rule 2), and a part declaring no interval is one-shot, so re-attempting it is a surprise the user did not ask for (rule 3). Both are decided from the declaration rather than from the failure, which is what makes them answerable at the moment one arrives. And a patch refused with `"unknown"` or `"settled"` is not a failure in this sense — the host is gone, so the part is released rather than backed off.
- **I22** — Every appended document carries `meta.origin`. No path omits it, and no default supplies it silently.
- **I23** — `/debug` never re-runs anything. It reads an entry's `meta` and appends a document; it reaches no transport.
- **I24** — C23 inserts no vertical spacing of its own — not between top-level blocks, not before them, not after them. Rhythm is declared by `gapBefore` (C04 I25) and applied by the sequence (C09 I17). The rule has teeth in one direction only: C23 may not *add* rhythm.
- **I25** — A stream producing nothing for 120 s is **patched** with a muted stall notice, and never an error. A patch rather than an append, so it never becomes a second entry — and so it carries no `meta.origin`, which is why it is not I22's business. On resumption the notice is **replaced by a record of the gap, never removed**: `ViewPatch` has no delete and a transcript is a record (§3b). A quiet stream is the normal state of a `--watch` on an idle cluster; reporting it as a failure trains the reader to ignore the one time it is one. The notice clears on the next patch and the subscription is untouched.
- **I26** — `/help` is rendered from the manifest and C16's keymap, never from a maintained list. Every verb it names is one C05 will accept and every binding it shows is one C16 will dispatch, so help cannot drift from behaviour — the drift being what a hand-written help text guarantees eventually.
- **I27** — `seal()` reconciles the local registry against the manifest and fails construction on a mismatch in either direction: a manifest verb marked `local` with no handler, or a handler for no manifest verb. Two records of one fact and no comparison is what lets a `local` route arrive with nothing to run (§8b B3).
- **I28** — A submission clears the prompt, whatever becomes of it. The clear sits between the parse and the route, so a refusal, a parse error and a successful verb all leave the same empty prompt — bash's behaviour, and the only one that does not require the user to work out whether their line survived. Restoring it on refusal was the alternative and it is worse: the notice says what happened, and a line that sometimes stays is a prompt whose contents depend on a decision made after the keystroke.
- **I29** — Every submitted line is recorded in C20 **at settlement, with the code the entry settled with**, on every terminal path — app, local, shell, handoff, refusal and parse error. At settlement because `append(command, exitCode)` requires a code and settlement is the only moment one exists; recording at acceptance would satisfy the signature by inventing a value, which is what a required field exists to prevent. **A refusal is a submission**: the user typed it and pressed Enter, and `↑` must recall it — history is not a log of successes. Five call sites is five chances to miss one, so the test is derived from `ParseResult`'s arms rather than from a list.
- **I30** — C23 supplies `StreamContext.seq` as the patch's position within its invocation, counted from `0`. C07 I15 spends it as both the block-id namespace and the per-stream reset, so a constant value is an id collision *and* a reset that fires on every patch — two invariants in two other components, broken from one literal here.
- **I31** — A `view` action's `target` is resolved against the blocks of the entry it fired from — **at any depth** — and a target that does not resolve there is refused rather than ignored. A view raised onto a non-empty layer stack is refused for the same reason and by the same path: C15 throws on it (C15 I1), and a throw crossing a renderer's callback has nowhere to be reported. **The depth clause is the half that was missing, and it widens nothing**: the resolution still stops at the entry, which is what T6.21 protects — *deeper* and *wider* are different directions and only one of them lets another entry's data fill the screen. `patch-view.ts` resolved with a top-level `find`, so a patch inside a `panel` answered *no block `p1` in this entry* about a block that **is** in the entry: not a no-op but **a false statement to the reader**, and the one refusal message nobody can act on. `b.live` builds a panel and I34 replaces a refreshed part with one, so the arrangement is the framework's own rather than an exotic document. **Both sites move together** — `open` finds the block and `live` re-reads it on every motion — because fixing one leaves a view that opens and then dismisses itself on the first keypress, reported as `anchorEvicted` about an entry nothing evicted, which is the same false sentence one layer along. `tree.ts`'s header records this enumeration failing at six sites at once and **no enumeration reaches this one**, because the walk here does not enumerate container kinds; it does not recurse at all (F471, → C04 I34, C22 I75).
- **I32** — A refresh is registered against a **host** and never declares one: `declare(host, parts)` binds them and `release(host)` is the **only** teardown path, so every trigger routes through one call rather than five sites agreeing by inspection. A host on the part would admit one declaration spanning two hosts — a set nothing can release as a unit, staggered across members with no shared lifetime.
- **I33** — A refresh stops on exactly five triggers — the entry settles, the view pops, the entry is evicted, the transcript is cleared, or `session.stopping` is set — and **not on freeze**. I9 is that a frozen entry keeps receiving patches until settled, and a `--watch` scrolled out of view is still running; C24 §5's *teardown on freeze* is corrected against it. Eviction and clear are the two no component decides, so they are heard from C13 rather than checked on the next tick.
- **I33a** — A live part is declared wherever a document reaches the transcript, and that is **both** `append(doc)` and `settle(id, doc)` — declaration is route-independent, so an adapter's `b.live` is driven exactly as a local handler's is. Registration hung off `append` alone and the app route appends a *pending* entry and settles with the document, so every adapter-declared part rendered its loading state and never ticked. I32 and I33 govern hosts and triggers and neither mentions a route; the guarantee lived only in a comment that had miscounted the places a document arrives. **This does not weaken I33**: settlement still releases what the entry had declared, and then declares what the settled document declares — one rule, both behaviours, and freeze still stops nothing (I9).
- **I34** — A refresh applies its result as **one `replace` of one block**, and that block is a `panel` whose children are what the consumer rendered. One op, one `rev`, atomic: several patches for one logical refresh would invalidate C14 N times and leave a frame composable half-applied. The kind is not free — `Panel` is the only one carrying a `title`, and every state a live part announces (I35, A02 §7 rule 1) is announced there.
- **I35** — Past `staleAfter` — default twice the interval — a part's panel is replaced by the same panel with its age in the title, and **staleness never stops the refresh**: a stale part is one still trying, and the marker clears on the next success. S13 commitment 4 has required this since before the mechanism existed, and C24 §5 cited §3b for it while §3b had nothing to cite.
- **I36** — **A question raised by `ctx.ask` is pushed with `dismissable: false`, and it resolves with a choice on every path.** The two halves are one invariant because either alone is a defect. `dismissable: false` is what C16 I8's first clause reads, so no key reaches the surface beneath an open question — and it also stops C16's rung 4 from popping the layer on `⌃c`, which would close the question while the handler's promise stayed pending and the entry never settled. **The flag says the router may not discard this layer without telling its owner; it does not say the user cannot escape it.** Those are two meanings of one word and the layer needs opposite answers to them: `Esc` and `⌃c` resolve with the default choice, which the answer handler does (C16 I25), so the escape the user sees is the owner resolving rather than the router discarding. **And the choices are rendered as a block rather than as written text** (entry 16 A5). A `raw` block carries text where a cell carries a slot, so the selection marker was a character L4 spelled and the host had to be handed a capability record to spell it (F122, C09 I22). As a table it is `bullet` — the marker C19's menu already uses — and the capability leaves the seam with the character. The glyph changed with the form and the reason is a collision the text concealed: C11 renders `expand` for a row that can be opened, so `▸` inside a table row already means *expandable* to the same renderer. Resolving with a choice on every path is the second half: `ask` returns `Promise<string>` and never null, because declining **is** the choice marked `default` and a second representation of *nothing happened* is one every caller must handle and none can act on differently.
- **I37** — **`enter` on a focused row fires that row's first action, through the same dispatcher every other route uses.** C16 owns the binding and C23 owns the dispatch; the shell supplies the join, because the component that knows a live entry's blocks is the one that already answers C16 I22's *which rows are focusable*, and a second walk would be a second answer to *what is here*. **The first action, and C04 I19 is why that is safe** — a row lists its actions in order and `fill` is the default kind, so the first action of a well-formed row is the one a reader expects; a row declaring `exec` first has declared a reversible operation, which is what I19 reserves that kind for. A row with no actions does nothing and says nothing: `focusableRowIds` returns every row because navigating to read is worth doing alone, so a refusal per keystroke would be noise on most of a table. The refusals that matter — a frozen entry (I18), a disallowed scheme (I17) — are the dispatcher's and are unchanged. **Until this existed `actions.ts` implemented all five arms and nothing in `src/` reached it** (F21): an app could build a `view` action, have C04 validate it and C09 render its label, and no keystroke would arrive. C24 I16's subject arriving on `Action`.
- **I38** — **The `app` route reads `result.interactive`, and it reads it after `validation.ok`.** The first half is C05 I23 arriving: the contract belongs to the invocation, so C23 has no business consulting a `ToolDef` field that cannot describe one, and the `shell` arm has carried the resolved form since C18 §5. The second half is the ordering, and it is the one that was wrong: the gate sat inside the non-interactive arm of the split it was supposed to precede, so an unvalidated invocation was spawned on exactly the verbs where the failure is a terminal handed to a child that should never have started (F119). **A gate inside one arm is a gate for the arm that was easy to gate.** It stays single: `runApp` takes the narrowed result, so a caller that has not gated does not compile. **The `local` route has never had this check and still does not** — the same shape one case over, observed rather than measured, and named here so it is a known gap rather than a discovery.
- **I39** — **A local handler's context is obligatory: `TuiConfig.localHandlers` refuses a handler whose `ctx` is not mutually assignable with `LocalContext`.** A parameter type may always be *wider*, so a handler declaring `ctx: { command: string }` is legal TypeScript that compiles, registers, runs, and cannot see a field the framework adds — measured at four of the reference app's eight families, and the split is exact: the four that name the type are the four that call `ask` (F125). **The sentence that published `LocalContext` was true about the handlers it described and silent about the other half**, which is MG24's shape (F84) and the second instance of it. This is C07 I13's `never` keys in reverse — there the refused thing is a supplied return value, here it is a declared parameter — and it is the direction with something to bite on, because F13's narrowing landed correctly and changed nothing at four call sites that were structurally assignable. The obligation reaches direct calls through the declaration: once a handler names the type, an object literal missing `ask` is a compile error at the call site, with no rule walking call sites.
- **I40** — **Every route that produces a document is handed the same `ProducerContext`** (C07 §3, I17): the adapter route, the local route, a live part's `render` and the greeting. One shape, because four shapes is four places for the four facts to diverge — which is the defect the grant exists to close, reproduced inside the framework.
- **I41** — **`height` is non-null on the view route and `null` everywhere else**, decided from `isViewInvocation` before step 3 (C07 I18, C22 I45). The decision is already read there because after step 3 it is too late; this adds a consumer, not a second read.
- **I42** — **Every live part has a source, and `source` only declares when two parts' sources are the same one** (§3c). A part omitting it is its own source under an implicit key derived from its host and id, in a namespace **no declared string can spell** — without which a consumer's key could collide with another part's private one and two unrelated parts would share a fetch, silently and correctly-looking (§8d D5). One code path, and the unshared case is the degenerate one rather than a branch: the same atomicity-by-absence C09's optional `window` uses.
- **I43** — **One source, one cadence, and a conflict is refused at declaration** naming both parts and both values. Arbitrating it — first-wins, shortest-wins — stores the loser's declaration where it reads as honoured and is not, which is the two-records-of-one-fact class with a timing symptom; refusing is available, so arbitrating is not the answer. **The refusal is drawn in the losing part's panel and not thrown**, and that half was measured rather than reasoned: thrown from `declare` it is swallowed by `appendAndCommit`'s deliberate bare catch (§5, F15), and the author gets two panels at `◌ loading` for the session with nothing anywhere reporting a fault — strictly worse than the arbitration it was chosen over. The losing part is declared, joins no source and never ticks; one behaviour on every route, contained by the panel border like every other part failure. **`fetch` cannot be compared and is therefore not checked, and that is a ruling rather than a gap**: the key *is* the claim that these fetches are the same and the framework takes it, exactly as it takes `source` being a string at all. A one-shot part (`intervalMs: 0`) sharing a key with a periodic one is this rule and not a separate case.
- **I44** — **One fetch per source per tick, and every part referring to the source when it resolves renders that one result**, applied as a set before a single commit. Including a part declared while the fetch was in flight, so joining a shared source draws on the next resolution rather than after a full interval of its own. This is the invariant the whole row exists for: two parts of one document cannot hold two samples of one instant, because there is one sample.
- **I45** — **A source with no referring parts is retired on the next sweep, not at release.** I33a declares at settlement by **release-then-declare**, so retiring at `release` drops the refcount to zero between two synchronous calls, destroys the source and its derivation, and rebuilds them empty — the accumulated history reset on every settle, with the panel still drawing and every assertion about it passing. The same *heard rather than checked* disposition I33 takes for eviction, one level down (§8c C3).
- **I46** — **A source polls only while some part referring to it belongs to a visible host**: paused means no fetch, no derivation, no render and no patch, and on return the source is due immediately. **It is not I9's freeze and not a violation of it** — I9 protects a frozen entry that is still receiving patches, and scrolled-off is a different state where nobody is looking and the data must be fresh the moment they look. It applies to **every** part rather than only those declaring a `source`, because a part accumulating inside its `fetch` is already broken by §3c's rule and pausing surfaces that rather than causing it. Granularity is the **host**: C14 answers per entry and nothing gives per-block offsets, so a part inside a partly-visible entry counts as visible, and a `view` host is visible while its layer exists. A fetch already in flight is applied rather than discarded.
- **I47** — **A derivation is a fold over a source's versions, run once per version and shared by key**, and its result reaches `render` in the fetched data's place. `compute` throws like a `render` and not like a `fetch` (A02 §7 rule 2): deterministic, so it does not retry, and the version is not consumed because a fold that threw has not advanced. **Anything that accumulates belongs here and per-part state is view state only** — which is what makes I46's pause safe, since a paused part holds nothing that could fall behind.
- **I48** — **A swallowed failure is recorded and reported on two channels, and C23 chooses neither moment for the second** (§5a). Every bare `catch` in the pipeline records the reason in `faults`, deduplicated by message; C22 §8 step 3 drains it onto the restored primary screen beside C02's capability warnings and C20's history warnings. This is C02's ruling taken a third time — *the component decides what is wrong, never when the user is told* — and it is why `faults` is a readable collection rather than a callback: a callback chooses the moment, and the moment is after the terminal is released. The other channel is the fault notice, which speaks at the time and cannot be relied on, because in §8e's first row appending is what failed. **The prose it replaces claimed a defect log that no component had.**
- **I49** — **The catch finishes what the try did not.** `resetFocus` and the commit run on every path out of `appendAndCommit`, and the entry id is returned whenever the entry exists. §8e's table is the argument: four of five rows leave the append done and the sequence after it abandoned, and the reset is the one whose absence is permanent — T4.7b asserts its position because a frame painted with focus in a frozen block is the failure it prevents. The same reasoning §8a A5 applied to the guard, applied to the four statements that ruling did not look at.


- **I50** — **The `shell` route's failure is a document like any other: `error` filled, and the shell's own stderr in it.** A non-zero exit composed `status: "error"` with no `error` field, which C04 I3 forbids in both directions, so `transcript.append` refused every one of them (C13 I10) and the route produced **no entry at all** — the user seeing F15's fault notice cite two invariant numbers instead of the command they typed. This is the **third instance of the class `documents.ts` closed at `noticeDoc`**, and the argument recorded there — *filling the field here rather than at the two call sites is the class rather than the instances* — is why it recurred: the class was closed at one composer, and this route does not go through it. **Closing a class means checking the class has one member.** The second half is `stderr`: `ChildHandle` delivers it separately (C21 I3) and the route read only `stdout`, so a failing command's one explanatory sentence was produced, delivered and dropped — leaving a raw block that was empty as well as unappendable. §3's verb route already reads it, which is both the precedent and the proof it was reachable. **A bare word is the likeliest thing an unfamiliar reader types**, and it is the input this route exists for.
- **I51** — **The two framework defaults construct a `status`, and its state is decided by whether a retry is coming.** `b.live`'s placeholder is `loading`; a failed fetch is `retrying` when the driver has a countdown to show and **`error` when it has not**, because §3d rule 3 makes `retryIn` `null` for every one-shot and a `retrying` box without `retryInMs` draws no activity line **and therefore no spinner** — a blank row where the one moving thing goes. The state union already carries the distinction, so the fallback reads it rather than asserting a state it has not observed (C09 §3a). **Their heights are 3, 2 and 1, they are *framed*, and only a frame says so.** The first ruling was 2, 2 and 1 on a measurement that still holds — both land inside `livePanel`, which already draws a border and carries the title, so at 3 the box spent a row on a second border inside the first and at 4 it bought the ERROR tag at two nested borders (F234). **What that ruling could not choose is the figure**, because C09's ladder coupled the tag to the border and every option was one of those two: a box that reads as a red line, or two nested frames. C09 §3a's `framed` ladder is the third, and it is the one this layer wanted — no border, because the panel has one, and the rows spent on the tag and the content instead. So `retrying` takes **3** (tag, message, activity line), `error` takes **2** (tag, message), and `loading` stays **1**: it has no tag to gain and its whole content is the line that moves. A declared height with nothing to put in it is still a blank row, which is I31 working and a defect only where this layer picks the number (F406).
- **I52** — **The elapsed counter is written here, only when the figure changes, only while someone is looking, and never into a block this layer did not put there.** The clock is C23's — C04 I66 and C09 I32 forbid deriving a duration from `tick`, which C03 coalesces and drops under load, and L1 may not read one — so `resolveStall`'s shape is the precedent. **The guard is on the rendered string and not on the clock**, and its argument is hygiene rather than throughput: measured, the counter beside its own spinner costs **0.4 frames a second**, because C03 folds six writes in ten into a frame already scheduled — but a write that changes nothing observable is still a `rev` bump, and it invalidates C14's height cache and says a document changed when it did not (F234). **`anyoneLooking` gates it, the same gate the poll uses** (I46): C22's ticker disarms when nothing on screen animates and this driver cannot see the viewport, so off screen the spinner stops while the counter would go on writing — at one whole frame each rather than 0.4, which is the condition the cost measurement was taken under and could not itself name. And the target is **the block currently in place**, never one remembered at declaration, because a fetch can fail between the arm and the fire; `attempt` is `src.failures` and therefore consecutive, reset by any success and shared by every part behind one source (§8d D6).
- **I53** — **A pending entry's elapsed readout re-composes on the one-second wake while it runs and stops when it settles**, through `readout(id, blockId, render)`: the figure is compared as a rendered string (I52's guard), written only while someone is looking (I46), and never after `settled`, `release` or a refused patch. One timer serves every readout — it is `armParts`'s wake, armed to `now + ELAPSED_TICK_MS` while any visible readout is live — and the stall detector's thirty-second re-arm is not the cadence, measured. The block the readout replaces is whatever `render` returns for the elapsed milliseconds, so the driver knows nothing of tool calls; `toolCallHeader` is the consumer's.
- **I54** — **The pending entry is the running card.** Step 3 appends `toolCallDoc` — one `step` header reading `verb(args)` — and registers its readout with the header's id before the transport is invoked; a queued entry's `queued behind` notice is *replaced* by the header when its route takes it and never before, so no figure counts a wait. The outcome is written into the header, with its final figure, exactly where settlement keeps the card — `settle(id)`: `exit N`, `cancelled`, `truncated`, `failed`, each patched **before** the settle — and not where settlement replaces it (`settle(id, doc)`), because there the document is the outcome and no header survives. The body is the entry's own appended blocks and the stall notice is a row of it; the card is drawn by nothing that reads `streaming`.
- **I55** — **Every settlement keeps the card.** `settle(id)` routes patch the header with its final figure and verdict before the settle; `settle(id, doc)` routes compose the replacement as the header over the result's blocks — `exit N`, `ok` or `failed` — so no route settles an entry that began as a card into a document without one (→ §*The pending entry is the running card*, §8g rows 6, 10, 11).
- **I56** — **The card's body is the result, hung under the hook.** On every route the blocks after the header are the entry's body and lay out through C22's `entryLayout` (C22 I83) — two cells in, `⎿` on the first row — and the shell composes no second indent of its own (→ §8g row 12).
---

## 8. Commitments

1. Seven routes, one per `ParseResult` kind; `empty` produces no entry (I1).
2. The pending entry is appended before the subprocess starts (I3).
3. Validation travels from C18 and is never recomputed (I4).
4. The submission guard covers every foreground route, is checked before the pending entry is appended, and **defers whole lines unconditionally**; streams are exempt (I5, I6). Deferral was refusal until 2026-08-15 — see I5, where the property is unchanged and only the mechanism moved.
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
16. C23 supplies the action dispatcher `pipeline.onAction`, and nothing below L4 dispatches one; `exec` re-enters the normal submission path (I16).
17. `open` is scheme-checked and never shelled (I17).
18. Actions from frozen entries are refused — every kind — by a patch to the source entry that names its recorded command; a re-run of that command is the one thing that fires from a frozen entry, through §2's submit (I18, → C16 I29).
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
29. A refresh names its part and is registered against its host, so one `release(host)` is every teardown path (I32).
30. A refresh stops on settle, pop, evict, clear and `stopping`, and keeps running through a freeze (I33, I9).
31. A refresh patches one `panel` in one op, and past `staleAfter` that panel's title carries its age rather than the screen going quietly wrong (I34, I35).
32. A local handler may ask a question and await the answer. It is a choice list, it is modal by C15's flag rather than by a second mechanism, and it resolves with a choice on every path including `Esc` and `⌃c` — so no caller distinguishes declining from cancelling, because nothing downstream could act on the difference (I36, C16 I25).
33. `enter` on a focused row fires its first action through C23's dispatcher. The binding is C16's, the dispatch is C23's, and the join is answered where C16 I22's focusable rows are — one walk, one answer (I37, C16 I26, F21).
34. The terminal contract is read from the invocation rather than the declaration, and it is read after validation — so both routes name one field and no verb is spawned ungated (I38, C05 I23).
35. A local handler that declines to name its context does not compile. The grant is only a grant if every consumer can see it, and four of eight could not (I39, F125).
36. Four producing routes are told one thing, in one shape, from one source (I40, C07 I17).
37. A bound is stated where a region defines the document and `null` where nothing does (I41, C07 I18).
38. Two parts reading one source read one sample of one instant: the key declares sameness, one fetch serves every part referring to it, and the whole set is applied before one commit (I42, I44).
39. A conflicting cadence on one key is refused at declaration rather than arbitrated, and the fetches themselves are taken on the key's word because nothing can compare them (I43).
40. Anything that accumulates is a fold over the source's versions, run once per version and shared; per-part state is view state only (I47).
41. A source polls only while something is looking at it, and stops nothing when it is not — no teardown, no release, and due again the moment a referring host is visible (I46, I45, I9).
42. A failure the pipeline swallows is said twice — once in the transcript at the time, once on the restored primary screen at exit — and C23 chooses only the first moment (I48).
43. A stage failure after the append finishes the sequence rather than abandoning it, and the entry id is returned whenever the entry exists (I49).
44. The framework's loading and failure boxes are `status` blocks whose state is read from whether a retry is coming, at the heights a frame chose rather than the ladder's preferred figure (I51).
45. An elapsed counter advances in the transcript while a first fetch is in flight, and stops writing when the figure would not change, when nobody is looking, and when the block it was armed for is gone (I52).
46. A `view` target resolves at any depth inside its own entry and no wider, and the two sites that resolve it — the open and the live re-read behind every motion — move together (I31).
47. A pending entry's elapsed readout advances once a second while the entry runs, on the one wake every readout shares, and stops moving when the entry settles (I53).
48. A running verb is a card — `⏺ verb(args)`, or the bare `⏺ verb` with no arguments, counting in whole seconds under the command row — from before the transport starts until it settles; a queued one is bare until its turn; a stream's final header carries its exit code, a cancelled one says so, and a listing's settled document has no header at all (I54).
49. **A finished verb is still a card** (I55). The invoke route, its error arm and the local route settle the header over the result; `⏺ ps(--all) · 0.4s · ok` above an indented table, `⏺ config(…) · 1.2s · failed` above the error. The reading that chose `❯ /ps` over a bare table is recorded beside its reversal.
50. **The result hangs under the hook** (I56). C22 I83's layout, reached by composing the document and nothing else.

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

### 8a-bis. The elapsed counter — a trace and a table, because it has both kinds

**Two artefacts, and taking only the trace would have missed half.** The tick is event-mediated
and wants a sequence; which fields are legible in which state holds at rest with no event
between, and wants a classification table. A component with state **and** structure needs both,
and taking the trace alone because the timer is the obvious thing is how the structural half goes
unexamined.

#### The sequence trace

| # | Sequence | Rules meeting | Outcome |
|---|---|---|---|
| B1 | tick fires → patch issued → **the first fetch resolves first** | the counter writes × `renderPart` replaces the panel | Both go through `put` on one entry and serialise. One stale frame, then the resolved content — **tolerated**, and the tick stops because B3's rule finds no `loading` block |
| B2 | tick fires → **the host was released** between arm and fire | the counter patches × `patch` returns `{ok:false, reason:"unknown"}` | **Tolerated silently.** I21 and §5 — `unknown` is not a failure, and `put` already returns `outcome.ok` |
| B3 | fetch **fails** → the box becomes `retrying` → the loading tick is still armed | the counter's target × the block currently in place | **Defect B3.** The tick would write `elapsedMs` into a `retrying` box. Fixed by reading the block in place, which is `put`'s own rule for `put`'s own reason |
| B4 | fail → **succeed** → fail | `attempt` is `src.failures` × `failures = 0` on success | Attempt 1 after a recovery — correct, and it is why the field is named for the count rather than for a total |
| B5 | two parts, one source, the source fails | `attempt` is the **source's** × each part draws its own arm | Same number in both boxes. §8d D6 already rules this and it is consistent — they back off together too |
| B6 | `stop()` between arm and fire | the tick is armed × `stopped` | Must check `stopped`, as `armParts` does — otherwise it patches a torn-down transcript |
| B7 | the entry **scrolls out of the window** | C22 I60a disarms the spinner × this driver cannot see the viewport | **Defect B7, and the sharpest.** Off screen the spinner stops and the counter keeps writing — **at one full frame each rather than 0.4**, because there is no longer a spinner frame to coalesce into. Fixed by `anyoneLooking` (I46), which already exists for the poll |

**B7 is the row the whole trace was worth.** The cost measurement in F234 is conditional on
something the measurement itself could not see: it was taken with the box on screen, which is
where the counter is free, and the arm that says *patch alone is ten frames* is the same
measurement describing the off-screen case without either of them being labelled that way.
**A number is measured under a condition, and a trace is where the condition gets named.**

#### The classification table

Structural — two rules both holding at rest, no event between them. **Run against the shipped
renderer rather than reasoned about**, which is what turned three of these from open questions
into answers (F234).

| state × fields | what the ladder does | ruling |
|---|---|---|
| `loading` + `elapsedMs` | `⠸ loading (4s)` | the arm |
| `loading` + `retryInMs` or `attempt` | both ignored | correct — no second countdown |
| `retrying` + `retryInMs` + `attempt` | `⠸ retrying in 8s (attempt 2)` | the arm |
| **`retrying` + `elapsedMs`** | elapsed **dropped**, countdown wins | **C09 I31 is implemented, not merely ruled.** *Three numbers on one line is one too many* is a sentence about a preference; the question the table asks is whether a consumer can construct the state and what happens when they do. It constructs fine and the renderer already decides |
| **`retrying` − `retryInMs`** | blank row, **and no spinner** | **Defect C1.** Every one-shot failure. The arm is `error` |
| `error` + any of the three | no activity line at all | which is why `error`'s height is **1** |
| `loading`, elapsed < 1s | no counter | a fast load must not flash one — already in `elapsed()` |
| `loading`, elapsed past 99s | `1m 40s`, never coarser than the second | so the write rate never falls of its own accord; F234 measured that it does not need to |
| a consumer's `renderLoading` returns a `status` | the counter must not overwrite it | C24 §5 — behaviour fixed, rendering overridable |
| host is a **view**, not the transcript | `put` branches to `updateView` | free, provided the write goes through `put` rather than round `it` |
| H = 2 inside `livePanel` | message + activity line | the arm |
| H = 3 inside `livePanel` | a second border inside the panel's | one row spent, nothing gained |

**C1 is a structural finding and no sequence could reach it** — nothing happens between *a
one-shot declares no interval* and *the fallback picks a state*. It is two correct statements
overlapping in a cell, which is the only place either artefact has ever found anything.

#### The readout — the rows the trace adds (I53)

| # | sequence | rules that meet | ruling |
|---|---|---|---|
| R1 | readout armed → the entry **settles** → the wake fires | `settled` × the sweep | `settled(id)` deletes the readout before the wake, so the settled header keeps its final figure. Without the deletion the settled entry would keep counting — the running card's defect, inverted |
| R2 | readout armed → the entry is **evicted** → the wake fires | C13's cap × `transcript.patch` | the patch returns `{ok:false}` and the readout is dropped on the refusal, as `put` tolerates a released host (I21, §5) |
| R3 | two readouts on two entries → one wake | I53's one timer × I52's arming | `armParts` arms once to `now + ELAPSED_TICK_MS`; both are written in one sweep and one `commit("stream")` |
| R4 | readout armed → the host **scrolls off screen** → the wake fires | I46 × the readout | no write and no arming — the counter's gate; `visibilityChanged` re-arms when it is back |

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
| an app verb whose flags decide the contract | structural, not sequential | Resolved at C05 (I23), and the rows where two declarations meet are C05 §8a's table. It is here to record that a trace was asked and is the wrong artefact: there is no event between a tool's declaration and a flag's |
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
| `builtin` | apply, notice | **deferred whole** (B4) | deferred | |
| `builtinThenShell` | apply, delegate | **deferred whole** (B4) | deferred | |
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

**Ruled: the whole line, together. Nothing half-happens.**

**And it survived the mechanism changing under it, 2026-08-15**, which is the
test a ruling of this shape gets. I5 now **defers** rather than refusing, so the
`cd` is no longer lost — it runs when its predecessor settles, in the order the
reader typed it. Every sentence below is about *partial effect* and none is about
*discarding*, so the ruling holds verbatim and only its last line gets cheaper:
losing the `cd` used to cost four characters of retyping and now costs nothing.
**A ruling whose argument names the property rather than the disposition is one
that does not have to be re-taken**, and the contrast is I5's own old wording,
which put *never queued* beside the property and made the disposition read as
load-bearing.

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

## 8c. The sequence trace — a shared source through its lifetime

§3c's mechanism has state **and** structure, so it gets both artefacts. This one takes the
event-mediated interactions: two rules that meet because something happened in between. §8d
takes the structural ones, and taking the trace alone because a driver is the obvious state
machine is how the structural half goes unexamined.

| # | Sequence | Rules meeting | Outcome |
|---|---|---|---|
| C1 | fetch in flight → one referring host released → **resolves** | I21's `unknown`-is-not-a-failure × I44 | That part is released; the source polls on for the others — correct |
| C2 | fetch in flight → **every** referrer released → resolves | C1 × I45 | Result dropped, **no backoff**: nothing failed. See below |
| C3 | settle: `release(host)` → `declare(host)`, one key in both documents | I33a's ordering × the refcount | **Defect C3.** The source and its derivation are destroyed and rebuilt empty, on every settle |
| C4 | fetch in flight → a second host declares the key → resolves | I44 × "one fetch per tick" | The new part renders this resolution, not the next — correct, and it is I44's second clause |
| C5 | source fails → backoff → a new part declares the key | I21's backoff × declaration | It inherits the backed-off cadence and renders a failure it did not witness — correct, and §8d D6 is why |
| C6 | host scrolls off **while a fetch is in flight** | I46 × I44 | The resolution is applied; the *next* tick does not happen (I46's last clause) |
| C7 | `stopping` set while a shared fetch is in flight | §8b B1 × I46 | Unchanged: the driver is released where `stopping` is set, above the ticks |
| C8 | one of two hosts sharing a key is **evicted** | I33's heard-not-checked × the refcount | Decrement; the source keeps polling for the survivor |

### C3 — release-then-declare resets what a derivation exists to accumulate

**The refcount is the obvious implementation and it is wrong at exactly one moment.**

I33a settles by releasing the host's parts and then declaring the settled document's, in that
order, synchronously — C13 emits `settle` inside the `settle()` call, so the teardown runs
first and the declaration follows it. A source retired the instant its last part is released
is therefore retired *between those two calls*, and rebuilt by the second one with an empty
derivation.

**Nothing about the frame would say so.** The panel still draws, the fetch still runs, the
title is still right; what is gone is the history — a sparkline that resets to one point
every time its entry settles, which is a state no assertion about the *current* value can
see. It is the class A03 §2 names: each operation is correct and the sequence is not.

**So a source with no referrers is retired on the next sweep, not at release** (I45). That is
the same disposition I33 already takes for eviction — *heard rather than checked*, one tick's
grace — and it makes C2 fall out of the same rule instead of needing its own: a resolution
arriving for a source nobody refers to has somewhere to be dropped, and a source that is
genuinely finished is collected one sweep later at no cost.

**And it is a ruling whose rejection path was asked about.** Retiring lazily means a source
can exist with a refcount of zero, so the sweep must not treat *no referrers* as *nothing to
do* and re-arm forever on it. The retirement is the sweep's, and the timer arms to the
soonest **referred** source.

### C2 — nothing failed, so nothing backs off

A resolution whose every referrer has gone is not a failure and must not touch
`consecutiveFailures`. The distinction is I21's own — `{ok:false, reason:"unknown"}` means
the host is gone rather than the far side is unwell — and sharing gives it a second instance
one level up. Backing off here would mean a source that lost its readers polls *more slowly*
when they come back, which is the opposite of what I46 promises.

---

## 8d. The classification table — two parts and one key

The structural half: rules that both hold at rest, with no event between them. Indexed by
rule interaction, so every row is a cell where two correct statements overlap; a row governed
by one rule restates that rule and finds nothing.

| # | Cell | Rules meeting | Ruling |
|---|---|---|---|
| D1 | one key, different `every` | I43 × "a part declares its interval" | **Refused at declaration**, naming both parts and both values, **in the losing part's panel** — a throw here is swallowed by §5's bare catch and the author sees nothing |
| D2 | one key, different `fetch` closures | I42's claim-of-sameness × functions are incomparable | First declaration's closure runs, **unchecked**, and I43 says so outright |
| D3 | one-shot sharing a key with a periodic part | A02 §7 rule 3 × I43 | **This is D1**: `0 ≠ N`. Not a separate case, and saying so is what stops a second arm appearing |
| D4 | two one-shots, one key | rule 3 × I44 | One fetch, both parts render it, the source is `done` after one attempt |
| D5 | a declared key spelling another part's **implicit** one | I42's *every part has a source* × the key declares sameness | **Defect D5.** The namespaces must be disjoint by construction |
| D6 | a failing source, one part with a custom `renderError` and one with the default | I21's containment × the source's backoff | Each part renders its own error at its own size; the backoff is the **source's** and is counted once |
| D7 | one key across an entry host and a view host | I32's `release(host)` × the refcount | The source outlives one host's release while the other refers to it |
| D8 | a part with `derive` and one without, one source | I47 × "render receives the derivation's output" | Independent: the underived part receives the source data unchanged |
| D9 | one source key, one derive key, different `compute` | D2 one level down | First wins, unchecked — the same sentence, and it is stated once rather than twice |
| D10 | `staleAfter` per part on a shared source | I35 × I44 | **The axis I44 does not check.** Owed, below |

### D5 — an implicit key a consumer can spell is two parts sharing a fetch by accident

I42 makes every part have a source so there is one code path. The implicit key is built from
the host and the part id — and if it is built as, say, `entry:e1:cpu`, then a consumer whose
`source` string happens to be `entry:e1:cpu` shares a fetch with a part that never asked to.

**Two unrelated parts polling one source is the exact inverse of the defect this row fixes**,
and it would look correct: one fetch, two panels, consistent numbers. The frame would be
*more* self-consistent than before.

So the two namespaces are disjoint by construction rather than by convention — the implicit
key carries a prefix no `LiveSpec.source` can contain, and the check is the construction
rather than a validation. **A rule that depends on nobody choosing a particular string is not
a rule.**

### D6 — containment is the part's and backoff is the source's, and they are different words

I21 says a failing refresh is *contained to its declared part*. With one fetch behind two
parts, "the failure" is one event and "the part it is contained to" is two panels — so the
sentence has to be split rather than reinterpreted:

- **Rendering** is per part: each draws its own `renderError` at its own size, and a part
  that overrode it still gets its override. A02 §7 rule 1 is structural because the panel
  border *is* the part's size, and that is unchanged.
- **Backoff** is per source, counted once. Doubling it once per referring part would treat
  one unwell far side as N of them and reach the five-minute cap in `log₂N` fewer steps.

The two halves were one word in I21 because until now a part and a poll were the same thing.

### D10 — the axis I44 does not check, and it is left owed

**I44 guarantees the data and says nothing about the moment.** Two parts on one
`sourceVersion` hold one sample — and their *titles* can still disagree, because staleness is
measured per part from its own `lastOk` (I35). A part that was paused and has just returned
carries `· 14s ago` beside a sibling reading the same version with no marker at all.

That is the same shape as row 1's window property, which held exactly while every row moved
sideways: **an invariant satisfied on the axis it names, and silent on the one the reader
sees.** It is recorded here rather than fixed, because moving staleness from the part to the
source is a decision about I35 and taking it from inside a sharing change is deciding one
invariant to suit another.

---

## 8e. The classification table — five statements under one catch

The subject is `appendAndCommit`'s bare `catch`, and the index is **which statement threw**.
A sequence trace cannot reach these: nothing happens *between* the statements, so the rules
that meet here meet at rest. §5's own row is written as though the first statement were the
only one that can throw, and that is the finding rather than a consequence of it.

The try body is `append` → `declareLive` → `recordHistory` → `resetFocus` → `commit`.

| threw | entry | parts | history | focus reset | commit | `return` |
|---|---|---|---|---|---|---|
| `append` | — | — | — | not needed | catch | `null`, **true** |
| `declareLive` | **yes** | none | **no** | **no** — E1 | catch | `null`, **false** — E2 |
| `recordHistory` | yes | yes | no | **no** — E1 | catch | `null`, **false** — E2 |
| `resetFocus` | yes | yes | yes | no — E1 | catch | `null`, **false** — E2 |
| `commit` | yes | yes | yes | yes | **twice** — E3 | `null`, **false** — E2 |

### E1 — the catch abandons `resetFocus`, and T4.7b says what that costs

**The reset sits between the append and the commit and the order is load-bearing**: T4.7b
asserts the call order because *"a reset issued after the commit paints one frame with focus
in a frozen block"*. Skipping it entirely is that failure without a bound — the append froze
the previous entry and focus is still inside it, on every frame from then on, until something
unrelated resets it.

**Ruled: the catch finishes what the try did not** (I49). It is the same argument §8a A5 made
for the guard — a stage failure is not a licence to abandon the rest of the sequence — and
that ruling was taken about `running` while three of the four statements after the append
went unexamined.

**Reachability is stated rather than assumed.** Row 2 of this table is the one that happened:
the cadence refusal thrown from `declare` (I43, F15). Since that refusal is drawn rather than
thrown, `declareLive` has no *known* throw today, and rows 3–5 have none either. The remedy
is structural because the table is — a catch that covers five statements and repairs one is
wrong independently of which of the other four currently throws.

### E2 — the return value is a lie in four rows of five, and nothing reads it

`appendAndCommit` returns `string | null` and **all nineteen call sites discard it**, several
with an explicit `void`. So the function's only channel back to its caller is unused — which
is why the swallow is total by construction, and why the fix has to be a channel rather than
a return code.

`null` means *no entry* to any reader of the signature, and in rows 2–5 the entry exists.
**Ruled: the id is returned when the entry exists**, which costs one variable and removes a
statement that is currently false. It is latent only because nothing reads it, and that is
the class that bites on the day something does.

**And it has no test row, which is the same fact stated from the other side.** Nothing can
observe the return value without adding the consumer the row would be testing for, so the
correction lands in the code and is named here as unobservable rather than given a row that
asserts against a caller written to make it pass. T1.47 covers the reset, which is the half
this table found and the half that reaches a frame.

### E3 — a `commit` that throws is committed again by the catch

§5's own last row says C03 contains a commit failure and flags contamination for the next
frame, so this row is very likely unreachable — and **a row governed by one rule restates the
rule and finds nothing**, which is what makes it worth writing down rather than deleting.
It is not made unreachable by anything in C23, so the catch's commit is the last statement in
it and nothing follows that could depend on it.

### What the table settled about the fix itself

**The reporting path is the path that failed**, and that is the constraint the whole row
turns on. Every other containment path in C23 ends in an appended document; this one cannot
assume it can append, because the append is what threw in row 1. So the report has two
channels and they fail independently: an entry at the moment (§5a), and an accumulation read
after the terminal is restored (I48). The second one is the one that survives row 1.

---

## 8f. The classification table — the pending entry's states × the card's parts

Indexed by rule interaction: each cell is where a state rule (C13 §2, roadmap 33, §3b, §6) meets
a part rule (§9c's grammar, I53, C13 I13). A cell governed by one rule restates it and is left
blank.

| state | header | figure | outcome | body | stall row |
|---|---|---|---|---|---|
| dispatched, < 1 s | `verb(args)` | none drawn (`elapsed()` < 1 s → `""`) | — | none | — |
| running | same | `· Ns`, on the shared wake | — | appended blocks, under the header | — |
| queued, waiting | **P2** `queued behind X` — a `notice`, not a `step` | **P1** none: the clock has not started | — | — | — |
| queued, routed | **P2** header *replaces* the notice, same entry | starts here | — | — | — |
| stalled | same, still counting | same | — | same | **P4** `⎿ no output for 2m`, appended after the body |
| resumed | same | same | — | same | replaced in place: `resumed after 2m` |
| settled by `settle(id, doc)` | **P3** gone — the document replaced it | gone | the document's `status`/`error` | the document's | gone |
| settled by `end` | kept | final figure | **P3** `exit N`, written before the settle | kept | kept (A4: already `resumed after`) |
| cancelled (Ctrl-C) | kept | final figure | **P5** `cancelled`, before the settle | kept | kept |
| evicted or cleared under the route | **P7** the readout's patch is refused → it drops itself | — | the route's own patch is refused → `unknown` arm, it returns | — | — |
| malformed patch / stream throw | kept | final figure | **P8** `truncated` / `failed`, before the settle | kept + the warn/error notice | kept |

### P1 — a queued entry is `streaming` and the readout counts from registration

Roadmap 33 made the queued notice `streaming: true` so the queue is visible; I53 starts the clock
when `readout` is called. Both correct, and registering where the entry is appended — the
natural place, since that is where the fresh pending entry does it — counts the wait as the run.
The readout is registered where the route takes the entry.

### P2 — the queued notice has no delete, and nothing replaced it

`ViewPatch` has no delete, so the header must *replace* the queued notice's block. **The table
asked what replaced it today and the answer was nothing**: the route used `Settle.into` as its
pending id and left the notice in place, so on the stream route the entry settled reading
*queued behind /logs*. Not visible on the invoke route, where `settle(id, doc)` throws the whole
document away — which is why it shipped.

### P3 — the outcome has a home on one settlement and not the other

C13 §5: `settle(id, doc)` replaces, `settle(id)` keeps. The design's *outcome in the header*
holds on the second and cannot on the first, because after step 6 there is no header. The ruling
follows the store rather than the drawing: the document is the outcome where it replaces the
card, and only a route whose settle keeps the card writes into it.

### P5 — the canceller settles without a document, so the card survives it

`cancelThis` calls `transcript.settle(pendingId)` — no document — on both routes, so the header
outlives a cancel and must say so. On the invoke route the aborted transport then rejects into
the catch, whose `settleWithDocument` finds a settled entry and is refused (§8a row 7): the card
stands with `cancelled` and the error document never lands, which is what T3.4 already asserted
of the entry and now asserts of the header.

### P7 — a refused patch is the same answer twice

An entry evicted under a running route refuses the readout's patch (it drops itself, I53) and
refuses the route's body patch (`unknown`, §8a A2's third arm). Two mechanisms, one store answer,
no coordination needed — confirmed rather than found.

### P8 — the error arms already appended a notice and settle without a document

Malformed patch and stream throw both `append` a notice and `settle(id)`. The header takes a
verdict before that settle for the same reason `end` does; the appended notice carries the why.

## 8g. The sequence trace — one card from dispatch to settle

`/tail web.log` on a real transcript with the harness clock (T4.40, T4.44). **Indexed by rule
interaction**; the events are the mechanism and the cells are where two rules meet.

| # | Sequence | Rules meeting | Outcome |
|---|---|---|---|
| 1 | submit → guard → append card → `readout` → `watch` → `stream` | I3 × I53 × §3b | header bare; a 1 s wake armed; stall clock started. Order: I3 puts the card before the transport, I53 puts the readout before the first wake can fire |
| 2 | 1 s wake | I53 × I52 | `· 1s` written once, `rev` moves once; the guard is the string |
| 3 | patch → `append` body | step 4 × §9c body | the block lands *after* the header — C13 `append` is positional and the header is block 0 |
| 4 | 120 s silent → stall notice | I25 × §9c body | `⎿ no output for 2m` appended after the body; the header is `· 2m 0s` on the same frame — two writers, two block ids, one entry |
| 5 | patch → `sawPatch` | A4 × I53 | stall row → `resumed after 2m` in place; the readout untouched |
| 6 | `end` → **final header** → `settled` → `settle(id)` | I54 × C13 §6 × C13 §5b.2 | **the order is the ruling**: header patched with `· 2m 31s · exit 0` first; `settled` drops the readout; `settle` freezes it and persistence writes what it sees. Reversed, the patch still lands — the shell may write to a settled entry — and the persisted row has no verdict (T6.82) |
| 7 | a wake after 6 | I53 × C13 I13 | the readout is gone, nothing is written — a settled card keeps its final figure |
| 8 | Ctrl-C at 3 instead | C16 rung 1 × I54 × §8a row 7 | header `· Ns · cancelled` then `settle(id)`; the abort's rejection reaches a settled entry and is refused |
| 9 | `/ps` queued behind 1, routed at 6 | roadmap 33 × I53 × P2 | the notice is replaced by `ps()`'s header, same id; its clock starts at 6 not at enqueue |
| 10 | `/ps --all` on the invoke route → adapter returns → `settle(id, doc)` | I55 × C13 §5 × C22 I83 | the replacement is `header(0.4s, ok)` over the adapted blocks; persistence writes the card because it is inside the document the settle carries; the table renders at `width − 2` under `⎿` |
| 11 | the adapter throws → the error arm's `settle(id, doc)` | I55 × §3 step 6 error arm | `header(elapsed, failed)` over `errorDoc`'s blocks; the status box is the body and the verdict is the header's — two statements of one fact, and the second is the one 1-bit keeps |
| 12 | a local verb (`/config`) → `completeLocal` → `settle(id, doc)` | I55 × I56 × the local route | the same composition; a local verb is a call by §18's rule (*the tools are the manifest*) and reads as one |

**What the trace confirmed rather than found**: rows 2, 5 and 7 are I53's own rows (T3.61) seen
from the route — the driver's contract held without change once the producer existed.

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
- **T1.30** (I19): the stall timer **re-arms**. Two silences separated by output produce two notices, driven on a scheduler that fires each armed callback **once**, as `setTimeout` does. Against a harness that re-fires unconditionally a one-shot mechanism and a periodic one are the same test, which is how this went two components unnoticed.
- **T1.31** (I20): `assignOffsets` over the five cadences of S13 §3 → five distinct offsets, and no two parts share a tick across the smallest common window.
- **T1.32** (I21): a part whose `fetch` rejects three times then succeeds → intervals double to the cap and reset, and its siblings patch on every one of their own ticks.
- **T1.33** (I21, A02 §7 rule 2): a part whose `render` throws → the error renders in place and **the interval does not move**. The control is the same part failing in `fetch`, which does back off — without it the row passes for a driver that never backs off at all.
- **T1.34** (I21, rule 3): a part declaring no interval, failing → rendered once, never retried.
- **T1.35** (I34): one tick produces exactly one `replace` and one `rev` on the host, and the replaced block is a `panel` whose children are `render`'s output.
- **T1.36** (I35): a part whose data is older than `staleAfter` → its panel's title carries the age; the next success clears it **and the part never stopped ticking**.
- **T1.38** (I33a): a `b.live` part returned by an **adapter** is driven — the document reaches the transcript through `settle(id, doc)`, and the part ticks. Asserted on both routes in one row, because a test exercising only `append` passes against the defect: that is the whole of how it survived. The local-route half is the control, and it must be shown to tick before the adapter half's failure means anything.
- **T1.37** (I25): a stall notice is appended once per silence, not once per tick — the row that fails when the timer is armed inside the loop rather than around it.
- **T1.39** (I42, I44): two parts naming one `source` → **one** `fetch` call per tick and both panels carrying the same value. **The control is the same two parts with no `source`**, which must show two calls and two different values — without it the row passes against a driver that never fetches at all, and the two-values half is the defect F91 was filed on.
- **T1.40** (I43): two parts, one key, different `every` → the losing part's panel carries a message naming **both** part ids and **both** values, and that part never fetches. Asserted on the rendered block rather than on a throw: the throw was the first implementation and it was invisible from every transcript route, so a row that caught an exception would have passed against a session showing two loading panels for ever. The fetch count is the second half — a refusal that still polls is not one.
- **T1.41** (I47): a derivation read by two parts → `compute` runs **once per source version**, not once per part, and `prev` carries the previous fold. Three versions, because two pass against an implementation that recomputes from scratch each time.
- **T1.42** (I45): settlement's release-then-declare on a key both documents name → the derivation's accumulation **survives**. The assertion is the accumulated history and not the current value: a source destroyed and rebuilt renders a perfectly correct latest sample.
- **T1.43** (I46): a host off screen → no `fetch` across several intervals; visible again → a `fetch` immediately, not on the next interval. Both halves in one row, because a driver that pauses and never resumes satisfies the first.
- **T1.44** (I42): a part whose `source` string is spelled to look like another part's implicit key → the two do **not** share. A fabricated violation, because the namespaces are disjoint by construction and the row is otherwise vacuous.
- **T1.45** (I48): a `transcript.append` that throws → the reason appears in `pipeline.faults`, carrying the store's own sentence rather than a summary of it. F15's document — two blocks with one id — is the input, so the row fails if the message is replaced by a generic one.
- **T1.46** (I48): the same cause swallowed five times → one entry in `faults` and one notice in the transcript. A per-tick failure would otherwise fill both.
- **T1.47** (I49): a throw from a statement **after** the append → `resetFocus` is still called and the entry id is still returned. Asserted on the spy and the return value together: the reset alone passes against a catch that resets and still returns `null`, which is §8e E2 unfixed.
- **T1.49** (→ C04 I13): `/debug` renders `origin` for a fault notice. **The arm's justification, made durable** — `defect` earns a fifth arm on a public union only because it separates a contained failure from a verb that did nothing *in the one field that could say so*, and that holds only while something displays it. Checked by reading the handler before the arm landed; this is the same answer for whoever edits that handler next.
- **T1.48** (I1, §8b B1): a swallowed append → the transcript holds **one** entry, and it is the fault notice rather than the submission's. The count and the identity, because a row asserting only the count passes on the day the notice is the wrong document.

### Tier 2 — contract / interface

- **T2.1** (I2): a fault injected at each of the eight stages in §5 → a document is appended and the session survives, eight times.
- **T2.11** (I24): the composed height of an appended entry equals `measureSequence` over its blocks (C09 I17), for a document with gaps and one without. C23 contributing a single row of its own fails both.
- **T2.2** (I1): across a thousand random submissions, entry count equals submission count minus empties.
- **T2.3** (I13): a spy on every component proves no cross-layer effect originates outside C23.
- **T2.4** (I8): commit reasons match the documented class for every route.
- **T2.5** (I15): for a corpus of inputs, the entry's `command` and the spawned argv correspond under D24's one-token mapping.
- **T2.6**: every `ParseResult` variant has a route — exhaustive over the union.
- **T2.7** (I14): a source scan finds no multi-store access outside local handlers.
- **T2.20** (I32): `release(host)` is reached on all five triggers of I33 — enumerated from the trigger list rather than written out, so a sixth trigger added later fails here.
- **T2.21** (I33): a **frozen** host keeps receiving refresh patches, and a settled one does not. Both halves, because a driver that released on neither passes the first alone.
- **T2.22** (I22, SS46): every append in `src/` carrying `origin: "refresh"` is one of the four §3a names, and every one of the four is reached. A count alone passes for a fifth site added beside an existing one.
- **T2.23** (I44): **one commit per source tick**, whatever the number of parts sharing it — one, two and five, so the row is a property rather than a case. The frame count is already coalesced by C03's 33 ms `stream` window, so the assertion is on the commit calls: the thing this constrains is `rev` bumps and C14 invalidations, and only the commit count can see them.
- **T2.24** (I46, I33): pausing releases **nothing**. Across a scroll away and back the host stays declared, its part set is unchanged, and I33's five triggers remain the only teardown — enumerated from the same trigger list T2.20 uses, so a pause implemented as a release fails both rows.

### Tier 3 — edge cases

- **T3.20** (I31): a `view` action whose `target` names a block in a *different* entry → refused, patched into the source entry, and nothing is pushed. The control is the same action naming a block in its own entry, which pushes — without it the assertion passes for a dispatcher that refuses every view.
- **T3.60** (I31): a `patch` inside a `panel`, opened by id → the view pushes **and a motion afterwards still finds it**. Two assertions because there are two resolutions: with only `open` fixed the view opens and the first `j` dismisses it as `anchorEvicted`. The control is the same patch at the top level, which passes on both sides of the change and so says the row is measuring the nesting rather than the fixture.
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
- **T3.30** (I32): a tick whose host was **evicted between arming and firing** → the patch is refused `"unknown"`, the part is released, and the backoff does not move. A host gone is not a transport that failed.
- **T3.31** (I43, §8d D3): a one-shot part sharing a key with a periodic one → refused **by D1's message**, in the losing panel, with no second wording. The row exists so that a later arm for one-shots fails here rather than reading as a feature.
- **T3.32** (I45, §8c C2): every referrer released while a shared `fetch` is in flight → the result is dropped and `consecutiveFailures` is **unmoved**. The counter is the assertion; a row checking only that nothing crashed passes against a driver that backed off.
- **T3.33** (I21, §8d D6): a shared source failing, one part with a custom `renderError` and one with the framework's → each part renders **its own** arm, and the backoff doubles **once**. Two assertions, because I21's single word *contained* split into two: rendering is the part's and backoff is the source's.
- **T3.39** (I33): a tick whose host **settled between arming and firing** → refused `"settled"`, released, no notice.
- **T3.40** (I21): a tick firing while that part's previous `fetch` is still in flight → the second is not started. Without the guard a slow source stacks ticks until the interval is meaningless.
- **T3.41** (I12): `stopping` set after a `fetch` resolves and before its patch → nothing lands.
- **T3.34** (I20): more parts than the smallest interval has milliseconds → offsets remain distinct. `floor(smallest / n)` is zero here, which is I20 violated by the function written to satisfy it.
- **T3.35** (I34): a `render` returning a block whose id differs from the part's → the mismatch is reported, not silently applied to nothing.
- **T3.36** (I35): `staleAfter` below the interval → warned at declaration; staleness would otherwise fire on every tick.
- **T3.37** (I48, §8b B1): a swallow while `stopping` → recorded in `faults`, **no notice appended**. B1's ruling reaching a fourth non-submission append rather than a fourth exception to it.
- **T3.38** (§5a): a transcript whose `append` throws **unconditionally** → the fault notice cannot land either, and `faults` still carries the reason. The end of the ladder, fabricated rather than stated: the frozen shape is a claim about a construction path, and the glyph defect is how F15 was found.
- **T3.61** (I53): a readout registered on a pending entry → the header reads `name(args)` at t=0, `name(args) · 4s` once the clock has advanced four seconds and the wake has fired, and the same string after `settled` however far the clock advances. Two readouts share one armed timer, and a hidden host arms none.

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
- **T4.40** (I54, with C13, §3d-bis): through `submit` and a real transcript, a streaming verb's entry reads `tail(web.log)` at t=0, `tail(web.log) · 4s` after four one-second wakes, holds the streamed blocks *under* the header, and reads `· 4s · exit 0` after `end` — unchanged by any wake after it. Driven through the pipeline's own route, never by calling `readout`: *a test that calls the mechanism misses the wiring*.
- **T4.41** (I54): a line queued behind a running verb reads `queued behind tail` while it waits, gains no figure however far the clock advances, and reads `tail(web.log)` — the same entry id — the moment it is routed, its figure counting from there and not from the enqueue. Before the fix the entry settled still reading *queued behind*.
- **T4.42** (I54, with C16): Ctrl-C on a running stream → the header reads `· Ns · cancelled` and the entry is settled; a later wake changes nothing.
- **T4.43** (I54, I55): the invoke route → the card is on screen while the transport runs and the settled document is the adapter's blocks under the card's header — one `step` block, at block 0. (Read *with no `step` block in it* until 2026-09-05; I55 reversed it.)
- **T4.44** (I54, I25, with §3b): two minutes of silence → `no output for 2m` is the card's last row, under the streamed body, while the header goes on counting; a patch replaces it with `resumed after 2m` in place; `end` settles with the header's final figure above both.
- **T4.45** (I54): the four frames — running, stalled, resumed, settled — rendered in colour and read; the `⎿` hook and its column are the same on the stall row and on the record that replaces it (F789).
- **T4.46** (I54; F795): `/ps` with nothing after the verb → the header reads `ps`, then `ps · 2s`; T4.43 one row up is the control, where `ps(--quiet)` keeps its parentheses.
- **T4.47** (I55): `/ps` on the invoke route, a throwing adapter, and a local verb each settle to a document whose block 0 is the `step` notice carrying `⏺ verb(args) · Ns · ok|failed`, followed by the result's own blocks in order; the persisted document at the settle change carries the same block 0.
- **T4.48** (I56, C22 I83): the frame after `/ps` settles shows the table's first row beginning at column 2 under `⎿ ` and the header at column 0; the entry's measured height equals its painted rows.
- **T4.9** (with C14): appending while the viewport is detached does not move it (C14 I4, from this side).
- **T4.12** (I36, entry 16 R1): the question opens on the choice marked `default`, not on the first. **A safety defect, and every navigation assertion agrees with the wrong answer** — arrows move, `⏎` resolves, accelerators fire, and a destructive verb's confirm sits on `yes`. Read from the frame: the claim is which row carries the marker.
- **T4.13** (C09 I22, F122, entry 16 A5): the choices are a **block**, so the marker is a slot L1 resolves and no glyph is written at L4. Asserted on the ASCII rendering rather than on the type, because a file that stopped taking the capability and still spelled `•` would compile and would draw `•` on a `LANG=C` terminal.
- **T4.14** (entry 16 A5): the labels line up whether or not a row is marked. A glyph is part of a cell's width rather than an addition to it, so a marker sharing the key's cell shifts the marked row two columns left of the others — self-consistent in every count, visible only by reading the rows against each other.
- **T4.15** (I36, entry 16 R1): a question with no choice marked falls back to the **last**, which is where the safe option conventionally sits. It was first written as a mutation exemption on the grounds that no caller reaches it; it is one line of `ask()` away, and an exemption for a constructible state is a gap wearing a reason.
- **T4.16** (entry 16 A5): the key column fits the widest accelerator. Two-character keys are legal and a floor taken from one of them truncates the other, which reads as a rendering flicker rather than as a width defect — C19's own argument for putting its glyph in the floor.
- **T4.17** (entry 16 A3, A6, C15 I20): placement is a parameter, and width is not derived from it. Both arms in one row, because a confirm that is always centred passes an assertion about `left` and one that is always anchored passes an assertion about the anchor. The centred arm declares `CONFIRM_WIDTH`; the anchored arm declares none, which is how a layer says *the whole region* — a question anchored to the prompt is chrome for the prompt.
- **T4.18** (entry 16 A6, C15 I14): the anchored question is still not escapable. The cell nothing in the tree produced until now, and the pairing that must not move with the placement: the symptom of getting it wrong is *the shell froze*, three components from the cause.
- **T4.28** (I36, entry 16 R2, C15 I8): a question the region cannot hold **keeps its choices** and drops its payload for `…`. **The defect a frame found and no assertion could**: the compositor writes `lines[0 … height)`, so a box that does not fit loses its tail — and this box's tail is the answers. Measured on an ordinary 24-row terminal with a twenty-row payload: the question and ten rows of detail were drawn, and no `[y]`, no `[n]` and no bottom border, with the keys still working and nothing on screen saying so. An appended indicator was never the shape, because an extra row at the end is the first thing lost. **The residue is named**: `maxHeightFraction` is raised to 0.8 because a question is not an advisory overlay, and that reduces the case rather than removing it — a fraction caps a proportion where this wants a minimum, so below about nine rows even the collapsed form is taller than any fraction of the region, and C15 draws it truncated rather than absent (C15 I18).
- **T4.29** (entry 16 R2): a question that fits keeps its payload. T4.28's control, and it cannot be folded in — dropping the detail unconditionally satisfies every assertion in it.
- **T4.30** (entry 16, C15 I7): the anchored question flips when there is no room above. **The check step 3 opened with, and it came back *already true*:** `prefer` is a field of `{kind: "anchored"}` and nowhere else, so a centred layer has no flip to express and the type says so without a comment. The confirm inherited the flip the moment it could be anchored. The row's own first draft asserted the case it was not written for — the truncation collapse fires first and the short form fits above — which is two rules meeting and the fixture agreeing with the wrong one.
- **T4.31** (entry 16 R1, I36): one selection store, two supplied starts. **The last step and the smallest**, because the walk measured the cycling as identical in both copies and the start as the whole of the difference. The mutation the row exists for is a store that opens at 0: it passes every navigation assertion, every single-choice case and every menu row, and puts a destructive verb's confirm on `yes`.
- **T4.32** (I36): what opens is what `Esc` resolves with. *The marked one, else the last* was written twice — once for the opening index and once for the escape answer — and two records of one fact disagree eventually. A question that opens on `no` and escapes to `yes` is the worst possible pair, so the row asserts the pair rather than either half.
- **T4.33** (entry 16): the whole entry read from one frame at 24 rows with a twenty-row payload — the size both of step 3's defects lived at. The box fits its rows, the payload is elided, the safe answer is drawn and marked, and the box closes. **One row for four claims**, because each is satisfied by the half that is easy: a marker on the right row says nothing about whether the choices are drawn.
- **T4.20** (with C13, C24): a `b.live` part in a real entry ticks, patches, and stops when C13 evicts the entry — the eviction heard from the store rather than checked on the next tick.
- **T4.21** (with C15, C24): the same part declared on a pushed view is driven by the same code path, and popping the view releases it (C24 I12, from this side).
- **T4.22** (with C22): the driver is released at C22 §8 step 1, **before** `beforeRelease` — asserted on call order, since a release afterwards is invisible to any test that does not have a fetch in flight.
- **T4.25** (I44, with C22, C13, C14): the reference app's shape through a real session — two parts of **one document** sharing a key, read from **one composed frame**, showing one value. The frame and not the fetch count: an arithmetically consistent driver can still be patching two panels from two samples, and only the frame says which was on screen. This is the row `tools/bench/pollers.mjs` measured `19 vs 20` against before the change.
- **T4.26** (I46, with C14): the same document scrolled out of the viewport → the fetch count stops advancing; scrolled back → it advances again and the first frame after the return is current. The count is taken from a spy on `fetch` rather than from the panel, because a paused part still draws whatever it last held.
- **T4.27** (I48, with C22, C24): **the row belongs at the public entry**, because every driver-level assertion could already see these throws and no app author ever could. Through `createTui`: a local handler returning F15's exact document, the frame read for a fault notice carrying the store's sentence, then `stop()` and the **restored primary screen** read for the same reason among the diagnostics. One row spanning both channels, since either alone is satisfied by the half that is easy.

### Tier 5 — e2e

- **T5.1**: a session of fifty mixed submissions — app, shell, built-in, local, error — every one produces exactly one visible outcome.
- **T5.2**: a slow verb → the command appears immediately with a running indicator, then completes.
- **T5.3**: `/ps --watch`, then five more commands → the watch keeps updating while focus stays on the newest block.
- **T5.4**: Ctrl-C during a real streaming verb → partial output retained, prompt returns, no orphan.
- **T5.5**: an app verb piped to `jq` → delegated whole, raw output rendered.
- **T5.6**: `cd` into a directory, run a verb, `cd -`, run it again → each lands in the right place.
- **T5.20**: a real session with a live part whose source fails and recovers → the placeholder, the data, the error with a visible countdown, and the data again, with the rest of the screen unmoved throughout.

### Tier 6 — fail-on-revert

- **T6.21** (I31): resolving a `view` target against the whole transcript instead of the source entry → T3.20 fails. The revert that looks like a generalisation, and it is the one a reader reaches for when a target legitimately names a block they can see on screen.
- **T6.73** (I31): resolving a `view` target with a top-level `find` → T3.60 fails. T6.21's mirror and the direction it does not cover: that one refuses a revert that reads *wider*, this one a revert that reads *shallower*, and the sentence **the entry's blocks** is satisfied by both.
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
- **T6.30** (I19): removing the stall timer's re-arm → T1.30 fails. **This was the tree's state**: the timer was armed once against an ambient one-shot `setTimeout`, so stall detection fired thirty seconds after construction and never again, and a `--watch` that went quiet twice was told once. The revert is invisible under a scheduler that re-fires every callback, which is what the harness did — so the row is owed as much to the fake as to the source.
- **T6.31** (I33): releasing on freeze as well → T2.21 fails, and a `--watch` scrolled out of view stops updating while still claiming to run.
- **T6.32** (I33): dropping the eviction listener and checking the host on the next tick instead → T3.30 fails. The revert that reads as a simplification: the check is correct and it happens one tick too late, which is exactly long enough to patch an id that no longer resolves.
- **T6.33** (I32): moving the host onto `ViewRefresh` → T2.20 fails, because a declaration spanning two hosts has no single release.
- **T6.38** (I33a): declaring only from `append` and not from `settle(id, doc)` → T1.38 fails, and an adapter's `b.live` renders its loading state for ever. The revert that reads as the whole mechanism: every local-route part still ticks, every frame still refreshes, and the route with no coverage is silently dead. There is **no matching release-on-freeze mutation**, because there is no release on freeze — T6.31 already holds that direction, and I9 is why.
- **T6.34** (I34): applying one patch per rendered block → T1.35 fails, and C14 invalidates N times for one refresh.
- **T6.35** (I35): dropping the staleness marker → T1.36 fails, and a frozen panel is indistinguishable from a quiet cluster (S13 T6.3, from this side).
- **T6.36** (I21): retrying a `render` throw → T1.33 fails; the screen flickers at the interval and the outcome never changes.
- **T4.23** (I38, C05 I23): a manifest declaring `run` interactive with `detach` carrying the arm. `/run -d nginx` reaches the transport and its document carries the far side's output; `/run -it alpine sh` reaches `handoff`. **Both halves in one row**, because a route that always spawns satisfies the first and a route that always hands off satisfies the second.
- **T4.24** (I38): `/exec` with its required argument missing → an error document, and `runner.handoff` is never called. The fake's call count is the assertion; a test checking only the document passes on the ordering that spawns first and reports afterwards.
- **T3.55b** (I52): `elapsedNeeded` refuses a `null` panel, a non-`status` block, and a `retrying` box — **the arms the sweep cannot reach**, since the caller has just checked the block is a loading `status`. §8a-bis B3's ruling asked directly.
- **T3.55c** (I52, F234): the comparison is the **rendered figure** and never the clock — nothing under a second, nothing across 1000→1900 ms, a write at 2000, and `1m 40s` → `1m 41s` past ninety-nine. The range where a clock comparison and a figure comparison disagree, which is the mutation that survived the first pass.
- **T3.56** (I52): the elapsed figure advances while the first fetch is in flight, driven through `declare` and the sweep rather than by calling the writer — a row that reached in and computed a duration would pass on the day nothing armed a timer, which is F227 one layer up.
- **T3.57** (I52, F234): a write the figure would not show is not made at all, asserted on the **figure** across two sub-second sweeps. **The sibling part that polls every 300 ms is load-bearing and the mutation pass is why**: without it no sweep runs between the two whole seconds, so the row passed on the real code *and* on a guard comparing the clock instead of the figure — for the same reason both times, that nothing asked the guard.
- **T3.58** (I52, C24 §5): a declarer's own `renderLoading` block is never written into, with the fixture returning **exactly the shape the framework builds** — so a guard that inspected the block rather than reading `renderLoading` passes every other row and fails only this one.
- **T3.59** (I52, I46, F234): a box nobody is looking at is not written to, and the counter resumes on `visibilityChanged` with the **whole** wait rather than the watched part. §8a-bis B7, and the condition F234's 0.4-frames measurement was taken under and could not name.
- **T1.40b** (I51, F234): a one-shot's failure draws `error` at one row, not `retrying` at two — the classification table's C1, where the second row would be blank because `activityLine` draws nothing for a countdown that is not coming.
- **T6.72** (I52, F234): removing the visibility gate → **T3.59 fails and nothing else does.** The counter still advances and the figure is still right; the only difference is that an off-screen box writes a whole frame a second where it wrote nothing, and no assertion about what the box *says* can see that.
- **T6.37** (I12): moving the driver's release into `beforeRelease` → T4.22 fails. The ordering C22 §8 already keeps for `killAll`, arriving for the mechanism that has a promise in flight.
- **T6.51** (I38): reading `tool.interactive` in the `app` route → T4.23's `-d` row fails. The verb is handed the terminal, its output is written to a screen repainted a frame later, and the transcript says it finished — a defect no assertion about the transcript can see, because the transcript is correct.
- **T6.39** (I38): routing above the `validation.ok` check → T4.24 fails. It is the ordering the pipeline shipped with, and every test of the gate passed, because they all drove non-interactive verbs.
- **T6.40** (I43): arbitrating a cadence conflict — first-wins or shortest-wins — instead of refusing → T1.40 fails. The revert that reads as robustness: nothing crashes, both parts tick, and the one whose declared interval lost is stored where a reader will find it and believe it.
- **T6.40a** (I43): throwing the refusal instead of drawing it → T1.40 fails on the *message* half while the fetch half still passes. **This was the first implementation.** `declareLive` runs inside `appendAndCommit`, whose bare catch is deliberate, so the entry is already appended and the exception goes nowhere: two panels at `◌ loading`, no notice, nothing on stderr. The revert is one line and its symptom is silence.
- **T6.41** (I45): retiring a source **at** release rather than on the next sweep → T1.42 fails, and every settlement resets what a derivation exists to accumulate. Invisible from any frame: the panel draws, the value is right, and only the history is gone (§8c C3).
- **T6.42** (I42): building the implicit source key inside the namespace a declared `source` can spell → T1.44 fails, and two unrelated parts share a fetch **while looking more consistent than before** — the inverse of the defect this row fixes, wearing its evidence.
- **T6.43** (I46): pausing an invisible source without resuming it → T1.43 fails. Pairs with the opposite revert, treating any visible host as making every source due, which fails T4.26 instead — two directions, because a one-directional pause passes half of each row.
- **T6.44** (I44): committing per part rather than per source → T2.23 fails. A frame-level assertion cannot see it: C03's 33 ms `stream` window already coalesces them into one frame, which is why the row counts commits.
- **T6.45** (I47): running `compute` once per part rather than once per version → T1.41 fails, and a fold advances N times per tick — a ring buffer that fills N× too fast, with every sample in it genuine.
- **T6.46** (I48): restoring the bare `catch` — recording nothing — → T1.45 fails. **The revert is the shipped behaviour of every version before this one**, and its symptom is that there is none: no entry, no message, no exit code, and a green suite. F15 took four wrong turns to find because of exactly this.
- **T6.47** (I48): keeping the collection and dropping the fault notice → T1.48 fails while T1.45 still passes. The half that is easy: `faults` is a field a test can read, and a reader who never reaches `stop()` learns nothing at the moment it matters.
- **T6.48** (I48): keeping the notice and dropping the collection → T3.38 fails. The opposite half, and the one that looks sufficient until §8e's first row, where appending is what threw.
- **T6.49** (I48, with C22): draining the diagnostics **before** `lifecycle.release()` rather than after → T4.27 fails on its second half. The revert that reads as an ordering preference: the lines are written, to the alternate screen, and discarded with it — a flash and an empty shell, which is C22 I6's own argument arriving at a third source.
- **T6.50** (I49): restoring the catch that skips `resetFocus` → T1.47 fails. Nothing crashes and no frame is wrong at the moment; focus sits in a frozen block from then on, which is T4.7b's failure without T4.7b's bound.
- **T6.52** (I30, C07 I15): pinning `seq` to a constant in `streamInto` → T1.7b fails on both halves. This was the tree's state: the second `data` patch of every stream collided with the first under C04 I14, so a streaming verb could render exactly one block, and the per-stream reset fired on every patch. Found by the first tier-5 row to drive a `streams: true` verb through a real session; the unit suite passed throughout, because its `adaptPatch` double took no arguments and so could not see the one that was wrong.
- **T6.80** (I54): appending `compose({ blocks: [] })` at step 3, as the tree did → T4.40 fails at its first assertion. The revert that is the whole of the old behaviour, and every other C23 row stays green because none read the pending document's blocks.
- **T6.81** (I54): dropping the `readout` call at step 3 → T4.40 fails at its second: the header is composed once and never moves, F771 exactly, one component over from T6.53.
- **T6.82** (I54): writing the final header **after** `transcript.settle` rather than before → T4.40 fails at its fourth: the document carried by the `settle` change — the one persistence writes (C13 §5b.2) — reads `· 4s` with no verdict, while the store's final state reads `· 4s · exit 0`. **Invisible to any assertion on the final state**, because a `"shell"` patch on a settled entry is accepted (C13 §6); the first draft of this row claimed a refusal and would have survived its own mutation. The natural order to write — *finish, then annotate* — is the wrong one.
- **T6.84** (I25, §3b): measuring the resume record from `stalledAt` rather than from the last patch → T4.44 fails at its resumed frame: `resumed after 1m` under `no output for 2m`. This was the tree's state, and T1.30 and the §3b rows all match the phrase without the figure.
- **T6.85** (I55): the invoke route settling with the adapted document alone → **T4.47** fails on block 0's kind; the error arm settling `errorDoc` bare → **T4.47**'s second case fails; the local route → its third.
- **T6.86** (I56): the shell prefixing the body itself rather than composing the document → **T4.48** fails on a doubled indent.
- **T6.83** (I54): registering the readout at enqueue, or leaving the queued notice in place at the route → T4.41 fails on one half each: a queued line counts its wait as its run, or runs reading *queued behind*.
- **T6.53** (I53): dropping the readout's arming clause from `armParts` → T3.61 fails at its second assertion — the figure never moves because no wake is armed, F227's class one row over — while every `elapsedNeeded` row stays green. Dropping the `settled` deletion → T3.61 fails at its third: the settled header keeps counting.

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
