# C19 — Completion engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (engine + static sources) + app (dynamic sources) |
| **Layer** | L3 interaction |
| **Depends on** | C05 (`Manifest`) · C18 (the shared tokeniser, the quoter, and `Token`) · C15 (the menu overlay) · C04 (`Block`, for menu content) |
| **Consumed by** | C16 (`Tab`, `→`) · L4 (ghost text compositing) |
| **Source** | A01 D25 · A01 Appendix A.2 · `j22` §tab completion · A02 §6 hook 4 |
| **Status** | Draft |

---

## 1. Purpose

Completion is where the manifest stops being bookkeeping and becomes the reason the manifest exists. Every flag, enum value and sub-verb comes from C05, so adding a flag on the far side makes it completable with no TypeScript change (C05 T4.3). Nothing here is hand-maintained, and therefore nothing here can drift.

Two things it must never do: block input, and apply a stale answer. A dynamic source hitting a slow cluster must leave the prompt fully responsive, and a result that arrives after the user has typed three more characters must be discarded rather than rewriting what they are in the middle of.

---

## 2. Context

The cursor's position in the tokenised input decides what is being completed. C18's tokeniser is shared, so completion and execution agree about token boundaries — two implementations would disagree at unbalanced quotes and escaped spaces, and the symptom is a candidate that parses differently once accepted.

```typescript
type CompletionContext = Readonly<{
  input:      string;
  cursor:     number;                 // code-unit offset into `input` — see below
  tokens:     readonly Token[];       // C18's, spans and all
  tokenIndex: number;
  prefix:     string;                 // the part of the current token before the cursor
  /** What acceptance replaces: `[start, cursor]` of the current token. */
  replace:    Readonly<{ start: number; end: number }>;
  tool:       ToolDef | null;         // resolved if the line names one
  slot:       Slot;
}>;

type Slot =
  | Readonly<{ kind: "verb" }>                          // "/" prefix present
  | Readonly<{ kind: "executable" }>                    // bare word in command position
  | Readonly<{ kind: "flagName" }>                      // "--" prefix
  | Readonly<{ kind: "flagValue"; flag: FlagDef }>
  | Readonly<{ kind: "positional"; arg: ArgDef }>
  | Readonly<{ kind: "path" }>
  | Readonly<{ kind: "none" }>;
```

`verb` versus `executable` is D25: a leading `/` completes the manifest, bare text completes `PATH` and the filesystem. Same key, two namespaces, decided by one character.

**`tokens` is C18's `Token[]`, and this is where C18 ruling 4 is tested rather than asserted.** That ruling commits that one shape serves both consumers — the delegated string's splice and this context — and the shape is the span-carrying token. The `readonly string[]` this field first declared cannot answer any of the three questions asked of it:

- **`prefix` is a question about offsets, not about text**, which is C18 §2's own wording. Token text has quotes removed and escapes applied, so `'ab cd'` has a text of `ab cd` and a span of seven characters; no arithmetic over the text recovers what sits before the cursor.
- **Acceptance needs a range to replace.** That is `replace`, and it is derivable only from `start`.
- **`quoted` and `parts` carry the quote context** T3.15 completes inside, and **`kind` carries command position**: the word after a `|` is a command, so `ls | gre` is an `executable` slot. A string list cannot see the operator — and "the first token" is not the rule. C18 states the command-position rule as the rule; C19 asks the same token list rather than restating it, which is I5's argument arriving one field further along.

So the string form was not merely weaker. It made T3.3, T3.15 and the `executable` half of I14 unimplementable, in a component whose test list already names all three.

**`cursor` is a code-unit offset into `input`, not a grapheme index**, and the two cannot be mixed. Token spans are code-unit offsets, so every derivation of `prefix` and `replace` is arithmetic in that space; a grapheme index silently mis-slices the first line containing an emoji or a combining mark, and the failure is a candidate inserted over half a character rather than an error.

**C17's cursor *is* a grapheme index (C17 I2), so the conversion is real and it belongs to L4**, at the seam where the editor's buffer becomes a completion context. Putting it here would give C19 two coordinate systems and one of them would eventually be read in the other's arithmetic — which is the defect this ruling closes, reintroduced inside the component instead of across its boundary.

That also settles a scan question rather than leaving it to be discovered: SS40 forbids `.length`, `charAt` and `slice` across `src/interaction/`, allowing `router/decode.ts` and `interaction/parser/`. `completion/` is neither, and span arithmetic is exactly the forbidden shape. The allowance is the same one `parser/` already holds and for the same reason — this is the tokeniser's coordinate system, where a code-unit count is the honest measure — so `interaction/completion/` joins that list rather than the rule being narrowed. A03 §"a directory is a packaging decision" is the precedent, and the row lands with the code (A03 commitment 14b).

---

## 3. Sources

```typescript
type Candidate = Readonly<{
  value:   string;
  display?: string;                   // shown if it differs from the inserted text
  detail?: string;                    // right-aligned hint in the menu
  tone?:   Tone;
  /** What follows it when accepted whole. Default `" "`; `""` means nothing. */
  delimiter?: string;
}>;

interface CompletionSource {
  readonly id:    string;
  readonly slots: readonly Slot["kind"][];
  readonly dynamic: boolean;
  readonly ttlMs?: number;            // dynamic only; default 60_000
  complete(ctx: CompletionContext): readonly Candidate[] | Promise<readonly Candidate[]>;
}
```

**Static sources run on every keystroke; dynamic sources run only on `Tab`.**

**Path and executable completion are dynamic**, because both touch the filesystem. That is I/O, and I/O on every keystroke is exactly what the split exists to prevent. The consequence is stated rather than discovered: **there is no ghost text for paths or bare executables** — `Tab` is required. Ghost text is a manifest-backed affordance, and the manifest is the only source cheap enough to consult per keystroke.

That split is what keeps typing cheap. Verb names, sub-verbs, flag names and enum values all come from the manifest and cost a filter over an in-memory array, so ghost text can update live. UUIDs, family names and deployment names require the far side, and recomputing them per keystroke would hammer the API for suggestions nobody asked for.

Static sources ship in `tui-kit` and read only C05. Dynamic sources are the app's (A02 §6, hook 4).

### Caching

Dynamic results are cached on `(sourceId, contextKey)` with a 60-second TTL (`j22`). A source that throws or times out is **dropped from the result set for that request** — other sources still contribute, and completion degrades rather than failing.

**The cache holds the in-flight promise, not the resolved value, and the TTL starts at resolution.** §8a trace 3 is why: a second `Tab` in the same context must join the existing call rather than issue a second one (T3.9), and a value cache has nothing to return at that moment because the first call has not come back. The two statements — "a new sequence" and "one pending request, not two" — are compatible only under a promise cache.

---

## 4. Requesting

```typescript
interface CompletionEngine {
  register(source: CompletionSource): Disposable;
  ghost(ctx: CompletionContext): string | null;          // synchronous, static only
  request(ctx: CompletionContext, seq: number): Promise<CompletionResult>;
  cancel(): void;
  readonly pending: boolean;
  /** The token of validity. `null` means nothing in flight is still wanted. */
  readonly active: number | null;
}

type CompletionResult = Readonly<{
  seq:         number;
  candidates:  readonly Candidate[];
  commonPrefix: string;
  superseded:  boolean;
}>;
```

**Every request carries a sequence number, and a result whose sequence is not the latest is discarded.** This is the single most important behaviour in the component. Without it, a slow UUID lookup returning after three more keystrokes rewrites the buffer to something the user was not typing — and it happens exactly when the cluster is slow, which is when they are least tolerant of it.

### The sequence is a token of validity, not a counter

**Every piece of state that outlives a single event carries the sequence it belongs to, and is used only while that sequence is `active`.** The in-flight request, the menu's candidate set, the selection — each is tagged, and anything not carrying the current token is stale *by construction* rather than by something having remembered to clear it.

That is why `cancel()` **invalidates** the token — `active = null` — rather than advancing it. Advancing would mint a token nothing holds, which works by accident; invalidating says what happened. The two are indistinguishable until a result arrives after `Esc`, and then only the second one discards it: after a cancel there is no latest sequence for a result to match, which is precisely the case the counter reading gets wrong.

Written as one rule because it was three fixes before it was one — a result surviving `Esc`, a "just completed" bit surviving a keystroke, a spinner stamp surviving a supersession — and three special cases in three sections is how the fourth one gets missed.

**`active: number | null` is the shape, and the null case is the mechanism rather than a redundancy.** It reads like a nullable counter, and the obvious simplification is to drop the null and compare against the newest sequence. That simplification is exactly §8a row 4.

One thing is deliberately *not* tagged this way, and §7 says why: the spinner's elapsed-wait stamp belongs to the source call, not to the token.

`ghost` is synchronous by construction: it consults static sources only — which means manifest-backed slots only — and returns the completion of a unique match, or null.

---

## 5. Accepting

The mockup's algorithm (A01 Appendix A.2), which is the standard one and worth keeping:

```
1  compute candidates
2  none                        → nothing happens; no menu, no bell
3  one                         → insert it whole, followed by its delimiter
4  many, common prefix longer
   than what is typed          → insert the common prefix, no delimiter, no menu
5  many, no further prefix     → open the menu
```

**Rule 3 appends the delimiter and rule 4 does not, and the difference is load-bearing.** The token is finished in one case and unfinished in the other — and that is the whole of why a second `Tab` behaves usefully, as below.

**The delimiter belongs to the candidate, not to the engine.** A directory wants `/`, a flag that takes a value wants `=`, everything else wants a space. Only the source can know which: the engine cannot tell a directory from a file, and only C05 says whether a flag takes a value. A single engine-level rule would have to guess, and each guess is wrong for one of the three.

**An accepted flag value is inserted as `--flag=value`**, which arrives as a consequence of the above rather than as a separate rule: the flag-name candidate for a value-taking flag carries `=`. C05's gate accepts both that and `--flag value` (C05 §3), so completion is choosing a form rather than obeying one — and `=` is the form that cannot be misread as a flag followed by a positional. It is also the form that works when the value begins with `-`, which the space-separated form does not. One form taught, both accepted; the pair of sentences lives in both specs so they cannot drift.

### `Tab` twice, and the state it does not need

**On a single match the second `Tab` cannot open the same menu, because the first insertion moved the cursor into a different slot.** Rule 3 appended a delimiter, so the token is complete and what follows the cursor is a new, empty one — the second `Tab` completes the *next* thing, which is what the user wants and what happens without anyone arranging it.

**The reachable case is the ambiguous one, and it needs no counter.** `--st` over `{status, statistics}` takes rule 4: the common prefix `stat` is inserted with no delimiter, which moves the state from rule 4 to rule 5, so pressing `Tab` again opens the menu. That is the bash behaviour people actually experience, and it falls out of the algorithm rather than out of remembering that the last key was also `Tab`.

This is worth stating because the obvious reading of "`Tab` twice opens the menu" (`j22` R17) is readline's, where it is a **press counter** — and a press counter is state outliving an event, which §4 would then require to be sequence-tagged or it goes stale on the next keystroke. The rule that would have governed it instead showed it should not exist. The version of this spec that asserted the single-match case was asserting something unreachable.

Ghost text is accepted by `Tab` or `→`. Any other key ignores it — it is a suggestion, never a commitment.

---

## 6. The menu

An anchored overlay through C15, with `Block[]` content like every other layer (C15 I4). It is themed, degrades to ASCII, and measures through the same registry as the transcript.

Two rows of pills when the candidate set is short, a table when entries have `detail`. The overlay flips above the prompt when there is no room below (C15 §4) — the case that matters, since the prompt is near the bottom by definition.

Truncation is reported by C15 through `Placed.truncated`; **C19 renders the "N more" indicator itself**, because only C19 knows what the remainder is (C15 I8).

Arrow keys move the selection, `Enter` accepts, `Esc` dismisses. Those bindings are C16's, dispatched to the `overlay` target.

**The menu is pushed once and changed in place.** Narrowing on a keystroke and re-highlighting on an arrow are `update(id, { content })`, not a dismissal and a fresh push — C16 derives focus on every dispatch (C16 I1), so a pop and a push per character churns focus inside the thing being typed into. The change log over a completion is one `push`, N `content` and one `pop` (C15 T4.7b).

**Narrowing filters the set the menu already holds; it does not re-run sources.** A menu opened on a dynamic slot holds candidates no static source can produce, so recomputing on the keystroke empties it and dismisses the thing the user is reading. Filtering is also what makes the tagging rule hold rather than bend: the filtered set is *re-derived* under the new token, not carried across it (§4).

**A keystroke that does not extend the current prefix dismisses the menu.** Filtering can only narrow, and backspace widens — there is no set to filter back out of. Stated because "narrow in place on a keystroke" reads as covering backspace, and the implementation that tries to serve it either re-runs a dynamic source on a keystroke (I3) or shows a set that no longer matches what is typed.

**C19 declares the menu's width.** `Layer.width` exists because measurement answers height at a width and never the reverse, so nothing downstream can work out how wide the longest candidate is (C15 I16). It is the same division as the "N more" indicator: C19 knows the candidates, C15 knows the region, and neither can supply the other's half.

Narrowing to *no* candidates leaves a layer measuring zero rows. C15 omits it from the layout and dismisses nothing (C15 I15) — dismissing it is C19's, at the moment the candidate set empties.

---

## 7. Slow completions

At 500 ms a spinner appears in the prompt: `❯ /ps --family=⠋`.

**The user can keep typing.** A keystroke during a pending request supersedes it — the old sequence is abandoned and the spinner clears. Nothing is blocked and nothing arrives late to overwrite the buffer.

**The spinner clears because the work ended, not because a clock restarted.** Dynamic sources run only on `Tab` (I3), so a keystroke that supersedes a pending request leaves *nothing* pending behind it. This is worth stating because the reasoning that produces the wrong implementation is plausible: "the request is superseded, so the next one restarts the 500 ms" — there is no next one until the user presses `Tab` again.

**The elapsed-wait stamp is taken per source call, and it is the one thing §4's tagging rule does not reach.** Two `Tab`s in the same context join the same in-flight promise (§3, and §8a row 3), and the user's wait began at the first. A stamp tagged with the sequence resets on the second `Tab` and hides the spinner for a further 500 ms while they are already waiting — the wrong answer in the direction that matters, since the whole point of the spinner is to explain a wait that is already happening.

The distinction is the reason, not the exception: **tagging answers validity, and the stamp measures elapsed wait.** Validity belongs to the token; the wait belongs to the work. Named here rather than left as a quiet deviation, because a rule with an undocumented exception is a rule people stop trusting.

The 500 ms threshold and the 60-second TTL both use an **injected clock**, so every timing test runs on a fake one.

---

## 8. State machine

| From ↓ / event → | `Tab` | keystroke | result arrives | `Esc` |
|---|---|---|---|---|
| **idle** | → requesting (T1.9) | idle, ghost recomputed (T1.4) | — | — |
| **requesting** | → requesting, new seq (T3.9) | → requesting, new seq; old superseded (T1.12) | matching seq → menu or insert (T1.10); stale seq → discarded (T1.11) | → idle, cancelled (T3.10) |
| **menu open** | → next candidate (T3.11) | extends the prefix → menu open, narrowed in place, ghost recomputed (T3.12); does not extend → idle, dismissed (T3.12b); narrows to zero → idle, dismissed (T3.19) | stale → discarded | → idle (T1.14) |

**The keystroke cell used to read "idle, menu dismissed", and it contradicted §6 two sections above it.** §6 requires `update(id, { content })` rather than a pop and a push, C15 T4.7b asserts C19's half of that as one `push`, N `content` and one `pop`, and C15 §4 reasons about a completion menu *narrowing to no candidates as the last character is typed* — which is only a moment that exists if the menu survives the characters before it. Three documents described narrowing and this table described dismissal, and both readings had a test.

It is the shape A03 §2 names: each statement is correct where it stands, and only the cell where they meet is wrong. A reader checking §6 or checking §8 agrees with whichever they read.

---

## 8a. The sequence trace

Resolved by hand before any code, as C16's rung table, C17's edit trace and C18's classification table were, and by the same method: **indexed by rule interaction, not by input coverage.** A row governed by one rule is a restatement of that rule and finds nothing. Every row below is a cell where two correct statements overlap.

**The sequence is written beside every row, and that is the point of the artefact.** A row where it does not move restates a rule; a row where it moves mid-flight is where the discard rule holds or does not. `active` is written next to it, because §4's ruling is that the two are different questions.

Columns: `seq` is the newest sequence minted, `active` the token results are checked against, `flight` the in-flight source calls, `menu` the layer's state. The **whole** state is asserted after every step, not the field the step is about — that is what caught C13's and C14's defects.

### Trace 1 — keystroke during a pending request, menu open

The cell where I13's supersession meets §6's narrow-in-place.

| Step | Event | seq | active | flight | menu |
|---|---|---|---|---|---|
| 1 | `Tab` on `/ps --family=` | 4 | 4 | `uuids@4` | — |
| 2 | keystroke `a` | **5** | **5** | abandoned | — |
| 3 | `uuids@4` resolves | 5 | 5 | — | — (discarded: 4 ≠ 5) |

Step 2 is the row that matters: the sequence advances *and* the flight is abandoned rather than re-issued, because dynamic sources run only on `Tab` (I3). Nothing is pending afterwards, which is why §7's spinner clears without a clock restarting.

With the menu already open, step 2 gains a fourth outcome and it is F1's:

| Step | Event | seq | active | menu |
|---|---|---|---|---|
| 1 | menu open on `{running, ready}` | 7 | 7 | open, 2 rows |
| 2 | keystroke `u` — extends | **8** | **8** | open, **filtered to `{running}`**, one `content` change |
| 3 | keystroke `x` — extends, matches nothing | **9** | **9** | dismissed by C19 (C15 I15) |

And backspace, which the prose "narrows on a keystroke" silently fails to cover:

| Step | Event | seq | active | menu |
|---|---|---|---|---|
| 1 | menu open on `{running}` | 7 | 7 | open |
| 2 | backspace — widens | **8** | **8** | dismissed |

Filtering can only narrow. Serving a backspace would mean re-running a dynamic source on a keystroke, against I3, or showing a set that no longer matches the buffer.

### Trace 2 — `Esc` during a pending request

Where I1's latest-wins meets §8's cancel row. **This is the trace that found F2.**

| Step | Event | seq | active | flight |
|---|---|---|---|---|
| 1 | `Tab` | 4 | 4 | `uuids@4` |
| 2 | `Esc` | 4 | **null** | abandoned |
| 3 | `uuids@4` resolves | 4 | null | — (discarded: active is null) |

**The sequence does not move, and that is the whole finding.** Under "a result whose sequence is not the latest is never applied", step 3's result *is* the latest — 4 is still the newest sequence ever minted — so a latest-wins comparison applies it, onto a prompt the user has just dismissed. Only invalidation discards it. §4 states the rule; T3.10 and T6.1b are this trace.

Step 4, so the invalidation is not mistaken for a poisoning:

| 4 | `Tab` again | **5** | **5** | `uuids@5` |

### Trace 3 — `Tab` twice while pending

Where §8's "new seq" meets T3.9's "one pending request, not two".

| Step | Event | seq | active | flight | source calls |
|---|---|---|---|---|---|
| 1 | `Tab` | 4 | 4 | `uuids@4` | 1 |
| 2 | `Tab`, same context | **5** | **5** | `uuids@4` **joined** | **1** |
| 3 | resolves | 5 | 5 | — | 1 → applied under 5 |

The two statements are compatible only if the cache holds the **in-flight promise** keyed on `(sourceId, contextKey)` and starts the TTL at resolution. A value cache consulted after the fact has no entry yet at step 2 and issues a second call.

Step 3 also settles which token a joined result carries: the promise was created under 4 and the result is applied under 5, because the *context* is what the result answers and the context is unchanged. A result tagged with its creating sequence would be discarded here, and the user would press `Tab` twice and get nothing.

### Trace 4 — the spinner across a supersession

Where §7's 500 ms meets I13's "the spinner clears". **This is where §4's rule is deliberately not applied.**

| Step | Event | t (ms) | seq | active | stamp | spinner |
|---|---|---|---|---|---|---|
| 1 | `Tab` | 0 | 4 | 4 | 0 (call) | — |
| 2 | `Tab`, same context | 400 | **5** | **5** | **0** | — |
| 3 | clock | 520 | 5 | 5 | 0 | **showing** |

If the stamp were tagged with the sequence it would reset to 400 at step 2, and step 3 would show nothing — hiding the spinner for a further 500 ms from a user who has already been waiting half a second and pressed `Tab` again *because* nothing happened. The wait belongs to the work, not to the token.

The supersession case, for contrast:

| Step | Event | t | seq | active | flight | spinner |
|---|---|---|---|---|---|---|
| 1 | `Tab` | 0 | 4 | 4 | `uuids@4` | — |
| 2 | keystroke | 400 | **5** | **5** | abandoned | — |
| 3 | clock | 520 | 5 | 5 | — | — |

Nothing shows because nothing is pending, not because a timer was reset.

### Trace 5 — `Tab` on a static-only slot

Where I3 meets I1: does a sequence move when no async work exists?

| Step | Event | seq | active | flight |
|---|---|---|---|---|
| 1 | `Tab` on a dynamic slot | 4 | 4 | `uuids@4` |
| 2 | cursor moves to a static-only slot, `Tab` | **5** | **5** | — |
| 3 | `uuids@4` resolves | 5 | 5 | — (discarded) |

**`Tab` always mints, even with nothing to await.** Minting is free and step 3 is what it buys: a slot with no dynamic source is exactly the case where a reader concludes there is nothing to sequence, and it is the case where the abandoned request has the most changed buffer to land on.

### Trace 6 — `Tab` twice, ambiguous

The reachable form of `j22` R17 (§5), and the trace that shows no counter is involved.

| Step | Event | buffer | seq | menu |
|---|---|---|---|---|
| 1 | typed | `/ps --st` | 3 | — |
| 2 | `Tab` — rule 4 | `/ps --stat` | **4** | — |
| 3 | `Tab` — rule 5 now applies | `/ps --stat` | **5** | **open, 2 rows** |

Step 3 opens the menu because step 2 exhausted the common prefix, not because the engine remembers step 2 happened. Nothing carries across the two presses, which is why there is nothing here for §4 to tag.

The single-match case, which the previous draft asserted:

| Step | Event | buffer | slot |
|---|---|---|---|
| 1 | typed | `/ps --mi` | flagName |
| 2 | `Tab` — rule 3 | `/ps --mine ` | **positional** |

The second `Tab` completes the next slot. There is no state under which it re-opens the first one.

---

## 9. Invariants

- **I1** — A result is applied only when its sequence is the `active` token. A result arriving after `cancel()` is never applied, because `cancel()` invalidates the token rather than advancing it — under a plain latest-wins reading that result *is* the latest and lands.
- **I2** — Completion never blocks input; a pending request leaves the prompt fully responsive.
- **I3** — Static sources are synchronous; dynamic sources run only on `Tab`. Filesystem-backed slots are dynamic, so `path` and `executable` have no ghost text.
- **I4** — Every candidate derives from the manifest or a registered source; nothing is hardcoded.
- **I5** — The tokeniser **and the quoter** are C18's; there is one implementation of each. A candidate needing quotes is quoted by the same code that will later parse it. `CompletionContext` carries C18's `Token`, spans included — the shape C18 ruling 4 commits serves both consumers — and `cursor` is in that shape's coordinate system.
- **I6** — A source that throws or times out is dropped from that request; others still contribute.
- **I7** — Ghost text appears only on a unique static match and is never committed without `Tab` or `→`.
- **I8** — The menu is a C15 overlay with `Block[]` content; C19 renders no chrome of its own.
- **I9** — C19 reads no ambient clock.
- **I10** — Dynamic results are cached on `(sourceId, contextKey)` and expire at their TTL.
- **I11** — Accepting a candidate produces exactly one undo unit in C17.
- **I12** — C19 imports nothing from `terminal/` and never commits a frame.
- **I13** — A keystroke arriving during a pending request supersedes it: the sequence advances, the spinner clears, and the older result is discarded on arrival (I1). No state from the superseded request survives into the next one.
- **I14** — A leading `/` completes the manifest; bare text completes `PATH` and the filesystem, never both.
- **I15** — Every piece of state outliving a single event carries the sequence it belongs to and is used only while that sequence is `active` (§4). The one exception is the spinner's elapsed-wait stamp, which is per source call (§7).
- **I16** — A unique match is inserted whole followed by its own `delimiter`; a common prefix is inserted without one. The delimiter is declared by the candidate, because only its source knows whether the value is a directory, a flag taking a value, or a finished word.

---

## 10. Commitments

1. Every candidate comes from the manifest or a registered source; nothing is hand-maintained (I4).
2. Static sources run per keystroke; dynamic sources only on `Tab`. Filesystem slots are dynamic, so paths have no ghost text and `Tab` is required (I3).
3. Requests carry sequence numbers and stale results are discarded, including after a cancel (I1).
4. Typing during a pending request supersedes it and clears the spinner (I13).
5. The spinner appears at 500 ms; the TTL is 60 seconds; both clocks are injected (I9, I10).
6. A failing source is dropped, not fatal (I6).
7. Acceptance advances to the longest common prefix and stops there; a unique match is inserted whole with its delimiter, and the delimiter is the candidate's (I16). The menu-on-second-`Tab` behaviour is §5's, and it is a consequence of that pair rather than a stored press count.
8. Ghost text is a suggestion, accepted only by `Tab` or `→` (I7).
9. The menu is a C15 overlay; C19 supplies blocks and the overflow indicator (I8).
10. The tokeniser and the quoter are both shared with C18 (I5).
11. Accepting produces one undo unit (I11).
12. `/` completes verbs; bare text completes executables and paths (I14).
13. Dynamic sources are the app's; static ones ship with the framework (I3).
14. **Completion never blocks input** (I2). The prompt stays fully responsive while a request is pending, and every other mechanism here exists to make that true: sequence numbers so a late result cannot land on a changed line, the static/dynamic split so per-keystroke work is synchronous, the spinner threshold so a slow source is visible rather than silent, and source-level failure containment so one hung source cannot take the prompt with it. Stated as a commitment because without it that machinery reads as complexity in service of nothing.
15. The sequence is a token of validity rather than a counter: state outliving an event is tagged with it, `cancel()` invalidates it, and staleness is structural rather than remembered (I15). The spinner's elapsed-wait stamp is the one named exception, and it is per source call (§7).

---

## 11. Tests

Six tiers. Every cell of the §8 table and every row of §8a is covered.

### Tier 1 — unit

- **T1.1**: each `Slot` is detected from a canonical input and cursor — seven cases.
- **T1.2** (I14): `/p` → verb slot; `gi` → executable slot.
- **T1.2b** (I14, I5): `ls | gre` → executable slot, from the operator token rather than from the token index. On a string list the word is at index 2 and reads as a positional.
- **T1.2c** (I5): an input whose current token contains a multi-byte grapheme → `prefix` and `replace` are computed in the tokeniser's coordinate system and the insertion lands on a cluster boundary. Fails on a grapheme index read as a code-unit offset.
- **T1.3**: `/ps --st` → flag-name slot with tool `ps` resolved.
- **T1.4**: `/ps --status=` → flag-value slot carrying that `FlagDef`; ghost recomputes without a request.
- **T1.4b** (I3): a `path` or `executable` slot → `ghost` returns null without touching the filesystem; `Tab` is required to get candidates.
- **T1.5** (I4): flag-name candidates equal the manifest's flags for that tool, exactly.
- **T1.6** (I4): enum candidates equal the flag's `values`, exactly.
- **T1.7**: common prefix — `{status, statistics}` from `sta` → inserts `stat`, no menu.
- **T1.8**: a single candidate → inserted whole, no menu.
- **T1.9**: `Tab` with a dynamic source in the slot → a request is issued.
- **T1.10** (I1): a result with the latest sequence → applied.
- **T1.11** (I1): a result with a stale sequence → discarded, buffer untouched.
- **T1.12**: a keystroke during a pending request → new sequence, old superseded.
- **T1.13** (I7): ghost text appears on a unique match; a printable key ignores it.
- **T1.14**: `Esc` with the menu open → dismissed, buffer unchanged.
- **T1.15**: `Tab` twice on an **ambiguous** match → the first inserts the common prefix with no delimiter, the second opens the menu. The reachable form of `j22` R17; the single-match form it used to assert cannot occur, because rule 3's delimiter moves the cursor into the next slot.
- **T1.15b**: `Tab` on a single match → the candidate and its delimiter, and the slot after the cursor is the next one. A directory candidate ends `/`, a value-taking flag ends `=`, a bool flag ends with a space.

### Tier 2 — contract / interface

- **T2.1** (I3): a spy proves dynamic sources are not invoked on keystrokes, only on `Tab`.
- **T2.2** (I2): with a source that never resolves, a hundred keystrokes are processed with no added latency.
- **T2.3** (I9): a source scan finds no clock reference in `completion/`.
- **T2.4** (I5): C19 imports C18's tokeniser and quoter; a second implementation of either fails the check.
- **T2.4b** (I5): `CompletionContext.tokens` is C18's `Token`, asserted structurally — a context built with bare strings does not typecheck, and `replace.start` equals the current token's `start`.
- **T2.5** (I12): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.6** (I4): a source scan finds no literal verb, flag or enum list in `completion/`.
- **T2.7**: every `Slot` kind has at least one registered source — exhaustive over the union.
- **T2.9** (§8a): the sequence trace replayed row for row, asserting the **whole** state after each step — `seq`, `active`, the in-flight set, the menu and the buffer — rather than the field the step is about.
- **T2.8** (I8): the menu's content is `Block[]`; a compile-level test rejects React.

### Tier 3 — edge cases

- **T3.1**: `Tab` on empty input → all verbs offered.
- **T3.2**: `Tab` with no candidates → nothing happens; no menu, no error.
- **T3.3**: `Tab` mid-token with text after the cursor → completes the prefix before the cursor only, leaving the tail.
- **T3.4** (I5): a candidate containing a space → quoted by C18's quoter, and re-tokenising the resulting line yields exactly that candidate as one token. Round-trip, not eyeballed.
- **T3.5**: a candidate identical to what is typed → the delimiter is still appended, so the press advances the line rather than doing nothing. With the delimiter already present, nothing changes and no menu opens: a one-entry menu showing what the user has finished typing is noise.
- **T3.6** (I6): one of three sources throws → the other two still contribute; the failure is logged once.
- **T3.7** (I6): a source exceeding its timeout → dropped; the spinner clears.
- **T3.8** (I10): two requests within the TTL → one source invocation; after expiry → two.
- **T3.9**: `Tab` twice while a request is pending → one pending request, not two. The second `Tab` mints a new token *and* joins the existing in-flight promise: the source is invoked once, asserted with a spy.
- **T3.9b** (I15, §7): `Tab`, 400 ms, `Tab`, 200 ms → the spinner is showing, because the stamp belongs to the source call and the wait began at the first `Tab`. On a per-sequence stamp it is still hidden.
- **T3.10** (I1, I15): `Esc` while pending → `active` is null and a later result is discarded. Asserts the mechanism, not only the outcome: the result's sequence is still the highest ever issued, so a latest-wins comparison applies it and this test is what fails.
- **T3.10b** (I15): after `cancel()`, a subsequent `Tab` mints a fresh token and *its* result applies — cancelling invalidates the current token without poisoning the engine.
- **T3.11**: `Tab` with the menu open → advances the selection rather than re-requesting.
- **T3.12**: a printable keystroke extending the prefix with the menu open → the menu narrows **in place** and ghost recomputes. Asserted through C15's change log: one `push`, N `content`, no `pop` (C15 T4.7b's other half).
- **T3.12b**: backspace with the menu open → dismissed. Filtering cannot widen, and the alternative re-runs a dynamic source on a keystroke.
- **T3.19** (C15 I15): narrowing to zero candidates → C19 dismisses. C15 omits a zero-row layer from the layout and dismisses nothing, so the moment is C19's or it is nobody's.
- **T3.13**: 5,000 candidates → the menu clamps, reports truncation, and renders within budget.
- **T3.14**: a candidate containing a control character → stripped before insertion.
- **T3.15**: completing inside a quoted token → the quote context is respected; the closing quote is not duplicated.
- **T3.16**: unbalanced quotes in the input → context is `none`; nothing is offered rather than something wrong.
- **T3.17**: cursor at position 0 of a non-empty line → verb or executable slot, as if empty.
- **T3.18**: a dynamic source returning duplicates → deduplicated before display.

### Tier 4 — integration

- **T4.1** (with C05, the anti-drift test): adding a flag and an enum value to the fixture manifest makes both completable with no TypeScript change.
- **T4.2** (with C05): a `hidden` tool is absent from candidates but still parses and runs (C05 I11).
- **T4.3** (with C18): the shared tokeniser yields identical boundaries for completion and execution across a corpus of partial inputs.
- **T4.4** (with C15): the menu opens as an anchored overlay and **flips above the prompt** when there is no room below.
- **T4.5** (with C15): C19 renders the "N more" indicator from `Placed.truncated`.
- **T4.6** (with C16): `Tab` reaches completion only when the prompt has focus; with the menu open, arrows route to the overlay.
- **T4.7** (with C17): accepting a candidate is one undo unit; a single `undo` reverts the whole insertion.
- **T4.8** (with C10, C02): the menu renders in both themes and under `unicode: "ascii"` with unchanged geometry.

### Tier 5 — e2e

- **T5.1**: typing `/ps --status=` and pressing `Tab` → the five statuses appear, arrow-selectable, `Enter` inserts.
- **T5.2**: a dynamic UUID source with a 2-second delay → the spinner appears at 500 ms, typing continues freely, and the late result never touches the buffer.
- **T5.3**: `Tab` near the bottom of the terminal → the menu flips above and shows every candidate.
- **T5.4**: completing a path with `ls ` and `Tab` → filesystem candidates, not verbs.
- **T5.5**: sixty seconds of repeated `Tab` on the same dynamic slot → one source invocation, then a second after expiry.

### Tier 6 — fail-on-revert

- **T6.1** (I1): applying results without a sequence check → T1.11 and T5.2 fail; a slow cluster rewrites what the user is typing.
- **T6.1b** (I1, I15): making `cancel()` advance the sequence instead of invalidating it → T3.10 fails, and a result arriving after `Esc` lands on a prompt the user dismissed. The version that passes T1.11 and fails this one is the counter reading of §4.
- **T6.13** (I15): tagging the spinner's stamp with the sequence rather than the source call → T3.9b fails, and the spinner hides for a further 500 ms each time an already-waiting user presses `Tab`.
- **T6.2** (I3): running dynamic sources per keystroke → T2.1 fails and the API is hammered.
- **T6.3** (I2): awaiting a request on the input path → T2.2 fails and typing stalls.
- **T6.4** (I4): hardcoding an enum list → T2.6 and T4.1 fail, and completion drifts from the far side.
- **T6.5** (I6): letting a source failure abort the request → T3.6 fails.
- **T6.6** (I5): a second tokeniser or quoter → T2.4, T3.4 and T4.3 fail.
- **T6.6b** (I5): flattening `CompletionContext.tokens` back to `readonly string[]` → T2.4b, T1.2b, T3.3 and T3.15 fail, and completion loses the offsets C18 ruling 4 exists to supply.
- **T6.6c** (I5): passing C17's grapheme cursor through unconverted → T1.2c fails, and a candidate is inserted over half a cluster on the first line holding an emoji.
- **T6.12** (I3): making path completion static → T1.4b fails, and every keystroke stats the filesystem.
- **T6.7** (I7): committing ghost text on any keypress → T1.13 fails.
- **T6.8** (I8): drawing the menu directly instead of through C15 → T2.8 and T4.4 fail, and it stops flipping.
- **T6.9** (I9): a real timer for the spinner → T2.3 fails and the tests flake.
- **T6.10** (I11): inserting a candidate character by character → T4.7 fails.
- **T6.14** (I16): appending the delimiter after a common prefix as well as after a unique match → T1.15 fails, and the second `Tab` never reaches the menu because the token it would have widened has been closed.
- **T6.15** (I16): moving the delimiter into the engine as one rule → T1.15b fails on two of its three cases, since nothing outside the source knows a directory from a file.
- **T6.11** (I14): offering verbs for bare text → T1.2 fails.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| The manifest's contents | C05 and the app |
| Tokenising | C18 |
| Menu placement and clamping | C15 |
| Which key triggers completion | C16 |
| Inserting into the buffer | C17 |
| Prism's dynamic sources | `prism-tui` |
| Fuzzy or substring matching | Phase 1B — v1 is prefix matching |
