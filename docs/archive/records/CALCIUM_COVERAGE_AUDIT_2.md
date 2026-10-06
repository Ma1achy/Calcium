# Calcium — coverage audit, second pass

**The passes the first audit said it could not run.** `CALCIUM_COVERAGE_AUDIT.md` ran four
mechanical passes over things that *enumerate*, and — usefully — wrote down four blind spots
its method could not reach, plus a fifth implied by F-C.

Re-running its four would produce agreement, which is worth nothing. This runs the five it
could not. Against `main` at `d4ec331`, 25 specs, 174 source files.

---

## Result

| | |
|---|---|
| **F83** ★★★ | MG24 counts the implementing module as a consumer — 28 members never cross their own component; `HistoryStore.rerun` has no caller in `src/`, `TransportRouter.busy` survived its own removal |
| **F84** ★★★ | MG24 walks `export interface`; **798 members published as `export type` are outside every rule's scope** — 0 dead today, and 3 dead glyph slots after filtering |
| **F85** ★★★ | `RenderContext` requires two fields the registry overwrites, one of which **throws if called** — F58b's class, second independent consumer |
| **F86** ★★ | **F79 named a mechanism it did not measure.** Falsified; a different real `screen.py` defect found from the other end |
| **method** | the first audit's fifth-pass premise was wrong, and its baseline was four merges stale |
| **clean** | every async continuation commits · both major contexts complete · the frame-scheduler's guards documented |

---

## 0 · Re-dating, before anything was run

**A stale audit is re-dated before it is re-run**, because *does this still hold* is the one
question a document cannot answer about itself. The first audit ran at `645c043`; `main` was
four merges past it.

| | at `645c043` | at HEAD |
|---|---|---|
| **F-A** `copyMode` unreachable | ★ | **stands** — `session.ts:423` is still `copyMode: () => false` |
| **F-B** `imageProtocol` unread | ★ | **stands** — the only `src/` reference is a fixture default in `testing/expect-document.ts:124` |
| **F-C** ghost text never drawn | ★ | **CLOSED** — `paint.ts:269` reads it, landed in `95fedee` (PR #27), *the very next merge* |

Two of three still hold. The third was closed before the audit naming it was written down,
which cost nothing to discover and would have cost a step to act on.

---

## 1 · The fifth pass's premise was wrong — found before any pass ran

F-C argued that `ghost()` is *"a method on the completion engine's returned object"*, seen by
neither MG24 (interface members) nor MG25 (exported functions), and called that *"a real hole
between two rules that each thought the other covered it."*

```
src/interaction/completion/engine.ts:29   export interface CompletionEngine {
src/interaction/completion/engine.ts:45     ghost(ctx: CompletionContext): string | null;
```

**`ghost` is squarely an MG24 member.** Not allow-listed, MG24 sees it, and MG24 correctly
does not fire — a consumer existed at `shell/keys.ts:393`, the accept path.

**So there was no hole between two rules, and the defect was a different one**: the only
consumer was the accept path where the design required a second on the paint path. The
checkable property is not *has a consumer* but *how many, and where*.

**This is the third of the first audit's structural claims that measurement has falsified**,
after `CommandPolicy` and `capabilities` — and all three share a signature: *a plausible
argument about structure, asserted without opening the file it is about.* The rule the
project already has covers it exactly. **A correct conclusion from incomplete evidence is
still wrong**, and it applies to the sentence naming a rule's scope as much as to one naming
a field.

The pass was redesigned around the real signature **and** the literal claim was measured
anyway, so the correction rests on a number. It does — see F84, where the literal set is
empty and a much larger scope hole sits behind it.

---

## 2 · Pass A — the async continuation · **clean**

17 sites across 11 files (`.then`, `setTimeout`, `setInterval`, `queueMicrotask`,
`.subscribe`), excluding `src/testing/`. The question was the sharp half: *does the
continuation mutate anything the frame reads, and what composes the frame afterwards?*

| site | verdict |
|---|---|
| `shell/keys.ts:340` — completion request | **4 branches, each ending in `deps.redraw()`** |
| `shell/refresh.ts:299` — part refresh | **3 branches, each ending in `deps.commit("stream")`** |
| `shell/session.ts:473` — the exit confirm | stops only on `y`; the layer pop is synchronous inside `dispatch` |
| `shell/patch-view.ts:130` — transcript subscription | `dismiss()` calls `deps.redraw()`, and I42 records *why*: **"watched, not checked on the next keystroke"**, because C13 evicts on its own schedule |
| `completion/cache.ts:112`, `process/runner.ts:193`, `history/persist.ts` | no displayed state — cache bookkeeping, handle cleanup, disk |

**A clean result on the audit's own headline blind spot**, and the reason it is clean is
visible in the source: the eviction path in `patch-view.ts` is the one place where nothing
would have committed, and it is the one place carrying an invariant and a paragraph about it.

**The limit**: the patch arm at `patch-view.ts:147` re-clamps an offset without a redraw of
its own, relying on the committing caller. Correct today; it is the one site where the
guarantee is positional rather than local.

---

## 3 · Pass B — the partial context · **clean, and a finding underneath it**

Seven context types, each read at its construction sites.

`RenderContext` (8 fields, 3 sites) and `AdapterContext` (7 fields, 4 sites) are **complete at
every site** — no field goes unsupplied.

**The finding is not absence, it is ceremony** — F85. Two of `RenderContext`'s eight are
supplied by a caller that cannot meaningfully supply them, one of them a stub that throws, and
the registry overwrites both. The type demands eight; the consumer honours six. That is
F58b's shape with a second, independent consumer, which is this project's threshold for a
shape being real rather than incidental.

**A method note, because it nearly went the other way.** The first run of this pass reported
`verb` missing from all four `AdapterContext` sites. It is supplied — as the shorthand
`verb,` — and the filter matched `field:` only. **A grep-shaped instrument with a blind spot,
inside a pass about blind spots**, caught by opening the file rather than by trusting the
filter.

---

## 4 · Pass C — the suppressing guard · **clean where it counts**

126 bare early returns is unreadable, so it was scoped by script: a return is a candidate when
the function containing it **later** calls something with an observable effect (`arm`,
`schedule`, `redraw`, `commit`, `emit`, `set*`). **89 unique sites, 59 of them in the
frame/commit path.**

The frame-scheduler's four — the audit's named instance — are documented decisions, not
suppressions:

- `writeFrame()`'s `if (!lifecycle.acquired) { state = "idle"; return; }` is **C03 I1**, with
  the placement argued in situ (checked here rather than at commit time because a timer armed
  while acquired may fire after release, T3.9).
- `runWrite()`'s `if (first === null) return` is the drain terminating with nothing deferred.

**Its limit, stated rather than implied**: the heuristic sees only effects *in the same
function*. A guard whose skipped work is two frames down the call stack is invisible to it,
and 126 → 89 → 59 is a narrowing by structure, not a proof. **The 30 sites outside the frame
path were not read**, and that is part of the result rather than a footnote.

---

## 5 · Pass D — the instrument · **1 of 11, and it paid**

The group's disposition is *every instrument gets a fixture it must reproduce: known bytes in,
stated frame out.* `screen.py` first, since F79 named it and left it unrepaired.

```
$ printf '\033[38;5;188m[3/3] RUN sleep 2 && echo two > /two\033[0m\n' | screen.py 60 3
[3/3] RUN sleep 2 && echo two > /two            ← correct

$ printf '\033]0;docker-tui' + the same line     | screen.py 60 4
0;docker-tui                                     ← the OSC leaks as text
[3/3] RUN sleep 2                                ← still correct
```

**Both of F79's halves are wrong and a different defect is real** — F86. The tool is unchanged
since before F79 was filed, so this is the same code the finding was written against.

**Honest scope: 10 of 11 instruments were not touched.** `capture.py`, `beats.py`,
`screencast.py`, `media.py`, `s3_esc.py`, `gap-check.mjs`, `measure-raw.mjs`, `measure-s3.mjs`,
`tools/mutate` and `tools/proof.sh` have no fixture, and this pass did not give them one. The
group is **not** closable on this result; what it has is a first instance and a measured price
— **two commands turned one unreproducible anecdote into one falsified mechanism and one
reproducible defect.**

---

## 6 · Pass E — published-interface reach · **two findings**

Run with MG24's own parse and comment-stripping, so a disagreement is a real disagreement
rather than a second parser's opinion.

| measurement | result |
|---|---|
| interface members | 280 |
| ...MG24 sees a consumer for | 265 |
| ...**no consumer outside the declaring component** | **28** → F83 |
| ...exactly one consumer anywhere (the ghost signature) | 37 — real signal, too noisy to be a rule alone |
| `export type` object members, invisible to MG24 | **798** → F84 |
| ...with no use anywhere in `src/` | **0** — the literal claim's set is empty |
| ...never named outside their component | 67, dominated by documented deferrals |
| ...surviving that filter | **3** — `GlyphSet.teeLeft`, `teeRight`, `hollow` |

**The two findings are opposite in shape and that is why both are worth having.** F83 is a
rule whose *definition of a consumer* is too weak inside its scope. F84 is a rule whose
*scope* misses three-quarters of the published members in the codebase while its definition
works fine. Neither is visible from the other.

**`TransportRouter.busy` is the one to read.** `router.ts:64` says a guard *"replaced `busy`
and `shellChild`"* and `construct.ts:1024` counts *"seventeen until `busy` and…"* — the tree
records the removal in two places and the member is still there, because the file that
implements it counts as the file that consumes it.

---

## Reconcile — three sets

### Found by both — independent confirmation

- **F-A `copyMode`** — re-confirmed at HEAD. `session.ts:423`, still `() => false`.
- **F-B `imageProtocol`** — re-confirmed. Only `src/` reference is a fixture default.
- **`ThemeStore.applyOverrides` / `ThemeTokens.palettes`** — the first audit has it via
  `UNCONSUMED_MEMBERS`; pass E reached it from the `export type` side. Same gap, two routes.
- **`ToolDef.oneShot`** — pass E surfaced it; C22 §4 already documents it at length as having
  no subject. **Correct disposal, independently confirmed** — the model the first audit named
  with `status: "proposed"`.

### Audit only — and one of them is closed

- **F-C ghost text** — **closed by PR #27**, one merge after the audit's baseline.
- **Pass 1's grammar-registration regression** (C09 §4a) — prose against behaviour, which no
  pass here touches either. Both audits agree it is the highest-yield uninstrumented check.
- The audit's clean results — every `TuiConfig` field, every `Action` kind, every `Tone` — were
  **not re-run**, by instruction. They stand as recorded.

### Mine only — the set that matters

| | and should the first audit's passes have caught it? |
|---|---|
| **F83** MG24's consumer definition | **No.** Its four passes look at what *enumerates*; a rule's own blind spot is not an enumeration. Out of scope, fairly. |
| **F84** the `export type` scope hole | **Yes — pass 4.** *"The enforcement allow-lists — are they stale?"* checked the **contents** of four lists and reported all four in good order. It never asked what the rules **owning** those lists can see. A list can be immaculate and the rule beneath it blind, and the pass was built to check the list. |
| **F85** `RenderContext`'s ceremonial fields | **Yes — pass 2.** *"Every optional parameter — does any non-test caller supply it?"* These are **required** fields that every caller supplies and the consumer discards. The pass indexed on *unsupplied*; the defect is *supplied and ignored*, which is F58b, which the audit's own repository already contained. |
| **F86** F79's unmeasured mechanism | **No.** Nothing in the four passes reads a finding. |
| **the fifth-pass premise** | **Yes, trivially** — one `grep` at the file it names. |

**Two of five belong to the audit's own method and both fail the same way**: the pass was
indexed on the shape the author expected the defect to have. Pass 4 asked *is the list stale*
when the question is *what can the rule see*. Pass 2 asked *is it supplied* when the sibling
defect is *is it honoured*. **An index by expected shape tests each expectation against
itself and agrees** — which is the triage's own sentence about suites indexed by inputs, one
level up, aimed at an audit.

That is worth more than F84 and F85 are, because it says where the sixth pass goes.

---

## What *this* pass cannot see

The first audit's equivalent section is the only reason step 2 existed. Omitting mine would be
the single lesson not learnt.

- **Five hand-read passes cannot report what they did not think to look at.** Every finding
  above was reachable because someone named the shape first. That is why the reconcile's third
  set matters more than the first two: agreement measures overlap, and only divergence
  measures reach.
- **Pass C's heuristic is bounded at one stack frame**, and 30 of its 89 sites were not read.
- **Pass D covered 1 instrument of 11.** The other ten are unmeasured, not clean.
- **Pass E's noise is uncharacterised.** 37 single-consumer members and 67 component-local
  ones were filtered by judgement, not by rule, and a rule built on either would need a
  measured false-positive rate this pass did not produce.
- **Nothing here reads prose against behaviour** — unchanged from the first audit, and now
  demonstrated twice over: F86 is a finding whose stated mechanism nobody ran, and F84's
  correction came from a filter carried between two shapes it did not fit. **Going to find
  where the claim was written down** has now falsified three findings and produced two, and it
  remains unautomatable and schedulable.
- **Two of my own intermediate results were false and were caught by opening a file**: `verb`
  read as missing (shorthand), and three `export type` members read as dead (a skip rule
  carried from interfaces). Both were confident, both were wrong, and neither was caught by a
  count. **A pass that produces candidates is not a pass that produces findings**, and the
  step between them is the only one that cannot be scripted.

---

## Step 3

Fixes are planned from the triage (`examples/docker/TRIAGE.md`, redone at F82), this pass, and
the reconcile. Nothing is fixed here. **F85 is the entry most likely to move a ranking**: it is
the second independent consumer of F58b's shape, and the triage's group 1 is ranked on exactly
that.
