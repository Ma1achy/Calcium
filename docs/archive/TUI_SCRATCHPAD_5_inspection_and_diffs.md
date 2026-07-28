# Scratchpad 5 — inspection, diffs, and the harness it becomes

| | |
|---|---|
| **Status** | Superseded. Folded into the specs; see the resolution note below. |
| **Prompted by** | No way to see what was actually spawned; `{ } json` re-runs and can hide the bug it was opened to find |
| **Aiming at** | Enough machinery now that "tell the agent to deploy this, show me the diff, approve" is an addition rather than a rewrite |

---

## 0. Resolution note — read before the argument

Folded into the specs. Per `docs/README.md`, **where a scratchpad and a spec
disagree, the spec wins.** §8's four questions were answered:

| | Answer |
|---|---|
| **Q1** patch's home | Its own component, **C25**, registering through C09 like C11 and C12 |
| **Q2** `origin`'s home | In `meta` |
| **Q3** payload retention | Last N, N configurable, default 50 |
| **Q4** `proposed` | Ship it now and unused — the version bump is the cost, not the field |

Four claims did not survive contact with the specs, and are marked inline where
they appear:

1. **§3 and §7 make inspection an `⌥ inspect` action.** It is a **local command**,
   `/debug` and `/debug <n>`. An action cannot reach a frozen entry (C23 I18), and
   inspecting an older entry is the entire point. Reading an entry's `meta` is not
   firing an action, so D5 is untouched.
2. **§3 says `{ } json` *means* the retained payload when debugging.** The action
   re-runs, unchanged — that is what the command says, and it is honest. Each
   surface carries a caveat line pointing at `/debug` instead.
3. **§4 calls two palettes on one line something "C10 permits".** C10 **forbids**
   it, in four places: §3's palette table scopes `syntax` to `code` blocks only,
   I16 states it as an invariant, T2.8 tests it, and A03 SS20 enforces it. C25
   *requires* widening I16 to a closed list of `code` and `patch`. That widening
   was a decision taken during the fold-in, not an existing permission.
4. **§4 lists S06 and S04 as immediate users of `patch`.** Only S10 changed. S06's
   artefact SHAs and S04's run detail stay as they are.

§4 also left one thing unspecified that the fold-in had to settle: **how a
collapsed region expands.** C11 T4.7 is the precedent — expanding patches the
document rather than mutating external state, and the frozen block records its
expansion. That is also why expansion reaches a frozen entry when an action
cannot. `Hunk` therefore needs no `expanded` flag: expansion rewrites
`collapsedBefore`.

**Syntax highlighting and `lowlight` are not part of this document's argument.**
They arrived separately, as the missing half of C10's syntax palette — C10 defines
the palette and nothing said where token spans come from. That strand carries the
only new runtime dependency and C25 depends on it, but it was never scratchpad
reasoning and should not be read as such.

---

## 1. What the vision implies

"Tell an agent to deploy something, review the diff, approve" is three capabilities the tool does not have and one it already does.

| | Have it? |
|---|---|
| Show a proposed change as a reviewable diff | **No** — `diff` compares two runs' fields, not two texts |
| Show what was actually invoked, and what came back | **No** — `meta` has verb and exit code, not argv or stderr |
| Distinguish who initiated a command | **No** — every entry looks user-typed |
| Propose a command for a human to read and approve | **Yes**, already — that is what `fill` is |

The fourth being solved is the useful surprise. A01 D8 made `fill` the default *because* a command should be read before it runs, and that is exactly the agent-approval flow with the human composing. An agent producing a document whose rows carry `fill` actions needs no new approval mechanism.

So the gap is narrower than the vision sounds: **inspection, textual diffs, and provenance.** Everything else is already the transcript model working.

---

## 2. Tool calls — what exists

The *live* view is specified and good. C23 appends a pending entry before the subprocess starts; `steps` blocks show operations progressing. That is the Claude-Code-style "here is what I am doing", and S08, S10 and S11 all use it.

The *retrospective* view is missing. After the fact you can see the verb, the adapter, the exit code and the duration. You cannot see:

- the argv actually spawned
- stderr
- which transport handled it (emulated, fixture, subprocess)
- the raw payload the adapter was given

That last one matters most, because the architecture is "adapter over an awkward far side" and the recurring question is *did the far side return something unexpected, or did the adapter mishandle it?* A rendered block cannot answer it.

### And `{ } json` currently hides the answer

S03, S04, S05 and S06 all offer `{ } json` as a **fill that re-runs** with `--json`. On a `--watch`, or any changing cluster, that returns different data than the block you clicked on — so a bad adapter renders wrong, you inspect, and the fresh payload looks fine.

That is a real defect in four surfaces, not a missing feature.

---

## 3. The invocation record

Cheap, and it is the foundation for everything else.

```typescript
meta: {
  verb, adapter, exitCode, durationMs, truncated, resultId,   // existing
  argv:      readonly string[];          // what was actually spawned
  stderr:    string;                     // usually empty
  transport: "emulated" | "fixture" | "subprocess" | "local";
  origin:    "user" | "action" | "agent" | "refresh";
}
```

`origin` is the one that is not about debugging. It is what makes a transcript legible once more than one thing is putting entries in it — and it costs a string now versus a schema migration later.

> **Superseded (§0.1).** Inspection is a local command, `/debug`, not an action —
> an action cannot reach a frozen entry (C23 I18), and inspecting an older entry
> is the point.

~~Rendered by a `⌥ inspect` action on any entry, as a `keyValue` plus stderr as `raw` when non-empty. **Never re-runs.** It describes the entry you are looking at.~~

### The raw payload, and its cost

Retaining the payload per entry is what actually answers the adapter question, and it roughly doubles memory per entry against C13's 100,000-block cap.

**So: a `--debug` session flag.** Off by default, and when on, entries retain their raw payload and inspection shows it. Honest about the tradeoff, costs nothing normally, and it is the flag you set when you are already debugging.

> **Superseded (§0.2).** `{ } json` keeps re-running in every case. Each surface
> carries a caveat line pointing at `/debug`.

~~`{ } json` then means: *this document's payload* when debugging, and a re-run with a stated caveat otherwise.~~

---

## 4. `patch` — a real textual diff

The existing `diff` block is rows of `{field, a, b, comparison}`. That is a **structured** diff and it is right for S07's metric comparison. It is wrong for a YAML manifest or a Python file.

A textual diff is a different block:

```typescript
type Patch = Readonly<{
  kind:     "patch";
  id:       string;
  path:     string;                      // the file, for the header
  language: string;                      // syntax palette, per hunk line
  hunks:    readonly Hunk[];
  layout?:  "unified" | "split";         // default: width-derived
}>;

type Hunk = Readonly<{
  header:  string;                       // @@ -18,7 +18,9 @@
  lines:   readonly Readonly<{
    kind:   "add" | "remove" | "context";
    text:   string;
    oldNo?: number;
    newNo?: number;
  }>[];
  collapsedBefore?: number;              // unchanged lines elided above
}>;
```

Four things fall out of the specs it has to satisfy:

**Measurement is exact** (C09 I1). Line count is `Σ hunk lines + headers + collapse markers`. Collapsed regions count as one row each, stated in the marker. No wrapping — a diff line that wraps makes the alignment meaningless, so long lines truncate like `logs` do.

**Tones and syntax compose.** An added line is `ok`-toned *and* prefixed `+`; a removed line is `error`-toned *and* prefixed `-`. Within the line, the `syntax` palette highlights the language. That is two palettes on one line, which nothing else currently does.

> **Corrected (§0.3).** The original read "which C10 permits". C10 forbids it —
> §3's scope cell, I16, T2.8 and A03 SS20. C25 *requires* widening I16 to a closed
> list of `code` and `patch`, and that widening was a decision, not an existing
> permission. **How** the two compose on one line is still open: `Style` has no
> background channel, and the options are recorded in C25's spec.

**Split below 100 columns is wrong.** Unlike S07, where stacking preserves the comparison, a split diff at 60 columns gives 28 usable columns per side and every line truncates. Unified is the narrow form, and split is the wide one — the opposite trade from S07 because the content is lines, not values.

**Word-level highlighting within a changed line** is where diff viewers earn their keep and also where they get slow. Defer it; the block shape does not foreclose it.

### Where it gets used immediately

| Surface | Today | With `patch` |
|---|---|---|
| S10 GitOps | Whole YAML as a `code` block | The change, as a diff against what is deployed |
| S06 models | Artefact SHAs listed | Config diff between two versions |
| S04 run detail | — | The commit that produced this run |

S10 is the strongest case. It currently renders a forty-line manifest for a two-line change and relies on the reader to spot it.

> **Superseded for two of the three (§0.4).** Only S10 changed. S06's artefact SHA
> list and S04's run detail stay as they are.

---

## 5. What an agent harness actually needs on top

Assuming §3 and §4 exist, the remaining machinery is small.

**A way to inject a document.** `transcript.append` exists (C13) and is not public. An agent producing a document — a plan, a diff, a set of proposed commands — needs to put it in the transcript. That is one export and an `origin: "agent"`.

**A `proposed` status.** C04 has `ok | error | partial`. A proposed change is none of those: it has not run, it might not, and its actions are the point rather than a convenience. This is the one genuine schema addition, and adding it later is a version bump — worth deciding early even if unused.

**Nothing else.** Approval is `fill`. Refusal is not submitting. The audit trail is the transcript. The agent's tool calls are documents with `origin: "agent"` and an invocation record, which §3 already gives.

That the harness is mostly *already there* is a consequence of the transcript model rather than luck — a shell where every action is a readable command is a shell an agent can drive without a second interface.

---

## 6. What would foreclose it

Three ways to do this now that make the harness harder later.

**Putting `argv` in a block instead of `meta`.** A block is content; the invocation is *about* the document. In `meta` it is uniformly available to any inspector, including one an agent writes.

**Making `patch` a variant of `diff`.** They share a name and nothing else — one is rows of field comparisons, the other is hunks of text with line numbers and two palettes. Merging them produces a block whose measurement depends on which mode it is in.

**Treating `origin` as a debugging field.** If it is only for debugging it will be optional, then unset, then unreliable — and the first agent feature needs it to be trustworthy.

---

## 7. Build now, defer later

| Now | Why |
|---|---|
| `meta.argv`, `stderr`, `transport`, `origin` | Four fields, no behaviour, unblocks everything |
| `/debug` local command (§0.1 — was: an `⌥ inspect` action) | Answers "what actually ran" without re-running |
| Fix `{ } json` in S03–S06 | A defect today, not a feature |
| `patch` block kind | S10 needs it now; C09 registers it like `table` and `plot` |
| `--debug` payload retention | The tradeoff is real; the flag makes it honest |

| Later | Why |
|---|---|
| `proposed` status | Decide the shape now, add when there is an agent |
| Public `transcript.append` | One export, no consumer yet |
| Word-level diff highlighting | Where diff viewers get slow |
| Split-diff at width | Unified is correct until someone is reviewing on a 200-column monitor |

---

## 8. Open

**All four answered — see §0.** Kept because the leanings and their reasons are
the argument, and every answer followed its leaning.

**Q1 — Is `patch` a C09 default kind or C11/C12-style, its own component?** It has hunks, collapse state, two layouts and a syntax palette. That is closer to C11's weight than to `notice`. Leaning **its own component**, registering through C09 like the other two, which also keeps C09's fourteen defaults from becoming fifteen with one of them enormous.

**Q2 — Does `origin` belong in `meta` or beside it?** `meta` is described as being about the *command*; origin is about the *initiator*. Leaning in `meta` anyway — a second envelope for one field is worse than a slightly broader `meta`.

**Q3 — Should `--debug` retain payloads for every entry or only the last N?** Every entry doubles the cap's memory. Last 50 would cover any real debugging session. Leaning **last N, N configurable**, because "debug mode makes long sessions unusable" is how debug modes stop being used.

**Q4 — Does `proposed` need deciding now?** Adding a `status` value later is a `tui.view/2` bump under C04 I2's rules. Leaning **decide the shape now, ship it unused** — the version bump is the expensive part, not the field.
