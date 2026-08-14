# C19 — Completion engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` (engine + static sources) + app (dynamic sources) |
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

**`--flag=value` is two things in one token, and `prefix` is the second one.** A flag-value candidate is the *value*, so matching it against `--status=ru` matches nothing: every candidate the source returned is filtered away and the menu is empty for a reason no assertion about the source would show. Acceptance fails from the other end — replacing the whole token rewrites the flag name it was not completing.

So for a `flagValue` slot the value is its own sub-token: `prefix` is what follows the `=`, and `replace` starts there. Everything then agrees — the source matches on the prefix, the engine filters on the prefix, and acceptance replaces the value alone.

**§8a did not find this and could not have.** It is a cell where "the engine filters by prefix" meets "a flag value is half of a token", and both statements are correct; the trace is indexed by *events*, and this is an interaction between two structural rules with no event between them. What found it was T3.9 — a test about something else entirely, asserting the whole result rather than the field it was written for.

**`cursor` is a code-unit offset into `input`, not a grapheme index**, and the two cannot be mixed. Token spans are code-unit offsets, so every derivation of `prefix` and `replace` is arithmetic in that space; a grapheme index silently mis-slices the first line containing an emoji or a combining mark, and the failure is a candidate inserted over half a character rather than an error.

**C17's cursor *is* a grapheme index (C17 I2), so the conversion is real and it belongs to L4**, at the seam where the editor's buffer becomes a completion context. Putting it here would give C19 two coordinate systems and one of them would eventually be read in the other's arithmetic — which is the defect this ruling closes, reintroduced inside the component instead of across its boundary.

That also settles a scan question rather than leaving it to be discovered: SS40 forbids `.length`, `charAt` and `slice` across `src/interaction/`, allowing `router/decode.ts` and `interaction/parser/`. Span arithmetic is exactly the forbidden shape, and it is the correct shape here for the reason those two are allowed — this is the tokeniser's coordinate system, where a code-unit count is the honest measure.

**The allowance is `completion/context.ts`, not `completion/`**, and the first draft of this paragraph said the directory. SS40's own note gives the discriminator: *neither allowed file measures display width*. `context.ts` does not; `menu.ts` does, and there a `.length` is exactly the mistake the rule was written for — a candidate's column width is `cells()`, never a unit count. Allowing the directory would hand the one file in the minority the wrong advice at the moment someone reaches for a quick fix, which is A03 §"a directory is a packaging decision" describing the defect it has now recorded three times. The row lands with the code (A03 commitment 14b).

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

**That sentence is unchanged and §6a rests on its first half.** The static set has always been computed per keystroke and has only ever been *reduced* — to a single value, and only when there was exactly one, which is ghost text (I7). Showing the set instead of discarding it costs a menu, not a source call, so the as-you-type menu is a presentation change and the ruling it reverses is *the menu is a `Tab` affordance* rather than *dynamic sources are cheap*. The second half of the sentence is the boundary the obvious implementation crosses silently — "just call the engine on every keystroke" runs `request`, which runs the dynamic sources — and T2.1a is the row that keeps it real.

**The engine exposes the set as `suggest(ctx)`**, synchronous and static-only, and `ghost` is defined in terms of it: the single-candidate case of the same computation. One function rather than two, because two would be two filters over two source lists that agree until someone edits one.

**Path and executable completion are dynamic**, because both touch the filesystem. That is I/O, and I/O on every keystroke is exactly what the split exists to prevent. The consequence is stated rather than discovered: **there is no ghost text for paths or bare executables** — `Tab` is required. Ghost text is a manifest-backed affordance, and the manifest is the only source cheap enough to consult per keystroke.

That split is what keeps typing cheap. Verb names, sub-verbs, flag names and enum values all come from the manifest and cost a filter over an in-memory array, so ghost text can update live. UUIDs, family names and deployment names require the far side, and recomputing them per keystroke would hammer the API for suggestions nobody asked for.

Static sources ship in Calcium and read only C05. **Domain-backed** dynamic sources are the app's (A02 §6, hook 4).

**The framework also ships two dynamic sources of its own, and the earlier wording denied it.** "Dynamic sources are the app's" met "path and executable completion are dynamic" and T2.7's requirement that every `Slot` kind have a registered source, and the three cannot all hold: the framework owns the `path` and `executable` slots, so if it ships nothing dynamic those two slots have no source and T5.4 completes nothing. The division is not static-versus-dynamic but **generic versus domain** — a filesystem is not a domain, and a UUID is.

**Both take an injected directory reader**, for the reason the clock is injected: an ambient read makes every test need a real one, and the failure mode is a suite that passes on the author's machine. It is `readDir(path): Promise<readonly DirEntry[]>`, supplied at C22 with the real implementation, and it is what lets the `/` delimiter of a directory candidate (I16) be decided by the source rather than guessed.

So C19 imports no `fs`. The seam is the whole of its filesystem knowledge.

### Caching

Dynamic results are cached on `(sourceId, contextKey)` with a 60-second TTL (`j22`). A source that throws or times out is **dropped from the result set for that request** — other sources still contribute, and completion degrades rather than failing.

**`contextKey` is the slot's identity, not the prefix**, and the difference decides whether the cache is worth having. A slot is identified by its kind, the resolved tool, the flag or argument it belongs to, **and the arguments already typed before it** — everything a source's answer depends on except the token being typed. Keyed on the prefix instead, `--family=a` and `--family=ab` are different entries, every keystroke after a `Tab` is a fresh fetch, and the 60-second TTL never hits anything. The far side would be hammered for suggestions nobody asked for, which is the outcome the static/dynamic split exists to prevent, arriving through the cache instead of through the keystroke path.

**A source may declare what else its answer depends on, and the framework's own path source is why** (I25). §3's premise — *a dynamic source answers for the slot and the engine filters by prefix* — is exactly right for a UUID list and false for a path: `pathSource` reads the directory out of `ctx.prefix` and lists it, so its answer is a function of part of the prefix. Under a key that excludes the prefix entirely, `ls /et⇥` lists `/` and `ls /etc/⇥` is served that same listing, filtered to nothing. The second `Tab` appears to do nothing at all.

**Only the source can say which part**, which is why this is a hook rather than a rule on the key. Including the whole prefix is the defect §3 warns about — every keystroke after a `Tab` a fresh fetch — and no generic rule can extract *the directory* from a string it is not allowed to interpret. `cacheKey(ctx)` is optional, absent on every source whose answer is the slot's, and the path sources return the directory.

**Measured by the reference application before it was fixed here.** docker-tui's own path source has the same shape — `docker exec <c> ls <dir>` — and its frame is where this was found: `/config dtui-cfg /etc/ngin`, `Tab`, `Tab`, and the second one draws nothing. The framework's `pathSource` had carried it since C19 landed, unreachable by any test that completes one directory.

**The earlier arguments are in the key because an answer can depend on them, and the first draft's wording denied it** (I24). It read *everything a source's answer depends on except what the user has typed so far*, which is true only while no source reads another argument — and the case that breaks it is the ordinary one: a path *inside a named container* is `/config <container> <path>`, where the container is argument one and the paths are argument two. Under a key of (kind, tool, argument name) both containers share one entry, so the second is offered the first's directory listing, inside the TTL, with nothing on screen to say why.

**The cost is real and it is in the right place.** Keying on earlier tokens means a fresh fetch whenever an earlier argument changes — which is exactly when the answer changes. It is not the prefix problem returning: the token being *typed* is still excluded, so `--family=a` and `--family=ab` remain one entry and the TTL still does its work.

**Stated as the key's rule rather than as an opt-in on the source**, because the two failure modes are not symmetrical. A source that needs a discriminator and does not declare one is served another argument's answer silently; a key that is finer than a source needs costs a fetch. The first is a defect no assertion about candidates would catch, and the second is a number.

So **a dynamic source answers for the slot and the engine filters by prefix.** That is also what makes §6's narrowing possible: the menu filters the set it holds, and it can only do that if the set is the slot's rather than one prefix's. Static sources may filter internally — they are re-run per keystroke and an in-memory filter costs nothing — but the engine filters again regardless, so neither kind can be wrong about it.

**The cache holds the in-flight promise, not the resolved value, and the TTL starts at resolution.** §8a trace 3 is why: a second `Tab` in the same context must join the existing call rather than issue a second one (T3.9), and a value cache has nothing to return at that moment because the first call has not come back. The two statements — "a new sequence" and "one pending request, not two" — are compatible only under a promise cache.

---

## 3a. Ordering — recency first, source order under it

**Nothing sorted, and that was never ruled.** `matching()` filters on `startsWith` and the
dedup loop preserves insertion order, so the order the reader sees is the order the sources
were registered in: a verb run a minute ago and one never used rank identically. That was
tolerable while the menu was a `Tab` affordance and stopped being so when §6a landed —
**the menu now opens on every keystroke, so an unranked list is in front of the reader
continuously rather than on request.**

**Ordering is a ruling this spec did not have.** Source order is a consequence of the
registration loop, not a decision, and a consequence that nobody wrote down is the shape A03
§2 is about: it cannot be violated, because there is nothing to violate.

### Recency is the half that needs nothing built

C20 already holds `HistoryEntry = { command, ts, exitCode }` and a `list(filter?)` reader
(`src/interaction/history/types.ts:17`). So recency is a **lookup**, with no new state, no
persistence and no decay curve — the entry's *"nearly free"* is exact rather than optimistic.

**Injected as `recency: (value) => number | null`, not as a store handle**, and the reason is
the layer. C19 and C20 are both L3; an import between them is a sideways edge, legal only while
it stays acyclic, and a handle is an invitation to reach for `list()`, `search` or the
navigation cursor later. A function of one argument cannot grow into one — the same argument
`FocusInputs` makes for taking C15's layer and C13's entry structurally.

**`null` sorts last and stably**, so the rule refines source order rather than replacing it.
On a fresh session every candidate is `null` and the menu is exactly what it is today, which is
what makes this safe to land without a second ruling about ties.

### Two things writing it settled that the ruling did not

**Amended rather than chosen silently**, because both are visible only from the implementation
and both change what the injected function may do.

**The index is rebuilt per submission, never per keystroke.** The cap is 10,000
(`DEFAULT_CAP`, C20 I10), the menu opens on every keystroke and a set of twenty candidates
scanned against ten thousand entries is two hundred thousand comparisons on the input path —
which is I2, *completion never blocks input*, failing in the one place §6a made continuous.
`HistoryStore.entries` only grows on `append`, so its **length is a version**: the shell
rebuilds a `Map` when the length changes and answers from it otherwise, O(1) per candidate.
The engine sees a plain function either way, which is what the seam is for.

**What is matched is the command's first token, and the implementation falsified the first
wording of this paragraph.** It said a verb candidate's value is `ps` against a history line
`/ps --mine`, and asked the shell to strip the prefix. **The value is `/ps`** —
`src/interaction/completion/sources.ts:61` builds it as `` `/${head}` `` — so an index keyed on
the bare head would have matched nothing, ranked nothing, and left every row green, because a
stable sort over keys that are all `null` *is* the source order the rows assert. **A ruling
that is wrong about a value's shape fails silently in exactly the direction the tests cannot
see.**

Corrected: the key is the history line's first token as typed, which is already the candidate's
value, and the mapping is an identity rather than a transformation. The **shell** still owns it
— it knows commands are stored with the prefix, and C19 may not reach for that — but the reason
is narrower than *the prefix convention and the sub-verb depth*, and the narrower reason is the
true one.

**A candidate no history line maps to is `null`, and that is the ordinary case.** A path, a
flag, a container id: none has ever been "run", so all of them keep source order. The rule
therefore changes the verb menu and leaves every other slot alone — a narrower effect than
*rank the candidates* suggests, and the one worth stating so nobody looks for it elsewhere.

### What is deliberately not built

**Subsequence matching is not in this round and the entry says why.** `cstats` → `container
stats` is what `fzf` trains people to expect, and without a *match-quality* score it makes the
list worse rather than better: every candidate containing those letters in order arrives, and
recency cannot rank a set whose members the reader has mostly never run. A scorer is the
prerequisite and it is a separate ruling.

### The defect writing I27's row found, and it is not entry 31's

**`verbSource`'s own comment describes two-level completion that does not happen.** It reads
*"offers the next word of each tool name rather than the whole name, so `serving scale`
completes as `serving` and then `scale`"* — and **the slot after a verb is never `verb`**.
`context.ts:224` returns one only while `command` is true, which is the first token alone;
after `/serving ` the tool resolves, it has no positionals, and the slot is `none`. No source
is applicable, so a sub-verb is uncompletable at the level the comment promises.

**Found by writing a row for I27 that asserted the second level and watching it fail** — the
first two assertions of T1.17 passed, which is the shape worth naming: a row can confirm the
rule it was written for and falsify the sentence beside it.

**Recorded here and not fixed, because it is a different component's question.** The slot is
C19's derivation over C18's tokens, and *"is the second word of a sub-verb a verb"* is a
classification rule, not a source or a filter. **It is emphatically not entry 31's**: widening
`matching()` changes nothing here, and neither does ranking — the candidate set is empty
because nothing is asked. T1.17 asserts the current behaviour so **the row fails the day it is
fixed** and this section has to be rewritten with it.

**And substring matching is refused for a reason that is not cost — see I27.** The premise
*prefix matching cannot see a word in the middle of a name* is true of `matching()` and
irrelevant to it: the verb source emits **one word at a time**, so the buried word never
reaches the filter. Changing `matching()` would change nothing, and the honest change is to
the source's model, which is I14's one-level-at-a-time shape and a larger question than this
entry.

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

### What acceptance replaces

**`[tokenStart, cursor)`, leaving whatever follows the cursor** — T3.3's rule, and the shell's: completing `--st|xyz` gives `--status` followed by `xyz`.

**Except inside a quoted token, where it replaces the whole span.** T3.3 and T3.15 meet here and give opposite answers, and the spec used to state each in its own sentence without noticing. Leaving the tail preserves the closing quote, so a re-quoted candidate closes a quote that is already closed — T3.15's "the closing quote is not duplicated" is unsatisfiable under T3.3's rule. Splitting the difference by inserting an opening quote and letting the tail close it works only while the candidate needs the same quote character the user typed, which C18's quoter does not promise.

So the whole span goes, replaced by `quote(candidate)`. The argument is not only mechanical: **inside quotes there is no tail in the shell's sense.** The quotes are what make the run one value, and completing half of a quoted value while preserving the other half produces a string nobody meant far more often than it does what they wanted. Outside quotes, whitespace already ended the token, and the tail is a separate thing the user is keeping.

Ghost text is accepted by `Tab` or `→`. Any other key ignores it — it is a suggestion, never a commitment.

---

## 6. The menu

An anchored overlay through C15, with `Block[]` content like every other layer (C15 I4). It is themed, degrades to ASCII, and measures through the same registry as the transcript.

Two rows of pills when the candidate set is short, a table when entries have `detail`.

**The selection is a glyph on the row, and it has to be**, because C04's `TableRow` has no way to say a row is selected and the two obvious substitutes are each wrong. A `selected` field would put view state beside `expanded` in the type C04 §4 deliberately keeps free of it — and selection here is not the table's, it is the menu's. A `Tone` is worse: a tone is a palette slot with a meaning, and "the cursor is here" is not one of them, so the highlight would arrive as `info` or `accent` and mean something else in every theme. `bullet` is in C04's closed glyph vocabulary, C09 owns both its renderings, and the marker therefore degrades to ASCII with the rest of the menu rather than beside it.

Pills carry `active`, which already exists, so only the table form needed a ruling. The overlay flips above the prompt when there is no room below (C15 §4) — the case that matters, since the prompt is near the bottom by definition.

**The table form must declare a flex column, and until it did the menu showed nothing but ellipses** (I18). C11 hands residual width only to columns declaring `flex: true` — plan.ts step 8, a stated decision rather than an omission — so a table whose columns declare neither sits at its minimums whatever width it is given. The menu declared `minWidth: 1` and `minWidth: 0`, so at 100 columns each cell was one cell wide and every row rendered `…  …`. **Every manifest verb carrying a summary was affected and no verb without one was**, which is why it survived: `/serving` has sub-verbs and therefore no `detail`, so it takes the pills path and drew correctly, while `/promote` and `/ps` drew as ellipses. A test asserting "the menu appears" passes against both.

**Nothing ever read the menu's rendered rows, and that is why it survived four components.** The overlay tests assert a layer is placed; the completion tests assert the candidates are right; neither renders. And C09's guarantee held throughout — **a table with no flex column is correctly rendered nonsense**, so every width was exact, every row was the declared width, and the frame was well-formed. The control that closes this is one sentence and it is now I18's: the menu's rendered rows contain the candidate text.

**And its priority outranks the hint's, which it did not.** C11 admits columns by priority *descending* (plan.ts step 2), and the menu declared the label `1` against the detail's `2` — so the labels were dropped first, and at 80 columns over a diff the menu drew four summaries and not one verb name. That is I18's own claim failing in the direction I18 was written about: every candidate the menu holds is legible in it, and none of them was. Found by reading a frame at a second width, which is the only instrument that reaches it — every row was the declared width and the block was correct.

So the **label column** declares `flex: true` — C19's declaration rather than a change to C11's default, because every surface's drop table was computed against step 8 and widening the default would invalidate twelve column declarations to repair one programmatic table. The label is the column that should absorb: it is what the user is reading, and the hint is right-aligned against it. Each column's floor comes from its own content rather than from a literal. **The floor includes the selection glyph**, because the glyph is on whichever row is selected and the column has to hold it either way — a floor derived from the label alone truncates exactly one row, which reads as a flicker rather than as a width defect. `menuWidth` counts it too, and did not.

Truncation is reported by C15 through `Placed.truncated`; **C19 renders the "N more" indicator itself**, because only C19 knows what the remainder is (C15 I8).

Arrow keys move the selection, `Enter` accepts, `Esc` dismisses. Those bindings are C16's, dispatched to the `overlay` target — C16's `defaultKeymap` says in as many words that C18, C19 and C20 add their rows when they land, so these are C19's to write:

| Target | Key | Action |
|---|---|---|
| `prompt` | `tab` | `complete` |
| `prompt` | `right` | `acceptGhostOrForward` |
| `overlay` | `tab` | `menuNext` |
| `overlay` | `down` | `menuNext` |
| `overlay` | `up` | `menuPrev` |
| `overlay` | `enter` | `menuAccept` |
| `overlay` | `escape` | `dismiss` |

**`→` is one action, not two, and the keymap is what forces it.** C16 raises a `KeymapError` on a duplicate `(target, key)` rather than shadowing, so "accept the ghost" cannot be a second row beside "move the cursor forward" — the fallback lives in the handler. Worth stating because the natural design is two rows, and it fails at construction rather than at the keystroke, which is a startup crash rather than a bug but is still a rewrite of the seam.

**The rows are declared in C16's table, not exported from C19.** The first implementation put them in `completion/` and imported them into `keymap.ts`, which leaves the file graph acyclic — so every check passes — and makes the two directories mutually referential at the component level, where C16 is *consumed by* C19 and nothing goes back the other way. The wording above is the right one and the code follows it: C19 says what it needs bound, and bindings live where bindings live.

**`overlay`/`escape` is generic rather than C19's alone**, and it lands here because C19 is the first dismissable overlay to arrive. It must respect `dismissable`, so a confirm still refuses `Esc` (C16 T4.2) — C15's `pop()` already inspects only the top and returns the layer rather than a boolean, which is what makes one row correct for both cases.

`Esc` reaching this row is distinct from Ctrl-C reaching rung 3 of C16's ladder: the ladder pops the same layer, so the two agree, and neither is implemented in terms of the other.

**The menu is pushed once and changed in place.** Narrowing on a keystroke and re-highlighting on an arrow are `update(id, { content })`, not a dismissal and a fresh push — C16 derives focus on every dispatch (C16 I1), so a pop and a push per character churns focus inside the thing being typed into. The change log over a completion is one `push`, N `content` and one `pop` (C15 T4.7b).

**Narrowing filters the set the menu already holds; it does not re-run sources.** A menu opened on a dynamic slot holds candidates no static source can produce, so recomputing on the keystroke empties it and dismisses the thing the user is reading. Filtering is also what makes the tagging rule hold rather than bend: the filtered set is *re-derived* under the new token, not carried across it (§4).

**A keystroke that does not extend the current prefix dismisses the menu.** Filtering can only narrow, and backspace widens — there is no set to filter back out of. Stated because "narrow in place on a keystroke" reads as covering backspace, and the implementation that tries to serve it either re-runs a dynamic source on a keystroke (I3) or shows a set that no longer matches what is typed.

**The menu's first and last content rows are `rule`s, and they are its edges** (I23). A prompt-anchored menu spanning the region has the prompt directly below it and the transcript directly above, and in both directions the neighbour is left-aligned text at the same width — so without an edge the menu's rows and the rows around them are one block. Read from a frame, `• /container` over `❯ /co` is a path, and `dtui-cfg  nginx:alpine  ● Up 4 minutes` over `/container` is another row of the same table.

**The bottom edge landed first and the top was ruled out, wrongly.** That ruling read: *"The top edge needs nothing: the transcript above is a different kind of content and reads as one."* It is not a different kind of content — the transcript is the same left-aligned plain text at the same width, which is precisely why the seam closes invisibly. **The sentence was falsified by the frame it was written to fix**, one round later and with the bottom edge already in it: the menu still read as continuous, upward.

**Two rules and not a panel, and the original argument for that no longer holds.** It read *a panel costs two rows in a region already competing with the transcript, and buys a boundary at the top that the reading defect never involved* — and both halves are now wrong. The defect does involve the top, and two rules cost the two rows the panel was refused for. What keeps the rules is smaller and survives being checked: a rule is in C04's closed vocabulary, C09 owns both its renderings, and a panel's title and borders are chrome for a *dialogue*, which a completion menu is not (§6, the `Layer.width` division). **If a frame shows the rules are not enough the panel is the answer**, and the height arithmetic — `menuRowsShown`, the truncation remainder — moves with it.

**Adding it moved a number that was already wrong, which is how the second half was found.** The remainder is `total - shown`, and the shell was passing `layer.content.length` as `shown` — the count of *blocks*, not of rows. C15 truncates by clamping height (C15 §4), so a menu of sixty candidates clamped to ten rows reported fifty-nine missing rather than fifty. T4.5 passes the row count by hand and is right about the function; nothing asserted the argument the caller supplies. So `shown` is the placed height less the rows that are not candidates — the rule, and the indicator itself when there is one.

**The menu spans the region, and declares no width.** C15 I16 resolves an overlay's width as `min(layer.width ?? region.width, region.width)`, so omitting the field is how a layer says *all of it* — and that is what the menu wants.

**This reverses an earlier ruling, and the earlier one was right about the mechanism and wrong about the surface.** It read: *"C19 declares the menu's width. `Layer.width` exists because measurement answers height at a width and never the reverse, so nothing downstream can work out how wide the longest candidate is (C15 I16). It is the same division as the 'N more' indicator: C19 knows the candidates, C15 knows the region, and neither can supply the other's half."*

Every sentence of that is true and none of it argues for a narrow menu. `Layer.width` exists so that a **confirm** — forty cells of text, centred — can be forty cells; it is the field's reason and the menu is not its case. What the old ruling actually derived was *C19 is the only component that could compute the widest candidate*, and it then treated the ability as an obligation.

**What decided it is what the box looks like over content.** A menu narrower than the region leaves whatever is behind it visible to its right, on the same rows — measured over a coloured diff, the box is a clean rectangle and the diff's red and green resume beyond it, on every menu row. The compositor is correct and the *picture* is wrong: a reader sees two unrelated things on one line and has to work out where one ends. A prompt-anchored menu is chrome for the prompt, which spans the frame, so the menu does too.

**A confirm still declares one**, and that is the distinction the field is for: a confirm is a *dialogue* — centred, bounded, with the transcript deliberately visible around it — and a completion menu is an *extension of the prompt*. `Placed.left` is 0 for both anchored and fill placements, so nothing about centring changes.

The "N more" division is untouched: C19 still knows the remainder and C15 still reports only *that* it truncated.

Narrowing to *no* candidates leaves a layer measuring zero rows. C15 omits it from the layout and dismisses nothing (C15 I15) — dismissing it is C19's, at the moment the candidate set empties.

---

## 6a. The menu opens as you type

**Two or more static candidates open the menu with no `Tab`** (I19). One candidate is ghost text's case and opens nothing: the suggestion is already on the prompt row, and a one-row menu under it draws the same word twice. Zero closes it. The threshold is where the affordances divide rather than a taste — **a menu is for a choice, and ghost text is for the absence of one.**

**A typed menu holds no selection** (I20), and that is the ruling everything else here follows from. It is a display of what is available, not a choice being made, so **the prompt's bindings resolve before the menu's** while it holds none: `Enter` submits the line, `↑` walks history, printable characters type, and `Esc` — which the prompt does not bind — falls through to the menu and dismisses it. `Tab` enters it, and from that moment it is an ordinary menu with a selection and the §6 bindings.

**Entered by `Tab` alone, and `↓` is the reason the rule is a precedence rather than a list of keys.** `↓` at the prompt is history and then the live block (C16 I22), so a menu that opened unasked taking it would be the same theft as `Enter`. Two keys named as exceptions would also be a second keymap in the composition root, which C16 I23 exists to prevent — a precedence between two targets needs no key names at all.

Without this ruling the menu is a trap rather than an affordance. `activeTarget` answers `overlay` for anything on the stack (C16 §3), so a menu that opened by itself would take `Enter` — a user typing `/ps` and pressing Enter would accept a candidate instead of running the command — and `↑` would move a selection they never asked for instead of recalling the last command. Neither is a defect in C16: a menu the user asked for should own those keys, and the difference is who asked.

**`Tab` on a typed menu still means `Tab`** (I21). It runs §5's algorithm, dynamic sources and all — rules 3 and 4 insert and leave no menu, rule 5 leaves the menu open with the selection at 0. Worth stating because the keymap answers otherwise on its own: with a layer on the stack, `tab` resolves at `overlay` to `menuNext`, so the natural implementation makes `Tab` move a highlight and **never run a dynamic source again** — the menu having opened by itself would silently remove the only way to reach the app's own candidates.

**The menu is pushed once, whoever opened it.** `complete` finding the menu already on the stack updates it; C15 throws on a duplicate id (C15 §4), so the alternative is not a doubled layer but an unhandled rejection inside a promise continuation.

**A typed menu is rebuilt; a requested one is filtered** (I22). §6's rule — a keystroke that does not extend the prefix dismisses the menu — is about a menu that may hold candidates no static source can produce, and it holds for exactly that reason: widening it would mean re-running a dynamic source on a keystroke (I3). A typed menu holds only static candidates, so a keystroke recomputes it outright and backspace widens it back. **The two behave differently because their contents cost differently**, and the alternative — one rule, dismiss on backspace — would make backspace kill the affordance this section adds.

A rebuild clears the selection. A set the user has not seen cannot have a row they chose in it, and the menu returns to being a display, which is what I20 already says about a menu with no selection.

**`Esc` holds for the token** (I19). Dismissing a typed menu suppresses as-you-type opening until the cursor is in a different token, or the line is submitted or cleared. Without it the next character reopens what was just dismissed and `Esc` becomes a key that appears to do nothing — C22 I32's class, reached through the menu instead of through a timer. `Tab` is unaffected: an explicit request is the user asking again, and the suppression is about the menu opening *unasked*.

**Nothing here runs a dynamic source.** Every recompute is `suggest`, which is static and synchronous. The row that keeps it true drives a real keystroke with a dynamic source whose `complete` throws if it is ever called (T2.1a), because the boundary is one refactor away from being lost and no assertion about candidates would notice.

---

## 7. Slow completions

At 500 ms a spinner appears in the prompt: `❯ /ps --family=⠋`.

**The user can keep typing.** A keystroke during a pending request supersedes it — the old sequence is abandoned and the spinner clears. Nothing is blocked and nothing arrives late to overwrite the buffer.

**The spinner clears because the work ended, not because a clock restarted.** Dynamic sources run only on `Tab` (I3), so a keystroke that supersedes a pending request leaves *nothing* pending behind it. This is worth stating because the reasoning that produces the wrong implementation is plausible: "the request is superseded, so the next one restarts the 500 ms" — there is no next one until the user presses `Tab` again.

**The spinner shows when the *earliest* source call still in flight is older than the threshold**, and that is the one thing §4's tagging rule does not reach. Two `Tab`s in the same context join the same in-flight promise (§3, and §8a row 3), and the user's wait began at the first — so what is asked is "how long has anything been outstanding", not "how long has the current request been outstanding".

**Stated as "earliest in flight" rather than "per source call", because the second wording names a distinction that does not exist.** A source call begins synchronously inside `request`, so a stamp taken per request and a stamp taken per call carry the same number, and a mutation swapping one for the other fails nothing. Someone implementing to that wording could satisfy it and still hold a single `pendingSince` that each request overwrites — which is the actual defect, and it survives the sentence that was supposed to forbid it.

The wrong answer is in the direction that matters: a single overwritten stamp resets on the second `Tab` and hides the spinner for a further 500 ms while the user is already waiting, having pressed `Tab` again precisely *because* nothing happened.

The distinction is the reason, not the exception: **tagging answers validity, and the stamp measures elapsed wait.** Validity belongs to the token; the wait belongs to the work. Named here rather than left as a quiet deviation, because a rule with an undocumented exception is a rule people stop trusting.

T6.13 is the mutation that expresses it — the spinner reading the *latest* stamp rather than the earliest, which is what one overwritten `pendingSince` amounts to.

The 500 ms threshold and the 60-second TTL both use an **injected clock**, so every timing test runs on a fake one.

---

## 8. State machine

| From ↓ / event → | `Tab` | keystroke | result arrives | `Esc` |
|---|---|---|---|---|
| **idle** | → requesting (T1.9) | ghost recomputed; two or more static candidates → **typed menu** (T1.4, T3.20) | — | — |
| **idle, suppressed** | → requesting; suppression cleared (T3.24) | ghost recomputed, no menu, until the token changes (T3.23) | — | — |
| **requesting** | → requesting, new seq (T3.9) | → requesting, new seq; old superseded (T1.12) | matching seq → menu or insert (T1.10); stale seq → discarded (T1.11) | → idle, cancelled (T3.10) |
| **typed menu** | → requesting; §5 runs and the menu becomes requested (T3.22) | rebuilt from the static set; two or more → open, selection cleared; fewer → idle, dismissed (T3.21) | stale → discarded | → idle, **suppressed** (T3.23) |
| **requested menu** | → next candidate (T3.11) | extends the prefix → menu open, narrowed in place, ghost recomputed (T3.12); does not extend → idle, dismissed (T3.12b); narrows to zero → idle, dismissed (T3.19) | stale → discarded | → idle (T1.14) |

**The menu row split in two, and the split is the state's, not the presentation's.** The two look identical on screen and answer a keystroke differently, for the reason I22 gives: one holds candidates that cost a source call to recover and the other holds candidates that cost a filter. A single row would have to choose, and either choice is wrong for one of them.

**A typed menu with a selection is a requested menu.** `↓` is what enters it (I20), and from there its answers are the last row's — which is why there is no fifth row for it.

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

## 8b. The classification table

§8a is a **sequence trace**, and a sequence trace finds interactions that are *mediated by an event*: two rules that meet because something happened in between. It found six things and could not have found a seventh, because C19's other rules interact **structurally** — they hold at rest, with no event between them, and no number of rows indexed by keystrokes reaches them.

**C19 needed both artefact shapes and shipped with one.** This table is the missing half, and it is C18 §8a's shape applied to the context derivation: the whole result asserted per row, indexed by the cells where two structural rules overlap. It was run against landed code rather than before it, which is the wrong order and is why it found four defects instead of preventing them.

Columns are the whole result, not the field the row is about.

| # | The two rules | Input (`‸` is the cursor) | slot | prefix | tool | arg |
|---|---|---|---|---|---|---|
| 1 | quoting × the flag-value sub-token | `/ps --status="ru‸"` | `flagValue` | `ru` | `ps` | — |
| 2 | operators × tool resolution | `ls \| /ps --st‸` | `flagName` | `--st` | `ps` | — |
| 3 | multi-word verbs × positional index | `/serving scale ‸` | `positional` | `` | `serving scale` | `service` |
| 4 | space-form flag values × positional index | `/serving scale --to canary ‸` | `positional` | `` | `serving scale` | `service` |
| 5 | bool flags × row 4's skip | `/serving scale --side-by-side ‸` | `positional` | `` | `serving scale` | `service` |
| 6 | positional index, advancing | `/serving scale web ‸` | `positional` | `` | `serving scale` | `replicas` |
| 7 | quoting × command position | `"/ps"‸` | `verb` | `/ps` | — | — |
| 8 | unbalanced quotes × everything | `/ps --status="ru‸` | `none` | `` | — | — |
| 9 | a `path`-typed arg × the positional rule | `/tail ‸` | `path` | `` | `tail` | — |
| 10 | no resolved tool × arguments | `git commit ‸` | `path` | `` | — | — |

**Rows 1 to 4 were defects**, each an empty menu or a wrong argument with nothing to indicate why.

- **Row 1.** `unquotedPrefix` retried with a closing quote only when the token's *first* character was one, so a quote opening partway through — which is exactly `--status="ru` — fell through to the empty string. An empty prefix is no slot and no candidates. The `=` is now found in the **source** rather than in the unquoted text, which removes the special case that caused it.
- **Row 2.** `findTool` was given every word on the line, so `ls | /ps --st` asked for `["ls", "ps"]` and resolved nothing: **no flag after a pipe ever completed.** Every question here is about the current command, and the segment now begins at the last operator.
- **Row 3.** A tool name may be several words (C05 §2), so counting positionals from index 1 made `scale` the first argument and every argument resolved one slot late. `findTool` already returns `consumed` and the answer was being discarded.
- **Row 4.** C05's gate accepts `--flag value` as well as `--flag=value`, so the word after a value-taking flag belongs to that flag. Counted as a positional it shifts everything after it, and on a one-argument tool the slot becomes `none` — the menu stops appearing entirely. Row 5 is the negative control: a bool takes no value, so nothing is skipped.

**Row 7 is a row that agrees, and it is in the table for that reason.** A quoted `"/ps"` classifies as a verb here, and C18's `verbOf` also ignores `quoted` — so the two components agree and I5's failure mode cannot occur. Whether *either* should treat a quoted token as a verb is C18's question and is left open rather than answered unilaterally here; what this row asserts is that they cannot disagree.

**Row 8's `tool` is empty and row 1's is `ps`**, on inputs differing by one character. That is the tokeniser deciding, which is the point: unbalanced quotes are an error to C18, so completion offers nothing rather than something wrong.

---

## 8c. The as-you-type walk

§6a's rulings came from here, before any of it was built. **Both shapes again, and for the reason C19 already had to learn once**: the menu opening by itself is event-mediated — a key arrives and two rules both claim it — and *who owns a key while a layer is up* is structural, true at rest, with no event between the two rules that decide it.

### Trace 7 — the keys a menu takes without being asked

| Step | Event | buffer | menu | selection | who answers the key |
|---|---|---|---|---|---|
| 1 | type `/` | `/` | typed, N rows | none | prompt |
| 2 | type `p` | `/p` | typed, 2 rows | none | prompt |
| 3 | `Enter` | — | — | none | **prompt: submits `/p`** |
| 3′ | `Tab` instead | `/ps` or menu | requested | **0** | menu |
| 4 | `Enter` after 3′ | `/ps` | — | — | **menu: accepts** |
| 5 | type `s` after 3′ | `/ps` | rebuilt, 1 row → dismissed | cleared | prompt |

**Steps 3 and 4 are the same key with opposite meanings, and only the selection distinguishes them.** That is I20, and the alternative it rules out is the one that arrives by itself: with the layer on the stack `activeTarget` is `overlay` for both, so a menu opened by typing takes `Enter` from the user who never asked for it. Nothing in C16 is wrong — the ladder is right for a menu the user opened.

### Trace 8 — `Tab` over a menu that opened itself

| Step | Event | stack | what runs |
|---|---|---|---|
| 1 | type `/co` | menu (typed) | `suggest` — static only |
| 2 | `Tab` | menu (typed) | **`complete`**, dynamic sources included (I21) |
| 3 | the result arrives | menu (requested) | `update`, never a second `push` |

**Step 2 is the row that would have been lost silently.** The keymap binds `overlay`/`tab` to `menuNext`, so the implementation that does nothing about this makes `Tab` move a highlight — and the app's own container names become unreachable the day the menu learns to open by itself. It is the C16-meets-C19 cell, and neither component is wrong on its own side.

**Step 3 is a crash rather than a defect if it is missed**: C15 throws on a duplicate id, inside a promise continuation, so the failure is an unhandled rejection with no frame attached to it.

### Trace 9 — `Esc`, and the key that appears to do nothing

| Step | Event | menu | suppressed |
|---|---|---|---|
| 1 | type `/co` | typed | no |
| 2 | `Esc` | dismissed | **yes** |
| 3 | type `n` | **none** | yes |
| 4 | `Tab` | requested | no — an explicit request clears it |
| 5 | type ` ` (a new token) | idle | no |

**Step 3 is why the suppression exists.** Without it the dismissal is undone by the next character, and `Esc` joins C22 I32's class — a key that appears to do nothing until you press another one — from the opposite direction.

### The classification table — who owns a key while a layer is up

Structural: no event mediates these, and a trace indexed by keystrokes reaches none of them.

| # | The two rules | State | `Enter` | printable | `↑` | `Tab` |
|---|---|---|---|---|---|---|
| 1 | `activeTarget` × nothing open | no layer | submit | types | history | `complete` |
| 2 | `activeTarget` × I20 | typed menu, no selection | **submit** | **types** | **history** | **`complete`** — the prompt's bindings resolve first |
| 3 | `activeTarget` × §6's bindings | requested menu | accept | narrows it | `menuPrev` | `menuNext` |
| 4 | C16 I8 × a modal | confirm | the confirm's | dropped | dropped | dropped |
| 5 | C15 I1 × a text overlay | reverse search over a menu | the search's | the search's | the search's | the search's |

**Row 2 is entirely new and every cell of it was a defect** — measured, not reasoned: with a dismissable layer on the stack, `router.dispatch` runs the overlay handler, which consumes only what it binds, and step 3's `global` binds no printable key, so **the character is dropped**. A control with no layer open types the same character. So row 2 is not "the menu takes the key from the prompt"; it is *nobody takes it*, and typing stops the moment the menu appears.

**C22 §6 named this before it was reachable.** Its cursor trace records *"with a menu open, `activeTarget` is `overlay` … so a printable key does nothing while the menu is up"*, and then: *"If typing is later allowed to filter an open menu, the cursor rule has to move with it, and this is where to look."* This section is that moment. The routing is C22's — an overlay that is chrome for the prompt forwards what it does not bind (C22 I51) — and so is the cursor rule, which splits along the same line.

**Row 5 is a second instance of the same missing route, and it is not fixed here.** C20's reverse search is a text overlay whose `type()` has no caller anywhere in `src/`, so a query typed after `⌃R` is dropped exactly as row 2's character was. It is filed rather than folded in: the rules for applying a hit as the query narrows are C20 §5's and it needs its own rows.

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
- **I15** — Every piece of state outliving a single event carries the sequence it belongs to and is used only while that sequence is `active` (§4). The one exception is the spinner, which asks how long the earliest call still in flight has been outstanding (§7).
- **I16** — A unique match is inserted whole followed by its own `delimiter`; a common prefix is inserted without one. The delimiter is declared by the candidate, because only its source knows whether the value is a directory, a flag taking a value, or a finished word.
- **I17** — C19 reads no filesystem. The `path` and `executable` sources take an injected directory reader, so every test runs without one.
- **I18** — Every candidate the menu holds is legible in it. The table form declares a flex column, so C11 has somewhere to put residual width — it gives residual width only to columns declaring `flex: true` — and the value column's floor is the widest candidate label **plus the selection glyph**, which is on whichever row is selected. Without the flex column every cell rendered `…` at any width; without the glyph in the floor, exactly the selected row truncates, which reads as a flicker rather than as a width defect. It held for every verb carrying a summary and for no verb without one, because a candidate with no `detail` takes the pills path — so half the menu was correct and a row asserting the menu appears passed against both.
- **I19** — Two or more static candidates open the menu with no `Tab`; one is ghost text's case and opens nothing; zero closes it. `Esc` on such a menu suppresses the opening until the cursor is in a different token or the line is submitted or cleared — otherwise the next character reopens what was just dismissed.
- **I20** — A menu that opened by typing holds no selection, and while it holds none the prompt's bindings resolve first: `Enter` submits, `↑` walks history, printable characters type, `Esc` falls through and dismisses. `Tab` enters it, and it is an ordinary menu from then on.
- **I21** — `Tab` over a typed menu runs §5's algorithm, dynamic sources included, rather than moving a selection; and it updates the open menu rather than pushing a second one.
- **I22** — A typed menu is rebuilt from the static set on a keystroke and a requested one is filtered in place, because only the second may hold candidates that cost a source call to recover (I3). A rebuild clears the selection.
- **I23** — The menu's first and last content rows are `rule`s, so its edges against the transcript above and the prompt below are lines rather than a change of subject — in both directions the neighbour is left-aligned text at the same width, and the top seam was ruled unnecessary once and falsified by a frame; and the "N more" remainder counts rows, because C15 truncates by clamping height and a count of blocks is off by however many candidates a block holds. **And the indicator has to be *inside* the placement, which it was not.** `composite.ts` writes `lines[0 … height)` — C15 reports `truncated` and cutting is the frame's half of the split — so everything the menu puts last is what it loses. Read from a frame, a truncated menu drew the top rule and four candidates: the `+ N more` row and the bottom edge were both in the cut, which is to say **the indicator has never been visible on any occasion it fired**, and the number was wrong by the same amount, because `menuRowsShown` subtracts three chrome rows on the assumption that all three are drawn. So C19 windows its own list to what the placement holds (`menuWindow`) and the indicator fits by construction. The window follows the selection for a third reason: with every candidate in the content, arrowing past the last visible row moved the marker into a cut row and the menu read as frozen while the index was moving.
- **I24** — A dynamic source's cache key carries the arguments typed *before* the current token as well as the slot's identity, because a source's answer may depend on them — a path inside a named container is the ordinary case. Only the token being typed is excluded, so the narrowing keystrokes after a `Tab` still share one entry.
- **I25** — A dynamic source may declare `cacheKey(ctx)`, naming what its answer depends on beyond the slot's identity and the earlier arguments. A path source returns the directory it is about to list: its answer is a function of part of the prefix, which the engine may not interpret and no generic rule can extract.

- **I26** — Candidates are ordered **most-recently-run first**, and everything else keeps its source order. What *run* means is the shell's to answer and never C19's: the mapping from a candidate to a history line needs the prefix convention and the manifest's sub-verb depth, so the engine takes a value and returns a stamp (§3a). The engine ranks after deduplication and before the menu, over C20's history read through an injected `recency: (value) => number | null` rather than a store handle — C19 and C20 are both L3, so an import is a sideways edge that must stay acyclic (A02 §1), and a function of one argument cannot grow into one. `null` is *never run*, and every `null` sorts after every timestamp while preserving the order it arrived in, so a stable sort makes the rule a **refinement** of source order rather than a replacement for it: a source's own ordering still decides among candidates the reader has never used, which is every candidate on a fresh session. **Ranking is the engine's and never a source's** — a source that sorted would be ranking the fraction of the set it produced, and the menu shows the union.
- **I27** — The verb source offers **the next word** of each tool name, so a prefix that matches no first word matches nothing, and that is the level rather than a miss. `stats` does not complete `container stats`; `container` does, and then `stats`. Any widening to substring or subsequence matching is a change to **this** rule and not to the filter — the filter never sees the buried word, because the source never emits the whole name (§3, C05 §2's sub-verbs). Recorded because *prefix matching cannot see a word in the middle of a name* reads as a one-line fix to `matching()` and would change nothing.

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
13. Static sources ship with the framework, and so do the two generic dynamic ones — `path` and `executable`, over an injected directory reader. Only **domain-backed** dynamic sources are the app's, because a filesystem is not a domain (I3, I17).
14. **Completion never blocks input** (I2). The prompt stays fully responsive while a request is pending, and every other mechanism here exists to make that true: sequence numbers so a late result cannot land on a changed line, the static/dynamic split so per-keystroke work is synchronous, the spinner threshold so a slow source is visible rather than silent, and source-level failure containment so one hung source cannot take the prompt with it. Stated as a commitment because without it that machinery reads as complexity in service of nothing.
15. The sequence is a token of validity rather than a counter: state outliving an event is tagged with it, `cancel()` invalidates it, and staleness is structural rather than remembered (I15). The spinner is the one named exception: it asks how long the earliest call still in flight has been outstanding (§7).
16. **The menu opens as you type**, on two or more static candidates, and closes at one — where ghost text takes over — or at none (I19). `Esc` holds for the rest of the token, so dismissing it is not undone by the next character.
17. A menu nobody asked for takes no keys from the prompt: it has no selection, the prompt's bindings resolve first, and `Tab` is how the user enters it (I20). `Tab` still means `Tab` there — §5's algorithm, dynamic sources and all — rather than moving a highlight (I21).
18. **Nothing about typing runs a dynamic source.** The as-you-type path calls `suggest`, which is static and synchronous; the split I3 states is unchanged and T2.1a is the row that keeps it (I3, I22).
19. The menu has edges top and bottom, because it spans the region and its neighbours in both directions are text of the same shape: a `rule` first and last. The remainder beside them counts rows and not blocks (I23).
20. A dynamic source may depend on an argument already typed, so the cache key carries them (I24). The token being typed is still excluded, which is what the cache was for.
21. A source whose answer depends on part of what is typed says so through `cacheKey` (I25). The framework's own path source is the case, and a whole-prefix key would be the defect the cache exists to prevent.
22. **The menu is ordered most-recently-run first**, over C20's history read through an injected function, with source order kept underneath (I26). Stated as a commitment because ordering was never ruled at all: it was the registration loop's order, which is a consequence rather than a decision and so had nothing to violate. §6a is what made it cost — the menu now opens on every keystroke, so an unranked list is continuously in front of the reader rather than shown on request.
23. **A buried word is the source's model and not the filter's** (I27). The verb source emits one word of a name at a time, so widening `matching()` to substring would change nothing — the whole name never reaches it.

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
- **T1.4c** (§2): `/ps --status=ru` → `prefix` is `ru` and `replace` starts after the `=`. On the whole-token reading the engine filters every candidate away and accepting one rewrites the flag name.
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
- **T1.16** (I26): three candidates, two of them run — the more recent first, the older second, the never-run third. The row that a stable sort alone would pass is the fourth: **two never-run candidates keep their source order**, which is what makes the rule a refinement rather than a replacement.
- **T1.16b** (I26): every candidate never run → the order is exactly the source order, unchanged. The fresh-session case, and the one that says landing this needs no second ruling about ties.
- **T1.16c** (I26): a value produced by two sources is ranked **once** — one copy in the menu, ahead of the never-run ones. **It does not assert the order of the two steps, and the mutation pass is why.** The row was written for *ranking after deduplication*, and swapping them is behaviourally equivalent: `recency` is a function of the value, so two copies carry identical keys and a stable sort leaves the first where it was. The mutation survives and is an `EXPECTED_SURVIVOR` with that reason. **The sentence that justified the order was not a constraint**, which review cannot tell from one that is.
- **T1.17** (I27): `stats` at the verb slot completes nothing and `container` completes `container`; after `container `, `stats` completes. The row is written against the claim that this is a *defect*, and it asserts the level instead — a widened `matching()` leaves it identical, because the source never emits `container stats`.

### Tier 2 — contract / interface

- **T2.1** (I3): a spy proves dynamic sources are not invoked on keystrokes, only on `Tab`.
- **T2.1a** (I3, §6a): a dynamic source whose `complete` **throws if it is ever called**, registered for the slot under test, and a real keystroke driven through the router — the boundary A2 is one refactor from losing, asserted rather than assumed. A row checking only the candidate set passes whether or not the source ran.
- **T2.2** (I2): with a source that never resolves, a hundred keystrokes are processed with no added latency.
- **T2.3** (I9): a source scan finds no clock reference in `completion/` — SS1's, which covers all of `src/` with one named exception. A03 inventoried this as SS8 scoped to `completion/`, and it is folded rather than built: a rule whose scope is contained by a broader rule with the same pattern can never fire on anything the broader one misses. The fourth instance of that fold, and the third whose blocking component turned out to be the proof it could never fire.
- **T2.3b** (I17): a source scan finds no `fs` or `node:fs` import in `completion/`; the `path` source is driven entirely by a fake reader in every tier below 5.
- **T2.4** (I5): C19 imports C18's tokeniser and quoter; a second implementation of either fails the check.
- **T2.4b** (I5): `CompletionContext.tokens` is C18's `Token`, asserted structurally — a context built with bare strings does not typecheck, and `replace.start` equals the current token's `start`.
- **T2.5** (I12): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.6** (I4): a source scan finds no literal verb, flag or enum list in `completion/`.
- **T2.7**: every `Slot` kind has at least one registered source — exhaustive over the union.
- **T2.9** (§8a): the sequence trace replayed row for row, asserting the **whole** state after each step — `seq`, `active`, the in-flight set, the menu and the buffer — rather than the field the step is about.
- **T2.10** (§8b): the classification table replayed row for row, asserting the whole context — slot, prefix, tool, argument — rather than the field the row is about. Four of its ten rows were defects when it was first run.
- **T2.8** (I8): the menu's content is `Block[]`; a compile-level test rejects React.

### Tier 3 — edge cases

- **T3.1**: `Tab` on empty input → all verbs offered.
- **T3.2**: `Tab` with no candidates → nothing happens; no menu, no error.
- **T3.3**: `Tab` mid-token with text after the cursor → completes the prefix before the cursor only, leaving the tail. Unquoted tokens; T3.15 is the quoted case and the rules differ.
- **T3.4** (I5): a candidate containing a space → quoted by C18's quoter, and re-tokenising the resulting line yields exactly that candidate as one token. Round-trip, not eyeballed.
- **T3.5**: a candidate identical to what is typed → the delimiter is still appended, so the press advances the line rather than doing nothing. With the delimiter already present, nothing changes and no menu opens: a one-entry menu showing what the user has finished typing is noise.
- **T3.6** (I6): one of three sources throws → the other two still contribute; the failure is logged once.
- **T3.7** (I6): a source exceeding its timeout → dropped; the spinner clears.
- **T3.8** (I10): two requests within the TTL → one source invocation; after expiry → two.
- **T3.8b** (I10): `Tab`, then three more characters, then `Tab` → still one source invocation, because `contextKey` is the slot's identity rather than the prefix. Keyed on the prefix this is four, and the TTL never hits.
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
- **T3.15** (I16): completing inside a quoted token → the **whole token span** is replaced by `quote(candidate)`, so the closing quote is not duplicated and the value stays one token. The unquoted tail rule (T3.3) does not apply inside quotes, and §5 says why.
- **T3.16**: unbalanced quotes in the input → context is `none`; nothing is offered rather than something wrong.
- **T3.17**: cursor at position 0 of a non-empty line → verb or executable slot, as if empty.
- **T3.18**: a dynamic source returning duplicates → deduplicated before display.
- **T3.28** (I25): `pathSource` over a fake reader — complete `/et`, then `/etc/`, and the second is the directory's own entries rather than the first listing filtered to nothing. **The control is two completions in one directory**, which must be one read, or the row passes against a source that simply lost its cache.
- **T3.27** (I24): two containers and one argument — `/config a /e` then `/config b /e`, with a source counting its calls. Both fetch. **The control is the same container twice**, which must fetch once, or the row passes against a cache that was simply removed.
- **T3.25** (I23): the menu's rendered rows, with the **first and the last** asserted to be rules carrying no candidate — **read from the rows rather than from the block list**, because a block appended and never placed satisfies a test that counts blocks. The frame that argued for it is `/clear` sitting directly on `❯ /c`.
- **T3.26** (I23): sixty candidates in a ten-row region, driven through the shell rather than through `remainderOf` — the indicator says what is missing in rows. T4.5 passes the row count by hand and agrees with the function; this one asks what the caller supplies, which is where the block count was.
- **T3.20** (I19): typing to two static candidates → the menu is on the stack with no `Tab`; typing on to one → dismissed, and the ghost carries it. The one-candidate case is the control: a threshold of one draws the same word twice and passes any row that only asks whether the menu appeared.
- **T3.21** (I22): backspace with a **typed** menu open → the menu widens rather than dismissing, and the change log shows `content` rather than `pop` then `push`. T3.12b is the same key over a **requested** menu and asserts the opposite, which is the pair I22 exists to keep apart.
- **T3.22** (I21): `Tab` over a typed menu → the dynamic source runs and the layer is `update`d. The mutation that binds it to `menuNext` instead passes every candidate assertion and leaves the app's own sources unreachable; the assertion is on the source having been called, and on there being no second `push`.
- **T3.23** (I19, I20): `Esc` on a typed menu, then a printable key → no menu. A further key in a **new token** → the menu opens again. Without the second half the suppression is a mute switch.
- **T3.24** (I19): `Esc`, then `Tab` → the menu opens. An explicit request is the user asking again, and the suppression is only about opening unasked.
- **T3.19b** (I18): at a width too narrow for both columns, the **label** survives and the hint is dropped — the drop order, asserted on the rendered rows. It ran the other way round for as long as the menu has had a table, and no row asked: the frame was well-formed, every row was the declared width, and the only thing wrong was which column was there.
- **T3.29** (I18): a candidate carrying a `detail` renders its label and its hint at every width from `menuWidth` upward, and the selected row renders its glyph without losing a character of the label. **Asserted on the rendered rows, not on the block**, because the block was correct throughout: the defect was `minWidth: 1` meeting C11's rule that only a `flex` column absorbs residual width, and every statement on either side of that was true. The control is a candidate with no `detail`, which takes the pills path and drew correctly all along — which is why a row asserting only that the menu appears passed against the defect.

### Tier 4 — integration

- **T4.1** (with C05, the anti-drift test): adding a flag and an enum value to the fixture manifest makes both completable with no TypeScript change.
- **T4.2** (with C05): a `hidden` tool is absent from candidates but still parses and runs (C05 I11).
- **T4.3** (with C18): the shared tokeniser yields identical boundaries for completion and execution across a corpus of partial inputs.
- **T4.4** (with C15): the menu opens as an anchored overlay and **flips above the prompt** when there is no room below.
- **T4.5** (with C15): C19 renders the "N more" indicator from `Placed.truncated`.
- **T4.6** (with C16): `Tab` reaches completion only when the prompt has focus; with the menu open, arrows route to the overlay.
- **T4.6b** (with C16): C19's seven rows construct into `defaultKeymap` without a `KeymapError`, and every one decodes from a real wire form — C16 T2.13's check applied to the rows this component adds.
- **T4.6c** (with C16, C15): `Esc` on a non-dismissable confirm raised over the menu is a no-op and the menu beneath it survives; the same row dismisses the menu when it is on top.
- **T4.7** (with C17): accepting a candidate is one undo unit; a single `undo` reverts the whole insertion.
- **T4.8** (with C10, C02): the menu renders in both themes and under `unicode: "ascii"` with unchanged geometry — including the selection marker, which is a `bullet` glyph and therefore C09's to substitute 1:1.
- **T4.9** (I23): the `+ N more` row and the bottom edge are **inside** `Placed.height`, read from a rendered frame. T4.5 asserts the count and hands `menuRowsShown` its answer by hand; it never asks where the indicator lands, and the answer was *in the cut*. The row is the class of defect this component keeps producing — a number computed correctly and drawn nowhere.
- **T4.10** (I23, I20): the window contains the selection at both ends and a list that fits is not windowed. Three cases, because a window that only chases downwards passes the first and pins the last.
- **T4.8b** (I8): moving the selection changes exactly one row's glyph and no tone; the block tree is otherwise identical. A tone-based highlight fails this, and so does one that rebuilds the table.

### Tier 5 — e2e

**Deferred on L4**, in `test/e2e/completion.test.ts`, with the blocker in the greppable form the expiry guard reads. The properties are not deferred — each is asserted at tiers 1 to 4 against the engine, and what waits is the half only visible from outside: that the spinner is *seen* in the prompt, that the menu flips above a prompt actually near the bottom of a real screen, and that the directory reader is the real one. The file names which lower-tier test carries each half, so the deferral is a list of blockers rather than a gap.

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
- **T6.24** (I25): dropping `cacheKey` from `pathSource` → T3.28 fails, and the second `Tab` into a subdirectory draws nothing. Reachable from the prompt and by no test that completes one directory.
- **T6.23** (I24): dropping the earlier arguments from the key → T3.27 fails, and a second container is offered the first's directory listing for as long as the TTL lasts.
- **T6.21** (I23): dropping either rule → T3.25 fails on that end. Two mutations rather than one, because the two seams close independently and the top one was shipped open for a round with the bottom one in place.
- **T6.22** (I23): passing the block count as `shown` → T3.26 fails, and a menu of sixty says fifty-nine are missing when fifty are.
- **T6.17** (I19): recomputing the menu on a keystroke through `request` rather than `suggest` → T2.1a fails, a keystroke spawns a subprocess in every app that registers a domain source, and no assertion about the candidate set changes.
- **T6.18** (I20): giving a typed menu a selection at index 0 on open → T3.20's Enter case fails: the user types `/ps`, presses Enter, and a candidate is accepted instead of the command being run.
- **T6.19** (I21): letting `overlay`/`tab` answer for a typed menu → T3.22 fails and no dynamic source is ever reachable once the menu opens by itself.
- **T6.20** (I19): dropping the `Esc` suppression → T3.23 fails, and the dismissal is undone by the next character.
- **T6.16b** (I18): swapping the two columns' priorities → T3.19b fails, and a narrow menu offers summaries with nothing to select.
- **T6.16** (I18): removing `flex` from the detail column, or putting the value column's floor back to a literal → T3.19 fails on the first and on the second, and the menu goes back to a column of ellipses at any terminal width. The two are separate mutations because they truncate differently: without the flex every row is lost, and without the glyph in the floor exactly the selected one is.

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
