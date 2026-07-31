# C19 — Completion engine

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (engine + static sources) + app (dynamic sources) |
| **Layer** | L3 interaction |
| **Depends on** | C05 (`Manifest`) · C18 (the shared tokeniser) · C15 (the menu overlay) · C04 (`Block`, for menu content) |
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
  cursor:     number;                 // grapheme index
  tokens:     readonly string[];
  tokenIndex: number;
  prefix:     string;                 // the part of the current token before the cursor
  tool:       ToolDef | null;         // resolved if the line names one
  slot:       Slot;
}>;

type Slot =
  | Readonly<{ kind: "verb" }>                          // "/" prefix present
  | Readonly<{ kind: "executable" }>                    // bare first token
  | Readonly<{ kind: "flagName" }>                      // "--" prefix
  | Readonly<{ kind: "flagValue"; flag: FlagDef }>
  | Readonly<{ kind: "positional"; arg: ArgDef }>
  | Readonly<{ kind: "path" }>
  | Readonly<{ kind: "none" }>;
```

`verb` versus `executable` is D25: a leading `/` completes the manifest, bare text completes `PATH` and the filesystem. Same key, two namespaces, decided by one character.

---

## 3. Sources

```typescript
type Candidate = Readonly<{
  value:   string;
  display?: string;                   // shown if it differs from the inserted text
  detail?: string;                    // right-aligned hint in the menu
  tone?:   Tone;
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
3  one                         → insert it whole
4  many, common prefix longer
   than what is typed          → insert the common prefix, no menu
5  many, no further prefix     → open the menu
```

**An accepted flag value is inserted as `--flag=value`.** C05's gate accepts both that and `--flag value` (C05 §3), so completion is choosing a form rather than obeying one — and `=` is the form that cannot be misread as a flag followed by a positional. It is also the form that works when the value begins with `-`, which the space-separated form does not. One form taught, both accepted; the pair of sentences lives in both specs so they cannot drift.

`Tab` twice opens the menu even on a single match (bash convention, `j22` R17). Some people always want to see what they matched, and the second press costs nothing.

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

## 9. Invariants

- **I1** — A result is applied only when its sequence is the `active` token. A result arriving after `cancel()` is never applied, because `cancel()` invalidates the token rather than advancing it — under a plain latest-wins reading that result *is* the latest and lands.
- **I2** — Completion never blocks input; a pending request leaves the prompt fully responsive.
- **I3** — Static sources are synchronous; dynamic sources run only on `Tab`. Filesystem-backed slots are dynamic, so `path` and `executable` have no ghost text.
- **I4** — Every candidate derives from the manifest or a registered source; nothing is hardcoded.
- **I5** — The tokeniser **and the quoter** are C18's; there is one implementation of each. A candidate needing quotes is quoted by the same code that will later parse it.
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

---

## 10. Commitments

1. Every candidate comes from the manifest or a registered source; nothing is hand-maintained (I4).
2. Static sources run per keystroke; dynamic sources only on `Tab`. Filesystem slots are dynamic, so paths have no ghost text and `Tab` is required (I3).
3. Requests carry sequence numbers and stale results are discarded, including after a cancel (I1).
4. Typing during a pending request supersedes it and clears the spinner (I13).
5. The spinner appears at 500 ms; the TTL is 60 seconds; both clocks are injected (I9, I10).
6. A failing source is dropped, not fatal (I6).
7. Acceptance advances to the longest common prefix and stops; the menu-on-second-`Tab` behaviour is §4's, not contract (I5).
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

Six tiers. Every cell of the §8 table is covered.

### Tier 1 — unit

- **T1.1**: each `Slot` is detected from a canonical input and cursor — seven cases.
- **T1.2** (I14): `/p` → verb slot; `gi` → executable slot.
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
- **T1.15**: `Tab` twice on a single match → menu opens anyway.

### Tier 2 — contract / interface

- **T2.1** (I3): a spy proves dynamic sources are not invoked on keystrokes, only on `Tab`.
- **T2.2** (I2): with a source that never resolves, a hundred keystrokes are processed with no added latency.
- **T2.3** (I9): a source scan finds no clock reference in `completion/`.
- **T2.4** (I5): C19 imports C18's tokeniser and quoter; a second implementation of either fails the check.
- **T2.5** (I12): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.6** (I4): a source scan finds no literal verb, flag or enum list in `completion/`.
- **T2.7**: every `Slot` kind has at least one registered source — exhaustive over the union.
- **T2.8** (I8): the menu's content is `Block[]`; a compile-level test rejects React.

### Tier 3 — edge cases

- **T3.1**: `Tab` on empty input → all verbs offered.
- **T3.2**: `Tab` with no candidates → nothing happens; no menu, no error.
- **T3.3**: `Tab` mid-token with text after the cursor → completes the prefix before the cursor only, leaving the tail.
- **T3.4** (I5): a candidate containing a space → quoted by C18's quoter, and re-tokenising the resulting line yields exactly that candidate as one token. Round-trip, not eyeballed.
- **T3.5**: a candidate identical to what is typed → no insertion, menu on the second `Tab`.
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
- **T6.12** (I3): making path completion static → T1.4b fails, and every keystroke stats the filesystem.
- **T6.7** (I7): committing ghost text on any keypress → T1.13 fails.
- **T6.8** (I8): drawing the menu directly instead of through C15 → T2.8 and T4.4 fail, and it stops flipping.
- **T6.9** (I9): a real timer for the spinner → T2.3 fails and the tests flake.
- **T6.10** (I11): inserting a candidate character by character → T4.7 fails.
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
